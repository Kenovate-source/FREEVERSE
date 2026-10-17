import { useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type AnchorHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { Link } from '../lib/router';

/* ---------- Buttons ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: IconName;
}
export function Button({ variant = 'secondary', size = 'md', block, icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

interface LinkButtonProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  variant?: Variant;
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: IconName;
}
export function LinkButton({ to, variant = 'secondary', size = 'md', block, icon, className = '', children, ...rest }: LinkButtonProps) {
  return (
    <Link to={to} className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </Link>
  );
}

/* ---------- Surfaces ---------- */
export function Card({ children, className = '', as: Tag = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={`card ${className}`} {...rest}>{children}</Tag>;
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'cyan' | 'violet' | 'pink' | 'mock' }) {
  return <span className={`badge ${tone === 'default' ? '' : `badge-${tone}`}`}>{children}</span>;
}

/** Small inline marker for any element backed by mock data. */
export function MockBadge({ label = 'Mock data' }: { label?: string }) {
  return <span className="badge badge-mock" title="This is simulated in the Stage 1 prototype.">{label}</span>;
}

/** Banner that states plainly what is simulated on a screen. */
export function MockBanner({ title = 'Mock data', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mock-banner" role="note">
      <Icon name="info" size={20} style={{ flex: 'none', marginTop: 2 }} />
      <div><strong>{title}.</strong> {children}</div>
    </div>
  );
}

export function Notice({ children, icon = 'info' }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="notice" role="note">
      <Icon name={icon} size={20} style={{ flex: 'none', marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- Avatar ---------- */
const PAIRS: [string, string][] = [
  ['#3ee6f4', '#4f9dff'], ['#a58bff', '#4f9dff'], ['#f7b2ff', '#a58bff'],
  ['#6ff0cf', '#3ee6f4'], ['#ffd68a', '#f7b2ff'], ['#9ad1ff', '#a58bff'],
];
export const AVATAR_COUNT = PAIRS.length;
export function avatarColors(hue: number): [string, string] {
  return PAIRS[((hue % PAIRS.length) + PAIRS.length) % PAIRS.length] ?? PAIRS[0]!;
}
export function Avatar({ name, hue = 0, size = 44 }: { name: string; hue?: number; size?: number }) {
  const [c1, c2] = avatarColors(hue);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return <span className="avatar" aria-hidden="true" style={{ '--s': `${size}px`, '--c1': c1, '--c2': c2 } as CSSProperties}>{initials}</span>;
}

/* ---------- Forms ---------- */
interface FieldRenderProps { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: (p: FieldRenderProps) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const described = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {children({ id, ...(described ? { 'aria-describedby': described } : {}), ...(error ? { 'aria-invalid': true } : {}) })}
      {error && <span className="error-text" id={errId} role="alert">{error}</span>}
    </div>
  );
}

/* ---------- States ---------- */
export function EmptyState({ icon = 'inbox', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state" role="status">
      <span className="state-icon"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon"><Icon name="alert" /></span>
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {onRetry && <Button variant="secondary" icon="refresh" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" aria-hidden="true" style={{ height, width, ...(radius ? { borderRadius: radius } : {}) }} />;
}

export function SkeletonCards({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="stack">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <div className="row" style={{ marginBottom: 14 }}>
            <Skeleton height={44} width={44} radius={999} />
            <div className="stack-sm" style={{ flex: 1 }}><Skeleton width="40%" /><Skeleton width="25%" height={12} /></div>
          </div>
          <div className="stack-sm"><Skeleton /><Skeleton width="85%" /><Skeleton width="60%" /></div>
        </Card>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid-cards">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}><div className="stack-sm"><Skeleton width="30%" height={14} /><Skeleton height={20} /><Skeleton width="90%" /><Skeleton width="70%" /></div></Card>
      ))}
    </div>
  );
}

/* ---------- Dialog (native <dialog>: focus trap, Escape, inert background) ---------- */
export function Dialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="dialog-actions">{actions ?? <Button variant="primary" onClick={onClose}>Close</Button>}</div>
      </div>
    </dialog>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <h1 id="page-title">{title}</h1>
        {actions}
      </div>
      {intro && <p>{intro}</p>}
    </header>
  );
}
