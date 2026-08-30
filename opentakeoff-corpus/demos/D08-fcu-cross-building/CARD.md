# D08 — FCU quantities across buildings

Status: `IN PROGRESS — ground truth authored; N=5 not started`

## Live question

> Compare scheduled fan-coil quantities across Air Ops, MITRACON, and the
> ATCT. Give the set total and each building's count from the FAN COIL UNIT
> SCHEDULE — use the schedule title-scan building splits (A / M / T), and do
> not double-count reused local tag namespaces across buildings. For FCU-A1,
> FCU-M1A, and FCU-T1 give type and CFM from that schedule and cite the MARK
> cells so I can spot-check each building.

## Follow-up (required for lock)

> How many MITRACON fan coils are scheduled? Is FCU-T11 on the ATCT
> schedule, and what CFM does it list?

## Why this is hard

`navfac-cherry-point-atc` (75 sheets) reuses local FCU mark suffixes across
Air Ops / MITRACON / ATCT. Correct totals come from one FAN COIL UNIT
SCHEDULE title-scan with `building_tag_counts` (A=14, M=10, T=18) — not from
summing continuation pages or treating `FCU-1`-style collisions as one unit.

## Proven answer (ground truth — before model runs)

| Field | Value |
|---|---|
| FCU set total | 42 |
| Air Ops (A) | 14 |
| MITRACON (M) | 10 |
| ATCT (T) | 18 |
| FCU-A1 | VERTICAL CABINET · 150 / 150 CFM · #42 |
| FCU-M1A | SUSPENDED HORIZONTAL DUCTED · 600 / - · #45 |
| FCU-T1 | SUSPENDED HORIZONTAL CABINET · 230 · #48 |

Follow-up: MITRACON **10**; FCU-T11 on ATCT; CFM **220**.

20% hand-count: 9/9 sample MARKs on schedule (`hand_count_20pct`).

## N=5 gate

Not started.

## Production UI proof

Not started.
