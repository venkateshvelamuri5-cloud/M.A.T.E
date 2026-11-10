'use client';
import { useCallback, useEffect, useState } from 'react';

// Product updates shown to officers on the dashboard and under "What's new" in the header.
// Add new entries at the TOP. Each id must be unique and never change once published,
// because it's how we remember what an officer has already seen.

export type WhatsNewAction = 'ship-email' | 'profile';

export interface WhatsNewEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
  points?: string[];
  action?: { label: string; target: WhatsNewAction };
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-11-ship-email-status',
    date: '2026-11-08',
    title: 'Ship email: status on your home page',
    body: 'Once you link a ship, your home page shows where it stands: pending, approved or ready.',
    points: [
      "You'll get an email at your sign-in address when the Master approves you.",
      'Emails you send from your sign-in address are answered too.'
    ],
    action: { label: 'Open ship email', target: 'ship-email' }
  },
  {
    id: '2026-11-crew-email',
    date: '2026-11-08',
    title: 'Use M.A.T.E from your onboard mailbox',
    body: "No internet on your ship's intranet email? You can now send questions through the Master's mailbox and get answers back in your own onboard inbox.",
    points: [
      "Link your account to your ship with the Master's email address. The Master approves by replying to one email, no website needed.",
      'Put your rank code in the subject, for example "A1 // MATE-CE". Answers come back to your onboard mailbox, with a copy to your Gmail.',
      'Rank is now chosen from a list. If your profile shows "(choose from the list)", please pick your rank again.'
    ],
    action: { label: 'Set up ship email', target: 'ship-email' }
  }
];

const EVENT = 'mate-whats-new-seen';
const keyFor = (userId: string) => `mate-whats-new-seen-${userId}`;

/** Which updates this officer hasn't seen yet, remembered in this browser. */
export function useWhatsNew(userId: string) {
  const [seen, setSeen] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    const read = () => {
      try { setSeen(localStorage.getItem(keyFor(userId))); } catch { setSeen(null); }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, [userId]);

  const seenIndex = seen ? WHATS_NEW.findIndex(e => e.id === seen) : -1;
  // Until storage has been read, show nothing, so the card doesn't flash for people who dismissed it.
  const unread = seen === undefined ? [] : seenIndex === -1 ? WHATS_NEW : WHATS_NEW.slice(0, seenIndex);

  const markSeen = useCallback(() => {
    if (!WHATS_NEW.length) return;
    try { localStorage.setItem(keyFor(userId), WHATS_NEW[0].id); } catch { /* storage unavailable */ }
    setSeen(WHATS_NEW[0].id);
    window.dispatchEvent(new Event(EVENT));
  }, [userId]);

  return { unread, latest: unread[0] || null, markSeen };
}

export const formatUpdateDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
