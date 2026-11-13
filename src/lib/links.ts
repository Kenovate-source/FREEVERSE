// Link handling for messages. Nothing is fetched: we only read the text of the address and say plainly what looks unusual about it.
export interface LinkPart { text: string; url?: string }
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
export function splitLinks(body: string): LinkPart[] {
  const out: LinkPart[] = []; let last = 0;
  for (const m of body.matchAll(URL_RE)) {
    const raw = m[0]; const trimmed = raw.replace(/[.,;:!?)\]]+$/, ''); const i = m.index ?? 0;
    if (i > last) out.push({ text: body.slice(last, i) });
    out.push({ text: trimmed, url: trimmed }); last = i + trimmed.length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}
const SHORTENERS = new Set(['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at']);
export interface LinkCheck { host: string; warnings: string[] }
/** Reasons an address deserves a second look. An empty list does not mean it is safe: it only means none of these patterns matched. */
export function checkLink(url: string): LinkCheck | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase(); const w: string[] = [];
  if (u.protocol !== 'https:') w.push('It doesn’t use a secure connection (https).');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) w.push('It points to a numbered address instead of a name.');
  if (host.split('.').some((p) => p.startsWith('xn--'))) w.push('The name uses look-alike characters from another alphabet.');
  if (SHORTENERS.has(host)) w.push('It is a shortened link, so the real destination is hidden.');
  if (u.username || u.password) w.push('It contains a username or password before the address, a common trick.');
  if (host.split('.').length > 4) w.push('The name has an unusually long chain of parts.');
  return { host, warnings: w };
}
