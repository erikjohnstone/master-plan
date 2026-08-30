# D08 — FCU quantities across buildings

Status: `LOCKED — API 5/5 + stdio + UI proof (expandable cards + verified follow-up)`

## Live question

> Compare scheduled fan-coil quantities across Air Ops, MITRACON, and the
> ATCT. Give the set total and each building's count from the FAN COIL UNIT
> SCHEDULE — use the schedule title-scan building splits (A / M / T), and do
> not double-count reused local tag namespaces across buildings. For FCU-A1,
> FCU-M1A, and FCU-T1 give type and CFM from that schedule and cite the MARK
> cells so I can spot-check each building.

## Follow-up (required for lock)

> How many MITRACON fan coils are scheduled? Is FCU-T11 on the ATCT
> schedule, and what CFM does it list?

## Why this is hard

`navfac-cherry-point-atc` (75 sheets) reuses local FCU mark suffixes across
Air Ops / MITRACON / ATCT. Correct totals come from one FAN COIL UNIT
SCHEDULE title-scan with `building_tag_counts` (A=14, M=10, T=18) — not from
summing continuation pages or treating `FCU-1`-style collisions as one unit.

## Proven answer (ground truth — before model runs)

| Field | Value |
|---|---|
| FCU set total | 42 |
| Air Ops (A) | 14 |
| MITRACON (M) | 10 |
| ATCT (T) | 18 |
| FCU-A1 | VERTICAL CABINET · 150 / 150 CFM · #42 |
| FCU-M1A | SUSPENDED HORIZONTAL DUCTED · 600 / - · #45 |
| FCU-T1 | SUSPENDED HORIZONTAL CABINET · 230 · #48 |

Follow-up: MITRACON **10**; FCU-T11 on ATCT; CFM **220**.

20% hand-count: 9/9 sample MARKs on schedule (`hand_count_20pct`).

`fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 5.186 s |
| 2 | fresh session | 2.585 s |
| 3 | fresh session | 2.778 s |
| 4 | fresh session | 3.688 s |
| 5 | forced cold | 3.143 s |

Nearest-rank p95 (cold): **5.186 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`) after rebuilding `dist/`. See
`local-host-run.json` (verify clean). The Vite UI path was proved separately
with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d08_ui_prompt_answer_cards_followup_2026-08-30T15-38-13-794Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first FCU takeoff
(42 / A14 / M10 / T18 + FCU-A1/M1A/T1 type·CFM), expandable source cards,
and a correct in-thread follow-up (MITRACON 10 + FCU-T11 CFM 220). Harness:
`opentakeoff/web/scripts/demo-ui-proof-d08.mjs`.
