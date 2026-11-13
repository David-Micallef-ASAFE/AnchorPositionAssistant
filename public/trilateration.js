// 2D trilateration from measured distances (meters).
//
// solvePosition(measurements, start)
//   measurements: [{ x, y, distance }]  - known points and the measured distance to each
//   start:        { x, y }              - the current approximate position (used as the initial
//                                         guess, and to pick the right side when the geometry is
//                                         ambiguous, e.g. only two references or collinear refs)
// Returns { x, y, rms, maxAbsResidual, residuals: [..], ambiguous, iterations, method }
// or { error } when it cannot solve.
//
// Method: non-linear least squares (Levenberg-Marquardt) minimising
//   sum_i ( |p - a_i| - d_i )^2
// started from the approximate position and (when >= 3 non-collinear points) from the linearised
// closed-form solution. The lowest-cost result wins; near-ties go to the one closest to `start`.

const EPS = 1e-12;

function cost(p, ms) {
  let c = 0;
  for (const m of ms) {
    const r = Math.hypot(p.x - m.x, p.y - m.y) - m.distance;
    c += r * r;
  }
  return c;
}

function levenbergMarquardt(start, ms, maxIter = 500) {
  let p = { x: start.x, y: start.y };
  let lambda = 1e-3;
  let c = cost(p, ms);
  let it = 0;
  for (; it < maxIter; it++) {
    // Build J^T J and J^T r
    let a11 = 0, a12 = 0, a22 = 0, g1 = 0, g2 = 0;
    for (const m of ms) {
      const dx = p.x - m.x, dy = p.y - m.y;
      let dist = Math.hypot(dx, dy);
      let jx, jy;
      if (dist < 1e-9) { jx = 1; jy = 0; dist = 0; } // at the anchor itself: arbitrary direction
      else { jx = dx / dist; jy = dy / dist; }
      const r = dist - m.distance;
      a11 += jx * jx; a12 += jx * jy; a22 += jy * jy;
      g1 += jx * r; g2 += jy * r;
    }
    let improved = false;
    for (let tries = 0; tries < 30; tries++) {
      const b11 = a11 + lambda * (a11 + 1e-9), b22 = a22 + lambda * (a22 + 1e-9);
      const det = b11 * b22 - a12 * a12;
      if (Math.abs(det) < EPS) { lambda *= 10; continue; }
      const sx = -(b22 * g1 - a12 * g2) / det;
      const sy = -(-a12 * g1 + b11 * g2) / det;
      const np = { x: p.x + sx, y: p.y + sy };
      const nc = cost(np, ms);
      if (nc < c) {
        p = np;
        const delta = Math.hypot(sx, sy);
        const dc = c - nc;
        c = nc;
        lambda = Math.max(lambda / 3, 1e-12);
        improved = true;
        if (delta < 1e-10 || dc < 1e-16) return { p, c, it: it + 1 };
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }
  return { p, c, it };
}

// Linearised closed-form least squares (subtract first equation). Needs >= 3 non-collinear points.
function linearSolve(ms) {
  if (ms.length < 3) return null;
  const [m0, ...rest] = ms;
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const m of rest) {
    const ax = 2 * (m.x - m0.x), ay = 2 * (m.y - m0.y);
    const b = m0.distance ** 2 - m.distance ** 2 + m.x ** 2 - m0.x ** 2 + m.y ** 2 - m0.y ** 2;
    a11 += ax * ax; a12 += ax * ay; a22 += ay * ay;
    b1 += ax * b; b2 += ay * b;
  }
  const det = a11 * a22 - a12 * a12;
  const scale = Math.max(a11, a22, 1);
  if (Math.abs(det) < 1e-9 * scale * scale) return null;
  return { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det };
}

// True when all points lie (nearly) on one line -> mirror ambiguity across that line.
export function isCollinear(points, tol = 0.05) {
  if (points.length < 3) return true;
  // Principal-axis spread: smallest eigenvalue of the covariance, in m^2.
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my);
  }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const minEig = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return Math.sqrt(Math.max(0, minEig)) < tol;
}

export function solvePosition(measurements, start) {
  const ms = measurements.filter(
    (m) => Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.distance) && m.distance >= 0
  );
  if (ms.length === 0) return { error: 'Enter at least one measurement.' };
  if (!start || !Number.isFinite(start.x) || !Number.isFinite(start.y)) return { error: 'No starting position.' };

  let best;
  if (ms.length === 1) {
    // One distance: move along the line from the known point towards the current position.
    const m = ms[0];
    let dx = start.x - m.x, dy = start.y - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
    best = { p: { x: m.x + dx * m.distance, y: m.y + dy * m.distance }, c: 0, it: 0, method: 'single distance (direction kept from approximate position)' };
  } else {
    const candidates = [];
    // Nudge the start if it sits exactly on a known point (gradient undefined there).
    const s0 = ms.some((m) => Math.hypot(m.x - start.x, m.y - start.y) < 1e-6)
      ? { x: start.x + 0.01, y: start.y + 0.01 }
      : start;
    candidates.push({ ...levenbergMarquardt(s0, ms), method: 'least squares from approximate position' });
    const lin = linearSolve(ms);
    if (lin) candidates.push({ ...levenbergMarquardt(lin, ms), method: 'least squares from closed-form estimate' });

    candidates.sort((a, b) => a.c - b.c);
    best = candidates[0];
    // Near-tie -> prefer the one closer to the approximate position.
    for (const c of candidates.slice(1)) {
      if (Math.abs(c.c - best.c) <= 1e-6 + 1e-3 * best.c) {
        const dB = Math.hypot(best.p.x - start.x, best.p.y - start.y);
        const dC = Math.hypot(c.p.x - start.x, c.p.y - start.y);
        if (dC < dB) best = c;
      }
    }
  }

  const residuals = ms.map((m) => Math.hypot(best.p.x - m.x, best.p.y - m.y) - m.distance);
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const uniquePts = ms.filter((m, i) => ms.findIndex((o) => Math.hypot(o.x - m.x, o.y - m.y) < 1e-6) === i);
  return {
    x: best.p.x,
    y: best.p.y,
    residuals,
    rms,
    maxAbsResidual: Math.max(...residuals.map(Math.abs)),
    ambiguous: uniquePts.length < 3 || isCollinear(uniquePts),
    underdetermined: uniquePts.length < 2,
    iterations: best.it,
    method: best.method,
  };
}
