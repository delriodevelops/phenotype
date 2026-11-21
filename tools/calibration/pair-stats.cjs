// How each CLIP phrase pair (te.json) is distributed over the MEBeauty faces, men and women, and how it goes with the
// crowd score. Its [mean, sd] per pair is the REF table of public/js/app/breakdown.js, which turns a pair's logit into
// a 0–10 note ("above 84 of every 100 reference faces" = 8.4). Read-only: it prints a table and the two arrays.
//   cd data && node ../pair-stats.cjs
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '.';
const te = JSON.parse(fs.readFileSync(path.join(dir, 'te.json'), 'utf8'));
const load = (f) => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const stats = (v) => { const n = v.length, m = v.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)); const q = [...v].sort((a, b) => a - b); const at = (p) => q[Math.min(n - 1, Math.floor(p * n))]; return { m, sd, p05: at(0.05), p50: at(0.5), p95: at(0.95) }; };
const corr = (a, b) => { const sa = stats(a), sb = stats(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - sa.m) * (b[i] - sb.m); return s / ((a.length - 1) * sa.sd * sb.sd); };
const out = {};
for (const [sex, file] of [['m', 'features.jsonl'], ['f', 'featuresf.jsonl']]) {
  const rows = load(file).filter((r) => Array.isArray(r.embIso) && r.embIso.length === 512 && Number.isFinite(r.s));
  console.log(`\n${sex}: ${rows.length} faces · crowd score mean ${stats(rows.map((r) => r.s)).m.toFixed(2)}`);
  out[sex] = [];
  te.pairs.forEach((p, j) => {
    const l = rows.map((r) => 100 * (dot(r.embIso, te.te[2 * j]) - dot(r.embIso, te.te[2 * j + 1])));
    const st = stats(l), r = corr(l, rows.map((x) => x.s));
    out[sex].push([+st.m.toFixed(3), +st.sd.toFixed(3)]);
    console.log(`${String(j).padStart(2)} mean ${st.m.toFixed(2).padStart(6)} sd ${st.sd.toFixed(2)}  p05 ${st.p05.toFixed(2).padStart(6)} p50 ${st.p50.toFixed(2).padStart(6)} p95 ${st.p95.toFixed(2).padStart(6)}  r(score) ${r.toFixed(2).padStart(5)}  ${p[0]} / ${p[1]}`);
  });
}
console.log('\n' + JSON.stringify(out));
