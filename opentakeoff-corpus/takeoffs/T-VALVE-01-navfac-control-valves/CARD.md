# T-VALVE-01 — NAVFAC control valve takeoff (CHW + HHW)

Status: `COMPILE PATH SHIPPED` — Agent UI + N=5 card pending

## Set

`navfac-cherry-point-atc` — `raw/navfac-cherry-point-atc-mechanical.pdf`

## Live prompt (frozen)

See `prompt.txt`.

## Scope

CHW CONTROL VALVE SCHEDULE + HHW CONTROL VALVE SCHEDULE.
**64 CHW + 99 HHW = 163** unique VALVE MARKs.

Contractor columns: Valve mark, Served equipment (`UNIT MARK`), Service
(CHW|HHW), Size, GPM, **one Cv**, Configuration, Notes, Sheet cite.

Never dual CHW CV + HHW CV on one row; never markdown `**` tags; never empty
Sheet when cites exist.

## Path

`compile_corpus_takeoff` kind=`control_valves` / `T-VALVE-01` via
`corpusTakeoff.compileControlValveTakeoff` (Session+ODL).
