# Goal: assemblies — every counted unit expands into its points, devices and hook-ups, cite-backed and vendor-neutral

Opened and owner-approved 2026-09-23. **Not started.** To run it, paste the
KICKOFF PROMPT at the end of this file as a session's first message. This goal
has two supporting documents:
- `plans/04-assemblies-plan.md`: what assemblies are, what partners need, what
  the repo already has, and the design.
- `plans/04-research/01–06`: the research, with every citation.

This file is the executable goal: what to build, in what order, how each step
is measured, and what is never allowed. It is written for an autonomous
coordinator running a goal loop. Read it top to bottom once, then work THE
QUEUE.

**Scope, set by the user (2026-09-23):**
- US only.
- The tool is a free, vendor-neutral takeoff tool that Siemens provides to its
  US HVAC and BAS partners. Assemblies must work for every partner: controls
  integrators, mechanical contractors and distributors.
- Product matching (model and part numbers) belongs to HIT, Desigo Select, or
  the partner's own tool.
- Output is CSV and PDF, plus the existing HIT valve workbook. No connectors.
- No pricing ships. Partners may add their own prices and labor.

**This goal amends a standing boundary. The owner confirmed the amendment on
2026-09-23**, and a banner at the top of `opentakeoff/docs/BAS_PRODUCTION_GOAL.md`
records it. That file's first "Non-negotiable boundaries" bullet forbids
"costs, prices, quotations, monetary totals, labor hours, productivity rates,
commercial estimating, or supplier/product catalogs". This goal:
- **allows** typical-derived points and devices, always labelled as derived
  from an explicit recipe and never as extracted fact;
- **allows** optional partner-entered prices and hours, as opaque partner data;
- **keeps forbidden** product catalogs, product selection, and any shipped
  price, rate or labor-hour number.

Every other standing rule still applies verbatim: root `AGENTS.md` (shared path,
coordinator-only), `opentakeoff/AGENTS.md` (shipping, doc sync), `GOAL.md`
"Platform mandate", and `GOAL_LOOPS.md` (LAWS, ANTI-GAMING).

This loop runs **beside** the tag census/reconcile loop (plans/03-drawing-tag-
recognition-audit.md) and the linear loop. It consumes their outputs and never
edits their internals.

## Decisions (settled 2026-09-23 from the research — not open questions)

| # | Decision | Why (evidence) |
|---|---|---|
| D1 | **Vendor-neutral core.** Lines carry roles plus selection parameters and never a product, model or part number. Vendor specifics live only in export adapters. | User direction. Every selection tool researched takes the same small set of neutral inputs (plan §5; research 03 §4). |
| D2 | **No shipped prices, rates or labor hours.** Partners may enter their own values as opaque data. Lines carry **labor-task hooks**: task + driver, no numbers. | User direction; the precedent is LINEAR D6 ("no licensed labor tables ship"). BAS labor units live in company spreadsheets and vendor tools; no public manual exists (research 05 §3.3). |
| D3 | **An assembly is a recipe keyed to an equipment family plus normalized attributes.** It is chosen by a selector with a specificity rank, and variants are options, not copies. | Every tool uses recipe → lines (research 01 §13). Libraries of 9,500–500,000 copied variants show the explosion. IntelliBid/AutoBid keep options inside one assembly. |
| D4 | **Devices and points are separate lines.** A point names its device role. | UFGS 23 09 00 §3.3; UFC 3-410-02 §5-5.1; the repo's BAS doctrine ("An I/O observation is not a device"). |
| D5 | **Vocabularies:** ASHRAE 223P classes for device roles; Haystack Xeto `ph.points` names for point functions; UFC 3-410-02 Appendix E mnemonics for display; Brick as an alternate ID. | All permissive. 223P is Apache-2.0, Xeto AFL-3.0, Brick BSD-3; the 223P and Xeto licenses were verified (research 02 §1f). |
| D6 | **Evidence precedence:** a printed points list or drawing-declared components > schedule attributes > partner project variables > partner library defaults > starter defaults. **Unknown stays `unresolved`.** | GOAL L4 (never invent). Existing BAS register and points workflow. Plan §8.1 A3/A4. |
| D7 | **Library home:** `assembly_library` in the estimator profile (`.otprofile`) gains a `kind` field, and records without `kind` (linear) resolve byte-identically. Projects embed the assembly versions they used. | `profile.js`, `linear/assemblyLibrary.ts`. The Quick Bid pitfall: master edits silently change every assembly (research 01). |
| D8 | **Expressions** use a small, safe, Excel-like language: parsed, never passed to `eval`. References are validated on load and on edit. The fixed order is qty → waste → rounding, rounding happens at roll-up, and every stage is exported. | STACK's misspelled-variable pitfall; Quick Bid's rounding-changes-waste pitfall (research 01). The linear goal's live-vs-order precedent. |
| D9 | **Exports:** a published CSV set plus PDF plus the HIT adapter. Desigo Select gets a **hand-entry worksheet** because no import is documented. | Research 03 §2–§4. |
| D10 | **Starter library sources.** BAS: UFC 3-410-01 (2025) Table 3-1; UFGS 23 09 00/13/93; UFC 3-410-02; LBNL Modelica Buildings Library G36 (BSD-3-Clause-LBNL); 223P/Xeto/Brick. Hook-ups: the UFGS mechanical sections (23 64 26, 23 21 13, 23 21 23, 23 22 26, 23 30 00, 23 05 93, 23 81 47, 23 57 10, 23 64 10, 23 65 00, 23 52 00) and VA master specs, all US Government works. **ASHRAE text is never copied.** | Research 02 licensing summary; research 04 §7. UFC 3-410-01 public-release status and Table 3-1 were verified. |
| D11 | **Fix the HIT adapter's semantics first (WP0.4), because partners may already be using the export.** Column H `CoilDP` ("Consumer Δp") is the coil's drop, not the valve's (GPM/Cv)². Tolerance is limited to {10,20,30,40,50}. The signal default must be disclosed. **Until the HIT owners confirm, leave H blank** rather than keep the wrong value, and put coil Δp and valve Δp in `valves.csv` (WP7). | Verified in the committed workbook's defined names and validations (plan §5). A wrong number in a sizing input is worse than a blank the partner fills. |
| D12 | **Controller I/O is tallied in TypeScript** (sums by unit, building and floor). `bas_engine/**` is not touched by this goal. | The static host cannot run Python. The tallies are simple sums; bas_engine owns capacity math under its own contracts. |
| D13 | **Two per-project settings drive hook-ups.** (1) A **hook-up profile**: balancing method, kits/hoses allowed and maximum kit size, 3-way allowed, P/T and thermometer policy, union→flange size. (2) An editable **responsibility matrix** (furnish / install / low-voltage wiring / line power / program / test) that defaults to the VA 23 09 23 Responsibility Table. Component lines carry **size and end type** so partner labor units apply. | Research 04: the variants come from the spec or owner standard, not the schedule, and the sources conflict (UFGS vs NSCS vs IMEG). VA 23 09 23's table was verified. Labor units are keyed item × size × material × joint (MCAA/PHCC structure). |
| D14 | **Optional partner price/labor fields are in scope (WP9).** Partner-entered, opaque, labelled "partner-entered" everywhere, and never shipped. | Owner approval, 2026-09-23. The user expects partners to need their own prices. |

---

```
GOAL LOOP S — assemblies: read the unit, pick the recipe, expand it, cite it, export it

REPO      erikjohnstone/master-plan
BRANCH    ONE long-lived feature branch `assemblies`, created from `main` once
          the branch carrying this goal (claude/affectionate-darwin-316fwo)
          has merged; until then, create it from that branch. Small
          commits, one WP step each. Every commit body states SHOULD-THIS-BE-ON-
          THE-SHARED-PATH and the before/after numbers. Open a DRAFT PR at the
          end of WP2 and keep it updated. NEVER merge to main yourself — merge
          is deploy (opentakeoff/AGENTS.md "Shipping"). Every commit leaves
          main-merge safe: with no assembly applied, every existing output is
          byte-identical (golden tests enforce this).

WHO       One coordinator, coordinator-only per root AGENTS.md (no subagents
          unless the user re-enables delegation). One heavy job at a time.

════ SETUP (first 15 minutes) ══════════════════════════════════════════
  cd opentakeoff/web && nvm use && npm install && npm run check
  cd ../mcp && npm install && npm test && npm run test:bas
  (If either is red at HEAD, STOP and report. Do not start on red.)
  Read once: plans/04-assemblies-plan.md (all); research 02 §3a–3b,
  research 03 §4–§5, research 04 synthesis; opentakeoff/AGENTS.md;
  opentakeoff-corpus/GOAL_LOOPS.md (LAWS, ANTI-GAMING);
  opentakeoff-corpus/takeoffs/HVAC_BAS_DOMAIN_MAP.md.
  VectorGrid must be running for any compile you measure: set
  OPENTAKEOFF_VECTORGRID_PYTHON / OPENTAKEOFF_TABLE_SIDECAR_PYTHON to a python
  with opentakeoff/sidecar/requirements.txt + pymupdf. PR #101 records how a
  silently missing sidecar undercounted navfac by 21 valve rows.

════ WHAT YOU OWN ══════════════════════════════════════════════════════
  NEW  opentakeoff/web/src/lib/assemblies/**      the engine (pure TS, zod)
         attributes.ts   canonical attribute schema per family (units, enums)
         normalize.ts    structural attribute extraction from compile items
         expr.ts         expression parser/evaluator (no eval) + ref validation
         schema.ts       AssemblyDefinition / ApplicationRecord / ExpandedLine
         select.ts       selector + options + precedence (D6)
         expand.ts       lines, quantity pipeline (D8), provenance
         rollup.ts       breakdowns (building / floor / system / family)
         exports/*.ts    CSV set, PDF section, Desigo Select worksheet
         starter/us-typicals-v1.json, starter/us-hookups-v1.json, starter/NOTICE.md
  NEW  opentakeoff/web/test/assemblies/**, opentakeoff/mcp/test/assemblies*.test.ts
  NEW  opentakeoff/mcp/scripts/assemblies-baseline.mjs, assemblies-attr-eval.mjs,
       assemblies-typical-eval.mjs, assemblies-points-compare.mjs,
       export-assemblies.mjs
  NEW  opentakeoff-corpus/keys/<set>.attrs.csv, <set>.typicals.csv
       (authored under TRUTH below, and ONLY those two suffixes)
  NEW  opentakeoff-corpus/ASSEMBLIES_BUG_CATALOGUE.md  (append-only)
  NEW  opentakeoff-corpus/reports/assemblies/**  (baseline and gate reports)
  NEW  UI: opentakeoff/web/src/components/AssembliesPanel.jsx (Takeoff panel
       view + exceptions list) and an Assemblies library tab beside Materials
  EXTEND (additively, on the shared path):
       web/src/lib/linear/assemblyLibrary.ts   sanitizer learns `kind`; no-kind
                                               records untouched
       web/src/lib/profile.js, store.js        library + project embedding
       web/src/lib/valveSizeExport.ts          D11 fixes + coil-derived valves
       web/src/lib/agentTakeoff.js             UI export wrappers
       mcp/src/tools.ts, session.ts, staging.ts, mcp/server.ts, outputs
       docs: README.md, FEATURES.md, docs/USER_GUIDE.md, docs/AGENT_GUIDE.md,
       docs/MCP.md, mcp/README.md, CHANGELOG.md (tool count lives in five
       places — opentakeoff/AGENTS.md sync list)
       opentakeoff/docs/BAS_PRODUCTION_GOAL.md  an amendment banner pointing
                                                here, and nothing else
       opentakeoff-corpus/PROGRESS.md           your entries under "Active work"

════ WHAT YOU NEVER TOUCH ══════════════════════════════════════════════
  opentakeoff-corpus/keys/** except your own *.attrs.csv / *.typicals.csv;
    reports/** except reports/assemblies/**; sets.json; ground_truth/**
  The extraction pipeline: sheetgraph.ts, vectorGrid*, corpusTakeoff.mjs
    family specs / uniqueFamily / extractEmbeddedCoils internals,
    symbolsweep.ts, tagIndex.ts, schedulePlanReconcile.mjs (the tag loop owns
    those). You CALL them. A needed change is catalogued and you stop on that
    item.
  opentakeoff/bas_engine/**, and the BAS workflow contracts/schemas
    (bas*Register.ts, bas*Contract.ts). Read their outputs; never change their
    schemas.
  The linear engine's behaviour: web/src/lib/linear/** except the sanitizer
    `kind` extension.
  Condition palettes and seeded colours (user data per AGENTS.md).

════ THE PROBLEM (measured 2026-09-23; WP0 re-measures at HEAD) ════════
  The takeoff stops at cited equipment rows. Items carry raw schedule cells
  only (corpusTakeoff.mjs scheduleAttrs); there are no normalized attributes.
  Nothing maps a counted unit to its points, devices or hook-ups:
    · Cross-set compile snapshots: 74/116 projects have controls-relevant
      equipment (1,912 units), but only 5/116 yield any points-list rows. For
      the rest the tool produces zero points; the only fallback is a
      hard-coded estimate table (SCHEDULE_POINT_ESTIMATE_PER_UNIT), labelled
      estimate-only and never merged.
    · 12/116 produce control-valve rows. The HIT export ignores the coils
      compileEmbeddedCoilGaps already finds.
    · The HIT export fills CoilDP with the valve's own Δp, accepts any
      tolerance, and defaults "modulating" to 0...10 Vdc.
    · No library, catalogue-free or otherwise, exists for BAS/HVAC typicals.
      The only assembly library is linear duct/pipe (3 seeds).

════ MEASURE — six instruments, none substitutes for another ═══════════
  1  REGRESSION GUARD: web `npm run check`; mcp `npm test` + `npm run test:bas`;
     linear bench `npm run bench:linear` unchanged; corpus-eval
     (OPENTAKEOFF_EVAL_NO_CACHE=1 npm run eval:corpus -- ../../opentakeoff-corpus
     from mcp/) reports takeoff, reference and graph metrics UNCHANGED. Run
     corpus-eval once per WP, not per commit.
  2  ATTRIBUTE EVAL (WP1+):
       cd opentakeoff/mcp && node --import tsx scripts/assemblies-attr-eval.mjs ../../opentakeoff-corpus [--heldout]
     Scored per (instance, attribute) against keys/*.attrs.csv:
       exact · wrong (a value that differs) · invented (a value where the key
       says NOT PRINTED) · missed (null where the key has a value) ·
       correctly-unknown
     Reported per family, per attribute, per set, dev vs held-out.
  3  TYPICAL EVAL (WP5+): scripts/assemblies-typical-eval.mjs against
     keys/*.typicals.csv. Per instance it checks exact typical id + options;
     for an `unresolved`, it checks that the disclosed missing attribute is
     truly absent.
  4  POINTS COMPARE (WP6): scripts/assemblies-points-compare.mjs. On every set
     with a printed points list it diffs, per unit, the typical-derived points
     against the printed ones (io-type counts and functions), and classifies
     every diff.
  5  EXPORT VALIDATION (WP7+):
     · schema tests for every CSV;
     · HIT workbook validation: every dropdown value is in its allowed list,
       tolerance ∈ {10..50}, ≤200 data rows per file or split, protection
       untouched;
     · the PDF renders;
     · library CSV/JSON round-trip is lossless;
     · scripts/export-assemblies.mjs runs on 5 real sets.
  6  NEW-DOCUMENT TEST (the only test of the actual goal): at the end of WP5,
     and again at DONE, ask the user for a real partner job in no tier of this
     corpus. Run it end to end through the UI and through MCP and report
     exactly what it produced, including every unresolved line and exception.

════ TRUTH — how keys are authored (read twice) ════════════════════════
  · Population and sample:
      - Population: equipment-schedule tables in the corpus that the compile
        claims for a controls-relevant family.
      - Draw by a written seed, stratified by family × drafter. Start with
        ≥12 documents and ≥300 instances covering VAV, AHU/DOAS/RTU, FCU,
        pump, fan, UH/CUH, boiler, chiller, cooling tower, HX, ERV,
        humidifier.
      - Freeze ≥5 further documents as HELD-OUT in WP0, BEFORE any
        normalizer code exists. Never tune on them; score them only at gates.
  · Write the scope first: the key's '#' header states which tables/families
    and which attributes it covers, the seed, and what is deliberately not
    counted. Then read the RENDER (mcp/scripts/render-page-crop.mjs at 2–4×)
    and transcribe. Never consult the pipeline's output for that sheet while
    authoring. Where render and pipeline later differ, the RENDER decides.
  · Record every covered attribute. A value that is NOT PRINTED gets an empty
    value and note "not printed". That is what scores "invented".
  · *.attrs.csv columns:
      sheet,table_title,tag,family,attribute,value,unit,source_header,note
  · *.typicals.csv columns (author only after WP4 freezes typical ids/options):
      sheet,tag,family,typical_id,options,basis_note
    Judged the way an estimator would: from the schedule row, its notes, and
    any sequence the sheet points to.
  · A key that looks wrong later → STOP, write it up in the catalogue, do not
    edit it (GOAL_LOOPS ANTI-GAMING).

════ THE LOOP ══════════════════════════════════════════════════════════
  1. Measure 1 (+ the instrument the WP owns).
  2. Take the next QUEUE item.
  3. AUDIT FIRST: plan §7 lists every existing building block by file. Reuse;
     never fork.
  4. Write the failing test or key FIRST.
  5. Implement on the shared path.
  6. Verify.
  7. Adversarial self-review: "what would make this number lie?"
  8. Write a catalogue entry (root cause, evidence, numbers, held-out result)
     and a PROGRESS.md entry.
  9. Commit, then repeat. One WP at a time, in order.

════ THE QUEUE — work packages, in order ═══════════════════════════════

  WP0  BASELINE + HARNESS. No production code, except the HIT correctness
       fix in 0.4.
    0.1 scripts/assemblies-baseline.mjs. For each corpus set (VectorGrid on),
        compile hvac_equipment and record:
          · instances per family;
          · for each planned canonical attribute, how often a plausible
            source column exists — header-structure census, reported, never
            "fixed";
          · embedded coils found;
          · scheduled control-valve rows;
          · printed points lists.
        Writes reports/assemblies/00-baseline.{json,md}. These numbers replace
        the 2026-09-23 snapshot figures above.
    0.2 Choose and freeze the dev and HELD-OUT document lists by seed (TRUTH).
        Commit the lists and the seed.
    0.3 Author the first *.attrs.csv keys (dev ≥12 documents).
    0.4 HIT EXPORT CORRECTNESS (D11), in valveSizeExport.ts only:
          · column H (CoilDP) is left blank, and the valve's own (GPM/Cv)²
            moves to the export's coverage notes as "valve Δp (derived)"
            until the HIT owners confirm CoilDP's meaning;
          · tolerance is accepted only from {10,20,30,40,50}; anything else
            is refused with a message;
          · Positioning Signal comes only from a printed control-signal
            cell: printed 0–10 V → "0...10 Vdc", printed floating →
            "Floating control". The "MODULAT… → 0...10 Vdc" default and the
            any-"x–yV" → 0...10 Vdc mapping are removed. Any other printed
            value (2–10 V, 4–20 mA, 2-position) is left blank and disclosed,
            because the template cannot represent it;
          · Operating Voltage "24 VAC" is written only where a signal was
            written (current behaviour, kept);
          · coverage notes and the CHANGELOG say exactly what changed.
        Tests are updated to the corrected semantics. Re-run the export on
        navfac and itd-d1-lab (VectorGrid on) and report which columns
        changed and how many rows.
    GATE 0: baseline reproducible by one command; keys committed with
            scope headers; held-out list frozen; HIT correctness tests green
            with the before/after column report; guard green.

  WP1  CANONICAL ATTRIBUTE SCHEMA.
    attributes.ts gives each family its attributes with units and enums (plan
    §8.5). Every attribute has a definition line and an example source column
    from the keys. Location attributes are building / floor / area_served;
    floor may come from schedule columns or from the plan sheet a tag is drawn
    on (the tag loop's census — read-only).
    GATE 1: schema reviewed against the keys: every keyed attribute maps to
            exactly one canonical attribute; tests for units and enums.

  WP2  STRUCTURAL NORMALIZER.
    normalize.ts: canonical attributes per compile item.
      · Extraction rules follow extractEmbeddedCoils: group columns by header
        structure (coil / fan / electrical / heating blocks, multi-tier
        headers), parse units, require the cell to validate.
      · Each value carries its cell cite and the id of the rule that produced
        it.
      · Unknown values stay null, with a reason. LAW L1: regex may only
        CONFIRM a structural finding.
    GATE 2 (dev keys):
      · exact ≥ 98% of keyed printed values;
      · wrong ≤ 0.5%;
      · invented = 0.
    GATE 2 (held-out, reported now, must pass at DONE):
      · exact ≥ 95%;
      · wrong ≤ 1%;
      · invented = 0.
    Guard green; corpus-eval unchanged.

  WP3  ENGINE: schema + expressions + expansion (pure TS).
    3.1 schema.ts, a zod schema for AssemblyDefinition / ApplicationRecord /
        ExpandedLine (plan §8.2). The sanitizer extends assembly_library with
        `kind`. A golden test proves every existing linear record and its
        resolveLinearAssembly output are byte-identical.
    3.2 expr.ts:
          · grammar per plan §8.2: numbers, strings, attr/var/opt refs,
            arithmetic, comparison, and/or/not, if, min/max/ceil/floor/round,
            known;
          · no eval;
          · reference validation against the attribute schema and the
            assembly's own options/variables — an unknown ref is rejected with
            the offending token.
    3.3 select.ts + expand.ts + rollup.ts: selection with rank; options;
        precedence (D6); quantity pipeline (D8); ExpandedLine provenance (plan
        §8.4). Invariant tests:
          · conservation: Σ instance lines = roll-up;
          · determinism under input shuffling;
          · unknown propagation: an unknown attribute never yields a known
            quantity unless a partner default is set, and then the line's
            source says "partner_default";
          · precedence: printed/declared evidence replaces typical lines of
            the same role and never adds to them;
          · no double counting of nested sub-assemblies.
    GATE 3: tests green; property tests (random attribute sets) raise no
            exceptions; linear goldens byte-identical; guard green.

  WP4  STARTER LIBRARY v1 (vendor-neutral, sourced).
    4.1 us-typicals-v1.json: the 26 BAS typicals in research 02 §3b.
          · Each line carries its source locator (e.g. "UFGS 23 09 93
            §3.3.2", "MBL G36 TerminalUnits/Reheat", "UFC 3-410-01 T3-1"),
            its license, and derivation (verbatim / paraphrase / inferred).
          · Parameters the sources don't fix are "<selection>".
          · Default responsibility is the SAME single matrix as the hook-ups
            (D13, VA 23 09 23). For rows VA doesn't cover, use research 02's
            "Default responsibility" notes and mark them "[inferred]". Every
            cell stays editable.
          · Typicals resting on inference (lab airflow, networked RTU, VRF)
            are flagged "partner review required".
    4.2 us-hookups-v1.json: the hook-up catalogue in research 04 §5.
          · Assemblies: hydronic coil (2-way / 3-way / PICV) per coil circuit
            (4-pipe FCU = 2, AHU = one per coil); terminal heating unit; WSHP
            hose kit; steam coil (supply + condensate side); pump; boiler /
            chiller barrel / tower cell / HX side; system specialties per
            closed loop; air side (VAV, air devices, AHU drain, duct
            accessories).
          · Component ROLES only, with size + end_type params from the
            schedule (connection / runout size) or "<selection>".
          · Hook-up-profile switches gate the lines: balancing method,
            kits/hoses allowed, maximum kit size, 3-way allowed, P/T and
            thermometer policy, union→flange size. Every profile default is
            written down with the conflicting sources (UFGS / VA / NSCS / IMEG)
            that make it a choice.
          · Responsibility defaults come from the VA 23 09 23 table (verified).
            The four coil-kit control-valve patterns in research 04 §4 are
            responsibility presets, not separate assemblies.
    4.3 NOTICE.md with attributions: UFGS/UFC (US Government), MBL
        BSD-3-Clause-LBNL, 223P Apache-2.0 (© ASHRAE), Xeto/Haystack AFL-3.0,
        Brick BSD-3.
    4.4 Coverage tests, deterministic:
          · (a) every UFC 3-410-01 Table 3-1 item appears in its typical, or
            is marked N/A with a reason;
          · (b) the AI/AO/BI/BO counts of each G36-derived typical equal the
            MBL connector mapping, recorded as a fixture with the MBL commit
            and file paths;
          · (c) a grep test finds no manufacturer, model, part number, price,
            rate or hours anywhere in starter/.
    GATE 4: coverage tests green; every line sourced; typical ids and options
            FROZEN for v1 (this unblocks *.typicals.csv authoring); a review
            request with the list of partner-review items goes to the user.

  WP5  APPLY ON THE SHARED PATH (UI + MCP).
    5.1 ApplicationRecord per project (plan §8.2):
          · auto-proposal by selector;
          · per-instance / per-group override with a reason;
          · project variables (wiring method, valve body, signal, fail-safe
            policy, CO2 control, spare %), all "unset" until the partner sets
            them;
          · the hook-up profile and responsibility matrix (D13): partner
            defaults from the profile, per-project edits with a reason,
            and every line showing which setting produced it;
          · printed points lists and drawing-declared components applied per
            D6 (read from the existing BAS points / assembly-register outputs,
            read-only).
    5.2 Project persistence embeds the used assembly versions.
          · Import/export round-trips.
          · "Update to latest" shows a per-line diff and never auto-applies.
    5.3 MCP: an apply/expand operation plus library load by path.
          · Staging row; server instructions step.
          · Tool-count sync in the five places.
          · Parity test: MCP and UI produce byte-identical ExpandedLines for
            the same inputs.
    5.4 UI (surface-specific):
          · AssembliesPanel in the Takeoff panel: per-family table, per-unit
            drill-down with cites, exceptions list first;
          · Assemblies library tab: starter read-only → clone → edit, with
            live reference validation and override tint (the materials.js
            pattern).
    5.5 Author *.typicals.csv for the dev and held-out documents (TRUTH).
    GATE 5:
      · Typical eval dev ≥ 98% exact (id + options).
      · Held-out ≥ 95%, reported.
      · Zero assignments that depend on an unknown attribute without an
        `unresolved` disclosure.
      · Parity test green; guard green.
      · NEW-DOCUMENT TEST #1 run and reported.

  WP6  POINTS COMPARE vs PRINTED LISTS.
    On every set with a printed points list (at least navfac, Eglin, Albany,
    USDA and Orange County, plus any found at HEAD), map printed rows to units
    using the existing served-equipment logic (read-only). Diff them per unit
    against the typical-derived points and classify each diff as:
      · typical gap → a library change citing a PUBLIC source (never "because
        this document says so");
      · project-specific → recorded as a project fact;
      · extraction/mapping error → catalogued.
    GATE 6: 100% of diffs classified with evidence; agreement rate reported per
            family (tracked, no target); no library change without a cited
            source.

  WP7  EXPORTS.
    7.1 The CSV set, published with a column spec in docs:
          · equipment.csv, lines.csv, points.csv
          · valves.csv, damper_actuators.csv, sensors.csv
          · desigo_select_worksheet.csv
        Units go in headers and every engineering field has a `*_source`
        column. Component lines carry size and end_type. Responsibility is six
        columns (furnish / install / wire_lv / power / program / test).
        Partner columns (part_no, unit_cost, hours, labor_category) are blank
        unless the partner filled them.
    7.2 A PDF section in the takeoff report: summary, per-family tables,
        exceptions, citations.
    7.3 HIT adapter (the WP0.4 corrections stay in force):
          · also takes coil-derived valve roles (hydronic coils from existing
            embedded-coil detection → valve role with GPM, coil WPD, EWT,
            service), each row flagged "coil-derived";
          · CoilDP stays blank until the HIT owners confirm its meaning, then
            is filled from coil WPD (ft × 0.433 → psi);
          · split at 200 rows.
    7.4 UI and MCP both produce the set from ONE shared builder.
    GATE 7: export validation (instrument 5) green; coil-derived valve rows
            reported against the WP0 baseline; guard green.

  WP8  PARTNER LIBRARY MANAGEMENT + PERSONAS.
    8.1 Library CSV import/export (one row per line) through the same
        sanitize/validate gate as profile load. Error report by row and token.
    8.2 Scripted persona scenarios (deterministic, CI):
          · (a) BAS integrator: clones the starter, edits the VAV typical,
            adds labor hours and part numbers to their copy, applies, exports
            points / Desigo worksheet / HIT;
          · (b) mechanical contractor: scope filter = mechanical; sets a
            hook-up profile (kits allowed ≤ 1 in, no hoses, manual balancing)
            and the "valve shipped to kit maker" responsibility preset; exports
            hook-up lines with size / end type, valves.csv, HIT;
          · (c) distributor: device CSVs only.
    GATE 8: all three scenarios pass; round-trips lossless; guard green.

  WP9  OPTIONAL PARTNER COST / LABOR (approved by the owner 2026-09-23, D14).
    · If partner fields exist, extended cost (qty × unit_cost) and hours by
      labor category appear in lines.csv and the PDF, labelled
      "partner-entered".
    · Nothing ships with numbers.
    GATE 9: unit tests; grep test (c) still green.

  WP10 REAL PARTNER JOBS + FINAL REPORT.
    · Run 2–3 user-supplied partner jobs.
    · Compare against what the partner actually entered in HIT / Desigo
      Select / their estimate.
    · Root-cause every miss into the catalogue and fix what is in scope.
    · Final report in PROGRESS.md and the PR description.

════ LAWS ══════════════════════════════════════════════════════════════
  L1 to L4 from GOAL_LOOPS.md verbatim: structure classifies, regex confirms ·
  corpus is the proving ground, not the finish line · audit before you build ·
  never invent a quantity, tag or location.
  A1 No product, model or part number, price, rate or labor hour in any
     shipped file.
  A2 A typical never overwrites or adds to drawing evidence (D6).
  A3 Unknown stays `unresolved` unless a partner default is set — and then the
     output says so.
  A4 Every expanded line cites its drawing evidence AND its rule.
  A5 A library edit never changes a saved project silently.
  A6 One shared implementation; UI and MCP are thin.
  A7 ASHRAE text is never copied; sources are cited by locator.

════ ANTI-GAMING — the keys are editable text files. Read twice. ═══════
  NEVER edit, extend, narrow or "correct" a key after the pipeline has run
    on that sheet. A key that looks wrong → STOP, write it up.
  NEVER tune the starter library to one document's printed points list or
    schedule. Every library change cites a public source in the same commit.
  NEVER special-case a document, tag, sheet, drafter or corpus id.
  NEVER count `unresolved` as correct, or let a silent default pass GATE 5.
  NEVER move a failure out of scope so it falls off the report.
  NEVER skip, disable, xfail or delete a test.
  An improvement you cannot explain structurally is a bug you haven't found.
    Revert it.

════ BLOCKED ═══════════════════════════════════════════════════════════
  Root cause in a file you don't own · a key that looks wrong · a HIT /
  Desigo Select question only Siemens can answer · a failure you can't
  reproduce → catalogue with evidence → next queue item. Never stall. Never
  reach across the boundary to unblock yourself.

════ INPUTS ONLY THE USER CAN GIVE (ask once, then keep going) ═════════
  1. Confirmation of the doctrine amendment (header). RECEIVED 2026-09-23.
  2. HIT owners' answers on CoilDP / BranchDP / Tolerance, other mass-sizing
     templates, and row limits. Needed to FILL column H; until then it stays
     blank.
  3. Desigo Select owners: any import format, the field-equipment type list,
     how license points are counted.
  4. One controls integrator and one mechanical contractor to review the
     starter library. GATE 4 sends the list.
  5. 2–3 real partner jobs with what was actually entered downstream (WP10),
     plus one unseen PDF for each NEW-DOCUMENT TEST.
  6. Go / no-go on WP9 (partner price/labor fields). RECEIVED 2026-09-23: go.

════ DONE ══════════════════════════════════════════════════════════════
  · GATES 0–9 green, with the held-out numbers at or above their thresholds.
  · WP10 run on every partner job the user supplied.
  · NEW-DOCUMENT TEST #2 reported.
  · Docs synced.
  · corpus-eval and the linear bench unchanged.
  · The draft PR marked ready — never merged by you.
```

## KICKOFF PROMPT (paste as the session's first message)

```
You are the coordinator for GOAL LOOP S (assemblies) in erikjohnstone/master-plan.

1. Read opentakeoff-corpus/goals/ASSEMBLIES.md top to bottom, then
   plans/04-assemblies-plan.md, then the research sections its SETUP names.
2. Obey root AGENTS.md and opentakeoff/AGENTS.md: answer SHOULD THIS BE ON THE
   SHARED PATH? before every change; coordinator-only (no subagents unless I
   re-enable delegation); never merge to main — merge is deploy.
3. Check out branch `assemblies`, creating it per the goal's BRANCH line if it
   doesn't exist. Run SETUP. If anything is red at HEAD, stop and report.
4. Find where you are: the first work package whose GATE is not recorded as
   passed under "Active work: assemblies" in opentakeoff-corpus/PROGRESS.md.
   Start there. Work THE QUEUE in order; follow THE LOOP for every step
   (audit first, failing test or key first, implement, measure, adversarial
   self-review, catalogue entry, PROGRESS.md entry, commit, push).
5. Report every gate's numbers when measured — dev AND held-out, including
   regressions — and never claim a number a run hasn't finished producing.
6. When you need something only I can give (INPUTS list), ask once, record the
   ask in PROGRESS.md, and continue with the next unblocked item. Never stall.
7. Keep going until DONE is true, or until a remaining ceiling is demonstrated
   with reproducible evidence.
```
