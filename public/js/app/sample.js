// Formations for the point field (points.js): a face, a piece of text or loose dust, as n points.
//   bustOf(canvas, points)     the 5:7 crop every card uses: upright, hair to collar, the face always the same size
//   analyse(photo, lm, opts)   that crop read once: tone, the person lifted off the background (the segmenter's matte
//                              when there is one, a mask drawn from the landmarks otherwise), a relief, and the
//                              cut-out itself: the photograph with nothing behind it
//   bust.sample(n)             n points whose density follows the light of the face (a stipple), in reading order
//   textSample(text, n, font)  n points filling a line of type, denser on its edges
//   place* / dust / compose    put samples on the canvas and join several into one formation
// Reading order matters: every sample is cut into the same number of horizontal bands, each sorted left to right, so
// point i of one formation and point i of another sit in the same relative place. A morph then flows; it does not
// explode (the neighbour-preserving match of the KERN films).
export const PAPER = [0.843, 0.867, 0.898], ACID = [0.776, 1, 0.239], RED = [1, 0.231, 0.184];
const SW = 300, SH = 420, BANDS = 140;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---------- the crop ----------
// Face height (landmark 10 → 152) is always 1/1.8 of the crop and the face centre sits at 51 % of its height, with the
// eye line levelled: two faces from two different photos come out the same size, at the same place.
// The crop is as sharp as the photo allows (it is shown as a photograph too), between 280 and 900 px wide.
export function bustOf(canvas, points, width = 0) {
  let cx = canvas.width / 2, cy = canvas.height * 0.46, fh = Math.min(canvas.width, canvas.height * 0.8) * 0.5, roll = 0;
  if (points) {
    const top = points[10], chin = points[152];
    fh = Math.hypot(chin.x - top.x, chin.y - top.y) || fh;
    cx = (top.x + chin.x) / 2; cy = (top.y + chin.y) / 2;
    roll = clamp(Math.atan2(points[263].y - points[33].y, points[263].x - points[33].x), -0.45, 0.45);
  }
  const W = width || Math.round(clamp((fh * 1.8) / 1.4, 280, 900)), H = Math.round(W * 1.4), out = mk(W, H), g = out.getContext('2d');
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  const s = H / 1.8 / fh, ox = W * 0.5, oy = H * 0.511, c = Math.cos(-roll), sn = Math.sin(-roll);
  g.save(); g.translate(ox, oy); g.rotate(-roll); g.scale(s, s); g.translate(-cx, -cy);
  g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0); g.restore();
  const lm = points ? points.map((p) => { const dx = (p.x - cx) * s, dy = (p.y - cy) * s; return { x: (ox + dx * c - dy * sn) / W, y: (oy + dx * sn + dy * c) / H, z: ((p.z || 0) * s) / W }; }) : null;
  return { canvas: out, lm };
}

// ---------- reading a bust ----------
function hull(ps) {
  const p = ps.slice(0, 478).map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function raster(polys) { // filled polygons → 0/1 Float32Array at sample size
  const c = mk(SW, SH), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  for (const poly of polys) { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill(); }
  const d = g.getImageData(0, 0, SW, SH).data, m = new Float32Array(SW * SH);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}
function blur(m, r) { // two box passes each way: close enough to a gaussian, and it does not need ctx.filter (Safari)
  const t = new Float32Array(m.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < SH; y++) { let s = 0; const o = y * SW; for (let x = -r; x < SW; x++) { if (x + r < SW) s += m[o + x + r]; if (x - r - 1 >= 0) s -= m[o + x - r - 1]; if (x >= 0) t[o + x] = s / (Math.min(SW - 1, x + r) - Math.max(0, x - r) + 1); } }
    for (let x = 0; x < SW; x++) { let s = 0; for (let y = -r; y < SH; y++) { if (y + r < SH) s += t[(y + r) * SW + x]; if (y - r - 1 >= 0) s -= t[(y - r - 1) * SW + x]; if (y >= 0) m[y * SW + x] = s / (Math.min(SH - 1, y + r) - Math.max(0, y - r) + 1); } }
  }
  return m;
}

function geometry(lm) {
  const P = (i) => ({ x: lm[i].x * SW, y: lm[i].y * SH });
  const top = P(10), chin = P(152), l = P(234), r = P(454);
  const eye = (a, b, iris) => (lm[iris] ? P(iris) : { x: (P(a).x + P(b).x) / 2, y: (P(a).y + P(b).y) / 2 });
  return {
    hull: hull(lm).map((p) => ({ x: p.x * SW, y: p.y * SH })), top, chin, nose: P(1), eyes: [eye(33, 133, 468), eye(362, 263, 473)],
    cx: (l.x + r.x) / 2, cy: (top.y + chin.y) / 2, fw: Math.hypot(r.x - l.x, r.y - l.y), fh: chin.y - top.y,
  };
}

// The backdrop, when the corners of the photo agree on one colour: its mean, or null on a busy background.
function backdrop(d) {
  const m = [0, 0, 0], v = [0, 0, 0]; let n = 0;
  const take = (x0, x1, y0, y1) => { for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * SW + x) * 4; n++; for (let c = 0; c < 3; c++) { const q = d[i + c] / 255; m[c] += q; v[c] += q * q; } } };
  take(0, Math.round(SW * 0.16), 0, Math.round(SH * 0.12)); take(Math.round(SW * 0.84), SW, 0, Math.round(SH * 0.12));
  take(0, Math.round(SW * 0.05), Math.round(SH * 0.12), Math.round(SH * 0.5)); take(Math.round(SW * 0.95), SW, Math.round(SH * 0.12), Math.round(SH * 0.5));
  let sd = 0;
  for (let c = 0; c < 3; c++) { m[c] /= n; sd = Math.max(sd, Math.sqrt(Math.max(0, v[c] / n - m[c] * m[c]))); }
  return sd < 0.085 ? m : null;
}

// a matte at any size ({ data, w, h }, 1 = person) → Float32Array at sample size
function matteAt(m) {
  const big = mk(m.w, m.h), bg = big.getContext('2d'), id = bg.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = m.data[i] * 255; }
  bg.putImageData(id, 0, 0);
  const c = mk(SW, SH), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(big, 0, 0, SW, SH);
  const d = g.getImageData(0, 0, SW, SH).data, out = new Float32Array(SW * SH);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255;
  return out;
}

// photo: a bustOf() canvas (or any 5:7 image); lm: its landmarks (0–1), or null for a plain picture (a hidden face);
// matte: the person as the segmenter sees them (matte.js), when it could run
export function analyse(photo, lm, { gamma = 1.8, floor = 0.03, edge = 0.4, matte = null } = {}) {
  const c = mk(SW, SH), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(photo, 0, 0, SW, SH);
  const d = g.getImageData(0, 0, SW, SH).data, N = SW * SH;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const z = new Float32Array(N);
  let mask, inner = null;
  if (lm) {
    const G = geometry(lm);
    // the head: the landmark hull, wider and lifted so the hair stays in; then the neck and the slope of the shoulders
    const head = G.hull.map((p) => { const up = p.y < G.cy ? (G.cy - p.y) / (G.cy - G.top.y || 1) : 0; return { x: G.cx + (p.x - G.cx) * (1.16 + 0.24 * up), y: G.cy + (p.y - G.cy) * 1.05 - up * 0.36 * G.fh }; });
    const jy = G.chin.y - G.fh * 0.12, nw = G.fw * 0.4, sy = G.chin.y + G.fh * 0.33;
    const body = [{ x: G.cx - nw, y: jy }, { x: G.cx + nw, y: jy }, { x: G.cx + nw * 1.12, y: G.chin.y + G.fh * 0.15 }, { x: SW * 1.06, y: sy }, { x: SW * 1.06, y: SH }, { x: -SW * 0.06, y: SH }, { x: -SW * 0.06, y: sy }, { x: G.cx - nw * 1.12, y: G.chin.y + G.fh * 0.15 }];
    inner = blur(raster([G.hull]), 3);
    if (matte) {
      // the segmenter's person, kept to this face's own neighbourhood (in a group photo the crop holds other shoulders)
      // and never less than the face the landmarks found (a hand or a pair of glasses can dent a matte)
      const M = matteAt(matte);
      const wide = G.hull.map((p) => { const up = p.y < G.cy ? (G.cy - p.y) / (G.cy - G.top.y || 1) : 0; return { x: G.cx + (p.x - G.cx) * (1.5 + 0.35 * up), y: G.cy + (p.y - G.cy) * 1.1 - up * 0.62 * G.fh }; });
      const by = G.chin.y + G.fh * 0.22, base = [{ x: G.cx - G.fw * 0.75, y: G.chin.y - G.fh * 0.2 }, { x: G.cx + G.fw * 0.75, y: G.chin.y - G.fh * 0.2 }, { x: SW * 1.1, y: by }, { x: SW * 1.1, y: SH }, { x: -SW * 0.1, y: SH }, { x: -SW * 0.1, y: by }];
      const near = blur(raster([wide, base]), 8);
      mask = new Float32Array(N);
      for (let i = 0; i < N; i++) mask[i] = Math.max(inner[i] * 0.98, smooth(0.32, 0.78, M[i]) * near[i]);
    } else mask = blur(raster([head, body]), 5);
    // without a matte, a plain backdrop is keyed out everywhere but inside the face itself (skin may share its colour)
    const bg = matte ? null : backdrop(d);
    if (bg) {
      const by = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
      for (let i = 0; i < N; i++) {
        const r = d[i * 4] / 255, b = d[i * 4 + 2] / 255, dy = L[i] - by, dr = r - L[i] - (bg[0] - by), db = b - L[i] - (bg[2] - by);
        const key = smooth(0.09, 0.24, Math.sqrt(0.45 * dy * dy + 3 * (dr * dr + db * db)));
        mask[i] *= inner[i] + (1 - inner[i]) * key;
      }
    }
    // the relief: a dome for the skull, the nose out, the eye sockets in. Units of crop width, negative = towards us.
    const a = G.fw * 0.62, bb = G.fh * 0.6, D = G.fw * 0.46;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const dx = (x - G.cx) / a, dy = (y - (G.cy - G.fh * 0.04)) / bb, q = 1 - dx * dx - dy * dy;
      let zz = q > 0 ? -D * q ** 0.7 : 0;
      const nx = (x - G.nose.x) / (G.fw * 0.11), ny = (y - (G.nose.y - G.fh * 0.03)) / (G.fh * 0.14);
      zz -= G.fw * 0.17 * Math.exp(-(nx * nx + ny * ny));
      for (const e of G.eyes) { const ex = (x - e.x) / (G.fw * 0.12), ey = (y - e.y) / (G.fh * 0.06); zz += G.fw * 0.05 * Math.exp(-(ex * ex + ey * ey)); }
      z[y * SW + x] = zz / SW;
    }
  } else { mask = new Float32Array(N).fill(1); }
  // The cut-out: the photograph with nothing behind it, soft at the edges of the crop so it sinks into the ground.
  let cut = photo;
  if (lm) {
    const mc = mk(SW, SH), mg = mc.getContext('2d'), mi = mg.createImageData(SW, SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const i = y * SW + x, u = x / SW, v = y / SH;
      mi.data[i * 4] = mi.data[i * 4 + 1] = mi.data[i * 4 + 2] = 255;
      mi.data[i * 4 + 3] = 255 * mask[i] * smooth(0, 0.05, u) * smooth(0, 0.05, 1 - u) * smooth(0, 0.04, v) * smooth(0, 0.16, 1 - v);
    }
    mg.putImageData(mi, 0, 0);
    cut = mk(photo.width, photo.height);
    const cg = cut.getContext('2d');
    cg.imageSmoothingQuality = 'high'; cg.drawImage(mc, 0, 0, cut.width, cut.height);
    cg.globalCompositeOperation = 'source-in'; cg.drawImage(photo, 0, 0);
  }
  // For the points, the edges of the crop never show either: the cloud dissolves towards the collar and feathers at the sides
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const u = x / SW, v = y / SH;
    mask[y * SW + x] *= smooth(0, 0.07, u) * smooth(0, 0.07, 1 - u) * smooth(0, 0.05, v) * (lm ? 1 - smooth(0.8, 0.99, v) : smooth(0, 0.05, 1 - v));
  }
  // levels, read inside the face: every photo ends up with the same range whatever its light
  const hist = new Uint32Array(256); let cnt = 0;
  for (let i = 0; i < N; i++) if (!inner || inner[i] > 0.6) { hist[Math.min(255, (L[i] * 255) | 0)]++; cnt++; }
  let lo = 0, hi = 255, acc = 0;
  for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc < cnt * 0.03) lo = k; if (acc < cnt * 0.97) hi = k; }
  lo /= 255; hi = Math.max(lo + 0.2, (hi + 1) / 255);
  for (let i = 0; i < N; i++) L[i] = clamp((L[i] - lo * 0.9) / (hi - lo * 0.9));
  // weight = light + a share for edges, so dark hair and the line of the jaw still catch points
  const w = new Float32Array(N);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x;
    const gx = L[i + 1 - SW] + 2 * L[i + 1] + L[i + 1 + SW] - L[i - 1 - SW] - 2 * L[i - 1] - L[i - 1 + SW];
    const gy = L[i + SW - 1] + 2 * L[i + SW] + L[i + SW + 1] - L[i - SW - 1] - 2 * L[i - SW] - L[i - SW + 1];
    const e = Math.min(1, Math.hypot(gx, gy) * 0.9);
    w[i] = mask[i] * ((lm ? floor : 0) + 0.82 * L[i] ** gamma + edge * e * (0.3 + L[i]));
  }
  // the ghost: the same face as a soft cool monochrome, laid under the points so the gaps between them are not holes
  const ghost = mk(SW, SH), gg = ghost.getContext('2d'), gi = gg.createImageData(SW, SH);
  for (let i = 0; i < N; i++) { const q = L[i] ** 1.1 * mask[i] * 255; gi.data[i * 4] = q * PAPER[0]; gi.data[i * 4 + 1] = q * PAPER[1]; gi.data[i * 4 + 2] = q * PAPER[2]; gi.data[i * 4 + 3] = 255; }
  gg.putImageData(gi, 0, 0);

  const cache = new Map();
  return {
    photo, cut, lm, ghost,
    // n points, stratified along the cumulative weight (even coverage, no clumps), in reading order
    sample(n, seed = 1) {
      const key = `${n}|${seed}`;
      if (cache.has(key)) return cache.get(key);
      const r = rng(seed * 7919 + n);
      let total = 0; for (let i = 0; i < N; i++) total += w[i];
      const u = new Float32Array(n), v = new Float32Array(n), zz = new Float32Array(n), l = new Float32Array(n);
      let i = 0, cum = w[0];
      for (let j = 0; j < n; j++) {
        const target = ((j + r()) / n) * total;
        while (cum < target && i < N - 1) cum += w[++i];
        u[j] = ((i % SW) + r()) / SW; v[j] = (((i / SW) | 0) + r()) / SH; zz[j] = z[i]; l[j] = L[i];
      }
      const s = inOrder({ n, u, v, z: zz, l }, seed);
      cache.set(key, s);
      return s;
    },
  };
}

// cut a sample (already top to bottom) into BANDS equal slices and sort each left to right; add two random numbers per point
function inOrder(s, seed = 1) {
  const { n } = s, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let b = 0; b < BANDS; b++) { const a = Math.floor((b * n) / BANDS), e = Math.floor(((b + 1) * n) / BANDS); idx.subarray(a, e).sort((p, q) => s.u[p] - s.u[q]); }
  const pick = (src) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = src[idx[i]]; return o; };
  const r = rng(seed * 104729 + n), r1 = new Float32Array(n), r2 = new Float32Array(n);
  for (let i = 0; i < n; i++) { r1[i] = r(); r2[i] = r(); }
  return { n, u: pick(s.u), v: pick(s.v), z: s.z ? pick(s.z) : new Float32Array(n), l: s.l ? pick(s.l) : new Float32Array(n).fill(1), r1, r2 };
}

// ---------- type ----------
const textCache = new Map();
// n points filling `text` set in `font` (a CSS font without its size, e.g. '900 Unbounded'). u, v run over the ink box.
export function textSample(text, n, font, seed = 3) {
  const key = `${text}|${n}|${font}|${seed}`;
  if (textCache.has(key)) return textCache.get(key);
  const px = 300, probe = mk(8, 8).getContext('2d');
  probe.font = `${font.replace(/^(\d+)/, '$1 ' + px + 'px')}, ui-sans-serif, system-ui, sans-serif`;
  const m = probe.measureText(text);
  const left = Math.ceil(m.actualBoundingBoxLeft || 0), w = Math.max(8, Math.ceil(left + (m.actualBoundingBoxRight || m.width))) + 4;
  const asc = Math.ceil(m.actualBoundingBoxAscent || px * 0.75), h = Math.max(8, asc + Math.ceil(m.actualBoundingBoxDescent || 0)) + 4;
  const c = mk(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.font = probe.font; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.fillText(text, left + 2, asc + 2);
  const d = g.getImageData(0, 0, w, h).data, N = w * h, wt = new Float32Array(N);
  let total = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, a = d[i * 4 + 3] / 255;
    if (!a) continue;
    const edge = a < 1 || d[(i - 1) * 4 + 3] < 255 || d[(i + 1) * 4 + 3] < 255 || d[(i - w) * 4 + 3] < 255 || d[(i + w) * 4 + 3] < 255 || d[(i - 2) * 4 + 3] < 255 || d[(i + 2) * 4 + 3] < 255;
    wt[i] = a * (edge ? 2.6 : 1); total += wt[i];
  }
  const r = rng(seed * 31 + n), u = new Float32Array(n), v = new Float32Array(n);
  let i = 0, cum = wt[0];
  for (let j = 0; j < n; j++) {
    const target = ((j + r()) / n) * total;
    while (cum < target && i < N - 1) cum += wt[++i];
    u[j] = ((i % w) + r()) / w; v[j] = (((i / w) | 0) + r()) / h;
  }
  const s = { ...inOrder({ n, u, v }, seed), aspect: w / h };
  textCache.set(key, s);
  return s;
}

// ---------- on the canvas ----------
// a bust sample in rect {x, y, w, h}. acid: the share of points that take the signal colour (the tier's charge).
export function placeBust(s, rect, { acid = 0.06, gain = 1, tint = PAPER, signal = ACID, depth = 1 } = {}) {
  const n = s.n, pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rect.x + s.u[i] * rect.w; pos[i * 3 + 1] = rect.y + s.v[i] * rect.h; pos[i * 3 + 2] = s.z[i] * rect.w * depth;
    const hot = s.r1[i] < acid, b = gain * (hot ? 0.7 + 0.3 * s.r2[i] : (0.42 + 0.58 * s.r2[i]) * (0.55 + 0.45 * s.l[i])), k = hot ? signal : tint;
    col[i * 4] = k[0] * b; col[i * 4 + 1] = k[1] * b; col[i * 4 + 2] = k[2] * b; col[i * 4 + 3] = hot ? 1.25 : 0.72 + 0.56 * s.r2[i];
  }
  return { pos, col, n };
}
// a text sample with its ink box at {x, y, h}: x is the left edge, or the centre / right edge with align
export function placeText(s, { x, y, h, align = 'left' }, { acid = 0.1, gain = 1, tint = PAPER, signal = ACID, size = 1 } = {}) {
  const n = s.n, w = h * s.aspect, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x0 + s.u[i] * w; pos[i * 3 + 1] = y + s.v[i] * h; pos[i * 3 + 2] = 0;
    const hot = s.r1[i] < acid, b = gain * (hot ? 0.75 + 0.25 * s.r2[i] : 0.4 + 0.6 * s.r2[i]), k = hot ? signal : tint;
    col[i * 4] = k[0] * b; col[i * 4 + 1] = k[1] * b; col[i * 4 + 2] = k[2] * b; col[i * 4 + 3] = size * (hot ? 1.2 : 0.7 + 0.5 * s.r2[i]);
  }
  return { pos, col, n, w };
}
// loose points: at(i, r) → [x, y, z, brightness, hot (0–1 chance of the signal colour)]. Sorted into reading order.
export function dust(n, at, { seed = 11, tint = PAPER, signal = ACID, size = 0.8 } = {}) {
  const r = rng(seed * 613 + n), raw = [];
  for (let i = 0; i < n; i++) raw.push(at(i, r));
  raw.sort((a, b) => a[1] - b[1]);
  for (let b = 0; b < BANDS; b++) { const a = Math.floor((b * n) / BANDS), e = Math.floor(((b + 1) * n) / BANDS); const part = raw.slice(a, e).sort((p, q) => p[0] - q[0]); for (let k = 0; k < part.length; k++) raw[a + k] = part[k]; }
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [x, y, z, b, hot] = raw[i], k = r() < (hot || 0) ? signal : tint;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z || 0;
    col[i * 4] = k[0] * b; col[i * 4 + 1] = k[1] * b; col[i * 4 + 2] = k[2] * b; col[i * 4 + 3] = size * (0.6 + 0.7 * r());
  }
  return { pos, col, n };
}
// Join formations into one of exactly their total size, interleaved: each part takes every k-th point, so against any
// other formation of the same size a part is an even thinning of it (a number that keeps a share of its points keeps
// its whole shape, only sparser).
export function compose(parts) {
  const N = parts.reduce((a, p) => a + p.n, 0), pos = new Float32Array(N * 3), col = new Float32Array(N * 4);
  const acc = parts.map(() => 0), at = parts.map(() => 0);
  for (let i = 0; i < N; i++) {
    let best = -1, bv = -Infinity;
    for (let k = 0; k < parts.length; k++) { if (at[k] >= parts[k].n) continue; acc[k] += parts[k].n / N; if (acc[k] > bv) { bv = acc[k]; best = k; } }
    acc[best] -= 1;
    const j = at[best]++, P = parts[best];
    pos[i * 3] = P.pos[j * 3]; pos[i * 3 + 1] = P.pos[j * 3 + 1]; pos[i * 3 + 2] = P.pos[j * 3 + 2];
    col[i * 4] = P.col[j * 4]; col[i * 4 + 1] = P.col[j * 4 + 1]; col[i * 4 + 2] = P.col[j * 4 + 2]; col[i * 4 + 3] = P.col[j * 4 + 3];
  }
  return { pos, col, n: N };
}
// split n into shares that add up to n exactly
export function shares(n, parts) {
  const sum = parts.reduce((a, b) => a + b, 0), out = parts.map((p) => Math.floor((n * p) / sum));
  out[0] += n - out.reduce((a, b) => a + b, 0);
  return out;
}
