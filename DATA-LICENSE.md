# Data and model licence

The source code of PHENOTYPE is MIT (see `LICENSE`). The files below are **not**: they are licensed under
[Creative Commons Attribution-NonCommercial 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (CC BY-NC 4.0),
because they are derived from, or measured against, the MEBeauty database.

| Path | What it is | Why it is non-commercial |
|---|---|---|
| `public/models/w-*.json`, `public/models/map-f.json` | The trained probes (men, women, the owner's scale) | Fitted on MEBeauty faces and ratings |
| `public/models/te.json`, `public/models/sex.json` | CLIP text embeddings and the gender check | Calibrated on MEBeauty |
| `public/js/app/breakdown.js` (the `REF` table only) | Where each trait sits among MEBeauty faces | Measured on MEBeauty |
| `tools/calibration/data/` | Ratings, splits, file lists and fitted weights | Derived from MEBeauty |
| `public/img/case/`, `public/data/case.json`, `tools/data/` | Case 001: the author's face through the seven tiers | A real person's face: not for reuse outside this project |

## MEBeauty

MEBeauty (github.com/fbplab/MEBeauty-database) is licensed for non-commercial research only. Its images are not
included in this repository; download them from the authors if you want to retrain (`tools/calibration/README.md`).
If you use the models or data here, credit MEBeauty and keep to its terms.

## Third-party models loaded at runtime

- CLIP ViT-B/32 (`public/models/clip/`, from `Xenova/clip-vit-base-patch32`): MIT, © OpenAI.
- MediaPipe Face Landmarker and Selfie Segmenter (loaded from Google's CDN): Apache-2.0.
- transformers.js (loaded from jsDelivr): Apache-2.0.
