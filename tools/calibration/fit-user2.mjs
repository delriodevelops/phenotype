// Calibrate the probe to the user's own PSL ratings (200 faces). Honest error by 10-fold CV, repeated with 5 shuffles.
// Candidates:
//   A  PSL = a + b·h                                (h = crowd score predicted by the E probe, pose neutralised)
//   B  ridge on [h, 18 phrase logits, SCUT orig, SCUT iso, covariates]
//   C  ridge on [512-d isolated embedding, h, SCUT, covariates]  (heavy regularisation)
import fs from 'node:fs';
const feats = new Map(fs.readFileSync('features.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r]));
const ratings = fs.readFileSync('ratings.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const wE = JSON.parse(fs.readFileSync('w-Ens.json', 'utf8'));
const { pairs, te } = JSON.parse(fs.readFileSync('te.json', 'utf8'));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const NEU = [0, 0, 0, 0, 0.38];
const rows = ratings.map((x) => {
  const r = feats.get(x.id);
  const h = wE.b0 + dot([...r.embIso, ...NEU], wE.v);
  const logit = pairs.map((_, j) => 100 * (dot(r.embIso, te[2 * j]) - dot(r.embIso, te[2 * j + 1])));
  const cov = [r.smile, r.mouthOpen, Math.abs(r.yaw), Math.abs(r.roll), r.pitch];
  return { ...r, y: x.psl, tier: x.tier, h, logit, cov };
});
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pear = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db); };
function ridge(X, y, lam) {
  const n = X.length, p = X[0].length, mu = Array(p).fill(0), sd = Array(p).fill(0);
  X.forEach((x) => x.forEach((v, j) => (mu[j] += v / n))); X.forEach((x) => x.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / n)));
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j])), ym = mean(y);
  const A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
  for (let i = 0; i < n; i++) { const z = Z[i], yi = y[i] - ym; for (let j = 0; j < p; j++) { b[j] += z[j] * yi; for (let k = j; k < p; k++) A[j][k] += z[j] * z[k]; } }
  for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; A[j][j] += lam; }
  const L = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j]; }
  const t = new Float64Array(p); for (let i = 0; i < p; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * t[k]; t[i] = s / L[i][i]; }
  const w = new Float64Array(p); for (let i = p - 1; i >= 0; i--) { let s = t[i]; for (let k = i + 1; k < p; k++) s -= L[k][i] * w[k]; w[i] = s / L[i][i]; }
  const v = [...w].map((x, j) => x / sd[j]); const b0 = ym - v.reduce((s, x, j) => s + x * mu[j], 0);
  return { b0, v, predict: (x) => b0 + x.reduce((s, xv, j) => s + xv * v[j], 0) };
}
const F = {
  A: (r) => [r.h],
  B: (r) => [r.h, ...r.logit, ...r.cov],
  C: (r) => [...r.embIso, r.h, ...r.cov],
};
const LAMS = { A: [0.001], B: [3, 10, 30, 100, 300], C: [100, 300, 1000, 3000, 10000] };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function cv(f, lam) { // 10-fold × 5 shuffles: pooled out-of-fold r and MAE
  const rs = [], maes = [], tierAcc = [];
  for (let rep = 0; rep < 5; rep++) {
    const order = rows.map((r, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); const pred = Array(rows.length);
    for (let k = 0; k < 10; k++) {
      const va = order.filter((_, i) => i % 10 === k), tr = order.filter((_, i) => i % 10 !== k);
      const m = ridge(tr.map((i) => f(rows[i])), tr.map((i) => rows[i].y), lam);
      va.forEach((i) => (pred[i] = m.predict(f(rows[i]))));
    }
    rs.push(pear(pred, rows.map((r) => r.y))); maes.push(mean(pred.map((p, i) => Math.abs(p - rows[i].y))));
    const cut = [3.5, 4.25, 5, 5.75, 6.5, 7.5], t = (v) => cut.filter((c) => v >= c).length;
    tierAcc.push(mean(pred.map((p, i) => (Math.abs(t(p) - t(rows[i].y)) <= 0 ? 1 : 0))));
  }
  return { r: mean(rs), mae: mean(maes), exactTier: mean(tierAcc) };
}
const out = { n: rows.length, crowdVsYou: +pear(rows.map((r) => r.s), rows.map((r) => r.y)).toFixed(3), hVsYou: +pear(rows.map((r) => r.h), rows.map((r) => r.y)).toFixed(3), meanYou: +mean(rows.map((r) => r.y)).toFixed(2), baselineMAE_constant: +mean(rows.map((r) => Math.abs(r.y - mean(rows.map((q) => q.y))))).toFixed(3) };
const best = {};
for (const k of Object.keys(F)) {
  let b = null; for (const lam of LAMS[k]) { const c = cv(F[k], lam); if (!b || c.r > b.r) b = { lam, ...c }; }
  best[k] = b; out[k] = { lam: b.lam, r: +b.r.toFixed(3), mae: +b.mae.toFixed(3), exactTier: +b.exactTier.toFixed(2) };
}
console.log(JSON.stringify(out, null, 1));
for (const k of Object.keys(F)) { const m = ridge(rows.map(F[k]), rows.map((r) => r.y), best[k].lam); fs.writeFileSync(`uns-${k}.json`, JSON.stringify({ kind: k, b0: m.b0, v: m.v.map((x) => +x.toPrecision(6)), lam: best[k].lam, cv: out[k] })); }
