'use client';
import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Sparkles } from 'lucide-react';
import { useOfficer } from '../_lib/officer';
import { suggestModules } from '../_lib/modules';

const PROMPTS = [
  'Risk assessment for enclosed space entry into a ballast tank',
  'CAPA for a PSC deficiency on the emergency fire pump',
  'What does our SMS say about bunkering overside?',
  'Fire drill record: galley fire, crew mustered in 3 minutes'
];

/** One box for everything: type the task in plain words and M.A.T.E picks the module. */
export default function AskBox() {
  const router = useRouter();
  const { modules } = useOfficer();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const suggestions = useMemo(() => suggestModules(text, modules), [text, modules]);

  const go = (code: string) => {
    const q = text.trim();
    router.push(`/dashboard/modules/${code}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActive(a => (a + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const pick = suggestions[active] || suggestions[0];
      if (pick) go(pick.module.code);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl bg-white shadow-lg shadow-black/10 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[#8f95ff]">
        <Sparkles className="w-5 h-5 absolute left-4 top-4 text-[#575ECF]" />
        <textarea
          ref={ref}
          id="ask-mate"
          rows={2}
          value={text}
          onChange={e => { setText(e.target.value); setActive(0); }}
          onKeyDown={onKey}
          placeholder="What do you need today? e.g. risk assessment for working aloft on the main mast"
          aria-label="Describe what you need"
          className="w-full resize-none bg-transparent pl-12 pr-14 py-3.5 text-[15px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 outline-none"
        />
        <button type="button" onClick={() => suggestions[active] && go(suggestions[active].module.code)} disabled={!suggestions.length}
          className="absolute right-3 bottom-3 w-9 h-9 rounded-xl bg-[#575ECF] text-white flex items-center justify-center disabled:opacity-30 hover:bg-[#464cb3] transition" aria-label="Continue with the best match">
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {suggestions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3" role="listbox" aria-label="Suggested modules">
          {suggestions.map((s, i) => (
            <button
              key={s.module.code}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(s.module.code)}
              className={`text-left rounded-xl px-3.5 py-2.5 transition border ${i === active ? 'bg-white text-zinc-900 border-white shadow' : 'bg-white/10 text-white border-white/15 hover:bg-white/15'}`}
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                <span className={i === active ? 'text-[#575ECF]' : 'text-indigo-200'}>{s.module.code}</span>
                {i === 0 && s.score > 0 && <span className={`rounded-full px-1.5 py-px ${i === active ? 'bg-indigo-50 text-[#575ECF]' : 'bg-white/15 text-white'}`}>Best match</span>}
                {i === active && <CornerDownLeft className="w-3 h-3 ml-auto text-zinc-400" />}
              </div>
              <div className="text-sm font-semibold mt-0.5 truncate">{s.module.name}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map(p => (
            <button key={p} type="button" onClick={() => { setText(p); ref.current?.focus(); }}
              className="text-xs rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-indigo-100 hover:bg-white/15 hover:text-white transition truncate max-w-full">
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
