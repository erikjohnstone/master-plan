# HVAC/BAS Component Symbol Detection Transformer — Project Plan

## Context

Siemens wants an internal tool that detects HVAC/BAS component symbols — valves, actuators, dampers, AHUs, VAV boxes, chillers, boilers, pumps, coils, thermostats, sensors, BMS points — on mechanical drawings and schedules, to compete internally with Togal.AI, Kamai, and Rebar. This is component-level symbol detection, not full architectural floor-plan digitization (that earlier framing was wrong and is dropped here).

**Hard constraints:** every dataset and pretrained model must be verifiably commercially licensed (permits commercial use + redistribution of fine-tuned derivatives). No Siemens-owned data or symbol libraries may be used as training data. Every license below was verified by fetching the actual source page, not inferred from a re-uploader's badge or a project name.

Five rounds of exhaustive research (Roboflow Universe, Kaggle, GitHub, HuggingFace, Zenodo/OSF, academic sources, US federal CAD standards, commercial CAD/data vendors) produced the findings below.

## Execution Model

This is executed autonomously, not as a set of tasks handed to a human team. Wherever an earlier draft of this plan said "a human reviews," "a domain expert decides," or "someone signs off," that work is instead done directly — via web research, cross-referencing multiple independent authoritative sources (ISA S5.1, ASHRAE symbol conventions, manufacturer glossaries), and documented reasoning — since no second human reviewer exists in this workflow. Where a step previously called for a second-person review as its verification mechanism, the substitute is an independent re-derivation or a cross-check against a separate authoritative source, not a lowered bar.

**Only ask the user for something when it's literally not possible to do otherwise** — everything else (downloading the ~60 sources, installing SDKs/dependencies, writing the download/normalization/taxonomy-consolidation/training code, running every verification check, training, evaluating, producing the final report) happens without asking. In practice, that means the only things this project will come back to the user for are:

1. **Account creation and API credentials** for the data-source APIs (Roboflow, Kaggle) — creating accounts and authenticating is something Claude cannot do; the user creates the accounts and hands over the resulting API keys/tokens, which are then just used programmatically like any other config value, not re-entered anywhere by Claude.
2. **Compute provisioning and payment** — if local hardware isn't sufficient (see Compute & Environment below), training needs a rented GPU instance. Claude will research providers and give a concrete recommendation with real pricing, but creating the billing account and paying for it is the user's action; Claude can then drive the instance programmatically if the provider exposes an API, once the user has provisioned it.
3. **Any action that falls under Claude's standing approval rules regardless of project** — irreversible or outward-facing actions (e.g., publishing something publicly, purchasing something beyond compute, sending something on the user's behalf) — none of these are expected in this project's normal flow, but the rule doesn't get suspended for this plan.

Everything else in the steps below is Claude's job to actually do, not to describe for someone else to do.

## Key non-data findings (established earlier, still hold)

- **No open, commercially-licensed foundation model already understands CAD/schematic symbols.** Every real detector (RT-DETR, Deformable DETR, YOLOS — all Apache-2.0) starts from natural-image pretraining and needs domain fine-tuning. CAD-specific research models (CADTransformer, SymPoint, CADSpotting) are trained on non-commercial data (FloorPlanCAD, CC BY-NC 4.0) and ship no usable weights. Zero-shot detectors (Grounding DINO, OWL-ViT) have no published evaluation on engineering-drawing symbols at all.
- **Recommended architecture: RT-DETR (`PekingU/rtdetr_r50vd`, Apache-2.0)** — hybrid multi-scale encoder suited to small/dense symbols, NMS-free, no AGPL risk (unlike Ultralytics YOLO, which requires a paid Enterprise License for closed-source commercial use). Deformable DETR (Apache-2.0) is the fallback/comparison baseline.
- **Buying data is not a shortcut.** Commercial CAD block libraries explicitly forbid ML-training use in their EULAs (confirmed on BIMobject: bars use "to train... any artificial intelligence, machine learning... systems"). No AEC-specific training-data vendor with public pricing exists. Academic rights-holders (UAB tech-transfer office, HKUST authors) could theoretically be asked for a commercial license but there's no published price or precedent. US federal CAD standards (NCS, VA, GSA) are not public domain in practice (NCS is a copyrighted NIBS/AIA product) or provide no reusable artwork; USACE's object library is plausibly public domain but gated behind a military CAC login.
- **Conclusion:** the open-dataset ecosystem, not synthetic generation, turned out to be far richer than initially assessed once searches targeted component symbols specifically instead of floor-plan layout. See registry below.

## Full Dataset Registry (verified, categorized)

All licenses quoted verbatim from the source page. "Schematic" = genuine drawing/symbol content; flagged separately if photographic (excluded from training use regardless of license).

### A. Valve / Actuator / Damper / General P&ID Symbol Data (commercially clean, schematic)

| Dataset | License | Images | Key classes |
|---|---|---|---|
| mollous P&ID Symbols (Kaggle) | CC BY 4.0 | 3,314 | 203 valve/instrument classes |
| PID Connect — p-id-symbols | CC BY 4.0 | 1,065 | 181 classes (valves, actuator states) |
| PID Connect — p-id-symbols-r2-docol | CC BY 4.0 | 1,067 | 349 classes |
| TrainDatasetColab — simboli_pid | CC BY 4.0 | 4,973 | 663 classes (incl. chiller, boiler) |
| PipeType classification | CC BY 4.0 | 87 | 16 valve types |
| Jade Carl Mendoza — P&ID Detection | CC BY 4.0 | 66 | 9 classes |
| DuoWork — valve-detection-0bed6 | CC BY 4.0 | 747 | Ball/Gate valve types |
| DuoWork — valve-detection-2-prhdo | CC BY 4.0 | 343 | Check/Gate/Globe valve types |
| Valve Detection — p-id-classifier | CC BY 4.0 | 559 | BDV/FCV/LCV/PCV/PSV/SDV/TCV tags |
| valve-qfkxy — p-id-fgwnm | CC BY 4.0 | 830 | Same 7-tag taxonomy |
| AI Matics — valve-type | **Public Domain** | 139 | 16 classes incl. genuine **actuator** symbols (fail-open/closed) |
| Symbol Detection — merging-valve-only | CC BY 4.0 | 502 | 24 valve/shape classes |
| elliotttmiller — hvacai | CC BY 4.0 | 234 | Instrumentation + valve_ball/gate/globe/check |
| elliotttmiller — hvac-aiv3 | CC BY 4.0 | 8,198 | Large P&ID-style corpus |
| Symbol Detection — pnid-valve-only-merge | CC BY 4.0 | 301 | 1 class ("valves") |
| PID (pid-vktlg) — P&ID detection | CC BY 4.0 | 378 | Control-valve/actuator emphasis |
| rehna — MEP_FloorPlan_Detection | CC BY 4.0 | 35 | **394 classes** — damper, valves, AHU, chiller, BMS, condenser, cooling tower (richest single taxonomy found, very low image count) |
| Vishwakarma Institute — P&ID AI | CC BY 4.0 | 264 | 167 classes, strong actuator-type coverage |
| yolov7 — pdo-yolov7 / pdo-yolov7-v2 | CC BY 4.0 | 396 + 396 | 27 classes each (valve/gauge/flange symbols) |
| Garv — PID_SYMBOLS / ultimate_model / forks | CC BY 4.0 | 599 / 708 / 599 / 1,070 | 19–25 classes (actuator, valve types, tanks, heat exchangers) |
| igcude — pdf2pid | CC BY 4.0 | 1,149 | 103 classes (actuators, valve types, heat exchanger) |
| Hadeers — P&ID Symbols / Detection | CC BY 4.0 | 199 + 191 | 92 / 85 classes incl. **Butterfly Damper**, motor-operated valve |
| Favour — Eng Drawing | CC BY 4.0 | 50 | 32 classes: **Fire Damper, Manual Balancing Damper**, ducts, diffuser |
| Industrial_PID_Symbols | CC BY 4.0 | 221 | Actuator, ControlValve, linkage |
| annotations-pnid (8-batch series) | **Public Domain** | ~3,422 | ~100-120 classes/batch, valves + instrumentation |
| kaskdjansjkd | CC BY 4.0 | 758 | Strainers/pumps/gauges (water-treatment P&ID) |
| tags (Tags workspace) | **MIT** | 53 | Process instrumentation incl. thermostat valve |
| test-ocr (ocr-re1db) | **Public Domain** | 50 | CHILLER, COOLER, STRAINER, HEAT EXCHANGER, PUMP |
| MEP_Blueprints_Objects (TradePlane) | CC BY 4.0 | 32 | CO2/occupancy sensor, valves |
| MyBenp (testing-workspace) | CC BY 4.0 | 61 | 147 classes, German HVAC/BAS (coil, expansion tank, gauge, boiler) |

**Subtotal: ~33,000 images** (heavy skew toward process-industry P&ID valve/instrument iconography — directly relevant given valve/actuator symbol grammar is shared between P&ID and HVAC mechanical schedules; some known duplication among forked projects, e.g. Garv's forks and the PNID batch family).

### B. Air-Side HVAC Equipment (AHU / VAV / duct / diffuser / damper) — schematic, on-domain

| Dataset | License | Images | Key classes |
|---|---|---|---|
| Diffusor-Detection / Component Detection / autotake_2 (shared lineage) | CC BY 4.0 | 79 + 139 + 134 | Damper, Diffuser, Grille, **VAV**, Thermostat |
| find grilles (blec) | CC BY 4.0 | 145 | VAV, **SVAV**, thermostat, damper |
| tiling (blec) | CC BY 4.0 | 273 | damper, air_terminal, thermostat |
| Duct-Detection (small) | CC BY 4.0 | 10 | Duct rectangular/round |
| autotake-dataset (suresh-kamaraj) | CC BY 4.0 | 759 | Duct fittings (bend/reducer/transfer), updated recently |
| autotake-dataset (marsookveeran, fork) | CC BY 4.0 | 76 | Same taxonomy |
| HVAC_EQ (boltdash) | **MIT** | 27 | fan, ahu, fcu, damper, chiller, cooling_tower, condenser |
| hvac-symbol-detection-mvp | CC BY 4.0 | 51 | ahu, condensing_unit, exhaust_fan, thermostat |
| HVac (c2r3, French) | CC BY 4.0 | 77 | AHU, duct fittings, fan |
| heating-cooling-of-plant (blec) | CC BY 4.0 | 47 | fans, coils, dampers, sensors (BAS control diagram) |
| o20 (Mainak Maity) | CC BY 4.0 | 2,727 | 25 classes; **6 genuine VAV/FPVAV classes** (VAV no Coil/Elec Coil/HW Coil/Venturi) + plumbing/lighting fixtures |
| SchemeComponentDetection (Jakub Grzybowski) | CC BY 4.0 | 33 | CO2/temp/pressure sensor, fan, damper, heat exchanger |
| hvac (hvac-project, coarse) | CC BY 4.0 | 403 | bend, duct, txt (coarse) |
| hvac (blueprint-hu8pr, coarse) | CC BY 4.0 | 754 | bend, duct, txt, vd — largest single genuine drawing set |
| MEP Annotation | CC BY 4.0 | 58 | Ceiling fan, light (marginal) |
| chinonsos — hvac-mechanical-2 | CC BY 4.0 | 38 | CSD-1, EG-1, RG-1, SD-2, SR-1 (real MEP tags) |

**Subtotal: ~5,830 images.** Real, on-domain, but fragmented across small datasets with two coarse-class outliers accounting for over half the volume. VAV coverage is genuine but thin (~500 images across near-duplicate-lineage sources).

### C. Water-Side / Central Plant (chiller/boiler/pump/coil) — covered mostly within Category A above (simboli_pid, MEP_FloorPlan_Detection, MyBenp, test-ocr, HVAC_EQ, annotations-pnid). No dataset is dedicated solely to this category; HVAC_EQ (MIT, 27 img) has the cleanest purpose-built taxonomy.

### D. BAS / Controls / Sensors — schematic

| Dataset | License | Images | Key classes |
|---|---|---|---|
| My First Project (DMM) | CC BY 4.0 | 51 | BMS, thermostat, hygrostat, VFD, control relay |
| Type-2-final (Test) | CC BY 4.0 | 43 | BMS, thermostat, control relay |
| Electrical Trade (Palcode) | CC BY 4.0 | 210 | thermostat, humidistat, occupancy/CO sensor |
| Real_Sybol_Detector (Declan) | CC BY 4.0 | 1,541 | VFD (mostly electrical single-line-diagram, only VFD is BAS-relevant) |
| Symbol Recognition 2 (Rishabh) | CC BY 4.0 | 73 | CO sensor, duct smoke detector (223 classes total, mostly fire/electrical) |
| coco (mask-rcnn) | **Public Domain** | 1,019 | Occupancy sensor (lighting-focused RCP set) |
| mep_symbols (Sevesh) | CC BY 4.0 | 641 | Switches, fire alarm, WSHP (marginal BAS relevance) |
| fire-alarm-diagram-detection (Khurram) | CC BY 4.0 | 48 | I/O relay modules — tangential BAS relevance only |

**Subtotal: ~3,626 images**, but weakest category — dominated by electrical/lighting/fire-alarm content with only partial BAS overlap. Genuine thermostat/BMS/sensor-labeled volume, once non-BAS classes are stripped out, is a few hundred images at most.

### Explicitly excluded (verified non-commercial, unauthorized relicense, or wrong content type)

FloorPlanCAD (both HF mirrors — true license CC BY-NC 4.0), "SESYD" (mislabeled FloorPlanCAD mirror), CVC-FP (likely unauthorized relicense of CC BY-NC original), resplan/resplan (conflicting license claims), CubiCasa5k (CC BY-NC 4.0), RPLAN (restricted research agreement), ROBIN (GPL-3.0), R2V (no redistribution rights), ArchCAD-400K (real LICENSE file is academic-only despite paper claiming CC BY 4.0), the academic "Dataset-P&ID" corpus and all its Kaggle/HuggingFace/GitHub mirrors (source is CC BY-NC-ND 4.0), P&ID (pid-vcaab, CC BY-NC-SA 4.0), Eng_Diagrams/GitHub (no license granted), FarEastern workspace family + TAR Project + Gas Boilers/Water Heaters + swiss-aerial-images sets (all confirmed real/aerial photographs, not schematics, regardless of permissive license), BIMobject and commercial CAD block libraries generally (EULA forbids ML-training use).

## MVP Readiness Verdict

**Combined total: ~42,500 commercially-clean, schematic-symbol images** across ~60 datasets. This is a real, usable foundation — far stronger than the project appeared after the first two (mis-scoped, floor-plan-oriented) research passes. Verdict by sub-scope:

- **Valve / actuator / damper detection: MVP-ready now.** ~33,000 images, wide class coverage (ball/gate/globe/butterfly/check/needle/plug valves, multiple actuator types, several damper types), two Public Domain sources requiring zero attribution. Main work is consolidating ~30 overlapping/inconsistent class taxonomies into one schema, not sourcing more data.
- **AHU / VAV / duct / diffuser detection: workable but thin, not fully MVP-ready as-is.** ~5,830 images, genuine on-domain content, but VAV support specifically (~500 images, largely one data lineage forked several times) is the weakest link. Real data should be the training core; targeted synthetic generation should fill out VAV-specific volume and balance the two coarse-class datasets that dominate the raw image count.
- **Chiller / boiler / pump / coil detection: workable, no dedicated dataset needed.** Coverage comes from overlap with Category A (simboli_pid, MEP_FloorPlan_Detection, MyBenp, HVAC_EQ) — sufficient class presence, thin per-class image counts.
- **BAS / thermostat / sensor detection: not MVP-ready from open data alone.** ~3,626 images, but the two largest datasets are electrical-SLD- and lighting-focused with only partial BAS overlap; genuine thermostat/BMS-labeled images number in the low hundreds. This category most needs synthetic augmentation before a production-quality detector is realistic.

**Bottom line: build the MVP on this real data now, with class-taxonomy consolidation as the first engineering task; reserve synthetic generation specifically for VAV-box volume and BAS/controls symbols, where real coverage is genuinely and confirmedly thin** — not as a wholesale replacement for the real data, which is more substantial than earlier assessed.

## Recommended Architecture (unchanged)

- **Primary detector:** RT-DETR (`PekingU/rtdetr_r50vd`, Apache-2.0). Fallback/comparison: Deformable DETR (Apache-2.0).
- Avoid Ultralytics YOLO without an Enterprise License (AGPL), LayoutLMv3 and Nougat (non-commercial).
- Donut (MIT) or Pix2Struct (Apache-2.0) as an optional later layer for tag/schedule association, not needed for the core MVP.

## Compute & Environment

Fine-tuning RT-DETR on ~40K images needs a real GPU. This is researched and decided before Step 4, not assumed:

- Check what's actually available first: local machine specs, whether an NVIDIA GPU with sufficient VRAM is present, or whether it's Apple Silicon (MPS backend) — usable for small-scale experimentation but meaningfully slower and less proven for object-detection training than CUDA, and a real constraint to name plainly rather than gloss over.
- If local hardware isn't sufficient, research current rented-GPU options (e.g. RunPod, Lambda Labs, AWS/GCP GPU instances, Paperspace) and come back with a concrete recommendation: which instance type, real current hourly pricing, and an estimated total cost for the expected number of training runs — not a vague "rent a GPU" pointer.
- Account creation and payment for whichever provider is chosen falls under the Execution Model above — that part comes back to the user. Once an instance is provisioned and API/SSH access is handed over, driving it (uploading data, launching training, pulling results) is Claude's job.

## Training Pipeline (detailed)

Every step below carries its own explicit **Verify:** checklist. None of these are optional or deferred to "testing later" — each one exists because a specific, identifiable failure mode at that step would silently corrupt everything downstream of it and wouldn't show up until the fine-tuned model is already misbehaving in a way that's hard to trace back. Treat a failed verification as a hard stop on that step, not a note to revisit.

### Step 0 — Web research & source classification audit

The dataset registry compiled earlier in this project is a snapshot from live research — treat it as a starting point to re-verify, not as ground truth to download against directly. Licenses on Roboflow/Kaggle pages can change, a project can be taken down or forked further, and some of the ~60 sources were only classified from a preview thumbnail rather than a full inspection. Before Step 1 downloads anything for real, re-do the verification pass systematically, per source, and produce the actual authoritative registry:

- **Re-fetch every one of the ~60 source pages live** (not from memory of this conversation) and record the license text exactly as it reads today, with a timestamp. Any source whose license changed, disappeared, or now reads differently gets pulled from the registry and flagged, not silently kept on the old assumption.
- **Classify content type by actual visual inspection**, not by project name or class-name inference — open real sample images from each source and confirm schematic/drawing content vs. photograph (several sources in this project's research turned out to be real-world/aerial photos despite HVAC-sounding names — "duct," "hvac," "AHU module detection" all had false-positive name collisions found this way; assume any new source could do the same).
- **Classify domain category per source** (valve/actuator/damper vs. air-side AHU/VAV/duct vs. central-plant vs. BAS/controls) by actually reading the class list and looking at sample images, not by the source's project title — project names in this ecosystem are frequently misleading (e.g., "hvacai" turned out to be generic P&ID instrumentation, not HVAC equipment).
- **Research ambiguous acronyms and symbol conventions** encountered in class lists (e.g., confirm what "ESDV," "CBV," "FCV," "BDV" actually denote, and confirm standard ISA/ASHRAE symbol conventions for valve and damper types) via web research before they reach Step 2 — Step 2's taxonomy consolidation depends on correctly understanding what each raw class name means, and guessing at an unfamiliar acronym risks a silently wrong merge.
- Produce the final authoritative `LICENSE_REGISTRY.md` entry per source: URL, license (verbatim, with verification timestamp), confirmed content type, confirmed domain category, and an explicit include/exclude decision with reasoning. This file — not this conversation's summary tables — is what Step 1 downloads against.
- **Verify:** cross-check the finished registry against the totals claimed earlier in this project (~42,500 images across ~60 sources, split roughly 33,000 / 5,830 / 3,626 across categories) — any material discrepancy between the fresh audit and those numbers means something changed or was wrong the first time, and the MVP-readiness verdict below has to be revisited before proceeding, not carried forward on the old numbers.

### Step 1 — Download + normalize

- One download job per source (~60 total): Roboflow sources pulled via the Roboflow API/SDK in COCO JSON format using a free API key; the two Kaggle sources (mollous, and any others hosted there) pulled via the Kaggle CLI. Each job lands in `data/raw/<category>/<dataset-slug>/` with the original COCO JSON + images untouched.
- Every source gets a manifest entry recorded alongside the download: source URL, exact license string, required attribution text, image count at download time, and the original (raw) class list — this feeds `LICENSE_REGISTRY.md` directly and is the audit trail if a license is ever challenged.
- **Dedup pass before normalization.** Several sources are known forks/near-duplicates of the same underlying images (Garv's `PID_SYMBOLS` / `PID_SYMBOLS 2`, the `Diffusor-Detection` / `Component Detection` / `autotake_2` lineage, DuoWork's two valve-detection sets, the `annotations-pnid` 8-batch series). Use perceptual hashing on images to detect exact/near-duplicate frames across sources and decide per group: keep the largest/cleanest version and drop the rest, or keep all but tag them with a shared `lineage_id` so step 3 can treat them as one group for splitting purposes (see Step 3).
- Normalize every kept source into one COCO schema: image IDs prefixed by source-slug to avoid collisions, annotations carry a `raw_class_name` + `source_dataset` field (not yet remapped to canonical classes), one merged `data/normalized/all_sources.json` plus a single `images/` pool.
- Some P&ID sources are tiled crops of larger source diagrams (filenames like `ERCP_7_r2_c2.png`, indicating row/column tiles of one original sheet) — preserve the parent-sheet identifier in metadata now, because Step 3 needs it to avoid splitting tiles from the same sheet across train/val/test.

**Verify:**
- Re-fetch and diff each source's license text at download time against the snapshot recorded during research — do not trust the earlier research pass as final; licenses on Roboflow/Kaggle can change, and a stale assumption here poisons the legal basis for everything trained on it.
- Confirm each download's actual image/annotation count matches the registry's recorded count. A mismatch means a partial download, a silently changed source, or a version mismatch — resolve before normalizing, not after.
- Validate every image file opens and every annotation file parses (no corrupt images, no empty/malformed annotation entries) before it enters `data/normalized/`.
- Confirm bounding-box coordinate format (xywh vs xyxy, absolute vs normalized) is correctly and consistently converted per source — a silent format mismatch here corrupts every box downstream without raising an error.
- Spot-check the dedup/perceptual-hash pass by hand on a sample of flagged groups: confirm true duplicates were actually caught (not missed, which causes train/test leakage in Step 3) and that nothing unique was wrongly discarded as a false-positive duplicate.
- Spot-check parent-sheet/tile-grouping metadata against the real source page for a sample of tiled datasets — confirm the grouping logic actually reconstructed the correct parent, not just a filename-pattern guess.

### Step 2 — Consolidate the taxonomy (the real bottleneck)

- Export every distinct `raw_class_name` across all kept sources (~200+ strings) into one review sheet, grouped by rough naming similarity (case/whitespace/underscore-normalized) to cut the manual load before a human ever looks at it.
- **These merge/split decisions are made via web research, not guessed at** — does "3-way valve" merge across the ~15 sources that have some spelling of it into one class, or does valve type stay orthogonal to actuator type (e.g., `valve_gate` + separate `actuator_pneumatic` vs. one combined `gate_valve_pneumatic_actuated`)? Resolve each ambiguous case against real authoritative references (ISA S5.1 symbol standard, ASHRAE drafting conventions, manufacturer glossaries for any acronym that doesn't resolve cleanly) and document the source cited for each non-obvious decision. Decide this once, as an explicit taxonomy design doc, before remapping anything — changing it later means re-touching every source.
- While deciding the taxonomy, **tag each canonical class as flip-safe or flip-unsafe.** Directional/state-dependent symbols (actuator fail-open vs fail-closed, flow-direction arrows, asymmetric damper blades) are not safe to horizontally flip during augmentation; most valve-body symbols are. This flag is consumed directly by Step 4's augmentation policy.
- Flag any canonical class landing under ~10 total instances after merging — decide per-class whether it's folded into a coarser parent class for v1, or kept separate and explicitly deferred to the synthetic gap-fill pass (this is expected for some rarer damper/actuator subtypes).
- Produce `canonical_taxonomy.yaml`: canonical class name → list of `(source_dataset, raw_class_name)` pairs it absorbs, plus the flip-safety flag. This file is the single source of truth — re-running the remap from raw data should be fully reproducible from it.
- Apply the mapping to produce `data/normalized/unified_dataset.json` (canonical classes only), then **manually spot-check a random sample per canonical class** (not just per source) to confirm the merge is visually correct, not just name-matched — a name match across two sources doesn't guarantee the same drafting convention was used.

**Verify:**
- Confirm every single `raw_class_name` from every source appears somewhere in `canonical_taxonomy.yaml` — no class silently dropped because it didn't get reviewed. An unmapped class doesn't error, it just vanishes, so this has to be checked as a positive assertion (raw class list minus mapped list equals empty set), not assumed.
- Conserve annotation counts through the remap: total annotation count in `unified_dataset.json` must equal the total in `all_sources.json` minus any explicitly-documented exclusions (e.g., classes deliberately dropped for having <10 instances). Any other discrepancy means the mapping logic silently lost or duplicated annotations.
- Since there's no second human reviewer, substitute an independent check with equivalent teeth: re-derive the taxonomy mapping a second time from the raw class list alone (without looking at the first pass's decisions), then diff the two — any class where the two independent passes disagree gets flagged and resolved against the cited authoritative source, not by picking one arbitrarily. This file is the single point of failure for the entire project's semantic correctness, and skipping this because "it was already reasoned through once" is exactly the condition under which a bad merge (e.g., collapsing two visually-similar-but-functionally-different valve types) goes unnoticed until it shows up as a confusing model error weeks later.
- Treat the per-canonical-class visual spot-check as pass/fail with a documented sample size (not "eyeballed it, looked fine") — any class that fails gets re-mapped and re-checked, not waved through.
- Review the flip-safety tags as their own explicit checklist pass, separate from the class-merge decisions — this is easy to rush through as an afterthought on the same file, but getting it wrong silently corrupts geometry for exactly the classes (actuator fail-open/closed, flow direction) where getting the orientation wrong is most damaging to the product's actual purpose.

### Step 3 — Stratified train/val/test split

- Split at the **parent-sheet / lineage-group level, not the image level** — tiles from the same original P&ID sheet, and images sharing a `lineage_id` from Step 1's dedup pass, must all land in the same split. Otherwise near-identical crops leak across train/test and validation metrics become meaningless (this is a real risk given how many sources are forks or tile-grids of one source drawing).
- Compute per-canonical-class instance counts, then force a minimum count (e.g., 3–5 instances) into both val and test for every class before filling the rest by ratio — plain random 80/10/10 splitting would likely leave the thinnest classes (VAV, specific damper subtypes) entirely absent from val/test given how concentrated that support already is in one or two lineages.
- Output `train.json` / `val.json` / `test.json` (COCO format) plus a stratification report: per-class counts in each split, and an explicit flag on any class that couldn't hit the minimum val/test count even after forcing — those are the classes Step 4's evaluation has to be read with caution on, and the ones the synthetic gap-fill pass should prioritize first.

**Verify:**
- Run an automated check — not just a design intention — that no `lineage_id` or parent-sheet group appears in more than one split. This must fail loudly (halt the pipeline) if violated, since a silent violation here is the single most likely way to produce a model that looks good on paper (inflated val/test mAP from leaked near-duplicates) and performs worse in reality.
- Run a supplementary image-hash comparison directly between the final train/val/test sets as a second, independent leakage check on top of the lineage-group split — belt and suspenders, since the lineage-grouping logic itself was only spot-checked in Step 1, not exhaustively verified.
- Confirm every canonical class actually hit its forced minimum val/test count in the final output, not just in the pre-split plan — re-run the stratification report against the actual written split files, since a bug in the splitting code could satisfy the design on paper but not in the output.
- Require explicit sign-off on the stratification report before Step 4 begins — any class that fell short of the minimum gets named and acknowledged as a known limitation up front, not discovered after training when it's harder to trace back to a data problem versus a modeling problem.

### Step 4 — Fine-tune RT-DETR

- Base checkpoint: `PekingU/rtdetr_r50vd` (Apache-2.0). Replace the classification head to match the final canonical class count from Step 2.
- **Class-balanced sampling** during training so the ~33,000-image P&ID-heavy valve/actuator classes don't starve the much smaller AHU/VAV/BAS classes in gradient updates — either oversample the rare classes or run a two-stage schedule (broad pretraining pass on everything, then a lower-learning-rate continuation pass weighted toward the underrepresented categories).
- Augmentation: standard random crop/resize/scale-jitter/color-jitter. **Horizontal flip is applied only to classes tagged flip-safe in `canonical_taxonomy.yaml`** — flip-unsafe classes (actuator fail-open/closed, flow-direction arrows, asymmetric dampers) either skip flip entirely or get flipped with their label swapped to the correct mirrored class where one exists.
- Standard RT-DETR training losses (classification + L1 + GIoU box loss), checkpoint selection on best validation mAP@50, single high-end GPU is sufficient at this data scale (hours per run, not days).
- Deliverable: a fine-tuned checkpoint, the exact training config used, and an evaluation report against the held-out test set — including a breakdown by class so it's visible which canonical classes (expected: the ones flagged in Step 3 as under-supported) need the synthetic gap-fill pass before the model is production-usable.

**Verify:**
- Directly test that flip-safety flags actually behaved as intended in the running augmentation pipeline: pull a handful of known flip-unsafe images (e.g., a labeled fail-open actuator) after augmentation and confirm they were either never flipped or flipped with the label correctly swapped — don't just trust that the config flag was wired up correctly, check its actual effect on real samples.
- Touch the held-out test set exactly once, at the very end, for the final reported number — never use it for checkpoint selection or hyperparameter decisions (that's what val is for). Using test-set performance to make any training decision silently turns it into a second validation set and invalidates the final number as an honest estimate of real-world performance.
- Review per-class mAP, not just aggregate mAP — an acceptable overall number can hide a near-zero score on exactly the thin classes (VAV, rare damper subtypes) that matter most to flag before declaring the model ready.
- Manually review actual model predictions on a sample of real images per class (not just the numeric metric) before sign-off, especially for classes near the minimum val/test support threshold — a metric computed on 3-5 examples can look fine or look terrible almost by chance, and only eyeballing the actual predictions tells you which.
- Check training/validation loss and mAP curves for the specific signature of leakage that slipped past Step 3's checks (val performance implausibly high relative to train, or jumping suspiciously early) — treat an unexpectedly good result as a reason to double check for a data problem, not just a reason to celebrate.
- Before this checkpoint is treated as final or shared outside the immediate team, reconcile the exact list of source datasets actually contained in the training data against `LICENSE_REGISTRY.md` — confirm nothing excluded during dedup or class-count filtering is still silently referenced in an attribution notice, and nothing included is missing one.

## Project Scaffold (to create in `MASTER PLAN/`)

```
MASTER PLAN/
  README.md
  LICENSE_REGISTRY.md            — the full registry above, one row per dataset, license snapshot + verify date
  data/
    raw/                          — direct downloads of all ~60 sources, organized by category (A/B/C/D)
    normalized/                   — after class-taxonomy consolidation, COCO format, single unified schema
    synthetic/
      symbols/                    — redrawn VAV-box and BAS/thermostat symbol artwork (the two confirmed-thin categories)
      generated/                  — synthetic composites targeting those specific gaps only
    eval/                         — held-out slice, never trained on
  scripts/
    download_datasets.py          — pulls all cleared sources, verifies checksums, snapshots license text
    consolidate_taxonomy.py        — maps ~200+ raw class names onto one unified schema
    generate_synthetic_gap_fill.py — VAV + BAS synthetic generation only
    verify_licenses.py            — periodic re-check of source pages
  configs/
    model_rtdetr.yaml
    model_deformable_detr.yaml
  training/
    train.py
    eval.py
  models/                         — checkpoints (gitignored)
```

## MVP Readiness Sign-off

"Comfortable for an MVP" is a conclusion this project earns by completing Step 0 through Step 4 and their **Verify:** checklists with documented findings — not a judgment call made in advance of doing that work. Specifically, before declaring the MVP-readiness verdict (see above) still holds:

- Step 0's fresh registry audit must be complete for all ~60 sources, with the ~42,500-image / category-split totals either confirmed or explicitly revised.
- Every **Verify:** item across Steps 1–4 must have a documented outcome (pass, or a named exception with reasoning) — not silently skipped because the pipeline "seemed to work."
- The per-class evaluation breakdown from Step 4 must be reviewed specifically against the three sub-scope verdicts already reached (valve/actuator: MVP-ready; AHU/VAV/duct: workable but thin; BAS/thermostat: not ready from real data alone) — if the fresh numbers or the trained model's actual per-class performance contradict any of those verdicts, that verdict changes, the earlier one doesn't get grandfathered in.
- Only after that full trail of evidence exists does this project get to report the model as ready for an MVP — and the honest answer may still be "ready for valve/actuator, not yet for BAS," which is a legitimate MVP scope to report back to the user, not a failure.

## Verification

Each step's **Verify:** checklist above is the primary mechanism — this section is the cross-cutting safety net that sits on top of them, run once at the end regardless of which individual step checks passed:

- Confirm `LICENSE_REGISTRY.md` (post Step 0 audit) is what every downstream file actually traces back to — no dataset in `data/normalized/` or the final training set should be missing a corresponding, current registry entry.
- Re-run the full leakage check (lineage-group + image-hash) one more time on the exact final train/val/test files used for the reported model, not just on an intermediate version — files get regenerated during iteration, and a check that passed on an earlier version doesn't guarantee the final one.
- Re-confirm attribution requirements are actually satisfied in whatever the model/product ships with (CC BY 4.0 sources need visible attribution; the Public Domain sources don't, but shouldn't be mislabeled as needing it or not needing it based on assumption).
- Track every re-verification date in the registry going forward — this project's own research surfaced sources whose license claims contradicted their original authors', so treat "checked once" as good only until the next training run, not permanently.
