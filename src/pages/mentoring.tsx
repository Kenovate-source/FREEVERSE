import { useState } from 'react';
import { api } from '../api/client';
import { Link } from '../lib/router';
import { useSession } from '../state/session';
import { Async, Badge, Button, Card, EmptyState, Notice, PageHead, Switch, TextArea, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';

type Profile = { id: string; headline: string; bio: string; expertise: string[]; availabilityNote: string | null; capacity: number; state: 'pending' | 'approved' | 'rejected'; paused: boolean; reviewNote: string | null; submittedAt: string | null };
type Mine = { profile: Profile | null; openRequests: number; activeMentees: number; canReview: boolean };
type Req = { id: string; state: 'pending' | 'accepted' | 'declined'; message: string | null; reply: string | null; at: string; respondedAt: string | null; person: { handle: string | null; displayName: string } | null };
type P = { params: Record<string, string>; query: URLSearchParams };

const RULES = ['I’m 18 or over, as every FREEVERSE member is.', 'I will never ask a mentee for money, gifts, or private photos, and never pressure anyone to move to another app.', 'I won’t give medical, legal or financial advice as if it were professional advice.', 'I’ll be honest about what I know, and I’ll say when something is outside it.', 'If a mentee or I feel unsafe, I’ll stop and use Report or Block. Moderators can review my profile at any time.'];

/** Apply to be a mentor, see the review status, pause, or step down. */
export function MentorProfilePage(_: P) {
  const res = useResource(() => api.get<Mine>('/api/mentor-profile'), []); const { say } = useToast();
  const [f, setF] = useState({ headline: '', bio: '', expertise: '', availabilityNote: '', capacity: '3', agreed: false }); const [busy, setBusy] = useState(false); const [edit, setEdit] = useState(false); const [leave, setLeave] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api.put('/api/mentor-profile', { headline: f.headline, bio: f.bio, expertise: f.expertise.split(',').map((x) => x.trim()).filter(Boolean), availabilityNote: f.availabilityNote || undefined, capacity: Number(f.capacity) || 3, agreed: f.agreed }); say('Sent for review'); setEdit(false); res.reload(); }
    catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const patch = async (b: object, ok: string) => { try { await api.patch('/api/mentor-profile', b); say(ok); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  const load = (p: Profile) => { setF({ headline: p.headline, bio: p.bio, expertise: p.expertise.join(', '), availabilityNote: p.availabilityNote ?? '', capacity: String(p.capacity), agreed: false }); setEdit(true); };
  const form = <Card className="stack-sm">
    <TextField label="Headline" hint="What you do, in a line. Example: Product designer, 8 years" maxLength={120} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} />
    <TextArea label="About your mentoring" hint="Who you can help and how. At least 40 characters." maxLength={800} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
    <TextField label="Topics you can help with" hint="Separate with commas, up to 6." value={f.expertise} onChange={(e) => setF({ ...f, expertise: e.target.value })} />
    <TextField label="Availability" optional maxLength={200} value={f.availabilityNote} onChange={(e) => setF({ ...f, availabilityNote: e.target.value })} />
    <TextField label="How many people can you mentor at once?" type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} hint="1 to 10. When you’re full, the directory says so." />
    <div className="stack-sm"><h3 className="h-sm">Mentor ground rules</h3><ul className="plain stack-sm">{RULES.map((r) => <li key={r}>{r}</li>)}</ul><Switch label="I agree to these rules" checked={f.agreed} onChange={(v) => setF({ ...f, agreed: v })} /></div>
    <div className="row-wrap"><Button variant="primary" busy={busy} disabled={!f.agreed || f.headline.length < 5 || f.bio.length < 40} onClick={() => void submit()}>Send for review</Button>{edit && <Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>}</div></Card>;
  return <div className="stack-lg"><PageHead title="Become a mentor">Share what you know with other members. A reviewer reads every application before it appears in the directory.</PageHead>
    <Async res={res}>{(d) => <>
      <Notice>Mentors are community members, not verified professionals. FREEVERSE doesn’t check credentials, and says so in the directory.</Notice>
      {!d.profile && form}
      {d.profile && !edit && <Card className="stack-sm">
        <div className="row-wrap"><h2 className="h-sm">{d.profile.headline}</h2><Badge>{d.profile.state === 'approved' ? (d.profile.paused ? 'Paused' : 'Live in the directory') : d.profile.state === 'pending' ? 'Waiting for review' : 'Not approved'}</Badge></div>
        <p>{d.profile.bio}</p><div className="row-wrap">{d.profile.expertise.map((x) => <Badge key={x}>{x}</Badge>)}</div>
        {d.profile.state === 'rejected' && d.profile.reviewNote && <Notice tone="warn">{d.profile.reviewNote}. You can change your profile and send it again.</Notice>}
        {d.profile.state === 'pending' && <p className="muted">You’ll get a notification when a reviewer decides{d.profile.submittedAt ? `. Sent ${timeAgo(d.profile.submittedAt, Date.now())}` : ''}.</p>}
        {d.profile.state === 'approved' && <><Switch label="Pause new requests" checked={d.profile.paused} onChange={(v) => void patch({ paused: v }, v ? 'Paused' : 'You’re back in the directory')} hint="Hides you from the directory. People you already mentor are not affected." />
          <TextField label="Mentees at once" type="number" value={String(d.profile.capacity)} onChange={() => undefined} onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 10 && n !== d.profile!.capacity) void patch({ capacity: n }, 'Saved'); }} hint="1 to 10" /></>}
        <div className="row-wrap"><Button onClick={() => load(d.profile!)}>Edit profile</Button><Link to="/mentoring" className="btn btn-secondary">Requests ({d.openRequests} waiting)</Link>
          {!leave ? <Button variant="ghost" onClick={() => setLeave(true)}>Step down</Button> : <><span className="muted">Open requests will be closed with a note.</span><Button variant="danger" onClick={async () => { try { await api.del('/api/mentor-profile'); say('You’ve stepped down'); setLeave(false); res.reload(); } catch (e) { say(errMsg(e), 'error'); } }}>Confirm step down</Button><Button variant="ghost" onClick={() => setLeave(false)}>Keep my profile</Button></>}</div>
        {d.profile.state === 'approved' && <p className="faint">Changing your headline, about text or topics sends the profile back for review, and it is hidden until approved.</p>}</Card>}
      {edit && form}</>}</Async></div>;
}

/** Requests people have sent to the mentor, with accept and decline. */
export function MentoringPage(_: P) {
  const res = useResource(() => api.get<{ items: Req[] }>('/api/mentoring/requests'), []); const prof = useResource(() => api.get<Mine>('/api/mentor-profile'), []); const { say } = useToast();
  const [open, setOpen] = useState<string | null>(null); const [reply, setReply] = useState('');
  const respond = async (id: string, decision: 'accept' | 'decline') => { try { await api.post(`/api/mentoring/requests/${id}/respond`, { decision, reply: reply || undefined }); say(decision === 'accept' ? 'Accepted' : 'Declined'); setOpen(null); setReply(''); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  const label = { pending: 'Waiting for you', accepted: 'Accepted', declined: 'Declined' };
  return <div className="stack-lg"><PageHead title="Mentoring requests">People who asked for your guidance. Answer when you can; a short, kind reply always helps.</PageHead>
    <Async res={prof}>{(p) => !p.profile ? <Notice>You’re not a mentor yet. <Link to="/mentoring/profile">Apply to become one</Link>.</Notice> : p.profile.state !== 'approved' ? <Notice>Your mentor profile is {p.profile.state === 'pending' ? 'waiting for review' : 'not approved'}. <Link to="/mentoring/profile">Open it</Link>.</Notice> : null}</Async>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="compass2" title="No requests yet">When someone asks for your mentoring it appears here, and you get a notification.</EmptyState>)}>{(d) => <div className="stack-sm">{d.items.map((r) => <Card as="article" key={r.id} className="stack-sm">
      <div className="row-wrap"><h2 className="h-sm">{r.person?.displayName ?? 'Deleted account'}{r.person?.handle && <> <Link to={`/u/${r.person.handle}`} className="faint">@{r.person.handle}</Link></>}</h2><Badge>{label[r.state]}</Badge><span className="faint">{timeAgo(r.at, Date.now())}</span></div>
      <p>{r.message ?? <span className="muted">No note.</span>}</p>{r.reply && <p className="muted">Your reply: {r.reply}</p>}
      {r.state === 'pending' && (open === r.id ? <div className="stack-sm"><TextArea label="Your reply" optional maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} hint="They’ll see this. Don’t share private contact details here; they can message you through FREEVERSE." /><div className="row-wrap"><Button variant="primary" size="sm" onClick={() => void respond(r.id, 'accept')}>Accept</Button><Button size="sm" onClick={() => void respond(r.id, 'decline')}>Decline</Button><Button variant="ghost" size="sm" onClick={() => setOpen(null)}>Cancel</Button></div></div> : <Button size="sm" onClick={() => setOpen(r.id)}>Answer</Button>)}</Card>)}</div>}</Async></div>;
}

/** For reviewers: applications waiting for a decision. */
export function MentorReviewPage(_: P) {
  const res = useResource(() => api.get<{ items: { id: string; name: string; handle: string; headline: string; bio: string; expertise: string[]; availabilityNote: string | null; capacity: number; submittedAt: string; mine: boolean }[] }>('/api/mentor-applications'), []); const { say } = useToast(); const { perms } = useSession();
  const [note, setNote] = useState<Record<string, string>>({});
  const decide = async (id: string, decision: 'approve' | 'reject') => { try { await api.post(`/api/mentor-applications/${id}/decision`, { decision, note: note[id] || undefined }); say(decision === 'approve' ? 'Approved' : 'Not approved'); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  if (!perms.has('mentors.review')) return <Notice>You don’t have access to this page.</Notice>;
  return <div className="stack-lg"><PageHead title="Mentor applications">Read what the person wrote and decide. You’re approving a listing, not vouching for credentials. If something looks unsafe, don’t approve, and use the moderation queue.</PageHead>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="compass2" title="Nothing waiting" />)}>{(d) => <div className="stack-sm">{d.items.map((a) => <Card as="article" key={a.id} className="stack-sm">
      <div className="row-wrap"><h2 className="h-sm">{a.name}</h2><Link to={`/u/${a.handle}`} className="faint">@{a.handle}</Link>{a.mine && <Badge>Your own</Badge>}</div><p className="muted">{a.headline}</p><p>{a.bio}</p>
      <div className="row-wrap">{a.expertise.map((x) => <Badge key={x}>{x}</Badge>)}</div><p className="faint">Up to {a.capacity} mentees{a.availabilityNote ? ` · ${a.availabilityNote}` : ''} · sent {timeAgo(a.submittedAt, Date.now())}</p>
      {a.mine ? <p className="muted">Another reviewer will decide this one.</p> : <><TextField label="Note to the applicant" hint="Required if you don’t approve." optional value={note[a.id] ?? ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} /><div className="row-wrap"><Button variant="primary" onClick={() => void decide(a.id, 'approve')}>Approve</Button><Button onClick={() => void decide(a.id, 'reject')}>Don’t approve</Button></div></>}</Card>)}</div>}</Async></div>;
}
