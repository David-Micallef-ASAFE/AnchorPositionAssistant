// Builders for the anchor export files. Pure functions, so they can be unit tested.

// An anchor is exported unless it was explicitly unticked (older anchors have no flag).
export const isExported = (a) => a.export !== false;

export function sortAnchors(list) {
  return [...list].sort((a, b) =>
    a.type === b.type ? a.serial.localeCompare(b.serial) : a.type === 'reference' ? -1 : 1);
}

// ---------- CSV ----------
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Numbers logged with the last applied calculation. Calculations made before a field existed leave it blank.
const fixed = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
const count = (v) => (Number.isInteger(v) ? v : '');
function solveColumns(ls) {
  if (!ls) return ['', '', '', '', '', '', ''];
  return [
    new Date(ls.at).toISOString(),
    fixed(ls.rms, 3),
    fixed(ls.maxResidual, 3),
    count(ls.n),
    count(ls.references),
    fixed(ls.effectiveAnchors, 2),
    fixed(ls.hdop, 2),
  ];
}

export function buildCsv(planName, anchors) {
  const header = ['Floor plan', 'Serial', 'Type', 'X (m)', 'Y (m)', 'Position calculated', 'Measurements', 'Last calculated', 'RMS residual (m)', 'Max residual (m)', 'Anchors used', 'Reference anchors used', 'Effective anchor count', 'HDOP'];
  const rows = sortAnchors(anchors).map((a) => [
    planName,
    a.serial,
    a.type === 'reference' ? 'Reference' : 'Approximate',
    a.x.toFixed(3),
    a.y.toFixed(3),
    a.type === 'reference' ? '' : a.calculated === true ? 'Yes' : 'No',
    a.measurements?.length ?? 0,
    ...solveColumns(a.lastSolve),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// ---------- SQL ----------
// Coordinate as a plain decimal with up to 3 decimals (mm) and no trailing zeros: 10, 25.3, -0.125
export function sqlNumber(v) {
  const n = Number(Number(v).toFixed(3));
  return Object.is(n, -0) ? '0' : String(n);
}
const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ');

export function buildSql(planName, anchors, when = new Date()) {
  const list = sortAnchors(anchors);
  const lines = [
    `-- Anchor positions for floor plan: ${oneLine(planName)}`,
    `-- Exported ${when.toISOString()} - ${list.length} anchor(s). Coordinates in meters, (0,0) = bottom-left.`,
    '',
    ...list.map((a) =>
      `update device set space_coordinates=(${sqlNumber(a.x)},${sqlNumber(a.y)}) where serial_number=${sqlString(a.serial)};`),
    '',
  ];
  return lines.join('\r\n');
}
