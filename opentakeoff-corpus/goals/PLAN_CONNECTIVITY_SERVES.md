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

**Gate 0 — MET, 2026-09-15.** 49 real rows across all 4 named sets (bessemer
13/6 negatives, itd-d1-lab 9/2, navfac-cherry-point-atc 16/3,
bldg5406-hvac-demo 11/3 — 14 negatives total), every row hand-authored by
rendering and looking, independently spot-verified by the coordinator
against each key's own self-flagged least-confident rows before commit
(see the four `keys/*.serves.csv` commits on this branch), `serves-eval.mjs`
built and validated against a synthetic fixture reusing already-verified
`bessemer.mep.csv` coordinates before being trusted on real data. Baseline
run: `reports/SERVES-EVAL-2026-09-15.txt`.

```
set                          rows   served R   refusal R   false-conf   path-coll
bessemer                       13    20.0%      16.7%           2          0
itd-d1-lab                      9    42.9%      50.0%           0          0
navfac-cherry-point-atc        16     0.0%       0.0%           0          0
bldg5406-hvac-demo             11     0.0%      66.7%           0          0
CORPUS                         49    12.1%      28.6%           2          0
```

**This is exactly as bad as expected — a device's own glyph is not a click
on its duct, and it is worth stating precisely why, because the four sets
fail in four DIFFERENT ways, each pointing at a different later phase:**

- **NAVFAC — 0% served, 0% refusal, every one of 16 rows `refused`.**
  Diagnosed directly (not assumed): the SAME reason string fires for every
  row — `"This sheet's own linework could not be reliably noded for
  connectivity tracing"`. JTS noding fails at every retry grid on this
  ~92,538-op sheet, so `buildMepGraph` returns null and NOTHING traces here
  today, regardless of seed quality. This is a SECOND real, disclosed
  instance of the same failure class `docs/MEP-CONNECTIVITY-EVAL.md`
  already names for `baker-county-eoc`'s M1.21 — and it lands on the one
  sheet this goal explicitly chose as "the production shape of the whole
  goal." Phase 1 must re-test NAVFAC's own noding as a named gate item, not
  just the 3 existing `*.mep.csv` cases — a refactor that stays
  byte-identical on 3 easy cases while the hardest real sheet in the corpus
  still refuses on everything has not actually been gated on the thing that
  matters.
- **Bessemer — 20%/16.7%, 2 false-confident.** All 3 `SR-1` rows `dead_end`
  from the device's OWN glyph even though the near-identical duct-centerline
  seed in `bessemer.mep.csv` reaches `HP-1` cleanly — the register symbol
  sits near, not exactly on, the traced duct stroke, outside
  `DEFAULT_SEED_TOL_FT`/`quantGridPx`. Both false-confident hits are `T`
  (thermostat) rows: seeded near `EBB-1`/`EBB-3`, the walk reached the
  ADJACENT `EBB-2`/`EBB-4` instead — because dashed control-line segments
  get noded and walked exactly like solid duct ink today, with no dash
  signal to keep two nearby control runs apart. Both failure shapes are
  named, disclosed risks already in this file (Phase 1 dash detection,
  Phase 4 ports) — this is the first real, measured evidence for both.
- **ITD-d1-lab — 42.9%/50%, the least-broken set.** The first EQ.19/CH-1/
  EQ.10 chain (already proven in `itd-d1-lab.mep.csv`) mostly still resolves;
  the SECOND, previously-untested EQ.19/EQ.10/CH-3 chain into `EF-3` misses
  entirely (`dead_end`) — a genuinely new, real gap this key is the first to
  surface, not a re-measurement of what was already known.
- **bldg5406 — 0% served, but 66.7% refusal (its unconnected/ambiguous rows
  mostly DO score correctly) — every `served` row instead comes back
  `ambiguous`.** This is the OPPOSITE failure from NAVFAC's total refusal:
  the graph nodes fine, but the Phase 0 baseline's own equipment-candidate
  list (every "served" row's equipment on that sheet — 8 VAV/FCU bodies on
  one busy floor plan) is too broad for a device seeded onto a SHARED trunk
  before its own dedicated branch — the walk reaches several VAV bodies
  within the hop limit and correctly, honestly refuses to pick one. This is
  not a bug in `traceConnectivity`'s own ambiguity doctrine (picking one
  would be worse) — it is the clearest possible demonstration of why Phase 4
  needs to scope the equipment candidate list to what a device's own PORT
  can actually reach, not hand it every piece of equipment on the sheet.

Four sets, four distinct, named, root-caused failure modes, each mapped to
the phase that fixes it. This is what "the ruler before the fix" is for.

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
2. **Half done, 2026-09-15 — the junction-mark/crossing-gate machinery is
   ported, tested, and real-corpus-verified; the `topologyFor` unification
   is not started.** Make `buildMepGraph` the only topology builder.

   **Landed:** `hasJunctionMark` ported verbatim from `controlSchematic.ts`'s
   own private function into `mepconnectivity.ts` as a tested export.
   `buildMepGraph` gained `requireJunctionMarkForCrossings` (default OFF —
   the whole point) and `junctionMarkRadiusPx`: when the flag is on, a
   junction coordinate where NO original segment actually ends (a pure
   interior-interior crossing) only coalesces into one connected node when
   real junction-mark evidence corroborates it; a genuine T/tee (a real
   endpoint lands there) is NEVER gated. The hard part this item's own
   earlier diagnosis named — `nodeFor(x,y)` coalescing every segment
   through a shared coordinate — is solved by threading an optional
   per-segment node-key override through `nodeFor`/`addEdge`, computed once
   per interior split point and reused for both edges that touch it, so a
   segment's own internal chain stays connected to itself while a
   DIFFERENT, un-vouched crossing segment gets its own separate node at the
   identical coordinate. 11 new tests (6 on `buildMepGraph`'s own gate
   behavior — default-off parity, an un-vouched crossing splitting, a real
   mark vouching it back, a genuine T never gated, a segment's own chain
   surviving a mix of a real junction and a gated crossing on itself, a
   custom radius — plus 5 direct `hasJunctionMark` unit tests), all green
   (39/39 in `mepconnectivity.test.ts`). Verified byte-identical default
   behavior three ways: the pre-existing 28 tests unchanged, `tools.test.ts`'s
   12 `trace_connectivity` tests unchanged, and a real corpus re-run
   (`mep-trace-eval.mjs bessemer itd-d1-lab`) scoring the IDENTICAL 3/3,
   100%/100%/0 as the original baseline.

   **Still open:** port the arrowhead detector into `mepconnectivity.ts`
   (edges need `direction`), add `style`/`sourceSeg` to `MepEdge`, and have
   `controlSchematic.ts`'s own `topologyFor` actually CALL `buildMepGraph`
   instead of maintaining a second, parallel implementation — mapping its
   exact existing output shape (`SchematicTopology`: nodes/edges/crossings/
   arrows/connected_components, the `MAX_TOPOLOGY_SEGMENTS`/
   `MAX_INTERSECTION_CANDIDATES` refusal semantics) onto `MepGraph`'s shape
   without changing a single existing assertion in `controlSchematic.test.ts`
   or the `test:bas-drawings`/`test:bas-risers`/`test:bas-network-riser`
   corpus gates. This is its own dedicated, carefully-tested increment —
   budget it separately, not as a quick follow-on.
3. **Delete or repurpose L3.5 `runL35Topology` — measured 2026-09-15, and the
   case is now unambiguous.** `OPENTAKEOFF_GRAPH_TRACE=1
   production-graph-cli.mjs --mode graph --pdf federal-attachment4-mechanical.pdf`
   (real cold-cache run, sidecar off): total sheet-graph build 62,387ms;
   `L3.5:topology` alone is **34,661ms — 55.6% of the entire build, the single
   largest stage** (`L2:ODL` 13,172ms, `L1.8:vectorgrid` 80ms, `L4` 1ms,
   `L4.5` 0ms, `L4.8` 411ms). Of 24 sheets, only 2 were `topologyEligible`
   with segments and actually completed (854ms on 5,293 segs, 3,533ms on
   12,078 segs — `report.topology_sheets: 2`) — the pipeline's own disclosed
   note says topology was **skipped outright on sheet #9 "(topology budget
   spent)"**, i.e. this stage already hits an internal time ceiling and
   silently abandons a dense sheet's topology today, on a real document,
   with nobody downstream ever finding out (nothing reads
   `graph.vector_topology` except `enrichSystemTags`, which never reads the
   graph itself — see the audit above). Either store the graph the takeoff
   will actually consume (Phase 5) or stop paying for this — there is no
   third option that keeps 34.7s of silent, partially-abandoned, unconsumed
   work in the critical path. Re-measure the same command after this phase's
   change and put the before/after here.

**Gate 1:** flags off ⇒ `mep-trace-eval.mjs` 3/3 unchanged byte-for-byte and
`tools.test.ts:2033` still asserts the old crossing behaviour;
`npm run test:bas-drawings`, `test:bas-risers`, `test:bas-network-riser`
green (schematic corpus gates); web + mcp typecheck and full test suites
green. **Also required, named because of the Phase 0 baseline finding
above:** re-run `serves-eval.mjs` on `navfac-cherry-point-atc` specifically
and report whether this sheet nodes at all now — 0/16 refused today on the
single most production-representative sheet in the corpus is not
acceptable to leave unmeasured through a phase that touches noding.

### Phase 2 — a crossing is not a junction (#22)

Default rule on plan sheets: an interior crossing of two edges is **not**
connected unless (a) a junction mark vouches, or (b) one edge ENDS at the
other (a real T), or (c) both edges share style and system AND a fitting
placement sits at the crossing. Flip `tools.test.ts:2033` deliberately, with
the new assertion, in the same commit.

**Attempted and reverted, 2026-09-15 — real, root-caused, not a guess.**
(a) and (b) are what Phase 1 item 2 already built and proved
byte-identical when off; (c) was never reached. Flipped
`requireJunctionMarkForCrossings: true` on in both real callers
(`mcp/src/session.ts`'s `ensureMepGraph`, `TakeoffCanvas.jsx`'s
`agentTraceConnectivity`), got the exact expected fix on the synthetic
`mep-plan.pdf` fixture (`tools.test.ts`'s own crossing case went from
`ambiguous` to a clean `reached`/`AHU-3`, never `PANEL-1`), then re-ran
`mep-trace-eval.mjs` on the REAL corpus before trusting it — and it
regressed: `bessemer` stayed 2/2, but `itd-d1-lab` (the case whose own
`.mep.csv` note says a human visually confirmed "the tool's own real trace
walks 47 real hops through this exact visually-confirmed path") flipped
from `reached`/`EF-1` to `dead_end`.

**Diagnosed before reverting, not assumed:** wrote a direct comparison
script (build the same sheet's graph with the flag off vs. on, walk the
OLD graph's own successful 42-hop path, and check whether each consecutive
hop still has an edge under the NEW graph). 41 of 42 hops still connect
perfectly — the real duct run itself is untouched by the gate. Only hop 1,
right at the seed's own point, breaks. Rendered the exact real location
(scale 10, `itd-d1-lab-mechanical.pdf#4`, around image px `[2328,448]`):
a real volume-damper symbol sits directly on the duct's own dashed
centerline — exactly where the human-authored seed was placed — and a
thin vertical callout leader-arrow line (from an `EQ.19`/`CH-1` hexagon
tag above) crosses straight through the duct within a few pixels of that
same point. This is an **unlayered** sheet (`layer_signal: "none"`), so
nothing today excludes annotation/leader ink from the MEP graph at all —
under the OLD ungated behavior this never mattered (every crossing merged
regardless of what it was), but the moment the gate correctly refuses to
treat a bare arrow-crossing as a real connection, `resolveOnGraph`'s own
nearest-edge tie-break (pure smallest-distance, no length preference) can
splice the seed onto that now-isolated, tiny arrow-crossing fragment
instead of the real, much longer duct edge sitting just as close.

**This is not a reason to abandon the fix — #22 is real and this gate is
the correct shape for it — it is a reason not to ship the flip until the
seed-resolution side of it is handled too.** Reverted only the two real
callers' own option (back to `false`, matching every test/eval that
existed before this attempt) and `tools.test.ts`'s assertion (back to
`ambiguous`, with a comment explaining exactly why, not silently). Kept
everything Phase 1 item 2 built: the gate itself, `hasJunctionMark`, and
all 39 `mepconnectivity.test.ts` tests, including the ones that prove this
exact fixture's crossing DOES resolve correctly when the flag is passed
directly — the mechanism is proven; only "safe to flip on for every real
seed on an unlayered sheet" is not yet proven.

**Scoped follow-up this needs before the flip is safe (own increment, not
attempted here):** make `resolveOnGraph`'s candidate selection prefer a
meaningfully LONGER nearby edge over a short one when both are within
seed tolerance — a short edge born from a just-applied crossing gate is
far more likely to be an annotation/leader-line artifact than a real duct
run, and this is a general property (not a special case for this one
sheet) worth having independent of #22. Needs its own dedicated
before/after against the full `mepconnectivity.test.ts` suite (this
function is used for EVERY seed/equipment resolution, not just gated
crossings, so a change here has broad ripple potential) plus a re-run of
`mep-trace-eval.mjs` proving `itd-d1-lab` recovers without breaking
`bessemer`, before the two real callers can safely pass
`requireJunctionMarkForCrossings: true` again.

**Gate 2 — NOT MET.** `serves-eval` false-confident change: not measured
(the flip that would move it was reverted). `mep-trace-eval`: reverting
kept it at the original 3/3 — a flip that dropped it to 2/3 was rejected,
not shipped as if it were 3/3.

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
| 0 | 2026-09-15 | (this commit) | 49 | 4/33 (12.1%) | 4/14 (28.6%) | 2 | no | 4 sets, 4 distinct failure modes: NAVFAC total noding refusal, Bessemer seed-tolerance + dash false-confidence, ITD a genuinely new untested-chain gap, bldg5406 over-broad candidate-list ambiguity — see "Gate 0 — MET" above |
| 1 | | | | | | | | |
| 2 | 2026-09-15 | (this commit) | — | — | — | — | no | ATTEMPTED, REVERTED — mep-trace-eval regressed 3/3->2/3 (itd-d1-lab: a callout leader-arrow crosses the real duct within seed tolerance on an unlayered sheet; resolveOnGraph's nearest-edge tie-break picked the now-gated short arrow fragment over the real, longer duct edge). Root-caused precisely (41/42 of the real path's own hops stay connected; only the seed's own first hop breaks). Machinery from Phase 1 item 2 stays landed; the two real callers' own flag reverted to off. Needs resolveOnGraph's own length-aware tie-break fixed first (scoped above) before re-attempting |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 (held-out) | | | | | | | | |

## Open at the time of writing

- ~~Whether pdf.js's operator list preserves `setDash`...~~ — **answered
  2026-09-15, see Phase 1 §1 above: `setDash` never fires on this corpus's
  CAD exports; dash detection must be geometric.**
- ~~`federal-mech` has never had `buildMepGraph` timed...~~ — **answered
  2026-09-15, see Phase 1 §3 above: L3.5 costs 34,661ms (55.6% of the whole
  build) and already silently abandons a dense sheet on a time budget.**
- The arXiv and MDPI papers above could not be fetched from this container
  (egress blocked). Read them from a machine that can before Phase 5's API
  design; the seven-operator list is worth matching name-for-name.
- The 47-case symbol-sweep corpus lives outside this repo (`HVAC BAS
  Benchmark Collection`). Phase 3's "symbol bodies are not eaten" gate needs
  it; if it is not on the executing machine, say so and use the in-repo
  fixtures plus a hand-checked Bessemer/NAVFAC sample instead.
