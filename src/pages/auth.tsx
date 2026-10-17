import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card, Field, LinkButton, MockBanner, Notice } from '../components/ui';
import { Icon } from '../components/Icon';
import { Link, navigate } from '../lib/router';
import { useApp } from '../app/context';
import type { FieldErrors } from '../lib/validate';

function AuthLayout({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-wrap">
      <main id="main" className="auth-card" style={wide ? { width: 'min(560px, 100%)' } : undefined} aria-labelledby="page-title">
        <Link to="/" className="brand" aria-label="FREEVERSE welcome" style={{ justifySelf: 'center' }}>
          <img src="./brand/emblem-96.png" alt="" width={44} height={44} />
          <span className="brand-name">FREEVERSE</span>
        </Link>
        <h1 id="page-title" className="sr-only">{title}</h1>
        {children}
      </main>
    </div>
  );
}

const PRINCIPLES = [
  { icon: 'users', text: 'Real community, not an engagement machine. Your feed is chronological. No hidden ranking.' },
  { icon: 'lock', text: 'Privacy is a right. Your data is yours, and it is never sold.' },
  { icon: 'compass', text: 'Learning, opportunities, mentors and events in one place, built around your growth.' },
  { icon: 'shield', text: 'For adults aged 18 and over, with reporting and human moderation built in.' },
] as const;

export function Welcome() {
  const { signInDemo } = useApp();
  return (
    <div className="auth-wrap">
      <main id="main" className="auth-card" style={{ width: 'min(560px, 100%)' }} aria-labelledby="page-title">
        <div className="auth-hero">
          <img src="./brand/lockup-960.png" alt="FREEVERSE logo: a phoenix rising inside an orbiting ring" width={960} height={640} />
          <h1 id="page-title">A trusted place to connect, learn and grow.</h1>
          <p className="muted">FREEVERSE brings community, learning, opportunity and mentorship together for young adults, without the games platforms usually play with your attention.</p>
        </div>
        <div className="row-wrap" style={{ justifyContent: 'center' }}>
          <LinkButton to="/signup" variant="primary">Create account</LinkButton>
          <LinkButton to="/signin">Sign in</LinkButton>
        </div>
        <Card>
          <ul className="principles">
            {PRINCIPLES.map((p) => (
              <li key={p.text}><Icon name={p.icon} size={20} /><span>{p.text}</span></li>
            ))}
          </ul>
        </Card>
        <MockBanner title="Stage 1 prototype">
          Accounts, people and content here are simulated in your browser. Nothing is sent to a server. Want a look around first?{' '}
          <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 32, padding: '0 10px', color: 'var(--mock-ink)', textDecoration: 'underline' }} onClick={() => { signInDemo(); navigate('/home'); }}>
            Explore with the demo account
          </button>
        </MockBanner>
      </main>
    </div>
  );
}

type SignUpErrors = FieldErrors<'email' | 'password' | 'displayName' | 'attestation' | 'form'>;

export function SignUp() {
  const { signUp } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = signUp({ displayName, email, password, attestedAdult: adult });
    if (r.ok) { setErrors({}); navigate('/onboarding'); return; }
    setErrors(r.errors);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  return (
    <AuthLayout title="Create your account" wide>
      <Card>
        <form ref={formRef} onSubmit={onSubmit} noValidate className="stack">
          <h2>Create your account</h2>
          <MockBanner title="Mock authentication">No password is checked or stored. Your details are kept only in this browser so you can try the prototype.</MockBanner>
          <Field label="Display name" error={errors.displayName}>
            {(p) => <input {...p} className="input" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(p) => <input {...p} className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Password" hint="At least 8 characters." error={errors.password}>
            {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <div className="field">
            <label className="check" htmlFor="adult-attest">
              <input
                id="adult-attest" type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)}
                aria-describedby={errors.attestation ? 'adult-err' : 'adult-hint'} {...(errors.attestation ? { 'aria-invalid': true } : {})}
              />
              <span><strong>I confirm that I am 18 or older.</strong></span>
            </label>
            <span className="hint" id="adult-hint">FREEVERSE is for adults. This is a self-declaration. Stronger age checks may be added later.</span>
            {errors.attestation && <span className="error-text" id="adult-err" role="alert">{errors.attestation}</span>}
          </div>
          {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
          <Button type="submit" variant="primary" block>Create account</Button>
          <p className="muted" style={{ textAlign: 'center' }}>Already have an account? <Link to="/signin">Sign in</Link></p>
        </form>
      </Card>
    </AuthLayout>
  );
}

export function SignIn() {
  const { signIn, signInDemo } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<SignUpErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = signIn(email, password);
    if (r.ok) { navigate(r.account.onboarded ? '/home' : '/onboarding'); return; }
    setErrors(r.errors);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  return (
    <AuthLayout title="Sign in">
      <Card>
        <form ref={formRef} onSubmit={onSubmit} noValidate className="stack">
          <h2>Welcome back</h2>
          <MockBanner title="Mock authentication">Passwords are not verified in this prototype. You can sign in to any account created in this browser.</MockBanner>
          <Field label="Email" error={errors.email}>
            {(p) => <input {...p} className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Password" error={errors.password}>
            {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {errors.form && <Notice icon="alert">{errors.form}</Notice>}
          <Button type="submit" variant="primary" block>Sign in</Button>
          <Button block onClick={() => { signInDemo(); navigate('/home'); }}>Continue with the demo account</Button>
          <p className="muted" style={{ textAlign: 'center' }}>New here? <Link to="/signup">Create an account</Link></p>
        </form>
      </Card>
    </AuthLayout>
  );
}
