# D07 — VAV plan link + fan sweep refusal

Status: `IN PROGRESS — ground truth authored; N=5 not started`

## Live question

> How many VAV boxes are on the AIR TERMINAL BOX SCHEDULE? For VAV-1, VAV-5,
> and VAV-9 give manufacturer, CFM, MBH, and kW from that schedule, and cite
> where each tag appears on the plan (use a tagged sweep — do not invent plan
> locations). Separately, for exhaust fans EF-1, EF-2, and EF-5: report
> schedule CFM, and either the plan tag location from sweep_schedule_row or
> an honest refusal when the tag is not drawn on any plan sheet.

## Follow-up (required for lock)

> Can EF-3 be located on a plan sheet with sweep_schedule_row? What CFM does
> its FAN SCHEDULE row list?

## Why this is hard

`bldg5406-hvac-demo` (20 sheets): AIR TERMINAL BOX SCHEDULE has
quarter-turned headers; VAV-1..9 plan tags live on #2. FAN SCHEDULE lists
EF-1..5, but EF-2/EF-3 have **no plan-sheet tag text** — sweep must refuse
geometric anchoring rather than inventing locations.

## Proven answer (ground truth — before model runs)

| Field | Value |
|---|---|
| VAV schedule count | 9 |
| VAV-1 | TRANE / VCEF · 2170 CFM · 41.0 MBH · 12 kW · plan #2 |
| VAV-5 | TRANE / VCEF · 460 CFM · 8.5 MBH · 2.5 kW · plan #2 |
| VAV-9 | TRANE / VCEF · 85 CFM · 3.4 MBH · 1.0 kW · plan #2 |
| EF-1 CFM / plan | 165 / EF-1 on #2 |
| EF-2 CFM / plan | 400 / **refused** (no plan tag) |
| EF-5 CFM / plan | 80 / EF-5 on #2 |

Follow-up: EF-3 plan **refused**; CFM **300**.

## N=5 gate

Not started.

## Production UI proof

Not started.
