// Keeps floor plan images at a size browsers can zoom and pan smoothly.
//
// A floor plan exported from CAD can easily be 20,000+ px wide (hundreds of megapixels, ~1 GB once
// decoded). Every zoom step then means re-drawing that whole picture, which is slow on any PC and
// beyond what most phone graphics chips can handle. Positions are stored in meters (the plan's
// width/height), so shrinking the image changes nothing about anchor coordinates.

export const MAX_EDGE = 8192;           // longest side, px
export const MAX_PIXELS = 32_000_000;   // total area, px

// Width/height from the PNG or JPEG header, without decoding the image. Returns null if unknown.
export function imageSize(bytes) {
  // PNG: signature, then the IHDR chunk with width/height as big-endian 32-bit ints.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // JPEG: walk the markers to the first start-of-frame (SOFn).
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xff) { i++; continue; } // fill byte
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; } // no length
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }
  return null;
}

// Target size for an image, or null if it is already small enough.
export function targetSize(width, height, maxEdge = MAX_EDGE, maxPixels = MAX_PIXELS) {
  const k = Math.min(1, maxEdge / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  if (k >= 1) return null;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export const isTooLarge = (width, height) => targetSize(width, height) !== null;

// Shrink an image blob (PNG stays PNG, JPEG stays JPEG). Browser only.
export async function shrinkImage(blob, width, height) {
  const t = targetSize(width, height);
  if (!t) return { blob, width, height, resized: false };
  const type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  let bmp;
  try {
    bmp = await createImageBitmap(blob, { resizeWidth: t.width, resizeHeight: t.height, resizeQuality: 'high' });
  } catch (err) {
    throw new Error(`This image (${width} × ${height} px) is too large for this device to process. ` +
      `Reduce it to at most ${MAX_EDGE} px on the longest side (or optimize it in the laptop version) and try again.`);
  }
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(t.width, t.height)
    : Object.assign(document.createElement('canvas'), { width: t.width, height: t.height });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent areas become white rather than black (JPEG)
  ctx.fillRect(0, 0, t.width, t.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const out = canvas.convertToBlob
    ? await canvas.convertToBlob({ type, quality: 0.92 })
    : await new Promise((res) => canvas.toBlob(res, type, 0.92));
  if (!out) throw new Error('Could not create the reduced image.');
  return { blob: out, width: t.width, height: t.height, resized: true };
}
