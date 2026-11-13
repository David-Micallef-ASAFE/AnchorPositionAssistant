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
