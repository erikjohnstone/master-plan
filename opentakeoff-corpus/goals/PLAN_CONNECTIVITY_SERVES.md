# Goal: which equipment a drawn symbol connects to, from the drawing itself

Opened 2026-09-15. Not complete. Written for a Sonnet 5 session to execute
end to end under `AGENTS.md` (coordinator alone, no subagents, shared path
first). Everything in "Where we actually are" was measured on this date on
a fresh checkout of `main`, not recalled.

## Why

`sweep_schedule_row` / `reconcile_schedule_plan` already answer *is this
scheduled tag drawn on a plan, where, and how many* (MATCH / SCHEDULE_ONLY /
PLAN_ONLY / AMBIGUOUS). That is the schedule-row half and it is not what this
goal is about.

The unanswered half is the **drawing** half: an estimator looks at a supply
register `SR-1` sitting in a 16"x8" duct and knows, from the duct, that it is
fed by `HP-1`; looks at a thermostat `T` on a dashed line and knows it controls
`EBB-1`; looks at `CD-1 / 140` on NAVFAC sheet MH101 and knows which of
`VAV-A101…A114` feeds it. No schedule says any of that. The platform today
cannot say it either unless a human clicks a point on the exact duct line and
hands the tool the equipment placements to look for. That is a demo, not a
takeoff.

Concretely, on the sets already on disk (rendered and looked at 2026-09-15):

- `samples/bessemer-mechanical-bidset.pdf` p6: a 12"x6"→16"x8" double-line
  supply duct with two inline `SR-1` registers runs straight into `HP-1`'s own
  drawn box; a 6"ø branch drops to a third `SR-1`; `TG-2` return grilles are
  named by leader arrows; thermostats `T` connect to `EBB-1` / `EBB-2` by
  dashed control lines; `EF-1` rises on a 4" EA line. Every one of those is a
  relation the schedules do not carry.
- `raw/itd-d1-lab-mechanical.pdf` p4: hexagon tags (`HEV 1`, `EF 1`, `CH 1`)
  point by leader at their bodies; a 12"ø main with `EQ.19` / `EQ.10` taps
  turns a corner and drops through `HEV-1` into `EF-1`.
- `raw/navfac-cherry-point-atc-mechanical.pdf` p6 (MH101, "FIRST FLOOR
  MECHANICAL DUCTWORK PLAN - AREA A"): 14 VAV boxes, 4 FCUs, and ~100 air
  devices (`CD-1`, `CD-2`, `RG-6`, `EG-1`, …, each with an airflow value) on
  one sheet, all joined by double-line duct. This is the production shape of
  the question.

## Objective

Given a drawn device (a diffuser, grille, valve, damper, thermostat, sensor)
or its tag on a vector plan sheet, the platform names the equipment it
connects to — **through the sheet's own drawn linework, never by
proximity** — with the walked path as the citation, or refuses with a named
reason. It does this with **no human seed point**: device placements the
platform already finds (`symbol_sweep`, `sweep_schedule_row`,
`count_marks`, `find_legend_symbols`) are the inputs, and the answer lands on
the shared path (`Session` + browser parity) as a `served_by` relation the
takeoff can carry.

## Where we actually are (audit, 2026-09-15)

There are **four** separate pieces of code that touch this question. None of
them produces a `serves` relation, and two of them are parallel
implementations of the same graph.

### 1. `web/src/lib/mepconnectivity.ts` + `trace_connectivity` — the primitive that exists

This is the thing the question is about, and the answer to "is
MEPconnectivity for that" is: **yes, that is exactly what it was written
for, and it is a v1 primitive, not a resolver.** Honest, tested, and narrow.

What it does: `buildMepGraph` nodes a sheet's flat segment list with the
vendored JTS port (`UnaryUnionOp`, same pattern `polyarr.ts` uses), then
re-splits the ORIGINAL segments at the junctions JTS found so every edge keeps
its source segment and MEP system tag. `traceConnectivity` BFS-walks from a
seed point to caller-supplied equipment placements and returns `reached` /
`ambiguous` / `dead_end` / `refused`. Wired in three places, all in parity:
`mcp/src/session.ts:3413` (`ensureMepGraph`, cached per sheet) and `:3485`,
`mcp/src/tools.ts:384`, `web/src/pages/TakeoffCanvas.jsx:7024`.

Measured today (fresh `npm ci`, `main`):

| check | result |
|---|---|
| `web/test/mepconnectivity.test.ts` | 28/28 |
| `mcp/test/tools.test.ts --test-name-pattern=trace_connectivity` | 12/12 |
| `mcp/scripts/mep-trace-eval.mjs ../../opentakeoff-corpus bessemer itd-d1-lab` | 3 real cases, reach 100% (2/2), refusal 100% (1/1), false-confident 0 |

Three real cases is the entire real-world evidence base. Every other number
in `docs/MEP-CONNECTIVITY-EVAL.md` is a synthetic fixture.

What it cannot do, from the code and its own comments, not from opinion:

- **Needs a human.** `from` must sit ON a drawn line (`DEFAULT_SEED_TOL_FT =
  1.0`, `mepconnectivity.ts:377`); it never derives a seed from a device
  symbol. `equipment[]` must be passed in; it "does not discover symbols
  itself" (`tools.ts:384` description). The agent-loop verifier
  (`web/src/lib/agentVerifiers.js:34`) exists because models kept seeding at
  the equipment and "reaching" it in 0–2 hops.
- **Every crossing is a junction.** JTS noding splits two lines that cross at
  an interior point into a real 4-way node, so a return duct crossing a supply
  duct traces as connected. Disclosed as limitation #22 and pinned as current
  behaviour by `tools.test.ts:2033`. On a real ductwork plan this is the
  dominant false-connection mechanism.
- **No line style.** `extractVectorGeometry` (`web/src/lib/oneclick.ts:339`)
  carries curve/clip/fill bits and pen width in `meta`, but never `setDash`.
  A dashed control line (thermostat → heater on Bessemer p6) is
  indistinguishable from a solid duct wall; if the CAD export exploded the
  dashes into short segments they are simply gaps. Controls relations are
  therefore unreachable today.
- **Walks duct walls, not ducts.** A to-scale double-line duct is two parallel
  edges; the trace works on Bessemer only because end-cap strokes happen to
  join the walls at the unit. `MEP-CONNECTIVITY-EVAL.md` says so itself
  ("one data point, not a general claim").
- **System tags need PDF layers.** `mepsystems.ts` classifies by layer name.
  On an unlayered export (Bessemer, ITD, most of the corpus) every edge is
  `unknown`, and `layer_signal: "none"` multiplies every confidence by 0.6
  and falls back to `wallnetwork.ts` heuristics to keep walls out.
- **One sheet, one representative branch, 60 hops** (`DEFAULT_MAX_HOPS`,
  `:376`). No match-line continuation, no flow direction, no ports: an
  equipment "placement" is a single point snapped to the nearest edge.
- **Gap bridging only through caller-supplied fittings** (`DEFAULT_BRIDGE_FT
  = 2.0`, `:384`).

### 2. `web/src/lib/symbollabels.ts` — tag → symbol body (exists, decent)

`labelPlacements` (`:896`) assigns a drawn tag to a swept symbol placement
either by adjacency or by chasing a dark leader line (`chase`, `:604`,
`LEADER_HOPS = 4`, `LEADER_HOP_PX = 14`, `LEADER_JOIN_PX = 3`) to its
terminal (`leaderTerminalPointsForLabel`, `:739`). 77 unit tests pass; it is
exercised by the 47-case symbol-sweep corpus (external `HVAC BAS Benchmark
Collection`, see `docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md`) and surfaced on the
wire as `attachment_via: "adjacent" | "leader"` (`mcp/src/outputs.ts:78`).
`taggedVectorGrounding.ts` (`groundExactTagsToVectorGeometry`, `:118`) builds
on it for exact-tag installed quantity.

This answers *which drawn body does this tag label*. It does not answer
*which equipment does that body connect to*. Its leader chase is a 4-hop
walk over dark ink, not a graph — it should become a consumer of the graph
in this goal, not stay a second traversal.

### 3. `web/src/lib/controlSchematic.ts` — a second, different topology builder

`topologyFor` (`:586`) builds its own noded graph for schematic and riser
regions: O(n²)-bounded intersection with a spatial grid, refuses above
`MAX_TOPOLOGY_SEGMENTS = 40_000` (`:314`), and — this is the part
`mepconnectivity.ts` lacks — treats an interior crossing as
`unresolved_crossing` unless `hasJunctionMark` (`:559`, a compact dot of ≥5
short strokes in ≥3 quadrants) vouches for it, and detects arrowheads to set
edge `direction`. Instrument tethers are "explicit I/O token plus collinear
vector tether" (`tetherEvidenceFor`, `:778`).

So the repository already holds the right crossing semantics — in the wrong
module, on a graph the plan-sheet trace never sees. Two graph builders with
different junction rules is precisely the fork `AGENTS.md`'s pre-change gate
forbids on the shared path.

### 4. L3.5 `vector_topology` — cost without an answer

`vectorTakeoffPipeline.ts:444` (`runL35Topology`) runs `buildMepGraph(segs,
{})` — no exclusions, no layers — on every plan/demolition/unknown sheet of
every compiled set and stores only `{nodes, edges, layer_signal,
quant_grid_px}`. The only consumer, `topologyConsumer.ts` `enrichSystemTags`,
regex-matches the tag string and never reads the graph. The takeoff pays for
noding every plan sheet and gets nothing connectivity-shaped back.

### What does not exist anywhere

- A `serves` / `served_by` relation: no type, no wire field, no key file, no
  eval, no test. The only "serves" evidence the platform has is the `SERVED`
  column read off schedules (`sheetgraph.ts:770`), which is schedule text.
- Device ports: no notion of where linework attaches to a symbol.
- Duct centerlines: no polygonize/skeleton step; nothing in the tree collapses
  a double-line duct to one edge.
- Line-style provenance on segments.
- Any scored case of "device D is served by equipment E" on a real sheet.

## Open-source survey (2026-09-15) — what exists, what to take

Searched and read (where the proxy allowed) before deciding. Verdicts are
about THIS repo: TypeScript shared path, vector-first, refusal doctrine, no
new ML without a corpus reason.

| project | what it actually does | license / lang | verdict |
|---|---|---|---|
| **JTS via `jsts`** (already vendored, `web/node_modules/jsts/org/locationtech/jts/`) | Noding (in use), `operation/linemerge` (LineMerger), `operation/polygonize` (Polygonizer), `triangulate` (Delaunay/Voronoi builders), `operation/buffer`, `index/strtree` — all on disk today, unused for this problem beyond noding | EDL-1.0 OR EPL-1.0, JS | **Use.** Duct outline → Polygonizer → Voronoi/medial axis is the double-line centerline route with zero new dependencies. |
| **NetworkX** | Graph algorithms over a graph you already built. Nothing about drawings, PDFs, noding, crossings, styles or leaders. The BFS in `traceConnectivity` is ~30 lines and is not the hard part. | BSD, Python | **Reject** as a dependency, for the same reason `graphology` was rejected: the 90% is building the right graph from ink, and no generic graph library touches it. |
| **shapely** (already in `bakeoff/vectorgrid.py` / sidecar: `node`, `polygonize_full`) | Same GEOS primitives as JTS, Python side | BSD, Python | Sidecar-only option. Do not move the shared path to Python for this. |
| **ezdxf `edgeminer` / `edgesmith`** | Chains/loops from unordered edges with `gap_tol`; docs state intersection points "are not known and cannot be calculated" — no splitting at crossings or T-junctions | MIT, Python | **Reject.** It skips the exact sub-problem (noding) this repo already solved. |
| **neatnet** (uscuni) | Collapses dual carriageways / parallel edges to a centerline using continuity heuristics — the same shape as a double-line duct | BSD-3, Python (geopandas stack) | **Borrow the idea, not the package**: face-artifact detection + centerline; implement with JTS pieces above. |
| **centerline** (fitodic), **jspoly** (Boost Polygon port) | Voronoi-based polygon centerline / medial axis | MIT / Boost, Python / JS | Reference implementations for the centerline step; JTS `VoronoiDiagramBuilder` in-tree does the same. No new dep. |
| **skan / sknw** | Raster skeleton → graph | BSD, Python | Only for the raster (`has_vector_linework:false`) fallback. Defer; vector-first. |
| **deep_schematics** (johnshearing) | Electrical schematic PDF → netlist: conductor/junction geometry taken deterministically from the vector layer, vision used only for symbol meaning; 47 components / 131 terminals on one real drawing | MIT, Python | **Copy the split**: deterministic ink → connectivity, vision only for identity. Not a code import (electrical, not MEP). |
| **schematic-extractor** (D4NGYY) | Vector-PDF schematic → Components↔Nets graph; "segment BFS over T-/dot-junctions"; measured F1 0.42 geometric-only, 0.56 hybrid, 0.71–0.89 on normal boards — on KiCad-rendered PDFs, "unverified on real CAD" | MIT, Python (PyMuPDF, YOLO) | **Copy the ruler**: bipartite one-to-one Components↔Nets F1 is the right shape for a `serves` score. Their numbers are also the honest calibration for how hard geometric-only connectivity is. |
| **PID2Graph** (Energy Impact Center) | 700 synthetic + 60 real + 12 OPEN100 P&IDs with full graph ground truth: symbols as nodes with bbox + label, lines as edges, in `.graphml` | CC BY-SA 4.0, data | **Copy the key format** (a graph file per sheet, nodes = placements, edges = connections). Do not train on it (P&ID, raster). |
| Relationformer P&ID (2411.13929) | End-to-end image→graph transformer; edge mAP 75% on real P&IDs vs 46% modular | paper, no code | Reject for now: raster, GPU, no code. Note that a modular Hough pipeline scored 46% on edges — vector noding starts far ahead of that. |
| Azure P&ID digitization sample | YOLO symbols + OCR + Hough lines → NetworkX graph → SQL graph | MIT, Python | Reject: raster-first; but its rule list for text↔symbol and line↔symbol association is worth reading once. |
| "Grounded and Faithful P&ID Reasoning" (2609.05880) | Recovers an explicit graph (symbols, connections, tags) and forces the VLM to answer only through **seven read-only graph operators**, each answer citing its query; EM 37–41% → 74–76% | paper (arxiv blocked from this container; read it from a machine that can) | **Adopt the API shape.** This is the repo's own tool doctrine (`agentLoop.js:2017`, "a tool's own returned status is the ONLY source of truth") applied to connectivity: expose the graph only as typed read-only queries. |
| **pyDEXPI** | DEXPI P&ID data model as Pydantic + NetworkX export + synthetic generation | **AGPL-3.0** | **Reject** on license. Borrow vocabulary only: equipment *nozzle/port*, *piping network segment*, *connection*. |
| SymPoint / SymPoint V2 | Panoptic symbol spotting on vector CAD (FloorPlanCAD) | **non-commercial research license** | Reject on license. |
| CADTransformer, VecFormer (NeurIPS 2025) | Same task; primitive-level symbol membership from SVG lines | MIT / Apache-2.0, needs GPU + FloorPlanCAD-trained weights (VecFormer ships none) | Defer. Relevant to symbol *discovery* if `symbol_sweep`/legend learning ceilings out, not to connectivity. Not this goal. |
| MDPI Electronics 15(17):3785 (Aug 2026), "Automated Digitization of Engineering Schematics" | Explicitly handles vector PDFs; rule-based geometric text→symbol association | paper (mdpi.com blocked here) | Read from a machine that can; compare its association rules to `symbollabels.ts`. |
| Enginuity (automotive diagrams, CVPR 2026 task) | Wiring-diagram dataset | data | Not relevant. |

**Conclusion of the survey.** No open-source package answers "which
equipment does this device connect to on an MEP plan from a vector PDF".
The pieces that matter — robust noding, leader chase, wall vouching,
crossing-vs-junction rules, arrowhead direction — are all already in this
tree, split across two modules. What the outside world contributes is (a) the
key/score format (PID2Graph graph keys, bipartite one-to-one F1), (b) the
"deterministic ink, vision only for identity" split, (c) the read-only
graph-operator API, and (d) the centerline idea for double-line runs. The
work is to grow the existing graph, not to import one.

## Non-negotiable: what "ground truth" means here

Same rule as `VECTORGRID_TABLE_BOXES.md`, restated for this relation because
it is even easier to fake:

**A `serves` key row exists only because a human rendered the sheet
(`mcp/scripts/render-page-crop.mjs`, `view_sheet`, or the `renders/` PNGs),
followed the duct/pipe/line with their eyes from the device to the equipment,
and wrote down what they saw, with the tool's answer NOT in view.** The
schedule's `SERVED` / `AREA SERVED` column, an airflow-value match, a room
name, a "typical" detail, or `trace_connectivity`'s own output are
corroboration at most and never the key. A row must say in `note` what was
rendered and what was seen. `keys/**` stays read-only to every fix.

Negatives are mandatory and must be real: a device whose run leaves the sheet
at a match line; a supply and return that cross without connecting; a device
between two equipment where the drawing genuinely does not decide; a
thermostat with no drawn control line. A key with no expected `unconnected` /
`ambiguous` rows is a key that cannot catch the failure this whole module's
refusal doctrine exists for.

## Method — phases, each with its own gate

Work them in order; each phase is one or more commits with the gate's
numbers in the commit body and in the table at the bottom of this file.
`AGENTS.md` applies throughout: shared path, no subagents, no key edits, no
threshold weakening to move a number, full test suite before every commit.

### Phase 0 — the ruler before the fix

1. Define the relation and the key. `keys/<set>.serves.csv`:

   ```
   sheet, device_tag, device_x, device_y, equipment_tag, equipment_x, equipment_y,
   relation, expect_status, note
   ```

   `relation ∈ {ducted, piped, controls}`; `expect_status ∈ {served,
   ambiguous, unconnected, refused}`; coordinates are image px at
   `RENDER_SCALE 2.0` exactly as `*.mep.csv` already uses; `equipment_*`
   empty when the expectation is not `served`.
2. Author ≥ 40 rows across ≥ 4 sets on disk, at least 8 of them negatives:
   `navfac-cherry-point-atc` p6 (MH101; `CD-1`/`RG-6`/`CD-2` ↔
   `VAV-A1xx`, `FCU-Ax`), `bessemer` p6 (`SR-1`/`TG-2` ↔ `HP-1`; `T` ↔
   `EBB-1`/`EBB-2` as `controls`; `EF-1` as `unconnected` on-sheet),
   `itd-d1-lab` p4 (`EQ.19`/`EQ.10` taps and the `HEV-1`/`EF-1` riser),
   `bldg5406-hvac-demo` (`VAV-1..9`, find the plan sheet), `federal-mech`
   (VAV-dense; pick one sheet). Write the render commands you used into
   `note`.
3. Write `mcp/scripts/serves-eval.mjs` mirroring `mep-trace-eval.mjs`
   exactly: three metrics kept separate (**served-correct**,
   **refusal-correct**, **false-confident**), plus a one-to-one check that no
   two device rows claim the same walked path as evidence for different
   equipment. It calls the shared `Session` path only.
4. Run it against today's `trace_connectivity` by seeding at the device
   placement and passing all equipment on the sheet — that is the baseline.
   Print it here even if it is terrible; it probably is, and that is the
   point.

**Gate 0:** key with ≥ 40 rows and ≥ 8 negatives; ruler committed; baseline
row filled in the table below.

### Phase 1 — one graph, with provenance

1. **`OPS.setDash` is a dead end on this corpus — measured, not assumed.**
   Probed directly (2026-09-15): `openPdf` + `page.operatorList()` on
   Bessemer p6 (63,842 ops, 30,647 strokes), ITD p4 (59,874 ops, 27,244
   strokes), and NAVFAC MH101 p6 (92,538 ops, 39,178 strokes) — `OPS.setDash`
   fires **zero** times on all three, including across Bessemer's own
   thermostat-to-baseboard-heater control lines, which render visibly dashed.
   These CAD exports draw a dash pattern as many short, evenly-spaced,
   collinear STROKED segments, never the PDF dash operator. Extend
   `extractVectorGeometry` (or a parallel per-segment array) to carry line
   style computed GEOMETRICALLY instead: reuse `oneclick.ts`'s own existing
   short-collinear-run detection (already commented as handling "dash-pattern
   pen-down artifacts", `oneclick.ts:594,606-608,657,660`, built for
   `markPolylineArcs`) as the basis for a `dashed` classification — a chain of
   short (sub-inch, scale-aware) collinear segments at regular gaps is dashed;
   one long stroke is solid. Keep `meta` byte-compatible; every existing
   consumer must be bit-identical (`wallnetwork`, `netroom`, `symbolsweep`
   tests are the regression net).
2. Make `buildMepGraph` the only topology builder: add option flags for
   `controlSchematic.ts`'s crossing rule (`unresolved_crossing` unless a
   junction mark vouches) and arrowhead direction, port `hasJunctionMark`
   and the arrow detector into `mepconnectivity.ts`, and have
   `topologyFor` call it. Edges gain `style`, `direction`, `sourceSeg`.
3. Delete or repurpose L3.5 `runL35Topology`: either it stores the graph the
   takeoff will consume (Phase 5) or it stops paying for noding it throws
   away. Measure the cost on `federal-mech` (~511K segments) before and after.

**Gate 1:** flags off ⇒ `mep-trace-eval.mjs` 3/3 unchanged byte-for-byte and
`tools.test.ts:2033` still asserts the old crossing behaviour;
`npm run test:bas-drawings`, `test:bas-risers`, `test:bas-network-riser`
green (schematic corpus gates); web + mcp typecheck and full test suites
green.

### Phase 2 — a crossing is not a junction (#22)

Default rule on plan sheets: an interior crossing of two edges is **not**
connected unless (a) a junction mark vouches, or (b) one edge ENDS at the
other (a real T), or (c) both edges share style and system AND a fitting
placement sits at the crossing. Flip `tools.test.ts:2033` deliberately, with
the new assertion, in the same commit.

**Gate 2:** `serves-eval` false-confident count falls with no loss of
served-correct on the ducted rows; `mep-trace-eval` still 3/3. Write the
before/after in the table.

### Phase 3 — double-line runs become one edge

For each connected component of parallel, same-style, same-pen edge pairs at
a plausible duct width (feet-true from the sheet scale, `wallnetwork.ts`'s
parallel/pitch machinery already measures this), polygonize the outline
(JTS `Polygonizer`), take the Voronoi/medial axis (JTS
`VoronoiDiagramBuilder`, keep only edges inside the polygon), and add the
centerline as `ductwork` edges tagged `derived: "centerline"` while keeping
the wall edges as provenance. Never do this on unlayered sheets without the
width gate; a corridor is also two parallel lines.

**Gate 3:** Bessemer `SR-1` (all three) → `HP-1` served via centerline;
ITD 12"ø runs traced; no regression on the 47-case symbol-sweep corpus
(symbol bodies are made of parallel pairs too — prove they are not eaten).

### Phase 4 — ports, not clicks

1. For every device placement (`symbol_sweep` match, `sweep_schedule_row`
   `drawing_locations[]`, `count_marks`, legend sweep), compute **ports**: the
   points where graph edges enter the placement's bbox (expanded by the
   symbol's own ink scale, `symbolInkLengthPx` already exists in
   `symbollabels.ts`). A device with zero ports is `unconnected`, not seeded
   at its centroid.
2. `serves(device)`: walk from each port outward; stop at the first
   **equipment body** reached (an equipment placement's bbox, not a point);
   a trunk feeding many devices is one component and is NOT ambiguity —
   ambiguity is reaching two different equipment bodies on paths that do not
   pass through each other. Under `layer_signal: "none"` keep the
   `layer-unclassified` factor; under a strong signal, refuse to cross
   system boundaries (supply run into a return body).
3. Move `symbollabels.ts`'s leader chase onto the same graph (a leader is a
   1–2 edge chain from a tag box to a port) so tag→symbol and symbol→equipment
   are one traversal with one junction rule.

**Gate 4:** `serves-eval` run with NO seed points and NO equipment list
supplied by hand — the eval passes only device tags and lets the pipeline
find the rest. Report served-correct, refusal-correct, false-confident.

### Phase 5 — controls and the shared path

1. With line style from Phase 1, `relation: controls` walks dashed edges from
   a `T`/sensor body to an equipment body (Bessemer `T` → `EBB-1`/`EBB-2`).
2. Expose it as read-only graph operators on `Session` and in
   `agentTools.js` with parity: `served_by(device)`, `devices_of(equipment)`,
   `path_between(a, b)`, `ports_of(placement)`, `component_of(point)` — each
   result carries the walked path and edge provenance as its citation, and
   each has a `refused` shape with a reason. `trace_connectivity` stays for
   the click-driven case and becomes a thin wrapper.
3. `reconcile_schedule_plan` `drawing_locations[]` gains `served_by`
   (`mcp/src/outputs.ts`), and `highlight_citation` can paint a walked path.
4. `agentLoop.js` hard rules and `agentVerifiers.js` get the same
   "tool status is the only truth" treatment for the new operators;
   `check-tool-count.mjs` updated.

**Gate 5:** MCP/UI parity tests; `npm run check` in `web`; the D01–D10 demo
suite untouched; the connectivity intent in `takeoffWorkflow.js:1019`
rewritten to prefer `served_by` over hand-seeded traces.

### Phase 6 — held-out and the walk-out proof

Before any tuning beyond Phase 2, write `keys/SERVES_HELDOUT.txt`: whole
sheets (not rows) never used to change a threshold. Final report runs both
splits. The walk-out proof: on NAVFAC MH101, a person who has never seen the
tool picks any air device; the platform names its VAV or FCU with the path
painted, or says exactly why it cannot. Do it for ten devices they choose,
record each as a row.

## Completion gate

Reported together, tuning and held-out splits separately, every time:

| | |
|---|---|
| **rows graded** | total `serves` key rows, by set and by relation |
| **served-correct** | of rows expecting `served`, how many named the right equipment with a walked path |
| **refusal-correct** | of rows expecting `ambiguous` / `unconnected` / `refused`, how many returned exactly that |
| **false-confident** | rows that confidently named the WRONG equipment — the headline failure, scored apart |
| **no-seed** | all of the above with no human seed and no hand-supplied equipment list |
| **crossing cases** | the real supply/return crossings in the key, and how many are still read as connected |
| **grader error rate** | a random 20% of rows re-authored blind by a second pass; disagreement rate printed beside the score |
| **cost** | graph build ms per sheet on `federal-mech`, `navfac-cherry-point-atc`, before/after |

Not met by: a good number on the three `*.mep.csv` cases; a synthetic
fixture; a key whose negatives were removed because they failed; a
`served_by` that only works with `layer_signal: "strong"` (the corpus is
mostly unlayered); or any change to `SWEEP_SCORE_*`, refusal semantics,
schedule truth, or `keys/**`.

## What not to do

- Do not add NetworkX, graphology, ezdxf, neatnet, or a Python sidecar step
  for the graph. The graph lives in `mepconnectivity.ts` on the shared path.
- Do not use `SERVED` schedule cells, CFM matches, or room names to decide a
  connection. They may raise a `corroborated_by_schedule` factor after the
  walk, never replace it.
- Do not treat a schematic/riser "typical" as a plan connection
  (`AGENT_BAS_TAKEOFF_GOAL.md` Phase 4 already draws this line).
- Do not start with a detector. If, after Phase 4, device *discovery* (not
  connectivity) is the measured ceiling, open a separate goal and cite
  VecFormer/CADTransformer there.
- Do not "fix" a crossing by widening a tolerance. Widened tolerances are how
  the 52-hop wall walk happened.

## Session protocol (Sonnet 5)

```
cd opentakeoff && npm ci                 # once, at the workspace ROOT — it populates
                                         # web/node_modules and mcp/node_modules.
                                         # Running npm ci inside web/ then mcp/ wipes
                                         # the first install (measured 2026-09-15).
cd web && node --import tsx --test test/mepconnectivity.test.ts test/symbolLabels.test.ts
cd ../mcp && node --import tsx --test --test-name-pattern='trace_connectivity' test/tools.test.ts
OPENTAKEOFF_TABLE_SIDECAR=0 node --import tsx scripts/mep-trace-eval.mjs ../../opentakeoff-corpus bessemer itd-d1-lab
OPENTAKEOFF_TABLE_SIDECAR=0 node --import tsx scripts/render-page-crop.mjs <pdf> <page> out.png --scale 2 --crop x,y,w,h   # PDF-point crop
```

Corpus PDFs resolve through `mcp/scripts/corpusFiles.mjs` (recorded absolute
roots first, then `opentakeoff-corpus/raw/`, then the `samples/` sibling).
Java 21 is present for ODL. Renders of `bldg5406-hvac-demo` already exist in
`opentakeoff-corpus/renders/`.

One phase per commit series; the commit body carries the gate numbers; this
file's table is updated in the same commit; `opentakeoff-corpus/PROGRESS.md`
gets one dated paragraph per phase. Every real bug found on the way that is
not this goal's goes to `TAKEOFF_BUG_CATALOGUE.md`, not into a side fix.

## Numbers (fill in as you go)

| phase | date | commit | rows | served-correct | refusal-correct | false-confident | no-seed | notes |
|---|---|---|---|---|---|---|---|---|
| baseline (`trace_connectivity`, hand-seeded, 3 `*.mep.csv` rows) | 2026-09-15 | main | 3 | 2/2 | 1/1 | 0 | no | the only real cases that exist today |
| 0 | | | | | | | | |
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 (held-out) | | | | | | | | |

## Open at the time of writing

- ~~Whether pdf.js's operator list preserves `setDash`...~~ — **answered
  2026-09-15, see Phase 1 §1 above: `setDash` never fires on this corpus's
  CAD exports; dash detection must be geometric.**
- `federal-mech` (~511K segments) has never had `buildMepGraph` timed; L3.5
  already runs it there silently. Measure before Phase 1 changes anything.
- The arXiv and MDPI papers above could not be fetched from this container
  (egress blocked). Read them from a machine that can before Phase 5's API
  design; the seven-operator list is worth matching name-for-name.
- The 47-case symbol-sweep corpus lives outside this repo (`HVAC BAS
  Benchmark Collection`). Phase 3's "symbol bodies are not eaten" gate needs
  it; if it is not on the executing machine, say so and use the in-repo
  fixtures plus a hand-checked Bessemer/NAVFAC sample instead.
