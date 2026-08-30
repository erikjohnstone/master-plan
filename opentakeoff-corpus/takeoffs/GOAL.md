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
8. **No subagents** for inventory, truth, gates, N=5, export, or regressions —
   the primary agent does that work directly. **Exception:** Cursor `computerUse`
   is allowed only to record the two required Takeoff UI demo videos (HVAC + BAS).
9. **Set-agnostic production path.** `compile_corpus_takeoff` must not hardcode a
   blueprint, sheet ID, or project-specific count. Locked truth/N=5 records remain
   set-scoped by design; family extractors use reusable US MEP schedule/list
   title patterns.

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
