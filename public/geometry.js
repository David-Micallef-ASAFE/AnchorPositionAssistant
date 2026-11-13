// Geometry metrics for a calculated position, after the Edge TDOA Solver Requirements, section 7:
//   7.1 azimuth of each anchor seen from the position
//   7.2 effective anchor count N (angular information)
//   7.3 horizontal dilution of precision (HDOP)
// The app is 2D (horizontal distances), so elevation and VDOP do not apply.
//
// HDOP here uses the model for measured ranges (tape / laser): the rows of H are the unit vectors
// from the position to each anchor and HDOP = sqrt(trace((HᵀH)⁻¹)). For evenly spaced anchors this
// gives the same values as the document's TDoA table (8 → 0.71, 4 → 1.00, 3 → 1.15). For uneven
// layouts it is lower than the TDoA value, because a measured distance has no shared time offset.

const TWO_PI = 2 * Math.PI;

// Azimuths in degrees, 0° along +x, counter-clockwise. Points at the position itself are skipped.
export function azimuths(pos, points) {
  const out = [];
  for (const p of points) {
    const dx = p.x - pos.x, dy = p.y - pos.y;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += TWO_PI;
    out.push((a * 180) / Math.PI);
  }
  return out;
}

// N = 1 / Σ (gap / 360°)², gaps between neighbouring azimuths including the wrap-around.
export function effectiveAnchorCount(azDeg) {
  if (azDeg.length === 0) return 0;
  const s = [...azDeg].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const gap = i === s.length - 1 ? s[0] + 360 - s[i] : s[i + 1] - s[i];
    sum += (gap / 360) ** 2;
  }
  return 1 / sum;
}

// sqrt(trace((HᵀH)⁻¹)) with H the unit vectors to the anchors. Infinity when the directions don't
// span the plane (fewer than two different directions, or all along one line).
export function hdop(pos, points) {
  let a11 = 0, a12 = 0, a22 = 0;
  for (const p of points) {
    const dx = p.x - pos.x, dy = p.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const ux = dx / d, uy = dy / d;
    a11 += ux * ux; a12 += ux * uy; a22 += uy * uy;
  }
  const det = a11 * a22 - a12 * a12;
  if (det < 1e-9) return Infinity;
  return Math.sqrt((a11 + a22) / det);
}

// Checks a position against the rules in config.js.
// Returns { anchors, effectiveAnchors, hdop, ok, problems: [text] }.
export function checkGeometry(pos, points, rules) {
  const az = azimuths(pos, points);
  const n = effectiveAnchorCount(az);
  const h = hdop(pos, points);
  const problems = [];
  if (points.length < rules.minAnchors) {
    problems.push(`Measured to ${points.length} anchor(s); at least ${rules.minAnchors} are needed.`);
  }
  if (!(n >= rules.minEffectiveAnchors)) {
    problems.push(`The measured anchors are bunched on one side (effective anchor count ${n.toFixed(2)}, needs at least ${rules.minEffectiveAnchors}). Add a measurement to an anchor on the empty side.`);
  }
  if (!(h <= rules.maxHdop)) {
    problems.push(`The anchor directions fix the position poorly (HDOP ${Number.isFinite(h) ? h.toFixed(2) : '∞'}, must be at most ${rules.maxHdop}). Add a measurement to an anchor at a different angle.`);
  }
  return { anchors: points.length, azimuths: az, effectiveAnchors: n, hdop: h, ok: problems.length === 0, problems };
}
