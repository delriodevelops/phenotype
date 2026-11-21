// Small geometry helpers shared by the scan.
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

// PSL → the 0–10 face score used by the SMV formula (score.js)
export const faceFromPsl = (psl) => 5 + (psl - 4) / 0.85;

// bounding box of the face oval (landmarks), or a centred square when there are none
export function faceBox(canvas, points) {
  if (!points) { const s = Math.min(canvas.width, canvas.height) * 0.62; return { cx: canvas.width / 2, cy: canvas.height * 0.45, w: s, h: s }; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of OVAL) { const p = points[i]; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
