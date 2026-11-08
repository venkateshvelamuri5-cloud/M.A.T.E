import crypto from 'crypto';
import { supabase } from '../supabase-client';
import { parseCrewSubject, Rank, RANKS, rankByCode, ROUTED_RANKS } from './ranks';

// Server-side helpers for ships, their rank mailboxes and the officers linked to them.
// Only the server (service role) touches these tables.

export interface Vessel {
  id: string;
  master_email: string;
  name: string | null;
  imo: string | null;
  setup_token: string;
  setup_completed_at: string | null;
}

export interface VesselRank {
  vessel_id: string;
  rank_code: string;
  onboard_email: string | null;
  test_passed_at: string | null;
  welcome_sent_at: string | null;
}

export interface VesselMember {
  id: string;
  vessel_id: string;
  user_id: string;
  rank_code: string;
  status: 'pending' | 'active' | 'removed';
  approval_token: string | null;
  created_at: string;
  approved_at: string | null;
}

export const normalizeEmail = (s?: string | null) => {
  const raw = (s || '').trim();
  const inner = raw.includes('<') ? raw.match(/<([^>]+)>/)?.[1] || raw : raw;
  return inner.trim().toLowerCase();
};

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const newToken = () => crypto.randomBytes(24).toString('hex');

/** The address the Master's rules forward to, and that M.A.T.E answers from. */
export const mateInbox = () => (process.env.MATE_INBOX_ADDRESS || 'mate@logmark-ai.com').toLowerCase();

/** True for mail M.A.T.E sent itself, so a missing rule exception can't make it answer its own replies. */
export function isOwnAddress(email: string) {
  const own = [mateInbox(), (process.env.SMTP_USER || '').toLowerCase()].filter(Boolean);
  return own.includes(normalizeEmail(email));
}

export async function vesselByMasterEmail(email: string): Promise<Vessel | null> {
  const { data } = await supabase.from('vessels').select('*').eq('master_email', normalizeEmail(email)).maybeSingle();
  return (data as Vessel) || null;
}

export async function vesselById(id: string): Promise<Vessel | null> {
  const { data } = await supabase.from('vessels').select('*').eq('id', id).maybeSingle();
  return (data as Vessel) || null;
}

export async function vesselBySetupToken(token: string): Promise<Vessel | null> {
  if (!token || token.length < 32) return null;
  const { data } = await supabase.from('vessels').select('*').eq('setup_token', token).maybeSingle();
  return (data as Vessel) || null;
}

/** Finds the ship for this Master's address, creating it (with a row per rank) the first time. */
export async function getOrCreateVessel(masterEmail: string, name?: string | null, imo?: string | null): Promise<Vessel> {
  const email = normalizeEmail(masterEmail);
  const existing = await vesselByMasterEmail(email);
  if (existing) {
    const patch: Record<string, string> = {};
    if (!existing.name && name) patch.name = name;
    if (!existing.imo && imo) patch.imo = imo;
    if (Object.keys(patch).length) await supabase.from('vessels').update(patch).eq('id', existing.id);
    return { ...existing, ...patch };
  }
  const { data, error } = await supabase.from('vessels')
    .insert({ master_email: email, name: name || null, imo: imo || null, setup_token: newToken() })
    .select('*').single();
  if (error) {
    // Two officers linking at the same moment: the other insert won.
    const again = await vesselByMasterEmail(email);
    if (again) return again;
    throw error;
  }
  await supabase.from('vessel_ranks').upsert(
    RANKS.map(r => ({ vessel_id: data.id, rank_code: r.code })),
    { onConflict: 'vessel_id,rank_code', ignoreDuplicates: true }
  );
  return data as Vessel;
}

export async function vesselRanks(vesselId: string): Promise<VesselRank[]> {
  const { data } = await supabase.from('vessel_ranks').select('*').eq('vessel_id', vesselId);
  return (data as VesselRank[]) || [];
}

export async function activeMember(vesselId: string, rankCode: string): Promise<VesselMember | null> {
  const { data } = await supabase.from('vessel_members').select('*')
    .eq('vessel_id', vesselId).eq('rank_code', rankCode).eq('status', 'active').maybeSingle();
  return (data as VesselMember) || null;
}

export async function openMembership(userId: string): Promise<VesselMember | null> {
  const { data } = await supabase.from('vessel_members').select('*')
    .eq('user_id', userId).in('status', ['pending', 'active']).maybeSingle();
  return (data as VesselMember) || null;
}

export async function endMembership(id: string) {
  await supabase.from('vessel_members')
    .update({ status: 'removed', removed_at: new Date().toISOString(), approval_token: null }).eq('id', id);
}

/** A rank's rule is working once a "MATE-XX TEST" email has made the round trip to M.A.T.E. */
export async function markTestPassed(vesselId: string, rankCode: string) {
  await supabase.from('vessel_ranks').upsert(
    { vessel_id: vesselId, rank_code: rankCode, test_passed_at: new Date().toISOString() },
    { onConflict: 'vessel_id,rank_code' }
  );
}

export interface CrewSender {
  vessel: Vessel;
  rank: Rank;
  isTest: boolean;
  /** The subject without the code and the FW:/Re: prefixes, for the AI and the run history. */
  cleanSubject: string;
  /** The officer who holds this rank on this ship now, or null. */
  member: VesselMember | null;
}

/**
 * Works out whether an incoming email is a crew request forwarded by a Master's Outlook rule.
 * It must carry a known rank code and come from a ship's Master address, or (when the rule
 * redirects rather than forwards) from one of that ship's onboard rank mailboxes.
 */
export async function resolveCrewSender(from: string, subject: string): Promise<CrewSender | null> {
  const parsed = parseCrewSubject(subject || '');
  if (!parsed) return null;
  const sender = normalizeEmail(from);

  let vessel = await vesselByMasterEmail(sender);
  if (!vessel) {
    const { data: rows } = await supabase.from('vessel_ranks').select('vessel_id').eq('onboard_email', sender).limit(1);
    if (rows && rows.length) vessel = await vesselById(rows[0].vessel_id);
  }
  if (!vessel) return null;

  const member = await activeMember(vessel.id, parsed.rank.code);
  return { vessel, rank: parsed.rank, isTest: parsed.isTest, cleanSubject: parsed.clean, member };
}

export interface RankStatus {
  code: string;
  label: string;
  onboardEmail: string | null;
  testPassed: boolean;
  officer: string | null;
}

/** What the ship setup page and the officer's profile show about a ship. */
export async function vesselStatus(vessel: Vessel): Promise<{ ranks: RankStatus[] }> {
  const [ranks, { data: members }] = await Promise.all([
    vesselRanks(vessel.id),
    supabase.from('vessel_members').select('user_id, rank_code').eq('vessel_id', vessel.id).eq('status', 'active')
  ]);
  const ids = (members || []).map(m => m.user_id);
  const { data: people } = ids.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', ids)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const nameOf = (rankCode: string) => {
    const m = (members || []).find(x => x.rank_code === rankCode);
    const p = m && (people || []).find(x => x.id === m.user_id);
    return p ? (p.full_name || 'Linked officer') : null;
  };
  return {
    ranks: ROUTED_RANKS.map(r => {
      const row = ranks.find(x => x.rank_code === r.code);
      return {
        code: r.code,
        label: r.label,
        onboardEmail: row?.onboard_email || null,
        testPassed: !!row?.test_passed_at,
        officer: nameOf(r.code)
      };
    })
  };
}

/** Whether the ship's Master already has a M.A.T.E account (by interaction email or as linked Master). */
export async function masterOnMate(vessel: Vessel): Promise<boolean> {
  const [{ data: byEmail }, ms] = await Promise.all([
    supabase.from('profiles').select('id').eq('vessel_email', vessel.master_email).limit(1),
    activeMember(vessel.id, 'MS')
  ]);
  return !!(byEmail && byEmail.length) || !!ms;
}

export const vesselLabel = (v: Pick<Vessel, 'name'>) => (v.name ? `MV ${v.name}` : 'your vessel');

export { rankByCode };
