import { useState } from 'react';
import { useApp } from '../app/context';
import { useAsync } from '../hooks/useAsync';
import { Badge, Card, EmptyState, ErrorState, LinkButton, MockBanner, PageHeader, Segmented, SkeletonGrid, SkeletonCards, Notice } from '../components/ui';
import { Icon } from '../components/Icon';
import { Link } from '../lib/router';
import type { LearnItem, LearnType } from '../types';

const TYPE_LABEL: Record<LearnType, string> = { article: 'Article', video: 'Video', path: 'Path' };
const TYPE_ICON = { article: 'learn', video: 'video', path: 'compass' } as const;

export function Learn() {
  const { api, mode } = useApp();
  const [type, setType] = useState<'all' | LearnType>('all');
  const r = useAsync(() => api.getLearn(type === 'all' ? {} : { type }), [api, mode, type]);

  return (
    <div className="stack-lg">
      <PageHeader title="Learn" intro="Short, practical lessons chosen by the FREEVERSE team. Follow a path, or pick one thing to learn today." />
      <MockBanner>These are sample lessons. Videos are placeholders with no media attached, and there is no progress tracking yet.</MockBanner>
      <Segmented<'all' | LearnType> label="Filter by type" value={type} onChange={setType} options={[
        { value: 'all', label: 'All' }, { value: 'article', label: 'Articles' }, { value: 'video', label: 'Videos' }, { value: 'path', label: 'Paths' },
      ]} />
      <section aria-labelledby="learn-list-h" aria-live="polite">
        <h2 id="learn-list-h" className="sr-only">Lessons</h2>
        {r.state.status === 'loading' && <SkeletonGrid label="Loading lessons" />}
        {r.state.status === 'error' && <Card><ErrorState title="We couldn’t load lessons" message={r.state.error.message} onRetry={r.reload} /></Card>}
        {r.state.status === 'success' && r.state.data.length === 0 && (
          <Card><EmptyState icon="learn" title="No lessons here yet" action={type !== 'all' ? <button type="button" className="btn btn-secondary" onClick={() => setType('all')}>Show all lessons</button> : undefined}>
            {type === 'all' ? 'New lessons are added by the FREEVERSE team. Check back soon.' : 'Nothing matches this filter right now.'}
          </EmptyState></Card>
        )}
        {r.state.status === 'success' && r.state.data.length > 0 && (
          <ul className="grid-cards">
            {r.state.data.map((l) => <li key={l.id}><LearnCard item={l} /></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

function LearnCard({ item }: { item: LearnItem }) {
  return (
    <Card as="article" className="item-card">
      <div className="row-wrap">
        <Badge tone={item.type === 'path' ? 'violet' : 'cyan'}><Icon name={TYPE_ICON[item.type]} size={14} />{TYPE_LABEL[item.type]}</Badge>
        <Badge>{item.level}</Badge>
      </div>
      <h3><Link to={`/learn/${item.id}`}>{item.title}</Link></h3>
      <p className="muted">{item.summary}</p>
      <div className="meta"><span>{item.category}</span><span>{item.minutes} min</span></div>
    </Card>
  );
}

export function LearnItemPage({ id }: { id: string }) {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getLearnItem(id), [api, mode, id]);

  return (
    <div className="stack-lg">
      <div><LinkButton to="/learn" icon="arrowLeft" variant="ghost" size="sm">All lessons</LinkButton></div>
      {r.state.status === 'loading' && <><h1 id="page-title" className="sr-only">Loading lesson</h1><SkeletonCards count={1} label="Loading lesson" /></>}
      {r.state.status === 'error' && (
        <>
          <h1 id="page-title" className="sr-only">Lesson unavailable</h1>
          <Card><ErrorState title={r.state.error.message.includes('find') ? 'Lesson not found' : 'We couldn’t load this lesson'} message={r.state.error.message} onRetry={r.state.error.message.includes('find') ? undefined : r.reload} /></Card>
        </>
      )}
      {r.state.status === 'success' && <Detail item={r.state.data} />}
    </div>
  );
}

function Detail({ item }: { item: LearnItem }) {
  return (
    <article className="stack-lg">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="row-wrap">
          <Badge tone={item.type === 'path' ? 'violet' : 'cyan'}>{TYPE_LABEL[item.type]}</Badge><Badge>{item.level}</Badge><Badge>{item.category}</Badge><Badge><Icon name="clock" size={14} />{item.minutes} min</Badge>
        </div>
        <h1 id="page-title">{item.title}</h1>
        <p>{item.summary}</p>
      </header>
      {item.type === 'video' && (
        <Card>
          <EmptyState icon="video" title="No video attached in this prototype">
            In the live product the lesson video plays here. The written outline below is sample content.
          </EmptyState>
        </Card>
      )}
      {item.body && <div className="prose">{item.body.map((p, i) => <p key={i}>{p}</p>)}</div>}
      {item.steps && (
        <section aria-labelledby="steps-h" className="stack">
          <h2 id="steps-h">Steps in this path</h2>
          <ol className="steps">
            {item.steps.map((s) => (
              <li key={s.title}>
                <span>{s.title}{s.itemId && <> · <Link to={`/learn/${s.itemId}`}>Open lesson</Link></>}</span>
              </li>
            ))}
          </ol>
          <Notice>Steps without a link are planned content that hasn’t been added yet. Progress tracking isn’t part of this stage.</Notice>
        </section>
      )}
    </article>
  );
}
