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
  const ids = validatePlanIds(body);
  if (ids.error) return ids;
  return { value: { name, width: body.width, height: body.height, tenantId: null, spaceId: null, ...ids.value } };
}

// Tenant and space of a floor plan: UUIDs used in the SQL export. Optional (empty = none).
// Only the fields present in body are checked. Returns { value } or { error }.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validatePlanIds(body) {
  const out = {};
  for (const [key, label] of [['tenantId', 'Tenant ID'], ['spaceId', 'Space ID']]) {
    if (!(key in body)) continue;
    const v = body[key] === null || body[key] === undefined ? '' : String(body[key]).trim();
    if (v && !UUID_RE.test(v)) return { error: `${label} must be a UUID like 123e4567-e89b-12d3-a456-426614174000 (or left empty)` };
    out[key] = v ? v.toLowerCase() : null;
  }
  return { value: out };
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
