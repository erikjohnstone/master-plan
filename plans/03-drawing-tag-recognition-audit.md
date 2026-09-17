# Drawing Text-Tag Recognition — Codebase Audit

Date: 2026-09-17. Scope: everything in `opentakeoff/` that finds, classifies,
joins, identifies, or counts *text tags* drawn on plan sheets (`FCU-1`,
`VAV-HHW-1`, `AHU-M1`, `P-6A`, `CD-1`). Symbols are out of scope except where
a tag is used to reach one.

Goal this audit serves: **"count every FCU tag on the drawings and reconcile
against the schedules"**, and **"run a takeoff and attach every schedule mark
to the place on the drawing where its tag is drawn"** — tags lead to symbols,
and the user then marks the symbol the tag names.

---

## 1. Verdict in one paragraph

The repo has strong *ingredients* for tag recognition — a shared tag-shape
classifier, glyph-split joining, seven fallback recovery strategies for a
known key, a stacked/divided-bubble reconstructor, an alias-identity module,
rotation-aware span extraction on three paths — but it has **no tag census**.
Every tag finder is *per-key, on demand*: you must already know the tag
(from a schedule row) before the system will look for it, and the look is
coupled to a geometric symbol sweep. There is no layer that answers "what
tags are drawn on this sheet / this set", no UI that shows drawn tags, no
tool that lists tags that are drawn but *not* scheduled, no ground truth that
scores tag recall, and the one census-shaped tool (`count_marks`) is built
for air devices with a CFM under the tag and rejects most equipment tag
shapes. The alias-identity module (`markid.ts`) is fully designed and tested
and has **zero production callers**.

---

## 2. Inventory — what exists today

### 2.1 Text extraction (the raw material)

| Path | File | Notes |
|---|---|---|
| MCP server | `mcp/src/pdf.ts` `textSpans()` | pdf.js `getTextContent()`; rotation-aware 4-corner bbox; emits `rot` (0/90/180/270); pipes through `joinHyphenatedTags`. |
| Canvas whole-set index | `web/src/pages/TakeoffCanvas.jsx` ~L2205 (`indexOneSheet`) | Same math, persisted per (sheetKey, rev) in IndexedDB via `web/src/lib/textIndex.js` (v3). |
| Canvas per-panel | `TakeoffCanvas.jsx` `ensureTextSpans` | Same math; feeds the open-sheet tools. |

- **No OCR on plan text.** Tesseract.js and the Python table-structure
  sidecar (`sidecar/table_structure_rpc.py`, PaddleOCR ONNX models in
  `sidecar/models/`) run only through `Session.ocrScheduleRegion` for
  *schedule table regions* (pipeline L4.5, `rasterTableAssist.ts`). Plan
  sheets are text-layer-only.
- **Scanned sets refuse** (`graph.available === false`); `count_marks` and
  `sweep_schedule_row` throw "no text layer".
- **Exploded text** (tag letterforms authored as filled vector paths) is a
  documented, confirmed ceiling (`GOAL.md §7`: bldg5406 `EF-2`/`EF-3`).
  `symbolsweep.ts` L147/L2459 recognises the *pattern* only to keep it from
  being mistaken for a symbol; nothing reads it.

### 2.2 Tag-shape classifiers

| Module | Rule | Consumers |
|---|---|---|
| `web/src/lib/equiptags.ts` `isEquipTag` | letter-led, hyphen-separated, ≤5 segments, ≤20 chars; a 2-segment tag must contain a digit; 3+ short segments accepted digitless (`CV-CHW-BP-T`). | `scheduleParse.ts`, `sheetgraph.ts` (row keys), `controlSchematic.ts`, `symbollabels.ts`, MCP `textSpans`. |
| `equiptags.ts` `joinHyphenatedTags` / `joinGraphSpans` | Re-glues CAD glyph splits on one baseline (`PCHWP` + `-` + `MT1`) only when the concatenation *is* a tag. | Everywhere spans are produced. |
| `web/src/lib/symbollabels.ts` `labelTokens` | The richest classifier: `isEquipTag` ∪ `LABEL_TOKEN_RE` (`/^[A-Z]{1,4}-?\d{1,3}[A-Z]?$/`) ∪ `DIGITLESS_LABEL_TOKENS` ∪ instrument bubbles ∪ **stacked prefix-over-number reconstruction** (`HWP` over `1` → `HWP-1`, with a 2-instance or demonstrated-family quorum) ∪ stacked BAS points (`13` over `AI` → `AI-13`) ∪ inline airflow families (`SS15-` + `65`) ∪ floor-prefixed (`1-VAV-2`). Excludes `M12`-style note bubbles and BAS control point names. | **Only** inside symbol-sweep label attachment (`labelPlacements`, `groundExactTagsToVectorGeometry`). Not exposed as a tool, not stored on the graph, not drawn in the UI. |
| `symbollabels.ts` `canonicalLabelFamily` | `VAV-E-101` → `VAV-E`; `HWP-1` → `HWP`; short marks (`CD-1`, `P-6A`) stay exact. | Sweep label reconciliation. |
| `mcp/src/session.ts` `countMarks` `MARK_RE` | `/^[A-Z]{1,3}-?\d{1,3}[A-Z]?$/` | `count_marks` only. Accepts `FCU-1`, `P-6A`, `ERV-01`; **rejects** `VAV-HHW-1`, `AHU-M1`, `FCU-A8`, `CUH-T1`, `CV-CHW-BP-T`. |
| `web/src/lib/corpusTakeoff.mjs` `HVAC_FAMILY_SPECS` | 48 families (`titleRe`/`keyRe`/`blankKeyRe`) mapping *schedule rows* to families (FCU `keyRe: /^(?:FCU|FC[\s\-]?\d|EV|DFC|F[\s\-]?\d|AC[\s\-])/`). | Compile + reconcile. Schedule side only; not applied to drawn plan text. |

### 2.3 Tag identity (are two spellings the same mark?)

| Where | Rule | Problem |
|---|---|---|
| `web/src/lib/markid.ts` | `markKey`: strip case/space/hyphen (`P-1`≡`P1`≡`P 1`); short-mark overcount guard (`P1` never claims `P10`/`P1A`); twin-alias clustering at 2.2× text height; shared bare mark (`ET` with `ET-1`,`ET-2` in vocab) refuses; compound run `R1 /C-11` counts as `R1`. 16 tests. | **No production consumer.** `grep` finds only `web/test/markid.test.ts`. |
| `countMarks` `canon` | upper-case, strip whitespace, **keep hyphen**; exact string equality | `FCU-1` (schedule) ≠ `FCU 1` or `FCU1` (drawn). |
| `tagOccurrencesOnSheet` (session.ts L3522) | exact `toUpperCase()` equality first; the fallbacks (`splitHyphenTagOcc`, `fragmentedTagOcc`, …) are hyphen-insensitive | Inconsistent with the exact pass. |
| `schedulePlanReconcile.mjs` | `normalizeEquipMark`, `expandAmpersandEquipMarks`, `markCoreForKeyRe` | A third normaliser. |

Three different answers to "is this the same tag" live in three modules.

### 2.4 Per-key occurrence finders (given a tag, where is it drawn?)

`Session.tagOccurrencesOnSheet(sheet, key)` — cached per (sheet, key) — merges:

1. exact single-span match
2. `compoundTagOcc` — `R1 /C-11` style, token boundary after the key, dotted numeric suffix rejected (sheet numbers)
3. `countPrefixedScheduleTagOccurrences` — authored `(N) TAG`
4. fallbacks, only if 1–3 found nothing: `splitHyphenTagOcc` (`SCHWP`+`M1`), `fragmentedTagOcc` (same-row or stacked `EF` over `1`), `familyQuorumFragmentedTagOcc`, `deepHyphenChainTagOcc` (≥2 hyphens, `CV-CHW-BP-M` six hops), `familySuffixTagOcc` (prefix exploded, suffix text, 4-sibling quorum)
5. `scheduleCountMultiplier` reads `TYP 8` / `(8)` multipliers beside a tag.

All in `web/src/lib/symbolsweep.ts` L2812–3260. Well-engineered, well-commented, regression-covered. **Per key only** — nothing enumerates.

### 2.5 Tag → geometry attachment

- `symbollabels.ts` `labelPlacements` / `leaderTerminalPointsForLabel` /
  `reconcileSweepLabels`: assigns a token to a swept placement by adjacency
  (2.2× text height; 5.5× for multi-part equipment tags), stacked layout,
  or a followed leader line. Guards against a tag inside its own glyph.
- `web/src/lib/taggedVectorGrounding.ts` `groundExactTagsToVectorGeometry`:
  for each exact occurrence, fingerprint the distinctive linework in a
  1×/2×/3× text-height pad ladder and require label assignment to hand that
  exact occurrence back. Result is `matches[]` + `text_only[]` (reason:
  `no_distinctive_local_geometry` | `geometry_not_attached_to_exact_tag`).
- `sweep_schedule_row` (session.ts ~L3600–5150): anchor on the sheet with the
  most occurrences, corroborate the fingerprint on a second occurrence, sweep
  every plan sheet, count only geometry+text agreeing; discloses
  `text_only`, `withheld`, `excluded`. Refuses when the tag is "not drawn on
  any plan sheet" (L4092).

### 2.6 Tools and surfaces

| Tool / surface | Tag capability | Gap for the goal |
|---|---|---|
| `find_text` | case-insensitive substring per span; set-wide | No tag semantics; `FCU` matches `FCU SCHEDULE`, `FCU-10`, prose. |
| `read_sheet_text` | raw spans in a region | — |
| `count_marks` | census of *tag with a paired value under/beside it* on plan-role sheets; excludes table regions; withholds the rest with reasons | Equipment tags rarely carry a value → withheld. `MARK_RE` rejects multi-segment tags. Exact-string identity. |
| `sweep_schedule_row` | one row → geometric count, `tag_at`, `text_only` | Expensive per row (fingerprint + full-set sweep). Not a census. |
| `reconcile_schedule_plan` (`schedulePlanReconcile.mjs`) | walks schedule rows → `sweep_schedule_row` each; emits `scheduled_qty`, `installed_qty` (geometry-graded), `tagged_plan_qty`, `plan_tag_cites`, `plan_candidate_cites`; CSV export | One-directional: schedule → plan. Never reports **drawn-but-unscheduled** tags. Cost is N geometric sweeps. |
| `resolve_tag` | **room** tags only (`134`, `A-134`) | Name collides with the user's meaning; does nothing for equipment. |
| `sheet_graph` | `rooms`, `unmatched_tags` (numeric only), `tables`, `callouts`, `revisions` | **No equipment-tag layer.** |
| Canvas UI | `count_marks` / `sweep_schedule_row` proxied to the Session; takeoff panel cites schedule cells (`TakeoffDataPanel.jsx`) | No tag overlay, no tag list, no "attach symbol to this tag" gesture, no plan-cite jump from a takeoff row. |

### 2.7 Evaluation and ground truth

- `keys/*.takeoff.csv` — `tag, equipment_type, expected_quantity, sheets` per
  scheduled item (8 sets). Scores the end result, not tag recall.
- `keys/*.rowsym.csv` — per row, `resolved|refused` for `sweep_schedule_row`
  (8 sets). Closest existing metric (GOAL §2.3 "rowsym").
- `ground_truth/hvac/*.json` — schedule-side corrections only.
- **No key anywhere lists the tags drawn on plan sheets** (per sheet, per
  occurrence, with bbox). Tag recall/precision is unmeasured.

### 2.8 Tests touching tags

`web/test/equiptags.test.ts` (6), `web/test/markid.test.ts` (16, module
unused), `web/test/symbolLabels.test.ts`, `web/test/taggedVectorGrounding.test.ts`,
`web/test/symbolsweep.test.ts`, `mcp/test/tools.test.ts` + `conformance.test.ts`
(`count_marks` wire shape), `mcp/test/*PlanPaint*.mjs`, `valveMarkIdentity.regression.test.mjs`.

---

## 3. Gaps, ranked by distance from the goal

**G1 — No tag census / index (blocking).** Nothing produces "all tags drawn on
sheet X" or "all tags in the set". `labelTokens` computes exactly that per
sheet but the result is consumed privately and discarded. Consequences:
"count the FCU tags" has no primitive; drawn-but-unscheduled tags are
invisible; every reconcile is N geometric sweeps instead of one text pass.

**G2 — `count_marks` is the wrong shape for equipment.** Needs a paired CFM/GPM
value; `MARK_RE` caps the family at 3 letters and forbids a middle segment;
identity is exact-string. For `FCU-1 … FCU-28`, `VAV-HHW-1`, `AHU-M1` it either
withholds or never looks.

**G3 — Three tag-identity rules.** `markid.ts` (the correct, tested one) is
unused; `countMarks`, `tagOccurrencesOnSheet`, and reconcile each normalise
differently. Hyphen/space twins and short-mark overcount are handled in some
paths and not others.

**G4 — Tag → symbol is geometry-first, not tag-first.** Attachment code exists
and is good, but the entry point is always a fingerprint or sweep. The user's
intended flow — *show me the tag, I'll mark the symbol* — needs a tag-first
entry: list occurrences, let the user (or `groundExactTagsToVectorGeometry`)
attach geometry per occurrence, mint the count marker from the tag.

**G5 — No UI for tags.** No overlay of recognised tags on the canvas, no tag
list per sheet, no schedule-row → drawn-tag jump, no per-occurrence
accept/reject.

**G6 — Family taxonomy is schedule-only.** `HVAC_FAMILY_SPECS.keyRe` is applied
to schedule row keys; drawn tags are never family-classified, so "how many
FCU tags" cannot be answered even after a census without re-applying the
same `keyRe` on the plan side.

**G7 — No plan-text OCR / glyph path.** Scans refuse outright; exploded-text
tags are a known ceiling. Table OCR infrastructure exists (tesseract.js,
PaddleOCR det/cls ONNX in the sidecar) but is never pointed at plan sheets.

**G8 — No tag ground truth.** Cannot measure census recall/precision; the
corpus loop cannot catch a regression in tag recognition except indirectly
through takeoff/rowsym keys.

Smaller: `LABEL_TOKEN_RE` and `MARK_RE` and `isEquipTag` disagree at the
edges (`FD1` is a label token but not an equip tag; `AHU-M1` is an equip tag
but not a `MARK_RE` mark). Table-region exclusion in `count_marks` uses the
graph's table regions — a tag in an untitled/unextracted table (see
`TAKEOFF_BUG_CATALOGUE.md` on untitled pump schedules) is counted as a plan
occurrence.

---

## 4. Recommended build order

Everything below sits on the **shared path** (`AGENTS.md` gate): one module,
consumed by Session (MCP) and the canvas.

### Step 1 — `tagIndex`: a set-wide drawn-tag census (text only, cheap)

New shared module, e.g. `web/src/lib/tagIndex.ts`, run over the same spans
`textIndex.js` / `textSpans()` already produce, cached per (sheet, rev):

```
TagOcc { sheet, text, key /* markKey */, family /* canonicalLabelFamily */,
         bbox, rot, source: exact|joined|stacked|compound|count_prefixed,
         in_table: boolean, table_ref?, multiplier /* TYP N, (N) */ }
```

- Recognition = `labelTokens(spans)` (already handles joins, stacked bubbles,
  BAS points, inline airflow) ∪ `isEquipTag` ∪ `compoundTagOcc`.
- Identity = `markid.ts` `markKey` (wire the unused module in here first).
- Mark `in_table` from `graph.tables[].region`, plus title-block / legend
  regions from sheet roles, so schedule row labels and legend samples are
  tallied separately, never dropped.
- Family = `canonicalLabelFamily` + `HVAC_FAMILY_SPECS.keyRe` applied to the
  drawn key (G6).
- Attach to `SheetGraph` as `plan_tags: TagOcc[]` (role `plan` sheets) and
  `reference_tags` (everything else), so `sheet_graph` returns it and the
  canvas index has it for free.

Expose as `list_tags { sheet?, family?, key? }` (MCP) and the same call on the
canvas agent. Refuse honestly on scans, as today.

### Step 2 — Unify identity

Replace `countMarks.canon` / `MARK_RE`, the exact pass in
`tagOccurrencesOnSheet`, and reconcile's normaliser with `markKey` +
`spanAnswersFor` from `markid.ts`. Keep `pickMarkHits` twin-alias clustering.
Regression tests already exist for the rules; add a seam test that the three
callers agree on a fixture.

### Step 3 — Two-way reconcile on top of the census

Extend `reconcile_schedule_plan` (or add `reconcile_tags`) to produce:

| bucket | source |
|---|---|
| scheduled ∧ drawn | rows × `plan_tags` (text), `tagged_plan_qty`, cites |
| scheduled ∧ not drawn | rows with zero census hits (today: a refusal buried in a sweep) |
| drawn ∧ not scheduled | census keys with no row — **new**, the estimator's RFI list |
| shared / ambiguous | bare family marks, building-letter collisions (`markid` shared-bare rule; existing `drawing_group` scoping) |

Keep the existing evidence grades: a text-only count stays
`tagged_plan_qty` / `tag_text_only`; geometry still upgrades it to
`installed_qty`. That preserves the "text alone never proves installation"
doctrine while finally answering "how many FCU tags are drawn".

### Step 4 — Tag-first symbol attachment (the user's flow)

- Canvas: tag overlay (chip per `TagOcc`, colour by family, grey when
  `in_table`), a per-sheet tag list, click → zoom, and a **"mark symbol"**
  gesture: from a selected tag occurrence, run
  `groundExactTagsToVectorGeometry` in the local pad ladder; if it returns a
  match, stage it via the existing `propose_shapes`/`place_count` path with
  `origin.tag_at`; if `text_only`, let the user marquee once and
  `symbol_sweep` from there, with the tag pre-filled as the condition.
- Takeoff panel: add a plan-cite column next to the schedule cite so each
  row jumps to its drawn tag(s).
- MCP: `attach_tag { key, occurrence_index | at }` doing the same, so the
  agent can drive it.

### Step 5 — Ground truth and eval

Add `keys/<set>.tags.csv` (`sheet, tag, x0, y0, x1, y1, in_table, note`) for
3–5 sets, hand-verified from renders, and a `tag-eval.mjs` scoring census
precision/recall per sheet and per family. Start with sets already
hand-verified for rowsym (bessemer, baker-county-eoc, bldg5406, itd-d1-lab,
federal-mech) so the plan side of the existing rowsym reasoning becomes
measurable.

### Step 6 — Plan-text OCR / glyph fallback (after 1–5)

Only where the text layer is empty or a sheet shows the exploded-text
pattern: tile-render the plan region, run the sidecar's PaddleOCR
detection + tesseract recognition on tiles, feed the words through the same
`labelTokens` classifier, and mark every such `TagOcc` `source: "ocr"` with
its confidence. Same disclosure rules as L4.5 table OCR. This is what lifts
the bldg5406 `EF-2`/`EF-3` ceiling and scanned sets.

---

## 5. Files to start from

- `opentakeoff/web/src/lib/equiptags.ts` — classifier + join (keep)
- `opentakeoff/web/src/lib/symbollabels.ts` L131–475 — `labelTokens`, stacked reconstruction (reuse as the census recogniser)
- `opentakeoff/web/src/lib/markid.ts` — identity (wire in)
- `opentakeoff/web/src/lib/symbolsweep.ts` L2812–3260 — occurrence fallbacks (reuse per key)
- `opentakeoff/web/src/lib/taggedVectorGrounding.ts` — tag-first geometry attach (reuse in Step 4)
- `opentakeoff/mcp/src/session.ts` L2514 (`countMarks`), L3522 (`tagOccurrencesOnSheet`), L7567 (`findText`)
- `opentakeoff/web/src/lib/schedulePlanReconcile.mjs` L668–975 — reconcile rows (extend in Step 3)
- `opentakeoff/web/src/lib/sheetgraph.ts` L8324 `SheetGraph` — add `plan_tags`
- `opentakeoff/web/src/lib/textIndex.js` — persisted spans; add a sibling cache for the census
- `opentakeoff/web/src/pages/TakeoffCanvas.jsx` L2205 (`indexOneSheet`), L8677 (`agentCountMarks`)

---

# Part 2 — Row ↔ tag reconciliation: exact path and measured diagnosis

Date: 2026-09-17. Question: on the T-VALVE-01 takeoff panel only a handful of
the 163 rows show a `Symbol`/`Tag` cite. Are we failing to pull tags? Measured
on the production path against the real set, no code changed.

## 2.1 How the measurement was run

- Real `Session` (`mcp/src/session.ts`): `loadPlan` → `graphForPipeline()` (the
  shared sheet-graph pipeline both the canvas and MCP use) → `sweepScheduleRow`
  with the exact options `reconcile_schedule_plan` passes
  (`evaluationFast: true, verifyTaggedGeometry: true`).
- Roles, tables, and row keys come from that production graph.
- The tag *census* has no production implementation (that is finding G1), so it
  was built from production parts: the production span extraction
  (`textSpans`) fed to the production tag recogniser (`labelTokens`, the same
  function the sweep uses internally for label attachment) in a set-wide loop.
- Table sidecar off (`OPENTAKEOFF_TABLE_SIDECAR=0`), same as the corpus emit
  scripts. This affects raster-table OCR only, not plan text.
- Set: `navfac-cherry-point-atc-mechanical.pdf`, 75 sheets, 87 tables.
  Graph build 81 s; census over all 75 sheets 0.5 s; each sweep 20 ms to 1.4 s.
- Scripts kept out of the repo (scratch): `tag-census-diag.mjs`, `tag-followup.mjs`.

## 2.2 The exact row → tag path (what produces a `Symbol` / `Tag` chip)

```
compile_corpus_takeoff (control_valves)          schedule only; zero plan fields
  └─ corpusTakeoff.compileControlValveTakeoff     export/takeoff.json has no plan_* keys
reconcile_schedule_plan {family|categories|tags}  the only step that touches plans
  └─ schedulePlanReconcile.reconcileScheduleFamilyWithSweeps
       row identity = rowIdentityTag(row)         VALVE MARK beats UNIT MARK (L337)
       └─ Session.sweepScheduleRow(tag, {evaluationFast, verifyTaggedGeometry})
            1. find the row (rowKeyAnswersFor / identityOf)
            2. sheets = graph.sheets with role === "plan" ONLY (L3990)
               every other role → skipped[] "reference drawings, never installed work"
            3. occurrences = tagOccurrencesOnSheet(sheet, tag)   (L3522)
               exact span == tag, then compound / (N) TAG / split / fragmented /
               deep-hyphen / family-suffix fallbacks — per key, cached
               candidates tried: tRaw, t, MARK/SYMBOL/TAG/EQUIP TAG cells, row identity
               NEVER the UNIT MARK when the row's own identity is VALVE MARK (L4048)
            4. totalOcc === 0 → throw "cannot be geometrically anchored — its tag
               is not drawn on any plan sheet"                             (L4092)
            5. else anchor on the most-occurrence plan sheet, verify local
               geometry per occurrence (groundExactTagsToVectorGeometry) →
               grounding_basis tag_attached_vector | symbol_fingerprint | exact_plan_tag
  └─ attachDiagramCorroboration(rows, control_schematics)   separate, corroboration only
canvas: agentTakeoff.rowsFromToolResult("reconcile_schedule_plan")
  plan_cites[0]  → field plan_tag             → line.plan_sheet_id  → "Symbol · p.N"
  tag_bbox       → field plan_tag_observation → line.plan_tag_*     → "Tag · p.N"
  diagram_cites  → field diagram_tag          → "Schematic evidence · p.N"
  refusal        → field plan_status=refused  → note only; chip shows "No verified plan symbol"
TakeoffDataPanel.SourceComparisonActions renders the FIRST cite of each kind only.
```

There is no tag → row direction anywhere. Nothing lists what is drawn.

## 2.3 What the set actually contains (census)

| Measure | Value |
|---|---|
| Sheet roles from the production graph | plan 26 · legend 27 · schedule 8 · detail 10 · elevation 4 |
| Text spans, all sheets | 34,494 |
| Tag-shaped tokens (`labelTokens`) outside table regions | 2,314 (plan 1,106 · legend 1,071 · detail 90 · elevation 33 · schedule 14) |
| Equipment-shaped (`isEquipTag`) tokens outside tables | 1,803 |
| Distinct equipment-shaped keys drawn outside tables | 301 |
| … that match some schedule key | 238 |
| … that match no schedule key | 63 (mostly sheet callouts `M-501`×21, `M-301`×12; real ones: `CSF-CHW-M1`, `CSF-HHW-A1`, `CV-HHW-BP-M`, `CV-CH-C-MT1`) |

Schedule keys pulled from the graph: 427 (equipment rows 318, VALVE MARK 106,
UNIT MARK-keyed rows 3).

| Schedule key kind | never drawn as text | drawn on plan-role sheets only | drawn on non-plan roles only | both |
|---|---|---|---|---|
| VALVE MARK (106) | **101** | 0 | 5 | 0 |
| equipment row (318) | 3 | 155 | **93** | 67 |
| UNIT MARK-keyed (3) | 0 | 3 | 0 | 0 |

FCU specifically: 42 FAN COIL UNIT SCHEDULE rows (14 + 10 + 18 across the three
building schedules); 44 distinct `FCU-*` tags drawn outside tables; 89
occurrences, 84 of them on plan-role sheets. Every FCU is drawn, most twice
(plan + enlarged plan). `sweepScheduleRow("FCU-A1")` → found 1,
`tag_attached_vector`, 1.4 s.

Live sweeps, as reconcile calls them:

| tag | result |
|---|---|
| `FCU-A1`, `AHU-A1`, `FCU-T11`, `CV-CHW-BP-A` | found 1, basis `tag_attached_vector` |
| `CV-FCU-A1-CHW`, `CV-CUH-A1-HHW` | REFUSED "not drawn on any plan sheet" (20 ms) |
| `HRHWP-MT1`, `HRHWP-MT2`, `PCHWP-MT1` (drawn 5–10× on the schematic sheets) | REFUSED "not drawn on any plan sheet" |

## 2.4 Diagnosis — why the panel shows ~6 tag cites out of 163

**D1. The valve marks are genuinely not drawn.** 101 of 106 VALVE MARKs
(`CV-FCU-A1-CHW` …) appear nowhere in the set's text outside the schedule.
The five that do (`CV-CHW-BP-A`, `CV-HHW-BP-A1`, …) are the plant bypass
valves labelled on the control schematics. The sweep is not losing valve
tags; the drawings label valves by symbol next to the unit they serve, and
the schedule row's own identity is the only string the sweep is allowed to
search. So the six chips are the complete literal answer, and the remaining
157 rows are correctly "not drawn". This is the part of the user's
observation that is *not* a recall bug.

**D2. The served UNIT MARK is drawn for essentially every valve row and is
never searched.** `FCU-A1` is drawn twice; so are `AHU-A1`, `DOAH-A1`,
`CUH-A1`. `sweepScheduleRow` explicitly refuses to fall back from an
undrawn VALVE MARK to the UNIT MARK (session.ts ~L4048, "never count the
AHU/FCU as a valve"). That refusal is right for *quantity* (a unit tag is
not a valve), but it also throws away the *location*: a valve row could
carry "served unit `FCU-A1` located at p.29 (x,y)" as a distinct evidence
grade, which is exactly what an estimator wants to click. Today the panel
has no such grade, so the row ends at "No verified plan symbol".

**D3. Sheet-role misclassification hides 499 tag occurrences.** Pages 52–66
(`MI702`…`MI732`) are the DDC control schematics — sequence text plus
schematic diagrams — but every one carries the note "REFER TO M-001 FOR
MECHANICAL LEGEND, ABBREVIATIONS", and the graph classifies all fourteen as
`legend`. 93 equipment marks (plant pumps `HRHWP-MT1`, `PCHWP-MT1`,
`SHHWP-M1`, chiller valves `CV-CH-H-MT-1`, BAS points `AI1`…) are drawn
*only* there; the sweep skips every non-plan role, so each is refused as
"not drawn on any plan sheet" even though the text is drawn 5–10 times.
This is a real production bug with two halves: (a) the role classifier
lets a cross-reference note win the title vote; (b) the sweep's plan-only
gate has no "schematic" role to admit and no text-only occurrence
disclosure for skipped roles. `attachDiagramCorroboration` partly
compensates (it is where "Schematic evidence · p.56" comes from) but only
for tags the control-schematic extractor harvested inside a recognised
schematic region, and it never counts.

**D4. Identity is exact-string at the first gate.** `tagOccurrencesOnSheet`'s
primary pass is `span.str.toUpperCase() === key`; hyphen/space aliasing
lives only in the fallbacks and in the unused `markid.ts`. The schedule
spells `CV-CH-H-MT-1`; the schematic draws `CV-CH-C-MT1`. Neither the
sweep nor anything else reports "a near-alias of this row is drawn here".

**D5. One-way, first-cite-only, export-blind.** Reconcile runs schedule →
plan only, so the 63 drawn keys with no schedule row are never listed. The
panel renders only `plan_cites[0]` / `plan_tag_cites[0]`, so a mark drawn
twice shows one chip. The compile export (`export/takeoff.json`,
`*.csv`) carries no plan or tag fields at all.

**D6. Cost was never the barrier.** The whole-set text census took under a
second after the graph build; the per-row sweep is 20 ms (refusal) to 1.4 s
(geometry). A 427-key text census is cheap; a 427-row geometric sweep is
what reconcile does today and is the slow part.

## 2.5 What "reconcile all the FCU rows against their drawn tags" needs

Mapping the gaps to the build order in §4 (unchanged, now evidence-backed):

1. **Tag census on the graph (§4 step 1)** — closes D5's inverse direction and
   gives every row a text-level answer before any geometry runs. From this
   set: 2,314 tokens, 1,803 equipment-shaped, 301 distinct keys, ready in
   0.5 s.
2. **Role fix + role-aware census** — D3. Either classify `MI7xx` as a new
   `schematic` role, or stop a "REFER TO … LEGEND" note from voting; then let
   the sweep *disclose* occurrences on non-plan roles as `reference_tags`
   (never counted as installed) instead of throwing.
3. **Served-equipment location grade** — D2. For rows whose own identity is
   not drawn but whose UNIT MARK / served tag is, emit
   `located_via_served_equipment` cites (sheet + bbox of `FCU-A1`) with
   `installed_qty` still null. That alone lights up ~150 of the 163 valve rows.
4. **Single identity (`markKey`) at the first gate** — D4, §4 step 2.
5. **UI: all cites, not the first; exports carry tag cites** — D5.

Everything above is text-only and sits on the shared path; none of it
changes the geometry doctrine (text never proves installation).

---

# Part 3 — Implementation plan (for an executing coding agent)

This part is self-contained. Parts 1–2 are the evidence; execute from here.

## 3.0 Ground rules the executor must follow

1. Read `AGENTS.md` (repo root) and `opentakeoff/AGENTS.md` first. Every work
   package below is **shared-path** work: one module under
   `opentakeoff/web/src/lib/`, consumed by `mcp/src/session.ts` and by the
   canvas. Never add a UI-only or MCP-only fork of tag logic.
2. Doctrine that must survive every change: **text never proves installation.**
   A drawn tag may *locate* and *cite*; only geometry (or an explicit
   installation note) may fill `installed_qty`. New evidence grades are
   additive; never promote a text observation into `installed_qty`.
3. No corpus names, sheet numbers, or tag literals hard-coded in production
   code. Rules are shapes (`isEquipTag`, `markKey`), never lists of jobs.
4. Never change a corpus key, scorer, threshold, or collapse distinct marks to
   move a number. Record honest ceilings instead.
5. Working directory for every command in this plan is `opentakeoff/`
   (the checkout root `master-plan/` has no package.json; `opentakeoff-corpus/`
   and `scripts/stage-bulk-corpus.sh` are its siblings). Work one package at a
   time, in order. After each:
   `npm --prefix web run typecheck && npm --prefix mcp run typecheck`
   (the root `npm run typecheck` runs turbo and currently fails with
   "Missing packageManager field" — do not depend on it; if you want it,
   add `"packageManager": "npm@10.9.7"` to `opentakeoff/package.json` in WP0
   as its own commit), `npm --prefix web test`, `npm --prefix mcp test`,
   and the corpus regression gates
   `opentakeoff/mcp/test/takeoffHvac01.regression.test.mjs`,
   `takeoffValve01.regression.test.mjs`, `takeoffBas01.regression.test.mjs`.
   Commit with before/after numbers from §3.1 in the body. Update
   `opentakeoff-corpus/PROGRESS.md` ("Accepted changes") per package.
6. Every package is validated on the whole corpus per §3.11, not on one set.
   A package is accepted only when the §3.11.3 gates are green corpus-wide.
7. Node ≥ 24 (`web/package.json` engines; `mcp` accepts ≥ 20) with `--import tsx`. Table sidecar may stay off
   (`OPENTAKEOFF_TABLE_SIDECAR=0`) for every check in this plan; it does not
   affect plan text.

## 3.1 WP0 — Baseline harness (do first, no production code)

Create `opentakeoff/mcp/scripts/tag-census-diag.mjs` (the scratch script from
§2.1, cleaned up; takes a PDF path and a comma list of tags to sweep). It
loads a `Session`, builds `graphForPipeline()`, runs `labelTokens` over
`textSpans` for every sheet, and prints: role counts; schedule keys by kind;
label-token counts **all** and **outside table regions, per sheet role**;
the four-bucket coverage table (never drawn / plan-only / non-plan-only /
both) per key kind; drawn-but-unscheduled keys; sweep outcomes for the
sample tags. Definitions the script must implement exactly:

- *Schedule key kind* (per table row): `valve_mark` if the table has a
  column header matching `/^VALVE\s*MARK$/i` and that cell is non-empty;
  else `unit_mark` if a header matches `/^UNIT\s*MARK$/i` and that cell is
  non-empty; else `equipment_row` for `table.kind === "equipment"` rows,
  each `/`-separated part of `row.key` being one key. A key must contain a
  letter and a digit after `markKey`. First kind seen for a key wins.
- *Outside table regions*: token center not inside any
  `graph.tables[].region` on that sheet.
- *Bucket*: `none` = 0 occurrences outside tables; `planOnly` = all on
  `role === "plan"` sheets; `otherOnly` = none on plan sheets; `both`.

Baseline it must reproduce on
`opentakeoff-corpus/raw/navfac-cherry-point-atc-mechanical.pdf` before any
change:

```
roles          plan 26 · legend 27 · schedule 8 · detail 10 · elevation 4
schedule keys  equipment_row 318 · valve_mark 106 · unit_mark 3
valve_mark     none 101 · planOnly 0 · otherOnly 5 · both 0
equipment_row  none 3   · planOnly 155 · otherOnly 93 · both 67
drawn keys     301 (238 scheduled, 63 unscheduled)
FCU            42 rows · 44 distinct drawn · 89 occ (84 on plan roles)
sweep          FCU-A1 found=1 tag_attached_vector · CV-FCU-A1-CHW REFUSED ·
               HRHWP-MT1 REFUSED (drawn 5–10× on pages 52–66)
```

Also run it on `bldg5406-hvac-demo-mechanical.pdf`, `baker-county-eoc-bidset.pdf`,
`itd-d1-lab-mechanical.pdf`, `federal-attachment4-mechanical.pdf` and save
all five outputs under `opentakeoff-corpus/reports/tag-census/<set>.before.txt`.
Every later package re-runs this and commits the `.after.txt` diff.

## 3.2 WP1 — Sheet role: add `schematic`, stop reference notes from voting

Files: `opentakeoff/web/src/lib/sheetgraph.ts` (`SheetRole` L40,
`ROLE_SIGNALS` L63–287, `REFERENCE_RE` L304, `classifySheetRole` L306),
`opentakeoff/mcp/src/outputs.ts` (role enum L1313). No UI file displays
`SheetRole` today (`grep -rl '"elevation"' web/src --include=*.jsx` is
empty), so there is nothing UI-side to extend; only the type, the wire enum,
and the eight role gates below change.

Changes:

- Add `"schematic"` to `SheetRole` and to the wire enum. Signals (confidence
  0.8, above the bare `/LEGEND/` 0.5 signal): `/\bSCHEMATIC\b/`,
  `/CONTROL(?:S)?\s+DIAGRAM/`, `/FLOW\s+DIAGRAM/`, `/RISER\s+DIAGRAM/`,
  `/PIPING\s+DIAGRAM/`, `/SEQUENCE\s+OF\s+OPERATION/`, `/\bDDC\b.*(?:DIAGRAM|SCHEMATIC|NETWORK)/`.
- Extend `REFERENCE_RE` so a *fragment* of a cross-reference note cannot vote:
  a span matching `/\bFOR\s+(?:[A-Z]+\s+){0,3}(?:LEGEND|ABBREVIATIONS|SYMBOLS|NOTES)\b/`
  or starting with `/^\d{3}\s+FOR\b/` is a reference, not a title.
  (Measured cause: pdf.js splits "SEE M-001 FOR MECHANICAL LEGEND, …" into
  "SEE M-" and "001 FOR MECHANICAL LEGEND, ABBREVIATIONS"; the second half
  passed `REFERENCE_RE` and matched `/LEGEND/`.)
- Every role gate in the codebase (`grep -n 'role === "plan"\|role !== "plan"' web/src/lib/*.ts mcp/src/*.ts`)
  and what `schematic` does there:

  | site | today | after WP1 |
  |---|---|---|
  | `session.ts:2550` `countMarks` plan sheets | plan only | unchanged (schematic is not installed work) |
  | `session.ts:3099` `symbol_sweep` set-scope filter | non-plan skipped | unchanged |
  | `session.ts:3991` `sweepScheduleRow` plan sheets | plan only | unchanged for counting; WP4 reads schematic occurrences for disclosure |
  | `session.ts:6477` graph-build geometry roles | plan/schedule/demolition/unknown | add `schematic` (control-schematic extractor and WP4 need its spans/segs) |
  | `session.ts:7626` `planKeys` | plan only | unchanged |
  | `takeoff.ts:418` scale commit sheets | plan only | unchanged |
  | `takeoff.ts:881` legend-takeoff plan keys | plan only | unchanged |
  | `vectorTakeoffPipeline.ts:440` pipeline sheet filter | plan/demolition/unknown | add `schematic` |

  Nothing else changes role semantics. `schematic` never counts as installed work.

Acceptance:

- navfac pages 50–66 (`MI700`…`MI732`) classify `schematic`; `M-001` stays
  `legend`; role counts on the other four baseline sets change only where a
  schematic/diagram title exists (list them in the commit).
- New unit test in `opentakeoff/web/test/sheetgraph*.test.ts` with the
  fragment shape above (synthetic spans, no corpus name).
- All existing tests green.

## 3.3 WP2 — `tagIndex`: the set-wide drawn-tag census on the graph

New file `opentakeoff/web/src/lib/tagIndex.ts` (pure; spans in, tags out).

```ts
export interface DrawnTag {
  sheet: string; role: SheetRole;
  text: string;            // as drawn, joined/reconstructed
  key: string;             // markKey(text)  (markid.ts)
  family: string;          // canonicalLabelFamily(text) (symbollabels.ts)
  bbox: Bbox; rot: number;
  source: "exact" | "joined" | "stacked" | "compound" | "count_prefixed";
  multiplier: number;      // scheduleCountMultiplier (TYP N / (N)), default 1
  in_table: { sheet: string; title: string | null } | null;
  sheet_callout: boolean;  // text equals one of the set's own sheet numbers
}
export function buildTagIndex(sheets: SheetSpans[], tables: ScheduleTable[], sheetNumbers: string[]): DrawnTag[];
export function tagIndexFor(index: DrawnTag[], key: string): DrawnTag[];   // markKey-based
```

Rules:

- Recognition = `labelTokens(spans)` ∪ `isEquipTag(joinHyphenatedTags(spans))`
  ∪ key-free compound runs. The existing `compoundTagOcc` functions need a
  known key, so add one small recogniser next to them in `symbolsweep.ts`:
  `compoundRunLeadTag(str): string | null` — the run's text up to the first
  `/` or whitespace, returned only when that prefix passes `isEquipTag` or
  `LABEL_TOKEN_RE`, the remainder starts with `/` or whitespace followed by
  `[A-Z0-9]`, and the remainder is not `.` + digit (sheet number). Its
  result is a `DrawnTag` with `source: "compound"` and the whole run's bbox.
  No other new regex.
- `in_table.title` is `table.title?.text ?? null` (`ScheduleTable.title` is
  an `Evidence`, not a string).
- Tokens on `role === "schedule"` sheets are indexed with `in_table` set to
  `{ sheet, title: null }` when outside every extracted region (table-region
  coverage is incomplete on real sets, see §3.10 federal-mech); they never
  enter `planTags(graph)` and the count excluded this way is reported in
  `graph.notes`.
- `sheet_callout` is true when `markKey(text) === markKey(n)` for any `n`
  in the set's own sheet-number list (from `SheetSpans.sheet_number`), never
  by a fixed `M-\d{3}` regex and never by raw string compare.
- `in_table` from `graph.tables[].region`; legend-region tags stay in the
  index with `role: "legend"`, never dropped.
- Attach to `SheetGraph` in `buildSheetGraph`: `tags: DrawnTag[]` (all roles).
  Convenience getters `planTags(graph)` / `referenceTags(graph)`.
- Canvas: index persisted next to `textIndex.js` (same `(sheetKey, rev)`
  cache discipline; bump a `TAGIDX_VERSION`).
- MCP tool `list_tags { sheet?, family?, key?, role?, include_tables? }` in
  `mcp/src/tools.ts`, schema in `outputs.ts`; canvas agent tool of the same
  name in `web/src/lib/agentTools.js`, both calling the shared getter.
  Refuse on `graph.available === false` with the existing scan wording.

Acceptance (navfac, from the WP0 script re-pointed at `graph.tags`):

- ≥ 1,800 equipment-shaped tags outside tables; ≥ 300 distinct keys.
- FCU: 44 distinct keys, 89 occurrences, none `in_table` on plan roles.
- `M-501`-style entries carry `sheet_callout: true` and are excluded by
  default from `list_tags` unless `include_callouts: true`.
- Whole-set index builds in < 2 s after the graph on this set.
- Unit tests: joined glyph split, stacked `HWP`/`1`, table exclusion,
  sheet-callout flag, hyphen/space twins share one `key`.

## 3.4 WP3 — One identity rule

Wire `markKey` / `spanAnswersFor` from `opentakeoff/web/src/lib/markid.ts`
into:

- `Session.tagOccurrencesOnSheet` (session.ts L3522) gains a fourth
  parameter `vocab: readonly string[]`; its exact pass becomes
  `spanAnswersFor(sp.str, key, vocab)`. `sweepScheduleRow` passes
  `tableSiblingKeys` (the answering table's own row keys, computed at
  session.ts L3971), so the short-mark and shared-bare-mark guards run
  against that table's vocabulary (`FCU-1` still never claims `FCU-10`;
  bare `ET` still refuses when `ET-1`/`ET-2` exist). Other callers pass
  `[]`, which reduces to hyphen/space-insensitive equality.
- `Session.countMarks` (L2514): replace `canon`/`MARK_RE` with `markKey`,
  admit default marks by `isEquipTag(k) || LABEL_TOKEN_RE.test(k)`, and
  match spans with `spanAnswersFor(sp.str, m, marks)`.
- `schedulePlanReconcile.mjs`: `rowId`/`scopeIdentity` canon → `markKey`.

Acceptance: `markid.test.ts` stays green; new seam test proves the three
callers agree on a fixture of twins (`P-1`/`P1`/`P 1`) and non-twins
(`P1` vs `P10`, `ET` vs `ET-1`); navfac sweeps for `FCU-A1`, `AHU-A1`,
`CV-CHW-BP-A` return identical results to baseline.

## 3.5 WP4 — Sweep discloses reference occurrences instead of throwing

File: `mcp/src/session.ts` `sweepScheduleRow` at the `!totalOcc` throw
(~L4092); wire schema `sweepScheduleRowOutput` in `outputs.ts`;
`schedulePlanReconcile.mjs` rows; `agentTakeoff.js` folding; `takeoff.ts`
`resolveRow` + `classifyError`.

- Before throwing, consult `tagIndexFor(graph.tags, t)` for occurrences on
  non-plan roles. If any exist, return a result instead of throwing:
  `found: 0`, `anchor: null`, `search_scope`, `complete: true`,
  `reference_tags: [{ sheet, role, bbox, text }]`, `status: "reference_only"`,
  `reason` naming the roles. If none exist anywhere, keep the current throw
  (its wording is load-bearing for `classifyError`).
- Wire schema (`mcp/src/outputs.ts`), all named fields, no `.passthrough()`:
  `sweepScheduleRowOutput.anchor` becomes `.nullable()`; add
  `status: z.enum(["reference_only"]).optional()` and
  `reference_tags: z.array(z.object({ sheet, role, bbox: wireBox, text })).optional()`;
  `reconcileSchedulePlanOutput.rows[]` gains
  `reference_tag_cites: z.array(z.object({ sheet, role, bbox: wireBox, text })).optional()`.
  Add a conformance test (`mcp/test/conformance.test.ts` pattern) that a
  `reference_only` result validates against `outputSchema` and round-trips
  through `structuredContent`.
- Reconcile row gains `reference_tag_cites` and status `SCHEDULE_ONLY`
  (unchanged quantity semantics) with the reason "drawn on schematic/legend
  sheets only". `takeoff.ts` `classifyError` is untouched because this path
  no longer throws; `resolveRow` maps `status: "reference_only"` to
  `item.status = "refused"` with `reason` and `item.reference_tags`.
- Canvas: `field: "reference_tag"` → `line.reference_tag_cites[]`; panel chip
  "Schematic tag · p.N" (grey, not blue), never "Symbol".

Acceptance (navfac): the 93 non-plan-only equipment marks (e.g. `HRHWP-MT1`)
return `reference_only` with ≥ 1 cite each; `takeoffHvac01` regression
unchanged (installed quantities identical); `SYMBOL_FALSE_NEGATIVE` count in
`buildPlanSetTakeoff.failures` drops by exactly the number of rows that moved
to `reference_only` (state the number in the commit).

## 3.6 WP5 — Served-equipment location grade

Files: `schedulePlanReconcile.mjs` (`reconcileScheduleFamilyWithSweeps`,
`reconcileScheduleFamilyFromGraph`), `takeoff.ts` `resolveRow`,
`outputs.ts`, `agentTakeoff.js`, `TakeoffDataPanel.jsx`.

- For a row whose own identity (VALVE MARK / MARK) has zero occurrences on
  any role, read the served mark from the row (`UNIT MARK`, `SERVES`,
  `SERVED EQUIPMENT`, `EQUIPMENT SERVED` headers; extend
  `rowIdentityTag`'s neighbour with a `servedEquipmentTag(row)` helper next
  to it) and look it up in the tag index.
- Emit `served_equipment_cites: [{ tag, sheet, role, bbox }]` and
  `installed_evidence_grade: "located_via_served_equipment"`. Wire schema
  (`outputs.ts`): add the enum value to both `installed_evidence_grade`
  enums (L95 and L388) and add
  `served_equipment_cites: z.array(z.object({ tag, sheet, role, bbox: wireBox })).optional()`
  to `reconcileSchedulePlanOutput.rows[]` (closed object; a field not named
  there is stripped from the MCP reply). `installed_qty` stays `null`;
  `status` stays `SCHEDULE_ONLY`.
- `sweepScheduleRow` itself is unchanged: it must still refuse to count the
  served unit as the valve (session.ts comment ~L4048 stays true).
- Canvas: field `served_tag` → `line.served_tag_cites[]`; chip
  "Served unit `FCU-A1` · p.29" opening the served tag's bbox; the Compare
  button pairs it with the schedule row.

Acceptance (navfac T-VALVE-01, `reconcile_schedule_plan { family: "valve" }`
or the CHW/HHW needles): ≥ 150 of 163 valve rows carry a served-equipment
cite; the 5 rows whose own mark is drawn keep their existing cites;
`takeoffValve01` regression unchanged (quantities identical, 163 EA).

## 3.7 WP6 — Two-way reconcile, all cites, exports

- `reconcile_schedule_plan` output adds two top-level fields, declared as
  named optional fields on `reconcileSchedulePlanOutput` in
  `mcp/src/outputs.ts` (L348; it is a closed object):
  `unscheduled_tags: DrawnTag[]` (index keys with no schedule row,
  `sheet_callout` excluded) and
  `alias_candidates: [{ drawn, nearest_row_key, distance }]`. Alias rule:
  compare `markKey(drawn)` with `markKey(rowKey)` as whole strings
  (hyphens already stripped); a candidate is a pair at Levenshtein distance
  exactly 1 where the edited character is a letter on both sides (an edit
  that inserts, deletes, or changes a digit never qualifies). Worked
  example: `CVCHCMT1` vs `CVCHHMT1` is one letter substitution → candidate;
  `FCU1` vs `FCU10` inserts a digit → never. Both lists are review lists;
  neither changes any quantity. Add the wire-shape conformance test.
- Panel: render every cite (a `+N` badge after the first chip); CSV/XLSX via
  `takeoffWorkbookSheets` gains `PLAN TAG SHEETS`, `PLAN TAG COUNT`,
  `SERVED TAG SHEETS`, `REFERENCE TAG SHEETS` columns; `export/takeoff.json`
  items carry `plan_tag_locations`, `served_equipment_cites`,
  `reference_tags`.

Acceptance (navfac): `unscheduled_tags` lists `CSF-CHW-M1`, `CSF-HHW-A1`,
`CV-HHW-BP-M`, `CV-HHW-BP-T` (present in §2.3) and no `M-501`-style
callouts; `alias_candidates` pairs `CV-CH-C-MT1` ↔ `CV-CH-H-MT-1`.

## 3.8 WP7 — Ground truth and eval

- Add `opentakeoff-corpus/keys/<set>.tags.csv` with columns
  `sheet,tag,x0,y0,x1,y1,role,in_table,note` for navfac (FCU + AHU + pumps
  at minimum), bldg5406, baker-county-eoc, itd-d1-lab. Hand-verify from
  renders (`view_sheet` crops), never from the index itself.
- Add `opentakeoff/mcp/scripts/tag-eval.mjs`: per set, precision/recall of
  `graph.tags` against the key, per role and per family; prints a table and
  exits non-zero when any keyed set has precision < 0.97 or recall < 0.95
  (the same floors as §3.11.4). Wire it into
  `opentakeoff/mcp/scripts/corpus-eval.mjs` (the file that already runs
  `takeoff-eval.mjs` and `graph-eval.mjs`, npm script `eval:corpus` in
  `mcp/package.json`).
- Record the first numbers in `opentakeoff-corpus/PROGRESS.md` and GOAL §2 as
  a fourth metric.

## 3.9 Explicitly out of scope for this plan

Plan-text OCR / exploded-glyph recognition (Part 1 §4 step 6) and any
symbol-geometry change. Those start only after WP0–WP7 are merged and the
tag metric from WP7 is green.

## 3.10 Multi-set baselines (measured, production Session, sidecar off)

The same harness as §3.1, run on every keyed raw set on disk. These are the
"before" numbers every package must re-measure. "label tokens" are
`labelTokens` outputs on all sheets (in parentheses: outside table regions);
the four buckets are *all schedule keys → drawn text occurrences outside
table regions* (navfac sums its valve/unit/equipment kinds). Per-role
outside-table token counts, used by gate G-B: navfac plan 1,106 / legend
1,071 / detail 90 / elevation 33 / schedule 14; baker plan 276 / unknown 117
/ schedule 145 / detail 55 / elevation 50 / legend 13; itd plan 251 /
schedule 90 / legend 49 / unknown 44 / detail 10; federal schedule 645 /
detail 303 / legend 218 / plan 170 / unknown 29 / elevation 4; bldg5406
plan 62 / unknown 58 / schedule 20 / detail 10 / legend 6 / demolition 1.

| set | sheets | roles (plan/sched/legend/detail/elev/unknown/demo) | tables | spans | label tokens all (outside tables) | sched keys | none | plan-only | non-plan-only | both | drawn keys (unscheduled) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| navfac-cherry-point-atc | 75 | 26/8/27/10/4/0/0 | 87 | 34,494 | 3,561 (2,314) | 427 | 104 | 158 | 98 | 67 | 301 (63) |
| baker-county-eoc | 65 | 19/9/2/11/7/16/1 | 21 | 18,895 | 789 (657) | 13 | 5 | 6 | 1 | 1 | 83 (79) |
| itd-d1-lab | 29 | 10/10/2/4/1/2/0 | 27 | 10,872 | 626 (444) | 126 | 17 | 75 | 3 | 31 | 123 (16) |
| federal-mech | 24 | 4/11/2/3/3/1/0 | 19 | 13,789 | 1,574 (1,369) | 115 | 21 | 9 | 4 | 81 | 214 (120) |
| bldg5406-hvac-demo | 20 | 4/5/1/4/0/5/1 | 13 | 3,749 | 181 (157) | 18 | 1 | 12 | 0 | 5 | 43 (26) |

Per-set facts the packages must respect (each is a different failure shape;
one set would have hidden the others):

- **navfac**: 14 control-schematic sheets classified `legend` (WP1); 98
  keys drawn only off-plan (WP4); 101/106 valve marks never drawn, served
  unit marks drawn (WP5).
- **baker**: 16 `unknown`-role sheets carrying 117 tag tokens; 79 of 83
  drawn keys have no schedule row because only 13 rows were extracted from
  21 tables — the schedule side, not the tag side, is the gap here, and
  the census must *report* that, not paper over it. `ERV-01` refused as
  ambiguous (2 rows) — WP6 alias/duplicate handling must not "fix" that by
  merging.
- **itd-d1-lab**: `AHU-1` drawn twice, refused for lack of local geometry
  (`SYMBOL_FALSE_NEGATIVE`) — after WP4/WP5 it must still be
  `installed_qty: null`, but with two plan-tag cites; `ET-1` genuinely
  duplicated across two schedules stays refused.
- **federal-mech**: `schedule`-role sheets carry 645 label tokens outside
  extracted table regions — table-region coverage is incomplete, so
  `in_table` from `graph.tables[].region` alone will misfile schedule row
  labels as drawn tags. WP2 must also exclude tokens on `schedule`-role
  sheets unless the sheet has a plan-titled region, and must report the
  count it excluded. 120 unscheduled drawn keys is the symptom.
- **bldg5406**: `EF-2`/`EF-3` exploded text (known ceiling) must remain
  "never drawn" — the census must not invent them; `CWP-1` has a
  `text_only` occurrence that WP4 must surface as a cite.

## 3.11 Corpus-wide validation protocol (the production gate)

Five sets prove the shapes; production is proven on the bulk corpus. The
executor runs this after **every** package, not once at the end.

### 3.11.1 Stage the corpus

```
../scripts/stage-bulk-corpus.sh         # from opentakeoff/; the script lives at <checkout>/scripts/, a sibling of opentakeoff/ and opentakeoff-corpus/
```

Bulk = `bulk/HVAC_BAS_Plan_Sets` + `bulk/HVAC_BAS_Plan_Sets_Vol2` (112 sets /
215 files, resolved by `resolveSetFiles` in
`opentakeoff/mcp/scripts/corpusFiles.mjs`) plus the keyed `raw/` sets in
`sets.json`. That is the ~200-document population this plan is validated
on. Google Drive must be reachable from the executor's machine; if it is
not, stop and say so — do not substitute a subset silently.

### 3.11.2 Run the census over the whole corpus

Extend `mcp/scripts/tag-census-diag.mjs` (WP0) into
`mcp/scripts/tag-census-corpus.mjs`. Full CLI (the `emit-corpus-takeoff.mjs`
flags plus three modes):

```
--corpus DIR [--sets id,…] [--shard i/n] [--resume] [--out DIR]   # census mode: one out/tag-census/<set_id>.json per set
--out DIR --summarize                                             # aggregate the per-set JSON into out/tag-census/summary.csv
--gate <before.csv> <after.csv>                                    # positional; evaluate §3.11.3 gates, print offending set ids, exit 1 on any red
--out DIR --sweeps [--sets …] [--shard i/n] [--resume]            # sweep mode (after WP4): for every non-plan-only key run sweepScheduleRow; for every
                                                                   #   valve row whose own mark is undrawn run reconcile_schedule_plan; write <set_id>.sweeps.json
```

Set enumeration: `resolveSetFiles` in `mcp/scripts/corpusFiles.mjs` (raw
sets from `sets.json` plus both `bulk/HVAC_BAS_Plan_Sets*` trees). Graphs via
`cachedSheetGraph` (`mcp/scripts/sheetGraphCache.mjs`) so they are built
once and shared with the compile/eval scripts. Per-set JSON carries every
§3.1 field, the per-role outside-table token counts, timings, and (sweep
mode) per-key sweep outcomes. `summary.csv` columns: the §3.10 table columns
plus one `tokens_outside_<role>` column per role, `nonplan_keys_reference_only`,
`nonplan_keys_thrown`, `valve_rows_undrawn_served_drawn`, `valve_rows_served_cited`.

```
OPENTAKEOFF_TABLE_SIDECAR=0 node --import tsx mcp/scripts/tag-census-corpus.mjs --corpus ../opentakeoff-corpus --out out --shard 0/4 --resume   # ×4 shards
node --import tsx mcp/scripts/tag-census-corpus.mjs --out out --summarize
node --import tsx mcp/scripts/tag-census-corpus.mjs --gate out/tag-census/00-baseline/summary.csv out/tag-census/summary.csv
```

Expect roughly 40 s–90 s per set for the graph on the first pass (one-time,
cached) and < 2 s per set for the census afterwards. No batch prewarm across
the corpus as a *product* feature (GOAL.md forbids it); this is a
measurement run and its cache lives under `out/`, not in the app.

### 3.11.3 Corpus gates (all must hold for a package to be accepted)

Computed by `tag-census-corpus.mjs --gate before.csv after.csv` from
`summary.csv` (G-A, G-B, G-E, G-G from census mode; G-C, G-D from sweep
mode's columns); each gate prints the offending sets by id. A gate marked
"(after WPn)" is skipped, and printed as skipped, before that package.

| gate | rule |
|---|---|
| G-A no regression | For every set, `plan-only + both` (schedule keys located on plan roles) does not decrease, and `none` does not increase. |
| G-B role sanity (from WP0) | No set has more `label tokens outside tables` on `legend`/`unknown` sheets than on `plan` sheets unless the set has ≤ 2 plan-role sheets; sets that violate this are listed as role-classifier work, and after WP1 the count of violating sets must drop, never rise. |
| G-C reference disclosure (after WP4) | Every schedule key in the `non-plan-only` bucket produces a `reference_only` sweep result with ≥ 1 cite; zero throw "not drawn on any plan sheet" for such keys, corpus-wide. |
| G-D served location (after WP5) | For every set with a VALVE MARK / UNIT MARK schedule, ≥ 90 % of valve rows whose own mark is undrawn and whose served mark is drawn carry a `served_equipment_cites` entry. |
| G-E no phantom tags (after WP2) | Corpus-wide count of `DrawnTag` entries that are `sheet_callout` or that match a sheet number in *any* set's title block is reported and excluded; the unscheduled list never contains an entry whose text equals one of that set's own sheet numbers. |
| G-F quantities frozen | `takeoffHvac01`, `takeoffValve01`, `takeoffBas01` regression tests and the frozen `keys/*.takeoff.csv` scores (`takeoff-eval.mjs`) are byte-identical before/after. Text-side work may never move a quantity. |
| G-G budget | Whole-corpus census after warm graphs completes in < 10 min on 4 cores; per-set index < 2 s. Sweep mode (G-C/G-D inputs) completes in < 60 min corpus-wide on 4 cores with warm graphs; log any set that exceeds 5 min. |

### 3.11.4 Stratified hand verification (the "elite" bar)

Numbers from the census are not truth. After WP2 and again after WP5/WP6:

1. Sample 20 sets stratified by size (5 small < 25 sheets, 10 medium, 5
   large ≥ 60 sheets) and by content, using three signals computed from the
   census JSON, not by judgment: `has_schematic` = ≥ 1 sheet with role
   `schematic` (after WP1) or ≥ 1 span matching `/\bSCHEMATIC\b|CONTROL DIAGRAM|SEQUENCE OF OPERATION/`;
   `has_valve_schedule` = ≥ 1 table with a `VALVE MARK` or `DAMPER MARK`
   header; `has_raster_schedule_note` = a `graph.notes` entry matching
   `/pasted in as a picture/`. Require ≥ 5, ≥ 5, ≥ 3 sets respectively.
   Draw with a seeded RNG (mulberry32 over the sorted set-id list); record
   the seed in `reports/tag-census/hand/round-<n>.manifest.json` with the
   drawn set ids, tags, and keys.
2. In each sampled set, pick 10 drawn tags at random from the index and 10
   schedule keys at random; render each cite with `view_sheet` crops and
   record true/false in `opentakeoff-corpus/reports/tag-census/hand/<set>.csv`
   (`round,seed,kind,tag,sheet,bbox,verdict,note`).
3. Gate: precision of drawn-tag entries ≥ 0.97; recall of schedule keys
   that are visibly drawn ≥ 0.95 (a key visibly drawn but absent from the
   index is a miss — record the shape, it becomes a WP2 fix, never a key
   change).
4. Every miss and every false positive is filed in
   `opentakeoff-corpus/TAKEOFF_BUG_CATALOGUE.md` with the sheet, the text,
   and the recogniser rule that failed, then fixed with a unit test on the
   *shape* (synthetic spans, no corpus name).
5. Repeat the sample with a fresh random seed until one full round of 20
   sets produces zero new shapes. That is the definition of "production
   level" for tag recognition; a green metric on five sets is not.

### 3.11.5 Reporting

Per package, commit `opentakeoff-corpus/reports/tag-census/<pkg>/summary.csv`
and a short `<pkg>/REPORT.md`: gates table, sets that changed bucket with
one-line reasons, hand-verification precision/recall, and the shapes added
to the bug catalogue. Update `opentakeoff-corpus/PROGRESS.md` "Accepted
changes" with the same numbers. A package with any red gate is not
accepted; scaling the scope down is the user's call, so say what is red and
stop.

## 3.12 Definition of done

- WP0 script and `tag-census-corpus.mjs` committed; `before` summary for
  the whole corpus committed under `reports/tag-census/00-baseline/`.
- Gates G-A … G-G green corpus-wide after WP6; hand-verification round
  (§3.11.4) closed with zero new shapes.
- On navfac: FCU rows 42/42 with plan tag cites; valve rows ≥ 150/163 with
  served-equipment cites; the 98 off-plan-only keys disclosed, 0 refused as
  "not drawn"; `unscheduled_tags` non-empty and callout-free.
- On baker: the schedule-extraction gap (13 rows from 21 tables) reported
  by the census as *schedule-side*, not hidden; `ERV-01` still refused.
- On federal-mech: schedule-role token exclusion reported; `AHU-1` keeps
  its geometry cite.
- On bldg5406: `EF-2`/`EF-3` still "never drawn"; `CWP-1` text-only cite shown.
- `takeoffHvac01`, `takeoffValve01`, `takeoffBas01` and every existing test
  green; typecheck clean; no quantity in any locked truth changed.
- `PROGRESS.md` updated per package with the numbers above.


---

# Part 4 — Goal-loop execution prompt (paste this as the session's first message)

Use this verbatim as the opening prompt of a fresh coding session on branch
`claude/drawing-text-tag-recognition-v0p6r5` (or a branch cut from it), with
the repo checked out at `master-plan/` and the working directory
`master-plan/opentakeoff/`. It is written for an agent that has not seen
any conversation; the plan file carries every specification.

```
You are executing plans/03-drawing-tag-recognition-audit.md, Part 3, end to end,
as an autonomous goal loop. Read the whole file first (Parts 1–2 are evidence;
Part 3 is the specification; §3.0 are the rules you must not break). Then read
AGENTS.md at the checkout root and opentakeoff/AGENTS.md.

Loop, until §3.12 "Definition of done" is met or you are blocked:

1. STATE. Open opentakeoff-corpus/PROGRESS.md and the reports under
   opentakeoff-corpus/reports/tag-census/. Determine the lowest-numbered work
   package (WP0..WP7) that is not yet accepted. A package is accepted only when
   its own acceptance list in §3.x is met AND the §3.11.3 gates are green
   corpus-wide (gates marked "(after WPn)" are skipped before WPn) AND the
   §3.0 rule-5 checks pass AND the commit is on the branch with before/after
   numbers in its body.

2. IMPLEMENT that one package exactly as its section specifies: the files,
   functions, schema fields, CLI flags, and tests it names. Where the section
   says "add", add; where it says "unchanged", do not touch. Write the unit
   tests it lists using synthetic spans (no corpus names in production code or
   tests). If the section is ambiguous in a way that changes behaviour, stop
   and write the ambiguity plus your proposed resolution into
   opentakeoff-corpus/PROGRESS.md under "Open questions", pick the resolution
   that keeps quantities unchanged, and continue.

3. VERIFY locally (all from opentakeoff/):
   npm --prefix web run typecheck && npm --prefix mcp run typecheck
   npm --prefix web test
   npm --prefix mcp test
   node --import tsx mcp/test/takeoffHvac01.regression.test.mjs
   node --import tsx mcp/test/takeoffValve01.regression.test.mjs
   node --import tsx mcp/test/takeoffBas01.regression.test.mjs
   Any red → fix the cause (never skip, disable, or quarantine a test), rerun.

4. MEASURE on the corpus (§3.11). If opentakeoff-corpus/bulk/ is absent run
   ../scripts/stage-bulk-corpus.sh; if it cannot download, write that to
   PROGRESS.md and continue on the raw sets only, stating clearly that the
   corpus gate is NOT met. Then:
   OPENTAKEOFF_TABLE_SIDECAR=0 node --import tsx mcp/scripts/tag-census-corpus.mjs --corpus ../opentakeoff-corpus --out out --resume
   node --import tsx mcp/scripts/tag-census-corpus.mjs --out out --summarize
   node --import tsx mcp/scripts/tag-census-corpus.mjs --gate out/tag-census/00-baseline/summary.csv out/tag-census/summary.csv
   (after WP4: also --sweeps, then --summarize and --gate again)
   Copy summary.csv and a REPORT.md per §3.11.5 into
   opentakeoff-corpus/reports/tag-census/<WPn>/. Any red gate → the package
   is not accepted: root-cause it against the offending set's own geometry,
   fix minimally, add a regression test for the shape, go back to step 3.

5. HAND-VERIFY when the package is WP2, WP5 or WP6 (§3.11.4): draw the seeded
   sample, render each cite with view_sheet crops, record verdicts in the
   hand/ CSVs with round and seed, file every miss and false positive in
   opentakeoff-corpus/TAKEOFF_BUG_CATALOGUE.md with the recogniser rule that
   failed, fix with a shape test, and repeat with a new seed until a full
   round adds zero new shapes.

6. COMMIT the package on the branch with a message that states the package,
   the before/after gate numbers, and the sets that changed bucket. Update
   PROGRESS.md "Accepted changes" with the same numbers. Push.

7. Go to 1.

Hard rules (from §3.0, restated because they are the ones a loop is tempted
to break): everything on the shared path under web/src/lib consumed by both
session.ts and the canvas; text never proves installation (installed_qty is
filled only by geometry or an explicit installation note); no corpus names,
sheet numbers or tag literals in production code; never change a key,
scorer, threshold or collapse distinct marks to move a number; never
rewrite history on the branch; one package per commit; if a gate stays red
after two honest fix attempts, stop, write the exact red gate, the sets,
and the reason into PROGRESS.md under "Blocked", and end your turn with that
summary — do not scale the scope down yourself.

Report format at the end of every turn: which package you are on, which
gates are green/red/skipped with numbers, what you committed (hashes), and
what the next loop iteration will do.
```

## 4.1 Model and session notes

- The plan and this prompt are model-agnostic. They contain every file path,
  function name, schema field, CLI flag, command, and acceptance number the
  executor needs; nothing depends on this audit's session history.
- The executing session must be allowed to run shell commands, edit files,
  and push to the branch. Multi-agent orchestration is not required by any
  step; if it is enabled, the repo's AGENTS.md "no subagents" policy for
  corpus-goal work still applies unless the user re-enables delegation.
- Expected wall-clock on 4 cores: first corpus graph build ≈ 1–3 h (once,
  cached under `out/`), each later census pass < 10 min, sweep pass < 60 min,
  hand-verification rounds are human-speed. Plan for WP0–WP7 across several
  sessions; the loop resumes from PROGRESS.md.
