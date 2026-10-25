import { useState, type FormEvent } from 'react';
import { Link, navigate, useQuery } from '../lib/router';
import { useSession } from '../state/session';
import { api } from '../api/client';
import { Button, Check, TextField, SelectField, Notice, errMsg, fieldErrors } from '../ui/kit';
import { validateEmail, validatePassword } from '../lib/validate';

function AuthFrame({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  const { config } = useSession();
  return (
    <main className="auth-wrap" id="main" tabIndex={-1}><div className="auth-card">
      <div className="auth-hero"><Link to="/"><img src="./brand/lockup-960.png" alt="FREEVERSE" width="260" height="173" /></Link><h1 id="page-title" tabIndex={-1}>{title}</h1>{intro && <p className="muted">{intro}</p>}</div>
      {config?.auth.kind === 'dev' && <Notice tone="demo" title="Development sign-in.">Accounts are local and passwords are not verified in this mode.</Notice>}
      <div className="card stack">{children}</div>
    </div></main>
  );
}

export function SignIn() {
  const { signIn } = useSession(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [fe, setFe] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const f = { email: validateEmail(email) ?? '', pw: pw ? '' : 'Enter your password.' }; setFe(Object.fromEntries(Object.entries(f).filter(([, v]) => v))); if (f.email || f.pw) return;
    setBusy(true); setErr(null); try { await signIn(email.trim(), pw); navigate('/home'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  const notice = useQuery().get('notice');
  const noticeText = notice === 'link_expired' ? 'That email link has expired. Sign in, or request a new link.' : notice === 'link_invalid' ? 'That email link isn’t valid. Sign in, or request a new link.' : notice === 'session_expired' ? 'Your session ended. Please sign in again.' : null;
  return (
    <AuthFrame title="Welcome back" intro="Sign in to pick up where you left off.">
      <form className="stack" onSubmit={submit} noValidate>
        {noticeText && <Notice tone="warn">{noticeText}</Notice>}
        {err && <Notice tone="warn">{err}</Notice>}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fe.email} />
        <TextField label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} error={fe.pw} />
        <Button type="submit" variant="primary" block busy={busy}>Sign in</Button>
        <p className="muted center"><Link to="/recover">Forgot your password?</Link></p>
      </form>
      <p className="muted center">New here? <Link to="/signup">Create an account</Link></p>
    </AuthFrame>
  );
}

export function SignUp() {
  const { signUp, config } = useSession(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [age, setAge] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [fe, setFe] = useState<Record<string, string>>({}); const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const f: Record<string, string> = {}; const a = validateEmail(email); const b = validatePassword(pw); if (a) f.email = a; if (b) f.pw = b; if (!age) f.age = `Please confirm you are an adult aged ${config?.eligibility.min ?? 18} or over.`; setFe(f); if (Object.keys(f).length) return;
    setBusy(true); setErr(null);
    try { const r = await signUp(email.trim(), pw); if (r.needsEmailConfirmation) setSent(true); else navigate('/eligibility'); } catch (x) { setErr(errMsg(x)); setFe((p) => ({ ...p, ...fieldErrors(x) })); } finally { setBusy(false); }
  };
  if (sent) return <AuthFrame title="Check your email"><Notice tone="ok">We sent a confirmation link to <strong>{email}</strong>. Open it, then sign in.</Notice><Link to="/signin" className="btn btn-primary btn-block">Go to sign in</Link></AuthFrame>;
  return (
    <AuthFrame title="Create your account" intro="Free to join. You’ll confirm your age range next.">
      <form className="stack" onSubmit={submit} noValidate>
        {err && <Notice tone="warn">{err}</Notice>}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fe.email} />
        <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters. We never store it ourselves; a managed sign-in service does." value={pw} onChange={(e) => setPw(e.target.value)} error={fe.pw ?? fe.password} />
        <div><Check label={`I’m an adult aged ${config?.eligibility.min ?? 18} or over`} checked={age} onChange={(e) => setAge(e.target.checked)} aria-invalid={fe.age ? true : undefined} />{fe.age && <p className="error-text" role="alert">{fe.age}</p>}</div>
        <Button type="submit" variant="primary" block busy={busy}>Create account</Button>
      </form>
      <p className="muted center">Already a member? <Link to="/signin">Sign in</Link></p>
      <p className="faint center">By continuing you will be asked to accept our <Link to="/terms">Terms</Link>, <Link to="/privacy">Privacy Policy</Link> and <Link to="/rules">Community rules</Link> (drafts).</p>
    </AuthFrame>
  );
}

export function Recover() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); const v = validateEmail(email); if (v) return setErr(v); setBusy(true); setErr(null); try { const r = await api.post<{ message: string }>('/api/auth/recover', { email: email.trim() }); setDone(r.message); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return (
    <AuthFrame title="Reset your password" intro="We’ll email you a link if an account exists for that address.">
      {done ? <Notice tone="ok">{done}</Notice> : <form className="stack" onSubmit={submit} noValidate>{err && <Notice tone="warn">{err}</Notice>}<TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /><Button type="submit" variant="primary" block busy={busy}>Send reset link</Button></form>}
      <p className="muted center"><Link to="/signin">Back to sign in</Link></p>
    </AuthFrame>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function Eligibility() {
  const { refresh, signOut, config } = useSession(); const [m, setM] = useState(''); const [d, setD] = useState(''); const [y, setY] = useState(''); const [terms, setTerms] = useState(false); const [ok, setOk] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false);
  const min = config?.eligibility.min ?? 18;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!m || !d || !y) return setErr('Please enter your full date of birth.');
    if (!terms || !ok) return setErr('Please accept the terms and confirm your date is correct.');
    setBusy(true);
    try { await api.post('/api/me/eligibility', { birthMonth: Number(m), birthDay: Number(d), birthYear: Number(y), acceptTerms: true, confirmSelfDeclared: true }); await refresh(); navigate('/onboarding'); }
    catch (x) { const code = (x as { code?: string }).code; if (code === 'ineligible' || code === 'not_eligible') setBlocked(true); setErr(errMsg(x)); await refresh(); } finally { setBusy(false); }
  };
  if (blocked) return <AuthFrame title="FREEVERSE isn’t available to you yet"><Notice tone="info">FREEVERSE is for adults aged {min} and over. We haven’t kept the date you entered.</Notice><Button block onClick={() => void signOut()}>Sign out</Button></AuthFrame>;
  return (
    <AuthFrame title="One quick check" intro={`FREEVERSE is for adults aged ${min} and over.`}>
      <form className="stack" onSubmit={submit} noValidate>
        {err && <Notice tone="warn">{err}</Notice>}
        <fieldset className="stack-sm fieldset"><legend>Date of birth</legend>
          <div className="grid-3">
            <SelectField label="Month" value={m} onChange={(e) => setM(e.target.value)}><option value="">Month</option>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</SelectField>
            <SelectField label="Day" value={d} onChange={(e) => setD(e.target.value)}><option value="">Day</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</SelectField>
            <SelectField label="Year" value={y} onChange={(e) => setY(e.target.value)}><option value="">Year</option>{Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - 16 - i).map((n) => <option key={n} value={n}>{n}</option>)}</SelectField>
          </div>
          <p className="hint">We keep only your birth month and year, never the day. This is self-declared, not verified, and your age range is private by default.</p>
        </fieldset>
        <Check label={<>I accept the <Link to="/terms">Terms of Service</Link>, <Link to="/privacy">Privacy Policy</Link> and <Link to="/rules">Community rules</Link> (drafts)</>} checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <Check label="The date I entered is correct" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <Button type="submit" variant="primary" block busy={busy}>Continue</Button>
        <Button variant="ghost" block onClick={() => void signOut()}>Sign out</Button>
      </form>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const { status, signOut } = useSession(); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const v = validatePassword(pw); if (v) return setErr(v);
    setBusy(true); setErr(null);
    try { await api.post('/api/auth/password', { newPassword: pw }); setDone(true); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  if (status === 'loading') return <AuthFrame title="Choose a new password"><p className="muted">Checking your reset link…</p></AuthFrame>;
  if (status !== 'in') return <AuthFrame title="Choose a new password"><Notice tone="warn">This reset link is missing or has expired.</Notice><Link to="/recover" className="btn btn-primary btn-block">Request a new link</Link></AuthFrame>;
  if (done) return <AuthFrame title="Password updated"><Notice tone="ok">Your password has been changed.</Notice><Link to="/home" className="btn btn-primary btn-block">Continue to FREEVERSE</Link></AuthFrame>;
  return (
    <AuthFrame title="Choose a new password" intro="Pick a password you don’t use anywhere else.">
      <form className="stack" onSubmit={submit} noValidate>
        {err && <Notice tone="warn">{err}</Notice>}
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" variant="primary" block busy={busy}>Update password</Button>
        <p className="muted center"><button type="button" className="link-btn" onClick={() => void signOut()}>Cancel and sign out</button></p>
      </form>
    </AuthFrame>
  );
}
