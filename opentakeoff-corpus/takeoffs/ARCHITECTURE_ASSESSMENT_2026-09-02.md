# Architecture assessment — general HVAC/BAS takeoff platform goal

**Status:** IN PROGRESS, written live during the session that set this goal (2026-09-02).
Read `GOAL.md`'s "Platform mandate" section first — this doc is the detailed backing for it.

## 1. What "the math" actually is for this platform's job

The goal asked for a deep understanding of valve/damper/actuator and BAS
points/SOO takeoffs "not just counting rows." Having audited the domain
(web research) and the existing code against it, here's the honest
breakdown of what math actually belongs in a **takeoff** tool (as opposed
to a controls **design** tool):

### Valve / damper / actuator
- **Schedule quantity** = count of distinct scheduled marks per family
  (`uniqueFamily` in `corpusTakeoff.mjs`) — real math, already correct.
- **Installed quantity** = count of that mark's drawn instances on plan
  sheets, via `sweep_schedule_row` — geometric, already correct.
- **Reconciliation** = schedule vs. installed delta, typed
  MATCH / SCHEDULE_ONLY / PLAN_ONLY / AMBIGUOUS (`reconcileSchedulePlan`)
  — this **is** the real math of a valve/damper takeoff: not "how many
  rows" but "does what's scheduled match what's actually drawn," which is
  exactly the contractor-grade question a real estimator answers.
- Cv/GPM/size/fail-position/torque are **printed spec values to report
  verbatim**, never derived from first principles — a takeoff tool has no
  business computing an actuator's required torque from valve size; that's
  a controls/mechanical engineer's selection math, not a quantity takeoff.
  Confirmed against real valve-actuator-sizing references (break-away
  torque is the sum of three distinct torque components, not a single
  number) — exactly the kind of engineering judgment this platform
  correctly leaves to a human, per its own refusal doctrine.

### BAS points list
- **Point-type totals** (AI/AO/BI/BO counts per list, rolled up) — real
  math, already correct in `compileBasTakeoff`.
- **Alarm/trend/hardwired-vs-soft flags** — promoted only when printed,
  never invented — already correct.
- **Served-equipment join** (which point belongs to which piece of
  equipment) and **plan-paint** (does that point's own device actually
  appear drawn on a plan sheet) — real reconciliation math, analogous to
  valve schedule↔plan reconcile, already partially built
  (`estimatorTakeoffDocument.mjs`'s BAS served-equipment plan-paint path,
  `basServedEquipmentPlanPaint.test.mjs`) — audited before assuming a gap.

### Sequence of operations
- **The one piece of "math" a lesser system might be tempted to fake:
  deriving a typed point list FROM the SOO narrative** (e.g., "the SOO
  says 'modulate the CHW valve based on discharge air temperature' →
  therefore this AHU needs 1 AO for the valve + 1 AI for the DAT sensor").
  This is genuinely how a controls engineer scopes a job from a
  performance spec — but it is estimation/inference, not extraction, and
  doing it algorithmically risks fabricating a point count with a
  machine's false confidence behind it, on exactly the kind of
  professional-liability number this whole project's philosophy refuses
  to fake (see README's "refusals are actionable strings" contract).
  **Conclusion: the existing `refuse_not_done` gate on SOO-derived points
  is correct domain practice, not a shortfall to fix.** What WAS a real
  gap — and is now fixed — is that the actual SOO **text itself**
  (sections, steps, per-cell citations) was extracted but had no agent
  path to it at all. An agent can now retrieve and cite the real SOO
  content for a human (or a downstream, explicitly-labeled estimate
  layer) to reason from; the platform still never invents the point count
  itself.

**Net assessment: the domain math this platform needs is reconciliation
and typed-rollup math, already substantially present; the "math" that
would look like invention (torque sizing, SOO→point derivation) is
correctly out of scope for a takeoff tool and already refused.** The real
work is not adding missing math — it's extraction **recall** (the 63-set
gap) and classification **precision** (structural, not regex-first).

## 2. Confirmed real gap, root-caused (2026-09-02 live data)

70/79 valve-bearing Vol2+Vol1 sets compile to zero valve rows; 63 of those
have genuine valve/damper PDF text (not a corpus-key error). Live sample
(`024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri`) showed the
diagnostic census's own `isControlValveHeaderShape` heuristic false-
positiving on a generic RTU equipment schedule (shares TAG+MODEL/SIZE
columns with a real valve schedule) — the production compiler correctly
refused it. This means the 63-set number likely overstates true production
gaps somewhat; the real per-set root cause needs the table-recall census
(running now) to separate genuine L1/L2 misses from L5 false-negatives
and diagnostic-tool false-positives, per `VECTOR_TAKEOFF_ENGINE_RESEARCH.md`
§6's own bucket methodology — no fix should be written until that
separation is real per-set evidence, not assumed from the PDF-text-only
scan.

## 3. Fixed this session

- SOO takeoff wired to the agent path end-to-end (MCP + HTTP dev endpoint +
  UI agent tool + UI panel/export) — was a real, confirmed, generalized
  gap (the extraction existed, the reach didn't). See commit
  "Wire sequence-of-operations takeoff into the agent path."

## 4. Next (pending the running census)

1. Per-set root-cause split on the real 63-set (or fewer, once diagnostic
   false-positives are excluded) extraction gap: L1/L2 (no tables at all)
   vs L5 (tables exist, admitted/classified wrong) vs diagnostic-artifact.
2. Generalized fixes only — structural (header/mark-shape), never a
   per-set regex/hardcode. `gridClassify.mjs` and `isControlValveHeaderShape`
   are the right places to harden, not `corpusTakeoff.mjs`'s per-family
   `titleRe`/`keyRe` lists in isolation.
3. Re-run the full census after each batch to confirm no regressions on
   the already-locked 100%-scoring original 7-set corpus.
