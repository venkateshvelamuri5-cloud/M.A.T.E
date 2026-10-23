-- Officer-side security and limits (PR #4).
--
-- PART A is safe to run before the new code is deployed: it adds functions, triggers and a view,
-- and the live officer pages keep working. PART B hides agent prompts from officers and must run
-- only after the new officer pages are live, because the old pages read the agents table directly.
-- Both parts are safe to run twice. Server routes use the service role and are unaffected.

-- =====================================================================
-- PART A
-- =====================================================================

-- 1. Runs are counted in one step, so two runs at once can't both slip under the limit.
--    A missing limits row is created (10 runs, as the dashboard does), so email-only officers are counted too.
CREATE OR REPLACE FUNCTION public.consume_run(p_user UUID, p_enforce BOOLEAN DEFAULT TRUE)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, max_runs INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
    INSERT INTO public.usage_limits (user_id, interactions_count, max_interactions)
    VALUES (p_user, 0, 10)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.usage_limits
       SET interactions_count = interactions_count + 1
     WHERE user_id = p_user
       AND (NOT p_enforce OR interactions_count < max_interactions)
    RETURNING interactions_count, max_interactions INTO r;

    IF FOUND THEN
        RETURN QUERY SELECT TRUE, r.interactions_count, r.max_interactions;
    ELSE
        RETURN QUERY SELECT FALSE, ul.interactions_count, ul.max_interactions FROM public.usage_limits ul WHERE ul.user_id = p_user;
    END IF;
END;
$$;

-- Gives a run back when the AI call fails after the run was counted.
CREATE OR REPLACE FUNCTION public.refund_run(p_user UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.usage_limits SET interactions_count = GREATEST(interactions_count - 1, 0) WHERE user_id = p_user;
$$;

REVOKE ALL ON FUNCTION public.consume_run(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_run(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_run(UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_run(UUID) TO service_role;

-- 2. Officers can't change their own role or plan. Whatever write policies exist on profiles,
--    a signed-in non-analyst keeps the role and plan they had. Analysts (People page) and the
--    server (Stripe webhook, service role, no signed-in user) can still change them.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_analyst() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.role := 'user';
        NEW.subscription_plan := 'free';
    ELSE
        NEW.role := OLD.role;
        NEW.subscription_plan := OLD.subscription_plan;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
CREATE TRIGGER guard_profile_privileges
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- 3. Officers can't raise their own run limit, reset their count, or delete the row to start over.
CREATE OR REPLACE FUNCTION public.guard_usage_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_analyst() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN NULL;
    ELSIF TG_OP = 'INSERT' THEN
        NEW.interactions_count := 0;
        NEW.max_interactions := 10;
    ELSE
        NEW.interactions_count := OLD.interactions_count;
        NEW.max_interactions := OLD.max_interactions;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_usage_limits ON public.usage_limits;
CREATE TRIGGER guard_usage_limits
    BEFORE INSERT OR UPDATE OR DELETE ON public.usage_limits
    FOR EACH ROW EXECUTE FUNCTION public.guard_usage_limits();

-- 4. Only analysts can share a document with everyone or attach it to an agent.
CREATE OR REPLACE FUNCTION public.guard_shared_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_analyst() THEN
        RETURN NEW;
    END IF;
    IF NEW.file_type = 'knowledge_base' AND (TG_OP = 'INSERT' OR OLD.file_type IS DISTINCT FROM 'knowledge_base') THEN
        RAISE EXCEPTION 'Only analysts can share documents with every officer.' USING ERRCODE = '42501';
    END IF;
    IF NEW.agent_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.agent_id IS DISTINCT FROM NEW.agent_id) THEN
        RAISE EXCEPTION 'Only analysts can attach documents to an agent.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_shared_documents ON public.user_files;
CREATE TRIGGER guard_shared_documents
    BEFORE INSERT OR UPDATE ON public.user_files
    FOR EACH ROW EXECUTE FUNCTION public.guard_shared_documents();

-- 5. What officers may see of an agent: everything except its instructions for the AI. Drafts are left out.
--    The view runs with its owner's rights, so it keeps working after PART B closes the table itself.
CREATE OR REPLACE VIEW public.officer_modules AS
    SELECT id, name, description, slot_code, instructions, custom_questions, keywords, is_locked, status
      FROM public.agents
     WHERE COALESCE(status, 'live') <> 'draft';

GRANT SELECT ON public.officer_modules TO anon, authenticated;

-- =====================================================================
-- PART B: run only after the new officer pages are deployed
-- =====================================================================
-- Agent prompts become readable by analysts only. Officers read public/officer_modules instead.

-- DROP POLICY IF EXISTS "Anyone can read agents" ON public.agents;
-- DROP POLICY IF EXISTS "Analysts can read agents" ON public.agents;
-- CREATE POLICY "Analysts can read agents" ON public.agents FOR SELECT USING (public.is_analyst());
