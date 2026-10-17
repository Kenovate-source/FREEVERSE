import { useApp } from '../app/context';
import { useAsync } from '../hooks/useAsync';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, MockBadge, MockBanner, Notice, PageHeader, SkeletonCards } from '../components/ui';
import { Icon } from '../components/Icon';

export function Messages() {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getConversations(), [api, mode]);
  return (
    <div className="stack-lg">
      <PageHeader title="Messages" intro="Direct and group conversations with the people in your community." />
      <MockBanner title="Not available yet">Messaging is built in Stage 6. You can’t send or receive messages in this prototype. The conversations below are fictional samples that show how the inbox will look.</MockBanner>
      <div className="layout-2">
        <section aria-labelledby="inbox-h" className="stack">
          <div className="spread"><h2 id="inbox-h">Inbox preview</h2><MockBadge label="Sample conversations" /></div>
          {r.state.status === 'loading' && <SkeletonCards count={3} label="Loading conversations" />}
          {r.state.status === 'error' && <Card><ErrorState title="We couldn’t load the inbox preview" message={r.state.error.message} onRetry={r.reload} /></Card>}
          {r.state.status === 'success' && r.state.data.length === 0 && <Card><EmptyState icon="message" title="No conversations yet">When messaging launches, your conversations will appear here.</EmptyState></Card>}
          {r.state.status === 'success' && r.state.data.length > 0 && (
            <Card>
              <ul className="convo-list" aria-label="Sample conversations (read-only)">
                {r.state.data.map((c) => (
                  <li key={c.id} className="convo">
                    <Avatar name={c.name} hue={c.hue} />
                    <div className="convo-main" style={{ flex: 1 }}>
                      <div className="spread"><strong>{c.name}</strong><span className="faint">{c.time}</span></div>
                      <p className="muted">{c.preview}</p>
                    </div>
                    {c.unread > 0 && <Badge tone="cyan">{c.unread} new</Badge>}
                  </li>
                ))}
              </ul>
              <div className="composer" style={{ marginTop: 14 }}>
                <label htmlFor="msg-disabled" className="sr-only">Message (sending isn’t available yet)</label>
                <textarea id="msg-disabled" className="textarea" disabled placeholder="Sending messages isn’t available in this stage" />
                <Button variant="primary" icon="send" disabled>Send</Button>
              </div>
            </Card>
          )}
        </section>

        <aside className="stack" aria-label="About messaging">
          <Card as="section">
            <h2 style={{ marginBottom: 10 }}>What’s planned for v1</h2>
            <ul className="principles">
              <li><Icon name="message" size={18} /><span>One-to-one and group conversations, with images, files and reactions</span></li>
              <li><Icon name="shield" size={18} /><span>Message requests: new contacts need your approval before they can keep writing</span></li>
              <li><Icon name="video" size={18} /><span>Voice and video calls through a trusted third-party provider</span></li>
              <li><Icon name="users" size={18} /><span>No anonymous messaging, ever. Every message shows who sent it</span></li>
            </ul>
          </Card>
          <Notice icon="lock"><strong>Honest about privacy.</strong> v1 messages will be encrypted in transit and at rest, but not end-to-end encrypted. That lets moderators review a message that’s been reported. We will not describe messaging as end-to-end encrypted until it is.</Notice>
        </aside>
      </div>
    </div>
  );
}
