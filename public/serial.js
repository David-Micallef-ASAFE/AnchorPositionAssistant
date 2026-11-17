// Turn the text read from an anchor's QR code into a serial number.
// Expected formats: "AS-123456" or, on older devices, "RL-123456" -> "123456".
// The prefix is case-insensitive and may be surrounded by other text (e.g. a URL or label).
// A bare number is accepted as-is.
// Returns null when the text doesn't look like an anchor serial.
export function parseSerial(text) {
  const s = String(text ?? '').trim();
  const m = /(?:^|[^A-Za-z0-9])(?:AS|RL)-\s*([A-Za-z0-9]+)/i.exec(s);
  if (m) return m[1];
  if (/^\d{3,}$/.test(s)) return s;
  return null;
}

// Clean a serial that was typed, or entered by a handheld USB scanner (which types the label
// text, e.g. "AS-123456"): a leading AS- or RL- prefix is removed. Anything else is kept as is,
// so names such as "COL123" are not changed.
export function cleanSerial(text) {
  const s = String(text ?? '').trim();
  const m = /^(?:AS|RL)-\s*(\S.*)$/i.exec(s);
  return m ? m[1].trim() : s;
}

// New anchors are ticked for export only when their serial has no letters: device serials are
// numbers (12345), while names such as "COL123" are usually helper points, not devices.
export const defaultExport = (serial) => !/\p{L}/u.test(String(serial));
