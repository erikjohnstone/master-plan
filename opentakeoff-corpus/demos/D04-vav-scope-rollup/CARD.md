# D04 — VAV scope rollup

Status: `LOCKED — API 5/5 + stdio + UI re-proof (expandable cards + verified follow-up)`

## Live question

> How many VAV boxes are on the volume control box schedule, and what are the
> supply CFM, heating CFM (EAT CFM), GPM, manufacturer, and model for VAV-1,
> VAV-12, VAV-30, and VAV-58? Cite each TAG and its CFM cell so I can
> spot-check the schedule — do not treat every plan label as an extra
> scheduled unit.

## Follow-up (required for lock)

> Is SUITE100 a scheduled VAV on that volume control box schedule? What is
> VAV-58 supply CFM?

## Why this is hard

The federal mechanical set packs 58 scheduled VAV-* tags on the
`VOLUME CONTROL BOX SCHEDULE` while plan sheets carry hundreds of fragmented
`VAV-` labels. Rollup must use the schedule title-scan / family-key count —
not plan-label frequency — and must exclude junk remarks keys like
`SUITE100` that ride into the same table without a TAG identity.

## Proven answer

| Field | Value | Source |
|---|---|---|
| VAV count | 58 | VOLUME CONTROL BOX SCHEDULE (VAV-* keys; SUITE100 excluded) |
| VAV-1 | CFM 350 / EAT 550 / GPM 1.1 / PRICE / SDV | schedule row |
| VAV-12 | CFM 300 / EAT 300 / GPM 0.9 / PRICE / SDV | schedule row |
| VAV-30 | CFM 150 / EAT 150 / GPM 0.5 / PRICE / SDV | schedule row |
| VAV-58 | CFM 350 / EAT 450 / GPM 1.1 / PRICE / SDV | schedule row |

Follow-up: **SUITE100 is not a scheduled VAV** (`family_mark=false`, REMARKS
identity); **VAV-58 supply CFM = 350**.

`truth.json` records typed values, citations, 20% hand-count reconciliation,
and the follow-up expectations. `fixture.json` pins the external source PDF
by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 3.486 s |
| 2 | fresh session | 3.535 s |
| 3 | fresh session | 3.438 s |
| 4 | fresh session | 2.996 s |
| 5 | forced cold | 3.053 s |

Nearest-rank p95: **3.535 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`). See `local-host-run.json`. The Vite UI
path was proved separately with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d04_ui_prompt_answer_cards_followup_2026-08-30T11-28-54-597Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first VAV rollup
(58 + requested attributes), expandable source cards with structured titles
(`VAV-1 · CFM = 350` + Details dropdown), on-sheet TAG/CFM paints, and a
correct in-thread follow-up rejecting SUITE100 while reporting VAV-58 CFM
350. Harness rejects empty answers, plan-label rollups, naked fragment-only
cards, and wrong follow-ups. Re-proved 2026-08-30 under the chat-usefulness
bar (answer-first + expandable cards + verified follow-up visible).

UI/API path fixes that cleared this gate are generalized production behavior
(family-key junk filter + `family_mark`; keep full `all_cells` on row_key
lookups; paint-thrash answer nudge; Cite-each-TAG target fallback; reject
affirming junk remarks keys as scheduled family units; schedule-count title
citations; expandable Agent source cards; enrich `highlight_citation` from
prior query cells for structured card labels).
citations) — not demo-PDF special cases.

## Failure behavior

Classified misses before lock: plan-label frequency (~371) instead of schedule
count 58; stripping CFM/GPM from compacted row_key results; paint thrash with
no Answer; affirming SUITE100 as a scheduled VAV because a remarks row exists;
stdio count citations pointing at TAG cells instead of the title region.
Production tooling now rejects those shapes. Missing evidence still returns an
explicit refusal rather than a fabricated value.

## Regression

From `opentakeoff/mcp`:

```bash
node --import tsx --test test/demoD04.regression.test.mjs
npm run verify:demo -- ../../opentakeoff-corpus/demos/D04-vav-scope-rollup/truth.json ../../opentakeoff-corpus/demos/D04-vav-scope-rollup/runs/run-1.json
```

The first command validates the real pinned PDF through the production engine.
The second rechecks an accepted model run through the reusable OCR verifier.
