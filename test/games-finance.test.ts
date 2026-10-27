import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slide, canMove, addTile, newBoard, mathQuestion, scramble, WORDS, memoryDeck } from '../src/features/games/engine';
import { budget, savingsGoal, compoundGrowth, num } from '../src/lib/finance';

test('slide: merges once per pair, in the right direction, scores the merge', () => {
  assert.deepEqual(slide([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left'), { board: [[4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], gained: 8, moved: true });
  assert.deepEqual(slide([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'right').board[0], [0, 0, 4, 4]);
  const up = slide([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]], 'up'); assert.deepEqual(up.board.map((r) => r[0]), [4, 4, 0, 0]);
  const down = slide([[2, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'down'); assert.deepEqual(down.board.map((r) => r[0]), [0, 0, 0, 4]);
  assert.equal(slide([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left').moved, false);
});
test('slide: game over detection and tile spawning', () => {
  const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]; assert.equal(canMove(full), false);
  assert.equal(canMove([[2, 2, 4, 8], [4, 8, 2, 4], [2, 4, 8, 2], [4, 2, 4, 8]]), true);
  const b = newBoard(() => 0.1); assert.equal(b.flat().filter(Boolean).length, 2);
  assert.deepEqual(addTile(full), full);
});
test('quick maths and scramble produce valid, solvable items', () => {
  for (let i = 0; i < 500; i++) { const q = mathQuestion(); assert.ok(Number.isInteger(q.answer) && q.answer > 0, q.text); }
  for (const w of WORDS) { const s = scramble(w); assert.notEqual(s, w); assert.equal([...s].sort().join(''), [...w].sort().join('')); }
  assert.equal(new Set(WORDS).size, WORDS.length);
});
test('memory deck: every card has exactly one pair', () => {
  const d = memoryDeck(6); assert.equal(d.length, 12); for (let i = 0; i < 6; i++) assert.equal(d.filter((x) => x === i).length, 2);
});
test('budget: totals, shares, overspending, ignores bad lines', () => {
  const r = budget(1000, [{ name: 'Rent', amount: 400 }, { name: 'Food', amount: 250.5 }, { name: 'Bad', amount: NaN }, { name: 'Neg', amount: -5 }]);
  assert.equal(r.total, 650.5); assert.equal(r.remaining, 349.5); assert.equal(r.overspent, false); assert.equal(r.shares[0]!.pct, 40);
  assert.equal(budget(100, [{ name: 'x', amount: 150 }]).overspent, true); assert.equal(budget(NaN, []).total, 0);
});
test('savings goal: months from a monthly amount, or the monthly amount for a deadline', () => {
  assert.deepEqual(savingsGoal(1000, 100, 200, null), { monthsNeeded: 5, monthlyNeeded: null, reachable: true, remaining: 900 });
  assert.equal(savingsGoal(1000, 100, null, 6).monthlyNeeded, 150); assert.equal(savingsGoal(100, 200, 10, null).monthsNeeded, 0); assert.equal(savingsGoal(500, 0, null, null).reachable, false);
});
test('compound growth: zero rate is plain saving; positive rate grows more; inputs are clamped', () => {
  const flat = compoundGrowth(100, 10, 0, 2); assert.equal(flat[1]!.balance, 340); assert.equal(flat[1]!.growth, 0);
  const g = compoundGrowth(1000, 0, 12, 1); assert.ok(g[0]!.balance > 1126 && g[0]!.balance < 1127);
  assert.equal(compoundGrowth(1, 1, 5, 500).length, 60); assert.equal(compoundGrowth(100, 0, 5, 0).length, 0); assert.equal(num('1,250.5'), 1250.5); assert.ok(Number.isNaN(num('abc')));
});
