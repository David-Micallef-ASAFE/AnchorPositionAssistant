// Hash of every file in a folder. Injected into the service worker (sw.js) so that any change
// to the app changes sw.js, which makes installed phones fetch the complete new version.
// Used by server.js (local hosting) and tools/build-pages.mjs (GitHub Pages).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function buildHash(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      // Normalise line endings so a Windows checkout and a Linux build give the same hash.
      else { h.update(path.relative(dir, p).replace(/\\/g, '/')); h.update(normalise(fs.readFileSync(p), p)); }
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 16);
}

const TEXT = /\.(js|mjs|css|html|json|webmanifest|svg|txt)$/i;
function normalise(buf, file) {
  return TEXT.test(file) ? Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n')) : buf;
}

// sw.js source with the placeholder replaced.
export function serviceWorkerSource(publicDir) {
  return fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8').replace("'__BUILD_HASH__'", `'${buildHash(publicDir)}'`);
}
