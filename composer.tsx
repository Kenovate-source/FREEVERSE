import { useState } from 'react';
import { api } from '../../api/client';
import { Icon } from '../../ui/Icon';
import { Button, Notice, SelectField, TextArea, TextField, errMsg, fieldErrors } from '../../ui/kit';
import { useToast } from '../../state/toast';
import { useFocusZone } from '../../motion/react';
import { POST_LIMITS } from '../../../shared/api/content';
import type { MediaItem } from '../../../shared/api/media';
import { validateMeta, type Template } from '../../../shared/universe-spaces';

/** The form for one Universe template. The server validates everything again; this is only for helpful, early feedback. */
export function TemplateComposer({ universe, template, onPosted, onClose }: { universe: string; template: Template; onPosted: () => void; onClose: () => void }) {
  useFocusZone(); // writing is focused work: decorative motion calms while the composer is open
  const { say } = useToast();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [url, setUrl] = useState(''); const [when, setWhen] = useState(''); const [meta, setMeta] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<MediaItem[]>([]); const [up, setUp] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [fe, setFe] = useState<Record<string, string>>({});
  const upload = async (f: File | undefined) => { if (!f) return; setUp(true); try { const r = await api.upload<{ media: MediaItem }>('/api/media?purpose=post', f); setMedia((m) => [...m, r.media].slice(0, POST_LIMITS.mediaMax)); } catch (e) { setErr(errMsg(e)); } finally { setUp(false); } };
  const submit = async () => {
    const local: Record<string, string> = {};
    if (template.titleRequired && !title.trim()) local.title = `${template.titleLabel ?? 'Title'} is required.`;
    if (template.bodyRequired && !body.trim() && !media.length) local.body = `${template.bodyLabel} is required.`;
    if (template.urlRequired && !url.trim()) local.url = `${template.urlLabel ?? 'Link'} is required.`;
    if (template.needsStart && !when) local.startsAt = 'Choose when it starts.';
    const m = validateMeta(template, Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== '')));
    for (const [k, v] of Object.entries(m.errors)) local[`meta.${k}`] = v;
    setFe(local); if (Object.keys(local).length) { setErr('Please fix the highlighted fields.'); return; }
    setBusy(true); setErr(null);
    try {
      const b: Record<string, unknown> = { kind: template.kind, universe, template: template.id, body, meta: m.meta };
      if (title.trim()) b.title = title.trim(); if (url.trim()) b.url = url.trim(); if (template.needsStart && when) b.startsAt = new Date(when).toISOString(); if (media.length) b.mediaIds = media.map((x) => x.id);
      await api.post('/api/posts', b); say('Posted'); onPosted();
    } catch (e) { setErr(errMsg(e)); setFe(fieldErrors(e)); } finally { setBusy(false); }
  };
  return <section className="card stack" aria-label={template.verb}>
    <div className="spread"><h2 className="h-sm">{template.verb}</h2><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    <p className="muted">{template.blurb}</p>{template.notice && <Notice tone="info">{template.notice}</Notice>}
    {template.titleLabel && <TextField label={template.titleLabel} optional={!template.titleRequired} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={POST_LIMITS.titleMax} error={fe.title} />}
    <TextArea label={template.bodyLabel} optional={!template.bodyRequired} value={body} onChange={(e) => setBody(e.target.value)} rows={template.kind === 'article' ? 10 : 4} maxLength={POST_LIMITS.bodyMax} hint={`${body.length}/${POST_LIMITS.bodyMax}`} error={fe.body} />
    {template.urlLabel && <TextField label={template.urlLabel} type="url" optional={!template.urlRequired} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" error={fe.url} />}
    {template.needsStart && <TextField label="Starts" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={fe.startsAt} />}
    <div className="grid-2">{template.fields.map((f) => {
      const err = fe[`meta.${f.key}`]; const v = meta[f.key] ?? ''; const set = (x: string) => setMeta({ ...meta, [f.key]: x });
      if (f.type === 'select') return <SelectField key={f.key} label={f.label} optional={!f.required} value={v} onChange={(e) => set(e.target.value)} error={err} hint={f.hint}><option value="">Choose…</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</SelectField>;
      if (f.type === 'textarea') return <TextArea key={f.key} label={f.label} optional={!f.required} value={v} onChange={(e) => set(e.target.value)} maxLength={f.max ?? 600} error={err} hint={f.hint} />;
      return <TextField key={f.key} label={f.label} optional={!f.required} type={f.type === 'number' ? 'number' : 'text'} inputMode={f.type === 'number' ? 'numeric' : undefined} value={v} onChange={(e) => set(e.target.value)} maxLength={f.max} placeholder={f.placeholder} error={err} hint={f.hint} />;
    })}</div>
    {template.images && <div className="stack-sm"><label className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}><Icon name="image" size={16} /> {up ? 'Uploading…' : `Add image (up to ${POST_LIMITS.mediaMax})`}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={up || media.length >= POST_LIMITS.mediaMax} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <div className="row-wrap">{media.map((m) => <span key={m.id} className="thumb"><img src={m.url} alt="Selected upload" width="64" height="64" /><button type="button" aria-label="Remove image" onClick={() => setMedia(media.filter((x) => x.id !== m.id))}>✕</button></span>)}</div>
      <p className="hint">Images are resized and re-encoded for safety. Add alt text later in Settings → Data.</p></div>}
    {err && <p className="error-text" role="alert">{err}</p>}
    <div className="row-wrap"><Button variant="primary" busy={busy} onClick={() => void submit()}>Post</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>
  </section>;
}
