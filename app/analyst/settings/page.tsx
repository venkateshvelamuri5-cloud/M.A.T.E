'use client';
import React, { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { supabase } from '../../../src/supabase-client';
import { useAnalyst } from '../_lib/context';
import { logChange } from '../_lib/audit';
import { loadCategoryNames } from '../_lib/agents';
import { CATEGORY_LETTERS, CategoryLetter, DEFAULT_CATEGORY_NAMES } from '../_lib/slots';
import { Button, Card, Field, PageHeader, inputClass } from '../_lib/ui';

export default function SettingsPage() {
  const { toast } = useAnalyst();
  const [names, setNames] = useState<Record<CategoryLetter, string>>(DEFAULT_CATEGORY_NAMES);
  const [savedNames, setSavedNames] = useState<Record<CategoryLetter, string>>(DEFAULT_CATEGORY_NAMES);
  const [manual, setManual] = useState('');
  const [savedManual, setSavedManual] = useState('');
  const [busy, setBusy] = useState<'names' | 'manual' | null>(null);

  useEffect(() => {
    (async () => {
      const [n, { data }] = await Promise.all([
        loadCategoryNames(),
        supabase.from('system_settings').select('value').eq('key', 'user_manual').maybeSingle()
      ]);
      setNames(n); setSavedNames(n);
      setManual(data?.value || ''); setSavedManual(data?.value || '');
    })();
  }, []);

  const namesDirty = CATEGORY_LETTERS.some(l => names[l] !== savedNames[l]);

  const saveNames = async () => {
    if (CATEGORY_LETTERS.some(l => !names[l].trim())) { toast('Every category needs a name.', 'error'); return; }
    setBusy('names');
    const { error } = await supabase.from('system_settings').upsert({ key: 'category_names', value: JSON.stringify(names) }, { onConflict: 'key' });
    setBusy(null);
    if (error) { toast(`Couldn't save category names: ${error.message}`, 'error'); return; }
    const changed = CATEGORY_LETTERS.filter(l => names[l] !== savedNames[l]);
    await logChange({ action: 'setting.categories', entityType: 'setting', entityId: 'category_names', summary: `Renamed ${changed.map(l => `category ${l} to “${names[l]}”`).join(', ')}` });
    setSavedNames(names);
    toast('Category names saved. Officers see them on their next visit.');
  };

  const saveManual = async () => {
    setBusy('manual');
    const { error } = await supabase.from('system_settings').upsert({ key: 'user_manual', value: manual }, { onConflict: 'key' });
    setBusy(null);
    if (error) { toast(`Couldn't save the manual: ${error.message}`, 'error'); return; }
    await logChange({ action: 'setting.manual', entityType: 'setting', entityId: 'user_manual', summary: `Updated the user manual (${manual.length.toLocaleString()} characters)` });
    setSavedManual(manual);
    toast('User manual published.');
  };

  const loadManualFile = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.txt', '.md'].includes(ext)) { toast('Upload a .txt or .md file for the manual.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      setManual(String(ev.target?.result || ''));
      toast(`Loaded ${file.name}. Review it, then publish.`, 'info');
    };
    reader.readAsText(file);
  };

  return (
    <>
      <PageHeader title="Settings" />

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Category names</h2>
          <p className="text-sm text-muted-foreground">The six groups agents are listed under, here and on the officer dashboard.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORY_LETTERS.map(l => (
            <Field key={l} label={`Category ${l}`} htmlFor={`cat-${l}`}>
              <input id={`cat-${l}`} value={names[l]} onChange={e => setNames(n => ({ ...n, [l]: e.target.value }))} className={inputClass} />
            </Field>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          {namesDirty && <Button onClick={() => setNames(savedNames)}>Discard</Button>}
          <Button variant="primary" onClick={saveNames} disabled={!namesDirty || busy === 'names'}>{busy === 'names' ? 'Saving…' : 'Save names'}</Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">User manual</h2>
            <p className="text-sm text-muted-foreground">Shown to every officer. Changes go live when you publish.</p>
          </div>
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-muted text-sm font-semibold cursor-pointer whitespace-nowrap">
            <Upload className="w-4 h-4" /> Load from .txt or .md
            <input type="file" accept=".txt,.md" className="hidden" onChange={e => { loadManualFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <textarea id="user-manual" aria-label="User manual" value={manual} onChange={e => setManual(e.target.value)} rows={18}
          className={`${inputClass} font-mono text-[13px] leading-relaxed`} placeholder="Write the user manual here, or load a file." />
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs text-muted-foreground">{manual.length.toLocaleString()} characters</span>
          <div className="flex gap-2">
            {manual !== savedManual && <Button onClick={() => setManual(savedManual)}>Discard</Button>}
            <Button variant="primary" onClick={saveManual} disabled={manual === savedManual || busy === 'manual'}>{busy === 'manual' ? 'Publishing…' : 'Publish manual'}</Button>
          </div>
        </div>
      </Card>
    </>
  );
}
