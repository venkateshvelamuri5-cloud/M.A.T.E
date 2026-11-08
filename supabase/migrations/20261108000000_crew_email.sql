-- Crew email access through the Master's mailbox.
--
-- Officers other than the Master can't reach the internet from their onboard mailboxes. They email
-- the Master's address with a rank code in the subject (for example "A1 // MATE-CE"), rules on the
-- Master's Outlook forward it to M.A.T.E, and the answer comes back the same way.
--
-- Safe to run before the new code is deployed: it only adds tables. Safe to run twice.
-- The tables are read and written only by the server (service role); officers go through /api/crew.

-- One row per ship, keyed by the Master's (the ship's internet) address.
CREATE TABLE IF NOT EXISTS public.vessels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_email TEXT NOT NULL UNIQUE CHECK (master_email = lower(master_email)),
    name TEXT,
    imo TEXT,
    setup_token TEXT NOT NULL UNIQUE,
    setup_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The onboard (intranet) mailbox for each rank, set by the Master on the ship setup page.
CREATE TABLE IF NOT EXISTS public.vessel_ranks (
    vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
    rank_code TEXT NOT NULL,
    onboard_email TEXT CHECK (onboard_email = lower(onboard_email)),
    test_passed_at TIMESTAMPTZ,
    welcome_sent_at TIMESTAMPTZ,
    PRIMARY KEY (vessel_id, rank_code)
);

CREATE INDEX IF NOT EXISTS vessel_ranks_onboard_email ON public.vessel_ranks (onboard_email);

-- Which officer holds which rank on which ship. Pending until the Master approves by email.
CREATE TABLE IF NOT EXISTS public.vessel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rank_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
    approval_token TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ
);

-- One active officer per rank per ship, and one open link per officer.
CREATE UNIQUE INDEX IF NOT EXISTS vessel_members_one_active_rank
    ON public.vessel_members (vessel_id, rank_code) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS vessel_members_one_open_link
    ON public.vessel_members (user_id) WHERE status IN ('pending', 'active');

-- Server only: row level security on, no policies, so the browser keys can't read or change these.
ALTER TABLE public.vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_members ENABLE ROW LEVEL SECURITY;
