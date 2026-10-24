// Pure game logic, separate from the UI so it can be tested without a browser.

export type Dir = 'left' | 'right' | 'up' | 'down';

/** Slide & Merge (2048-style). Returns the new board, points gained and whether anything moved. */
export function slide(board: number[][], dir: Dir): { board: number[][]; gained: number; moved: boolean } {
  const n = board.length; let gained = 0; let moved = false;
  const rotate = (b: number[][]) => b[0]!.map((_, i) => b.map((r) => r[i]!).reverse());
  const turns = { left: 0, down: 1, right: 2, up: 3 }[dir];
  let b = board.map((r) => [...r]);
  for (let i = 0; i < turns; i++) b = rotate(b);
  b = b.map((row) => {
    const vals = row.filter(Boolean); const out: number[] = [];
    for (let i = 0; i < vals.length; i++) { if (vals[i] === vals[i + 1]) { out.push(vals[i]! * 2); gained += vals[i]! * 2; i++; } else out.push(vals[i]!); }
    while (out.length < n) out.push(0);
    if (out.some((v, i) => v !== row[i])) moved = true;
    return out;
  });
  for (let i = 0; i < (4 - turns) % 4; i++) b = rotate(b);
  return { board: b, gained, moved };
}
export const canMove = (board: number[][]): boolean => (['left', 'right', 'up', 'down'] as Dir[]).some((d) => slide(board, d).moved);
export function addTile(board: number[][], rnd: () => number = Math.random): number[][] {
  const empty: [number, number][] = []; board.forEach((r, y) => r.forEach((v, x) => { if (!v) empty.push([y, x]); }));
  if (!empty.length) return board;
  const [y, x] = empty[Math.floor(rnd() * empty.length)]!; const b = board.map((r) => [...r]); b[y]![x] = rnd() < 0.9 ? 2 : 4; return b;
}
export const newBoard = (rnd: () => number = Math.random): number[][] => addTile(addTile(Array.from({ length: 4 }, () => [0, 0, 0, 0]), rnd), rnd);

export interface MathQ { text: string; answer: number }
export function mathQuestion(rnd: () => number = Math.random): MathQ {
  const r = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const kind = r(0, 3);
  if (kind === 0) { const a = r(6, 60), b = r(6, 60); return { text: `${a} + ${b}`, answer: a + b }; }
  if (kind === 1) { const a = r(20, 90), b = r(3, a - 1); return { text: `${a} − ${b}`, answer: a - b }; }
  if (kind === 2) { const a = r(3, 12), b = r(3, 12); return { text: `${a} × ${b}`, answer: a * b }; }
  const b = r(2, 12), q = r(2, 12); return { text: `${b * q} ÷ ${b}`, answer: q };
}

export const WORDS = ['planet', 'garden', 'bridge', 'window', 'pocket', 'rocket', 'summer', 'winter', 'forest', 'orange', 'silver', 'market', 'butter', 'candle', 'school', 'island', 'mirror', 'camera', 'friend', 'travel', 'puzzle', 'guitar', 'coffee', 'jungle', 'pencil', 'rhythm', 'stream', 'thread', 'wonder', 'yellow', 'basket', 'castle', 'dragon', 'engine', 'flight', 'global', 'harbor', 'insect', 'jacket', 'kitten', 'lemon', 'museum', 'nature', 'ocean', 'palace', 'quiet', 'river', 'sunset', 'tunnel', 'unique', 'valley', 'whisper', 'zipper', 'anchor', 'breeze', 'cactus', 'desert', 'eagle', 'finger', 'galaxy', 'hammer'];
export function scramble(word: string, rnd: () => number = Math.random): string {
  if (new Set(word).size < 2) return word;
  for (let tries = 0; tries < 20; tries++) {
    const a = word.split(''); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
    const s = a.join(''); if (s !== word) return s;
  }
  return word.split('').reverse().join('');
}
export function memoryDeck(pairs: number, rnd: () => number = Math.random): number[] {
  const d = Array.from({ length: pairs * 2 }, (_, i) => Math.floor(i / 2));
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j]!, d[i]!]; }
  return d;
}
