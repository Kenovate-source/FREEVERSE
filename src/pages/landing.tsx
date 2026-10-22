import { Link } from '../lib/router';
import { Icon } from '../ui/Icon';
import { UNIVERSES, UNIVERSE_STATUS_LABEL } from '../../shared/universes';
import { ARCHETYPE_LIST } from '../../shared/archetypes';
import { useSession } from '../state/session';
import { Badge } from '../ui/kit';

const PRINCIPLES: { icon: string; title: string; text: string }[] = [
  { icon: 'lock', title: 'Private by default', text: 'Every part of your profile has its own audience: Everyone, Members, Connections or Only me. The server enforces it, not just the screen.' },
  { icon: 'mask', title: 'Anonymous, not unaccountable', text: 'In spaces that allow it you can post without your name. Other members never see who you are. Moderators can only look behind it with a recorded reason and a second confirmation.' },
  { icon: 'clock', title: 'A feed in plain order', text: 'Recent shows newest first. Relevant tells you exactly why each post is ranked where it is. There is no hidden engagement score.' },
  { icon: 'shield', title: 'Adults aged 18–24', text: 'Eligibility is checked on the server from a self-declared birth date. We keep only the month and year, and we do not call self-declaration “verified”.' },
];

export function Landing() {
  const { config } = useSession();
  return (
    <div className="landing">
      <header className="land-top">
        <Link to="/" className="brand"><img src="./brand/emblem-96.png" alt="" width="44" height="44" /><span className="brand-name">FREEVERSE</span></Link>
        <nav className="row" aria-label="Site"><Link to="/trust">How trust works</Link><Link to="/signin" className="btn btn-ghost btn-sm">Sign in</Link><Link to="/signup" className="btn btn-primary btn-sm">Create account</Link></nav>
      </header>

      <section className="land-hero">
        <div className="stack-lg">
          <Badge tone="cyan">For adults aged 18–24</Badge>
          <h1>A trusted space to connect, learn, work and grow.</h1>
          <p className="lede">FREEVERSE is a modular ecosystem built around trust: private by default, honest about what it is, and designed for your long-term wellbeing rather than your screen time.</p>
          <div className="row-wrap"><Link to="/signup" className="btn btn-primary">Create your account <Icon name="arrowRight" size={18} /></Link><Link to="/trust" className="btn btn-secondary">See how trust works</Link></div>
          {config?.auth.kind === 'dev' && <p className="faint">This build runs in local development mode: accounts are local and demo content is clearly labelled.</p>}
        </div>
        <img className="land-art" src="./brand/lockup-960.png" alt="The FREEVERSE emblem: an orbiting ring around a bright core." width="480" height="320" />
      </section>

      <section aria-labelledby="pr" className="land-section">
        <h2 id="pr">What you can count on</h2>
        <ul className="grid-cards">{PRINCIPLES.map((p) => <li key={p.title} className="card stack-sm"><Icon name={p.icon} size={24} style={{ color: 'var(--cyan)' }} /><h3>{p.title}</h3><p className="muted">{p.text}</p></li>)}</ul>
      </section>

      <section aria-labelledby="id" className="land-section">
        <h2 id="id">Come as one person, or several</h2>
        <p className="muted lede-sm">Choose the identities that fit you: each one changes your home, tools and profile sections. Add or remove them any time without touching your account.</p>
        <ul className="chip-cloud">{ARCHETYPE_LIST.map((a) => <li key={a.id} className="chip-static" style={{ borderColor: a.accent }}><span aria-hidden="true">{a.icon}</span> {a.label}</li>)}</ul>
      </section>

      <section aria-labelledby="un" className="land-section">
        <h2 id="un">Fifteen Universes, honestly labelled</h2>
        <p className="muted lede-sm">FREEVERSE grows one Universe at a time. This is what exists today and what does not.</p>
        <ul className="grid-cards compact">{UNIVERSES.map((u) => (
          <li key={u.id} className="card stack-sm" style={{ borderTop: `3px solid ${u.accent}` }}><div className="spread"><strong>{u.name}</strong><Badge tone={u.status === 'available' || u.status === 'partial' ? 'ok' : undefined}>{UNIVERSE_STATUS_LABEL[u.status]}</Badge></div><p className="muted">{u.tagline}</p></li>
        ))}</ul>
      </section>

      <footer className="land-foot">
        <p className="faint">FREEVERSE · Stage 2 build for the web. Demo content is labelled “Demo”. No claim is made about mobile apps or public APIs. </p>
        <p className="row-wrap"><Link to="/trust">How trust works</Link><Link to="/signin">Sign in</Link><Link to="/signup">Create account</Link></p>
      </footer>
    </div>
  );
}

export function Trust() {
  const { status } = useSession();
  return (
    <div className="landing"><header className="land-top"><Link to={status === 'in' ? '/home' : '/'} className="brand"><img src="./brand/emblem-96.png" alt="" width="44" height="44" /><span className="brand-name">FREEVERSE</span></Link><Link to={status === 'in' ? '/home' : '/signup'} className="btn btn-primary btn-sm">{status === 'in' ? 'Back to the app' : 'Create account'}</Link></header>
    <main id="main" className="prose land-section" tabIndex={-1}>
      <h1 id="page-title" tabIndex={-1}>How trust works here</h1>
      <p className="muted">Plain language about what FREEVERSE does with your information and who can see what.</p>
      <h2>Who can use it</h2><p>FREEVERSE is for adults aged 18–24. Eligibility is checked on the server from the birth date you give. We store only your birth month and year, never the day, and we show only a coarse age range, which is private by default. This is self-declaration, not identity verification, and we do not describe it as verified.</p>
      <h2>Who sees your profile</h2><p>Each field has its own audience (Everyone, Members, Connections, Only me) and some sensitive fields cannot be set to Everyone. Fields hidden from someone are not sent to their device at all.</p>
      <h2>Anonymous posts and comments</h2><p>Where a community allows it, you can post or comment without your name. Other members see only an alias such as “Anonymous member 3”. We still record who wrote it so we can stop abuse and honour account deletion. Moderators cannot see it in the normal queue. Revealing an author requires a specific permission the Founder does not hold, a written reason, a second confirmation and an audit record.</p>
      <h2>Moderation</h2><p>Reports go to a queue that shows only what is needed. Reviewers see the reported content only with a recorded reason. Appeals are decided by a different moderator. Response targets are internal goals, not promises.</p>
      <h2>Governance and private data</h2><p>FREEVERSE has a governance structure of one Founder, three Council members, seven High Council, twelve Directors and twenty-four Guardians. A title does not unlock anyone’s private messages, journals or conversations. Access is separate, specific and audited.</p>
      <h2>Nova and your private journal</h2><p>Nova’s journal, goals and habits are off until you turn them on, are private to you, and are never posted for you. If no AI provider is configured, Nova says so plainly and does not pretend. Conversations the safety layer flags for possible crisis are kept for a limited, disclosed period (30 days by default) so a person can review them, and then removed.</p>
      <h2>Deleting your account</h2><p>You can export your data and delete your account. Your posts, comments and profile are removed. Messages you sent stay for the people you wrote to, shown under “Deleted account”. Safety records that must be kept are listed on the deletion screen before you confirm.</p>
      <h2>What this build is not</h2><p>This is the web version only. Demo members and listings are labelled “Demo”. Sign-in, the database, file storage and the AI provider each work only once their credentials are configured and checked; the app tells you which are not.</p>
    </main></div>
  );
}
