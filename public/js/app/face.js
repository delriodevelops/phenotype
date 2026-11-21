// Face mesh (MediaPipe FaceLandmarker, 478 points incl. irises) → 2D facial ratios used by the report.
// Everything runs in the browser; the model loads lazily on the first photo.
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// the MediaPipe vision runtime, loaded once: the landmarks here and the segmenter of matte.js share it
let visionP = null;
export function vision() {
  visionP ??= (async () => { const lib = await import(`${CDN}/vision_bundle.mjs`); return { lib, files: await lib.FilesetResolver.forVisionTasks(`${CDN}/wasm`) }; })();
  visionP.catch(() => { visionP = null; });
  return visionP;
}

let landmarkerP = null;
export function loadLandmarker() {
  landmarkerP ??= (async () => {
    const { lib: { FaceLandmarker }, files } = await vision();
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'IMAGE', numFaces: 8 });
    try { return await FaceLandmarker.createFromOptions(files, opts('GPU')); }
    catch { return FaceLandmarker.createFromOptions(files, opts('CPU')); }
  })();
  landmarkerP.catch(() => { landmarkerP = null; });
  return landmarkerP;
}

// Ideal ranges shown in the report (2D frontal estimates).
export const IDEALS = {
  canthal_tilt_deg: { label: 'Canthal tilt', unit: '°', lo: 4, hi: 8, min: -6, max: 12, note: 'Inclinación del eje intercantal; positivo = canto externo más alto' },
  fwhr: { label: 'FWHR', unit: '', lo: 1.85, hi: 2.05, min: 1.5, max: 2.3, note: 'Anchura bizigomática ÷ altura glabela–labio superior' },
  esr: { label: 'ESR', unit: '', lo: 0.44, hi: 0.48, min: 0.38, max: 0.54, note: 'Distancia interpupilar ÷ anchura bizigomática' },
  midface_ratio: { label: 'Midface ratio', unit: '', lo: 0.95, hi: 1.05, min: 0.8, max: 1.25, note: 'IPD ÷ altura pupila–labio superior' },
  jaw_ratio: { label: 'Bigonial / bizigomático', unit: '', lo: 0.86, hi: 0.94, min: 0.7, max: 1.05, note: 'Anchura mandibular relativa' },
  chin_philtrum: { label: 'Mentón / philtrum', unit: '×', lo: 2.0, hi: 2.4, min: 1.2, max: 3.2, note: 'Altura del mentón ÷ altura del philtrum' },
  nose_ratio: { label: 'Alar / intercantal', unit: '', lo: 0.95, hi: 1.1, min: 0.75, max: 1.45, note: 'Anchura nasal ÷ distancia intercantal' },
  lip_ratio: { label: 'Labio inf. / sup.', unit: '', lo: 1.4, hi: 1.8, min: 0.8, max: 2.6, note: 'Altura del labio inferior ÷ superior' },
  third_lower: { label: 'Tercio inferior', unit: '%', lo: 32, hi: 36, min: 26, max: 42, note: 'Subnasal–mentón sobre la altura facial medida' },
  symmetry: { label: 'Simetría bilateral', unit: '/100', lo: 88, hi: 100, min: 60, max: 100, note: 'Desviación media de pares respecto al eje medio' },
};

const P = {
  outerL: 33, innerL: 133, innerR: 362, outerR: 263, irisL: 468, irisR: 473,
  zygL: 234, zygR: 454, gonL: 172, gonR: 397, glabella: 9, top: 10, subnasale: 2, upperLip: 0, stomionU: 13, stomionL: 14,
  lowerLip: 17, menton: 152, alarL: 129, alarR: 358, noseTip: 1,
};
const PAIRS = [[33, 263], [133, 362], [234, 454], [172, 397], [129, 358], [61, 291], [70, 300], [105, 334], [58, 288], [136, 365]];

// every face in the photo (up to 8), largest first
export async function detectAll(canvas) {
  const lm = await loadLandmarker();
  const out = lm.detect(canvas);
  const W = canvas.width, H = canvas.height;
  return (out.faceLandmarks || []).map((pts) => {
    const p = pts.map((q) => ({ x: q.x * W, y: q.y * H, z: (q.z || 0) * W }));
    // how open the mouth is (inner-lip gap / face height; > ~.04 = smile or talking)
    const faceH = Math.hypot(p[152].x - p[10].x, p[152].y - p[10].y) || 1;
    const mouthOpen = Math.hypot(p[14].x - p[13].x, p[14].y - p[13].y) / faceH;
    // chin up/down: nose tip between the eye line (0) and the chin (1); about .33–.45 when facing the camera
    const eyeY = (p[33].y + p[263].y) / 2, pitch = (p[1].y - eyeY) / ((p[152].y - eyeY) || 1);
    return { points: p, metrics: measure(p, W, H), mouthOpen, pitch, size: faceH };
  }).sort((a, b) => b.size - a.size).map((f, i, all) => ({ ...f, faces: all.length }));
}

// the main (largest) face, or null
export async function detect(canvas) {
  return (await detectAll(canvas))[0] || null;
}

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

export function measure(p, W, H) {
  // roll-correct: rotate every point so the intercanthal axis is horizontal
  const roll = Math.atan2(p[P.innerR].y - p[P.innerL].y, p[P.innerR].x - p[P.innerL].x);
  const c = { x: (p[P.innerL].x + p[P.innerR].x) / 2, y: (p[P.innerL].y + p[P.innerR].y) / 2 };
  const cos = Math.cos(-roll), sin = Math.sin(-roll);
  const q = p.map((v) => ({ x: c.x + (v.x - c.x) * cos - (v.y - c.y) * sin, y: c.y + (v.x - c.x) * sin + (v.y - c.y) * cos }));

  // canthal tilt: outer corner above the inner one = positive (image y grows downward)
  const tiltL = Math.atan2(q[P.innerL].y - q[P.outerL].y, q[P.innerL].x - q[P.outerL].x) * 180 / Math.PI;
  const tiltR = Math.atan2(q[P.innerR].y - q[P.outerR].y, q[P.outerR].x - q[P.innerR].x) * 180 / Math.PI;
  const bizyg = d(q[P.zygL], q[P.zygR]);
  const bigon = d(q[P.gonL], q[P.gonR]);
  const ipd = d(q[P.irisL], q[P.irisR]);
  const pupilY = (q[P.irisL].y + q[P.irisR].y) / 2;
  const upperFace = q[P.upperLip].y - q[P.glabella].y;
  const midH = q[P.upperLip].y - pupilY;
  const faceH = q[P.menton].y - q[P.top].y;
  const philtrum = q[P.upperLip].y - q[P.subnasale].y;
  const chin = q[P.menton].y - q[P.lowerLip].y;
  const upLip = q[P.stomionU].y - q[P.upperLip].y;
  const loLip = q[P.lowerLip].y - q[P.stomionL].y;
  const icd = d(q[P.innerL], q[P.innerR]);
  const alar = d(q[P.alarL], q[P.alarR]);

  // symmetry: mirror each pair across the facial midline (glabella–menton), mean deviation vs face width
  const mid = (q[P.glabella].x + q[P.menton].x) / 2;
  let dev = 0;
  for (const [a, b] of PAIRS) dev += Math.hypot((mid - q[a].x) - (q[b].x - mid), q[a].y - q[b].y);
  const symmetry = Math.max(0, 100 - (dev / PAIRS.length / bizyg) * 900);

  // yaw: nose tip offset from the cheek midpoint, as a share of face width
  const yaw = ((q[P.noseTip].x - (q[P.zygL].x + q[P.zygR].x) / 2) / bizyg) * 90;

  return {
    canthal_tilt_deg: r((tiltL + tiltR) / 2, 1),
    canthal_tilt_lr: [r(tiltL, 1), r(tiltR, 1)],
    fwhr: r(bizyg / upperFace),
    esr: r(ipd / bizyg, 3),
    midface_ratio: r(ipd / midH),
    jaw_ratio: r(bigon / bizyg),
    chin_philtrum: r(chin / philtrum),
    nose_ratio: r(alar / icd),
    lip_ratio: r(loLip / Math.max(1, upLip)),
    thirds: [r(((q[P.glabella].y - q[P.top].y) / faceH) * 100, 1), r(((q[P.subnasale].y - q[P.glabella].y) / faceH) * 100, 1), r(((q[P.menton].y - q[P.subnasale].y) / faceH) * 100, 1)],
    third_lower: r(((q[P.menton].y - q[P.subnasale].y) / faceH) * 100, 1),
    symmetry: r(symmetry, 0),
    yaw_deg: r(yaw, 1),
    roll_deg: r((roll * 180) / Math.PI, 1),
    face_px: Math.round(bizyg),
    image: [W, H],
  };
}

// Draw the analysis overlay: the canthal axes, the FWHR box and the jaw line, in red chalk. No mesh and no dots on a
// face, ever (the `mesh` option is kept for callers and ignored): a measured span ends in short perpendicular ticks.
export function drawOverlay(ctx, pts, { accent = '#9c3b1e', ink = '#f1ebe0', scale = 1 } = {}) {
  if (!pts) return;
  const W = ctx.canvas.width;
  const lw = Math.max(1, W / 700) * scale;
  ctx.save();
  ctx.lineCap = 'round';
  const line = (a, b, color = accent, dash = []) => { ctx.strokeStyle = color; ctx.lineWidth = lw * 1.4; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  const tick = (p, a, b, s = lw * 6) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; line({ x: p.x + (dy / l) * s, y: p.y - (dx / l) * s }, { x: p.x - (dy / l) * s, y: p.y + (dx / l) * s }); };
  const ext = (a, b, k = 0.35) => [{ x: a.x - (b.x - a.x) * k, y: a.y - (b.y - a.y) * k }, { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k }];
  // canthal axes
  for (const [i, o] of [[P.innerL, P.outerL], [P.innerR, P.outerR]]) { const [a, b] = ext(pts[i], pts[o]); line(a, b); tick(a, a, b); tick(b, a, b); }
  // FWHR box
  const zl = pts[P.zygL], zr = pts[P.zygR], gl = pts[P.glabella], ul = pts[P.upperLip];
  ctx.strokeStyle = accent; ctx.lineWidth = lw; ctx.setLineDash([lw * 5, lw * 4]);
  ctx.strokeRect(zl.x, gl.y, zr.x - zl.x, ul.y - gl.y);
  // jaw line
  const jaw = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];
  ctx.setLineDash([]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.8; ctx.lineWidth = lw * 1.2; ctx.beginPath();
  jaw.forEach((i, k) => (k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y))); ctx.stroke();
  ctx.restore();
}
