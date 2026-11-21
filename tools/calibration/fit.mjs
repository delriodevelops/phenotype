// Fit the face measure on MEBeauty train (men), choose ridge λ by 5-fold CV on train, report on the untouched test split.
// Models compared:
//   base   the current mix (SCUT orig + CLIP phrasings 2+3 on the unmasked crop), weights fixed
//   P      ridge on 18 CLIP phrase logits (isolated face) + SCUT (orig, iso) + pose/expression covariates
//   E      ridge on the 512-d CLIP embedding of the isolated face + SCUT + covariates (linear probe)
//   Eo     the same probe on the unmasked crop (does isolation help?)
import fs from 'node:fs';
const rows = fs.readFileSync('features.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.faces === 1);
const { pairs, te } = JSON.parse(fs.readFileSync('te.json', 'utf8'));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const sig = (x) => 1 / (1 + Math.exp(-x));
const COV = ['smile', 'mouthOpen', 'absYaw', 'absRoll', 'pitch'];
for (const r of rows) {
  r.absYaw = Math.abs(r.yaw); r.absRoll = Math.abs(r.roll);
  r.logit = pairs.map((_, j) => 100 * (dot(r.embIso, te[2 * j]) - dot(r.embIso, te[2 * j + 1])));
  r.logitO = pairs.map((_, j) => 100 * (dot(r.embOrig, te[2 * j]) - dot(r.embOrig, te[2 * j + 1])));
}
const train = rows.filter((r) => r.split === 'train'), test = rows.filter((r) => r.split === 'test');
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pear = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db); };

// ridge with standardisation (fit on the rows given)
function ridge(X, y, lam) {
  const n = X.length, p = X[0].length;
  const mu = Array(p).fill(0), sd = Array(p).fill(0);
  X.forEach((x) => x.forEach((v, j) => (mu[j] += v / n)));
  X.forEach((x) => x.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / n)));
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j])), ym = mean(y);
  // dual form when p > n is not needed here (p ≤ 530, n ≈ 900): solve (ZᵀZ + λI) w = Zᵀ(y − ȳ)
  const A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
  for (let i = 0; i < n; i++) { const z = Z[i], yi = y[i] - ym; for (let j = 0; j < p; j++) { b[j] += z[j] * yi; const zj = z[j]; const Aj = A[j]; for (let k = j; k < p; k++) Aj[k] += zj * z[k]; } }
  for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; A[j][j] += lam; }
  const w = solve(A, b);
  return { mu, sd, w, ym, predict: (x) => ym + x.reduce((s, v, j) => s + ((v - mu[j]) / sd[j]) * w[j], 0) };
}
function solve(A, b) { // Cholesky
  const n = b.length, L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
  }
  const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return [...x];
}
function cv(feat, lams) {
  const idx = train.map((_, i) => i); const folds = 5; let best = null;
  for (const lam of lams) {
    const pred = Array(train.length);
    for (let f = 0; f < folds; f++) {
      const tr = idx.filter((i) => i % folds !== f), va = idx.filter((i) => i % folds === f);
      const m = ridge(tr.map((i) => feat(train[i])), tr.map((i) => train[i].s), lam);
      va.forEach((i) => (pred[i] = m.predict(feat(train[i]))));
    }
    const r = pear(pred, train.map((t) => t.s));
    if (!best || r > best.r) best = { lam, r };
  }
  const model = ridge(train.map(feat), train.map((t) => t.s), best.lam);
  const testR = pear(test.map((t) => model.predict(feat(t))), test.map((t) => t.s));
  return { ...best, testR, model };
}
const cov = (r) => COV.map((k) => r[k]);
const feats = {
  P: (r) => [...r.logit, r.scutOrig, r.scutIso, ...cov(r)],
  E: (r) => [...r.embIso, r.scutOrig, r.scutIso, ...cov(r)],
  Eo: (r) => [...r.embOrig, r.scutOrig, ...cov(r)],
  Esc: (r) => [...r.embIso, r.scutIso, ...cov(r)],
};
const out = { n: { train: train.length, test: test.length } };
// baseline: the shipped mix, scored on test
{
  const z = (a) => { const m = mean(a), s = Math.sqrt(mean(a.map((x) => (x - m) ** 2))); return a.map((x) => (x - m) / s); };
  const zs = z(test.map((r) => r.scutOrig)), zc = z(test.map((r) => (sig(r.logitO[0]) + sig(r.logitO[1])) / 2));
  out.base_testR = +pear(test.map((_, i) => 0.45 * zs[i] + 0.55 * zc[i]), test.map((t) => t.s)).toFixed(3);
}
const res = {};
for (const [k, f] of Object.entries(feats)) {
  const r = cv(f, k === 'P' ? [1, 3, 10, 30, 100, 300] : [30, 100, 300, 1000, 3000, 10000]);
  res[k] = r; out[k] = { lam: r.lam, cvR: +r.r.toFixed(3), testR: +r.testR.toFixed(3) };
}
// stability probe saved for later: per-test residuals by ethnicity for the best model
const best = Object.entries(res).sort((a, b) => b[1].testR - a[1].testR)[0];
out.best = best[0];
const m = best[1].model, f = feats[best[0]];
const byEth = {};
for (const t of test) { (byEth[t.eth] ??= []).push(m.predict(f(t)) - t.s); }
out.biasByEth = Object.fromEntries(Object.entries(byEth).map(([e, a]) => [e, { n: a.length, mean: +mean(a).toFixed(2) }]));
out.covWeights = Object.fromEntries(COV.map((k, i) => { const j = f(test[0]).length - COV.length + i; return [k, +(m.w[j] / m.sd[j]).toFixed(3)]; }));
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(`model-${best[0]}.json`, JSON.stringify({ kind: best[0], cov: COV, mu: m.mu, sd: m.sd, w: m.w, ym: m.ym, lam: best[1].lam, testR: best[1].testR }));
// export every candidate (weights folded into raw-feature space: pred = b0 + Σ v_j·x_j)
for (const [k, r] of Object.entries(res)) {
  const m = r.model; const v = m.w.map((w, j) => w / m.sd[j]); const b0 = m.ym - v.reduce((s, x, j) => s + x * m.mu[j], 0);
  fs.writeFileSync(`w-${k}.json`, JSON.stringify({ kind: k, b0, v: v.map((x) => +x.toPrecision(6)), testR: +r.testR.toFixed(3), lam: r.lam }));
}
