import { supabase } from '../../../src/supabase-client';
import { Agent } from './slots';

export type AuditEntity = 'agent' | 'file' | 'user' | 'setting';

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: AuditEntity;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Records a change in the change log. Never throws: a missing audit_log table (migration not
 * run yet) or a network error must not block the change itself.
 */
export async function logChange(entry: {
  action: string;
  entityType: AuditEntity;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { error } = await supabase.from('audit_log').insert({
      actor_id: session.user.id,
      actor_email: session.user.email,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
      details: entry.details ?? null
    });
    if (error) console.warn('Change log write failed:', error.message);
  } catch (err) {
    console.warn('Change log write failed:', (err as Error).message);
  }
}

// Agent fields captured in each saved version, and restored from it.
export const AGENT_VERSION_FIELDS = [
  'name', 'description', 'system_prompt', 'instructions', 'custom_questions', 'keywords',
  'status', 'llm_provider', 'bypass_keyword_match'
] as const;

export type AgentSnapshot = Pick<Agent, typeof AGENT_VERSION_FIELDS[number]> & { linked_file_ids?: string[] };

export interface AgentVersion {
  id: string;
  agent_id: string | null;
  slot_code: string;
  version: number;
  snapshot: AgentSnapshot;
  note: string | null;
  created_by_email: string | null;
  created_at: string;
}

/** Saves a snapshot of an agent as the next version for its slot. Never throws. */
export async function saveAgentVersion(slotCode: string, agentId: string | null, snapshot: AgentSnapshot, note: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    // Two analysts saving at once can collide on the version number; retry once with a fresh max.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: latest } = await supabase
        .from('agent_versions')
        .select('version')
        .eq('slot_code', slotCode)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from('agent_versions').insert({
        agent_id: agentId,
        slot_code: slotCode,
        version: (latest?.version || 0) + 1,
        snapshot,
        note,
        created_by: session?.user?.id ?? null,
        created_by_email: session?.user?.email ?? null
      });
      if (!error) return;
      if (error.code !== '23505') {
        console.warn('Saving agent version failed:', error.message);
        return;
      }
    }
  } catch (err) {
    console.warn('Saving agent version failed:', (err as Error).message);
  }
}
