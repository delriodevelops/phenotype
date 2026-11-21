# Calibration tools

Everything used to train the scan's models. The MEBeauty images are not included (download them from
github.com/fbplab/MEBeauty-database; non-commercial research licence); their extracted features (`data/features*.jsonl`) are not in the repository either, being
~19 MB: rebuild them with `worker.js` / `workerf.js` from the images.

| File | What it does |
|---|---|
| `data/features.jsonl`, `data/featuresf.jsonl` | Per-face CLIP embeddings (isolated face and plain crop) and pose signals for MEBeauty men and women |
| `data/ratings.jsonl` | The owner's 470 tier ratings of MEBeauty men |
| `data/te.json`, `data/sex-te.json` | Precomputed CLIP text embeddings (18 phrase pairs; man/woman) |
| `fit2.mjs` | Crowd probes for men (`w-Ens.json` → `public/models/w-E.json`, `w-Eons.json` → `w-Eo.json`) |
| `fit-user2.mjs` | The owner's scale (`uns-B.json` → `public/models/w-user-B.json`) |
| `fit-f.mjs` | Women's probe (`w-Ef.json`), percentile map (`map-f.json`) and the gender check |
| `pair-stats.cjs` | Where each phrase pair sits over the MEBeauty men and women (mean, sd, correlation with the crowd score): the `REF` table of `public/js/app/breakdown.js` |
| `rate.html`, `serve.cjs`, `rate-routes.cjs` | The rating page (`node serve.cjs`, then http://127.0.0.1:5196/rate.html); it needs the images in `img/` |
| `worker.js`, `workerf.js` | In-browser feature extraction, run from pages of the site (see the scripts) |

The scripts read their inputs from the current folder: run them from `data/` (e.g. `cd data && node ../fit2.mjs`).
After retraining, refit the stretch and the reference anchor in `public/js/app/probe.js` (STRETCH, REFERENCE_SHIFT)
with the seven case faces, as described there.
