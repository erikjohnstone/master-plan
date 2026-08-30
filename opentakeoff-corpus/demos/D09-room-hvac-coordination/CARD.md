# D09 — Room-oriented HVAC coordination

Status: `LOCKED — API 5/5 + stdio + UI proof (expandable cards + verified follow-up)`

## Live question

> Build a room-oriented HVAC coordination package for Conference room 105.
> From the ROOM FINISH SCHEDULE give the room name and floor finish. From the
> DIFFUSER-GRILLE SCHEDULE list CD-1, RG-1, and EG-1 with service,
> manufacturer, and model. From the packaged rooftop schedule, which RTU
> serves MAIN OPERATIONS and what supply CFM does it list? Cite the room 105
> NUMBER cell, the CD-1 EQUIP NO cell, and the RTU-1 EQUIP NO cell.

## Follow-up (required for lock)

> What is room 101 named on the finish schedule? Which RTU serves BUILDING
> SOUTH and what supply CFM does it list?

## Why this is hard

Baker County EOC (65 sheets) splits architectural room finishes (#27) from
mechanical air-device and rooftop schedules (#41). A useful coordination
package must join both disciplines — not stop at a single schedule lookup.

## Proven answer (ground truth — before model runs)

| Field | Value |
|---|---|
| Room 105 | CONFERENCE · floor CPTT-1 |
| CD-1 | SUPPLY DIFFUSER · TITUS / MCD |
| RG-1 | RETURN GRILLE · TITUS / 50F |
| EG-1 | EXHAUST GRILLE · TITUS / 350FL |
| MAIN OPERATIONS RTU | RTU-1 · 1650 CFM |

Follow-up: room 101 = **HALLWAY**; BUILDING SOUTH = **RTU-2** · **750** CFM.

20% room sample: 3/3 on finish schedule.

`fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 5.433 s |
| 2 | fresh session | 3.732 s |
| 3 | fresh session | 4.123 s |
| 4 | fresh session | 3.747 s |
| 5 | forced cold | 6.644 s |

Nearest-rank p95 (cold): **6.644 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`) after rebuilding `dist/`. See
`local-host-run.json` (verify clean). The Vite UI path was proved separately
with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d09_ui_prompt_answer_cards_followup_2026-08-30T15-53-38-297Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first room 105
coordination package (finish + CD/RG/EG + RTU-1), expandable source cards,
and a correct in-thread follow-up (room 101 HALLWAY + RTU-2 / BUILDING SOUTH /
750 CFM). Harness: `opentakeoff/web/scripts/demo-ui-proof-d09.mjs`.

Production note: schedule SERVICE cells answer named-service joins (MAIN
OPERATIONS / BUILDING SOUTH); LOCATION paraphrase into serves remains blocked.
