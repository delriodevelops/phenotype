// The result's controls, shared by the card, the versus and the tier list: the format switch (Story 9:16 · X 16:9),
// share, video, download, replay and the censor switch. The canvas is the stage's own (stage.js): the reveal plays
// where the face already is, and what is on it at the end is exactly what gets shared.
//   build(fmt, mode) → a card.js scene for that format and that censor mode
import { fontsReady, canvasFile, shareFile, recordCanvas, videoType } from './card.js';
import { MODES, currentCensor, saveCensor } from './censor.js';

const FKEY = 'phenotype:format';
const fmtNow = () => { try { return localStorage.getItem(FKEY) || 'story'; } catch { return 'story'; } };
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

// fullscreen: also a button that gives the canvas the whole screen (the tier list, which is looked into by clicking)
export function shareableMarkup({ fullscreen = false } = {}) {
  const f = fmtNow(), c = currentCensor();
  return `
    <div class="tools">
      <div class="share">
        <button type="button" class="btn btn--go" data-share>Compartir</button>
        <button type="button" class="btn" data-post-x>Publicar en X</button>
        ${videoType() ? '<button type="button" class="btn" data-video>Vídeo</button>' : ''}
        <button type="button" class="btn" data-download>Descargar</button>
        <button type="button" class="btn btn--quiet" data-replay>Ver otra vez</button>
        ${fullscreen ? '<button type="button" class="btn" data-fullscreen>Pantalla completa</button>' : ''}
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
  let fmt = fmtNow(), mode = currentCensor(), busy = false, scene = null;
  // The page never runs ahead of the reveal: whatever carries data-at="<cue>" stays held until the scene reaches
  // that cue (card.js: scene.cues, in seconds; an unknown cue waits for the end).
  const held = [...root.querySelectorAll('[data-at]')];
  const sync = (s) => held.forEach((el) => el.classList.toggle('is-held', !scene || s < (scene.cues?.[el.dataset.at] ?? scene.cues?.end ?? scene.ms / 1000)));
  sync(0);
  await fontsReady();
  scene = build(fmt, mode);
  const note = root.querySelector('[data-share-note]');
  const set = (attr, val) => root.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute(attr) === val)));
  const rebuild = () => { scene = build(fmt, mode); stage.run(scene, { from: scene.again, onTime: sync }); };

  root.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => {
    if (busy || b.dataset.fmt === fmt) return;
    fmt = b.dataset.fmt; try { localStorage.setItem(FKEY, fmt); } catch {}
    set('data-fmt', fmt); rebuild();
  }));
  root.querySelectorAll('[data-censor]').forEach((b) => b.addEventListener('click', () => {
    if (busy || b.dataset.censor === mode) return;
    mode = b.dataset.censor; saveCensor(mode); set('data-censor', mode); rebuild();
  }));
  // The specimen window over the whole page: the canvas keeps its shape and its clicks. The page does it itself (a
  // class on the window), so it works where a browser has no fullscreen of its own (an iPhone); where it has, the
  // browser chrome goes too. The button in the window, Esc or the browser's own way out all leave.
  const view = stage.canvas.closest('[data-view]');
  const leave = () => { view.classList.remove('is-full'); document.documentElement.style.overflow = ''; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  root.querySelector('[data-fullscreen]')?.addEventListener('click', () => {
    if (!view.querySelector('.view__exit')) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--sm view__exit', textContent: 'Salir ×' });
      b.addEventListener('click', leave); view.append(b);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view.classList.contains('is-full')) leave(); });
      document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && view.classList.contains('is-full')) leave(); });
    }
    view.classList.add('is-full'); document.documentElement.style.overflow = 'hidden';
    view.requestFullscreen?.().catch(() => {}); // without it the window still fills the page
  });
  root.querySelector('[data-replay]').addEventListener('click', () => { if (!busy) stage.run(scene, { full: true, onTime: sync }); });

  const still = async () => { stage.settle(); sync(Infinity); return canvasFile(stage.canvas, `${name}-${fmt}`); };
  const save = (file) => {
    const url = URL.createObjectURL(file), a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  root.querySelector('[data-share]').addEventListener('click', async () => {
    if (busy) return;
    const r = await shareFile(await still(), `${text} ${location.origin}`);
    note.textContent = r === 'shared' ? '¡Compartido!' : r === 'downloaded' ? 'Tu navegador no comparte imágenes: la he descargado para que la subas.' : '';
  });
  root.querySelector('[data-download]').addEventListener('click', async () => {
    if (busy) return;
    save(await still());
    note.textContent = 'Imagen descargada.';
  });
  // one click, nothing to write: the post opens with its text, and the 16:9 card is saved to attach. No link in the
  // post (the card prints the address, and X shows posts with links to fewer people).
  // X's intent cannot carry an image, so the card is downloaded; the window opens first, inside the click, or it is blocked.
  root.querySelector('[data-post-x]').addEventListener('click', async () => {
    if (busy) return;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    if (fmt !== 'x') { fmt = 'x'; try { localStorage.setItem(FKEY, fmt); } catch {} set('data-fmt', fmt); scene = build(fmt, mode); stage.run(scene, { from: scene.again, onTime: sync }); }
    save(await still());
    note.textContent = 'Texto listo en X y tarjeta descargada: arrástrala al post y publica.';
  });
  // the reveal itself as a file: the whole thing from the photo, then the card held for a moment
  root.querySelector('[data-video]')?.addEventListener('click', async (e) => {
    if (busy) return;
    busy = true; root.classList.add('is-recording'); const btn = e.currentTarget, label = btn.textContent; btn.textContent = 'Grabando…';
    note.textContent = `Grabando el revelado (${Math.round(scene.ms / 1000) + 1} s). No cambies de pestaña.`;
    try {
      const file = await recordCanvas(stage.canvas, `${name}-${fmt}`, async () => {
        await Promise.race([stage.run(scene, { full: true, onTime: sync }), wait(scene.ms + 4000)]);
        const until = performance.now() + 1100; // hold the card: redrawing it keeps frames coming
        while (performance.now() < until) { stage.settle(); await Promise.race([new Promise((ok) => requestAnimationFrame(ok)), wait(60)]); }
      });
      if (!file || !file.size) note.textContent = 'Este navegador no graba vídeo. Usa Compartir o Descargar.';
      else { const r = await shareFile(file, text); note.textContent = r === 'shared' ? '¡Vídeo compartido!' : r === 'downloaded' ? `Vídeo descargado (${file.name.endsWith('mp4') ? 'MP4' : 'WebM'}).` : ''; }
    } catch (err) { console.warn('video', err); note.textContent = 'No se pudo grabar el vídeo en este navegador.'; }
    busy = false; root.classList.remove('is-recording'); btn.textContent = label; stage.settle(); sync(Infinity);
  });

  await stage.run(scene, { full, onTime: sync });
}
