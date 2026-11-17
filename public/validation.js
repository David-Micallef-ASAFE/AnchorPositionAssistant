// Validation rules shared by the Node server and the on-device (phone) storage,
// so both storage back ends accept and reject exactly the same data.

import { cleanSerial, defaultExport } from './serial.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const newId = () => globalThis.crypto.randomUUID();

// Returns { value } or { error }.
export function validatePlanFields(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Name is required' };
  if (!(isNum(body.width) && body.width > 0 && isNum(body.height) && body.height > 0))
    return { error: 'Width and height must be positive numbers (meters)' };
  return { value: { name, width: body.width, height: body.height } };
}

// partial = true for updates (only the fields present are checked). Returns { value } or { error }.
export function validateAnchorFields(body, partial) {
  const out = {};
  if (!partial || 'serial' in body) {
    // A leading AS- / RL- (from the label, e.g. typed by a USB scanner) is removed.
    const s = typeof body.serial === 'string' ? cleanSerial(body.serial) : '';
    if (!s) return { error: 'Serial number is required' };
    out.serial = s;
  }
  // New anchors: exported by default only when the serial has no letters (12345 yes, COL123 no).
  if (!partial && !('export' in body)) out.export = defaultExport(out.serial);
  if (!partial || 'type' in body) {
    if (body.type !== 'reference' && body.type !== 'approximate') return { error: 'Type must be "reference" or "approximate"' };
    out.type = body.type;
  }
  for (const k of ['x', 'y']) {
    if (!partial || k in body) {
      if (!isNum(body[k])) return { error: `${k} must be a number` };
      out[k] = body[k];
    }
  }
  if ('measurements' in body) {
    if (!Array.isArray(body.measurements)) return { error: 'measurements must be an array' };
    const ms = [];
    for (const m of body.measurements) {
      if (!m || typeof m.toAnchorId !== 'string') return { error: 'Each measurement needs toAnchorId' };
      if (m.distance !== null && !(isNum(m.distance) && m.distance >= 0)) return { error: 'Distance must be a non-negative number' };
      ms.push({ id: typeof m.id === 'string' ? m.id : newId(), toAnchorId: m.toAnchorId, distance: m.distance });
    }
    out.measurements = ms;
  }
  if ('lastSolve' in body) out.lastSolve = body.lastSolve ?? null;
  if ('calculated' in body) {
    if (typeof body.calculated !== 'boolean') return { error: 'calculated must be true or false' };
    out.calculated = body.calculated;
  }
  if ('export' in body) {
    if (typeof body.export !== 'boolean') return { error: 'export must be true or false' };
    out.export = body.export;
  }
  return { value: out };
}

// The engineer's suggested positions for a plan: [{ name, x, y }] (may be empty). Returns { value } or { error }.
export function validateSuggestedPositions(list) {
  if (!Array.isArray(list)) return { error: 'positions must be an array' };
  if (list.length > 10000) return { error: 'Too many suggested positions (max 10000)' };
  const out = [];
  for (const p of list) {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (!name) return { error: 'Each suggested position needs a name' };
    if (!isNum(p.x) || !isNum(p.y)) return { error: `Suggested position ${name}: x and y must be numbers` };
    out.push({ name, x: p.x, y: p.y });
  }
  return { value: out };
}

export const duplicateSerialMessage = (serial) => `Anchor ${serial} already exists on this floor plan`;
