-- Phase 7 thumbnail job (plan 07: image thumbnails via sharp, async).
-- Extracts dimensions + 320px preview for images. No-op for non-images
-- or when sharp is unavailable (falls back to original, dims best-effort).

let sharpLoader = null;
async function loadSharp() {
  if (sharpLoader !== undefined && sharpLoader !== null) return sharpLoader;
  try {
    const m = await import('sharp');
    sharpLoader = m.default || m;
  } catch {
    sharpLoader = null;
  }
  return sharpLoader;
}

function pngDims(buf) {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
  } catch {}
  return null;
}

export async function imageDims(buffer, mime) {
  if (!mime || !mime.startsWith('image/')) return null;
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const meta = await sharp(buffer).metadata();
      if (meta.width && meta.height) return { width: meta.width, height: meta.height };
    } catch {}
  }
  return pngDims(buffer);
}

// Returns { buffer, mimeType } thumbnail or null (skip for non-images).
export async function makeThumb(buffer, mime) {
  if (!mime || !mime.startsWith('image/')) return null;
  // SVG / gif animation: skip processing, reuse original client-side.
  if (mime === 'image/svg+xml' || mime === 'image/gif') return null;
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(buffer)
      .resize({ width: 320, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return { buffer: out, mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}
