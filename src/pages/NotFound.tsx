import { Card, EmptyState, LinkButton } from '../components/ui';
import { useApp } from '../app/context';

export function NotFound() {
  const { account } = useApp();
  return (
    <div className="stack-lg">
      <h1 id="page-title" className="sr-only">Page not found</h1>
      <Card>
        <EmptyState icon="compass" title="We can’t find that page" action={<LinkButton to={account ? '/home' : '/'} variant="primary">{account ? 'Go to Home' : 'Go to the welcome page'}</LinkButton>}>
          The link may be mistyped or the page may have moved.
        </EmptyState>
      </Card>
    </div>
  );
}
