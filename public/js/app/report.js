// The single result: the stage plays the reveal and ends on the card (card.js); beside it, the share controls and
// the readings for whoever wants more — tier · PSL · where you fall among a hundred, natural and extreme potential
// with advice, and every measure against its ideal.
import { IDEALS } from './face.js';
import { tierFor, tierLabel, tierNames, NATURAL_RECS, EXTREME_RECS } from './score.js';
import { cardScene, tierIndex, topText } from './card.js';
import { shareableMarkup, mountShareable } from './shareable.js';
import { measureLines } from './breakdown.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = (v) => Math.min(v, 8).toFixed(1);
const fmt = (k, v) => (!Number.isFinite(v) ? '—' : k === 'canthal_tilt_deg' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°` : k === 'symmetry' ? `${Math.round(v)}` : v.toFixed(2));
const ideal = (i) => `${i.lo}–${i.hi}${i.unit === '/100' ? '' : i.unit || ''}`;
const inRange = (k, v) => Number.isFinite(v) && v >= IDEALS[k].lo && v <= IDEALS[k].hi;
export const specimenId = () => `#${Date.now().toString(36).slice(-5).toUpperCase()}`;

// a hundred points, one per person: the ones you beat are lit, the one that is you is the signal
export function hundred(pct) {
  const n = Math.max(0, Math.min(99, Math.round(pct)));
  return `<div class="hundred" role="img" aria-label="Superas a ${n} de cada 100">${Array.from({ length: 100 }, (_, i) => `<i${i < n ? ' class="on"' : i === n ? ' class="you"' : ''} style="--i:${i}"></i>`).join('')}</div>`;
}
// the seven tiers, yours lit
export function ladderMarkup(psl, sex) {
  const at = tierIndex(psl);
  return `<ol class="ladder">${tierNames(sex).map((t, i) => `<li${i === at ? ' class="is-you"' : i < at ? ' class="is-under"' : ''}>${esc(t)}</li>`).join('')}</ol>`;
}

// the three measures pinned to the face on the card: where each was taken (landmark) and which margin it reads in
const PINS = [['canthal_tilt_deg', 'Canthal', 33, 'l'], ['fwhr', 'FWHR', 454, 'r'], ['jaw_ratio', 'Mandíbula', 172, 'l']];

export function renderResult(root, { scores: s, metrics: m = {}, bust, stage, provisional = false, range = null, assumed = [], demo = false }) {
  const sex = s.sex;
  const tierText = (() => { if (!range) return tierLabel(s.psl.now, sex, provisional); const lo = tierFor(range[0], sex), hi = tierFor(range[1], sex); return lo === hi ? lo : `${lo}–${hi}`; })();
  const rec = (r) => `<li><details><summary>${esc(r.name)}${Number.isFinite(Number(r.delta)) ? `<span>+${Number(r.delta).toFixed(2)}</span>` : ''}</summary><p>${esc(r.action)}</p></details></li>`;
  const top = topText(s.percentile.now), beat = Math.max(0, Math.min(99, Math.round(s.percentile.now)));
  root.classList.remove('result--multi');
  root.innerHTML = `
    <header class="result__head">
      <p class="label">${demo ? 'Demostración · caso 001 · <b>así sale el tuyo</b>' : `Resultado${range ? ' · <b>medida dudosa</b>: prueba otra foto de frente y con buena luz' : ''}`}</p>
      <h2 class="result__tier">${esc(tierText)} <span>PSL ${one(s.psl.now)}</span></h2>
      ${ladderMarkup(s.psl.now, sex)}
    </header>
    ${shareableMarkup()}
    <p class="result__actions">${demo ? '<button class="btn btn--go" type="button" data-pick-file>Ahora tú: subir foto</button>' : '<button class="btn" type="button" data-versus>Versus: retar a otra cara</button> <button class="btn btn--quiet" type="button" data-restart>Medir otra foto</button>'}</p>
    <div class="result__side">
      <div class="block">
        <h3 class="h3">Tu sitio entre cien</h3>
        <div class="among">${hundred(s.percentile.now)}<p class="among__t"><b>${top ? `${top[0]} ${top[1]}` : '—'}</b>Superas a ${beat} de cada 100 ${sex === 'f' ? 'mujeres' : 'hombres'} en SMV: cara, altura, cuerpo, estatus y soltura social.</p></div>
        <dl class="readout">
          <div><dt>SMV</dt><dd>${s.smv.now.toFixed(1)}</dd></div>
          <div><dt>Natural</dt><dd>${one(s.psl.natural)}</dd></div>
          <div><dt>Extremo</dt><dd>${one(s.psl.extreme)}</dd></div>
        </dl>
        ${assumed.length && !demo ? `<p class="disclaimer">Supuesto (sin responder): ${esc(assumed.join(', '))}. Rellena los datos opcionales para afinar el SMV.</p>` : ''}
      </div>
      <div class="block">
        <h3 class="h3">Cómo subir</h3>
        <div class="pots">
          <div class="pot"><span class="label">Potencial natural · hábitos</span><p class="pot__n">${one(s.psl.natural)}<small>${esc(s.tier.natural)}</small></p><ul class="recs">${NATURAL_RECS.slice(0, 4).map(rec).join('')}</ul></div>
          <div class="pot"><span class="label">Potencial extremo · cirugía</span><p class="pot__n">${one(s.psl.extreme)}<small>${esc(s.tier.extreme)}</small></p><ul class="recs">${EXTREME_RECS.slice(0, 4).map(rec).join('')}</ul></div>
        </div>
      </div>
      <div class="block">
        <h3 class="h3">Lo que se midió</h3>
        <ul class="measures">${Object.entries(IDEALS).map(([k, i]) => `<li${inRange(k, m[k]) ? ' data-in' : ''}><span>${esc(i.label)}</span><span><b>${fmt(k, m[k])}</b><small>ideal ${ideal(i)}</small></span></li>`).join('')}</ul>
      </div>
      <p class="disclaimer">Estimación de modelos de IA con sesgos conocidos (luz, edad, tono de piel). No mide tu valor como persona ni sustituye a un profesional sanitario.</p>
    </div>`;
  root.dataset.sex = sex;
  stage.canvas.setAttribute('aria-label', `Tarjeta: ${tierText}, PSL ${one(s.psl.now)}`);
  const id = demo ? 'DEMO' : specimenId();
  const stats = PINS.filter(([k]) => Number.isFinite(m[k])).map(([k, label, lm, side]) => ({ label, value: fmt(k, m[k]), ok: inRange(k, m[k]), lm, side }));
  return mountShareable(root, {
    stage, full: demo, name: `phenotype-${tierText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    text: [`Mi cara en PHENOTYPE: ${tierText} · PSL ${one(s.psl.now)}/8`, ...measureLines(m), '¿Y tú?'].join('\n'),
    build: (f, mode) => cardScene(stage.field, f, { bust: bust.read(mode), psl: s.psl.now, tier: tierText, sex, percentile: s.percentile.now, smv: s.smv.now, stats: mode === 'hide' ? [] : stats, id }),
  });
}
