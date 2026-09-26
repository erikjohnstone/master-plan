<!--
Research note R3a for the control-intent goal (plans/05-control-intent-plan.md,
opentakeoff-corpus/goals/CONTROL_INTENT.md). Written 2026-09-24 by the coordinator.

Evidence tags:
  [P] read in full: a fetched page, a file in this repo, or a primary document
      already verified in plans/04-research.
  [S] a web-search result summary only. This session's egress proxy blocked
      arxiv.org, api.semanticscholar.org, alphaxiv.org, nngroup.com, wbdg.org,
      automatedbuildings.com and blog.smartbuildingsacademy.com, so most papers
      could not be opened. Treat [S] as a paraphrase and re-check it before a
      decision rests on it alone.
  [M] measured here: plans/05-research/pilot/, dev documents only.
  [I] my inference.
-->

# Reading control drawings and sequences with AI: what works, what doesn't, and how to target it

## Bottom line

1. **Pointing a vision model at a whole sheet is the wrong design.**
   - Published benchmarks agree that multimodal models read text on drawings well. They are unreliable on symbols, counts and connectivity [P][S].
   - They improve sharply when they answer from a structure recovered first and must cite it. On P&ID topology questions, exact match rose from 36.7–41.3% to 74.3–76.0% [S].
2. **We already recover most of that structure.** Every dev control drawing that decides a missed typical is in a vector PDF with a text layer [M]. Titles, tags, I/O tokens, device labels and sequence prose are all exact positioned text, and L4.8 already builds a vector inventory of schematics.
   - The missing piece is **targeting**: binding each unit to the details and sequences that govern it. Today the graph binds 18 of the 71 control-drawing rows (R2).
   - Targeting is deterministic text and geometry work, not a model's job.
3. **Once targeted, reading is a set of closed questions.** For each option of the unit's candidate typical, the question is "true, false or not shown?". A cited answer is checked mechanically against the text layer.
   - In the pilot, the platform text model answered 4/4 presence options correctly with verbatim quotes, identically on two runs [M].
4. **Quotes prove the text exists, not that the reading is right.** In the pilot the model read "THE THERMOSTAT SHALL SEQUENCE… SEND AN ENABLE COMMAND TO THE UNIT HEATER" as the BAS commanding the heater [M]. It also paraphrased the quote, so the quote check rejected it, but an exact quote would have passed.
   - Semantic claims (who commands, what is absent) therefore need a **second, structurally different reading** to agree. Two examples: the printed I/O tokens (here AI + DI only, so no command), or the vision model on the crop.
   - This matches the document-extraction literature: logprobs, verbalized confidence and self-consistency all fail as trust signals, and cross-reading disagreement works [S].
5. **Absence is the hardest claim, and the one most of the missed options need.**
   - Told to answer false only when a device is clearly absent, the text model abstained on 15/15 absence questions [M].
   - On one bound detail crop, the vision model got the absence questions right in both of two runs. It also misread a modulating outdoor-air damper as an economizer in one run, with label-verified evidence [M].
   - Absence may be decided only when four things all hold: the evidence binding is unique and complete, the text layer has no term for the device, and two vision runs agree it is absent.

## 1. What the field reports

**Multimodal models on architectural and engineering drawings.**
- **AECV-Bench** [P, fetched abstract] (Kondratenko, Birhane, Hsain, Maciocci; arXiv 2601.04819):
  - Text-centric document QA on drawings reaches up to 0.95 accuracy. Spatial reasoning is moderate.
  - "Symbol-centric drawing understanding – especially reliable counting of doors and windows – remains unsolved (often 0.40–0.55 accuracy)."
  - The authors' conclusion: current systems "function well as document assistants but lack robust drawing literacy", which motivates "domain-specific representations and tool-augmented, human-in-the-loop workflows".
- **MechVQA** [P, fetched abstract] (arXiv 2605.30794; ICML 2026): general models are "brittle" on dense mechanical drawings and miss decisive annotations.
  - A 4B model fine-tuned on the domain reaches 84.85% overall: 89.70 recognition, 77.04 reasoning, 82.81 judging.
  - High accuracy needed domain training; generic prompting did not reach it.
- **This repo's own measurement** [P, `opentakeoff/docs/VISION-CLASSIFY-EVAL.md`]: `classify_symbol` with gemma-4-31b named 2 of 5 control-valve symbols correctly, the same on vector and raster renders. It confused valve-body glyphs (butterfly, ball) and read a pneumatic dome as a gate valve.

**P&IDs, the closest published analogue to control schematics.**
- **Grounded and Faithful P&ID Reasoning** [S] (arXiv 2609.05880): vision-language models "invent or miss process connections".
  - The fix recovers an explicit graph of symbols, connections and tags. The model may answer only by querying that graph through seven read-only operators, and each topology claim must cite the query results.
  - On TopoPID-VQA (3,000 topology questions), exact match rose from 36.7–41.3% with the image alone to 74.3–76.0% with the graph, for Qwen3-VL-4B/8B and Gemma-4-E4B.
- **Other P&ID results** [S]:
  - A training-free pipeline (CV preprocessing, density-based windows, geometric line reconstruction, few-shot VLM prompts) reports 83% symbol association and 82% line association, against 73% for supervised methods (SSRN 6083108 and a related review).
  - **VLM as a judge for object detection in industrial diagrams** [P, fetched abstract] (arXiv 2510.03376) uses the model to flag missed or inconsistent detections: a checking role, not a primary reader.
- **Hybrid vector-PDF parsing** [S] (arXiv 2506.17374, "From Drawings to Decisions"):
  - A parser walks the PDF graphics operators to recover positioned text runs and primitives, and fine-tuned VLMs parse localized annotation crops.
  - The best model still hallucinated at 11.5%.

**Grounding, crops and hallucination.**
- **DocAttriBench** [S] (arXiv 2609.20574): multimodal models "achieve strong textual accuracy but struggle to localize answer evidence". Never trust a model's own bounding box; ground its claims in the PDF text layer instead [I].
- **Set-of-Mark prompting** [S] (arXiv 2310.11441): numbered marks on candidate regions improve grounding for strong proprietary models, but can hurt weaker open models. Measure before adopting it [I].
- **Fine detail needs crops** [S] (CropVLM, arXiv 2511.19820; "Look Where It Matters", arXiv 2603.16932). Targeting supplies the crop: the bound detail's region, not the sheet.
- **POPE** [S]: the standard object-hallucination probe asks yes/no existence questions, and its adversarial split uses absent objects that commonly co-occur with present ones. "Is there a smoke detector on this AHU?" is exactly that case.

**Trusting an answer.**
- **"Beyond Logprobs"** [S] (Kumar, arXiv 2606.24420, RobustifAI @ IJCAI-ECAI 2026):
  - Token logprobs, verbalized confidence and multi-sample self-consistency all "collapse toward all-positive behaviour at practical thresholds".
  - Two structurally different readings of the same document, fused with disagreement signals, reached 0.928 ROC AUC, 70% lower selective-prediction risk, and 99.1% accuracy in the top confidence band.
- **Text-to-SQL selective prediction** [S] (arXiv 2607.06799): self-consistency "cannot form a low-risk subset at any threshold".
- **Mechanical citation checks** [S]: checking that a quote is a verbatim substring enforces grounding by construction; one study verified 90.12% of 5.4 M evidence rows that way. The limit is the one our pilot hit: the check proves the quote exists, not that it supports the claim [M].

**AI in building controls.**
- A review of 66 studies from 2023 to March 2026 on LLMs for HVAC operations [S] (arXiv 2609.05314) finds the work concentrated on operation and control. None of the summaries mentions reading design control drawings for estimating [I].
- BrickLLM [S] generates Brick graphs from text descriptions.
- LBNL's Control Description Language and ASHRAE Guideline 36 are formal sequence representations [S], but design drawings are not written in them.
- The earlier assemblies research found no AI tool that targets Division 23 09 or 25 price drivers (plans/04-research/06 §2).

## 2. What this repo already has [P]

| Piece | What it does | Gap for this goal |
|---|---|---|
| `web/src/lib/basSequenceAi.ts` | Model-assisted reading of sequence narratives. Zod schemas; "Every evidence.text must be an exact contiguous substring of the cited clause text"; validator-guided retry; runs persisted with fingerprints and re-verified on reload; estimator confirm/reject events (`basSequenceAiReviewContract.ts`); output is "proposed … never installed quantities" | Called only from the UI (TakeoffCanvas, BasSequencesWorkspace). It answers open questions (entities, points), not the library's option questions, and has no corpus accuracy eval |
| `controlSchematic.ts` (L4.8) | Vector-first inventory per control schematic: explicit I/O tokens, instrument labels, equipment tags bound to schedule rows, a small component vocabulary, sequence refs, topology. `semantic_status: evidence_inventory`, `human_review_required: true` | Title rule misses "X CONTROL - Y", "… CONTROLS", "(TAG THRU TAG)"; no tag lists or ranges; no schedule cross-references; family-level typical details bind nothing |
| `sequenceNarrative.ts`, `sequenceExtract.ts` | Sequence blocks with exact span evidence | Blocks are not bound to units |
| L4.5 "OCR/VLM assist" (`vectorTakeoffPipeline.ts`) | OCR for raster schedule sheets, gated by `OPENTAKEOFF_PIPELINE_OCR=1` | No VLM call exists on the pipeline; the comment "VLM slot is ON" refers to an unused slot |
| `ai.js` | Platform endpoint `/cerebras-api` (Vite proxy with a server-side key); `gpt-oss-120b` for the agent; `visionModel: "gemma-4-31b"` | [M] On 2026-09-24 the endpoint listed only `qwen-3.8-27b` and `gpt-oss-120b`. The configured vision model is gone. `gpt-oss-120b` rejects image input; `qwen-3.8-27b` accepts it |

Standing rules also bear on this goal:
- **Root `AGENTS.md` rule 8** allows OCR, raster vision and local VLM/AI on the shared vector pipeline "when vector extraction alone cannot reach the answer — disclosed, cite-backed, corroborated against schedule/plan evidence when possible. Vector-first always."
- **`docs/BAS_PRODUCTION_GOAL.md`** forbade model-generated interpretations inside *its* workflows.

This goal uses rule 8 and should carry an amendment banner in that file, as ASSEMBLIES did for pricing.

## 3. The pilot [M]

**Setup.**
- Dev documents only.
- Scripts in `plans/05-research/pilot/` and outputs in `pilot/out/`. The whole experiment was 12 text calls and 2 vision calls to the platform endpoint, all at temperature 0.
- The text model got the unit's own schedule row as the pipeline extracted it, plus every positioned text line of the page(s) that hold its evidence. That is page-level targeting, harder than the goal's bound packets.
- It had to answer the library options for the unit's keyed typical, plus the BAS role (controls, monitors only, not connected, not shown). Each non-abstaining answer needed 1–3 quotes copied from one line each. A quote counts as verified only if it is an exact substring of a line on those pages, after whitespace is collapsed.

| Unit (dev) | Evidence page | Result, identical on both runs |
|---|---|---|
| 040 UH-1 | M402 "UNIT HEATER CONTROL - HYDRONIC" | governing detail named correctly; role right; `modulating_valve` true ✓ (quotes verified); `fan_status`, `setpoint_adjust` (key: false) abstained |
| 040 EF-1A | M402 "…CONTROL - AHU INTERLOCK - FAN-A" | role right; `motorized_damper` ✓, `pressure_control` ✓; 5 of 6 quotes verified (one joined two lines and was rejected) |
| 040 EF-2A | M402 "…FAN CONTROL - FAN-B" | role right; `motorized_damper` ✓; governing title given as the neighbouring "EXHAUST FAN CONTROL - AHU", which is wrong |
| 094 AHU-04 | M-201 "…AHU-4, AHU-5 & AHU-8 CONTROLS" | governing detail named correctly; role right; all 13 options (all false in the key) abstained |
| itd-d1-lab EH-1 | M6.5 heater sequence plus the schedule notes | **role wrong ("controls")**: quotes paraphrased ("SEND ENABLE COMMAND" for the printed "SEND AN ENABLE COMMAND") and rejected by the check. The printed subject is "THE THERMOSTAT SHALL SEQUENCE THE FOLLOWING"; the schematic prints AI + DI only |
| itd-d1-lab EF-1 | M6.5 general exhaust fan sequence | role "not_connected" ✓ with a verified quote |

**Totals.** 4/4 presence answers right and verified. 0/15 absence answers attempted. 5/6 roles right; the wrong one was stopped only because its quotes were inexact. One wrong governing title. About 1 s per call.

**Vision probe.**
- **Setup.** One 200 dpi crop (2751 × 1293 px) of the bound detail "VARIABLE AIR VOLUME AHU-4, AHU-5 & AHU-8 CONTROLS", sent to `qwen-3.8-27b` twice. It had to list the labelled devices with their I/O tokens and answer six closed questions. Each answer cites printed labels, which are checked against the text layer inside the crop.
- **Device inventory.** 10–11 labelled devices with the right I/O: TS-1 AI, HS-1 AI, DM-1 DO, DM-2 AO, DPS-1 DI, DPS-2 DI, TS-3 AI, TS-4 AI, VFD DO/DI/AO/AI, and FZ-1 with none. It missed the unlabelled actuators: the return damper, the humidifier and the chilled-water valve.
- **Right in both runs:**
  - duct smoke detector absent (it was not fooled by the "SMOKE MODE OUTSIDE AIR" damper label);
  - freezestat wired to the starter (cited "FZ-1" and "WIRE TO STARTER", both verified);
  - no zone sensor with setpoint adjustment;
  - no return or relief fan;
  - fan on a VFD.
- **Economizer: wrong in run 1, right in run 2.** Run 1 took DM-2, the modulating damper on the preconditioned outdoor air from AHU-7, for an economizer damper, and cited verified labels. Label checking did not catch it; the disagreement between the two runs would have.
- **Cost.** About 7 s and 6–9 k reasoning tokens per call.

**Limits.** Six units and one crop. I wrote the questions knowing the keys' answers. This is a feasibility probe, not a benchmark; the goal's instruments replace it.

## 4. What this means for the design (answering "how would you target the VLM?")

1. **Target first, deterministically.** Build a control-evidence map that binds each scheduled unit to its governing packets. A packet is a detail, schematic, sequence section, points-schedule rows or a general note, with its region and exact spans. Binding comes from:
   - the tag;
   - tag lists and ranges;
   - schedule cross-references (a column value such as "FAN-A"; a remark pointing to a sheet or sequence);
   - family-level typical details, disambiguated by schedule attributes;
   - sequence headings.

   No model chooses what governs a unit, and ambiguity stays visible.
2. **Ask closed questions only.** They are the library options of the unit's candidate typicals, plus its BAS role. There is no open-ended "describe this drawing".
3. **Read cheapest-first, with structurally different readers:**
   - **R0** is deterministic: the printed I/O tokens; option phrases with a negation guard; exclusion phrases such as "STANDALONE", "NOT CONTROLLED BY", "BY OTHERS" and "TO REMAIN".
   - **R1** is the text model over the packet's spans, with verbatim quotes and the clause's subject.
   - **R2** is the vision model on a crop of the packet region at ≥ 200 dpi, run twice, citing labels that must exist as text spans in the region.
4. **Accept by agreement, not by confidence:**
   - two structurally different readers agree and none disagrees → apply, and disclose it;
   - one reader only → a one-click proposal;
   - any disagreement → unresolved, with both readings shown.
5. **Absence needs all of the following:** a unique and complete binding, no term for the device in the packet's text, and two vision runs that agree it is absent. Anything less leaves the option unresolved.
6. **Record and replay every model call**: model id, prompt version, request hash and response. Evals and CI replay; a project pins its runs, so a new model or prompt never changes a saved project silently.
7. **Measure precision first.** A wrong option costs the partner more than an unresolved one, which the exceptions list already shows.
