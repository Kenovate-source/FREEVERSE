import { Link } from '../lib/router';
import { Markdown } from '../lib/markdown';
import { LEGAL_DOCS, LEGAL_DOC_IDS, placeholderCount, type LegalDocId } from '../../shared/legal';
import { LEGAL_STATUS } from '../../shared/constants';
import { useSession } from '../state/session';
import { Notice } from '../ui/kit';

function LegalPage({ id }: { id: LegalDocId }) {
  const { status } = useSession(); const doc = LEGAL_DOCS[id]; const n = placeholderCount(id);
  return (
    <div className="landing">
      <header className="land-top"><Link to={status === 'in' ? '/home' : '/'} className="brand"><img src="./brand/emblem-96.png" alt="" width="44" height="44" /><span className="brand-name">FREEVERSE</span></Link>
        <nav className="row" aria-label="Legal documents">{LEGAL_DOC_IDS.map((d) => <Link key={d} to={LEGAL_DOCS[d].path} aria-current={d === id ? 'page' : undefined}>{LEGAL_DOCS[d].title}</Link>)}</nav></header>
      <main id="main" className="prose land-section" tabIndex={-1}>
        {LEGAL_STATUS === 'draft' && <Notice tone="warn" title="Draft for legal review">This document is a draft and is not final. It has {n} open placeholder{n === 1 ? '' : 's'} to complete before launch.</Notice>}
        <Markdown source={doc.md.replace(/^# .*\n/, '')} />
      </main>
    </div>
  );
}
export const TermsPage = () => <LegalPage id="terms" />;
export const PrivacyPage = () => <LegalPage id="privacy" />;
export const RulesPage = () => <LegalPage id="community_rules" />;
