// The SMV model in the browser: the same arithmetic as lib/model.mjs computeScores (which is not served), fed with
// a face score for each scenario (now · natural · extreme). The face score comes from the in-browser rater; the
// potentials from the demo rules below until the server engine answers (then its own deltas are used).
const clamp = (v, a = 0, b = 10) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v * 10) / 10;

const WEIGHTS = {
  m: { face: 0.45, height: 0.15, body: 0.15, status: 0.15, social: 0.1 },
  f: { face: 0.55, height: 0.05, body: 0.2, status: 0.05, social: 0.15 },
};
const BF = {
  m: { '<10': 8, '10-14': 9, '15-19': 7, '20-24': 5, '25-29': 3.5, '30+': 2 },
  f: { '<10': 4, '10-14': 6.5, '15-19': 8.5, '20-24': 8, '25-29': 6, '30+': 3.5 },
};
const INCOME = { '<15k': 3, '15-30k': 4.5, '30-50k': 6, '50-100k': 7.5, '100k+': 9 };
const CAREER = { 'sin-empleo': 2.5, estudiante: 5, empleado: 5, cualificado: 6.5, directivo: 8 };
export const TIER_CUTS = [3.5, 4.25, 5, 5.75, 6.5, 7.5]; // True Adam from 7.5: the engine's measuring ceiling

function heightScore(sex, h) {
  if (!Number.isFinite(h)) return 5;
  if (sex === 'f') return clamp(8 - Math.abs(h - 168) * 0.28);
  return clamp(5 + ((h - 176) / 7) * 1.8);
}
export const pslFromFace = (f) => clamp(4 + (f - 5) * 0.85, 1, 8);
export const tierNames = (sex) => (sex === 'f' ? ['Sub-5', 'LTB', 'MTB', 'HTB', 'Stacylite', 'Stacy', 'True Eve'] : ['Sub-5', 'LTN', 'MTN', 'HTN', 'Chadlite', 'Chad', 'True Adam']);
export function tierFor(psl, sex) {
  const i = TIER_CUTS.findIndex((c) => psl < c);
  return tierNames(sex)[i === -1 ? 6 : i];
}
export function phi(z) { // the share of a normal distribution under z
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
export const percentile = (smv) => Math.round(phi((smv - 50) / 15) * 1000) / 10;
// The share of faces under a PSL, from the scale's own bands (Sub-5 P0–20 · LTN P20–50 · MTN P50–75 · HTN P75–93 ·
// Chadlite P93–99 · Chad P99+): for views that have a face but no questionnaire, so no SMV.
const BANDS = [[1, 0], [3.5, 20], [4.25, 50], [5, 75], [5.75, 93], [6.5, 99], [7.5, 99.9], [8, 99.99]];
export function facePercentile(psl) {
  if (!Number.isFinite(psl)) return NaN;
  if (psl <= BANDS[0][0]) return 0;
  for (let i = 1; i < BANDS.length; i++) if (psl <= BANDS[i][0]) { const [x0, y0] = BANDS[i - 1], [x1, y1] = BANDS[i]; return y0 + ((psl - x0) / (x1 - x0)) * (y1 - y0); }
  return 99.99;
}

// Hypergamy as the lookism folklore draws it, on the tier the SMV percentile falls in (a toy scheme, and the page
// says so). It is counted in tiers, not percentiles: the top tiers are a few people in a hundred, so a curve on the
// percentile never climbs them, and the scheme's whole point is that women's choices do.
//   stable: each ends up with their equal, the same tier of the other sex;
//   apps:   women choose upwards, HYPER_REACH tiers above their own; so men reach as many tiers below theirs.
// The two are one set of pairs seen from either side: he reaches her exactly when she reaches him.
export const HYPER_REACH = 2;
const TIER_PCT = [20, 50, 75, 93, 99, 99.9]; // the share of faces under each tier cut (BANDS below)
export const tierIndexAtPercentile = (q) => TIER_PCT.filter((c) => q >= c).length;
export function hypergamyAt(index, sex) { // from a tier (0–6) rather than a percentile
  const s = sex === 'f' ? 'f' : 'm', other = s === 'f' ? 'm' : 'f', names = tierNames(other);
  const at = (i) => ({ index: i, tier: names[i] });
  return { sex: s, other, apps: at(Math.round(clamp(index + (s === 'f' ? HYPER_REACH : -HYPER_REACH), 0, 6))), stable: at(index) };
}
export function hypergamy(pct, sex) {
  const p = clamp(Number.isFinite(pct) ? pct : 50, 0.1, 99.9);
  return { ...hypergamyAt(tierIndexAtPercentile(p), sex), own: p };
}

// The geometry nudge on the browser's PSL: ±0.3 at most, from how many of the landmark measures sit inside their
// ideal (canthal tilt, FWHR, midface ratio, jaw ratio, symmetry). Ranges as in js/app/face.js IDEALS.
const GEO = { canthal_tilt_deg: [4, 8], fwhr: [1.85, 2.05], midface_ratio: [0.95, 1.05], jaw_ratio: [0.86, 0.94], symmetry: [88, 100] };
export function geometryNudge(m = {}) {
  let n = 0, inside = 0;
  for (const [k, [lo, hi]] of Object.entries(GEO)) {
    const v = m[k];
    if (!Number.isFinite(v)) continue;
    n++; if (v >= lo && v <= hi) inside++;
  }
  return n ? 0.3 * ((inside - (n - inside)) / n) : 0;
}
// A provisional tier never flips on noise: within 0.15 of a cut it reads as both neighbours ("LTN/MTN").
export function tierLabel(psl, sex, provisional) {
  if (provisional) {
    const i = TIER_CUTS.findIndex((c) => Math.abs(psl - c) < 0.15);
    if (i >= 0) return `${tierFor(TIER_CUTS[i] - 0.01, sex)}/${tierFor(TIER_CUTS[i] + 0.01, sex)}`;
  }
  return tierFor(psl, sex);
}

// face: { now, natural, extreme } on the 0–10 face scale
export function computeScores(face, quiz) {
  const sex = quiz.sex === 'f' ? 'f' : 'm';
  const W = WEIGHTS[sex];
  const h = Number(quiz.height_cm);
  const train = clamp(Number(quiz.training) || 0, 0, 7);
  const bodyNow = clamp((BF[sex][quiz.bodyfat] ?? 5) + Math.min(1, train * 0.2));
  const statusNow = clamp((INCOME[quiz.income] ?? 5) * 0.6 + (CAREER[quiz.career] ?? 5) * 0.4);
  const social = clamp(Number(quiz.social) || 3, 1, 5), style = clamp(Number(quiz.style) || 3, 1, 5);
  const sleep = Number(quiz.sleep) || 7;
  const socialNow = clamp(social * 1.3 + style * 0.5 + (sleep >= 7 ? 0.5 : 0) - 0.3);
  const comp = {
    face,
    height: { now: heightScore(sex, h), natural: heightScore(sex, h + 1), extreme: heightScore(sex, h + (sex === 'f' ? 0 : 7)) },
    body: { now: bodyNow, natural: Math.max(bodyNow, sex === 'f' ? 9 : 9.3), extreme: 9.6 },
    status: { now: statusNow, natural: clamp(statusNow + 1), extreme: clamp(statusNow + 1.6) },
    social: { now: socialNow, natural: clamp(Math.max(socialNow, socialNow + 1.6), 0, 9), extreme: clamp(Math.max(socialNow + 2.2, 8.5), 0, 9.6) },
  };
  if (sex === 'f') comp.height.extreme = Math.max(comp.height.now, comp.height.natural);
  const smv = {}, psl = {}, tier = {}, pct = {};
  for (const s of ['now', 'natural', 'extreme']) {
    smv[s] = r1(Object.keys(W).reduce((acc, k) => acc + comp[k][s] * W[k], 0) * 10);
    psl[s] = r1(pslFromFace(face[s]));
    tier[s] = tierFor(psl[s], sex);
    pct[s] = percentile(smv[s]);
  }
  return { sex, smv, psl, tier, percentile: pct };
}

// The demo rules (lib/model.mjs demoAnalysis): what softmaxxing and then surgery plus perception can add to a face,
// with the questionnaire's skin and hair as the levers they are.
const SOFT = { skin: 2, hair: 1.2, harmony: 0.5, dimorphism: 0.4, jaw_chin: 0.8, eye_area: 0.3, midface: 0.2, nose: 0, lips: 0.2, symmetry: 0.1 };
const HARD = { skin: 0.4, hair: 1.4, harmony: 1.3, dimorphism: 1, jaw_chin: 1.8, eye_area: 1.6, midface: 0.8, nose: 1.6, lips: 0.6, symmetry: 0.6 };
const FACE_W = { harmony: 0.2, dimorphism: 0.15, eye_area: 0.15, jaw_chin: 0.15, midface: 0.1, skin: 0.08, hair: 0.07, nose: 0.04, lips: 0.03, symmetry: 0.03 };
export function potentials(faceNow, quiz) {
  const skin = { limpia: 7, leve: 5.8, moderada: 4.4, severa: 3 }[quiz.skin] ?? faceNow;
  const hair = { completo: 7, entradas: 5.2, coronilla: 4.2, avanzado: 2.8, fino: 5, normal: 6.5, denso: 7.5 }[quiz.hair] ?? faceNow;
  let nat = 0, ext = 0;
  for (const k of Object.keys(FACE_W)) {
    const n = k === 'skin' ? (faceNow + skin) / 2 : k === 'hair' ? (faceNow + hair) / 2 : faceNow;
    const a = clamp(n + SOFT[k] * (1 - n / 11), 0, 9.2);
    nat += (a - n) * FACE_W[k];
    ext += (clamp(a + HARD[k] * (1 - a / 11), 0, 9.6) - n) * FACE_W[k];
  }
  return { now: faceNow, natural: clamp(faceNow + nat), extreme: clamp(faceNow + ext) };
}

// the recommendations the rules give without the engine (short versions of the demo protocols)
export const NATURAL_RECS = [
  { name: 'Grasa al 10–12 %', action: 'Déficit de 300–500 kcal, 1.8 g/kg de proteína y 8–10k pasos: revela mandíbula y pómulos.', delta: 0.45 },
  { name: 'Rutina de piel', action: 'Limpiador suave, SPF 50 diario y retinoide nocturno con receta.', delta: 0.25 },
  { name: 'Corte según tu cara', action: 'Laterales cortos y volumen arriba para alargar el tercio superior.', delta: 0.2 },
  { name: 'Cejas y barba', action: 'Perfila la ceja sin adelgazarla y define la barba bajo la mandíbula.', delta: 0.15 },
  { name: 'Dormir 7.5–9 h', action: 'Horario fijo: menos edema bajo los ojos y mejor piel.', delta: 0.1 },
];
export const EXTREME_RECS = [
  { name: 'Implantes mandibulares', action: 'PEEK a medida: anchura bigonial y ángulo más marcado.', delta: 0.5 },
  { name: 'Genioplastia de avance', action: 'Proyecta el mentón y define el tercio inferior.', delta: 0.5 },
  { name: 'Cantoplastia lateral', action: 'Vector cantal positivo. Riesgo alto: solo con cirujano oculoplástico.', delta: 0.45 },
  { name: 'Barba de contorno', action: 'Barba corta y densa en el borde mandibular: simula anchura.', delta: 0.2 },
  { name: 'Alzas internas', action: 'Plantillas de 4–6 cm: +5 cm de altura percibida.', delta: 0.15 },
];
