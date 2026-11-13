// Storage back ends with one shared interface:
//
//   listPlans(query)                -> [{ id, name, width, height, createdAt, imageUrl, anchorCount }]
//   getPlan(id)                     -> { ...plan, imageUrl, anchors: [...] }
//   createPlan({ name, width, height, image: Blob })  -> plan
//   deletePlan(id)
//   replacePlanImage(id, image: Blob) -> plan (with the new imageUrl)
//   createAnchor(planId, fields)    -> anchor
//   updateAnchor(id, fields)        -> anchor
//   deleteAnchor(id)                (also removes measurements that point to it)
//   getImageBlob(plan)              -> Blob
//
// createServerStore(): the laptop web app, talking to server.js.
// createLocalStore():  the phone app, keeping everything in the browser's IndexedDB on the device.

import { validatePlanFields, validateAnchorFields, duplicateSerialMessage } from './validation.js';

export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

const isImageType = (t) => t === 'image/png' || t === 'image/jpeg';

// ======================================================================
// Server (laptop)
// ======================================================================
export function createServerStore() {
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  const withUrl = (p) => ({ ...p, imageUrl: '/images/' + encodeURIComponent(p.imageFile) });

  return {
    kind: 'server',
    async listPlans(q = '') { return (await api('GET', '/api/floorplans?q=' + encodeURIComponent(q))).map(withUrl); },
    async getPlan(id) { return withUrl(await api('GET', '/api/floorplans/' + encodeURIComponent(id))); },
    async createPlan({ name, width, height, image }) {
      if (!isImageType(image?.type)) throw new Error('Image must be a PNG or JPEG');
      return withUrl(await api('POST', '/api/floorplans', { name, width, height, image: await blobToDataUrl(image) }));
    },
    deletePlan: (id) => api('DELETE', '/api/floorplans/' + encodeURIComponent(id)),
    async replacePlanImage(id, image) {
      if (!isImageType(image?.type)) throw new Error('Image must be a PNG or JPEG');
      return withUrl(await api('PUT', `/api/floorplans/${encodeURIComponent(id)}/image`, { image: await blobToDataUrl(image) }));
    },
    createAnchor: (planId, fields) => api('POST', `/api/floorplans/${encodeURIComponent(planId)}/anchors`, fields),
    updateAnchor: (id, fields) => api('PATCH', '/api/anchors/' + encodeURIComponent(id), fields),
    deleteAnchor: (id) => api('DELETE', '/api/anchors/' + encodeURIComponent(id)),
    async getImageBlob(plan) {
      const res = await fetch(plan.imageUrl);
      if (!res.ok) throw new Error('Could not load the floor plan image');
      return res.blob();
    },
  };
}

// ======================================================================
// IndexedDB (phone, works offline)
// ======================================================================
const DB_NAME = 'anchor-position-assistant';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('floorplans')) db.createObjectStore('floorplans', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('anchors')) {
        db.createObjectStore('anchors', { keyPath: 'id' }).createIndex('floorplanId', 'floorplanId');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images'); // key = plan id, value = Blob
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The database is in use by another tab – close other copies of the app.'));
  });
}

const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// Run fn(stores) in one transaction; resolves with fn's result once the transaction commits.
async function tx(dbP, names, mode, fn) {
  const db = await dbP;
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    let failed = null;
    Promise.resolve()
      .then(() => fn(stores))
      .then((r) => { result = r; }, (err) => { failed = err; try { t.abort(); } catch { /* already done */ } });
    t.oncomplete = () => (failed ? reject(failed) : resolve(result));
    t.onerror = () => reject(failed || t.error);
    t.onabort = () => reject(failed || t.error || new Error('Storage transaction aborted'));
  });
}

class HttpLikeError extends Error {}
const now = () => new Date().toISOString();

export function createLocalStore() {
  const dbP = openDb();
  const urls = new Map(); // plan id -> object URL for its image

  async function imageUrlFor(id) {
    if (urls.has(id)) return urls.get(id);
    const blob = await tx(dbP, ['images'], 'readonly', (s) => reqP(s.images.get(id)));
    if (!blob) return '';
    const u = URL.createObjectURL(blob);
    urls.set(id, u);
    return u;
  }
  function dropUrl(id) {
    const u = urls.get(id);
    if (u) URL.revokeObjectURL(u);
    urls.delete(id);
  }

  return {
    kind: 'local',

    async listPlans(q = '') {
      const query = q.trim().toLowerCase();
      const { plans, anchors } = await tx(dbP, ['floorplans', 'anchors'], 'readonly', async (s) => ({
        plans: await reqP(s.floorplans.getAll()),
        anchors: await reqP(s.anchors.getAll()),
      }));
      const counts = new Map();
      for (const a of anchors) counts.set(a.floorplanId, (counts.get(a.floorplanId) || 0) + 1);
      const list = plans
        .filter((p) => !query || p.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));
      return Promise.all(list.map(async (p) => ({ ...p, anchorCount: counts.get(p.id) || 0, imageUrl: await imageUrlFor(p.id) })));
    },

    async getPlan(id) {
      const { plan, anchors } = await tx(dbP, ['floorplans', 'anchors'], 'readonly', async (s) => ({
        plan: await reqP(s.floorplans.get(id)),
        anchors: await reqP(s.anchors.index('floorplanId').getAll(id)),
      }));
      if (!plan) throw new HttpLikeError('Floor plan not found');
      return { ...plan, imageUrl: await imageUrlFor(id), anchors };
    },

    async createPlan({ name, width, height, image }) {
      const v = validatePlanFields({ name, width, height });
      if (v.error) throw new HttpLikeError(v.error);
      if (!isImageType(image?.type)) throw new HttpLikeError('Image must be a PNG or JPEG');
      const plan = { id: crypto.randomUUID(), ...v.value, imageType: image.type, createdAt: now() };
      // Store a plain Blob (not a File) so it survives structured cloning everywhere.
      const blob = new Blob([await image.arrayBuffer()], { type: image.type });
      await tx(dbP, ['floorplans', 'images'], 'readwrite', (s) => {
        s.floorplans.put(plan);
        s.images.put(blob, plan.id);
      });
      return { ...plan, anchorCount: 0, imageUrl: await imageUrlFor(plan.id) };
    },

    async deletePlan(id) {
      await tx(dbP, ['floorplans', 'anchors', 'images'], 'readwrite', async (s) => {
        const keys = await reqP(s.anchors.index('floorplanId').getAllKeys(id));
        for (const k of keys) s.anchors.delete(k);
        s.floorplans.delete(id);
        s.images.delete(id);
      });
      dropUrl(id);
      return null;
    },

    async replacePlanImage(id, image) {
      if (!isImageType(image?.type)) throw new HttpLikeError('Image must be a PNG or JPEG');
      const blob = new Blob([await image.arrayBuffer()], { type: image.type });
      const plan = await tx(dbP, ['floorplans', 'images'], 'readwrite', async (s) => {
        const p = await reqP(s.floorplans.get(id));
        if (!p) throw new HttpLikeError('Floor plan not found');
        Object.assign(p, { imageType: image.type, updatedAt: now() });
        s.floorplans.put(p);
        s.images.put(blob, id);
        return p;
      });
      dropUrl(id);
      return { ...plan, imageUrl: await imageUrlFor(id) };
    },

    async createAnchor(planId, fields) {
      const v = validateAnchorFields(fields, false);
      if (v.error) throw new HttpLikeError(v.error);
      return tx(dbP, ['floorplans', 'anchors'], 'readwrite', async (s) => {
        if (!(await reqP(s.floorplans.get(planId)))) throw new HttpLikeError('Floor plan not found');
        const siblings = await reqP(s.anchors.index('floorplanId').getAll(planId));
        if (siblings.some((a) => a.serial === v.value.serial)) throw new HttpLikeError(duplicateSerialMessage(v.value.serial));
        const anchor = { id: crypto.randomUUID(), floorplanId: planId, measurements: [], lastSolve: null, export: true, ...v.value, createdAt: now() };
        s.anchors.put(anchor);
        return anchor;
      });
    },

    async updateAnchor(id, fields) {
      const v = validateAnchorFields(fields, true);
      if (v.error) throw new HttpLikeError(v.error);
      return tx(dbP, ['anchors'], 'readwrite', async (s) => {
        const anchor = await reqP(s.anchors.get(id));
        if (!anchor) throw new HttpLikeError('Anchor not found');
        if (v.value.serial) {
          const siblings = await reqP(s.anchors.index('floorplanId').getAll(anchor.floorplanId));
          if (siblings.some((a) => a.id !== id && a.serial === v.value.serial)) throw new HttpLikeError(duplicateSerialMessage(v.value.serial));
        }
        Object.assign(anchor, v.value, { updatedAt: now() });
        s.anchors.put(anchor);
        return anchor;
      });
    },

    async deleteAnchor(id) {
      await tx(dbP, ['anchors'], 'readwrite', async (s) => {
        const anchor = await reqP(s.anchors.get(id));
        if (!anchor) throw new HttpLikeError('Anchor not found');
        s.anchors.delete(id);
        const siblings = await reqP(s.anchors.index('floorplanId').getAll(anchor.floorplanId));
        for (const a of siblings) {
          if (a.id !== id && a.measurements?.some((m) => m.toAnchorId === id)) {
            a.measurements = a.measurements.filter((m) => m.toAnchorId !== id);
            s.anchors.put(a);
          }
        }
      });
      return null;
    },

    async getImageBlob(plan) {
      const blob = await tx(dbP, ['images'], 'readonly', (s) => reqP(s.images.get(plan.id)));
      if (!blob) throw new Error('Floor plan image is missing');
      return blob;
    },
  };
}
