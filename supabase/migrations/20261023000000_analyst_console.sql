-- Analyst console: agent write lockdown, agent status, agent version history, change log.

-- 1. Helper: is the signed-in user an analyst? SECURITY DEFINER so policies can call it
--    without tripping over RLS on profiles.
CREATE OR REPLACE FUNCTION public.is_analyst()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'analyst');
$$;

-- 2. Lock down agents and agent_templates. The old "full control" policies used USING (true),
--    which let anyone holding the public anon key edit or delete agents. Every existing policy
--    on these tables is dropped (names drifted between environments), then read stays public
--    and writes are limited to analysts. Server routes use the service role and are unaffected.
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('agents', 'agent_templates')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Analysts can insert agents" ON public.agents FOR INSERT WITH CHECK (public.is_analyst());
CREATE POLICY "Analysts can update agents" ON public.agents FOR UPDATE USING (public.is_analyst()) WITH CHECK (public.is_analyst());
CREATE POLICY "Analysts can delete agents" ON public.agents FOR DELETE USING (public.is_analyst());

CREATE POLICY "Anyone can read agent templates" ON public.agent_templates FOR SELECT USING (true);
CREATE POLICY "Analysts can insert agent templates" ON public.agent_templates FOR INSERT WITH CHECK (public.is_analyst());
CREATE POLICY "Analysts can update agent templates" ON public.agent_templates FOR UPDATE USING (public.is_analyst()) WITH CHECK (public.is_analyst());
CREATE POLICY "Analysts can delete agent templates" ON public.agent_templates FOR DELETE USING (public.is_analyst());

-- 3. Agent status: 'live' (visible and runnable), 'paused' (visible with a lock, not runnable,
--    skipped by email routing), 'draft' (hidden from officers). Existing locked agents become paused.
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'live';
UPDATE public.agents SET status = 'paused' WHERE is_locked = TRUE AND status = 'live';
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_status_check CHECK (status IN ('live', 'paused', 'draft'));
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 4. Agent version history: a snapshot of the agent's settings on every save. Keyed by slot so
--    history survives deleting the agent and can be used to restore it.
CREATE TABLE IF NOT EXISTS public.agent_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
    slot_code VARCHAR(10) NOT NULL,
    version INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    note TEXT,
    created_by UUID,
    created_by_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (slot_code, version)
);
CREATE INDEX IF NOT EXISTS agent_versions_slot_idx ON public.agent_versions (slot_code, version DESC);

ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Analysts can read agent versions" ON public.agent_versions;
DROP POLICY IF EXISTS "Analysts can add agent versions" ON public.agent_versions;
CREATE POLICY "Analysts can read agent versions" ON public.agent_versions FOR SELECT USING (public.is_analyst());
CREATE POLICY "Analysts can add agent versions" ON public.agent_versions FOR INSERT WITH CHECK (public.is_analyst());

-- 5. Change log: who changed what in the analyst console, and when. Append-only.
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    actor_email TEXT,
    action VARCHAR(40) NOT NULL,       -- e.g. 'agent.update', 'file.delete', 'limit.update'
    entity_type VARCHAR(20) NOT NULL,  -- 'agent', 'file', 'user', 'setting'
    entity_id TEXT,
    summary TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Analysts can read the change log" ON public.audit_log;
DROP POLICY IF EXISTS "Analysts can write their own change log entries" ON public.audit_log;
CREATE POLICY "Analysts can read the change log" ON public.audit_log FOR SELECT USING (public.is_analyst());
CREATE POLICY "Analysts can write their own change log entries" ON public.audit_log FOR INSERT
    WITH CHECK (public.is_analyst() AND actor_id = auth.uid());
