
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
