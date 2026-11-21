'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Ship, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../../src/supabase-client';
import { rankFromLabel, subjectCode } from '../../../src/crew/ranks';
import { useOfficer } from '../_lib/officer';
import { Button, Card, Field, inputClass } from '../_lib/ui';

export interface Link {
  status: 'pending' | 'active';
  rankCode: string;
  rankLabel: string;
  subjectCode: string;
  vesselName: string | null;
  masterEmail: string;
  setupComplete: boolean;
  /** This officer's TEST email came back, so both of their rules work. */
  ruleWorking: boolean;
  isMaster?: boolean;
  /** Some officer's TEST came back, so the Master's outbound rule (Rule A) works. */
  outboundTested?: boolean;
  /** For the Master: each rank on the ship and how far it has got. */
  crew?: { code: string; label: string; officer: string | null; testPassed: boolean }[];
}

export async function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/crew/link', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json as { link: Link | null; notice?: string };
}

/** Where the officer's ship link stands, in one line. Shared by the profile and the home card. */
export function StatusLine({ link }: { link: Link }) {
  const cls = 'flex items-start gap-2';
  if (link.status === 'pending') return <p className={`${cls} text-amber-700`}><Clock className="w-4 h-4 mt-0.5 shrink-0" />Pending. Waiting for the Master to verify you. They were emailed an Approve button that works without web access.</p>;
  if (link.isMaster) {
    return link.outboundTested
      ? <p className={`${cls} text-emerald-700`}><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />Ship confirmed. Your outbound rule (Rule A) is working: an officer's TEST email came through.</p>
      : <p className={`${cls} text-amber-700`}><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />Ship confirmed. The Outlook rules were emailed to you. Rule A shows as working here once the first officer's TEST email comes through.</p>;
  }
  if (link.ruleWorking) return <p className={`${cls} text-emerald-700`}><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />Ready. Your TEST email came back, so both Outlook rules for your rank are working.</p>;
  return <p className={`${cls} text-amber-700`}><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />Verified. The Master was emailed your Outlook rules (outbound and inbound). Once they're added, send one email from your onboard mailbox with the subject “{link.subjectCode} TEST”. When the reply arrives, the rules are working and this shows Ready.</p>;
}

/** For the Master: which ranks have an officer and whose rules have been tested. */
export function CrewRules({ crew }: { crew: NonNullable<Link['crew']> }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold">Inbound rules (Rule B), one per officer</div>
      <ul className="text-xs space-y-1">
        {crew.map(r => (
          <li key={r.code} className="flex items-center gap-2">
            {r.testPassed
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              : <Clock className={`w-3.5 h-3.5 shrink-0 ${r.officer ? 'text-amber-700' : 'text-muted-foreground'}`} />}
            <span className="min-w-0"><b>{r.label}</b> ({subjectCode(r.code)}): {r.testPassed ? 'working, TEST came back' : r.officer ? `${r.officer} verified, waiting for their TEST email` : 'no officer linked yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dashboard home: the officer's ship email status at a glance. Hidden when they haven't linked a ship. */
export function ShipEmailCard() {
  const { openProfile, profileOpen } = useOfficer();
  const [link, setLink] = useState<Link | null>(null);
  useEffect(() => {
    // Reload after the profile closes, since the officer may have linked or unlinked there.
    if (profileOpen) return;
    call('GET').then(r => setLink(r.link)).catch(() => setLink(null));
  }, [profileOpen]);
  if (!link) return null;

  const ship = link.vesselName ? `MV ${link.vesselName}` : link.masterEmail;
  const open = () => {
    openProfile();
    setTimeout(() => document.getElementById('ship-email-access')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };
  return (
    <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-indigo-100 text-[#575ECF] flex items-center justify-center shrink-0"><Ship className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0 text-sm space-y-1">
        <div className="font-semibold">Ship email: {link.rankLabel} on {ship} <span className="text-muted-foreground font-normal">({link.subjectCode})</span></div>
        <StatusLine link={link} />
      </div>
      <Button size="sm" onClick={open}>Details</Button>
    </Card>
  );
}

/**
 * Lets an officer use M.A.T.E from their onboard mailbox through the Master's (the ship's internet) address.
 * They link to the ship with the Master's address; the Master approves by email.
 */
export default function ShipAccess({ savedRank }: { savedRank?: string | null }) {
  const { profile, toast } = useOfficer();
  const [link, setLink] = useState<Link | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [masterEmail, setMasterEmail] = useState('');
  const [vesselName, setVesselName] = useState(profile.vessel_name || '');
  const [imo, setImo] = useState('');

  const rank = rankFromLabel(savedRank);

  const load = useCallback(async () => {
    try { setLink((await call('GET')).link); } catch { setLink(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const linkShip = async (email = masterEmail) => {
    setBusy(true);
    try {
      const res = await call('POST', { masterEmail: email, vesselName, imo });
      setLink(res.link);
      toast(res.notice || 'Linked. The Master has been emailed to approve you.', res.notice ? 'info' : 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try { await call('DELETE'); setLink(null); toast('Unlinked from the ship.'); }
    catch (err) { toast((err as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading ship email status…</p>;

  if (link) {
    const ship = link.vesselName ? `MV ${link.vesselName}` : link.masterEmail;
    const rankChanged = rank && rank.code !== link.rankCode;
    return (
      <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
        <div className="flex items-start gap-2.5">
          <Ship className="w-4 h-4 mt-0.5 text-[#575ECF] shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">{link.rankLabel} on {ship}</div>
            <div className="text-xs text-muted-foreground break-all">Master's address: {link.masterEmail}</div>
          </div>
        </div>
        <StatusLine link={link} />
        {link.isMaster && link.crew && <CrewRules crew={link.crew} />}
        {link.status === 'active' && !link.isMaster && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            From your onboard mailbox, email the Master's address with the module and your code in the subject,
            for example <b className="text-foreground">A1 // {link.subjectCode}</b>. Answers come back to your onboard mailbox, with a copy to your Gmail.
          </p>
        )}
        {rankChanged && (
          <p className="text-xs text-amber-700">Your profile now says {rank.label}. Link again to use {subjectCode(rank.code)} instead.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(link.status === 'pending' || rankChanged) && (
            <Button size="sm" onClick={() => linkShip(link.masterEmail)} disabled={busy}>{rankChanged ? 'Link again' : 'Email the Master again'}</Button>
          )}
          <Button size="sm" variant="danger" onClick={unlink} disabled={busy}>{link.status === 'pending' ? 'Cancel request' : 'Unlink (signing off)'}</Button>
        </div>
      </div>
    );
  }

  if (!rank) {
    return (
      <p className="text-xs text-muted-foreground leading-relaxed">
        Choose your rank from the list above and save your profile to use M.A.T.E from your onboard mailbox. Ship email isn't available for "Other".
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        No internet on your onboard mailbox? Link to your ship with the Master's address. The Master approves by email,
        then you email M.A.T.E through the Master's mailbox using the code <b className="text-foreground">{subjectCode(rank.code)}</b>.
      </p>
      {!profile.vessel_email && (
        <p className="text-xs text-amber-700 leading-relaxed">
          Add your onboard mailbox as your interaction email above first. M.A.T.E uses it to send the Master the Outlook rules for your rank.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Master's email" htmlFor="sa-master">
          <input id="sa-master" type="email" className={inputClass} value={masterEmail} onChange={e => setMasterEmail(e.target.value)} placeholder="master@vessel.com" />
        </Field>
        <Field label="Vessel name" htmlFor="sa-vessel">
          <input id="sa-vessel" className={inputClass} value={vesselName} onChange={e => setVesselName(e.target.value)} placeholder="Pioneer Mariner" />
        </Field>
        <Field label="IMO number (optional)" htmlFor="sa-imo">
          <input id="sa-imo" inputMode="numeric" className={inputClass} value={imo} onChange={e => setImo(e.target.value)} placeholder="9876543" />
        </Field>
      </div>
      <Button variant="primary" size="sm" onClick={() => linkShip()} disabled={busy || !/\S+@\S+\.\S+/.test(masterEmail)}>
        {busy ? 'Linking…' : `Link as ${rank.label}`}
      </Button>
    </div>
  );
}
