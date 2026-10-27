import type { ReactNode } from 'react';
import { Link } from './router';

// A deliberately tiny renderer for the legal drafts: headings, paragraphs, lists, blockquotes, **bold**, [text](#/path).
// It builds React elements (never HTML strings), so document text cannot inject markup.
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /\*\*([^*]+)\*\*|\[\[PLACEHOLDER([^\]]*)\]\]|\[([^\]]+)\]\(#(\/[^)]*)\)/g; let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${key}b${i}`}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<mark key={`${key}p${i}`} className="legal-placeholder">[[PLACEHOLDER{m[2]}]]</mark>);
    else out.push(<Link key={`${key}l${i}`} to={m[4] ?? '/'}>{m[3]}</Link>);
    last = m.index + m[0].length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n'); const out: ReactNode[] = []; let i = 0; let k = 0;
  while (i < lines.length) {
    const l = lines[i] ?? '';
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,3}) (.*)$/.exec(l);
    if (h) { const Tag = (`h${(h[1] ?? '#').length + 0}`) as 'h1' | 'h2' | 'h3'; out.push(<Tag key={k++}>{inline(h[2] ?? '', `h${k}`)}</Tag>); i++; continue; }
    if (l.startsWith('> ')) { const buf: string[] = []; while (i < lines.length && (lines[i] ?? '').startsWith('> ')) { buf.push((lines[i] ?? '').slice(2)); i++; } out.push(<blockquote key={k++} className="legal-draft">{inline(buf.join(' '), `q${k}`)}</blockquote>); continue; }
    if (/^\s*(- |\d+\. )/.test(l)) {
      const ordered = /^\s*\d+\. /.test(l); const items: ReactNode[] = [];
      while (i < lines.length && /^\s*(- |\d+\. )/.test(lines[i] ?? '')) { items.push(<li key={i}>{inline((lines[i] ?? '').replace(/^\s*(- |\d+\. )/, ''), `li${i}`)}</li>); i++; }
      out.push(ordered ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>); continue;
    }
    const buf: string[] = []; while (i < lines.length && (lines[i] ?? '').trim() && !/^(#{1,3} |> |\s*- |\s*\d+\. )/.test(lines[i] ?? '')) { buf.push(lines[i] ?? ''); i++; }
    out.push(<p key={k++}>{inline(buf.join(' '), `p${k}`)}</p>);
  }
  return <>{out}</>;
}
