// Women: (1) validate CLIP man/woman detection on all MEBeauty faces, (2) train the crowd probe on women (train split,
// tested on the women test split), (3) build the percentile map: a woman's crowd score → her percentile among MEBeauty
// women → the PSL a man gets at the same percentile among MEBeauty men (the owner's scale), as quantile knots.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.faces === 1);
const men = read('features.jsonl'), women = read('featuresf.jsonl');
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pear = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db); };
const out = {};
// (1) gender: logit(man) − logit(woman), both phrasings, on the plain crop and on the isolated face
const sx = JSON.parse(fs.readFileSync('sex-te.json', 'utf8')).te;
const g = (e) => 100 * (dot(e, sx[0]) - dot(e, sx[1]) + dot(e, sx[2]) - dot(e, sx[3])) / 2;
for (const k of ['embOrig', 'embIso']) {
  const all = [...men.map((r) => [g(r[k]), 1]), ...women.map((r) => [g(r[k]), 0])];
  let best = { acc: 0 };
  for (let t = -5; t <= 5; t += 0.1) { const acc = mean(all.map(([v, y]) => ((v > t ? 1 : 0) === y ? 1 : 0))); if (acc > best.acc) best = { t: +t.toFixed(1), acc: +acc.toFixed(4) }; }
  out['gender_' + k] = { ...best, accAt0: +mean(all.map(([v, y]) => ((v > 0 ? 1 : 0) === y ? 1 : 0))).toFixed(4) };
}
// (2) ridge probe on women
function ridge(X, y, lam) {
  const n = X.length, p = X[0].length, mu = Array(p).fill(0), sd = Array(p).fill(0);
  X.forEach((x) => x.forEach((v, j) => (mu[j] += v / n))); X.forEach((x) => x.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / n)));
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j])), ym = mean(y);
  const A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
  for (let i = 0; i < n; i++) { const z = Z[i], yi = y[i] - ym; for (let j = 0; j < p; j++) { b[j] += z[j] * yi; const Aj = A[j]; for (let k = j; k < p; k++) Aj[k] += z[j] * z[k]; } }
  for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; A[j][j] += lam; }
  const L = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j]; }
  const t = new Float64Array(p); for (let i = 0; i < p; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * t[k]; t[i] = s / L[i][i]; }
  const w = new Float64Array(p); for (let i = p - 1; i >= 0; i--) { let s = t[i]; for (let k = i + 1; k < p; k++) s -= L[k][i] * w[k]; w[i] = s / L[i][i]; }
  const v = [...w].map((x, j) => x / sd[j]); const b0 = ym - v.reduce((s, x, j) => s + x * mu[j], 0);
  return { b0, v, predict: (x) => b0 + x.reduce((s, xv, j) => s + xv * v[j], 0) };
}
const cov = (r) => [r.smile, r.mouthOpen, Math.abs(r.yaw), Math.abs(r.roll), r.pitch];
const fe = (r) => [...r.embIso, ...cov(r)];
const tr = women.filter((r) => r.split === 'train'), te = women.filter((r) => r.split === 'test');
let best = null;
for (const lam of [300, 1000, 3000]) {
  const idx = tr.map((_, i) => i), pred = Array(tr.length);
  for (let f = 0; f < 5; f++) { const a = idx.filter((i) => i % 5 !== f), v = idx.filter((i) => i % 5 === f); const m = ridge(a.map((i) => fe(tr[i])), a.map((i) => tr[i].s), lam); v.forEach((i) => (pred[i] = m.predict(fe(tr[i])))); }
  const r = pear(pred, tr.map((x) => x.s)); if (!best || r > best.r) best = { lam, r };
}
const mf = ridge(tr.map(fe), tr.map((r) => r.s), best.lam);
out.women = { n: { train: tr.length, test: te.length }, lam: best.lam, cvR: +best.r.toFixed(3), testR: +pear(te.map((r) => mf.predict(fe(r))), te.map((r) => r.s)).toFixed(3) };
fs.writeFileSync('w-Ef.json', JSON.stringify({ kind: 'Ef', b0: mf.b0, v: mf.v.map((x) => +x.toPrecision(6)), testR: out.women.testR, lam: best.lam }));
// (3) percentile map. Men: the full owner-scale PSL (same recipe as probe.js predictPsl). Women: crowd score, neutral pose.
const NEU = [0, 0, 0, 0, 0.38];
const wE = JSON.parse(fs.readFileSync('w-Ens.json', 'utf8')), wU = JSON.parse(fs.readFileSync('uns-B.json', 'utf8')), T = JSON.parse(fs.readFileSync('te.json', 'utf8'));
const STRETCH = { a: -17.801, b: 5.548 }, SHIFT = 0.381;
const menPsl = men.map((r) => { const h = wE.b0 + dot([...r.embIso, ...NEU], wE.v); const lg = T.pairs.map((_, j) => 100 * (dot(r.embIso, T.te[2 * j]) - dot(r.embIso, T.te[2 * j + 1]))); const u = wU.b0 + dot([h, ...lg, ...NEU], wU.v); return Math.min(8, Math.max(1, STRETCH.a + STRETCH.b * u + SHIFT)); }).sort((a, b) => a - b);
const womenH = women.map((r) => mf.b0 + dot([...r.embIso, ...NEU], mf.v)).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
const knots = []; for (let i = 0; i <= 40; i++) { const p = i / 40; knots.push([+q(womenH, p).toFixed(4), +q(menPsl, p).toFixed(3)]); }
fs.writeFileSync('map-f.json', JSON.stringify({ knots }));
const cutsAt = [3.5, 4.25, 5, 5.75, 6.5, 7.5].map((c) => +(menPsl.filter((x) => x < c).length / menPsl.length * 100).toFixed(1));
out.menTierPercentiles = cutsAt;
console.log(JSON.stringify(out, null, 1));
