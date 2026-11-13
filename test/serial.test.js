import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSerial } from '../public/serial.js';

test('strips the AS- prefix', () => {
  assert.equal(parseSerial('AS-123456'), '123456');
  assert.equal(parseSerial('  as-0012345678 \n'), '0012345678');
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
  assert.equal(parseSerial(''), null);
});
