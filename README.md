# PHENOTYPE

A static site, in Spanish, that estimates facial attractiveness on the lookism PSL scale (Sub-5 … True Adam / True Eve)
from one photo. Everything runs in the visitor's browser: no server, no paid API, and the photo is never uploaded.

> **What this is not.** PHENOTYPE is an experiment and a piece of entertainment, not science. The number is a
> statistical guess from one photo, trained on a few thousand faces rated by strangers and by one person; light,
> angle, lens and expression move it. It says nothing about anyone's worth. Do not use it to judge, rank or
> decide anything about real people, and do not measure someone without their consent.

- `public/index.html`: the instrument. One specimen window (a canvas) and a console beside it: the photo, the
  measure, the reveal and the share card all happen in that one window. Add `?debug=1` to see the internals,
  `?demo=1` to play the reveal on the case face, `?nogl=1` to try the no-WebGL fallback, `?nomatte=1` to try the
  cut-out without the segmenter.
- `public/como-funciona.html`: the method, the scale, case 001, the levers, the glossary, precision, privacy, FAQ.

Both pages are built from `tools/*.template.html` by `node tools/build-pages.mjs` (edit the templates, not the output).

## The concept: the photo, and the points the analysis makes of it (KERN)

A face is either the photograph it is — always cut from its background, so there is the face and nothing else — or
a cloud of ~150,000 points on the GPU. The points are the analysis; the scan line is what turns one into the other.

1. **Attract**: nobody has uploaded anything; the case face walks the seven tiers as points.
2. **Photo**: the scan line leaves every face found as a cut-out photograph (one face, two as a split screen, or a
   wall of up to six).
3. **Scan** ("Medir"): the line passes again and the photograph becomes points; while the engine measures, the scan
   plane keeps crossing them.
4. **Reveal**: the points leave the face and form the PSL number, then re-form the face on the card, and a last
   pass of the line gives it back as the photograph: real from the hair to the chin, and from the collar down
   still the points that pour into the number. In a versus both faces come back as clean photographs (nothing is
   ever drawn over a face): the winner keeps a halo, and between the two numbers stands the tale of the tape, the
   traits that separate them most with both notes, and under each tier what that face stands out for.
5. **Card**: the last frame of the reveal is the shareable image (Story 1080×1920 or X 1200×675), and the reveal
   itself can be saved as a video (MP4 where the browser records it, WebM otherwise).

Modules (`public/js/app/`):

- `points.js`: the point field (WebGL2, no library). Formations live in GPU buffers; `draw()` shows the mix of two.
- `matte.js`: the person cut from the background of a face crop (MediaPipe selfie segmenter, a 250 KB model on the
  runtime the landmarks already use). Where it cannot run, the cut-out is drawn from the landmarks instead.
- `sample.js`: formations. `bustOf()` is the one 5:7 crop every view uses (upright, face always the same size);
  `analyse()` reads it once (tone, the person lifted off the background, a relief) and gives back the cut-out
  photograph and the samples, kept in reading order so a morph flows instead of exploding.
- `card.js`: the three scenes (`cardScene`, `versusScene`, `rankScene`: single card, versus, tier list), each a
  `frame(ctx, t)` over the reveal; sharing and video recording.
- `stage.js`: the specimen window: attract loop, the visitor's faces as photographs, the scan that turns them into
  points, and the hand-over to a scene.
- `shareable.js`: format, share, video, download, replay and the censor switch. `censor.js`: a face per censor mode.
- `app.js`: the flow (idle → ready → scan → result). `report.js` · `views.js`: what is read beside the card.
- `breakdown.js`: a face trait by trait (eyes, cheekbones, jaw, nose, lips, symmetry, skin, hair, masculinity,
  fitness), each a 0–10 note, what the face stands out for, and the duel between two faces. The versus and the tier
  list show it for every face (`views.js`); the versus card carries the five traits that separate the two most.
- `evolve.js` ("Cómo funciona" only): the evolution, one face through the seven tiers. The seven cut-outs share
  the 574 points and the mesh of `data/case.json`; between two tiers the picture is both, warped onto the points
  in between. Each tier has its own description (`LOOK` in `tools/build-pages.mjs`): none is told from another.

The pages use one stylesheet, `public/css/ui.css`. `tools/capturas/` holds sample cards.

## How the scan measures

1. **Landmarks**: MediaPipe Face Landmarker (478 points) gives pose, smile and the face outline. A tiny face, a head
   turned 40°+, a strongly raised or lowered chin, or a wide-open mouth are refused; with several faces, the visitor
   ticks the ones to measure (1 → the card, 2 → versus, 3 or more → the tier list).
2. **Isolation**: the face (plus hair) is cut out onto neutral grey and its light and colour are normalised
   (`js/app/features.js`), so background and clothing do not count.
3. **CLIP** (`Xenova/clip-vit-base-patch32`, 8-bit, transformers.js) describes the isolated face as 512 numbers.
4. **Gender**: CLIP detects man/woman (99.2 % on MEBeauty) and sets the toggle; the visitor can correct it.
5. **Score** (`js/app/probe.js`):
   - *Men*: a linear probe trained on MEBeauty (930 men, ~300 raters per face; r = .73 on 243 unseen men) gives the
     crowd score. A second model fitted on the owner's own 470 tier ratings turns it into the owner's lookism scale
     (r = .50, exact tier 57 %). The seven case faces stretch it to the full scale, and the owner's own photo is
     anchored at PSL 5.0.
   - *Women*: a probe trained on 1,047 MEBeauty women (r = .77 on 281 unseen), placed on the same scale by
     percentile (a woman at the 80th percentile of women gets the PSL of a man at the 80th percentile of men).
6. **SMV** combines the face with the optional answers (`js/app/score.js`).
7. **Trait notes** (`js/app/breakdown.js`, versus and tier list): nothing new is measured. A note is the mean of
   what the scan already has for that trait: how close its landmark ratios sit to their ideal ranges (10 at the heart
   of the range, 8.5 at its edges, 0 at the end of the scale) and what CLIP reads on a phrase pair ("clear healthy
   skin" against "acne and bad skin"…), placed among the MEBeauty faces of the same sex: 5 is the middle face, 8.4
   is above 84 of every 100. The reference table (`REF`) comes from `tools/calibration/pair-stats.cjs`. The notes
   describe a face; the PSL is the model's, not their sum, and the page says so.

Model weights live in `public/models/` (a few KB each); CLIP and MediaPipe load from their CDNs.

## Develop

```
npm run dev        # http://localhost:5300
npm run dev:lan    # open to the wifi, for phone testing
```

## Deploy

Copy `.env.example` to `.env` and set `CLOUDFLARE_ACCOUNT_ID` (or just run `wrangler login`, which picks your
account). The same `public/` folder is published in two places:

```
npm run deploy         # Cloudflare Workers, static assets → phenotype.delriodeveloper.workers.dev (wrangler.toml)
npm run deploy:pages   # Cloudflare Pages project "fenotipo" → fenotipo.pages.dev (the short address)
npm run deploy:all     # both
```

The cards print the address they were made on (`location.host`), so a card made on fenotipo.pages.dev carries the
short one. The Pages project was created with `wrangler pages project create fenotipo --production-branch main
--force`: without `--force`, current wrangler versions hand a new Pages project over to Workers, which gives a
`workers.dev` address instead of a `pages.dev` one.

## Retraining (`tools/calibration/`)

The training scripts and the owner's ratings (`data/ratings.jsonl`). See `tools/calibration/README.md`. The
extracted MEBeauty features (`data/features*.jsonl`, ~19 MB) are not in the repository: rebuild them from the
MEBeauty images with the extraction workers before refitting.

## Licence

The code is MIT (`LICENSE`). The trained models, the calibration data and the case photographs are CC BY-NC 4.0,
non-commercial only, because they come from MEBeauty, which is licensed for non-commercial research
(`DATA-LICENSE.md`).
