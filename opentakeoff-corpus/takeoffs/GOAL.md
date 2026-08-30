# /takeoff — Full HVAC/BAS Quantity Takeoff (N=5 Validated)

**Active goal.** Name: `takeoff`.  
Prior demo-suite goal archived at `goals/ARCHIVED_D01_D10_DEMO_SUITE.md`.

## Mission

Produce a complete takeoff — every countable or measurable HVAC/BAS item on
every page, no sampling — scoped to what that set actually contains. A set is
not done until it clears **five runs**, each independently passing **five
gates**, and the deliverable is **Run 5's output only**.

**This corpus records exactly two locked takeoffs:**

| ID | Kind | Set | Status |
|---|---|---|---|
| `T-HVAC-01` | HVAC equipment quantity takeoff | `navfac-cherry-point-atc` | `LOCKED` |
| `T-BAS-01` | BAS / DDC points takeoff | `navfac-cherry-point-atc` | `LOCKED` |

No additional takeoff IDs without an explicit goal change.

## Industry-standard EXCEPTIONAL takeoff (non-negotiable)

A takeoff is **not** chat scrap, partial Agent evidence crawls, blank Status
columns, or an “evidence row” dump. It is the finished commercial document a
seasoned MEP / controls contractor would accept for bidding, procurement, and
field use — structured rows and columns whose associated data make sense.

**Locked totals on this set:** HVAC **396** scheduled equipment tags · BAS
**122** extractable points-list rows. The Takeoff UI Takeoff tab must land on
those finished quantities via `compile_corpus_takeoff` (Session+ODL). Exploratory
`find_schedule` / `query_table` crawls are audit/Workflow data only — they are
**not** the takeoff.

### HVAC equipment (mechanical schedule / estimating workbook bar)

Aligned with US MEP practice (equipment schedules; MasterFormat 23 06 00
“Schedules for HVAC”; estimating workbooks keyed by mark):

- Grouped by schedule family (AHU, FCU, VAV, chiller, boiler, pump, …) — never
  one giant sparse table padded with empty columns.
- **One row per equipment tag.**
- Columns that earn their place for that family: Tag, Qty, Unit,
  Description/Service when present, sheet cite, plus type-appropriate technical
  fields from the drawing schedule (air-side: CFM / ESP / capacity / volts-phase;
  pumps: GPM / head; valves: Cv / size; etc.).
- Building splits where schedules support them (Air Ops / MITRACON / ATCT).
- Rollup: per-category counts + set total reconciled to `truth.json`.
- CSV / Excel / PDF export a contractor can open without explanation.

### BAS / DDC points (controls points list / I/O schedule bar)

Aligned with controls practice (points lists; ASHRAE Guideline 13–style I/O
counting; instrument-index discipline):

- Grouped by extractable POINTS LIST / DDC POINTS LIST title.
- **One row per point mark.**
- Columns: Point tag, Point type (AI / AO / BI / BO), Description, Qty, Unit,
  sheet cite, plus schedule fields present on the drawing (alarm / trend when
  extractable).
- Per-list and overall AI/AO/BI/BO rollups + overall row total.
- Disclose non-extractable title-only lists — never invent counts.

### UI honesty

- New-user path: upload PDF → Agent frozen prompt → Run → Takeoff panel shows
  the **literal compiled takeoff** (396 / 122), not partial scrap.
- No seed cheats; no programmatic compile as the demo path.
- Blank or meaningless columns are bugs — iron them out.
- Do not idle on long shell waits; diagnose graph/compile stalls immediately.

## Non-negotiables

1. Ground truth authored **before** run 1, by hand, from the drawings — never
   backfilled from a model.
2. Truth is never edited to match a result. A genuine truth correction is a
   logged, justified `CHANGELOG.md` event and resets validation to **0/5**.
3. No cherry-picking. All 5 runs must independently clear all 5 gates.
   4/5 is a fail → diagnose → restart at 0/5.
4. No patching a run mid-stream. Fix the **system**, then restart from run 1.
5. Prompt frozen once validation starts. Changing it resets the count.
6. Only real US HVAC/BAS construction-document scope — nothing invented.
7. "In full" means full coverage of every present category on that set.
8. **No subagents.** Do not use Cursor Task/subagent tools (explore, generalPurpose,
   computerUse, debug, best-of-n, etc.) for this goal. The primary agent does all
   work directly — inventory, truth, gates, N=5, export, UI demos, regressions.
   **UI demo videos** are recorded by the primary agent with **Playwright** (not
   computerUse).
9. **Set-agnostic production path.** `compile_corpus_takeoff` must not hardcode a
   blueprint, sheet ID, or project-specific count. Locked truth/N=5 records remain
   set-scoped by design; family extractors use reusable US MEP schedule/list
   title patterns. **NAVFAC is the hard case** — if MCP and UI both clear N=5
   there with the same deterministic answers, the same path must work on smaller,
   less complex blueprints without per-set tuning.
10. **Both surfaces must clear N=5** (see UI requirement). MCP/API and Takeoff UI
    each independently pass N=5 against the same truth; UI must be deterministic.
11. **Shared-path gate (every edit).** Before any code addition, removal, or
    change, ask: *Should this be on the shared path?* If **yes**, implement it
    once for UI+MCP (Session / shared `web/src/lib` module) — no forks. If
    **no**, keep it surface-specific. Shared = anything that decides schedule
    truth or answers “what’s on the schedules / how many / where.” Default to
    shared when unsure.
12. **Industry-standard exceptional output.** Takeoff UI + exports must meet the
    quality bar in “Industry-standard EXCEPTIONAL takeoff” above. Partial Agent
    scrap in the Takeoff tab is a fail for demos and for “done.”
## Ground-truth harness (per takeoff)

Before any run, produce `truth.json`:

- Every expected item by category: tag/ID, spec, quantity, unit, sheet/region
- Explicit tolerance per field
- Independent hand-count of **≥25%** of each category, reconciled
- One-line provenance per category

Harness is versioned. Post-start edits → `CHANGELOG.md` + reset to 0/5.

## The five gates (every run, in order)

1. **Quantity accuracy** — counts and rollup parts match truth (+ technical data)
2. **Citation resolvability** — sheet / region / non-degenerate on-page bbox
3. **Citation groundedness** — **vector PDF text** under the bbox (not OCR /
   not eyeball) matches the counted item
4. **Completeness** — every page accounted for; empty pages explicit; no dupes
5. **Interrogation** — live adversarial cross-exam (spot-check, negative-space,
   consistency, false-premise probe, edge-case defense)

## N=5 protocol

Freeze prompt + harness → five independent full runs (cold on ≥ run 1 and 5)
→ all must pass gates 1–5 → archive **Run 5** as canonical. On any failure:
classify (`TRUTH_GAP` / `COVERAGE` / `DUPLICATE` / `VALUE` / `CITE_FORM` /
`CITE_GROUND` / `INTERROGATION`), fix system, restart at run 1.

## Canonical output — Run 5 only

CSV/Excel workbook from Run 5 exclusively:

- One tab per category present
- One row per item (tag, description, size/spec, qty, unit, sheet, citation)
- Rollup summary reconciled to `truth.json`
- Interrogation log (Gate 5 Q&A)

Workbook must reconcile exactly to truth or the takeoff is not locked.

## UI requirement

Output must be available in the **Takeoff UI** where the literal takeoff
compiles (report / export surface), not only as files on disk.

**Both surfaces must clear N=5.** The MCP/API compile path and the Takeoff UI
compile path each independently run the N=5 protocol (cold on ≥ run 1 and 5)
against the same frozen `truth.json` and Gates 1–5. UI answers must be
**deterministic** — same quantities and cites on every cold run, not a
different answer each time. If UI drifts from MCP (or from truth), fix the
**system** (shared compiler / sheet-graph parity, including the same ODL
enhancement MCP uses), then restart that surface at 0/5. A takeoff is not
`LOCKED` until **both** MCP N=5 and UI N=5 pass.

**Hard-case rule:** NAVFAC proves the path. Smaller / less complex blueprints
must work with that same set-agnostic compiler — no per-set special cases.

**Shared production graph:** UI, API, and MCP must consume the same Session
pipeline (`buildSheetGraph` + `enhanceTablesWithODL`). Entry points may differ
(browser vs server); extraction must not. Geometric-only UI graphs are a
parity bug, not an acceptable production mode for schedule/takeoff answers.

## Follow-on (after UI↔MCP parity is LOCKED)

**Background graph prewarm on upload.** Once both surfaces clear N=5 on the
shared path:

1. Upload still opens the canvas immediately and keeps the eager **text** index.
2. Kick an async prewarm of `Session.graphForPipeline()` (geometric + ODL) for
   every loaded blueprint — do not block “file dropped → sheet visible”.
3. Cache that graph; agent / `sheet_graph` / `compile_corpus_takeoff` use it.
4. Surface a non-blocking “schedules indexing…” state; never silently fall
   back to geometric-only for quantity/cite answers.

**Unify schedule-query tools on Session.** Graph + compile + `query_table` are
shared (`web/src/lib/queryTable.mjs` used by MCP tools and Takeoff UI;
`ensureAgentGraph` prefers Session+ODL). Remaining follow-ons: proxy or extract
`count_marks` / `sweep_schedule_row` the same way (plan-geometry tools that still
have dual implementations).

**Background graph prewarm on upload** (after query parity for plan tools):

1. Upload still opens the canvas immediately and keeps the eager **text** index.
2. Kick an async prewarm of `Session.graphForPipeline()` (geometric + ODL).
3. Cache that graph; agent / compile use it.
4. Non-blocking “schedules indexing…”; never silent geometric-only for cites.

## Regression tests

Each locked takeoff (`T-HVAC-01`, `T-BAS-01`) gets engine + export regression
tests that fail loudly if quantities, citations, or export shape drift.

## Lifecycle

`NOT STARTED` → `TRUTH BUILT` → `VALIDATING n/5` → `LOCKED` → `REGRESSED`

## Layout

```text
opentakeoff-corpus/takeoffs/
  GOAL.md                 # this file
  SLATE.md
  T-HVAC-01-<slug>/
    CARD.md
    prompt.txt
    truth.json
    CHANGELOG.md
    failures.md
    fixture.json
    runs/                 # local dumps (gitignored pattern as demos)
    export/               # Run 5 canonical workbook
    interrogation/        # Run 5 Gate 5 transcript
  T-BAS-01-<slug>/
    …same…
```
