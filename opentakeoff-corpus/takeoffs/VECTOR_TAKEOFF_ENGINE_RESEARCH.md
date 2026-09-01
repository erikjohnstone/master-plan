# Vector takeoff engine research — commercial practice + complete OSS stack

**Status:** AUTHORITATIVE (2026-09-01)  
**Trigger:** Pillar C audit proved **63/81 valve-bearing sets have valve language in the PDF
but compile returns 0 rows**. Regex/title tuning on `corpusTakeoff.mjs` cannot fix that —
the failure is **upstream table extraction and structural classification**, not downstream
family matching.  
**Policy:** GOAL non-negotiable #11 — shared Session + ODL path only. No UI/MCP fork.

---

## 1. Executive verdict

You are correct: **regex is not the engine**. Commercial takeoff products (Kamai, Trimble
MEP, iBeam/Beam AI, and the best open-source MEP tools) all start from **native PDF/CAD
vector geometry** — text positions, line segments, rectangles, layers, and scale — then
build structured tables and symbol inventories, and **only then** apply lightweight
classification rules (title phrases, column headers, mark patterns) to label what was
already extracted geometrically.

OpenTakeoff already has the right **architecture** (`sheetgraph.ts` geometric extraction +
OpenDataLoader-PDF adapter + reconcile). The Pillar C gap is that **Layer 1 (find tables
as geometry) fails on ~24/70 compile-zero valve sets** and **Layer 2 (classify untitled
tables by header/column shape) fails on ~46/70** — so `corpusTakeoff.mjs` never receives
rows to classify. Tweaking `titleRe`/`keyRe` without fixing extraction is polishing the
wrong floor.

**Do not treat compile-empty as verified-empty.** The PDF text audit (`pillarCValvePdfTextScan.mjs`)
showed **0/81 PDFs with zero valve/damper text** and **63/81 compile-zero with PDF signal**.

---

## 2. How commercial engines actually work

Sources: Kamai product/docs/blog; Trimble MEP/Accubid announcements (2026); iBeam/Beam AI
HVAC + schedule-reconciliation articles; MEPdetect README (vector vs raster paths); industry
HVAC takeoff practice (Simpro, BuildCrux multi-pass workflows).

### 2.1 Shared pipeline shape (all serious products)

Every credible MEP takeoff engine follows the same multi-pass shape:

```mermaid
flowchart TB
  subgraph L0["Layer 0 — Ingest"]
    PDF["PDF / CAD upload"]
    META["Title block · sheet index · scale · discipline"]
  end

  subgraph L1["Layer 1 — Vector parse"]
    VEC["Text spans + bboxes"]
    LIN["Line segments · rects · paths"]
    LAY["Optional layer tree"]
  end

  subgraph L2["Layer 2 — Structure detection"]
    TBL["Schedule / table grids"]
    SYM["Plan symbols · tags"]
    LEG["Legend ↔ symbol map"]
  end

  subgraph L3["Layer 3 — Quantities"]
    SCH["Schedule row extraction"]
    CNT["Symbol / tag counts on plan"]
    LEN["Linear measure from coordinates"]
  end

  subgraph L4["Layer 4 — Reconcile + QA"]
    REC["Schedule ↔ plan join"]
    FLAG["Mismatch / RFI flags"]
    CITE["Sheet + bbox cites"]
  end

  subgraph L5["Layer 5 — Classification (thin)"]
    FAM["Family labels from title + headers + mark shape"]
    COL["Column role mapping"]
  end

  PDF --> VEC
  PDF --> LIN
  PDF --> META
  VEC --> TBL
  LIN --> TBL
  VEC --> SYM
  LIN --> SYM
  LEG --> SYM
  TBL --> SCH
  SYM --> CNT
  LIN --> LEN
  SCH --> REC
  CNT --> REC
  SCH --> FAM
  FAM --> COL
  REC --> FLAG
  REC --> CITE
```

**Regex/title rules live only in Layer 5.** They label tables and rows that Layers 1–3
already recovered as geometry. When Layer 1 returns zero tables, Layer 5 has nothing to
match — exactly what the 70 compile-zero valve sets demonstrate.

### 2.2 Kamai (foundational models on vector geometry)

Public documentation is explicit:

| Claim | Mechanism | Source |
|---|---|---|
| Reads **native vector geometry**, not rasterized pixels | Parses PDF/CAD coordinates directly; duct lengths computed from drawing coordinates | [Kamai mechanical HVAC takeoff](https://kamai.io/blog/how-to-do-mechanical-and-hvac-takeoffs) |
| Foundational models trained on construction drawings | In-house models distinguish walls vs gridlines, door swings vs arcs, room boundaries vs hatches | [Kamai AI takeoff overview](https://kamai.io/learn/ai-construction-takeoff) |
| MEP: equipment schedules + M-series plans + sections + legends | Two estimator-time jobs: **measure duct from coordinates** + **link scheduled tags to plan** | Kamai mechanical blog |
| Output = structured JSON with sheet/layer traceability | API + MCP; quantities not prices | [Kamai PDF takeoff API](https://kamai.io/blog/how-construction-pdf-takeoff-api-works) |
| Accepts scanned PDFs too | Hybrid path when vector text absent (OCR) — out of scope for our GOAL unless reopened | Kamai FAQ |

**Implication for OpenTakeoff:** Kamai’s “AI” is not an LLM reading prose — it is
**geometry-first extraction + learned classifiers** over vector features. Our deterministic
equivalent is sheetgraph + ODL + (optional) TATR/gmft for hard grids — not more regex on
empty `graph.tables`.

### 2.3 Trimble MEP / Accubid (2026 AI layer)

Trimble’s 2026 MEP release emphasizes **pre-takeoff automation on vector sheets**:

| Capability | What it automates |
|---|---|
| Scale + sheet naming | AI sets scale across full plan set before measurement |
| Count takeoff | Symbol recognition (receptacles, fixtures, …) — 3M+ symbols reported |
| Length takeoff | Auto-routing for conduit including vertical rises |
| Smart assistant | NL queries over **already-extracted** estimate data |

Trimble still separates **graphical takeoff (LiveCount)** from **spec-driven estimating
(Accubid)** — same architectural split as OpenTakeoff’s compile vs reconcile.

**Implication:** Even “AI” MEP takeoff keeps **geometry extraction** and **pricing** separate.
OpenTakeoff’s shared path is aligned; we need extraction recall, not estimator pricing.

### 2.4 iBeam / Beam AI (schedule-first + reconcile)

Beam AI’s public HVAC workflow matches Pillar B/C:

1. Read title blocks, **equipment/diffuser/VAV schedules**, plan symbols, legends.
2. **Schedule quantities are authoritative** for equipment counts; plans verify placement.
3. **Schedule-to-plan reconciliation** flags schedule∖plan and plan∖schedule mismatches
   (RFI-grade, not silent overcount).
4. Human QA on structured output before bid.

**Implication:** Reconcile is product, not polish — OpenTakeoff Pillar B is the right
shape. Pillar C fails today because **schedule rows never enter the graph** on most sets.

### 2.5 MEPdetect (best public description of vector vs raster)

MEPdetect documents two distinct paths in one product:

| Input | Path | Mechanism |
|---|---|---|
| **Vector PDF** | Native | Pen/lineweight isolation, arrowhead geometry, hash marks, **text as real text**; connectivity on segments |
| Raster / scan | Fallback | Binarize → thin → curve recovery → YOLO11 symbols |

This is the clearest OSS statement of what “read vector geometry” means in practice:
**use the drawing’s own linework and text layer before touching pixels.**

OpenTakeoff GOAL policy: stay on the vector path; honest refuse on raster-only fixtures
(e.g. itd-d1-lab-raster).

---

## 3. OpenTakeoff today — what is already geometric

| Component | Layer | Role |
|---|---|---|
| `session.ts` + pdf.js | L0–L1 | Load PDF; emit `GraphSpan` text + vector segments |
| `sheetgraph.ts` `extractAllTables` | L2 | Geometric table detection (header tiers, quarter-turn, banding) |
| `sheetgraph.ts` ODL adapter (~7327+) | L2 | Deterministic grid from OpenDataLoader JSON; snap bboxes to pdf.js spans |
| `mcp/src/opendataloader.ts` | L2 | Runs ODL CLI; feeds adapter |
| `corpusTakeoff.mjs` | L5 | Family specs, `titleRe`/`keyRe`, column normalize — **after** tables exist |
| `reconcileWorkflow` / `sweep_schedule_row` | L4 | Schedule tag → plan text join |

**Smoking gun (013_MO_T2523):** Graph contains a **blank-title** table with headers
`TAG, MANUFACTURER, MODEL, SERVED, GPM, SIZE` and marks `CV-7`…`CV-12`. Geometry
extraction **succeeded**; compile returned 0 because `uniqueFamily()` required a titled
`CONTROL VALVE` match and `keyRe` did not admit `CV-*` — a Layer 5 bug **on top of**
recovered geometry, not a regex-only pipeline.

**Smoking gun (058_LBNL):** Graph has ~6 non-HVAC tables only — Layer 1 failure on
rejoined multipart set (“311 sheets / thin tables”).

---

## 4. Production-ready OS architecture stack (v2 — validated 2026-09-01)

This is the **complete, production-oriented stack** for massive US vector HVAC/BAS
blueprints — incorporating scale/tiling (🌟 L1.5), topology tracing (🌟 L3.5),
cross-source dedup reconcile (L4), and optional local VLM for untabled assets (🌟 L4.5).
Web-research validated against SAHI, Shapely/NetworkX/momepy, pdfplumber spatial joins,
ConstructDrawingAI, TakeoffLens, MEPdetect, and Qwen2-VL / Llama 3.2 Vision licensing.

| Layer | OSS components | Purpose |
|---|---|---|
| **L0 Ingest** | **pdf.js** (in repo), **pdfminer.six**, **Aspicio** `@aspicio/core` (MIT) | Extract PDF object streams, fonts, vector paths, embedded rasters. PyMuPDF only if AGPL licensed for your deployment. |
| **L1 Vector primitives** | **pdfplumber**, **pdfminer.six**, Session **`GraphSpan` + segments** (in repo) | Flatten `moveTo`/`lineTo`/rect streams into normalized 2D coordinate arrays with bboxes. |
| **🌟 L1.5 Scaling & tiling** | **OpenCV** tile split, **SAHI** (`obss/sahi`, MIT), **Shapely** affines | Slice gigapixel sheets into overlapping tiles; maintain **page-space transform matrix** to map model outputs back to exact PDF coordinates. |
| **L2 Table detection** | **ODL + sheetgraph** (in repo), **Camelot** lattice/stream, **pdfplumber**, **gmft/TATR** | Detect grid structures + cell bboxes; **spatial join** maps L1 character midpoints inside cell bounds (pdfplumber `char_in_bbox` pattern). |
| **L3 Plan symbols** | **`sweep_schedule_row`** (in repo), **MEPdetect** vector path, **YOLOplan** / SAHI+YOLO | Locate valves, dampers, terminals, equipment tags on layout canvas. Vector text sweep **first**; vision only when text layer absent. |
| **🌟 L3.5 Topology graph** | **Shapely** spatial ops, **NetworkX**, **momepy** `gdf_to_nx`, MEPdetect segment trace | Connect symbols to linework; trace duct/pipe/conduit context (damper → duct segment → fan). **Must use buffer tolerance — see §4.6.** |
| **L4 Reconcile** | **`reconcileWorkflow`** (in repo), IoU/GREEDYNMM dedup | Schedule↔plan join; **resolve overlaps** where L3 vector heuristics and L3 vision both hit the same asset. |
| **🌟 L4.5 Unstructured VLM** | **Qwen2-VL-7B** (Apache-2.0), **Llama 3.2 Vision 11B** (Meta community license) | Read **local visual crops** around untabled assets to tie floating labels/flags/notes to asset IDs. **Not on GOAL deterministic path — see §4.7.** |
| **L5 Classify** | Header geometry + mark shape + column role map; **Pydantic** / structured parser | Final sanitization: `"300×200 MD-1 (NC)"` → `{size, tag, fail}`. Regex is one signal here, not the engine. |

### 4.1 L1.5 — Scaling & tiling (research notes)

**Problem:** E-size / 4000×3000+ blueprint pages exceed YOLO/TATR context; downsampling loses
small symbols (VAV tags, damper marks, grille IDs).

**Validated approach:**

1. **Scale from title block first** — read numeric scale from vector text (OpenTakeoff
   `detected_scale` already on shared path). All tile math stays in **PDF user space** until
   the last mile.
2. **Overlapping tiles** — industry default ~25–50% overlap ([SAHI docs](https://github.com/obss/sahi/blob/main/docs/predict.md),
   [Flip-n-Slide multi-overlap strategy](https://arxiv.org/pdf/2404.10927)). Prevents symbols
   bisected at tile edges from being lost.
3. **SAHI over raw OpenCV loops** — [SAHI](https://github.com/obss/sahi) (MIT) wraps slice →
   detect → **shift predictions back** via `shift_amount` + `full_shape` on each
   `ObjectPrediction`. Post-merge via GREEDYNMM/NMS at configurable IoU/IOS threshold.
4. **Shapely affine** — store per-tile `(offset_x, offset_y, scale)`; map tile bboxes → page
   bboxes with `shapely.affinity.affine_transform` before merge.

**OpenTakeoff fit:** Batch sidecar for Pillar D symbol sweeps on huge sheets; primary valve/BAS
path (Pillar C) still schedule-table-first — tiling is secondary until L2 recall is fixed.

### 4.2 L2 — Spatial join (pdfplumber pattern → ScheduleTable adapter)

pdfplumber’s table extractor is the reference implementation for **geometry-first cell fill**:

```python
# pdfplumber/table.py — char midpoint inside cell bbox
v_mid = (char["top"] + char["bottom"]) / 2
h_mid = (char["x0"] + char["x1"]) / 2
return (h_mid >= x0) and (h_mid < x1) and (v_mid >= top) and (v_mid < bottom)
```

**Production rule:** never OCR cell text if vector characters exist inside the cell bbox.
Camelot `flavor='ml'` and gmft follow the same principle — model finds structure, **PDF text
layer fills values** (no hallucinated Cv/GPM).

**Adapter contract:** all L2 backends emit the same `ScheduleTable` / ODL grid types
(`sheetgraph.ts` adapter ~7327). One graph slot; no MCP-only fork.

### 4.3 🌟 L3.5 — Topology graph (research notes)

**Purpose:** Answer “what system is this damper on?” — not just “count MD-1.”

**Validated OSS patterns:**

| Source | Mechanism |
|---|---|
| **MEPdetect vector path** | Isolates conductors by pen/lineweight; arrowhead polygon geometry; segment connectivity with gap tolerance |
| **NetworkX + momepy** | [Primal graph from line intersections](https://networkx.org/documentation/stable/auto_examples/geospatial/plot_lines.html) — nodes at junctions, edges = duct/pipe segments |
| **ConstructDrawingAI L1** | Symbol detection + **connectivity graph** on P&ID/architectural/electrical drawings |
| **IfcOpenShell voxel toolkit** | Dilate/erode for clearance-aware 3D routing (BIM path — reference for tolerance thinking) |

**OpenTakeoff near-term:** extend existing `sweep_schedule_row` + inline motifs with optional
**served-duct context** (which AHU/zone text appears nearest on same sheet) before full graph
routing. Full NetworkX duct tracing is Pillar D+ / duct-LF deferred scope.

### 4.4 L4 — Cross-source dedup reconcile

When both **vector text sweep** (L3) and **YOLO detection** (L3 vision) find the same asset:

1. Project both to page-space bboxes.
2. Merge if IoU ≥ τ or IOS ≥ τ (SAHI default postprocess — tunable per trade).
3. Prefer **vector text tag** as canonical ID when present (deterministic, citeable).
4. Vision-only hits → `PLAN_ONLY` or `UNCERTAIN` until schedule row or human confirms.
5. Feed merged inventory into existing **`reconcileWorkflow`** MATCH / SCHEDULE_ONLY statuses.

This mirrors iBeam’s schedule↔plan mismatch surfacing — extended to **dual perception sources**.

### 4.5 🌟 L4.5 — Local VLM (research + GOAL gate)

**What the models do:**

| Model | License | Fit |
|---|---|---|
| **Qwen2-VL-7B-Instruct** | **Apache-2.0** ([Qwen2-VL](https://qwen2.org/vl/)) | Local crop → structured JSON for floating labels near untabled symbols |
| **Qwen2.5-VL-7B** | Apache-2.0 | Successor; better table OCR in crops ([Labellerr comparison](https://www.labellerr.com/blog/qwen-2-5-vl-vs-llama-3-2/)) |
| **Llama 3.2 Vision 11B** | Meta community license | Strong DocVQA; check redistribution terms for your product |
| **TakeoffLens** (reference arch) | — | MCP workflow: vector first, high-res tiling + vision **only for raster scans** |

**⚠ OpenTakeoff GOAL conflict:** `GOAL.md` mandates a **deterministic, non-LLM pipeline** and
states **“OCR and vision remain out of scope.”** Therefore:

- **L4.5 is NOT on the shared corpus scoring path** until GOAL scope is explicitly reopened.
- Permitted use today: **offline coordinator assist** on raster-only fixtures with
  `present_not_row_extractable` / `REFUSED` disclose — output labeled *estimate*, never merged
  into locked GT without vector corroboration.
- If reopened: crop = tight bbox around L3 detection + 20% margin; prompt → **Pydantic schema**
  (L5); require matching vector text or schedule row before `MATCH`.

### 4.6 Architectural pitfall — topology buffer tolerance (mandatory)

> Do not rely on strict geometric intersection for MEP connectivity. Draftsmen leave
> pixel-wide gaps between lines and symbols that look connected to the human eye but fail
> `.intersects()` at zero tolerance.

**Production pattern (Shapely):**

```python
from shapely.geometry import Point, LineString
from shapely import buffer

TOL_PTS = 2.0  # PDF points — tune from scale (≈1–3 mm at 1/4"=1'-0")

def symbol_touches_line(symbol_centroid, duct_line):
    node = Point(symbol_centroid).buffer(TOL_PTS)
    corridor = buffer(duct_line, TOL_PTS, cap_style="flat", join_style="mitre")
    return node.intersects(corridor)
```

**Calibration:** derive `TOL_PTS` from sheet scale — e.g. 2 mm real at 1/8"=1'-0" ≈ 0.75 pt
at 72 dpi PDF space, but **empirical tune on corpus** (Bessemer rowsym fixtures). MEPdetect’s
vector path uses lineweight bands + gap bridging for the same reason.

**Anti-patterns:** pure `.intersects()` without buffer; graph edges on every line crossing
(grid lines ≠ duct); treating legend hatches as duct centerlines.

### 4.7 L5 — Structured classification (beyond regex)

Layer 5 stack:

1. **Header token sets** — `TAG|GPM|Cv|SERVED|AI|AO|BI|BO` geometry (fixes 013 blank-title valves).
2. **Mark-shape grammars** — `CV-\d`, `MD-\d`, `VAV-\d` on column-0 cells.
3. **`columnMapFor`** — contractor columns (actuator, fail position, trend/alarm).
4. **Pydantic / JSON Schema validation** — parse composite size strings into typed fields;
   refuse rows that fail schema rather than silently dropping.

Regex lives inside L5 as **one signal**, not the primary engine.

---

## 4b. Complete open-source stack (layer detail — v1 reference)

This is the **full stack a Kamai-class deterministic pipeline can be built from today**
without proprietary models. Items marked **(in repo)** are already integrated. **§4 v2 table
above is authoritative for production architecture; this section retains component-level detail.**

### Layer 0 — Document ingest

| Tool | License | Role | Notes |
|---|---|---|---|
| **pdf.js** (Mozilla) | Apache-2.0 | Browser + Node PDF render; text/content streams | **(in repo)** via Session |
| **PyMuPDF (fitz)** | AGPL / commercial | Fast vector text + path extraction; used by autoConst-style indexers | Optional batch sidecar |
| **Aspicio** `@aspicio/core` | MIT | DXF + vector PDF parse → structured JSON; MCP server | Strong for CAD-native uploads |
| **pdfium** (via `@hyzhyz/pdf-lib` / PyPDFium2) | Apache / BSD | High-throughput page rasterization when needed | gmft, MEPdetect use PyPDFium2 |

### Layer 1 — Vector text + geometry primitives

| Tool | License | Role | Notes |
|---|---|---|---|
| **pdfminer.six** | MIT | Character-level layout analysis | Backend for pdfplumber |
| **pdfplumber** | MIT | Characters, rects, curves — **debuggable** layout primitives | Best for custom table finders |
| **PyMuPDF** | AGPL | Words/lines/paths with bboxes | autoConst `build` step |
| **Session `GraphSpan` + segments** | Apache-2.0 | OpenTakeoff native representation | **(in repo)** shared path |

### Layer 2 — Table / schedule grid detection

Priority order for **construction schedules** (bordered + borderless):

| Tool | License | Mode | Best for | OpenTakeoff fit |
|---|---|---|---|---|
| **OpenDataLoader-PDF** | Apache-2.0 | Rule + optional hybrid (Docling) | Multi-tier headers, complex merges, 47-col AHU grids | **(in repo)** — extend coverage, don’t rewrite |
| **Camelot** 2.x | MIT | `lattice` (ruled) / `stream` (whitespace) / optional `ml` (TATR + PDF text fill) | Bordered spec/schedule tables; confidence scores | Sidecar validator or fallback when sheetgraph misses |
| **pdfplumber** `.extract_tables()` | MIT | Coordinate-driven | Borderless / irregular columns | Good for 013-style header+row grids |
| **gmft** | MIT | Microsoft Table Transformer (TATR) | Implicit structure, merged cells; ~10× faster than unstructured on CPU | Fallback for borderless valve/BAS grids |
| **tablers** | MIT | Rust + pdfium | Ruled grids, fast | Batch corpus pre-pass |
| **sheetgraph `extractAllTables`** | Apache-2.0 | Custom geometric | Quarter-turned sheets, equipment schedules | **(in repo)** — primary |

**Hybrid strategy (recommended):**

1. **Primary:** sheetgraph geometric + ODL on hard pages (current shared path).
2. **Fallback A:** pdfplumber stream table on pages where ODL/sheetgraph return 0 HVAC
   tables but pdf.js text hits `VALVE SCHEDULE|POINTS LIST|I/O LIST`.
3. **Fallback B:** Camelot `lattice` on pages with visible grid lines (detect via line
   segment density in Session segments).
4. **Fallback C:** gmft/TATR only for pages that fail A+B **and** pass vector-text gate
   (not scanned-only — GOAL policy).

All fallbacks must emit **`ScheduleTable`-compatible** rows into the same graph slot ODL
uses today — one adapter pattern, not a parallel MCP-only fork.

### Layer 3 — Plan symbols, tags, and linear quantities

| Tool | License | Role | Notes |
|---|---|---|---|
| **OpenTakeoff `sweep_schedule_row` / inline motifs** | Apache-2.0 | Tag text search on plan sheets | **(in repo)** Pillar B/D |
| **MEPdetect** | AGPL | YOLO11 symbols + **vector** circuit trace | Electrical-first; vector path is the model |
| **YOLOplan** (DynMEP) | AGPL | YOLO11 MEP symbol detection | HVAC/electrical counts; custom training |
| **OpenConstructionERP CV pipeline** | Apache-2.0 | YOLOv11 + PaddleOCR PDF takeoff | Reference architecture for integrated ERP |
| **ConstructDrawingAI** | (see repo) | L0–L4 detection + connectivity graphs | Research-grade multi-discipline |
| **autoConst-drawing-takeoff** | (see repo) | PyMuPDF index + SQLite + schedule pages | Closest “estimator brain” OSS — vector text DB |
| **Kamai-class duct LF** | — | Coordinate polyline measure | **Out of scope** (GOAL duct-LF deferred) |

For Pillar C valves/BAS: **schedule row extraction (Layer 2) is the blocker**, not symbol
YOLO. Symbol detectors matter for Pillar D plan counts and reconcile paints.

### Layer 4 — Reconcile, cites, QA

| Tool | License | Role | Notes |
|---|---|---|---|
| **OpenTakeoff `reconcileWorkflow`** | Apache-2.0 | MATCH / SCHEDULE_ONLY / PLAN_ONLY | **(in repo)** |
| **iBeam-style mismatch surfacing** | — | Product pattern: flag schedule∖plan | Already Pillar B charter |
| **autoConst `check` / sanity** | — | Cross-check dims vs building envelope | Pattern for refuse/disclose |

### Layer 5 — Classification (thin — regex is allowed **here only**)

| Signal | Use |
|---|---|
| Table **title** text (when present) | Primary family hint |
| **Header row** token sets (`TAG`, `GPM`, `Cv`, `SERVED`, `AI`, `AO`, `BI`, `BO`) | Untitled table family inference (013 fix belongs here) |
| **Mark shape** (`CV-\d`, `VAV-\d`, `EF-\d`) | Row admission per family |
| Column **role map** (`columnMapFor`) | Contractor columns |

**Not sufficient alone:** title regex without Layer 2 rows (current 70-set failure mode).

---

## 5. Reference OSS “full stack” compositions

### 5.1 Deterministic MEP schedule takeoff (closest to OpenTakeoff GOAL)

```
pdf.js Session load (L0)
  → GraphSpan + segments (L1)
  → [optional] SAHI tiles for huge plan pages (L1.5)
  → sheetgraph.extractAllTables + ODL adapter (L2)
  → [fallback] pdfplumber/Camelot/gmft → ScheduleTable adapter (L2 spatial join)
  → corpusTakeoff header/mark classify + Pydantic sanitize (L5)
  → sweep_schedule_row plan join (L3)
  → [optional] Shapely+NetworkX topology context (L3.5)
  → reconcileWorkflow + cross-source dedup (L4)
  → structured JSON + bbox cites
  → [raster-only disclose path] local VLM crop assist (L4.5 — not scored)
```

**Repos to study/implement against:**

| Project | URL | Why |
|---|---|---|
| OpenDataLoader-PDF | https://github.com/opendataloader-project/opendataloader-pdf | **Already integrated** — extend page coverage |
| autoConst drawing takeoff | https://github.com/Jacobslh/autoConst-drawing-takeoff-claude | PyMuPDF → SQLite; schedule page detection |
| gmft | https://github.com/conjuncts/gmft | TATR fallback for borderless grids |
| Camelot | https://github.com/camelot-dev/camelot | Ruled schedule lattices + confidence |
| pdfplumber | https://github.com/jsvine/pdfplumber | Layout debugger for failed sets |

### 5.2 Symbol + circuit takeoff (Pillar D depth)

```
PDF → vector path (MEPdetect) OR YOLOplan detect
  → tag counts + optional netlist
  → reconcile to schedule tags (shared OpenTakeoff join)
```

| Project | URL | License |
|---|---|---|
| MEPdetect | https://github.com/DynMEP/MEPdetect | AGPL |
| YOLOplan | https://github.com/DynMEP/YOLOplan | AGPL |
| OpenConstructionERP | https://github.com/openbim/OpenConstructionERP | Apache-2.0 |

**License note:** AGPL sidecars (MEPdetect, YOLOplan, PyMuPDF) require careful deployment
if networked as a service — prefer **batch offline corpus tools** or MIT/Apache components
(ODL, gmft, Camelot, pdfplumber, Aspicio) on the shared path.

### 5.3 Agent-native CAD/PDF engine

| Project | URL | Notes |
|---|---|---|
| Aspicio | https://github.com/frontsail-ai/aspicio | MIT; MCP + HTTP API; DXF + vector PDF |
| OpenTakeoff MCP | **(in repo)** | 40 tools; Session pipeline |

---

## 6. Root-cause map for 70 compile-zero valve sets

| Bucket | ~Count | Failure layer | Fix class |
|---|---:|---|---|
| `[ZERO]` — almost no tables in graph | ~24 | **L1/L2** extraction | ODL on more sheets; multipart rejoin graph build; pdfplumber/Camelot fallback pages |
| HVAC tables but 0 valve rows | ~46 | **L2/L5** untitled or mis-titled | Header+mark classification; admit `CV-*` via column shape; blank-title `ScheduleTable.title` inference |
| PDF text hits tabular schedule language, compile 0 | 17 | **L2** (subset of above) | Targeted fallback on pages with schedule keywords + grid evidence |

**Wrong fix:** expand `titleRe` only.  
**Right fix:** ensure valve schedule **grids exist in `graph.tables`**, then classify by
**header geometry + mark patterns**.

---

## 7. Recommended implementation order (shared path)

When Pillar C resumes — **this order, no regex-first shortcuts:**

1. **Table recall audit** — per compile-zero set: count `graph.tables` by kind; list pages
   with schedule keywords vs extracted tables (extend `pillarCDepthZeroFloor.mjs`).
2. **ODL coverage expansion** — run ODL on pages/sheets where sheetgraph returns thin tables
   (reuse `opendataloader.ts`; no ODL rewrite per NEXT_GOAL_LOOP).
3. **ScheduleTable fallback adapter** — pdfplumber or Camelot → same types ODL adapter uses;
   gate on vector-text + line density; unit tests on 013, 058, 019 negatives.
4. **Untitled table classifier in sheetgraph/corpusTakeoff** — header token sets + mark
   `keyRe` from column 0; **not** title-only `uniqueFamily()`.
5. **Re-run** `pillarCValvePdfTextScan.mjs` + compile census; measure **graph.tables with
   valve marks**, not compile alone.
6. **Pillar B reconcile** unchanged — joins only after rows exist.

---

## 8. Explicit non-answers (do not pursue as primary engine)

| Approach | Why not |
|---|---|
| Regex on PDF text scan | Proves signal exists; does not extract row/column structure |
| LLM reading schedules | Violates GOAL deterministic mandate |
| Raster OCR / vision-first | Out of scope unless user reopens; wrong physics for vector-dense Vol2 |
| Per-set hardcodes | Violates set-agnostic rule |
| Scoring by weakening keys | PROGRESS policy #7 |

---

## 9. Success criteria for “engine fixed”

Replace “compile row count” with **geometry-backed metrics**:

| Metric | Target |
|---|---|
| Valve-bearing sets with ≥1 **extracted** valve/damper schedule table in graph | 81/81 (or honest refuse with evidence) |
| Sets with `control_valves` compile rows | Should track extracted tables, not precede them |
| Every compile row has **cell bbox cite** | Already required — keep |
| Reconcile MATCH/SCHEDULE_ONLY | Pillar B — after extraction |

---

## 10. References

- Kamai: https://kamai.io/learn/ai-construction-takeoff , https://kamai.io/blog/how-to-do-mechanical-and-hvac-takeoffs , https://kamai.io/blog/how-construction-pdf-takeoff-api-works
- Trimble MEP AI (2026): https://news.trimble.com/New-Trimble-AI-Takeoff-Capabilities-Cut-MEP-Estimating-Time-and-Increase-Accuracy
- iBeam schedule reconciliation: https://www.ibeam.ai/insight/the-schedules-on-a-drawing-set-that-hold-the-real-quantities
- OpenDataLoader-PDF: https://github.com/opendataloader-project/opendataloader-pdf
- Camelot comparison matrix: https://camelot-py.readthedocs.io/en/latest/user/comparison.html
- gmft: https://github.com/conjuncts/gmft
- MEPdetect: https://github.com/DynMEP/MEPdetect
- YOLOplan: https://github.com/DynMEP/YOLOplan
- autoConst: https://github.com/Jacobslh/autoConst-drawing-takeoff-claude
- Aspicio: https://github.com/frontsail-ai/aspicio
- OpenTakeoff sheetgraph ODL adapter: `opentakeoff/web/src/lib/sheetgraph.ts` (~7327)
- Pillar C PDF audit: `opentakeoff/mcp/scripts/pillarCValvePdfTextScan.mjs`
