// Anchor Position Assistant - local server (no external dependencies).
// Stores data in ./data/db.json and floor plan images in ./data/images.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validatePlanFields, validateAnchorFields, duplicateSerialMessage } from './public/validation.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const IMAGE_DIR = path.join(DATA_DIR, 'images');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 60 * 1024 * 1024; // 60 MB (base64 images)

fs.mkdirSync(IMAGE_DIR, { recursive: true });

// ---------- tiny JSON "database" ----------
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { floorplans: [], anchors: [] };
  }
}
let db = loadDb();
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// Hash of every file in public/, injected into the service worker. Any change to the app
// changes sw.js, so installed phones pick up the new version the next time they can reach
// the laptop, and always get a complete, consistent set of files.
function buildHash() {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else { h.update(path.relative(PUBLIC_DIR, p)); h.update(fs.readFileSync(p)); }
    }
  };
  walk(PUBLIC_DIR);
  return h.digest('hex').slice(0, 16);
}

function serveServiceWorker(res) {
  const src = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8').replace("'__BUILD_HASH__'", `'${buildHash()}'`);
  res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
  res.end(src);
}

// ---------- helpers ----------
function send(res, status, body) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}
const fail = (res, status, message) => send(res, status, { error: message });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Resolve a path inside a base dir, refusing traversal outside it.
function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

const now = () => new Date().toISOString();

function planWithCounts(fp) {
  return { ...fp, anchorCount: db.anchors.filter((a) => a.floorplanId === fp.id).length };
}


// ---------- API ----------
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  // /api/floorplans
  if (parts[1] === 'floorplans' && parts.length === 2) {
    if (method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const list = db.floorplans
        .filter((f) => !q || f.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(planWithCounts);
      return send(res, 200, list);
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const v = validatePlanFields(body);
      if (v.error) return fail(res, 400, v.error);
      const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/s.exec(body.image || '');
      if (!m) return fail(res, 400, 'Image must be a PNG or JPEG');
      const id = crypto.randomUUID();
      const imageFile = `${id}.${m[1] === 'png' ? 'png' : 'jpg'}`;
      fs.writeFileSync(path.join(IMAGE_DIR, imageFile), Buffer.from(m[2], 'base64'));
      const fp = { id, ...v.value, imageFile, createdAt: now() };
      db.floorplans.push(fp);
      saveDb();
      return send(res, 201, planWithCounts(fp));
    }
  }

  // /api/floorplans/:id  and /api/floorplans/:id/anchors
  if (parts[1] === 'floorplans' && parts.length >= 3) {
    const fp = db.floorplans.find((f) => f.id === parts[2]);
    if (!fp) return fail(res, 404, 'Floor plan not found');

    if (parts.length === 3) {
      if (method === 'GET') {
        return send(res, 200, { ...fp, anchors: db.anchors.filter((a) => a.floorplanId === fp.id) });
      }
      if (method === 'DELETE') {
        db.floorplans = db.floorplans.filter((f) => f.id !== fp.id);
        db.anchors = db.anchors.filter((a) => a.floorplanId !== fp.id);
        saveDb();
        fs.rm(path.join(IMAGE_DIR, fp.imageFile), { force: true }, () => {});
        return send(res, 204);
      }
    }

    if (parts.length === 4 && parts[3] === 'anchors' && method === 'POST') {
      const body = await readJson(req);
      const v = validateAnchorFields(body, false);
      if (v.error) return fail(res, 400, v.error);
      if (db.anchors.some((a) => a.floorplanId === fp.id && a.serial === v.value.serial))
        return fail(res, 409, duplicateSerialMessage(v.value.serial));
      const anchor = { id: crypto.randomUUID(), floorplanId: fp.id, measurements: [], lastSolve: null, export: true, ...v.value, createdAt: now() };
      db.anchors.push(anchor);
      saveDb();
      return send(res, 201, anchor);
    }
  }

  // /api/anchors/:id
  if (parts[1] === 'anchors' && parts.length === 3) {
    const anchor = db.anchors.find((a) => a.id === parts[2]);
    if (!anchor) return fail(res, 404, 'Anchor not found');
    if (method === 'PATCH') {
      const body = await readJson(req);
      const v = validateAnchorFields(body, true);
      if (v.error) return fail(res, 400, v.error);
      if (v.value.serial && db.anchors.some((a) => a.id !== anchor.id && a.floorplanId === anchor.floorplanId && a.serial === v.value.serial))
        return fail(res, 409, duplicateSerialMessage(v.value.serial));
      Object.assign(anchor, v.value, { updatedAt: now() });
      saveDb();
      return send(res, 200, anchor);
    }
    if (method === 'DELETE') {
      db.anchors = db.anchors.filter((a) => a.id !== anchor.id);
      // Drop measurements that pointed to the deleted anchor.
      for (const a of db.anchors) {
        if (a.measurements?.some((m) => m.toAnchorId === anchor.id)) {
          a.measurements = a.measurements.filter((m) => m.toAnchorId !== anchor.id);
        }
      }
      saveDb();
      return send(res, 204);
    }
  }

  return fail(res, 404, 'Unknown API route');
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/images/')) {
      const p = safeJoin(IMAGE_DIR, decodeURIComponent(url.pathname.slice('/images/'.length)));
      return p ? serveFile(res, p) : fail(res, 404, 'Not found');
    }
    // Phone app (offline, on-device storage): the same files, served under /app/.
    if (url.pathname === '/app') { res.writeHead(301, { Location: '/app/' }); return res.end(); }
    let pathname = url.pathname;
    if (pathname.startsWith('/app/')) {
      pathname = pathname.slice('/app'.length);
      if (pathname === '/sw.js') return serveServiceWorker(res);
    }
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const p = safeJoin(PUBLIC_DIR, rel);
    return p ? serveFile(res, p) : fail(res, 404, 'Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) fail(res, err.status || 500, err.message || 'Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Anchor Position Assistant running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
