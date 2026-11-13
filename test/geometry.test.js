import { test } from 'node:test';
import assert from 'node:assert/strict';
import { azimuths, effectiveAnchorCount, hdop, checkGeometry } from '../public/geometry.js';
import { CALCULATION_RULES } from '../public/config.js';

// Anchors 10 m from the origin at the given azimuths (degrees).
const ring = (...deg) => deg.map((d) => ({ x: 10 * Math.cos((d * Math.PI) / 180), y: 10 * Math.sin((d * Math.PI) / 180) }));
const O = { x: 0, y: 0 };
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('azimuths: 0° along +x, counter-clockwise, 0..360', () => {
  const az = azimuths(O, ring(0, 90, 180, 270));
  [0, 90, 180, 270].forEach((d, i) => close(az[i], d, 1e-9));
  close(azimuths({ x: 5, y: 5 }, [{ x: 5, y: 0 }])[0], 270, 1e-9);
});

test('effective anchor count matches the worked examples in section 7.2', () => {
  const N = (...deg) => effectiveAnchorCount(azimuths(O, ring(...deg)));
  close(N(0, 20, 90), 1.66);            // example A
  close(N(0, 20, 90, 95), 1.72);        // A + anchor next to 90°
  close(N(0, 5, 180), 2.06);            // opposed pair + near-neighbour
  close(N(0, 90, 180), 2.67);           // opposed pair + perpendicular
  close(N(0, 120, 250), 2.99);          // example B
  close(N(0, 120, 240), 3.0);           // 3 evenly spaced
  close(N(0, 90, 120, 250), 3.41);      // B + anchor at 90°
  close(N(0, 90, 180, 270), 4.0);
  close(N(0, 45, 90, 135, 180, 225, 270, 315), 8.0);
});

test('HDOP for evenly spaced anchors matches section 7.3', () => {
  close(hdop(O, ring(0, 45, 90, 135, 180, 225, 270, 315)), 0.71);
  close(hdop(O, ring(0, 90, 180, 270)), 1.0);
  close(hdop(O, ring(0, 120, 240)), 1.15);
});

test('HDOP grows as the directions line up, and is infinite on one line', () => {
  assert.ok(hdop(O, ring(0, 5, 180)) > 10);
  assert.equal(hdop(O, ring(0, 180)), Infinity);
});

test('checkGeometry applies the configured rules', () => {
  const rules = { minAnchors: 3, minEffectiveAnchors: 2.5, maxHdop: 2 };
  assert.ok(checkGeometry(O, ring(0, 120, 240), rules).ok);
  assert.ok(checkGeometry(O, ring(0, 90, 180), rules).ok);

  const oneSide = checkGeometry(O, ring(0, 20, 90), rules);
  assert.equal(oneSide.ok, false);
  assert.match(oneSide.problems.join(' '), /bunched on one side/);

  const twoAnchors = checkGeometry(O, ring(0, 120), rules);
  assert.equal(twoAnchors.ok, false);
  assert.match(twoAnchors.problems[0], /at least 3/);

  const nearlyInLine = checkGeometry(O, ring(0, 5, 180), rules);
  assert.equal(nearlyInLine.ok, false);
  assert.match(nearlyInLine.problems.join(' '), /HDOP/);
});

test('the default rules require at least three anchors', () => {
  assert.ok(CALCULATION_RULES.minAnchors >= 3);
  assert.ok(CALCULATION_RULES.minEffectiveAnchors > 0);
  assert.ok(CALCULATION_RULES.maxHdop > 0);
});
