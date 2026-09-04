# Takeoff bug catalogue

Bugs found by **compiling real takeoffs at scale** (`mcp/scripts/takeoff-census.mjs`),
not by reading code and not by opening one document at a time. Collected under a
standing instruction to run a large number of takeoffs, write down every bug and how
they connect, and fix nothing until the picture is complete.

**Fix nothing listed here without reading "How these connect" first.** Several entries
share one root cause; fixing them individually would produce three patches where one
structural change belongs.

## Why this file exists (and why the eval did not catch any of it)

`corpus-eval` scores 7 sets at 541/541 takeoff, 129/129 reference, 138/138 rowsym. Those
numbers are real, and the ground-truth *values* behind them are genuinely independent —
`bessemer.takeoff.csv`'s own header records every tag being rendered at 3.6x-12.9x zoom
and read by eye, explicitly "never trusted from the pipeline's own extraction."

But the *scope* of that key is not independent:

> `Scope: every "equipment"-kind schedule row sheetGraph() finds in
> bessemer-mechanical-bidset.pdf (confirmed by dumping Session.graphForPipeline()…)`

A table the pipeline never finds cannot enter the key. So the eval measures **precision
on tables we found** and is structurally blind to **recall of tables we did not** — which
is exactly GOAL.md rule 18, where 16 real rows were dropped with zero disclosure while
every eval read 100%. Every bug below was invisible to that gate.

## Status

| id | bug | scale observed | class |
|----|-----|----------------|-------|
| B-1 | Printed QTY column never read; every quantity hardcoded `1` | 496 items on one document; every kind, every document | absence |
| B-2 | `sequences` takeoff has no compiler entry — throws | every document | absence |
| B-3 | Row key falls back to a count column when a table has no MARK | 23 real silencers reported as 2 | false structural inference |
| B-4 | Prose fragments recorded as schedule titles | 3+ documents | false structural inference |
| B-5 | A new header-token rejection killed a whole real table | −12 real cells on federal-mech | self-inflicted; whole-row guard |
| B-6 | A page drawing the same table twice at a constant offset | 013_MO p23, 2 tables lost | fused duplicate |
| B-7 | Deep multi-tier header with repeating leaf labels | 034_NC p42, 2 tables lost | header-block rejection |
| B-8 | 3+ side-by-side tables fused by Y-clustering | 046_MI p22, 1 table lost | same class as rule 18 |

---

### B-1 — a printed QTY column is never read

**Where:** `opentakeoff/web/src/lib/corpusTakeoff.mjs`, lines 824, 2015, 2521 — every
item-emission site hardcodes `quantity: 1, unit: "EA"`.

**Evidence:** `001_NC_FY20_P_228_ATC_Tower` emits 333 `hvac_equipment` items and 163
`control_valves` items; every single one carries quantity 1. Detector `P1_ALL_QTY_1`
fires on every document processed so far.

**Confirmed by grep:** `QTY`/`QUANTITY` appears in the compiler *only* inside a
header-label regex (~line 1905) used to skip column-label rows. No code path anywhere
consumes the value.

**Consequence:** any schedule carrying a real QTY column undercounts by Σ(qty−1). On the
one measured case (a duct silencer schedule with QTY values
`[2,1,1,1,1,1,2,1,1,1,1,2,2,2,2,2]`) the true count is 23 and a perfect dedup would still
report 16. This is an estimator-dollar error on exactly the high-count commodity items —
silencers, grilles, registers, diffusers, louvers, dampers — where QTY-first schedules are
the drafting norm.

**Fix shape (not applied):** resolve the quantity from the row's own QTY/QUANTITY/NO./COUNT
column **by column identity, not position**; default to 1 only when that column is absent;
refuse and disclose rather than guess when the column exists but the cell will not parse.
Never invent a number.

---

### B-2 — sequence-of-operations takeoff has no compiler entry

**Where:** `opentakeoff/web/src/lib/corpusTakeoff.mjs`, `compileCorpusTakeoff` dispatch
(~line 2551).

```js
if (kind === "hvac_equipment" || kind === "T-HVAC-01") return compileHvacTakeoff(...)
if (kind === "bas_points"     || kind === "T-BAS-01")  return compileBasTakeoff(...)
if (kind === "control_valves" || kind === "T-VALVE-01") return compileControlValveTakeoff(...)
throw new Error(`Unknown takeoff kind: ${kind}`);
```

**Evidence:** detector `COMPILE_THREW` fires on every document with
`Unknown takeoff kind: sequences`.

**Why it matters:** GOAL.md line 70 names the product as "valve/damper/actuator takeoffs,
BAS points-list takeoffs, and **sequence-of-operations takeoffs**." One of the three
declared pillars throws on invocation. Worse, line 2669 of the same file has a **live
downstream branch** — `takeoff.kind === "sequences"` — that builds CSV/XLSX rows for a
takeoff nothing can produce, and `mcp/src/sequenceExtract.ts` already does real SOO section
extraction with evidence. The capability exists at both ends and is unwired in the middle.

**Fix shape (not applied):** wire `sequences`/`T-SOO-01` to a compiler over
`sequenceExtract.ts`'s output. Audit first — per GOAL.md standing rule 2, the capability
being reached for may already exist further along than expected.

---

### B-3 — row key falls back to a count column when a table has no MARK

**Where:** `opentakeoff/web/src/lib/corpusTakeoff.mjs`. The compiler's own stated
provenance is *"Unique MARK/VALVE MARK rows on the named equipment schedule family;
continuation pages deduped by tag."*

**Evidence:** `028_TX_Renovation_of_Building_615#1`'s NOISE CONTROL DUCT SILENCER SCHEDULE
has **no MARK column** — column 0 is literally `QTY.`. Its 16 real rows deduped to **2**
items keyed `"1"` and `"2"` (the quantity values themselves). Compounded with B-1: 23 real
silencers reported as 2.

**Scope sharpener:** `001_NC`'s silencer schedule reports proper tags
(`DS-AHU-T1-RA`, `DS-AHU-T1-SA`) because that table *has* a MARK column. B-3 is specific to
tables with no identifier column — not universal.

**Fix shape (not applied):** choose the identifier column **structurally** — an identifier
is high-cardinality and tag-shaped; a count column is low-cardinality small integers. When a
table has no identifier column at all, do not dedupe by tag: emit one line per physical row
and carry its quantity. The silencer case then yields 16 lines totalling 23 units.

---

### B-4 — prose fragments recorded as schedule titles

**Where:** the title hunt feeding `page_accounting`.

**Evidence:** `page_accounting` recorded `"CONSTRUCTION DOCUMENTS AND THE SITE CONDITIONS."`
and `"AND A …"` as schedule titles on real documents (detector `PROSE_AS_TITLE`).

**Related, already fixed upstream:** GOAL.md rule 18's own title hunt reached past a real
body-sized title to grab an unrelated detail-drawing caption; and reading column bands mined
a fake 13-row "table" out of two side-by-side SEQUENCE OF OPERATION prose columns, whose
"headers" were `"WORKSTATION."` and `"SHALL SEQUENCE THE FOLLOWING:"`. Same disease, three
appearances.

**Fix shape (not applied):** the measured discriminator from the rule-18 work generalizes —
a prose line FILLS its column band (89%-113% measured) while a real title does not (29%
measured). A sentence-terminating period is a second, independent signal.

---

---

### B-5 — a new header-token rejection killed a whole real table (SELF-INFLICTED, found by Loop B0)

**Severity: this one was mine, shipped, and my own gate would have caught it.**

**What happened.** Rule 18 (commit `e256975`) added
`if (/:$/.test(s)) return false;` to `isGenericHeaderToken`, to kill a fake
13-row table mined from two side-by-side SEQUENCE OF OPERATION prose columns
on itd-d1-lab#20 (its "header" labels were `"WORKSTATION."` and
`"SHALL SEQUENCE THE FOLLOWING:"`).

**Measured cost.** Reference-cell scores, pre-today (`08f8559`) vs HEAD:

| set | cells | before | after |
|---|---|---|---|
| itd-d1-lab | 34 | 11.8% | **41.2%** (+10 cells) |
| federal-mech | 31 | 100.0% | **61.3%** (−12 cells) |

federal-attachment4-mechanical.pdf#15's `ARCHITECTURAL LOUVERED PENTHOUSE
SCHEDULE` (ALP-1/ALP-2/ALP-3) disappeared **entirely**, and two fabricated
title-block tables took its place: `"IMEG Corporation"` (the engineering
firm's name) with row keys `MINIMUM / LOCATION / BLADDER / BLADDER`, and
`"ELECTRONIC SECURITY / TELECOMMUNICATIONS"` keyed
`CONTRACT DOCUMENTS / DESIGN DEVELOPMENT / DRAWING TITLE / SCALE`.

**Root cause — and it is a trap this codebase already documented.** There is
**no colon-terminated token anywhere in the ALP header band** (measured
directly: the two header tiers are `ROOF OPENING / PENTHOUSE THROAT SIZE /
DESIGN AIR FLOW / MAXIMUM AIR PD` over `CFM / I.W.G / TAG / SYSTEM / LOCATION
/ LENGTH / WIDTH / LENGTH / WIDTH / HEIGHT / MANUFACTURER / MODEL / REMARKS`).
The rule breaks the table **indirectly**: `isGenericHeaderRow` requires EVERY
token in a row to qualify, so one new rejection anywhere on the sheet
disqualifies a whole candidate header row, which shifts where
`extractAllReferenceTables` advances `fromIdx`, and a junk title-block region
then swallows the ALP band (note `LOCATION` — a real ALP header — appearing as
a row key of the `"IMEG Corporation"` table).

This is the **identical failure mode** rule 18's own history records for the
bare `"&"` connector: one token failing `isGenericHeaderToken` silently killed
an entire real table. Any new rejection in that function is a whole-table risk.

**Fix.** Require ≥3 words AND a trailing colon:
`if (/:$/.test(s) && norm(s).split(/\s+/).filter(Boolean).length >= 3) return false;`
`"SHALL SEQUENCE THE FOLLOWING:"` is a prose clause (4 words); a real column
label is not. Verified on both documents: federal recovers ALP-1/2/3, itd's
fabricated prose table stays dead.

**The process failure, recorded because it matters more than the bug.** The
two-tier sweep gate (regression + held-out) exists in this repo specifically to
catch a locally-correct fix breaking a different real table elsewhere. It was
built earlier the same session — and rule 18 was committed **without running
it**, pushed at a stop-hook prompt while the sweeps were still in flight. The
gate would have shown federal's ALP as a `LOST` table before the commit landed.
No extraction change ships again without the gate completing first.


---

## B1 recall findings — the three genuine zero-table misses

Found by probing all 11 zero-table documents page by page (text-only). Eight
were my own page-scorer's fault (see the audit's §0.2 correction). These three
are real, and each has a **different** structural cause — worth stating,
because "the extractor missed a table" is not one bug.

### B-6 — a page that draws the same table TWICE, offset

**Where:** `013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29` p23.
Real tables present: `VARIABLE FREQUENCY DRIVE SCHEDULE` (title h=32.1) and
`HVAC PIPING MATERIAL SCHEDULE` (h=35.6). Extraction returns **zero tables**.

**Measured cause.** The page renders the whole schedule twice, offset by
roughly **+500 in x and +12..30 in y** — a shadow/bold draw or a stacked
overlay. Both copies are live text spans:

```
y=184  [1417]"TAG"   [3265]"FEEDER"        y=215  [1928]"TAG"   [3432]"FEEDER"
y=193  [1662]"NAME"  [1914]"MANUFACTURER"  y=225  [2127]"NAME"  [2333]"MANUFACTURER"
y=291  [1428]"VFD-1" [1545]"CROSS TIE HHW CTP" [2287]"480" [2699]"3" [2813]"25"
y=305  [1937]"VFD-1" [2033]"CROSS TIE HHW CTP" [2636]"480" [2972]"3" [3064]"25"
```

`clusterRows` groups by Y alone, so the two copies fuse into incoherent rows
and no coherent header block ever forms.

**Shape of the fix.** Detect a translated duplicate of a span set (identical
strings at a constant (dx, dy) offset) and keep one copy. Structural and
general — shadow-drawn content is a real drafting artefact, not a quirk of
this sheet. Must not fire on a genuinely repeated header tier (a continuation
page) — the discriminator is the CONSTANT offset across many spans.

### B-7 — a deep multi-tier header with repeating sub-labels

**Where:** `034_NC_VA_Project_637_22_700_EHRM_Infrastructure` p42.
Real: `DOOR SCHEDULE` (h=50.4) and `ROOM FINISH SCHEDULE` (h=50.5). Zero tables.

**Measured cause.** ROOM FINISH SCHEDULE carries a **four-tier** header whose
leaf labels repeat under every parent:

```
y=2249  BASE            WALLS                    CEILING          (tier 1, spanning)
y=2283  LEVEL RM NO AREA RM NAME FLR  NORTH EAST SOUTH WEST  COMMENTS
y=2301  MATL HT                                   MATL FIN HT
y=2318  MATL FIN  MATL FIN  MATL FIN  MATL FIN
```

`MATL` appears at six distinct x positions, `FIN` at five. The header-block
expander treats a many-token cluster as "not a wrapped label" and rejects it,
so the block never qualifies. This is the architectural room-finish shape the
finish-kind vocabulary exists for, yet nothing extracts it.

**Shape of the fix.** A repeating leaf label under distinct parents is the
SIGNATURE of a real multi-tier header, not a disqualifier. Cluster by
(parent-span, leaf) rather than by leaf text alone.

### B-8 — three-plus side-by-side tables fused by Y-clustering

**Where:** `046_MI_Veterinary_Medical_Center_Replace_Elevators_3` p22.
Real: `LIGHTING FIXTURE SCHEDULE` (h=37.7, x 2577..3143), headers
`TYPE / MANUFACTURER / CATALOG NO. / DESCRIPTION AND … / DIMMING INFO /
DRIVER / MOUNTING / FIXTURE HEIGHT` at y=1251. Zero tables.

**Measured cause.** Unrelated tables occupy the SAME y-band at lower x — a
symbols legend (`ELECTRIC UNIT HEATER`, `NURSE CALL`, `WALL MOUNTED SPEAKER`,
`ULTRASONIC SENSOR` at x 151..1200) and an occupancy-sensor list. Row
clustering fuses all of them into one row set.

This is the SAME class as GOAL.md rule 18's 028_TX two-up sheet, but with
three-plus tables rather than two. Rule 18's fix (read the whole sheet AND its
column bands, whole sheet winning on overlap) may already reach this — it must
be re-measured on this page before anything new is built, per standing rule 3
(audit before you build).

**Also worth recording:** two of the three genuine misses (DOOR SCHEDULE,
ROOM FINISH SCHEDULE, LIGHTING FIXTURE SCHEDULE) are architectural/electrical
rather than mechanical. An HVAC/BAS takeoff arguably should not COUNT them —
but silently not extracting them is different from disclosing them, and the
domain map is explicit that a set without architectural sheets carries a
fire/smoke damper undercount risk. Recall and scope are separate questions.


## How these connect

Two distinct classes, and the split matters for how they get fixed.

**Absence — a field never read, a path never wired (B-1, B-2).** Nothing is misjudged;
something simply was never built. Bounded, mechanical, testable on unit fixtures without the
bulk corpus. Low regression risk. These are the cheap wins.

**False structural inference — position or shape trusted without checking identity
(B-3, B-4).** This is the same disease as GOAL.md rule 18, whose four root causes were: a
path segment assumed to run left-to-right (half of them do not), a bare `"2"` assumed to be
an outline marker (it was a quantity), column 0 assumed to be an identifier, and a lone
all-caps span assumed to be a title. B-3 and B-4 are two more instances of exactly that
pattern.

The through-line: **the pipeline infers what something IS from where it SITS or what it
LOOKS like, without testing the claim.** GOAL.md's standing rule 1 already names this —
"regex is never the classification engine, structure is; regex may confirm a structural
finding but must never be the sole thing between found and not found." Every entry in this
second class is a violation of that rule that shipped.

Fixing them one at a time produces three narrow patches. The structural fix is a shared
discriminator: *before treating a column as an identifier, a span as a title, or a token as a
marker, test the property that actually distinguishes it* — cardinality for an identifier,
band-fill ratio for a title, column population for a data row.

## What is working

Worth recording alongside the failures, because the bug list alone reads worse than the
system is. `001_NC_FY20_P_228_ATC_Tower` — a real federal ATC tower project nobody tuned
against — compiled **333 items across 22 populated categories** with correct marks:

- `AHU-M1`/`AHU-T1A`/`AHU-T1B` kept distinct from `DOAH-M1`/`DOAH-T1` and from 6 `CRAH-*`
  computer-room units — three families a naive classifier smears together
- 28 FCUs, 25 VAVs, 4 boilers; air-cooled chillers (`CH-A1`) separated from heat-recovery
  chillers (`CH-MT1`)
- 18 pumps with discipline vocabulary intact: `HRHWP`, `PCHWP`, `SCHWP`, `PHHWP`, `SHHWP`
- 64 CHW + 99 HHW control valves named by served equipment (`CV-AHU-A1-CHW`,
  `CV-FCU-A8-A-HHW`) — the valve-to-equipment relationship survives, which is the hard part
- air separators (`AS-CHW-M1`) separated from expansion tanks (`ET-CHW-MT1`); humidifiers
  from dehumidifiers
- building segmentation (`-M-`/`-T-`/`-A-`) consistent across every family

The core engine — extraction, family classification, tag parsing, valve-to-equipment
cross-referencing — works on real documents. The bugs above are edges, not foundations.
