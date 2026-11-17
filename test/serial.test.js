import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSerial } from '../public/serial.js';

test('strips the AS- prefix', () => {
  assert.equal(parseSerial('AS-123456'), '123456');
  assert.equal(parseSerial('  as-0012345678 \n'), '0012345678');
});

test('strips the RL- prefix used by older devices', () => {
  assert.equal(parseSerial('RL-123456'), '123456');
  assert.equal(parseSerial('  rl-0012345678 \n'), '0012345678');
  assert.equal(parseSerial('https://example.com/anchor?id=RL-987654'), '987654');
});

test('finds the serial inside surrounding text', () => {
  assert.equal(parseSerial('https://example.com/anchor?id=AS-987654'), '987654');
  assert.equal(parseSerial('Anchor AS-55555 rev B'), '55555');
});

test('accepts a bare number', () => {
  assert.equal(parseSerial('123456'), '123456');
});

test('rejects unrelated content', () => {
  assert.equal(parseSerial('hello world'), null);
  assert.equal(parseSerial('BAS-123'), null);
  assert.equal(parseSerial('URL-123'), null);
  assert.equal(parseSerial(''), null);
});

import { cleanSerial, defaultExport } from '../public/serial.js';
import { validateAnchorFields } from '../public/validation.js';

test('cleanSerial removes a leading AS- / RL- typed by a USB scanner', () => {
  assert.equal(cleanSerial('AS-123456'), '123456');
  assert.equal(cleanSerial('  as-123456\r\n'), '123456');
  assert.equal(cleanSerial('RL-654321'), '654321');
  assert.equal(cleanSerial('AS- 123456'), '123456');
});

test('cleanSerial leaves other serials and names unchanged', () => {
  assert.equal(cleanSerial('123456'), '123456');
  assert.equal(cleanSerial('COL123'), 'COL123');
  assert.equal(cleanSerial('BAS-123'), 'BAS-123');
  assert.equal(cleanSerial('Column AS-1'), 'Column AS-1');
  assert.equal(cleanSerial('AS-'), 'AS-');
});

test('only serials without letters are exported by default', () => {
  assert.equal(defaultExport('12345'), true);
  assert.equal(defaultExport('0012-34'), true);
  assert.equal(defaultExport('COL123'), false);
  assert.equal(defaultExport('123a'), false);
  assert.equal(defaultExport('Säule 4'), false);
});

test('new anchors: serial cleaned, export follows the serial unless given', () => {
  const v = (body) => validateAnchorFields({ type: 'reference', x: 1, y: 2, ...body }, false).value;
  assert.deepEqual([v({ serial: 'AS-123456' }).serial, v({ serial: 'AS-123456' }).export], ['123456', true]);
  assert.deepEqual([v({ serial: 'COL123' }).serial, v({ serial: 'COL123' }).export], ['COL123', false]);
  assert.equal(v({ serial: 'COL123', export: true }).export, true); // e.g. restored from a backup
  // updates: the serial is cleaned, the export tick is left alone
  const u = validateAnchorFields({ serial: 'as-777' }, true).value;
  assert.deepEqual(u, { serial: '777' });
});
