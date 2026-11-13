import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSql, buildCsv, sqlNumber, isExported } from '../public/exporters.js';

const anchors = [
  { serial: '123456', type: 'reference', x: 10, y: 25.3, measurements: [] },
  { serial: '0099', type: 'approximate', x: 3.14159, y: 0.0004, measurements: [{}, {}], lastSolve: { at: '2026-11-12T10:00:00Z', rms: 0.0123 } },
];

test('SQL statement matches the required format', () => {
  const sql = buildSql('Plant 1', anchors, new Date('2026-11-12T00:00:00Z'));
  assert.ok(sql.includes("update device set space_coordinates=(10,25.3) where serial_number='123456';"), sql);
  assert.ok(sql.includes("update device set space_coordinates=(3.142,0) where serial_number='0099';"), sql);
  assert.equal(sql.split('\n').filter((l) => l.startsWith('update')).length, 2);
});

test('SQL escapes quotes and keeps comments on one line', () => {
  const sql = buildSql("Bob's\nplan", [{ serial: "12'3", type: 'reference', x: 1, y: 2 }]);
  assert.ok(sql.includes("serial_number='12''3';"));
  assert.ok(sql.includes("-- Anchor positions for floor plan: Bob's plan"));
});

test('sqlNumber trims and rounds to mm', () => {
  assert.equal(sqlNumber(10), '10');
  assert.equal(sqlNumber(25.3), '25.3');
  assert.equal(sqlNumber(-0.0001), '0');
  assert.equal(sqlNumber(1.23456), '1.235');
});

test('CSV lists the given anchors', () => {
  const csv = buildCsv('Plant 1', anchors);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Floor plan,Serial,Type,X (m),Y (m),Position calculated,Measurements,Last calculated,RMS residual (m),Max residual (m),Anchors used,Reference anchors used,Effective anchor count,HDOP');
  assert.equal(lines[1], 'Plant 1,123456,Reference,10.000,25.300,,0,,,,,,,');
  // calculated before the metrics were logged: only the fields that exist
  assert.equal(lines[2], 'Plant 1,0099,Approximate,3.142,0.000,No,2,2026-11-12T10:00:00.000Z,0.012,,,,,');
});

test('CSV includes the logged calculation metrics', () => {
  const a = {
    serial: '777', type: 'approximate', x: 10, y: 8, calculated: true, measurements: [{}, {}, {}, {}],
    lastSolve: { at: '2026-11-13T21:00:00Z', rms: 0.0214, maxResidual: 0.0371, n: 4, references: 3, effectiveAnchors: 3.4123, hdop: 1.0789 },
  };
  const line = buildCsv('Plant 1', [a]).split('\r\n')[1];
  assert.equal(line, 'Plant 1,777,Approximate,10.000,8.000,Yes,4,2026-11-13T21:00:00.000Z,0.021,0.037,4,3,3.41,1.08');
});

test('anchors are exported unless explicitly unticked', () => {
  assert.equal(isExported({}), true);
  assert.equal(isExported({ export: true }), true);
  assert.equal(isExported({ export: false }), false);
});
