import { useRef, useState } from 'react';
import { api } from '../api/client';
import { Button, TextField, errMsg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { POST_LIMITS } from '../../shared/api/content';
import type { MediaItem } from '../../shared/api/media';

export interface Attachments { media: MediaItem[]; links: string[] }
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']; const MAX_BYTES = 8 * 1024 * 1024;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
export function validUrl(v: string): string | null { try { const u = new URL(v.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null; } catch { return null; } }
const move = <T,>(a: T[], i: number, d: -1 | 1): T[] => { const j = i + d; if (j < 0 || j >= a.length) return a; const n = [...a]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; };

/**
 * Everything attached to a post: images (uploaded with progress, validated, reorderable, removable) and extra links.
 * Documents and video files are not accepted here: share a link to where they are hosted. Nothing is fetched from links.
 */
export function AttachmentsEditor({ value, onChange, allowLinks = true, allowImages = true }: { value: Attachments; onChange: (a: Attachments) => void; allowLinks?: boolean; allowImages?: boolean }) {
  const [busy, setBusy] = useState<{ name: string; pct: number }[]>([]); const [err, setErr] = useState<string | null>(null); const [link, setLink] = useState(''); const [linkErr, setLinkErr] = useState<string | null>(null); const cur = useRef(value); cur.current = value;
  const addFiles = async (files: FileList | null) => {
    if (!files) return; setErr(null);
    for (const f of Array.from(files)) {
      if (cur.current.media.length >= POST_LIMITS.mediaMax) { setErr(`You can attach up to ${POST_LIMITS.mediaMax} images.`); break; }
      if (!IMAGE_TYPES.includes(f.type)) { setErr(`“${f.name}” isn’t a supported image. Use PNG, JPEG, WebP or GIF. For documents or video, add a link to where they are hosted.`); continue; }
      if (f.size > MAX_BYTES) { setErr(`“${f.name}” is larger than 8 MB.`); continue; }
      const entry = { name: f.name, pct: 0 }; setBusy((b) => [...b, entry]);
      try { const r = await api.uploadWithProgress<{ media: MediaItem }>('/api/media?purpose=post', f, (p) => setBusy((b) => b.map((x) => (x === entry ? { ...x, pct: p } : x)))); onChange({ ...cur.current, media: [...cur.current.media, r.media].slice(0, POST_LIMITS.mediaMax) }); }
      catch (e) { setErr(`“${f.name}”: ${errMsg(e)}`); }
      finally { setBusy((b) => b.filter((x) => x !== entry)); }
    }
  };
  const addLink = () => {
    const u = validUrl(link); if (!u) { setLinkErr('Enter a full web address starting with https://'); return; }
    if (value.links.includes(u)) { setLinkErr('That link is already attached.'); return; }
    if (value.links.length >= POST_LIMITS.linksMax) { setLinkErr(`You can attach up to ${POST_LIMITS.linksMax} links.`); return; }
    onChange({ ...value, links: [...value.links, u] }); setLink(''); setLinkErr(null);
  };
  return <div className="stack-sm" aria-label="Attachments">
    {allowImages && <div className="stack-sm"><div className="row-wrap"><label className="btn btn-secondary btn-sm"><Icon name="image" size={16} /> Add images<input type="file" multiple accept={IMAGE_TYPES.join(',')} className="sr-only" disabled={value.media.length >= POST_LIMITS.mediaMax} onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} /></label><span className="faint">{value.media.length}/{POST_LIMITS.mediaMax} images. PNG, JPEG, WebP or GIF, up to 8 MB each.</span></div>
      {busy.map((b, i) => <div key={i} className="upload-row" role="status"><span>{b.name}</span><progress max={1} value={b.pct} aria-label={`Uploading ${b.name}`} /><span className="faint">{Math.round(b.pct * 100)}%</span></div>)}
      {value.media.length > 0 && <ol className="plain attach-list" aria-label="Images, in the order they will appear">{value.media.map((m, i) => <li key={m.id} className="attach-item"><img src={m.url} alt={`Image ${i + 1}`} width="56" height="56" /><span className="grow">Image {i + 1}</span>
        <Button size="sm" variant="ghost" aria-label={`Move image ${i + 1} up`} disabled={i === 0} onClick={() => onChange({ ...value, media: move(value.media, i, -1) })}>↑</Button><Button size="sm" variant="ghost" aria-label={`Move image ${i + 1} down`} disabled={i === value.media.length - 1} onClick={() => onChange({ ...value, media: move(value.media, i, 1) })}>↓</Button>
        <Button size="sm" variant="ghost" aria-label={`Remove image ${i + 1}`} onClick={() => onChange({ ...value, media: value.media.filter((x) => x.id !== m.id) })}>Remove</Button></li>)}</ol>}</div>}
    {allowLinks ? <div className="stack-sm"><div className="row-wrap"><TextField label="Add a link" type="url" value={link} onChange={(e) => { setLink(e.target.value); setLinkErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} error={linkErr ?? undefined} placeholder="https://" /><Button type="button" variant="secondary" size="sm" onClick={addLink}>Add link</Button></div>
      {value.links.length > 0 && <ol className="plain attach-list" aria-label="Links, in the order they will appear">{value.links.map((l, i) => <li key={l} className="attach-item"><Icon name="external" size={16} /><span className="grow"><strong>{host(l)}</strong> <span className="faint">{l.length > 48 ? l.slice(0, 47) + '…' : l}</span></span>
        <Button size="sm" variant="ghost" aria-label={`Move link ${i + 1} up`} disabled={i === 0} onClick={() => onChange({ ...value, links: move(value.links, i, -1) })}>↑</Button><Button size="sm" variant="ghost" aria-label={`Move link ${i + 1} down`} disabled={i === value.links.length - 1} onClick={() => onChange({ ...value, links: move(value.links, i, 1) })}>↓</Button>
        <Button size="sm" variant="ghost" aria-label={`Remove link ${i + 1}`} onClick={() => onChange({ ...value, links: value.links.filter((x) => x !== l) })}>Remove</Button></li>)}</ol>}
      <p className="faint small">Links show their website name only; FREEVERSE doesn’t fetch or preview them. For documents or video, link to where they are hosted.</p></div>
      : <p className="faint">This community doesn’t allow external links.</p>}
    {err && <p className="error-text" role="alert">{err}</p>}
  </div>;
}
