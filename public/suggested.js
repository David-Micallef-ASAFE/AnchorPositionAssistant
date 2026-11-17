// Suggested anchor positions from the engineer's CSV (e.g. "Anchor,X,Y" / "G01,29.51,28.85").
// They are only a guide for the installer, shown on the plan as red diamonds.

// Parses the CSV text. Returns { positions: [{ name, x, y }], skipped: [line numbers] }.
// Throws a readable error when no position can be read.
// - Separator: comma, semicolon or tab (detected from the first line).
// - Header row optional. Columns are found by name (Anchor/Name/ID/Label/Serial, X, Y);
//   without a recognisable header the first three columns are name, x, y.
// - Decimal commas are accepted when the separator is not a comma ("29,51").
export function parseSuggestedCsv(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const first = lines.find((l) => l.trim()) ?? '';
  // Most frequent of ; tab , in the first line. On a tie ; wins: "G01;29,51;28,85" uses decimal commas.
  const sep = ['\t', ','].reduce((best, c) => (count(first, c) > count(first, best) ? c : best), ';');
  const num = (v) => {
    const s = String(v ?? '').trim();
    const t = sep !== ',' ? s.replace(/^(-?\d+),(\d+)$/, '$1.$2') : s;
    return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? Number(t) : NaN;
  };

  let col = { name: 0, x: 1, y: 2 };
  let start = 0;
  const rows = lines.map((l) => splitCsvLine(l, sep));
  const firstIdx = lines.findIndex((l) => l.trim());
  if (firstIdx >= 0) {
    const head = rows[firstIdx].map((h) => h.trim().toLowerCase());
    const isHeader = !Number.isFinite(num(rows[firstIdx][1])) || !Number.isFinite(num(rows[firstIdx][2]));
    if (isHeader) {
      const find = (re) => head.findIndex((h) => re.test(h));
      const name = find(/^(anchor|name|id|label|serial|device)/);
      const x = find(/^x(?![a-z])/); // "X", "X (m)", "x_m"
      const y = find(/^y(?![a-z])/);
      if (x >= 0 && y >= 0) col = { name: name >= 0 ? name : [0, 1, 2].find((i) => i !== x && i !== y), x, y };
      start = firstIdx + 1;
    }
  }

  const positions = [];
  const skipped = [];
  for (let i = start; i < rows.length; i++) {
    if (!lines[i].trim()) continue;
    const r = rows[i];
    const name = String(r[col.name] ?? '').trim();
    const x = num(r[col.x]), y = num(r[col.y]);
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) { skipped.push(i + 1); continue; }
    positions.push({ name, x, y });
  }
  if (!positions.length) {
    throw new Error('No positions found. The CSV needs a name, X and Y (meters) on each row, e.g. "Anchor,X,Y" then "G01,29.51,28.85".');
  }
  return { positions, skipped };
}

function count(s, c) { return s.split(c).length - 1; }

// One CSV line into fields; double quotes may wrap a field ("" is a literal quote).
function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
