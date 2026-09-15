# DINO visual-symbol review: an honest walkthrough

## What this adds

The bundled `dinov2_symbol_metric_v1` model can compare **already proposed physical
symbol bodies** and sort them by visual similarity to one trusted reference body. It is
an optional agent-review aid. It does **not** detect a symbol on a sheet, read a tag,
choose a schedule row, change reconciliation, or set installed quantity.

This boundary is intentional: a similarity score is not source evidence.

## What was actually verified

The browser/PDF.js smoke test loaded the real Carson Valley Middle School controller-module
sheet from the corpus and invoked the same canvas function used by the Agent tool. It passed
all 26 frozen, independently supplied physical-body candidates through the on-device ONNX
model (WASM), returned 26 `ranked_review` results, and recorded no page errors.

Run it from `opentakeoff/web` while the local UI is available:

```sh
OT_UI_URL=http://127.0.0.1:5173 node scripts/playwright-symbol-metric-browser.mjs \
  "/absolute/path/to/HVAC BAS Benchmark Collection" /tmp/opentakeoff-symbol-metric-browser
```

The result is written to `/tmp/opentakeoff-symbol-metric-browser/result.json`; the rendered
source sheet is saved beside it. The inputs are frozen **body** boxes from corpus ground truth,
not detections made by the model. That makes this a real browser/model execution test, but not
a claim that DINO discovers controller modules by itself.

The separate RT-DETR P&ID checkpoint was also tested on the real NAVFAC M-401 hydronic plan.
It returned zero proposals at its evaluated threshold. It therefore is **not included** in the
plan takeoff or Agent workflow. A narrow P&ID validation score is not enough to justify using a
detector on a construction plan where it produces no useful evidence.

## Estimator / Agent flow

1. Start with source-backed candidates. Use the vector-first tools (`find_legend_symbols`,
   `symbol_sweep`, `sweep_schedule_row`, tag resolution, or leader review) to identify a small
   set of candidate **physical bodies**. Keep their original-page bounding boxes and citations.
2. Pick one body that a person has verified on the original drawing as the visual reference.
   Do not use the nearby label text or a schedule table cell as the reference crop.
3. Ask the Agent to call `rank_visual_symbol_candidates` with that reference and the finite
   candidate list. The browser renders original PDF tiles and runs DINO locally. The reply is a
   descending list of `ranked_review` candidates with their unchanged original-page boxes.
4. Open the drawing for the highest-priority candidates. Confirm the actual body, then confirm
   its tag/leader relationship and the cited schedule row. Accept or reject through the normal
   human-review workflow.
5. Let the existing shared reconciliation logic report `MATCH`, `SCHEDULE_ONLY`, `PLAN_ONLY`,
   `REFUSED`, or `AMBIGUOUS`. DINO ranking never replaces that evidence trail and never turns a
   visual score into an installed quantity.

## When to use it

Use it for a finite set of visually similar, pre-proposed bodies—especially repeated
controller/diagram objects where the vector engine has already found candidates and a reviewer
needs help deciding which to inspect first.

Do not use it as a replacement for vector sweep on dense repeated plan symbols. In the frozen
real-plan evaluation, vector recall was 35/35 for the Lovell diffuser case while DINO's oracle
top-35 review ranking found only 2/35. The visual model can be useful in a constrained review
step, but it is not a general installed-quantity engine.
