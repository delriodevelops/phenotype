// The result's controls, shared by the card, the versus and the tier list: the format switch (Story 9:16 · X 16:9),
// share, video, download, replay and the censor switch. The canvas is the stage's own (stage.js): the reveal plays
// where the face already is, and what is on it at the end is exactly what gets shared.
//   build(fmt, mode) → a card.js scene for that format and that censor mode
import { fontsReady, canvasFile, shareFile, recordCanvas, videoType } from './card.js';
import { MODES, currentCensor, saveCensor } from './censor.js';

const FKEY = 'phenotype:format';
const fmtNow = () => { try { return localStorage.getItem(FKEY) || 'story'; } catch { return 'story'; } };
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function shareableMarkup() {
  const f = fmtNow(), c = currentCensor();
  return `
    <div class="tools">
      <div class="share">
        <button type="button" class="btn btn--go" data-share>Compartir</button>
        ${videoType() ? '<button type="button" class="btn" data-video>Vídeo</button>' : ''}
        <button type="button" class="btn" data-download>Descargar</button>
        <button type="button" class="btn btn--quiet" data-replay>Ver otra vez</button>
      </div>
      <div class="tools__row"><span class="label">Formato</span><div class="seg" role="radiogroup" aria-label="Formato">
        <button type="button" role="radio" data-fmt="story" aria-checked="${f === 'story'}">Story 9:16</button>
        <button type="button" role="radio" data-fmt="x" aria-checked="${f === 'x'}">X 16:9</button>
      </div></div>
      <div class="tools__row"><span class="label">Cara</span><div class="seg" role="radiogroup" aria-label="Mostrar la cara">${MODES.map(([v, t]) => `<button type="button" role="radio" data-censor="${v}" aria-checked="${v === c}">${t}</button>`).join('')}</div></div>
      <p class="note" data-share-note aria-live="polite"></p>
    </div>`;
}

export async function mountShareable(root, { stage, build, name, text, full = false }) {
  let fmt = fmtNow(), mode = currentCensor(), busy = false;
  await fontsReady();
  let scene = build(fmt, mode);
  const note = root.querySelector('[data-share-note]');
  const set = (attr, val) => root.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute(attr) === val)));
  const rebuild = () => { scene = build(fmt, mode); stage.run(scene, { from: scene.again }); };

  root.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => {
    if (busy || b.dataset.fmt === fmt) return;
    fmt = b.dataset.fmt; try { localStorage.setItem(FKEY, fmt); } catch {}
    set('data-fmt', fmt); rebuild();
  }));
  root.querySelectorAll('[data-censor]').forEach((b) => b.addEventListener('click', () => {
    if (busy || b.dataset.censor === mode) return;
    mode = b.dataset.censor; saveCensor(mode); set('data-censor', mode); rebuild();
  }));
  root.querySelector('[data-replay]').addEventListener('click', () => { if (!busy) stage.run(scene, { full: true }); });

  const still = async () => { stage.settle(); return canvasFile(stage.canvas, `${name}-${fmt}`); };
  root.querySelector('[data-share]').addEventListener('click', async () => {
    if (busy) return;
    const r = await shareFile(await still(), text);
    note.textContent = r === 'shared' ? '¡Compartido!' : r === 'downloaded' ? 'Tu navegador no comparte imágenes: la he descargado para que la subas.' : '';
  });
  root.querySelector('[data-download]').addEventListener('click', async () => {
    if (busy) return;
    const file = await still(), url = URL.createObjectURL(file), a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    note.textContent = 'Imagen descargada.';
  });
  // the reveal itself as a file: the whole thing from the photo, then the card held for a moment
  root.querySelector('[data-video]')?.addEventListener('click', async (e) => {
    if (busy) return;
    busy = true; root.classList.add('is-recording'); const btn = e.currentTarget, label = btn.textContent; btn.textContent = 'Grabando…';
    note.textContent = `Grabando el revelado (${Math.round(scene.ms / 1000) + 1} s). No cambies de pestaña.`;
    try {
      const file = await recordCanvas(stage.canvas, `${name}-${fmt}`, async () => {
        await Promise.race([stage.run(scene, { full: true }), wait(scene.ms + 4000)]);
        const until = performance.now() + 1100; // hold the card: redrawing it keeps frames coming
        while (performance.now() < until) { stage.settle(); await Promise.race([new Promise((ok) => requestAnimationFrame(ok)), wait(60)]); }
      });
      if (!file || !file.size) note.textContent = 'Este navegador no graba vídeo. Usa Compartir o Descargar.';
      else { const r = await shareFile(file, text); note.textContent = r === 'shared' ? '¡Vídeo compartido!' : r === 'downloaded' ? `Vídeo descargado (${file.name.endsWith('mp4') ? 'MP4' : 'WebM'}).` : ''; }
    } catch (err) { console.warn('video', err); note.textContent = 'No se pudo grabar el vídeo en este navegador.'; }
    busy = false; root.classList.remove('is-recording'); btn.textContent = label; stage.settle();
  });

  await stage.run(scene, { full });
}
