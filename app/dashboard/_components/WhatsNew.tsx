'use client';
import React, { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { useOfficer } from '../_lib/officer';
import { Button, Card, Dialog } from '../_lib/ui';
import { formatUpdateDate, useWhatsNew, WHATS_NEW, WhatsNewAction, WhatsNewEntry } from '../_lib/whatsNew';

function useRunAction() {
  const { openProfile } = useOfficer();
  return (target: WhatsNewAction) => {
    openProfile();
    if (target === 'ship-email') {
      // The dialog renders on the next frame; then bring its Ship email section into view.
      setTimeout(() => document.getElementById('ship-email-access')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  };
}

function Entry({ entry, onAction }: { entry: WhatsNewEntry; onAction?: () => void }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{formatUpdateDate(entry.date)}</div>
      <h3 className="font-semibold text-foreground">{entry.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{entry.body}</p>
      {entry.points && (
        <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
          {entry.points.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      {entry.action && onAction && (
        <div className="pt-1"><Button size="sm" variant="primary" onClick={onAction}>{entry.action.label}</Button></div>
      )}
    </div>
  );
}

/** The newest unread update, at the top of the dashboard home. Dismissing it hides it until the next update. */
export function WhatsNewCard() {
  const { userId } = useOfficer();
  const { latest, unread, markSeen } = useWhatsNew(userId);
  const run = useRunAction();
  const [all, setAll] = useState(false);
  if (!latest) return null;

  return (
    <Card className="p-4 sm:p-5 border-[#575ECF]/30 bg-indigo-50/40">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-[#575ECF] flex items-center justify-center shrink-0"><Megaphone className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#575ECF] mb-1">What&apos;s new</div>
          <Entry entry={latest} onAction={latest.action ? () => { markSeen(); run(latest.action!.target); } : undefined} />
          {unread.length > 1 && (
            <button type="button" onClick={() => setAll(true)} className="mt-2 text-xs font-semibold text-[#575ECF] hover:underline">
              {unread.length - 1} more update{unread.length > 2 ? 's' : ''}
            </button>
          )}
        </div>
        <button type="button" onClick={markSeen} aria-label="Dismiss" className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
      <WhatsNewDialog open={all} onClose={() => setAll(false)} />
    </Card>
  );
}

function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useRunAction();
  return (
    <Dialog open={open} onClose={onClose} title="What's new" subtitle="Recent changes to M.A.T.E">
      <div className="divide-y divide-border">
        {WHATS_NEW.map(e => (
          <div key={e.id} className="py-4 first:pt-0 last:pb-0">
            <Entry entry={e} onAction={e.action ? () => { onClose(); run(e.action!.target); } : undefined} />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** "What's new" in the header, with a dot while something is unread. Opening it marks everything read. */
export function WhatsNewButton() {
  const { userId } = useOfficer();
  const { unread, markSeen } = useWhatsNew(userId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); markSeen(); }}
        className="relative inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
        aria-label={unread.length ? `What's new, ${unread.length} unread` : "What's new"}>
        <Megaphone className="w-4 h-4" /><span className="hidden sm:inline">What&apos;s new</span>
        {unread.length > 0 && <span className="absolute top-1.5 right-1.5 sm:top-1 sm:right-1 w-2 h-2 rounded-full bg-[#575ECF] ring-2 ring-card" />}
      </button>
      <WhatsNewDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
