// Generates the app icons in public/icons/ (a white map pin on a dark blue background).
// No dependencies: rasterises the pin shape directly and writes PNGs with node:zlib.
//   node tools/make-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const BG = [15, 23, 42];     // #0f172a
const PIN = [37, 99, 235];   // #2563eb
const WHITE = [255, 255, 255];

// Pin geometry in unit coordinates (0..1), scaled by `k` around the centre (k < 1 for maskable safe zone).
function colorAt(u, v, k) {
  const x = (u - 0.5) / k + 0.5, y = (v - 0.5) / k + 0.5;
  const cx = 0.5, cy = 0.40, r = 0.22, tipY = 0.86;
  const dx = x - cx, dy = y - cy;
  const inCircle = dx * dx + dy * dy <= r * r;
  const d = tipY - cy;
  const tanA = r / Math.sqrt(d * d - r * r);
  const tangentY = cy + (r * r) / d;               // where the cone touches the circle
  const inCone = y >= tangentY && y <= tipY && Math.abs(dx) <= (tipY - y) * tanA;
  if (!(inCircle || inCone)) return BG;
  const hole = dx * dx + dy * dy <= (r * 0.42) ** 2;
  const rim = !hole && (inCircle ? Math.sqrt(dx * dx + dy * dy) > r - 0.02 : false);
  return hole ? WHITE : rim ? WHITE : PIN;
}

function render(size, k) {
  const S = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = colorAt((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size, k);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = Math.round(r / (S * S)); raw[o + 1] = Math.round(g / (S * S)); raw[o + 2] = Math.round(b / (S * S));
    }
  }
  return png(size, size, raw);
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), render(192, 0.9));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), render(512, 0.9));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), render(512, 0.7)); // pin inside the 80% safe zone
fs.writeFileSync(path.join(OUT, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0f172a"/>
  <g transform="translate(32 55) scale(1.45)">
    <path d="M0,0 C-2,-9 -12,-15 -12,-26 A12,12 0 1,1 12,-26 C12,-15 2,-9 0,0 Z" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>
    <circle cx="0" cy="-26" r="4.5" fill="#fff"/>
  </g>
</svg>
`);
console.log('Icons written to', OUT);
