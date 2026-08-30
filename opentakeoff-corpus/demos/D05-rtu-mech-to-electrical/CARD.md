# D05 — RTU mechanical to electrical connection

Status: `IN PROGRESS — ground truth authored; N=5 not started`

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
be transposed.

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

## N=5 gate

Not started.

## Production UI proof

Not started.
