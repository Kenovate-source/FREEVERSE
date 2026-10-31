import { useState } from 'react';
import { api } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { Async, Badge, Button, Card, Chip, Confirm, DemoBadge, EmptyState, Notice, PageHead, SelectField, Switch, TextArea, TextField, errMsg, fieldErrors, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { useSession } from '../state/session';
import { Widget } from './social';
import { ARCHETYPE_DEFS, ARCHETYPE_LIST, visibleQuestions, type EntryKind } from '../../shared/archetypes';
import { AUDIENCE_LABEL, type Archetype, type Audience } from '../../shared/constants';
import { AVATAR_EXTRAS, AVATAR_EYES, AVATAR_MOUTHS, AVATAR_PALETTES, AVATAR_SHAPES, COVER_PRESETS, type AvatarConfig } from '../../shared/avatar';
import { GENDER_OPTIONS, type MyProfile } from '../../shared/api/profile';
import type { AchievementView, EntryView, IdentityView, SpaceView, SuggestionView } from '../../shared/api/identity';
import type { MediaItem } from '../../shared/api/media';

type P = { params: Record<string, string>; query: URLSearchParams };
const AUDS: Audience[] = ['everyone', 'members', 'connections', 'only_me'];
const ENTRY_LABEL: Record<EntryKind, string> = { project: 'Project', publication: 'Publication', achievement: 'Achievement', credential: 'Credential', experience: 'Experience', skill: 'Skill', showcase: 'Showcase', contribution: 'Contribution', mentoring: 'Mentoring', venture: 'Venture', research_output: 'Research output', game_highlight: 'Game highlight' };
const EVID: Record<string, string> = { self_declared: 'Self-declared', platform_recorded: 'Recorded on FREEVERSE', verified: 'Verified' };

// ───────── Identities ─────────
export function IdentitiesPage(_: P) {
  const { say } = useToast(); const res = useResource(() => api.get<{ items: IdentityView[] }>('/api/identities'), []); const [add, setAdd] = useState(false); const [rm, setRm] = useState<IdentityView | null>(null); const [edit, setEdit] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) say(ok); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <div className="stack-lg"><PageHead title="Your identities" actions={<Button variant="primary" onClick={() => setAdd(!add)}><Icon name="plus" size={16} /> Add an identity</Button>}>One account, several sides of you. Add, pause or remove identities any time. Your account and everything you made stay.</PageHead>
    <Notice>Identities are self-declared. Nothing here says a school, employer or other body has confirmed it.</Notice>
    {add && <AddIdentity existing={res.data?.items.filter((i) => i.status !== 'removed').map((i) => i.archetype) ?? []} onDone={() => { setAdd(false); res.reload(); }} />}
    <Async res={res} empty={(d) => (d.items.filter((i) => i.status !== 'removed').length ? null : <EmptyState icon="layers" title="No identities yet">Add one to shape your home and profile.</EmptyState>)}>{(d) => <div className="grid-cards">{d.items.filter((i) => i.status !== 'removed').map((i) => { const def = ARCHETYPE_DEFS[i.archetype]; return (
      <Card as="article" key={i.id}><div className="spread"><h2 className="h-sm"><span aria-hidden="true">{def.icon}</span> {def.label}</h2><div className="row-wrap">{i.isPrimary && <Badge tone="cyan">Primary</Badge>}{i.status === 'paused' && <Badge>Paused</Badge>}</div></div>
        <p className="muted">{i.headline ?? def.tagline}</p><p className="faint">Shown on your profile to: {AUDIENCE_LABEL[i.visibility]}</p>
        <div className="row-wrap"><Link className="btn btn-secondary btn-sm" to={`/spaces/${i.archetype}`}>Open space</Link><Button size="sm" variant="ghost" onClick={() => setEdit(edit === i.id ? null : i.id)}>Edit</Button>
          {!i.isPrimary && i.status === 'active' && <Button size="sm" variant="ghost" onClick={() => void act(() => api.patch(`/api/identities/${i.id}`, { primary: true }), 'Primary identity changed')}>Make primary</Button>}
          <Button size="sm" variant="ghost" onClick={() => void act(() => api.patch(`/api/identities/${i.id}`, { status: i.status === 'active' ? 'paused' : 'active' }), i.status === 'active' ? 'Paused' : 'Active again')}>{i.status === 'active' ? 'Pause' : 'Resume'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setRm(i)}>Remove</Button></div>
        {edit === i.id && <EditIdentity i={i} onDone={() => { setEdit(null); res.reload(); }} />}</Card>); })}</div>}</Async>
    <Confirm open={!!rm} danger title="Remove this identity?" confirmLabel="Remove" onConfirm={async () => { const r = await api.del<{ note: string }>(`/api/identities/${rm!.id}`); say(r.note); res.reload(); }} onClose={() => setRm(null)}>It disappears from your home and profile. Your account, posts and profile entries stay. You can add it again later.</Confirm></div>;
}
function AddIdentity({ existing, onDone }: { existing: Archetype[]; onDone: () => void }) {
  const { say } = useToast(); const [busy, setBusy] = useState<string | null>(null);
  return <Card className="stack-sm"><h2 className="h-sm">Choose an identity</h2><div className="arch-grid">{ARCHETYPE_LIST.filter((a) => !existing.includes(a.id)).map((a) => <button key={a.id} type="button" className="card arch" disabled={!!busy} onClick={async () => { setBusy(a.id); try { await api.post('/api/identities', { archetype: a.id }); say(`${a.label} added`); onDone(); } catch (e) { say(errMsg(e), 'error'); setBusy(null); } }}><span className="arch-ico" aria-hidden="true">{a.icon}</span><strong>{a.label}</strong><span className="muted">{a.tagline}</span></button>)}</div></Card>;
}
function EditIdentity({ i, onDone }: { i: IdentityView; onDone: () => void }) {
  const { say } = useToast(); const def = ARCHETYPE_DEFS[i.archetype]; const [headline, setHeadline] = useState(i.headline ?? ''); const [vis, setVis] = useState<Audience>(i.visibility); const [ans, setAns] = useState<Record<string, unknown>>(i.answers);
  const qs = visibleQuestions(def, ans);
  const save = async () => { try { await api.patch(`/api/identities/${i.id}`, { headline: headline || null, visibility: vis, answers: ans }); say('Saved'); onDone(); } catch (e) { say(errMsg(e), 'error'); } };
  return <div className="stack-sm"><TextField label="Headline" optional value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)} />
    <SelectField label="Who sees this identity on your profile" value={vis} onChange={(e) => setVis(e.target.value as Audience)}>{AUDS.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField>
    <p className="faint">Answers below are private. They only shape your suggestions and space.</p>
    {qs.map((q) => q.type === 'text' ? <TextField key={q.id} label={q.prompt} optional value={String(ans[q.id] ?? '')} maxLength={400} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} />
      : <fieldset key={q.id} className="fieldset"><legend>{q.prompt}</legend><div className="row-wrap">{q.options?.map((o) => { const cur = ans[q.id]; const on = Array.isArray(cur) ? cur.includes(o.key) : cur === o.key; return <Chip key={o.key} on={on} onClick={() => setAns({ ...ans, [q.id]: q.type === 'multi' ? (on ? (cur as string[]).filter((x) => x !== o.key) : [...((cur as string[]) ?? []), o.key].slice(0, q.max ?? 6)) : on ? undefined : o.key })}>{o.label}</Chip>; })}</div></fieldset>)}
    <div className="row-wrap"><Button size="sm" variant="primary" onClick={() => void save()}>Save</Button><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div></div>;
}

// ───────── Identity space ─────────
export function SpacePage({ params }: P) {
  const res = useResource(() => api.get<{ space: SpaceView }>(`/api/spaces/${params.archetype}`), [params.archetype]);
  return <Async res={res}>{({ space: s }) => <div className="stack-lg" style={{ ['--accent' as string]: s.accent }}>
    <PageHead title={`${s.icon} ${s.label} space`} back={{ to: '/identities', label: 'Identities' }}>{s.tagline}</PageHead>
    <nav aria-label={`${s.label} space`} className="row-wrap">{s.nav.map((n) => <Link key={n.id} to={n.href} className="chip chip-link">{n.label}</Link>)}</nav>
    <div className="grid-cards">{s.widgets.map((w) => <Widget key={w.id} w={w} />)}</div>
    <section className="stack" aria-labelledby="tools"><h2 id="tools">Tools</h2><div className="grid-cards">{s.tools.map((t) => <Card as="article" key={t.id}><div className="spread"><h3 className="h-sm">{t.label}</h3><Badge tone={t.status === 'available' ? 'ok' : undefined}>{t.status === 'available' ? 'Available' : 'Planned'}</Badge></div><p className="muted">{t.description}</p>{t.href ? <Link to={t.href} className="btn btn-secondary btn-sm">Open</Link> : <Link to={`/soon/${t.id}`} className="btn btn-ghost btn-sm">See what’s planned</Link>}</Card>)}</div></section>
    <section className="stack" aria-labelledby="secs"><h2 id="secs">Your {s.label.toLowerCase()} profile</h2>{s.sections.map((sec) => <Card key={sec.kind}><h3 className="h-sm">{sec.label}</h3>{sec.entries.length === 0 ? <p className="muted">{sec.prompt}</p> : <ul className="plain stack-sm">{sec.entries.map((e) => <li key={e.id}><strong>{e.title}</strong> <Badge>{EVID[e.evidence]}</Badge></li>)}</ul>}</Card>)}<Link to="/me/profile#entries" className="btn btn-secondary" style={{ justifySelf: 'start' }}>Add or edit entries</Link></section>
    <section className="stack" aria-labelledby="ach"><h2 id="ach">Milestones</h2><ul className="plain stack-sm">{s.achievements.map((a) => <li key={a.id} className="card"><strong>{a.label}</strong> {a.earned && <Badge tone="ok">Earned</Badge>}<div className="muted">{a.description}</div><div className="progress" role="progressbar" aria-label={a.label} aria-valuenow={Math.min(a.progress, a.target)} aria-valuemin={0} aria-valuemax={a.target}><span style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%` }} /></div></li>)}</ul><p className="faint">Milestones come from things you actually did on FREEVERSE. They’re private to you.</p></section></div>}</Async>;
}

// ───────── Profile editor ─────────
async function uploadImage(file: File, purpose: 'avatar' | 'cover' | 'showcase') { const r = await api.upload<{ media: MediaItem }>(`/api/media?purpose=${purpose}`, file); return r.media; }

export function ProfileEditPage(_: P) {
  const { say } = useToast(); const { refresh } = useSession() as unknown as { refresh?: () => void };
  const res = useResource(() => api.get<{ profile: MyProfile }>('/api/profile'), []);
  return <div className="stack-lg"><PageHead title="Your profile">Everything here is yours to change. Who sees each part is controlled in <Link to="/settings/privacy">Privacy & visibility</Link>.</PageHead>
    <Async res={res}>{({ profile: p }) => <>
      <BasicsForm p={p} onSaved={() => { res.reload(); refresh?.(); }} />
      <AvatarBuilder p={p} onSaved={() => { res.reload(); refresh?.(); }} />
      <CoverPicker p={p} onSaved={res.reload} />
      <TagsEditor />
      <Suggestions /><Entries /><Achievements /></>}</Async></div>;
}
function BasicsForm({ p, onSaved }: { p: MyProfile; onSaved: () => void }) {
  const { say } = useToast(); const [f, setF] = useState({ displayName: p.displayName, handle: p.handle, headline: p.headline ?? '', bio: p.bio ?? '', pronouns: p.pronouns ?? '', gender: p.gender ?? '', genderSelfDescription: p.genderSelfDescription ?? '' }); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setErrs({}); try { await api.patch('/api/profile', { displayName: f.displayName, handle: f.handle, headline: f.headline || null, bio: f.bio || null, pronouns: f.pronouns || null, gender: f.gender || null, genderSelfDescription: f.gender === 'self_described' ? f.genderSelfDescription || null : null }); say('Profile saved'); onSaved(); } catch (e) { setErrs(fieldErrors(e)); say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return <Card className="stack-sm" aria-labelledby="basics"><h2 id="basics" className="h-sm">The basics</h2><div className="grid-2"><TextField label="Display name" value={f.displayName} onChange={set('displayName')} error={errs.displayName} maxLength={60} /><TextField label="Handle" value={f.handle} onChange={set('handle')} error={errs.handle} hint="Letters, numbers and underscores" maxLength={30} /></div>
    <TextField label="Headline" optional value={f.headline} onChange={set('headline')} maxLength={120} /><TextArea label="Bio" optional value={f.bio} onChange={set('bio')} maxLength={500} rows={4} />
    <div className="grid-2"><TextField label="Pronouns" optional value={f.pronouns} onChange={set('pronouns')} maxLength={30} /><SelectField label="Gender" optional value={f.gender} onChange={set('gender')}><option value="">Not set</option>{GENDER_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</SelectField></div>
    {f.gender === 'self_described' && <TextField label="In your own words" value={f.genderSelfDescription} onChange={set('genderSelfDescription')} maxLength={40} />}
    <Button variant="primary" busy={busy} onClick={() => void save()} style={{ justifySelf: 'start' }}>Save</Button></Card>;
}
function AvatarBuilder({ p, onSaved }: { p: MyProfile; onSaved: () => void }) {
  const { say } = useToast(); const [cfg, setCfg] = useState<AvatarConfig>(p.avatar.config); const [mode, setMode] = useState(p.avatar.mode); const [photo, setPhoto] = useState<{ id: string | null; url: string | null }>({ id: p.avatar.photoMediaId, url: p.avatar.photoUrl }); const [busy, setBusy] = useState(false);
  const opt = <K extends keyof AvatarConfig>(k: K, list: readonly string[], label: string) => <SelectField label={label} value={String(cfg[k] ?? list[0])} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value } as AvatarConfig)}>{list.map((x) => <option key={x} value={x}>{x}</option>)}</SelectField>;
  const save = async () => { setBusy(true); try { await api.put('/api/profile/avatar', { mode, config: cfg, photoMediaId: mode === 'avatar' ? undefined : photo.id }); say('Avatar saved'); onSaved(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <Card className="stack-sm" aria-labelledby="av"><h2 id="av" className="h-sm">Avatar</h2><p className="muted">Build one, or upload a photo. Everyone starts with a unique avatar, so you never need a photo.</p>
    <div className="row"><Avatar avatar={{ mode, config: cfg as Record<string, unknown>, photoUrl: photo.url }} size={96} name={p.displayName} /><div className="row-wrap" role="group" aria-label="Avatar type">{(['avatar', 'photo', 'both'] as const).map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)} disabled={m !== 'avatar' && !photo.id}>{m === 'avatar' ? 'Built avatar' : m === 'photo' ? 'Photo' : 'Photo with avatar'}</Chip>)}</div></div>
    <fieldset className="fieldset"><legend>Colours</legend><div className="row-wrap">{AVATAR_PALETTES.map((pl) => <button key={pl.id} type="button" className="swatch" aria-label={pl.id} aria-pressed={cfg.palette === pl.id} style={{ background: `linear-gradient(135deg, ${pl.a}, ${pl.b})` }} onClick={() => setCfg({ ...cfg, palette: pl.id })} />)}</div></fieldset>
    <div className="grid-3">{opt('shape', AVATAR_SHAPES, 'Shape')}{opt('eyes', AVATAR_EYES, 'Eyes')}{opt('mouth', AVATAR_MOUTHS, 'Mouth')}{opt('extra', AVATAR_EXTRAS, 'Extra')}</div>
    <div className="row-wrap"><label className="btn btn-secondary btn-sm"><Icon name="image" size={16} /> Upload a photo<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const m = await uploadImage(f, 'avatar'); setPhoto({ id: m.id, url: m.url }); setMode('photo'); } catch (er) { say(errMsg(er), 'error'); } }} /></label>
      <Button size="sm" variant="ghost" onClick={() => setCfg({ seed: String(Math.random()) } as AvatarConfig)}>Surprise me</Button></div>
    <Button variant="primary" busy={busy} onClick={() => void save()} style={{ justifySelf: 'start' }}>Save avatar</Button></Card>;
}
function CoverPicker({ p, onSaved }: { p: MyProfile; onSaved: () => void }) {
  const { say } = useToast(); const put = async (b: object) => { try { await api.put('/api/profile/cover', b); say('Cover saved'); onSaved(); } catch (e) { say(errMsg(e), 'error'); } };
  return <Card className="stack-sm" aria-labelledby="cv"><h2 id="cv" className="h-sm">Cover</h2><div className="row-wrap" role="group" aria-label="Cover presets">{COVER_PRESETS.map((c) => <button key={c.id} type="button" className="swatch swatch-wide" aria-label={c.label} aria-pressed={p.cover.mode === 'preset' && p.cover.presetId === c.id} style={{ background: `linear-gradient(135deg, ${c.a}, ${c.b})` }} onClick={() => void put({ mode: 'preset', presetId: c.id })} />)}</div>
    <label className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}><Icon name="image" size={16} /> Upload a cover image<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const m = await uploadImage(f, 'cover'); await put({ mode: 'image', mediaId: m.id }); } catch (er) { say(errMsg(er), 'error'); } }} /></label></Card>;
}
function TagsEditor() {
  const { say } = useToast(); const cat = useResource(() => api.get<{ categories: { id: string; label: string }[]; interests: { key: string; label: string; category: string }[]; limits: { perKind: number } }>('/api/catalog/interests'), []); const mine = useResource(() => api.get<{ personalization: Record<string, { key: string; label: string; category: string | null; isCustom: boolean }[]> }>('/api/personalization'), []);
  const [q, setQ] = useState(''); const [custom, setCustom] = useState(''); const [sel, setSel] = useState<{ key?: string; label: string; category?: string | null; isCustom?: boolean }[] | null>(null);
  const cur = sel ?? mine.data?.personalization.interest ?? []; const has = (k: string) => cur.some((x) => x.key === k);
  const save = async () => { try { await api.put('/api/personalization', { kind: 'interest', items: cur.map((c) => ({ key: c.key, label: c.label, category: c.category ?? null, isCustom: c.isCustom })) }); say('Interests saved'); setSel(null); mine.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <Card className="stack-sm" aria-labelledby="int"><h2 id="int" className="h-sm">Interests</h2><p className="muted">Used for suggestions. Whether others see them is up to you in Privacy.</p>
    <Async res={cat}>{(c) => <><TextField label="Search interests" value={q} onChange={(e) => setQ(e.target.value)} /><div className="row-wrap chip-cloud">{c.interests.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((i) => <Chip key={i.key} on={has(i.key)} onClick={() => setSel(has(i.key) ? cur.filter((x) => x.key !== i.key) : [...cur, { key: i.key, label: i.label, category: i.category }].slice(0, c.limits.perKind))}>{i.label}</Chip>)}</div>
      <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { setSel([...cur, { label: custom.trim(), isCustom: true }]); setCustom(''); } }}><TextField label="Add your own" value={custom} maxLength={60} onChange={(e) => setCustom(e.target.value)} /><Button size="sm" type="submit">Add</Button></form>
      <p className="faint">{cur.length} selected: {cur.map((x) => x.label).join(', ') || 'none'}</p><Button variant="primary" disabled={!sel} onClick={() => void save()} style={{ justifySelf: 'start' }}>Save interests</Button></>}</Async></Card>;
}
function Suggestions() {
  const { say } = useToast(); const res = useResource(() => api.get<{ items: SuggestionView[] }>('/api/me/suggestions'), []);
  return <Card className="stack-sm" aria-labelledby="sg"><div className="spread"><h2 id="sg" className="h-sm">Suggested for your profile</h2><Button size="sm" onClick={async () => { await api.post('/api/me/suggestions/refresh'); res.reload(); }}>Check again</Button></div><p className="muted">Based only on things you did on FREEVERSE. Nothing is added unless you accept it, and accepted items start private.</p>
    <Async res={res} empty={(d) => (d.items.length ? null : <p className="muted">No suggestions right now.</p>)}>{(d) => <ul className="plain stack-sm">{d.items.map((s) => <li key={s.id} className="card stack-sm"><strong>{s.draft.title}</strong><div className="muted">{s.reason}</div><div className="row-wrap"><Button size="sm" variant="primary" onClick={async () => { try { await api.post(`/api/me/suggestions/${s.id}/accept`, {}); say('Added, visible only to you'); res.reload(); } catch (e) { say(errMsg(e), 'error'); } }}>Add (only me)</Button><Button size="sm" variant="ghost" onClick={async () => { await api.post(`/api/me/suggestions/${s.id}/dismiss`); res.reload(); }}>Dismiss</Button></div></li>)}</ul>}</Async></Card>;
}
function Entries() {
  const { say } = useToast(); const res = useResource(() => api.get<{ items: EntryView[] }>('/api/me/entries'), []); const [f, setF] = useState<{ id?: string; kind: EntryKind; title: string; description: string; link: string; visibility: Audience } | null>(null); const [del, setDel] = useState<EntryView | null>(null);
  const save = async () => { if (!f) return; const b = { kind: f.kind, title: f.title, description: f.description || null, link: f.link || null, visibility: f.visibility }; try { if (f.id) await api.patch(`/api/me/entries/${f.id}`, b); else await api.post('/api/me/entries', b); setF(null); res.reload(); say('Saved'); } catch (e) { say(errMsg(e), 'error'); } };
  return <Card className="stack-sm" id="entries" aria-labelledby="en"><div className="spread"><h2 id="en" className="h-sm">Projects, skills and highlights</h2><Button size="sm" variant="primary" onClick={() => setF({ kind: 'project', title: '', description: '', link: '', visibility: 'only_me' })}>Add</Button></div>
    <p className="muted">Entries you add are labelled “Self-declared”. Only things recorded on FREEVERSE get a different label.</p>
    {f && <div className="stack-sm card"><SelectField label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as EntryKind })}>{(Object.keys(ENTRY_LABEL) as EntryKind[]).map((k) => <option key={k} value={k}>{ENTRY_LABEL[k]}</option>)}</SelectField><TextField label="Title" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /><TextArea label="Description" optional value={f.description} maxLength={1000} onChange={(e) => setF({ ...f, description: e.target.value })} /><TextField label="Link" optional type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /><SelectField label="Who can see this" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Audience })}>{AUDS.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField><div className="row-wrap"><Button size="sm" variant="primary" disabled={!f.title.trim()} onClick={() => void save()}>Save</Button><Button size="sm" variant="ghost" onClick={() => setF(null)}>Cancel</Button></div></div>}
    <Async res={res} empty={(d) => (d.items.length || f ? null : <p className="muted">Nothing yet.</p>)}>{(d) => <ul className="plain stack-sm">{d.items.map((e) => <li key={e.id} className="card spread"><div><strong>{e.title}</strong> <Badge>{ENTRY_LABEL[e.kind]}</Badge> <Badge tone={e.evidence === 'self_declared' ? undefined : 'ok'}>{EVID[e.evidence]}</Badge><div className="faint">Visible to: {AUDIENCE_LABEL[e.visibility]}</div></div><div className="row-wrap"><Button size="sm" variant="ghost" onClick={() => setF({ id: e.id, kind: e.kind, title: e.title, description: e.description ?? '', link: e.link ?? '', visibility: e.visibility })}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDel(e)}>Delete</Button></div></li>)}</ul>}</Async>
    <Confirm open={!!del} danger title="Delete this entry?" confirmLabel="Delete" onConfirm={async () => { await api.del(`/api/me/entries/${del!.id}`); res.reload(); }} onClose={() => setDel(null)}>This removes it from your profile.</Confirm></Card>;
}
function Achievements() {
  const { say } = useToast();
  const res = useResource(() => api.get<{ items: AchievementView[] }>('/api/me/achievements'), []);
  return <Card className="stack-sm" aria-labelledby="ac"><h2 id="ac" className="h-sm">Milestones</h2><Async res={res}>{(d) => d.items.length === 0 ? <p className="muted">Add an identity to see milestones.</p> : <ul className="plain stack-sm">{d.items.map((a) => <li key={a.id}><strong>{a.label}</strong> {a.earned ? <Badge tone="ok">Earned</Badge> : <span className="faint">{a.progress}/{a.target}</span>} <span className="faint">Recorded by FREEVERSE</span><div className="muted">{a.description}</div>{a.earned && <Switch label="Show on my profile" checked={!!a.public} onChange={async (v) => { try { await api.put(`/api/me/achievements/${encodeURIComponent(a.id)}/display`, { public: v }); res.reload(); } catch (e) { say(errMsg(e), 'error'); } }} hint={a.public ? 'Others who can open your profile can see this. Hiding it keeps your record.' : 'Private to you.'} />}</li>)}</ul>}</Async></Card>;
}
export { navigate, DemoBadge };
