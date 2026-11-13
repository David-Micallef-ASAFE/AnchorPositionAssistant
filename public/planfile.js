// Whole floor plan as one portable file (image + anchors + measurements), for backups and for
// moving a plan between the phone app and the laptop app. Works with either store back end.

import { blobToDataUrl } from './store.js';

export const PLAN_FILE_FORMAT = 'anchor-position-assistant/plan';
export const PLAN_FILE_EXT = 'apaplan.json';

export async function exportPlanFile(store, planId) {
  const plan = await store.getPlan(planId);
  const image = await store.getImageBlob(plan);
  const serialOf = new Map(plan.anchors.map((a) => [a.id, a.serial]));
  const data = {
    format: PLAN_FILE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    plan: { name: plan.name, width: plan.width, height: plan.height, createdAt: plan.createdAt },
    image: await blobToDataUrl(image),
    // Measurements reference other anchors by serial, so ids can be regenerated on import.
    anchors: plan.anchors.map((a) => ({
      serial: a.serial,
      type: a.type,
      x: a.x,
      y: a.y,
      export: a.export !== false,
      calculated: a.calculated === true,
      lastSolve: a.lastSolve ?? null,
      measurements: (a.measurements || [])
        .filter((m) => serialOf.has(m.toAnchorId))
        .map((m) => ({ toSerial: serialOf.get(m.toAnchorId), distance: m.distance })),
    })),
  };
  return { plan, json: JSON.stringify(data) };
}

// Parse + check a plan file without touching storage. Throws a readable error.
export function parsePlanFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This is not a plan file (invalid JSON).'); }
  if (data?.format !== PLAN_FILE_FORMAT) throw new Error('This is not an Anchor Position Assistant plan file.');
  if (data.version !== 1) throw new Error(`Unsupported plan file version ${data.version}.`);
  if (!data.plan || !Array.isArray(data.anchors) || typeof data.image !== 'string') throw new Error('The plan file is incomplete.');
  if (!/^data:image\/(png|jpeg);base64,/.test(data.image)) throw new Error('The plan file has no valid PNG/JPEG image.');
  return data;
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const type = /^data:([^;]+)/.exec(head)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// Creates a new floor plan from the file. Returns the new plan.
// prepareImage(blob) -> blob: optional hook, e.g. to shrink an oversized image.
export async function importPlanFile(store, text, { name, prepareImage } = {}) {
  const data = parsePlanFile(text);
  let image = dataUrlToBlob(data.image);
  if (prepareImage) image = await prepareImage(image);
  const plan = await store.createPlan({
    name: name || data.plan.name,
    width: data.plan.width,
    height: data.plan.height,
    image,
  });
  try {
    const idBySerial = new Map();
    for (const a of data.anchors) {
      const created = await store.createAnchor(plan.id, {
        serial: a.serial, type: a.type, x: a.x, y: a.y, export: a.export !== false, calculated: a.calculated === true,
      });
      idBySerial.set(created.serial, created.id);
      if (a.lastSolve) await store.updateAnchor(created.id, { lastSolve: a.lastSolve });
    }
    for (const a of data.anchors) {
      const ms = (a.measurements || [])
        .filter((m) => idBySerial.has(m.toSerial))
        .map((m) => ({ toAnchorId: idBySerial.get(m.toSerial), distance: m.distance }));
      if (ms.length) await store.updateAnchor(idBySerial.get(String(a.serial).trim()), { measurements: ms });
    }
  } catch (err) {
    // Don't leave a half-imported plan behind.
    await store.deletePlan(plan.id).catch(() => {});
    throw err;
  }
  return plan;
}
