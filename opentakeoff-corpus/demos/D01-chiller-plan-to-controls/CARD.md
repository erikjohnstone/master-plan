# D01 — Chiller plan to controls

Status: `LOCKED — API 5/5; UI re-proved under usefulness bar (full row values + answering-cell paints)`

## Live question

> Find CH-A1 on the drawings and give me its installed quantity, cooling
> capacity, entering and leaving water temperatures, design flow, and the
> matching chilled-water control valve with its flow, size, configuration, and
> Cv. Show me the plan location and cite the exact schedule cells you used.

## Why this is hard

The real NAVFAC Cherry Point set has 75 sheets and independent Air Operations,
MITRACON, and ATCT equipment namespaces. This answer joins the CH-A1 placement
on MS101 to the chiller and CHW valve schedules on M-603. It must distinguish
CH-A1 from adjacent CH-A2 and select `CV-CH-A1` from a dense control-valve
schedule without inventing a relationship or reusing the wrong cell bbox.

## Proven answer

| Field | Value | Source |
|---|---:|---|
| Installed quantity | 1 | MS101 plan tag |
| Capacity | 56.0 tons | M-603 chiller schedule |
| Entering / leaving water | 55.4°F / 45°F | M-603 chiller schedule |
| Design flow | 128.5 GPM | M-603 chiller schedule |
| Matching valve | CV-CH-A1 | M-603 CHW valve schedule |
| Valve flow / size | 128.0 GPM / 4 in | M-603 CHW valve schedule |
| Configuration / Cv | 2-WAY / 324.0 | M-603 CHW valve schedule |

`truth.json` records the independently authored typed values, exact source
regions, and tolerances. `fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Source index | Values | Resolvable | OCR grounded | Live latency |
|---:|---|---:|---:|---:|---:|
| 1 | forced cold | 10/10 | 10/10 | 10/10 | 2.886 s |
| 2 | fresh session | 10/10 | 10/10 | 10/10 | 3.988 s |
| 3 | fresh session | 10/10 | 10/10 | 10/10 | 3.114 s |
| 4 | fresh session | 10/10 | 10/10 | 10/10 | 2.750 s |
| 5 | forced cold | 10/10 | 10/10 | 10/10 | 2.879 s |

Nearest-rank p95: **3.988 seconds**. Gate: **5/5 clean**.

Every run records the raw model responses, request IDs, model/version,
complete production tool payloads, citations, source-index setup latency, and
live prompt latency under `runs/`.

## Local-host proof

The production bundle was built and launched as a separate local stdio MCP
process. `local-host-run.json` records `transport: "stdio_local_process"`,
10/10 correct values, 10/10 resolvable citations, 10/10 OCR-grounded citations,
and 3.449-second live latency.

The validated production-UI proof is saved as
`/opt/cursor/artifacts/d01_ui_prompt_tools_answer_highlights_2026-08-30T05-09-16-177Z.webm`.
Re-proved under the usefulness bar: frozen prompt, live tools, complete
truth-matching answer (installed qty, 56.0 tons, 55.4/45°F, 128.5 GPM,
CV-CH-A1 with 128.0 GPM / 4 in / 2-WAY / 324.0 Cv), plan tag on MS101, and
**answering value cells** on M-603 (chiller capacity/temps/flow + valve
flow/size/config/Cv) — not mark-only flybys. Automated check: **12 painted
regions**. Harness requires ≥5 paints and visible highlights on plan +
schedule sheets. Gates remain methodology-general.

## Failure behavior

Development runs exposed and classified malformed JSON, wrong JSON field
types, schedule citations substituted for plan citations, incorrect semantic
identity columns, reused row-level bboxes, and latency polluted by ingestion
setup. The production runner now rejects those response-shape and provenance
errors before accepting a run. Missing evidence still returns an explicit
refusal rather than a fabricated value.

## Regression

From `opentakeoff/mcp`:

```bash
node --import tsx --test test/demoD01.regression.test.mjs
npm run verify:demo -- ../../opentakeoff-corpus/demos/D01-chiller-plan-to-controls/truth.json ../../opentakeoff-corpus/demos/D01-chiller-plan-to-controls/runs/run-1.json
```

The first command validates the real pinned PDF through the production engine.
The second rechecks an accepted model run through the reusable OCR verifier.
