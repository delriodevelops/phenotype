// The single result: the stage plays the reveal and ends on the card (card.js); beside it, the share controls and
// the readings for whoever wants more — tier · PSL · where you fall among a hundred, natural and extreme potential
// with advice, and every measure against its ideal.
import { IDEALS } from './face.js';
import { tierFor, tierLabel, tierNames, hypergamy, hypergamyAt, TIER_CUTS, NATURAL_RECS, EXTREME_RECS } from './score.js';
import { cardScene, tierIndex, topText, pickMeasures } from './card.js';
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
// hypergamy: where this SMV lands on the other sex's ladder, in apps and for a stable couple (score.js hypergamy)
const P = (q) => `P${q >= 99 ? Math.min(q, 99.9).toFixed(1) : Math.round(q)}`;
// the scheme, drawn: the seven tiers a side (the best on top), your sex on the left and the other on the right, each
// tier with its example face where there is one (case 001 through the seven tiers; a figure otherwise) and its PSL.
// A line joins two tiers the scheme pairs (between the apps reach and the equal). Everyone's lines are faint, yours
// are lit, and the thick one goes to your equal.
const FIG = {
  m: 'M-5-6h10v10h-2.5v9h-2v-9h-1v9h-2v-9H-5z',
  f: 'M-3-6h6l5 12h-4v7h-2v-7h-2v7h-2v-7h-4z',
};
const EXAMPLES = { // 720×900 portraits; f: one generated face (not a real person) taken through the seven tiers
  m: ['sub5', 'ltn', 'mid', 'mtn', 'chadlite', 'chad', 'trueadam'].map((id) => `img/case/me/${id}.webp`),
  f: ['sub5', 'ltb', 'mtb', 'htb', 'stacylite', 'stacy', 'trueeve'].map((id) => `img/case/eve/${id}.webp`),
};
const CROP = { m: '150 170 420 420', f: '150 110 420 420' }; // the square of each portrait that holds the face
const pslRange = (i) => (i === 0 ? `PSL <${TIER_CUTS[0]}` : i === 6 ? `PSL ${TIER_CUTS[5]}+` : `PSL ${TIER_CUTS[i - 1]}–${TIER_CUTS[i]}`);
// self: the visitor's own cut-out (bust.thumb(), 120×168), which stands in their row instead of the example
function schemeMarkup(h, self) {
  const span = (r) => [Math.min(r.apps.index, r.stable.index), Math.max(r.apps.index, r.stable.index)];
  const you = h.stable.index, mine = span(h), T = 40, y = (i) => 46 + (6 - i) * 50, LX = 100, RX = 240;
  const reach = (i) => i >= mine[0] && i <= mine[1];
  const own = tierNames(h.sex), other = tierNames(h.other);
  let faint = '', lit = '', figs = '';
  const face = (x, i, sex, cls, mine) => {
    const src = mine || EXAMPLES[sex]?.[i], x0 = x - T / 2, y0 = y(i) - T / 2;
    return `<g class="face${cls}">${src
      ? `<svg x="${x0}" y="${y0}" width="${T}" height="${T}" viewBox="${mine ? '8 30 104 104' : CROP[sex]}"><image href="${esc(src)}" width="${mine ? 120 : 720}" height="${mine ? 168 : 900}"/></svg>`
      : `<g class="fig" transform="translate(${x} ${y(i) + 2}) scale(1.35)"><circle cy="-10" r="3"/><path d="${FIG[sex]}"/></g>`}<rect x="${x0}" y="${y0}" width="${T}" height="${T}"/></g>`;
  };
  const tag = (x, i, anchor, cls, a, b) => `<text x="${x}" y="${y(i) - 2}" text-anchor="${anchor}"${cls ? ` class="${cls}"` : ''}>${esc(a)}<tspan x="${x}" dy="11" class="sub">${esc(b)}</tspan></text>`;
  for (let i = 0; i < 7; i++) {
    const [lo, hi] = i === you ? mine : span(hypergamyAt(i, h.sex));
    for (let o = lo; o <= hi; o++) {
      const line = `<line x1="${LX + T / 2 + 4}" y1="${y(i)}" x2="${RX - T / 2 - 7}" y2="${y(o)}"`;
      if (i === you) lit += `${line}${o === you ? ' class="is-equal"' : ''} marker-end="url(#hy-a)"/>`; else faint += `${line}/>`;
    }
    figs += face(LX, i, h.sex, i === you ? ' is-you' : '', i === you ? self : null) + face(RX, i, h.other, reach(i) ? ' is-reach' : '')
      + tag(LX - T / 2 - 8, i, 'end', i === you ? 'is-you' : '', own[i], i === you ? `Tú · ${P(h.own)}` : pslRange(i))
      + tag(RX + T / 2 + 8, i, 'start', reach(i) ? 'is-reach' : '', other[i], pslRange(i));
  }
  const f = h.sex === 'f';
  return `<svg class="scheme" viewBox="0 0 340 ${y(0) + T / 2 + 6}" role="img" aria-label="Esquema de hipergamia: en apps de ${esc(other[mine[0]])} a ${esc(other[mine[1]])}, en pareja estable ${esc(h.stable.tier)}">
          <defs><marker id="hy-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>
          <text x="${LX}" y="12" text-anchor="middle">${f ? 'Mujeres' : 'Hombres'}</text><text x="${RX}" y="12" text-anchor="middle">${f ? 'Hombres' : 'Mujeres'}</text>
          <g class="scheme__all">${faint}</g><g class="scheme__you">${lit}</g>${figs}
        </svg>`;
}
export function hypergamyMarkup(pct, sex, self = null) {
  const h = hypergamy(pct.now, sex), nat = hypergamy(pct.natural, sex), f = sex === 'f', them = f ? 'hombres' : 'mujeres';
  const gain = nat.stable.index > h.stable.index ? ` Con tu potencial natural, ${f ? `en apps llegarías hasta <b>${esc(nat.apps.tier)}</b>` : `tu igual pasaría a ser <b>${esc(nat.stable.tier)}</b>`}.` : '';
  return `<div class="block" data-at="end">
        <h3 class="h3">Hipergamia</h3>
        ${schemeMarkup(h, self)}
        <p class="hyper__t">${f
    ? `En apps eliges hacia arriba: tu SMV (${P(h.own)} de mujeres) atrae a ${them} hasta <b>${esc(h.apps.tier)}</b>. Para pareja estable, el que se queda es tu igual: <b>${esc(h.stable.tier)}</b>.`
    : `En apps ellas eligen hacia arriba: tu SMV (${P(h.own)} de hombres) te da acceso a ${them} ${h.apps.index < h.stable.index ? `de <b>${esc(h.apps.tier)}</b> a <b>${esc(h.stable.tier)}</b>` : `<b>${esc(h.stable.tier)}</b>`}, de tu tier hacia abajo. Para pareja estable, tu igual: <b>${esc(h.stable.tier)}</b>.`}${gain}</p>
        <p class="disclaimer">Esquema del folclore lookism aplicado a tu SMV: en apps la atención se concentra arriba, en pareja estable cada uno acaba con su igual. Es un juego, no un dato sobre personas reales.</p>
      </div>`;
}

export function renderResult(root, { scores: s, metrics: m = {}, bust, stage, provisional = false, range = null, assumed = [], demo = false }) {
  const sex = s.sex;
  const tierText = (() => { if (!range) return tierLabel(s.psl.now, sex, provisional); const lo = tierFor(range[0], sex), hi = tierFor(range[1], sex); return lo === hi ? lo : `${lo}–${hi}`; })();
  const rec = (r) => `<li><details><summary>${esc(r.name)}${Number.isFinite(Number(r.delta)) ? `<span>+${Number(r.delta).toFixed(2)}</span>` : ''}</summary><p>${esc(r.action)}</p></details></li>`;
  const top = topText(s.percentile.now), beat = Math.max(0, Math.min(99, Math.round(s.percentile.now)));
  root.classList.remove('result--multi');
  root.innerHTML = `
    <header class="result__head">
      <p class="label">${demo ? 'Demostración · caso 001 · <b>así sale el tuyo</b>' : `Resultado${range ? ' · <b>medida dudosa</b>: prueba otra foto de frente y con buena luz' : ''}`}</p>
      <h2 class="result__tier" data-at="verdict">${esc(tierText)} <span>PSL ${one(s.psl.now)}</span></h2>
      <div data-at="verdict">${ladderMarkup(s.psl.now, sex)}</div>
    </header>
    ${shareableMarkup()}
    <p class="result__actions">${demo ? '<button class="btn btn--go" type="button" data-pick-file>Ahora tú: subir foto</button>' : '<button class="btn" type="button" data-versus>Versus: retar a otra cara</button> <button class="btn btn--quiet" type="button" data-restart>Medir otra foto</button>'}</p>
    <div class="result__side">
      <div class="block" data-at="end">
        <h3 class="h3">Tu sitio entre cien</h3>
        <div class="among">${hundred(s.percentile.now)}<p class="among__t"><b>${top ? `${top[0]} ${top[1]}` : '—'}</b>Superas a ${beat} de cada 100 ${sex === 'f' ? 'mujeres' : 'hombres'} en SMV: cara, altura, cuerpo, estatus y soltura social.</p></div>
        <dl class="readout">
          <div><dt>SMV</dt><dd>${s.smv.now.toFixed(1)}</dd></div>
          <div><dt>Natural</dt><dd>${one(s.psl.natural)}</dd></div>
          <div><dt>Extremo</dt><dd>${one(s.psl.extreme)}</dd></div>
        </dl>
        ${assumed.length && !demo ? `<p class="disclaimer">Supuesto (sin responder): ${esc(assumed.join(', '))}. Rellena los datos opcionales para afinar el SMV.</p>` : ''}
      </div>
      ${hypergamyMarkup(s.percentile, sex, bust?.thumb?.())}
      <div class="block" data-at="end">
        <h3 class="h3">Cómo subir</h3>
        <div class="pots">
          <div class="pot"><span class="label">Potencial natural · hábitos</span><p class="pot__n">${one(s.psl.natural)}<small>${esc(s.tier.natural)}</small></p><ul class="recs">${NATURAL_RECS.slice(0, 4).map(rec).join('')}</ul></div>
          <div class="pot"><span class="label">Potencial extremo · cirugía</span><p class="pot__n">${one(s.psl.extreme)}<small>${esc(s.tier.extreme)}</small></p><ul class="recs">${EXTREME_RECS.slice(0, 4).map(rec).join('')}</ul></div>
        </div>
      </div>
      <div class="block" data-at="measures">
        <h3 class="h3">Lo que se midió</h3>
        <ul class="measures">${Object.entries(IDEALS).map(([k, i]) => `<li${inRange(k, m[k]) ? ' data-in' : ''}><span>${esc(i.label)}</span><span><b>${fmt(k, m[k])}</b><small>ideal ${ideal(i)}</small></span></li>`).join('')}</ul>
      </div>
      <p class="disclaimer">Estimación de modelos de IA con sesgos conocidos (luz, edad, tono de piel). No mide tu valor como persona ni sustituye a un profesional sanitario.</p>
    </div>`;
  root.dataset.sex = sex;
  stage.canvas.setAttribute('aria-label', `Tarjeta: ${tierText}, PSL ${one(s.psl.now)}`);
  const id = demo ? 'DEMO' : specimenId();
  // the measures taken on the face in the reveal and pinned to it on the card: the ones that say most about this face
  const stats = pickMeasures(bust.lm, m);
  return mountShareable(root, {
    stage, full: demo, name: `phenotype-${tierText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    text: [`Mi cara en PHENOTYPE: ${tierText} · PSL ${one(s.psl.now)}/8`, ...measureLines(m), '¿Y tú?'].join('\n'),
    build: (f, mode) => cardScene(stage.field, f, { bust: bust.read(mode), psl: s.psl.now, tier: tierText, sex, percentile: s.percentile.now, smv: s.smv.now, stats: mode === 'hide' ? [] : stats, id }),
  });
}
