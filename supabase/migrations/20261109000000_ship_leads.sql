-- Ship leads: every ship an officer links to is a ship M.A.T.E can sell to.
-- Analysts track their follow-up with the Master here. Safe to run more than once.
alter table public.vessels add column if not exists lead_status text not null default 'new';
alter table public.vessels add column if not exists lead_note text;
alter table public.vessels add column if not exists lead_updated_at timestamptz;

do $$ begin
  alter table public.vessels add constraint vessels_lead_status_check
    check (lead_status in ('new', 'contacted', 'signed_up', 'not_interested'));
exception when duplicate_object then null; end $$;
