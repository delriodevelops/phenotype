// One face → its full measure. Shared by the single card, the versus view and the ranking.
import { probeFeatures, predictHuman, pslFromHuman, predictPsl, predictPslFemale, detectSex, phraseLogits } from './probe.js';
import { tierFor } from './score.js';

// Hard refusals: the photo cannot be measured fairly. Soft notes: measured, with a caveat.
export function checkFace(f) {
  const m = f.metrics;
  if (m.face_px < 150) return { refuse: 'La cara sale muy pequeña o la foto tiene poca resolución.' };
  if (Math.abs(m.yaw_deg) >= 40) return { refuse: `Cabeza girada ${Math.round(Math.abs(m.yaw_deg))}° (máximo 40°).` };
  if (f.pitch < 0.22) return { refuse: 'Barbilla muy levantada.' };
  if (f.pitch > 0.62) return { refuse: 'Barbilla muy bajada.' };
  if (f.mouthOpen > 0.08) return { refuse: 'Boca muy abierta.' };
  const notes = [];
  if (Math.abs(m.yaw_deg) >= 12) notes.push(`girada ${Math.round(Math.abs(m.yaw_deg))}°`);
  if (f.mouthOpen > 0.035) notes.push('sonrisa');
  return { refuse: '', notes };
}

// sex: 'm' | 'f' | 'auto'
export async function measureFace(canvas, face, sex = 'auto') {
  const detected = await detectSex(canvas, face.points);
  const s = sex === 'auto' ? detected.sex : sex;
  const feats = await probeFeatures(canvas, face.points, face.metrics, face.pitch ?? 0.38);
  const human = await predictHuman(feats, 'E'), humanAsIs = await predictHuman(feats, 'E', { neutral: false });
  const humanO = await predictHuman(feats, 'Eo');
  const scale = s === 'f' ? await predictPslFemale(feats) : await predictPsl(feats);
  const psl = scale.psl;
  // what the photo reads on the phrase pairs, for the trait-by-trait breakdown (the men's scale has already read them;
  // a woman's PSL does not use them, so a failed download only costs her those notes)
  const logit = scale.logit || (await phraseLogits(feats).catch(() => null));
  // the isolated-face and plain-crop crowd models disagree a lot only on odd photos (men's models): show a range
  const range = s !== 'f' && Math.abs(human - humanO) > 0.8 ? [Math.max(1, psl - 0.5), Math.min(8, psl + 0.5)] : null;
  return { sex: s, detected, psl, tier: tierFor(psl, s), range, feats, scale, logit, human, humanAsIs, humanO, crowdPsl: pslFromHuman(human), check: checkFace(face) };
}
