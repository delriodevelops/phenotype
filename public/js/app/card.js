// The shareable result, drawn on a canvas: what you see is exactly the image (or the video) that is shared.
// Two formats: 'story' 1080×1920 (Instagram / TikTok) and 'x' 1200×675 (X feed, 16:9, never cropped).
//
// Every card is a scene: { W, H, ms, enter, again, frame(ctx, t) }. frame() paints the reveal at progress t ∈ [0, 1];
// t = 1 is the still that gets shared, t = 0 → 1 over `ms` is the video, `enter` is where the first play on screen
// starts (the stage has already turned the photo into points by then) and `again` where a short replay starts
// (a format or censor switch: straight to the verdict).
// The analysis is one cloud of points (points.js, sample.js), and every reveal is made of what was measured on the
// faces in it, so no two play alike:
//   the card      the scan line turns the photo into points; the measures that say most about this face are taken on
//                 it one by one, each drawn where it was taken; the points become everyone, tier by tier, and a front
//                 crosses them up to this face's place; they form the PSL number, and a second scan gives the face back
//   the versus    both faces as points, then trait by trait: the part of the face in play lights on both, the two
//                 notes count and one side takes it; then the two PSL climb together and the verdict lands
//   the tier list the faces as points, worst first, each flying to the row it earned; the best one goes last
// A face at rest is always the photograph it is, cut from its background, with nothing over it. What stays as points
// on a card is what the analysis made: the number and the pour from the collar into it.
// Type, rules and the call to action are drawn over it. Without WebGL2 a scene shows a monochrome of the face where
// the points would be, and plain type.
import { placeBust, placeText, textSample, dust, compose, concat, crowd, shares } from './sample.js';
import { TIER_CUTS, tierNames } from './score.js';
import { IDEALS } from './face.js';
import { closeness } from './breakdown.js';

export const SIZES = { story: [1080, 1920], x: [1200, 675] };
const C = { ink: '#05070a', paper: '#d7dde5', acid: '#c6ff3d', red: '#ff3b2f', dim: 'rgba(215,221,229,.55)', faint: 'rgba(215,221,229,.3)', line: 'rgba(215,221,229,.16)' };
const F = { d: 'Unbounded', s: 'Geist', m: '"JetBrains Mono"' };
export const SITE = location.host || 'phenotype';
// where a face sits on the 9:16 canvas before anything is known about it: alone, or two facing off. The stage
// (stage.js) shows faces in these same places, so a reveal starts from what is already on screen.
export const HERO = { x: 110, y: 250, w: 860, h: 1204 };
export const PAIR = [{ x: -70, y: 215, w: 680, h: 952 }, { x: 470, y: 215, w: 680, h: 952 }]; // two faces: a split screen, a half each
export const COLLAR = 0.86; // on a card the photo ends here (a share of the crop's height): chin in, collar out
export const NEUTRAL = 0.06; // the share of lit points before a face has a tier
// where n faces wait on a canvas: one alone, two as a split screen (a half each), three or more as a wall
export function wall(n, fmt = 'story') {
  const story = fmt === 'story', [W, H] = SIZES[fmt];
  if (story && n === 1) return [{ rect: HERO }];
  if (story && n === 2) return PAIR.map((rect, i) => ({ rect, x0: i ? 540 : -1e9, x1: i ? 1e9 : 540 }));
  const gap = story ? 18 : 12, aw = story ? 1000 : 1100, ah = story ? 1500 : 540, top = story ? 230 : 96;
  let best = { w: 0, cols: 1, rows: n };
  for (let cols = 1; cols <= n; cols++) { // the grid that leaves the faces largest
    const rows = Math.ceil(n / cols), w = Math.min(story ? 430 : 400, (aw - gap * (cols - 1)) / cols, (ah - gap * (rows - 1)) / rows / 1.4);
    if (w > best.w + 0.5) best = { w, cols, rows };
  }
  const { w, cols, rows } = best, h = w * 1.4, x0 = (W - cols * w - gap * (cols - 1)) / 2;
  const y0 = story ? Math.max(top, (H - rows * h - gap * (rows - 1)) / 2 - 60) : top + (ah - rows * h - gap * (rows - 1)) / 2;
  return Array.from({ length: n }, (_, i) => ({ rect: { x: x0 + (i % cols) * (w + gap), y: y0 + Math.floor(i / cols) * (h + gap), w, h } }));
}
const NUM_FONT = '700 Unbounded';
// The second scan, where points give way to the photo: a clean front that follows a line. FRONT is how sharp it is;
// frontAt(y) is the mix at which that front stands on y (the delay maths of points.js, solved for the line).
const FRONT = 30, FRONT_NOISE = 0.04;
const frontAt = (y, H) => (0.5 + ((1 - FRONT_NOISE) * (y / H) + FRONT_NOISE * 0.5) * FRONT) / (1 + FRONT);
// a formation with some of its points switched off: off(x, y, i) → true
function lightsOut(f, off) {
  const col = f.col.slice();
  for (let i = 0; i < f.n; i++) if (off(f.pos[i * 3], f.pos[i * 3 + 1], i)) col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 0;
  return { pos: f.pos, col, n: f.n };
}
// ...or turned down: gain(x, y, i) → the share of its light a point keeps
function turnedDown(f, gain) {
  const col = f.col.slice();
  for (let i = 0; i < f.n; i++) { const k = gain(f.pos[i * 3], f.pos[i * 3 + 1], i); if (k !== 1) { col[i * 4] *= k; col[i * 4 + 1] *= k; col[i * 4 + 2] *= k; } }
  return { pos: f.pos, col, n: f.n };
}
const noise = (i) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }; // one fixed random number per point

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const out = (x) => 1 - (1 - x) ** 3;
const io = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
const font = (w, px, fam) => `${w} ${px}px ${fam}, ui-sans-serif, system-ui, sans-serif`;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-/<>=';

export async function fontsReady() {
  try { await Promise.all([`500 64px ${F.d}`, `700 64px ${F.d}`, `900 64px ${F.d}`, `400 32px ${F.s}`, `500 32px ${F.m}`, `400 32px ${F.m}`].map((f) => document.fonts.load(f))); } catch {}
}

// ---------- what a number means ----------
export const tierIndex = (psl) => { const i = TIER_CUTS.findIndex((c) => psl < c); return i === -1 ? 6 : i; };
const charge = (psl) => { const c = clamp((psl - 3) / 4.5); return 0.03 + 0.24 * c * c; }; // the higher the tier, the more of the cloud is lit
const one = (v) => Math.min(v, 8).toFixed(1);
// percentile → the brag: "TOP 7 %" from the median up, "SUPERA AL 26 %" under it
export function topText(pct) {
  if (!Number.isFinite(pct)) return null;
  if (pct < 50) return ['SUPERA AL', `${Math.round(pct)} %`];
  const top = Math.max(0.1, 100 - pct);
  return ['TOP', `${top < 1 ? top.toFixed(1) : Math.round(top)} %`];
}
// how hard a versus was won, from the PSL gap
export function verdictOf(diff) {
  const d = Math.abs(diff);
  return d < 0.15 ? 'EMPATE TÉCNICO' : d < 0.5 ? 'POR LA MÍNIMA' : d < 1.5 ? 'MOGGED' : d < 2.5 ? 'MOG BRUTAL' : 'MOG HISTÓRICO';
}

// ---------- drawing helpers ----------
function decode(text, p, tick) { // letters settle from the left, the rest flicker (deterministic per frame)
  const n = Math.floor(text.length * p);
  return [...text].map((ch, i) => (i < n || ch === ' ' || ch === '-' || ch === '–' ? ch : GLYPHS[(i * 7 + tick * 13) % GLYPHS.length])).join('');
}
function tracked(ctx, text, x, y, sp, align = 'left') { // letter-spaced text (canvas letterSpacing is not everywhere yet)
  const chars = [...text], ws = chars.map((ch) => ctx.measureText(ch).width), w = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += ws[i] + sp; });
  return w;
}
function fit(ctx, text, maxW, px, weight, fam, min = 16) {
  let s = px; ctx.font = font(weight, s, fam);
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = font(weight, s, fam); }
  return s;
}
export function ground(ctx, W, H, cx = W / 2, cy = H * 0.42) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
  g.addColorStop(0, '#0e131b'); g.addColorStop(1, 'rgba(5,7,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the instrument's own marks: corner brackets and a tick at the middle of each edge
  const m = Math.round(Math.min(W, H) * 0.035), k = Math.round(Math.min(W, H) * 0.026);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath();
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { ctx.moveTo(x + dx * k, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * k); }
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, k * 0.6); ctx.moveTo(W / 2, H); ctx.lineTo(W / 2, H - k * 0.6);
  ctx.moveTo(0, H / 2); ctx.lineTo(k * 0.6, H / 2); ctx.moveTo(W, H / 2); ctx.lineTo(W - k * 0.6, H / 2);
  ctx.stroke();
}
function header(ctx, x0, x1, y, right, small = false, a = 1) {
  ctx.globalAlpha = a;
  ctx.fillStyle = C.paper; ctx.font = font(500, small ? 17 : 26, F.m); tracked(ctx, 'PHENOTYPE', x0, y, small ? 4 : 7);
  ctx.fillStyle = C.dim; ctx.font = font(400, small ? 14 : 21, F.m); tracked(ctx, right, x1, y, small ? 1.2 : 2, 'right');
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}
// the seven tiers as a strip, yours lit: the scale explained to anyone who has never heard of PSL
function ladder(ctx, x, y, w, h, names, at, a = 1) {
  const gap = h > 34 ? 5 : 3, cw = (w - gap * 6) / 7, px = h > 34 ? 17 : 11.5;
  ctx.font = font(500, px, F.m); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  names.forEach((nm, i) => {
    const cx = x + i * (cw + gap);
    ctx.globalAlpha = a * (i === at ? 1 : i < at ? 0.5 : 0.3);
    if (i === at) { ctx.fillStyle = C.acid; ctx.fillRect(cx, y, cw, h); ctx.fillStyle = C.ink; } else { ctx.strokeStyle = C.paper; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.75, y + 0.75, cw - 1.5, h - 1.5); ctx.fillStyle = C.paper; }
    ctx.fillText(nm.toUpperCase(), cx + cw / 2, y + h / 2 + 1);
  });
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// the call to action: the one solid block of signal colour on the card
function ctaBar(ctx, x, y, w, h, a = 1, ask = '¿Y TÚ?') {
  if (a <= 0) return;
  ctx.globalAlpha = a; ctx.fillStyle = C.acid; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const pad = h * 0.42;
  ctx.font = font(900, Math.round(h * 0.44), F.d); ctx.fillText(ask, x + pad, y + h / 2 + 1);
  const used = ctx.measureText(ask).width + pad * 3, url = `→ ${SITE}`;
  fit(ctx, url, w - used, Math.round(h * 0.42), 500, F.m, 10);
  ctx.textAlign = 'right'; ctx.fillText(url, x + w - pad, y + h / 2 + 1);
  ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// under the call to action, in the band a story's own interface covers: nothing that has to be read
function smallPrint(ctx, W, a) {
  if (a <= 0) return;
  ctx.globalAlpha = a * 0.6; ctx.fillStyle = C.dim; ctx.font = font(400, 19, F.m);
  tracked(ctx, 'ESTIMACIÓN CON IA · SE MIDE EN EL NAVEGADOR · LA FOTO NO SE SUBE', W / 2, 1752, 1.5, 'center');
  ctx.globalAlpha = 1;
}
export function scanLine(ctx, x, y, w, a = 1) {
  if (a <= 0) return;
  ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(0, y, 0, y + 110);
  g.addColorStop(0, 'rgba(198,255,61,.22)'); g.addColorStop(1, 'rgba(198,255,61,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, 110);
  ctx.fillStyle = C.acid; ctx.fillRect(x - 16, y - 1.5, w + 32, 3);
  ctx.globalAlpha = 1;
}
// A face as the photograph it is — the cut-out, nothing behind it — in rect r, on one side of the scan line:
// { top } keeps what is under that y, { bottom } what is above it; x0 / x1 keep it to a column (two faces sharing
// the canvas). There is no frame: the ground of the instrument is the background.
export function photoIn(ctx, img, r, { top = -1e9, bottom = 1e9, x0 = -1e9, x1 = 1e9, alpha = 1 } = {}) {
  const fx = Math.max(r.x, x0), fw = Math.min(r.x + r.w, x1) - fx, ay = Math.max(r.y, top), by = Math.min(r.y + r.h, bottom);
  if (alpha <= 0 || fw <= 0 || by <= ay) return;
  ctx.save(); ctx.beginPath(); ctx.rect(fx, ay, fw, by - ay); ctx.clip();
  ctx.globalAlpha = alpha; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, r.x, r.y, r.w, r.h);
  ctx.restore();
}
// A cut-out with part of it taken away, in its own alpha (nothing is ever painted over the ground to hide a face):
//   sink: [from, to]  it fades out downwards between these shares of its height, and is gone under `to`
//   wear: [side, reach]  it is worn away from its left (-1) or right (1) edge, over this share of its width
function shaped(cut, { sink = null, wear = null } = {}) {
  const c = document.createElement('canvas'); c.width = cut.width; c.height = cut.height;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.drawImage(cut, 0, 0); g.globalCompositeOperation = 'destination-out';
  if (sink) { const k = g.createLinearGradient(0, sink[0] * h, 0, sink[1] * h); k.addColorStop(0, 'rgba(0,0,0,0)'); k.addColorStop(1, '#000'); g.fillStyle = k; g.fillRect(0, sink[0] * h, w, h - sink[0] * h); }
  if (wear) { const [side, reach] = wear, x0 = side > 0 ? w * (1 - reach) : w * reach, x1 = side > 0 ? w : 0, k = g.createLinearGradient(x0, 0, x1, 0); k.addColorStop(0, 'rgba(0,0,0,0)'); k.addColorStop(0.7, 'rgba(0,0,0,.92)'); k.addColorStop(1, '#000'); g.fillStyle = k; g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h); }
  return c;
}
// A winner's mark: the silhouette of a picture as a soft halo of the signal colour, drawn before the picture.
// glowOf() makes it once (only the shadow of the picture is drawn, by throwing the picture itself off the canvas);
// pad is the room the halo has on every side, in the picture's own pixels.
function glowOf(img) {
  const pad = Math.round(img.width * 0.14), c = document.createElement('canvas'); c.width = img.width + pad * 2; c.height = img.height + pad * 2;
  const g = c.getContext('2d');
  g.shadowColor = C.acid; g.shadowBlur = pad * 0.55; g.shadowOffsetX = c.width * 2;
  g.drawImage(img, pad - c.width * 2, pad);
  return { canvas: c, pad, of: img.width };
}
function halo(ctx, G, r, { bottom = 1e9, a = 1 } = {}) {
  const p = (G.pad * r.w) / G.of;
  if (a <= 0 || bottom <= r.y - p) return;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x - p, r.y - p, r.w + p * 2, Math.min(r.h + p * 2, bottom - (r.y - p))); ctx.clip();
  ctx.globalAlpha = a; ctx.drawImage(G.canvas, r.x - p, r.y - p, r.w + p * 2, r.h + p * 2);
  ctx.restore();
}
export function ghost(ctx, an, r, a) {
  if (a <= 0.004) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(an.ghost, r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
export function cloud(ctx, field, W, H, o) {
  if (!field || !field.draw({ w: W, h: H, ...o })) return false;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.drawImage(field.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}
// a measure pinned to the place on the face it was taken from; sub: a third line (its ideal)
function callout(ctx, from, x, label, value, ok, a, sub = '') {
  if (a <= 0) return;
  const right = x > from.x;
  ctx.globalAlpha = a * 0.9; ctx.strokeStyle = C.faint; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(from.x + (right ? 10 : -10), from.y); ctx.lineTo(x, from.y); ctx.stroke();
  ctx.fillStyle = C.acid; ctx.fillRect(from.x - 4, from.y - 4, 8, 8);
  ctx.globalAlpha = a; ctx.textAlign = right ? 'right' : 'left';
  ctx.fillStyle = C.dim; ctx.font = font(500, 18, F.m); ctx.fillText(label, x, from.y - 14);
  ctx.fillStyle = ok ? C.acid : C.paper; ctx.font = font(500, 30, F.m); ctx.fillText(value, x, from.y + 36);
  if (sub) { ctx.globalAlpha = a * 0.85; ctx.fillStyle = ok ? C.acid : C.dim; ctx.font = font(500, 15, F.m); ctx.fillText(sub, x, from.y + 60); }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ---------- a measure, drawn where it was taken ----------
// Each measure of face.js as the lines it is made of, between the landmarks it was read from (P(i): landmark i in
// the crop, 0–1). The first `main` lines are the measure itself; the others are what it is compared with.
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const ext = (a, b, k) => [{ x: a.x - (b.x - a.x) * k, y: a.y - (b.y - a.y) * k }, { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }];
const GAUGES = {
  canthal_tilt_deg: { label: 'Canthal', main: 2, lines: (P) => [ext(P(133), P(33), 0.45), ext(P(362), P(263), 0.45), [P(133), { x: P(33).x, y: P(133).y }], [P(362), { x: P(263).x, y: P(362).y }]] },
  fwhr: { label: 'FWHR', lines: (P) => [[{ x: P(234).x, y: P(9).y }, { x: P(454).x, y: P(9).y }, { x: P(454).x, y: P(0).y }, { x: P(234).x, y: P(0).y }, { x: P(234).x, y: P(9).y }]] },
  esr: { label: 'ESR', lines: (P) => [[P(468), P(473)], [P(234), P(454)]] },
  midface_ratio: { label: 'Midface', main: 2, lines: (P) => { const m = mid(P(468), P(473)); return [[P(468), P(473)], [m, { x: m.x, y: P(0).y }]]; } },
  jaw_ratio: { label: 'Mandíbula', lines: (P) => [[P(172), P(397)], [P(234), P(454)]] },
  chin_philtrum: { label: 'Mentón', lines: (P) => [[P(17), P(152)], [P(2), P(0)]] },
  nose_ratio: { label: 'Nariz', lines: (P) => [[P(129), P(358)], [P(133), P(362)]] },
  lip_ratio: { label: 'Labios', main: 3, lines: (P) => [[P(0), P(13)], [P(14), P(17)], [P(61), P(291)]] },
  third_lower: { label: 'Tercio inf.', lines: (P) => [[P(2), P(152)], [{ x: P(172).x, y: P(2).y }, { x: P(397).x, y: P(2).y }], [{ x: P(172).x, y: P(152).y }, { x: P(397).x, y: P(152).y }]] },
  symmetry: { label: 'Simetría', lines: (P) => [[P(10), P(152)], [P(33), P(263)], [P(61), P(291)], [P(172), P(397)]] },
};
function gaugeOf(lm, key) {
  const G = GAUGES[key];
  if (!G || !lm || !lm[473]) return null;
  const lines = G.lines((i) => lm[i]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const l of lines) for (const p of l) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { label: G.label, main: G.main || 1, lines, x0, y0, x1, y1, y: (y0 + y1) / 2 };
}
// the outline of the face, and where it stands at a height on one side: a pin sits on the edge, never on the face
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
function edge(lm, y, side, r) {
  let lo = 1e9, hi = -1e9, a0 = 1e9, a1 = -1e9;
  for (const i of OVAL) { a0 = Math.min(a0, lm[i].y); a1 = Math.max(a1, lm[i].y); }
  y = clamp(y, a0 + 0.004, a1 - 0.004);
  for (let k = 0; k < OVAL.length; k++) {
    const a = lm[OVAL[k]], b = lm[OVAL[(k + 1) % OVAL.length]];
    if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
    const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x); lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return { x: r.x + (side === 'r' ? hi : lo) * r.w, y: r.y + y * r.h };
}
const fmtMeasure = (k, v) => (k === 'canthal_tilt_deg' ? `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${Math.abs(v).toFixed(1)}°` : k === 'symmetry' ? `${Math.round(v)}` : k === 'third_lower' ? `${v.toFixed(0)} %` : v.toFixed(2));
const idealText = (k) => { const i = IDEALS[k]; return i.hi >= i.max ? `${i.lo}+` : `${i.lo}–${i.hi}${i.unit === '°' ? '°' : i.unit === '%' ? ' %' : ''}`; };
// The measures a card shows, chosen for this face: the one closest to its ideal, the one furthest from it, then the
// next closest; never two at the same height (their readouts would sit on each other). Top to bottom, alternating
// margins. lm: the landmarks of the crop · m: the metrics of face.js
export function pickMeasures(lm, m = {}, n = 3) {
  const all = Object.keys(GAUGES).map((key) => ({ key, v: m[key], c: closeness(key, m[key]), g: gaugeOf(lm, key) })).filter((x) => x.c != null && x.g).sort((a, b) => b.c - a.c);
  if (!all.length) return [];
  const got = [];
  for (const x of [all[0], all[all.length - 1], ...all.slice(1, -1)]) if (got.length < n && !got.includes(x) && got.every((o) => Math.abs(o.g.y - x.g.y) > 0.075)) got.push(x);
  got.sort((a, b) => a.g.y - b.g.y);
  return got.map((x, i) => ({ key: x.key, v: x.v, ok: x.v >= IDEALS[x.key].lo && x.v <= IDEALS[x.key].hi, side: i % 2 ? 'r' : 'l' }));
}
// the lines of a measure over a face in rect r, drawn in over p
function gauge(ctx, g, r, p, a) {
  if (a <= 0 || p <= 0) return;
  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  g.lines.forEach((l, k) => {
    const q = seg(p, k * 0.14, 0.6 + k * 0.14);
    if (q <= 0) return;
    const pts = l.map((v) => ({ x: r.x + v.x * r.w, y: r.y + v.y * r.h })), main = k < g.main;
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let left = total * out(q), end = pts[0];
    ctx.beginPath(); ctx.moveTo(end.x, end.y);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 1, f = Math.min(1, left / d);
      end = { x: lerp(pts[i - 1].x, pts[i].x, f), y: lerp(pts[i - 1].y, pts[i].y, f) }; ctx.lineTo(end.x, end.y); left -= d;
    }
    ctx.globalAlpha = a * 0.55; ctx.strokeStyle = C.ink; ctx.lineWidth = main ? 7 : 5; ctx.stroke(); // a dark edge: it reads over the points
    ctx.globalAlpha = a * (main ? 1 : 0.7); ctx.strokeStyle = main ? C.acid : C.paper; ctx.lineWidth = main ? 3 : 1.5; ctx.stroke();
    const e = main ? 4 : 2.5; ctx.fillStyle = main ? C.acid : C.paper;
    ctx.fillRect(pts[0].x - e, pts[0].y - e, e * 2, e * 2); ctx.fillRect(end.x - e, end.y - e, e * 2, e * 2);
  });
  ctx.restore();
}
// the part of the cloud a measure is read from
const gaugeFocus = (g, r, k) => ({ x: r.x + ((g.x0 + g.x1) / 2) * r.w, y: r.y + ((g.y0 + g.y1) / 2) * r.h, rx: Math.max(((g.x1 - g.x0) / 2) * 1.35, 0.09) * r.w, ry: Math.max(((g.y1 - g.y0) / 2) * 1.6, 0.06) * r.h, k });
// ...and the part of a face a trait of breakdown.js speaks of
const ZONES = { ojos: [33, 133, 362, 263, 159, 145, 386, 374], pomulos: [234, 454, 116, 345], mandibula: [172, 397, 152, 136, 365], nariz: [1, 2, 129, 358, 168], labios: [61, 291, 0, 17], simetria: [10, 152, 168], piel: [10, 152, 234, 454], masculinidad: [70, 300, 172, 397, 152] };
function zone(lm, key, r, k) {
  if (!lm) return { x: r.x + r.w / 2, y: r.y + r.h * 0.48, rx: r.w * 0.3, ry: r.h * 0.3, k };
  if (key === 'pelo') return { x: r.x + lm[10].x * r.w, y: r.y + (lm[10].y - 0.07) * r.h, rx: r.w * 0.36, ry: r.h * 0.15, k };
  if (key === 'fisico') return { x: r.x + lm[152].x * r.w, y: r.y + (lm[152].y + 0.09) * r.h, rx: r.w * 0.44, ry: r.h * 0.14, k };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const i of ZONES[key] || ZONES.piel) { x0 = Math.min(x0, lm[i].x); x1 = Math.max(x1, lm[i].x); y0 = Math.min(y0, lm[i].y); y1 = Math.max(y1, lm[i].y); }
  return { x: r.x + ((x0 + x1) / 2) * r.w, y: r.y + ((y0 + y1) / 2) * r.h, rx: Math.max(((x1 - x0) / 2) * 1.3, 0.07) * r.w, ry: Math.max(((y1 - y0) / 2) * 1.45, 0.05) * r.h, k };
}
// Everyone, by tier: of every hundred faces, how many fall in each (the scale's own bands, score.js)
const CROWD = [20, 30, 25, 18, 6, 0.9, 0.1], EDGES = [1, ...TIER_CUTS, 8];
// a PSL as a place along the seven equal cells of the ladder (0–1)
const along = (psl) => { const v = clamp(psl, 1, 8); let i = 0; while (i < 6 && v >= EDGES[i + 1]) i++; return (i + (v - EDGES[i]) / (EDGES[i + 1] - EDGES[i])) / 7; };

// ---------- the single card ----------
// d: { bust (sample.js analyse), psl, tier, sex, percentile, smv?, stats: pickMeasures(), id }
// photo → (scan) points → this face's measures, taken on it → everyone by tier, and a front that stops where this
// face falls → the number → the card, where a second scan gives the face back as the photo it is: real from the hair
// to the chin, and from the collar down still the points that pour into the number.
export function cardScene(field, fmt, d) {
  const [W, H] = SIZES[fmt], story = fmt === 'story', an = d.bust, N = field ? field.max : 0;
  const num = one(d.psl), names = tierNames(d.sex), ti = tierIndex(d.psl), tier = d.tier.toUpperCase();
  const L = story
    ? { pad: 72, hero: HERO, bust: { x: 150, y: 168, w: 780, h: 1092 }, big: { cx: W / 2, cy: 800, h: 430, maxW: 940 }, num: { x: 72, y: 1288, h: 228 }, tierY: 1250, tierMax: 168, tierW: 936, lad: { x: 72, y: 1552, w: 936, h: 46 }, cta: { x: 72, y: 1612, w: 936, h: 58 }, headY: 118,
      pop: { x0: 72, x1: 1008, base: 1200, h: 560, lad: 46 }, pin: [44, W - 44] }
    : { pad: 44, hero: { x: 371, y: 18, w: 457, h: 640 }, bust: { x: 34, y: 18, w: 457, h: 640 }, big: { cx: W / 2, cy: 300, h: 300, maxW: 1040 }, num: { x: 540, y: 250, h: 178 }, tierY: 212, tierMax: 96, tierW: 616, lad: { x: 540, y: 484, w: 616, h: 34 }, cta: { x: 540, y: 572, w: 616, h: 52 }, headY: 46,
      pop: { x0: 150, x1: 1050, base: 500, h: 270, lad: 30 }, pin: [200, W - 200] };
  const text = field ? textSample(num, N, NUM_FONT) : null;
  const aspect = text ? text.aspect : 2.75; // without the field the number is plain type: about this wide
  const bigH = Math.min(L.big.h, L.big.maxW / aspect), bigY = L.big.cy - bigH / 2, numW = L.num.h * aspect;
  // on the card the photo ends at the collar (COLLAR of the crop's height): under that line the face stays points
  const stopY = L.bust.y + L.bust.h * COLLAR, fadeY = L.bust.y + L.bust.h * (COLLAR - 0.07);
  // this face's measures, each with the lines it is made of
  const meas = (d.stats || []).map((st) => ({ ...st, g: gaugeOf(an.lm, st.key) })).filter((st) => st.g)
    .map((st) => ({ ...st, label: st.g.label.toUpperCase(), value: fmtMeasure(st.key, st.v), sub: st.ok ? 'EN SU IDEAL' : `IDEAL ${idealText(st.key)}` }));
  // how far the next tier is
  const gap = ti < 6 ? TIER_CUTS[ti] - d.psl : 0;
  const next = ti === 6 ? 'TECHO DE LA ESCALA' : gap < 0.05 ? `AL BORDE DE ${names[ti + 1].toUpperCase()}` : `A ${gap.toFixed(1)} DE ${names[ti + 1].toUpperCase()}`;
  if (field) {
    const acid = charge(d.psl), [n1, n2, n3] = shares(N, [62, 27, 11]);
    field.put(0, placeBust(an.sample(N), L.hero, { acid: NEUTRAL }));
    field.put(1, crowd(N, CROWD, L.pop));
    field.put(2, placeText(text, { x: L.big.cx, y: bigY, h: bigH, align: 'center' }, { acid: acid + 0.05, gain: 0.82 }));
    // what stays of the face pours down into the number
    const fall = dust(n3, (i, r) => {
      const k = r() ** 0.7, x = lerp(L.bust.x + L.bust.w * (0.3 + 0.4 * r()), L.num.x + numW * r(), k) + (r() - 0.5) * 120 * Math.sin(Math.PI * k);
      const y = lerp(stopY, L.num.y + L.num.h * 0.2, k);
      return [x, y + (r() - 0.5) * 30, 0, 0.25 + 0.5 * r(), 0.35];
    }, { size: 0.75 });
    // on the card the face's points under the collar are quieter: they are what is left of it, not a second subject
    const face = turnedDown(placeBust(an.sample(n1), L.bust, { acid }), (x, y) => 1 - 0.5 * clamp((y - fadeY) / (stopY - fadeY)));
    const small = placeText(textSample(num, n2, NUM_FONT), { x: L.num.x, y: L.num.y, h: L.num.h }, { acid: acid + 0.06, gain: 0.95, size: 0.9 });
    field.put(3, compose([face, small, fall]));
    // the same card with the face's points out down to the collar: a ragged edge, not a line
    field.put(4, compose([lightsOut(face, (x, y, i) => y < stopY - L.bust.h * 0.03 + (noise(i) - 0.5) * L.bust.h * 0.07), small, fall]));
  }
  const onCard = shaped(an.cut, { sink: [COLLAR - 0.07, COLLAR] }); // the face as it stands on the card: gone under the collar
  // the clock, in seconds: acquire · measure · everyone · the front crosses · it stops · the number · the card · the photo
  const MD = 0.66, tM = 0.9, tB = tM + (meas.length ? meas.length * MD + 0.12 : 0.8), tG = tB + 0.7, tH = tG + 1.3, tN = tH + 0.3, tV = tN + 0.5, tC = tV + 0.85, tS = tC + 1.05, tE = tS + 0.75, T = tE + 0.75;
  const size = story ? 3 : 2.3, P = L.pop, popTop = P.base - P.h;
  const pinAt = (st, r) => edge(an.lm, st.g.y, st.side, r), pinX = (st) => L.pin[st.side === 'r' ? 1 : 0];
  return {
    W, H, ms: T * 1000, enter: tM / T, again: tC / T,
    frame(ctx, t) {
      const s = t * T, tick = Math.floor(s * 16);
      const p0 = seg(s, 0, tM), pB = seg(s, tB, tG), pG = seg(s, tG, tH), pN = seg(s, tN, tV), p4 = seg(s, tC, tS), p5 = seg(s, tS, tE), p6 = seg(s, tS + 0.4, T - 0.1);
      ground(ctx, W, H, W / 2, story ? H * 0.42 : H * 0.5);
      const cutY = L.hero.y + L.hero.h * io(p0);
      // the photo as it came, eaten from the top by the scan line
      photoIn(ctx, an.cut, L.hero, { top: cutY, alpha: 1 - seg(s, tM - 0.1, tM + 0.05) });
      // the front over everyone: where it stands, and the PSL it stands on
      const now = 1 + (d.psl - 1) * (1 - (1 - pG) ** 3), gx = lerp(P.x0, P.x1, along(now));
      // the measure being taken
      const mi = s >= tM + 0.06 && s < tB && meas.length ? Math.min(meas.length - 1, Math.floor((s - tM - 0.06) / MD)) : -1;
      const mq = mi < 0 ? 0 : clamp((s - tM - 0.06 - mi * MD) / MD), lit = seg(mq, 0, 0.18) * (1 - seg(mq, 0.82, 1));
      let drawn = false;
      if (s < tB) {
        if (p0 > 0) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, cutY); ctx.clip(); ghost(ctx, an, L.hero, field ? 0.16 : 0.95); ctx.restore(); }
        drawn = cloud(ctx, field, W, H, {
          from: 0, time: s, drift: 1.1 * seg(s, tM, tM + 0.4), size, gain: 0.78,
          scan: p0 < 1 ? { y: cutY, cut: 1, width: 34, strength: 1 } : null,
          focus: mi >= 0 ? [gaugeFocus(meas[mi].g, L.hero, lit)] : null, focusDim: 0.5 * lit,
        });
        scanLine(ctx, L.hero.x, cutY, L.hero.w, p0 < 1 ? 1 : 0);
      } else if (s < tN) {
        ghost(ctx, an, L.hero, (field ? 0.16 : 0.95) * (1 - seg(pB, 0, field ? 0.35 : 1)));
        drawn = cloud(ctx, field, W, H, {
          from: 0, to: 1, mix: io(pB), delay: 0.8, sweep: 0.5, sweepDir: [0, 1], spread: 80, arc: 0.2, time: s, drift: 0.9, size: size * 0.9,
          gain: 0.66 + 0.5 * Math.exp(-(s - tH) * 8) * (s >= tH ? 1 : 0), gate: { x: gx, width: story ? 22 : 16, dim: 0.16, k: seg(pB, 0.45, 1) },
        });
      } else if (s < tC) {
        drawn = cloud(ctx, field, W, H, {
          from: 1, to: 2, mix: io(pN), delay: 0.6, sweep: 0.3, sweepDir: [0, -1], spread: 90, arc: 0.18, time: s, drift: 1.2 * (1 - pN), size,
          gain: lerp(0.66, 0.78, pN) + 0.9 * Math.exp(-(s - tV) * 7) * (s >= tV ? 1 : 0), gate: { x: gx, width: story ? 22 : 16, dim: lerp(0.16, 1, seg(pN, 0, 0.5)), k: 1 - seg(pN, 0, 0.5) },
        });
      } else if (s < tS) {
        ghost(ctx, an, L.bust, (field ? 0.16 : 0.95) * seg(p4, 0.55, 1));
        drawn = cloud(ctx, field, W, H, { from: 2, to: 3, mix: io(p4), delay: 0.7, sweep: 0.35, sweepDir: [0, -1], spread: 90, arc: 0.18, time: s, drift: 1.4 * (1 - p4) * seg(s, tV, tV + 0.3), size, gain: 0.78 });
      } else {
        // the second scan: above the line the face is the photo again, sinking into the ink at the collar
        const lineY = lerp(L.bust.y - 14, stopY, io(p5));
        photoIn(ctx, onCard, L.bust, { bottom: lineY });
        ctx.save(); ctx.beginPath(); ctx.rect(0, lineY, W, H - lineY); ctx.clip(); ghost(ctx, an, L.bust, field ? 0.16 : 0.95); ctx.restore();
        drawn = cloud(ctx, field, W, H, { from: 3, to: 4, mix: frontAt(lineY, H), delay: FRONT, sweep: 1, sweepDir: [0, 1], sweepNoise: FRONT_NOISE, spread: 0, arc: 0, time: s, size, gain: 0.78 });
        scanLine(ctx, L.bust.x, lineY, L.bust.w, p5 > 0 && p5 < 1 ? 1 : 0);
      }
      if (!drawn && s >= tN) { // no WebGL: the number in plain type
        ctx.fillStyle = C.paper; ctx.globalAlpha = s < tC ? io(pN) : 1;
        const big = 1 - io(p4), nh = lerp(L.num.h, bigH, big);
        ctx.font = font(700, nh / 0.72, F.d); ctx.textAlign = big > 0.5 ? 'center' : 'left';
        ctx.fillText(num, big > 0.5 ? L.big.cx : L.num.x, lerp(L.num.y + L.num.h, bigY + bigH, big));
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      }
      // ---- type over the cloud ----
      header(ctx, L.pad, W - L.pad, L.headY, `ESPÉCIMEN ${d.id}`, !story);
      // while it is being read: what the instrument is doing
      const busy = seg(s, 0.15, 0.5) * (1 - seg(s, tB - 0.15, tB + 0.05));
      if (busy > 0) {
        ctx.globalAlpha = busy; ctx.fillStyle = C.acid; ctx.font = font(500, story ? 24 : 16, F.m);
        const doing = p0 < 1 ? `ADQUIRIENDO · ${Math.round(478 * io(p0))} PUNTOS` : mi >= 0 ? `MIDIENDO · ${meas[mi].label} · ${mi + 1} / ${meas.length}` : 'MIDIENDO';
        tracked(ctx, doing, W / 2, story ? L.hero.y - 34 : H - 18, 2, 'center');
        ctx.globalAlpha = 1;
      }
      // the measures, taken one by one where they are read: the lines on the points, the readout in the margin
      if (s >= tM && s < tB + 0.3) {
        const leave = 1 - seg(s, tB - 0.1, tB + 0.22);
        meas.forEach((st, i) => {
          const w0 = tM + 0.06 + i * MD, q = seg(s, w0, w0 + MD);
          if (q <= 0) return;
          const done = seg(q, 0.6, 0.72), rest = lerp(1, 0.3, seg(s, w0 + MD, w0 + MD + 0.25));
          gauge(ctx, st.g, L.hero, seg(q, 0, 0.6), leave * rest);
          callout(ctx, pinAt(st, L.hero), pinX(st), st.label, fmtMeasure(st.key, st.v * out(seg(q, 0.12, 0.6))), st.ok && done > 0.5, seg(q, 0, 0.15) * leave, done > 0.5 ? st.sub : '');
        });
      }
      // everyone, by tier: the ladder under them, the front and the PSL it has reached
      const popA = seg(pB, 0.35, 0.9) * (1 - seg(pN, 0, 0.45));
      if (popA > 0) {
        const at = pG > 0 ? tierIndex(now) : -1, hit = s >= tH ? Math.exp(-(s - tH) * 9) : 0;
        if (!drawn) { // no WebGL: the silhouette of the pile, lit up to the front
          const hgt = (u) => CROWD.reduce((a, c, i) => a + c * Math.exp(-0.5 * ((u - i - 0.5) / 0.55) ** 2), 0) / 38;
          const pile = () => { ctx.beginPath(); ctx.moveTo(P.x0, P.base); for (let u = 0; u <= 7.001; u += 0.1) ctx.lineTo(lerp(P.x0, P.x1, u / 7), P.base - Math.min(1, hgt(u)) * P.h); ctx.lineTo(P.x1, P.base); ctx.closePath(); ctx.fill(); };
          ctx.fillStyle = C.paper; ctx.globalAlpha = popA * 0.12; pile();
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, gx, H); ctx.clip(); ctx.globalAlpha = popA * 0.5; pile(); ctx.restore();
        }
        ctx.globalAlpha = popA * 0.8; ctx.fillStyle = C.dim; ctx.font = font(500, story ? 22 : 14, F.m);
        tracked(ctx, `DE CADA CIEN ${d.sex === 'f' ? 'MUJERES' : 'HOMBRES'} · ESCALA PSL`, W / 2, popTop - (story ? 190 : 96), 3, 'center');
        ladder(ctx, P.x0, P.base + (story ? 22 : 12), P.x1 - P.x0, P.lad, names, at, popA);
        const k = seg(pB, 0.6, 1) * popA;
        if (k > 0) {
          const g = ctx.createLinearGradient(gx - (story ? 120 : 80), 0, gx, 0); g.addColorStop(0, 'rgba(198,255,61,0)'); g.addColorStop(1, 'rgba(198,255,61,.16)');
          ctx.globalAlpha = k; ctx.fillStyle = g; ctx.fillRect(gx - (story ? 120 : 80), popTop - 20, story ? 120 : 80, P.base - popTop + 20);
          ctx.fillStyle = C.acid; ctx.fillRect(gx - 1.5, popTop - (story ? 50 : 30), 3, P.base - popTop + (story ? 50 : 30) + (story ? 22 : 12));
          const px = (story ? 92 : 56) * (1 + 0.16 * hit), tx = clamp(gx, P.x0 + px * 1.1, P.x1 - px * 1.1);
          ctx.fillStyle = hit > 0.02 || s >= tH ? C.acid : C.paper; ctx.font = font(700, px, F.d); ctx.textAlign = 'center'; ctx.fillText(one(now), tx, popTop - (story ? 76 : 44));
          ctx.textAlign = 'left';
        }
        ctx.globalAlpha = 1;
      }
      // the verdict: PSL over the number, the tier under it; then the tier travels to its place on the card
      const tierP = seg(s, tV, tV + 0.6), move = io(p4);
      if (s >= tV - 0.05) {
        const ts = fit(ctx, tier, L.tierW, L.tierMax, 900, F.d, 28), tw = ctx.measureText(tier).width;
        const x = lerp(W / 2 - tw / 2, story ? L.pad : L.num.x, move), y = lerp(bigY + bigH + ts * 0.98 + (story ? 60 : 26), L.tierY, move);
        ctx.globalAlpha = seg(s, tV - 0.05, tV + 0.05); ctx.fillStyle = C.acid; ctx.font = font(900, ts, F.d); ctx.textAlign = 'left'; ctx.fillText(decode(tier, tierP, tick), x, y);
        const lab = seg(s, tV, tV + 0.25) * (1 - seg(p4, 0, 0.3));
        if (lab > 0) {
          ctx.globalAlpha = lab; ctx.fillStyle = C.dim; ctx.font = font(500, story ? 28 : 18, F.m); tracked(ctx, `PSL · ESCALA 1–8 · ${d.id}`, W / 2, bigY - (story ? 44 : 20), 3, 'center');
          // how far the next tier is: the number is this face's, and so is what it is short of
          ctx.globalAlpha = lab * seg(s, tV + 0.4, tV + 0.65); ctx.fillStyle = C.paper; ctx.font = font(500, story ? 26 : 17, F.m);
          tracked(ctx, next, W / 2, bigY + bigH + ts * 0.98 + (story ? 60 : 26) + (story ? 62 : 34), 3, 'center');
        }
        ctx.globalAlpha = 1;
      }
      // the card's own furniture
      const end = out(p6), endA = seg(s, tS + 0.4, tS + 1.0);
      if (endA > 0) {
        // beside the number: the brag, counting to its place
        const rx = story ? W - L.pad : L.num.x + L.tierW, ry = L.num.y, top = topText(lerp(50, d.percentile, out(seg(s, tS + 0.4, tS + 1.2))));
        ctx.globalAlpha = endA; ctx.textAlign = 'right';
        ctx.fillStyle = C.dim; ctx.font = font(500, story ? 22 : 15, F.m); ctx.fillText('PSL · 1–8', rx, ry + (story ? 26 : 16));
        if (top) {
          const room = rx - (L.num.x + numW) - (story ? 36 : 24);
          ctx.fillStyle = C.dim; ctx.font = font(500, story ? 22 : 15, F.m); ctx.fillText(top[0], rx, ry + L.num.h * (story ? 0.47 : 0.5));
          ctx.fillStyle = C.paper; fit(ctx, top[1], room, story ? 78 : 50, 700, F.d, 20); ctx.fillText(top[1], rx, ry + L.num.h * (story ? 0.85 : 0.9));
        }
        if (d.smv != null && story) { ctx.fillStyle = C.dim; ctx.font = font(500, 22, F.m); ctx.fillText(`SMV ${d.smv.toFixed(0)}`, rx, ry + L.num.h + 2); }
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
        // the measures taken at the start, back where they were read: on the edge of the face, never on it
        if (story) meas.forEach((st, i) => callout(ctx, pinAt(st, L.bust), pinX(st), st.label, st.value, st.ok, seg(s, tS + 0.45 + i * 0.14, tS + 0.85 + i * 0.14), st.sub));
        // the ladder lights up to this face's tier, a cell at a time
        ladder(ctx, L.lad.x, L.lad.y + (1 - end) * 16, L.lad.w, L.lad.h, names, Math.min(ti, Math.floor((ti + 1) * seg(s, tS + 0.45, tS + 1.05))), endA);
        ctaBar(ctx, L.cta.x, L.cta.y + (1 - end) * 22, L.cta.w, L.cta.h, endA);
        if (story) smallPrint(ctx, W, endA);
      }
    },
  };
}

// ---------- versus ----------
// a, b: { bust, psl, tier, best: [trait names] }; winner: 0 | 1 | null; rows: [{ label, a, b, side }], the traits that
// separate them most with both notes (breakdown.js). The scan turns both photos into points; then those traits are
// played one by one, closest first: the part of the face in play lights on both, the two notes count and the side
// that takes it keeps the light. Only then do the two PSL climb, the verdict lands, and a second scan gives both
// faces back as photographs with nothing over them: the one that won keeps a halo, the other is dimmer. Then the
// tale of the tape between the two numbers, and under each tier what that face stands out for.
function tape(ctx, rows, cx, y, step, px, maxW, p) {
  if (p <= 0 || !rows.length) return;
  const text = rows.map((r) => [r.a.toFixed(1), r.label.toUpperCase(), r.b.toFixed(1)]);
  let size = px, lw = 0, sw = 0, gap = 0;
  for (; ; size -= 1) { // the widest row has to fit between the two numbers
    ctx.font = font(500, size, F.m);
    lw = Math.max(...text.map((t) => ctx.measureText(t[1]).width)); sw = ctx.measureText('10.0').width; gap = size * 0.7;
    if (lw + 2 * (gap + sw) <= maxW || size <= 12) break;
  }
  const xl = cx - lw / 2 - gap, xr = cx + lw / 2 + gap;
  ctx.globalAlpha = seg(p, 0, 0.35) * 0.85; ctx.fillStyle = C.dim; ctx.font = font(500, Math.round(size * 0.6), F.m);
  tracked(ctx, 'RASGO A RASGO', cx, y, 2, 'center');
  ctx.font = font(500, size, F.m);
  rows.forEach((r, i) => {
    const a = seg(p, 0.1 + i * 0.12, 0.5 + i * 0.12), yy = y + (i + 1) * step + (1 - out(a)) * 8;
    if (a <= 0) return;
    ctx.globalAlpha = a; // the name in the middle, each note on its side, the higher one lit
    ctx.textAlign = 'center'; ctx.fillStyle = C.paper; ctx.fillText(text[i][1], cx, yy);
    ctx.textAlign = 'right'; ctx.fillStyle = r.side === 0 ? C.acid : r.side === 1 ? C.dim : C.paper; ctx.fillText(text[i][0], xl, yy);
    ctx.textAlign = 'left'; ctx.fillStyle = r.side === 1 ? C.acid : r.side === 0 ? C.dim : C.paper; ctx.fillText(text[i][2], xr, yy);
  });
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}
// what a face stands out for: on one line, or one trait per line (stack)
function standout(ctx, names, x, y, align, px, maxW, a, stack = false) {
  if (a <= 0 || !names || !names.length) return;
  ctx.globalAlpha = a; ctx.fillStyle = C.dim; ctx.font = font(500, Math.max(11, Math.round(px * 0.64)), F.m); tracked(ctx, 'DESTACA EN', x, y, 2, align);
  ctx.fillStyle = C.paper; ctx.textAlign = align;
  const up = names.map((t) => t.toUpperCase());
  (stack ? up : [up.join(' · ')]).forEach((t, i) => { fit(ctx, t, maxW, px, 500, F.m, 11); ctx.fillText(t, x, y + px * 1.32 * (i + 1)); });
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

export function versusScene(field, fmt, a, b, winner, id = '', rows = []) {
  const [W, H] = SIZES[fmt], story = fmt === 'story', N = field ? field.max : 0, sides = [a, b];
  const diff = Math.abs(a.psl - b.psl), verdict = verdictOf(a.psl - b.psl);
  const R = story ? PAIR : [{ x: 24, y: 10, w: 468, h: 655 }, { x: 708, y: 10, w: 468, h: 655 }];
  const col = (i) => (story ? { x0: i ? W / 2 : -1e9, x1: i ? 1e9 : W / 2 } : {}); // in a story the two faces share the width, a half each
  const pad = story ? 72 : 44, y0 = R[0].y, y1 = R[0].y + R[0].h;
  // in a story the faces sink before the verdict band and fade towards the seam they share
  const still = sides.map((sd, i) => (story ? shaped(sd.bust.cut, { sink: [0.74, 0.985], wear: [i === 0 ? 1 : -1, 0.22] }) : sd.bust.cut));
  const glow = winner != null ? glowOf(still[winner]) : null;
  if (field) {
    const h = Math.floor(N / 2), ns = [h, N - h];
    const plain = compose(sides.map((s, i) => placeBust(s.bust.sample(ns[i]), R[i], { acid: NEUTRAL })));
    field.put(0, plain);
    field.put(1, lightsOut(plain, () => true)); // the same two faces with every point out: what the second scan leaves
  }
  const size = story ? 2.7 : 2.3, shown = rows.slice(0, 5);
  // the traits, played one by one before any total: the closest call first, the widest gap last
  const rounds = [...shown].sort((x, y) => Math.abs(x.a - x.b) - Math.abs(y.a - y.b)), RD = 0.64, r0 = 0.8, r1 = r0 + (rounds.length ? rounds.length * RD + 0.15 : 0);
  const T = 5.6 + r1 - r0; // the rest of the reveal runs on its own clock (u), which waits while the traits are played
  const NX = story ? [pad, W - pad] : null; // a story's two numbers stand on the outer margins: the tape goes between them
  const best = sides.map((sd) => (sd.best || []).slice(0, 2)), line = (names) => names.map((n) => n.toUpperCase()).join(' · ');
  return {
    W, H, ms: T * 1000, enter: 0.8 / T, again: (2.2 + r1 - r0) / T,
    frame(ctx, t) {
      const real = t * T, s = real < r0 ? real : real < r1 ? r0 : real - (r1 - r0), tick = Math.floor(real * 16);
      const p0 = seg(s, 0, 0.8), p1 = seg(s, 0.8, 2.3), p2 = seg(s, 2.3, 3.4), p3 = seg(s, 3.4, 4.2), p4 = seg(s, 4.2, 4.8);
      // the trait in play: which one, how far into it, and whether it has been called
      const ri = rounds.length && real >= r0 && real < r1 ? Math.min(rounds.length - 1, Math.floor((real - r0) / RD)) : -1, round = ri < 0 ? null : rounds[ri];
      const rq = ri < 0 ? 0 : clamp((real - r0 - ri * RD) / RD), env = seg(rq, 0, 0.15) * (1 - seg(rq, 0.88, 1)), called = seg(rq, 0.55, 0.7);
      ground(ctx, W, H, W / 2, H / 2);
      const cutY = y0 + (y1 - y0) * io(p0); // one scan line crosses both faces
      sides.forEach((sd, i) => photoIn(ctx, still[i], R[i], { top: cutY, alpha: 1 - seg(s, 0.7, 0.85), ...col(i) }));
      const lost = (i) => winner != null && winner !== i;
      if (s < 3.4) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, cutY); ctx.clip();
        sides.forEach((sd, i) => ghost(ctx, sd.bust, R[i], (field ? 0.15 : 0.95) * (lost(i) ? 1 - 0.5 * io(p2) : 1)));
        ctx.restore();
        cloud(ctx, field, W, H, {
          from: 0, time: real, drift: real >= r0 ? seg(real, r0, r0 + 0.3) : 0, size, gain: 0.8 + 0.5 * Math.exp(-seg(s, 2.3, 4.4) * 9) * (s >= 2.3 ? 1 : 0),
          scan: p0 < 1 ? { y: cutY, cut: 1, width: 30, strength: 1 } : null,
          // the same part of both faces; once the trait is called, the side that took it keeps the light
          focus: round ? sides.map((sd, i) => zone(sd.bust.lm, round.key, R[i], env * (round.side == null ? 0.8 : lerp(0.8, round.side === i ? 1 : 0.2, called)))) : null, focusDim: 0.55 * env,
        });
        scanLine(ctx, story ? pad : R[0].x, cutY, story ? W - pad * 2 : R[1].x + R[1].w - R[0].x, p0 < 1 ? 1 : 0);
      } else {
        // the second scan: both faces are photographs again, clean
        const lineY = lerp(y0 - 14, y1 + 14, io(p3));
        if (glow) halo(ctx, glow, R[winner], { bottom: lineY, a: 0.7 });
        sides.forEach((sd, i) => photoIn(ctx, still[i], R[i], { bottom: lineY, alpha: lost(i) ? 0.6 : 1, ...col(i) }));
        ctx.save(); ctx.beginPath(); ctx.rect(0, lineY, W, H - lineY); ctx.clip();
        sides.forEach((sd, i) => ghost(ctx, sd.bust, R[i], (field ? 0.15 : 0.95) * (lost(i) ? 0.5 : 1)));
        ctx.restore();
        cloud(ctx, field, W, H, { from: 0, to: 1, mix: frontAt(lineY, H), delay: FRONT, sweep: 1, sweepDir: [0, 1], sweepNoise: FRONT_NOISE, spread: 0, arc: 0, time: real, size, gain: 0.8 });
        scanLine(ctx, story ? pad : R[0].x, lineY, story ? W - pad * 2 : R[1].x + R[1].w - R[0].x, p3 > 0 && p3 < 1 ? 1 : 0);
      }
      if (story) header(ctx, pad, W - pad, 118, `VERSUS ${id}`);
      else { // between the two heads; a dark foot under each face so its label reads
        ctx.fillStyle = C.dim; ctx.font = font(500, 15, F.m); tracked(ctx, `PHENOTYPE · VERSUS ${id}`, W / 2, 40, 3, 'center');
        const g = ctx.createLinearGradient(0, H - 230, 0, H); g.addColorStop(0, 'rgba(5,7,10,0)'); g.addColorStop(0.75, 'rgba(5,7,10,.88)');
        ctx.fillStyle = g; ctx.fillRect(0, H - 230, 500, 230); ctx.fillRect(W - 500, H - 230, 500, 230);
      }
      // each side: its number and its tier, counting up together (the lower one stops first), then what it stands out for
      const maxPsl = Math.max(a.psl, b.psl, 1.01), endA = seg(s, 4.2, 4.7), end = out(p4);
      const bpx = story ? Math.min(...best.map((names) => fit(ctx, line(names), 330, 24, 500, F.m, 12))) : 15; // both sides in one size
      sides.forEach((sd, i) => {
        const won = winner === i, on = seg(s, 0.7, 1.0) * (rounds.length ? seg(real, r1 - 0.1, r1 + 0.2) : 1); // no total while the traits are played
        if (on <= 0) return;
        const climb = clamp((out(p1) * (maxPsl - 1)) / (sd.psl - 1 || 1)), now = 1 + (sd.psl - 1) * climb, tierP = seg(s, 0.9 + 1.4 * ((sd.psl - 1) / (maxPsl - 1)), 1.3 + 1.4 * ((sd.psl - 1) / (maxPsl - 1)));
        const settle = io(p2), name = sd.tier.toUpperCase(), dim = lost(i) ? 1 - 0.35 * settle : 1;
        ctx.globalAlpha = on * dim;
        ctx.fillStyle = won && settle > 0.5 ? C.acid : C.paper;
        if (story) { // a column on each outer margin, so the tape has the middle to itself
          const side = i ? 'right' : 'left';
          ctx.textAlign = side;
          ctx.font = font(700, 128, F.d); ctx.fillText(one(now), NX[i], 1404);
          fit(ctx, name, 270, 50, 900, F.d, 20); ctx.fillText(decode(name, tierP, tick + i * 3), NX[i], 1468);
          standout(ctx, best[i], NX[i], 1522, side, bpx, 330, endA * (lost(i) ? 0.8 : 1));
        } else {
          const left = i === 0, x = left ? pad : W - pad, y = H - 26;
          ctx.textAlign = left ? 'left' : 'right';
          ctx.font = font(700, 74, F.d); ctx.fillText(one(now), x, y);
          const nw = ctx.measureText(one(sd.psl)).width;
          fit(ctx, name, 400, 40, 900, F.d, 18); ctx.fillText(decode(name, tierP, tick + i * 3), x, y - 82);
          standout(ctx, best[i], left ? x + nw + 18 : x - nw - 18, y - 42, left ? 'left' : 'right', bpx, 150, endA * (lost(i) ? 0.8 : 1), true);
        }
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      });
      // the middle: VS, then the verdict slams over it
      const cx = W / 2, vy = story ? 700 : 300, by = story ? y1 + 12 : 300, slam = seg(s, 2.45, 2.8), vs = seg(real, 0.6, 0.9) * (1 - seg(s, 2.35, 2.55));
      // trait by trait: its name in the middle, a note on each side counting up, and the tally of who has taken what
      if (rounds.length && real >= r0 && real < r1 + 0.2) {
        const ry = story ? 1404 : 404, sq = story ? 18 : 11, gapP = story ? 9 : 6, py = ry + (story ? 30 : 16);
        const all = seg(real, r0, r0 + 0.2) * (1 - seg(real, r1 - 0.15, r1 + 0.05));
        const took = (i) => rounds.filter((r, j) => r.side === i && (j < ri || (j === ri && called > 0.5) || ri < 0)).length;
        ctx.globalAlpha = all * 0.5; ctx.fillStyle = C.paper; ctx.fillRect(cx - 1, py - 3, 2, sq + 6);
        [0, 1].forEach((i) => { for (let k = 0; k < took(i); k++) { ctx.globalAlpha = all; ctx.fillStyle = C.acid; ctx.fillRect(i ? cx + 12 + k * (sq + gapP) : cx - 12 - sq - k * (sq + gapP), py, sq, sq); } });
        if (round) {
          const count = out(seg(rq, 0.08, 0.55)), name = round.label.toUpperCase();
          ctx.globalAlpha = env * 0.9; ctx.fillStyle = C.dim; ctx.font = font(500, story ? 22 : 13, F.m); tracked(ctx, `RASGO ${ri + 1} / ${rounds.length}`, cx, ry - (story ? 76 : 40), 3, 'center');
          ctx.globalAlpha = env; ctx.fillStyle = C.paper; fit(ctx, name, story ? 430 : 210, story ? 58 : 30, 900, F.d, 14); ctx.textAlign = 'center'; ctx.fillText(name, cx, ry);
          [round.a, round.b].forEach((v, i) => {
            ctx.globalAlpha = env * (round.side === 1 - i ? 1 - 0.55 * called : 1); ctx.fillStyle = round.side === i && called > 0.5 ? C.acid : C.paper;
            ctx.font = font(500, story ? 104 : 58, F.m); ctx.textAlign = i ? 'right' : 'left';
            ctx.fillText((v * count).toFixed(1), story ? NX[i] : i ? W - pad : pad, story ? ry : H - 28);
          });
        }
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      }
      if (vs > 0) { ctx.globalAlpha = vs; ctx.fillStyle = C.acid; ctx.font = font(900, story ? 120 : 84, F.d); ctx.textAlign = 'center'; ctx.fillText('VS', cx, vy + (story ? 42 : 30)); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
      if (slam > 0) {
        const bw = story ? 1180 : 470, bh = story ? 132 : 78, k = 1 + 0.5 * (1 - out(slam));
        ctx.save(); ctx.translate(cx, by); ctx.rotate(-0.052); ctx.scale(k, k); ctx.globalAlpha = Math.min(1, slam * 2.4);
        ctx.fillStyle = winner == null ? C.paper : C.acid; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = winner == null ? verdict : `${verdict} · +${diff.toFixed(1)}`;
        fit(ctx, label, story ? 940 : 420, story ? 72 : 40, 900, F.d, 16); ctx.fillText(label, 0, 3);
        ctx.restore(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        const sub = seg(s, 2.9, 3.3);
        if (sub > 0 && winner != null && !shown.length) { // no breakdown to show: say the result in words
          ctx.globalAlpha = sub; ctx.fillStyle = C.paper; ctx.font = font(500, story ? 24 : 16, F.m);
          tracked(ctx, `${sides[winner].tier.toUpperCase()} GANA POR ${diff.toFixed(1)} PSL`, cx, story ? 1562 : by + 73, 2, 'center'); ctx.globalAlpha = 1;
        }
      }
      // the tale of the tape: between the two numbers in a story, under the verdict in 16:9
      const tp = seg(s, 4.2, 5.25);
      if (story) tape(ctx, shown, cx, 1310, 40, 28, 376, tp); else tape(ctx, shown, cx, by + 84, 26, 18, 300, tp);
      if (story) ctaBar(ctx, pad, 1612 + (1 - end) * 22, W - pad * 2, 58, endA, '¿A QUIÉN GANAS TÚ?');
      else if (endA > 0) { ctx.globalAlpha = endA; ctx.fillStyle = C.acid; ctx.font = font(500, 17, F.m); tracked(ctx, `¿A QUIÉN GANAS TÚ? → ${SITE}`, cx, H - 22, 1, 'center'); ctx.globalAlpha = 1; }
    },
  };
}

// ---------- tier list (three faces or more) ----------
// rows: [{ bust, psl, tier, sex, n }] in any order (n: the order they were chosen in, which is how they stand on the
// stage). The format everyone already knows how to read: seven rows, best on top, every face in the row it earned.
// The faces wait as points, in a wall; worst first, each one flies to its row, which lights when it gets its first
// face, and the best goes last. Then one scan down the list gives every face back as its photograph.
const RAMP = ['#ff3b2f', '#6b727c', '#9aa3ad', '#d7dde5', '#dcf08f', '#d1f866', '#c6ff3d']; // Sub-5 → True Adam
export function rankScene(field, fmt, rows, id = '') {
  const [W, H] = SIZES[fmt], story = fmt === 'story', pad = story ? 72 : 44, n = rows.length;
  const sorted = [...rows].sort((x, y) => y.psl - x.psl), names = tierNames(sorted.every((r) => r.sex === 'f') ? 'f' : 'm');
  const groups = Array.from({ length: 7 }, () => []);
  sorted.forEach((r) => groups[tierIndex(r.psl)].push(r));
  const shown = story ? [6, 5, 4, 3, 2, 1, 0] : [6, 5, 4, 3, 2, 1, 0].filter((i) => groups[i].length);
  const top = story ? 330 : 96, bottom = story ? 1586 : H - 46, rh = Math.min(story ? 180 : 132, (bottom - top) / shown.length), lw = story ? 232 : 190;
  const th = rh - (story ? 22 : 12), tw = th * (5 / 7), step = tw + (story ? 12 : 8), per = Math.max(1, Math.floor((W - pad - (pad + lw + 16) + (story ? 12 : 8)) / step));
  const bh = rh - (story ? 10 : 6); // a row's label box
  // every face's cell in the list; a row with more faces than fit keeps its last cell for "+N", and those faces go into it
  const cell = new Map();
  shown.forEach((ti, k) => groups[ti].forEach((r, j) => cell.set(r, { x: pad + lw + 16 + Math.min(j, per - 1) * step, y: top + k * rh, w: tw, h: th, ti, k, over: groups[ti].length > per && j >= per - 1 })));
  // ...and its place in the wall it leaves
  const seats = wall(n, fmt), seated = [...sorted].sort((a, b) => (a.n ?? 0) - (b.n ?? 0)), seat = (r) => seats[seated.indexOf(r)].rect;
  // the clock: worst first; the best waits a beat and takes its time
  const order = [...sorted].reverse(), gapT = clamp(2.6 / n, 0.12, 0.55), t0 = 0.55, start = new Map(), land = new Map();
  order.forEach((r, i) => { const last = i === n - 1, a = t0 + i * gapT + (last ? 0.35 : 0); start.set(r, a); land.set(r, a + (last ? 0.95 : 0.7)); });
  const tL = land.get(sorted[0]), tS = tL + 0.3, tE = tS + 0.8, T = tE + 0.75;
  const litAt = groups.map((g) => (g.length ? Math.min(...g.map((r) => land.get(r))) : Infinity));
  const N = field ? field.max : 0, pts = Math.floor(N / n), size = story ? 3 : 2.3;
  if (field) {
    // one run of points per face, the same run in the wall and in the list, so each flies on its own clock
    const a = [], b = [];
    sorted.forEach((r) => {
      const smp = r.bust.sample(pts), from = seat(r), to = cell.get(r), k = Math.sqrt((to.w * to.h) / (from.w * from.h));
      a.push(placeBust(smp, from, { acid: NEUTRAL }));
      const f = placeBust(smp, to, { acid: to.over ? 0 : charge(r.psl) });
      for (let i = 0; i < f.n; i++) { f.col[i * 4 + 3] *= k; if (to.over) f.col[i * 4] = f.col[i * 4 + 1] = f.col[i * 4 + 2] = 0; } // smaller points for a smaller face
      b.push(f);
    });
    const list = concat(b);
    field.put(0, concat(a)); field.put(1, list); field.put(2, lightsOut(list, () => true));
  }
  const y0 = top - 14, y1 = top + shown.length * rh + 6;
  return {
    W, H, ms: T * 1000, enter: 0, again: (tS - 0.15) / T,
    frame(ctx, t) {
      const s = t * T, ps = seg(s, tS, tE), lineY = field ? lerp(y0, y1, io(ps)) : 1e9, landed = sorted.filter((r) => s >= land.get(r)).length;
      ground(ctx, W, H, W / 2, H / 2);
      const headA = seg(s, 0.15, 0.7);
      header(ctx, pad, W - pad, story ? 118 : 50, `TIER LIST ${id}`, !story);
      const count = s < tL ? `CLASIFICANDO · ${landed} / ${n}` : `${n} CARAS · ESCALA PSL`;
      if (!story) {
        ctx.save(); ctx.globalAlpha = 0.07 * headA; ctx.fillStyle = C.paper; ctx.textAlign = 'right'; ctx.font = font(900, 150, F.d);
        ctx.fillText('TIER', W - pad, H / 2 - 6); ctx.fillText('LIST', W - pad, H / 2 + 132); ctx.restore();
        ctx.globalAlpha = headA; ctx.fillStyle = C.acid; ctx.font = font(500, 16, F.m); tracked(ctx, count, W - pad, 78, 2, 'right');
      } else {
        ctx.globalAlpha = headA; ctx.fillStyle = C.paper; ctx.font = font(900, 92, F.d); ctx.fillText('TIER LIST', pad, 268);
        ctx.fillStyle = C.acid; ctx.font = font(500, 26, F.m); tracked(ctx, count, W - pad, 262, 2, 'right');
      }
      ctx.globalAlpha = 1;
      // the rows: dark until a face lands in them. Drawn again over the points once lit, so a face still waiting in
      // the wall passes behind a label and never burns through it
      const labels = (over) => shown.forEach((ti, k) => {
        const a = seg(s, 0.1 + k * 0.05, 0.5 + k * 0.05); if (a <= 0 || (over && (!groups[ti].length || s < litAt[ti] - 0.04 || s > tS))) return;
        const y = top + k * rh, g = groups[ti], on = g.length ? seg(s, litAt[ti] - 0.04, litAt[ti] + 0.14) : 0, flash = g.length && s >= litAt[ti] ? Math.exp(-(s - litAt[ti]) * 7) : 0;
        ctx.globalAlpha = a * 0.34; ctx.fillStyle = 'rgba(215,221,229,.1)'; ctx.fillRect(pad, y, lw, bh);
        if (on > 0) { ctx.globalAlpha = a * on; ctx.fillStyle = RAMP[ti]; ctx.fillRect(pad, y, lw, bh); }
        if (flash > 0.02) { ctx.globalAlpha = a * flash * 0.7; ctx.fillStyle = '#fff'; ctx.fillRect(pad, y, lw, bh); }
        ctx.globalAlpha = a * lerp(0.34, 1, on); ctx.fillStyle = on > 0.5 ? C.ink : C.paper; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fit(ctx, names[ti].toUpperCase(), lw - 28, story ? 34 : 24, 900, F.d, 12); ctx.fillText(names[ti].toUpperCase(), pad + lw / 2, y + bh / 2 + 2);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        if (!over) { ctx.globalAlpha = a; ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad + lw + 12, y + rh - (story ? 5 : 3)); ctx.lineTo(W - pad, y + rh - (story ? 5 : 3)); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
      labels(false);
      // each face: the ground of its cell as it lands, and above the scan line its photograph
      sorted.forEach((r) => {
        const c = cell.get(r), in_ = seg(s, land.get(r) - 0.15, land.get(r) + 0.05);
        if (c.over || in_ <= 0) return;
        ctx.globalAlpha = in_; ctx.fillStyle = '#0a0d12'; ctx.fillRect(c.x, c.y, c.w, c.h); ctx.globalAlpha = 1;
        photoIn(ctx, r.bust.cut, c, { bottom: lineY });
      });
      // the faces themselves, as points
      if (field && field.alive) {
        let ok = true;
        if (s < tS) sorted.forEach((r, f) => {
          const m = clamp((s - start.get(r)) / (land.get(r) - start.get(r)));
          ok = field.draw({ w: W, h: H, from: 0, to: 1, first: f * pts, n: pts, mix: io(m), delay: 0.5, spread: 30, arc: 0.3, time: s, drift: m <= 0 ? 1.2 : 0.5, size, gain: 0.78 + (m >= 1 ? 0.7 * Math.exp(-(s - land.get(r)) * 8) : 0), keep: f > 0 }) && ok;
        });
        else ok = field.draw({ w: W, h: H, from: 1, to: 2, mix: frontAt(lineY, H), delay: FRONT, sweep: 1, sweepDir: [0, 1], sweepNoise: FRONT_NOISE, spread: 0, arc: 0, time: s, size, gain: 0.78 });
        if (ok) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(field.canvas, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
      } else if (s < tL) { // no WebGL: the photographs make the trip
        sorted.forEach((r) => {
          const c = cell.get(r), m = io(clamp((s - start.get(r)) / (land.get(r) - start.get(r)))), a = seat(r);
          if (m >= 1) return;
          ctx.globalAlpha = c.over ? 1 - m : 1; ctx.drawImage(r.bust.cut, lerp(a.x, c.x, m), lerp(a.y, c.y, m), lerp(a.w, c.w, m), lerp(a.h, c.h, m)); ctx.globalAlpha = 1;
        });
      }
      labels(true);
      scanLine(ctx, pad, lineY, W - pad * 2, ps > 0 && ps < 1 ? 1 : 0);
      // over each face: its frame and its number, counting as it lands
      sorted.forEach((r) => {
        const c = cell.get(r), at = land.get(r), in_ = seg(s, at - 0.05, at + 0.15), first = sorted[0] === r;
        if (in_ <= 0) return;
        ctx.globalAlpha = in_;
        if (c.over) {
          if (groups[c.ti][per - 1] !== r) { ctx.globalAlpha = 1; return; } // one "+N" for the row
          const more = groups[c.ti].slice(per - 1).filter((o) => s >= land.get(o)).length;
          ctx.strokeStyle = C.faint; ctx.lineWidth = 1.5; ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2); ctx.fillStyle = C.paper; ctx.font = font(500, story ? 30 : 20, F.m); ctx.textAlign = 'center'; ctx.fillText(`+${more}`, c.x + c.w / 2, c.y + c.h / 2 + 8); ctx.textAlign = 'left';
          ctx.globalAlpha = 1; return;
        }
        const pulse = first && s >= at ? Math.exp(-(s - at) * 5) : 0;
        ctx.strokeStyle = first ? C.acid : C.faint; ctx.lineWidth = first ? 3 + 7 * pulse : 1.5; ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        const ph = story ? 30 : 22; ctx.fillStyle = first ? C.acid : 'rgba(5,7,10,.82)'; ctx.fillRect(c.x, c.y + c.h - ph, c.w, ph);
        ctx.fillStyle = first ? C.ink : C.paper; ctx.font = font(500, story ? 20 : 15, F.m); ctx.textAlign = 'center';
        ctx.fillText(one(lerp(Math.max(1, r.psl - 1.2), r.psl, out(seg(s, at - 0.05, at + 0.35)))), c.x + c.w / 2, c.y + c.h - (story ? 8 : 6)); ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      });
      const endA = seg(s, tE - 0.1, tE + 0.4);
      if (story) ctaBar(ctx, pad, 1612 + (1 - out(endA)) * 22, W - pad * 2, 58, endA, '¿EN QUÉ FILA CAES?');
      else if (endA > 0) { ctx.globalAlpha = endA; ctx.fillStyle = C.acid; ctx.font = font(500, 17, F.m); tracked(ctx, `¿EN QUÉ FILA CAES TÚ? → ${SITE}`, W / 2, H - 16, 1, 'center'); ctx.globalAlpha = 1; }
    },
  };
}

// ---------- playing, sharing, recording ----------
// play a reveal: render(t) with t going from → 1 over `ms`; resolves when done. Reduced motion: the final frame.
export function play(render, ms = 2400, from = 0) {
  const reduced = document.documentElement.dataset.motion === 'reduced';
  if (reduced) { render(1); return Promise.resolve(); }
  return new Promise((done) => {
    const t0 = performance.now();
    const step = (now) => { const t = clamp(from + ((now - t0) / ms) * (1 - from), from, 1); render(t); if (t < 1) requestAnimationFrame(step); else done(); };
    requestAnimationFrame(step);
  });
}

// share the final frame as a PNG (native share sheet on phones), or download it
export async function shareFile(file, text) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file), a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
export async function canvasFile(canvas, name) {
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  return new File([blob], `${name}.png`, { type: 'image/png' });
}

// the reveal as a video file: MP4 where the browser records it (Safari, recent Chrome), WebM otherwise
const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export const videoType = () => (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream ? null : VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null);
export async function recordCanvas(canvas, name, run) {
  const type = videoType();
  if (!type) return null;
  const stream = canvas.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 9e6 }), chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((ok) => { rec.onstop = ok; });
  rec.start();
  try { await run(); } finally { rec.stop(); await stopped; stream.getTracks().forEach((tr) => tr.stop()); }
  const mime = type.split(';')[0];
  return new File([new Blob(chunks, { type: mime })], `${name}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime });
}
