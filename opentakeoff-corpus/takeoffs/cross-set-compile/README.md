# Cross-set HVAC/BAS compile acceptance (WP1 / Pillar A)

Hand acceptance keys for **non-NAVFAC** US vector mechanical sets. These lock
schedule-compile family counts so demos cannot silently die on the next firm’s
title phrasing (`AIRHANDLINGUNITSCHEDULE`, `GENERAL FAN SCHEDULE`,
`CONTROL VALVE SCHEDULE (HOT WATER…)`, etc.).

## Sets

| Set ID | PDF | Covers |
|---|---|---|
| `bldg5406-hvac-demo` | `raw/bldg5406-hvac-demo-mechanical.pdf` | HVAC family compile (incl. no-space titles) |
| `federal-mech` | `raw/federal-attachment4-mechanical.pdf` | HVAC family compile (FCU/EV, pumps, fans, chiller) |
| `itd-d1-lab` | `raw/itd-d1-lab-mechanical.pdf` | HVAC + HHW control-valve family + empty BAS disclose |

## How counts were authored

For each keyed family, unique MARK / VALVE MARK tags were counted on the named
equipment schedule title(s) visible on the mechanical schedule sheets (Session
sheet-graph extract of those same titles). Counts are **schedule quantity**,
not installed plan instances. Product code must stay set-agnostic — these
numbers live only in keys/tests, never in `corpusTakeoff` / workflow product
paths.

## Honest empty / refuse

`itd-d1-lab` and `federal-mech` / `bldg5406` have **no extractable POINTS/DDC
lists** on the mechanical PDF used here. BAS compile must report `rows: 0`
with page accounting still present — never invent points.
