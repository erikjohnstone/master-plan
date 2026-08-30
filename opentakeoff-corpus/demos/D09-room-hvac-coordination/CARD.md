# D09 — Room-oriented HVAC coordination

Status: `IN PROGRESS — ground truth authored; N=5 not started`

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

## N=5 gate

Not started.

## Production UI proof

Not started.
