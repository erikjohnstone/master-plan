# D06 — Control / bypass valve takeoff

Status: `IN PROGRESS — ground truth authored; N=5 not started`

## Live question

> Take off the hot-water reheat CONTROL VALVE SCHEDULE and the BYPASS CONTROL VALVE SCHEDULE: how many valves are on each schedule? For CV-1, CV-5, and CV-9 give flow GPM, size, served coil mark, and installed plan quantity from a tagged sweep. Do the same installed quantity plus GPM and size for BCV-1. Cite the schedule title regions for the counts, the FLOW/SIZE cells for the named valves, and the plan tag hits for installed quantities.

## Follow-up (required for lock)

> Is BCV-1 a reheat coil control valve or a bypass valve? What fluid and flow GPM does its schedule row list?

## Why this is hard

`itd-d1-lab` (29 sheets) carries a dense real valve vocabulary: pressure-
independent air valves, HW reheat control valves CV-1..9, and bypass valve
BCV-1. The slate's CHW label is adapted to the set's actual HW reheat +
bypass schedules (no dedicated CHW control-valve schedule). Installed
quantities require `sweep_schedule_row`; sheets are uncalibrated so scale-
dependent measure paths must refuse honestly.

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

## N=5 gate

Not started.

## Production UI proof

Not started.
