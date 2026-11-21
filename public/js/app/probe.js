// The face measure, CLIP only (SCUT was dropped: it added nothing measurable, .731 → .729, and cost a 47 MB download).
// 1. Crowd score h: a linear probe on CLIP's 512-number description of the isolated face, trained on MEBeauty
//    (930 men, ~300 human raters per face) and checked on 243 test men it never saw: r = .73 with the human mean score.
//    Features: 512-d CLIP embedding of the isolated face (+ mirror) and five pose/expression covariates
//    (smile, mouth opening, |yaw|, |roll|, chin pitch), evaluated at a neutral pose.
//    'Eo' is the same probe on the plain (not isolated) crop, kept as a cross-check for odd photos.
// 2. The owner's lookism scale: a ridge on [h, 18 CLIP phrase logits (te.json), covariates], fitted on the 470 MEBeauty
//    faces the owner rated by tier. 10-fold CV: r = .50 with the owner's tiers, exact tier 57 %.
import { faceBox } from './geom.js';
import { embedImage } from './clip.js';
import { isolateFace, mirror, faceSignals } from './features.js';

const cache = {};
async function weights(kind) {
  cache[kind] ??= fetch(`models/w-${kind}.json`).then((r) => r.json());
  return cache[kind];
}
const unit = (a, b) => { const m = a.map((x, i) => x + b[i]); const n = Math.hypot(...m) || 1; return m.map((x) => x / n); };

// everything the probes need, computed once per photo (three CLIP passes)
export async function probeFeatures(canvas, points, metrics, pitch) {
  const sg = faceSignals(points);
  const iso = isolateFace(canvas, points);
  const embIso = unit(await embedImage(iso), await embedImage(mirror(iso)));
  const b = faceBox(canvas, points), s = Math.max(b.w, b.h) * 1.6;
  const oc = document.createElement('canvas'); oc.width = oc.height = 224;
  oc.getContext('2d').drawImage(canvas, b.cx - s / 2, b.cy - s / 2, s, s, 0, 0, 224, 224);
  const embOrig = await embedImage(oc);
  const cov = [sg.smile, sg.mouthOpen, Math.abs(metrics.yaw_deg || 0), Math.abs(metrics.roll_deg || 0), pitch];
  return { embIso, embOrig, cov, signals: sg };
}

// neutral: evaluate the pose/expression covariates at a neutral, frontal face (no smile, mouth closed, 0° turn and
// tilt, chin level), so their learnt effect is removed from the score.
const NEUTRAL = [0, 0, 0, 0, 0.38];
export async function predictHuman(f, kind = 'E', { neutral = true } = {}) {
  const w = await weights(kind);
  const x = [...(kind === 'E' ? f.embIso : f.embOrig), ...(neutral ? NEUTRAL : f.cov)];
  return w.b0 + x.reduce((s, v, j) => s + v * w.v[j], 0);
}

// crowd score → PSL (debug only), anchored on the seven case stages by least squares
export const pslFromHuman = (h) => Math.min(8, Math.max(1, STRETCH_H.a + STRETCH_H.b * h));
const STRETCH_H = { a: -10.523, b: 2.79 };

// The owner's ratings fix the ORDER but squeeze it (2 of 3 rated LTN, so the ridge regresses to ~4); the seven case
// stages stretch it back to the full scale by least squares (STRETCH). Then the reference anchor (the owner's decision):
// the owner's own face is defined as PSL 5.0, the start of HTN — also the engine's reading of that photo — so the whole
// scale is shifted by REFERENCE_SHIFT for everyone: the order between faces is unchanged, only where the cuts fall.
const STRETCH = { a: -17.801, b: 5.548 };
const REFERENCE_SHIFT = 0.381; // owner photo u = 4.041 → 4.619 on the case fit → 5.0
let teP = null;
const phrases = () => (teP ??= fetch('models/te.json').then((r) => r.json()));
// What the photo reads on each of the 18 phrase pairs of te.json ("clear healthy skin" against "acne and bad skin"…):
// above 0 it leans to the first phrase. The owner's scale is fitted on these; breakdown.js turns some into notes.
export async function phraseLogits(f) {
  const t = await phrases(), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  return t.pairs.map((_, j) => 100 * (dot(f.embIso, t.te[2 * j]) - dot(f.embIso, t.te[2 * j + 1])));
}
export async function predictPsl(f) {
  const [w, t, logit] = await Promise.all([weights('user-B'), phrases(), phraseLogits(f)]);
  const h = await predictHuman(f, 'E');
  const u = w.b0 + [h, ...logit, ...NEUTRAL].reduce((s, v, j) => s + v * w.v[j], 0);
  return { psl: Math.min(8, Math.max(1, STRETCH.a + STRETCH.b * u + REFERENCE_SHIFT)), u, h, logit, pairs: t.pairs };
}

// ---------- gender ----------
// CLIP, plain 1.6× crop: "a photo of a man / male face" vs "a photo of a woman / female face". On the ~2,500 MEBeauty
// faces it gets the sex right 99.2 % of the time (threshold 0).
let sexP = null;
export async function detectSex(canvas, points) {
  const t = await (sexP ??= fetch('models/sex.json').then((r) => r.json()));
  const b = faceBox(canvas, points), s = Math.max(b.w, b.h) * 1.6;
  const oc = document.createElement('canvas'); oc.width = oc.height = 224;
  oc.getContext('2d').drawImage(canvas, b.cx - s / 2, b.cy - s / 2, s, s, 0, 0, 224, 224);
  const e = await embedImage(oc);
  const dot = (a, c) => a.reduce((acc, x, i) => acc + x * c[i], 0);
  const g = 100 * (dot(e, t.te[0]) - dot(e, t.te[1]) + dot(e, t.te[2]) - dot(e, t.te[3])) / 2;
  return { sex: g > 0 ? 'm' : 'f', confidence: 1 / (1 + Math.exp(-Math.abs(g))), logit: g };
}

// ---------- women ----------
// Crowd probe trained on 1,047 MEBeauty women, r = .77 on the 281 test women. The owner rated men only, so a woman is
// placed by percentile: her crowd score → her percentile among MEBeauty women → the PSL a man gets at the same
// percentile among MEBeauty men on the owner's scale (models/map-f.json, 41 quantile knots).
let mapP = null;
export async function predictPslFemale(f) {
  const [w, m] = await Promise.all([weights('Ef'), (mapP ??= fetch('models/map-f.json').then((r) => r.json()))]);
  const h = w.b0 + [...f.embIso, ...NEUTRAL].reduce((s, v, j) => s + v * w.v[j], 0);
  const k = m.knots; let psl;
  if (h <= k[0][0]) psl = k[0][1]; else if (h >= k[k.length - 1][0]) psl = k[k.length - 1][1];
  else for (let i = 1; i < k.length; i++) if (h <= k[i][0]) { const [x0, y0] = k[i - 1], [x1, y1] = k[i]; psl = x1 === x0 ? y1 : y0 + ((h - x0) / (x1 - x0)) * (y1 - y0); break; }
  return { psl: Math.min(8, Math.max(1, psl)), h };
}
