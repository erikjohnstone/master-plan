# Next major goal loop — HVAC/BAS cross-set + reconcile golden

**Status:** ACTIVE (Pillars A+B §6 MET; C = corpus-deep estimator takeoff; D queued)  
**Date:** 2026-08-31 (pillars C+D added 2026-09-01; C research 2026-09-01; C
reframed 2026-09-01; **C depth = every corpus BAS + valve set** 2026-09-01)  
**Authority:** `GOAL.md` + `WORKFLOWS.md` + live codebase + industry takeoff practice  

This document is the **implementation charter**. The next `/goal` should execute
this plan — not invent a new softer one.

**Foundation:** Trust and genuine agnostic blueprint workflows are our main
goal and our foundation. Every pillar must stay on the shared Session+ODL path,
set-agnostic, cite-honest, and production-ready on arbitrary uploads.

**Pillar C product bar (2026-09-01 — DEEP / corpus-complete):**

Pillar C is **not** “≥3 bulk demos” and **not** POINTS LIST / valve schedule
scrape. It is **estimator-deep takeoff truth for every BAS set and every valve
set in the corpus**, checked by the coordinator **and** corroborated by the
pipeline (keyed GT harness + locks + workflow suite). Do **not** stop, and do
**not** mark C done, until both are true for **all** of them.

**BAS (every corpus set with BAS/controls content):**
1. Inventory served equipment from schedules (qty + cite).
2. Build / verify the points model the way an estimator does — SOO + equipment
   + hard/soft I/O + proofs/interlocks + alarms/trends + spare disclose — not
   “read the POINTS LIST and call it done.”
3. Typed takeoff output with sources; labeled *estimate* path only when
   schedule/SOO-derived and never silently merged into printed-list truth.
4. Ground every served unit/device on plan with visible highlights (or honest
   SCHEDULE_ONLY / refuse).
5. **Self-check:** coordinator independently verifies the answer against the
   drawings (equipment counts, point math, plan hits).
6. **Pipeline corroboration:** GT harness / compile+reconcile locks agree with
   that verified answer on the shared Session path.

**Valves / dampers / actuators (every corpus set with those schedules):**
Same depth — contractor columns (tag, service, size, GPM/Cv, actuator, served
unit, cites), schedule↔plan paint, self-check + pipeline corroboration on
**every** valve/damper/actuator-bearing set — not a NAVFAC-only or “≥3 keys”
ceiling.

Thin compile stubs, checklist plumbing, or a handful of green demos are **not**
Pillar C done.

---

## 1. Verdict (four pillars — A/B now, C/D after A+B bar)

The ~50-intent inventory is largely **routing + schedule-compile complete on
NAVFAC-shaped fixtures**. The needle-moving loop has **four pillars** in
sequence — A and B are co-equal and current; C and D deepen the product once
A+B success metrics (§6) are met:

1. **Cross-set compile reliability (Pillar A)** — complete HVAC / BAS / valve /
   family workflows must work on the **next** job’s titles and headers without
   NAVFAC special cases. If demos “work on NAVFAC and die on the next set’s
   titles,” we are not golden no matter how pretty reconcile looks.
2. **Schedule↔plan reconciliation (Pillar B)** — prove scheduled tags on the
   drawings, name mismatches (`MATCH` / `SCHEDULE_ONLY` / `PLAN_ONLY` / honest
   refuse). That is the bid-critical step every serious MEP estimator runs.
3. **Estimator takeoff + plan grounding (Pillar C)** — estimator-deep **points
   takeoffs** and **valve / damper / actuator takeoffs** on **every** corpus
   BAS set and **every** corpus valve set: equipment inventory → SOO/I/O model
   → typed points / contractor columns → plan paint → **coordinator
   self-check + pipeline GT corroboration**. Not compile stubs; not “≥3 demos.”
4. **Symbol-count grounding depth (Pillar D)** — “how many VAVs/EFs on plan”
   style **symbol counts** highlighted and accurate across ≥3 bulk proofs
   (legend/schematic honesty retained). Pillar C already owns takeoff-line
   plan paints for points/valves/dampers; D owns general symbol-count proofs.

**Order:** prove the path is set-agnostic **first** (A), lock reconcile on that
path (B), then nail estimator points/valve/damper takeoffs **with plan paints**
(C), then broaden symbol-count highlight accuracy (D).

---

## 2. Where we actually are (codebase truth)

### Already strong (do not reopen as the main loop)

| Asset | Evidence |
|---|---|
| Complete HVAC / BAS / valve **schedule compiles** | `T-HVAC-01` LOCKED MCP+UI 5/5 · `T-BAS-01` LOCKED MCP+UI 5/5 · valve compile path on `main` |
| Intent router + phases | `takeoffWorkflow.js` — corpus_*, points_takeoff, valve_join, equipment_schedule, plan_link_refuse, … |
| Phrase-robust complete-set prompts | Workflows #46–#48 + compile kinds |
| Contractor columns + cites on schedule rows | Takeoff panel / `agentTakeoff` / familyTableCite |
| Suite gate | `test:demos` + `test:workflows` + web fixtures |
| Set-agnostic building gates | Tag-letter / `building X` (not job names) |
| Shared Session+ODL compile path | GOAL non-negotiable #11 |

`WORKFLOWS.md` marks **#1–#50 ON_MAIN**. That means durable intents + fixture
locks exist. It does **not** mean every row is N=5 Agent-UI golden, that
compiles survive foreign schedule titles, or that schedule↔plan joins are
contractor-grade across sets.

### Incomplete / weak (this is the loop)

| Gap | Evidence | Why it matters |
|---|---|---|
| **Cross-set compile / title brittleness** | Hand `scheduleFamilyNeedles`; NAVFAC-centric locks; itd-d1-lab / federal-mech / weld-county under-keyed | Demo failure mode: works here, dies on next firm’s titles |
| **Cross-set rowsym / join keys missing** | Those sets often “no key yet” in graph-eval | Cannot claim set-agnostic joins without rulers |
| **`T-VALVE-01` N=5 card pending** | ~~`CARD.md`: `AGENT UI PROVEN` · N=5 pending~~ → **LOCKED MCP+UI 5/5** (2026-08-31) | Third commercial takeoff locked |
| **Row→symbol recall ~73%** | `SHEET-GRAPH-EVAL.md` Bessemer 11/15; SR/TG inline misses | “Installed qty” / plan link workflows lie or refuse too often |
| **`sweep_inline_motif` not wired into `sweep_schedule_row`** | `INLINE-MOTIF-EVAL.md` explicit remaining work | Registers/grilles solved as motif but don’t move production join recall |
| **Schedule vs plan mismatches not a first-class deliverable** | Industry: reconcile both ways; we emit schedule qty *or* optional sweep | Competitors treat reconciliation as the product |
| **Plan-tool dual implementations** | GOAL follow-on: `count_marks` / `sweep_schedule_row` not fully Session-unified | UI↔MCP parity debt on the join path |
| **Graph prewarm** | GOAL follow-on after lock | Cold Agent latency / geometric-only footguns |
| **Legend→installed qty** | `REFUSED_NO_SCALE` by design on schematic legends | Do **not** make this the main loop — wrong physics |

### Explicit non-goals for this loop

- Replacing or retuning ODL.
- Expanding to 50 *new* chat intents (inventory is enough; deepen compile + join).
- Full duct LF / sheet-metal estimating (FastDUCT / WenDuct territory — later).
- Class-agnostic detectors, CLIP few-shot, bSDD ontology as primary work.
- Token proxies / Playwright sharding / Clipper — ops, not takeoff IQ.

---

## 3. Industry research → product implication

Sources synthesized: Simpro commercial HVAC takeoff guide; Kamai mechanical
takeoff; iBeam schedule-to-plan reconciliation; BuildCrux multi-pass HVAC AI
workflow; Trimble MEP AI takeoff (scale + count + reconcile); **ASHRAE
Guideline 13** (BAS specifying / spare I/O); **NISTIR 4606** (GSA DDC BAS guide
spec — alarms/trends/commands in point schedules); **ASHRAE G36** sequences;
ControlsHub DDC I/O list design; MEPBase BMS points calculators; Belimo Cv
practice; US MEP control-valve / damper schedule conventions.

### What elite HVAC/BAS takeoff workflows actually do

1. **Schedule-first quantities** for equipment / valves / points (we do this —
   must survive **any** US MEP set’s title phrasing).
2. **Plan placement** for every tagged unit that is drawn (we partially do this).
3. **Reconciliation both directions** — scheduled∖plan and plan∖scheduled —
   with mismatches surfaced for RFI / estimator judgment (Pillar B now ships).
4. **Honest refuse** when tag isn’t drawable text / sheet unscaled (we do —
   keep).
5. **Multi-pass discipline** — sheet roles → quantities → joins → review —
   not one LLM dump (we have phase machines; join pass still deepening).
6. **BAS (Pillar C — research gate):** SOO + equipment schedules → point
   schedule → **I/O list** (hardwired AI/AO/BI/BO) separate from soft/BACnet
   supervisory points; include proofs, interlocks, HOA, alarms, trends; apply
   **10–25% spare per type**; POINTS LIST extraction alone (e.g. NAVFAC **122**)
   is **not** a complete BAS takeoff — see WP8 research.
7. **Valves (Pillar C — research gate):** air + water families with contractor
   columns (tag, service, size, GPM, Cv, actuator, served unit, cites) across
   schedules and drawings; dampers/actuators first-class; never invent plan qty
   — see WP7 research.

**Implication:** Golden = **portable schedule truth** + **reconcile to drawings**
+ **truthful valve/BAS commercial workflows** (SOO/I/O-aware, not list-scrap)
+ **accurate highlighted plan grounding**. Any single pillar alone is a half
product.

---

## 4. Next goal loop objective (copy into `/goal`)

> **HVAC/BAS TRUST + AGNOSTIC BLUEPRINT WORKFLOWS (Pillars A–D):** Trust and
> genuine agnostic blueprint workflows are our foundation. **Pillar A+B (now):**
> Make complete HVAC / BAS / valve / family schedule compiles **reliably
> set-agnostic** (survive foreign titles / headers on the full Vol1+Vol2 bulk
> corpus — co-equal with reconcile, not polish), then make schedule↔plan
> reconciliation production-grade on the shared UI+MCP path — lock
> `T-VALVE-01` N=5 both surfaces; raise durable tagged plan-join recall by
> wiring inline motifs into `sweep_schedule_row`; ship reconcile with contractor
> columns+cites; keep all existing locks green. **Pillar C (after A+B):** Deep,
> truthful valve takeoff workflows (air/water valves, dampers, actuators) and
> deep BAS workflows (point lists, I/O, sequence of operations,
> equipment↔point↔location). **Pillar D (after A+B):** Deep plan grounding —
> symbol counts and mark answers **highlighted and accurate** on the drawing.
> Set-agnostic only. Always tests. No ODL rewrite. No duct-LF scope creep.

---

## 5. Work packages (implementation order)

Each package ends with **merge to `main`** only when its DoD is met. Do not
batch “almost done.”

**Pillar A = cross-set compile** · **Pillar B = reconcile / plan-join** ·
**Pillar C = valve + BAS workflow depth** · **Pillar D = plan grounding depth**.  
WP1 is Pillar A on purpose: if we ship reconcile before portable compile, we
risk a golden NAVFAC demo that dies on the next upload. WP7–WP9 (C/D) start
only after §6 A+B metrics are independently verified.

### WP0 — Charter lock (this doc)

- [x] `NEXT_GOAL_LOOP.md` written from codebase + research
- [x] Cross-set compile elevated to **co-equal** pillar and **WP1**
- [x] Implementation `/goal` cites this file as the bar

### WP1 — Cross-set compile reliability (Pillar A — first)

**Why first:** The failure mode “works on NAVFAC, dies on the next set’s
titles” makes every other win fragile. GOAL hard-case rule: NAVFAC proves the
path; other sets must work **without per-set tuning**. Corpus already has
itd-d1-lab, federal-mech, weld-county under-instrumented.

**Status (impl branch):** Soft title match + set-agnostic family broaden
landed. Keyed acceptance under `takeoffs/cross-set-compile/` for
`bldg5406-hvac-demo` (24), `federal-mech` (96), `itd-d1-lab` (35 + 9 HHW
valves + honest BAS empty). Family `keyRe` broadened for BOILER1 marks and
blank-title FCU/EV/EF/RF rows (Spokane + Macon Bibb WEAK→MEAT). NAVFAC
HVAC/BAS locks still green.

**Production bar (not optional):** A user uploading a US vector HVAC/BAS
set must get a working complete takeoff on the **shared UI+MCP path**
(`compile_corpus_takeoff` / Agent). Corpus keys and bulk sweeps are rulers
for that path — eval-only compile that never reaches the Agent UI is not
success. Bulk corpus in-scope for Pillar A stress:

- **Vol1** — `opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets` (~30 verified
  vector sets).
- **Vol2** — `opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets_Vol2` (**all 82**
  INDEX sets: 69 single-file + multipart/split folders rejoined as needed).
  Every Vol2 set is vector-dense with proven HVAC **and** BAS/controls
  content. Intake rubric: `takeoffs/VOL2_INTAKE.md`.

The entire Vol1+Vol2 inventory is the ruler — not a sample of Vol2.
Zero-count / WEAK sets drive set-agnostic family/title/BAS fixes (RTU,
ERV, furnace, heat-pump, outdoor-air unit, I/O LIST / DDC controller
summaries, …), not per-PDF hardcodes. Batching remains process only.

**DoD:**
1. [x] Author hand acceptance keys for **≥2 non-NAVFAC** HVAC/BAS sets
   (`cross-set-compile/*.compile.json`) covering HVAC compile, valve family
   (itd HHW), and honest empty BAS disclose.
2. [x] `crossCorpusWorkflow` keyed scores + suite hook (`test:workflows`).
3. [x] Soft title matching (`scheduleTitleMatch.mjs`) beside family specs /
   `query_table` — exact first; sibling excludes kept with unit fixtures.
4. [~] Header / column miss classes: grow set-agnostic vocab from real
   failures (sheetgraph `columnMapFor` path) — fixture counts only in tests.
   Progress: `CODE_RE` digit+letter suffixes; `EQUIP. TAG` own-identity;
   banding seam-gap orphans + thin identity-band absorb (Hawthorn AHU).
5. [x] Product fixes set-agnostic (title signals / keyRe broaden) — no
   NAVFAC sheet IDs or locked counts in product code.
6. [x] NAVFAC `T-HVAC-01` / `T-BAS-01` remain green after changes.

**Evidence:** `takeoffs/cross-set-compile/`; probe + keyed test logs;
`test:workflows` includes `crossCorpusWorkflow.test.mjs`.

### WP2 — Finish the third commercial takeoff: `T-VALVE-01` N=5

**Why here:** HVAC + BAS are LOCKED; valves are the remaining slate-class
takeoff and already Agent-UI proven. Runs **after** WP1 so valve lock isn’t
the only “done” story while cross-set compile still fails.

**DoD:**
1. [x] Frozen `prompt.txt` (+ CHW/HHW variants if needed) unchanged during N=5.
2. [x] MCP compile N=5 and UI N=5 against `truth.json` — Gates 1–5.
3. [x] `CARD.md` → `LOCKED (MCP 5/5 · UI 5/5)`; SLATE amended if GOAL allows third ID.
4. [x] Regression: multi-prompt + compile lock stays in suite gate (#50).
5. [x] Contractor columns: Valve mark, UNIT MARK, Service, Size, GPM, **one Cv**,
   Configuration, Notes, Sheet cite — no dual Cv / markdown tags.

**Evidence:** `runs/` + `export/` Run 5 + interrogation log + UI run changelog.

### WP3 — Raise plan-join recall (wire what we already proved)

**Why:** Documented 73.3% rowsym recall before inline-motif wiring; see
`INLINE-MOTIF-EVAL.md` for current numbers.

**Status (impl branch, 2026-08-31):** Inline-motif fallback wired in
`Session.sweepScheduleRow` + UI `agentSweepScheduleRow`. Bessemer rowsym
recall **100.0%** (15/15) forced-cold; locked by `rowsymBessemer.regression.test.mjs`.
Federal-mech VAV reconcile MATCH satisfies WP3.6 non-NAVFAC join precursor.

**DoD:**
1. [x] Shared-path only: `sweepScheduleRow` / `agentSweepScheduleRow` (UI+MCP)
   fall back to inline-motif corroboration when whole-shape fails — same
   commit bar / withhold doctrine.
2. [x] Bessemer (or successor) **rowsym recall ≥ 90%** on keyed tags, or every
   remaining miss is **named + expected refuse** in the key (no silent miss).
3. [x] Extend motif coverage for at least one additional disclosed gap family
   (e.g. TG bowtie) **or** keep TG as keyed expected-miss with a tracked
   follow-on — do not claim coverage you don’t have. **TG-1/TG-2 pass Bessemer
   rowsym (15/15) via `sweep_schedule_row` inline fallback; dedicated bowtie
   detector remains optional tracked follow-on (`INLINE-MOTIF-EVAL.md`).
4. [x] Durable tests: unit + graph-eval rowsym; suite gate green.
5. [x] No set-specific thresholds hardcoded to one PDF's pixel quirks beyond
   existing measured geometry constants justified in comments.
6. [x] Apply the same join path to ≥1 WP1 non-NAVFAC set key (rowsym or
   reconcile precursor) — not Bessemer-only.

**Evidence:** updated `SHEET-GRAPH-EVAL.md` / `INLINE-MOTIF-EVAL.md` numbers +
CI/demo locks.

### WP4 — First-class **reconcile** workflow (Pillar B — product leap)

**Why:** Industry defines accuracy as schedule∩plan + explicit mismatches.
Today estimators get schedule takeoff *or* ad-hoc sweeps — not a reconcile
document. Ships only after portable compile (WP1) so reconcile is not
NAVFAC theater.

**Ship:**
1. New intent in `takeoffWorkflow.js` (e.g. `schedule_plan_reconcile`) —
   phrase-robust: “reconcile VAVs to plan”, “scheduled vs installed”,
   “which equipment is on the schedule but not drawn”, etc.
2. Deterministic phases: survey → title/family compile → plan join per MARK →
   reconcile table → paint cites → answer.
3. Deliverable columns (contractor-grade): Tag · Family · Scheduled qty ·
   Installed qty · Status (`MATCH` | `SCHEDULE_ONLY` | `PLAN_ONLY` |
   `REFUSED_NO_SCALE` | `REFUSED_NO_TEXT` | `AMBIGUOUS`) · Schedule cite ·
   Plan cite(s).
4. Takeoff tab / Workflow data honesty: finished reconcile lines may land as
   a takeoff kind; exploratory crawls stay Workflow data.
5. BAS variant: point mark → equipment tag → plan location when tools allow;
   honest disclose when not.
6. Valve variant: schedule row ↔ plan installed when asked; never invent.

**Status (impl branch, 2026-08-31):** Intent + shared module + MCP tool + golden
fixtures green. Playwright UI proof (`playwright-reconcile-ui.mjs`) — bldg5406
VAV 9/9 MATCH via `window.__opentakeoff.reconcileSchedulePlan`. Orange County
bulk WP1 set: **32/32 VAV MATCH**. Hawthorn bulk: AHU **2/2** + CU **2/2** MATCH.
Blank-title+keyRe families join reconcile scaffold (compile parity).

**DoD:**
1. [x] Intent + phase tests (≥5 phrasings).
2. [x] Fixture proof on NAVFAC **and** ≥1 WP1 non-NAVFAC keyed set.
3. [x] Agent UI proof for at least one HVAC reconcile ask (Playwright or durable
   engine+golden equivalent if UI blocked — prefer UI once).
4. [x] `WORKFLOWS.md` row(s) added/updated; suite gate includes reconcile lock.
5. [x] Set-agnostic: no NAVFAC sheet IDs / locked counts in product code.

**Evidence:** golden fixture + interrogation-style negative cases
(false-premise “all scheduled units are drawn” must fail honestly).

### WP5 — Shared-path hygiene on the join lane

**Why:** GOAL follow-ons; parity bugs on plan tools undermine golden demos.

**DoD:**
1. [x] `count_marks` / `sweep_schedule_row` (and agent wrappers) share one Session
   implementation — no geometric-only UI fork for quantity/cite answers.
2. [x] Background graph prewarm on upload: non-blocking “schedules indexing…”,
   cache `graphForPipeline`, never silent geometric-only for compile/reconcile.
3. [x] Tests proving UI and MCP answers match on a frozen fixture for reconcile +
   valve compile **and** one non-NAVFAC compile lock from WP1.

**Evidence:** parity test + prewarm smoke; docs updated in GOAL follow-on
section as done.

### WP6 — Regression fortress

**DoD:**
1. `npm run test:demos` + `test:workflows` + web workflow fixtures green.
2. T-HVAC-01 / T-BAS-01 remain LOCKED (re-run spot gates if shared path
   touched).
3. WP1 non-NAVFAC compile keys stay green whenever later WPs land.
4. Re-open any `WORKFLOWS.md` row that regresses — fix before claiming WP
   complete.
5. Prefer durable engine/golden tests; Agent UI demos for chat-facing
   reconcile + valve N=5 only — don’t re-burn 50 Playwrights.

### WP7 — Valve workflow depth (Pillar C — after A+B bar)

**Why:** Schedule compile for valves exists (`T-VALVE-01` LOCKED), but bulk
Vol2 shows most sets still at **0 valve rows** — and air-side valves,
dampers, and actuators are not yet first-class commercial workflows. Estimators
need CHW/HHW **and** air-side isolation/control devices with served unit, Cv,
configuration, schedule cite, and optional plan-installed qty when drawable —
never invented.

#### Research findings (mandatory gate — 2026-09-01; do not skip)

**Engine architecture (2026-09-01 — supersedes regex-first fixes):** Commercial takeoff
(Kamai, Trimble MEP, iBeam) parses **native PDF vector geometry** (text bboxes, line
segments, scale) before any title/match rules. Regex/classification is Layer 5 only.
Pillar C’s 70 compile-zero valve sets fail at **Layer 1/2 table extraction** or untitled
grid classification — not because valves are absent from PDFs (0/81 PDFs lack valve text;
63/81 compile-zero still have PDF signal). Full OSS stack + integration order:
`takeoffs/VECTOR_TAKEOFF_ENGINE_RESEARCH.md`.

Sources: Belimo / industry Cv practice; US MEP control-device schedule
conventions; mechanical estimating takeoff scopes (isolation / balancing /
control valves + dampers); ASHRAE-adjacent actuator schedule columns; Kamai vector
geometry docs; OpenDataLoader-PDF; Camelot/gmft/pdfplumber; MEPdetect vector path.

**What a real valve takeoff is (not “dump CHW+HHW control valve rows”):**

1. **Families across media** — water (CHW/HHW/CW/HW/steam/condensate) **and**
   air (control dampers, fire/smoke, VAV terminal, fume-hood / ECV). Isolation,
   control, balancing, check, PRV/PSV, mixing, triple-duty, bypass — each is a
   distinct commercial line when the set schedules it.
2. **Contractor columns** (schedule + P&ID/plan cross-check): Tag · Service ·
   Size · Type/config (2-way/3-way, etc.) · Design GPM · Cv · Actuator
   (electric/pneumatic, power, signal 0–10V / 4–20mA / 3–15psi) · Served unit ·
   Fail position · Schedule cite · optional Plan installed qty/cites when
   drawable. Never invent plan qty.
3. **Cv is first-class** — `Cv = Q × √(SG/ΔP)`; authority typically ~0.3–0.5.
   Takeoff must **extract printed Cv/GPM/size**, not re-size valves from
   physics in product code.
4. **Actuators are separate commercial scope** when schedules/specs call them
   out (damper actuators, valve actuators, fail-safe ratings) — do not collapse
   into a single “valve row” if the drawing separates them.
5. **Reconcile both ways** when tags are plan-text — same Pillar B statuses;
   schematic-only / unscaled sheets stay honest refuse.

**Product gap vs today:** `T-VALVE-01` locks NAVFAC CHW+HHW control valves well;
Vol2 already surfaces damper/isolation/PRV/mixing/PSV/fume-hood on ~12 MEAT
keys. That is **plumbing**, not done. Pillar C valve bar = **every corpus set
with valve/damper/actuator schedules**, self-checked + pipeline-corroborated.
Thin compile stubs / ≥3 demos ≠ commercial valve takeoff.

**Ship (set-agnostic shared path only):**
1. Air + water valve families: isolation, control, balancing, check,
   pressure-reducing, triple-duty, etc. — title/keyRe from real US MEP sets,
   not NAVFAC-only.
2. Damper + actuator workflows: control dampers, fire/smoke, VAV terminal
   dampers, fume-hood dampers — reconcile-capable when plan text exists.
3. Valve takeoff intent parity UI+MCP: contractor columns (mark, served unit,
   service, size, GPM, Cv, configuration, actuator, notes, sheet cite) +
   plan highlight when drawable.
4. **Corpus-complete acceptance:** every Vol1/Vol2 set that schedules valves /
   dampers / actuators gets a keyed takeoff + plan-ground outcome (MATCH or
   honest SCHEDULE_ONLY/refuse) — expand keys until the corpus is covered,
   not stop at a sample of 3.

**DoD:**
1. [x] Air-side + water-side valve compile paths keyed on multiple bulk sets
   (Carson CONTROL_DAMPER 2 · pier ISO+damper 36 · ITD HHW+lab air 31 ·
   SDSU fume-hood+PRV 60 · Vermillion dampers 24 — plus NAVFAC CHW+HHW 163).
2. [x] Damper/actuator families compile (CONTROL_DAMPER / FUME_HOOD_DAMPER in
   valve kind; actuator/fail/signal columns when printed). Reconcile aliases
   for CONTROL_DAMPER / MOTORIZED DAMPER; pier + Vermillion CONTROL_DAMPER
   locks already in `reconcileWorkflow.test.mjs`.
3. [x] Unit + T-VALVE-01 locks green after expansion; MCP `control_valves`
   enum parity with UI. Full `test:workflows` **104/104** green post-WP8
   (2026-09-01).
4. [x] No per-set hardcodes; honest empty when set has no extractable valve
   tables (service=CHW|HHW still hydronic-only).
5. [x] Research implications reflected: Cv/GPM/size/served unit + printed
   Actuator / Fail position / Control signal; never invent plan qty.
6. [ ] **Every** corpus valve/damper/actuator-bearing set: contractor-column
   takeoff keyed + coordinator self-check of counts/columns against drawings.
7. [ ] **Every** such set: pipeline corroboration (GT/reconcile locks) matches
   the self-checked answer; plan paint MATCH or honest SCHEDULE_ONLY/refuse.
8. [ ] No “sample of 3 and declare victory” — corpus census of valve-bearing
   sets tracked in PROGRESS until 100% covered.

**Implementation pointers (shared path — after §6 MET; 2026-09-01 survey):**
- Module: `opentakeoff/web/src/lib/corpusTakeoff.mjs` (MCP re-exports).
- Today `compileControlValveTakeoff` / `CONTROL_VALVE_FAMILIES` = **CHW+HHW
  only**; isolation/PRV/PSV/mixing/CONTROL_DAMPER/FUME_HOOD/LAB_AIR already
  exist in `HVAC_FAMILY_SPECS` and score under `hvac_equipment` but are
  **excluded** from `kind: "control_valves"`.
- `normalizeControlValveCells` today: served unit · size · GPM · Cv ·
  configuration · notes · service. Promote printed Actuator / Fail position /
  control signal when present (already in `TAKEOFF_SPEC_ORDER` for panel).
- MCP `compile_corpus_takeoff` enum still lacks `control_valves` — UI already
  has it; close parity.
- First bulk keys with `control_valves.items > 0`: NAVFAC 001 (163), VA ER 053
  (38), ITD 062 / itd-d1-lab (9). Damper/ISO/PRV MEAT often sits in HVAC cats
  with `control_valves.items = 0` — grow valve kind or family keys there.
- First code change: expand valve-kind families set-agnostically + column
  normalize; extend `takeoffValve01` / `crossCorpusWorkflow` / title-match
  tests. No NAVFAC hardcodes.

### WP8 — BAS workflow depth (Pillar C — after A+B bar)

**Why:** Only **~5** Vol2/bulk keys currently have `bas_points.rows > 0`
(NAVFAC 122, pier 39, lab 63, Vermillion 231, Colville 42). BAS is half the
“HVAC/BAS” product — and **reading POINTS LIST tables alone is not a complete
BAS takeoff**.

#### Research findings (mandatory gate — 2026-09-01; do not skip)

Sources: ASHRAE Guideline 13 (specifying BAS / spare I/O practice); NISTIR 4606
(GSA DDC BAS guide specification — points must include monitoring, control,
command, strategy, **alarm**, and **trend** requirements); ASHRAE Guideline 36
(high-performance sequences); industry DDC I/O list guides (ControlsHub /
MEPBase BMS points calculators); CSE / BACnet hardwired vs soft-point practice.

**Hard truth — `T-BAS-01`’s 122 POINTS LIST rows is necessary but ridiculously
incomplete as a “BAS takeoff”:**

| Layer | What industry counts | What OpenTakeoff does today |
|---|---|---|
| Published POINTS / DDC lists | Row-per-point AI/AO/BI/BO when printed | **Yes** — T-BAS-01 / `bas_points` compile |
| **Sequence of operation (SOO)** | Drives which points must exist (modes, safeties, resets, interlocks) | Partial / weak — narrative SOO not a takeoff driver |
| **Hardwired I/O vs soft/supervisory** | Terminals (AI/AO/BI/BO/pulse) vs BACnet/Modbus integrated / calculated setpoints | Typed counts when table has types; **no** hard-vs-soft architecture split |
| **Proofs / interlocks / HOA** | Fan/pump proof, end switches, VFD fault, fire/smoke, Hand-Off-Auto | Only if present as list rows — often missed in “points list only” mindset |
| **Alarms + trends** | NISTIR 4606 requires alarm + trend-log requirements in point schedules | Not first-class takeoff columns |
| **Equipment-schedule-derived points** | Qty × points/unit from AHU/VAV/FCU/plant schedules when no full list | Not implemented as product path |
| **Spare capacity** | ASHRAE G13 practice **10–25%** spare **per point type per controller** (often ~15–20%) | Not in deliverable; must disclose when estimating hardware |
| **Panel / controller architecture** | Local vs remote I/O, expansion modules, licensing soft points | Out of scope for qty-from-PDF unless drawings expose it — honest disclose |

**Estimating workflow elites actually run:**

1. Inventory plant + terminal equipment from schedules (Pillar A).
2. Read SOO / control diagrams → required sensors, commands, proofs, safeties.
3. Build or verify a **point schedule** (operational model).
4. Derive **I/O list** (hardware landings) separately from soft/supervisory points.
5. Apply spare policy; map to controller/module counts for bid.
6. Cross-check published POINTS/I/O LIST sheets against that model — gaps = RFI.

**Product implication for WP8:** Growing `bas_points.rows > 0` from ~5 keys is
necessary but **not sufficient**. Pillar C must:

- Keep truthful extraction of every printed POINTS/I/O/DDC list (set-agnostic).
- Add **SOO/reference extractable tables** where vector text allows; honest
  refuse when narrative-only / raster.
- Surface **hard vs soft** when drawings distinguish them; never invent soft
  BACnet counts from schedules without evidence.
- Prefer **equipment↔point↔location** joins when drawable; disclose schematic-only.
- Document **where we refuse (not done)**: a complete commercial BAS takeoff may
  require SOO+schedule-derived I/O that PDFs don’t fully tabulate — do not
  score-chase by hallucinating points; prefer disclosed gaps + spare-policy
  notes. Refuse/stop is unfinished work, never a locked success metric.

**Ship (shared path):**
1. Deepen `bas_points` extraction: POINTS LIST, I/O LIST, DDC CONTROLLER
   INPUT/OUTPUT, alarm/trend columns — set-agnostic title needles (Colville
   I/O LIST pattern, not NAVFAC-only).
2. BAS takeoff + reconcile variants: point mark → equipment tag → plan
   location when drawable; honest disclose when schematic-only.
3. Sequence-of-operations / controls narrative tables where vector-extractable
   — reference-eval exact cells, not LLM summaries. Where SOO is not
   tabular, disclose “SOO present but not row-extractable” rather than
   pretending POINTS LIST = full BAS takeoff.
4. Rollups (AI/AO/BI/BO totals) only when the source table supports them;
   refuse rollups-from-matrices that are not row-per-point (bldg5406
   HARDWAREPOINTS). Separate hardwired vs integrated/soft when columns exist.
5. Optional **schedule-derived point estimate** path (equipment qty × typed
   points/unit) only as an explicitly labeled *estimate* with sources — never
   silently merge into POINTS LIST truth.

**DoD (plumbing vs estimator product — do not conflate):**

*Printed-list plumbing (necessary, not sufficient):*
1. [x] ≥5 bulk sets with keyed `bas_points` acceptance (Vermillion 231 · NAVFAC
   122 · lab 63 · Colville 42 · pier 39 — already on shared path).
2. [x] BAS workflow locks: T-BAS-01 green with WP8 rollups (alarm 44 / trend 32
   Yes-only on NAVFAC; AI/AO/BI/BO frozen 43/15/49/15); unit WP8 extras green
   (No/- never inflate). Five bulk keys lock optional alarm/trend/hardwired/soft.
   Full `test:workflows` **104/104** green after WP8 batch (2026-09-01).
3. [x] SOO honest refuse documented (BAS_EXCLUSIONS + provenance: SOO is not a
   points source; POINTS LIST ≠ complete BAS takeoff). Tabular SOO scoring
   remains follow-on where vector-extractable.
4. [x] UI+MCP parity on bas_points compile (shared `compileBasTakeoff`).
5. [x] Research implications reflected: printed ALARM / TREND / hardwired-vs-soft
   promoted when columns exist; never invent spare % or SOO-derived points.
6. [x] `served_equipment` join key on BAS items (UNIT/EQUIPMENT/SERVED columns,
   I/O device keys, or POINTS LIST title unit token — never invented); unit lock.
7. [x] `corpus_bas` / `corpus_valves` workflows require plan sweep/reconcile +
   highlight before answer (estimator takeoff ≠ schedule scrape).

*Estimator product bar (Pillar C incomplete until ALL corpus BAS + valve
sets pass — do not stop at a sample):*
8. [~] **Equipment inventory** from schedules (shared HVAC compile) on **every**
   corpus BAS-bearing set — every served unit/device that owns points is listed
   with qty + cite. **Plumbing:** `estimator_product.equipment_inventory` from
   `compileHvacTakeoff` on every BAS compile (2026-09-01). **Census:** 15-set
   expanded batch shows inventory+estimate on 11/15 bas:0 sets (SDSU 128 units);
   still open: every bearing set verified + GT-locked.
9. [~] **SOO / controls model** where vector-extractable: required sensors,
   commands, proofs, interlocks, alarms/trends per equipment type; honest
   refuse when narrative-only / raster — never invent points from SOO prose.
   **Plumbing:** `detectSooPresence` discloses present_not_row_extractable;
   SOO-derived points remain `refuse_not_done`. Tabular SOO scoring still open.
10. [~] **Typed points takeoff** = printed POINTS/I/O lists **plus** labeled
    schedule/SOO-derived *estimate* path (qty × points/unit) with sources;
    gap report vs printed lists; spare % disclosed as policy note only.
    **Shared-path plumbing landed 2026-09-01** (`estimator_product` on
    `compileBasTakeoff` + Takeoff `BAS_ESTIMATOR` rows). Still open: corpus-wide
    run + coordinator lock — estimate path ≠ Pillar C done.
11. [~] **Ground-truth harness for every corpus BAS set:** coordinator
    self-checks equipment inventory + typed point rollups + plan-grounding
    against the drawings; keyed harness locks that answer; pipeline scorer must
    match — not “122 rows matched the POINTS LIST scrape,” not “≥3 demos.”
    **Partial (2026-09-01):** keyed BAS floor (5/5) has drawing-backed
    estimator gap + SOO corroboration (`pillar-c-*-estimator-gap-verify`);
    drafts still `gt_locked: false` — not corpus-complete.
12. [~] **Plan paint for every corpus BAS + valve/damper/actuator set:**
    served_equipment / valve / damper marks paint via shared sweep (MATCH or
    honest SCHEDULE_ONLY) with visible cites — census in PROGRESS until 100%.
    **Partial (2026-09-01):** keyed floor census recorded — BAS served
    MATCH/ERROR tallies + valve reconcile MATCH/SO rollups; all still
    `refuse_not_done` / `gt_locked: false` (`pillar-c-plan-paint-census-keyed-floor.json`).
13. [ ] **Stop condition:** Pillar C done only when every BAS set and every
    valve set in the corpus has (a) coordinator-verified right answer and
    (b) pipeline corroboration on the shared path. Expand BAS/valve keys until
    corpus coverage is complete (today ~5 BAS keys / ~12 valve-family keys —
    those are the floor to deepen, then grow to every bearing set).

**Implementation pointers (shared path — after §6 MET; 2026-09-01 survey):**
- Module: `compileBasTakeoff` / `isBasPointsListTitle` / `basPointExtras` /
  `printedBasFlag` / `servedEquipmentFromBasRow` in `corpusTakeoff.mjs`.
  Needles already cover POINTS LIST, DDC POINTS, I/O LIST, CONTROLLER I/O,
  POINTS SCHEDULE; SOO-like “POINT LIST TABLE” intentionally rejected.
- Today: row + AI/AO/BI/BO totals; I/O LIST ANALOG→AI, DIGITAL→BI; ALARM/TREND
  Yes-only; `served_equipment` for plan-join; workflow gate demands
  `sweep_schedule_row` / `reconcile_schedule_plan` paint on corpus_bas/valves.
- Corpus-deep next (estimator product — not plumbing): for **each** BAS and
  valve-bearing set — (1) equipment inventory; (2) SOO/controls extract where
  tabular; (3) labeled qty×points/unit estimate + gap vs printed POINTS/I/O;
  (4) GT harness key locked to coordinator-verified truth; (5) plan paint.
  Reuse `reconcileWorkflow` CONTROL_DAMPER / equipment MATCH patterns — honest
  SCHEDULE_ONLY when not plan-text. Track census in PROGRESS; do not declare C
  done on a subset.
- Spare % and SOO-derived points remain honest refuse / disclose — never invent
  and never silently merge estimates into POINTS LIST truth.
- Post-WP8 `test:workflows` **104/104** green (2026-09-01) — plumbing only.

### WP9 — Plan grounding depth (Pillar D — after A+B bar)

**Why:** Users asking “how many VAVs on plan” or “count the EF symbols” need
**accurate quantities with visible highlights** — every cite must point at real
geometry on the plan sheet, not legend-only or schedule-only overclaim. Scale +
legend honesty gates exist; this WP makes grounding the primary product bar.

**Ship (shared path):**
1. `count_marks` / symbol_sweep / reconcile plan cites: every reported
   installed qty has ≥1 verifiable plan highlight (bbox or sweep path) on the
   cited sheet.
2. Agent/UI paint parity: Takeoff tab and canvas show the same highlights MCP
   returns.
3. Negative controls: legend-only, schematic-only, and `REFUSED_NO_SCALE`
   sheets must not produce false plan counts.
4. Bulk acceptance: keyed symbol-count proofs on ≥3 sets spanning grilles,
   fans, valves, and terminal units.

**DoD:**
1. [ ] Highlight-accuracy fixture suite (engine/golden) — qty matches visible
   paints within measured tolerance.
2. [ ] ≥3 bulk sets with locked count/reconcile grounding proofs.
3. [ ] `test:workflows` + UI parity test on at least one count ask.
4. [ ] Documented refuse/stops (exploded text, raster) — unfinished work, no silent misses.

---

## 6. Success metric (when this loop is “golden”)

The loop is complete **only when all are true**:

### Pillars A + B (current gate)

1. **Pillar A:** Vol1+Vol2 bulk compile keys green (82/82 Vol2 + Vol1); soft
   title / header generalization shipped with sibling-exclusion regressions;
   NAVFAC HVAC/BAS locks still green.
2. **`T-VALVE-01` LOCKED** MCP 5/5 · UI 5/5.
3. **Row→symbol / plan-join** recall meets WP3 bar with published numbers
   (including at least one non-NAVFAC join key).
4. **Pillar B:** Reconcile workflow ships on `main` with contractor columns +
   cites + tests + at least one Agent UI proof — proven on NAVFAC **and**
   multiple WP1/Vol2 bulk sets.
5. **Shared-path** plan tools + prewarm DoD met.
6. **Prior locks** + suite gate still green.
7. An estimator can upload a **non-NAVFAC** set and get a correct complete /
   family compile **without** a code change for that job’s titles — **and**
   can ask *“Reconcile the VAV schedule to the plans”* (or equivalent) and
   get a finished Takeoff-grade reconcile table — not chat scrap.

### Pillars C + D (after A+B)

8. **Pillar C — Valves (corpus-complete):** Air + water valve, damper, and
   actuator takeoffs are production-grade on the shared path with contractor
   columns, cites, and plan highlights for **every** corpus set that schedules
   them — each answer coordinator-self-checked **and** pipeline-corroborated;
   truthful empty when no valve tables. Sample-of-3 is not done.
9. **Pillar C — BAS (corpus-complete):** Estimator-method points takeoffs
   (equipment inventory → SOO/I/O model → typed points + estimate/gap → plan
   paint) for **every** corpus BAS-bearing set — each answer
   coordinator-self-checked **and** pipeline-corroborated via GT harness.
   POINTS LIST scrape alone never counts as done.
10. **Pillar D — Grounding:** Symbol counts and mark sweeps return **accurate
    quantities with visible plan highlights** on ≥3 bulk proofs; legend-only and
    unscaled refuses stay honest.

If any pillar is weak, incomplete, or only “consistent with” completion —
the loop is **not** done.

---

## 7. Suggested `/goal` one-liner for the implementation agent

```text
/goal Execute opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md in full.
Foundation: trust + genuine agnostic blueprint workflows on shared UI+MCP path.
Pillar A+B now — cross-set compile on FULL Vol1+Vol2 bulk (82/82 Vol2 INDEX;
honest ZERO/WEAK OK; set-agnostic title/keyRe/BAS only); T-VALVE-01 N=5 lock;
inline motif + rowsym bar; schedule↔plan reconcile with contractor columns+cites
(proven on NAVFAC + bulk WP1/Vol2 sets); shared-path plan-tool unify + graph
prewarm; keep HVAC/BAS locks and suite gate green.
After A+B bar (§6): Pillar C — corpus-deep BAS + valve/damper/actuator
takeoffs (estimator method); do not stop until every BAS set and every valve
set has coordinator-verified truth corroborated by the pipeline GT harness;
Pillar D — symbol-count highlight accuracy. Set-agnostic only. Always tests.
No ODL rewrite. No cloud workers.
```

---

## 8. Why this moves the needle (vs alternatives)

| Alternative | Why not next |
|---|---|
| More intent rows past ~50 | Inventory is enough; depth > breadth |
| Legend→qty / CLIP / SAHI | Blocked or unproven for qty **today** |
| Duct LF takeoff | Huge adjacent product; dilutes HVAC/BAS schedule+points golden |
| Token / test infra | Doesn’t change estimator deliverable quality |
| Ontology (bSDD) alone | Doesn’t place tags on plans |
| Reconcile-only on NAVFAC | Golden theater — dies on next set’s titles |

**This loop** turns OpenTakeoff from “great NAVFAC schedule compiler with
demos” into “the HVAC/BAS takeoff that **works on the next set**, **reconciles
to the drawings**, **delivers truthful valve/BAS commercial workflows**, and
**grounds every symbol count on the plan**” — trust + agnostic blueprint
workflows on our vector-grounded, cite-honest stack.
