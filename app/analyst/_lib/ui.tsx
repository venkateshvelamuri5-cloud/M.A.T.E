'use client';
import React from 'react';
import { AgentStatus, KnowledgeFile } from './slots';

// Small shared building blocks so every analyst page uses the same cards, buttons and chips.

export const ACCENT = '#575ECF';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground font-display tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-border rounded-xl ${className}`}>{children}</div>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[#575ECF] hover:bg-[#464cb3] text-white border-transparent',
  secondary: 'bg-card hover:bg-muted text-foreground border-border',
  danger: 'bg-card hover:bg-red-50 text-red-700 border-red-200',
  ghost: 'bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground border-transparent'
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#575ECF]/50 ${sizing} ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

type ChipTone = 'green' | 'amber' | 'red' | 'grey' | 'indigo';
const CHIP_STYLES: Record<ChipTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  grey: 'bg-zinc-100 text-zinc-600',
  indigo: 'bg-indigo-50 text-[#575ECF]'
};

export function Chip({ tone = 'grey', children, title }: { tone?: ChipTone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${CHIP_STYLES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_CHIP: Record<AgentStatus | 'empty', { tone: ChipTone; label: string }> = {
  live: { tone: 'green', label: 'Live' },
  paused: { tone: 'amber', label: 'Paused' },
  draft: { tone: 'grey', label: 'Draft' },
  empty: { tone: 'grey', label: 'Empty' }
};

export function StatusChip({ status }: { status: AgentStatus | 'empty' }) {
  const s = STATUS_CHIP[status];
  return <Chip tone={s.tone}>{status !== 'empty' && '● '}{s.label}</Chip>;
}

export function SlotCode({ code }: { code: string }) {
  return <span className="font-mono text-xs font-semibold text-[#575ECF]">{code}</span>;
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

export const inputClass = 'w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground outline-none focus:border-[#575ECF] focus:ring-2 focus:ring-[#575ECF]/15 transition';

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Processing status of a knowledge document (from PR #2's ingestion). */
export function ingestChip(f: KnowledgeFile) {
  if (f.ingest_status === 'ready') return <Chip tone="green">Ready</Chip>;
  if (f.ingest_status === 'failed') return <Chip tone="red" title={f.ingest_error || undefined}>Failed</Chip>;
  if (f.ingest_status === 'processing' || f.ingest_status === 'queued') return <Chip tone="amber">Processing</Chip>;
  return <Chip tone="grey">Not processed</Chip>;
}

