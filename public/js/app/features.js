// Face isolation and photo signals, shared by the scan and the dataset extraction.
//   isolateFace(canvas, points)  224×224 crop of the face oval (+ hair above it), soft-masked onto neutral grey, with
//                                the light and colour of the face normalised: background, clothing and colour cast
//                                no longer reach the raters.
//   faceSignals(points)          smile, mouth opening, mouth width: pose/expression covariates the model corrects for.

const GREY = 128;

// convex hull of all landmarks (monotone chain): unlike the oval's fixed order it never folds on a turned head
function hull(ps) {
  const p = ps.slice(0, 478).map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function outline(points) {
  const pts = hull(points);
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const top = Math.min(...pts.map((p) => p.y)), bottom = Math.max(...pts.map((p) => p.y)), h = bottom - top;
  // widen 10 %, and lift the upper half so the hair stays in (the oval stops at the hairline)
  return pts.map((p) => {
    const up = p.y < cy ? 0.28 * h * ((cy - p.y) / (cy - top)) : 0;
    return { x: cx + (p.x - cx) * 1.1, y: cy + (p.y - cy) * 1.06 - up };
  });
}

export function isolateFace(canvas, points, { size = 224, normalise = true } = {}) {
  const poly = outline(points);
  const x0 = Math.min(...poly.map((p) => p.x)), x1 = Math.max(...poly.map((p) => p.x));
  const y0 = Math.min(...poly.map((p) => p.y)), y1 = Math.max(...poly.map((p) => p.y));
  const s = Math.max(x1 - x0, y1 - y0) * 1.08, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const k = size / s, ox = cx - s / 2, oy = cy - s / 2;
  // the soft mask
  const mask = document.createElement('canvas'); mask.width = mask.height = size;
  const mg = mask.getContext('2d');
  mg.filter = `blur(${Math.round(size / 56)}px)`;
  mg.beginPath(); poly.forEach((p, i) => (i ? mg.lineTo : mg.moveTo).call(mg, (p.x - ox) * k, (p.y - oy) * k)); mg.closePath();
  mg.fillStyle = '#fff'; mg.fill();
  // the face, cut out
  const face = document.createElement('canvas'); face.width = face.height = size;
  const fg = face.getContext('2d', { willReadFrequently: true });
  fg.imageSmoothingQuality = 'high';
  fg.drawImage(canvas, ox, oy, s, s, 0, 0, size, size);
  const fd = fg.getImageData(0, 0, size, size), md = mg.getImageData(0, 0, size, size).data, d = fd.data;
  if (normalise) { // grey-world + fixed contrast, measured inside the mask only
    const m = [0, 0, 0], v = [0, 0, 0]; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (md[i + 3] > 200) { n++; for (let c = 0; c < 3; c++) m[c] += d[i + c]; }
    for (let c = 0; c < 3; c++) m[c] /= n || 1;
    for (let i = 0; i < d.length; i += 4) if (md[i + 3] > 200) for (let c = 0; c < 3; c++) v[c] += (d[i + c] - m[c]) ** 2;
    const sd = v.map((q) => Math.sqrt(q / (n || 1)) || 1), T = [[150, 48], [118, 44], [102, 42]];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, T[c][0] + ((d[i + c] - m[c]) / sd[c]) * T[c][1]));
  }
  for (let i = 0; i < d.length; i += 4) { const a = md[i + 3] / 255; for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * a + GREY * (1 - a); d[i + 3] = 255; }
  fg.putImageData(fd, 0, 0);
  return face;
}

export function mirror(canvas) {
  const o = document.createElement('canvas'); o.width = canvas.width; o.height = canvas.height;
  const g = o.getContext('2d'); g.translate(o.width, 0); g.scale(-1, 1); g.drawImage(canvas, 0, 0);
  return o;
}

export function faceSignals(p) {
  const d = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
  const faceH = d(10, 152) || 1, faceW = d(234, 454) || 1;
  const lipMidY = (p[13].y + p[14].y) / 2, cornerY = (p[61].y + p[291].y) / 2;
  // tilt-free: measure along the face's own vertical axis
  const ax = (p[152].x - p[10].x) / faceH, ay = (p[152].y - p[10].y) / faceH;
  const along = (q) => (q.x * ax + q.y * ay);
  const smile = (along({ x: (p[13].x + p[14].x) / 2, y: lipMidY }) - along({ x: (p[61].x + p[291].x) / 2, y: cornerY })) / faceH;
  return { smile, mouthOpen: d(13, 14) / faceH, mouthWidth: d(61, 291) / faceW };
}
