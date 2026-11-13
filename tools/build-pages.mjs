// Builds the static GitHub Pages site into dist/:
//   dist/index.html  -> redirects to app/
//   dist/app/...     -> the phone/offline app (public/ with the version hash injected into sw.js)
// The laptop version needs the Node server (npm start) and is not part of the static site.
//   node tools/build-pages.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHash, serviceWorkerSource } from './buildhash.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const APP = path.join(DIST, 'app');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });
fs.cpSync(PUBLIC, APP, { recursive: true });
fs.writeFileSync(path.join(APP, 'sw.js'), serviceWorkerSource(PUBLIC));
fs.writeFileSync(path.join(DIST, '.nojekyll'), ''); // serve files as-is
fs.writeFileSync(path.join(DIST, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0; url=app/" />
  <title>Anchor Position Assistant</title>
  <link rel="icon" href="app/icons/icon.svg" type="image/svg+xml" />
</head>
<body style="font-family: system-ui, sans-serif; padding: 24px">
  <p>Opening <a href="app/">Anchor Position Assistant</a>…</p>
  <script>location.replace('app/' + location.hash);</script>
</body>
</html>
`);

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`Built ${count(DIST)} files into dist/ (version ${buildHash(PUBLIC)})`);
