# Next major goal loop — HVAC/BAS schedule↔plan golden

**Status:** PLAN (for the upcoming implementation goal)  
**Date:** 2026-08-31  
**Authority:** `GOAL.md` + `WORKFLOWS.md` + live codebase + industry takeoff practice  

This document is the **implementation charter**. The next `/goal` should execute
this plan — not invent a new softer one.

---

## 1. Verdict (one sentence)

The ~50-intent inventory is largely **routing + schedule-compile complete**; the
needle-moving next loop is to make OpenTakeoff **golden at schedule↔plan
reconciliation for HVAC equipment, control valves, and BAS points** — the work
every serious MEP estimator treats as the bid-critical step, and where our
product is closest but still incomplete.

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
locks exist. It does **not** mean every row is N=5 Agent-UI golden, or that
schedule↔plan joins are contractor-grade across sets.

### Incomplete / weak (this is the loop)

| Gap | Evidence | Why it matters |
|---|---|---|
| **`T-VALVE-01` N=5 card pending** | `CARD.md`: `AGENT UI PROVEN` · N=5 pending; SLATE still only HVAC+BAS | Core third commercial takeoff not fully locked |
| **Row→symbol recall ~73%** | `SHEET-GRAPH-EVAL.md` Bessemer 11/15; SR/TG inline misses | “Installed qty” / plan link workflows lie or refuse too often |
| **`sweep_inline_motif` not wired into `sweep_schedule_row`** | `INLINE-MOTIF-EVAL.md` explicit remaining work | Registers/grilles exist as a solved motif but don’t move production join recall |
| **Cross-set rowsym / join keys missing** | itd-d1-lab, federal-mech, weld-county — “no key yet” | NAVFAC-only green ≠ set-agnostic golden |
| **Schedule vs plan mismatches not a first-class deliverable** | Industry: reconcile every tag both ways; we mostly emit schedule qty *or* optional sweep | Competitors (Kamai, Simpro guidance, iBeam) treat reconciliation as the product |
| **Plan-tool dual implementations** | GOAL follow-on: `count_marks` / `sweep_schedule_row` still not fully Session-unified | UI↔MCP parity debt on the join path |
| **Graph prewarm** | GOAL follow-on after lock | Cold Agent latency / geometric-only footguns |
| **Title-needle brittleness** | Hand `scheduleFamilyNeedles` | Next firm’s schedule title fails family workflows without code edit |
| **Legend→installed qty** | `REFUSED_NO_SCALE` by design on schematic legends | Do **not** make this the main loop — wrong physics |

### Explicit non-goals for this loop

- Replacing or retuning ODL.
- Expanding to 50 *new* chat intents (inventory is enough; deepen the ones that join).
- Full duct LF / sheet-metal estimating (FastDUCT / WenDuct territory — later product lane).
- Class-agnostic detectors, CLIP few-shot, bSDD ontology as primary work (not ready to move qty today).
- Token proxies / Playwright sharding / Clipper — ops, not takeoff IQ.

---

## 3. Industry research → product implication

Sources synthesized: Simpro commercial HVAC takeoff guide; Kamai mechanical
takeoff; iBeam schedule-to-plan reconciliation; BuildCrux multi-pass HVAC AI
workflow; controls/BAS points practice (ASHRAE G13-style I/O, MEPBase points
calculators); Trimble MEP AI takeoff (scale + count + reconcile).

### What elite HVAC/BAS takeoff workflows actually do

1. **Schedule-first quantities** for equipment / valves / points (we do this).
2. **Plan placement** for every tagged unit that is drawn (we partially do this).
3. **Reconciliation both directions** — scheduled∖plan and plan∖scheduled —
   with mismatches surfaced for RFI / estimator judgment (we largely don’t).
4. **Honest refuse** when tag isn’t drawable text / sheet unscaled (we do —
   keep).
5. **Multi-pass discipline** — sheet roles → quantities → joins → review —
   not one LLM dump (we have phase machines; join pass is underpowered).
6. **BAS** = points lists + AI/AO/BI/BO rollups + disclose non-extractable
   lists (we do); elite next step is **equipment↔point↔location** traces that
   survive interrogation (D02 exists; deepen and cross-set).
7. **Valves** = schedule family (CHW/HHW) + served unit + Cv + **optional**
   installed plan qty when asked — never invent plan cites (our doctrine —
   finish N=5 lock).

**Implication:** OpenTakeoff already owns the schedule-compile lane that
generic PDF chat apps don’t. The golden leap is becoming the tool that
**proves schedule truth on the blueprints** and **names every mismatch**.

---

## 4. Next goal loop objective (copy into `/goal`)

> **HVAC/BAS RECONCILE GOLDEN:** Make schedule↔plan reconciliation
> production-grade for HVAC equipment, control valves, and BAS points on the
> shared UI+MCP path — lock `T-VALVE-01` N=5 both surfaces; raise durable
> tagged plan-join recall by wiring inline motifs into `sweep_schedule_row`;
> ship a first-class reconcile workflow (scheduled vs installed vs refused /
> missing) with contractor cites; prove set-agnostic behavior with keyed
> evals on ≥2 non-NAVFAC HVAC/BAS sets; keep all existing locks green.
> Set-agnostic only. Always tests. No ODL rewrite. No duct-LF scope creep.

---

## 5. Work packages (implementation order)

Each package ends with **merge to `main`** only when its DoD is met. Do not
batch “almost done.”

### WP0 — Charter lock (this doc)

- [x] `NEXT_GOAL_LOOP.md` written from codebase + research
- [ ] Implementation `/goal` cites this file as the bar

### WP1 — Finish the third commercial takeoff: `T-VALVE-01` N=5

**Why first:** HVAC + BAS are LOCKED; valves are the remaining slate-class
takeoff and already Agent-UI proven. Leaving N=5 pending undercuts “golden.”

**DoD:**
1. Frozen `prompt.txt` (+ CHW/HHW variants if needed) unchanged during N=5.
2. MCP compile N=5 and UI N=5 against `truth.json` — Gates 1–5.
3. `CARD.md` → `LOCKED (MCP 5/5 · UI 5/5)`; SLATE amended if GOAL allows third ID.
4. Regression: multi-prompt + compile lock stays in suite gate (#50).
5. Contractor columns: Valve mark, UNIT MARK, Service, Size, GPM, **one Cv**,
   Configuration, Notes, Sheet cite — no dual Cv / markdown tags.

**Evidence:** `runs/` + `export/` Run 5 + interrogation log + UI run changelog.

### WP2 — Raise plan-join recall (wire what we already proved)

**Why:** Documented 73.3% rowsym recall; `sweep_inline_motif` +
`corroborateInlineMotif` exist but are **not** on the `sweep_schedule_row`
production path (`INLINE-MOTIF-EVAL.md`).

**DoD:**
1. Shared-path only: `sweepScheduleRow` / `agentSweepScheduleRow` (UI+MCP)
   fall back to inline-motif corroboration when whole-shape fails — same
   commit bar / withhold doctrine.
2. Bessemer (or successor) **rowsym recall ≥ 90%** on keyed tags, or every
   remaining miss is **named + expected refuse** in the key (no silent miss).
3. Extend motif coverage for at least one additional disclosed gap family
   (e.g. TG bowtie) **or** keep TG as keyed expected-miss with a tracked
   follow-on — do not claim coverage you don’t have.
4. Durable tests: unit + graph-eval rowsym; suite gate green.
5. No set-specific thresholds hardcoded to one PDF’s pixel quirks beyond
   existing measured geometry constants justified in comments.

**Evidence:** updated `SHEET-GRAPH-EVAL.md` / `INLINE-MOTIF-EVAL.md` numbers +
CI/demo locks.

### WP3 — First-class **reconcile** workflow (the product leap)

**Why:** Industry defines accuracy as schedule∩plan + explicit mismatches.
Today estimators get schedule takeoff *or* ad-hoc sweeps — not a reconcile
document.

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

**DoD:**
1. Intent + phase tests (≥5 phrasings).
2. Fixture proof on NAVFAC **and** one other keyed set.
3. Agent UI proof for at least one HVAC reconcile ask (Playwright or durable
   engine+golden equivalent if UI blocked — prefer UI once).
4. `WORKFLOWS.md` row(s) added/updated; suite gate includes reconcile lock.
5. Set-agnostic: no NAVFAC sheet IDs / locked counts in product code.

**Evidence:** golden fixture + interrogation-style negative cases
(false-premise “all scheduled units are drawn” must fail honestly).

### WP4 — Cross-set generalization keys (prove not NAVFAC-only)

**Why:** GOAL hard-case rule — NAVFAC proves the path; smaller/other sets must
work without per-set tuning. Corpus already has itd-d1-lab, federal-mech,
weld-county without rowsym/reconcile keys.

**DoD:**
1. Author hand keys (from rendered sheets, never from tool output) for ≥2
   non-NAVFAC sets covering: equipment schedule family, valve or VAV plan
   join, and at least one refuse case.
2. `graph-eval` / workflow suite reports scores — not “no key yet.”
3. Any product fix from failures must be set-agnostic (title signals, motif
   geometry, header vocab) — fixture counts stay in tests only.
4. Soft title matching helper (optional but preferred): fuzzy / embedding
   assist for `scheduleFamilyNeedles` when regex misses — must not override
   a confident exact title; must ship with regression fixtures for sibling
   exclusions (DOAH vs HANDLING, etc.).

**Evidence:** eval report tables in docs + CI hooks where feasible.

### WP5 — Shared-path hygiene on the join lane

**Why:** GOAL follow-ons; parity bugs on plan tools undermine golden demos.

**DoD:**
1. `count_marks` / `sweep_schedule_row` (and agent wrappers) share one Session
   implementation — no geometric-only UI fork for quantity/cite answers.
2. Background graph prewarm on upload: non-blocking “schedules indexing…”,
   cache `graphForPipeline`, never silent geometric-only for compile/reconcile.
3. Tests proving UI and MCP answers match on a frozen fixture for reconcile +
   valve compile.

**Evidence:** parity test + prewarm smoke; docs updated in GOAL follow-on
section as done.

### WP6 — Regression fortress

**DoD:**
1. `npm run test:demos` + `test:workflows` + web workflow fixtures green.
2. T-HVAC-01 / T-BAS-01 remain LOCKED (re-run spot gates if shared path
   touched).
3. Re-open any `WORKFLOWS.md` row that regresses — fix before claiming WP
   complete.
4. Prefer durable engine/golden tests; Agent UI demos for chat-facing
   reconcile + valve N=5 only — don’t re-burn 50 Playwrights.

---

## 6. Success metric (when this loop is “golden”)

The loop is complete **only when all are true**:

1. **`T-VALVE-01` LOCKED** MCP 5/5 · UI 5/5.
2. **Row→symbol / plan-join** recall meets WP2 bar with published numbers.
3. **Reconcile workflow** ships on `main` with contractor columns + cites +
   tests + at least one Agent UI proof.
4. **≥2 non-NAVFAC** HVAC/BAS sets have keyed join/reconcile proof green.
5. **Shared-path** plan tools + prewarm DoD met.
6. **Prior locks** HVAC/BAS + suite gate still green.
7. An estimator can ask, on a fresh set: *“Reconcile the VAV schedule to the
   plans”* (or equivalent) and get a **finished Takeoff-grade table** that
   matches industry reconciliation practice — not chat scrap.

If any item is weak, incomplete, or only “consistent with” completion — the
loop is **not** done.

---

## 7. Suggested `/goal` one-liner for the implementation agent

```text
/goal Execute opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md in full:
T-VALVE-01 N=5 lock; wire inline motif into sweep_schedule_row and hit the
rowsym bar; ship HVAC/BAS/valve schedule↔plan reconcile workflow on shared
UI+MCP path with contractor columns+cites; cross-set keyed proofs; shared-path
plan-tool unify + graph prewarm; keep HVAC/BAS locks and suite gate green.
Set-agnostic only. Always tests. No ODL rewrite. No duct-LF scope creep.
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

**This loop** turns OpenTakeoff from “great schedule compiler with demos” into
“the HVAC/BAS takeoff that **reconciles to the drawings**” — the commercial
bar Kamai/Simpro/iBeam describe, on our vector-grounded, cite-honest stack.
