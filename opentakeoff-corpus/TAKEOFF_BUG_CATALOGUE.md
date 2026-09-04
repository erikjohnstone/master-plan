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
