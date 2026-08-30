# D05 — RTU mechanical to electrical connection

Status: `LOCKED — API 5/5 + stdio + UI proof (expandable cards + verified follow-up)`

## Live question

> For RTU-1 on the packaged rooftop schedule, give me the service,
> manufacturer, model, nominal tons, supply CFM, and min outside-air CFM.
> Then join it to the matching mechanical equipment connection schedule row
> (watch for zero-padded tag forms) and report VA, MCA, MOCP, voltage,
> phases, and circuit number. Cite the mech EQUIP NO cell, supply CFM cell,
> connection schedule NO. cell, and MCA cell so I can spot-check both sheets.
> Also note where RTU-1 appears on the roof plan.

## Follow-up (required for lock)

> Is RTU-2 on the connection schedule as RTU-02? What is its MCA and circuit
> number?

## Why this is hard

Baker County EOC is a 65-sheet cross-discipline bid set. Mechanical rooftop
schedule tags are `RTU-1` / `RTU-2` while the electrical
`MECHANICAL EQUIPMENT CONNECTION SCHEDULE` zero-pads them to `RTU-01` /
`RTU-02`. The unpadded mech tag has zero hits on the connection schedule.
MCA and MOCP sit in adjacent columns (33.0 vs 45 A for RTU-01) and must not
be transposed. ODL recovers the rooftop schedule with correct cell text but
wrong grid boxes; production snaps cite boxes onto painted pdf.js spans.

## Proven answer (ground truth — before model runs)

| Field | Value | Source |
|---|---|---|
| Service | MAIN OPERATIONS | packaged rooftop schedule #41 |
| Manufacturer / model | CARRIER / 48FE | #41 |
| Nominal tons | 5 | #41 |
| Supply CFM / min OA | 1650 / 330 | #41 |
| Connection tag | RTU-01 | connection schedule #60 |
| VA / MCA / MOCP | 11880 / 33.0 / 45 A | #60 |
| Voltage / phases | 208 / 3 | #60 |
| Circuit | C - 29,31,33 | #60 |
| Plan | RTU-1 on roof plan #39 | find_text |

Follow-up expected: RTU-2 ↔ RTU-02; MCA **24.0**; circuit **C - 32,34,36**.

`fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 3.317 s |
| 2 | fresh session | 3.144 s |
| 3 | fresh session | 2.794 s |
| 4 | fresh session | 3.079 s |
| 5 | forced cold | 2.913 s |

Nearest-rank p95: **3.317 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`) after rebuilding `dist/`. See
`local-host-run.json` (verify clean). The Vite UI path was proved separately
with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d05_ui_prompt_answer_cards_followup_2026-08-30T12-38-23-670Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first RTU mech↔elec
join (MAIN OPERATIONS / CARRIER / 48FE / 1650 / 330 / RTU-01 / MCA 33 /
circuit), expandable source cards, roof-plan RTU-1 on #39, and a correct
in-thread follow-up (RTU-02 / MCA 24.0 / C - 32,34,36). Harness:
`opentakeoff/web/scripts/demo-ui-proof-d05.mjs`.

UI/API path fixes that cleared this gate are generalized production behavior
(ODL cell bbox snap to pdf.js spans; drawing-text exact plan tags distinct
from schedule cells; prefer exact plan-tag over detail callouts; skip
USED GROUP / short-key identity thrash; vector find_text CITE_GROUND
fallback; enlarge tiny OCR crops) — not demo-PDF special cases.

## Failure behavior

Classified misses before lock: tall ODL grid boxes that failed OCR grounding;
plan label citing detail callout `RTU-1. TRANSITION TO UNIT` on #38 instead
of exact `RTU-1` on roof plan #39; drawing-text gate rejecting plan `RTU-1`
because the same string is a schedule EQUIP NO; occupancy USED GROUP keys
(`A-3` / `B`) substring-matching sheet ids and forcing junk answer dumps.
Production tooling now rejects those shapes. Missing evidence still returns
an explicit refusal rather than a fabricated value.

## Regression

From `opentakeoff/mcp`:

```bash
node --import tsx --test test/demoD05.regression.test.mjs
npm run verify:demo -- ../../opentakeoff-corpus/demos/D05-rtu-mech-to-electrical/truth.json ../../opentakeoff-corpus/demos/D05-rtu-mech-to-electrical/runs/run-1.json
```

The first command validates the real pinned PDF through the production engine.
The second rechecks an accepted model run through the reusable OCR verifier.
