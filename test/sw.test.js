// The phone app only works offline if the service worker caches every file it needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const files = JSON.parse(
  /const FILES = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']')
);

test('every cached file exists', () => {
  for (const f of files) {
    const p = path.join(PUBLIC, f === './' ? 'index.html' : f);
    assert.ok(fs.existsSync(p), `sw.js caches ${f} but ${p} does not exist`);
  }
});

test('every module, script, stylesheet and icon the app loads is cached', () => {
  const needed = new Set();
  for (const js of fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.js') && f !== 'sw.js')) {
    const src = fs.readFileSync(path.join(PUBLIC, js), 'utf8');
    for (const m of src.matchAll(/from '\.\/([^']+)'/g)) needed.add(m[1]);
  }
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) needed.add(m[1]);
  const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
  for (const i of manifest.icons) needed.add(i.src);
  needed.add('manifest.webmanifest');
  for (const n of needed) assert.ok(files.includes(n), `${n} is used by the app but not cached in sw.js`);
});
