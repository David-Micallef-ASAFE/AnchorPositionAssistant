import { solvePosition } from './trilateration.js';
import { scanSerial } from './qr-scanner.js';
import { buildCsv, buildSql, isExported, sortAnchors } from './exporters.js';

// ======================================================================
// Helpers
// ======================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isError ? 5000 : 2500);
}
const handleError = (err) => { console.error(err); toast(err.message || String(err), true); };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ======================================================================
// Routing
// ======================================================================
function route() {
  const m = location.hash.match(/^#\/plan\/([\w-]+)/);
  if (m) openPlan(m[1]).catch((e) => { handleError(e); location.hash = '#/'; });
  else showHome();
}
window.addEventListener('hashchange', route);

// ======================================================================
// Home: floor plan list + upload
// ======================================================================
const home = { search: '' };

function showHome() {
  state.plan = null;
  $('#view-plan').hidden = true;
  $('#view-home').hidden = false;
  $('#topbar-context').innerHTML = '';
  loadPlans();
}

async function loadPlans() {
  try {
    const list = await api('GET', '/api/floorplans?q=' + encodeURIComponent(home.search));
    $('#plan-rows').innerHTML = list.map((fp) => `
      <tr class="clickable" data-open="${fp.id}">
        <td><img class="thumb" src="/images/${encodeURIComponent(fp.imageFile)}" alt="" loading="lazy" /></td>
        <td><strong>${esc(fp.name)}</strong></td>
        <td>${fmt(fp.width)} × ${fmt(fp.height)}</td>
        <td>${fp.anchorCount}</td>
        <td class="muted small">${new Date(fp.createdAt).toLocaleString()}</td>
        <td class="actions">
          <button data-open="${fp.id}">Open</button>
          <button class="danger" data-delete="${fp.id}" data-name="${esc(fp.name)}">Delete</button>
        </td>
      </tr>`).join('');
    $('#plan-empty').hidden = list.length > 0;
    $('#plan-empty').textContent = home.search ? 'No floor plans match your search.' : 'No floor plans yet. Upload one on the left.';
  } catch (e) { handleError(e); }
}

$('#plan-search').addEventListener('input', debounce((e) => { home.search = e.target.value; loadPlans(); }, 200));

$('#plan-rows').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-delete]');
  if (del) {
    e.stopPropagation();
    if (!confirm(`Delete floor plan "${del.dataset.name}" and all its anchors? This cannot be undone.`)) return;
    try { await api('DELETE', '/api/floorplans/' + del.dataset.delete); toast('Floor plan deleted'); loadPlans(); }
    catch (err) { handleError(err); }
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open) location.hash = '#/plan/' + open.dataset.open;
});

// --- upload form ---
const uploadForm = $('#upload-form');
let uploadImg = null; // { dataUrl, w, h }

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function updateUploadHint() {
  const hint = $('#upload-hint');
  if (!uploadImg) { hint.innerHTML = ''; return; }
  const ratio = uploadImg.h / uploadImg.w;
  const W = parseFloat(uploadForm.width.value);
  const H = parseFloat(uploadForm.height.value);
  let html = `Image: ${uploadImg.w} × ${uploadImg.h} px.`;
  if (W > 0 && !(H > 0)) {
    html += ` Matching height: <button type="button" class="link" data-set-height="${(W * ratio).toFixed(3)}">${(W * ratio).toFixed(3)} m</button>`;
  } else if (H > 0 && !(W > 0)) {
    html += ` Matching width: <button type="button" class="link" data-set-width="${(H / ratio).toFixed(3)}">${(H / ratio).toFixed(3)} m</button>`;
  } else if (W > 0 && H > 0) {
    const diff = Math.abs(H / W - ratio) / ratio;
    if (diff > 0.02) {
      html += ` <span class="resid-warn">Width/height ratio differs from the image by ${(diff * 100).toFixed(1)}% – the image will be stretched.</span>
        Height for this width: <button type="button" class="link" data-set-height="${(W * ratio).toFixed(3)}">${(W * ratio).toFixed(3)} m</button>`;
    } else {
      html += ' Aspect ratio matches.';
    }
  }
  hint.innerHTML = html;
}

uploadForm.image.addEventListener('change', async () => {
  const file = uploadForm.image.files[0];
  uploadImg = null;
  $('#upload-preview').hidden = true;
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) { toast('Please choose a PNG or JPEG image', true); uploadForm.image.value = ''; return; }
  const dataUrl = await readFileAsDataUrl(file);
  const img = $('#upload-preview img');
  img.onload = () => {
    uploadImg = { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
    $('#upload-preview').hidden = false;
    if (!uploadForm.name.value) uploadForm.name.value = file.name.replace(/\.[^.]+$/, '');
    updateUploadHint();
  };
  img.src = dataUrl;
});
uploadForm.width.addEventListener('input', updateUploadHint);
uploadForm.height.addEventListener('input', updateUploadHint);
$('#upload-hint').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.setHeight) uploadForm.height.value = b.dataset.setHeight;
  if (b.dataset.setWidth) uploadForm.width.value = b.dataset.setWidth;
  updateUploadHint();
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!uploadImg) { toast('Choose an image first', true); return; }
  const btn = uploadForm.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const fp = await api('POST', '/api/floorplans', {
      name: uploadForm.name.value.trim(),
      width: parseFloat(uploadForm.width.value),
      height: parseFloat(uploadForm.height.value),
      image: uploadImg.dataUrl,
    });
    uploadForm.reset();
    uploadImg = null;
    $('#upload-preview').hidden = true;
    toast('Floor plan uploaded');
    location.hash = '#/plan/' + fp.id;
  } catch (err) { handleError(err); }
  finally { btn.disabled = false; }
});

// ======================================================================
// Plan view state
// ======================================================================
const state = {
  plan: null,            // { id, name, width, height, imageFile, anchors: [] }
  selectedId: null,
  view: { s: 1, tx: 0, ty: 0, fitS: 1 },
  needsFit: true,
  showMeasurements: false,
  measureMode: false,
  measurePoint: null,    // { x, y } in meters
  solve: null,           // { anchorId, result, rows }
  anchorFilter: '',
  locked: false,
  pickMode: false,       // waiting for the user to click the anchor a measurement goes to
  highlightId: null,     // anchor highlighted on the plan (hovered measurement row)
};

const svg = $('#plan-svg');
const viewer = $('#viewer');

const anchors = () => state.plan?.anchors ?? [];
const byId = (id) => anchors().find((a) => a.id === id);
const selected = () => byId(state.selectedId);

function toScreen(x, y) {
  const { s, tx, ty } = state.view;
  return [tx + x * s, ty + (state.plan.height - y) * s];
}
function toWorld(sx, sy) {
  const { s, tx, ty } = state.view;
  return { x: (sx - tx) / s, y: state.plan.height - (sy - ty) / s };
}
function pointerPos(e) {
  const r = svg.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

async function openPlan(id) {
  const plan = await api('GET', '/api/floorplans/' + id);
  for (const a of plan.anchors) a.measurements ??= [];
  Object.assign(state, {
    plan, selectedId: null, needsFit: true, measureMode: false, measurePoint: null, solve: null, anchorFilter: '',
  });
  $('#anchor-search').value = '';
  $('#view-home').hidden = true;
  $('#view-plan').hidden = false;
  $('#topbar-context').innerHTML = `<a href="#/" style="color:#93c5fd">← All floor plans</a>
    <span>|</span><strong>${esc(plan.name)}</strong><span>${fmt(plan.width)} × ${fmt(plan.height)} m</span>`;
  const img = $('#plan-image');
  img.setAttribute('href', '/images/' + encodeURIComponent(plan.imageFile));
  fitView();
  renderAll();
}

function fitView() {
  const r = viewer.getBoundingClientRect();
  if (!state.plan || r.width === 0) return;
  const pad = 50;
  const s = Math.min((r.width - 2 * pad) / state.plan.width, (r.height - 2 * pad) / state.plan.height);
  state.view = {
    s, fitS: s,
    tx: (r.width - state.plan.width * s) / 2,
    ty: (r.height - state.plan.height * s) / 2 + 15, // a little lower so top pins are visible
  };
  state.needsFit = false;
}

function zoomAt(factor, sx, sy) {
  const v = state.view;
  const ns = clamp(v.s * factor, v.fitS * 0.2, v.fitS * 400);
  const f = ns / v.s;
  v.tx = sx - (sx - v.tx) * f;
  v.ty = sy - (sy - v.ty) * f;
  v.s = ns;
  renderPlan();
}

function centerOn(a) {
  const r = viewer.getBoundingClientRect();
  const [sx, sy] = toScreen(a.x, a.y);
  state.view.tx += r.width / 2 - sx;
  state.view.ty += r.height / 2 - sy;
  renderPlan();
}

function isOnScreen(a) {
  const r = viewer.getBoundingClientRect();
  const [sx, sy] = toScreen(a.x, a.y);
  return sx > 20 && sy > 50 && sx < r.width - 20 && sy < r.height - 10;
}

new ResizeObserver(() => {
  if (!state.plan) return;
  if (state.needsFit) fitView();
  renderPlan();
}).observe(viewer);

// ======================================================================
// Rendering: plan
// ======================================================================
const PIN_PATH = 'M0,0 C-2,-9 -12,-15 -12,-26 A12,12 0 1,1 12,-26 C12,-15 2,-9 0,0 Z';

function renderAll() {
  renderPlan();
  renderAnchorTable();
  renderSelected();
}

function renderPlan() {
  if (!state.plan) return;
  const { s, tx, ty } = state.view;
  const W = state.plan.width, H = state.plan.height;
  for (const el of [$('#plan-image'), $('#plan-border')]) {
    el.setAttribute('x', tx); el.setAttribute('y', ty);
    el.setAttribute('width', W * s); el.setAttribute('height', H * s);
  }

  const sel = selected();
  let lines = '', labels = '';

  // Distance circles for the selected approximate anchor's measurements
  if (sel && sel.type === 'approximate') {
    for (const m of sel.measurements) {
      const t = byId(m.toAnchorId);
      if (!t || !Number.isFinite(m.distance) || m.distance <= 0) continue;
      const [cx, cy] = toScreen(t.x, t.y);
      lines += `<circle class="circle-line" cx="${cx}" cy="${cy}" r="${m.distance * s}"/>`;
    }
  }

  // Lines from the selected anchor to all others
  if (sel && state.showMeasurements) {
    const [x1, y1] = toScreen(sel.x, sel.y);
    for (const o of anchors()) {
      if (o.id === sel.id) continue;
      const [x2, y2] = toScreen(o.x, o.y);
      lines += `<line class="measure-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      labels += `<text class="measure-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle">${fmt(dist(sel, o))} m</text>`;
    }
  }

  // Measure-to-point
  if (sel && state.measurePoint) {
    const [x1, y1] = toScreen(sel.x, sel.y);
    const [x2, y2] = toScreen(state.measurePoint.x, state.measurePoint.y);
    lines += `<line class="measure-line point" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
              <circle class="measure-point" cx="${x2}" cy="${y2}" r="5"/>`;
    labels += `<text class="measure-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" style="font-size:14px">${fmt(dist(sel, state.measurePoint))} m</text>`;
  }

  // Solve preview (ghost pin)
  let ghost = '';
  if (state.solve && sel && state.solve.anchorId === sel.id && !state.solve.result.error) {
    const r = state.solve.result;
    const [x1, y1] = toScreen(sel.x, sel.y);
    const [gx, gy] = toScreen(r.x, r.y);
    lines += `<line class="shift-line" x1="${x1}" y1="${y1}" x2="${gx}" y2="${gy}"/>`;
    ghost = `<g class="ghost" transform="translate(${gx},${gy})" pointer-events="none">
      <path class="pin-shape" d="${PIN_PATH}"/><circle class="pin-tip" r="2.5"/></g>`;
    labels += `<text class="measure-label" style="fill:#047857" x="${gx}" y="${gy - 44}" text-anchor="middle">calculated</text>`;
  }

  // Pins (selected / highlighted drawn last so they are on top)
  const rank = (a) => (a.id === state.selectedId ? 2 : a.id === state.highlightId ? 1 : 0);
  const ordered = [...anchors()].sort((a, b) => rank(a) - rank(b));
  const measuredTo = new Set(state.pickMode && sel ? sel.measurements.map((m) => m.toAnchorId) : []);
  let pins = '';
  for (const a of ordered) {
    const [sx, sy] = toScreen(a.x, a.y);
    const cls = ['pin',
      a.id === state.selectedId ? 'selected' : '',
      a.id === state.highlightId ? 'highlight' : '',
      measuredTo.has(a.id) ? 'measured' : '',
      state.locked ? 'locked' : ''].join(' ');
    pins += `<g class="${cls}" data-anchor-id="${a.id}" transform="translate(${sx},${sy})">
      <title>${esc(a.serial)} (${a.type}) – x ${fmt(a.x, 3)}, y ${fmt(a.y, 3)}</title>
      <path class="pin-shape ${a.type === 'reference' ? 'ref' : 'approx'}" d="${PIN_PATH}"/>
      <circle cx="0" cy="-26" r="4.5" fill="#fff"/>
      <circle class="pin-tip" r="2.5"/>
    </g>`;
    labels += `<text class="pin-label" x="${sx}" y="${sy - 43}" text-anchor="middle">${esc(a.serial)}</text>`;
  }

  $('#layer-lines').innerHTML = lines;
  $('#layer-pins').innerHTML = ghost + pins;
  $('#layer-labels').innerHTML = labels;

  viewer.classList.toggle('measuring', state.measureMode);
  viewer.classList.toggle('picking', state.pickMode);
  const banner = $('#mode-banner');
  banner.hidden = !sel || !(state.measureMode || state.pickMode);
  if (!banner.hidden) {
    banner.textContent = state.pickMode
      ? `Click the anchor you measured to from ${sel.serial} (on the plan or in the list). Esc to cancel.`
      : `Click on the plan to measure from ${sel.serial}. Press Esc to stop.`;
  }
}

// ======================================================================
// Rendering: anchor table
// ======================================================================
function filteredAnchors() {
  const f = state.anchorFilter.trim().toLowerCase();
  return sortAnchors(anchors().filter((a) => !f || a.serial.toLowerCase().includes(f)));
}

function renderAnchorTable() {
  const f = state.anchorFilter.trim().toLowerCase();
  const list = filteredAnchors();
  $('#anchor-rows').innerHTML = list.map((a) => `
    <tr class="clickable ${a.id === state.selectedId ? 'selected' : ''}" data-select="${a.id}">
      <td><strong>${esc(a.serial)}</strong></td>
      <td><span class="badge ${a.type}">${a.type === 'reference' ? 'Reference' : 'Approx.'}</span></td>
      <td class="num" data-live-x="${a.id}">${fmt(a.x)}</td>
      <td class="num" data-live-y="${a.id}">${fmt(a.y)}</td>
      <td class="center"><input type="checkbox" data-export="${a.id}" ${isExported(a) ? 'checked' : ''} title="Include in CSV / SQL export"/></td>
      <td class="actions"><button class="danger icon" data-delete-anchor="${a.id}" title="Delete anchor">✕</button></td>
    </tr>`).join('');
  const all = $('#export-all');
  const ticked = list.filter(isExported).length;
  all.checked = list.length > 0 && ticked === list.length;
  all.indeterminate = ticked > 0 && ticked < list.length;
  all.disabled = list.length === 0;
  const empty = $('#anchor-empty');
  empty.hidden = list.length > 0;
  empty.textContent = f && anchors().length ? 'No anchors match your search.' : 'No anchors yet. Add one above, then drag its pin to where it is installed.';
}

$('#anchor-search').addEventListener('input', (e) => { state.anchorFilter = e.target.value; renderAnchorTable(); });

$('#anchor-rows').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-delete-anchor]');
  if (del) {
    e.stopPropagation();
    const a = byId(del.dataset.deleteAnchor);
    if (!a || !confirm(`Delete anchor ${a.serial}?`)) return;
    try {
      await api('DELETE', '/api/anchors/' + a.id);
      state.plan.anchors = anchors().filter((x) => x.id !== a.id);
      for (const o of anchors()) o.measurements = o.measurements.filter((m) => m.toAnchorId !== a.id);
      if (state.selectedId === a.id) selectAnchor(null);
      if (state.solve) state.solve = null;
      renderAll();
      toast(`Anchor ${a.serial} deleted`);
    } catch (err) { handleError(err); }
    return;
  }
  if (e.target.matches('input[type=checkbox]')) return; // export tick box, not a row click
  const row = e.target.closest('[data-select]');
  if (row && state.pickMode) { pickMeasurementTarget(byId(row.dataset.select)); return; }
  if (row) {
    selectAnchor(row.dataset.select);
    const a = selected();
    if (a && !isOnScreen(a)) centerOn(a);
  }
});

$('#anchor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const serial = form.serial.value.trim();
  if (!serial) return;
  // Drop the new pin at the centre of the current view (clamped to the plan).
  const r = viewer.getBoundingClientRect();
  const c = toWorld(r.width / 2, r.height / 2);
  const x = clamp(c.x, 0, state.plan.width), y = clamp(c.y, 0, state.plan.height);
  try {
    const a = await api('POST', `/api/floorplans/${state.plan.id}/anchors`, { serial, type: form.type.value, x, y });
    a.measurements ??= [];
    state.plan.anchors.push(a);
    form.serial.value = '';
    state.anchorFilter = ''; $('#anchor-search').value = '';
    selectAnchor(a.id);
    toast(`Anchor ${a.serial} added – drag the pin tip to the installed position`);
  } catch (err) { handleError(err); }
});

// ---------- QR scan for the serial number ----------
$('#scan-serial').addEventListener('click', async () => {
  const form = $('#anchor-form');
  const serial = await scanSerial();
  if (!serial) { form.serial.focus(); return; }
  const existing = anchors().find((a) => a.serial === serial);
  if (existing) {
    toast(`Anchor ${serial} is already on this floor plan – selected it`);
    selectAnchor(existing.id);
    if (!isOnScreen(existing)) centerOn(existing);
    return;
  }
  form.serial.value = serial;
  toast(`Scanned ${serial} – choose the type and press Add anchor`);
  form.querySelector('button[type=submit]').focus();
});

// ---------- Export (CSV / SQL) ----------
function downloadFile(content, ext, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = state.plan.name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'floorplan';
  link.href = url;
  link.download = `${safeName}_anchors_${new Date().toISOString().slice(0, 10)}.${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function anchorsForExport() {
  if (!state.plan) return null;
  const list = anchors().filter(isExported);
  if (!list.length) {
    toast(anchors().length ? 'No anchors are ticked for export' : 'No anchors to export', true);
    return null;
  }
  return list;
}

function exportedToast(list) {
  const skipped = anchors().length - list.length;
  toast(`Exported ${list.length} anchor(s)` + (skipped ? `, ${skipped} unticked skipped` : ''));
}

$('#export-csv').addEventListener('click', () => {
  const list = anchorsForExport();
  if (!list) return;
  // BOM so Excel opens it as UTF-8
  downloadFile('﻿' + buildCsv(state.plan.name, list), 'csv', 'text/csv;charset=utf-8');
  exportedToast(list);
});

$('#export-sql').addEventListener('click', () => {
  const list = anchorsForExport();
  if (!list) return;
  downloadFile(buildSql(state.plan.name, list), 'sql', 'application/sql;charset=utf-8');
  exportedToast(list);
});

// ---------- Export checkboxes ----------
async function setExportFlag(list, value) {
  const changed = list.filter((a) => isExported(a) !== value);
  for (const a of changed) a.export = value;
  renderAnchorTable();
  const results = await Promise.all(changed.map((a) => patchAnchor(a, { export: value })));
  // Roll back any that failed to save
  changed.forEach((a, i) => { if (!results[i]) a.export = !value; });
  if (results.some((ok) => !ok)) renderAnchorTable();
}

$('#anchor-rows').addEventListener('change', (e) => {
  const id = e.target.dataset.export;
  if (id) setExportFlag([byId(id)], e.target.checked);
});

$('#export-all').addEventListener('change', (e) => setExportFlag(filteredAnchors(), e.target.checked));

function selectAnchor(id) {
  if (state.selectedId !== id) {
    state.measurePoint = null;
    state.pickMode = false;
    state.highlightId = null;
    if (!id) state.measureMode = false;
  }
  state.selectedId = id;
  renderAll();
}

// ======================================================================
// Rendering: selected anchor panel
// ======================================================================
function measurementRowsHtml(a) {
  const solveRows = state.solve?.anchorId === a.id ? state.solve.rows : null;
  return a.measurements.map((m) => {
    const t = byId(m.toAnchorId);
    const sr = solveRows?.find((r) => r.mid === m.id);
    const resid = sr ? `<span class="${residClass(sr.residual)}">${sr.residual >= 0 ? '+' : ''}${fmt(sr.residual, 3)}</span>` : '';
    const target = t
      ? `<strong>${esc(t.serial)}</strong> <span class="badge ${t.type}">${t.type === 'reference' ? 'Ref' : 'Approx'}</span>`
      : '<span class="muted">(anchor deleted)</span>';
    return `<tr data-mid="${m.id}" data-target="${t ? t.id : ''}">
      <td class="meas-target" title="Hover to highlight on the plan">${target}</td>
      <td class="num"><input type="number" step="0.001" min="0" data-field="distance" value="${Number.isFinite(m.distance) ? m.distance : ''}" placeholder="m"/></td>
      <td class="num muted" data-live-plan="${m.id}">${t ? fmt(dist(a, t)) : '–'}</td>
      <td class="num">${resid}</td>
      <td><button class="danger icon" data-action="remove-meas" title="Remove">✕</button></td>
    </tr>`;
  }).join('');
}

function residClass(r) {
  const ar = Math.abs(r);
  return ar < 0.05 ? 'resid-ok' : ar < 0.15 ? 'resid-warn' : 'resid-bad';
}

function renderSelected() {
  const panel = $('#selected-panel');
  const a = selected();
  if (!a) { panel.hidden = true; panel.innerHTML = ''; return; }
  panel.hidden = false;

  let html = `
    <h3>Anchor ${esc(a.serial)} <span class="badge ${a.type}">${a.type === 'reference' ? 'Reference' : 'Approximate'}</span></h3>
    <div class="field-grid">
      <span>Serial</span><input data-field="serial" value="${esc(a.serial)}"/>
      <span>Type</span>
      <div class="seg">
        <button class="reference ${a.type === 'reference' ? 'on' : ''}" data-action="type" data-type="reference">Reference</button>
        <button class="approximate ${a.type === 'approximate' ? 'on' : ''}" data-action="type" data-type="approximate">Approximate</button>
      </div>
      <span>Position (m)</span>
      <div class="xy">
        <input type="number" step="0.01" data-field="x" value="${fmt(a.x, 3)}" title="X (m from left)"/>
        <input type="number" step="0.01" data-field="y" value="${fmt(a.y, 3)}" title="Y (m from bottom)"/>
      </div>
    </div>
    <div class="btn-row">
      <button data-action="toggle-show" class="${state.showMeasurements ? 'active' : ''}">${state.showMeasurements ? 'Hide' : 'Show'} measurements</button>
      <button data-action="toggle-measure" class="${state.measureMode ? 'active' : ''}">Measure to point</button>
      <button data-action="center">Center on map</button>
    </div>
    <p class="hint">Drag the pin (tip = exact position), type coordinates, or use the arrow keys to nudge 1 cm (Shift: 10 cm).</p>`;

  if (state.showMeasurements || state.measurePoint) {
    const rows = anchors().filter((o) => o.id !== a.id)
      .map((o) => ({ o, d: dist(a, o) }))
      .sort((x, y) => x.d - y.d);
    html += `<h4>Distances from ${esc(a.serial)} (on plan)</h4>`;
    if (state.measurePoint) {
      const p = state.measurePoint;
      html += `<div class="warn-box" style="border-color:#c4b5fd;background:#f5f3ff">
        To point (${fmt(p.x)}, ${fmt(p.y)}): <strong data-live-point>${fmt(dist(a, p), 3)} m</strong>
        <button class="link" data-action="clear-point" style="margin-left:8px">clear</button></div>`;
    }
    if (state.showMeasurements) {
      html += rows.length ? `<table class="table compact"><thead><tr><th>To anchor</th><th>Type</th><th class="num">Distance (m)</th></tr></thead><tbody>
        ${rows.map(({ o }) => `<tr><td>${esc(o.serial)}</td><td><span class="badge ${o.type}">${o.type === 'reference' ? 'Reference' : 'Approx.'}</span></td><td class="num" data-live-dist="${o.id}">${fmt(dist(a, o), 3)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted small">No other anchors on this plan.</p>';
    }
  }

  if (a.type === 'approximate') {
    html += `<h4>Measured distances (tape / laser)</h4>
      <p class="hint" style="margin-top:0">Press <em>+ Add measurement</em>, click the anchor you measured to on the plan, then type the horizontal distance in meters. Press Enter to save it and pick the next anchor. Three or more references that are not in a line give the best result.</p>`;
    if (a.measurements.length) {
      html += `<table class="table compact meas-table"><thead><tr><th>To anchor</th><th class="num">Measured</th><th class="num">On plan</th><th class="num">Residual</th><th></th></tr></thead>
        <tbody>${measurementRowsHtml(a)}</tbody></table>`;
    }
    html += `<div class="btn-row">
        <button data-action="add-meas" class="${state.pickMode ? 'active' : ''}" ${anchors().length < 2 ? 'disabled' : ''}>${state.pickMode ? 'Click an anchor… (Esc to cancel)' : '+ Add measurement'}</button>
        <button class="primary" data-action="solve" ${a.measurements.length ? '' : 'disabled'}>Calculate position</button>
      </div>`;
    if (a.lastSolve) {
      html += `<p class="hint">Last calculated ${new Date(a.lastSolve.at).toLocaleString()} from ${a.lastSolve.n} measurement(s), RMS ${fmt(a.lastSolve.rms, 3)} m.</p>`;
    }
    html += solveResultHtml(a);
  }

  panel.innerHTML = html;
}

function solveResultHtml(a) {
  if (!state.solve || state.solve.anchorId !== a.id) return '';
  const r = state.solve.result;
  if (r.error) return `<div class="warn-box">${esc(r.error)}</div>`;
  const shift = dist(a, r);
  const warnings = [];
  if (r.underdetermined) warnings.push('Only one reference distance: the pin was moved along the line towards its current position. The direction is not determined – add more measurements.');
  else if (r.ambiguous) warnings.push('Only two distinct references (or all references in one line): there are two mirror-image solutions. The one nearest the current pin was chosen, so make sure the pin was roughly in the right place – or add a reference that is not on the same line.');
  if (r.rms > 0.1) warnings.push('Large residuals – check for a mistyped distance, a wrongly placed reference anchor, an obstructed measurement, or a big height difference between anchors.');
  if (state.solve.usesApprox) warnings.push('Some measurements are to approximate anchors; errors in their positions carry over.');
  if (r.x < 0 || r.y < 0 || r.x > state.plan.width || r.y > state.plan.height) warnings.push('The calculated position is outside the floor plan.');
  return `<div class="result-box">
      <div>Calculated position</div>
      <div class="big">X ${fmt(r.x, 3)} m, Y ${fmt(r.y, 3)} m</div>
      <div class="small">Moves the pin ${fmt(shift, 3)} m · RMS residual <span class="${residClass(r.rms)}">${fmt(r.rms, 3)} m</span> · max ${fmt(r.maxAbsResidual, 3)} m · ${state.solve.rows.length} measurement(s)</div>
      ${warnings.map((w) => `<div class="warn-box">${esc(w)}</div>`).join('')}
      <div class="btn-row">
        <button class="primary" data-action="apply-solve">Apply position</button>
        <button data-action="discard-solve">Discard</button>
      </div>
    </div>`;
}

// Update numbers in place while dragging, without rebuilding inputs.
function updateLiveValues() {
  const a = selected();
  for (const o of anchors()) {
    const xc = document.querySelector(`[data-live-x="${o.id}"]`);
    const yc = document.querySelector(`[data-live-y="${o.id}"]`);
    if (xc) xc.textContent = fmt(o.x);
    if (yc) yc.textContent = fmt(o.y);
  }
  if (!a) return;
  const panel = $('#selected-panel');
  for (const k of ['x', 'y']) {
    const inp = panel.querySelector(`input[data-field="${k}"]`);
    if (inp && document.activeElement !== inp) inp.value = fmt(a[k], 3);
  }
  for (const m of a.measurements) {
    const c = panel.querySelector(`[data-live-plan="${m.id}"]`);
    const t = byId(m.toAnchorId);
    if (c && t) c.textContent = fmt(dist(a, t));
  }
  for (const o of anchors()) {
    const c = panel.querySelector(`[data-live-dist="${o.id}"]`);
    if (c) c.textContent = fmt(dist(a, o), 3);
  }
  const pc = panel.querySelector('[data-live-point]');
  if (pc && state.measurePoint) pc.textContent = fmt(dist(a, state.measurePoint), 3) + ' m';
}

// ---------- persistence ----------
async function patchAnchor(a, fields) {
  try {
    const updated = await api('PATCH', '/api/anchors/' + a.id, fields);
    Object.assign(a, { serial: updated.serial, type: updated.type, updatedAt: updated.updatedAt });
    return true;
  } catch (err) { handleError(err); return false; }
}
const savePositionDebounced = (() => {
  const timers = new Map();
  return (a) => {
    clearTimeout(timers.get(a.id));
    timers.set(a.id, setTimeout(() => { timers.delete(a.id); patchAnchor(a, { x: a.x, y: a.y }); }, 300));
  };
})();
const saveMeasurements = (a) => patchAnchor(a, { measurements: a.measurements });

function setPosition(a, x, y) {
  a.x = x; a.y = y;
  renderPlan();
  updateLiveValues();
  savePositionDebounced(a);
}

// ---------- selected panel events ----------
const panel = $('#selected-panel');

panel.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = selected();
  if (!a) return;
  switch (btn.dataset.action) {
    case 'type': {
      const type = btn.dataset.type;
      if (type === a.type) return;
      const prev = a.type;
      a.type = type;
      if (type === 'reference') state.solve = null;
      renderAll();
      if (!(await patchAnchor(a, { type }))) { a.type = prev; renderAll(); }
      return;
    }
    case 'toggle-show': state.showMeasurements = !state.showMeasurements; break;
    case 'toggle-measure': state.measureMode = !state.measureMode; state.pickMode = false; break;
    case 'clear-point': state.measurePoint = null; break;
    case 'center': centerOn(a); return;
    case 'add-meas':
      state.pickMode = !state.pickMode;
      state.measureMode = false;
      break;
    case 'remove-meas': {
      const mid = btn.closest('[data-mid]').dataset.mid;
      a.measurements = a.measurements.filter((m) => m.id !== mid);
      state.solve = null;
      renderAll();
      saveMeasurements(a);
      return;
    }
    case 'solve': runSolve(a); return;
    case 'apply-solve': {
      const r = state.solve?.result;
      if (!r || r.error) return;
      a.x = r.x; a.y = r.y;
      a.lastSolve = { at: new Date().toISOString(), rms: r.rms, n: state.solve.rows.length };
      state.solve = null;
      renderAll();
      if (await patchAnchor(a, { x: a.x, y: a.y, lastSolve: a.lastSolve })) toast(`Anchor ${a.serial} moved to the calculated position`);
      return;
    }
    case 'discard-solve': state.solve = null; break;
  }
  renderAll();
});

// Called when, in pick mode, the user clicks an anchor (pin or table row).
function pickMeasurementTarget(target) {
  const a = selected();
  if (!a || !target) return;
  if (target.id === a.id) { toast('Click a different anchor – this is the one you are measuring from', true); return; }
  state.pickMode = false;
  let m = a.measurements.find((x) => x.toAnchorId === target.id);
  if (m) {
    toast(`There is already a measurement to ${target.serial} – edit it below`);
  } else {
    m = { id: crypto.randomUUID(), toAnchorId: target.id, distance: null };
    a.measurements.push(m);
    state.solve = null;
    saveMeasurements(a);
  }
  state.highlightId = target.id;
  renderAll();
  const input = panel.querySelector(`[data-mid="${m.id}"] input[data-field="distance"]`);
  input?.focus();
  input?.select();
}

function runSolve(a) {
  const rows = [];
  let usesApprox = false;
  for (const m of a.measurements) {
    const t = byId(m.toAnchorId);
    if (!t || !Number.isFinite(m.distance)) continue;
    if (t.type !== 'reference') usesApprox = true;
    rows.push({ mid: m.id, x: t.x, y: t.y, distance: m.distance });
  }
  const result = rows.length ? solvePosition(rows, { x: a.x, y: a.y }) : { error: 'Enter at least one distance to another anchor.' };
  if (!result.error) rows.forEach((row, i) => (row.residual = result.residuals[i]));
  state.solve = { anchorId: a.id, result, rows, usesApprox };
  renderAll();
}

panel.addEventListener('change', async (e) => {
  const a = selected();
  if (!a) return;
  const el = e.target;
  const field = el.dataset.field;
  const row = el.closest('[data-mid]');
  if (row) {
    const m = a.measurements.find((x) => x.id === row.dataset.mid);
    if (!m) return;
    if (field === 'distance') m.distance = el.value === '' ? null : Math.max(0, parseFloat(el.value));
    state.solve = null;
    renderAll();
    saveMeasurements(a);
    return;
  }
  if (field === 'serial') {
    const serial = el.value.trim();
    if (!serial || serial === a.serial) { el.value = a.serial; return; }
    const prev = a.serial;
    a.serial = serial;
    if (!(await patchAnchor(a, { serial }))) a.serial = prev;
    renderAll();
    return;
  }
  if (field === 'x' || field === 'y') {
    const v = parseFloat(el.value);
    if (!Number.isFinite(v)) { el.value = fmt(a[field], 3); return; }
    setPosition(a, field === 'x' ? v : a.x, field === 'y' ? v : a.y);
    renderAnchorTable();
  }
});

// Enter in a distance box: save it and go straight to picking the next anchor.
panel.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.dataset.field !== 'distance') return;
  e.preventDefault();
  if (e.target.value === '') return;
  e.target.blur(); // fires 'change' -> saves the value
  state.pickMode = true;
  state.measureMode = false;
  renderAll();
});

// Hovering / focusing a measurement row highlights its target anchor on the plan.
function setHighlight(id) {
  if (state.highlightId === id) return;
  state.highlightId = id;
  renderPlan();
}
panel.addEventListener('mouseover', (e) => {
  const row = e.target.closest('[data-target]');
  setHighlight(row?.dataset.target || null);
});
panel.addEventListener('mouseleave', () => {
  const focusedRow = document.activeElement?.closest?.('[data-target]');
  setHighlight(focusedRow?.dataset.target || null);
});
panel.addEventListener('focusin', (e) => {
  const row = e.target.closest('[data-target]');
  if (row) setHighlight(row.dataset.target || null);
});

// Live-update circles while typing a distance
panel.addEventListener('input', (e) => {
  const a = selected();
  const row = e.target.closest('[data-mid]');
  if (!a || !row || e.target.dataset.field !== 'distance') return;
  const m = a.measurements.find((x) => x.id === row.dataset.mid);
  if (m) { m.distance = e.target.value === '' ? null : parseFloat(e.target.value); renderPlan(); }
});

// ======================================================================
// Pointer interaction on the plan: drag pins, pan, pinch-zoom, measure
// ======================================================================
const pointers = new Map();
let drag = null;   // { id, offX, offY, startX, startY, moved }
let pan = null;    // { startX, startY, tx0, ty0, moved }
let pinch = null;  // { d0, s0, tx0, ty0, mx, my }

svg.addEventListener('pointerdown', (e) => {
  if (!state.plan) return;
  const [px, py] = pointerPos(e);
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: px, y: py });

  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    pinch = { d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), s0: state.view.s, tx0: state.view.tx, ty0: state.view.ty, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
    drag = null; pan = null;
    return;
  }
  if (pointers.size > 2 || e.button > 0) return;

  const pinEl = e.target.closest('.pin');
  if (pinEl && state.pickMode) {
    e.preventDefault(); // keep focus in the distance box we are about to focus
    pickMeasurementTarget(byId(pinEl.dataset.anchorId));
    return;
  }
  if (pinEl && !state.measureMode) {
    const a = byId(pinEl.dataset.anchorId);
    if (state.selectedId !== a.id) selectAnchor(a.id);
    if (!state.locked) {
      const w = toWorld(px, py);
      drag = { id: a.id, offX: w.x - a.x, offY: w.y - a.y, startX: px, startY: py, moved: false };
    }
    return;
  }
  pan = { startX: px, startY: py, tx0: state.view.tx, ty0: state.view.ty, moved: false };
  viewer.classList.add('panning');
});

svg.addEventListener('pointermove', (e) => {
  if (!state.plan) return;
  const [px, py] = pointerPos(e);
  const w = toWorld(px, py);
  $('#cursor-readout').textContent = `x ${fmt(w.x)} m, y ${fmt(w.y)} m`;
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: px, y: py });

  if (pinch && pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const ns = clamp(pinch.s0 * d / pinch.d0, state.view.fitS * 0.2, state.view.fitS * 400);
    const f = ns / pinch.s0;
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    state.view.s = ns;
    state.view.tx = mx - (pinch.mx - pinch.tx0) * f;
    state.view.ty = my - (pinch.my - pinch.ty0) * f;
    renderPlan();
    return;
  }
  if (drag) {
    if (!drag.moved && Math.hypot(px - drag.startX, py - drag.startY) < 3) return;
    drag.moved = true;
    const a = byId(drag.id);
    a.x = w.x - drag.offX;
    a.y = w.y - drag.offY;
    renderPlan();
    updateLiveValues();
    $('#cursor-readout').textContent = `${a.serial}: x ${fmt(a.x, 3)} m, y ${fmt(a.y, 3)} m`;
    return;
  }
  if (pan) {
    if (!pan.moved && Math.hypot(px - pan.startX, py - pan.startY) < 4) return;
    pan.moved = true;
    state.view.tx = pan.tx0 + (px - pan.startX);
    state.view.ty = pan.ty0 + (py - pan.startY);
    renderPlan();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (drag) {
    const a = byId(drag.id);
    if (drag.moved && a) savePositionDebounced(a);
    drag = null;
  }
  if (pan) {
    if (!pan.moved && state.measureMode && selected() && e.type === 'pointerup') {
      const [px, py] = pointerPos(e);
      state.measurePoint = toWorld(px, py);
      renderAll();
    }
    pan = null;
    viewer.classList.remove('panning');
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('pointerleave', () => { $('#cursor-readout').textContent = ''; });

svg.addEventListener('wheel', (e) => {
  if (!state.plan) return;
  e.preventDefault();
  const [px, py] = pointerPos(e);
  zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), px, py);
}, { passive: false });

document.querySelector('.viewer-toolbar').addEventListener('click', (e) => {
  const z = e.target.closest('[data-zoom]')?.dataset.zoom;
  if (!z) return;
  const r = viewer.getBoundingClientRect();
  if (z === 'in') zoomAt(1.4, r.width / 2, r.height / 2);
  if (z === 'out') zoomAt(1 / 1.4, r.width / 2, r.height / 2);
  if (z === 'fit') { fitView(); renderPlan(); }
});
$('#lock-pins').addEventListener('change', (e) => { state.locked = e.target.checked; renderPlan(); });

// Keyboard: arrows nudge selected pin, Esc leaves measure mode.
document.addEventListener('keydown', (e) => {
  if (!state.plan || $('#view-plan').hidden) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') {
    if (state.measureMode || state.pickMode) { state.measureMode = false; state.pickMode = false; renderAll(); }
    return;
  }
  const a = selected();
  if (!a || state.locked) return;
  const step = e.shiftKey ? 0.1 : 0.01;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
  if (!d) return;
  e.preventDefault();
  setPosition(a, a.x + d[0], a.y + d[1]);
});

// ======================================================================
route();
