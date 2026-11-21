// Versus (two faces) and the tier list (three or more): the stage plays the reveal and ends on the shareable image;
// beside it, the share controls and the breakdown — every face trait by trait (breakdown.js), what each one stands
// out for and, in a versus, who takes each trait.
import { IDEALS } from './face.js';
import { tierFor, facePercentile } from './score.js';
import { versusScene, rankScene, verdictOf, topText, pickMeasures } from './card.js';
import { shareableMarkup, mountShareable } from './shareable.js';
import { specimenId } from './report.js';
import { breakdown, duel, listed, measureLines, edgeLines } from './breakdown.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = (v) => Math.min(v, 8).toFixed(1);
const tierText = (r) => (r.range ? (() => { const lo = tierFor(r.range[0], r.sex), hi = tierFor(r.range[1], r.sex); return lo === hi ? lo : `${lo}–${hi}`; })() : r.tier);
const who = (r) => `${r.sex === 'f' ? 'mujer' : 'hombre'}${r.check?.notes?.length ? ` · ${esc(r.check.notes.join(', '))}` : ''}`;
const top = (r) => { const t = topText(facePercentile(r.psl)); return t ? `${t[0].toLowerCase() === 'top' ? 'Top' : 'Supera al'} ${t[1]}` : ''; };
const restart = `<p class="result__actions"><button class="btn" type="button" data-restart>Medir otras caras</button></p>`;
const NOTE = '<p class="disclaimer">Notas por rasgo de 0 a 10. Juntan dos cosas: lo cerca que está cada medida de su ideal y lo que el modelo lee en la foto (piel, pelo, forma física…) frente a más de mil caras de referencia de su mismo sexo, donde 5 es la media. Describen la cara; el PSL lo da el modelo completo, no la suma de estas notas.</p>';

const bar = (v, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.round(v * 10)}%"></i></span>`;
const fmt = (k, v) => (!Number.isFinite(v) ? '—' : k === 'canthal_tilt_deg' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}°` : k === 'symmetry' ? `${Math.round(v)}` : v.toFixed(2));
const ideal = (i) => `${i.lo}–${i.hi}${i.unit === '/100' ? '' : i.unit || ''}`;
const inRange = (k, v) => Number.isFinite(v) && v >= IDEALS[k].lo && v <= IDEALS[k].hi;

// one face in full: its notes trait by trait and every measure against its ideal
function person(r, pos, label, B, { open = false, top: first = false } = {}) {
  const m = r.entry.face.metrics, turned = Math.abs(m.yaw_deg || 0) >= 12;
  const val = (k) => (k === 'symmetry' && turned ? NaN : m[k]);
  return `<li${first ? ' class="is-top"' : ''} data-at="face:${r.n ?? ''}"><details class="person" data-n="${r.n ?? ''}"${open ? ' open' : ''}>
    <summary><span class="rank__pos">${pos}</span><img class="rank__face" src="${r.bust.thumb()}" alt="${esc(label)}"><span class="rank__who"><b>${esc(tierText(r))}</b>${esc(label)} · ${who(r)} · ${esc(top(r))}<em>Destaca en ${esc(listed(B.best))}</em></span><span class="rank__psl">${one(r.psl)}</span></summary>
    <div class="person__body">
      <ul class="traits">${B.traits.map((t) => `<li${B.best.includes(t) ? ' class="is-best"' : ''}><span>${esc(t.label)}</span>${bar(t.score)}<b>${t.score.toFixed(1)}</b></li>`).join('')}</ul>
      ${B.weak.length ? `<p class="person__weak">Lo más flojo: ${esc(listed(B.weak))}.</p>` : ''}
      <ul class="measures">${Object.entries(IDEALS).map(([k, i]) => `<li${inRange(k, val(k)) ? ' data-in' : ''}><span>${esc(i.label)}</span><span><b>${fmt(k, val(k))}</b><small>ideal ${ideal(i)}</small></span></li>`).join('')}</ul>
    </div>
  </details></li>`;
}

export function renderVersus(root, [a, b], stage) {
  const d = a.psl - b.psl, winner = Math.abs(d) < 0.15 ? null : d > 0 ? 0 : 1, verdict = verdictOf(d);
  const B = [breakdown(a), breakdown(b)], rows = duel(B[0], B[1]), faces = [a, b];
  const took = [0, 1].map((s) => rows.filter((x) => x.side === s));
  const head = (r, i) => `<div class="duel__who${winner === i ? ' is-win' : ''}"><img src="${r.bust.thumb()}" alt="Cara ${i + 1}"><p><b>${esc(tierText(r))}</b><span>PSL ${one(r.psl)}</span><span>${esc(top(r))}</span></p></div>`;
  root.classList.add('result--multi');
  root.innerHTML = `
    <header class="result__head">
      <p class="label" data-at="verdict">Versus${winner == null ? '' : ` · gana <b>${esc(tierText(faces[winner]))}</b>`}</p>
      <h2 class="result__tier" data-at="verdict">${esc(verdict.toLowerCase())}${winner == null ? '' : ` <span>+${Math.abs(d).toFixed(1)} PSL</span>`}</h2>
    </header>
    ${shareableMarkup()}
    <section class="duel block" aria-label="Rasgo a rasgo">
      <h3 class="h3">Rasgo a rasgo</h3>
      <div class="duel__head" data-at="verdict">${head(a, 0)}<span class="duel__vs">vs</span>${head(b, 1)}</div>
      <ol class="duel__rows">${rows.map((x) => `<li data-at="trait:${x.key}"${x.side == null ? '' : ` data-win="${x.side}"`}><b class="duel__n">${x.a.toFixed(1)}</b>${bar(x.a, 'bar--l')}<span class="duel__t">${esc(x.label)}</span>${bar(x.b)}<b class="duel__n">${x.b.toFixed(1)}</b></li>`).join('')}</ol>
      <p class="duel__sum" data-at="end">${[0, 1].map((s) => `<span><b>Cara ${s + 1}</b> ${took[s].length ? `se lleva ${took[s].length} de ${rows.length}: ${esc(listed(took[s]))}.` : 'no se lleva ningún rasgo.'} Destaca en ${esc(listed(B[s].best))}.</span>`).join('')}</p>
      ${NOTE}
    </section>
    <div class="block" data-at="end">
      <h3 class="h3">Cada cara, al detalle</h3>
      <ol class="people">${faces.map((r, i) => person(r, winner === i ? 'W' : winner == null ? '=' : 'L', `Cara ${i + 1}`, B[i], { top: winner === i })).join('')}</ol>
    </div>
    ${restart}`;
  const id = specimenId();
  stage.canvas.setAttribute('aria-label', `Versus: ${tierText(a)} ${one(a.psl)} contra ${tierText(b)} ${one(b.psl)}. ${verdict}`);
  // on the card: the traits that separate them most, with both notes (the list beside it has them all), and what
  // each one stands out for
  const onCard = [...rows].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 5);
  const side = (r, i, mode) => ({ bust: r.bust.read(mode), psl: r.psl, tier: tierText(r), best: B[i].best.map((t) => t.label) });
  return mountShareable(root, {
    stage, name: 'phenotype-versus',
    // the winner's edge, measure by measure: where its value sits closer to the ideal than the other's
    text:
      [
        `Versus en PHENOTYPE: PSL ${one(a.psl)} vs ${one(b.psl)}`,
        ...(
          winner == null
            ? ['Empate técnico.']
            : [`Gana la cara ${winner + 1}:`, ...edgeLines(faces[winner].entry?.face?.metrics, faces[1 - winner].entry?.face?.metrics)]
        )
      ].join('\n'),
    build: (f, mode) => versusScene(stage.field, f, side(a, 0, mode), side(b, 1, mode), winner, id, onCard),
  });
}

export function renderRanking(root, list, stage) {
  const rows = [...list].sort((x, y) => y.psl - x.psl), B = new Map(rows.map((r) => [r, breakdown(r)]));
  root.classList.add('result--multi');
  root.innerHTML = `
    <header class="result__head">
      <p class="label" data-at="face:${rows[0].n ?? ''}">Lote · arriba <b>${esc(tierText(rows[0]))}</b>, PSL ${one(rows[0].psl)} · pulsa una cara de la lista para abrir su análisis, o «+N» para desplegar la fila; con «Pantalla completa» se ve en grande</p>
      <h2 class="result__tier">Tier list <span>${rows.length} caras</span></h2>
    </header>
    ${shareableMarkup({ fullscreen: true })}
    <div class="block">
      <h3 class="h3">Cada cara, al detalle</h3>
      <ol class="people">${rows.map((r, i) => person(r, i + 1, `Cara ${r.n}`, B.get(r), { open: i === 0, top: i === 0 })).join('')}</ol>
      ${NOTE}
    </div>
    ${restart}`;
  const id = specimenId();
  stage.canvas.setAttribute('aria-label', `Tier list de ${rows.length} caras`);
  // a face opened on the list opens its full reading beside it too
  stage.onLook = (row) => { if (row) root.querySelectorAll('.person').forEach((d) => { d.open = d.dataset.n === String(row.n); }); };
  return mountShareable(root, {
    stage, name: 'phenotype-tier-list',
    text: [`Tier list de ${rows.length} caras en PHENOTYPE`,
    `Arriba: ${tierText(rows[0])} · PSL ${one(rows[0].psl)}/8`, ...measureLines(rows[0].entry?.face?.metrics).filter((l) => l.startsWith('✓')),
      '¿En qué fila caes tú?'].join('\n'),
    // each face goes to the list with what its reading shows: its best trait and measure in the reveal, and all of
    // them when it is opened over the list
    build: (f, mode) => rankScene(stage.field, f, rows.map((r) => {
      const b = B.get(r), stats = pickMeasures(r.bust.lm, r.entry?.face?.metrics, 3, 0.1);
      return { bust: r.bust.read(mode), psl: r.psl, tier: tierText(r), sex: r.sex, n: r.n, best: b.best[0], bests: b.best.map((t) => t.key), weak: b.weak.map((t) => t.key), traits: b.traits, stat: pickMeasures(r.bust.lm, r.entry?.face?.metrics, 1)[0], stats: stats.map((st) => ({ ...st, side: 'r' })) };
    }), id),
  });
}
