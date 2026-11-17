import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSuggestedCsv } from '../public/suggested.js';
import { validateSuggestedPositions } from '../public/validation.js';

test("reads the engineer's CSV (Anchor,X,Y with CRLF line endings)", () => {
  const { positions, skipped } = parseSuggestedCsv('Anchor,X,Y\r\nG01,29.51,28.85\r\nG02,29.51,16.21\r\nC01,64.65,31.66');
  assert.deepEqual(positions, [
    { name: 'G01', x: 29.51, y: 28.85 },
    { name: 'G02', x: 29.51, y: 16.21 },
    { name: 'C01', x: 64.65, y: 31.66 },
  ]);
  assert.deepEqual(skipped, []);
});

test('finds the columns by name, in any order', () => {
  const { positions } = parseSuggestedCsv('﻿Y (m),Name,X (m)\n2,A1,1\n');
  assert.deepEqual(positions, [{ name: 'A1', x: 1, y: 2 }]);
});

test('semicolon or tab separated, decimal commas, no header', () => {
  assert.deepEqual(parseSuggestedCsv('G01;29,51;28,85\nG02;1;2').positions,
    [{ name: 'G01', x: 29.51, y: 28.85 }, { name: 'G02', x: 1, y: 2 }]);
  assert.deepEqual(parseSuggestedCsv('Anchor\tX\tY\nG01\t3.5\t-1').positions, [{ name: 'G01', x: 3.5, y: -1 }]);
});

test('quoted names, blank lines and bad rows', () => {
  const { positions, skipped } = parseSuggestedCsv('Anchor,X,Y\n"Col, north",1,2\n\nG02,abc,3\n,4,5\nG03,6,7\n');
  assert.deepEqual(positions, [{ name: 'Col, north', x: 1, y: 2 }, { name: 'G03', x: 6, y: 7 }]);
  assert.deepEqual(skipped, [4, 5]);
});

test('a file without any position is rejected', () => {
  assert.throws(() => parseSuggestedCsv('Anchor,X,Y\n'), /No positions found/);
  assert.throws(() => parseSuggestedCsv(''), /No positions found/);
  assert.throws(() => parseSuggestedCsv('hello world'), /No positions found/);
});

test('stored positions are validated', () => {
  assert.deepEqual(validateSuggestedPositions([{ name: ' G01 ', x: 1, y: 2 }]).value, [{ name: 'G01', x: 1, y: 2 }]);
  assert.deepEqual(validateSuggestedPositions([]).value, []);
  assert.match(validateSuggestedPositions([{ name: '', x: 1, y: 2 }]).error, /name/);
  assert.match(validateSuggestedPositions([{ name: 'A', x: '1', y: 2 }]).error, /numbers/);
  assert.match(validateSuggestedPositions('x').error, /array/);
});
