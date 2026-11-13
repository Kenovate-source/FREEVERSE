// Messaging settings: every row says what it does and whether it works today. Rows for things FREEVERSE hasn't built have no control at all.
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { Link } from '../lib/router';
import { Async, Badge, Card, Notice, SelectField, Switch, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import type { Settings, MessagingSettings, MsgChoice, MSG_CHOICES } from '../../shared/api/settings';
import type { PrivacyView } from '../../shared/api/settings';
import type { BlockListResponse } from '../../shared/api/social';

type GroupId = 'privacy' | 'behaviour' | 'notify' | 'appearance' | 'calls' | 'security';
const GROUPS: { id: GroupId; label: string; blurb: string }[] = [
  { id: 'privacy', label: 'Privacy & presence', blurb: 'Who can reach you and what they can see.' },
  { id: 'behaviour', label: 'Message behaviour', blurb: 'How your conversations work.' },
  { id: 'notify', label: 'Notifications', blurb: 'When messages interrupt you.' },
  { id: 'appearance', label: 'Appearance', blurb: 'How conversations look.' },
  { id: 'calls', label: 'Calls', blurb: 'Voice and video.' },
  { id: 'security', label: 'Security', blurb: 'Blocking, links and your sessions.' },
];
type Ctx = { m: MessagingSettings; s: Settings; p: PrivacyView; save: (patch: Partial<MessagingSettings>) => void; saveNotif: (k: string, v: boolean) => void; savePriv: (k: string, v: string) => void; blocked: number; muted: number };
interface Row { id: string; group: GroupId; title: string; help: string; words?: string; render?: (c: Ctx) => React.ReactNode; later?: string }

const sel = <K extends keyof typeof MSG_CHOICES>(key: K, label: string, options: [MsgChoice<K>, string][], hint?: string) => (c: Ctx) =>
  <SelectField label={label} value={c.m[key] as string} onChange={(e) => c.save({ [key]: e.target.value } as Partial<MessagingSettings>)} hint={hint}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>;
const sw = (key: keyof MessagingSettings, label: string, hint?: string) => (c: Ctx) => <Switch label={label} checked={c.m[key] as boolean} onChange={(v) => c.save({ [key]: v } as Partial<MessagingSettings>)} hint={hint} />;
const notif = (key: string, label: string, hint?: string) => (c: Ctx) => <Switch label={label} checked={(c.s.notifications as unknown as Record<string, boolean>)[key] !== false} onChange={(v) => c.saveNotif(key, v)} hint={hint} />;

const ROWS: Row[] = [
  { id: 'who-dm', group: 'privacy', title: 'Who can message you', help: 'Set in your privacy choices. Enforced on the server.', words: 'dm direct contact', render: (c) => <SelectField label="Who can message you" value={c.p.who_can_message} onChange={(e) => c.savePriv('who_can_message', e.target.value)} hint="Anyone starts as a request. Connections are people you follow and who follow you back."><option value="members">Any member</option><option value="connections">Connections only</option><option value="nobody">Nobody</option></SelectField> },
  { id: 'req-from', group: 'privacy', title: 'Who can send you message requests', help: 'A request is a first message from someone you don’t follow.', words: 'requests strangers', render: sel('requestsFrom', 'Who can send you message requests', [['everyone', 'Anyone allowed above'], ['followers', 'Only people who follow me'], ['nobody', 'Nobody']]) },
  { id: 'req-handling', group: 'privacy', title: 'How requests are handled', help: 'Allow: shown in Requests with a notification. Filter: requests from people you share no community with go to a Filtered tab, quietly. Restrict: every request arrives quietly.', words: 'filter restrict spam', render: sel('requestHandling', 'How requests are handled', [['allow', 'Allow'], ['filter', 'Filter people I share nothing with'], ['restrict', 'Restrict: deliver quietly']]) },
  { id: 'receipts', group: 'privacy', title: 'Read receipts', help: 'When off, people can’t see that you’ve read their messages, and you can’t see theirs. Requests never show you as having read them until you accept.', words: 'seen', render: sw('readReceipts', 'Read receipts') },
  { id: 'online', group: 'privacy', title: 'Who sees when you’re online', help: 'Same setting as in Privacy.', words: 'presence status', render: (c) => <SelectField label="Who sees when you’re online" value={c.p.online_status_visibility} onChange={(e) => c.savePriv('online_status_visibility', e.target.value)}><option value="members">Any member</option><option value="connections">Connections</option><option value="only_me">Nobody</option></SelectField> },
  { id: 'last-active', group: 'privacy', title: 'Who sees when you were last active', help: 'Shown as “Active today” or “Active this week”, never an exact time.', words: 'last seen presence', render: sel('lastActiveVisibility', 'Who sees when you were last active', [['members', 'Any member'], ['connections', 'Connections'], ['nobody', 'Nobody']]) },
  { id: 'profile-info', group: 'privacy', title: 'Profile details shown in a conversation', help: 'A conversation shows only what your profile visibility already allows that person to see.', words: 'profile visibility', render: () => <p className="muted">Controlled in <Link to="/settings/privacy">Privacy & visibility</Link>, part by part.</p> },
  { id: 'typing', group: 'privacy', title: 'Typing indicator', help: '', later: 'Needs a live connection that isn’t built yet.' },
  { id: 'add-groups', group: 'privacy', title: 'Who can add you to group conversations', help: '', later: 'Group conversations don’t exist yet. Messages are one to one.' },

  { id: 'expiry', group: 'behaviour', title: 'Disappearing messages', help: 'Your new messages disappear after the time you choose. Earlier messages are unchanged. It can’t take back what someone already read or copied.', words: 'expire timer auto delete', render: sel('defaultExpiry', 'Make my new messages disappear after', [['never', 'Never'], ['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']]) },
  { id: 'reactions', group: 'behaviour', title: 'Reactions to your messages', help: 'When off, people can’t react to what you send. Reactions already there stay until their owners remove them.', words: 'emoji', render: sw('allowReactions', 'Allow reactions to my messages') },
  { id: 'replies', group: 'behaviour', title: 'Replies and quotes', help: 'When off, people can’t quote your messages in a reply.', words: 'quote reply', render: sw('allowReplies', 'Allow replies that quote my messages') },
  { id: 'archive', group: 'behaviour', title: 'Archived conversations', help: 'Choose what a new message does to a conversation you archived.', words: 'archive', render: sel('archiveBehaviour', 'When a new message arrives in an archived conversation', [['return', 'Bring it back to my inbox'], ['stay', 'Keep it archived']]) },
  { id: 'delete', group: 'behaviour', title: 'Deleting your messages', help: 'Deleting removes a message for both of you. A shorter window keeps a conversation’s history steady. It can’t remove copies already taken.', words: 'remove unsend', render: sel('deleteWindow', 'I can delete my own messages for', [['anytime', 'Any time'], ['24h', 'The first 24 hours'], ['1h', 'The first hour']]) },
  { id: 'enter', group: 'behaviour', title: 'Enter to send', help: 'Shift+Enter always adds a new line.', words: 'keyboard', render: sw('enterToSend', 'Press Enter to send') },
  { id: 'forward', group: 'behaviour', title: 'Forwarding messages', help: '', later: 'You can’t forward messages yet, so there is nothing to allow or stop.' },
  { id: 'previews', group: 'behaviour', title: 'Link previews', help: '', later: 'We don’t fetch link previews. That would mean our servers visiting addresses people send you.' },
  { id: 'media', group: 'behaviour', title: 'Photos, files and automatic downloads', help: '', later: 'Messages carry text only for now, so nothing downloads through them.' },

  { id: 'n-dm', group: 'notify', title: 'New messages', help: 'Messages from people you follow.', words: 'direct', render: notif('messages', 'Notify me about new messages') },
  { id: 'n-req', group: 'notify', title: 'Message requests', help: 'Quiet when you use Filter or Restrict above.', render: notif('message_request', 'Notify me about message requests') },
  { id: 'n-react', group: 'notify', title: 'Reactions', help: 'Reactions to your posts, comments and messages.', render: notif('reactions', 'Notify me about reactions') },
  { id: 'n-reply', group: 'notify', title: 'Replies', help: 'Replies to your comments.', render: notif('replies', 'Notify me about replies') },
  { id: 'n-mention', group: 'notify', title: 'Mentions', help: 'When someone mentions you in a post or comment.', render: notif('mentions', 'Notify me about mentions') },
  { id: 'quiet', group: 'notify', title: 'Quiet hours', help: 'During quiet hours new message notifications aren’t created. The messages still wait in Messages. Uses this device’s time zone.', words: 'do not disturb schedule night', render: (c) => <div className="stack-sm"><Switch label="Quiet hours" checked={c.m.quietEnabled} onChange={(v) => c.save({ quietEnabled: v, quietOffset: -new Date().getTimezoneOffset() })} />
    {c.m.quietEnabled && <div className="row-wrap"><TextField label="From" type="time" value={c.m.quietStart} onChange={(e) => e.target.value && c.save({ quietStart: e.target.value, quietOffset: -new Date().getTimezoneOffset() })} /><TextField label="Until" type="time" value={c.m.quietEnd} onChange={(e) => e.target.value && c.save({ quietEnd: e.target.value, quietOffset: -new Date().getTimezoneOffset() })} /></div>}</div> },
  { id: 'n-conv', group: 'notify', title: 'Mute one conversation', help: 'Open a conversation and press Mute. It stays quiet until you unmute it.', words: 'mute per conversation', render: () => <p className="muted">Do it from the conversation itself, in <Link to="/messages">Messages</Link>.</p> },
  { id: 'n-group', group: 'notify', title: 'Group message notifications', help: '', later: 'Group conversations don’t exist yet.' },
  { id: 'n-sound', group: 'notify', title: 'Sound and vibration', help: '', later: 'FREEVERSE doesn’t send push notifications or play sounds yet. Notifications appear inside the app.' },
  { id: 'n-remind', group: 'notify', title: 'Message reminders', help: '', later: 'Reminders aren’t built yet.' },

  { id: 'theme', group: 'appearance', title: 'Conversation theme', help: 'Changes the colours of your conversations only.', words: 'colour color', render: sel('chatTheme', 'Theme', [['default', 'Default'], ['calm', 'Calm'], ['contrast', 'High contrast']]) },
  { id: 'bubble', group: 'appearance', title: 'Message shape', help: '', render: sel('bubbleStyle', 'Message shape', [['rounded', 'Rounded'], ['square', 'Square'], ['minimal', 'Minimal (no bubble)']]) },
  { id: 'bg', group: 'appearance', title: 'Conversation background', help: '', words: 'wallpaper', render: sel('chatBackground', 'Background', [['plain', 'Plain'], ['soft', 'Soft gradient'], ['dots', 'Quiet dots']]) },
  { id: 'size', group: 'appearance', title: 'Message text size', help: 'On top of your overall text size in Accessibility.', render: sel('chatTextSize', 'Message text size', [['sm', 'Smaller'], ['md', 'Standard'], ['lg', 'Larger']]) },
  { id: 'density', group: 'appearance', title: 'Spacing', help: '', render: sel('density' as never, 'Spacing', [['comfortable', 'Comfortable'], ['compact', 'Compact']] as never) },
  { id: 'org', group: 'appearance', title: 'Order of conversations', help: '', words: 'sort', render: sel('organisation', 'Order of conversations', [['recent', 'Most recent first'], ['unread_first', 'Unread first']]) },
  { id: 'view', group: 'appearance', title: 'What Messages opens on', help: '', words: 'default', render: sel('defaultView', 'Messages opens on', [['all', 'All conversations'], ['unread', 'Unread only']]) },

  { id: 'c-who', group: 'calls', title: 'Who can call you', help: '', later: 'Calling isn’t built yet.' },
  { id: 'c-types', group: 'calls', title: 'Voice and video calls, ringing, call waiting, missed-call alerts', help: '', later: 'Calling isn’t built yet. When it is, each of these will be a setting here.' },
  { id: 'c-privacy', group: 'calls', title: 'Call privacy and relaying', help: '', later: 'Calling isn’t built yet.' },
  { id: 'c-perm', group: 'calls', title: 'Camera and microphone permissions', help: 'For when calling arrives: your browser, not FREEVERSE, holds these permissions. You can change them any time from the address bar’s site settings.', words: 'camera mic microphone', render: () => <p className="muted">Nothing here uses your camera or microphone today.</p> },

  { id: 's-blocked', group: 'security', title: 'Blocked members', help: 'Blocked people can’t message you and you can’t message them.', words: 'block', render: (c) => <p>{c.blocked} blocked. <Link to="/settings/blocked">Manage blocked and muted</Link></p> },
  { id: 's-muted', group: 'security', title: 'Muted members', help: 'Muting hides someone’s posts. It doesn’t stop messages: use the request settings above for that.', words: 'mute', render: (c) => <p>{c.muted} muted. <Link to="/settings/blocked">Manage blocked and muted</Link></p> },
  { id: 's-links', group: 'security', title: 'Warn me before opening links', help: 'Asks first and names anything unusual: shortened links, look-alike letters, numbered addresses, no secure connection. It can’t tell you a link is safe.', words: 'phishing scam suspicious', render: sw('linkWarnings', 'Warn me before opening links in messages') },
  { id: 's-attach', group: 'security', title: 'Attachments', help: 'Messages can’t carry attachments, so nothing can be sent to you that way.', render: () => <p className="muted">Nothing to configure yet.</p> },
  { id: 's-sessions', group: 'security', title: 'Your sessions and devices', help: 'Change your password, or see what is signed in.', words: 'sessions password', render: () => <p><Link to="/settings/security">Security settings</Link> · <Link to="/settings/data">Your data & account</Link></p> },
];

const INFO = new Set(['profile-info', 'n-conv', 'c-perm', 's-blocked', 's-muted', 's-attach', 's-sessions']);
export function MessagingSettingsPanel() {
  const { say } = useToast(); const st = useResource(() => api.get<{ settings: Settings }>('/api/settings'), []); const pv = useResource(() => api.get<{ privacy: PrivacyView }>('/api/privacy'), []);
  const bl = useResource(() => api.get<BlockListResponse>('/api/blocks'), []); const mu = useResource(() => api.get<BlockListResponse>('/api/mutes'), []);
  const [group, setGroup] = useState<GroupId>('privacy'); const [q, setQ] = useState('');
  const patch = async (body: object, then: () => void) => { try { await api.patch('/api/settings', body); then(); say('Saved'); } catch (e) { say(errMsg(e), 'error'); } };
  const term = q.trim().toLowerCase();
  const rows = useMemo(() => ROWS.filter((r) => (term ? `${r.title} ${r.help} ${r.words ?? ''} ${r.later ?? ''}`.toLowerCase().includes(term) : r.group === group)), [term, group]);
  return <Async res={st}>{({ settings: s }) => <Async res={pv}>{({ privacy: p }) => {
    const ctx: Ctx = { m: s.messaging, s, p, blocked: bl.data?.items.length ?? 0, muted: mu.data?.items.length ?? 0,
      save: (b) => void patch({ messaging: b }, st.reload), saveNotif: (k, v) => void patch({ notifications: { [k]: v } }, st.reload),
      savePriv: (k, v) => void (async () => { try { await api.patch('/api/privacy', { [k]: v }); pv.reload(); say('Saved'); } catch (e) { say(errMsg(e), 'error'); } })() };
    const ready = rows.filter((r) => !r.later).length; const total = ROWS.length;
    return <div className="stack">
      <Notice title="About message privacy">Messages travel over an encrypted connection (HTTPS), but they are <strong>not end-to-end encrypted</strong>: FREEVERSE stores them so they can be delivered, reported and, if you ask, exported. Moderators see a conversation only through a report you or someone else files. The Founder console never shows message content.</Notice>
      <TextField label="Search messaging settings" type="search" value={q} onChange={(e) => setQ(e.target.value)} hint={`${ROWS.filter((r) => !r.later).length} settings work today. ${ROWS.filter((r) => r.later).length} are listed so you know what isn’t built yet.`} />
      {!term && <div className="row-wrap" role="tablist" aria-label="Messaging settings groups">{GROUPS.map((g) => <button key={g.id} role="tab" type="button" aria-selected={group === g.id} className={`chip${group === g.id ? ' on' : ''}`} onClick={() => setGroup(g.id)}>{g.label}</button>)}</div>}
      {!term && <p className="muted">{GROUPS.find((g) => g.id === group)!.blurb}</p>}
      {term && <p className="muted" role="status">{rows.length} match{rows.length === 1 ? '' : 'es'} for “{q}”.</p>}
      <div className="stack-sm">{rows.map((r) => <Card key={r.id} className="stack-sm msg-row" as="section" aria-label={r.title}>
        {r.later ? <><div className="spread"><h3 className="h-sm">{r.title}</h3><Badge tone="violet">In development</Badge></div><p className="muted">{r.later}</p></> : <>{INFO.has(r.id) && <h3 className="h-sm">{r.title}</h3>}{r.render!(ctx)}{r.help && <p className="faint">{r.help}</p>}</>}
        {term && <span className="faint">{GROUPS.find((g) => g.id === r.group)!.label}</span>}</Card>)}</div>
      {!term && ready === 0 && <p className="muted">Nothing here yet.</p>}
      <span className="sr-only">{total} messaging settings in total</span></div>; }}</Async>}</Async>;
}
