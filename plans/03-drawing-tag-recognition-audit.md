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
