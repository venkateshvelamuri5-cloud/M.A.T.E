// The fixed rank list every officer picks from. Each rank's code goes in the email subject
// (for example "A1 // MATE-CE") so M.A.T.E knows which officer on a ship a forwarded email is for.

export interface Rank { code: string; label: string }

export const RANKS: Rank[] = [
  { code: 'MS', label: 'Master' },
  { code: 'CO', label: 'Chief Officer' },
  { code: '2O', label: '2nd Officer' },
  { code: '3O', label: '3rd Officer' },
  { code: 'CE', label: 'Chief Engineer' },
  { code: '2E', label: '2nd Engineer' },
  { code: '3E', label: '3rd Engineer' },
  { code: 'ETO', label: 'Electro-Technical Officer' }
];

/** Picked by cadets, ratings and anyone else: they can use M.A.T.E but get no ship email routing. */
export const OTHER_RANK = 'Other';

export const RANK_LABELS = [...RANKS.map(r => r.label), OTHER_RANK];

/** Ranks that need a return rule on the Master's Outlook. The Master reads their own mailbox. */
export const ROUTED_RANKS = RANKS.filter(r => r.code !== 'MS');

export const subjectCode = (code: string) => `MATE-${code}`;

export function rankByCode(code?: string | null): Rank | null {
  if (!code) return null;
  return RANKS.find(r => r.code === code.toUpperCase()) || null;
}

// Free-text ranks typed before the dropdown existed, mapped to the list where the meaning is clear.
const ALIASES: Record<string, string> = {
  master: 'MS', captain: 'MS', capt: 'MS', 'ship master': 'MS',
  'chief officer': 'CO', 'chief mate': 'CO', 'c/o': 'CO', co: 'CO', '1st officer': 'CO', 'first officer': 'CO',
  '2nd officer': '2O', 'second officer': '2O', '2/o': '2O', '2nd mate': '2O', 'second mate': '2O',
  '3rd officer': '3O', 'third officer': '3O', '3/o': '3O', '3rd mate': '3O', 'third mate': '3O',
  'chief engineer': 'CE', 'c/e': 'CE', ce: 'CE',
  '2nd engineer': '2E', 'second engineer': '2E', '2/e': '2E',
  '3rd engineer': '3E', 'third engineer': '3E', '3/e': '3E',
  'electro-technical officer': 'ETO', 'electro technical officer': 'ETO', 'electrical officer': 'ETO', eto: 'ETO'
};

/** The rank on the list that a profile's rank text means, or null (Other, or old free text we can't place). */
export function rankFromLabel(label?: string | null): Rank | null {
  const key = (label || '').trim().toLowerCase().replace(/\.$/, '');
  if (!key) return null;
  const exact = RANKS.find(r => r.label.toLowerCase() === key);
  if (exact) return exact;
  return rankByCode(ALIASES[key]);
}

/** True when the rank text is exactly one of the dropdown's options. */
export const isListedRank = (label?: string | null) => RANK_LABELS.includes((label || '').trim());

/**
 * Reads the rank code from a subject such as "FW: A1 // MATE-CE" and whether it's a setup test.
 * Returns null when there's no known code.
 */
export function parseCrewSubject(subject: string): { rank: Rank; isTest: boolean; clean: string } | null {
  const m = subject.match(/\bMATE-([A-Z0-9]{2,3})\b/i);
  const rank = m ? rankByCode(m[1]) : null;
  if (!m || !rank) return null;
  const clean = stripForwardPrefixes(subject.replace(m[0], ''))
    .replace(/\s*\/\/\s*$/, '').replace(/^\s*\/\/\s*/, '').replace(/\s{2,}/g, ' ').trim();
  const isTest = /^\s*test\s*$/i.test(clean.replace(/\/\//g, ''));
  return { rank, isTest, clean };
}

/** Removes the "FW:", "Fwd:" and "Re:" prefixes Outlook adds, however many there are. */
export function stripForwardPrefixes(subject: string) {
  return subject.replace(/^(\s*(fw|fwd|re|aw|tr|wg)\s*:\s*)+/i, '').trim();
}
