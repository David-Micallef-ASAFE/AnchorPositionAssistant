import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize, targetSize, isTooLarge, MAX_EDGE, MAX_PIXELS } from '../public/imageprep.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('reads PNG dimensions from the header', () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'public', 'icons', 'icon-192.png')));
  assert.deepEqual(imageSize(bytes), { width: 192, height: 192 });
});

test('reads JPEG dimensions from the SOF marker', () => {
  // Minimal JPEG header: SOI, APP0 (length 16), SOF0 with height 1234, width 5678
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xd2, 0x16, 0x2e, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const bytes = new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
  assert.deepEqual(imageSize(bytes), { width: 5678, height: 1234 });
});

test('unknown data gives null', () => {
  assert.equal(imageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])), null);
});

test('small images are left alone', () => {
  assert.equal(targetSize(4000, 3000), null);
  assert.equal(isTooLarge(MAX_EDGE, 1000), false);
});

test('huge images are reduced, keeping the aspect ratio', () => {
  const t = targetSize(22135, 12626); // the real ground floor plan
  assert.ok(t.width <= MAX_EDGE && t.height <= MAX_EDGE);
  assert.ok(t.width * t.height <= MAX_PIXELS * 1.001);
  assert.ok(Math.abs(t.width / t.height - 22135 / 12626) < 0.001);
});

test('very long images are limited by the longest edge', () => {
  const t = targetSize(30000, 2000);
  assert.equal(t.width, MAX_EDGE);
  assert.equal(t.height, Math.round(2000 * MAX_EDGE / 30000));
});
