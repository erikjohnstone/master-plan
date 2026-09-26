# Goal: control intent — project answers and the control drawings decide each unit's BAS scope and options, cite-backed, or leave them unresolved

Written 2026-09-24. **Proposed, awaiting owner review. Not started.** To run it after approval, paste the KICKOFF PROMPT at the end of this file as a session's first message. Supporting documents:
- `plans/05-control-intent-plan.md`: the design, with worked dev examples;
- `plans/05-research/01-dev-miss-evidence.md`: what decides each missed dev typical (per-row CSV beside it);
- `plans/05-research/02-reading-control-drawings.md`: VLMs, grounding, this repo's AI pieces, the pilot;
- `plans/05-research/03-project-questions.md`: which questions, when, the UX, catalogue v1;
- `plans/05-research/pilot/`: the scripts behind every number in those notes.

This file is the executable goal. It says what to build, in what order, how each step is measured, and what is never allowed. It is written for an autonomous coordinator running a goal loop: read it once top to bottom, then work THE QUEUE.

**Why this goal exists.** The ASSEMBLIES goal (`goals/ASSEMBLIES.md`) picks the right typical and options for 116 of 244 dev instances. Research R2 classified the 128 misses by the evidence that decides them:

| Evidence | Rows | This goal |
|---|---:|---|
| a project fact: no BAS 20, DoD 4, existing policy 5, motor-speed default 2 | 31 | Track A, project questions |
| the control drawings: prose 15, detail/points 41, absence 12, detail + DoD 3 | 71 | Track B, reading the bound control evidence |
| the schedule prints it (normalizer gap) | 11 | no: the ASSEMBLIES queue |
| floor-plan evidence per zone | 15 | no: out of scope |

The ceiling for this goal on dev is 116 + 31 + 71 = 218/244 (89.3%). Today the sheet graph binds only 18 of the 71 control-drawing rows to their governing detail. Targeting comes before reading.

**Scope (proposed, to be confirmed by the owner):**
- US only.
- The ASSEMBLIES product rules stand: vendor-neutral, no shipped prices, CSV/PDF/HIT outputs.
- This goal chooses only among the frozen v1 library's typicals, their options, and "none". It adds no device or point outside a typical's recipe (ASSEMBLIES A2 unchanged).

**Standing rules this goal relies on.**
- Root `AGENTS.md` rule 8 allows "OCR, raster vision, learned symbol detection, and local VLM/AI on the shared vector pipeline … when vector extraction alone cannot reach the answer — disclosed, cite-backed, corroborated". This goal uses that rule.
- `opentakeoff/docs/BAS_PRODUCTION_GOAL.md` forbade "model-generated interpretations" in *its* workflows. On approval, WP0 adds a banner there pointing here, as ASSEMBLIES did for pricing.
- Every other rule still applies verbatim: root `AGENTS.md` (shared path, coordinator-only), `opentakeoff/AGENTS.md` (shipping, doc sync), `GOAL.md` "Platform mandate", `GOAL_LOOPS.md` (LAWS, ANTI-GAMING), and ASSEMBLIES A1–A7.

## Decisions (proposed from the research; each needs the owner's yes)

| # | Decision | Why (evidence) |
|---|---|---|
| C1 | **Two tracks, one record.** Track A answers project questions. Track B reads the control drawings. Both write one per-unit **control-intent record**, built on the shared path, which assemblies selection consumes. | Research 01: 31 rows are project facts, 71 are drawing facts, and they interact. PQ1 = "no BAS" makes reading moot, and readings pre-fill questions. |
| C2 | **Questions come from a closed, versioned catalogue** (v1: PQ1 BAS in scope, PQ2 owner criteria, PQ3 existing equipment, PQ4 motor speed with no speed column, PQ5 plumbing-service equipment, plus the existing responsibility and hook-up settings). **A model never writes or answers a question.** | Research 03 §6. Dev markers are noisy ("UFC UNIFORM FIRE CODE", "UFC 4-010-01"), so regex cannot decide these facts (L1). |
| C3 | **Ask after indexing and the first apply. Show a question only if some answer changes a line.** Rank by lines changed, show at most 6, pre-fill each from quoted evidence, and always allow "don't know". | Value-of-information work (research 03 §3), made exact: re-apply under each answer choice and count the changed lines. Progressive-disclosure UX. |
| C4 | **Answers are append-only, fingerprinted decisions** (the `basScopeReviewContract.ts` pattern). Every line they change cites them. Changing one re-applies and shows the diff (A5). PQ4/PQ5 may be partner defaults, disclosed on each use; PQ1–PQ3 never are. | Existing repo pattern; ASSEMBLIES A3 and A5. |
| C5 | **Targeting is deterministic.** A control-evidence map binds each unit to packets (detail, schematic, sequence section, points-schedule rows, general note). It binds by tag, tag list or range, schedule cross-reference, family-level typical detail, or sequence heading, and records why. No model decides what governs a unit. **A family-level binding is the weakest kind** (AS-19 notes that a title naming a family is a word, not a binding, L1). It counts only when the unit's family comes from the schedule's structure, exactly one detail of that family remains, and any qualifier in the title ("HYDRONIC", "TOILET") is confirmed by the unit's own schedule cells. Otherwise readings through it are proposals only. | Research 01 §3: the 33 unreached rows fail on title forms, lists/ranges, cross-references ("FAN-A") and typical details. All are in the text layer. In the pilot, page-level model targeting named a neighbouring detail once. |
| C6 | **Closed questions only.** Readers answer true / false / not shown for the options of a unit's candidate typicals, plus its BAS role (controls / monitors only / not connected). | AECV-Bench, MechVQA and the P&ID work (research 02 §1): models are reliable on text, not on free-form drawing interpretation. |
| C7 | **Three structurally different readers, cheapest first.** R0 is deterministic (I/O tokens, a sourced option term list with traps and negation guard, exclusion phrases). R1 is the text model on the packet's spans, with verbatim quotes and the clause subject. R2 is the vision model on a crop of the packet at ≥ 200 dpi, run twice, citing labels that must exist in the region. | Pilot: R1 got 4/4 presence answers right; R2 got absences right in 2/2 runs; each made a semantic error the other kind of evidence catches (research 02 §3). |
| C8 | **Apply by agreement, not confidence.** Two structurally different readers agree and none disagrees → applied, disclosed, listed first with one-click reject. R0 alone on a whitelisted exact phrase or I/O token → applied. One model reader alone → a proposal. Any disagreement or unverified cite → unresolved, both shown. | Logprobs, verbalized confidence and self-consistency fail as trust signals; cross-reading disagreement works ("Beyond Logprobs", research 02 §1). |
| C9 | **Absence is decided false only when all hold:** a unique, complete binding; no term for the device in the packet's spans; and two agreeing R2 runs. Otherwise it stays unresolved. | Absence is the POPE-style hallucination case. The text model abstained on 15/15 absences; the vision model got them right but misread one damper in one run. |
| C10 | **Record and replay every model call** (model, prompt/schema version, request hash, response, tokens, latency). Evals and CI replay. A project pins its runs, so a model, prompt or term-list change never silently changes a saved project. Without a model, R0 still runs and R1/R2 report "not configured". | Models drift: the configured `gemma-4-31b` is no longer served (research 02 §2). ASSEMBLIES A5. |
| C11 | **Models:** the platform endpoint's `gpt-oss-120b` (text) and `qwen-3.8-27b` (vision), through one injected transport. The browser uses the existing proxy; MCP uses env config. Temperature 0. Vector-first always. | Measured on 2026-09-24: the endpoint lists these two, `gpt-oss-120b` rejects images, and `qwen-3.8-27b` accepts them. |
| C12 | **Conflicts are exceptions, not overrides.** Control drawings are "drawing-declared components", the top tier in D6. When they disagree with a schedule attribute, both are shown and the option stays unresolved. | ASSEMBLIES D6 and A2. |
| C13 | **Guardrails already found in the dev keys.** PQ2 = DoD applies UFC 3-410-01 minimums to HVAC-service units only. PQ4 applies only when the schedule has no speed column at all, never when a printed value went unread. | bldg5406's DHW recirculation pump keys `ufc_minimum_points=false`; 031 WHSE-EF2 prints SPEED CONTROL 'VARIABLE' in a column the normalizer does not read. |

---

```
GOAL LOOP C — control intent: target the evidence, ask the few questions that matter, read, verify, cite

REPO      erikjohnstone/master-plan
BRANCH    ONE long-lived feature branch `control-intent`, created from `main`
          once the assemblies work (draft PR #108) has merged; until then, create
          it from the branch carrying the assemblies work
          (claude/affectionate-darwin-316fwo). Small commits, one WP step each.
          Every commit body states SHOULD-THIS-BE-ON-THE-SHARED-PATH and the
          before/after numbers. Open a DRAFT PR at the end of WP2 and keep it
          updated. NEVER merge to main yourself — merge is deploy. Every commit
          leaves main-merge safe: with no answers and no readings, every
          assemblies output is byte-identical (golden tests enforce this).

WHO       One coordinator, coordinator-only per root AGENTS.md (no subagents
          unless the user re-enables delegation). One heavy job at a time.

════ SETUP (first 15 minutes) ══════════════════════════════════════════
  source the environment (Node 24); cd opentakeoff/web && npm install && npm run check
  cd ../mcp && npm install && npm test && npm run test:bas
  (Known red at HEAD: the AS-1 failures listed in ASSEMBLIES_BUG_CATALOGUE.md.
  Anything else red → STOP and report.)
  Run the node test suites with --test-force-exit on the command line (AS-6).
  VectorGrid must be running for any compile you measure (ASSEMBLIES SETUP).
  Model access: CEREBRAS_API_KEY in the environment; confirm GET /v1/models
  lists the C11 models. If not, record it, run R0-only, and ask (INPUT 3).
  Read once: plans/05-control-intent-plan.md; research 01–03 in
  plans/05-research/; goals/ASSEMBLIES.md (Decisions, LAWS, ANTI-GAMING);
  opentakeoff/web/src/lib/basSequenceAi.ts; controlSchematic.ts;
  sequenceNarrative.ts; basScopeReviewContract.ts.

════ WHAT YOU OWN ══════════════════════════════════════════════════════
  NEW  opentakeoff/web/src/lib/controlIntent/**   pure TS, zod
         catalogue.ts   question catalogue v1 (data + schema + version)
         questions.ts   triggers, pre-fill finders, effects, selection/ranking
         journal.ts     append-only answer events, fingerprints, replay
         evidence.ts    packet finder + binder → control-evidence map
         readers/r0.ts  I/O inventory, option term list, exclusion phrases
         readers/r1.ts  text-model reader (basSequenceAi pattern)
         readers/r2.ts  vision reader (crop spec, label resolution)
         combine.ts     agreement rules, absence rule, conflict rule
         runs.ts        record/replay store, pinning, versioning
         record.ts      the per-unit control-intent record apply consumes
         termlist/*.json the option term list, one entry per option, each
                        entry with its source
  NEW  opentakeoff/web/test/controlIntent/**, opentakeoff/mcp/test/controlIntent*.test.mjs
  NEW  opentakeoff/mcp/scripts/control-intent-*.mjs   (the instruments below)
  NEW  opentakeoff-corpus/keys/<set>.project.csv, <set>.binding.csv
       (authored under TRUTH, and ONLY those two suffixes)
  NEW  opentakeoff-corpus/CONTROL_INTENT_BUG_CATALOGUE.md   (append-only)
  NEW  opentakeoff-corpus/reports/control-intent/**   (reports, recorded runs)
  EXTEND (additively, on the shared path):
       web/src/lib/assemblies/{apply,select,report}.ts   consume the record:
            new rule kinds (project_answer, drawing_read, proposal); nothing
            changes when the record is empty
       web/src/components/AssembliesPanel.jsx   "Project questions" card,
            per-unit control-evidence link, AI-applied decisions first in the
            exceptions list with one-click reject
       web/src/lib/ai.js   vision model default (C11) and the image transport
            the readers inject; nothing else
       web/src/lib/basSequenceAi.ts   additive exports only (reuse its gate)
       mcp/src/tools.ts, session.ts, outputs, assemblies.ts   project_questions,
            answer_project_question, control_evidence; apply_assemblies takes
            answers + pinned runs
       docs: README.md, FEATURES.md, docs/USER_GUIDE.md, docs/AGENT_GUIDE.md,
            docs/MCP.md, mcp/README.md, CHANGELOG.md (the tool count lives in
            five places — opentakeoff/AGENTS.md sync list)
       opentakeoff/docs/BAS_PRODUCTION_GOAL.md   an amendment banner, nothing else
       opentakeoff-corpus/PROGRESS.md   your entries under "Active work"
  EXTEND WITH PROOF ONLY (INPUT 4): web/src/lib/controlSchematic.ts title
       recognition. Before/after: the L4.8 census, graph-eval and corpus-eval
       unchanged except the new titles. Without approval, the new title forms
       live in controlIntent/evidence.ts instead.

════ WHAT YOU NEVER TOUCH ══════════════════════════════════════════════
  keys/** except your own *.project.csv / *.binding.csv — in particular
    keys/*.typicals.csv and keys/*.attrs.csv are READ-ONLY truth here;
    reports/** except reports/control-intent/**; sets.json; ground_truth/**
  The extraction pipeline: sheetgraph.ts table internals, vectorGrid*,
    corpusTakeoff.mjs internals, symbolsweep.ts, tagIndex.ts,
    schedulePlanReconcile.mjs, sequenceNarrative.ts (you CALL it).
  The frozen v1 library ids and options (starter/*.json) — a missing typical
    (monitor-only, two-speed fan) is catalogued as a library-v2 item.
  The ASSEMBLIES normalizer (normalize.ts) — the 11 schedule-printed rows go
    to the ASSEMBLIES queue as catalogue entries, not fixed here.
  opentakeoff/bas_engine/**, and the BAS workflow contracts/schemas
    (bas*Register.ts, bas*Contract.ts). Reuse their patterns; never change them.

════ THE PROBLEM (measured 2026-09-24; WP0 re-measures at HEAD) ════════
  · Typical eval (ASSEMBLIES instrument 3): dev 116/244 exact, held-out 21/91.
  · Dev misses by deciding evidence (research 01): project fact 31, control
    drawings 71, schedule 11, floor plan 15.
  · Targeting today (research 01 §3): of the 71 control-drawing rows, 18 are
    bound to their governing schematic, 2 printed-unbound, 18 family-title
    only, 33 nothing.
  · Nothing asks the estimator anything; project facts are either assumed
    (starter defaults) or left unresolved.
  · The only model reader (basSequenceAi.ts) is UI-only, answers open
    questions, and has no corpus accuracy measurement. No VLM call exists on
    the pipeline; the configured vision model is no longer served.

════ MEASURE — eight instruments, none substitutes for another ═════════
  1  REGRESSION GUARD: the ASSEMBLIES guard (web check, mcp test + test:bas,
     bench:linear, corpus-eval unchanged) PLUS ASSEMBLIES instruments 2–5
     byte-identical with no answers and no readings. Corpus-eval once per WP.
  2  QUESTION EVAL: scripts/control-intent-questions-eval.mjs <corpus> [--heldout]
     Per project: questions shown (≤ 6), zero-effect questions shown (must be
     0), pre-fill vs keys/*.project.csv (right / wrong / none offered), lines
     changed per answer. ORACLE mode applies the key answers and reports,
     through instrument 5, every instance whose verdict changed: fixed,
     broken, unchanged.
  3  BINDING EVAL: scripts/control-intent-binding-eval.mjs <corpus> [--heldout]
     Per (instance, packet) against keys/*.binding.csv: true / false / missed
     bindings, by binding kind (tag, list/range, cross-reference, family
     detail, sequence heading); ambiguous count; unit-level recall (a unit
     with ≥ 1 keyed packet gets ≥ 1 right one).
  4  READING EVAL: scripts/control-intent-reading-eval.mjs <corpus> [--heldout] [--live]
     Per (instance, option) against keys/*.typicals.csv, REPLAY by default:
       applied-right · applied-wrong · INVENTED (an option the key marks "?",
       i.e. the drawings do not decide it, was decided) · proposal-right ·
       proposal-wrong · abstained · unresolved-by-disagreement · conflict
     Reported per reader (R0, R1, R2) and combined; the absence subset
     separately; per family; per set. Held-out: aggregates only.
  5  END-TO-END TYPICAL EVAL: ASSEMBLIES instrument 3
     (scripts/assemblies-typical-eval.mjs) with --answers <keys|none> and
     --readings <replay|off>. Held-out also reports the aggregate miss reasons
     (unbound · abstained · disagreement · no question · schedule · other),
     never rows.
  6  COST/LATENCY: model calls, tokens and wall time per document, from the
     recorded runs; the model-off (R0-only) numbers beside them.
  7  REPLAY DETERMINISM: two replays → byte-identical records and lines; a
     live re-run's decision diff, every change explained.
  8  NEW-DOCUMENT TEST (the only test of the actual goal): unseen partner PDFs
     (INPUT 5) end to end through the UI and through MCP; report every
     question asked, every applied reading with its cites, every proposal,
     every unresolved option.

════ TRUTH — how keys are authored (read twice) ════════════════════════
  · Population: the ASSEMBLIES frozen split (01-split.json): 11 dev and 6
    held-out documents, every instance in their keys/*.typicals.csv. More
    documents join only as a NEW seeded, drafter-grouped extension frozen
    before any key for them is written (INPUT 5); never re-draw the split.
  · Write the scope first: the '#' header states the document, the question
    catalogue version (project.csv) or the packet kinds covered
    (binding.csv), and what is deliberately not keyed.
  · Author from RENDERS and the PDF's own text (mcp/scripts/render-page-crop.mjs
    at 2–4×), never from pipeline output for that document. Where render and
    pipeline later differ, the RENDER decides.
  · *.project.csv columns:
      question,answer,evidence_sheet,evidence_quote,note
    One row per catalogue question; answer "unknown" when the drawings and
    the project description do not settle it (the loop scores that as
    "question needed", never as a pre-fill target).
  · *.binding.csv columns:
      sheet,tag,family,packet_sheet,packet_title,binding,note
    One row per (instance, governing packet); binding ∈ {tag, list_range,
    cross_reference, family_detail, sequence_heading, general_note}; one row
    with packet "none" for an instance no control evidence governs.
  · Option truth is keys/*.typicals.csv, already authored and frozen. An
    option marked "?" is one the drawings do not decide: deciding it is
    INVENTED.
  · Held-out keys: authored in a separate pass after the dev keys, committed,
    then never opened again; scored only at gates, aggregates only.
  · A key that looks wrong later → STOP, write it up in the catalogue, do not
    edit it (GOAL_LOOPS ANTI-GAMING).

════ THE LOOP ══════════════════════════════════════════════════════════
  1. Measure 1 (+ the instrument the WP owns).
  2. Take the next QUEUE item.
  3. AUDIT FIRST: research 02 §2 lists the building blocks by file. Reuse;
     never fork.
  4. Write the failing test or key FIRST.
  5. Implement on the shared path.
  6. Verify (replay mode for anything model-backed).
  7. Adversarial self-review: "what would make this number lie?" — especially:
     did a quote verify while the reading is wrong; did a binding succeed by
     family where a specific packet existed; did a default fill a printed value.
  8. Catalogue entry (root cause, evidence, numbers, held-out result) and a
     PROGRESS.md entry.
  9. Commit, push, repeat. One WP at a time, in order.

════ THE QUEUE — work packages, in order ═══════════════════════════════

  WP0  BASELINE + KEYS + HARNESS. No production code except 0.4.
    0.1 Re-measure instrument 5 (no answers, no readings) dev and held-out at
        HEAD; re-run plans/05-research/pilot/r2-*.mjs; write
        reports/control-intent/00-baseline.{json,md}.
    0.2 Author dev keys/*.project.csv and *.binding.csv (11 documents).
    0.3 Author held-out keys (6 documents) in a separate pass; commit.
    0.4 ai.js: the vision default follows C11 (the configured gemma-4-31b is
        no longer served); a test pins that the default is a model the
        endpoint lists at test-recording time; CHANGELOG.
    0.5 Instruments 2–7 with fixture tests (a synthetic project with known
        answers, packets and options), including the INVENTED path.
    0.6 runs.ts record/replay store and its tests: request hashing, pinning,
        a model/prompt change producing a new run and a visible diff.
    0.7 BAS_PRODUCTION_GOAL.md banner (on owner approval).
    GATE 0: baseline reproducible by one command; dev AND held-out keys
            committed before any Track A/B code runs on those documents;
            instruments' fixture tests green; replay store green.

  WP1  TRACK A — PROJECT QUESTIONS
    1.1 catalogue.ts: v1 (research 03 §6), zod schema, version string.
    1.2 Effects on selection: the record carries project answers; select.ts
        honours them with rule kind project_answer and the event id. PQ2 is
        HVAC-service only; PQ4 only when the schedule has no speed column
        (C13) — each with a test built from the dev pitfall that motivated it.
    1.3 Pre-fill finders: deterministic evidence search (general controls
        notes, controls-sheet presence, owner markers, existing flags, speed
        columns, plumbing service), each returning quote + sheet + bbox;
        a finder never answers — it proposes.
    1.4 Selection: triggers → re-apply under every answer choice → drop
        zero-effect → rank by lines changed → cap 6.
    1.5 journal.ts: append-only events (operation_id, expected_head, reviewer,
        reason, origin operator_input|agent_proposal, approved:false,
        fingerprint), persistence in the project, A5 diff on change.
    1.6 MCP project_questions + answer_project_question; the UI card; a
        parity test (same answers → byte-identical records and lines).
    GATE A (questions):
      dev  (a) oracle answers turn all 31 project-fact misses exact;
           (b) 0 previously-exact instances change verdict;
           (c) ≤ 6 questions per project; 0 zero-effect questions shown;
           (d) pre-fill matches the key in ≥ 90% of (project, question)
               pairs where one is offered; 0 pre-fills applied without a click;
           (e) 0 dishonest, 0 undisclosed in instrument 5.
      held-out (b), (c), (e) hold; pre-fill accuracy reported (aggregate).

  WP2  TRACK B-1 — TARGETING (the control-evidence map)
    2.1 Packet finder: control detail/schematic titles (the L4.8 forms plus
        "X CONTROL(S)", "X CONTROL - Y", "(TAG THRU TAG)", tag lists incl.
        prefix-carrying shorthand "AHU-4, 5, & 8"), points schedules (from
        the table graph), sequence blocks (sequenceNarrative), general
        controls notes. A packet region contains its own labels and excludes
        neighbouring titles (a test per failure mode).
    2.2 Binder, in rank order: tag; list/range (expanded only across
        scheduled tags; numeric parts compared as integers, so "AHU-4" =
        "AHU-04" and ≠ "AHU-40"); schedule cross-reference (a column value
        equal to a title token, a remark naming a sheet or sequence);
        family-level typical detail, only when nothing more specific binds,
        the unit's family comes from the schedule's structure, exactly one
        detail of that family remains, and every title qualifier
        ("HYDRONIC", "TOILET") is confirmed by the unit's own schedule cells —
        otherwise readings through it are proposals only (C5, L1); sequence
        heading. Every binding records its kind and its evidence; same-rank
        ties stay ambiguous.
    2.3 Session.controlEvidenceMap(); MCP control_evidence; the per-unit
        "Control evidence" link in the panel (opens the packet on the sheet).
    GATE B1 (binding):
      dev  (instance, packet) recall ≥ 95%, precision ≥ 98%; unit-level
           recall ≥ 95%; every ambiguity visible.
      held-out recall ≥ 85%, precision ≥ 95% (aggregate).

  WP3  TRACK B-2 — READERS, COMBINER, RECORD
    3.1 R0: per-packet I/O inventory (L4.8 tokens; points-schedule rows);
        the option term list (termlist/*.json) — each entry has presence
        phrases, traps (e.g. "SMOKE MODE" is not a smoke detector), and a
        SOURCE (the library option's definition, UFC/UFGS vocabulary, or ≥ 2
        dev documents from different drafters); clause-level negation guard;
        exclusion phrases (STANDALONE, NOT CONTROLLED BY, BY OTHERS, TO REMAIN,
        WIRE TO STARTER). Whitelisted R0 decisions are listed explicitly.
    3.2 R1: the text model on the packet's spans only; per answer 1–3
        verbatim quotes + the clause-subject quote for role and command
        claims; basSequenceAi's zod + exact-substring gate + validator retry.
    3.3 R2: crop of the packet region at ≥ 200 dpi (rotation-correct), two
        runs; every non-absence answer cites printed labels that must resolve
        to text spans inside the region; absence answers cite nothing.
    3.4 combine.ts: C8 agreement rules, C9 absence rule, C12 conflict rule;
        every outcome carries its readers, cites and rule version.
    3.5 runs.ts wiring: every call recorded; evals replay; projects pin.
    3.6 Apply integration: rule kinds drawing_read / proposal; the report and
        exceptions list AI-applied decisions first with one-click reject;
        rejecting is an event in the journal.
    GATE B2 (reading, combined, replay mode, key answers applied):
      dev  applied-wrong ≤ 0.5% of applied (instance, option) decisions;
           0 applied-wrong absence decisions; 0 INVENTED applied; 100% of
           applied decisions carry verified cites;
           of the 71 dev instances research 01 classes as decided by the
           control drawings (plans/05-research/pilot/r2-classes.mjs, frozen
           at the goal's approval commit), ≥ 57 (80%) exact;
           0 instances exact at baseline become non-exact.
      held-out applied-wrong ≤ 2%; 0 INVENTED applied; the number of
           applied decisions and the share of instances with ≥ 1 applied
           reading reported (aggregate).

  WP4  END TO END + ROBUSTNESS
    4.1 Instrument 5 with key answers and replayed readings.
    GATE C (end to end):
      dev  exact ≥ 204/244 (83.6% = baseline 116 + GATE A's 31 + GATE B2's
           57), 0 dishonest, 0 undisclosed.
      held-out exact ≥ 60% (≥ 55/91), 0 dishonest, 0 undisclosed; if below,
           a demonstrated-ceiling write-up from the aggregate miss reasons.
    4.2 Robustness suite:
      · negative controls — 004 and baker-county-eoc: 0 option decisions from
        readers (no control packets); with PQ1 = no, every unit "none";
      · adversarial swap — rebind every dev packet to a unit of another family
        or tag: ≥ 99% of the resulting readings fail verification or disagree
        (never applied);
      · model-off — R0 only: 0 applied-wrong on dev;
      · replay — byte-identical twice; a live re-run's decision diff ≤ 2%,
        every change explained in the catalogue;
      · raster — the raster rendition of a dev document (where staged):
        applied decisions ⊆ the vector document's, 0 applied-wrong;
      · cost — model calls, tokens and wall time per document reported;
        ≤ 5 minutes per dev document on the platform endpoint.
    GATE D: every item above passes, or is catalogued as a demonstrated
            ceiling with evidence.

  WP5  PRODUCT
    5.1 UI proof (Playwright, a real dev PDF, the dev server): the questions
        card (pre-fill, evidence, lines changed), answering and the diff,
        the control-evidence link, AI-applied decisions first with reject,
        autosave/reload keeps answers and pinned runs, both themes at three
        widths.
    5.2 UI/MCP parity: same answers + same pinned runs → byte-identical
        records, lines, report and CSV set.
    5.3 Docs synced (five places), CHANGELOG, tool count check.
    GATE E: 5.1–5.3 green; guard green (no new failure against the AS-1
            baseline); corpus-eval unchanged (or the approved L4.8 change's
            before/after explained).

  WP6  NEW DOCUMENTS (INPUT 5)
    · Run every unseen partner PDF through the UI and MCP; report per
      document (instrument 8); root-cause every miss into the catalogue;
      fix what is in scope; never tune on them.

════ LAWS ══════════════════════════════════════════════════════════════
  L1 to L4 from GOAL_LOOPS.md verbatim: structure classifies, regex confirms ·
  corpus is the proving ground, not the finish line · audit before you build ·
  never invent a quantity, tag or location.
  ASSEMBLIES A1–A7 verbatim.
  CI1 No model decides what evidence governs a unit. Targeting is
      deterministic, keyed and measured.
  CI2 No cite, no decision. Every quote or label resolves to a text span
      inside the bound packet on the same sheet, or the reading is dropped.
  CI3 A verified quote proves the text exists, not the reading. Role,
      command and absence claims need a second, structurally different
      reader to agree.
  CI4 No model writes or answers a project question. A pre-fill is a
      proposal until the estimator clicks.
  CI5 A project answer decides only what its catalogue entry declares. A
      default never fills a value the schedule prints, read or unread.
  CI6 A model, prompt, term-list or catalogue version change never silently
      changes a saved project.
  CI7 "Don't know" and "not shown" are always valid and always stay visible.

════ ANTI-GAMING — the keys are editable text files. Read twice. ═══════
  NEVER edit, extend, narrow or "correct" a key after the pipeline has run
    on that document. A key that looks wrong → STOP, write it up.
  NEVER put key text (basis notes, answers) into a prompt, a term list or a
    test fixture for the same document.
  NEVER add a term-list entry, catalogue trigger or prompt line whose only
    source is one document; cite the library definition, UFC/UFGS vocabulary,
    or ≥ 2 dev documents from different drafters.
  NEVER look at held-out rows, packets, answers or model outputs; held-out
    gives aggregates only, at gates.
  NEVER count a proposal, an abstention or an unresolved option as correct.
  NEVER raise coverage by weakening CI2/CI3, the agreement rule or the
    absence rule.
  NEVER special-case a document, tag, sheet, drafter or corpus id.
  NEVER skip, disable, xfail or delete a test.
  An improvement you cannot explain structurally is a bug you haven't found.
    Revert it.

════ BLOCKED ═══════════════════════════════════════════════════════════
  Root cause in a file you don't own · a key that looks wrong · a model the
  endpoint no longer serves · a failure you can't reproduce → catalogue with
  evidence → next queue item. Never stall. Never reach across the boundary.

════ INPUTS ONLY THE USER CAN GIVE (ask once, then keep going) ═════════
  1. Approval of this goal's Decisions (C1–C13), especially catalogue v1 and
     the 6-question cap (C2, C3) and the apply-by-agreement rule (C8).
  2. The BAS_PRODUCTION_GOAL.md amendment (model-generated readings allowed on
     the shared path under this goal's rules).
  3. Models and budget: confirm C11 and a per-document cost ceiling; how MCP
     deployments get model access.
  4. Permission to extend controlSchematic.ts title recognition additively,
     with before/after proof (otherwise it stays in controlIntent).
  5. More documents: stage the bulk corpus (ASSEMBLIES AS-2) or name partner
     jobs, for a frozen dev extension with control drawings and for the
     NEW-DOCUMENT TEST.
  6. Where the 11 schedule-printed rows go (ASSEMBLIES queue now or later),
     and whether floor-plan evidence (15 dev rows) gets its own goal.

════ DONE ══════════════════════════════════════════════════════════════
  · GATES 0, A, B1, B2, C, D, E green with held-out at or above threshold —
    or each shortfall a demonstrated ceiling with reproducible evidence.
  · WP6 run on every document the user supplied; NEW-DOCUMENT TEST reported.
  · Docs synced; the regression guard green; corpus-eval unchanged.
  · The draft PR marked ready — never merged by you.
```

## KICKOFF PROMPT (paste as the session's first message)

```
You are the coordinator for GOAL LOOP C (control intent) in erikjohnstone/master-plan.

1. Read opentakeoff-corpus/goals/CONTROL_INTENT.md top to bottom, then
   plans/05-control-intent-plan.md and plans/05-research/01–03.
2. Obey root AGENTS.md and opentakeoff/AGENTS.md: answer SHOULD THIS BE ON THE
   SHARED PATH? before every change; coordinator-only (no subagents unless I
   re-enable delegation); never merge to main — merge is deploy.
3. Check out branch `control-intent`, creating it per the goal's BRANCH line if
   it doesn't exist. Run SETUP. If anything beyond the known AS-1 failures is
   red at HEAD, stop and report.
4. Find where you are: the first work package whose GATE is not recorded as
   passed under "Active work: control intent" in opentakeoff-corpus/PROGRESS.md.
   Start there. Work THE QUEUE in order; follow THE LOOP for every step.
5. Report every gate's numbers when measured — dev AND held-out (aggregates
   only), including regressions — and never claim a number a run hasn't
   finished producing.
6. When you need something only I can give (INPUTS list), ask once, record the
   ask in PROGRESS.md, and continue with the next unblocked item. Never stall.
7. Keep going until DONE is true, or until a remaining ceiling is demonstrated
   with reproducible evidence.
```
