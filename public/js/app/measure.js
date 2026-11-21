// One face → its full measure. Shared by the single card, the versus view and the ranking.
import { probeFeatures, predictHuman, pslFromHuman, predictPsl, predictPslFemale, detectSex, phraseLogits } from './probe.js';
import { tierFor } from './score.js';

// Hard refusals: the photo cannot be measured fairly. Soft notes: measured, with a caveat.
// The limits follow what the probes were trained on (tools/calibration/data/features*.jsonl): MEBeauty faces go down to
// ~130 px across the cheekbones and up to a mouth gap of ~.16 of the face height, and the probe already corrects for
// the mouth opening. Only refuse beyond that: a face under ~90 px is upscaled past what CLIP and the landmarks can
// read, and a gap over .16 is a yawn or a shout, which moves the chin and lip points.
export const MIN_FACE_PX = 90, MAX_MOUTH_OPEN = 0.16;
export function checkFace(f) {
  const m = f.metrics;
  if (m.face_px < MIN_FACE_PX) return { refuse: 'La cara sale muy pequeña o la foto tiene poca resolución.' };
  if (Math.abs(m.yaw_deg) >= 40) return { refuse: `Cabeza girada ${Math.round(Math.abs(m.yaw_deg))}° (máximo 40°).` };
  if (f.pitch < 0.22) return { refuse: 'Barbilla muy levantada.' };
  if (f.pitch > 0.62) return { refuse: 'Barbilla muy bajada.' };
  if (f.mouthOpen > MAX_MOUTH_OPEN) return { refuse: 'Boca muy abierta.' };
  const notes = [];
  if (m.face_px < 130) notes.push('cara pequeña');
  if (Math.abs(m.yaw_deg) >= 12) notes.push(`girada ${Math.round(Math.abs(m.yaw_deg))}°`);
  if (f.mouthOpen > 0.08) notes.push('boca abierta');
  else if (f.mouthOpen > 0.035) notes.push('sonrisa');
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
