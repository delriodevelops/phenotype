// A face as the cards use it, and the censor switch: share a result without showing the face.
//   makeBust(canvas, points)  the 5:7 crop of one face (sample.js) with its landmarks. prepare() cuts the person
//                             from the background (matte.js), once; read(mode) is the crop analysed for the stage
//                             and the cards, once per censor mode (so the reveal, the card and the video all show the
//                             same version, and a censored share never carries the original)
// Modes: visible · blurred · pixelated · hidden. Remembered locally.
import { bustOf, analyse } from './sample.js';
import { matteOf } from './matte.js';

const KEY = 'phenotype:censor';
export const MODES = [['none', 'Visible'], ['blur', 'Difuminada'], ['pixel', 'Pixelada'], ['hide', 'Oculta']];
export function currentCensor() { try { return localStorage.getItem(KEY) || 'none'; } catch { return 'none'; } }
export function saveCensor(m) { try { localStorage.setItem(KEY, m); } catch {} }

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function censored(src, mode) {
  if (mode === 'none') return src;
  const w = src.width, h = src.height, out = mk(w, h), g = out.getContext('2d');
  if (mode === 'blur') { // shrink and grow back twice: a blur that needs no ctx.filter (Safari has none on canvas)
    const a = mk(Math.max(2, Math.round(w / 26)), Math.max(2, Math.round(h / 26))), b = mk(Math.round(w / 6), Math.round(h / 6));
    const ag = a.getContext('2d'), bg = b.getContext('2d');
    ag.imageSmoothingQuality = 'high'; ag.drawImage(src, 0, 0, a.width, a.height);
    bg.imageSmoothingQuality = 'high'; bg.drawImage(a, 0, 0, b.width, b.height);
    g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, w, h);
  } else if (mode === 'pixel') {
    const s = mk(11, Math.round((11 * h) / w));
    s.getContext('2d').drawImage(src, 0, 0, s.width, s.height);
    g.imageSmoothingEnabled = false; g.drawImage(s, 0, 0, w, h);
  } else { // hide: nothing of the face, a question mark in its place
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d7dde5'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(w * 0.62)}px Unbounded, ui-sans-serif, sans-serif`; g.fillText('?', w / 2, h * 0.47);
  }
  return out;
}

export function makeBust(canvas, points) {
  const b = bustOf(canvas, points), cache = new Map();
  let thumb = null, matte = null, ready = null;
  return {
    photo: b.canvas, lm: b.lm,
    // cut the person from the background, once. Until it has run (or where it cannot), read() works from the
    // landmarks alone; when the matte arrives, what was read without it is read again.
    prepare() { return (ready ??= matteOf(b.canvas).then((m) => { if (m) { matte = m; cache.clear(); thumb = null; } })); },
    read(mode = 'none') {
      if (!cache.has(mode)) cache.set(mode, analyse(censored(b.canvas, mode), mode === 'hide' ? null : b.lm, { matte }));
      return cache.get(mode);
    },
    // a small JPEG of the cut-out on the ground colour, for lists and the face picker
    thumb() {
      if (!thumb) { const c = mk(120, 168), g = c.getContext('2d'); g.fillStyle = '#0a0d12'; g.fillRect(0, 0, 120, 168); g.drawImage(this.read('none').cut, 0, 0, 120, 168); thumb = c.toDataURL('image/jpeg', 0.85); }
      return thumb;
    },
  };
}
