import { useEffect, useRef, useState } from 'react';
import { Avatar, AVATAR_COUNT, Button, Card, Field, MockBanner, Notice } from '../components/ui';
import { Icon } from '../components/Icon';
import { navigate } from '../lib/router';
import { useApp } from '../app/context';
import { GOALS, INTERESTS } from '../data/mock';
import { avatarColors } from '../components/ui';
import { validateDisplayName } from '../lib/validate';

const STEPS = ['Welcome', 'Profile', 'Interests', 'Meet Nova', 'Ready'] as const;

function toggle(list: string[], v: string) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

export function Onboarding() {
  const { account, updateProfile } = useApp();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [bio, setBio] = useState(account?.bio ?? '');
  const [hue, setHue] = useState(account?.hue ?? 0);
  const [interests, setInterests] = useState<string[]>(account?.interests ?? []);
  const [goals, setGoals] = useState<string[]>(account?.goals ?? []);
  const [error, setError] = useState<string | undefined>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  function next() {
    if (step === 1) {
      const err = validateDisplayName(displayName);
      if (err) { setError(err); return; }
      if (bio.length > 280) { setError('Bio can be up to 280 characters.'); return; }
    }
    setError(undefined);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function finish() {
    const r = updateProfile({ displayName, bio, hue, interests, goals, onboarded: true });
    if (!r.ok) { setError(r.error); setStep(1); return; }
    navigate('/home');
  }

  return (
    <div className="auth-wrap">
      <main id="main" className="auth-card" style={{ width: 'min(600px, 100%)' }} aria-labelledby="onboarding-title">
        <div className="stack-sm">
          <div className="progress" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
            {STEPS.map((s, i) => <i key={s} data-on={i <= step} />)}
          </div>
          <p className="faint">Step {step + 1} of {STEPS.length}</p>
        </div>

        <Card>
          <div className="stack">
            {step === 0 && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>Welcome{account ? `, ${account.displayName.split(' ')[0]}` : ''}.</h1>
                <p className="muted">A few quick steps to set up your space. It takes about a minute, and you can change everything later.</p>
                <ul className="principles">
                  <li><Icon name="users" size={20} /><span><strong>Connect.</strong> Join conversations in a chronological feed, with no algorithm deciding what you see.</span></li>
                  <li><Icon name="learn" size={20} /><span><strong>Grow.</strong> Learn skills, find opportunities and meet mentors.</span></li>
                  <li><Icon name="shield" size={20} /><span><strong>Stay safe.</strong> Block, mute and report tools, with real people reviewing reports.</span></li>
                </ul>
              </>
            )}

            {step === 1 && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>Set up your profile</h1>
                <Field label="Display name" error={error && error.toLowerCase().includes('name') ? error : undefined}>
                  {(p) => <input {...p} className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />}
                </Field>
                <Field label="Short bio" hint={`Optional. ${280 - bio.length} characters left.`} error={error && error.toLowerCase().includes('bio') ? error : undefined}>
                  {(p) => <textarea {...p} className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={400} />}
                </Field>
                <div className="field">
                  <span className="label" id="hue-label">Avatar colours</span>
                  <div className="row">
                    <Avatar name={displayName || '?'} hue={hue} size={56} />
                    <div className="color-pick" role="group" aria-labelledby="hue-label">
                      {Array.from({ length: AVATAR_COUNT }).map((_, i) => {
                        const [c1, c2] = avatarColors(i);
                        return <button key={i} type="button" aria-label={`Colour option ${i + 1}`} aria-pressed={hue === i} onClick={() => setHue(i)} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />;
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>What are you into?</h1>
                <div className="stack-sm">
                  <span className="label" id="int-label" style={{ fontWeight: 650 }}>Interests</span>
                  <div className="row-wrap" role="group" aria-labelledby="int-label">
                    {INTERESTS.map((i) => <button key={i} type="button" className="chip" aria-pressed={interests.includes(i)} onClick={() => setInterests(toggle(interests, i))}>{i}</button>)}
                  </div>
                </div>
                <div className="stack-sm">
                  <span className="label" id="goal-label" style={{ fontWeight: 650 }}>What would you like to achieve?</span>
                  <div className="row-wrap" role="group" aria-labelledby="goal-label">
                    {GOALS.map((g) => <button key={g} type="button" className="chip" aria-pressed={goals.includes(g)} onClick={() => setGoals(toggle(goals, g))}>{g}</button>)}
                  </div>
                </div>
                <p className="faint">Optional. In this prototype, choices are saved in your browser and don’t yet change what you see.</p>
              </>
            )}

            {step === 3 && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>Meet Nova</h1>
                <p>Nova is FREEVERSE’s AI companion. It can help you reflect, learn, find opportunities and take small next steps.</p>
                <Notice icon="info">
                  <strong>What Nova is not:</strong> Nova is not a therapist, counsellor or crisis service, and it doesn’t diagnose or give medical, legal or financial advice. It’s a supportive tool that encourages you to reach real people and professionals when that’s what you need.
                </Notice>
                <Notice icon="lock">
                  <strong>Privacy:</strong> your Nova conversations are private by default. A conversation that Nova’s safety system flags as a possible crisis can be reviewed by a human moderator so you can be helped. We’ll always be upfront about that.
                </Notice>
                <MockBanner title="Prototype">Nova’s replies are scripted in this build. The real AI and its safety system arrive in a later stage.</MockBanner>
              </>
            )}

            {step === 4 && (
              <>
                <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>You’re all set</h1>
                <div className="row">
                  <Avatar name={displayName || '?'} hue={hue} size={64} />
                  <div><strong>{displayName}</strong><p className="muted">{bio || 'No bio yet. You can add one from your profile.'}</p></div>
                </div>
                {interests.length > 0 && <div className="row-wrap">{interests.map((i) => <span key={i} className="badge badge-cyan">{i}</span>)}</div>}
                <p className="muted">Your age confirmation (18+) was recorded when you created your account.</p>
              </>
            )}

            {error && step !== 1 && <p className="error-text" role="alert">{error}</p>}

            <div className="spread" style={{ marginTop: 6 }}>
              {step > 0 ? <Button variant="ghost" icon="arrowLeft" onClick={() => { setError(undefined); setStep(step - 1); }}>Back</Button> : <span />}
              {step < STEPS.length - 1
                ? <Button variant="primary" onClick={next}>{step === 0 ? 'Get started' : step === 2 ? 'Continue' : 'Next'}</Button>
                : <Button variant="primary" onClick={finish}>Enter FREEVERSE</Button>}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
