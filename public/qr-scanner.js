// Webcam QR scanner in a modal dialog.
// scanSerial() resolves with the parsed serial (e.g. "123456"), or null if the user cancels.
// Uses the browser's native BarcodeDetector when it supports QR codes, otherwise jsQR
// (vendor/jsQR.js, loaded as a classic script that sets window.jsQR).

import { parseSerial } from './serial.js';

const CAMERA_KEY = 'aps.cameraId';
const MAX_SCAN_WIDTH = 800;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* no audio, no problem */ }
}

async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (source) => (await det.detect(source))[0]?.rawValue ?? null;
      }
    } catch { /* fall through to jsQR */ }
  }
  if (typeof window.jsQR !== 'function') throw new Error('QR decoder failed to load.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const scale = Math.min(1, MAX_SCAN_WIDTH / video.videoWidth);
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    if (!w || !h) return null;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const res = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
    return res?.data ?? null;
  };
}

export function scanSerial() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal scanner" role="dialog" aria-label="Scan anchor QR code">
        <div class="modal-head">
          <h3>Scan anchor QR code</h3>
          <button class="icon" data-close title="Close">✕</button>
        </div>
        <div class="scanner-video">
          <video playsinline muted></video>
          <div class="scanner-frame"></div>
        </div>
        <div class="scanner-controls">
          <select data-camera hidden></select>
          <span class="scanner-status" data-status>Starting camera…</span>
        </div>
        <div class="btn-row" style="justify-content:flex-end">
          <button data-close>Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('video');
    const status = overlay.querySelector('[data-status]');
    const camSel = overlay.querySelector('[data-camera]');
    let stream = null, raf = 0, done = false, detect = null, busy = false, lastBad = '';

    const setStatus = (msg, cls = '') => { status.textContent = msg; status.className = 'scanner-status ' + cls; };

    function stopStream() {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    function finish(value) {
      if (done) return;
      done = true;
      stopStream();
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) finish(null);
    });

    async function tick() {
      if (done) return;
      if (!busy && video.readyState >= 2) {
        busy = true;
        try {
          const text = await detect(video);
          if (text) {
            const serial = parseSerial(text);
            if (serial) { beep(); finish(serial); return; }
            if (text !== lastBad) { lastBad = text; setStatus(`Not an anchor QR code: "${text.slice(0, 40)}"`, 'resid-bad'); }
          }
        } catch (err) { console.warn(err); }
        busy = false;
      }
      raf = requestAnimationFrame(tick);
    }

    async function start(deviceId) {
      stopStream();
      setStatus('Starting camera…');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (deviceId) return start(null); // saved camera gone -> fall back to default
        const msg = err.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this page (icon in the address bar) and try again.'
          : err.name === 'NotFoundError' ? 'No camera found on this computer.' : `Could not start the camera: ${err.message}`;
        setStatus(msg, 'resid-bad');
        return;
      }
      if (done) { stopStream(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
      const activeId = settings.deviceId;
      // Mirror front/laptop cameras (feels natural), but not a phone's rear camera.
      const facing = settings.facingMode || (matchMedia('(pointer: coarse)').matches ? 'environment' : 'user');
      video.classList.toggle('mirror', facing === 'user');
      if (activeId) storageSet(CAMERA_KEY, activeId);

      // Camera labels are only available after permission is granted.
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      camSel.hidden = cams.length < 2;
      camSel.innerHTML = cams.map((c, i) =>
        `<option value="${esc(c.deviceId)}" ${c.deviceId === activeId ? 'selected' : ''}>${esc(c.label || 'Camera ' + (i + 1))}</option>`).join('');

      setStatus('Hold the anchor\'s QR code in front of the camera.');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
    camSel.addEventListener('change', () => start(camSel.value));

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('This browser cannot access the camera here. Open the app at http://localhost or http://127.0.0.1.', 'resid-bad');
        return;
      }
      try { detect = await makeDetector(); }
      catch (err) { setStatus(err.message, 'resid-bad'); return; }
      start(storageGet(CAMERA_KEY));
    })();
  });
}
