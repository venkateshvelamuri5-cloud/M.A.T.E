'use client';
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Chip } from '../../analyst/_lib/ui';
import { OfficerFile } from './officer';

export { Button, Card, Chip, Field, EmptyState, SlotCode, inputClass, formatDateTime, timeAgo } from '../../analyst/_lib/ui';

/** A centred dialog on desktop and a bottom sheet on phones. Escape and the backdrop close it. */
export function Dialog({ open, onClose, title, subtitle, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-zinc-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 sm:px-6 py-5 flex-1">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-3 border-t border-border flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Meter({ used, max, className = '' }: { used: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[#575ECF]';
  return (
    <span className={`block h-1.5 rounded-full bg-muted overflow-hidden ${className}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Toggle({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 cursor-pointer select-none text-sm">
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="w-9 h-5 rounded-full bg-zinc-300 peer-checked:bg-[#575ECF] transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#575ECF]/40" />
        <span className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/** Whether a document has been read and split into sections yet. */
export function fileStatusChip(f: OfficerFile) {
  if (f.ingest_status === 'ready') return <Chip tone="green">Ready</Chip>;
  if (f.ingest_status === 'failed') return <Chip tone="red" title={f.ingest_error || undefined}>Couldn't read</Chip>;
  if (f.ingest_status === 'processing' || f.ingest_status === 'queued') return <Chip tone="amber">Processing</Chip>;
  return null;
}

export function formatMb(mb: number) {
  return mb < 1 ? `${Math.max(1, Math.round(mb * 1024))} KB` : `${mb.toFixed(1)} MB`;
}
