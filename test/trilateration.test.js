import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solvePosition } from '../public/trilateration.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const refs = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 15 }, { x: 20, y: 15 }];

test('exact distances to 3+ references recover the true point', () => {
  const truth = { x: 7.3, y: 4.1 };
  const ms = refs.map((r) => ({ ...r, distance: dist(r, truth) }));
  const s = solvePosition(ms, { x: 12, y: 10 });
  assert.ok(Math.abs(s.x - truth.x) < 1e-6 && Math.abs(s.y - truth.y) < 1e-6, JSON.stringify(s));
  assert.ok(s.rms < 1e-6);
  assert.equal(s.ambiguous, false);
});

test('noisy distances give a close least-squares fit', () => {
  const truth = { x: 14.2, y: 9.8 };
  const noise = [0.02, -0.03, 0.01, -0.015];
  const ms = refs.map((r, i) => ({ ...r, distance: dist(r, truth) + noise[i] }));
  const s = solvePosition(ms, { x: 13, y: 11 });
  assert.ok(dist(s, truth) < 0.05, JSON.stringify(s));
});

test('two references: picks the mirror solution nearest the approximate position', () => {
  const truth = { x: 10, y: 6 };
  const two = [refs[0], refs[1]].map((r) => ({ ...r, distance: dist(r, truth) }));
  const above = solvePosition(two, { x: 9, y: 5 });
  assert.ok(dist(above, truth) < 1e-6, JSON.stringify(above));
  assert.equal(above.ambiguous, true);
  const below = solvePosition(two, { x: 9, y: -5 });
  assert.ok(dist(below, { x: 10, y: -6 }) < 1e-6, JSON.stringify(below));
});

test('single reference moves the point along the line to the right distance', () => {
  const s = solvePosition([{ x: 0, y: 0, distance: 5 }], { x: 3, y: 0 });
  assert.ok(Math.abs(s.x - 5) < 1e-9 && Math.abs(s.y) < 1e-9);
});

test('far-off approximate start still converges with 3 refs', () => {
  const truth = { x: 18, y: 1 };
  const ms = refs.slice(0, 3).map((r) => ({ ...r, distance: dist(r, truth) }));
  const s = solvePosition(ms, { x: 1, y: 14 });
  assert.ok(dist(s, truth) < 1e-6, JSON.stringify(s));
});

test('no measurements returns an error', () => {
  assert.ok(solvePosition([], { x: 0, y: 0 }).error);
});
