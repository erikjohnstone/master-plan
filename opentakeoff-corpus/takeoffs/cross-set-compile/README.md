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
| `16_NV_CarsonValleyMS_HVAC_Replacement` | `bulk/HVAC_BAS_Plan_Sets/16_NV_CarsonValleyMS_HVAC_Replacement.pdf` | Bulk school HVAC (furnace/condensing unit/RTU/ERV) |
| `04_NV_VA_LasVegas_CentralUtilityPlant` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/04_NV_VA_LasVegas_CentralUtilityPlant.pdf` | Bulk CUP pumps + cooling towers |
| `26_CA_TransbayTower_Mechanical_64Sheets` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/26_CA_TransbayTower_Mechanical_64Sheets.pdf` | Bulk high-rise RAH/WFU/VAV blank-title tables |

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
