// Builds the two static pages from their templates: the motion policy is injected verbatim, and "Cómo funciona"
// gets the evolution (the seven stages of data/case.json, each described on its own) and the levers (score.js, the
// old lab's lists) as plain HTML.
//   node tools/build-pages.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = (p) => readFileSync(join(root, p), 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const motion = T('tools/motion-policy.html').trimEnd();

// index
writeFileSync(join(root, 'public/index.html'), T('tools/index.template.html').replace('@@MOTION@@', motion));

// cómo funciona
const kase = JSON.parse(T('tools/data/case.json'));
const { NATURAL_RECS, EXTREME_RECS } = await import('../public/js/app/score.js');
const sgn = (v, n = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(n)}`;
const M = [['canthal_tilt_deg', 'Canthal tilt', (v) => `${sgn(v)}°`], ['fwhr', 'FWHR', (v) => v.toFixed(2)], ['jaw_ratio', 'Bigonial', (v) => v.toFixed(2)], ['midface_ratio', 'Midface', (v) => v.toFixed(2)], ['symmetry', 'Simetría', (v) => String(Math.round(v))]];
// The evolution. Each tier is described on its own: what that face looks like and what the engine read on it.
// None is told as "the real photo plus or minus something" (the levers that move a face are section 04).
const LOOK = {
  sub5: 'El tejido blando manda: la papada borra el ángulo de la mandíbula y alarga el tercio inferior (44 %), la piel tiene acné activo y bajo los ojos hay edema. Canthal tilt plano.',
  ltn: 'Mejillas llenas y contorno mandibular difuso; la mirada se lee cansada. Las proporciones del tercio medio ya son correctas (midface 1.00), pero quedan tapadas.',
  mid: 'La media de la calle: contorno inferior blando, piel apagada y pelo sin forma. Pómulos y mandíbula empiezan a insinuarse.',
  mtn: 'Magro y cuidado: pómulos y mandíbula definidos, piel limpia y buena densidad de pelo. Lo que frena es la zona ocular, algo cansada, y la nariz.',
  chadlite: 'Mandíbula ancha y marcada, mentón proyectado, mejillas hundidas y nariz recta y fina. La zona ocular es normal: lo único que no destaca.',
  chad: 'Hunter eyes (canthal tilt +4.6°, sin párpado a la vista), pómulos altos y cara compacta (FWHR 1.84). Dimorfismo extremo en mandíbula, mentón y cejas.',
  trueadam: 'Todos los rasgos en su ideal a la vez: ojos, nariz, mandíbula, labios y piel. El motor lo mide como al Chad, 7.5: por encima de ahí ya no distingue. Es el techo de la escala.',
};
const kindOf = (s) => (/real/i.test(s.when) ? 'Foto real' : 'Simulación con IA');
const pctOf = (v) => `P${v > 99 ? v.toFixed(1) : Math.round(v)}`;
const S0 = kase.stages[0];
const evoTicks = kase.stages.map((s, i) => `<li><button type="button" data-evo-tick aria-current="${i === 0}"><b>${esc(s.tierName)}</b><span>${s.psl.toFixed(1)}</span></button></li>`).join('');
const evoNotes = JSON.stringify(kase.stages.map((s) => ({ kind: kindOf(s), text: LOOK[s.id] || '' }))).replace(/</g, '\\u003c');
const evoMeasures = M.map(([k, l, f]) => `<li><span>${l}</span><b data-evo-m="${k}">${f(S0.metrics[k])}</b></li>`).join('');

const HABITS = [
  ['Grasa al 10–12 %', NATURAL_RECS[0].action], ['Rutina dermatológica', 'SPF diario y retinoide bajo prescripción.'], ['Dormir 7.5–9 h', 'Menos edema periorbital y mejor piel.'],
  ['Cejas perfiladas', 'Sin adelgazarlas: limpian el marco ocular.'], ['Corte según tu cara', 'Laterales cortos, volumen arriba.'],
];
const FRAUDS = [
  ['Luz y ángulo', 'Luz lateral a 45°, cámara a la altura de los ojos, 85 mm.'], ['Barba de contorno', 'Barba corta en el borde mandibular: simula anchura bigonial.'],
  ['Corrector y contouring', 'Ojeras neutralizadas, sombra bajo el pómulo.'], ['Ropa y estilo', 'Prendas a medida y colores que contrastan con tu piel.'], ['Alzas de 5 cm', 'Plantillas internas: +5 cm de altura percibida.'],
];
const SURGERY = EXTREME_RECS.filter((r) => !/Barba|Alzas/.test(r.name)).map((r) => [r.name, r.action]).concat([['Rinoseptoplastia', 'Eje centrado, punta fina, base alar estrecha.'], ['Implantes malares', 'Pómulos más proyectados y un tercio medio más compacto.']]);
const list = (rows) => `<ul class="lever__list">${rows.map(([n, a]) => `<li><b>${esc(n)}</b><span>${esc(a)}</span></li>`).join('')}</ul>`;

const GLOSS = [
  ['PSL', 'Escala de atractivo facial de 1 a 8 nacida en foros de lookism. 4 es la media.'],
  ['SMV', 'Sexual market value: tu valor en el mercado de citas sumando cara, altura, cuerpo, estatus y soltura social.'],
  ['Hipergamia', 'El esquema del folclore lookism: en apps ellas eligen hacia arriba y la atención se concentra en los tiers altos; en pareja estable cada uno acaba con su igual. El resultado sitúa tu SMV en la escalera del otro sexo. Es un juego, no un dato.'],
  ['LTN · MTN · HTN', 'Low, mid y high tier normie: de la media baja a la alta. En mujeres, LTB, MTB y HTB (becky).'],
  ['Chadlite · Chad', 'Los tiers altos en hombres: top 7 % y top 1 %. En mujeres, Stacylite y Stacy.'],
  ['True Adam · True Eve', 'El canon teórico: todos los rasgos en su ideal. El techo de la escala.'],
  ['Canthal tilt', 'El eje del canto interno al externo del ojo. Si el externo queda más alto, la mirada lee alerta. Ideal +4° a +8°.'],
  ['FWHR', 'Anchura entre pómulos dividida por la altura de la glabela al labio. El marcador de dimorfismo más estudiado. Ideal 1.85 a 2.05.'],
  ['Midface ratio', 'Distancia entre pupilas dividida por la altura de pupila a labio. Un tercio medio compacto lee más atractivo. Ideal 0.95 a 1.05.'],
  ['Anchura bigonial', 'La mandíbula frente a los pómulos: cuanto más ancha y marcada, más fuerte el tercio inferior. Ideal 0.86 a 0.94.'],
  ['Tercios faciales', 'Frente, tercio medio e inferior. Equilibrados, la cara lee armónica.'],
  ['Failo', 'El rasgo que más resta: el que frena la nota aunque el resto esté bien.'],
  ['Halo', 'Un rasgo tan bueno que arrastra hacia arriba la lectura de toda la cara.'],
  ['Softmaxxing', 'Subir sin cirugía: grasa, piel, pelo, cejas, sueño.'],
  ['Hardmaxxing', 'Subir con cirugía: hueso y cartílago.'],
  ['Fraudmaxxing', 'Subir la percepción sin cambiar la cara: luz, ángulo, barba, alzas, estilo.'],
  ['Hunter eyes', 'Ojos almendrados con canthal tilt positivo y poco párpado visible.'],
].map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('');

const how = T('tools/como-funciona.template.html')
  .replace('@@MOTION@@', motion)
  .replaceAll('@@CASE_NOTE@@', esc(kase.note))
  .replace('@@EVO_POSTER@@', S0.src)
  .replace('@@EVO_KIND@@', kindOf(S0))
  .replace('@@EVO_TIER@@', esc(S0.tierName))
  .replace('@@EVO_PSL@@', S0.psl.toFixed(1))
  .replace('@@EVO_PCT@@', pctOf(S0.percentile))
  .replace('@@EVO_SMV@@', S0.smv.toFixed(0))
  .replace('@@EVO_NOTE@@', esc(LOOK[S0.id]))
  .replace('@@EVO_MEASURES@@', evoMeasures)
  .replace('@@EVO_TICKS@@', evoTicks)
  .replace('@@EVO_NOTES@@', evoNotes)
  .replace('@@HABITS@@', list(HABITS))
  .replace('@@FRAUDS@@', list(FRAUDS))
  .replace('@@SURGERY@@', list(SURGERY))
  .replace('@@GLOSS@@', GLOSS);
writeFileSync(join(root, 'public/como-funciona.html'), how);
console.log('built index.html, como-funciona.html');
