'use client';
import React from 'react';
import Link from 'next/link';

/** A plain page frame for links opened from email by people who may not have an account (the Master). */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card print:hidden">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <img src="/logo.jpeg" alt="" width={28} height={28} className="rounded" />
            M.A.T.E
          </Link>
          <span className="text-xs text-muted-foreground">Crew email access</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">{children}</main>
    </div>
  );
}
