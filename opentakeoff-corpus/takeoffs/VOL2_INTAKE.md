# Volume 2 intake rubric — HVAC/BAS Plan Sets Vol2

**Source:** Google Drive archive `HVAC_BAS_Plan_Sets_Vol2` (82 verified vector
sets · HVAC **and** BAS/controls proven · no Vol1 repeats).  
**On disk:** `opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets_Vol2/` (gitignored,
same as Vol1 bulk). INDEX: `INDEX.md` / `INDEX.csv`.  
**Authority:** `GOAL.md` §8 · `NEXT_GOAL_LOOP.md` Pillar A — corpus is a
*ruler*, not a score farm.

## Scope (full volume)

**All 82 INDEX sets are in-scope** for Pillar A stress and set-agnostic
compile/BAS deepen. That is the product goal — not a pilot sample.

| Delivery (INDEX) | Count | How we use it |
|---|---:|---|
| Single file | 69 | Probe / key / fix directly |
| Split multipart folders | 13 | In-scope; rejoin via `REJOIN_full_sets.sh` / originals when whole-set compile is needed |

Batching (probe → key → shared-path fix → negatives) is **operational
cadence only**. It does **not** shrink scope to “first 5–10.” Prefer
diverse geo/building types early so title/`keyRe`/BAS gaps generalize
faster, then continue until the volume is covered or remaining ceilings
are documented with honest ZERO/WEAK evidence.

## Rules (set-agnostic only)

1. **Entire Vol2 is in goal scope** (see `GOAL.md` §8). Do not treat
   unkeyed sets as out of scope.
2. Prefer single-file deliveries first for speed; do not skip multipart
   sets permanently — rejoin when they block coverage.
3. **Honest ZERO/WEAK** is correct when no extractable HVAC schedule
   tables (or BAS points lists) exist — lock `0` / WEAK, do not inflate.
4. **Fixes must be shared-path** (`corpusTakeoff` / `Session` / reconcile)
   — no Vol2 hardcodes, no per-set IDs in product code.
5. After each batch: focused compile + reconcile probes, negatives on
   existing MEAT locks, update `PROGRESS.md`.
6. Keys land under `takeoffs/cross-set-compile/` only after verified
   compile totals.

## Batch 1 (locked 2026-08-31)

Diverse single-file probes → set-agnostic FAN/UH/coil/BAS wideners → keys:

| Set | Tier | HVAC | BAS rows | Notes |
|---|---|---:|---:|---|
| 017 NIST Gaithersburg HVAC Cooling | MEAT | 19 | 0 | S-A-* supply fans + coils |
| 014 Missoula Fire Sciences | MEAT | 30 | 0 | ECUH/HWUH + DSF/SEF fans |
| 021 Laboratory mechanical | MEAT | 64 | 63 | DDC CONTROLLER I/O titles |
| 009 APHIS Plant Inspection | MEAT | 15 | 0 | EDH duct heaters |
| 023 Salinity Lab chiller | MEAT | 5 | 0 | chiller/pump/buffer |
| 013 Boiler phase-2 Bldg 29 | WEAK | 1 | 0 | VFD only (honest) |
| 020 MSHP Troop C | ZERO | 0 | 0 | finish-only |
| 100 Butler Tech RTU welding | ZERO | 0 | 0 | no HVAC tables |

Continue through remaining single-file sets, then multipart rejoins, until
Vol2 coverage is complete or ceilings are documented.

## Batch 2 (locked 2026-08-31)

| Set | Tier | HVAC | BAS | Notes |
|---|---|---:|---:|---|
| 001 ATC Tower Air Ops | MEAT | 396 | 122 | large federal MEAT |
| 004 MO interior/exterior reno | MEAT | 23 | 0 | GUH + RTU/DOAS |
| 015 Submarine Pier 3 utility | MEAT | 47 | 39 | pier FCU/HP/BAS |
| 018 Poultry Research Center | MEAT | 7 | 0 | HP/FAN/GRD |
| 019 Eglin AFB contract docs | MEAT | 103 | 0 | VAV-heavy |
| 024 Steam heating → RTU | MEAT | 4 | 0 | PACKAGED EQUIPMENT (RTU) |
| 028 Bldg 615 reno | MEAT | 10 | 0 | DOAS OUTSIDE AIR |
| 008 Unheated storage repair | WEAK | 3 | 0 | UH/louver only |
| 011 Hines Finance Center | WEAK | 5 | 0 | GRD only (HP table = devices) |
| 016 Irish Hill test | WEAK | 1 | 0 | single AHU |
| 006 C-wing updates | ZERO | 0 | 0 | no HVAC tables |
| 010 Monitoring/control design | ZERO | 0 | 0 | no HVAC tables |

Shared-path adds this batch: RTU `PACKAGED EQUIPMENT SCHEDULE (RTU)`; UNIT_HEATER `GUH`/`NUH`; DOAS `DEDICATED OUTSIDE AIR SYSTEM`.

## Batch 3 (locked 2026-09-01)

VA / sterile / boiler / EHRM probes → building-prefix strip + VRF / humidifier /
expansion / buffer wideners → keys:

| Set | Tier | HVAC | BAS | Notes |
|---|---|---:|---:|---|
| 031 MO VA warehouse reno | MEAT | 89 | 0 | WHSE-* prefix strip; AS-1 air separator |
| 047 NC VA replace chillers | MEAT | 15 | 0 | VRF indoor/outdoor + expansion system + buffer GST |
| 044 NY VA main boilers | MEAT | 28 | 0 | fire-tube boilers + plant pumps/fans |
| 040 IL VA expand sterile | MEAT | 24 | 0 | UH/FAN/PUMP/GRD/louver |
| 042 VA Patriot Cafe | MEAT | 6 | 0 | FAN + GRD (no humidifier schedule) |
| 041 IL VA sterile processing | WEAK | 4 | 0 | thin FCU/PUMP/GRD |
| 034 NC VA EHRM infra | WEAK | 2 | 0 | pumps only |
| 029 ME BGS MEANG boiler | ZERO | 0 | 0 | no extractable HVAC tables |
| 036 LA VA EHRM | ZERO | 0 | 0 | no HVAC equipment schedules |
| 039 TX VA replace/upgrade | ZERO | 0 | 0 | no extractable HVAC tables |
| 045 FL VA EHRM | ZERO | 0 | 0 | no HVAC equipment schedules |
| 046 MI vet elevators | ZERO | 0 | 0 | no HVAC tables |

Shared-path adds this batch: `markCoreForKeyRe` building-prefix strip (with
catalog-model guard); VRF_INDOOR/OUTDOOR; humidifier OCR + SH-* (digit-gated);
EXPANSION SYSTEM titles; BUFFER GST-*; zone-lettered ET-A1 / AS-A1 mark forms.
Negatives kept honest: sheet header `SHT. NO.`, prose `ETC.…`, Trane model
`TPLFY-EP15NEM4` must not inflate humidifier/expansion/pump.
