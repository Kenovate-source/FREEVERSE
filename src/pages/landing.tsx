import { useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router';
import { Icon } from '../ui/Icon';
import { UNIVERSES, UNIVERSE_STATUS_LABEL } from '../../shared/universes';
import { ARCHETYPE_LIST } from '../../shared/archetypes';
import { useSession } from '../state/session';
import { Badge } from '../ui/kit';
import { CHAPTERS } from '../lib/journey';
import { OrbitArt } from '../features/journey/OrbitArt';
import { useScene } from '../features/journey/useScene';
import { useMotion } from '../motion/react';
import { getStoredA11y, setDecorativeMotion } from '../state/a11y';

const U = (id: string) => UNIVERSES.find((u) => u.id === id)!;
const statusTone = (s: string) => (s === 'available' || s === 'partial' ? 'ok' : undefined);

function MotionControl({ compact = false }: { compact?: boolean }) {
  const m = useMotion();
  const set = (v: 'auto' | 'full' | 'reduced' | 'off') => { setDecorativeMotion(v); };
  return (
    <div className={`motion-ctl${compact ? ' compact' : ''}`} role="group" aria-label="Decorative motion">
      <span className="motion-ctl-label">Motion</span>
      {([['full', 'full', 'Full'], ['reduced', 'less', 'Less'], ['off', 'off', 'Off']] as const).map(([v, lv, l]) => <button key={v} type="button" className="motion-opt" data-level={lv} aria-pressed={m.level === lv} onClick={() => set(v)}>{l}</button>)}
      <span className="sr-only" role="status">{m.reason}</span>
    </div>
  );
}

export function Landing() {
  const { status } = useSession(); const motion = useMotion();
  const stage = useRef<HTMLDivElement>(null); const journey = useRef<HTMLElement>(null); const labelRefs = useRef<Record<string, HTMLElement>>({});
  const scene = useScene(stage, journey, labelRefs);
  const [active, setActive] = useState(0);
  const signedIn = status === 'in';

  useEffect(() => {
    const root = document.documentElement; root.classList.add('js-reveal');
    const secs = Array.from(journey.current?.querySelectorAll<HTMLElement>(':scope > [data-chapter]') ?? []);
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { const i = secs.indexOf(e.target as HTMLElement); if (i >= 0) { setActive(i); if (stage.current) stage.current.dataset.chapter = String(i); } } }, { rootMargin: '-45% 0px -45% 0px' });
    secs.forEach((s) => io.observe(s));
    const rv = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { (e.target as HTMLElement).classList.add('in'); rv.unobserve(e.target); } }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((n) => rv.observe(n));
    return () => { io.disconnect(); rv.disconnect(); root.classList.remove('js-reveal'); };
  }, []);

  const go = (i: number) => { const el = journey.current?.querySelector<HTMLElement>(`:scope > [data-chapter="${i}"]`); el?.scrollIntoView({ behavior: motion.mode === 'off' || motion.mode === 'calm' ? 'auto' : 'smooth', block: 'start' }); };
  const cta = signedIn ? <Link to="/home" className="btn btn-primary">Open FREEVERSE <Icon name="arrowRight" size={18} /></Link> : <Link to="/signup" className="btn btn-primary">Create your account <Icon name="arrowRight" size={18} /></Link>;
  const knowledge = ['freelearn', 'freeresearch', 'freelabs', 'freeai'].map(U);
  const work = ['freework', 'freebuild', 'freefinance', 'freemarket'].map(U);

  return (
    <div className="landing journey-page" data-scene={scene.state} data-motion-view={motion.mode}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div className="journey-stage" ref={stage} aria-hidden="true" data-chapter="0">
        <div className="orbit-art-wrap"><OrbitArt /></div>
        <div className="journey-scrim" />
      </div>
      <div className="scene-labels" aria-hidden="true">
        {UNIVERSES.map((u) => <a key={u.id} className="scene-label" tabIndex={-1} href={`#/universes/${u.id}`} style={{ ['--accent' as string]: u.accent }} ref={(el) => { if (el) labelRefs.current[u.id] = el; }} onMouseEnter={() => scene.setHover(u.id)} onMouseLeave={() => scene.setHover(null)}>{u.name}</a>)}
      </div>

      <header className="j-top">
        <Link to="/" className="brand"><img src="./brand/emblem-96.png" alt="" width="40" height="40" /><span className="brand-name">FREEVERSE</span></Link>
        <nav className="j-nav" aria-label="Site"><button type="button" className="link-btn" onClick={() => go(2)}>Universes</button><button type="button" className="link-btn" onClick={() => go(7)}>Trust</button><Link to="/rules">Rules</Link></nav>
        <div className="j-actions"><MotionControl compact />{signedIn ? <Link to="/home" className="btn btn-primary btn-sm">Open FREEVERSE</Link> : <><Link to="/signin" className="btn btn-ghost btn-sm">Sign in</Link><Link to="/signup" className="btn btn-primary btn-sm">Create account</Link></>}</div>
      </header>
      <nav className="chapter-rail" aria-label="Journey chapters"><ol>{CHAPTERS.map((c, i) => <li key={c.id}><button type="button" aria-label={`${i + 1}. ${c.label}`} aria-current={active === i ? 'step' : undefined} onClick={() => go(i)}><span className="rail-dot" /><span className="rail-label">{c.label}</span></button></li>)}</ol></nav>
      <div className="journey-progress" aria-hidden="true"><span style={{ transform: `scaleX(${(active + 1) / CHAPTERS.length})` }} /></div>

      <main id="main" className="journey" ref={journey} tabIndex={-1}>
        {/* 0 — Vision: the core, the ring, one sentence */}
        <section data-chapter="0" className="ch ch-vision" aria-labelledby="h-vision">
          <div className="ch-copy">
            <Badge tone="cyan">For adults aged 18 and over</Badge>
            <h1 id="h-vision" className="reveal">One connected universe for learning, opportunity and creativity.</h1>
            <p className="lede reveal">FREEVERSE brings people, identities, communities, knowledge, work, play and AI into one trusted place, designed around your long-term wellbeing rather than your screen time.</p>
            <div className="row-wrap reveal">{cta}<button type="button" className="btn btn-secondary" onClick={() => go(1)}>Take the tour <Icon name="arrowRight" size={18} /></button></div>
            <p className="faint reveal">Early access: some Universes are previews, and each one says so.</p>
          </div>
          <button type="button" className="scroll-cue" onClick={() => go(1)} aria-label="Scroll to the next section"><span aria-hidden="true">Scroll</span><Icon name="arrowRight" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
        </section>

        {/* 1 — Identity: one person, several rings */}
        <section data-chapter="1" className="ch ch-identity" aria-labelledby="h-identity">
          <div className="ch-copy ch-right">
            <p className="eyebrow reveal">Citizens and identities</p>
            <h2 id="h-identity" className="reveal">You arrive as one person. You can live as several.</h2>
            <p className="lede reveal">Add the identities that fit you, such as student, builder, creator or explorer. Each one reshapes your home, tools and profile, while your account, privacy and safety stay yours.</p>
            <ul className="chip-cloud reveal" aria-label="Some of the identities">{ARCHETYPE_LIST.map((a) => <li key={a.id} className="chip-static" style={{ borderColor: a.accent }}><span aria-hidden="true">{a.icon}</span> {a.label}</li>)}</ul>
          </div>
        </section>

        {/* 2 — Universes: the constellation, centre stage */}
        <section data-chapter="2" className="ch ch-universes" aria-labelledby="h-universes">
          <div className="ch-copy ch-center">
            <p className="eyebrow reveal">The connected ecosystem</p>
            <h2 id="h-universes" className="reveal">Fifteen Universes, linked by what they share.</h2>
            <p className="lede reveal">Lines between Universes are real: a lesson leads to a project, a project to an opportunity, an event to a community.</p>
          </div>
          <div className="constellation-gap" aria-hidden="true" />
        </section>
        <div className="universe-list-wrap">
          <ul className="universe-list reveal" aria-label="All fifteen Universes">{UNIVERSES.map((u) => <li key={u.id} style={{ ['--accent' as string]: u.accent }}><Link to={`/universes/${u.id}`}><strong>{u.name}</strong><span>{u.tagline}</span></Link><Badge tone={statusTone(u.status)}>{UNIVERSE_STATUS_LABEL[u.status]}</Badge></li>)}</ul>
        </div>

        {/* 3 — Learning, research, creativity, AI: a vertical path */}
        <section data-chapter="3" className="ch ch-knowledge" aria-labelledby="h-knowledge">
          <div className="ch-copy">
            <p className="eyebrow reveal">Learning, research, creativity and AI</p>
            <h2 id="h-knowledge" className="reveal">Learn it. Research it. Make it. Ask for help.</h2>
            <ol className="path-list">{knowledge.map((u, i) => <li key={u.id} className="reveal" style={{ ['--accent' as string]: u.accent }}><span className="path-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div><h3>{u.name}</h3><p className="muted">{u.description}</p></div></li>)}</ol>
            <p className="muted reveal">Nova is a companion for reflection and planning. Alongside it, nine AI specialists include Creativity &amp; Design. They are AI, they say so, and they can be wrong.</p>
          </div>
        </section>

        {/* 4 — Communities and communication: a conversation */}
        <section data-chapter="4" className="ch ch-community" aria-labelledby="h-community">
          <div className="ch-copy ch-right">
            <p className="eyebrow reveal">Communities, communication and collaboration</p>
            <h2 id="h-community" className="reveal">Find your people. Say it your way.</h2>
            <p className="lede reveal">Join communities, follow in a plain chronological feed, message with requests and mutual read receipts, or post anonymously where a community allows it. Anonymous means other members never see your name; moderators can still act on reports.</p>
            <div className="bubbles reveal" role="img" aria-label="Illustration of a conversation: a question, an answer and a thank-you"><span className="bubble a">Anyone else stuck on this week’s problem set?</span><span className="bubble b">Yes! Study circle at 6. Join us.</span><span className="bubble c">Thank you, that helped.</span></div>
          </div>
        </section>

        {/* 5 — Work, opportunity, enterprise, commerce: sideways exploration */}
        <section data-chapter="5" className="ch ch-work" aria-labelledby="h-work">
          <div className="ch-copy">
            <p className="eyebrow reveal">Work, opportunity, enterprise and commerce</p>
            <h2 id="h-work" className="reveal">From first step to your own venture.</h2>
          </div>
          <div className="hscroll reveal" role="region" aria-label="Work and enterprise Universes, scroll sideways" tabIndex={0}>
            {work.map((u) => <article key={u.id} className="hcard" style={{ ['--accent' as string]: u.accent }}><Badge tone={statusTone(u.status)}>{UNIVERSE_STATUS_LABEL[u.status]}</Badge><h3>{u.name}</h3><p className="muted">{u.description}</p><ul className="tick-list">{u.today.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul></article>)}
          </div>
          <p className="faint ch-copy reveal">Payments and escrow are not built. FreeMarket has listings and requests only.</p>
        </section>

        {/* 6 — Media, entertainment, play, events: a bento of the content itself */}
        <section data-chapter="6" className="ch ch-media" aria-labelledby="h-media">
          <div className="ch-copy ch-right">
            <p className="eyebrow reveal">Media, entertainment, play and events</p>
            <h2 id="h-media" className="reveal">Make things. Play something. Show up.</h2>
          </div>
          <div className="bento">
            <article className="bento-a reveal" style={{ ['--accent' as string]: U('freeplay').accent }}><h3>FreePlay</h3><p className="muted">Four single-player games, personal bests and an opt-in leaderboard. Multiplayer is not built.</p><Link to="/universes/freeplay" className="btn btn-secondary btn-sm">Open FreePlay</Link></article>
            <article className="bento-b reveal" style={{ ['--accent' as string]: U('freemedia').accent }}><h3>FreeMedia</h3><p className="muted">Share articles, photos and creative work with real uploads and previews.</p></article>
            <article className="bento-c reveal" style={{ ['--accent' as string]: U('freeevents').accent }}><h3>FreeEvents</h3><p className="muted">Workshops and meetups with RSVP.</p></article>
            <article className="bento-d reveal" style={{ ['--accent' as string]: U('freeentertainment').accent }}><h3>FreeEntertainment</h3><p className="muted">Recommendations, watch-lists and discussion. No video hosting yet; links only.</p></article>
          </div>
        </section>

        {/* 7 — Trust, safety, privacy, governance: concentric, steady */}
        <section data-chapter="7" className="ch ch-trust" aria-labelledby="h-trust">
          <div className="ch-copy ch-center">
            <p className="eyebrow reveal">Trust, safety, privacy and governance</p>
            <h2 id="h-trust" className="reveal">A universe you can rely on.</h2>
            <p className="lede reveal">Governance is open about its shape: a Founder, then 1, 3, 7, 12 and 24 seats, then every member. A title is never a key to your private messages.</p>
          </div>
          <ul className="promises">
            <li className="reveal"><Icon name="lock" size={22} /><h3>Private by default</h3><p className="muted">Every part of your profile has its own audience, enforced on the server.</p></li>
            <li className="reveal"><Icon name="mask" size={22} /><h3>Anonymous, not unaccountable</h3><p className="muted">Reveal needs an authorised moderator, a documented case, a reason, and leaves an audit trail. The Founder role does not include it.</p></li>
            <li className="reveal"><Icon name="clock" size={22} /><h3>No hidden score</h3><p className="muted">Recent shows newest first. Relevant tells you why each post is ranked where it is.</p></li>
            <li className="reveal"><Icon name="shield" size={22} /><h3>Honest about age</h3><p className="muted">18 and over, self-declared. We keep only month and year and never call it “verified”.</p></li>
          </ul>
          <p className="ch-copy ch-center row-wrap reveal"><Link to="/trust" className="btn btn-secondary btn-sm">How trust works</Link><Link to="/terms" className="btn btn-ghost btn-sm">Terms (draft)</Link><Link to="/privacy" className="btn btn-ghost btn-sm">Privacy (draft)</Link><Link to="/rules" className="btn btn-ghost btn-sm">Community rules (draft)</Link></p>
        </section>

        {/* 8 — Invitation */}
        <section data-chapter="8" className="ch ch-invite" aria-labelledby="h-invite">
          <div className="ch-copy ch-center">
            <h2 id="h-invite" className="reveal">Step in.</h2>
            <p className="lede reveal">Create an account, tell us you are 18 or over, choose the identities that fit, and start wherever you like.</p>
            <div className="row-wrap center reveal">{cta}{!signedIn && <Link to="/signin" className="btn btn-secondary">I already have an account</Link>}</div>
            <p className="faint reveal">By continuing you will be asked to accept our Terms, Privacy Policy and Community rules (currently drafts pending legal review).</p>
          </div>
        </section>
      </main>

      <footer className="land-foot">
        <p className="faint">FREEVERSE · web build. Demo content is labelled “Demo”. {scene.state === 'ready' ? '3D scene running.' : ''}</p>
        <p className="row-wrap legal-links"><Link to="/trust">How trust works</Link><Link to="/terms">Terms (draft)</Link><Link to="/privacy">Privacy (draft)</Link><Link to="/rules">Community rules (draft)</Link>{!signedIn && <Link to="/signin">Sign in</Link>}</p>
        <MotionControl />
      </footer>
      <noscript><p className="faint" style={{ padding: '1rem' }}>FREEVERSE needs JavaScript to run. The story above is readable without it.</p></noscript>
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
      <h2>Who can use it</h2><p>FREEVERSE is for adults aged 18 and over. Eligibility is checked on the server from the birth date you give. We store only your birth month and year, never the day, and we show only a coarse age range, which is private by default. This is self-declaration, not identity verification, and we do not describe it as verified.</p>
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
