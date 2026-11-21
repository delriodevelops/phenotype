// PHENOTYPE: one instrument. A specimen window (stage.js: one canvas, one cloud of points) and a console beside it.
//   attract    nobody has uploaded anything: the case face walks the seven tiers as points
//   ready      the visitor's photo: every face found is on the stage as the photograph it is; tick the ones to measure
//              1 → the card with SMV · 2 → versus · 3 or more → the tier list
//   scan       the scan line turns the photo into points while measure.js works: gender (CLIP), the face isolated
//              and scored by the MEBeauty-trained probe (probe.js)
//   result     the points form the number, and a second scan gives the face back as a photo on the shareable card
//              (report.js · views.js)
//   no server  everything runs in the browser; the photo never leaves it
import { loadLandmarker, detectAll } from './face.js';
import { faceFromPsl } from './geom.js';
import { computeScores, potentials, tierFor } from './score.js';
import { renderResult } from './report.js';
import { renderVersus, renderRanking } from './views.js';
import { preloadClip } from './clip.js';
import { detectSex } from './probe.js';
import { measureFace, checkFace } from './measure.js';
import { makeBust } from './censor.js';
import { loadSegmenter } from './matte.js';
import { createStage } from './stage.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = { mode: 'one', entries: [], quiz: null, run: 0 };
const reduced = document.documentElement.dataset.motion === 'reduced';
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug'); // ?debug=1: internals shown, photo checks not enforced

const lab = $('[data-lab]'), view = $('[data-view]'), quiz = $('[data-quiz]');
const stage = createStage($('[data-stage]'), view);
if (DEBUG) window.__phenotype = { stage, state };

// the models (≈90 MB the first time) start loading once the page has painted, or at once when the visitor reaches for
// the specimen, so they never hold up the first frame
let warmed = false;
function warm() {
  if (warmed) return; warmed = true;
  preloadClip().catch((err) => console.warn('CLIP unavailable', err));
  loadLandmarker().then(() => loadSegmenter()).catch((err) => console.warn('landmarker unavailable', err));
}
if (document.readyState === 'complete') setTimeout(warm, 1500); else addEventListener('load', () => setTimeout(warm, 1500), { once: true });
['pointerenter', 'pointerdown', 'focusin', 'dragenter'].forEach((t) => lab.addEventListener(t, warm, { once: true }));

// ---------- the instrument's own readouts (over the corners of the specimen window) ----------
const setText = (sel, t) => { const el = $(sel); if (el && t != null) el.textContent = t; };
function hud({ tl, tr, bl, br, tier } = {}) {
  setText('[data-hud-tl]', tl); setText('[data-hud-tr]', tr); setText('[data-hud-bl]', bl); setText('[data-hud-br]', br);
  if (tier !== undefined) { const box = $('[data-hud-tier]'); box.hidden = !tier; if (tier) { setText('[data-hud-name]', tier[0]); setText('[data-hud-psl]', tier[1]); } }
}
const points = () => (stage.field ? `${stage.field.max.toLocaleString('es-ES')} PUNTOS` : 'MODO FOTO');
function setState(s) { lab.dataset.state = s; }
function show(step, scroll = true) {
  $$('[data-step]').forEach((s) => { s.hidden = s.dataset.step !== step; });
  if (scroll) scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

// ---------- attract: the case face, tier by tier ----------
let kase = null;
const caseData = () => (kase ??= fetch('data/case.json').then((r) => r.json()).then((k) => {
  for (const s of k.stages) {
    let p = null;
    s.bust = () => (p ??= (async () => {
      // createImageBitmap, not img.decode(): decode() waits for a paint and never settles in a tab that is not painting
      const img = await createImageBitmap(await (await fetch(s.src)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      return (s.made = makeBust(c, s.points.slice(0, 478).map(([x, y]) => ({ x: x * c.width, y: y * c.height })))).read('none');
    })());
  }
  return k;
}));
async function attract() {
  setState('idle');
  hud({ tl: 'CASO 001 · DEMOSTRACIÓN', tr: 'EN ESPERA', bl: '[ 01 / 04 ] SIN ESPÉCIMEN', br: points() });
  try {
    const k = await caseData();
    if (lab.dataset.state !== 'idle') return;
    await stage.attract(k.stages, (i) => { if (lab.dataset.state === 'idle') hud({ tier: [k.stages[i].tierName, k.stages[i].psl.toFixed(1)] }); });
  } catch (err) { console.warn('demo face unavailable', err); hud({ tier: null }); }
}

// ---------- modes ----------
const MODES = {
  one: { title: '¿Cuánto puntúa <em>tu cara?</em>', multiple: false, pick: 'Subir foto', hint: '1 cara → tu tarjeta', go: 'Medir', note: 'De frente, con buena luz y sin gafas de sol.' },
  vs: { title: '¿Quién <em>gana</em> a quién?', multiple: true, pick: 'Subir dos caras', hint: '2 caras → versus', go: 'Comparar', note: 'Dos fotos, o una foto con dos caras.' },
  bulk: { title: 'La <em>tier list</em> de tu grupo.', multiple: true, pick: 'Subir fotos', hint: '3 o más → tier list', go: 'Analizar', note: 'Todas las fotos que quieras: cada cara cae en su fila.' },
};
const file = $('[data-file]'), picker = $('[data-picker]');
const note = (t) => { $('[data-note]').textContent = t; };
function setMode(mode) {
  state.mode = mode;
  const m = MODES[mode];
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  quiz.dataset.mode = mode;
  file.multiple = m.multiple;
  $('#t-cap').innerHTML = m.title;
  setText('[data-mode-hint]', m.hint);
  $$('[data-pick-label]').forEach((el) => { el.textContent = state.entries.length ? (mode === 'one' ? 'Otra foto' : 'Añadir fotos') : m.pick; });
  // the photos already loaded stay: only the default ticks change with the mode
  if (state.entries.length) { pickDefault(); renderPicker(); syncStage(); syncSex(); } else { $('[data-go]').textContent = m.go; note(m.note); }
}
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.mode !== state.mode) setMode(b.dataset.mode); }));

// ---------- the photos and their faces ----------
const drop = $('[data-drop]');
file.addEventListener('change', () => file.files.length && takePhotos([...file.files]));
document.addEventListener('click', (e) => { if (e.target.closest('[data-pick-file]')) { if (lab.dataset.state === 'result') backToCapture(); file.click(); } });
['dragenter', 'dragover'].forEach((t) => view.addEventListener(t, (e) => { e.preventDefault(); view.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => view.addEventListener(t, () => view.classList.remove('is-over')));
view.addEventListener('drop', (e) => { e.preventDefault(); const fs = [...e.dataTransfer.files]; if (fs.length && lab.dataset.state !== 'scan') { if (lab.dataset.state === 'result') backToCapture(); takePhotos(fs); } });

async function loadCanvas(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return null;
  const img = await createImageBitmap(f).catch(() => null);
  if (!img) return null;
  // 2048, not less: in a group photo every face is small, and shrinking the photo shrank them under the size limit
  const s = Math.min(1, 2048 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function takePhotos(files) {
  const append = state.mode !== 'one' && state.entries.length > 0; // Versus · Lote: new photos join the ones loaded
  if (state.mode === 'one') files = files.slice(0, 1);
  const run = ++state.run;
  const base = append ? Math.max(...state.entries.map((e) => e.photo)) + 1 : 0;
  if (!append) { state.entries = []; picker.innerHTML = ''; picker.hidden = true; }
  const before = state.entries.length;
  note(files.length > 1 ? `Buscando caras en ${files.length} fotos…` : 'Buscando caras…');
  hud({ tr: 'BUSCANDO CARAS' });
  let skipped = 0;
  for (const [pi, f] of files.entries()) {
    const c = await loadCanvas(f);
    if (!c) { skipped++; continue; }
    let faces = [];
    try { faces = await detectAll(c); } catch (err) { console.warn('landmarks unavailable', err); }
    if (run !== state.run) return;
    faces.forEach((face, fi) => state.entries.push({ id: `${base + pi}-${fi}`, canvas: c, face, photo: base + pi, check: checkFace(face), bust: makeBust(c, face.points) }));
    if (files.length > 1) note(`Buscando caras… ${pi + 1} de ${files.length}`);
  }
  // every new face is cut from its background before it is shown (the stage and the cards are the face and nothing else)
  const fresh = state.entries.slice(before);
  if (fresh.length) { note(fresh.length > 1 ? `Aislando ${fresh.length} caras del fondo…` : 'Aislando la cara del fondo…'); hud({ tr: 'AISLANDO' }); }
  for (const en of fresh) { await en.bust.prepare(); if (run !== state.run) return; }
  file.value = '';
  if (state.entries.length === before) {
    note(state.entries.length ? `No se ve ninguna cara nueva. ${pickerNote()}` : 'No se ve ninguna cara. Prueba con otra foto, de frente y bien iluminada.');
    hud({ tr: state.entries.length ? 'ADQUIRIDO' : 'EN ESPERA' });
    return;
  }
  pickDefault();
  $$('[data-pick-label]').forEach((el) => { el.textContent = state.mode === 'one' ? 'Otra foto' : 'Añadir fotos'; });
  show('capture', false); setState('ready');
  renderPicker(); syncStage();
  if (skipped) note(`${pickerNote()} (${skipped} archivo${skipped > 1 ? 's' : ''} no se pudo leer)`);
  syncSex();
}

// default ticks: Individual → the main face; Versus → the first two usable; Lote → every usable face
function pickDefault() {
  const usable = state.entries.filter((e) => DEBUG || !e.check.refuse);
  const take = state.mode === 'one' ? 1 : state.mode === 'vs' ? 2 : usable.length;
  state.entries.forEach((e) => { e.selected = false; });
  usable.slice(0, take).forEach((e) => { e.selected = true; });
}
const chosen = () => state.entries.filter((e) => e.selected);

function pickerNote() {
  const n = chosen().length, total = state.entries.length;
  if (total === 1) {
    const e = state.entries[0];
    if (e.check.refuse) return `${e.check.refuse} Prueba con otra foto.`;
    if (state.mode === 'vs') return 'Falta la otra cara: añade una segunda foto, o usa una en la que salgan las dos.';
    return e.check.notes.length ? `Cara detectada (${e.check.notes.join(', ')}: se corrige).` : 'Cara detectada. Lista para medir.';
  }
  return `${total} caras · ${n} elegida${n === 1 ? '' : 's'} → ${n <= 1 ? 'tarjeta' : n === 2 ? 'versus' : 'tier list'}. Pulsa una cara para elegirla o quitarla.`;
}

function renderPicker() {
  const many = state.entries.length > 1;
  picker.hidden = !many;
  picker.innerHTML = many ? state.entries.map((e, i) => `
    <button type="button" class="pick" data-pick="${e.id}" aria-pressed="${!!e.selected}" ${e.check.refuse && !DEBUG ? 'disabled' : ''} title="${e.check.refuse || (e.check.notes.join(', ') || 'Cara ' + (i + 1))}">
      <img src="${e.bust.thumb()}" alt="Cara ${i + 1}"><span class="pick__n">${i + 1}</span>${e.check.refuse ? '<span class="pick__x">no medible</span>' : ''}
    </button>`).join('') : '';
  const sel = chosen();
  $('[data-go]').textContent = sel.length >= 3 ? `Analizar ${sel.length}` : sel.length === 2 ? 'Comparar' : 'Medir';
  quiz.dataset.result = sel.length <= 1 ? 'card' : 'multi'; // the questions only matter for the single card (SMV)
  note(pickerNote());
}
picker.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]'); if (!b || b.disabled) return;
  const en = state.entries.find((x) => x.id === b.dataset.pick); en.selected = !en.selected;
  renderPicker(); syncStage(); syncSex();
});

// the ticked faces are what the specimen window shows
function syncStage() {
  const sel = chosen(), shown = sel.length ? sel : state.entries.slice(0, 1);
  stage.faces(shown.map((e) => e.bust.read('none')));
  stage.canvas.setAttribute('aria-label', shown.length === 1 ? 'El espécimen: tu foto, lista para medir' : `El espécimen: ${shown.length} caras, listas para medir`);
  const n = sel.length;
  hud({ tl: `ESPÉCIMEN · ${n} CARA${n === 1 ? '' : 'S'}`, tr: 'ADQUIRIDO', bl: `[ 02 / 04 ] ${n <= 1 ? 'LISTO PARA MEDIR' : n === 2 ? 'LISTO: VERSUS' : 'LISTO: TIER LIST'}`, br: points(), tier: null });
}

// one face ticked: detect its gender and set the toggle (the visitor can still correct it)
function syncSex() {
  const sel = chosen();
  if (sel.length !== 1) return;
  const en = sel[0];
  detectSex(en.canvas, en.face.points).then((g) => {
    if (!en.selected) return;
    en.sexDetected = g;
    const radio = $(`input[name=sex][value="${g.sex}"]`, quiz); if (radio) { radio.checked = true; setSex(g.sex); saveAnswers(); }
    if (lab.dataset.state === 'ready' && state.mode === 'one') note(`${pickerNote()} Detectado: ${g.sex === 'f' ? 'mujer' : 'hombre'} (puedes cambiarlo en los datos opcionales).`);
  }).catch((err) => console.warn('sex detection unavailable', err));
}

// ---------- the answers (only for the single card) ----------
const HAIR = {
  m: [['completo', 'completo'], ['entradas', 'entradas'], ['coronilla', 'coronilla'], ['avanzado', 'pérdida avanzada']],
  f: [['denso', 'denso'], ['normal', 'normal'], ['fino', 'fino o con pérdida']],
};
// every answer is optional: a blank is the population median for the sex, shown as "(supuesto)"
const MEDIAN = { m: { height_cm: 176, bodyfat: '15-19', bfText: '15–19 %' }, f: { height_cm: 163, bodyfat: '20-24', bfText: '20–24 %' } };
const sexOf = () => ($('input[name=sex]:checked', quiz)?.value === 'f' ? 'f' : 'm');
function setSex(sex) {
  const hair = $('[data-hair]'), keep = hair.value;
  hair.innerHTML = '<option value="">normal (supuesto)</option>' + HAIR[sex].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  if (HAIR[sex].some(([v]) => v === keep)) hair.value = keep;
  $('[data-height]').placeholder = `${MEDIAN[sex].height_cm}`;
  $('[data-bodyfat] option[value=""]').textContent = `${MEDIAN[sex].bfText} (supuesto)`;
}
$$('input[name=sex]', quiz).forEach((r) => r.addEventListener('change', () => setSex(r.value)));

// The answers and the consent check stay in this browser (never the photo). Storage may be blocked: every read and
// write is guarded, and the page works without it.
const KEY = 'phenotype:quiz:v1';
const FIELDS = ['sex', 'age', 'height_cm', 'bodyfat', 'training', 'skin', 'hair', 'status', 'social', 'consent'];
function saveAnswers() {
  const data = {};
  for (const k of FIELDS) { const el = quiz.elements[k]; if (el) data[k] = k === 'consent' ? el.checked : k === 'sex' ? sexOf() : el.value; }
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}
function restoreAnswers() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (data?.sex === 'f') $('input[name=sex][value="f"]', quiz).checked = true;
  setSex(sexOf());
  if (!data) return;
  for (const k of FIELDS) {
    const el = quiz.elements[k];
    if (k === 'sex' || !el || !(k in data)) continue;
    if (k === 'consent') el.checked = !!data[k]; else el.value = data[k] ?? '';
  }
}
quiz.addEventListener('input', saveAnswers);
quiz.addEventListener('change', saveAnswers);
$('[data-forget]').addEventListener('click', () => {
  try { localStorage.removeItem(KEY); } catch {}
  quiz.reset(); setSex('m');
  note('Tus respuestas se han borrado de este navegador.');
});
restoreAnswers();

function readQuiz() {
  const q = Object.fromEntries(new FormData(quiz).entries());
  const sex = q.sex === 'f' ? 'f' : 'm', assumed = [];
  const fill = (k, v, label) => { if (q[k] === '' || q[k] == null) { q[k] = v; if (label && !assumed.includes(label)) assumed.push(label); } };
  fill('age', 25, null);
  fill('height_cm', MEDIAN[sex].height_cm, 'altura');
  fill('bodyfat', MEDIAN[sex].bodyfat, 'físico');
  fill('training', 2, 'físico');
  fill('status', '15-30k|empleado', 'estatus');
  fill('social', 3, 'soltura social');
  if (!q.skin) assumed.push('piel');
  if (!q.hair) assumed.push('pelo');
  for (const k of ['age', 'height_cm', 'training', 'sleep', 'social', 'style']) q[k] = Number(q[k]);
  [q.income, q.career] = String(q.status).split('|');
  delete q.status; delete q.consent;
  return { q, assumed };
}

// ---------- measure ----------
// the first visit downloads the model: say how far along it is
addEventListener('phenotype:model', (e) => { if (lab.dataset.state === 'scan') hud({ tr: `MODELO ${Math.round((e.detail.loaded / e.detail.total) * 100)} %` }); });

quiz.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sel = chosen();
  if (!sel.length) { note(state.entries.length ? 'Elige al menos una cara.' : 'Primero una foto.'); return; }
  if (!quiz.reportValidity()) return; // only the consent check is required
  const { q, assumed } = readQuiz();
  if (sel.length === 1 && q.age < 18) { const a = $('[name=age]', quiz); $('.more', quiz).open = true; a.setCustomValidity('PHENOTYPE solo mide a mayores de edad.'); a.reportValidity(); a.addEventListener('input', () => a.setCustomValidity(''), { once: true }); return; }
  state.quiz = q;
  const go = $('[data-go]'), label = go.textContent; go.disabled = true;
  setState('scan'); stage.scan(true);
  hud({ tr: 'MIDIENDO', bl: '[ 03 / 04 ] MIDIENDO' });
  const run = ++state.run;
  try {
    const out = [];
    for (const [i, en] of sel.entries()) {
      go.textContent = sel.length > 1 ? `Midiendo ${i + 1}/${sel.length}…` : 'Midiendo…';
      note(sel.length > 1 ? `Midiendo la cara ${i + 1} de ${sel.length}…` : 'Aislando la cara y midiéndola. La primera vez tarda más: se descarga el modelo.');
      const r = await measureFace(en.canvas, en.face, sel.length === 1 ? q.sex : 'auto');
      if (run !== state.run) return;
      out.push({ ...r, entry: en, bust: en.bust, n: state.entries.indexOf(en) + 1 });
    }
    await stage.scanned(); // the photo has to be points before they can form the number
    if (run !== state.run) return;
    stage.scan(false);
    const root = $('[data-step="result"]');
    show('result', false); setState('result');
    if (out.length === 1) {
      const r = out[0], m = r.entry.face.metrics;
      const scores = computeScores(potentials(faceFromPsl(r.psl), q), q);
      renderResult(root, { scores, metrics: Math.abs(m.yaw_deg || 0) >= 12 ? { ...m, symmetry: NaN } : m, bust: r.bust, stage, provisional: false, range: r.range, assumed });
      if (DEBUG) debugPanel(root, r);
    } else if (out.length === 2) renderVersus(root, out, stage);
    else renderRanking(root, out, stage);
    console.info('phenotype:score', out.map((r) => ({ n: r.n, sex: r.sex, psl: +r.psl.toFixed(2), human: +r.human.toFixed(2) })));
    if (matchMedia('(max-width: 860px)').matches) scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  } catch (err) {
    console.error(err);
    stage.scan(false); setState('ready'); hud({ tr: 'ADQUIRIDO', bl: '[ 02 / 04 ] LISTO PARA MEDIR' });
    note('No se pudo cargar el modelo de medida. Revisa la conexión y vuelve a intentarlo.');
  } finally { go.disabled = false; go.textContent = label; }
});

// ---------- the demo: the same reveal, on the case face ----------
async function demo() {
  const k = await caseData(), st = k.stages.find((s) => s.id === 'mtn') || k.stages[3];
  await st.bust(); await st.made.prepare();
  const run = ++state.run, q = { sex: 'm', age: 25, height_cm: 176, bodyfat: '15-19', training: 2, income: '15-30k', career: 'empleado', social: 3, sleep: 7, style: 3 };
  if (run !== state.run) return;
  hud({ tier: null, tr: 'ADQUIRIDO' });
  await stage.faces([st.made.read('none')]); // the scan line leaves the case photo, as it came
  if (run !== state.run) return;
  show('result', false); setState('result');
  renderResult($('[data-step="result"]'), { scores: computeScores(potentials(faceFromPsl(st.psl), q), q), metrics: st.metrics, bust: st.made, stage, demo: true });
}
$$('[data-demo]').forEach((b) => b.addEventListener('click', () => demo().catch((err) => { console.warn('demo', err); note('No se pudo cargar la demostración.'); })));

// ---------- debug ----------
function debugPanel(host, r) {
  const box = document.createElement('pre'); box.dataset.debug = ''; host.prepend(box);
  box.style.cssText = 'margin:0 0 16px;padding:16px;background:#0c0f14;color:#d7dde5;font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;border:1px solid #c6ff3d';
  const f = r.feats, m = r.entry.face.metrics, tier = (p) => tierFor(p, r.sex), fx = (v, n) => (typeof v === 'number' ? v.toFixed(n) : '?');
  const top = (dir) => r.scale.pairs.map((p, j) => [p[0], r.scale.logit[j]]).sort((x, y) => dir * (y[1] - x[1])).slice(0, 3).map(([p, l]) => `${p.replace(/^a (man|photo of an?|very)? ?/, '')} ${l >= 0 ? '+' : ''}${l.toFixed(1)}`).join(' · ');
  box.textContent = [
    'DEBUG · escala calibrada con tus 470 notas + opinión de la gente (MEBeauty)',
    `foto: caras ${r.entry.face.faces} · giro ${m.yaw_deg}° · inclinación ${m.roll_deg}° · barbilla ${fx(r.entry.face.pitch, 2)} · boca ${fx(f.signals.mouthOpen, 3)} · sonrisa ${fx(f.signals.smile, 3)} · cara ${m.face_px} px`,
    r.check.refuse ? `⚠ en modo normal se rechazaría: ${r.check.refuse}` : '✓ pasa los filtros de foto',
    `sexo detectado: ${r.detected.sex === 'f' ? 'mujer' : 'hombre'} (${(r.detected.confidence * 100).toFixed(0)} %) · usado: ${r.sex === 'f' ? 'mujer' : 'hombre'}`,
    '',
    `nota de la gente prevista (1–10): ${r.human.toFixed(2)} neutralizada · ${r.humanAsIs.toFixed(2)} tal cual · sin aislar ${r.humanO.toFixed(2)}`,
    ...(r.scale.pairs ? [`CLIP · a favor: ${top(1)}`, `CLIP · en contra: ${top(-1)}`, `tu escala, valor interno u = ${r.scale.u.toFixed(4)}`] : ['MUJER · modelo de mujeres (r .77), mismo percentil que un hombre en tu escala']),
    '',
    `según la gente: PSL ${r.crowdPsl.toFixed(2)} · ${tier(r.crowdPsl)}`,
    `TARJETA: PSL ${r.psl.toFixed(2)} · ${tier(r.psl)}`,
  ].join('\n');
}

// ---------- back from a result ----------
function backToCapture() {
  state.run++;
  show('capture');
  if (!state.entries.length) { attract(); return false; }
  setState('ready'); stage.resume(); renderPicker(); syncStage();
  return true;
}
document.addEventListener('click', (e) => {
  const versus = e.target.closest('[data-versus]');
  if (!e.target.closest('[data-restart]') && !versus) return;
  if (backToCapture() && versus) { setMode('vs'); file.click(); }
});

setMode('one');
show('capture', false);
attract().then(() => { if (params.has('demo')) demo().catch(() => {}); });
