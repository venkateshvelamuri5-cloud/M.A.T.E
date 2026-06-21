-- Drop existing triggers and functions if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop existing tables to ensure clean schema recreation and prevent column mismatch errors
DROP TABLE IF EXISTS public.interactions_log CASCADE;
DROP TABLE IF EXISTS public.user_files CASCADE;
DROP TABLE IF EXISTS public.usage_limits CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. Create Profiles Table (extends Supabase Auth Users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    rank VARCHAR(100), -- e.g., Captain, Chief Mate
    role VARCHAR(50) DEFAULT 'user' NOT NULL, -- 'user' or 'analyst'
    subscription_plan VARCHAR(50) DEFAULT 'free' NOT NULL, -- 'free', 'premium'
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Create Usage limits Table (tracks monthly interactions)
CREATE TABLE IF NOT EXISTS public.usage_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    interactions_count INTEGER DEFAULT 0 NOT NULL,
    max_interactions INTEGER DEFAULT 10 NOT NULL, -- Limit of 10 for community version
    reset_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 month') NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Create User isolated Files Table (tracks letterheads and knowledge docs)
CREATE TABLE IF NOT EXISTS public.user_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(512) NOT NULL, -- Isolated path: "spaces/{user_id}/{filename}"
    file_type VARCHAR(50) NOT NULL,      -- 'letterhead', 'knowledge_base'
    file_size_mb NUMERIC DEFAULT 0.0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Create Interactions Log Table (stores transaction histories)
CREATE TABLE IF NOT EXISTS public.interactions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'Completed', 'Failed', 'Warning'
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable Row Level Security (RLS) for data protection
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions_log ENABLE ROW LEVEL SECURITY;

-- Setup Row Level Security Policies
CREATE POLICY "Allow users to view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow users to view own limits" ON public.usage_limits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow users to manage own files" ON public.user_files FOR ALL 
USING (
    auth.uid() = user_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'analyst'
    )
);
CREATE POLICY "Allow users to view own logs" ON public.interactions_log FOR SELECT 
USING (
    auth.uid() = user_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'analyst'
    )
);

-- 5. Automate profile creation on signup using PostgreSQL triggers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, role, subscription_plan)
  VALUES (new.id, new.email, 'user', 'free');

  -- Insert usage limits
  INSERT INTO public.usage_limits (user_id, interactions_count, max_interactions)
  VALUES (new.id, 0, 10);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution binding
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Automatically initialize Storage Buckets in Supabase Storage Registry
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-spaces', 'user-spaces', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('knowledge-base', 'knowledge-base', false)
ON CONFLICT (id) DO NOTHING;

-- 7. Add Storage RLS policies for user-spaces bucket
-- These policies restrict users so they can only manage objects in their own isolated folders (named after their user UUIDs)
CREATE POLICY "Allow authenticated users to upload to their own folder" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'user-spaces' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow authenticated users to read their own folder" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (bucket_id = 'user-spaces' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow authenticated users to delete their own folder files" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'user-spaces' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage Policies for knowledge-base bucket (Analysts only)
CREATE POLICY "Allow analysts to manage knowledge-base bucket" 
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'knowledge-base' 
    AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'analyst'
    )
);


-- 8. Create Agents Table
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL, -- Crucial for Gemini classification
    system_prompt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 9. Add agent_id column to user_files referencing agents
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;

-- 10. Enable RLS for agents table and add policies
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Allow service role or analysts full control over agents" ON public.agents FOR ALL USING (true);

-- 11. Insert default fallback agent
INSERT INTO public.agents (name, description, system_prompt)
VALUES (
    'General Maritime Agent',
    'Default handler for general maritime queries, sea service guidelines, profile issues, or queries that do not match specialized categories.',
    'You are an agentic maritime representative. Answer the query using the reference maritime data and user documents provided.'
) ON CONFLICT DO NOTHING;

-- 12. Seed Default Analyst User
-- Requires pgcrypto to dynamically hash default password Logmark#2026
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'hello@logmark-ai.com',
  crypt('Logmark#2026', gen_salt('bf', 10)),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"analyst"}',
  NOW(),
  NOW(),
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Ensure trigger-created profile has analyst role and premium plan
UPDATE public.profiles 
SET role = 'analyst', subscription_plan = 'premium'
WHERE id = '11111111-1111-1111-1111-111111111111';



