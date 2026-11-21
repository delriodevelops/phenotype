// CLIP in the browser (Xenova/clip-vit-base-patch32, 8-bit image tower, transformers.js from jsDelivr), served from
// this site rather than Hugging Face (no third-party rate limits). The 89 MB ONNX file is stored as four parts under
// models/clip/onnx/ (Cloudflare serves files up to 25 MB): a custom cache joins them on first use and keeps the result
// in Cache Storage, so a second visit starts at once. The text embeddings the scan needs are precomputed
// (models/te.json, models/sex.json), so the text tower is never loaded.
const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const BASE = new URL('../../models/', import.meta.url).href; // …/models/
const ONNX = 'vision_model_quantized.onnx';
const STORE = 'phenotype-clip-v1';

async function joinedModel() {
  const dir = `${BASE}clip/onnx/`;
  try { const hit = await (await caches.open(STORE)).match(dir + ONNX); if (hit) return hit; } catch {}
  const meta = await (await fetch(`${dir}vision_model_quantized.parts.json`)).json();
  // the four parts download together; every chunk reports how far along the whole model is ('phenotype:model')
  let loaded = 0;
  const tell = () => { try { dispatchEvent(new CustomEvent('phenotype:model', { detail: { loaded, total: meta.total } })); } catch {} };
  const parts = await Promise.all(meta.parts.map(async (p) => {
    const r = await fetch(dir + p.name); if (!r.ok) throw new Error(`modelo: HTTP ${r.status}`);
    if (!r.body?.getReader) { const b = await r.arrayBuffer(); loaded += b.byteLength; tell(); return b; }
    const reader = r.body.getReader(), chunks = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.byteLength; tell(); }
    return new Blob(chunks);
  }));
  const blob = new Blob(parts, { type: 'application/octet-stream' });
  if (blob.size !== meta.total) throw new Error('modelo incompleto');
  const res = new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } });
  try { await (await caches.open(STORE)).put(dir + ONNX, res.clone()); } catch {}
  return res;
}

let visionP = null;
export function preloadClip() {
  visionP ??= (async () => {
    const T = await import(TJS);
    T.env.allowRemoteModels = false;
    T.env.allowLocalModels = true;
    T.env.localModelPath = BASE;
    T.env.useBrowserCache = false;
    T.env.useCustomCache = true;
    T.env.customCache = {
      match: async (key) => (String(key).endsWith(ONNX) ? joinedModel() : undefined),
      put: async () => {},
    };
    const [proc, vision] = await Promise.all([
      T.AutoProcessor.from_pretrained('clip'),
      T.CLIPVisionModelWithProjection.from_pretrained('clip', { dtype: 'q8' }),
    ]);
    return { T, proc, vision };
  })();
  visionP.catch(() => { visionP = null; });
  return visionP;
}

// unit-length CLIP image embedding (512) of a prepared 224 canvas
export async function embedImage(canvas) {
  const { T, proc, vision } = await preloadClip();
  const img = await T.RawImage.fromURL(canvas.toDataURL('image/jpeg', 0.92));
  return (await vision(await proc(img))).image_embeds.normalize(2, -1).tolist()[0];
}
