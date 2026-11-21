// The specimen window: one canvas for the whole visit. A face is either the photograph it is or the cloud of points
// the analysis makes of it, and the scan line is what turns one into the other.
//   attract   nobody has uploaded anything: the case face walks the seven tiers as points, reorganising between them
//   faces     the visitor's photo: the scan line wipes whatever is there and leaves the face(s) as photographs,
//             cut from their background
//   scan      "Medir": the line passes again and the photograph becomes points; while the engine measures, the scan
//             plane keeps crossing them
//   run       a card scene (card.js) takes the same canvas and the same points: the number, then the face given back
import { createField } from './points.js';
import { PAPER, ACID, placeBust, compose } from './sample.js';
import { SIZES, NEUTRAL, wall, ground, ghost, cloud, photoIn, scanLine, play } from './card.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const io = (x) => x * x * (3 - 2 * x);

export function createStage(canvas, view) {
  const ctx = canvas.getContext('2d');
  const small = matchMedia('(max-width: 860px)').matches || (navigator.deviceMemory || 8) <= 4;
  const field = new URLSearchParams(location.search).has('nogl') ? null : createField(small ? 110000 : 150000); // ?nogl: the fallback, for testing
  const reduced = document.documentElement.dataset.motion === 'reduced';
  const [W, H] = SIZES.story, born = performance.now();
  let raf = 0, live = false, seen = true, scene = null, playId = 0;
  // cur: what is on the stage: { items: [{ an, rect, x0?, x1? }], slot, as: 'points' | 'photos' }
  // old: what the scan line is wiping away · wipe: that line in flight · next / morph: points becoming other points
  let cur = null, old = null, wipe = null, next = null, morph = null;
  let scanning = 0, scanned = Promise.resolve();
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false };

  function build(items) {
    if (!field || !items.length) return null;
    const n = field.max, per = Math.floor(n / items.length);
    const parts = items.map((it, i) => placeBust(it.an.sample(i === items.length - 1 ? n - per * i : per), it.rect, { acid: NEUTRAL }));
    return parts.length === 1 ? parts[0] : compose(parts);
  }
  const itemsOf = (busts) => { const at = wall(busts.length); return busts.map((an, i) => ({ an, ...at[i] })); }; // where faces wait: card.js wall()
  const freeSlot = () => (cur ? 1 - cur.slot : 0);
  const span = (...groups) => { let a = 1e9, b = -1e9; for (const g of groups) for (const it of g || []) { a = Math.min(a, it.rect.y); b = Math.max(b, it.rect.y + it.rect.h); } return a > b ? [0, H] : [a, b]; };
  function finish() { // whatever is in flight ends at once
    if (morph) { cur = { ...next, as: 'points' }; next = null; morph = null; }
    if (wipe) { const w = wipe; wipe = null; old = null; cur.as = w.to; w.done?.(); }
  }

  // points → other points (the tour of the tiers)
  function show(busts, ms = 1300) {
    finish();
    const items = itemsOf(busts), slot = freeSlot(), f = build(items);
    if (f) field.put(slot, f);
    if (!cur || cur.as !== 'points' || reduced || !ms) { cur = { items, slot, as: 'points' }; old = null; } else { next = { items, slot }; morph = { start: performance.now(), ms }; }
    kick();
  }
  // whatever is there → these faces as photographs, under one pass of the scan line
  function photos(busts) {
    finish();
    const items = itemsOf(busts), slot = freeSlot(), f = build(items), was = cur;
    if (f) field.put(slot, f);
    cur = { items, slot, as: 'photos' };
    if (!was || reduced) { old = null; kick(); return Promise.resolve(); }
    old = was;
    return new Promise((done) => { wipe = { start: performance.now(), ms: 850, to: 'photos', span: span(items, was.items), done }; kick(); });
  }

  const picture = (it, o) => photoIn(ctx, it.an.cut, it.rect, { x0: it.x0, x1: it.x1, ...o });
  const shade = (items, a) => { for (const it of items) ghost(ctx, it.an, it.rect, (field ? 0.15 : 0.95) * a); };
  const clipped = (y0, y1, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip(); fn(); ctx.restore(); };

  function frame(now) {
    raf = 0;
    if (!live) return;
    const time = (now - born) / 1000;
    ptr.x += (ptr.tx - ptr.x) * 0.07; ptr.y += (ptr.ty - ptr.y) * 0.07;
    ground(ctx, W, H);
    if (!cur) return;
    if (wipe) {
      const p = clamp((now - wipe.start) / wipe.ms), [a, b] = wipe.span, line = a - 24 + (b - a + 48) * io(p);
      if (wipe.to === 'photos') { // above the line: the photographs; under it: what was there
        for (const it of cur.items) picture(it, { bottom: line });
        if (old && old.as === 'photos') for (const it of old.items) picture(it, { top: line });
        else if (old) { clipped(line, H, () => shade(old.items, 1)); cloud(ctx, field, W, H, { from: old.slot, time, size: 3, gain: 0.78, scan: { y: line, cut: -1, width: 34, strength: 1 } }); }
      } else { // above the line: the points the analysis works on; under it: still the photograph
        for (const it of cur.items) picture(it, { top: line });
        clipped(0, line, () => shade(cur.items, 1));
        cloud(ctx, field, W, H, { from: cur.slot, time, size: 3, gain: 0.78, scan: { y: line, cut: 1, width: 34, strength: 1 } });
      }
      scanLine(ctx, 60, line, W - 120, 1);
      if (p >= 1) { const w = wipe; wipe = null; old = null; cur.as = w.to; w.done?.(); }
    } else if (cur.as === 'photos') {
      for (const it of cur.items) picture(it, {});
    } else {
      const still = reduced || scanning;
      const yaw = still ? 0 : ptr.on ? ptr.x * 0.3 : Math.sin(time * 0.55) * 0.11, pitch = still ? 0 : ptr.on ? -ptr.y * 0.12 : 0;
      let m = 0;
      if (morph) { m = clamp((now - morph.start) / morph.ms); if (m >= 1) { cur = { ...next, as: 'points' }; next = null; morph = null; m = 0; } }
      const flat = 1 - Math.min(1, Math.abs(yaw) * 6); // the monochrome under the cloud is flat: it steps back while the cloud turns
      shade(cur.items, flat * (next ? 1 - io(m) : 1));
      if (next) shade(next.items, flat * io(m));
      const one = cur.items.length === 1 ? cur.items[0].rect : null;
      let scan = null;
      if (scanning) { const [a, b] = span(cur.items), k = ((now - scanning) / 1700) % 2, p = k < 1 ? io(k) : io(2 - k); scan = { y: a + (b - a) * p, width: 44, strength: 1 }; }
      cloud(ctx, field, W, H, {
        from: cur.slot, to: next ? next.slot : cur.slot, mix: io(m), delay: 0.7, sweep: 0.35, sweepDir: [0, 1], spread: 46, arc: 0.2,
        time, drift: reduced ? 0 : 1.3, yaw, pitch, pivot: one ? [one.x + one.w / 2, one.y + one.h * 0.5, 0] : [W / 2, H / 2, 0], size: 3, gain: 0.78, scan,
      });
      if (scan) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#c6ff3d'; ctx.fillRect(60, scan.y - 1.5, W - 120, 3); ctx.globalAlpha = 1; }
    }
    // a photograph at rest needs no more frames; points do, unless the visitor asked for calm
    if (live && seen && (wipe || (cur.as === 'points' && (!reduced || morph || scanning)))) raf = requestAnimationFrame(frame);
  }
  function kick() { if (live && !raf) raf = requestAnimationFrame(frame); }

  // before any face: the same points, loose. The first face gathers them (chaos to order, once per visit).
  function scatter() {
    if (!field || reduced) return;
    const n = field.max, pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
    let a = 0x2545f491;
    const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < n; i++) {
      pos[i * 3] = r() * W; pos[i * 3 + 1] = r() * H; pos[i * 3 + 2] = (r() - 0.5) * 700;
      const hot = r() < 0.05, b = 0.1 + 0.4 * r() * r(), k = hot ? ACID : PAPER;
      col[i * 4] = k[0] * b; col[i * 4 + 1] = k[1] * b; col[i * 4 + 2] = k[2] * b; col[i * 4 + 3] = 0.5 + 0.7 * r();
    }
    field.put(0, { pos, col, n }); cur = { items: [], slot: 0, as: 'points' }; live = true; kick();
  }

  // ---------- attract: the case face through the seven tiers ----------
  let tour = null;
  // stages: [{ bust(): Promise<analysed bust>, ... }]; onStage(i) fires as each one arrives. The walk starts at the
  // bottom of the scale and climbs (no tier is the base the others hang from); with motion off it rests on one.
  async function attract(stages, onStage, start = reduced ? 3 : 0) {
    stopTour();
    const me = (tour = { i: start, timer: 0 });
    live = true; scene = null; size(W, H); scanning = 0;
    const first = await stages[start].bust();
    if (tour !== me) return;
    show([first], cur && cur.as === 'points' && !cur.items.length ? 1900 : 0); onStage?.(start);
    if (reduced) return;
    const step = async () => {
      if (tour !== me) return;
      const i = (me.i + 1) % stages.length, b = await stages[i].bust();
      if (tour !== me) return;
      me.i = i;
      if (seen && !document.hidden) { show([b], i === 0 ? 1700 : 1250); setTimeout(() => tour === me && onStage?.(i), 520); }
      me.timer = setTimeout(step, i === stages.length - 1 ? 3600 : 2700);
    };
    me.timer = setTimeout(step, 2300);
  }
  function stopTour() { if (tour) clearTimeout(tour.timer); tour = null; }

  function size(w, h) { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } canvas.dataset.fmt = w > h ? 'x' : 'story'; }

  // ---------- a result that can be looked into: a face of the tier list, opened over the list ----------
  // look: { i, p, to, next }: face i, how open it is (0–1) and where it is heading; next: the face to open once closed
  let look = null, lookRaf = 0, playing = false, onLook = null;
  function lookStep(now) {
    lookRaf = 0;
    if (!look || !scene || !scene.detail) return;
    const dt = Math.min(0.05, (now - look.last) / 1000); look.last = now;
    look.p = reduced ? look.to : clamp(look.p + (look.to > look.p ? dt / 1.2 : -dt / 0.45));
    if (look.to === 0 && look.p <= 0) { const next = look.next; look = null; scene.frame(ctx, 1); if (next != null) openLook(next); return; }
    scene.detail(ctx, look.i, look.p);
    if (look.p !== look.to) lookRaf = requestAnimationFrame(lookStep);
  }
  function openLook(i) { look = { i, p: 0, to: 1, last: performance.now(), next: null }; onLook?.(scene.rowAt(i)); if (!lookRaf) lookRaf = requestAnimationFrame(lookStep); }
  function closeLook(next = null) { if (!look) return; look.to = 0; look.next = next; look.last = performance.now(); if (next == null) onLook?.(null); if (!lookRaf) lookRaf = requestAnimationFrame(lookStep); }
  function dropLook() { look = null; cancelAnimationFrame(lookRaf); lookRaf = 0; }
  const under = (e) => { const r = canvas.getBoundingClientRect(); return scene.pick(((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height, look ? look.i : -1); };
  canvas.addEventListener('click', (e) => {
    if (!scene || !scene.pick || playing) return;
    const i = under(e);
    if (look) closeLook(i >= 0 && i !== look.i ? i : null); else if (i >= 0) openLook(i);
  });
  canvas.addEventListener('pointermove', (e) => { canvas.style.cursor = scene && scene.pick && !playing && (look || under(e) >= 0) ? 'pointer' : ''; });

  // ---------- pointer: the specimen turns under the hand (while it is points) ----------
  if (view && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    view.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); ptr.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1); ptr.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1); ptr.on = true; });
    view.addEventListener('pointerleave', () => { ptr.on = false; ptr.tx = ptr.ty = 0; });
  }
  scatter();
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen) kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  return {
    field, canvas, attract,
    // one frame, now (tests, and anything that cannot wait for the next animation frame)
    step(now = performance.now()) { const was = live; live = true; cancelAnimationFrame(raf); raf = 0; frame(now); live = was; },
    get hasCloud() { return !!field; },
    // the visitor's faces take the stage, as the photographs they are. Resolves when the scan line has passed.
    faces(busts) { stopTour(); scene = null; live = true; scanning = 0; size(W, H); return busts.length ? photos(busts) : Promise.resolve(); },
    // "Medir": the photographs become points (one pass of the line), then the scan plane keeps crossing them
    scan(on) {
      if (!on) { scanning = 0; kick(); return; }
      finish();
      scanned = new Promise((done) => {
        const go = () => { scanning = performance.now(); done(); };
        if (!cur || cur.as === 'points' || reduced) { if (cur) cur.as = 'points'; go(); } else wipe = { start: performance.now(), ms: 900, to: 'points', span: span(cur.items), done: go };
      });
      kick();
    },
    // resolves once the faces on the stage are points (the pass started by scan(true) is over)
    scanned: () => scanned,
    // hand the canvas to a card scene and play its reveal from `from` (default: where the stage leaves off)
    // onTime(s): called with the second of the reveal each frame shows (Infinity once it is over)
    async run(sc, { from = sc.enter, full = false, onTime = null } = {}) {
      stopTour(); finish(); live = false; scanning = 0; cancelAnimationFrame(raf); raf = 0; dropLook();
      scene = sc; size(sc.W, sc.H);
      const id = ++playId, start = full ? 0 : from;
      playing = true;
      await play((t) => { if (id === playId) { sc.frame(ctx, t); onTime?.(t >= 1 ? Infinity : (t * sc.ms) / 1000); } }, sc.ms * (1 - start), start);
      if (id === playId) { sc.frame(ctx, 1); playing = false; onTime?.(Infinity); }
      return id === playId;
    },
    // the still that gets shared: the last frame, at once
    settle() { playId++; playing = false; dropLook(); if (scene) scene.frame(ctx, 1); },
    // called with the row of a face when it is opened over a finished list (card.js rankScene detail), null when closed
    set onLook(fn) { onLook = fn; },
    // open face i of the list (or close with -1), as a click on it does
    look(i) { if (!scene || !scene.detail || playing) return; if (look) closeLook(i >= 0 && i !== look.i ? i : null); else if (i >= 0) openLook(i); },
    get scene() { return scene; },
    // back to a live stage with what was on it (after a result: the faces that were measured, as photographs)
    resume() {
      playId++; playing = false; dropLook(); onLook = null; scene = null; live = true; scanning = 0; wipe = null; old = null; morph = null; next = null; size(W, H);
      if (cur) { const f = build(cur.items); if (f) field.put(cur.slot, f); cur.as = cur.items.length ? 'photos' : 'points'; }
      kick();
    },
  };
}
