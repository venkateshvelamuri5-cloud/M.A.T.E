'use client';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import PublicShell from '../../../components/crew/PublicShell';
import { Button, Card } from '../../analyst/_lib/ui';

interface Request {
  status: 'pending' | 'active' | 'removed';
  officerName: string;
  officerEmail: string;
  rankLabel: string;
  isMaster: boolean;
  vesselName: string | null;
  masterEmail: string;
  previousOfficer: string | null;
  setupComplete: boolean;
  setupPath: string;
}

function Approve() {
  const token = useSearchParams().get('token') || '';
  const [req, setReq] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/crew/approve?token=${encodeURIComponent(token)}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setReq(j); })
      .catch(e => setError(e.message || 'This approval link is not valid.'));
  }, [token]);

  const approve = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/crew/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setReq(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <Card className="p-6 flex items-start gap-3 text-sm"><AlertCircle className="w-5 h-5 text-red-600 shrink-0" />{error}</Card>;
  }
  if (!req) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const ship = req.vesselName ? `MV ${req.vesselName}` : 'your ship';
  const setupLink = !req.setupComplete && (
    <div className="rounded-xl border border-border p-4 text-sm space-y-2">
      <p className="font-semibold">Next: set up the ship's email rules</p>
      <p className="text-muted-foreground">This is done once per ship and takes about 15 minutes.</p>
      <Link href={req.setupPath} className="inline-flex px-3.5 py-2 rounded-lg bg-[#575ECF] text-white text-sm font-semibold">Open ship setup</Link>
    </div>
  );

  if (req.status === 'active') {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-bold">Approved</h1>
            <p className="text-sm text-muted-foreground">{req.officerName} is linked as {req.rankLabel} on {ship}.</p>
          </div>
        </div>
        {setupLink}
      </Card>
    );
  }
  if (req.status === 'removed') {
    return <Card className="p-6 text-sm">The officer withdrew this request or linked to another ship. Nothing to do.</Card>;
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold">{req.isMaster ? 'Confirm your ship' : `Approve ${req.officerName}`}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {req.isMaster
            ? <>{req.officerName} ({req.officerEmail}) linked a M.A.T.E account to {req.masterEmail} as the Master of {ship}.</>
            : <>{req.officerName} ({req.officerEmail}) wants to use M.A.T.E as <b className="text-foreground">{req.rankLabel}</b> on {ship}, through {req.masterEmail}.</>}
        </p>
      </div>
      {req.previousOfficer && (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-800 p-3">
          {req.previousOfficer} is linked as {req.rankLabel} now. Approving hands the rank over and unlinks them, as at a crew change.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Questions and answers pass through your mailbox. Each officer uses their own account and run limit.</p>
      <Button variant="primary" onClick={approve} disabled={busy}>{busy ? 'Approving…' : req.isMaster ? 'Yes, this is me' : 'Approve'}</Button>
      {setupLink}
    </Card>
  );
}

export default function ApprovePage() {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Approve />
      </Suspense>
    </PublicShell>
  );
}
