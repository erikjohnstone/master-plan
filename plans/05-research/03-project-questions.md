<!--
Research note R3b for the control-intent goal (plans/05-control-intent-plan.md,
opentakeoff-corpus/goals/CONTROL_INTENT.md). Written 2026-09-24 by the coordinator.
Tags as in 02-reading-control-drawings.md: [P] read in full (including primary documents
verified in plans/04-research), [S] search summary only, [M] measured here, [I] inference.
-->

# Asking the estimator: which questions, when, and how to keep them few and right

## Bottom line

1. **Ask after the set is indexed and the first apply has run, and only then.** At that point:
   - the unresolved and defaulted lines say *which* questions matter;
   - the text layer supplies *evidence to pre-fill* each answer;
   - the line count each answer would change gives a *ranking*.
   
   This is a deterministic version of the value-of-information rule in the clarifying-question literature [S].
2. **The questions come from a closed, versioned catalogue, never from a model.** A model may help find evidence for a pre-fill. It never writes a question and never answers one.
3. **Five questions cover the project-fact rows on dev:**
   - Is there a BAS?
   - Which owner criteria (DoD UFC, VA, other)?
   - What happens to existing equipment?
   - Is a motor with no scheduled VFD constant speed?
   - Is plumbing-service equipment in the BAS scope?
   
   The first four settle 31 of the 128 dev misses outright (R2); the fifth could settle 6 more.
4. **Answers are decisions with an owner.** They go into an append-only, fingerprinted journal, the same pattern as `basScopeReviewContract.ts`. Every line they change cites them, and changing an answer shows the diff.
5. **"Don't know" is always an answer.** It leaves the affected lines unresolved (A3); nothing is assumed.

## 1. What controls estimators settle per project that drawings don't carry

- **The spec book sets much of the price** [P, plans/04-research/06 §1]. It decides:
  - which platforms may bid, including "Extend the existing Tridium FMCS" style clauses;
  - wiring method and panel power;
  - graphics, trending, licensing and cybersecurity paperwork;
  - test sampling, training and warranty.
  
  None of that is on a mechanical schedule, and spec-book ingestion is outside the current goals (`BAS_PRODUCTION_GOAL.md`).
- **Division of responsibility varies by project** [S]:
  - starters, VFDs and duct smoke detectors are often electrical;
  - valves and dampers are furnished by controls and installed by mechanical;
  - packaged terminal units arrive with factory-mounted controllers.
  
  The repo already asks this as the responsibility preset and hook-up profile (ASSEMBLIES WP8, presets.ts).
- **DoD criteria** [P, plans/04-research/02 §1a and §1c]:
  - UFC 3-410-02 (2018, Change 2 2021) requires points schedules in its Appendix D format and a minimum points list; UFC 3-410-01 (2025) Table 3-1 is the "DDC Minimum Points List".
  - The proprietary-network exceptions cover simple split DX, multi-split/VRF, and co-located chiller or boiler plants.
  - Whether these apply is an owner fact: "Eglin AFB" or "Davis-Monthan AFB" in a title block implies them, but the drawings seldom say "UFC 3-410-01 applies".
- **VA**: the VA 23 09 23 responsibility table is already the default preset (ASSEMBLIES D13).
- **Existing systems** [P, plans/04-research/06 §3]:
  - renovation specs require extending or integrating the existing front end;
  - UFGS requires an existing-conditions survey;
  - drawings flag existing units with "EXISTING", "(E)", "TO REMAIN" or "REFERENCE ONLY".
  
  Whether existing units get new controls, stay as they are, or are only integrated is a scope decision.

## 2. The facts are often printed, but not decidably [M]

The R2 note §4 shows the noise. In dev text layers, DoD markers hit "UFC 4-010-01" (antiterrorism) in 004 and "UFC UNIFORM FIRE CODE" in baker-county-eoc's abbreviations. 040 is a VA project, yet its text layer names VA only in "VA FORM 08-6231" and its project title.

This is why these are questions pre-filled from evidence, and not regex decisions (L1).

## 3. Choosing and ranking questions [S]

- **Expected information gain.** "Uncertainty-Aware Clarification in LLM Agents with Information Gain" (arXiv 2606.03135) scores a question by how much it reduces uncertainty about the user's goal.
- **Structured uncertainty.** "Structured Uncertainty guided Clarification for LLM Agents" (arXiv 2511.08798) puts uncertainty on tool parameters and uses EVPI per question. Its aspect-based cost model avoids redundant questions.
- **Value of information.** "Value of Information: A Framework for Human-Agent Communication" (arXiv 2601.06407) weighs a question's expected utility against the cognitive cost of interrupting the user.
- **What this means here [I].** The takeoff has an exact, cheap stand-in for value of information: for each catalogue question, re-apply the project under each answer choice and count the lines that change.
  - A question whose choices all produce the same lines is never shown.
  - Questions are ranked by lines changed; ties go to the earlier position in the catalogue.
  - There is a small cap: 6, including the existing responsibility and hook-up settings.

## 4. Question UX [S]

- **Progressive disclosure** (Nielsen, 1995) and shorter, better-sequenced forms raise completion. One study found interfaces that defer advanced features 30–50% faster on first use.
- **Pre-filling known information and asking only what's needed** reduce cognitive load (NN/g, "4 principles to reduce cognitive load in forms"; the page itself was blocked).
- **For this product [I]:**
  - one "Project questions" card at the top of the Assemblies panel;
  - each question shows the proposed answer, the quote and sheet it came from, and the number of lines it changes;
  - one click confirms, and "Change" opens the other choices plus "Don't know".

## 5. Precedents already in the repo [P]

- **`basScopeReviewContract.ts`**: an append-only decision journal. Each event records `operation_id`, `expected_head`, `reviewer`, `reason`, `origin: operator_input | agent_proposal` and `approved: false`, with a result fingerprint. It is the pattern for storing answers.
- **`basSequenceAiReviewContract.ts`**: estimator confirm/reject events on AI readings. It is the pattern for "a proposal needs a click".
- **ASSEMBLIES WP8 presets** (`presets.ts`): hook-up profile defaults and responsibility presets. These are already project settings, and the questions card absorbs them.
- **`rfi.js`**: the RFI register. A question the estimator cannot answer can become an RFI with its evidence attached (a later step, not in v1).
- **ASSEMBLIES A3**: unknown stays unresolved unless a partner default is set and disclosed. Project answers are that disclosure.

## 6. Catalogue v1 (proposed)

| ID | Question | Shown when | Pre-fill evidence (proposal only) | What the answer decides | Dev rows it settles |
|---|---|---|---|---|---|
| PQ1 | Does this project include a BAS/DDC scope for HVAC? *yes / no / don't know* | any unit selects a controls typical | general controls notes ("WITHOUT THE USE OF A BUILDING AUTOMATION SYSTEM", "NOT CONTROLLED BY"); whether any control detail, sequence or points schedule mentions DDC/BAS/BMS/FMCS | **no:** every unit's controls typical is "none (project answer PQ1)" and control reading is skipped | 20 (004, baker-county-eoc) |
| PQ2 | Which owner criteria govern the controls? *DoD (UFC 3-410-01/02) / VA / other / don't know* | a typical option is tied to an owner criterion | title block and notes: AFB / NAVFAC / USACE / "UFC 3-410"; VA form numbers and project numbers | **DoD:** `ufc_minimum_points = true` for HVAC-service units only | 4 (federal pumps); part of 3 |
| PQ3 | Units marked existing: *keep their controls / integrate (monitor) / new controls / don't know* | any scheduled unit carries an existing flag (EXISTING table title or remark, "(E)" tag, "TO REMAIN") | the per-unit flags and their quotes; "modify the existing DDC", "integrate only the new components" notes | **keep:** existing units' controls typical is "none (existing, PQ3)" | 5 (031, 069) |
| PQ4 | Fans and pumps with no speed column on their schedule: *constant speed / don't know* | a fan or pump waits for `vfd`, and its schedule has no speed or VFD column | the schedule's header and electrical/VFD schedules | **constant:** `vfd = no`, disclosed as a project answer; never applied when the schedule has a speed column, even if it was not read | 2 outright (bldg5406 CP-1, itd EF-4) |
| PQ5 | Plumbing-service equipment (condensate, sump, DHW recirculation): *not in BAS scope / as the drawings show / don't know* | a pump's service reads as plumbing | service column; "BMS CONTROLS" remarks; absence from points schedules | **not in scope:** "none (PQ5)" for those units | up to 6 (federal CP-1…6) |
| (existing) | Responsibility preset and hook-up profile | always (WP8) | none | hook-up and responsibility lines | none of the typical misses |

**How each answer is stored and cited.**
- An answer lands as an event in the project's decision journal, carrying the reviewer, reason and evidence.
- Every affected line's `rule` names the answer, for example `project_answer:PQ2=dod@<event>`.
- Changing an answer re-applies the project and shows the line diff before saving (A5).
- **Partner defaults:** PQ4 and PQ5 are policy-like and may be saved as partner defaults, disclosed on every use. PQ1–PQ3 are project facts and never default.

## 7. When the questions appear

1. The PDF set is indexed (`Session.graphForPipeline`).
2. Assemblies apply with no answers. Unresolved and defaulted lines are recorded.
3. The control-evidence map is built, and the readers run where the project allows. If PQ1 is pre-filled "no", reading waits for its answer.
4. The catalogue is evaluated:
   - triggers select questions;
   - each question is re-applied under every answer choice to count the lines it changes;
   - zero-effect questions are dropped;
   - the rest are ranked and capped;
   - pre-fills are attached.
5. The estimator answers, often with a single confirming click. Apply runs again, and every line cites its answer or its drawing evidence.
6. **After an addendum or a new drawing set**, the catalogue is evaluated again. Answers are kept, and a question whose evidence changed is flagged for re-confirmation.
7. **The MCP surface is the same.**
   - `project_questions` returns the ranked open questions with their evidence and line counts.
   - `answer_project_question` records an answer and returns the diff.
