'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../src/supabase-client';
import { Profile, profileCompleteness, useOfficer } from '../_lib/officer';
import { Button, Dialog, Field, Meter, SlotCode, inputClass } from '../_lib/ui';

const EMAIL_CHANGE_DAYS = 15;

type Form = {
  full_name: string; rank: string; company_name: string; vessel_email: string;
  vessel_name: string; vessel_type: string; operator_name: string; grt: string;
  has_pump_room: boolean; pump_system_type: string; has_bow_thruster: boolean; carries_chemical_cargo: boolean;
  has_egcs: boolean; egcs_type: string;
  operates_us_waters: boolean; operates_aus_nz_waters: boolean; operates_eu_waters: boolean; operates_chinese_waters: boolean;
};

const fromProfile = (p: Profile): Form => ({
  full_name: p.full_name || '', rank: p.rank || '', company_name: p.company_name || '', vessel_email: p.vessel_email || '',
  vessel_name: p.vessel_name || '', vessel_type: p.vessel_type || '', operator_name: p.operator_name || '', grt: p.grt || '',
  has_pump_room: p.has_pump_room !== false,
  pump_system_type: p.pump_system_type && p.pump_system_type !== 'N/A' ? p.pump_system_type : 'FRAMO',
  has_bow_thruster: !!p.has_bow_thruster, carries_chemical_cargo: !!p.carries_chemical_cargo,
  has_egcs: !!p.has_egcs, egcs_type: p.egcs_type && p.egcs_type !== 'N/A' ? p.egcs_type : 'Open Loop',
  operates_us_waters: !!p.operates_us_waters, operates_aus_nz_waters: !!p.operates_aus_nz_waters,
  operates_eu_waters: !!p.operates_eu_waters, operates_chinese_waters: !!p.operates_chinese_waters
});

const VESSEL_TYPES = ['Oil Tanker', 'Chemical Tanker', 'Product Tanker', 'LPG Carrier', 'LNG Carrier', 'Bulk Carrier', 'Container Ship', 'General Cargo', 'Ro-Ro', 'Offshore'];
const REGIONS: [keyof Form, string][] = [
  ['operates_us_waters', 'US waters'], ['operates_eu_waters', 'EU waters'],
  ['operates_aus_nz_waters', 'Australia / NZ'], ['operates_chinese_waters', 'Chinese waters']
];

/** One place to edit the officer and vessel details that tailor every answer, with one Save. */
export default function ProfileDialog() {
  const { profileOpen, closeProfile, profile, setProfile, modules, answers, setAnswers, userId, toast } = useOfficer();
  const [form, setForm] = useState<Form>(fromProfile(profile));
  const [moduleAnswers, setModuleAnswers] = useState(answers);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profileOpen) { setForm(fromProfile(profile)); setModuleAnswers(answers); }
  }, [profileOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  const preview = profileCompleteness({ ...profile, ...form });
  const withQuestions = modules.filter(m => m.customQuestions.length > 0);

  const lastChanged = profile.vessel_email_last_changed ? new Date(profile.vessel_email_last_changed).getTime() : null;
  const daysSince = lastChanged ? (Date.now() - lastChanged) / 86400000 : Infinity;
  const emailLocked = daysSince < EMAIL_CHANGE_DAYS;
  const emailChanged = form.vessel_email.trim() !== (profile.vessel_email || '').trim();

  const save = async () => {
    if (emailChanged && emailLocked) {
      toast(`You can change your interaction email again in ${Math.ceil(EMAIL_CHANGE_DAYS - daysSince)} day(s).`, 'error');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const update = {
        full_name: form.full_name || null, rank: form.rank || null, company_name: form.company_name || null,
        vessel_email: form.vessel_email.trim() || null,
        vessel_email_last_changed: emailChanged ? now : profile.vessel_email_last_changed || null,
        vessel_name: form.vessel_name || null, vessel_type: form.vessel_type || null,
        operator_name: form.operator_name || null, grt: form.grt || null,
        has_pump_room: form.has_pump_room, pump_system_type: form.has_pump_room ? 'N/A' : form.pump_system_type,
        has_bow_thruster: form.has_bow_thruster, carries_chemical_cargo: form.carries_chemical_cargo,
        has_egcs: form.has_egcs, egcs_type: form.has_egcs ? form.egcs_type : 'N/A',
        operates_us_waters: form.operates_us_waters, operates_aus_nz_waters: form.operates_aus_nz_waters,
        operates_eu_waters: form.operates_eu_waters, operates_chinese_waters: form.operates_chinese_waters
      };
      const { data, error } = await supabase.from('profiles').update(update).eq('id', userId).select().single();
      if (error) throw error;
      for (const [agentId, a] of Object.entries(moduleAnswers)) {
        if (JSON.stringify(a) === JSON.stringify(answers[agentId] || {})) continue;
        const { error: aErr } = await supabase.from('user_agent_settings').upsert({ user_id: userId, agent_id: agentId, answers: a });
        if (aErr) throw aErr;
      }
      setProfile(data || { ...profile, ...update });
      setAnswers(moduleAnswers);
      toast('Profile saved. Your next answers use these details.');
      closeProfile();
    } catch (err) {
      toast(`Couldn't save your profile: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const check = (k: keyof Form, label: string) => (
    <label key={k} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border cursor-pointer text-sm hover:bg-muted/50">
      <input type="checkbox" checked={form[k] as boolean} onChange={e => set(k, e.target.checked as any)} className="w-4 h-4 accent-[#575ECF]" />
      {label}
    </label>
  );

  return (
    <Dialog
      open={profileOpen}
      onClose={closeProfile}
      wide
      title="Profile & vessel"
      subtitle="Answers are written for your ship using these details."
      footer={<><Button onClick={closeProfile}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button></>}
    >
      <div className="space-y-7">
        <div className="flex items-center gap-3">
          <Meter used={preview.percent} max={100} className="flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{preview.percent}% complete</span>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">You</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Full name" htmlFor="pf-name"><input id="pf-name" className={inputClass} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Capt. John Doe" /></Field>
            <Field label="Rank" htmlFor="pf-rank"><input id="pf-rank" className={inputClass} value={form.rank} onChange={e => set('rank', e.target.value)} placeholder="Master" /></Field>
            <Field label="Company" htmlFor="pf-company"><input id="pf-company" className={inputClass} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Ocean Shipping Ltd" /></Field>
          </div>
          <Field label="Interaction email" htmlFor="pf-vemail" hint={emailLocked
            ? `Changed recently. You can change it again in ${Math.ceil(EMAIL_CHANGE_DAYS - daysSince)} day(s).`
            : `The ship's address you email M.A.T.E from. It can be changed once every ${EMAIL_CHANGE_DAYS} days.`}>
            <input id="pf-vemail" type="email" className={inputClass} value={form.vessel_email} onChange={e => set('vessel_email', e.target.value)} placeholder="master@vessel.com" disabled={emailLocked} />
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Vessel</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vessel name" htmlFor="pf-vessel"><input id="pf-vessel" className={inputClass} value={form.vessel_name} onChange={e => set('vessel_name', e.target.value)} placeholder="Pioneer Mariner" /></Field>
            <Field label="Vessel type" htmlFor="pf-vtype">
              <input id="pf-vtype" list="pf-vtypes" className={inputClass} value={form.vessel_type} onChange={e => set('vessel_type', e.target.value)} placeholder="Oil Tanker" />
              <datalist id="pf-vtypes">{VESSEL_TYPES.map(t => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field label="Operator" htmlFor="pf-operator"><input id="pf-operator" className={inputClass} value={form.operator_name} onChange={e => set('operator_name', e.target.value)} placeholder="V.Ships" /></Field>
            <Field label="GRT" htmlFor="pf-grt"><input id="pf-grt" inputMode="numeric" className={inputClass} value={form.grt} onChange={e => set('grt', e.target.value)} placeholder="45,000" /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Machinery &amp; cargo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-2">
              {check('has_pump_room', 'Pump room fitted')}
              {!form.has_pump_room && (
                <select aria-label="Deepwell pump system" className={inputClass} value={form.pump_system_type} onChange={e => set('pump_system_type', e.target.value)}>
                  <option value="FRAMO">Deepwell pumps: FRAMO</option>
                  <option value="MARFLEX">Deepwell pumps: MARFLEX</option>
                </select>
              )}
            </div>
            <div className="space-y-2">
              {check('has_egcs', 'Scrubber (EGCS) fitted')}
              {form.has_egcs && (
                <select aria-label="Scrubber type" className={inputClass} value={form.egcs_type} onChange={e => set('egcs_type', e.target.value)}>
                  <option value="Open Loop">Open loop</option>
                  <option value="Closed Loop">Closed loop</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              )}
            </div>
            {check('has_bow_thruster', 'Bow thruster fitted')}
            {check('carries_chemical_cargo', 'Carries chemical cargo')}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Trading areas</h3>
          <div className="grid grid-cols-2 gap-2">{REGIONS.map(([k, label]) => check(k, label))}</div>
        </section>

        {withQuestions.length > 0 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-bold">Module questions</h3>
              <p className="text-xs text-muted-foreground">Some modules ask for extra details about your ship.</p>
            </div>
            {withQuestions.map(m => (
              <div key={m.agentId} className="rounded-xl border border-border p-4 space-y-3">
                <div className="text-sm font-semibold flex items-center gap-2"><SlotCode code={m.code} /> {m.name}</div>
                {m.customQuestions.map((q, i) => (
                  <Field key={i} label={q} htmlFor={`pq-${m.agentId}-${i}`}>
                    <input id={`pq-${m.agentId}-${i}`} className={inputClass} value={moduleAnswers[m.agentId]?.[q] || ''}
                      onChange={e => setModuleAnswers(a => ({ ...a, [m.agentId]: { ...(a[m.agentId] || {}), [q]: e.target.value } }))} />
                  </Field>
                ))}
              </div>
            ))}
          </section>
        )}
      </div>
    </Dialog>
  );
}
