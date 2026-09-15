# Project-held-out symbol-grounding benchmark

**Shared-path decision: no.** This folder is offline training/evaluation
machinery. It must never alter VectorGrid table extraction, PDF citations,
schedule truth, bbox semantics, takeoff quantities, or UI/MCP behavior.

The model stack will not be integrated merely because a detector reports a
high mAP. The required production question is more specific:

> Given a project’s legend or independently confirmed anchor, a printed tag,
> and all tiled detector candidates near/on its sheet, does the cascade choose
> the independently reviewed physical body—and refuse when the drawing does
> not establish one?

`scripts/project_grounding_benchmark.py` is the evaluator for that question.
It consumes two JSONL inputs, both in `session_render_image_px` coordinates.
It does not manufacture labels, candidates, schedule matches, or quantities.

## Reviewer manifest

Each `opentakeoff.project_grounding_case.v1` line must be produced from a
rendered real PDF by a human reviewer. Model output may propose a place to
inspect, but must never become the expected answer.

Required fields:

- an immutable `source_pdf_sha256`, source `project_id`, and project-level
  `split` (`development` or `held_out`);
- `review_status: human_reviewed_positive_and_negative_controls`;
- exact printed `tag_bbox_image_px` and the physical
  `expected_symbol_bbox_image_px` for `expected_outcome: grounded`;
- `expected_outcome: unresolved` or `tag_absent` when the drawing does not
  establish an accepted physical body;
- every nearby plausible wrong body in
  `prohibited_false_symbol_bboxes_image_px`; and
- `coverage.full_sheet_negative_reviewed: true` only after a reviewer has
  checked the whole relevant sheet for unmarked/duplicate wrong proposals.

An accepted symbol bbox may never be the tag bbox. A tag, a clearance envelope,
and a piece of leader geometry are different evidence objects.

The existing `opentakeoff.symbol_grounding_ground_truth.v1/v2` files are a
good source of human-reviewed cases. Convert them without relabeling:

```sh
python3 scripts/import_symbol_grounding_truth.py \
  --truth-dir /path/to/ground_truth/symbol_grounding \
  --output /data/reviewer_cases.jsonl
```

The importer deliberately leaves `full_sheet_negative_reviewed` false. A
case-level prohibited box is valuable negative control, but is not a claim that
the reviewer has labeled all non-target bodies on the drawing. The current 14
real cases are an anti-regression seed, not enough for an acceptance claim.

## Build a reviewer queue without self-labeling

`scripts/build_grounding_review_queue.py` turns independently discovered tag
and candidate regions into visual review packets. It draws the exact printed
tag in orange and all candidate regions in blue, but labels **none** of those
candidates as correct. The output is deliberately a `needs_independent_human_review`
queue, not ground truth.

```sh
python3 scripts/build_grounding_review_queue.py \
  --proposals /data/discovery_proposals.jsonl \
  --source-root /data/rendered_pages \
  --output /data/grounding-review-queue
```

Each discovery proposal supplies the immutable source PDF hash, rendered page
path, exact tag bbox, candidate bboxes, family, and tag. A reviewer chooses a
full physical body, rejects candidates, or records `unresolved` / `tag_absent`.
Only then can it become a benchmark case.

## Prediction manifest

The candidate producer writes one
`opentakeoff.project_grounding_prediction.v1` record per reviewed case. Every
record must disclose:

- tiled inference (`tile_size_px`, nonzero overlap, and global merge method);
- an exact provenance digest for every checkpoint file actually loaded (not
  merely a HuggingFace `config.json`);
- full case latency;
- **every** candidate actually considered, each carrying a detector score and
  DINO similarity to the project legend/confirmed anchor; and
- `auto_selected_candidate_id`, or `null` if the cascade withholds.

The evaluator will not accept a prediction whose candidate list is incomplete,
whose selected id was not actually evaluated, or whose tile information is
hidden. This prevents hand-picked “best box” demos.

## Produce a tiled cascade manifest

`scripts/run_symbol_grounding_cascade.py` creates that manifest from selected
offline checkpoints. It runs RT-DETR over overlapping high-resolution page
tiles, converts every tile detection to original-page coordinates, applies
class-aware global NMS only after all tiles have been considered, then compares
every remaining crop to an independently supplied legend or confirmed-anchor
crop with DINO. It does not discover an anchor, trace a leader, bind a schedule
row, or calculate an installed quantity.

Each request records immutable page geometry supplied by review/context—not a
model answer:

```json
{"schema":"opentakeoff.symbol_grounding_request.v1","case_id":"example:AHU-1","source_image_path":"example/page-04.png","anchor_bbox_image_px":[10,20,80,90],"tag_bbox_image_px":[300,400,360,420]}
```

The default selection thresholds deliberately withhold every candidate. A
threshold must be frozen before held-out testing to emit a proposal, and a
candidate substantially overlapping the tag text box is withheld even if its
visual score is high.

```sh
python3 scripts/run_symbol_grounding_cascade.py \
  --requests /data/reviewer_requests.jsonl \
  --source-root /data/rendered_pages \
  --rtdetr-checkpoint /runs/rtdetr/best-val \
  --dino-checkpoint /runs/dino/best.pt \
  --dino-hub-cache /workspace/dino-hub-cache \
  --output /runs/cascade_predictions.jsonl
```

## Run

```sh
python3 scripts/project_grounding_benchmark.py \
  --cases /data/reviewer_cases.jsonl \
  --predictions /runs/cascade_predictions.jsonl \
  --output /runs/project_grounding_eval.json
```

The report includes detector recall at IoU 0.50 and 0.75, DINO top-1 rank among
the actual detector candidates, selected precision, refusal recall, duplicate
positive candidates, false accepts, tag-box self-verification attempts,
prohibited-body accepts, count error, latency median/p95, and breakdown by
equipment family.

## Non-negotiable acceptance evidence

The script defaults to a structural eligibility floor of **200 independently
reviewed real-PDF cases** spanning **10 projects**, with all held-out projects
also counted in that ten and full-sheet negative review for every held-out
case. These are *minimum coverage gates*, not a performance pass.

Before a release candidate can be considered, freeze a versioned threshold
file and evaluate the exact detector/verifier/cascade threshold on an untouched
project-held-out set. That gate must include every supported family—equipment,
valves, dampers/actuators, VAVs, AHUs/FCUs, pumps, and instruments—and report
unsupported classes as review-only. A model output never approves an installed
quantity. The production flow remains:

1. RT-DETR tiled full-sheet candidate proposals.
2. Global class-aware duplicate merge; no tile-boundary double count.
3. DINO legend/confirmed-anchor similarity ranking.
4. Vector text/tag/leader and schedule corroboration.
5. Human accept, reject, correct, or add a missed candidate.

Feedback from step 5 becomes future training data only after reviewer identity,
source hash, corrected bbox/class, decision state, and project split are
recorded. It is never online learning and it never changes a live job’s count.

## What this does **not** prove yet

It does not make the current two-model stack production ready. As of the first
version, we have far fewer than 200 human-reviewed legend/anchor-to-plan
grounding cases and no complete full-sheet negative labels. The harness makes
that deficit measurable instead of hiding it behind detector mAP or two-view
embedding similarity.
