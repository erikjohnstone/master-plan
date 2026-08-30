# D06 — Control / bypass valve takeoff

Status: `LOCKED — API 5/5 + stdio + UI proof (expandable cards + verified follow-up)`

## Live question

> Take off the hot-water reheat CONTROL VALVE SCHEDULE and the BYPASS CONTROL VALVE SCHEDULE: how many valves are on each schedule? For CV-1, CV-5, and CV-9 give flow GPM, size, served coil mark, and installed plan quantity from a tagged sweep. Do the same installed quantity plus GPM and size for BCV-1. Cite the schedule title regions for the counts, the FLOW/SIZE cells for the named valves, and the plan tag hits for installed quantities.

## Follow-up (required for lock)

> Is BCV-1 a reheat coil control valve or a bypass valve? What fluid and flow GPM does its schedule row list?

## Why this is hard

`itd-d1-lab` (29 sheets) carries a dense real valve vocabulary: pressure-
independent air valves, HW reheat control valves CV-1..9, and bypass valve
BCV-1. The slate's CHW label is adapted to the set's actual HW reheat +
bypass schedules (no dedicated CHW control-valve schedule). Installed
quantities require `sweep_schedule_row`; plan tags are often exploded
across pdf.js spans (`CV` + `1`), so `find_text("CV-1")` alone is
insufficient. Sheets are uncalibrated so scale-dependent measure paths must
refuse honestly.

## Proven answer (ground truth — before model runs)

| Field | Value |
|---|---|
| CV schedule count | 9 |
| BCV schedule count | 1 |
| CV-1 GPM / size / coil | 9 / 1-1/4" / HC-1 |
| CV-5 GPM / size / coil | 2 / 3/4" / HC-5 |
| CV-9 GPM / size / coil | 4.4 / 1" / HC-9 |
| Installed qty CV-1/5/9/BCV-1 | 1 / 1 / 1 / 1 |
| BCV-1 GPM / size | 25 / 2.0 |

Follow-up: BCV-1 is the **bypass** valve; fluid **100% WATER**; GPM **25**.

`fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 10.992 s |
| 2 | fresh session | 10.671 s |
| 3 | fresh session | 11.034 s |
| 4 | fresh session | 10.611 s |
| 5 | forced cold | 11.456 s |

Nearest-rank p95 (cold): **11.456 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`) after rebuilding `dist/`. See
`local-host-run.json` (verify clean). The Vite UI path was proved separately
with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d06_ui_prompt_answer_cards_followup_2026-08-30T13-07-47-686Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first CV/BCV
takeoff (schedule counts 9/1, CV-1/5/9 + BCV-1 GPM/size/coil/qty with plan
tag cites on #5/#7), expandable source cards, and a correct in-thread
follow-up (bypass / 100% WATER / 25 GPM). Harness:
`opentakeoff/web/scripts/demo-ui-proof-d06.mjs`.

UI/API path fixes that cleared this gate are generalized production
behavior — not demo-PDF special cases:

- `compactToolResult` / agentLoop `resultText` must not treat
  `sweep_schedule_row`'s `sheets` array as `sheet_graph` (that stripped
  `found`/`tag_citations` and caused honest refusals).
- Large sweeps compact by dropping empty plan-sheet audit rows while
  keeping count evidence.
- Demo provenance repair covers scoped `*_installed_quantity` fields so
  schedule MARK cells cannot substitute for plan tag cites.

## Failure behavior

Classified misses before lock: tool compaction stripping sweep evidence →
all-N=5 refusals; one API run skipped CV-9 sweep and reused a CV-1 cite;
stdio once cited schedule MARK cells on #13 for installed qty until
scoped provenance repair rejected them.

## Regression

`opentakeoff/mcp/test/demoD06.regression.test.mjs` — schedule row counts,
CV/BCV attribute cells, and tagged_only sweeps for CV-1/5/9/BCV-1.
