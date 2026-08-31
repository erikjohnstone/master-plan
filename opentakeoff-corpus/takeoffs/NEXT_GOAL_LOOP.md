# Next major goal loop — HVAC/BAS cross-set + reconcile golden

**Status:** PLAN (for the upcoming implementation goal)  
**Date:** 2026-08-31  
**Authority:** `GOAL.md` + `WORKFLOWS.md` + live codebase + industry takeoff practice  

This document is the **implementation charter**. The next `/goal` should execute
this plan — not invent a new softer one.

---

## 1. Verdict (two co-equal pillars)

The ~50-intent inventory is largely **routing + schedule-compile complete on
NAVFAC-shaped fixtures**. The needle-moving next loop has **two co-equal
pillars** — neither is optional polish:

1. **Cross-set compile reliability** — complete HVAC / BAS / valve / family
   workflows must work on the **next** job’s titles and headers without
   NAVFAC special cases. If demos “work on NAVFAC and die on the next set’s
   titles,” we are not golden no matter how pretty reconcile looks.
2. **Schedule↔plan reconciliation** — prove scheduled tags on the drawings,
   name mismatches (`MATCH` / `SCHEDULE_ONLY` / `PLAN_ONLY` / honest refuse).
   That is the bid-critical step every serious MEP estimator runs (Simpro /
   Kamai / iBeam).

**Order:** prove the path is set-agnostic **first**, then lock valves, raise
plan-join recall, and ship reconcile on that same path — so reconcile cannot
be a NAVFAC-only showcase.

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
workflow; controls/BAS points practice (ASHRAE G13-style I/O, MEPBase points
calculators); Trimble MEP AI takeoff (scale + count + reconcile).

### What elite HVAC/BAS takeoff workflows actually do

1. **Schedule-first quantities** for equipment / valves / points (we do this —
   must survive **any** US MEP set’s title phrasing).
2. **Plan placement** for every tagged unit that is drawn (we partially do this).
3. **Reconciliation both directions** — scheduled∖plan and plan∖scheduled —
   with mismatches surfaced for RFI / estimator judgment (we largely don’t).
4. **Honest refuse** when tag isn’t drawable text / sheet unscaled (we do —
   keep).
5. **Multi-pass discipline** — sheet roles → quantities → joins → review —
   not one LLM dump (we have phase machines; join pass is underpowered).
6. **BAS** = points lists + AI/AO/BI/BO rollups + disclose non-extractable
   lists (we do); deepen **equipment↔point↔location** across sets.
7. **Valves** = schedule family (CHW/HHW) + served unit + Cv + **optional**
   installed plan qty when asked — never invent plan cites.

**Implication:** Golden = **portable schedule truth** + **reconcile to drawings**.
Either pillar alone is a half product.

---

## 4. Next goal loop objective (copy into `/goal`)

> **HVAC/BAS CROSS-SET + RECONCILE GOLDEN:** Make complete HVAC / BAS / valve /
> family schedule compiles **reliably set-agnostic** (survive foreign titles /
> headers on ≥2 non-NAVFAC keyed sets — co-equal with reconcile, not polish),
> then make schedule↔plan reconciliation production-grade on the shared UI+MCP
> path — lock `T-VALVE-01` N=5 both surfaces; raise durable tagged plan-join
> recall by wiring inline motifs into `sweep_schedule_row`; ship a first-class
> reconcile workflow (scheduled vs installed vs refused / missing) with
> contractor cites; keep all existing locks green.
> Set-agnostic only. Always tests. No ODL rewrite. No duct-LF scope creep.

---

## 5. Work packages (implementation order)

Each package ends with **merge to `main`** only when its DoD is met. Do not
batch “almost done.”

**Pillar A = cross-set compile** · **Pillar B = reconcile / plan-join**.  
WP1 is Pillar A on purpose: if we ship reconcile before portable compile, we
risk a golden NAVFAC demo that dies on the next upload.

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
success. Bulk corpus (`opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets`, 30
verified vector sets) is in-scope stress for Pillar A; zero-count sets
drive set-agnostic family/title fixes (RTU, ERV, furnace, heat-pump,
outdoor-air unit, …), not per-PDF hardcodes.

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
VAV 9/9 MATCH via `window.__opentakeoff.reconcileSchedulePlan`.

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

---

## 6. Success metric (when this loop is “golden”)

The loop is complete **only when all are true**:

1. **Pillar A:** ≥2 non-NAVFAC HVAC/BAS sets have keyed **compile** proof
   green; soft title / header generalization shipped with sibling-exclusion
   regressions; NAVFAC HVAC/BAS locks still green.
2. **`T-VALVE-01` LOCKED** MCP 5/5 · UI 5/5.
3. **Row→symbol / plan-join** recall meets WP3 bar with published numbers
   (including at least one non-NAVFAC join key).
4. **Pillar B:** Reconcile workflow ships on `main` with contractor columns +
   cites + tests + at least one Agent UI proof — proven on NAVFAC **and** a
   WP1 set.
5. **Shared-path** plan tools + prewarm DoD met.
6. **Prior locks** + suite gate still green.
7. An estimator can upload a **non-NAVFAC** set and get a correct complete /
   family compile **without** a code change for that job’s titles — **and**
   can ask *“Reconcile the VAV schedule to the plans”* (or equivalent) and
   get a finished Takeoff-grade reconcile table — not chat scrap.

If either pillar is weak, incomplete, or only “consistent with” completion —
the loop is **not** done.

---

## 7. Suggested `/goal` one-liner for the implementation agent

```text
/goal Execute opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md in full:
Pillar A first — cross-set compile reliability (≥2 non-NAVFAC keyed HVAC/BAS
sets, soft title/header generalization, no NAVFAC-only product paths); then
T-VALVE-01 N=5 lock; wire inline motif into sweep_schedule_row and hit the
rowsym bar; ship HVAC/BAS/valve schedule↔plan reconcile workflow on shared
UI+MCP path with contractor columns+cites (Pillar B, proven on NAVFAC + a
WP1 set); shared-path plan-tool unify + graph prewarm; keep HVAC/BAS locks
and suite gate green.
Set-agnostic only. Always tests. No ODL rewrite. No duct-LF scope creep.
Cross-set compile is co-equal with reconcile — not optional polish.
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
demos” into “the HVAC/BAS takeoff that **works on the next set** and
**reconciles to the drawings**” — portable schedule truth + commercial
reconciliation bar, on our vector-grounded, cite-honest stack.
