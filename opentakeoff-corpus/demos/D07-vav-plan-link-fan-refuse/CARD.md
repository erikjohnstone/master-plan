# D07 — VAV plan link + fan sweep refusal

Status: `LOCKED — API 5/5 + stdio + UI proof (expandable cards + verified follow-up)`

## Live question

> How many VAV boxes are on the AIR TERMINAL BOX SCHEDULE? For VAV-1, VAV-5,
> and VAV-9 give manufacturer, CFM, MBH, and kW from that schedule, and cite
> where each tag appears on the plan (use a tagged sweep — do not invent plan
> locations). Separately, for exhaust fans EF-1, EF-2, and EF-5: report
> schedule CFM, and either the plan tag location from sweep_schedule_row or
> an honest refusal when the tag is not drawn on any plan sheet.

## Follow-up (required for lock)

> Can EF-3 be located on a plan sheet with sweep_schedule_row? What CFM does
> its FAN SCHEDULE row list?

## Why this is hard

`bldg5406-hvac-demo` (20 sheets): AIR TERMINAL BOX SCHEDULE has
quarter-turned headers; VAV-1..9 plan tags live on #2. FAN SCHEDULE lists
EF-1..5, but EF-2/EF-3 have **no plan-sheet tag text** — sweep must refuse
geometric anchoring rather than inventing locations, while still reporting
schedule CFM.

## Proven answer (ground truth — before model runs)

| Field | Value |
|---|---|
| VAV schedule count | 9 |
| VAV-1 | TRANE / VCEF · 2170 CFM · 41.0 MBH · 12 kW · plan #2 |
| VAV-5 | TRANE / VCEF · 460 CFM · 8.5 MBH · 2.5 kW · plan #2 |
| VAV-9 | TRANE / VCEF · 85 CFM · 3.4 MBH · 1.0 kW · plan #2 |
| EF-1 CFM / plan | 165 / EF-1 on #2 |
| EF-2 CFM / plan | 400 / **refused** (no plan tag) |
| EF-5 CFM / plan | 80 / EF-5 on #2 |

Follow-up: EF-3 plan **refused**; CFM **300**.

`fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 43.737 s |
| 2 | fresh session | 39.904 s |
| 3 | fresh session | 39.045 s |
| 4 | fresh session | 37.935 s |
| 5 | forced cold | 39.820 s |

Nearest-rank p95 (cold): **43.737 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`) after rebuilding `dist/`. See
`local-host-run.json` (verify clean, 66 checks). The Vite UI path was proved
separately with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d07_ui_prompt_answer_cards_followup_2026-08-30T15-23-46-695Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first VAV/EF takeoff
(count 9, VAV-1/5/9 manufacturer/CFM/MBH/kW with plan tags on #2, EF CFMs
with EF-2 honest refusal), expandable source cards, and a correct in-thread
follow-up (EF-3 refused + CFM 300). Harness:
`opentakeoff/web/scripts/demo-ui-proof-d07.mjs`.

UI/API path fixes that cleared this gate are generalized production
behavior — not demo-PDF special cases:

- Evidence gate: when `sweep_schedule_row` refuses plan anchoring, keep
  reporting already-retrieved schedule cells for that tag (CFM, …) beside
  the honest refusal — do not drop schedule data.
- UI harness retries transient Cerebras 500/502 alongside 429/503.
