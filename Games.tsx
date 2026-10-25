import { useFocusZone } from '../../motion/react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Async, Badge, Button, Card, Check, Notice, errMsg, useResource } from '../../ui/kit';
import { useToast } from '../../state/toast';
import { GAMES, type GameId } from '../../../shared/universe-spaces';
import { slide, canMove, addTile, newBoard, mathQuestion, scramble, WORDS, memoryDeck, type Dir, type MathQ } from './engine';

type Done = (score: number) => void;

// ───────── Memory Match ─────────
const FACES = [['Star', '⭐'], ['Moon', '🌙'], ['Leaf', '🌿'], ['Bell', '🔔'], ['Note', '🎵'], ['Apple', '🍎']] as const;
function Memory({ onDone }: { onDone: Done }) {
  const [deck] = useState(() => memoryDeck(6)); const [open, setOpen] = useState<number[]>([]); const [done, setDone] = useState<Set<number>>(new Set()); const [moves, setMoves] = useState(0); const [msg, setMsg] = useState('');
  const lock = useRef(false);
  const flip = (i: number) => {
    if (lock.current || open.includes(i) || done.has(i)) return;
    const next = [...open, i]; setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1); lock.current = true; const [a, b] = next as [number, number];
      if (deck[a] === deck[b]) { setTimeout(() => { const d = new Set(done); d.add(a); d.add(b); setDone(d); setOpen([]); lock.current = false; setMsg(`Match: ${FACES[deck[a]!]![0]}.`); if (d.size === deck.length) onDone(moves + 1); }, 400); }
      else setTimeout(() => { setOpen([]); lock.current = false; setMsg('No match.'); }, 800);
    }
  };
  return <div className="stack"><p className="muted">Find all six pairs. Moves: <strong>{moves}</strong> (fewer is better).</p>
    <div className="game-grid mem" role="group" aria-label="Memory cards">{deck.map((f, i) => { const shown = open.includes(i) || done.has(i); return <button key={i} type="button" className={`mem-card${shown ? ' up' : ''}${done.has(i) ? ' matched' : ''}`} onClick={() => flip(i)} aria-label={shown ? `Card ${i + 1}, ${FACES[f]![0]}${done.has(i) ? ', matched' : ''}` : `Card ${i + 1}, face down`}><span aria-hidden="true">{shown ? FACES[f]![1] : '?'}</span></button>; })}</div>
    <p className="sr-only" aria-live="polite">{msg}</p></div>;
}

// ───────── Quick Maths ─────────
function useCountdown(seconds: number, run: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds); const end = useRef(onEnd); end.current = onEnd;
  useEffect(() => { if (!run) return; const t = setInterval(() => setLeft((l) => { if (l <= 1) { clearInterval(t); setTimeout(() => end.current(), 0); return 0; } return l - 1; }), 1000); return () => clearInterval(t); }, [run]);
  return left;
}
function Maths({ onDone }: { onDone: Done }) {
  const [q, setQ] = useState<MathQ>(() => mathQuestion()); const [val, setVal] = useState(''); const [score, setScore] = useState(0); const [wrong, setWrong] = useState(0); const [flash, setFlash] = useState(''); const input = useRef<HTMLInputElement>(null); const scoreRef = useRef(0);
  const left = useCountdown(60, true, () => onDone(scoreRef.current));
  useEffect(() => input.current?.focus(), [q]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (val.trim() === '') return; if (Number(val) === q.answer) { scoreRef.current += 1; setScore(scoreRef.current); setFlash('Correct'); } else { setWrong((w) => w + 1); setFlash(`Not quite: ${q.text} = ${q.answer}`); } setVal(''); setQ(mathQuestion()); };
  return <div className="stack"><div className="spread"><span role="timer" aria-live="off">Time left: <strong>{left}s</strong></span><span>Correct: <strong>{score}</strong> · Missed: {wrong}</span></div>
    <form onSubmit={submit} className="stack-sm"><label className="field"><span className="label big-q">{q.text} = ?</span><input ref={input} className="input" inputMode="numeric" autoComplete="off" value={val} onChange={(e) => setVal(e.target.value)} aria-describedby="maths-flash" /></label><Button type="submit" variant="primary">Answer</Button></form>
    <p id="maths-flash" className="faint" aria-live="polite">{flash}</p></div>;
}

// ───────── Slide & Merge ─────────
function Slide({ onDone }: { onDone: Done }) {
  const [board, setBoard] = useState(() => newBoard()); const [score, setScore] = useState(0); const [over, setOver] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const move = useCallback((d: Dir) => {
    if (over) return;
    setBoard((b) => { const r = slide(b, d); if (!r.moved) return b; const nb = addTile(r.board); setScore((s) => s + r.gained); if (!canMove(nb)) setOver(true); return nb; });
  }, [over]);
  const key = (e: React.KeyboardEvent) => { const m: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }; const d = m[e.key]; if (d) { e.preventDefault(); move(d); } };
  const touch = useRef<[number, number] | null>(null);
  return <div className="stack"><div className="spread"><span>Points: <strong>{score}</strong></span><Button size="sm" onClick={() => onDone(score)}>End game and save</Button></div>
    <div ref={ref} className="game-grid slide" tabIndex={0} role="group" aria-label="Game board. Use the arrow keys, or the buttons below." onKeyDown={key}
      onTouchStart={(e) => { const t = e.touches[0]!; touch.current = [t.clientX, t.clientY]; }} onTouchEnd={(e) => { const s = touch.current; if (!s) return; const t = e.changedTouches[0]!; const dx = t.clientX - s[0], dy = t.clientY - s[1]; if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'); }}>
      {board.flat().map((v, i) => <div key={i} className={`tile t${Math.min(v, 2048)}`} aria-label={v ? String(v) : 'empty'}>{v || ''}</div>)}</div>
    <div className="dpad" role="group" aria-label="Move tiles"><Button size="sm" onClick={() => move('up')} aria-label="Slide up">↑</Button><Button size="sm" onClick={() => move('left')} aria-label="Slide left">←</Button><Button size="sm" onClick={() => move('down')} aria-label="Slide down">↓</Button><Button size="sm" onClick={() => move('right')} aria-label="Slide right">→</Button></div>
    {over && <Notice tone="warn" title="No more moves.">You scored {score}. <Button size="sm" variant="primary" onClick={() => onDone(score)}>Save score</Button></Notice>}</div>;
}

// ───────── Word Scramble ─────────
function Scramble({ onDone }: { onDone: Done }) {
  const order = useRef([...WORDS].sort(() => Math.random() - 0.5)); const idx = useRef(0); const [word, setWord] = useState(() => order.current[0]!); const [mix, setMix] = useState(() => scramble(order.current[0]!)); const [val, setVal] = useState(''); const [score, setScore] = useState(0); const [flash, setFlash] = useState(''); const scoreRef = useRef(0); const input = useRef<HTMLInputElement>(null);
  const left = useCountdown(90, true, () => onDone(scoreRef.current));
  const next = () => { idx.current = (idx.current + 1) % order.current.length; const w = order.current[idx.current]!; setWord(w); setMix(scramble(w)); setVal(''); input.current?.focus(); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (val.trim().toLowerCase() === word) { scoreRef.current += 1; setScore(scoreRef.current); setFlash('Correct'); next(); } else setFlash('Not that one, try again or skip.'); };
  return <div className="stack"><div className="spread"><span role="timer" aria-live="off">Time left: <strong>{left}s</strong></span><span>Words: <strong>{score}</strong></span></div>
    <p className="big-q" aria-label={`Scrambled letters: ${mix.split('').join(' ')}`}>{mix.toUpperCase().split('').join(' ')}</p>
    <form onSubmit={submit} className="stack-sm"><label className="field"><span className="label">Your word</span><input ref={input} className="input" autoComplete="off" autoCapitalize="none" spellCheck={false} value={val} onChange={(e) => setVal(e.target.value)} /></label><div className="row-wrap"><Button type="submit" variant="primary">Check</Button><Button type="button" onClick={() => { setFlash(`Skipped: it was “${word}”.`); next(); }}>Skip</Button></div></form>
    <p className="faint" aria-live="polite">{flash}</p></div>;
}

// ───────── hub ─────────
const COMPONENTS: Record<GameId, (p: { onDone: Done }) => React.ReactElement> = { memory: Memory, maths: Maths, slide: Slide, scramble: Scramble };

function Board({ game, bump }: { game: GameId; bump: number }) {
  const res = useResource(() => api.get<{ scoreLabel: string; lowerIsBetter: boolean; mine: { best: number | null; plays: number }; top: { rank: number; name: string; score: number }[]; note: string }>(`/api/games/${game}/scores`), [game, bump]);
  return <Card className="stack-sm"><h3 className="h-sm">Your best and the board</h3><Async res={res}>{(d) => <>
    <p>{d.mine.best === null ? 'You haven’t saved a score yet.' : <>Your best: <strong>{d.mine.best}</strong> {d.scoreLabel} · {d.mine.plays} play{d.mine.plays === 1 ? '' : 's'}</>}</p>
    {d.top.length ? <ol className="plain stack-sm">{d.top.map((t) => <li key={t.rank} className="spread"><span>{t.rank}. {t.name}</span><strong>{t.score}</strong></li>)}</ol> : <p className="muted">Nobody has opted in to the board yet.</p>}
    <p className="faint">{d.note}</p></>}</Async></Card>;
}

function Result({ game, score, onAgain, onSaved }: { game: GameId; score: number; onAgain: () => void; onSaved: () => void }) {
  const { say } = useToast(); const def = GAMES.find((g) => g.id === game)!; const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const save = async () => { setBusy(true); try { await api.post(`/api/games/${game}/scores`, { score, showName: show }); setSaved(true); say('Score saved'); onSaved(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <Card className="stack-sm"><h3 className="h-sm">Finished</h3><p className="big-q">{score} {def.scoreLabel}</p>
    {!saved ? <><Check label="Show my name on the leaderboard" checked={show} onChange={(e) => setShow(e.target.checked)} hint="Off by default. Your best score is always visible to you." /><div className="row-wrap"><Button variant="primary" busy={busy} onClick={() => void save()}>Save score</Button><Button onClick={onAgain}>Play again without saving</Button></div></>
      : <div className="row-wrap"><Notice tone="ok">Saved.</Notice><Button variant="primary" onClick={onAgain}>Play again</Button></div>}</Card>;
}

export function GamesHub({ initial }: { initial?: string }) {
  useFocusZone(); // playing a game is focused
  const [game, setGame] = useState<GameId | null>((GAMES.find((g) => g.id === initial)?.id as GameId | undefined) ?? null); const [score, setScore] = useState<number | null>(null); const [run, setRun] = useState(0); const [bump, setBump] = useState(0);
  const def = GAMES.find((g) => g.id === game); const Game = game ? COMPONENTS[game] : null;
  return <div className="stack-lg">
    <Notice tone="info" title="Single-player, in your browser">No multiplayer or live play. Scores come from your browser, so boards are for fun. Everything works with the keyboard.</Notice>
    {!game && <div className="grid-cards">{GAMES.map((g) => <Card key={g.id} as="article"><h3 className="h-sm">{g.name}</h3><p className="muted">{g.blurb}</p><Button variant="primary" onClick={() => { setGame(g.id); setScore(null); setRun((r) => r + 1); }}>Play {g.name}</Button></Card>)}</div>}
    {game && def && Game && <div className="stack"><div className="spread"><h2 className="h-md">{def.name} <Badge>{def.lowerIsBetter ? 'Lower is better' : 'Higher is better'}</Badge></h2><Button variant="ghost" onClick={() => { setGame(null); setScore(null); }}>All games</Button></div>
      {score === null ? <Card key={run} className="stack"><Game onDone={setScore} /></Card> : <Result game={game} score={score} onAgain={() => { setScore(null); setRun((r) => r + 1); }} onSaved={() => setBump((b) => b + 1)} />}
      <Board game={game} bump={bump} /></div>}
  </div>;
}
