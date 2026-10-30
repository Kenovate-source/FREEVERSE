import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { navigate } from '../lib/router';
import { useSession } from '../state/session';
import { Button, Chip, Loading, Notice, ErrorState, errMsg, TextField, Switch, useResource } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { ARCHETYPE_DEFS, ARCHETYPE_LIST, INTENTS, visibleQuestions } from '../../shared/archetypes';
import type { OnboardingState, OnboardingStep } from '../../shared/api/identity';
import type { Archetype } from '../../shared/constants';
import type { InterestCatalogResponse } from '../../shared/api/profile';
import { PRESET_HELP } from '../../shared/privacy';
import { PERSONALIZATION_LIMITS, slugify } from '../../shared/interests';

type Answers = Record<string, string | string[]>;
const get = () => api.get<{ state: OnboardingState }>('/api/onboarding').then((r) => r.state);

export function Onboarding() {
  const { refresh } = useSession(); const res = useResource(() => get(), []); const [st, setSt] = useState<OnboardingState | null>(null); const [i, setI] = useState(0); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (res.data) setSt(res.data); }, [res.data]);
  const apply = (s: OnboardingState) => setSt(s);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => { setBusy(true); setErr(null); try { return await fn(); } catch (e) { setErr(errMsg(e)); return null; } finally { setBusy(false); } };
  const finish = async () => { const r = await run(() => api.post<{ state: OnboardingState }>('/api/onboarding/complete')); if (r) { await refresh(); navigate('/home'); } };
  const skipAll = async () => { const r = await run(() => api.post<{ state: OnboardingState }>('/api/onboarding/skip')); if (r) { await refresh(); navigate('/home'); } };

  if (res.error && !st) return <main className="auth-wrap" id="main"><ErrorState error={res.error} onRetry={res.reload} /></main>;
  if (!st) return <main className="auth-wrap" id="main"><Loading rows={2} /></main>;

  // Choose how to begin.
  if (!st.path) {
    const pick = async (path: 'identity_first' | 'guided_discovery') => { const r = await run(() => api.put<{ state: OnboardingState }>('/api/onboarding/path', { path })); if (r) { apply(r.state); setI(0); } };
    return (
      <main className="onb" id="main" tabIndex={-1}>
        <div className="onb-card stack-lg">
          <header className="stack-sm"><h1 id="page-title" tabIndex={-1}>Welcome to FREEVERSE</h1><p className="muted">Two ways to set up. Both lead to the same account, and everything stays editable later. You can skip any step.</p></header>
          {err && <Notice tone="warn">{err}</Notice>}
          <div className="grid-cards">
            <button type="button" className="card path-card" onClick={() => void pick('identity_first')} disabled={busy}><Icon name="user" size={28} /><h2>I know who I am here as</h2><p className="muted">Pick the identities that fit you (like Student, Creator or Entrepreneur), then answer a few questions for each.</p><span className="btn btn-primary btn-sm">Start with identity</span></button>
            <button type="button" className="card path-card" onClick={() => void pick('guided_discovery')} disabled={busy}><Icon name="compass" size={28} /><h2>Help me find my way</h2><p className="muted">Tell us what you’d like to do. We’ll suggest identities you can accept, change or ignore.</p><span className="btn btn-secondary btn-sm">Guide me</span></button>
          </div>
          <div className="row-wrap"><Button variant="ghost" onClick={() => void skipAll()} busy={busy}>Skip setup for now</Button><span className="faint">You’ll land on a general Home and can set this up later from Identities.</span></div>
        </div>
      </main>
    );
  }

  const steps = st.steps; const step: OnboardingStep | undefined = steps[Math.min(i, steps.length - 1)];
  if (!step) return null;
  const go = (n: number) => { setI(Math.max(0, Math.min(steps.length - 1, n))); void api.post('/api/onboarding/step', { step: steps[Math.max(0, Math.min(steps.length - 1, n))]!.id }).catch(() => {}); };
  const next = () => go(i + 1); const back = () => go(i - 1);
  // After picking identities the step list changes; stay at the same index.
  const props = { st, apply, run, busy, next };

  return (
    <main className="onb" id="main" tabIndex={-1}>
      <div className="onb-card stack-lg">
        <div className="stack-sm">
          <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={`Step ${i + 1} of ${steps.length}`}>{steps.map((s, n) => <i key={s.id} data-on={n <= i} />)}</div>
          <p className="faint">Step {i + 1} of {steps.length} · {st.path === 'identity_first' ? 'Identity first' : 'Guided discovery'}</p>
        </div>
        {err && <Notice tone="warn">{err}</Notice>}
        {step.kind === 'identities' && <PickIdentities {...props} />}
        {step.kind === 'intents' && <Intents {...props} />}
        {step.kind === 'suggest' && <Suggest {...props} />}
        {step.kind === 'identity' && step.archetype && <IdentityQuestions key={step.id} arch={step.archetype} quick={!!step.quick} {...props} />}
        {step.kind === 'profile' && <ProfileStep {...props} />}
        {step.kind === 'interests' && <Interests {...props} suggested={st.selected.flatMap((a) => ARCHETYPE_DEFS[a].suggestTags)} />}
        {step.kind === 'privacy' && <PrivacyStep {...props} />}
        {step.kind === 'finish' && <Finish st={st} onDone={finish} busy={busy} />}
        {step.kind !== 'finish' && (
          <footer className="spread onb-foot">
            <Button variant="ghost" onClick={back} disabled={i === 0}>Back</Button>
            <div className="row-wrap"><Button variant="ghost" onClick={next}>Skip this step</Button><Button variant="ghost" onClick={() => void skipAll()}>Skip the rest</Button></div>
          </footer>
        )}
      </div>
    </main>
  );
}

interface P { st: OnboardingState; apply: (s: OnboardingState) => void; run: <T>(fn: () => Promise<T>) => Promise<T | null>; busy: boolean; next: () => void }

function ArchCard({ a, on, onClick, note }: { a: Archetype; on: boolean; onClick: () => void; note?: string }) {
  const d = ARCHETYPE_DEFS[a];
  return <button type="button" className="arch" aria-pressed={on} onClick={onClick} style={{ ['--ac' as string]: d.accent }}><span className="arch-ico" aria-hidden="true">{d.icon}</span><span className="stack-sm" style={{ textAlign: 'left' }}><strong>{d.label}</strong><span className="muted small">{note ?? d.tagline}</span></span></button>;
}

function PickIdentities({ st, apply, run, busy, next }: P) {
  const [sel, setSel] = useState<Archetype[]>(st.selected); const [primary, setPrimary] = useState<Archetype | null>(st.primary);
  const toggle = (a: Archetype) => setSel((s) => { const on = s.includes(a); const n = on ? s.filter((x) => x !== a) : s.length >= 4 ? s : [...s, a]; if (on && primary === a) setPrimary(n[0] ?? null); return n; });
  const save = async () => { const r = await run(() => api.put<{ state: OnboardingState }>('/api/onboarding/identities', { archetypes: sel, primary: primary && sel.includes(primary) ? primary : (sel[0] ?? null) })); if (r) { apply(r.state); next(); } };
  return (
    <section className="stack-lg" aria-labelledby="page-title">
      <header className="stack-sm"><h1 id="page-title" tabIndex={-1}>Who are you here as?</h1><p className="muted">Choose up to four. You can add more or remove any later; it never affects your account.</p></header>
      <div className="arch-grid">{ARCHETYPE_LIST.map((a) => <ArchCard key={a.id} a={a.id} on={sel.includes(a.id)} onClick={() => toggle(a.id)} />)}</div>
      {sel.length > 1 && <fieldset className="stack-sm fieldset"><legend>Which is your main identity?</legend><div className="row-wrap">{sel.map((a) => <Chip key={a} on={(primary ?? sel[0]) === a} onClick={() => setPrimary(a)}>{ARCHETYPE_DEFS[a].icon} {ARCHETYPE_DEFS[a].label}</Chip>)}</div><p className="hint">Your main identity shapes the top of your Home.</p></fieldset>}
      <Button variant="primary" onClick={() => void save()} busy={busy}>{sel.length ? `Continue with ${sel.length}` : 'Continue without choosing'}</Button>
    </section>
  );
}

function Intents({ st, apply, run, busy, next }: P) {
  const [sel, setSel] = useState<string[]>(st.intents);
  const save = async () => { const r = await run(() => api.put<{ state: OnboardingState }>('/api/onboarding/intents', { intents: sel })); if (r) { apply(r.state); next(); } };
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}>What brings you here?</h1><p className="muted">Pick anything that sounds right. “Work out what to do next” is a perfectly good answer.</p></header>
      <div className="row-wrap">{INTENTS.map((x) => <Chip key={x.key} on={sel.includes(x.key)} onClick={() => setSel((s) => (s.includes(x.key) ? s.filter((k) => k !== x.key) : [...s, x.key]))}>{x.label}</Chip>)}</div>
      <Button variant="primary" onClick={() => void save()} busy={busy}>Continue</Button></section>
  );
}

function Suggest({ st, apply, run, busy, next }: P) {
  const [sel, setSel] = useState<Archetype[]>(st.selected);
  const save = async () => { const r = await run(() => api.put<{ state: OnboardingState }>('/api/onboarding/identities', { archetypes: sel, primary: sel[0] ?? null })); if (r) { apply(r.state); next(); } };
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}>Identities that might fit</h1><p className="muted">{st.suggestions.length ? 'These are suggestions based only on what you picked. Nothing is applied until you choose.' : 'Nothing stood out yet, and that’s fine. You can pick any identity below, or none.'}</p></header>
      {st.suggestions.length > 0 && <div className="arch-grid">{st.suggestions.map((s) => <ArchCard key={s.archetype} a={s.archetype} on={sel.includes(s.archetype)} note={`Because you chose: ${s.because.join(', ')}`} onClick={() => setSel((x) => (x.includes(s.archetype) ? x.filter((a) => a !== s.archetype) : x.length < 4 ? [...x, s.archetype] : x))} />)}</div>}
      <details className="more"><summary>See all identities</summary><div className="arch-grid">{ARCHETYPE_LIST.filter((a) => !st.suggestions.some((s) => s.archetype === a.id)).map((a) => <ArchCard key={a.id} a={a.id} on={sel.includes(a.id)} onClick={() => setSel((x) => (x.includes(a.id) ? x.filter((k) => k !== a.id) : x.length < 4 ? [...x, a.id] : x))} />)}</div></details>
      <Button variant="primary" onClick={() => void save()} busy={busy}>{sel.length ? `Continue with ${sel.length}` : 'Continue without an identity'}</Button></section>
  );
}

function IdentityQuestions({ arch, quick, st, apply, run, busy, next }: P & { arch: Archetype; quick: boolean }) {
  const d = ARCHETYPE_DEFS[arch]; const [a, setA] = useState<Answers>((st.answers[arch] as Answers) ?? {}); const [headline, setHeadline] = useState('');
  const qs = useMemo(() => { const v = visibleQuestions(d, a); return quick ? v.slice(0, 2) : v; }, [d, a, quick]);
  const set = (id: string, v: string | string[]) => setA((x) => ({ ...x, [id]: v }));
  const save = async () => { const r = await run(() => api.put<{ state: OnboardingState }>(`/api/onboarding/identities/${arch}/answers`, { answers: a, headline: headline.trim() || undefined })); if (r) { apply(r.state); next(); } };
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}><span aria-hidden="true">{d.icon}</span> About you as a {d.label.toLowerCase()}</h1><p className="muted">{d.blurb} {quick ? 'Just a couple of quick questions.' : 'Every question is optional.'}</p></header>
      {qs.map((q) => (
        <fieldset key={q.id} className="stack-sm fieldset"><legend>{q.prompt}</legend>
          {q.help && <p className="hint">{q.help}</p>}
          {q.type === 'text' ? <TextField label={q.prompt} value={(a[q.id] as string) ?? ''} maxLength={300} onChange={(e) => set(q.id, e.target.value)} /> : (
            <div className="row-wrap">{(q.options ?? []).map((o) => {
              const cur = a[q.id]; const on = Array.isArray(cur) ? cur.includes(o.key) : cur === o.key;
              return <Chip key={o.key} on={on} onClick={() => { if (q.type === 'single') set(q.id, on ? [] as string[] : o.key); else { const arr = Array.isArray(cur) ? cur : cur ? [cur] : []; set(q.id, on ? arr.filter((x) => x !== o.key) : arr.length >= (q.max ?? 12) ? arr : [...arr, o.key]); } }}>{o.label}</Chip>;
            })}</div>)}
          {q.type === 'multi' && q.max && <p className="hint">Pick up to {q.max}.</p>}
        </fieldset>
      ))}
      {!quick && <TextField label="A one-line headline for this identity" optional hint="Shown on your profile only if you choose to show this identity." value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} />}
      <Button variant="primary" onClick={() => void save()} busy={busy}>Save and continue</Button></section>
  );
}

function Interests({ run, busy, next, suggested }: P & { suggested: string[] }) {
  const cat = useResource(() => api.get<InterestCatalogResponse>('/api/catalog/interests'), []);
  const [picked, setPicked] = useState<Record<string, { key: string; label: string; category: string | null; isCustom: boolean }>>({}); const [q, setQ] = useState(''); const [cc, setCc] = useState('all'); const [custom, setCustom] = useState(''); const [pub, setPub] = useState(false);
  const limit = PERSONALIZATION_LIMITS.perKind;
  if (cat.error) return <ErrorState error={cat.error} onRetry={cat.reload} />;
  if (!cat.data) return <Loading rows={2} />;
  const list = cat.data.interests.filter((x) => (cc === 'all' || x.category === cc) && (!q || x.label.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  const toggle = (k: string, label: string, category: string | null, isCustom = false) => setPicked((p) => { const n = { ...p }; if (n[k]) delete n[k]; else if (Object.keys(n).length < limit) n[k] = { key: k, label, category, isCustom }; return n; });
  const sug = cat.data.interests.filter((x) => suggested.some((s) => x.key.includes(s) || s.includes(x.key))).slice(0, 8);
  const save = async () => {
    const items = Object.values(picked); if (!items.length) return next();
    const r = await run(async () => { await api.put('/api/personalization', { kind: 'interest', items: items.map((x) => ({ key: x.isCustom ? undefined : x.key, label: x.label, category: x.category, isCustom: x.isCustom })) }); await api.patch('/api/privacy', { field_visibility: { interests: pub ? 'members' : 'only_me' } }); return true; });
    if (r) next();
  };
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}>What are you into?</h1><p className="muted">Pick interests to help Explore explain why things match you. Up to {limit}.</p></header>
      {sug.length > 0 && <div className="stack-sm"><h2 className="h-sm">Suggested from your identities</h2><div className="row-wrap">{sug.map((x) => <Chip key={x.key} on={!!picked[x.key]} onClick={() => toggle(x.key, x.label, x.category)}>{x.label}</Chip>)}</div></div>}
      <div className="row-wrap"><div style={{ flex: '1 1 220px' }}><TextField label="Search interests" value={q} onChange={(e) => setQ(e.target.value)} /></div><div><label className="sr-only" htmlFor="cc">Category</label><select id="cc" className="select" value={cc} onChange={(e) => setCc(e.target.value)} style={{ minWidth: 180 }}><option value="all">All categories</option>{cat.data.categories.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}</select></div></div>
      <div className="row-wrap" aria-label="Interest options">{list.map((x) => <Chip key={x.key} on={!!picked[x.key]} onClick={() => toggle(x.key, x.label, x.category)}>{x.label}</Chip>)}{!list.length && <p className="muted">No matches. Add your own below.</p>}</div>
      <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); const l = custom.trim(); if (l) { toggle(`custom-${slugify(l)}`, l, null, true); setCustom(''); } }}><div style={{ flex: '1 1 220px' }}><TextField label="Add your own" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={PERSONALIZATION_LIMITS.customLabelMax} /></div><Button type="submit">Add</Button></form>
      {Object.keys(picked).length > 0 && <div className="stack-sm"><h2 className="h-sm">Your picks ({Object.keys(picked).length}/{limit})</h2><div className="row-wrap">{Object.values(picked).map((x) => <Chip key={x.key} on onClick={() => toggle(x.key, x.label, x.category, x.isCustom)}>{x.label} ✕</Chip>)}</div></div>}
      <Switch label="Show my interests on my profile to members" hint={pub ? 'Members can see them.' : 'Private: only you see your interests. You can change this any time in Privacy.'} checked={pub} onChange={setPub} />
      <Button variant="primary" onClick={() => void save()} busy={busy}>{Object.keys(picked).length ? 'Save interests' : 'Continue'}</Button></section>
  );
}

function ProfileStep({ run, busy, next }: P) {
  const res = useResource(() => api.get<{ profile: { displayName: string; handle: string; bio: string | null } }>('/api/profile'), []);
  const [f, setF] = useState<{ displayName: string; handle: string; bio: string } | null>(null);
  const [chk, setChk] = useState<{ available: boolean; reason: string } | null>(null); const [fe, setFe] = useState<Record<string, string>>({});
  useEffect(() => { if (res.data && !f) setF({ displayName: res.data.profile.displayName, handle: res.data.profile.handle ?? '', bio: res.data.profile.bio ?? '' }); }, [res.data, f]);
  // debounced availability check as the person types
  useEffect(() => {
    if (!f || !f.handle || f.handle === res.data?.profile.handle) { setChk(f?.handle ? { available: true, reason: 'This is your current handle.' } : null); return; }
    const t = window.setTimeout(() => { api.get<{ available: boolean; reason: string }>(`/api/handles/check?handle=${encodeURIComponent(f.handle)}`).then(setChk).catch(() => setChk(null)); }, 400);
    return () => clearTimeout(t);
  }, [f?.handle, res.data?.profile.handle]);
  if (!f) return <Loading rows={2} />;
  const save = async () => {
    const errs: Record<string, string> = {}; if (f.displayName.trim().length < 2) errs.displayName = 'Use at least 2 characters.'; if (chk && !chk.available) errs.handle = chk.reason; setFe(errs); if (Object.keys(errs).length) return;
    const r = await run(() => api.patch('/api/profile', { displayName: f.displayName, handle: f.handle.toLowerCase(), bio: f.bio || null })); if (r) next();
  };
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}>What should we call you?</h1><p className="muted">Your display name and handle are how people find you. Your photo, avatar and the rest of your profile can wait: you can finish them any time from your profile.</p></header>
      <TextField label="Display name" value={f.displayName} maxLength={60} autoComplete="nickname" onChange={(e) => setF({ ...f, displayName: e.target.value })} error={fe.displayName} />
      <TextField label="Handle" value={f.handle} maxLength={24} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setF({ ...f, handle: e.target.value.replace(/^@/, '') })} error={fe.handle} hint={chk ? <span role="status" data-ok={chk.available}>{chk.available ? '✓ ' : '✗ '}{chk.reason}</span> : '3–24 letters, numbers, dots or underscores.'} />
      <TextField label="A line about you" optional value={f.bio} maxLength={500} onChange={(e) => setF({ ...f, bio: e.target.value })} hint="Optional. Shown on your profile, never required." />
      <div className="row-wrap"><Button variant="primary" onClick={() => void save()} busy={busy}>Continue</Button><Button variant="ghost" onClick={next}>Skip for now</Button></div></section>
  );
}
function PrivacyStep({ run, busy, next }: P) {
  const [p, setP] = useState<'open' | 'balanced' | 'private'>('balanced');
  const save = async () => { const r = await run(() => api.post('/api/privacy/preset', { preset: p })); if (r) next(); };
  const OPTS: { k: 'open' | 'balanced' | 'private'; t: string }[] = [{ k: 'open', t: 'Open' }, { k: 'balanced', t: 'Balanced (recommended)' }, { k: 'private', t: 'Private' }];
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}>How visible do you want to be?</h1><p className="muted">A starting point. You can fine-tune every field and feature in Settings → Privacy.</p></header>
      <div className="stack" role="radiogroup" aria-label="Privacy preset">{OPTS.map((o) => <label key={o.k} className={`radio-card ${p === o.k ? 'on' : ''}`}><input type="radio" name="preset" checked={p === o.k} onChange={() => setP(o.k)} /><span><strong>{o.t}</strong><span className="muted" style={{ display: 'block' }}>{PRESET_HELP[o.k]}</span></span></label>)}</div>
      <Button variant="primary" onClick={() => void save()} busy={busy}>Save and continue</Button></section>
  );
}

function Finish({ st, onDone, busy }: { st: OnboardingState; onDone: () => void; busy: boolean }) {
  return (
    <section className="stack-lg"><header className="stack-sm"><h1 id="page-title" tabIndex={-1}>You’re set</h1><p className="muted">{st.selected.length ? `Your home is tuned for: ${st.selected.map((a) => ARCHETYPE_DEFS[a].label).join(', ')}.` : 'You’re starting with a general home. Add identities any time.'}</p></header>
      <ul className="principles"><li><Icon name="check" size={18} /><span>Nothing here is public unless you chose it.</span></li><li><Icon name="check" size={18} /><span>Everything you entered can be changed in Settings and Identities.</span></li><li><Icon name="check" size={18} /><span>Demo members and listings are labelled “Demo”.</span></li></ul>
      <Button variant="primary" onClick={onDone} busy={busy}>Go to Home</Button></section>
  );
}
