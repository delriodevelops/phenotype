// One additive point field on the GPU (WebGL2, no library): the specimen. Everything PHENOTYPE shows as points —
// the face on the stage, the PSL number, the dust of a lost versus — is this one cloud reorganising.
//
// A formation is n points: a position (canvas pixels; z in the same unit, negative = towards the viewer) and a colour
// (rgb already scaled by brightness, w = size factor). Up to SLOTS formations live in GPU buffers and draw() shows the
// mix of two of them. Every point travels on its own clock (a delay that is random, or swept along a direction) and
// bows out mid-flight, so a morph reads as the cloud reorganising and never as a cross-fade.
//
// The canvas is opaque black and is meant to be composited with 'lighter' over whatever the caller painted first.
export const SLOTS = 6;

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in vec4 aCa;
layout(location = 3) in vec4 aCb;
layout(location = 4) in vec4 aS;
uniform vec2 uRes;
uniform vec3 uPivot;
uniform vec4 uMorph;    // mix · delay share · sweep share · spread (px)
uniform vec3 uSweepDir;  // direction · how much of each point's delay stays random (0 = a clean front)
uniform vec4 uView;     // yaw · pitch · focal length (px) · point size (px)
uniform vec4 uLife;     // time · drift (px) · gain · arc
uniform vec4 uScan;     // y · half width · strength · cut: 1 = only the points above the line exist, -1 = only those under it
uniform vec3 uTint;
uniform vec4 uFocA;     // a focus: centre · radii (px). The part of a face being measured
uniform vec4 uFocB;     // a second one (two faces measured at once)
uniform vec4 uFocK;     // strength of A · of B · how far everything else steps back
uniform vec4 uGate;     // x · half width · light left to what lies beyond it · strength: a front crossing sideways
out vec3 vCol;
void main() {
  float sweep = clamp(dot(aA.xy / uRes, uSweepDir.xy), 0.0, 1.0);
  float d = mix(aS.x, sweep * (1.0 - uSweepDir.z) + aS.x * uSweepDir.z, uMorph.z);
  float t = clamp(uMorph.x * (1.0 + uMorph.y) - d * uMorph.y, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(aA, aB, t);
  float fly = sin(t * 3.14159265);
  float ang = aS.z * 6.2831853;
  vec2 trav = aB.xy - aA.xy;
  p.xy += vec2(cos(ang), sin(ang)) * fly * uMorph.w * (0.3 + aS.y);
  p.xy += vec2(-trav.y, trav.x) * fly * uLife.w * (aS.w - 0.5);
  p.z += (aS.w - 0.5) * fly * uMorph.w * 1.6;
  // life at rest: a slow drift, every point on its own phase
  p.xy += uLife.y * vec2(sin(uLife.x * 0.9 + aS.x * 43.0), cos(uLife.x * 0.7 + aS.y * 39.0));
  vec3 col = mix(aCa.rgb, aCb.rgb, t);
  float size = uView.w * mix(aCa.w, aCb.w, t);
  // the focus: what is being measured takes the signal colour and keeps its own light and shade; the rest steps back
  vec2 fa = (p.xy - uFocA.xy) / max(uFocA.zw, vec2(1.0));
  vec2 fb = (p.xy - uFocB.xy) / max(uFocB.zw, vec2(1.0));
  float fk = clamp(max(uFocK.x * (1.0 - smoothstep(0.3, 1.0, dot(fa, fa))), uFocK.y * (1.0 - smoothstep(0.3, 1.0, dot(fb, fb)))), 0.0, 1.0);
  col = mix(col * (1.0 - uFocK.z), uTint * (dot(col, vec3(0.45)) + 0.04), fk * 0.9);
  size *= 1.0 + 0.25 * fk;
  // the gate: a front that crosses the cloud sideways; what it has not reached yet waits in the dark
  float gd = (p.x - uGate.x) / max(uGate.y, 1.0);
  float gg = exp(-gd * gd) * uGate.w;
  col *= mix(1.0, uGate.z, uGate.w * smoothstep(-0.3, 0.8, gd));
  col = mix(col, uTint * (0.55 + 0.9 * aS.y), clamp(gg, 0.0, 1.0));
  size *= 1.0 + gg * 0.6;
  // the scan plane: points light up and lift as it passes
  float sd = (p.y - uScan.x) / max(uScan.y, 1.0);
  float glow = exp(-sd * sd) * uScan.z;
  col = mix(col, uTint * (0.55 + 0.9 * aS.y), clamp(glow, 0.0, 1.0));
  p.z -= glow * 30.0;
  size *= 1.0 + glow * 0.8;
  float show = uScan.w > 0.5 ? smoothstep(uScan.x + 3.0, uScan.x - 22.0, p.y) : uScan.w < -0.5 ? smoothstep(uScan.x - 3.0, uScan.x + 22.0, p.y) : 1.0;
  // the turn, about the pivot, with a little perspective
  vec3 q = p - uPivot;
  float cy = cos(uView.x), sy = sin(uView.x);
  q.xz = vec2(q.x * cy + q.z * sy, q.z * cy - q.x * sy);
  float cp = cos(uView.y), sp = sin(uView.y);
  q.yz = vec2(q.y * cp - q.z * sp, q.z * cp + q.y * sp);
  float s = uView.z / max(uView.z + q.z, 1.0);
  vec2 scr = uPivot.xy + q.xy * s;
  gl_Position = vec4(scr.x / uRes.x * 2.0 - 1.0, 1.0 - scr.y / uRes.y * 2.0, 0.0, 1.0);
  size *= s * (1.0 + fly * 0.45);
  gl_PointSize = max(size, 1.0);
  vCol = col * uLife.z * show * min(1.0, size * size); // under a pixel, a point fades instead of popping
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  o = vec4(vCol * smoothstep(0.25, 0.03, dot(c, c)), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('points shader', gl.getShaderInfoLog(s)); return null; }
  return s;
}

// max: the most points a formation may hold. Returns null where WebGL2 is not available (the caller draws the photo).
export function createField(max = 150000) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VS), fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('points program', gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const U = Object.fromEntries(['uRes', 'uPivot', 'uMorph', 'uSweepDir', 'uView', 'uLife', 'uScan', 'uTint', 'uFocA', 'uFocB', 'uFocK', 'uGate'].map((k) => [k, gl.getUniformLocation(prog, k)]));

  // one fixed set of random numbers per point: its delay, its size, the way it bows out
  const seeds = new Float32Array(max * 4);
  let a = 0x9e3779b9;
  for (let i = 0; i < seeds.length; i++) { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; seeds[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const seedBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
  const slots = Array.from({ length: SLOTS }, () => {
    const pos = gl.createBuffer(), col = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos); gl.bufferData(gl.ARRAY_BUFFER, max * 12, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, col); gl.bufferData(gl.ARRAY_BUFFER, max * 16, gl.DYNAMIC_DRAW);
    return { pos, col, n: 0 };
  });
  for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 1);

  let alive = true;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; });

  return {
    canvas, max,
    get alive() { return alive && !gl.isContextLost(); },
    // upload a formation { pos: Float32Array(n·3), col: Float32Array(n·4), n } into a slot
    put(slot, f) {
      const s = slots[slot], n = Math.min(f.n, max);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.pos, 0, n * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.col); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.col, 0, n * 4);
      s.n = n;
    },
    count: (slot) => slots[slot].n,
    // one frame: the mix of formation `from` and formation `to`. focus: up to two { x, y, rx, ry, k } · gate: { x, width,
    // dim, k } · first / n: only that run of points · keep: draw over what this canvas already holds (several runs, each
    // on its own clock, in one picture)
    draw({ w, h, from = 0, to = from, mix = 0, delay = 0.7, sweep = 0, sweepDir = [0, 1], sweepNoise = 0.18, spread = 0, arc = 0.16, time = 0, drift = 0,
      gain = 1, size = 3.2, yaw = 0, pitch = 0, pivot = null, focal = 0, scan = null, tint = [0.776, 1, 0.239], n = 0, first = 0, keep = false, focus = null, focusDim = 0, gate = null }) {
      if (!this.alive) return false;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      if (!keep) gl.clear(gl.COLOR_BUFFER_BIT);
      const A = slots[from], B = slots[to], count = Math.max(0, Math.min(n || 1e9, Math.min(A.n, B.n) - first));
      if (!count) return true;
      gl.bindBuffer(gl.ARRAY_BUFFER, A.pos); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.pos); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, A.col); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.col); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
      const pv = pivot || [w / 2, h / 2, 0];
      gl.uniform2f(U.uRes, w, h);
      gl.uniform3f(U.uPivot, pv[0], pv[1], pv[2] || 0);
      gl.uniform4f(U.uMorph, mix, delay, sweep, spread);
      gl.uniform3f(U.uSweepDir, sweepDir[0], sweepDir[1], sweepNoise);
      gl.uniform4f(U.uView, yaw, pitch, focal || w * 2.4, size);
      gl.uniform4f(U.uLife, time, drift, gain, arc);
      if (scan) gl.uniform4f(U.uScan, scan.y, scan.width ?? 26, scan.strength ?? 1, scan.cut === true ? 1 : scan.cut || 0); else gl.uniform4f(U.uScan, -1e5, 1, 0, 0);
      gl.uniform3f(U.uTint, tint[0], tint[1], tint[2]);
      const fa = focus && focus[0], fb = focus && focus[1];
      gl.uniform4f(U.uFocA, fa ? fa.x : 0, fa ? fa.y : 0, fa ? fa.rx : 1, fa ? fa.ry : 1);
      gl.uniform4f(U.uFocB, fb ? fb.x : 0, fb ? fb.y : 0, fb ? fb.rx : 1, fb ? fb.ry : 1);
      gl.uniform4f(U.uFocK, fa ? fa.k ?? 1 : 0, fb ? fb.k ?? 1 : 0, focus ? focusDim : 0, 0);
      if (gate) gl.uniform4f(U.uGate, gate.x, gate.width ?? 26, gate.dim ?? 0.2, gate.k ?? 1); else gl.uniform4f(U.uGate, 0, 1, 1, 0);
      gl.drawArrays(gl.POINTS, first, count);
      return true;
    },
  };
}
