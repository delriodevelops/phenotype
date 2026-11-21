// A face trait by trait, and what it stands out for. Nothing new is measured here: both sources come from the scan.
//   the measures   the landmark ratios against their ideal ranges (face.js IDEALS).
//   the reading    what CLIP reads in the photo where no ratio can see — skin, hair, how defined the jaw is… — as
//                  phrase pairs (probe.js phraseLogits), placed among the MEBeauty faces of the same sex (REF below):
//                  5 = the photo reads like the middle face, 8.4 = above 84 of every 100.
// A trait's note (0–10) is the mean of what is available for it. The notes describe the face; the PSL does not come
// from adding them up (the model gives it), and the views say so.
import { IDEALS } from './face.js';
import { phi } from './score.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// 0–10: how close a measure sits to its ideal. 10 at the heart of the ideal range, 8.5 at its edges, 0 at the end
// of the measure's scale. A range that ends where the scale does (symmetry: 88–100 of 100) peaks at that end.
export function closeness(k, v) {
  const i = IDEALS[k];
  if (!i || !Number.isFinite(v)) return null;
  const peak = i.hi >= i.max ? i.hi : i.lo <= i.min ? i.lo : (i.lo + i.hi) / 2;
  if (v >= i.lo && v <= i.hi) { const half = v >= peak ? i.hi - peak : peak - i.lo; return half > 0 ? 10 - (1.5 * Math.abs(v - peak)) / half : 10; }
  return clamp(v < i.lo ? (8.5 * (v - i.min)) / (i.lo - i.min) : (8.5 * (i.max - v)) / (i.max - i.hi), 0, 8.5);
}

// Where each phrase pair sits over the MEBeauty faces: [mean, sd] of its logit, by pair index (models/te.json), for
// the 1,173 men and the 1,338 women (tools/calibration/data/features*.jsonl; the same isolated-face embedding the
// scan makes). The phrases say "a man with…", but a pair is the difference between its two phrases, so the word
// cancels out and what is left is the trait; among women it is read against women.
const REF = {
  m: { 4: [-0.032, 0.438], 5: [-1.041, 0.631], 6: [-0.279, 0.594], 8: [1.168, 1.046], 9: [0.329, 0.812], 11: [0.171, 1.035], 14: [-0.678, 0.685] },
  f: { 4: [0.596, 0.449], 5: [-0.021, 0.698], 6: [-0.481, 0.556], 8: [0.769, 1.009], 11: [1.262, 0.944], 14: [-1.902, 0.688] },
};
// a pair's logit as 0–10: ten times the share of reference faces the photo reads above
export function reading(pair, logit, sex) {
  const ref = REF[sex === 'f' ? 'f' : 'm'][pair];
  return ref && Number.isFinite(logit) ? 10 * phi((logit - ref[0]) / ref[1]) : null;
}

// geo: the measures that speak for the trait · pair: the phrase pair that does · sex: only read for that sex
const TRAITS = [
  { key: 'ojos', label: 'Ojos', geo: ['canthal_tilt_deg', 'esr'], pair: 8 }, // deep set, intense / tired, droopy
  { key: 'pomulos', label: 'Pómulos', geo: ['fwhr', 'midface_ratio'], pair: 5 }, // lean face, high cheekbones / round face
  { key: 'mandibula', label: 'Mandíbula', geo: ['jaw_ratio', 'chin_philtrum'], pair: 4 }, // strong defined jawline / weak jaw
  { key: 'nariz', label: 'Nariz', geo: ['nose_ratio'] },
  { key: 'labios', label: 'Labios', geo: ['lip_ratio'] },
  { key: 'simetria', label: 'Simetría', geo: ['symmetry'] },
  { key: 'piel', label: 'Piel', pair: 6 }, // clear healthy skin / acne and bad skin
  { key: 'pelo', label: 'Pelo', pair: 14 }, // full thick hair / balding
  { key: 'masculinidad', label: 'Masculinidad', pair: 9, sex: 'm' }, // masculine / boyish
  { key: 'fisico', label: 'Forma física', pair: 11 }, // fit athletic / overweight
];

// r: one measured face (measure.js): entry.face.metrics, sex and logit (the photo on the phrase pairs)
// → { traits: [{ key, label, score }], best: the traits it stands out for, weak: its lowest ones }
export function breakdown(r) {
  const m = r.entry?.face?.metrics || {}, logit = r.logit || r.scale?.logit || null;
  const turned = Math.abs(m.yaw_deg || 0) >= 12; // a turned head: symmetry cannot be read from the photo
  const traits = [];
  for (const t of TRAITS) {
    if (t.sex && t.sex !== r.sex) continue;
    const g = (t.geo || []).map((k) => (k === 'symmetry' && turned ? null : closeness(k, m[k]))).filter((v) => v != null);
    const read = logit && t.pair != null ? reading(t.pair, logit[t.pair], r.sex) : null;
    const parts = [...(g.length ? [mean(g)] : []), ...(read != null ? [read] : [])];
    if (parts.length) traits.push({ key: t.key, label: t.label, score: mean(parts) });
  }
  const ranked = [...traits].sort((a, b) => b.score - a.score);
  const high = ranked.filter((t) => t.score >= 7).slice(0, 3);
  return { traits, best: high.length ? high : ranked.slice(0, 2), weak: ranked.filter((t) => t.score < 4.5).slice(-2).reverse() };
}

// two faces, trait by trait: only the traits both have. side: 0 | 1 | null (too close to call)
export function duel(a, b) {
  const rows = [];
  for (const t of a.traits) {
    const o = b.traits.find((x) => x.key === t.key);
    if (!o) continue;
    const d = t.score - o.score;
    rows.push({ key: t.key, label: t.label, a: t.score, b: o.score, side: Math.abs(d) < 0.3 ? null : d > 0 ? 0 : 1 });
  }
  return rows;
}
// "ojos, mandíbula y piel"
export const listed = (items) => { const n = items.map((t) => t.label.toLowerCase()); return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`; };

// ---------- the post: real measures against their ideal ----------
// Each measure as a post reads it: the part of the face (so anyone follows) and the measure's own name (so it is a
// measure, not an opinion).
const AREA = {
  canthal_tilt_deg: ['Ojos', 'canthal tilt'], esr: ['Ojos', 'ESR'], fwhr: ['Pómulos', 'FWHR'], midface_ratio: ['Tercio medio', 'midface ratio'],
  jaw_ratio: ['Mandíbula', 'jaw ratio'], chin_philtrum: ['Mentón', 'altura/filtrum'], nose_ratio: ['Nariz', 'alar/intercantal'],
  lip_ratio: ['Labios', 'inferior/superior'], third_lower: ['Tercio inferior', ''], symmetry: ['Simetría', ''],
};
const val = (k, v) => k === 'canthal_tilt_deg' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°` : k === 'symmetry' ? `${Math.round(v)}/100` : k === 'third_lower' ? `${v.toFixed(0)} %` : v.toFixed(2);
const idealText = (k) => { const i = IDEALS[k]; return i.hi >= i.max ? `${i.lo}+` : `${i.lo}–${i.hi}${i.unit === '°' ? '°' : i.unit === '%' ? ' %' : ''}`; };
// "Pómulos: FWHR 1.71 (ideal 1.85–2.05)" · with `vs`, the other face's value too: "FWHR 1.94 vs 1.71"
const say = (k, v, vs) => { const [area, name] = AREA[k]; return `${area}: ${name ? `${name} ` : ''}${val(k, v)}${vs != null ? ` vs ${val(k, vs)}` : ''} (ideal ${idealText(k)})`; };

// a face's measures, closest to the ideal first (symmetry is left out on a turned head: the photo cannot show it)
function ranked(m) {
  const turned = Math.abs(m.yaw_deg || 0) >= 12;
  return Object.keys(AREA).filter((k) => !(k === 'symmetry' && turned)).map((k) => ({ k, v: m[k], c: closeness(k, m[k]) })).filter((x) => x.c != null).sort((a, b) => b.c - a.c);
}
// ✓ the two measures inside their ideal (closest first) · ✗ the two furthest outside it
export function measureLines(m) {
  const r = ranked(m || {}), inside = r.filter((x) => x.c > 8.5).slice(0, 2), outside = r.filter((x) => x.c < 8.5).slice(-2).reverse();
  return [...inside.map((x) => `✓ ${say(x.k, x.v)}`), ...outside.map((x) => `✗ ${say(x.k, x.v)}`)];
}
// where the winner is closer to the ideal than the loser, the widest gaps first
export function edgeLines(mw, ml, n = 3) {
  const lose = Object.fromEntries(ranked(ml || {}).map((x) => [x.k, x]));
  return ranked(mw || {}).filter((x) => lose[x.k] && x.c - lose[x.k].c > 0.5).sort((a, b) => (b.c - lose[b.k].c) - (a.c - lose[a.k].c)).slice(0, n).map((x) => `✓ ${say(x.k, x.v, lose[x.k].v)}`);
}
