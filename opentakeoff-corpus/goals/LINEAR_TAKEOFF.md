# Goal: production-grade linear takeoff (duct, pipe, BAS runs) on the shared path

Opened 2026-09-16. Not complete. Charter, evidence, math and design live in
`plans/03-linear-takeoff-hvac-bas-plan.md` (the plan) and
`plans/03-research/` (competitor, standards, algorithm research + probe
scripts). This file is the executable goal: what to build, in what order, how
each step is measured, and what is never allowed. It is written for an
autonomous coordinator (Sonnet 5, ultracode) running a goal loop; read it top
to bottom once, then work THE QUEUE.

This goal deliberately opens scope that `takeoffs/NEXT_GOAL_LOOP.md:179` closed
("No duct-LF scope creep"). The user opened it on 2026-09-16. Every other
standing rule in `AGENTS.md`, `GOAL.md` ("Platform mandate") and
`GOAL_LOOPS.md` (laws, anti-gaming) still applies verbatim.


## Decisions (settled 2026-09-16 from the research — not open questions)

| # | Decision | Why (evidence) |
|---|---|---|
| D1 | **One condition per system, sizes on segments.** `SA`, `HHWS`, `CHWR` are conditions; every segment carries its own size; the report breaks LF, fittings, hangers and insulation out per size. Per-size conditions remain available as templates for estimators who work that way. | AutoBid's run model tracks size-change vertices ("HotSpot"); Canaveral reads size per segment; Bluebeam/STACK/PlanSwift's one-tool-per-size is a workaround for lacking per-segment data (plan §4.1). Per-segment size is what makes reducers/transitions countable at all. |
| D2 | **Do not deduct fitting lengths from straight LF by default.** Straight LF is centreline length between run ends; fittings are separate line items by piece (duct) or joint (pipe). A per-assembly switch `deduct_fittings` exists for shops that price like QuoteSoft's Auto Elbow. | RSMeans takes duct off "by the linear foot for each size" and prices fittings and hangers per each; Wendes per-piece and per-pound methods count fittings separately; MCAA joint method counts joints, not take-outs (research 02 §A2, §B3, §D3). Deducting by default under-orders straight duct. |
| D3 | **Default hanger tables:** duct = IMC 603.10 ceiling (10 ft) with SMACNA 5-1/5-2 by size class; mechanical piping (hydronic, steam, refrigerant) = MSS SP-58 Table 4; plumbing (domestic water, DWV, gas) = IPC 308.5. UPC 313.3 and IMC 305.4 selectable as the project's adopted code. | The three code tables disagree (copper tubing: IPC 6/10 ft by size, IMC 8 ft, UPC 6/10 ft at 1½"); MSS SP-58 is the standard specs reference for mechanical hangers; IPC is the plumbing code most jurisdictions adopt (research 02 §B1). The adopted code is a project property, so it is a setting with a defensible default, not a global constant. |
| D4 | **BAS linear lives in the TypeScript assembly module, not `bas_engine`.** Cable LF, conduit LF and tubing LF are takeoff quantities priced by `assembly.ts` like duct and pipe; `bas_engine` is not touched by this goal. | `bas_engine` has no length unit, integer-only counts, an explicit no-pricing doctrine and states it is "not an arbitrary floor-plan cable-routing solver" (plan §2.9). Its deliverable-scope claims cite point counts, which already exist; cable LF is a quantity, not an engineering-review claim. If a future scope contract must cite cable LF, add a separate exclusive envelope then. |
| D5 | **The corpus mandate is formally opened for linear takeoff by this goal file.** `takeoffs/NEXT_GOAL_LOOP.md` carries a dated amendment pointing here; this loop runs beside the schedule/points loop with its own gates and never dilutes theirs (corpus-eval must not move). | User direction 2026-09-16; the plan's §3 evidence shows the geometry is clean enough on real sets to do this deterministically. |
| D6 | **No licensed labor tables ship.** Defaults are the graded [M] order-of-magnitude grid. The profile gains a **CSV import** for the estimator's own licensed units with the schema `family,size_key,joint_type,unit,hours,source` — MCAA WebLEM export layout first, generic second. | MCAA WebLEM is the mechanical industry's labor-unit reference and is licensed (research 02 §B3); Wendes and SMACNA tables likewise. Shipping them is not an option; importing the user's own is what AutoBid/FastPIPE/QuoteSoft effectively do. |

---

```
GOAL LOOP L — linear takeoff: trace a run, size it, fit it, price it, prove it

REPO      erikjohnstone/master-plan
BRANCH    ONE long-lived feature branch `linear-takeoff`, created from `main`
          after PR "Add linear takeoff … plan" (branch
          claude/quirky-pascal-zizcwt) has merged; until then, branch from
          claude/quirky-pascal-zizcwt. Small commits, one work package (WP)
          step each, message body states SHOULD-THIS-BE-ON-THE-SHARED-PATH
          and the before/after numbers. Open the PR as a draft at the end of
          WP1 and keep it updated. NEVER merge to main yourself — merge is
          deploy (opentakeoff/AGENTS.md "Shipping"). Every commit must leave
          `main`-merge safe: all existing behaviour byte-identical when a
          shape has no `run` block (golden tests enforce it).

WHO       Sonnet 5 coordinator in ultracode mode. Execution policy in
          "PARALLELISM" below — read it before fanning anything out.

════ SETUP (first 15 minutes) ══════════════════════════════════════════
  cd opentakeoff/web && nvm use && npm install
  cd ../mcp && npm install
  cd ../web && npm run check           # must be green at HEAD; if not, STOP
                                       # and report — do not start on red
  cd ../mcp && npm test                # same
  Re-run the plan's probes to re-establish the baseline numbers you will be
  measured against (all from opentakeoff/mcp):
    P=../../plans/03-research/probes
    node --import tsx $P/probe.mts ../samples/bessemer-mechanical-bidset.pdf
    node --import tsx $P/ductwidth.mts
    node --import tsx $P/trace-proto.mts ../samples/bessemer-mechanical-bidset.pdf 6 4 36 '^12"x6"$'
  Expected (plan §3): M101 38,339 segs, pen 4 = 624; 12"x6" pair spacing
  36.0 px; chain 18.2 ft in < 2 ms after a < 400 ms index. If YOUR numbers
  differ, say so and stop.
  Read once: plans/03-linear-takeoff-hvac-bas-plan.md §1, §2.11, §6, §7,
  §8, §12, §13; opentakeoff/AGENTS.md; opentakeoff-corpus/GOAL_LOOPS.md
  (LAWS, ANTI-GAMING).

════ WHAT YOU OWN ══════════════════════════════════════════════════════
  NEW  opentakeoff/web/src/lib/linear/**          the engine (pure TS, tested)
         extract.ts      dash + stroke-RGB capture helpers used by oneclick.ts
         strokes.ts      stroke families / candidate classification (§6.2)
         index.ts        segment R-tree + endpoint hash (§6.3)
         graph.ts        lazy welding, node typing, continuation map (§6.3)
         walk.ts         single-line follower + stop rules (§6.4)
         pair.ts         double-line pair follower + centreline (§6.5)
         sizes.ts        size/system grammar + label association (§6.6, App. A)
         vertices.ts     vertex kinds, risers, crossings, symbol gaps (§6.7)
         receipt.ts      confidence, factors, refusals (§6.8)
         assembly.ts     resolveLinearAssembly (§8)
         rates.ts + tables/*.json   size-keyed rate tables with provenance
         worker.ts       per-sheet build off-thread (netroom.worker.js pattern)
  NEW  opentakeoff/web/test/linear/*.test.ts, opentakeoff/web/bench/linear.mts,
       opentakeoff/web/bench/linear/**, opentakeoff/mcp/test/linear*.test.ts
  NEW  opentakeoff-corpus/ground_truth/linear/**  (authored per HELD-OUT rules)
  NEW  opentakeoff-corpus/LINEAR_BUG_CATALOGUE.md  (append-only)
  EXTEND (additively, on the shared path):
       web/src/lib/oneclick.ts          extractVectorGeometry: + dash, + strokeRgb
       web/src/lib/shapeMetrics.js      computed.run derivation
       web/src/lib/totals.js            per-size buckets, vertex/run bases
       web/src/lib/shapeCommands.js     policy rows for run edits
       web/src/lib/reportColumns.js, xlsx.js, csv.js, shapesExport.js,
       dxf.ts, markedset.js            outputs (frozen-13 CSV untouched)
       web/src/lib/revisions.js, snapshotDiff.js, importTakeoff.js, store.js,
       plays.js, templates.js, profile.js, canvasUtil.js, canvasConstants.js
       web/src/lib/mepsystems.ts        + M-CONT-* controls tokens
       web/src/lib/legendlearn.ts       swatch (pen, dash, colour) capture
       web/src/lib/layers.ts, LayerPanel.jsx   "Routed" role
       web/src/lib/sheets.ts, panelGeometry.js  scale regions (WP6)
       web/src/lib/agentTools.js, agentLoop.js, takeoffWorkflow.js
       web/src/pages/TakeoffCanvas.jsx  Linear tool + Trace toggle + chrome
       web/src/components/TakeoffsPanel.jsx, ReportPanel.jsx
       mcp/src/session.ts, tools.ts, outputs.ts, staging.ts, scalewarn.ts,
       mcp/server.ts, mcp/README.md, docs/MCP.md, docs/AGENT_GUIDE.md,
       docs/USER_GUIDE.md, README.md, FEATURES.md, CHANGELOG.md
       opentakeoff-corpus/PROGRESS.md   (your entries under "Active work")

════ WHAT YOU NEVER TOUCH ══════════════════════════════════════════════
  opentakeoff-corpus/keys/**, graphs/**, sets.json, ground_truth/** except
    ground_truth/linear/** (yours, under the HELD-OUT rules)
  The schedule/points/valve pipeline: sheetgraph.ts, corpusTakeoff.mjs,
    vectorTakeoffPipeline.ts, symbolsweep.ts internals, mepconnectivity.ts
    (you CALL these; you do not change them — a needed change → catalogue
    it and stop on that item)
  web/bench/results.json, bench/corpus/** (One-Click bench) — you ADD
    bench/linear, you never edit the existing ruler
  Condition palettes, seeded colours (user data per AGENTS.md)
  Any file under opentakeoff/bas_engine/** (D4: BAS linear is TypeScript)
  The five frozen CSV columns' order/semantics (reportColumns.js:55-57)

════ THE PROBLEM (measured, plan §2-§3) ════════════════════════════════
  The canvas has a manual Linear tool that stores one LF number per
  polyline (TakeoffCanvas.jsx:4850 commitLinear; shape = verts_norm +
  computed.perimeter_lf). Nothing on the platform: follows a drawn duct or
  pipe on click; parses "12"x6"", "8"ø", "1½" HW/CW DN"; knows a segment's
  size or system; infers an elbow, tee, reducer or riser; or resolves a
  per-foot / per-vertex / per-run assembly. The existing MEP graph
  (mepconnectivity.ts buildMepGraph) is the wrong base for length: on 3 of 6
  real plan sheets it noded at a 109-146 px grid (4 ft at sheet scale). MCP
  measure_line commits agent runs as ink (no reviewed:false) and skips the
  mixed-scale warning. Real sets draw duct double-line with the size text
  inside; the two edge strokes sit exactly one nominal width apart at sheet
  scale on 15/15 labels across two drafters (plan §3.3) — a cross-check no
  product ships.

════ MEASURE — four instruments, none substitutes for another ══════════
  1  REGRESSION GUARD: cd opentakeoff/web && npm run check ; cd ../mcp && npm test
     Both green before and after every commit. The One-Click bench
     (bench/results.json) must not change. corpus-eval
     (OPENTAKEOFF_EVAL_NO_CACHE=1 npm run eval:corpus -- ../../opentakeoff-corpus
     from mcp/) must report takeoff, reference and graph metrics unchanged —
     run it once per WP, not per commit (it is heavy; one heavy job at a time).
  2  LINEAR BENCH (you build it in WP1, it grows every WP):
       cd opentakeoff/web && npm run bench:linear
     Pinned real goldens (ground_truth/linear/*.json, authored from renders)
     + synthetic truth-by-construction sheets (bench/linear/synthetic/*.pdf
     generated by a script you write, not hand-drawn). Reports, per sheet
     and macro: run recall / precision (discrete Frechet < 2 pt, length
     overlap >= 80%), length error %, size accuracy (exact + length-weighted,
     no-label vs wrong-label separated), vertex/fitting F1 (5 pt radius, kind
     agreement), stop-reason accuracy, over-trace rate, withheld
     correctness, determinism (shuffle / rotate 90° / translate / scale),
     canvas==MCP parity, build ms and click ms. Writes bench/linear/
     results.json; CI diff-gates it exactly like results.json (#198 pattern).
     Thresholds are ratcheted from measured baselines with a written margin
     (bench/run.mts THRESHOLDS comment is the model) — never chosen for comfort.
  3  PROBES: the plan's probe scripts are your smoke test that extraction
     and text layers still say what §3 says. Run after any oneclick.ts change.
  4  NEW-DOCUMENT TEST (the only test of the actual goal): at the end of
     WP4 and again at DONE, ask the user for one real mechanical PDF in NO
     tier of this corpus; trace every supply main and every hydronic main on
     its plan sheets through the UI and through MCP; report exactly what it
     produced, including every refusal and every withheld size.

════ THE LOOP ══════════════════════════════════════════════════════════
  measure 1+2 → take the next QUEUE item → AUDIT FIRST (grep for the
  capability; this codebase is large and mature — plan §2 lists 15 reusable
  building blocks by file:line) → write the failing test / golden FIRST →
  implement on the shared path → verify 1+2 (+3 if extraction touched) →
  adversarial verify (PARALLELISM §V) → catalogue entry (root cause,
  evidence, what every number did, held-out result) → PROGRESS.md entry →
  commit → repeat. One WP at a time; WP steps in order unless marked ∥.

════ THE QUEUE — work packages, in order ═══════════════════════════════

  WP0  HYGIENE (1 week). Nothing else starts before this is green.
    0.1 mcp/src/session.ts measureLine + measurePolygon (+ measureSurface if
        the doctrine says so): stamp origin.reviewed:false and proposed_ts
        exactly as deriveTransitions does (S:2452-2456). Test: a measure_line
        commit exported by export_takeoff and parsed by
        web/src/lib/importTakeoff.js lands PENDING. (plan bug B-L1)
    0.2 Apply scaleWarningFor to measureLine and measureSurface
        (S:2037-2072). Test in mcp/test/scalewarn.test.ts. (B-L2)
    0.3 oneclick.ts extractVectorGeometry: capture setDash (per-segment dash
        code + per-sheet dashPatterns table) and stroke RGB, ADDITIVELY.
        Gate: every existing web test + bench + probe output byte-identical
        (the new fields are extra; nothing else moves). (B-L5)
    0.4 Load-time shape sanitizer (measure_role in the enum, verts_norm a
        finite [n>=2][2] array in [0,1], computed healed) in the hydrate
        path, additive, with a test. (B-L4)
    0.5 README.md / FEATURES.md / USER_GUIDE.md: remove "Curved Line" tool
        drift (B-L3). Docs only.
    0.6 takeoffWorkflow.js:220-224: goals mentioning LF / duct length / pipe
        length no longer classify as scale_refuse; classify as
        linear_run (workflow to be filled in WP7) with a test.
    0.7 mepsystems.ts: add M-CONT-* / CONT / STAT tokens to CONTROLS with a
        test on the Weld p7 layer list (plan §3.1). LAW L1: tokens confirm a
        layer name; nothing else classifies by them.
    GATE 0: check + mcp tests green; corpus-eval unchanged; probes unchanged
            except the two new fields appear.

  WP1  MANUAL SIZED RUNS + THE BENCH (3 weeks).
    1.1 Schema (plan §7.1): shape gains authored `run{system,status,
        size_overrides,vertex_overrides,params}` and derived
        `computed.run{segments[],vertices[],risers[],wall_crossings,
        totals_by_size}`. computeShapeMetrics (shapeMetrics.js:16) derives
        computed.run from verts_norm + upp + run; vertex kinds from turn
        angles (elbow 90/45 ±6°, else custom); size carried along segments
        from size_overrides. A shape with no run block prices byte-identically
        to today (golden: totals/report CSV/XLSX/DXF/marked-set fixtures).
    1.2 Condition gains family/system/size/assembly_id (plan §7.2; D1: one
        condition per SYSTEM, size on segments, per-size templates offered)
        in canvasUtil.js instantiateTemplate, plays.js COND_KEEP, templates,
        profile, MCP Condition type + edit_condition. Additive; sanitize
        gates; importTakeoff merge rules + tests.
    1.3 Canvas Linear tool (manual mode only): segment + intersection snap
        beside the endpoint snap; Backspace / Shift-ortho / double-click /
        Enter / Continue (Esc) flow; right-click segment → Set size…;
        per-segment size rows under MEASUREMENTS; vertex glyphs by kind on a
        selected run; 12′ amber disabled for routed conditions. All chrome
        in TakeoffCanvas.jsx; all decisions in web/src/lib/linear/.
    1.4 Outputs, additive: per-size rows in the Takeoffs panel; Report
        "Linear runs" tab; report.v1 `linear_runs` block (mirror of
        roll_goods, totals.js:471-499 + outputs.ts:1207-1233); XLSX tab;
        DXF layer per size (OT-<TAG>-LINEAR-<SIZE>); marked-set size on the
        chip; revisions.js + snapshotDiff.js fields. Frozen-13 CSV untouched
        (report-csv-golden.test.ts stays green unchanged).
    1.5 MCP: measure_line accepts size/system/vertices and returns
        computed.run; edit_run verb (revise stage) for overrides; staging
        row; outputs schema; tool-count sync in the five places
        (AGENTS.md list). mcp/test/linearParity.test.ts: canvas and MCP
        price the same run identically.
    1.6 THE BENCH v1: bench/linear.mts + score.ts; the synthetic generator
        (random duct/pipe networks → PDF via pdf-lib, varying pen, dash,
        double-line width, labels inside/beside/leader, crossings, arcs as
        polylines, text gaps — plan Appendix E's ten hardest cases first);
        metrics 2 above wired for MANUAL runs first (parity, determinism,
        totals). CI job step + results.json diff gate.
    1.7 GROUND TRUTH v1 (HELD-OUT rules below): author Bessemer M101 + P101
        runs by hand in the canvas (manual mode), pin as goldens.
    GATE 1: an estimator (you, in the running app via `npm run dev`, then
            the user) traces Bessemer M101 supply mains by hand with sizes
            in < 10 min; per-size LF reconciles to the hand takeoff within
            1%; bench:linear green; regression guard green.

  WP2  ASSEMBLIES (3 weeks).
    2.1 web/src/lib/linear/rates.ts + tables/*.json: every cell
        {value, grade:"C"|"V"|"M", source} from plans/03-research/02-*.md
        (galvanized lb/ft², simplified gauge schedule, duct hanger spacing,
        MSS SP-58 / IPC 308.5 / IMC 305.4 / UPC 313.3 / UPC 313.6, ASHRAE
        90.1 6.8.3, joint-hour grid, BAS units, waste). LAW L10: no licensed
        MCAA/Wendes/SMACNA table values; the grid ships as order-of-magnitude
        [M] defaults; the profile gains a CSV import of the estimator's own
        licensed units (schema family,size_key,joint_type,unit,hours,source;
        MCAA WebLEM export layout first — D6). Default hanger tables per D3
        (duct IMC 603.10 + SMACNA 5-1/5-2; mechanical pipe MSS SP-58 T4;
        plumbing IPC 308.5; UPC/IMC selectable as the adopted code).
    2.2 assembly.ts resolveLinearAssembly(run, condition, assembly,
        settings) → line items {item, qty, unit, basis, size_key,
        source_vertices, formula, provenance} in the fixed order of plan §8
        (per foot → per vertex → per run → allowances → ×multiplier; waste
        and rounding REPORT ONLY). Invariants §8.5 as tests: tees count
        once; Σ LF_size = LF; withheld sizes still measure; allowances are
        separate lines; live numbers never carry waste; deterministic; pure.
        `deduct_fittings` per assembly, default OFF (D2). Golden JSON for the
        worked example §8.4 with the switch off AND on.
    2.3 Materials rows: basis gains "vertex" and "run"; rows gain
        hours_per_unit; totals.js:85-91 resolves them through the existing
        ceil rule; TakeoffsPanel basis select; MCP edit_materials + agent
        edit_materials schema.
    2.4 Assembly library records in the estimator profile (.otprofile,
        profile.js:46-57) seeded with §5.5 defaults + provenance strings;
        project settings (adopted hanger table, climate zone, pressure class
        by system, stick length, level heights, offset allowance) persisted
        and sanitized; report.v1 additive block.
    2.5 Report "Fittings & supports" tab; buy list rows from vertex/run
        bases; MCP resolve_linear_assembly (measure stage).
    GATE 2: §8.4 golden reproduced byte-identically on canvas and MCP; every
            table cell carries a grade and a source; a [M] cell cannot be
            marked C without a source URL in the same commit; guard green.

  WP3  TRACE ENGINE — SINGLE-LINE (5 weeks). Trace mode behind a prefs flag
       (prefs.js), default OFF until GATE 4.
    3.1 strokes.ts: exclusion (SEG_CLIP, SEG_FILLONLY, text boxes, annotation /
        finish-pattern layers, hatch rows, networkWallSegs vouch when layer
        signal is weak — the same excludeSegs composition ensureMepGraph
        builds, S:3437); families by (pen nibble, dash, layer, lum, rgb);
        evidence grades a-d of plan §6.2; StrokeClasses output with named
        factors. Test on Bessemer (pen 4), ITD (pen 3), Weld (M-HVAC-DUCT).
    3.2 index.ts: flatbush (ISC) over candidate segment bboxes + kdbush over
        endpoints, built in worker.ts, cached per (sheet, scale) like
        netCacheRef; exact nearest-segment query with incremental neighbours;
        hit tolerance max(11/zoom, ½ stroke + 0.5 px).
    3.3 graph.ts: lazy endpoint welding at τ = max(0.75 px, 0.02 ft·ppf),
        snap-rounded, robust-predicates orient2d; node typing end / collinear
        / elbow / tee / crossing / ambiguous with the continuation map
        (plan §6.3). NO global noding. NO JTS on this path.
    3.4 walk.ts: the bidirectional walker of §6.4 with stop reasons
        (dead_end, equipment, sheet_edge, riser, branch_joins_main,
        ambiguous, family_change, cap); same-family continuity; curve chains
        collapsed to arc vertices with fitted radius (reuse
        markPolylineArcs' circle fit); hop/length caps disclosed.
    3.5 sizes.ts: Appendix A grammar (all forms in plan §3.1 incl. Unicode
        fractions, rotated labels, multi-service, riser qualifiers; negative
        grammar for BOD/AFF/MIN/MAX/O.C./TYP/dimension strings/schedule
        cells/legend block/keyed notes); association scored by orientation
        (label rot ∥ run ±10°), placement (inside/beside/leader via
        leaderTerminalPointsForLabel), uniqueness; size carried along the
        run until the next label / branch / transition; conflicts →
        withheld with both values. Unit tests: every label string in plan
        §3.1 parses to the stated size; every negative example is rejected.
    3.6 receipt.ts + refusals (plan §6.8 texts verbatim); origin.method
        "traced", reviewed:false, trace receipt {seed, segs, labels,
        drawn_width_px, stops, candidates, factors}; commit through ONE
        `add` (one ⌘Z) like Transitions (TC:9864).
    3.7 Canvas Trace mode UI: hover highlight of the candidate run + chip
        (size · system · LF · fittings ahead); click stages a dashed
        proposal; Q accepts the read size; Accept pill inks; refusal drops to
        manual keeping the seed. MCP classify_strokes (setup) + trace_run
        (measure, FIND-ONLY unless commit:true) with withheld[] and
        candidates[]; staging rows; instructions step; docs.
    3.8 Ground truth v2: P101 (Bessemer), federal p6 (hydronic), ITD p5
        (piping) hand-traced from renders BEFORE the engine runs on them.
    GATE 3: on the development tier: run recall ≥ 0.85, precision ≥ 0.95,
            length error ≤ 3%, over-trace ≤ 3%, size accuracy ≥ 0.90
            length-weighted, click-to-proposal < 16 ms, per-sheet build
            < 400 ms at 100k segs in the worker; held-out tier within 5
            points of development on every metric; guard green.

  WP4  DOUBLE-LINE DUCT (5 weeks).
    4.1 pair.ts: pair search at the seed (parallel ≤ 2°, offset within
        [2 px, 96"·ppf], overlap ≥ 60%, same family; prefer offset ≈ label
        width ±1.5 px); lock-step following of both edges; centreline
        emission; drawn_width_px per segment.
    4.2 Fittings from pair geometry: transition (converging edges),
        radius elbow (concentric arc chains → centre radius), mitred elbow,
        tee/tap (third pair or single line leaving one edge; bridge the
        broken edge because the other edge continues), end cap
        (perpendicular / semicircle), symbol gap (diffuser footprint via
        inlinemotif fingerprints) bridged ≤ bridge px and recorded.
    4.3 Width cross-check: |drawn − label| ≤ 0.5" passes; else size WITHHELD
        with both values (never averaged). First mismatch on a sheet raises
        the Check-a-dimension flow ("the drawn 12x6 measures 24 in wide — is
        the scale 2× off?") with one-tap recalibrate.
    4.4 Single-line duct falls through to WP3 with the label supplying both
        dimensions; drawn_width absent and disclosed.
    4.5 Ground truth v3: ITD p3 (dense AutoCAD), federal p4 (182 labels),
        Weld p7 — authored BEFORE the engine runs on them.
    GATE 4: development tier: size accuracy ≥ 0.95 length-weighted,
            wrong-label ≤ 1%, vertex/fitting F1 ≥ 0.85 (elbows/tees), run
            recall ≥ 0.90, length error ≤ 2% per sheet, over-trace ≤ 2%;
            held-out within 5 points; NEW-DOCUMENT TEST #1 run and reported;
            Trace mode flag flips to default ON in this commit only if every
            number above is met on BOTH tiers.

  WP5  LEGEND, LAYERS, STATUS, RISERS (3 weeks).
    5.1 legendlearn.ts: capture each legend line swatch's (pen, dash, rgb)
        beside its caption (isRoutedSystemCaption already recognises the
        captions) → per-sheet key {system, status:new|existing|demo}. Test
        on Bessemer MP001 (three strokes per system) and the Weld legend.
    5.2 System priority in vertices.ts: bound label suffix > legend key >
        layer name > condition default; status from legend else "unknown";
        an existing-to-remain run NEVER resolves as new (test).
    5.3 layers.ts + LayerPanel: a "Routed" role users set per layer, feeding
        strokes.ts as evidence grade (a).
    5.4 Risers: UP/DN/UP/DN in bound labels, keyed notes bound by leader,
        the riser glyph (stub + arrowhead; export controlSchematic.ts's
        arrowhead detector), plumbing circle-with-stub → riser vertex;
        rise_ft from the level table (sheetLevels.js) when the run's sheet
        has a level and the user picks "to level above/below", else
        not_drawn and disclosed — never silently added, never on
        double-click.
    5.5 Wall crossings for sleeves/firestop computed after commit against
        networkWallSegs faces; disclosed with the wall role confidence.
    GATE 5: Weld p7 systems from layers; Bessemer statuses from the legend;
            existing-to-remain never counted; P101 risers found ≥ 0.90
            recall; guard + bench green on both tiers.

  WP6  SCALE REGIONS (2 weeks) — may run ∥ after WP1.
    6.1 sheets[] gains scale_regions[{id, rect_norm, units_per_px, label,
        source}] persisted/sanitized/exported; panelGeometry.js uppFor(key,
        point) resolves the containing region else the sheet scale; every
        caller that prices a point (commitLinear, computeShapeMetrics via
        verts, MCP measure*) passes the point.
    6.2 Detection: detectScale multi → associate each note with the nearest
        enclosing viewport frame (ENLARGED/DETAIL titles, drawn border) →
        propose regions; confirm-to-apply; ruler guide bar inside the
        region; K-flow inside a region.
    6.3 Runs refuse to cross a region boundary (SPAN_MSG idiom); MCP
        set_scale_region (setup, scaleConfirmed:false for agents).
    GATE 6: federal p7 (1/4" in a 1/8" set), Bessemer P501 and ITD p7 (3/8"
            details) measure correctly inside their regions; a run crossing
            a boundary refuses with the named message; guard green.

  WP7  AGENT + BAS LINEAR (3 weeks).
    7.1 agentTools.js: propose_runs (MEASURE_ROLES + "linear", minPts 2,
        open polyline evidence), trace_run and classify_strokes; agentLoop.js
        standard finish for a routed system (legend → classify → mains →
        branches → sizes → assembly → export); every proposal lands in the
        Accept gate; agentTools.test.ts + agentLoop.test.ts.
    7.2 BAS conditions: cable trunk (drawn daisy-chain), home-run per point
        (points × ft_per_point from the existing points register), conduit
        share, pneumatic tubing; assemblies from §5.3 with [M] grades; tie to
        basPointLists.ts per-controller point counts. bas_engine is NOT
        touched (D4); cable/conduit/tubing LF are assembly.ts quantities.
    GATE 7: the agent traces one supply system on Bessemer end-to-end into
            a priced report with receipts, through the UI and through MCP,
            with zero direct commits; BAS cable LF per controller from a
            traced trunk on tinker-afb-iwcs-controls.pdf or the navfac set;
            guard green.

  WP8  BENCH + HARDENING + DOCS (2 weeks).
    8.1 bench:linear joins `npm run check`; thresholds ratcheted from the
        measured baselines with the written margin rule; determinism
        property tests (shuffle, rotate, translate, scale, worker timing);
        perf on navfac (75 sheets) with per-sheet budgets and the segment
        ceiling pattern from vectorTakeoffPipeline.ts.
    8.2 Annotator-agreement study: 20% of the ground truth re-traced blind;
        the agreement bound is written into bench/linear/README.md and every
        metric is reported against it.
    8.3 Docs sync (AGENTS.md list): README, USER_GUIDE §5 Linear/§4
        conditions, AGENT_GUIDE doctrine (withheld size still measures; a run
        never crosses a scale region; rise_ft only from a level/callout),
        MCP.md + mcp/README.md tool rows, server.ts instructions, tool count
        in five places, mcp/package.json + server.json + .well-known version
        bump (check `git show HEAD:mcp/package.json` first), CHANGELOG.
    8.4 NEW-DOCUMENT TEST #2.
    GATE 8: all §12.2 gates green in CI on both tiers; docs and counts in
            sync (check-tool-count green); PROGRESS.md carries the final
            verified baseline table.

════ HELD-OUT TIER — the mechanism that makes L2 real ══════════════════
  DEVELOPMENT sheets (trace against, tune against):
    bessemer M101 (p6), P101 (p3); itd-d1-lab p3, p5; federal-attachment4
    p4, p6; weld-county p7.
  HELD-OUT sheets (NEVER traced against during a fix; measured only at the
  end of each WP, after the development tier already passes):
    itd-d1-lab p4; federal-attachment4 p7; baker-county-eoc p38;
    bldg5406-hvac-demo M-101 (p2) and P-101 (p14); navfac-cherry-point-atc
    two plan sheets chosen by the coordinator ONCE, written to
    opentakeoff-corpus/reports/LINEAR_HELDOUT.txt and committed before WP3
    starts.
  GROUND-TRUTH AUTHORING RULE: every golden is traced from the RENDER
  (mcp/scripts/graph-render.mjs or the probes' render.mts) with scope
  (which runs, which systems, which sheet) written into the JSON BEFORE the
  engine is run on that sheet. A golden is never edited to pass. A golden
  that looks wrong → STOP, write it up in LINEAR_BUG_CATALOGUE.md, do not
  touch it. Each golden records the annotator, the date, and the render
  hash. 20% of goldens are re-traced blind by a second pass (WP8.2).
  A metric that passes development and fails held-out by > 5 points means
  the engine learned the documents, not the structure. That is a FAILED
  step, not a partial one — revert and re-root-cause.

════ PARALLELISM (ultracode execution policy) ══════════════════════════
  ∥  MAY fan out, in worktrees, with NON-OVERLAPPING file sets:
     - within a WP: independent pure modules (sizes.ts grammar ∥ walk.ts ∥
       assembly.ts ∥ synthetic generator) each with its own test file;
     - ground-truth authoring (one agent per sheet, render-first rule);
     - research reads (the plan §2 building blocks) and docs (WP8.3);
     - WP6 alongside WP2-WP5 (different files).
  ═  MUST serialize (one agent, one commit at a time):
     - TakeoffCanvas.jsx (14k-line monolith; two agents editing it =
       merge hell) and TakeoffsPanel.jsx / ReportPanel.jsx;
     - schema files (shapeMetrics.js, totals.js, shapeCommands.js, store.js,
       importTakeoff.js) — the shared path is edited by one hand;
     - session.ts / tools.ts / outputs.ts / staging.ts as one unit;
     - anything that regenerates bench results.
  V  ADVERSARIAL VERIFY every fix before it is called done: a second,
     independent agent that has NOT seen the fix tries to break it —
     (a) on a development sheet it was not tuned on, (b) on the synthetic
     hardest cases, (c) by asking "which law does this violate?" If the
     verifier finds a break, the fix goes back; the verifier's evidence goes
     in the catalogue either way. Two verifiers on schema and assembly
     changes; one on chrome.
  1  ONE HEAVY JOB AT A TIME: corpus-eval, the navfac perf run, a full bench
     over all sheets, and any whole-corpus probe never overlap (memory
     ceiling; AGENTS.md). No cloud workers (root AGENTS.md coordinator
     policy).
  R  REPORT every measured result to the user immediately after it
     completes, and always report the whole instrument (every metric, both
     tiers, regressions included) — never the targeted metric alone.

════ DONE ══════════════════════════════════════════════════════════════
  GATE 0-8 all measured true on BOTH tiers AND
  bench:linear in `npm run check` with ratcheted thresholds AND
  corpus-eval takeoff / reference / graph metrics unchanged from the WP0
    baseline AND
  both NEW-DOCUMENT TESTS run and reported honestly, every refusal
    included AND
  every LINEAR_BUG_CATALOGUE.md entry carries a structural root cause AND
  every rate-table cell carries a grade and a source; zero licensed values AND
  the PR is green and mergeable and the user has been told what merging
    deploys.
  NOT done at "the number went up." NOT done while any metric passes only
  on the development tier. NOT done with a flag flipped that GATE 4 did
  not earn.

════ LAWS ══════════════════════════════════════════════════════════════
  L1  Regex never classifies — structure does. Regex may CONFIRM (a label
      string confirms a size; geometry decides what it binds to).
  L2  The corpus is the proving ground, not the finish line. A fix that
      only works because it recognises a PDF, tag, pen number, sheet or
      corpus id is a REGRESSION even if the score rises. Pen nibbles and
      layer names are evidence per sheet, never constants.
  L3  Audit before you build. Plan §2 lists what exists by file:line.
  L4  Never invent a quantity, size, vertex, rise or location. Refuse and
      disclose; a withheld size still measures LF.
  L5  Length is measured on the drawing's own coordinates. Nothing on the
      length path may quantize, node globally, or coarsen-and-retry.
  L6  Scale is a gate. No run prices without uppFor; agent scales stay
      unconfirmed; runs never cross a scale region.
  L7  Machine work is pencil until a person inks it. Every traced, derived
      or agent run commits reviewed:false through the review command.
  L8  Waste and rounding live in the report only. Live numbers never carry
      them; allowances are their own disclosed lines.
  L9  Shared path. Every decision about length, size, vertex, quantity or
      refusal lives in web/src/lib/linear/* and is imported by both the
      canvas and mcp/src/session.ts. Chrome stays in the canvas.
  L10 No licensed table values ship (MCAA, Wendes, SMACNA cells). Every
      shipped cell carries a provenance grade; [M] cells are editable
      defaults, never labelled as the standard.
  L11 Additive only. A shape with no run block, a condition with no family,
      a report with no linear_runs block behave byte-identically to HEAD.

════ ANTI-GAMING — read twice ══════════════════════════════════════════
  NEVER edit, extend, narrow or "correct" a golden, a key, or bench
    results to pass. A golden that looks wrong → STOP, write it up.
  NEVER move a sheet, run or label out of scope so it falls off the report.
  NEVER skip, disable, xfail or delete a test; never lower a threshold
    without the measured margin written beside it.
  NEVER special-case a document, sheet, tag, pen value or layer name.
  NEVER read a held-out finding while a fix is in progress.
  NEVER flip the Trace flag on because a demo looked good.
  An improvement you cannot explain structurally is a bug you haven't found.
    Revert it. A true 92% you can explain beats a claimed 98% you can't.

════ BLOCKED ═══════════════════════════════════════════════════════════
  Root cause in a file you don't own · a golden that looks wrong · a
  standards cell you cannot source · a failure you can't reproduce · a
  sheet whose text layer is vector-outlined glyphs (out of scope, per
  goals/VECTORGRID_TABLE_BOXES.md) → catalogue with evidence → next queue
  item. Never stall. Never reach across the boundary to unblock yourself.
```

---

## `/goal` one-liner

```text
/goal Execute opentakeoff-corpus/goals/LINEAR_TAKEOFF.md in full, WP0 → WP8
in order (WP6 may run in parallel after WP1). Branch linear-takeoff; draft
PR at WP1; never merge (merge = deploy). Shared path only
(web/src/lib/linear/* imported by canvas AND mcp). Length on the drawing's
own coordinates, never a noded/quantized graph. Size read from the drawing,
cross-checked against the drawn duct width, withheld on conflict, always
editable. Fittings from geometry with the rule shown. Pencil until inked.
Waste in the report only. Every rate-table cell graded and sourced; no
licensed values. Ground truth authored from renders before the engine runs;
held-out tier never traced against; a held-out gap > 5 points is a failed
fix. bench:linear in `npm run check`; corpus-eval unchanged. Ultracode: fan
out only non-overlapping pure modules and ground-truth authoring; serialize
TakeoffCanvas.jsx, the schema files and the MCP unit; adversarially verify
every fix with an agent that has not seen it; one heavy job at a time; no
cloud workers. Report every instrument in full, both tiers, after every
run. Done only when GATE 0-8 are measured true on both tiers and both
new-document tests are reported honestly.
```
