// Female feature extraction (CLIP only): items with index % N === K, skipping saved ids.
window.__ex = { n: 0, err: 0, done: false };
(async () => {
  const K = window.__K, N = window.__N;
  const F = await import('http://127.0.0.1:5180/js/app/face.js'); const B = await import('http://127.0.0.1:5180/js/app/beauty.js');
  const C = await import('http://127.0.0.1:5180/js/app/clip.js'); const X = await import('http://127.0.0.1:5180/js/app/features.js');
  await C.preloadClip();
  const all = await (await fetch('http://127.0.0.1:5196/allf')).json();
  const done = new Set(await (await fetch('http://127.0.0.1:5196/donef')).json());
  const R4 = (a) => a.map((x) => +x.toFixed(4));
  const avg = (a, b) => { const m = a.map((x, i) => x + b[i]); const n = Math.hypot(...m); return m.map((x) => x / n); };
  const todo = all.filter((it, i) => i % N === K && !done.has(it.id)); window.__ex.total = todo.length;
  for (const it of todo) {
    try {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.src = 'http://127.0.0.1:5196/f/' + it.id; await im.decode();
      const sc = Math.min(1, 1024 / Math.max(im.width, im.height)); const c = document.createElement('canvas');
      c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const r = await F.detect(c);
      if (!r) { await fetch('http://127.0.0.1:5196/savef', { method: 'POST', body: JSON.stringify({ ...it, faces: 0 }) }); window.__ex.n++; continue; }
      const m = r.metrics, sg = X.faceSignals(r.points);
      const iso = X.isolateFace(c, r.points);
      const embIso = avg(await C.embedImage(iso), await C.embedImage(X.mirror(iso)));
      const b = B.faceBox(c, r.points), s = Math.max(b.w, b.h) * 1.6; const oc = document.createElement('canvas'); oc.width = oc.height = 224;
      oc.getContext('2d').drawImage(c, b.cx - s / 2, b.cy - s / 2, s, s, 0, 0, 224, 224);
      const embOrig = await C.embedImage(oc);
      await fetch('http://127.0.0.1:5196/savef', { method: 'POST', body: JSON.stringify({ ...it, faces: r.faces, px: m.face_px, yaw: m.yaw_deg, roll: m.roll_deg, pitch: +r.pitch.toFixed(4), mouthOpen: +sg.mouthOpen.toFixed(4), smile: +sg.smile.toFixed(4), embIso: R4(embIso), embOrig: R4(embOrig) }) });
      window.__ex.n++;
    } catch (e) { window.__ex.err++; window.__ex.last = String(e); window.__ex.n++; }
  }
  window.__ex.done = true;
})();
