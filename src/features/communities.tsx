import { useState } from 'react';
import { api } from '../api/client';
import { Badge, Button, Card, Chip, Notice, SelectField, Switch, TextArea, TextField, errMsg, useResource, Async } from '../ui/kit';
import { useToast } from '../state/toast';
import { navigate } from '../lib/router';
import type { CommunityHealth, CommunitySettings, CommunityView } from '../../shared/api/content';

const JOIN: Record<CommunitySettings['joinPolicy'], string> = { open: 'Anyone can join', approval: 'Moderators approve each request' };
const WHO: Record<'members' | 'moderators', string> = { members: 'All members', moderators: 'Moderators only' };
export const CATEGORY_HINTS = ['Community', 'Education', 'Technology', 'Creative', 'Career', 'Finance', 'Support', 'Wellbeing', 'Gaming', 'Volunteering', 'Lifestyle', 'Research'];

/** Settings shared by "create" and "edit": who joins, who posts and comments, links, discovery and a pinned note. */
function SettingsFields({ v, set }: { v: CommunitySettings; set: (s: CommunitySettings) => void }) {
  return <div className="stack-sm">
    <SelectField label="Who can join" value={v.joinPolicy} onChange={(e) => set({ ...v, joinPolicy: e.target.value as CommunitySettings['joinPolicy'] })}>{Object.entries(JOIN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectField>
    <div className="grid-2">
      <SelectField label="Who can post" value={v.postPolicy} onChange={(e) => set({ ...v, postPolicy: e.target.value as 'members' | 'moderators' })}>{Object.entries(WHO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectField>
      <SelectField label="Who can comment" value={v.commentPolicy} onChange={(e) => set({ ...v, commentPolicy: e.target.value as 'members' | 'moderators' })}>{Object.entries(WHO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectField>
    </div>
    <Switch label="Allow external links in posts" checked={v.allowLinks} onChange={(x) => set({ ...v, allowLinks: x })} hint="When off, posts with links are refused." />
    <Switch label="Show in discovery" checked={v.discoverable} onChange={(x) => set({ ...v, discoverable: x })} hint="When off, only members (and people with the address) can find it." />
    <TextArea label="Pinned note" optional value={v.pinnedNote ?? ''} maxLength={400} rows={3} onChange={(e) => set({ ...v, pinnedNote: e.target.value || null })} hint="Shown at the top of the community: a welcome, a schedule, where to start." />
  </div>;
}
const DEFAULTS: CommunitySettings = { joinPolicy: 'open', postPolicy: 'members', commentPolicy: 'members', allowLinks: true, discoverable: true, pinnedNote: null };

export function CreateCommunity() {
  const { say } = useToast(); const [open, setOpen] = useState(false); const [f, setF] = useState({ name: '', description: '', category: 'Community', rules: '' }); const [st, setSt] = useState<CommunitySettings>(DEFAULTS); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (!open) return <div><Button variant="secondary" onClick={() => setOpen(true)}>Start a community</Button></div>;
  const submit = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post<{ community: CommunityView }>('/api/communities', { name: f.name, description: f.description, category: f.category, rules: f.rules.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8), settings: st }); say('Community created. You are its first moderator.'); navigate(`/communities/${r.community.slug}`); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return <Card className="stack-sm" aria-label="Start a community"><h2 className="h-sm">Start a community</h2>
    <p className="muted">You become its first moderator. Everyone must follow the FREEVERSE rules; yours add to them. You can create up to 3 a day.</p>
    {err && <Notice tone="warn">{err}</Notice>}
    <TextField label="Name" value={f.name} maxLength={48} onChange={(e) => setF({ ...f, name: e.target.value })} />
    <TextArea label="What is it for?" value={f.description} maxLength={400} rows={3} onChange={(e) => setF({ ...f, description: e.target.value })} hint="10 to 400 characters." />
    <TextField label="Category" value={f.category} maxLength={30} list="cat-hints" onChange={(e) => setF({ ...f, category: e.target.value })} hint="Pick one or type your own." /><datalist id="cat-hints">{CATEGORY_HINTS.map((c) => <option key={c} value={c} />)}</datalist>
    <TextArea label="Community rules" optional value={f.rules} rows={3} onChange={(e) => setF({ ...f, rules: e.target.value })} hint="One per line, up to 8." />
    <SettingsFields v={st} set={setSt} />
    <p className="faint">Anonymous posting follows the platform setting, and you can turn it off later. Anonymous never means anonymous messaging.</p>
    <div className="row-wrap"><Button variant="primary" busy={busy} disabled={f.name.trim().length < 3 || f.description.trim().length < 10} onClick={() => void submit()}>Create community</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div></Card>;
}

export function CommunityHealthCard({ h }: { h: CommunityHealth }) {
  const cells: [string, number | null, string][] = [['Posts, last 30 days', h.posts30d, ''], ['Comments, last 30 days', h.comments30d, ''], ['People who posted', h.activePosters30d, ''], ['New members', h.newMembers30d, ''], ['Members', h.memberCount, ''], ['Open reports', h.openReports, 'moderators only'], ['Join requests waiting', h.pendingJoinRequests, 'moderators only']];
  return <Card className="stack-sm" aria-label="Community health"><h2 className="h-sm">Community health</h2>
    <dl className="kv">{cells.filter(([, v]) => v !== null).map(([k, v, note]) => <div key={k}><dt>{k}{note && <span className="faint"> ({note})</span>}</dt><dd>{v}</dd></div>)}</dl>
    <p className="faint small">{h.basis}</p></Card>;
}

export function ManageCommunity({ c, onChanged }: { c: CommunityView; onChanged: () => void }) {
  const { say } = useToast(); const [open, setOpen] = useState(false); const [st, setSt] = useState<CommunitySettings>(c.settings); const [desc, setDesc] = useState(c.description); const [rules, setRules] = useState(c.rules.join('\n')); const [busy, setBusy] = useState(false);
  const reqs = useResource(() => (c.settings.joinPolicy === 'approval' ? api.get<{ items: { userId: string; handle: string; displayName: string; requestedAt: string }[] }>(`/api/communities/${c.slug}/requests`) : Promise.resolve({ items: [] })), [c.slug, c.settings.joinPolicy]);
  const save = async () => { setBusy(true); try { await api.patch(`/api/communities/${c.slug}/settings`, { description: desc, rules: rules.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8), settings: st }); say('Saved'); setOpen(false); onChanged(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const decide = async (userId: string, decision: 'approve' | 'decline') => { try { await api.post(`/api/communities/${c.slug}/requests/${userId}`, { decision }); reqs.reload(); onChanged(); } catch (e) { say(errMsg(e), 'error'); } };
  return <Card className="stack-sm" aria-label="Manage this community"><div className="spread"><h2 className="h-sm">Manage this community</h2><Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Settings'}</Button></div>
    {c.settings.joinPolicy === 'approval' && <Async res={reqs}>{(d) => <div className="stack-sm"><h3 className="h-xs">Join requests ({d.items.length})</h3>{d.items.length === 0 ? <p className="muted">No one is waiting.</p> : <ul className="plain stack-sm">{d.items.map((r) => <li key={r.userId} className="spread"><span>{r.displayName} <span className="faint">@{r.handle}</span></span><span className="row-wrap"><Button size="sm" variant="primary" onClick={() => void decide(r.userId, 'approve')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => void decide(r.userId, 'decline')}>Decline</Button></span></li>)}</ul>}</div>}</Async>}
    {open && <div className="stack-sm"><TextArea label="Description" value={desc} maxLength={400} rows={3} onChange={(e) => setDesc(e.target.value)} /><TextArea label="Rules (one per line)" value={rules} rows={4} onChange={(e) => setRules(e.target.value)} /><SettingsFields v={st} set={setSt} /><Button variant="primary" busy={busy} onClick={() => void save()}>Save changes</Button></div>}</Card>;
}

export function DiscoveryFilters({ q, set }: { q: URLSearchParams; set: (p: Record<string, string | null>) => void }) {
  const toggle = (k: string) => set({ [k]: q.get(k) ? null : '1' });
  return <div className="stack-sm" role="group" aria-label="Discovery filters">
    <div className="row-wrap"><Chip on={q.get('active') === '1'} onClick={() => toggle('active')}>Active lately</Chip><Chip on={q.get('open') === '1'} onClick={() => toggle('open')}>Open to join</Chip><Chip on={q.get('anonymous') === '1'} onClick={() => toggle('anonymous')}>Anonymous allowed</Chip></div>
    <div className="grid-2"><SelectField label="Size" value={q.get('size') ?? ''} onChange={(e) => set({ size: e.target.value || null })}><option value="">Any size</option><option value="small">Small (under 20)</option><option value="medium">Medium (20 to 99)</option><option value="large">Large (100+)</option></SelectField>
      <SelectField label="Sort by" value={q.get('sort') ?? 'members'} onChange={(e) => set({ sort: e.target.value === 'members' ? null : e.target.value })}><option value="members">Most members</option><option value="active">Most active</option><option value="new">Newest</option></SelectField></div>
  </div>;
}
export { Badge };
