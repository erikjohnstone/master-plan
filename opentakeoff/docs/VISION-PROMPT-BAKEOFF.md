# Visual-reference symbol bakeoff

## Scope decision

**SHOULD THIS BE ON THE SHARED PATH? No.** This is an offline evaluator that
compares candidate symbol locations against frozen ground truth. It cannot
decide a schedule/table answer, quantity, citation, tag, or production bbox.
Accordingly it does not import or modify VectorGrid, schedule reconstruction,
the Session pipeline, browser UI, MCP, citations, or data contracts.

The purpose is to measure three independently inspectable ways to answer a
future, *review-only* question: “given this trusted legend symbol/body crop,
where might visually similar marks be?”

`web/scripts/evaluate-sift-dino-bakeoff.mts` is a fourth, separate offline
experiment: DINO ranks the candidate boxes already proposed by SIFT. It cannot
create a candidate, choose a count, accept a symbol, or associate a tag. The
only count-shaped metric in its report is explicitly oracle-only ground truth.

| Method | What it does | Expected strength | Expected failure mode |
| --- | --- | --- | --- |
| `owl` | OWLv2 image-guided zero-shot detection on overlapping plan tiles | Finds visually similar marks beyond exact geometry | Natural-image pretraining may not transfer to line drawings; boxes can be poorly localized |
| `sift` | SIFT descriptors + FLANN + iterative similarity-RANSAC | Exact copies with distinctive, non-collinear line features | Simple/repeating CAD glyphs may have too few or ambiguous keypoints |
| `fusion` | Keeps only OWLv2 locations corroborated by SIFT geometry | Fewer, higher-confidence review prompts | Can reduce recall dramatically when SIFT lacks features |

The reference crop must come from a trusted legend, keyed schedule symbol, or
human-confirmed plan example. During evaluation only, the frozen `seed_rect`
is used as a surrogate. The query location is excluded from results, so it
cannot count itself.

## Run on an isolated GPU machine

```bash
python3 -m venv /tmp/opentakeoff-vision-venv
/tmp/opentakeoff-vision-venv/bin/pip install -r opentakeoff/eval/vision_prompt_requirements.txt

/tmp/opentakeoff-vision-venv/bin/python opentakeoff/eval/vision_prompt_bakeoff.py \
  --manifest '/path/HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/cases.json' \
  --corpus-root '/path/HVAC BAS Benchmark Collection' \
  --case 43-carson-m601-vlc853e-controller-modules \
  --method all \
  --output-dir /tmp/ot-vision-results \
  --device cuda
```

Each case writes:

- `trusted-reference.png` — the query crop used by all methods;
- `owl-overlay.png`, `sift-overlay.png`, and `fusion-overlay.png` — candidate
  boxes over the original drawing (orange = query; purple/teal/green = method);
- `result.json` and parent `summary.json` — raw boxes plus fixed, one-to-one
  scoring.

To test the review-only SIFT → DINO lane after a SIFT run, from `opentakeoff/web`:

```bash
npx tsx scripts/evaluate-sift-dino-bakeoff.mts \
  --sift-results /tmp/ot-vision-results \
  --corpus '/path/HVAC BAS Benchmark Collection' \
  --output /tmp/ot-sift-dino-ranking.json
```

The resulting `top_expected_count` is deliberately an **oracle evaluation
metric**: it uses the frozen expected count to measure ranking quality. The
actual product must never know or select “top N” this way.

## How to read results

`frozen_exact` is deliberately harsh: each predicted centre must land within
the per-instance tolerance in the existing symbol-sweep ground truth. It is
the primary regression number. `visual_review` uses half the reference crop’s
diagonal as a clearly labeled, broader *review* radius—not a quantity metric.
It reveals whether a method at least brings a reviewer to the correct local
mark. Duplicate candidates cannot claim the same frozen instance.

Some frozen source crops are not centred on the manifest's logical symbol
anchor. SIFT therefore also records `reference_anchor_diagnostic`: after it has
already proposed a box, it maps the source annotation anchor through the found
similarity transform. This shows whether a systematic crop-centre offset—not
the matcher—is responsible for a strict-centre miss. It is explicitly not a
model output, does not alter a proposed box or its rank, and is never a
takeoff/count metric.

Do not select a method, threshold, or corpus subset after looking at its score.
Run a declared configuration on diversified frozen cases, inspect its overlays,
and publish all hits, misses, and false positives. A result does not become a
takeoff count until it is independently corroborated and given a separate
shared-path design review.

### Outline-verification diagnostic

SIFT/RANSAC can establish that a few local keypoints have compatible geometry;
it does not prove that the complete symbol outline agrees. The evaluator now
maps the entire Canny edge outline of the reference through each found
similarity transform and measures its distance to target edges. This is an
additional *diagnostic only* in the current run. It has no rejection threshold
until a threshold is selected on one project group and independently validated
on held-out project groups. This prevents tuning a generic-looking edge rule to
one controller bank or valve sheet.
