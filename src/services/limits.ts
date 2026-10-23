import { supabase } from '../supabase-client';

export interface RunCount { allowed: boolean; used: number; max: number }

/**
 * Counts one run against an officer's limit in a single database step (consume_run).
 * With enforce=false the run is always counted, for work that already happened (email replies).
 * Falls back to the old read-then-write when the database function isn't installed yet.
 */
export async function consumeRun(userId: string, enforce = true): Promise<RunCount> {
  const { data, error } = await supabase.rpc('consume_run', { p_user: userId, p_enforce: enforce });
  const row = Array.isArray(data) ? data[0] : data;
  if (!error && row) return { allowed: !!row.allowed, used: row.used ?? 0, max: row.max_runs ?? 0 };

  const { data: limits } = await supabase.from('usage_limits').select('interactions_count, max_interactions').eq('user_id', userId).maybeSingle();
  const used = limits?.interactions_count ?? 0;
  const max = limits?.max_interactions ?? 10;
  if (enforce && used >= max) return { allowed: false, used, max };
  if (limits) await supabase.from('usage_limits').update({ interactions_count: used + 1 }).eq('user_id', userId);
  else await supabase.from('usage_limits').insert({ user_id: userId, interactions_count: 1, max_interactions: max });
  return { allowed: true, used: used + 1, max };
}

export async function refundRun(userId: string) {
  const { error } = await supabase.rpc('refund_run', { p_user: userId });
  if (!error) return;
  const { data: limits } = await supabase.from('usage_limits').select('interactions_count').eq('user_id', userId).maybeSingle();
  if (limits) await supabase.from('usage_limits').update({ interactions_count: Math.max(0, limits.interactions_count - 1) }).eq('user_id', userId);
}

export function limitMessage(used: number, max: number, plan?: string | null) {
  return plan === 'premium'
    ? `You've used all ${max} runs on your plan (${used} of ${max}). Contact the M.A.T.E team to raise it.`
    : `You've used all ${max} free runs (${used} of ${max}). Upgrade from your dashboard to keep going.`;
}

/** Shared documents are only trusted when an analyst (or the system account) uploaded them. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function analystIds(): Promise<Set<string>> {
  const { data } = await supabase.from('profiles').select('id').eq('role', 'analyst');
  return new Set([SYSTEM_USER_ID, ...(data || []).map(p => p.id)]);
}

/** Resolves the signed-in user from the request's Bearer token, or null. */
export async function userFromRequest(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}
