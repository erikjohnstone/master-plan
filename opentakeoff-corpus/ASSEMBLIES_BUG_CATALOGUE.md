
## AS-68 — a table titled with its family's name in words, no SCHEDULE printed, was no family's; the soft title match broke a rule's wildcard and quantifier (FIXED — guarded by the evals)

**Found:** 23_GA's reconcile test ("blank-title FAN tables join reconcile
scaffold via keyRe (Macon Bibb shape)") asserts 3 exhaust fans and got none,
before and after AS-66. The sheet graph extracts 23_GA's fan table with its
title, EXHAUST FANS, and FAN's title rule reads "… FAN SCHEDULE" only: a
titled table no family's rule reads is read by no family, and AS-61's notice
names only rows left out of a family's own schedule, so the fans were missing
without a word. A census of every table row a family's mark rule reads but no
family compiles (97 dev documents with a cached graph, held-out excluded;
scratch as68/unread.mjs), kept to titles that name the family in words
(as68/titles.mjs), found 100 such units on 11 documents; their titles vouch
for 7 more marks (097_UT's EXF-1, 26_CA's transfer fans TF-n, 061_IA's AS-A
to AS-C), and a 12th document (01_NY, whose graph is cached only where the
evals run) has 2 more:
- **FAN:** 26_CA's "FANS (SPECIFICATION SECTION 23 34 00)" (32 supply and
  exhaust fans, and 3 transfer fans TF-P2-1, TF-P2-2, TF-3-1), 072_CA's and
  074_CA's SUPPLY FANS (SF-A-1 to SF-A-11 each, roof supply fans for the
  chemistry labs), 097_UT's VENTILATION FANS (EF-1 to EF-4 and EXF-1),
  23_GA's EXHAUST FANS (EF-1 to EF-3), 14_OR's EXHAUST FANS (KEF-1), 01_NY's
  FANS (RF-1 & 2, AHU-1's relief/return plenum fans).
- **VAV:** 033_MN's VAV BOX WITH HOT WATER REHEAT SCHEDULE (18), 061_IA's
  VARIABLE VOLUME SUPPLY TERMINAL UNIT SCHEDULE (VAV-A to VAV-K), 009_FL's
  VAV TERMINAL SCHEDULE (VAV-1-1 to VAV-1-7).
- **AIR_SEPARATOR:** 014_MT's and 061_IA's AIR/DIRT SEPARATOR SCHEDULE
  (AS-A1; AS-A to AS-C).
- **PUMP:** 044_NY's CONDENSATE PUMP (CP-1: a duplex condensate unit in the
  mechanical room serving the flash tank FT-1, two pumps of 6 GPM at 1/3 HP).

**And the soft title match.** `scheduleTitleMatches` falls back to a compact
form of each rule for titles printed without spaces
(AIRHANDLINGUNITSCHEDULE). `compactScheduleTitleRe` dropped every "." and ","
as punctuation, a rule's own included:
- RAH's, WFU's and GLYCOL_MAKEUP's `\bRAH\b.*SCHEDULE` became the invalid
  `\bRAH\b*SCHEDULE`: the rule threw, and the family's soft match never ran;
- FURNACE's `FIRED\s+.*FURNACE` became `FIRED*FURNACE`;
- the chilled and hot water control valves', the fume hood damper's and the
  lab air valve's `.{0,40}` (`.{0,60}`) became `{040}`, exactly forty.
Found when the first draft of the VAV rule, with a `.*` in its lookahead, lost
06_MO's 9 VAV boxes: the whole VAV rule's compact form stopped compiling, and
06_MO's VAV title is read only in compact form.

**Fix (the shared path: `HVAC_FAMILY_SPECS` and `scheduleTitleMatch.mjs`, read
by the compile, the reconcile scaffold, the scheduled-tag check, the notice and
the control-intent binder alike):**
- **FAN** also reads a title that is the fans' own name: up to three words from
  a fixed list (EXHAUST, SUPPLY, RETURN, RELIEF, VENTILATION, TRANSFER, TOILET,
  KITCHEN, ROOF, INLINE, …) then FAN or FANS, then at most a parenthetical, and
  nothing else. An electrical list ending "- EXHAUST FANS", printed with spaces
  or without, an air handler's fans, fan coils, ceiling fans and a fan's points
  stay unread. Under a fan title, EXF-n and transfer fans TF-n are fans
  (`titledKeyRe`).
- **VAV** reads a VAV box or terminal schedule and a variable volume
  terminal, never a box's connections, wiring, controls, points, sequences,
  diagrams or details.
- **PUMP** reads a condensate pump's own title (STEAM, CONDENSATE, RETURN,
  PUMP(S), SCHEDULE and nothing else); a pump trap package is none.
- **AIR_SEPARATOR** reads an air and dirt separator's title, and under it a
  separator lettered for its system (AS-A).
- **`compactScheduleTitleRe`** keeps a "." before a quantifier and a
  quantifier's comma; every family's title rules compile in compact form.

**Measured** on the 97 eligible dev documents with a cached graph (held-out
excluded), A/B against AS-67 (9e59346):
- **Compile:** 11 documents change, 107 units added (26_CA 35, 033_MN 18,
  061_IA 14, 072_CA 11, 074_CA 11, 009_FL 7, 097_UT 5, 23_GA 3, 14_OR 1,
  014_MT 1, 044_NY 1), none removed or changed, and every other part of each
  compile the same. The soft-form fix alone changes no dev document's
  compile. 01_NY (in the dev-4 tier) gains RF-1 and RF-2, nothing else: its
  WP1 key counts both.
- **Reconcile:** the same rows added; the parity census's misses 53 = 53 and
  extras 5 = 5; duplicate marks 22 = 22; the notice of rows read as no unit
  identical.
- **Downstream:** `bas_points` changes only the estimate-only inventory on
  ten of them (033_MN 36 → 126 estimated points, 26_CA 392 → 497, 061_IA 92
  → 147, …); `control_valves` only its page accounting (the newly titled
  tables' titles).
- **WP1 compile acceptance** (93 cached dev sets): 14_OR fail → pass (its key's
  KEF-1), none pass → fail: 42 pass. 044_NY fails as before, now on its total
  (its key counts 9 pumps and 41 units; the compile 10 pumps before, 11 with
  CP-1). 23_GA's FAN count now matches its key (3), as do 072_CA's and
  074_CA's (11); they fail on families their keys count otherwise (23_GA's
  heat pump, not read; 072_CA's fan coils and valves, not keyed).
- **Evals:** the five tiers' scores and the typical eval (130/244) identical,
  each document's line but its compile count. Control intent: GATE C dev
  (227/244), the binding and reading evals identical; the question eval
  passes GATE A, one question more (074_CA's PQ4, the new supply fans' speed
  control: 66 lines, 11 records); the unseen audit replay decides the same
  (26 applied, 26 right, 0 new, 0 gone; 014_MT 60 units, 59 before).
- **Held-out** (aggregates only): GATE 2 held-out 897/1,008 exact, 0 wrong,
  2 invented; held-out 2 334/472, 1 wrong, 2 invented; GATE 5 21/91; GATE C
  35/91. Each is as with AS-67.
- **The reconcile tests on the changed documents** (reconcileWorkflow, 12
  tests, 9e59346's two files against AS-68's; not in the suite run below):
  2 → 4 pass. 23_GA's (Macon Bibb) EF-1 to EF-3 and 14_OR's KEF-1 now reach
  the scaffold as their keys count them; the 8 failing tests fail with the
  same messages, but 044_NY's: its test pinned the scaffold's 8 pump rows
  ("omits one pump row vs compile (8/9)"), and the omitted row was CP-1. It
  now asserts the key's 9 and fails, as before, at its isolation valves (0
  rows where its key has 8, the compile's PRESSURE_REDUCING_VALVE). 01_NY's
  Northport fan test was left out: its session held 7.6 GB for 27 minutes and
  was stopped; from its cached graph, the compile and the scaffold read RF-1
  and RF-2 with AS-68 (none before), the two fans its key and its test count.
- **UI proof** (the dev server started on the change; 211 checks): the 11
  changed documents and 069_ID, each byte-identical to apply_assemblies over
  MCP with its CSV set: 26_CA 72 units (100 records; 19 checks), 14_OR 53
  (97; 18), 044_NY 42 (66; 18), 074_CA and 072_CA 46 (61; 18 each), 061_IA 39
  (66; 17), 033_MN 36 (62; 17), 009_FL 28 (49; 18), 014_MT 60 (85; 17),
  097_UT 8 (14; 17), 23_GA 4 (9; 17). 069_ID, unchanged, is byte-identical to
  its AS-67 run (17 checks). 23_GA's three exhaust fans now wait, as a fan
  whose drive the print does not name does, between the constant and variable
  speed fan typicals. 01_NY's 162 sheets outgrow the browser's sheet-graph
  build here (AS-39).

**Found, not fixed:** 26_CA's FAN POWERED TERMINAL UNIT SCHEDULE lists 75
fan-powered boxes (FPB-n) that no family reads, and its title no family's
rule names; which family and typical take a fan-powered terminal is its own
change. The compact form still drops a "-" inside a character class ([A-Z]
becomes [AZ]); no title rule has one.

**Tests:** corpusTakeoffVol2Families.test.ts (AS-68, 4 tests: the fan
titles and EXF/TF under them; the titles that only end in the fans' name,
spaced and run together, an air handler's fans, fan coils, ceiling fans and
points, and EXF/TF untitled; the VAV titles and a box's connections and
controls; the condensate pump, a pump trap package, the air/dirt separator
and its lettered marks under its title only), schedulePlanReconcile.test.ts
(the reconcile reads the same rows as the compile), scheduleTitleMatch.test.ts
(every family's title rules compile in compact form; the wildcard and the
quantifier kept; the titles matched and not); reconcileWorkflow.test.mjs
(044_NY's pump rows are its key's count, above). 12 mutations each fail a named
test: FAN, VAV, PUMP and AIR_SEPARATOR without their new titles; a fan title
or a condensate pump anywhere in a title; EXF/TF not under a fan title, and
anywhere; a VAV box's connections read; no lettered separator; the compact
form dropping a wildcard's dot, or a quantifier's comma.
- **Guard:** web typecheck clean, lint 0 errors (the 3 known warnings); the
  web suite's 3,924 tests fail only AS-1's three base-red tests. MCP:
  typecheck clean; `test:bas` 133/133; the suite (every file but the WP1
  test) 377 of 380 pass and 1 skips; its two failures are as on AS-67.

## AS-69 — a fan-powered terminal unit schedule was no family's, and a VAV box whose row prints a fan but not its arrangement would take a single-duct typical (FIXED — guarded by the evals)

**Found:** AS-68 left 26_CA's FAN POWERED TERMINAL UNIT SCHEDULE (SECTION
23 36 00) read by no family: its 73 fan-powered boxes (FPB-3-11 to
FPB-61-208: 16 on level 3, 18 on level 4, 22 on level 5 and 17 on level 61,
the marks of page 10's text layer; AS-68 said 75, counting two rows of the
table's notes) were missing without a word. VAV's title rule named an AIR
TERMINAL UNIT or a VAV BOX, never a fan-powered terminal, and FPB was no
family's mark. A census of every cached dev document's titles and marks
(fan-powered, series, parallel or induction words; FPB, FPTU, FPVAV, SFP and
PFP marks; held-out excluded; scratch as69/fp.mjs) finds no other: 053_VA's
SERIES FAN POWERED AIR TERMINAL UNIT SCHEDULE is read already (its TU26-73
takes vav-series-fan), and the other FP marks are fire protection sheets in
sheet indexes. Reading the boxes exposed three more gaps, each checked on a
render of page 10:
- **The typical:** the rows print a fan (FAN DATA … APPLICATION FAN HP, …
  CFM) and nowhere say series or parallel (the set's abbreviations read "FPB
  FAN POWERED BOX", its legend "FAN POWERED TERMINAL UNIT"; neither word is
  in its text), so `terminal_type` is rightly unknown, and the starter's
  single-duct VAV typicals read an unknown type as a single-duct box. Every
  box would have waited for its heat among vav-cooling-only,
  vav-reheat-electric and vav-reheat-hw, and any answer would have given a
  box with a fan a typical with none: no fan start/stop, status or status
  alarm. Of the 595 VAV units on the 97 cached dev documents only 053_VA's
  printed a fan before, with its type (scratch as69/vavfan.mjs).
- **The airflows:** the fan's (MAXIMUM COOLING CFM 770, MINIMUM CFM 385)
  and the primary air valve's (MAXIMUM PRIMARY CFM 680, MINIMUM PRIMARY CFM
  136) both read as the box's maximum and minimum, so each pair disagreed and
  neither was read.
- **The coil:** ZONE LOAD DATA HEATING (BTUH) 7,700 read as the coil's
  capacity beside HOT WATER HEATING COIL DATA CAPACITY (BTUH) 9,900, so
  neither was, and with its water flow alone the box's hot-water heat was not
  read either; PRIMARY AIR VALVE DATA AIR VALVE SIZE (IN) was no inlet size.

**Fix (the shared path: `HVAC_FAMILY_SPECS`, `normalize.ts` and the starter
library, read by the compile, the reconcile scaffold, the notice, the apply
path, the panel and MCP alike):**
- **VAV** reads a title that begins with a fan-powered terminal, box or unit
  (SERIES, PARALLEL, VAV, HOT WATER or ELECTRIC before it; FAN-POWERED), never
  one naming its connections, electrical, wiring, controls, points,
  sequences, diagrams or details, nor a list that only ends in the boxes'
  name; under the family's own title a fan-powered box's mark (FPB, FPTU,
  FPVAV, FP, SFP, PFP …-n) is a VAV unit (`titledKeyRe`; `keyRe`, which the
  control-intent binder reads, is unchanged).
- **The normalizer:** in a VAV table that prints a primary airflow, a fan
  section's maximum is the fan's (`fan_cfm`), its heating airflow the box's
  heating airflow as before, and its minimum neither; the primary columns stay
  the box's maximum and minimum. A zone's, room's or space's design load is
  never a unit's capacity. A terminal's PRIMARY AIR VALVE size is its inlet,
  and an air valve's size is never a pipe connection.
- **The starter's VAV selectors** (`web/scripts/assemblies-starter/terminals.mts`,
  `us-typicals-v1.json` rebuilt): the single-duct typicals take a box whose
  type is unprinted only where its row prints no fan (neither `motor_hp` nor
  `fan_cfm`); vav-series-fan and vav-parallel-fan are possible for such a box,
  so it waits for its arrangement between the two, as a fan waits for its
  drive. A printed type decides as before. v1 is corrected in place: it has
  not shipped (main has no assemblies starter), so no partner copy or saved
  project pins it. For the library's owner: once it ships, a correction to a
  starter typical cannot simply be its next version, since a partner's clone
  of v1 takes 1.1 (`cloneForEdit`): a starter 1.1 would collide with the
  clone, and a 2 would shadow it for new projects.

**Measured** on the 97 eligible dev documents with a cached graph (held-out
excluded), A/B against AS-68 (6510e8b):
- **Compile and reconcile:** 26_CA gains its 73 boxes as VAV units, and no
  unit is removed or changed on any document; the reconcile scaffold adds the
  same 73 rows, its parity census's misses 53 = 53 and extras 5 = 5,
  duplicate marks 22 = 22, and the notice of rows read as no unit is
  identical. The silent-row census names one more row, 26_CA's "1" (the last
  box's remark marker, extracted as a row of its own): no unit.
- **Records:** every other unit on every document keeps its attributes and
  its typical in every layer (0 attributes and 0 records changed; scratch
  as69/ab69.mjs). The 73 each wait for `attr.terminal_type` between
  vav-parallel-fan and vav-series-fan, and their hook-up applies; 26_CA's
  lines 851 → 1,946.
- **26_CA's readings,** checked cell by cell on a render of page 10: FPB-3-11
  primary 680 / 136 CFM, fan 770 CFM at 1/8 HP, heating 480 CFM, a 10" air
  valve, 9.9 MBH at 0.7 GPM (hot-water heat), 277 V single phase; FPB-61-108
  and FPB-61-109 print no coil (their coil block blank), so their heat stays
  unknown. The table's notes say the level 61 and level 3 to 5 boxes are bid
  alternates M-17 and M-16.
- **Downstream:** `bas_points` changes only 26_CA's estimate-only inventory
  (497 → 862 estimated points over 132 units, never merged into printed
  totals).
- **WP1 compile acceptance** (93 cached dev sets): 42 pass and 51 fail, as
  before; none flips (26_CA's key counts 10 units).
- **Evals:** the five tiers' scores and the typical eval (130/244) identical,
  each document's line but 26_CA's compile count (dev 4, 72 → 145). Control
  intent: GATE C dev (227/244), the binding, question (GATE A PASS) and
  reading evals identical; the unseen audit replay decides the same (26
  applied, 26 right, 0 new, 0 gone).
- **Held-out** (aggregates only): GATE 2 held-out 897/1,008 exact, 0 wrong,
  2 invented; held-out 2 334/472, 1 wrong, 2 invented; GATE 5 21/91; GATE C
  35/91. Each is as with AS-67 and AS-68.
- **UI proof** (the dev server started on the change): 26_CA passes all 19
  checks, byte-identical to apply_assemblies over MCP (145 units, 246
  records, 1,946 lines) with its CSV set; 053_VA (its printed series box keeps
  vav-series-fan, its 20 single-duct boxes vav-reheat-hw) passes 16, and
  069_ID, unchanged, 17, byte-identical to its AS-68 run. A focused check on
  26_CA (scratch uiproof/as69/fpbcheck) shows the 73 boxes as one row of the
  exceptions, "73 VAV units of FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23
  36 00) wait for attr.terminal_type", offering Use vav-parallel-fan and Use
  vav-series-fan for all 73 and nothing single-duct; Use vav-series-fan for
  all 73 gives each the series typical with the reason, an override each, and
  its fan's start/stop, status and status alarm (the exceptions 129 → 56);
  apply_assemblies over MCP with the same 73 overrides is byte-identical
  (246 records; 4,582 lines).

**Tests:** corpusTakeoffVol2Families.test.ts (AS-69, 2 tests: the
fan-powered terminal, box and unit titles and their FPB, FPTU, FP and SFP
marks; a box's control diagram, wiring detail and points list, an electrical
list and a sequence that only name the boxes, an untitled FPB row and a
sheet index's FP101 read as no VAV), schedulePlanReconcile.test.ts (the
reconcile reads the same rows as the compile), normalize.test.ts (26_CA's
FPB-3-11 as printed, a box printing no coil, a table printing no primary
airflow, zone, room and space loads, a coil's heating load, an air valve's
size under a pump), starter.test.ts (a box printing a fan and no type waits
between the two fan-powered typicals, whatever its heat; a printed type
decides; no fan and no type is a single-duct box, as before). 16 mutations
each fail a named test: VAV without the fan-powered title, with it anywhere
in a title, or with a box's controls and wiring; no FPB marks under the
title, and FPB marks anywhere; the normalizer without the fan section, with
it where no primary airflow is printed, with the fan's minimum as the box's;
a zone's load as a capacity, and any load as none; no primary air valve
inlet; an air valve's size as a pipe; the single-duct typicals taking a box
that prints a fan; the fan-powered typicals only for a printed type, or only
for a printed fan; the single-duct test without its known-type guard.
- **Guard:** web typecheck clean, lint 0 errors (the 3 known warnings); the
  web suite's 3,929 tests fail only AS-1's three base-red tests. MCP:
  typecheck clean; `test:bas` 133/133; the suite (every file but the WP1
  test) 377 of 380 pass and 1 skips; its two failures are as on AS-68.

**Left, disclosed:** whether 26_CA's boxes are series or parallel is the
estimator's answer (the set prints neither; a series box's fan would run in
cooling, and the schedule's cooling fan airflow above its primary airflow
suggests one, but no rule reads an arrangement from airflows). The table's
notes, read with its rows, say the level 3 to 5 boxes are bid alternate M-16
and the level 61 boxes M-17. The compact title form still drops a "-" inside
a character class (AS-68); no title rule has one.
