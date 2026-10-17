import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useApp } from '../app/context';
import { Button, Card, MockBanner, Notice, PageHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { NOVA_SCRIPT } from '../data/mock';

interface Msg { id: number; from: 'me' | 'nova'; text: string }
const SUGGESTIONS = ['Help me plan something I want to learn', 'I’m looking for an internship', 'How do I ask someone to be my mentor?'];

export function Nova() {
  const { api } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'nova', text: NOVA_SCRIPT.intro }]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<{ text: string; failed: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs, thinking]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || thinking) return;
    setError(null);
    setMsgs((m) => [...m, { id: nextId.current++, from: 'me', text: t }]);
    setDraft('');
    setThinking(true);
    try {
      const r = await api.novaReply(t);
      setMsgs((m) => [...m, { id: nextId.current++, from: 'nova', text: r.text }]);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : 'Nova couldn’t reply.', failed: t });
    } finally { setThinking(false); }
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); void send(draft); }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }

  return (
    <div className="stack-lg">
      <PageHeader title="Nova" intro="A supportive companion for reflecting, learning and planning your next step." />
      <MockBanner title="Scripted mock, not AI">Nova’s replies here are pre-written and chosen by simple keywords. There is no AI model and no safety system behind this screen, and your messages aren’t saved or sent anywhere. Real conversations arrive in Stage 5.</MockBanner>
      <div className="layout-2">
        <Card as="section" aria-label="Conversation with Nova" className="chat">
          <div ref={logRef} className="chat-log" role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Conversation">
            {msgs.map((m) => (
              <div key={m.id} className={`bubble ${m.from === 'me' ? 'bubble-me' : 'bubble-them'}`}>
                <span className="sr-only">{m.from === 'me' ? 'You: ' : 'Nova: '}</span>{m.text}
                {m.from === 'nova' && <small>Scripted mock reply</small>}
              </div>
            ))}
            {thinking && <div className="bubble bubble-them" role="status"><span className="muted">Nova is typing…</span></div>}
          </div>
          {error && (
            <div role="alert" className="stack-sm" style={{ marginBottom: 10 }}>
              <p className="error-text">{error.text}</p>
              <div><Button size="sm" icon="refresh" onClick={() => void send(error.failed)}>Try sending again</Button></div>
            </div>
          )}
          <div className="stack-sm">
            <div className="row-wrap" aria-label="Suggested starters">
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => { setDraft(s); inputRef.current?.focus(); }}>{s}</button>)}
            </div>
            <form onSubmit={onSubmit} className="composer">
              <label htmlFor="nova-input" className="sr-only">Message Nova</label>
              <textarea id="nova-input" ref={inputRef} className="textarea" placeholder="Write a message…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} rows={1} />
              <Button type="submit" variant="primary" icon="send" disabled={thinking || !draft.trim()}>Send</Button>
            </form>
            <p className="faint">Enter to send, Shift+Enter for a new line.</p>
          </div>
        </Card>

        <aside className="stack" aria-label="About Nova">
          <Card as="section">
            <h2 style={{ marginBottom: 10 }}>What Nova can help with</h2>
            <ul className="principles">
              <li><Icon name="check" size={18} /><span>Thinking through a situation or a decision</span></li>
              <li><Icon name="check" size={18} /><span>Learning, goals and planning small steps</span></li>
              <li><Icon name="check" size={18} /><span>Finding lessons, opportunities and mentors on FREEVERSE</span></li>
            </ul>
          </Card>
          <Notice icon="info"><strong>What Nova is not.</strong> Nova isn’t a therapist, counsellor or crisis service. It doesn’t diagnose, or give medical, legal or financial advice, and it will always encourage you to reach real people when that’s what you need.</Notice>
          <Notice icon="alert"><strong>If you or someone near you is in danger,</strong> contact your local emergency services or a crisis line in your country. This prototype can’t detect emergencies.</Notice>
          <Notice icon="lock">In the live product, Nova conversations are private by default. A conversation flagged for possible crisis can be reviewed by a human moderator so you can be helped.</Notice>
        </aside>
      </div>
    </div>
  );
}
