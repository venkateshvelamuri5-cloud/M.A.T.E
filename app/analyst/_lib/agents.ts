import { supabase } from '../../../src/supabase-client';
import { Agent, AgentStatus, CategoryLetter, DEFAULT_CATEGORY_NAMES } from './slots';
import { logChange, saveAgentVersion, AgentSnapshot } from './audit';

export const STATUS_LABEL: Record<AgentStatus, string> = { live: 'live', paused: 'paused', draft: 'a draft' };

/** Category names set in Settings, falling back to the defaults. */
export async function loadCategoryNames(): Promise<Record<CategoryLetter, string>> {
  const { data } = await supabase.from('system_settings').select('value').eq('key', 'category_names').maybeSingle();
  if (!data?.value) return { ...DEFAULT_CATEGORY_NAMES };
  try {
    return { ...DEFAULT_CATEGORY_NAMES, ...JSON.parse(data.value) };
  } catch {
    return { ...DEFAULT_CATEGORY_NAMES };
  }
}

/**
 * Changes an agent's status. is_locked is kept in step so officer pages that only know about
 * is_locked still show a paused agent as locked.
 */
export async function setAgentStatus(agent: Agent, status: AgentStatus): Promise<void> {
  const { error } = await supabase
    .from('agents')
    .update({ status, is_locked: status === 'paused', updated_at: new Date().toISOString() })
    .eq('id', agent.id);
  if (error) throw error;
  await logChange({
    action: `agent.${status === 'live' ? 'resume' : status === 'paused' ? 'pause' : 'draft'}`,
    entityType: 'agent',
    entityId: agent.slot_code || agent.id,
    summary: `${status === 'live' ? 'Made' : 'Set'} ${agent.slot_code} ${agent.name} ${STATUS_LABEL[status]}`
  });
}

export function snapshotOf(agent: Agent, linkedFileIds: string[]): AgentSnapshot {
  return {
    name: agent.name,
    description: agent.description,
    system_prompt: agent.system_prompt,
    instructions: agent.instructions ?? '',
    custom_questions: agent.custom_questions ?? [],
    keywords: agent.keywords ?? '',
    status: agent.status ?? 'live',
    llm_provider: agent.llm_provider ?? 'groq',
    bypass_keyword_match: agent.bypass_keyword_match ?? false,
    linked_file_ids: linkedFileIds
  };
}

/**
 * Deletes an agent. A final version is saved first so the slot's history can bring it back.
 * Linked documents are unlinked (not deleted) and become available to every agent.
 */
export async function deleteAgent(agent: Agent, linkedFileIds: string[]): Promise<void> {
  if (agent.slot_code) await saveAgentVersion(agent.slot_code, agent.id, snapshotOf(agent, linkedFileIds), 'Before delete');
  await supabase.from('user_files').update({ agent_id: null }).eq('agent_id', agent.id);
  const { error } = await supabase.from('agents').delete().eq('id', agent.id);
  if (error) throw error;
  await logChange({
    action: 'agent.delete',
    entityType: 'agent',
    entityId: agent.slot_code || agent.id,
    summary: `Deleted ${agent.slot_code} ${agent.name}`,
    details: { linked_file_ids: linkedFileIds }
  });
}
