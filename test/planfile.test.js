import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportPlanFile, importPlanFile, parsePlanFile } from '../public/planfile.js';
import { validatePlanFields, validateAnchorFields, duplicateSerialMessage } from '../public/validation.js';

// Minimal in-memory store with the same interface (and validation) as the real ones.
function memoryStore() {
  const plans = new Map(), anchors = new Map(), images = new Map();
  return {
    async getPlan(id) {
      const p = plans.get(id);
      if (!p) throw new Error('Floor plan not found');
      return { ...p, anchors: [...anchors.values()].filter((a) => a.floorplanId === id).map((a) => structuredClone(a)) };
    },
    async createPlan({ name, width, height, image }) {
      const v = validatePlanFields({ name, width, height });
      if (v.error) throw new Error(v.error);
      const p = { id: crypto.randomUUID(), ...v.value, createdAt: new Date().toISOString() };
      plans.set(p.id, p); images.set(p.id, image);
      return p;
    },
    async deletePlan(id) { plans.delete(id); for (const [k, a] of anchors) if (a.floorplanId === id) anchors.delete(k); },
    async createAnchor(planId, fields) {
      const v = validateAnchorFields(fields, false);
      if (v.error) throw new Error(v.error);
      if ([...anchors.values()].some((a) => a.floorplanId === planId && a.serial === v.value.serial)) throw new Error(duplicateSerialMessage(v.value.serial));
      const a = { id: crypto.randomUUID(), floorplanId: planId, measurements: [], lastSolve: null, export: true, ...v.value };
      anchors.set(a.id, a);
      return structuredClone(a);
    },
    async updateAnchor(id, fields) {
      const v = validateAnchorFields(fields, true);
      if (v.error) throw new Error(v.error);
      Object.assign(anchors.get(id), v.value);
      return structuredClone(anchors.get(id));
    },
    async getImageBlob(plan) { return images.get(plan.id); },
    _plans: plans,
  };
}

const PNG = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 250])], { type: 'image/png' });

test('plan file round trip keeps plan, anchors, flags and measurements', async () => {
  const src = memoryStore();
  const plan = await src.createPlan({ name: 'Hall B', width: 30, height: 12.5, image: PNG });
  const r1 = await src.createAnchor(plan.id, { serial: '111', type: 'reference', x: 1, y: 2 });
  const r2 = await src.createAnchor(plan.id, { serial: '222', type: 'reference', x: 20, y: 2 });
  const ap = await src.createAnchor(plan.id, { serial: '333', type: 'approximate', x: 10, y: 8 });
  await src.updateAnchor(r2.id, { export: false });
  await src.updateAnchor(ap.id, {
    measurements: [{ toAnchorId: r1.id, distance: 10.5 }, { toAnchorId: r2.id, distance: null }],
    lastSolve: { at: '2026-11-13T09:00:00Z', rms: 0.02, n: 2 },
    calculated: true,
  });

  const { json } = await exportPlanFile(src, plan.id);
  const dst = memoryStore();
  const imported = await importPlanFile(dst, json);
  const got = await dst.getPlan(imported.id);

  assert.equal(got.name, 'Hall B');
  assert.equal(got.width, 30);
  assert.equal(got.height, 12.5);
  const bySerial = Object.fromEntries(got.anchors.map((a) => [a.serial, a]));
  assert.deepEqual(Object.keys(bySerial).sort(), ['111', '222', '333']);
  assert.equal(bySerial['222'].export, false);
  assert.equal(bySerial['111'].export, true);
  assert.equal(bySerial['333'].type, 'approximate');
  assert.equal(bySerial['333'].calculated, true);
  assert.notEqual(bySerial['111'].calculated, true);
  assert.deepEqual(bySerial['333'].lastSolve, { at: '2026-11-13T09:00:00Z', rms: 0.02, n: 2 });
  // measurements now point at the new ids
  const ms = bySerial['333'].measurements;
  assert.equal(ms.length, 2);
  assert.equal(ms[0].toAnchorId, bySerial['111'].id);
  assert.equal(ms[0].distance, 10.5);
  assert.equal(ms[1].toAnchorId, bySerial['222'].id);
  assert.equal(ms[1].distance, null);
  // image bytes survive
  const img = await dst.getImageBlob(got);
  assert.deepEqual(new Uint8Array(await img.arrayBuffer()), new Uint8Array(await PNG.arrayBuffer()));
  assert.equal(img.type, 'image/png');
});

test('rejects files that are not plan files', () => {
  assert.throws(() => parsePlanFile('not json'), /not a plan file/);
  assert.throws(() => parsePlanFile('{"format":"something-else"}'), /not an Anchor Position Assistant/);
});

test('a failed import does not leave a half-imported plan', async () => {
  const dst = memoryStore();
  const bad = JSON.stringify({
    format: 'anchor-position-assistant/plan', version: 1,
    plan: { name: 'X', width: 5, height: 5 },
    image: 'data:image/png;base64,iVBORw==',
    anchors: [{ serial: '1', type: 'reference', x: 0, y: 0 }, { serial: '1', type: 'reference', x: 1, y: 1 }],
  });
  await assert.rejects(importPlanFile(dst, bad), /already exists/);
  assert.equal(dst._plans.size, 0);
});
