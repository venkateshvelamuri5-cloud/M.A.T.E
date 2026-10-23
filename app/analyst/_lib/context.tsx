'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Button } from './ui';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ConfirmOptions {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

interface AnalystContextValue {
  userId: string;
  userEmail: string;
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /**
   * Shows "<message> · Undo" for a few seconds and runs commit() when the time is up.
   * Undo cancels it, so nothing is lost until the toast closes.
   */
  deferred: (opts: { message: string; commit: () => Promise<void>; onUndo?: () => void }) => void;
}

const AnalystContext = createContext<AnalystContextValue | null>(null);

export function useAnalyst() {
  const ctx = useContext(AnalystContext);
  if (!ctx) throw new Error('useAnalyst must be used inside the analyst console');
  return ctx;
}

const TOAST_MS = 4000;
const UNDO_MS = 8000;

export function AnalystProvider({ userId, userEmail, children }: { userId: string; userEmail: string; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);
  const pending = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> }>());

  const dismiss = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts(ts => [...ts, { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? TOAST_MS * 2 : TOAST_MS);
  }, [dismiss]);

  const deferred = useCallback<AnalystContextValue['deferred']>(({ message, commit, onUndo }) => {
    const id = nextId.current++;
    const run = async () => {
      pending.current.delete(id);
      dismiss(id);
      try {
        await commit();
      } catch (err) {
        toast(`That didn't go through: ${(err as Error).message}`, 'error');
      }
    };
    const timer = setTimeout(run, UNDO_MS);
    pending.current.set(id, { timer, commit: run });
    setToasts(ts => [...ts, {
      id, kind: 'info', message,
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(timer);
          pending.current.delete(id);
          dismiss(id);
          onUndo?.();
        }
      }
    }]);
  }, [dismiss, toast]);

  // Warn before leaving while a delete is still waiting out its undo window.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>(resolve => {
    setConfirmState({ ...opts, resolve });
  }), []);

  const closeConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  return (
    <AnalystContext.Provider value={{ userId, userEmail, toast, confirm, deferred }}>
      {children}

      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg sm:max-w-md ${
            t.kind === 'error' ? 'bg-red-700 text-white' : 'bg-zinc-900 text-white'
          }`}>
            {t.kind === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : null}
            <span className="flex-1 min-w-0">{t.message}</span>
            {t.action && (
              <button type="button" onClick={t.action.onClick} className="font-semibold text-indigo-300 hover:text-white shrink-0">
                {t.action.label}
              </button>
            )}
            <button type="button" onClick={() => { const p = pending.current.get(t.id); if (p) { clearTimeout(p.timer); p.commit(); } else dismiss(t.id); }} className="text-zinc-400 hover:text-white shrink-0" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[70] bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => closeConfirm(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground">{confirmState.title}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed">{confirmState.body}</div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => closeConfirm(false)} autoFocus>Cancel</Button>
              <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>{confirmState.confirmLabel}</Button>
            </div>
          </div>
        </div>
      )}
    </AnalystContext.Provider>
  );
}
