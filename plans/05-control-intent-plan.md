# Control intent: project questions and control-drawing reading (design plan)

Written 2026-09-24 in answer to the owner's question: "how would you even implement [the
estimator questions] and [reading control drawings with AI]? Would you ask questions after
the PDF indexes? How would you target the VLM? These have to be wildly robust."

Research behind it:
- `plans/05-research/01-dev-miss-evidence.md`: what decides each missed typical;
- `plans/05-research/02-reading-control-drawings.md`: VLMs and grounding, the repo's AI pieces, and the pilot;
- `plans/05-research/03-project-questions.md`: which questions, when, and the UX.

The executable goal is `opentakeoff-corpus/goals/CONTROL_INTENT.md`.

## 1. The short answer

- **Yes, questions come after indexing.** The index, the first assemblies apply and the control-evidence map are what tell us which questions matter. They also say what the drawings already suggest as the answer, and how many lines each answer changes.
  - Questions come from a small, closed catalogue. They are pre-filled from quoted evidence, ranked by lines changed, and capped at six.
  - Only questions whose answer would change something are shown. "Don't know" is always allowed.
- **Reading control drawings is mostly not a vision problem.** Every dev control drawing that decides a missed typical has a text layer, so titles, tags, I/O tokens, device labels and sequence prose are exact positioned text. The work splits into three steps:
  1. **Target.** Bind each unit to the details and sequences that govern it. This step is deterministic: tags, tag lists and ranges, schedule cross-references, family-level typical details. It is today's main gap: 18 of 71 rows are bound.
  2. **Read.** Ask closed questions (the library's options) of cheap deterministic rules, then a text model with verbatim quotes, and only then a vision model on a high-resolution crop of the bound detail.
  3. **Verify.** Apply a reading only when two structurally different readers agree and every citation resolves to real text in the bound detail. A single reader is a proposal; a disagreement leaves the option unresolved.
- **"Wildly robust" means the measured error comes first.**
  - Every decision has a checkable cite.
  - Every model call is recorded and replayed.
  - Held-out documents are scored only in aggregate.
  - The gates bound wrong decisions before they reward coverage.

## 2. The measured gap (dev, from R2)

| Evidence that decides the miss | Rows | Settled by |
|---|---:|---|
| project fact (no BAS 20, DoD 4, existing policy 5, motor-speed default 2) | 31 | Track A: questions |
| control drawings (prose 15, detail/points 41, absence 12, detail + DoD 3) | 71 | Track B: reading |
| the schedule already prints it | 11 | ASSEMBLIES normalizer (not this goal) |
| floor-plan evidence per zone | 15 | out of scope |

Today's GATE 5 dev score is 116/244 exact. With both tracks perfect, the ceiling is 218/244 (89.3%).

## 3. The flow, with dev examples

```
index (graphForPipeline) → apply (no answers) → control-evidence map → readers
      → project questions (ranked, pre-filled) → estimator answers → apply again
      → every line cites a schedule cell, a drawing span, or a project answer
```

**Example 1. 040 EF-1A, exhaust fan (Track B, text reading).**
- *Targeting.* The fan schedule's CONTROL column holds "FAN-A". Detail titles on M402 include "EXHAUST FAN CONTROL - AHU INTERLOCK - FAN-A". The binder matches the column value to the title suffix, so the packet is that detail's region and spans.
- *Reading.*
  - R0 finds "2-POSITION DAMPER SHALL FULLY OPEN WHEN FAN IS ENERGIZED" (motorized damper) and "FMCS SHALL MODULATE SIGNAL TO EXHAUST FAN VFD AS REQUIRED TO MAINTAIN DUCT STATIC PRESSURE SETPOINT" (pressure control).
  - R1, the text model, answers the same two options true with verbatim quotes. The pilot got exactly this.
  - Two structurally different readers agree, so both options are applied, with cites to M402.
- *Bonus.* The schedule's own "BACKDRAFT DAMPER TYPE: MOTORIZED" agrees too. That is a normalizer gap for ASSEMBLIES.

**Example 2. 094 AHU-04 (Track B, absence plus vision).**
- *Targeting.* The title "VARIABLE AIR VOLUME AHU-4, AHU-5 & AHU-8 CONTROLS" names a tag list. The binder expands it and normalizes "AHU-4" to the scheduled "AHU-04". A unique, complete packet binds all three units.
- *Reading.* The key's options are mostly *absences*: no smoke detectors, no zone sensor or adjustment, freezestat not to the BAS.
  - R0: the packet's text has no smoke-detector term. "SMOKE MODE OUTSIDE AIR" is a damper label, and the option's term list excludes it. It has "FREEZESTAT … WIRE TO STARTER", and FZ-1 has no I/O token.
  - R2, vision on the crop, twice: the probe answered these right in both runs.
  - R0 and R2 agree on the absences, so they apply, disclosed as "absent on <detail>".
- *Economizer.* The probe's two vision runs disagreed, so vision alone cannot decide it. A text packet can.
  - The AHU schedule's note 9 reads "VAV UNITS CONTROLLED BY VFD'S SHALL BE AHU-4, 5, & 8. THE MIXING BOX RETURN AIR & OUTSIDE AIR DAMPERS IN THESE UNITS SHALL BE MODULATED TO MAINTAIN CONSTANT OA AIRFLOW…".
  - Its list shorthand "AHU-4, 5, & 8" carries the prefix, so the same list expansion binds it.
  - R1 reading that clause, plus an R0 term ("constant OA airflow" excludes an economizer), would agree. Otherwise the option stays unresolved.

**Example 3. itd-d1-lab EH-1 (Track B catching a model error).**
- *Targeting.* Schedule remark 5 points to M6.5. The electric-heater sequence and schematic there name "(EH-5)", a typical detail for the family.
- *Reading.*
  - R1 said "controls". It quoted command lines, but the printed subject is "THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING".
  - R0 reads the schematic's I/O tokens: AI + DI only, no DO or AO, so "monitors only".
  - The readers disagree, so the unit is unresolved and both readings are shown. The pilot's quote check caught the error only by luck (a paraphrase). The disagreement rule catches it by design.

**Example 4. 004 (Track A).**
- Evidence: M-602 general controls note 1 says the sequences run on factory controllers "WITHOUT THE USE OF A BUILDING AUTOMATION SYSTEM (BAS), UNLESS OTHERWISE NOTED".
- PQ1 ("Does this project include a BAS/DDC scope?") is pre-filled "no" with that quote and "changes 14 units".
- One click turns every controls typical into "none (project answer PQ1)", and control reading is skipped.

## 4. Track A: project questions

- **Catalogue v1:**
  - PQ1 BAS in scope;
  - PQ2 owner criteria (DoD UFC / VA / other);
  - PQ3 existing-equipment policy;
  - PQ4 motor speed when no speed column is scheduled;
  - PQ5 plumbing-service equipment in scope;
  - plus the existing responsibility and hook-up settings.
  
  Details are in research 03 §6.
- **Each entry declares:**
  - its trigger (which unresolved or defaulted situations make it relevant);
  - its pre-fill rules (deterministic evidence search with quotes);
  - its effects (exactly which typicals and options each answer decides, and for which units);
  - whether a partner default is allowed;
  - its catalogue version.
- **Selection:**
  - evaluate the triggers;
  - re-apply under each answer choice (cheap: apply is deterministic and fast);
  - drop questions with no line change, rank by lines changed, keep at most six.
- **Answers** are events in a project decision journal (the `basScopeReviewContract` pattern). They are cited by every line they change. Changing one shows the diff (A5).
- **Guardrails found in the dev keys:**
  - PQ2 = DoD applies UFC minimum points to HVAC-service units only: bldg5406's DHW recirculation pump keys `false`.
  - PQ4 applies only when the schedule has no speed column at all: 031 WHSE-EF2 prints SPEED CONTROL 'VARIABLE' in a column the normalizer does not read.

## 5. Track B: reading the control drawings

### 5.1 Targeting: the control-evidence map (deterministic)

A **packet** is one governing piece of control evidence:
- a control detail or schematic (its title, region, spans, I/O tokens, labels and vector primitives);
- a sequence section;
- points-schedule rows;
- a general controls note.

**Packet finding** generalizes L4.8's titles:
- "X CONTROL(S)" and "X CONTROL - Y";
- "(TAG THRU TAG)" and tag lists;
- points schedules, reusing the table graph;
- sequence blocks, reusing `sequenceNarrative`;
- general controls notes.

A packet's region must contain its own labels and exclude neighbouring titles.

**Binding** attaches packets to scheduled units, and records why:
1. The unit's tag is printed in the packet title or body. Tags are normalized, so "AHU-4" matches "AHU-04" only through the same normalizer the schedule uses.
2. A tag list or range contains it: "EF-1 THRU EF-3", "AHU-4, AHU-5 & AHU-8", or the shorthand "AHU-4, 5, & 8", which carries the prefix. A list or range expands only across tags that exist on the schedule.
3. A schedule cross-reference points to it: a column value that matches a title token ("FAN-A"), or a remark or note naming a sheet or sequence ("SEE M6.5").
4. A family-level typical detail matches the unit's family. It is used only when all of these hold:
   - no rule above binds a more specific packet;
   - the unit's family comes from the schedule's structure;
   - exactly one detail of that family remains;
   - every title qualifier ("HYDRONIC", "TOILET") is confirmed by the unit's own schedule cells.

   Otherwise, readings through it are proposals only. A title naming a family is a word, not a binding (L1, noted in AS-19); these conditions make the schedule's structure do the binding and the words only confirm.

**Outputs:**
- per unit: packets with the binding reason;
- ambiguity: two candidates of the same rank, both kept and flagged;
- "no control evidence".

The map is exposed as `Session.controlEvidenceMap()`, the MCP tool `control_evidence`, and a "Control evidence" link per unit in the Assemblies panel.

### 5.2 Readers (closed questions only)

The questions are the unit's candidate typicals and their options, plus its BAS role (controls / monitors only / not connected), answered true, false or not shown.

- **R0, deterministic.**
  - Explicit I/O tokens per packet (L4.8): for example, a packet with no DO and no AO means no command.
  - A versioned **option term list**. Each option has its presence phrases and its exclusion traps ("SMOKE MODE" is not a smoke detector), with a clause-level negation guard.
  - Explicit exclusion phrases: STANDALONE, NOT CONTROLLED BY, BY OTHERS, EXISTING TO REMAIN, WIRE TO STARTER.
  - Each term-list entry must cite its source: the library option's definition, UFC/UFGS vocabulary, or at least two dev documents from different drafters. This keeps any one document from tuning it.
- **R1, text model.** It reads the packet's positioned spans only, not the page.
  - Every answer carries 1–3 verbatim quotes plus a quote of the clause's subject.
  - It reuses `basSequenceAi`'s pattern: zod schemas, the exact-substring gate, validator-guided retry, and persisted runs with fingerprints.
  - The model is the platform `gpt-oss-120b`.
- **R2, vision model.** It runs only when R0 and R1 leave an option undecided and the packet has linework.
  - Input: a crop of the packet region at ≥ 200 dpi, run twice at temperature 0.
  - Every answer cites printed labels, which must resolve to text spans inside the region. Absence answers cite nothing and are admissible only under the absence rule.
  - The model is the platform `qwen-3.8-27b`. `ai.js`'s `gemma-4-31b` default is no longer served, which is a bug to fix first.

### 5.3 Combining readings

| Readers | Outcome |
|---|---|
| two structurally different readers agree, none disagrees | **applied**, disclosed, cited, and listed first in the exceptions with one-click reject |
| R0 alone, on a whitelisted exact phrase or I/O token | **applied** (deterministic, like the normalizer) |
| one model reader alone | **proposal**: shown with its cites, applied on one click |
| any disagreement, or a citation that does not verify | **unresolved**, with both readings shown |

**Absence.** An option is set false from absence only when all of these hold:
- the unit binds to exactly one complete packet, with no "continued" reference and a title that names the unit, its list or range, or its family;
- the packet's spans hold no term for the device;
- two R2 runs both say absent.

**Conflicts with the schedule** are never resolved silently. For example, the schedule prints a VFD while the sequence says constant speed: both are shown, and the option stays unresolved. In D6 terms, control drawings are "drawing-declared components", the top tier, but a conflict inside that tier is an exception, not an override.

### 5.4 Record and replay

- Every model call is stored as {model, prompt version, schema version, request hash, response, latency, tokens}.
- Evals and CI replay recorded responses, so the numbers are deterministic.
- A project pins its reading runs. A new model, prompt or term-list version produces a new run and a visible diff; it never silently changes a saved project (A5).
- Without a configured model, R0 still runs, and R1/R2 report "not configured". Results stay honest, with lower coverage.

## 6. Where it lives (shared path)

**Should this be on the shared path? Yes.** Every piece decides typical and option truth.

- **Modules.** `web/src/lib/controlIntent/**`, pure TypeScript with zod schemas:
  - `catalogue` (questions);
  - `evidence` (the packet map);
  - `readers/{r0,r1,r2}`;
  - `combine`;
  - `journal` (answers);
  - `runs` (record and replay).
- **Session** builds the map (it has the spans) and exposes it. `assemblies/apply.ts` consumes the per-unit control-intent record as a new, cited input to selection.
- **Surfaces.**
  - The UI adds a "Project questions" card and control-evidence links, and puts AI-applied decisions first in the exceptions list.
  - MCP adds `project_questions`, `answer_project_question` and `control_evidence`, and `apply_assemblies` takes the answers.
  - Both call the same modules. The model transport is injected: the browser uses the platform proxy; MCP uses env config (`OPENTAKEOFF_AI_ENDPOINT`, key, models).
- **L4.8 (`controlSchematic.ts`)** is extended only additively, and only with before/after proof. Its current outputs feed other features, so the census and graph eval must show no regression, or the new titles live in `controlIntent/evidence` instead.

## 7. How we will know it works

- **Keys**, authored from renders before the new code runs:
  - `keys/<set>.project.csv`: one answer per catalogue question, with its evidence;
  - `keys/<set>.binding.csv`: the governing packets per unit instance, or none.
  
  Option truth reuses the existing `*.typicals.csv`, which already marks undecided options with "?". Held-out sets get the same keys in a separate pass and are scored only in aggregate.
- **Instruments:**
  - question eval: coverage, zero-effect questions, pre-fill accuracy, oracle-answer lift, regressions;
  - binding eval: precision and recall of packets;
  - reading eval: per reader and combined; right, wrong, abstained and proposal counts per option;
  - end-to-end typical eval, ASSEMBLIES instrument 3 with answers and replayed readings;
  - cost and latency;
  - replay determinism.
- **Gates**, in the goal file, put wrong decisions first:
  - dev: at most 0.5% of applied readings wrong, and 0 wrong absences;
  - held-out: at most 2% wrong;
  - coverage second: at least 57 of the 71 control-drawing dev rows exact;
  - end to end: dev at least 204/244 (83.6%) with 0 dishonest, held-out at least 60%.
  
  Every gate may end in a demonstrated ceiling with reproducible evidence, instead of a tuned pass.

## 8. Risks and how the design meets them

| Risk | Mitigation |
|---|---|
| A model quotes real text but reads it wrong (the EH-1 case) | the clause subject must be quoted; semantic claims need a second, structurally different reader; disagreement leaves the option unresolved |
| Absence hallucination (POPE-style) | absence needs a unique, complete binding, lexical absence and two agreeing vision runs |
| Wrong targeting sends a model to the wrong detail | binding is deterministic, keyed and measured; adversarial swapped-packet tests must fail verification |
| Overfitting 11 dev documents | term lists cite sources; no document-specific text in prompts; held-out in aggregate only; more dev documents need the bulk corpus (AS-2) |
| Model drift or deprecation (gemma-4-31b already vanished) | record and replay; pinned runs; model id in every decision; a model-off mode that stays honest |
| Estimator fatigue | at most 6 questions, pre-filled, ranked by effect, never zero-effect; "don't know" allowed |
| A default that hides a printed value (WHSE-EF2) | PQ4 applies only when the schedule has no speed column at all |
| Cost and latency | text calls about 1 s and vision calls about 7 s in the pilot; one call per packet batches all its units; replay in CI |

## 9. Not in this plan

- Floor-plan evidence per zone (15 dev rows: CO2 sensors in federal VAV zones).
- The 11 schedule-printed rows, which belong to the ASSEMBLIES normalizer.
- Spec-book reading.
- New typicals: a monitor-only typical and a two-speed fan are library v2 items. Until then, a "monitors only" reading selects "none" and lists the monitored points as exceptions.
- Raster-only control drawings beyond the existing L4.5 OCR assist: measured on the raster variant, abstain otherwise.
- RFIs generated from unanswered questions.

## 10. Owner decisions needed before the loop starts

1. Approve catalogue v1 (PQ1–PQ5) and the cap of six questions.
2. Approve the apply rule: two agreeing readers apply automatically, disclosed with one-click reject; a single reader is a proposal.
3. Confirm the models and the per-document cost ceiling. The platform endpoint here serves `gpt-oss-120b` (text) and `qwen-3.8-27b` (vision).
4. Allow additive changes to `controlSchematic.ts` title recognition, with before/after proof, or keep them in the new module.
5. Stage more documents with control drawings (the bulk corpus, AS-2) for a larger frozen dev split, and provide unseen partner PDFs (INPUT 5 carried over).
6. Decide whether the 11 schedule-printed rows go back into the ASSEMBLIES queue now, and whether floor-plan evidence gets its own goal.
