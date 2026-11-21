// "Cómo funciona" · the evolution: one face through the seven tiers, seamlessly.
// Every stage is the same person cut from the background (sample.js) with the same 574 points and one shared mesh
// (data/case.json). The picture between two tiers is both of them, each warped onto the points in between, mixed:
// the face changes shape continuously, it never cross-fades. The rail under it is the only control: drag it, use the
// arrow keys, press a tier or play it through. The numbers follow the face; each tier is described on its own.
import { makeBust } from './censor.js';

const VS = `#version 300 es
in vec2 aPos; in vec2 aUvA; in vec2 aUvB;
out vec2 vA; out vec2 vB;
void main() { vA = aUvA; vB = aUvB; gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vA; in vec2 vB;
uniform sampler2D uA; uniform sampler2D uB; uniform float uMix;
out vec4 o;
void main() { o = mix(texture(uA, vA), texture(uB, vB), uMix); }`;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const L = (a, b, t) => a + (b - a) * t;
const reduced = document.documentElement.dataset.motion === 'reduced';

// the cut-out of every stage, with its points in the cut-out's own space
async function loadStages(S) {
  const out = [];
  for (const s of S) {
    const bmp = await createImageBitmap(await (await fetch(s.src)).blob());
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const bust = makeBust(c, s.points.map(([x, y]) => ({ x: x * c.width, y: y * c.height })));
    const uv = new Float32Array(bust.lm.length * 2);
    bust.lm.forEach((p, k) => { uv[k * 2] = p.x; uv[k * 2 + 1] = p.y; });
    out.push({ cut: bust.read('none').cut, uv });
  }
  return out;
}

function renderer(canvas, stages, triangles) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const n = stages[0].uv.length / 2;
  const buf = (name, usage) => { const b = gl.createBuffer(), loc = gl.getAttribLocation(prog, name); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, n * 8, usage); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); return b; };
  gl.bindVertexArray(gl.createVertexArray());
  const pos = buf('aPos', gl.DYNAMIC_DRAW), uvA = buf('aUvA', gl.DYNAMIC_DRAW), uvB = buf('aUvB', gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangles), gl.STATIC_DRAW);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const tex = stages.map((s) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.cut);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });
  gl.uniform1i(gl.getUniformLocation(prog, 'uA'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'uB'), 1);
  const uMix = gl.getUniformLocation(prog, 'uMix'), at = new Float32Array(n * 2);
  gl.clearColor(0, 0, 0, 0); gl.disable(gl.BLEND);
  let pair = -1;
  // x: 0 … stages − 1, continuous
  return (x) => {
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    const i = Math.min(stages.length - 2, Math.floor(x)), t = clamp(x - i);
    const shape = 0.45 * t + 0.55 * smooth(t), mix = smooth((t - 0.05) / 0.9); // the shape leads, the surface follows
    const A = stages[i].uv, B = stages[i + 1].uv;
    if (i !== pair) {
      pair = i;
      gl.bindBuffer(gl.ARRAY_BUFFER, uvA); gl.bufferSubData(gl.ARRAY_BUFFER, 0, A);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvB); gl.bufferSubData(gl.ARRAY_BUFFER, 0, B);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[i + 1]);
    }
    for (let k = 0; k < at.length; k++) at[k] = A[k] + (B[k] - A[k]) * shape;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, at);
    gl.uniform1f(uMix, mix);
    gl.drawElements(gl.TRIANGLES, triangles.length, gl.UNSIGNED_SHORT, 0);
  };
}

const sgn = (v, n = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(n)}`;
const MEASURES = [['canthal_tilt_deg', (v) => `${sgn(v)}°`], ['fwhr', (v) => v.toFixed(2)], ['jaw_ratio', (v) => v.toFixed(2)], ['midface_ratio', (v) => v.toFixed(2)], ['symmetry', (v) => String(Math.round(v))]];

async function init(root) {
  const $ = (s) => root.querySelector(s);
  const k = await (await fetch(root.dataset.evo)).json(), S = k.stages, last = S.length - 1;
  const notes = JSON.parse($('[data-evo-notes]').textContent);
  const range = $('[data-evo-range]'), ticks = [...root.querySelectorAll('[data-evo-tick]')], play = $('[data-evo-play]'), canvas = $('[data-evo-canvas]'), poster = $('[data-evo-poster]');
  const out = { tier: $('[data-evo-tier]'), kind: $('[data-evo-kind]'), note: $('[data-evo-note]'), psl: $('[data-evo-psl]'), pct: $('[data-evo-pct]'), smv: $('[data-evo-smv]') };
  const cells = Object.fromEntries(MEASURES.map(([key]) => [key, $(`[data-evo-m="${key}"]`)]));
  let x = 0, draw = null, shown = -1, tween = 0, touched = false;

  function paint() {
    const i = Math.min(last - 1, Math.floor(x)), t = clamp(x - i), e = smooth((t - 0.3) / 0.4), a = S[i], b = S[i + 1], near = Math.round(x);
    // the numbers roll through the middle of a change, where the name flips: a tier never shows another tier's figures
    out.psl.textContent = L(a.psl, b.psl, e).toFixed(1);
    const pct = L(a.percentile, b.percentile, e); out.pct.textContent = `P${pct > 99 ? pct.toFixed(1) : Math.round(pct)}`;
    out.smv.textContent = L(a.smv, b.smv, e).toFixed(0);
    for (const [key, fmt] of MEASURES) if (cells[key]) cells[key].textContent = fmt(L(a.metrics[key], b.metrics[key], e));
    if (near !== shown) {
      shown = near;
      out.tier.textContent = S[near].tierName; out.kind.textContent = notes[near].kind; out.note.textContent = notes[near].text;
      ticks.forEach((b2, j) => b2.setAttribute('aria-current', String(j === near)));
      range.setAttribute('aria-valuetext', `${S[near].tierName}, PSL ${S[near].psl.toFixed(1)}`);
      if (!draw && poster) poster.src = S[near].src;
    }
    root.style.setProperty('--evo', (x / last).toFixed(4));
    draw?.(x);
  }
  const set = (v) => { x = clamp(v, 0, last); range.value = String(x); paint(); };
  function go(target, ms) { // travel to a tier (or through all of them)
    cancelAnimationFrame(tween);
    const from = x, to = clamp(target, 0, last);
    if (reduced || !ms || from === to) { set(to); root.classList.remove('is-playing'); return; }
    const t0 = performance.now();
    const step = (now) => { const p = clamp((now - t0) / ms); set(from + (to - from) * p); if (p < 1) tween = requestAnimationFrame(step); else root.classList.remove('is-playing'); };
    tween = requestAnimationFrame(step);
  }
  const stop = () => { cancelAnimationFrame(tween); root.classList.remove('is-playing'); };
  const through = () => { if (x > last - 0.02) set(0); root.classList.add('is-playing'); go(last, (last - x) * 1500); };

  range.max = String(last);
  range.addEventListener('input', () => { touched = true; stop(); set(+range.value); });
  range.addEventListener('keydown', (e) => { // an arrow is a tier, not a thousandth of one
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault(); touched = true;
    go(e.key === 'Home' ? 0 : e.key === 'End' ? last : (d > 0 ? Math.floor(x + 1e-6) + 1 : Math.ceil(x - 1e-6) - 1), 600);
  });
  ticks.forEach((b, j) => b.addEventListener('click', () => { touched = true; go(j, 250 + Math.abs(j - x) * 420); }));
  play.addEventListener('click', () => { touched = true; if (root.classList.contains('is-playing')) stop(); else through(); });
  addEventListener('resize', () => paint());
  paint();

  try {
    draw = renderer(canvas, await loadStages(S), k.triangles);
  } catch (err) { console.warn('evolution unavailable', err); }
  if (draw) { root.classList.add('is-live'); paint(); } // without WebGL2 the poster stays, changing with the tier
  // the first time it comes into view it plays itself through, once (unless the visitor is already driving it)
  if (draw && !reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([en]) => { if (!en.isIntersecting) return; io.disconnect(); if (!touched) through(); }, { threshold: 0.55 });
    io.observe($('[data-evo-view]'));
  }
}

const root = document.querySelector('[data-evo]');
if (root) init(root).catch((err) => console.warn('evolution', err));
