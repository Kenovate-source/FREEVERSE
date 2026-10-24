import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { ApiError } from '../api/client';
import { Link } from '../lib/router';

// ───────── layout & text ─────────
export function PageHead({ title, children, actions, back }: { title: string; children?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="page-head">
      {back && <Link to={back.to} className="back-link"><Icon name="arrowLeft" size={16} /> {back.label}</Link>}
      <div className="spread"><h1 id="page-title" tabIndex={-1}>{title}</h1>{actions && <div className="row-wrap">{actions}</div>}</div>
      {children && <p>{children}</p>}
    </header>
  );
}
export const Card = ({ children, className = '', as: T = 'section', ...r }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li' } & React.HTMLAttributes<HTMLElement>) => <T className={`card ${className}`} {...(r as object)}>{children}</T>;
export const Badge = ({ children, tone }: { children: ReactNode; tone?: 'cyan' | 'violet' | 'pink' | 'demo' | 'warn' | 'ok' }) => <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>;
export const DemoBadge = ({ label = 'Demo' }: { label?: string }) => <Badge tone="demo">{label}</Badge>;
export function Notice({ children, tone = 'info', title }: { children: ReactNode; tone?: 'info' | 'demo' | 'warn' | 'ok'; title?: string }) {
  return <div className={tone === 'demo' ? 'mock-banner' : `notice notice-${tone}`} role={tone === 'warn' ? 'alert' : 'note'}><Icon name={tone === 'warn' ? 'alert' : tone === 'ok' ? 'check' : 'info'} size={18} style={{ flex: 'none', marginTop: 2 }} /><div>{title && <strong>{title} </strong>}{children}</div></div>;
}

// ───────── buttons ─────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; block?: boolean; busy?: boolean };
export function Button({ variant = 'secondary', size = 'md', block, busy, children, className = '', disabled, ...r }: BtnProps) {
  return <button type="button" className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...r}>{busy ? 'Working…' : children}</button>;
}
export const IconButton = ({ icon, label, ...r }: { icon: string; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" className="icon-btn" aria-label={label} title={label} {...r}><Icon name={icon} size={20} /></button>;

// ───────── form fields ─────────
interface FieldShell { label: string; hint?: ReactNode; error?: string; optional?: boolean }
function Shell({ id, label, hint, error, optional, children }: FieldShell & { id: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label}{optional && <span className="faint"> (optional)</span>}</label>{children}{hint && <span className="hint" id={`${id}-h`}>{hint}</span>}{error && <span className="error-text" id={`${id}-e`} role="alert">{error}</span>}</div>;
}
const aria = (id: string, hint: unknown, error: unknown) => ({ 'aria-invalid': error ? true : undefined, 'aria-describedby': [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined });
export function TextField({ label, hint, error, optional, ...r }: FieldShell & InputHTMLAttributes<HTMLInputElement>) { const id = useId(); return <Shell {...{ id, label, hint, error, optional }}><input id={id} className="input" {...aria(id, hint, error)} {...r} /></Shell>; }
export function TextArea({ label, hint, error, optional, ...r }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) { const id = useId(); return <Shell {...{ id, label, hint, error, optional }}><textarea id={id} className="textarea" {...aria(id, hint, error)} {...r} /></Shell>; }
export function SelectField({ label, hint, error, optional, children, ...r }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) { const id = useId(); return <Shell {...{ id, label, hint, error, optional }}><select id={id} className="select" {...aria(id, hint, error)} {...r}>{children}</select></Shell>; }
export function Check({ label, hint, ...r }: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) { const id = useId(); return <div className="check"><input id={id} type="checkbox" {...r} /><label htmlFor={id}><span>{label}</span>{hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}</label></div>; }
export function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="switch-row"><div><label htmlFor={id} className="switch-label">{label}</label>{hint && <div className="hint">{hint}</div>}</div><button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} className="switch" onClick={() => onChange(!checked)}><span /></button></div>;
}
export function Chip({ on, children, onClick, disabled }: { on?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean }) { return <button type="button" className="chip" aria-pressed={on} onClick={onClick} disabled={disabled}>{children}</button>; }
export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return <div className="seg" role="group" aria-label={label}>{options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export const errMsg = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong.');
export const fieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiError ? Object.fromEntries((e.details ?? []).map((d) => [d.path, d.message])) : {});

// ───────── states ─────────
export function Loading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) { return <div className="stack" role="status" aria-label={label}>{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>; }
export function EmptyState({ icon = 'inbox', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) { return <div className="state"><div className="state-icon"><Icon name={icon} /></div><h2>{title}</h2>{children && <p className="muted">{children}</p>}{action}</div>; }
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return <div className="state state-error" role="alert"><div className="state-icon"><Icon name={forbidden ? 'lock' : 'alert'} /></div><h2>{forbidden ? 'Not available to you' : 'We couldn’t load this'}</h2><p className="muted">{errMsg(error)}</p>{onRetry && !forbidden && <Button onClick={onRetry}><Icon name="refresh" size={16} /> Try again</Button>}</div>;
}

// ───────── data loading ─────────
export interface Resource<T> { data: T | null; error: unknown; loading: boolean; reload: () => void; set: (fn: (d: T) => T) => void }
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Resource<T> {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<unknown>(null); const [loading, setLoading] = useState(true); const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController(); setLoading(true); setError(null);
    load(ac.signal).then((d) => { if (!ac.signal.aborted) { setData(d); setLoading(false); } }).catch((e) => { if (!ac.signal.aborted && (e as Error).name !== 'AbortError') { setError(e); setLoading(false); } });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((x) => x + 1), set: (fn) => setData((d) => (d === null ? d : fn(d))) };
}
export function Async<T>({ res, children, rows, empty }: { res: Resource<T>; children: (d: T) => ReactNode; rows?: number; empty?: (d: T) => ReactNode | null }) {
  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (res.loading && !res.data) return <Loading rows={rows} />;
  if (!res.data) return null;
  const e = empty?.(res.data); if (e) return <>{e}</>;
  return <>{children(res.data)}</>;
}

// ───────── dialogs ─────────
export function Dialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const tid = useId();
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={tid} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && <div className="dialog-body"><div className="spread"><h2 id={tid}>{title}</h2><IconButton icon="x" label="Close" onClick={onClose} /></div>{children}{actions && <div className="dialog-actions">{actions}</div>}</div>}
    </dialog>
  );
}
export function Confirm({ open, title, children, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setErr(null); setBusy(false); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => { setBusy(true); setErr(null); try { await onConfirm(); onClose(); } catch (e) { setErr(errMsg(e)); setBusy(false); } }}>{confirmLabel}</Button></>}>
      <div className="stack-sm">{children}{err && <p className="error-text" role="alert">{err}</p>}</div>
    </Dialog>
  );
}
