import { useMotion } from '../motion/react';
import { useState } from 'react';
import { api } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Avatar } from '../ui/Avatar';
import { Async, Badge, Button, Card, Confirm, EmptyState, Notice, PageHead, SelectField, Switch, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { useSession } from '../state/session';
import { useStepUp } from '../state/stepup';
import { applyA11y } from '../state/a11y';
import { AUDIENCE_LABEL, type Audience } from '../../shared/constants';
import { FIELD_LABEL, PRESET_HELP, PROFILE_FIELDS, type ProfileField } from '../../shared/privacy';
import type { PrivacyView, Settings } from '../../shared/api/settings';
import type { BlockListResponse } from '../../shared/api/social';

type P = { params: Record<string, string>; query: URLSearchParams };
export const SECTIONS = [
  { id: 'account', label: 'Account' }, { id: 'profile', label: 'Profile & personalization' }, { id: 'privacy', label: 'Privacy & visibility' }, { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' }, { id: 'messaging', label: 'Messaging' }, { id: 'accessibility', label: 'Accessibility & appearance' }, { id: 'nova', label: 'Nova & AI data' },
  { id: 'blocked', label: 'Blocked & muted' }, { id: 'data', label: 'Your data & account' }, { id: 'help', label: 'Help & support' },
] as const;

export function SettingsPage({ params }: P) {
  const cur = params.section ?? '';
  const valid = SECTIONS.some((s) => s.id === cur);
  return (
    <div className="stack-lg"><PageHead title="Settings">You’re in control. Each setting says what it does.</PageHead>
      <div className="settings-grid">
        <nav aria-label="Settings sections" className="settings-nav">{SECTIONS.map((s) => <Link key={s.id} to={`/settings/${s.id}`} className={`settings-link${cur === s.id ? ' current' : ''}`} aria-current={cur === s.id ? 'page' : undefined}>{s.label}</Link>)}</nav>
        <div className="stack-lg">{!valid ? <Card><h2 className="h-sm">Choose a section</h2><p className="muted">Everything about your account lives here: privacy, security, notifications, accessibility, AI data and your data.</p><ul className="plain stack-sm">{SECTIONS.map((s) => <li key={s.id}><Link to={`/settings/${s.id}`}>{s.label}</Link></li>)}</ul></Card> : <Section id={cur} />}</div>
      </div>
    </div>
  );
}
function Section({ id }: { id: string }) {
  switch (id) {
    case 'account': return <AccountS />; case 'profile': return <ProfileS />; case 'privacy': return <PrivacyS />; case 'security': return <SecurityS />;
    case 'notifications': return <NotifS />; case 'messaging': return <MsgS />; case 'accessibility': return <A11yS />; case 'nova': return <NovaS />;
    case 'blocked': return <BlockedS />; case 'data': return <DataS />; default: return <HelpS />;
  }
}
const H = ({ children }: { children: string }) => <h2 className="h-lg" tabIndex={-1}>{children}</h2>;

function useSettings() { const res = useResource(() => api.get<{ settings: Settings }>('/api/settings'), []); const { say } = useToast();
  const patch = async (p: object, ok = 'Saved') => { try { await api.patch('/api/settings', p); res.reload(); say(ok); } catch (e) { say(errMsg(e), 'error'); } }; return { res, patch }; }

function AccountS() {
  const { me, config } = useSession();
  return <><H>Account</H><Card className="stack-sm"><dl className="kv"><dt>Email</dt><dd>{me?.email ?? '—'}</dd><dt>Handle</dt><dd>@{me?.handle ?? '—'}</dd><dt>Age check</dt><dd>{me?.eligibility.status === 'attested' ? 'You told us your birth month and year. This is self-declared, not verified.' : 'Not completed'}{me?.eligibility.ageBand ? ` (${me.eligibility.ageBand})` : ''}</dd><dt>Member since</dt><dd>{me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : '—'}</dd></dl>
    <p className="faint">FREEVERSE is for adults aged {config?.eligibility.min ?? 18} and over. We store only your birth month and year, keep it private, and don’t call it verified.</p>
    <div className="row-wrap"><Link to="/me/profile" className="btn btn-secondary btn-sm">Edit profile</Link><Link to="/identities" className="btn btn-secondary btn-sm">Identities</Link><Link to="/settings/data" className="btn btn-ghost btn-sm">Delete or export</Link></div></Card></>;
}
function ProfileS() {
  return <><H>Profile & personalization</H><Card className="stack-sm"><p>Edit your avatar, cover, interests and highlights on your profile page. Interests personalise suggestions; they never decide what you’re shown without telling you why.</p><div className="row-wrap"><Link to="/me/profile" className="btn btn-primary">Open profile editor</Link><Link to="/identities" className="btn btn-secondary">Manage identities</Link><Link to="/settings/privacy" className="btn btn-ghost">Who sees what</Link></div></Card></>;
}
const OPTS: Record<string, { label: string; help?: string; options: { v: string; l: string }[] }> = {
  who_can_message: { label: 'Who can message you', options: [{ v: 'members', l: 'Any member (as a request)' }, { v: 'connections', l: 'Connections only' }, { v: 'nobody', l: 'Nobody' }] },
  who_can_mention: { label: 'Who can mention you', options: [{ v: 'members', l: 'Any member' }, { v: 'connections', l: 'Connections only' }, { v: 'nobody', l: 'Nobody' }] },
  online_status_visibility: { label: 'Who sees when you’re online', options: [{ v: 'members', l: 'Members' }, { v: 'connections', l: 'Connections' }, { v: 'only_me', l: 'Only me' }] },
};
function PrivacyS() {
  const { say } = useToast(); const res = useResource(() => api.get<{ privacy: PrivacyView }>('/api/privacy'), []);
  const patch = async (p: object) => { try { await api.patch('/api/privacy', p); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  const preset = async (p: string) => { try { await api.post('/api/privacy/preset', { preset: p }); res.reload(); say(`${p[0]!.toUpperCase()}${p.slice(1)} preset applied`); } catch (e) { say(errMsg(e), 'error'); } };
  return <><H>Privacy & visibility</H><Async res={res}>{({ privacy: p }) => <>
    <Card className="stack-sm"><h3 className="h-sm">Start from a preset</h3><div className="grid-3">{(['open', 'balanced', 'private'] as const).map((k) => <button key={k} type="button" className="card radio-card" aria-pressed={p.preset === k} onClick={() => void preset(k)}><strong>{k[0]!.toUpperCase() + k.slice(1)}</strong><span className="muted">{PRESET_HELP[k]}</span></button>)}</div>{p.preset === 'custom' && <p className="faint">You’ve customised your settings, so no preset is active.</p>}</Card>
    <Card className="stack-sm"><h3 className="h-sm">Your profile</h3>
      <SelectField label="Who can open your profile" value={p.profile_visibility} onChange={(e) => void patch({ profile_visibility: e.target.value })} hint={p.effects.profile_visibility}>{(['everyone', 'members', 'connections', 'only_me'] as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField>
      <Switch label="Appear in member discovery and search" checked={p.discoverable} onChange={(v) => void patch({ discoverable: v })} hint={p.effects.discoverable} />
      <Switch label="Let others comment on your profile" checked={p.comments_on_profile} onChange={(v) => void patch({ comments_on_profile: v })} hint={p.effects.comments_on_profile} /></Card>
    <Card className="stack-sm"><h3 className="h-sm">Each part of your profile</h3><p className="muted">Sensitive fields can’t be set to Everyone. These are enforced on the server, not just hidden on screen.</p>
      {PROFILE_FIELDS.map((f: ProfileField) => <SelectField key={f} label={FIELD_LABEL[f]} value={p.field_visibility[f] ?? p.fieldAudiences[f][0]} onChange={(e) => void patch({ field_visibility: { [f]: e.target.value } })} hint={p.effects[`field:${f}`]}>{p.fieldAudiences[f].map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField>)}</Card>
    <Card className="stack-sm"><h3 className="h-sm">Contact & activity</h3>{(Object.keys(OPTS) as (keyof typeof OPTS)[]).map((k) => <SelectField key={k} label={OPTS[k]!.label} value={String((p as unknown as Record<string, string>)[k])} onChange={(e) => void patch({ [k]: e.target.value })} hint={p.effects[k]}>{OPTS[k]!.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</SelectField>)}
      <SelectField label="Default audience for new posts" value={p.default_post_visibility} onChange={(e) => void patch({ default_post_visibility: e.target.value })} hint={p.effects.default_post_visibility}>{(['everyone', 'members', 'connections', 'only_me'] as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField></Card>
    <Notice>Anonymous posts show an alias to everyone. We keep an internal record of the author for safety. Moderators can only look it up with a recorded reason and a confirmation, and it’s audited.</Notice></>}</Async></>;
}
function SecurityS() {
  const { say } = useToast(); const { config, signOut } = useSession(); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const dev = config?.auth.kind === 'dev';
  return <><H>Security</H><Card className="stack-sm"><h3 className="h-sm">Sign-in</h3>
    {dev ? <Notice tone="demo" title="Local demo sign-in">This copy uses a local development sign-in so you can try FREEVERSE without external services. Real accounts use managed authentication (Supabase Auth) once it’s configured. Passwords here aren’t for real use.</Notice> : <p className="muted">Your password is handled by our managed sign-in provider. FREEVERSE never stores it.</p>}
    {!dev && <form className="stack-sm" onSubmit={async (e) => { e.preventDefault(); if (pw !== pw2) { say('The passwords don’t match.', 'error'); return; } setBusy(true); try { await api.post('/api/auth/password', { newPassword: pw }); setPw(''); setPw2(''); say('Password changed'); } catch (er) { say(errMsg(er), 'error'); } finally { setBusy(false); } }}><TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters" /><TextField label="Confirm new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /><Button type="submit" variant="primary" busy={busy} disabled={pw.length < 10} style={{ justifySelf: 'start' }}>Change password</Button></form>}</Card>
    <Card className="stack-sm"><h3 className="h-sm">Confirming sensitive actions</h3><p className="muted">Deleting your account or exporting sensitive data asks you to confirm it’s you again.</p><Button onClick={() => void signOut()}>Sign out on this device</Button></Card></>;
}
const NOTIF_LABEL: Record<string, string> = { comments: 'Comments on your posts', replies: 'Replies to your comments', reactions: 'Reactions', follows: 'New followers', mentions: 'Mentions', messages: 'Messages', message_request: 'Message requests', system: 'Safety and account notices', events: 'Event updates' };
function NotifS() {
  const { res, patch } = useSettings();
  return <><H>Notifications</H><Async res={res}>{({ settings: s }) => <Card className="stack-sm"><p className="muted">Choose what appears in your Notifications. Nothing is sent by email or push in this version.</p>{Object.keys(s.notifications).map((k) => <Switch key={k} label={NOTIF_LABEL[k] ?? k} checked={s.notifications[k as keyof typeof s.notifications]} onChange={(v) => void patch({ notifications: { [k]: v } })} />)}<p className="faint">Safety and account notices are always shown if they’re about your account’s safety.</p></Card>}</Async></>;
}
function MsgS() {
  const { res, patch } = useSettings();
  return <><H>Messaging</H><Async res={res}>{({ settings: s }) => <Card className="stack-sm"><Switch label="Read receipts" checked={s.messaging.readReceipts} onChange={(v) => void patch({ messaging: { readReceipts: v } })} hint="When off, others can’t see that you’ve read their messages, and you can’t see theirs." /><Switch label="Allow message requests" checked={s.messaging.allowMessageRequests} onChange={(v) => void patch({ messaging: { allowMessageRequests: v } })} hint="First messages from people you don’t follow go to Requests. Who can message you at all is under Privacy." /></Card>}</Async></>;
}
function MotionNote() { const m = useMotion(); return <p className="faint" role="status">Right now: <strong>{m.mode}</strong> mode. {m.reason}.</p>; }
function A11yS() {
  const { res, patch } = useSettings(); const set = async (p: Partial<Settings['accessibility']>, cur: Settings['accessibility']) => { applyA11y({ ...cur, ...p }); await patch({ accessibility: p }, 'Updated'); };
  return <><H>Accessibility & appearance</H><Async res={res}>{({ settings: { accessibility: a } }) => <Card className="stack-sm"><SelectField label="Text size" value={a.textSize} onChange={(e) => void set({ textSize: e.target.value as Settings['accessibility']['textSize'] }, a)}><option value="sm">Smaller</option><option value="md">Default</option><option value="lg">Larger</option><option value="xl">Largest</option></SelectField>
    <SelectField label="Decorative motion" value={a.decorativeMotion ?? 'full'} onChange={(e) => void set({ decorativeMotion: e.target.value as 'full' | 'reduced' | 'off' }, a)} hint="Controls the 3D scenes, scroll effects and ambient animation. FREEVERSE also pauses decorative motion automatically while you read, write or fill in forms, and follows your device’s reduced-motion setting."><option value="full">Full: spatial effects where they help</option><option value="reduced">Reduced: still images instead of 3D and scroll effects</option><option value="off">Off: no decorative motion at all</option></SelectField>
    <MotionNote />
    <Switch label="Reduce motion" checked={a.reduceMotion} onChange={(v) => void set({ reduceMotion: v }, a)} hint="Turns off animations and transitions." /><Switch label="High contrast" checked={a.highContrast} onChange={(v) => void set({ highContrast: v }, a)} hint="Stronger text and border contrast." /><Switch label="Calm background" checked={a.calmBackground} onChange={(v) => void set({ calmBackground: v }, a)} hint="Removes the decorative glow." /><Switch label="Underline links" checked={a.underlineLinks} onChange={(v) => void set({ underlineLinks: v }, a)} /></Card>}</Async></>;
}
function NovaS() {
  const { say } = useToast(); const { res, patch } = useSettings(); const info = useResource(() => api.get<{ disclosure: string; flagRetentionDays: number; mode: string }>('/api/ai/info'), []);
  return <><H>Nova & AI data</H><Async res={res}>{({ settings: { nova: n } }) => <>
    <Card className="stack-sm"><Switch label="Save my Nova conversation history" checked={n.saveHistory} onChange={(v) => void patch({ nova: { saveHistory: v } })} hint="When off, use a temporary chat. Nothing is kept." />
      <SelectField label="Delete saved conversations after" value={String(n.historyRetentionDays ?? '')} onChange={(e) => void patch({ nova: { historyRetentionDays: e.target.value ? Number(e.target.value) : null } })}><option value="">Keep until I delete them</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></SelectField></Card>
    <Card className="stack-sm"><h3 className="h-sm">Private tools</h3><p className="muted">Off by default. Private to you: moderators, governance roles and the Founder can’t read them, and nothing is ever posted automatically.</p>
      <Switch label="Journal" checked={n.journalEnabled} onChange={(v) => void patch({ nova: { journalEnabled: v } })} /><Switch label="Goals" checked={n.goalsEnabled} onChange={(v) => void patch({ nova: { goalsEnabled: v } })} /><Switch label="Habits" checked={n.habitsEnabled} onChange={(v) => void patch({ nova: { habitsEnabled: v } })} /></Card>
    <Async res={info}>{(i) => <Notice title="Safety flags">{i.disclosure} Flagged excerpts are kept for {i.flagRetentionDays} days by default. {i.mode === 'demo' ? 'No AI model is connected right now, so replies are scripted demos.' : ''}</Notice>}</Async>
    <Link to="/ai" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => say('')}>Manage conversations</Link></>}</Async></>;
}
function BlockedS() {
  const { say } = useToast(); const b = useResource(() => api.get<BlockListResponse>('/api/blocks'), []); const m = useResource(() => api.get<BlockListResponse>('/api/mutes'), []);
  const list = (title: string, res: typeof b, path: string) => <Card className="stack-sm"><h3 className="h-sm">{title}</h3><Async res={res} empty={(d) => (d.items.length ? null : <p className="muted">No one.</p>)}>{(d) => <ul className="plain stack-sm">{d.items.map((p) => <li key={p.id ?? p.displayName} className="person-row"><Avatar avatar={p.avatar} name={p.displayName} size={36} /><span className="grow">{p.displayName} {p.handle && <span className="faint">@{p.handle}</span>}</span><Button size="sm" onClick={async () => { try { await api.del(`/api/${path}/${p.handle}`); res.reload(); say('Done'); } catch (e) { say(errMsg(e), 'error'); } }}>{path === 'blocks' ? 'Unblock' : 'Unmute'}</Button></li>)}</ul>}</Async></Card>;
  return <><H>Blocked & muted</H><p className="muted">Blocking hides you both from each other and stops messages. Muting just hides their posts from you; they aren’t told.</p>{list('Blocked', b, 'blocks')}{list('Muted', m, 'mutes')}</>;
}
function DataS() {
  const { say } = useToast(); const stepUp = useStepUp(); const { signOut } = useSession(); const info = useResource(() => api.get<{ retainedAfterDeletion: string[]; note: string }>('/api/account/data-summary'), []); const [del, setDel] = useState(false); const [txt, setTxt] = useState('');
  const exportData = async () => { try { const tok = await stepUp.ask('Confirm it’s you to download your data.'); const d = await api.get<unknown>('/api/account/export', { stepUp: tok }); const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'freeverse-data-export.json'; a.click(); URL.revokeObjectURL(url); say('Download started'); } catch (e) { if ((e as Error).message !== 'Cancelled') say(errMsg(e), 'error'); } };
  return <><H>Your data & account</H><Card className="stack-sm"><h3 className="h-sm">Download your data</h3><p className="muted">A JSON file with what FREEVERSE holds about you.</p><Button onClick={() => void exportData()} style={{ justifySelf: 'start' }}>Download my data</Button></Card>
    <Card className="stack-sm"><h3 className="h-sm">Delete your account</h3><Async res={info}>{(d) => <><p>{d.note}</p><details><summary>What stays after deletion</summary><ul>{d.retainedAfterDeletion.map((x) => <li key={x}>{x}</li>)}</ul></details></>}</Async><Button variant="danger" onClick={() => setDel(true)} style={{ justifySelf: 'start' }}>Delete my account…</Button></Card>
    <Confirm open={del} danger title="Delete your account?" confirmLabel="Delete forever" onConfirm={async () => { if (txt !== 'DELETE MY ACCOUNT') throw new Error('Type DELETE MY ACCOUNT exactly.'); let tok: string; try { tok = await stepUp.ask('Confirm it’s you to delete your account.'); } catch { throw new Error('Cancelled'); } await api.post('/api/account/delete', { confirm: 'DELETE MY ACCOUNT' }, { stepUp: tok }); await signOut(); navigate('/'); }} onClose={() => setDel(false)}><p>This can’t be undone.</p><TextField label="Type DELETE MY ACCOUNT to confirm" value={txt} onChange={(e) => setTxt(e.target.value)} /></Confirm></>;
}
function HelpS() {
  return <><H>Help & support</H><Card className="stack-sm"><p>Read how we keep FREEVERSE safe, how reporting works, and where to get urgent help.</p><div className="row-wrap"><Link to="/help" className="btn btn-primary">Help & safety</Link><Link to="/trust" className="btn btn-secondary">How trust works</Link><Link to="/terms" className="btn btn-secondary">Terms</Link><Link to="/privacy" className="btn btn-secondary">Privacy</Link><Link to="/rules" className="btn btn-secondary">Community rules</Link></div><Badge>Support by email isn’t set up in this build</Badge></Card></>;
}
export { EmptyState };
