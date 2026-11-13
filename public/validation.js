// Validation rules shared by the Node server and the on-device (phone) storage,
// so both storage back ends accept and reject exactly the same data.

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
    const s = typeof body.serial === 'string' ? body.serial.trim() : '';
    if (!s) return { error: 'Serial number is required' };
    out.serial = s;
  }
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
  if ('export' in body) {
    if (typeof body.export !== 'boolean') return { error: 'export must be true or false' };
    out.export = body.export;
  }
  return { value: out };
}

export const duplicateSerialMessage = (serial) => `Anchor ${serial} already exists on this floor plan`;
