# Symbol-sweep ground truth

This directory is a separate, symbol-only benchmark. It does not modify or
reinterpret the document/table ground-truth records in `../records/`.

Each case freezes one visually reviewed seed and every installed instance of
that same symbol on either the stated page (`scope: "sheet"`, the default) or
all plan-role pages in the file (`scope: "set"`). A case records:

- the immutable source PDF hash, page, printed sheet, and image-pixel size;
- the exact seed rectangle and seed tag text-run box;
- one physical-symbol center and tolerance per non-seed instance;
- the source page for every expected instance in a set-wide case;
- the exact PDF text-run box that names each expected instance; and
- retained full-page visual evidence plus review notes.

The first 30 cases are the one-case-per-document baseline. Cases carrying
`"campaign": "extended"` deliberately exercise additional, different symbol
families on those same source documents. The expanded campaign is cumulative:
new discoveries never replace the baseline and every fix must keep all prior
cases passing.

When a PDF has exploded its printed title-block text into raw vector paths,
`sheet_number` remains the visually audited printed truth and the optional
`engine_sheet_number` records the current core sheet-number extractor output.
This keeps a symbol-only case honest without silently redefining a VAV tag as
the printed sheet number or expanding the symbol-sweep task into unrelated
title-block OCR work.

Set-wide cases also fail when any plan-role page is skipped. Legends,
schedules, details, and cover sheets must be reported in `skipped` and are
intentionally excluded because their symbols are reference graphics, not
installed work.

The center tolerance is a *physical containment* tolerance, not permission to
count nearby linework. It accounts for a symbol fingerprint's length-weighted
centroid moving toward its duct/pipe connector under rotation. The expected
center is the visually reviewed center of the symbol body. Every returned
marker must fall within that body's stated tolerance, and the one-to-one
assignment must consume every expected and returned placement exactly once.

Run from `opentakeoff/mcp`:

```sh
node --import tsx scripts/symbol-sweep-corpus.mjs
```

Optional case ids may follow the command. The process exits nonzero on any
hash, sheet, count, completeness, localization, tag-family, or tag-box error.

`cases.json` is authored ground truth. The runner is evaluation code only: it
must never infer or rewrite expected answers from production output.

## Schema v2 (additive) — GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 1

`schema: "opentakeoff.symbol_sweep_ground_truth.v2"` is a strict superset of
v1: every v1 case remains valid as-is (every new field below is optional),
and `symbol-sweep-corpus.mjs`'s existing count/hash/localization/tag-box
checks are unchanged. v2 adds fields the v1 schema had no room for — the
ones GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md §4 requires to separate
*proposal*, *ownership*, *identity*, and *count* failures instead of
collapsing everything into one pass/fail per case. A case (or an individual
`instances[]` entry) may carry any subset of these; absence means "not yet
reviewed to this depth," never "false" or "zero."

Per-instance (added to an `instances[]` entry, alongside its existing
`id`/`at`/`tolerance_px`/`tag`/`tag_bbox`):

- `context?: { building?, area?, floor?, discipline? }` — drawing/building/
  area context beyond the case-level sheet/page, for duplicate-tag scoping
  across floors/buildings/disciplines.
- `family?: string` — the equipment/symbol family (e.g. `"ceiling diffuser"`,
  `"control valve"`), independent of the exact printed tag.
- `tag_scope?: string` — the building/floor/discipline scope a duplicate tag
  is unique within (e.g. `"Building 1"`), when the same tag text is reused
  elsewhere in the project under a different scope.
- `reference_source?: "manual_seed" | "legend_row" | "reusable_object" |
  "schedule_query"` — how this instance's family identity was established.
- `reference_bbox?: [x0,y0,x1,y1]`, `reference_primitive_ids?: (string|number)[]`
  — the reference geometry (seed, legend glyph, or reusable object) and the
  vector primitive IDs it owns. `reference_primitive_ids` is null/absent
  until a stable primitive-ID space exists (GEMINI-VECTOR-SYMBOL-GROUNDING-
  GOAL.md Phase 2's VectorSceneIndex) — a real, disclosed dependency, not an
  oversight.
- `body_bbox?: [x0,y0,x1,y1]` — the reviewed physical-symbol body's own tight
  bbox, independent of `tag_bbox` (the drawn instrument/equipment glyph,
  never a leader or a tag).
- `body_polygon?: [x,y][]` — a reviewed polygon/mask instead of a bbox, when
  a bbox would include unrelated carrier linework (a symbol tight against a
  duct/pipe run).
- `owned_primitive_ids?: (string|number)[]` — the vector primitives this
  instance's body owns exclusively. Same Phase-2 dependency as
  `reference_primitive_ids` above.
- `leader?: { polyline: [x,y][], terminal_at: [x,y] }` — the drawn leader
  polyline and its terminal endpoint, when a real leader connects the tag to
  the body (never fabricated when no leader is drawn).
- `association_type?: "enclosed" | "adjacent" | "leader" | "inline" |
  "shared_callout" | "schedule_only" | "unlabelled"` — how the tag relates to
  the body, per §4.
- `carrier_attachment_points?: [x,y][]` — where an inline symbol attaches to
  its carrying duct/pipe run, when applicable.
- `countable?: boolean`, `countable_reason?: string` — whether this instance
  counts toward installed quantity, and why when it doesn't (e.g. a legend
  reference drawn on a plan sheet as an illustrative callout).
- `transform_family?: "rigid" | "mirrored" | "uniform_scale" |
  "bounded_affine" | "redrawn_variant"` — the expected transform class,
  independent of what any matcher currently reports. `SYMBOL-SWEEP-AFFINE-
  GOAL.md`'s own exhaustive 2026-09-10 search found zero real off-grid-
  rotated or anisotropically-stretched instances anywhere in this
  30-document corpus (20 candidate hits, all 20 confirmed false on render) —
  so `bounded_affine`/`redrawn_variant` instances are expected to come from
  the larger bulk corpus (`opentakeoff-corpus/bulk/`), not by relabeling an
  existing case.
- `render?: string` — a path (relative to this file) to a retained rendered
  crop proving this specific instance, independent of the case-level
  `review.render` full-page image. Generate with
  `opentakeoff/mcp/scripts/render-region.mjs` (burns a ring marker at the
  claimed center) so every v2-annotated instance has an image, not just an
  assertion.

Case-level (alongside the existing `id`/`document_id`/`source_pdf`/
`source_sha256`/`page`/`sheet_number`/`page_size_px`/`seed_rect`/`seed`/
`instances`/`review`):

- `hard_negatives?: []` — real counter-examples reviewed and rejected from
  this case's own installed count, each `{ at, bbox, kind, notes }` with
  `kind` one of: `similar_sibling`, `richer_variant`, `poorer_variant`,
  `text_only_tag`, `note_bubble`, `network_junction`, `hatch`, `arrowhead`,
  `schedule_or_legend_occurrence`. Distinct from the engine's own runtime
  `exclude` counter-example rects (`SweepOptions.exclude`, a production
  input) — this is frozen ground truth about what a correct engine must
  never auto-accept, scored by a future stratified evaluator, not consumed
  by `symbol_sweep` itself.
- `holdout_split?: "development" | "validation" | "holdout"` — frozen before
  any Phase 2+ implementation begins, per §6's gate. A case with no
  `holdout_split` is implicitly `development` (today's status for all 47
  baseline/extended cases — the split is not yet frozen).

None of the above weakens, replaces, or overrides an existing v1 field or
the existing scorer's pass/fail semantics — see `symbol-sweep-corpus.mjs`'s
own `--report-v2-fields` mode (reports what's present per case; changes no
existing check).
