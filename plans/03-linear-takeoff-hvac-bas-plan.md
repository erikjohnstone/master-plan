# Linear Takeoff for HVAC/BAS — Research, Codebase Audit, and Production Plan

**Status:** research and plan only. No implementation has started. Written 2026-09-16 from a
read-only audit of this repository, live probes against seven real mechanical PDFs in
`opentakeoff/samples/` and `opentakeoff-corpus/raw/`, and web research on competitors,
standards, and algorithms. Every number in §3 comes from a script that can be re-run; every
claim about the codebase carries a `file:line`. Where something could not be verified it says
so.

**Scope of the term.** *Linear takeoff* here means measuring routed systems by length off a
2D plan and resolving what that length costs: sheet-metal ductwork (rectangular, round, flat
oval, flex), hydronic/refrigerant/steam/plumbing/gas piping, and the BAS side of the same job
(control cable, conduit, pneumatic tubing, network trunk). A *run* is a polyline with a size
and a system on every segment; the *assembly* is what a run resolves to per foot, per vertex,
and per run.

**Relationship to the corpus mandate.** `opentakeoff-corpus/GOAL.md` and
`takeoffs/NEXT_GOAL_LOOP.md` explicitly deferred duct LF ("No duct-LF scope creep",
`NEXT_GOAL_LOOP.md:179`; "Kamai-class duct LF … Out of scope (GOAL duct-LF deferred)",
`VECTOR_TAKEOFF_ENGINE_RESEARCH.md:402`). This plan is the deliberate opening of that scope.
It keeps every standing rule that made the schedule/points work trustworthy: shared path,
scale as a gate, pencil until inked, withholding as an answer, waste only in the report,
structure before regex, audit before build.

---

## 0. How to read this document

| Section | What it settles |
|---|---|
| §1 | The ten decisions the plan is built on, and the one-paragraph verdict |
| §2 | What the platform already does for linear measurement, with the gaps and the bugs the audit found |
| §3 | What real mechanical drawings actually look like to the engine (measured on 8 sets), and a feasibility probe |
| §4 | What competitors do, and where an industry-leading implementation can pull ahead |
| §5 | The industry math: standards, tables, labor units, and the defaults the engine should ship with |
| §6 | The algorithms: from PDF paths to a sized, fitted run |
| §7 | The data model: how a run, its segments, its vertices, and its assembly persist |
| §8 | The assembly math, formula by formula |
| §9 | How this ties into the scale engine and the tools already on the platform |
| §10 | The canvas UX and the report |
| §11 | The MCP and in-app agent surface |
| §12 | Verification: ground truth, metrics, gates |
| §13 | Phased roadmap with acceptance criteria |
| §14 | Open decisions for the user |
| Appendices | Label grammar, default tables, touch-point file map, bugs to file |

---

## 1. Executive summary

**Verdict.** The platform can support a production-grade linear takeoff, and most of the
hard infrastructure already exists on the shared path: vector extraction with per-segment pen
width, luminance and CAD-layer attribution (`web/src/lib/oneclick.ts:339`), a scale engine
with a real gate and a verification habit (`web/src/lib/sheets.ts:212`,
`TakeoffCanvas.jsx:4590`), a command layer with provenance and one-step undo
(`web/src/lib/shapeCommands.js:173`), a rotation-aware text-span layer (`mcp/src/pdf.ts:254`),
symbol matching that can be window-bounded along a run (`web/src/lib/symbolsweep.ts:1425`), and
a report/export stack that already carries LF (`web/src/lib/totals.js:66`). What does not exist
is everything that makes a linear takeoff *linear* rather than a polyline: a click-to-trace
engine on the drawing's own strokes, a size-label parser and associator, per-segment size and
system, vertex/fitting inference, and an assembly model with per-foot, per-vertex and per-run
bases. None of that is a research problem. It is engineering on top of proven pieces, and the
probes in §3 show the geometry is clean enough on real vector sets to do it deterministically.

**The ten decisions.**

1. **Build a new, local, exact-coordinate run-tracing engine (`web/src/lib/linear/`); do not
   build linear takeoff on `buildMepGraph`.** The existing JTS-noded MEP graph is the right
   tool for "which valve belongs to which AHU" but the wrong one for length: on three of the
   six real plan sheets we built it on, its coarsen-and-retry fell to a 109–146 px grid
   (4–5 ft at sheet scale) and produced 329–672 nodes for 25k–55k segments (§3.5). Length must
   be measured on the drawing's own coordinates. The feasibility probe (§3.6) walks a
   pen-filtered stroke chain in under 1 ms after a 250–370 ms per-sheet index build.
2. **Stroke classification comes first, and it is evidence-graded, never guessed.** Duct and
   pipe are drawn with a distinct pen on every set we measured (pen nibble 4 on the Revit set,
   3 on the AutoCAD sets; 1.6 %–27 % of a sheet's segments). Layer names (`M-HVAC-DUCT`,
   `M-PIPE-CD`) classify with 0.85–0.9 confidence where they exist. The legend's line-type key
   (existing / demo / new) is read, not assumed.
3. **Double-line duct is first-class, not an afterthought.** On both drafting styles, the two
   long strokes of a duct sit exactly one nominal width apart at sheet scale (36.0 px for
   `12"x6"` at 1/4", 54.0 px for `24"x16"` at 3/16" — §3.4, all 15 labels checked). The
   engine pairs parallel strokes, measures the centerline, and cross-checks the drawn width
   against the label. A label that disagrees with the drawn width is withheld, not averaged.
4. **Size comes from the drawing, is cross-checked, and is always user-editable.** A size
   grammar covers every notation the corpus shows (`12"x6"`, `18X10`, `12 x 8`, `14x3½`,
   `8"ø`, `10"Ø`, `6Ø`, `2"`, `1-1/2"`, `1½"`, `¾" HW/CW`, `1 1/4" HHWS`, `DN50`) with
   system suffixes and UP/DN qualifiers. Association is orientation-aware (labels rotate with
   the run: `@270` on every vertical pipe label in the corpus) and leader-aware.
5. **Fittings are geometry, not symbol recognition.** Elbows are direction changes (with the
   radius read from the concentric-arc pair on double-line duct), tees are degree-3 nodes with
   a collinear through-pair, reducers/transitions are size changes (trapezoid on double-line),
   risers are UP/DN text or the end-cap/arrow glyph, crossings are degree-4 nodes with two
   collinear through-pairs and are never joined. What the plan cannot see (vertical offsets,
   drops to diffusers) is a declared per-run parameter or allowance, disclosed as such.
6. **The assembly is a first-class, size-keyed, three-basis object** — `per_ft`, `per_vertex`,
   `per_run` — resolved by the same pure module on canvas and MCP, priced in the report, with
   hangers as `ceil(length / spacing)` per run, insulation by size, labor units by size and
   joint, and every default traceable to a standard (§5, §8). Waste stays in the report.
7. **Every run is pencil until inked.** Traced runs commit with `origin.reviewed:false` and the
   full trace receipt (seed, strokes walked, labels read, drawn-width check, stops and why),
   exactly like One-Click and Transitions do today. The audit found MCP `measure_line` omits
   `reviewed:false` (§2.8, bug B-L1); that is fixed first.
8. **Scale stays a gate, and gets a per-viewport extension.** Runs refuse without a scale
   exactly as `commitLinear` does (`TakeoffCanvas.jsx:4855`). Enlarged mechanical-room plans
   on the same sheet (real: `federal-attachment4` p7 is 1/4" beside 1/8" sheets; Bessemer
   P501 and ITD p7 are 3/8" details) need a scale *region*, which the platform lacks today
   (`panelGeometry.js:42` is one upp per sheet key). §9 specifies it.
9. **Ship a manual polyline mode that is already industry-standard, and make the trace mode
   strictly additive to it.** Click, click, double-click; Backspace; Shift ortho; 45° lock;
   continue-run; per-segment size edit. Trace mode is `T`-toggle inside the same tool, and
   falls back to manual on any refusal.
10. **Score it before shipping it.** A linear corpus with per-run ground truth (length,
    size sequence, vertex list) on at least 8 real sets, metrics for length error, size
    accuracy, vertex F1, and stop-correctness, gated in CI like `npm run bench` gates
    One-Click. §12 defines it.

**What "industry-leading" means here, concretely (§4 has the evidence).** Every major
product measures polylines by hand; PlanSwift, OST, STACK, Bluebeam and the MEP-specific tools
(AutoBid, FastDUCT/FastPIPE, QuoteSoft) attach assemblies per foot and count fittings at
clicked vertices; the AI-native entrants auto-detect symbols and, increasingly, walls. Nobody
we could verify (a) follows the drawing's own vector strokes through a run on click, (b) reads
the size off the drawing and cross-checks it against the drawn duct width, (c) infers fittings
from geometry with a disclosed confidence, and (d) ships the whole thing with a
cite-backed receipt and a refusal doctrine. Those four are the moat, and all four are
feasible on this codebase.

---
## 2. What the platform does today (codebase audit)

Read-only audit of `opentakeoff/` on branch `claude/quirky-pascal-zizcwt` at `b6e63a3`.
`TC` = `web/src/pages/TakeoffCanvas.jsx` (14,053 lines), `S` = `mcp/src/session.ts`,
`T` = `mcp/src/tools.ts`.

### 2.1 The manual Linear tool — what exists

- **Tool and trace state.** `L` arms Linear (`TC:3336` key map; `canvasConstants.js:57`
  `MEASURE_TOOLS`). The trace is `poly` + `polyCurve` + the sticky ╱/⌒ `curveMode` switch
  (`TC:554–574`). Pointerdown defers to pointerup so a drag pans mid-trace (`TC:3533`,
  `pendingClickRef`). The committed point is chosen at `TC:3506–3507`: endpoint snap wins,
  then the 45° lock, else the raw cursor. `Enter`, double-click, or **Finish** call
  `finishShape` (`TC:6355–6379`); `⌫` pops a point; `⌘Z` mid-trace pops a point, otherwise
  undoes the last command; `Esc` clears. Linear needs ≥ 2 points.
- **Commit.** `commitLinear(points, curved, baked)` (`TC:4850–4870`) refuses, in order: fewer
  than 2 points; a run spanning two panels (`SPAN_MSG`); *"Set the scale for … first."*
  (`TC:4855`); *"Pick or add a condition first."* (`TC:4856`). Then
  `LF = openLen(points) * upp` (`TC:4859`), border SF from the condition's `thickness_in`,
  and exactly one `dispatchShape({type:"add"})`.
- **The committed record** (as `add` mints it, `shapeCommands.js:187–194`):

  ```json
  { "id": "shp-…", "created_at": "…", "sheet_id": "M101.pdf#6", "condition_id": "cond-…",
    "measure_role": "linear", "verts_norm": [[0.18,0.40],[0.18,0.61],[0.45,0.61]],
    "computed": { "perimeter_lf": 47.2, "area_sf": 0 },
    "label": "PHASE 2", "origin": { "method": "manual" }, "author": "…" }
  ```

  Vertices are normalized per sheet (`verts_norm`), so quantities survive re-render and zoom.
  There is no `closed` flag; closure is implied by role. There is **no per-segment data of any
  kind** — no segment length, size, system, or vertex type — only the total LF.
- **Edit grammar.** Corner grips, edge midpoints (Shift inserts), the edge-insert `+` ghost
  (`edgeInsertHitAt`, `TC:4236–4262`), drag with `ocSnap` and `axisLockPoint`, one `geom`
  command per release. Open runs use `closed = role !== "linear" && role !== "surface_area"`
  (`TC:3700`), so edges = n − 1. Vertex delete keeps ≥ 2 points.
- **Stacking and hit-testing.** `ROLE_TIER = {floor_area:0, deduct:1, linear:2,
  surface_area:2, count:3}` (`TC:267`); pickers scan the stack top-down so a run under an
  Area stays clickable. Render at `TC:12294–12298`: a `<polyline>`, dashed per the
  condition's `line_style`, dashed again when pending (`origin.reviewed === false`).
- **Live readout.** `moveCrosshair` (`TC:3914`) writes the chip by direct DOM: running
  segment length via `fmtCheckLen`, `deg · len` under the angle lock, arc length when a bow is
  open, amber at ≥ 12′ (the roll-width warning — a flooring artifact that must not ride
  duct runs). The MEASUREMENTS tally (`measurementBreakdown.js:15–28`) lists every run's LF
  per condition in draw order.

**Gaps against a linear takeoff.** No click-to-trace; no on-segment or intersection snap
(the snap grid holds endpoints only, `geometry.js:131`); no size, system, or vertex data; the
12′ amber is flooring-specific; the doc set still advertises a "Curved Line" tool and
`curve.js` exports that no longer exist (`README.md:480`, `FEATURES.md:13` — doc drift).

### 2.2 How LF is computed, and where it flows

`verts_norm → stage px → openLen (Σ hypot, geometry.js:179) → × upp → toFixed(2)`.
`uppFor` lives in `web/src/lib/panelGeometry.js:42–45` (`scales[key] / factorFor(...)`); the
stored scale is *real feet per image pixel at `RENDER_SCALE = 2`* (`sheets.ts:10, 35`).
Off-canvas and MCP price through `computeShapeMetrics` (`web/src/lib/shapeMetrics.js:16–44`,
linear branch `:31–35`) — the single role-aware pricer that heals, rescales, and gives MCP
`edit_shape` parity. Downstream: `totals.js:51` accumulates `lf`; `conditionTotals`
(`totals.js:66–107`) applies `×multiplier` then waste to produce `lf_net`; report columns
`reportColumns.js:21–33`; CSV `totals.js:424–463`; `opentakeoff.report.v1` `totals.js:566–581`;
XLSX `xlsx.js:248–253`; per-shape `shapesExport.js:12–44`; DXF `dxf.ts:184–190` (open
`LWPOLYLINE` on `OT-<TAG>-LINEAR`); marked set `markedset.js:642–647`.

Materials: a condition's supporting-materials rows carry `basis ∈ {area, linear, count,
seam_lf}` and a coverage rate; order qty = basis ÷ rate, rounded up (`totals.js:88`,
`coverage.js`). `FLOORING_DEFAULTS` already seeds two linear conditions (`RB-1` base with a
`basis:"linear"` adhesive at 40 LF/tube, `TR-1` transitions; `canvasConstants.js:124–125`).

**Gaps.** Quantities are per-condition scalars. There is no per-size bucket (12x8 LF vs
16x8 LF), no per-vertex count, no per-run item, no assembly. Waste applies to LF
(`lf_net`), so fitting logic must sit *before* waste. Nothing anywhere carries a unit of
LF per size.

### 2.3 The scale engine

- `STANDARD_SCALES` (`sheets.ts:74–101`): architectural 1/16″ … 3″=1′-0″, engineering
  1″=10′ … 60′, metric 1:20 … 1:500. `detectScale` (`:212–227`) canonicalizes quotes,
  whitespace and case, matches only table labels plus two alternates, treats the title-block
  region (x > 0.55 W, y > 0.5 H) as authoritative, accepts one page-wide hit, and returns
  `null` for several distinct hits with no title-block note; `multi` flags multiple notes.
  `scaleFromLabel` (`:293`) accepts a single hit. **Not parsed:** NTS / AS NOTED, non-table
  ratios, "1/4 INCH", per-viewport notes.
- Acceptance funnels through `rescaleSheet` (`TC:4590–4633`: stash, confirm, evict masks,
  re-price via a `replace` command). `applyCalibration` (`TC:4651–4664`) refuses a two-sheet
  calibration. **Check a dimension** `K` (`TC:10783`; verdict `units.ts:146–154`: ≤ 1 % green,
  ≤ 5 % amber). The ruler guide bar (`showScaleGuide`, `TC:4548–4573`). Persistence:
  `sheets:[{sheet_id, units_per_px, scale_source, scale_confirmed}]` (`TC:2763`);
  `scaleUnconfirmed` marks agent-set scales (`TC:477`).
- **Refusals** (verbatim messages the linear engine must reuse): commits at
  `TC:4810/4855/4877`, One-Click `TC:5404`, paste `TC:5776`, dimension `TC:6030`, DXF
  `TC:8652`, transitions `transitions.ts:459–461`. Count is exempt.
- MCP: `set_scale` (`T:167–182`; `S.setScale` `:1529–1589`, one of label/upp/calibrate/
  use_detected, `scaleConfirmed=false`); the gate message *"Set the scale for … first — use
  set_scale (detected: …)"* (`S:1525–1527`). Detection is exposed as `sheet_info.detected`,
  not as a `detect_scale` verb. `mcp/src/scalewarn.ts` (the enlarged-detail mixed-scale
  warning) is wired into `measurePolygon` only — **`measureLine` and `measureSurface` skip
  it** (`S:2037–2072`).
- **Stitches** seed the composite's scale only when every member's upp is identical
  (`TC:1242–1243`). **Per-viewport scale is not supported anywhere** (one upp per sheet key,
  `panelGeometry.js:42–45`); the only acknowledgements are `multi`, the "±" hint, and the
  MCP region warning.

### 2.4 Snapping and angle lock

`angleSnap(last, cur, force)` (`geometry.js:152–162`): `ANGLE_TOL = 4°`, rounds to the 45°
family, projects the cursor onto the locked ray; Shift forces. Applied only when no endpoint
snap hit (`TC:3949–3953`). `buildSnapGrid(points, 24)` / `nearestSnap` (`geometry.js:131–145`)
index **vector endpoints only**, ≤ 40 per cell, 3×3 neighbourhood; tolerances `11/zoom` while
aiming, `8/zoom` on drag; `snapOn` defaults **off** ("beta"). Reusable primitives:
`distToSeg` (`:205`), `segsIntersect` with collinear/T handling (`:267`).

### 2.5 Vector geometry: what a segment knows

`extractVectorGeometry(opList, transform, OPS): VectorGeometry` (`oneclick.ts:339`) yields a
flat `segs[x1,y1,x2,y2,…]` plus, per segment: `meta[i]` (low nibble `SEG_CURVE | SEG_CLIP |
SEG_FILLONLY | SEG_POLYARC`, **high nibble = device line width** `min(15, ceil(lw·√|det m|))`,
`:536–537`), `lum[i]` (stroke luminance 0–255), `layerOf[i]` (OCG index, `−1` outside any
group; single-group OCGs only), and `subpaths[]` (index ranges per figure with bbox, closed
flag, fill luminance). Curves tessellate to 8 chords each, stamped `SEG_CURVE`; polyline
arcs are recovered by `markPolylineArcs` (`:588–616`, ≥ 4 chords, 2–45° per chord, ≥ 30°
total, circle-fit ≤ 3 % of radius). Coordinates are render/image px at the viewport
transform; segment identity is the array index (stable per extraction).

**Not recorded:** the dash pattern (`setDash` is never handled), the stroke RGB (only
luminance), join/cap, and text glyph outlines. **No module indexes segments spatially for a
click** — only endpoints (`buildSnapGrid`) and, inside symbol sweep, `EndpointGrid.nearRect`
(`symbolsweep.ts:550–575`).

### 2.6 Graphs, networks, and the connectivity tracer

Five modules build something graph-like; none follows a run:

| Module | What it builds | Reusable for linear |
|---|---|---|
| `mepconnectivity.ts:132 buildMepGraph` / `:493 traceConnectivity` | Whole-sheet graph: quantize to a 0.15 ft grid, JTS `UnaryUnionOp` **only to harvest junction coordinates**, then split the *original* segments at interior junctions so every edge inherits its layer-derived `system`; coarsen-and-retry ×3/×9/×27 on `TopologyException`; BFS to equipment, ≤ 60 hops; gap bridging only across a fitting symbol | `resolveOnGraph` (mid-edge click snap, `:399`), the refusal doctrine and receipts, the `excludeSegs` seam. **Not** the geometry: see §3.5 for why |
| `arrangement.ts:153 buildArrangement` | Exact half-edge planar arrangement, weld tol 0.75 px, angle-sorted `out[]` per node, `seg` provenance | The angle-sorted node fan is exactly "continue straightest through a junction"; region-bound it and it is the local run graph |
| `controlSchematic.ts:587 topologyFor` (private) | Region-bounded node/edge/degree graph, T-vs-X discrimination, vector arrowhead detection, caps 40k segs | The T-vs-X rule and arrowheads; export it |
| `wallnetwork.ts:143 chainFaces` | Collinear same-pen welding across dash gaps, `parts` preserved | Dashed return/hidden duct lines |
| `netroom.js:1674 mergeLines`, `oneclick.ts:1191 classifyOffsetAnnotationSegs` | Collinear/parallel merge; parallel offset pairs alongside a heavier stroke | The primitive for double-line duct pairing |

`traceConnectivity`'s BFS has no notion of direction, collinearity, size change or branch
degree — it walks every edge, so a seed on a main reaches every branch. `system` comes only
from layer names (`mepsystems.ts:68`, token sets `PIPING`/`DUCTWORK`/`CONTROLS`), never from
line style or labels. Measured costs: 2,854 segs → 482 ms; 42,311 → 2.0 s; 49,017 → 22.8 s
(`vectorTakeoffPipeline.ts:619–627`); *"up to ~30 s on a dense real sheet"* (`S:705`). It runs
on the main thread on the canvas (`TC:7036`). `netroom.worker.js` is the template for an
off-thread per-sheet build.

### 2.7 Text: spans, tags, pairing — and the missing size parser

`textSpans(ph)` (`mcp/src/pdf.ts:254`) returns rotation-aware hulls with `rot` (run direction
in degrees); the canvas quantizes `rot` to 90° (`TC:2245`). `joinHyphenatedTags`
(`equiptags.ts:88`) glues CAD-split glyph runs on one baseline. Pairing rules exist for
tag→value (`S.countMarks`, `:2601–2605`: value **below** within 2.4 h or **beside** within
1.5 h), tag→symbol (`symbollabels.ts:896 labelPlacements`, `LABEL_ADJACENT_K = 2.2 h`), and
leader chasing (`leaderTerminalPointsForLabel`, `:739`). `symbollabels.ts:162–164` explicitly
*excludes* duct-size shapes such as `20-8-SA` from equipment tags.

**Not found** (searched `\d+\s*[xX×]\s*\d+`, `ø`, `Ø`, `DIA`, `DN\d`, `1-1/2`, `CHWS|HWR`):
any duct-size, pipe-size, or inline system-suffix parser; any "nearest label along and
parallel to this segment" association. The only regexes that touch these strings are schedule
header vocabularies (`agentTakeoff.js:1172`) and whole-span media matches
(`controlSchematic.ts:310 MEDIA_RE`).

### 2.8 The MCP and in-app agent surface

| Tool | Where | Behaviour | Finding |
|---|---|---|---|
| `measure_line` | `T:241–249`, `S:2037–2047` | `pts ≥ 2` image px, `scaleGate`, commits `perimeter_lf`, origin `{method:"manual", actor:"agent"}` | **B-L1: omits `reviewed:false`** although `ShapeOrigin` (`S:414–417`) promises every agent commit is pencil; `importTakeoff.js:76` and the canvas gate (`TC:9883`) test `reviewed === false`, so an agent run imports as **ink**. **B-L2:** skips `scaleWarningFor`, so a line inside an enlarged detail gets no mixed-scale warning |
| `measure_surface`, `place_count`, `measure_polygon` | `T:221–270` | as documented | polygon has the scale warning; surface does not |
| `edit_shape` | `T:627–637`, `S:5574–5637` | verts / condition / role / label; refuses inked shapes; recomputes linear as `openLen × upp` | the reassignment seam a sized run must extend |
| `annotate` (dimension) | `T:1032–1049`, `S:6085–6134` | scale-gated markup with `len_ft` | precedent for a scale-gated derived length |
| `trace_connectivity` | `T:384–420`, `S:3485` | returns a node path, never a shape | the receipt/refusal shape to copy |
| In-app agent (`agentTools.js`) | `:283 propose_shapes` | floor_area/deduct only; no linear proposal; `trace_connectivity` at `:331` | needs `propose_runs` |

Staging (`mcp/src/staging.ts:21–23`) puts `measure_line` in the *measure* stage; a new verb
needs a stage row or CI fails. Precedents for derived runs: canvas Transitions
(`TC:9848–9873`) stamp `origin: {method:"derived", actor:"canvas", reviewed:false,
derived:{between_shape_ids, case, gap_in}}` and commit **all runs in one `add`** (one ⌘Z);
MCP `deriveTransitions` (`S:2402–2475`) stamps `method:"agent_v1"`.

### 2.9 Assemblies, materials, HVAC domain model, corpus posture

There are **two disconnected quantity worlds**, and the linear assembly must hang on the
right one.

**(a) The flooring canvas/MCP world** already has a first-class `measure_role:"linear"`,
per-condition supporting-materials rows on a `linear` basis with ceiling rounding, waste on
LF, a `thickness_in` size knob, and a free-text `laborType`:

- `MaterialRow { id, name, per, basis: "area"|"linear"|"count"|"seam_lf", unit, round,
  note? }` (`S:381–394`, field-identical on the canvas; canvas rows add `kind`, `grout{}`,
  `lib_id`, and twin bookkeeping `origin_id`/`inherited`, `variants.ts:38–43`).
- Rounding (`totals.js:85–91`): `basisVal = basis==="linear" ? lf : "count" ? ea :
  "seam_lf" ? seam : total`; `qty = basisVal / per`; `round===false ? round2(qty) :
  ceil(qty − 1e-9)`. Multiplier applies to every basis; waste to SF and LF only, never EA.
  **So `ceil(length / spacing)` hangers already work today** as
  `{basis:"linear", per: spacing_ft, unit:"ea", round:true}` — per condition, not per run.
- Condition record (`canvasUtil.js:93–104` `instantiateTemplate`): `id, created_at,
  finish_tag, color, fill, hatch, multiplier, waste_pct, height_ft?, thickness_in?,
  laborType?, subfloorType?, roll_setup?, materials[]`, plus custom `attrs{}`, imported
  `spec{manufacturer, style, color, size, description}` (`size` is a free string), and twin
  fields. The MCP `Condition` type (`S:395–411`) lacks `thickness_in`, `laborType`, `spec`.
- Libraries: `templates.js:25–36` passes unknown fields through; **`plays.js:7–8`
  whitelists** `COND_KEEP` and `MAT_KEEP` and would drop new fields; `rules.ts:38–41` has
  one predicate kind; `coverage.js:172–188` is the only size-aware rate derivation (grout
  from tile geometry).
- Labor is `condition.laborType` free text (`TakeoffsPanel.jsx:998–1000`), a report column
  when non-empty. **No hours, no rate, no code, no cost anywhere.**

**(b) The BAS Python engine** (`bas_engine/assemblies.py`) is a rigorous, source-cited,
integer-only assembly register: `AssemblyComponent` with `component_kind` (12 values —
controllers, sensors, valves, damper actuators, relays, power supplies…), `Quantity {value:
int, basis: "per_equipment"|"selected_group_once", origin, reason}` (`:50–55`), expansion
`assigned_quantity = value × factor` (`:186–223`), responsibility *claims* per activity
(`furnish|install|wire|program|test`) rather than labor hours, an explicit no-pricing
doctrine (`README.md:51`, `:138`), and **no length unit at all** (`engineering_units.py:17–19`
lists V…Hz…ratio; lengths exist only as integer mm on serial routes, `models.py:147–158`).
Attachment is by equipment UUID + scope UUID, never by tag or device class. `README.md:277`:
"not an arbitrary floor-plan cable-routing solver."

**Compiled takeoff lines** (`corpusTakeoff.mjs:934–957`) carry `quantity: 1`,
`quantity_basis: "schedule_row_cardinality"`, `scheduled_qty`, `installed_qty: null`,
`unit: "EA"` hard-coded at three emission sites; plan-side `TakeoffItem`
(`mcp/src/takeoff.ts:73–149`) carries `placement_count`, `drawing_locations[]`,
`quantity_basis: symbol_fingerprint|tag_attached_vector|…`. Reference tables such as the
Bessemer *DUCTWORK INSULATION SCHEDULE* (SYSTEM TYPE / INSULATION TYPE / thickness) land
verbatim as `ReferenceTableRow{key, cells}` (`takeoff.ts:139–149`) — **a size/system-keyed
insulation rate table is already extractable, with cell citations**. Nothing carries LF.
`takeoffWorkflow.js:220–224` classifies goals mentioning "duct length / LF" as
`scale_refuse` — today "duct length" is a refusal category, not a takeoff kind.

**HVAC taxonomy** (`hvacTaxonomy.ts:28`): `valve | actuator | damper | air_terminal |
air_device | major_equipment | sensor | control_component` — no ductwork, piping,
insulation, hanger, fitting, conduit, cable or tubing family. The *system* axis for
linework exists in `mepsystems.ts:30` (`piping | ductwork | electrical | controls`) with
`CONDUIT`/`EMT` under electrical and `BAS/DDC/TSTAT` under controls. `hanger`, `elbow`, `tee`
never appear as domain concepts.

**Report/export.** Column getters `reportColumns.js:12–32` (`lf`, `lf_net`, `waste_lf` …);
the first 13 CSV columns are frozen by a golden test (`:55–57`); dynamic families append
via ctx maps "never as new row fields" — the `ROLL_FIELDS` block (`:236–246`) is the
precedent for a derived-quantity family. `opentakeoff.report.v1` (`totals.js:471–499`,
mirrored `outputs.ts:1207–1233`) has an additive `roll_goods` block — the precedent for a
`linear_runs` block. XLSX tabs `xlsx.js:278–284`. `outputs.ts:959` pins
`measure_role` to the five-value enum, so a *new* role would fail `export_takeoff`
validation; keeping `"linear"` and adding fields does not.

**Persistence.** Save is passthrough (`store.js:264–296`, `cloudStore.js:357`); hydrate runs
named sanitizers that leave other shape fields untouched; sync (`sync/merge.js:185`) is a
per-shape three-way merge, so new fields ride along; **revision compare is blind to new
quantity families** until `revisions.js:27,30` and `snapshotDiff.js:26,31` learn them.

**Corpus posture.** Duct/pipe LF is explicitly deferred in `VECTOR_TAKEOFF_ENGINE_RESEARCH.md:264,402`
and `NEXT_GOAL_LOOP.md:120,179,708`; no ground-truth key mentions duct/pipe/LF. Sets with
drawn duct/pipe plans: `bessemer` (8 sheets, byte-identical to the bundled demo),
`itd-d1-lab`, `federal-mech` (24 sheets, ~511K segments), `navfac-cherry-point-atc` (75
sheets), `bldg5406-hvac-demo`, `weld-county` (OCG layers), `baker-county-eoc`.

**Attachment points, ranked** (from the audit; §7 and §13 use these):
1. Shape: keep `measure_role:"linear"`, add `run{}` (§7) — update `shapeMetrics.js:31–35`,
   `totals.js:38–53`, `S:375` `MeasureRole`/`Shape`, `S:2037–2045`, `T:241–249`,
   `outputs.ts:959–961`.
2. Condition: `system`, `size`, `assembly_id`, `hanger_spacing_ft`, `allowance_pct` —
   `canvasUtil.js:93–104`, `plays.js:7`, `S:395–411`, `T:660–682`, `agentTools.js:784–815`,
   `TakeoffsPanel.jsx:998–1006`.
3. Materials rows as the rate carrier — `basis` gains `"vertex"` and `"run"`
   (`S:388`, `T:645`, `agentTools.js:816–830`, `TakeoffsPanel.jsx:244–248`,
   `materials.js:34`), resolved in `totals.js:88`; rows gain `hours_per_unit`.
4. A pure size-keyed rate module (`web/src/lib/linear/rates.ts`, modelled on
   `coverage.js:172–188`), seedable from cited reference tables (`takeoffEvidence.mjs:12–38`).
5. Report: `reportColumns.js:12–72` (frozen-13 rule), `linear_runs` block in `reportJson`
   and `outputs.ts:1207–1233`, a new XLSX tab, `dxf.ts:184–190` already writes `-LINEAR`.
6. Agent gate: `agentTools.js:862` `MEASURE_ROLES` + `"linear"` with `minPts 2`;
   `takeoffWorkflow.js:220–224` re-routes LF goals to a `linear_run` workflow.
7. MCP verb in `TOOL_STAGES.measure` (`staging.ts:20–25`) committing through
   `Session.commit` (`S:1668`) with withheld branches (pattern: `deriveTransitions`).
8. Python engine only if source-cited assembly discipline is required for BAS linear
   (`bas_engine/linear_assemblies.py`, `basMath.ts` wrapper, replay kind).
9. Revision/snapshot diff fields; 10. taxonomy families; 11. tests (§12).

### 2.10 Tests and CI that already cover the surface

`web/test/canvas-geometry.test.ts` (angleSnap, hitShape linear, openLen, snap grid),
`shapeMetrics.test.ts:34` (linear LF + border SF), `measurementBreakdown.test.ts`,
`arc.test.ts`, `units.test.ts` (`ftIn`, `dimLabel`, `parseLenInput`, `checkVerdict`),
`totals.test.ts:35,88,269`, `transitions.test.ts`, `shapeCommands.test.ts:126–209` (run
cutting), `mepconnectivity.test.ts` (29 tests incl. the `junctionTests` perf gate),
`mepsystems.test.ts`; MCP `conformance.test.ts:166–388` (`measure_line` happy path, scale
gate, min-2), `tools.test.ts:1089–1164` (`edit_shape` role→linear), `scalewarn.test.ts`.
`npm run check` = typecheck + lint + test + build (+ `bench` for One-Click IoU). **Not
tested:** `commitLinear` itself, `edgeInsertHitAt`, `detectScale` text parsing, the
`reviewed` omission.

### 2.11 Bugs and drift found by the audit (to file regardless of this plan)

| Id | Where | What |
|---|---|---|
| B-L1 | `S:2037–2047` | `measure_line`/`measure_polygon` omit `origin.reviewed:false`; agent runs import as ink |
| B-L2 | `S:2037–2072` | `measure_line`/`measure_surface` skip `scaleWarningFor` |
| B-L3 | `README.md:480,516`, `FEATURES.md:13` | Advertise a "Curved Line" tool and `flattenRing`/`flattenClosedCurve` that no longer exist; the `Q` key now flips `curveMode` |
| B-L4 | `TC` hydrate `:1826–1878`, `store.js` | No role/vertex-range validation of shapes on load (only labels are sanitized); a malformed `verts_norm` reaches the pricer |
| B-L5 | `oneclick.ts` | `setDash` is never read, so dashed (return/hidden/demo) linework is indistinguishable from solid at the segment level |
| B-L6 | `panelGeometry.js:42` | One scale per sheet; a 1/4" enlarged plan on a 1/8" sheet measures 2× wrong with no refusal |

---

## 3. What real mechanical drawings look like to the engine (measured)

All numbers below come from `plans/03-research/probes/{probe,ductwidth,trace-proto,
layers}.mts` run over `mcp/` with the repo's own `extractVectorGeometry`, `textSpans`,
`detectScale`, `buildMepGraph`, `classifyMepLayerName`, `classifyLayerName` (scripts are
listed in Appendix C so they can be re-run and turned into fixtures). Image px are at
`RENDER_SCALE = 2` (144 px per paper inch).

### 3.1 Per-sheet statistics on six real sets

| Set (drafting tool) | Sheet | Scale detected | Segments | Duct/pipe pen share | Rect size labels | Round labels | Pipe-size labels | System / UP-DN text |
|---|---|---|---|---|---|---|---|---|
| Bessemer apartments (Revit) | M101 plan | 1/4" | 38,339 | pen 4: 624 (1.6 %) | 4 (`12"x6"`, `16"x8"`, `10"x6"`) + `14x3½` | 3 (`8"ø`, `6"ø`@270) | 1 (`4" EA`) | legend only |
| | P101 plumbing | 1/4" | 15,372 | pens 3–4: 4,366 | 0 | 5 (`1"ø`) | `4" DN` | 47 (`¾" HW/CW UP`, `2" SAN UP`, `1½" V UP`) |
| | MP001 legend | — | 8,959 | — | 12 (`24x14` legend boxes) | 0 | 0 | `SUPPLY AIR DUCT UP/DOWN`, `PIPE UP/DOWN`, `CHWS`, `CHWR`, `CD` |
| ITD D-1 Lab (AutoCAD) | p3 HVAC plan | 3/16" | 54,622 | pen 3: 15,446 (28 %) | 23 (`24"x16"`@270, `18X10`, `58"x22"`) | 37 (`10"Ø`, `12"ø`, `14"Ø`) | 0 | `SA`, keyed notes `ROUTE 58"X22" SUPPLY DUCTWORK UP` |
| | p4 HVAC plan | 3/16" | 35,584 | pen 3: 7,599 | 7 | 39 (`26"ø` …) | 0 | `ROUTE 8" DUCT DOWN TO SNORKEL HOOD` |
| | p5 piping plan | 3/16" | 25,857 | pen 4: 5,885 | 0 | 15 (`2"ø`, `1"ø`, `3"ø`) | 0 | `HWS`/`HWR` @270 |
| Federal VAV/AHU set | p4 (M211/M207/M230) | 1/8" | 100,266 | pen 3: 37,794 | **182** (`14"x10"`, `32"x8"`@270, `28"x16"`) | 7 | 0 | `PC MD` |
| | p6 (M303/M302/M219) | 1/8" | 62,050 | pen 3: 10,036 | 0 | 0 | 50 (`1" HHWS`, `1 1/4" HHWR`, `3" HHWS`) | 79 |
| | p7 (M226/M225) | **1/4"** | 30,804 | pen 4: 8,842 | 2 (`66"x32"`) | 0 | 11 (`4" CHWR`@270, `2 1/2" HHWS`) | mixed-scale sheet in a 1/8" set |
| Bldg 5406 HVAC | M-101 | 1/4" | 96,292 | — | 1 (`12x12`) | 2 (`8"Ø`@90) | 0 | `CWS`/`CWR`/`2" CWS/R` @90 (whole sheet rotated 90°) |
| | P-101 | 1/4" | 18,344 | — | 0 | 0 | 7 (`1-1/4" CW`, `2" CW`) | 16 |
| Weld County (AutoCAD, OCG layers) | p7 duct plan | 1/8" | 27,991 | `M-HVAC-DUCT`: 3,690 | 33 (`8x8`, `10x8`, `12x12`) | 44 (`14"Ø`) | 0 | 40 OCG layers |
| Baker County EOC | p38 mech plan | 1/8" | 15,782 | — | 12 (`10X10`, `26X10`, `22X10`) | 17 (`6"Ø`, `8"Ø`) | 0 | `24X14 SA`, `8"Ø EA`, `8X8 EA` |
| | p42 gas schematic | — | 3,439 | — | 0 | 0 | 14 (`3" NG`, `1 1/4" NG`) | `NATURAL GAS SCHEMATIC` |

Observations that drive the design:

- **Duct/pipe strokes are separable by pen on every set.** The duct outline pen is the
  heaviest stroke family on the sheet and a small fraction of the segments (1.6 % on the
  Revit plan, 28 % on the dense AutoCAD plan). Architectural background is pen 1 (66–87 %).
  Stroke classification must be *per sheet* (the nibble differs by set: 4, 3, 4, 3) and
  evidence-graded, never a constant.
- **Size labels take every form the grammar in Appendix A lists**, on real sheets, often on
  the same sheet: `12"x6"`, `18X10`, `12 x 8`, `12x12`, `14x3½`, `8"ø`, `10"Ø`, `6Ø`,
  `12"Ø`@270, `2"`, `1-1/2"`, `1½"`, `¾" HW/CW DN`, `1 1/4" HHWS`, `3" NG`, `24X14 SA`,
  `8"Ø EA`. Unicode fractions (`½ ¾ ¼`) and mixed-case `ø/Ø` are common. Labels on vertical
  runs are rotated (`@270`, `@90`); one whole set is rotated 90° (Bldg 5406 — every span
  `@90`), so orientation must be relative to the run, not to the page.
- **Plumbing plans carry size+system+direction in one span** (`2" SAN UP`, `½" HW/CW DN`,
  `1½" V UP/DN`). Those are riser markers *and* size labels; the grammar must yield both.
- **Elevation and dimension text must be rejected as sizes**: `48" MAX`, `80" MIN`,
  `12" ABOVE`, `#4@12" O.C.` appear on the same sheets and match a naive `\d+"` pattern.
- **Size callouts are sparse on small Revit jobs** (Bessemer M101 has four rectangular labels
  for the whole floor; M102 has none because it is "typical of first floor") and dense on
  commercial sets (182 on one federal sheet). The engine must therefore carry size *along* a
  run from one label, split at branches and at the next label, and refuse where no label is
  reachable — never invent one.
- **Legend sheets encode line type per status.** The Bessemer `MP001` DUCTWORK legend shows
  `24x14 SA` boxes in three strokes — thin solid (EXISTING), dashed (DEMO), heavy solid
  (NEW) — for SA/RA/OA/EA, and the MECHANICAL PIPING legend keys CHWS/CHWR/HWS/HWR/CD/RL/RS by
  dash pattern. Because `extractVectorGeometry` drops `setDash` (B-L5), the engine cannot yet
  read this key; §6.1 adds dash capture.
- **CAD layer names are gold when present.** Weld p7: `M-HVAC-DUCT` (3,690 segs, classified
  *ductwork* 0.9), `M-HVAC-GRD` (grilles), `M-HVAC-EQPM`, `M-PIPE-FITTING`, `M-PIPE-CD`
  (*piping* 0.85), `M-ANNO` (*annotation* 0.85), `M-CONT-STAT` (controls, currently
  *unknown*). Revit exports carry no OCGs (all Bessemer sheets `layers=0`), so layer evidence
  is a bonus, not a dependency.
- **Scales mix within a set and within a sheet.** Federal p7 detects 1/4" in a 1/8" set;
  Bessemer P501 and ITD p7 (3/8") are enlarged details on plan-scale sheets; ITD p2 is 3/32".
  `multi` is set on several. Per-viewport scale (§9.2) is a correctness requirement for
  mechanical rooms, not a nicety.

### 3.2 How duct is drawn (both drafting styles)

Rendered crops (the `render.mts` crops of M101 and ITD p3) show the same conventions on
the Revit and AutoCAD sets:

- **Double-line ductwork** with the size text *inside* the duct on the Revit set and
  inside-or-beside with a leader on the AutoCAD set; **transitions drawn as trapezoids**
  where `12"x6"` steps to `16"x8"`; **radius elbows as concentric arc pairs**; diffusers as
  hatched rectangles sitting inside the run; **round duct drawn double-line with a
  semicircular end cap**; risers as a short stub with an arrow and a `UP`/`DN` note; a
  crossing drawn with the lower duct's lines **broken** (hidden) under the upper.
- **Single-line piping** on the plumbing and hydronic sheets with size+system labels rotated
  along the pipe, riser circles (`○` with a stub), and dash patterns per service.

### 3.3 The drawn width equals the first dimension at sheet scale (15 of 15 labels)

`ductwidth.mts` searched, for every size label on the plan, for long parallel strokes on the
duct pen within ±80 px and measured their spacing:

| Set / scale | Label | Nominal width in px | Stroke pair found (px from label centre) | Measured spacing |
|---|---|---|---|---|
| Bessemer 1/4" (36 px/ft) | `12"x6"` | 36.0 | −15.8, +20.2 | **36.0** |
| | `16"x8"` | 48.0 | −21.8, +26.2 | **48.0** |
| | `10"x6"` | 30.0 | −12.7, +17.1 | **29.8** |
| | `8"ø` @270 | 24.0 | −10.4, +13.6 | **24.0** |
| | `6"ø` @270 (×2) | 18.0 | −7.4, +10.6 | **18.0** |
| ITD 3/16" (27 px/ft) | `12"ø` | 27.0 | −11.4, +15.5 | **26.9** |
| | `24"x16"` @270 | 54.0 | −24.5, +29.5 | **54.0** |
| | `14"x14"` @270 | 31.5 | −13.3, +18.2 | **31.5** |
| | `12"x12"` | 27.0 | −12.1, +14.8 | **26.9** |
| | `22"x16"` | 49.5 | −22.6, +26.9 | **49.5** |
| | `20"x16"` @270 | 45.0 | −20.0, +24.9 | **44.9** |
| | `16"x16"` | 36.0 | −15.7, +20.3 | **36.0** |
| | `8"x14"` (label beside duct) | 18.0 | −32.9, −14.9 | **18.0** |
| | `8"ø` (label beside duct) | 18.0 | +26.6, +44.6 | **18.0** |

Every pair matched within 0.2 px (< 0.1"). Two consequences: (1) the *first* number of a
rectangular callout is the plan-view width (SMACNA/ASHRAE convention, confirmed on both
drafters), and (2) a parallel-pair search at the label's nominal spacing is a strong,
scale-checked way to bind a label to its duct even when the label sits beside the run with a
leader. The engine uses this as a cross-check and as a tie-breaker, never as the only source.

### 3.4 Where the existing MEP graph breaks for length

`buildMepGraph` (unchanged, `mepconnectivity.ts:132`) on the same sheets:

| Sheet | Segments | Nodes / edges | Grid it noded at | Build time |
|---|---|---|---|---|
| Bessemer M101 | 38,339 | 9,708 / 29,413 | 5.40 px (×3) | 645 ms |
| Bessemer P101 | 15,372 | **329** / 2,339 | **145.8 px (×27)** | 975 ms |
| Bessemer P102 | 12,438 | 7,298 / 12,292 | 5.40 px | 247 ms |
| ITD p3 | 54,622 | **672** / 5,385 | **109.4 px (×27)** | 6.7 s |
| ITD p4 | 35,584 | **642** / 4,873 | **109.4 px (×27)** | 4.2 s |
| ITD p5 | 25,857 | 2,394 / 7,958 | 36.5 px (×9) | 2.0 s |

A 109 px grid is 4.0 ft at 3/16"; a 146 px grid is 4.1 ft at 1/4". Every node coordinate in
those graphs is quantized to that grid, so a run's length would be wrong by feet and its
vertices would be fused across unrelated linework (node degrees reach 59–82). The
coarsen-and-retry is the right *connectivity* answer (a junction still resolves) and the
wrong *measurement* answer. Decision 1 follows.

### 3.5 Feasibility probe: following a duct edge on exact coordinates

`trace-proto.mts` filters a sheet to the duct pen, buckets segment endpoints at
`max(4·tol, 2)` px, seeds on the stroke nearest a size label, and walks from both ends
choosing the smallest angle deviation, stopping on a turn > 60° or a dead end:

| Sheet | Pen filter | Index build (incl. extraction) | Seed | Walk | Result |
|---|---|---|---|---|---|
| Bessemer M101 | pen 4: 619 of 38,339 | 254 ms | `12"x6"` top edge | 0.6 ms, 5 hops | **18.2 ft** run from the elbow at x = 1066 to the transition at x = 1718; junctions correctly reported at the diffuser (deg 6) and the transition |
| Bessemer M101 | pen 4 | 247 ms | `8"ø` | 0.7 ms, 12 hops | **18.6 ft** vertical riser from the main to the end cap; stops at 90° turns |
| ITD p3 | pen 3: 14,642 of 54,622 | 371 ms | `24"x16"` | 1.0 ms, 37 hops | 8.2 ft before stopping at a 90° branch — the AutoCAD duct edges are broken by taps and diffuser outlines every few feet, so *edge-following alone is not enough*: the engine must follow the **pair** (both edges plus the centerline) and step across symbol breaks (§6.3–6.5) |

The takeaways are exact: interactive tracing is a sub-millisecond walk after a one-off
per-sheet index that costs a few hundred milliseconds (worker-able); edge-following works on
clean Revit output; dense AutoCAD output needs pair-following, junction typing, and
symbol-gap bridging — all of which §6 specifies. Nothing in the probe required global noding.

---
## 4. Competitive landscape

Source: web research on 2026-09-16 (vendor pages, help centres, release notes, press,
review sites). Direct fetches of several vendor domains were blocked by the session proxy, so
some cells are marked unverified; nothing below is asserted beyond what a cited page says.
The full per-product report with URLs is preserved in Appendix D.

### 4.1 How the field does linear takeoff

| Product | Linear model | Assisted / automatic on vector PDFs | Size on the run | Fittings at vertices | Parts-per-LF math | Scale |
|---|---|---|---|---|---|---|
| **Trimble AutoBid Mechanical / SheetMetal** | Route-line runs: *Start New Run, Vertical Run Only, Branch From (with elbow / elevation change / from existing mains), Add-Drop And Rise, Change Elevation, Branch In Vertical, Connect/Reconnect* | None found; click-driven | Per run; a **HotSpot** is "a mark in the duct run that … did not change direction, elevation, or size" — the run model distinguishes size-change vertices | **Automatic** at direction changes, branches, rise/drop | Hangers "at changes in directions and at user-defined spacing based on pipe size"; MCAA/PHCC/SMACNA labor units built in | unverified |
| **Trimble Estimation MEP / Accubid Anywhere / LiveCount** | Continuous lines + drops/risers; LiveCount "tracks both lengths and counts in the same run" | 2026-06-30: AI "auto-routing … automatically calculating linear footage, including vertical rises and drops" for conduit; AI auto-scale/auto-name across sets; mechanism undocumented | Attribute per run | "automatically inserts 90s, 45s, and tees" | > 8,000 assemblies | AI auto-scale |
| **FastEST FastPIPE / FastDUCT / FastWRAP** | Fitting-first: place fittings, **Auto Connect** "scans the physical plan to detect if there is a line between that fitting and another (and validates that the connection makes sense for the type and size)" and fills the pipe | Auto Connect (line between two placed fittings) | Per spec/run; rect-to-round conversion | Manual; a review says FastDUCT lacks auto-elbow | lb, SF, shop + field hours; riser hangers, minimum hanger spacing; FastWRAP for insulation | competitor claims no stated-vs-drawn scale check |
| **QuoteSoft Duct / Pipe** | Pairs, continuous (centre-to-centre), or **Auto Elbow** (inserts the elbow and deducts its length); Auto Duct fills between fittings | Auto Duct (fitting-first) | Gauge, joint, seam, sealant, reinforcement editable mid-run | Auto Elbow; multi-fitting drop | Hanger spacing + drop; liner/wrap; "assembly audit trail" | unverified |
| **Bluebeam Revu 21 / Max** | Length, Polylength (single **Rise/Drop** scalar added to total), curves, Dynamic Fill | **Snap to Content** (vector endpoints only); no line-follow; Max adds Offset/"Magic Markups", no auto-measure | One tool per size; no per-segment change | None | Custom-column formulas; Legends | **Viewports** with separate X/Y scales per region |
| **PlanSwift** | Linear, continuous/segment, ortho with Shift override, Backspace, double-click to end | AutoCount (template matching) | Per item | None | Parts & Assemblies with formulas | One scale per page; crop-as-new-page |
| **On-Screen Takeoff / Takeoff Boost** | Linear condition, curved segments, per-segment **Drop/Run** box with a condition default, patented Multi-Condition Takeoff | Auto Takeoff for **walls** (centre of wall), Auto Count, Auto Link; Auto Scale planned Aug 2026 | Per condition | None | Condition quantities | Per page |
| **STACK** | Linear, Linear with Drop, Pitched, arc, **Split** | Floor Plan AI (walls/doors/windows) | Per takeoff | None | Formulas e.g. `[MeasuredLinear]/10`, waste % | Per page; a G2 review describes the drop-on-double-click failure mode |
| **Togal.AI / Kreo** | Wall linears from AI; Kreo polyline reads vector data | Rooms/walls/doors/windows; Kreo Auto Measure 3.0 "re-fits every outline to the lines of the drawing"; **no pipe/duct auto-measure verified** | — | None | Wall assemblies; Kreo API | Per page |
| **eTakeoff Dimension SnapAI** | Traces with extension variables | **"snap the cursor to points, lines, and polylines"** from vector data; "entire line measurements instead of … each end" | Extension vars | None | Sage assemblies | "advanced scaling" |
| **Countfire** | Click per bend; containment adds manual points for bends/tees and separate suffixed measurements for vertical allowance | Symbol auto-count | Size displayed on measurement | Manual | — | Per drawing |
| **Canaveral (AI-native, 2025–26)** | Assisted duct trace | AI "reads dimensions from your plans"; "hold Q" to accept the read size | **Reads size text**; rect/round/oval | **"elbows at angle changes, tees at branches, reducers at size transitions"** from geometry | Live price-book | unverified |
| **DuctIQ / Beam AI / TaksoAi / Civils.ai** | Batch: upload, receive | Vision AI "reads duct sizes, traces runs, counts fittings"; "low-confidence runs are surfaced" (DuctIQ) | By system and size | Counted by AI | Excel / Wendes | reads drawing scale |
| **PixelTakeoff** | Auto Line (whole solid line, no clicking), Dashed Trace (bridges gaps), Free trace | One-click whole-line capture | — | None | — | unverified |

### 4.2 What the best-in-class does, per capability

- **Run model:** AutoBid — a run is an object with vertical/branch/rise-drop commands and
  size-change vertices (HotSpot). STACK's *Split* and OST's per-segment Drop/Run box are the
  best general equivalents.
- **Assisted capture on vector:** eTakeoff SnapAI (grab a whole polyline), PixelTakeoff Auto
  Line / Dashed Trace, FastEST Auto Connect (validates a drawn line joins two compatible
  fittings). Trimble's 2026 auto-routing is the only enterprise auto-length claim and its
  mechanism is undocumented.
- **Size from the drawing:** Canaveral is the only product found that reads the size
  annotation and lets the user accept it with a keypress.
- **Fittings from geometry:** AutoBid, Estimation Desktop, QuoteSoft (Auto Elbow deducts
  the elbow from the run), Canaveral.
- **Parts per LF:** FastEST / QuoteSoft / AutoBid (hangers by size and spacing, riser
  hangers, liner/wrap, SMACNA/MCAA labor); STACK's formula language as the general model.
- **Scale:** Bluebeam Viewports (regions with their own scale); Trimble AI auto-scale.
- **Trust posture:** DuctIQ and Drawer.ai surface low-confidence runs and unusual runs;
  ConstructConnect's own guidance is to spot-check linears and fully review curves and odd
  angles.

### 4.3 What nobody does well yet — the moat

1. **Click-to-follow a vector run with size-change awareness**: auto-follow the centreline →
   read the nearest size tag per segment → split at each size change → insert
   reducers/transitions. No vendor documents the combination.
2. **Interactive, explainable double-line duct centreline** with the drawn width
   cross-checked against the `12x8` text. Batch tools do it with review; interactive tools
   do not.
3. **Deterministic, auditable fitting inference** whose rule is shown at each vertex
   (angle → 90/45, branch → tee/wye, Δsize → reducer), thresholds editable, never
   double-counted at tees. Reviewers of AutoBid/QuoteSoft complain of silent behaviour;
   Procore is reported to over-apply drops "at every change in direction".
4. **Rise/drop as geometry**: typed per-vertex elevation events that generate vertical length
   *and* the fittings for it, not a scalar added to the total.
5. **Hanger logic that respects the run graph** and the adopted code table, with per-run
   overrides and riser rules visible in the UI.
6. **Multi-scale per sheet with automatic sanity**: Viewports exist but are manual; a
   stated-scale-vs-drawn-dimension check is claimed by no one as a first-class feature (this
   platform already has *Check a dimension*).
7. **A live per-system/size legend** with LF, fittings, hangers, insulation SF, labor,
   confidence and "unreviewed" flags updating as you draw.
8. **Insulation, pressure testing, firestop as per-run derived items** from the run object.
9. **Published, reproducible accuracy for linear MEP** — walls have numbers (STACK "within
   3 %", Togal 98 %, Handoff 81.6 %); pipe/duct LF and fitting F1 have none.

Items 1–3 and 6–9 map directly onto capabilities this codebase is already strong at
(vector-first geometry, receipts, refusal, `Check a dimension`, corpus benchmarks). That is
the basis for calling the target "industry-leading" rather than "at parity".

### 4.4 UX conventions to match (de facto)

Click per vertex; **double-click to end** (also Enter); **Backspace** removes the last point;
**Shift** for ortho (PlanSwift: Shift temporarily overrides the ortho toggle); a *continuous
mode* that keeps recording after a double-click with Esc to leave; curves by converting a
segment; a per-run properties panel that opens when the takeoff needs inputs (STACK) or on a
hotkey before drawing (PlanSwift `2`); QuoteSoft-style mid-run edits of gauge/joint/hanger;
Canaveral's accept-the-read-size keypress; one colour per system with sizes shown on the
drawing (Countfire); a fitting-first mode as a second entry (FastEST/QuoteSoft); OST's
draw-once-populate-several for pipe + insulation + hangers on the same run. Avoid STACK's
failure mode where ending a run silently adds a drop and correcting it deletes the run.

---

## 5. Industry math: standards, tables, labor, and the defaults to ship

Source: web research on 2026-09-16 plus standards knowledge. Web fetches of ICC, SMACNA,
ASHRAE and RSMeans pages were blocked by the session proxy; every number was taken from
search-result excerpts of the cited pages. **Provenance grades are kept on purpose:**
**[C]** codified value quoted from a code/standard page; **[V]** vendor / estimating-firm /
textbook value (rule of thumb); **[M]** consistent with confirmed cells but the individual
cell was not confirmed in this session — it ships as an *editable default* and must be
checked against the source before release. Appendix B holds the full tables with URLs.

### 5.1 Ductwork

- **Gauge selection [C structure, cells V/M].** SMACNA *HVAC Duct Construction Standards –
  Metal & Flexible* (4th ed., ANSI/SMACNA 006-2020) tabulates rectangular duct by pressure
  class (½, 1, 2, 3, 4, 6, 10 in. w.g.) and **longest side**, giving minimum gauge plus a
  reinforcement code and spacing; the 4th edition moved to minimum thickness, rated TDF/TDC
  for the first time, and updated hanger tables. A widely used simplified spec schedule
  (26 ga ≤ 12", 24 ga 13–30", 22 ga 31–54", 20 ga 55–84", 18 ga 85–96", 16 ga > 96") is the
  right *editable default*; it must never be labelled "SMACNA" in the UI. Round/spiral:
  28 ga 4–14", 26 ga to 24" spiral, heavier for longitudinal seam and fittings [V/M].
- **Weight [C for lb/ft², V for factors].** Galvanized sheet: 26 ga 0.906, 24 ga 1.156,
  22 ga 1.406, 20 ga 1.656, 18 ga 2.156, 16 ga 2.656 lb/ft² (verified). Rectangular
  `lb/LF = 2(W+H)/12 × lb/ft² × (1 + allowance)`, round `π·D/12 × lb/ft² × (1 + allowance)`;
  vendor calculators use a **1.15** seam/joint allowance and cite 15–20 % as the SMACNA
  practice (the attribution to SMACNA is the vendor's). Scrap **10 %** typical, 15 %+ for
  lined or field-fabricated; the Wendes manual adds **20 %** to surface area for "hangers,
  cleats, hardware, waste and seams". Fittings are heavier per equivalent foot: a **1.40**
  fitting weight factor for a standard office building is the cited rule. RSMeans:
  "Rectangular duct is taken off by the linear foot for each size, but its cost is usually
  estimated by the pound."
- **Hangers [C].** IMC 2021 §603.10: hangers "at intervals not exceeding 10 feet"; flex per
  manufacturer. SMACNA Tables 5-1/5-2 offer 4/5/8/10 ft options; common practice 8–10 ft
  rectangular, 10–12 ft round; a hanger within **2 ft of each elbow** and **4 ft of each
  intersection** [V]. Trapeze BOM per hanger: strut (W + 4"), 2 rods, 2 anchors/beam
  clamps, 4 nuts, 4 washers [M, standard practice]; strap hanger: 2 straps, 2 anchors, 4
  screws [M].
- **Insulation [C/V].** Wrap SF = perimeter of the *insulated* duct × L (add 2t per
  dimension) × **1.10** laps; fittings **+20 %** of the straight-run total or per fitting;
  liner by internal SF. R-values per ASHRAE 90.1 Table 6.8.2 / IECC C403.12.1: R-6 in
  unconditioned space, R-8 outside (CZ 0–4), R-12 outside (CZ 5–8) [C]. Insulation is
  specified by system in the duct insulation schedule (spec 23 07 13), which this platform
  already extracts as a cited reference table (§2.9).
- **Labor [V].** Low-pressure galvanized: **44 lb/hr → 0.023 hr/lb** (Wendes); field
  productivity **20 LF/man-day rectangular, 40 LF/man-day round** (MEP Academy); methods:
  hours per piece (most accurate), per lb, per SF. Fitting labor via the weight factor or
  per-piece tables (Wendes manual — a source to license, not to copy). Flex runouts: IMC
  caps flexible air *connectors* at 14 ft; specs typically 5–8 ft; default **6 ft flex +
  spin-in/tap + 2 clamps (+ damper) per diffuser**, editable.
- **Reading duct off the plan [V].** `24 x 12` in plan view means **W = 24 (seen), H = 12
  (unseen)** — confirmed on both drafters in §3.3. Round `12ø`/`12"Ø`; flat oval
  `FO 24x12`; `UP`/`DN`; `BOD`/`TOD` elevation notes; `SA/RA/EA/OA`; line type per legend.

### 5.2 Piping

- **Hanger spacing [C].** MSS SP-58 Table 4 (steel water: 2" = 10 ft, 4" = 14 ft, 6" =
  17 ft; copper: 2" = 8 ft, 4" = 12 ft confirmed; the rest [M]); IPC 2018/2021 Table 308.5
  by material (copper tubing ≤ 1¼" 6 ft, ≥ 1½" 10 ft; steel 12 ft; PVC 4 ft; CPVC ≤ 1" 3 ft;
  PEX ≤ 1" 32 in.; cast iron 5 ft; verticals 10–15 ft); IMC 2021 Table 305.4 (copper tubing
  8 ft, no split at 1¼"); UPC 2021 Table 313.3 (copper ≤ 1½" 6 ft, ≥ 2" 10 ft; steel ≤ ¾"
  10 ft, ≥ 1" 12 ft). **The adopted code is a project setting**, and the three tables
  disagree, so the engine carries all four tables and lets the user pick. Rod diameter per
  UPC 313.6 (3/8" to 1¼", 1/2" 2½–3½", 5/8" 4–5", 3/4" 6", 7/8" 8–12") [C/M]. Clevis BOM per
  hanger: clevis, rod, beam clamp/insert, 2 nuts, washer, + insulation shield (MSS Type 40)
  per hanger when insulated [M].
- **Insulation [C].** ASHRAE 90.1 Table 6.8.3-1/-2 by fluid temperature and NPS. Confirmed:
  steam > 350 °F ≥ 8" → 5.0"; chilled 40–60 °F < 1" → 0.5", larger → 1.0". Heating hot water
  141–200 °F: 1.5 / 1.5 / 2.0 / 2.0 / 2.0" for < 1 / 1–1½ / 1½–4 / 4–8 / ≥ 8" [M]; DHW
  105–140 °F: 1.0 / 1.0 / 1.5 / 1.5 / 1.5" [M]. Quantified as LF by size × thickness,
  **fitting covers per fitting**, jacketing per LF/SF outdoors, shields per hanger.
- **Labor units [C for the definition, V/M for values].** MCAA WebLEM defines a labor unit as
  man-hours to install a foot of pipe, an item, or perform a task (a joint). Public
  examples: 3" Type K copper 0.11 hr press / 0.15 hr braze / 0.13 hr grooved; 3" std-weight
  butt weld 2.0 MH; per-foot rules 1" copper 0.15 hr/LF, 4" no-hub CI 0.35 hr/LF. The
  order-of-magnitude joint grid in Appendix B ships as an editable default; **the MCAA
  values themselves are licensed and are not to be shipped**.
- **Method.** Joint count = Σ(fittings × joints per fitting) + one coupling per stick
  (21 ft steel, 20 ft copper/PVC); or per-foot with fittings as a share of pipe. Every MEP
  estimator (QuoteSoft, AutoBid, FastPIPE, McCormick) structures a pipe assembly as
  pipe LF + couplings per stick + hangers by spacing + insulation + labor per foot or joint.
- **Fittings and allowances [V/M].** Elbows 90/45 LR/SR, tees straight/reducing, reducers
  concentric/eccentric (eccentric flat-on-top on steam/air-vent), unions at equipment,
  flanges ≥ 2½", caps. A size change on the plan is a reducer at the callout change; a
  branch is a tee (wye for DWV); risers are `UP`/`DN`. Un-drawn fitting allowances in use:
  "2 fittings per 20 ft" and "0.05 fittings per foot"; fittings ≈ 35–50 % of pipe LF cost on
  residential rough-in. (The "add 50 % of developed length" rule is a *pressure-drop*
  equivalent-length rule, not a quantity rule, and must not be used for takeoff.)
- **Per-run items [V/M].** Sleeves and firestop **per penetration** (the engine counts wall
  and floor crossings of the polyline; rated vs non-rated from a wall layer or user tag);
  hydrostatic test default 4–8 hr per system + 0.5 hr per 100 LF; flush 2–4 hr per system;
  valves per zone (2 isolation + 1 balancing + 1 strainer per coil) counted from equipment
  connections, not the run.
- **Drafting conventions [V].** Single-line; `2"`, `2½"`, `DN50`; `CHWS/CHWR`, `HWS/HWR`,
  `HHWS/HHWR`, `CWS/CWR`, `RL/RS/RD`, `CD`, `HPS/MPS/LPS`, `PC`, `NG`/`G`; flow arrows;
  the piping material schedule (service → material / joint / class) lives in spec 23 21 13 /
  22 11 16 → a user-editable service→material table.

### 5.3 BAS / controls linear

- **No published "feet of cable per point" figure surfaced.** Published rules: ≈ $450/point
  wiring, $2.50–7.00/ft² installed BAS, labor 50–75 % of installed cost, wiring labor
  15–25 % of a hardwired BAS, cabling $150–500 per device, 5 hr per analog / 3 hr per
  discrete point (process rule) [V]. Engine defaults [M, editable]: **75 ft per hardwired
  I/O point** home-run to the nearest controller, 150 ft per point on large AHU sensors,
  trunk = the drawn daisy-chain polyline.
- **MS/TP trunk [V]:** 22 AWG shielded twisted pair, daisy-chain only, ≤ 4,000 ft per
  segment (some OEMs 2,000 ft), ≤ 32 devices, repeaters beyond.
- **Conduit vs plenum [C/V]:** UFGS 23 09 00 / 23 09 23.02 require IP network cabling in
  conduit; plenum-rated cable in accessible ceilings, conduit in mechanical rooms / exposed /
  below 8 ft. Default conduit share 25 % of cable LF in ¾" EMT, editable.
- **NECA labor units [V]:** ¾" EMT ≈ 5.0 hr per 100 ft; #12 THHN 4.25 hr per 1,000 ft;
  Difficult / Very Difficult columns ≈ +25 % each; default 8–10 hr per 1,000 ft for 18/2–22/2
  plenum cable in open ceiling [M]; ¼" pneumatic poly tubing per foot like cable plus
  fittings per device [M]; 120 V to each panel, #12 in ¾" EMT [M].

### 5.4 General

- **Waste [V]:** copper 5–10 %, cast iron 5–7 %, PVC/CPVC 3–5 %, PEX 5–10 %, hangers and
  small items 10–15 %, duct 10 % (15 %+ lined/field). Sticks 21 ft steel, 20 ft copper/PVC;
  couplings = ceil(L/stick) − 1 (or one per stick, RSMeans-style); hangers = ceil(L/S) + 1,
  minimum 2 per run, + 1 within 2 ft of each elbow/tee for duct; insulation rounded to the
  carton/roll (+1 roll per 500 SF).
- **2D vs 3D [V/M]:** no survey with a specific under-measurement figure was found. Default:
  add vertical length explicitly at every `UP`/`DN` (floor-to-floor or BOD-to-equipment)
  and a **+5–10 % offsets allowance** on horizontal LF where elevations are not drawn; never
  when a 3D model supplied the length.
- **RSMeans assembly composition [V]:** pipe unit lines include couplings and hangers at
  10 ft o.c. with published deducts; duct priced per lb by gauge and pressure class; wrap
  and liner as separate lines; fittings and hangers per each. The engine mirrors this
  line-item shape so a priced export lands where estimators expect it.

### 5.5 Defensible defaults (all editable; provenance carried into the UI)

**Duct run** (per segment W×H or D, L, pressure class, system): gauge =
`lookup(pressure_class, max(W,H))` from the simplified schedule; `lb/LF` per §5.1 × 1.15;
fittings weight = piece perimeter × 1.40; scrap +10 %; hangers = `ceil(L / S) + 1`, S =
10 ft rect (8 ft if half-perimeter > 96"), 12 ft round, 4 ft flex; joints = `ceil(L / 5)`
rect, `ceil(L / 10)` round; insulation SF per §5.1 × 1.10, fittings +20 %; labor = lb ×
0.023 hr or LF ÷ (20 | 40) man-days; per vertex: radius elbow (R/W 1.5), transition (length
4 × Δ, 15–30°), tee/tap, offset = 2 elbows; per diffuser: 6 ft flex + tap + 2 clamps; fire
damper per rated crossing.

**Pipe run** (per segment NPS, material, service, L): hangers = `ceil(L / S[table,
material, NPS]) + 1` with the table chosen per project (MSS SP-58 / IPC / IMC / UPC); rod
per UPC 313.6; shield per hanger if insulated; couplings = `ceil(L / stick) − 1`; waste 5 %
copper/steel, 4 % PVC, 10 % hangers; insulation LF by NPS with thickness from 90.1 6.8.3;
fitting covers per fitting; labor = Σ joints × hr/joint + hangers × 0.25–0.5 hr + insulation
× 0.05–0.1 hr/LF, or the per-LF fallback; per vertex: elbow (2 joints), tee (3), reducer at
Δsize (2), union at equipment, flange pair ≥ 2½"; un-drawn allowance 0.1 fittings/ft on
schematic plans; offsets +5–10 %; per run: sleeves/firestop per crossing, hydro test, flush,
valves per zone from equipment.

**BAS run:** cable LF = trunk polyline or 75 ft/point; conduit share 25 % in ¾" EMT at
5.0 hr/100 ft; pull 4.25 hr/1,000 ft in conduit, 8–10 hr/1,000 ft open plenum; MS/TP
segments ≤ 4,000 ft / 32 devices as a check; 3–5 hr per point or $450/point as a sanity
check.

**Must be user-editable (varies by spec, region, adopted code):** gauge schedule and
pressure class per system; joint type and section length; hanger table, spacing, rod size,
trapeze vs clevis BOM; insulation thickness by service and climate zone, lap and fitting %,
roll size; flex runout length; fitting weight factor, scrap, lb/hr and LF/man-day; stick
length, waste %, joint hours; test and flush hours; sleeve/firestop unit; BAS ft/point,
conduit share, cable labor; the 2D offsets allowance; the hangers-per-10-ft RSMeans option.

**Must be checked against the source before release:** every [M] cell in the SMACNA
unreinforced-gauge table, SMACNA 5-1/5-2 strap/rod columns, MSS SP-58 Table 4 rows other
than the confirmed cells, the non-confirmed ASHRAE 6.8.3 cells, the joint-hour grid, and all
per-run hour defaults.

---
## 6. The algorithms: from PDF paths to a sized, fitted run

Everything in this section is a pure module under `web/src/lib/linear/` (React-free,
DOM-free, typed, tested), consumed identically by the canvas and by `mcp/src/session.ts`.
Nothing here depends on `buildMepGraph`; the two engines share `extractVectorGeometry` and
the text-span layer and nothing else. Coordinates are image px at `RENDER_SCALE`, converted
to feet only at the last step through `uppFor`.

### 6.1 Stage 0 — extend extraction with what the engine needs (`oneclick.ts`)

Two additive changes to `extractVectorGeometry`, byte-identical output for existing
consumers:

- **Dash capture (closes B-L5).** Track `setDash` alongside `setLineWidth` in the graphics
  state stack (`oneclick.ts:429–444`) and emit a per-segment `dash: Uint8Array` code
  (0 solid, else an index into a per-sheet dash-pattern table `dashPatterns: number[][]`).
  Dash phase is not needed; the *pattern* is what the legend keys on (`MP001`: thin solid /
  dashed / heavy solid = existing / demo / new; piping legend keyed by dash pattern).
- **Stroke colour.** Keep `lum` as is and add `strokeRgb: Uint8Array` (3 bytes per segment)
  so a colour-coded system legend (common on Revit exports) is readable. Optional; the
  engine treats colour as a weak signal.

Per-segment identity stays the array index. No new geometry is invented here.

### 6.2 Stage 1 — stroke classification (per sheet, cached, in a worker)

Goal: a per-segment `candidate: Uint8Array` marking strokes that can be part of a routed
run, plus a `family` id, with evidence — never a hard-coded pen.

1. **Exclude** `SEG_CLIP`, `SEG_FILLONLY`, segments inside text boxes (existing
   `texts`/`TextMark` seam), segments on layers classified `annotation` or `finish-pattern`
   (`layers.ts`), hatch rows (`classifyHatchSegs`), and everything `wallnetwork.ts` vouches
   as wall when the layer signal is weak — the same `excludeSegs` composition
   `ensureMepGraph` already builds (`S:3437`).
2. **Family by (pen nibble, dash code, layer, lum, colour).** Histogram the survivors.
   Evidence ranking, highest first: (a) an OCG layer name classified `ductwork`/`piping`/
   `controls` by `classifyMepLayerName` with confidence ≥ 0.85 (Weld: `M-HVAC-DUCT` 3,690
   segs); (b) a legend swatch match — the legend's line samples (`legendlearn.ts`
   `isRoutedSystemCaption` already recognises the captions) give (pen, dash, colour) →
   (system, status) tuples; (c) pen-weight prior — the heaviest stroke family that is not
   wall-vouched and whose segments are long and axis-dominant (Bessemer pen 4, ITD pen 3,
   federal pen 3/4); (d) a size-label anchor — a family whose strokes form parallel pairs at
   a size label's nominal spacing (§3.3) is duct by construction.
3. **Output** `StrokeClasses { candidate, family: Int16Array, families: Array<{ id, pen,
   dash, layer?, system?: MepSystemRole, status?: "new"|"existing"|"demo", confidence,
   evidence: string[] }> }`. Confidence is stated; a sheet whose only evidence is (c) says
   so in every run receipt (`factors: ["family-by-pen-prior"]`), mirroring
   `traceConnectivity`'s `layer-unclassified` factor.

Cost: one linear pass; on the 100k-segment federal sheet this is tens of milliseconds.

### 6.3 Stage 2 — the segment index and the local run graph

- **Segment R-tree per sheet** (a small in-house STR-packed tree or `flatbush`, permissive
  licence, ~10 KB): bounding boxes of candidate segments only. Nearest-segment query for a
  click = box search at the hit tolerance (`11/zoom`, the aim tolerance the snap grid uses)
  then `distToSeg` (`geometry.js:205`). This replaces "no segment spatial index" (§2.5).
- **Endpoint welding** at tolerance `τ = max(0.75 px, 0.02 ft × ppf)` — the arrangement
  weld tolerance (`arrangement.ts:63–95`) scaled by the sheet — using a hash grid, exactly
  like the probe. Welding is *local and lazy*: a node is materialised only when the walk
  reaches it. There is no global noding and no `TopologyException` path.
- **Node typing at the walk frontier.** For the node the walk arrives at, gather incident
  candidate segments (welded ends) and *crossing* segments (interior intersections within
  τ, via `segsIntersect`). Then:
  - `degree 1` → **end** (cap, equipment, sheet edge, or a symbol gap — see 6.5);
  - `degree 2`, deviation < 8° → **collinear join** (dash gap or CAD split); merge;
  - `degree 2`, deviation in [30°, 150°] → **elbow** candidate (angle binned to 45/90 with
    ±6° tolerance, else "custom angle");
  - `degree 3` with one collinear through-pair → **tee** (the through-pair is the main, the
    third is the branch);
  - `degree 4` with two collinear through-pairs → **crossing**, *not* a junction: the walk
    continues straight and the node is recorded as `crossing` (the corpus shows the hidden
    duct's lines broken under the upper duct — a break-and-resume within `bridge` distance
    on the same family is also a crossing, not an end);
  - anything else → **ambiguous**: stop, report the fan of candidates with angles, offer
    them as continuations in the UI.
  The "continue straightest" rule is `arrangement.ts`'s angle-sorted `out[]`, applied
  lazily.

### 6.4 Stage 3 — single-line following (pipe, conduit, single-line duct)

Walk from the seed in both directions (the probe's loop, hardened):

```
walk(seedSeg, dir):
  chain = [seedSeg]; sizeCtx = null
  loop:
    node = frontier(chain.last, dir)          # 6.3 typing
    case end:        stop("dead_end" | "equipment" | "sheet_edge" | "riser") ; break
    case collinear:  extend
    case elbow:      record vertex{kind:"elbow", angle}; extend along the turn
    case tee:        if we ARE the through-pair → record vertex{kind:"tee", branch_at}; extend
                     if we ARE the branch → stop("branch_joins_main")   # the main is its own run
    case crossing:   record vertex{kind:"crossing"}; extend straight
    case ambiguous:  stop("ambiguous", candidates)
    if a size label binds here (6.6) and differs from sizeCtx → record vertex{kind:"size_change"}
    if hops > MAX or length > MAX_FT → stop("cap")
```

Stopping at a tee when arriving from the branch is deliberate: a branch ends at the main;
the main is traced separately. That is what stops the "one click reaches every branch"
behaviour of the BFS and what makes tees count exactly once (on the main's vertex list).
Same-family continuity is required through every node (pen ± 1 nibble, same dash code,
same layer when layered); a family change is an `end` with reason `family_change`.

Curved segments (`SEG_CURVE`) are followed as a chain and collapsed to one arc vertex with
the fitted radius (`markPolylineArcs`' circle fit, `oneclick.ts:640`); length is the arc
length, not the chord.

### 6.5 Stage 3b — double-line duct: pair following and the centreline

Double-line duct is detected, not assumed:

1. **Pair search at the seed.** From the seeded stroke, look for a parallel candidate stroke
   (angle ≤ 2°) at perpendicular offset `d` within `[2 px, 96" × ppf]` on the same family,
   overlapping ≥ 60 % in projection (the `classifyOffsetAnnotationSegs` rule shape,
   `oneclick.ts:1174–1184`). If a size label is already bound, prefer the pair at
   `d ≈ nominal width` (±1.5 px; §3.3 shows agreement within 0.2 px on both drafters).
2. **Follow both edges in lock-step** with the single-line walker, keeping them paired by
   offset; emit the **centreline** (midpoints of matched edge points) as the run geometry,
   and the measured `drawn_width_px` per segment.
3. **Fittings from the pair geometry:**
   - **Transition / reducer**: the two edges converge or diverge over a short length
     (trapezoid); `size_change` vertex with `from`/`to` widths measured from the pair and
     the label on each side.
   - **Radius elbow**: two concentric arc chains (`SEG_CURVE` on both edges) with a common
     centre; vertex `{kind:"elbow", angle, radius_in: r_centre / ppf}`; the run length
     follows the centreline arc.
   - **Mitred elbow**: both edges turn at a point; `{kind:"elbow", angle, mitred:true}`
     (turning vanes are a per-condition assumption, disclosed).
   - **Tee / tap**: a third pair leaves one edge (rectangular tap) or a single line leaves
     (round tap / spin-in); the main's edge is broken on the branch side only — the walk
     bridges the break because the *other* edge is continuous.
   - **End cap**: both edges close (a short perpendicular or a semicircle on round duct).
   - **Diffuser / equipment in-line**: a symbol footprint sitting inside the pair (hatched
     rectangle) breaks both edges for ≤ `bridge` px; bridged as `symbol_gap` and recorded
     (§6.7 attaches the symbol).
4. **Width cross-check.** For every segment, `|drawn_width_in − label_width_in| ≤ 0.5"`
   passes; otherwise the segment's size is `withheld` with both values in the receipt —
   never averaged, never silently taken from either side.

Single-line duct (small residential jobs, schematics) is handled by 6.4 with the label
supplying both dimensions and `drawn_width` absent.

### 6.6 Stage 4 — the size grammar and label association

**Grammar** (Appendix A gives the full regexes; all sizes normalise to inches, fractions
including Unicode `¼ ½ ¾ ⅛ ⅜ ⅝ ⅞`):

| Form | Examples from the corpus | Yields |
|---|---|---|
| Rectangular `W x H` | `12"x6"`, `18X10`, `12 x 8`, `24x14`, `14x3½`, `20"X10"` | `{kind:"rect", w_in, h_in}` — first number is the plan-view width |
| Round | `8"ø`, `10"Ø`, `6Ø`, `12"ø`@270, `24" DIA`, `ø12` | `{kind:"round", d_in}` |
| Flat oval | `24x12 FO`, `FO 24x12` | `{kind:"oval", major_in, minor_in}` |
| Pipe | `2"`, `1-1/2"`, `1½"`, `1 1/4"`, `DN50`, `50mm` | `{kind:"pipe", nps_in}` |
| With system | `4" EA`, `24X14 SA`, `8"Ø EA`, `1" HHWS`, `2 1/2" HHWS`, `3" NG`, `4" RL` | + `system_tag` |
| With direction | `2" SAN UP`, `¾" HW/CW DN`, `1½" V UP/DN`, `4" DN`, `4" RL UP` | + `riser: "up"|"down"|"both"` (a riser marker as well as a size) |
| Multi-service | `¾" HW/CW`, `4" CHWS/R` | one size, two systems → two runs share the geometry (a flag, not a guess) |

**Rejected as sizes (negative grammar):** dimension/elevation text (`48" MAX`, `80" MIN`,
`12" ABOVE`, `BOD 9'-6"`, `48" AFF`), rebar/spacing notes (`#4@12" O.C.`), schedule cells
(inside any `sheet_graph` table bbox), keyed-note prose (`ROUTE 8" DUCT DOWN TO …` — the size
is captured *as a note*, not bound to geometry), legend swatches (inside the legend block).

**Association** — for each candidate label, score each candidate run segment within a
window of `max(6 × text height, 4 ft × ppf)`:

- **Orientation agreement**: the label's `rot` (from `textSpans`) must be parallel to the
  segment (±10°) — vertical pipes carry `@270` labels in every set probed; for the 90°-rotated
  Bldg 5406 set the rule holds relative to the run;
- **Placement**: inside the pair (double-line duct, distance to centreline < width/2) beats
  beside the run (perpendicular distance < 2 × text height) beats leader (`
  leaderTerminalPointsForLabel` chases the annotation-pen leader to the segment it touches);
- **Width agreement** (duct): the pair spacing equals the label's first number (§3.3);
- **Uniqueness**: a label binds to exactly one run segment; a segment takes the nearest
  bound label *along* the run and inherits it until the next bound label, a branch, or a
  transition vertex. Two labels on one segment that disagree → `withheld` with both.

Confidence per bound size = min(orientation, placement, width) with the factors named.
Every size is user-editable; an edit stamps `origin.size_edited:true` and keeps the read
value beside it.

### 6.7 Stage 5 — vertices, symbols, risers, systems, status

- **Vertex kinds** (Appendix A lists the schema): `elbow{angle, radius_in?, mitred?}`,
  `tee{branch_id?}`, `size_change{from, to}`, `crossing`, `riser{dir}`, `equipment{id}`,
  `symbol_gap{id?}`, `end{reason}`, `manual`.
- **Symbols along the run.** With `symbolsweep.matchSymbol(fp, segs, {candidateRegions})`
  windowed on the run's nodes and on the diffusers' hatched footprints (`inlinemotif.ts`
  already fingerprints register/grille motifs), valves, dampers, diffusers and equipment
  that sit on the run are attached as `equipment`/`symbol_gap` vertices with the sweep's
  score. A library of fittings is **not** required for counting fittings; it is required
  only to name in-line devices.
- **Risers.** `UP`/`DN`/`UP/DN` in a bound label, a keyed note bound by leader, or the riser
  glyph (short stub + arrowhead: `controlSchematic.ts:709–741` arrowhead detector; circle
  with stub on plumbing) → `riser{dir}` vertex, with the vertical length left to the run
  parameter (`rise_ft`) or the level table (floor-to-floor), disclosed as `not_drawn`.
- **System.** Priority: bound label suffix (`SA`, `HHWS`) > legend line-type match (pen,
  dash, colour → system, status) > layer name (`classifyMepLayerName`) > condition default
  chosen by the user. Status (`new | existing | demo`) from the legend line-type match when
  the legend was read, else `unknown` — an existing-to-remain duct must never count as new.
- **Crossings vs connections.** A degree-4 node with two collinear through-pairs is a
  crossing; the walk continues straight. A pipe that ends within `bridge` of another pipe's
  interior with no tee glyph is *ambiguous*, reported, never joined. Wall crossings (for
  sleeves/firestop) are computed *after* the run is committed by intersecting the run with
  `networkWallSegs`-vouched faces; counted per run, disclosed as `wall_crossings` with the
  wall layer's role confidence.

### 6.8 Stage 6 — confidence, refusal, receipts

A run's confidence is the minimum over its factors, each named in `origin.trace.factors`:
stroke-family evidence grade; size-binding grade (or `size_missing`); width cross-check;
vertex ambiguity count; bridged gaps; `layer-unclassified`; `scale_unconfirmed`. The
receipt (`origin.trace`) records the seed point, the segment indices walked, the labels
read (with bboxes), the drawn widths, each stop and its reason, and the candidate
continuations at every ambiguous node — the same shape `traceConnectivity` returns today
(`path`, `branches`, `factors`, `reason`). Refusals reuse existing text where it exists
(scale, condition, span) and add: *"No routed linework under the cursor — click on a drawn
duct or pipe line, or switch to manual (M)"*; *"This sheet's linework has no stroke family I
can attribute to ductwork or piping — trace manually, or open Layers to mark one."*;
*"Size withheld: the label reads 12x8 but the drawn width is 16 in. Pick one."* Withholding
is an answer; a withheld size still measures LF.

### 6.9 Raster fallback posture

Scanned sheets get **manual polyline with raster-assisted snapping only**: a local
skeleton (Zhang–Suen thinning on the adaptive-threshold mask `rastermask.ts:303` already
builds) gives snap targets and a one-segment "extend along the ink" assist; no auto-follow,
no size reading, `origin.method:"raster_assisted"`, badged like `raster_traced` rooms. Full
raster line vectorisation (LSD/HAWP/DeepLSD) is a later, model-backed stage on the shared
pipeline under the same disclosure rules as the OCR/VLM assists; it is out of scope for
this plan's phases.

### 6.10 Performance budget

| Step | Where | Budget | Basis |
|---|---|---|---|
| Extraction (already cached per sheet) | main or worker | 25–300 ms | measured, §3.1 |
| Stroke classification + R-tree + endpoint hash | worker, once per sheet, cached with the geometry | < 150 ms at 100k segs | probe: 250–370 ms *including* extraction |
| Click → seed → walk both ways | main thread (pure, synchronous) | **< 10 ms** | probe: 0.6–1.0 ms |
| Label binding for the walked run | main | < 5 ms | window query over the span index |
| Pair following (double-line) | main | < 20 ms | 2× the single walk + pairing |

The whole click-to-proposal path therefore stays comfortably under one frame after the
per-sheet build, which reuses the `netroom.worker.js` pattern and the existing
`netCacheRef` keyed by (sheet, scale).

### 6.11 Literature and prior art the design leans on

The full survey with URLs is `plans/03-research/03-click-to-trace-algorithms-survey.md`.
What it changes or confirms in the design above:

- **Do not use a fully-noded GIS graph as the run graph.** JTS/Shapely `unary_union` +
  `LineMerger` semantics make *every* crossing a node; P&ID digitisation work (PID2Graph's
  explicit "crossing" vs "line ankle" node classes; the "2 or 3 lines leaving = connection,
  4 = pass-through" rule; Prusty et al.'s "crossing non-splitting" merge rule) is the
  literature form of §6.3's crossing rule. The design keeps a per-node *continuation map*
  so an X node carries two independent through-paths.
- **Snap rounding and robust predicates** for determinism: a single-pass snap to a fine
  grid (0.05–0.1 pt) with `orient2d` from `robust-predicates` (Unlicense) makes the output
  independent of segment order and worker timing; iterated snap rounding drifts and is
  avoided.
- **Spatial index:** `flatbush` (ISC; 1M rectangles indexed in ~109 ms on an M1 Pro, index
  in one transferable `ArrayBuffer`) over segment bboxes, with the incremental-neighbour
  exact-nearest-segment pattern; endpoints via `kdbush`. This replaces the 40-per-cell snap
  grid for the click path.
- **Double-line centrelines:** parallel-pair matching first (ArcGIS *Collapse Dual Lines
  To Centerline* semantics — keep left/right ids, warn on nested parallels), straight
  skeleton / Voronoi (d3-delaunay, ISC) only as the fallback for curved or odd outlines.
  The literature's cross-check ("the first number is the dimension you see on the
  drawing") is the rule §3.3 measured.
- **Text association** as a scored assignment with orientation, perpendicular distance,
  along-run offset, style/system agreement and a leader bonus, plus a one-label-per-
  (edge, side) constraint (Rahul et al. nearest-distance rules; Bentley's learned
  association as the ML upper bound we do not need yet). The negative grammar (BOD/TOD/AFF
  elevation callouts, feet-inch dimension strings, "2 TYP") is confirmed as the main
  false-positive class.
- **Hidden vertical fittings:** no literature exists for inferring them from plan geometry;
  the design treats risers/offsets as declared parameters or elevation-callout deltas
  (BOD 9'-6" → 8'-0" ⇒ offset = 2 elbows + |ΔBOD|), surfaced as *inferred* items the user
  accepts — never silent.
- **Raster:** LSD / EDLines (parameter-free, one false alarm on average) over Hough; deep
  detectors were trained for architectural wireframes and vary with their end-parameters
  (IPOL 2024 review); Potrace traces outlines not centrelines and is GPL; opencv.js lacks
  `ximgproc` (thinning) by default. This is why §6.9 keeps raster to assisted snapping.
- **Evaluation:** discrete-Fréchet run matching with length overlap ≥ 80 %, vertex F1 at a
  radius with class agreement (the sAP / R2V junction convention), PID2Graph node AP / edge
  mAP for topology, and stop-reason accuracy. **No public HVAC duct or piping plan takeoff
  dataset exists**; §12 builds one from this corpus.
- **Freedom to operate:** Bentley US 12,406,519 claims ML link-segmentation + keypoint +
  learned label association on image-only schematics; US 8,766,982 covers raster
  vectorisation by global topology (T = one segment extends past, X = both); the Togal
  "Automatic area detection" family covers area QTO. A geometric vector-path follower on
  PDF path data is materially different from all three, but counsel should review before
  marketing claims are written.

---
## 7. Data model

Principle: keep `measure_role:"linear"` (the enum is pinned at `outputs.ts:959`; every
consumer switches on it) and **add a `run` block**. A run with no `run` block is exactly
today's polyline; every existing reader keeps working; every new reader is additive.

### 7.1 The shape record

```jsonc
{
  "id": "shp-…", "sheet_id": "M101.pdf#6", "condition_id": "cond-sa-12x6",
  "measure_role": "linear",
  "verts_norm": [[x,y], …],                     // the CENTRELINE, as today
  "computed": {
    "perimeter_lf": 47.2, "area_sf": 0,          // unchanged semantics
    "run": {                                     // NEW, derived by computeShapeMetrics
      "segments": [ { "i": 0, "lf": 18.2, "size": {"kind":"rect","w_in":12,"h_in":6}, "size_src": "label|carried|drawn|manual|withheld" } ],
      "vertices": [ { "i": 1, "kind": "elbow", "angle_deg": 90, "radius_in": 18, "rule": "turn 90±6" },
                    { "i": 3, "kind": "size_change", "from": {…}, "to": {…} },
                    { "i": 5, "kind": "tee", "branch_shape_id": "shp-…" } ],
      "risers": [ { "i": 6, "dir": "up", "rise_ft": null } ],
      "wall_crossings": 2,
      "totals_by_size": { "rect:12x6": 18.2, "rect:16x8": 29.0 }
    }
  },
  "run": {                                       // NEW, authored state (persisted)
    "system": "SA", "status": "new",
    "size_overrides": { "2": {"kind":"rect","w_in":16,"h_in":8} },
    "vertex_overrides": { "1": {"kind":"elbow","mitred":true} },
    "params": { "rise_ft": 9.5, "offset_allowance_pct": 5, "flex_per_diffuser_ft": 6 }
  },
  "label": "L2 NORTH",
  "origin": {
    "method": "traced",                          // traced | manual | raster_assisted | derived | agent_v1
    "actor": "canvas|agent", "reviewed": false, "proposed_ts": "…",
    "confidence": 0.86,
    "trace": { "seed": [x,y], "segs": [136, 141, …], "labels": [{"str":"12\"x6\"","bbox":[…],"bound_to":0}],
               "drawn_width_px": [36.0, 48.0], "stops": [{"at":[x,y],"reason":"transition"}],
               "candidates": [], "factors": ["family-by-pen-prior"] }
  }
}
```

Rules: `verts_norm` stays the single source of geometry (edit grammar, DXF, marked set,
sync all keep working); `computed.run` is *derived* and healed by `computeShapeMetrics`
(`shapeMetrics.js:16`) whenever geometry, scale, or `run` overrides change — never edited
directly; `run` (authored) survives save/load/sync untouched (passthrough store) and must
be added to `sanitizeShapes` (B-L4), `plays.js` `COND_KEEP`/`MAT_KEEP` equivalents, and
`revisions.js:27,30` / `snapshotDiff.js:26,31` so revision compare sees per-size deltas.

### 7.2 The condition record (a routed-system condition)

```jsonc
{ "finish_tag": "SA 12x6", "color": "…", "line_style": "solid",
  "family": "duct_rect",                 // duct_rect | duct_round | duct_oval | duct_flex | pipe | conduit | cable | tubing
  "system": "SA",                        // the MepSystemRole plus the service tag
  "size": { "kind": "rect", "w_in": 12, "h_in": 6 },   // default size for manual runs; traced runs carry their own
  "assembly_id": "asm-duct-rect-2wg-r6",
  "multiplier": 1, "waste_pct": 10,
  "materials": [ …existing rows, plus basis "vertex" | "run" and hours_per_unit… ] }
```

Sizes live on **segments**, not on conditions, so one condition can carry a whole system
(`SA`) with mixed sizes and the report still breaks LF out per size
(`computed.run.totals_by_size`). Users who prefer one-condition-per-size (the Bluebeam /
STACK habit) get that too — the condition's default size seeds manual runs.

### 7.3 The assembly record

```jsonc
{ "id": "asm-duct-rect-2wg-r6", "family": "duct_rect", "name": "Rect duct, 2\" w.g., R-6 wrap, trapeze",
  "provenance": "…SMACNA 4th ed. / IMC 603.10 / project spec 23 31 13…",
  "per_ft":     [ { "item": "duct_lb", "rate_by_size": "gauge_table:simplified", "factor": 1.15 },
                  { "item": "insulation_sf", "thickness_in": 1.5, "lap_factor": 1.10 },
                  { "item": "hanger", "spacing_ft_by_size": "smacna_5_1", "min_per_run": 2, "bom": "trapeze" },
                  { "item": "joint", "section_ft": 5 },
                  { "item": "labor_hr", "basis": "lb", "rate": 0.023 } ],
  "per_vertex": [ { "kind": "elbow", "item": "elbow", "labor_factor": 1.4 },
                  { "kind": "tee", "item": "tap" }, { "kind": "size_change", "item": "transition" },
                  { "kind": "riser", "item": "riser_set" } ],
  "per_run":    [ { "item": "pressure_test", "hours": 4 }, { "item": "firestop", "per": "wall_crossing" },
                  { "item": "flex_runout", "per": "diffuser", "ft": 6 } ],
  "allowances": { "fitting_weight_factor": 1.40, "scrap_pct": 10, "offset_pct": 5 } }
```

Assemblies are **library records** (the estimator profile, `.otprofile`, already carries
condition templates and a material library — `profile.js:46–57`), seeded with the §5.5
defaults and their provenance strings, fully editable, and referenced by id from conditions.
Resolution (§8) is a pure function of (run, condition, assembly, project settings).

### 7.4 Project settings the math reads

`adopted_hanger_table` (MSS SP-58 | IPC 308.5 | IMC 305.4 | UPC 313.3), `climate_zone`,
`pressure_class_by_system`, `stick_length_by_material`, `level_heights` (already
`sheetLevels.js`), `units` (existing), `offset_allowance_pct` default, and the
`service → material/joint` table. Stored with the project (annotations payload), sanitized
on load, exported in `takeoff_canvas.v1` and `report.v1` as an additive block.

---
## 8. The assembly math, formula by formula

All formulas are evaluated by `resolveLinearAssembly(run, condition, assembly, settings)`
in `web/src/lib/linear/assembly.ts`, returning line items with `{item, qty, unit, basis,
size_key?, source_vertices?, formula, provenance}` — the "assembly audit trail" estimators
ask for (§4.2). Order of operations is fixed and shown in the report:

```
1. per-segment quantities (size-keyed)      → LF by size, surface SF, lb
2. per-vertex quantities                     → fittings by kind and size, joint counts
3. per-run quantities                        → hangers, joints, sleeves, tests, flex runouts
4. allowances (offsets, un-drawn fittings)   → added as their own disclosed lines
5. × condition multiplier
6. waste — REPORT ONLY (order quantities), never on live measured numbers
7. rounding to purchase units — REPORT ONLY (ceil per line, then sum same-name lines)
```

### 8.1 Per foot

- `LF_size = Σ segment.lf` over segments with that size (curved segments contribute arc
  length). Vertical length from risers: `+ rise_ft` per riser vertex when given, else
  `level_height` when the run carries a level, else 0 and the line `riser_length:not_drawn`.
- **Duct weight**: `lb = Σ_size LF_size × perimeter_ft(size) × lbft2(gauge(size,
  pressure_class)) × seam_factor` with `perimeter_ft = 2(W+H)/12` (rect), `π·D/12` (round),
  `π·(a+b)/2/12 × …` (oval, editable); `seam_factor` default 1.15; `gauge()` from the
  assembly's gauge table (§5.1).
- **Duct insulation**: `SF = Σ LF_size × perimeter_ft(size + 2t per dimension) ×
  lap_factor(1.10)`; liner: internal perimeter. Fitting insulation: `+20 %` of straight SF
  *or* per-fitting from 8.2 — one or the other, the assembly says which.
- **Pipe material**: `LF_size`; sticks `= ceil(LF_size / stick_ft)`; couplings
  `= sticks − 1` (or `sticks`, RSMeans option). **Pipe insulation**: `LF_size` at
  `thickness(service_temp, nps)` from the 90.1 table; jacket `LF_size` when outdoors.
- **Cable/conduit**: `LF`; conduit `LF × conduit_share`; per-point allowance when the run
  is a home-run condition: `points × ft_per_point`.
- **Labor per foot**: `hr = Σ LF_size × hr_per_ft(size)` or, for duct, `lb × hr_per_lb`; the
  assembly picks the basis.

### 8.2 Per vertex

For each vertex `v` with kind `k` and the size(s) at `v`:

- `elbow` → 1 × `elbow(size, angle, radius|mitred)`; joints `+ 2` (pipe) / `+ 2` duct
  joints; labor `elbow_labor_factor × straight_equiv` or per-piece hours.
- `tee` (only on the *main*'s vertex list) → 1 × `tee(size_main, size_branch)`; joints
  `+ 3`; the branch run's first vertex is `end{reason:"branch_joins_main"}` and contributes
  nothing — **tees count once**.
- `size_change` → 1 × `reducer|transition(from, to)`; joints `+ 2`; transition length
  `4 × Δ` is deducted from the straight LF only when the assembly says `deduct_fittings`
  (QuoteSoft's Auto Elbow behaviour, off by default; disclosed).
- `riser{dir}` → 1 × `riser_set(size)` (elbow + vertical + elbow, or a drop to a diffuser
  when the next vertex is `equipment{diffuser}`), vertical LF per 8.1.
- `crossing`, `symbol_gap`, `equipment` → no fitting; `equipment` adds the assembly's
  `per_equipment_connection` items (union, flex connector, isolation valves) if defined.
- `manual` → what the user set.
- **Duct joints**: `joints = ceil(LF_size / section_ft) + Σ vertex joints`.

### 8.3 Per run

- **Hangers**: per size-segment group, `hangers = ceil(LF_size / S(table, family, size)) + 1`,
  minimum 2 per run; duct: `+ 1` per elbow/tee vertex beyond 2 ft from the last hanger
  (SMACNA practice, editable); pipe: shields `= hangers` when insulated; BOM expands per
  hanger from the assembly (`trapeze` | `clevis` | `strap`).
- **Sleeves / firestop**: `= wall_crossings` (rated crossings when the wall layer says so;
  otherwise all crossings, disclosed).
- **Tests / flush**: per run, or per system when the condition sets `test_per: "system"`.
- **Flex runouts**: `= diffuser_count × flex_ft` where diffusers are `equipment{diffuser}`
  vertices (or a user count) + a tap + clamps + damper per the assembly.
- **Allowances**: `offset_allowance = LF × offset_pct` (only when no rise data was given);
  `undrawn_fittings = LF × fittings_per_ft` on schematic sheets (condition flag). Both are
  their own lines and never hide inside LF.

### 8.4 Worked example (Bessemer M101, the traced 12x6 → 16x8 supply)

Run: 18.2 ft of `12x6` (probe, §3.5) + transition + 29 ft of `16x8` (label), one radius
elbow, three diffuser taps, one riser at the AHU. Assembly defaults §5.5 (2" w.g.,
simplified gauge → 26 ga both sizes; R-6, 1.5" wrap; trapeze at 10 ft):

| Line | Formula | Qty |
|---|---|---|
| Duct 12x6 | 18.2 × 2(12+6)/12 × 0.906 × 1.15 | 56.9 lb |
| Duct 16x8 | 29.0 × 2(16+8)/12 × 0.906 × 1.15 | 121.0 lb |
| Elbow 12x6 R1.5 | 1 × piece weight × 1.40 | 1 ea |
| Transition 12x6→16x8 | 1 | 1 ea |
| Taps 16x8→ (3 × diffuser) | 3 | 3 ea |
| Flex runouts | 3 × 6 ft | 18 LF flex + 3 spin-ins + 6 clamps |
| Hangers | ceil(18.2/10)+1 + ceil(29/10)+1 + 1 (elbow) | 3 + 4 + 1 = 8 ea |
| Wrap SF | 18.2×2(15+9)/12×1.10 + 29×2(19+11)/12×1.10 | 80.1 + 159.5 = 239.6 SF (+20 % fittings = 287.5) |
| Joints | ceil(18.2/5) + ceil(29/5) + 2 + 2 + 3 | 4 + 6 + 7 = 17 |
| Labor | (56.9 + 121.0 + fittings lb) × 0.023 | ≈ 5.7 hr + fittings |
| Riser | rise_ft not drawn → disclosed | 0 LF, flagged |

Every cell links to the vertex or segment it came from; changing the elbow to mitred or
the spacing to 8 ft re-resolves live. Waste (10 %) and carton rounding appear only in the
Report's order column.

### 8.5 Invariants (tests assert these)

Tees count once; a branch's LF is never double-counted with its main; `Σ LF_size = LF`;
withheld sizes still contribute LF; allowances are separate lines; waste and rounding
change no live number; the same run resolves identically on canvas and MCP (parity test,
like `planToolParity.test.mjs`); resolution is deterministic and pure (golden JSON).

---
## 9. How this ties into the scale engine and the tools already on the platform

### 9.1 Scale: unchanged gate, three extensions

- **Gate.** A traced or manual run refuses without `uppFor(key)` with the existing message
  *"Set the scale for … first."* (`TC:4855`); MCP uses `scaleGate` (`S:1525`). Agent-set
  scales stay `scaleUnconfirmed` and the run's receipt carries `scale_unconfirmed` as a
  factor (§6.8). A run committed under a scale that is later rescaled re-prices through the
  same `replace` command path `rescaleSheet` uses (`TC:4590–4633`) because
  `computeShapeMetrics` re-derives `computed.run` from `verts_norm` and `upp`.
- **Extension A — scale regions (closes B-L6).** A sheet gains optional
  `scale_regions: [{ id, rect_norm, units_per_px, label, source }]` (persisted beside
  `sheets[]`, sanitized on load, exported in `takeoff_canvas.v1`). `uppFor(key, point)`
  resolves the region containing the point, else the sheet scale. Detection: `detectScale`
  already returns `multi`; a follow-up pass associates each detected note with the nearest
  enclosing viewport frame (title text `ENLARGED …`, `DETAIL`, a drawn border) and proposes
  regions — confirm-to-apply like every scale today, with the ruler guide bar drawn inside
  the region. Runs refuse to cross a region boundary (the `SPAN_MSG` idiom) and the
  MCP `scaleWarningFor` is applied to `measure_line` and `measure_surface` (closes B-L2).
  Evidence this is needed: federal p7 (1/4" in a 1/8" set), Bessemer P501 and ITD p7
  (3/8" details), ITD p2 (3/32"), and `multi` set on several sheets (§3.1).
- **Extension B — Check a dimension for runs.** `K` already verifies a printed dimension
  against the scale. A run receipt cross-checks the *drawn duct width* against the label
  (§6.5) — the same idea applied to every double-line run, for free, with the same
  green/amber/red verdict thresholds (`units.ts:146–154`). A mismatch on the first traced
  run of a sheet is surfaced as *"the drawn 12x6 measures 24 in. wide — is the scale
  2× off?"* with a one-tap recalibrate, exactly the K-flow.
- **Extension C — vertical lengths from levels.** `sheetLevels.js` already models levels;
  `rise_ft` on a riser vertex defaults to the level height when the run's sheet carries a
  level and the user chooses "riser to level above/below"; otherwise it stays `not_drawn`.

### 9.2 What each existing tool contributes (and what changes)

| Existing tool / module | Reused as | Change |
|---|---|---|
| `extractVectorGeometry` (`oneclick.ts:339`) | segment source, pen nibble, lum, layers, subpaths, arcs | + dash code, + stroke RGB (additive) |
| `buildSnapGrid` / `nearestSnap` | endpoint snap for manual points | none; the run engine adds a segment R-tree beside it |
| `angleSnap` / `axisLockPoint` | manual-mode ortho lock | none |
| `commitLinear` (`TC:4850`) | the one manual commit gate | gains `run` block and `origin.method` values |
| `applyShapeCommand` / `PROVENANCE_POLICY` | one `add` per trace (one ⌘Z), `geom` edits, `review` ink | + policy rows for `run_edit` (size/vertex overrides) |
| `computeShapeMetrics` (`shapeMetrics.js:16`) | the single pricer, heal + rescale + MCP parity | + `computed.run` derivation |
| `conditionTotals` (`totals.js:66`) | LF, ×N, waste | + per-size buckets, + `vertex`/`run` bases before waste |
| Materials rows + `coverage.js` | rate carrier | + `basis: "vertex" | "run"`, + `hours_per_unit`, + size-keyed rates module |
| `layers.ts` + `LayerPanel` | exclusion + per-layer role overrides | + a *Routed* role (duct/pipe/controls) users can set per layer, feeding §6.2 |
| `mepsystems.ts` | layer-name → system | + `M-CONT-*` → controls tokens (Weld: `M-CONT-STAT` was `unknown`) |
| `legendlearn.ts` (`isRoutedSystemCaption`) | legend captions → line keys | + swatch (pen, dash, colour) capture per caption → the status/system key |
| `symbolsweep.ts` (`matchSymbol` with `candidateRegions`) | in-line devices on a run | none |
| `inlinemotif.ts` | diffuser/grille footprints | none |
| `controlSchematic.ts` (`topologyFor`, arrowheads) | riser glyph + flow arrows | export the arrowhead detector |
| `wallnetwork.ts` (`networkWallSegs`) | wall vouch for exclusion + wall crossings for sleeves | none |
| `transitions.ts` / `deriveTransitions` | precedent for derived runs, withheld lists, one-`add` commit | pattern only |
| `sheetgraph.ts` reference tables | insulation schedule → size-keyed thickness table with cell cites | a reader for `DUCTWORK INSULATION` / `PIPE INSULATION` / `PIPING MATERIAL` tables |
| `netroom.worker.js` | off-thread per-sheet build pattern | a sibling `linear.worker.js` |
| `markedset.js`, `dxf.ts`, `xlsx.js`, `reportColumns.js` | outputs | + sizes on chips/labels, + per-size rows, + fittings/hangers tab, + `-LINEAR-<SIZE>` DXF layers |
| `revisions.js` / `snapshotDiff.js` | bid-revision compare | + per-size and fitting fields |
| Profile `.otprofile` | assembly library + rate tables | + `assemblies`, `rate_tables` sections |
| `agentTools.js` / `agentLoop.js` | in-app agent | + `trace_run`, `propose_runs` (§11) |
| `takeoffWorkflow.js:220` | goal router | LF goals → `linear_run` workflow instead of `scale_refuse` |

### 9.3 What is explicitly *not* on the shared path

Hover highlighting of the candidate run, the size chip under the cursor, the accept
keypress, the run-properties panel, and the Report tab layout are canvas chrome. Everything
that decides a length, a size, a vertex, a quantity, or a refusal lives in
`web/src/lib/linear/*` and is imported by both `TakeoffCanvas.jsx` and `mcp/src/session.ts`
— the AGENTS.md pre-change gate applies to every function in this plan.

---

## 10. Canvas UX and the report

### 10.1 The Linear tool, extended (not replaced)

- `L` arms Linear as today. A **Trace** toggle (`T`, on by default on vector sheets, disabled
  with a tooltip on raster sheets) switches the click semantics:
  - **Manual** (today's flow, plus industry conventions): click per vertex, double-click /
    Enter to finish, Backspace removes the last point, Shift forces ortho, 45° lock on, snap
    to endpoints and *now also to segments and intersections*; a **Continue** mode keeps
    recording after finish (Esc leaves); right-click a segment → *Curve* (existing arc
    switch) or *Set size…*.
  - **Trace**: hovering a routed stroke highlights the whole candidate run (both edges and
    the centreline for duct) with its read size and system in the chip (`12"x6" SA ·
    18.2 LF · 1 elbow · transition ahead`); click stages the run as a **dashed proposal**;
    a second click on an adjacent run extends the selection; Enter accepts. Refusals appear
    in the chip and drop the tool into manual with the seed point kept.
- **Size and system entry.** The condition supplies defaults; a traced run shows the read
  size with an accept keypress (`Q`, the Canaveral convention) or a type-over. Per-segment
  size edit from the selection readout (the MEASUREMENTS tally already lists runs; it gains
  per-segment rows with size). A size change typed mid-run inserts a `size_change` vertex.
- **Vertices.** Selected runs show vertex glyphs by kind (elbow ∟, tee ⊤, reducer ▷,
  riser ⊙, crossing ×, ambiguous ?). Clicking a glyph cycles its kind or opens the fitting
  menu; the rule that fired is shown (*"turn 90° ± 6 → elbow"*). An ambiguous node offers
  its candidate continuations as clickable arrows.
- **Rise/drop.** A riser vertex asks once per run for `rise_ft` (default from the level
  table) — never added silently, never on double-click (the STACK failure mode).
- **Review posture.** Traced runs are pencil (`reviewed:false`, dashed, their own colour)
  until the Accept pill inks them, exactly like One-Click and Transitions. The receipt is
  one click away (*why this run stopped here*). Confidence < 0.6 runs are grouped under a
  *Needs review* header in the Takeoffs panel.
- **Chip amber.** The 12′ roll-width amber does not apply to routed conditions.

### 10.2 Takeoffs panel and Report

- **Per-condition rows** stay; each routed condition expands to **per-size rows** (LF,
  fittings by kind, hangers, insulation SF, labor hr) live as you draw — the "per-size
  legend with live aggregation" no vendor documents (§4.3 item 7).
- **Report** gains a *Linear runs* tab (per run: sheet, system, size sequence, LF,
  vertices, hangers, insulation, labor, confidence, reviewed) and a *Fittings & supports*
  tab (by size and kind); the frozen 13 CSV columns are untouched; `report.v1` gains an
  additive `linear_runs` block mirroring `roll_goods`; XLSX gets the two tabs; the marked
  set burns the size onto each run's chip and draws vertex glyphs; DXF writes one layer per
  size (`OT-SA-LINEAR-12x6`).
- **Buy list.** Materials rows on `linear`, `vertex`, `run` bases resolve through the
  existing ceiling rule into order quantities; waste and rounding appear only there.
- **Revisions.** Per-size LF and fitting counts diff between revisions.

### 10.3 Agent panel

The in-app agent gets `trace_run` (find-only, stages proposals) and `propose_runs`; its
system prompt learns the standard finish for a routed system: read the legend → classify
strokes → trace mains → trace branches → bind sizes → resolve assembly → export. Every
proposal lands in the same Accept gate.

---

## 11. MCP and agent surface

New verbs (each needs a `TOOL_STAGES` row, an `outputs.ts` schema, a `mcp/README.md` row, a
`docs/MCP.md` line, and the tool-count bump in five places — AGENTS.md sync list):

| Verb | Stage | Input | Output | Notes |
|---|---|---|---|---|
| `classify_strokes` | setup | `sheet` | families with evidence, counts, legend key read | read-only; disclosed factors |
| `trace_run` | measure | `sheet`, `at`, `options{stop_at_branch, stop_at_size_change, continue_into_main, system?}` | the run (centreline, segments with sizes, vertices, receipt), `withheld[]`, `candidates[]` | FIND-ONLY unless `commit:true` + `condition`; commits pencil (`reviewed:false`) |
| `measure_line` (extended) | measure | + `size?`, `system?`, `vertices?` | as today + `computed.run` | fixes B-L1/B-L2 |
| `resolve_linear_assembly` | measure | `shape_id` or `condition` | line items with formulas and provenance | pure, deterministic |
| `edit_run` | revise | `shape_id`, `size_overrides?`, `vertex_overrides?`, `params?` | the re-priced shape | refuses inked shapes like `edit_shape` |
| `edit_condition` / `edit_materials` (extended) | revise | `family`, `system`, `size`, `assembly_id`; rows with `basis: vertex|run`, `hours_per_unit` | as today | |
| `set_scale_region` | setup | `sheet`, `rect`, one of label/upp/calibrate | region record | confirm-to-apply, `scaleConfirmed:false` for agents |
| `export_report` (extended) | handoff | — | + `linear_runs` block | additive |

The `initialize` instructions gain one step in the standard finish: *"for routed systems,
`classify_strokes` → `trace_run` the mains, then the branches → `resolve_linear_assembly` →
review with `view_sheet overlay:true`."* Doctrine additions for `docs/AGENT_GUIDE.md`: a
withheld size still measures; a run never crosses a scale region; the agent never sets
`rise_ft` it did not read from a level table or a callout.

---

## 12. Verification: ground truth, metrics, gates

### 12.1 Ground truth (a new corpus track, `opentakeoff-corpus/ground_truth/linear/`)

- **Real sheets, hand-traced** by an estimator in the canvas (manual mode, sizes typed,
  vertices marked), exported as `takeoff_canvas.v1`, pinned with the adjudication protocol
  `bench/pin-goldens.mts` already enforces. Target: ≥ 8 sets × ≥ 2 sheets: Bessemer M101 /
  P101 (Revit, sparse labels, double-line), ITD p3/p4/p5 (AutoCAD, dense, 3/16"), federal
  p4/p6/p7 (182-label duct sheet, hydronic, mixed scale), Weld p7 (OCG layers), Baker p38
  (1/8"), Bldg 5406 M-101/P-101 (whole sheet rotated), navfac (75-sheet stress), plus the
  10 hardest synthetic cases from Appendix E rendered to PDF with a CAD-like exporter
  (truth by construction, like `bench/corpus/*.json`).
- **Per run:** ordered vertices (page pt), vertex kinds, size string per sub-run, system,
  status, stop reason, and the labels that justify each size (bbox cites).
- Double-blind re-trace on 20 % to measure annotator agreement; the agreement bound is the
  ceiling any metric is reported against.

### 12.2 Metrics (macro-averaged per sheet; all reported together, regressions included)

| Metric | Definition | Gate (ship) |
|---|---|---|
| Run recall / precision | predicted ↔ truth by discrete Fréchet < 2 pt and length overlap ≥ 80 % | ≥ 0.90 / ≥ 0.95 on vector sets |
| Length error | Σ\|L_pred − L_gt\| / Σ L_gt on matched runs, and total-LF error per sheet | ≤ 2 % per sheet |
| Size accuracy | exact and length-weighted; "no label" vs "wrong label" separated | ≥ 0.95 length-weighted; wrong-label ≤ 1 % |
| Vertex / fitting F1 | match within 5 pt with kind agreement | ≥ 0.90 elbows/tees; ≥ 0.85 reducers |
| Stop-reason accuracy | branch / size change / equipment / edge / ambiguous | ≥ 0.90; **over-tracing ≤ 2 %** |
| Withheld correctness | withheld sizes/runs whose truth is genuinely ambiguous | ≥ 0.80 (refusals must be right) |
| Determinism | identical output across segment shuffles, 90° rotation, translation, uniform scale, worker timing | 100 % |
| Assembly parity | canvas vs MCP resolution of the same run | byte-identical |
| Performance | per-sheet build, click-to-proposal | < 400 ms at 100k segs (worker); < 16 ms click |

### 12.3 Gates in CI

`npm run bench:linear` joins `check` alongside `bench` (One-Click IoU): pinned goldens +
synthetic truth; a results JSON must match. Unit suites: `web/test/linear/*.test.ts`
(grammar, association, stroke classes, walker, pair follower, assembly resolver, invariants
§8.5), `mcp/test/linearParity.test.ts`, extended `totals`, `shapeMetrics`, `reportColumns`,
`report-csv-golden` (frozen 13 unchanged), `xlsx`, `revisions`, `importTakeoff`, `store`
sanitize, `staging` partition, `check-tool-count`. Corpus runs report takeoff, reference
and graph metrics together with the new linear metrics — never the targeted metric alone
(AGENTS.md).

---

## 13. Phased roadmap

Each phase ends with a measured acceptance line, not with code existing. Estimates are
engineering-weeks for one engineer who knows this codebase; verification time is included.

| Phase | Scope | Acceptance | Est. |
|---|---|---|---|
| **0 — Hygiene (first)** | Fix B-L1/B-L2 (pencil + scale warning on `measure_line`/`measure_surface`); B-L3 doc drift; B-L4 shape sanitizer; add dash + RGB capture (B-L5) behind byte-identical tests; route LF goals off `scale_refuse` | MCP tests + `check` green; `import_takeoff` of an agent line lands dashed | 1 |
| **1 — Manual runs with sizes** | `run` block in the schema; `computeShapeMetrics` derives `computed.run`; per-segment size entry; vertex kinds from angles in manual mode; per-size totals in panel/Report/XLSX/CSV (additive); segment + intersection snap; industry keyboard flow; 12′ amber off for routed conditions | Estimator traces Bessemer M101 by hand in < 10 min with sizes; per-size LF reconciles to a hand takeoff within 1 % | 3 |
| **2 — Assemblies** | `linear/assembly.ts` + rate tables with provenance; `basis: vertex|run`, `hours_per_unit`; profile library; Report tabs; `resolve_linear_assembly` MCP; worked example §8.4 as a golden | Golden JSON for §8.4; parity test; buy list rounds only in Report | 3 |
| **3 — Trace engine, single-line** | Stage 0–4 for single strokes: stroke classification, R-tree + lazy welding, node typing, walker, size grammar + association, receipts, refusals; worker build; MCP `classify_strokes`, `trace_run` (find-only) | Bessemer P101 and federal p6: run recall ≥ 0.85, length error ≤ 3 %, over-trace ≤ 3 %; click < 16 ms | 5 |
| **4 — Double-line duct** | pair following, centreline, width cross-check, transitions/elbows/taps/caps from pair geometry, symbol gaps, diffuser attachment; scale-check surfacing | Bessemer M101, ITD p3/p4, federal p4: size accuracy ≥ 0.95 length-weighted; vertex F1 ≥ 0.85; §12.2 gates on the full linear corpus | 5 |
| **5 — Legend, layers, status, risers** | legend swatch capture → system/status; Routed layer role; `M-CONT-*`; riser glyphs + `UP/DN`; level-table rise; wall crossings for sleeves; system priority rules | Weld p7 systems from layers; Bessemer statuses from legend; existing-to-remain never counted | 3 |
| **6 — Scale regions** | `scale_regions`, `uppFor(key, point)`, detection proposals, region refusal, MCP `set_scale_region`, K-flow inside regions | federal p7 and ITD p7 measure correctly inside enlarged plans; cross-region runs refuse | 2 |
| **7 — Agent + BAS linear** | `propose_runs`, agent standard finish; BAS conditions (cable trunk, home-run per point, conduit share, tubing) tied to the points register (per-point counts already exist); `bas_engine` mirror only if source-cited discipline is required | Agent traces a system on Bessemer end-to-end into a priced report with receipts; BAS cable LF per controller from a traced trunk | 3 |
| **8 — Bench + hardening** | `bench:linear` in `check`; annotator-agreement study; determinism property tests; perf on navfac 75 sheets; docs sync (README, USER_GUIDE, AGENT_GUIDE, MCP.md, CHANGELOG, tool counts) | All §12.2 gates green in CI; docs and counts in sync | 2 |
| *(later)* | Raster assisted snapping (§6.9); fitting-first mode (FastEST/QuoteSoft paradigm); elevation-callout offset inference; flow arrows | — | — |

Dependencies: 1 → 2 → (3 → 4 → 5) with 6 in parallel after 1; 7 after 3; 8 last. The first
demonstrable estimator value is at the end of Phase 2 (about seven weeks): manual sized runs
with a real, cited assembly resolution — already ahead of Bluebeam/STACK/PlanSwift on
fittings and hangers. The moat items (§4.3) land in Phases 3–6.

### 13.1 Risks and how the plan bounds them

| Risk | Bound |
|---|---|
| Stroke families are ambiguous on a set (duct pen = wall pen) | evidence grading + Layers panel override + label-anchored families; refusal with a named reason, manual mode always available |
| Dense AutoCAD duct breaks edges every few feet (ITD) | pair following + symbol-gap bridging; measured in Phase 4 gates |
| Labels sparse (Revit small jobs) | size carried along the run; `withheld` still measures LF; user sets the size once per run |
| Standards cells unverified ([M]) | shipped as editable defaults with provenance strings; release checklist in §5.5 |
| Licensed labor tables (MCAA, Wendes, SMACNA) | never shipped; order-of-magnitude defaults + user import of their own licensed tables |
| Patent overlap | geometric, vector-path design; counsel review before marketing (Appendix E) |
| Scope creep into a 3D router | vertical lengths are declared or read, never routed; `bas_engine` stays "not a cable-routing solver" |
| Performance on 350k-segment sheets | per-sheet build in a worker with the existing segment ceiling/budget pattern; lazy welding; the click path never touches the whole sheet |

---

## 14. Open decisions for the user

1. **One condition per system with per-segment sizes (recommended) vs one condition per
   size.** The plan supports both; the default seed conditions and the agent's habit
   follow the choice.
2. **Deduct fitting lengths from straight LF** (QuoteSoft Auto Elbow behaviour) — off by
   default in the plan; a per-assembly switch.
3. **Adopted hanger table default** (MSS SP-58 vs IPC vs IMC vs UPC) — plan default MSS
   SP-58 for mechanical piping, IPC for plumbing; project setting overrides.
4. **BAS linear in the Python engine or the TS assembly module** — plan recommends TS only
   unless BAS deliverable-scope claims must cite it.
5. **Whether to open the corpus mandate** (`NEXT_GOAL_LOOP.md:179` "No duct-LF scope
   creep") formally, and where the linear ground-truth track sits relative to the schedule/
   points goal loop.
6. **Which licensed labor source, if any, to integrate via user import** (MCAA WebLEM,
   Wendes, SMACNA) so priced exports carry the estimator's own units.

---

## Appendix A — Size and system grammar (normalised; all sizes to inches)

Pre-normalisation: `× → x`, `Ø ⌀ %%c → ø`, `″ ” → "`, `½ ¼ ¾ ⅛ ⅜ ⅝ ⅞ → 1/2 …`, collapse
spaces, uppercase system tokens, join baseline fragments (`joinHyphenatedTags`).

```
ELEV   \b(BOD|BOP|TOD|TOP|COD|COP|CL|IE|INV|FFL|AFF|EL|ELEV)\b | ^\d+'-\d+ | \b(MIN|MAX|O\.?C\.?|TYP|ABOVE|BELOW)\b   → reject as size (keep as note)
RECT   ^(\d{1,3}(?:\.\d+)?)"?\s*x\s*(\d{1,3}(?:\.\d+)?)"?(?:\s*(FO|F\.O\.|FLAT OVAL))?(?:\s+(SYS))?(?:\s+(UP|DN|DOWN|UP/DN))?$
ROUND  ^(?:ø\s*)?(\d{1,3}(?:\.\d+)?)"?\s*(?:ø|DIA\.?|DIAM|RD|ROUND)(?:\s+(SYS))?(?:\s+(UP|DN|DOWN|UP/DN))?$
PIPE   ^(?:(SYS)\s+)?(\d{1,2})?(?:[ -]?(\d)/(\d{1,2}))?"(?:\s+(SYS(?:/[A-Z]{1,5})?))?(?:\s+(UP|DN|DOWN|UP/DN|VTR))?(?:\s+(TO|FROM)\b.*)?$
       | ^(DN|NPS)\s*(\d{2,4})$ | ^(\d{2,4})\s*mm$
SYS    SA|RA|EA|OA|MA|TA|GEX|CHWS|CHWR|HWS|HWR|HHWS|HHWR|CWS|CWR|CW|HW|HWC|RL|RS|RD|CD|HPS|MPS|LPS|PC|NG|G|SAN|V|W|ST|GEX  (project legend extends)
NOTE   ROUTE .* (\d+"?(x\d+"?)?|\d+"ø) .* (UP|DOWN|DN) …   → riser note with size, bound by leader only
```
Multi-service (`HW/CW`, `CHWS/R`) yields one size and a `systems[]` of two; the run is
flagged `shared_geometry` and counts once per system only when the user confirms.

**Vertex schema:** `{ i, kind: elbow|tee|size_change|crossing|riser|equipment|symbol_gap|end|manual,
angle_deg?, radius_in?, mitred?, from?, to?, dir?, id?, reason?, rule: string, confidence }`.

## Appendix B — Default tables

The full tables with provenance grades and URLs are in
`plans/03-research/02-mep-linear-estimating-math-and-standards.md`: galvanized lb/ft² by
gauge (verified), the simplified gauge schedule, the SMACNA unreinforced-gauge
reconstruction [M], duct hanger spacing by size class, MSS SP-58 Table 4 (confirmed cells
bold), IPC 308.5, IMC 305.4, UPC 313.3, UPC 313.6 rod sizes, ASHRAE 90.1 6.8.3 thickness
grid, the MCAA-style joint-hour grid [M], BAS cable/conduit/NECA units, waste factors, and
the "defensible defaults" list. Each table ships as JSON under
`web/src/lib/linear/tables/` with `{ value, grade: "C"|"V"|"M", source }` per cell.

## Appendix C — Probe scripts (to be turned into fixtures)

`plans/03-research/probes/probe.mts` (per-page segments, pens, layers, scale, label classes, MEP graph
stats), `probe-nograph.mts`, `spans.mts` (span dump with rotation), `ductwidth.mts` /
`ductwidth2.mts` (parallel-pair spacing vs label), `trace-proto.mts` (pen-filtered chain
walk), `layers.mts` (OCG names → MEP/role classification), `render.mts` (page and region
PNGs). All run from `opentakeoff/mcp` with `node --import tsx` against
`samples/bessemer-mechanical-bidset.pdf` and `opentakeoff-corpus/raw/*.pdf`; their outputs
are the numbers in §3.

## Appendix D — Competitive research

`plans/03-research/01-competitor-linear-takeoff-analysis.md`: product-by-product findings
with URLs, the two comparison matrices, best-in-class per capability, the gaps, UX
conventions, and the explicitly unverified list.

## Appendix E — Algorithms survey

`plans/03-research/03-click-to-trace-algorithms-survey.md`: noding and snap rounding,
P&ID digitisation literature (Digitize-PID, PID2Graph, Prusty et al.), double-line
centreline methods, text association scoring, browser spatial indices with benchmarks,
path-following rules, raster detectors and their limits, product prior art and patents
with a freedom-to-operate note, evaluation protocols and datasets, the recommended
pipeline, and the ten hardest test cases.

## Appendix F — Bugs to file now (independent of this plan)

B-L1 `measure_line`/`measure_polygon` omit `reviewed:false`; B-L2 `measure_line`/
`measure_surface` skip `scaleWarningFor`; B-L3 README/FEATURES "Curved Line" drift; B-L4 no
shape sanitizer on load; B-L5 `setDash` not captured; B-L6 one scale per sheet with no
refusal on enlarged plans; plus `mepsystems.ts` lacks `M-CONT-*` controls tokens (Weld p7
`M-CONT-STAT` → unknown).
