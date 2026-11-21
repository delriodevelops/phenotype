// The person in a face crop, cut from their background: MediaPipe's selfie segmenter (a 250 KB model, same runtime
// as the landmarks, so nothing new to download but the model itself). Runs in the browser like everything else.
//   matteOf(canvas) → { data: Float32Array(w·h) (1 = person, 0 = background), w, h }, or null when it cannot run
//                     (offline, a blocked CDN): the caller then falls back to a mask drawn from the landmarks.
import { vision } from './face.js';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

let segP = null;
export function loadSegmenter() {
  segP ??= (async () => {
    const { lib, files } = await vision();
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
    try { return await lib.ImageSegmenter.createFromOptions(files, opts('GPU')); } catch { return lib.ImageSegmenter.createFromOptions(files, opts('CPU')); }
  })();
  segP.catch(() => { segP = null; });
  return segP;
}

export async function matteOf(canvas) {
  if (new URLSearchParams(location.search).has('nomatte')) return null; // ?nomatte: the landmark fallback, for testing
  try {
    const seg = await loadSegmenter(), res = seg.segment(canvas), masks = res.confidenceMasks || [];
    if (!masks.length) { res.close?.(); return null; }
    // The crop is built around a face, so the person is whoever is under its centre. Whatever the model calls its
    // channels, the right one is the one that is high there and low in the top corners; if none is, it is inverted.
    let best = null;
    for (const m of masks) {
      const a = m.getAsFloat32Array(), w = m.width, h = m.height;
      const mean = (u0, u1, v0, v1) => { let s = 0, n = 0; for (let y = Math.floor(v0 * h); y < v1 * h; y += 3) for (let x = Math.floor(u0 * w); x < u1 * w; x += 3) { s += a[y * w + x]; n++; } return s / (n || 1); };
      const gap = mean(0.42, 0.58, 0.42, 0.6) - (mean(0, 0.08, 0, 0.06) + mean(0.92, 1, 0, 0.06)) / 2;
      if (!best || Math.abs(gap) > Math.abs(best.gap)) best = { a, w, h, gap };
    }
    const data = new Float32Array(best.a.length);
    if (best.gap >= 0) data.set(best.a); else for (let i = 0; i < data.length; i++) data[i] = 1 - best.a[i];
    const out = { data, w: best.w, h: best.h };
    res.close?.();
    return Math.abs(best.gap) < 0.2 ? null : out; // no clear person under the face: do not trust it
  } catch (err) {
    console.warn('segmenter unavailable', err);
    return null;
  }
}
