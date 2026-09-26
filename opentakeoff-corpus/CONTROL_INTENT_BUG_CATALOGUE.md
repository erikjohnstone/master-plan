# Control intent bug catalogue

Append-only log for GOAL LOOP C (`goals/CONTROL_INTENT.md`). Each entry records a
defect, blocker, key disagreement or open question found while working the queue.
It gives the root cause (or why it is not known yet), the evidence, the numbers,
and what happened next. Entries are never rewritten. A later finding is a new
entry that points back to the earlier one.

Numbering is `CI-<n>`. Status is one of **OPEN**, **BLOCKED (owner)**,
**FIXED (commit)**, **KEY DISAGREEMENT (not edited)** or **NOT A BUG**.

---

## CI-1: binding keys that the printed drawings contradict (KEY DISAGREEMENT, not edited)

**Found:** 2026-09-25, WP2 binding eval (`mcp/scripts/control-intent-binding-eval.mjs`, dev).

**What:** Several `keys/*.binding.csv` rows name a governing packet that the drawings' own printed text
contradicts, or omit a packet the drawings plainly tie to the unit. Per GOAL_LOOPS ANTI-GAMING, the keys were
not edited. Each case below shows the printed evidence, read from the PDF text layer. The eval scores them as
the keys say, so the numbers in `reports/control-intent/03-binding-eval-dev.md` count every one of these
against the pipeline.

**Cases:**

1. **itd-d1-lab HC-2, HC-4, HC-5, HC-6, HC-8.**
   - *Key:* all nine reheat coils HC-1..HC-9 are keyed to "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM CONTROL
     SCHEMATIC" (binding `semantic`, note "the reheat coil of a lab supply air valve").
   - *Drawings:* each lab ventilation sequence prints an equipment table with the columns LAB SPACE / SUPPLY AIR
     VALVE / GENERAL EXHAUST VALVE / REHEAT VALVE / HEATING COIL.
     - M6.5 (page 21) lists HC-5, HC-2 and HC-4 under the general-exhaust system (e.g. "CONCRETE 119 · SAV-5 · GEV-6
       … HC-5").
     - M6.4 (page 20) lists HC-7, HC-3, HC-9 and HC-1 under the multiple-hoods system, and HC-8 and HC-6 under the
       snorkel-hood system.
   - *Effect:* the binder binds each coil to the system whose table prints it, plus that system's schematic as a
     sibling. That counts as 5 missed pairs and 14 false bindings. The 4 false bindings for HC-1, HC-3, HC-7 and
     HC-9 are that system's own sequence, which the key omits.
2. **itd-d1-lab EF-6.**
   - *Key:* "HEAT RELIEF FAN SEQUENCE OF OPERATION" (`family_detail`).
   - *Drawings:* the other sequence on M6.0 is titled "HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION", with the
     subtitle "(EF-6/L-1 & EF-7/L-2)" printed directly under it.
   - *Effect:* 1 missed pair and 1 false binding.
3. **federal-mech EF-1..EF-4.**
   - *Key:* only the family control diagrams on M8.8.
   - *Drawings:* the same sheet's "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" groups its rows
     "1. EF-1,2,3" and "2. EF-4", with each fan's start/stop and status points. The "EMERGENCY SHUTDOWN - CONTROL
     DIAGRAM" labels EF-1 and EF-4.
   - *Effect:* 6 false bindings, which are the fans' own points and shutdown interlock.
4. **074 ERV-A-15.**
   - *Key:* the packet title "ERV CONTROL".
   - *Drawings:* that is a two-line label ("ERV" over "CONTROL") on a controller box inside detail 3, whose caption
     is "ENERGY RECOVERY VENTILATOR".
   - *Effect:* the key packet is "not found", which counts as 1 missed pair and 1 false binding.
5. **031 WHSE-AHU-1.**
   - *Key:* the sequence and the points list.
   - *Drawings:* the same sheet's detail 1, "VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR CONTROL
     DIAGRAM", is not keyed for it.
   - *Effect:* 1 false binding, a proposal (see CI-2).

**Numbers:** with these cases counted as the keys say, dev pair recall is 92.9% (300/323) and confirmed precision
93.2% (317/340). If the printed evidence above were taken instead, 21 of the 23 confirmed false bindings would be
correct and 6 of the 23 missed pairs would not be owed. The remaining false bindings are CI-3.

**Next:** none in code. The owner decides whether keys are re-issued (INPUT, never by the loop).

## CI-2: family details whose title qualifier the row does not print stay proposals (NOT A BUG, by decision C5)

**Found:** 2026-09-25, WP2 binding eval.

**What:** C5 binds a family-level detail only when every qualifier in its title is printed in the unit's own row,
schedule title or cited notes. Otherwise readings through it are proposals only.
- 031's only air handler, WHSE-AHU-1, prints TYPE "MODULAR ROOFTOP" and AREA SERVED "WAREHOUSE". It does not
  print the "VARIABLE AIR VOLUME … WITH MINIMUM OUTSIDE AIR" of its sequence's title. So the sequence, the points
  list and the control diagram are proposals.
- Its supply and return fans and its coils (components by SERVICE / LOCATION) inherit only confirmed bindings, so
  they get none.
- WHSE-HX1/HX2 print SERVICE "REHEAT WATER", which does not confirm "(HEATING SYSTEM)".

**Numbers:** 12 missed pairs on 031 (2 `family_detail`, 10 `semantic`). They are hit with proposals.

**Next:** kept as designed. A reader that cites the sequence can still offer its options as proposals (WP3).

## CI-3: bindings no printed structure reaches (OPEN)

**Found:** 2026-09-25, WP2 binding eval.

**Cases:**
- 004 DOAS-1 and GEF-1 are the kitchen make-up air unit and grease fan that the kitchen hood panel runs. The hood
  sequence names neither by tag.
- 031 WHSE-P2/P3 are the reheat water pumps that the heat-exchanger detail draws without their tags.
- federal HWRP-1 prints SYSTEM "AHU-1". As a component it inherits AHU-1's sequence as well as the AHU-1 diagram
  sheet the key names: 1 false binding.

**Numbers:** 4 missed pairs (`semantic`) and 1 false binding.

**Next:** open. These need a reading of the packet's words (WP3), not a binding rule.

## CI-4: a sequence's heading region stopped at its own title (FIXED, 2deed61)

**Found:** 2026-09-25, WP3 dev replay (federal-mech AHU-1).

**What:** the packet finder grew a heading's region down the page only while the gap to the next line stayed within
2.5 body heights, measured from the first line. "AHU - 1 SEQUENCE OF OPERATIONS" is printed large, and its first
body line sits 52 px below it (the limit was 47.75), so the packet was the bare title: 3 spans, no sequence text.

**Fix:** the first gap is allowed the same window the title's reading direction was found in
(`max(3 × body, 2.5 × title height)`, `evidence.ts` `textWindow`). That packet grew from 3 to 640 spans. It is the
only dev packet that changed.

## CI-5: a family sheet that a unit's own title is printed on did not bind (FIXED, 2deed61)

**Found:** 2026-09-25, WP3 dev replay (federal-mech AHU-1 economizer).

**What:** the LEED note title between AHU-1's sequence and its economizer section stopped the region's growth. The
economizer section was on a sheet about air handlers, and it named no other unit, yet nothing bound it.

**Fix:** a sheet binds as a sibling when three things hold: a title naming the unit is printed on it, the sheet
is about the unit's family, and no title on the sheet names another unit (`binding.ts`, the evidence says so).

## CI-6: zone plans: sensor symbols in the zone a unit's tag labels (NEW READER, 2deed61; hardened in the next commit)

**Found:** 2026-09-25. The research's floor-plan class: federal-mech VAV CO2 sensors are drawn only on the HVAC zone
legend (M2.1), never in a sequence.

**What:** `zonePlan.ts` reads a sheet whose title names zones. Each closed region is a candidate zone, whether a
fill or the clip its hatch is drawn through. A scheduled tag printed alone labels the smallest region that holds
it and is many times its box. A symbol inside that region answers the unit's option ("CO2" → `co2_sensor`, reader
`rp`, whitelisted, cited to the symbol and the label).

**Numbers:** federal-mech M2.1 has 60 zones. All 15 CO2 zones the key names are read, with 0 false. No other dev
document has a zone-titled sheet.

**Hardening (robustness across documents, not a dev miss):**
- A tag drawn in pieces ("VAV-" "12") labels as the text line its pieces join into, and its pieces are no symbols.
- A zone must be several text heights across as well as many label boxes in area, so a legend table's cell (as
  large as a zone, but thin) labels nothing.
- A tag printed twice in its own zone labels it once.
- A letter span with a smaller digit drawn against it reads as one symbol ("CO" "2" → "CO2").
- Quarter-turned sheets read the same (regions come through the viewport, text turned with it).

Each case has a synthetic test (`web/test/controlIntent/zonePlan.test.ts`). federal-mech is unchanged: 60 zones,
the same 15 CO2 zones.

## CI-7: list items under a lead-in had no subject, so R0 read no actor (FIXED, next commit)

**Found:** 2026-09-25, WP3 dev replay.

**What:** sequences write "WHEN THE ABOVE CONDITIONS ARE MET, THE DDC CONTROLLER SHALL SEQUENCE THE FOLLOWING:" and
then numbered items such as "1. SEND AN ENABLE COMMAND TO THE PUMP." R0's control-act rule needs the clause's
subject, and each item had none.

**Fix:** `text.ts` v3 marks a sentence that ends in a colon as a lead-in. The list items after it that have no
subject of their own carry its subject (`leadSubject`: from the last determiner or comma before SHALL/WILL). The
lead lasts until a paragraph that is no item, a new lead-in or a section heading. R0 v3 matches that subject
against the sourced actors (`role.bas_actor`, `role.local_actor`; term list v2). R1 v3 accepts the lead as the
clause subject a role answer must quote.

**Numbers (dev replay):** exact rose from 221 to 227/244, and class R (decided by the control drawings) reached
55/71. That run had 2 applied-wrong readings: CI-8.

## CI-8: a model's evidence from a packet shared by several units was applied to the wrong unit (FIXED, next commit)

**Found:** 2026-09-25, the dev replay after CI-7: 069 BP-1 and BP-2 were applied-wrong.

**What:** a boiler room sequence printed once for several units is bound to each of them. R1's answer for BP-1 quoted
clauses about the heating water pumps (HWP-1/2): the quote was verified, but it was about another unit.

**Fix:** a model answer whose cites all come from shared packets counts only when a cited clause, or its section's
heading, names the unit (`record.ts` `attributed()`). Otherwise the answer is unverified and never applies. Packets
bound to the unit alone are unaffected.

**Numbers (dev replay, all recorded runs):**
- exact 227/244 (93.0%), unchanged;
- applied 291, applied-wrong 0 (was 2), INVENTED 0, uncited 0;
- absence decisions: 43 applied, 0 wrong;
- class R 55/71.

## CI-9: the dev misses that remain (OPEN)

After CI-4 to CI-8 (dev replay, 17 of 244):
- **Boiler pumps keyed out of scope (4):** 069 BP-1/2 and itd BP-1/2 are keyed `none`. Each boiler's own controller
  runs its pump, but the pipeline gives `pump-constant`. Taking them out of scope needs a role reading ("the boiler
  controller runs its pump"). The readers leave that role unresolved, so it is not applied.
- **Option defaults the drawings do not settle (8):**
  - 094 AHU-04, AHU-05 and AHU-08 duct smoke detectors (key false; the starter default is true, and nothing reads
    an absence);
  - bldg5406 AC-1 setpoint adjustment;
  - federal AHU-1 return fan and relief fan (the drawing shows both a return fan and relief dampers, so the
    exclusive group stays unresolved by design);
  - federal AHU-1 differential economizer;
  - federal CH-1 chilled water isolation valve;
  - federal EF-1 motorized damper (R1 reads "no", while R0 and both R2 runs read "yes": a disagreement, left
    unresolved);
  - itd HUM-1 space humidity.
- **Waiting on an unprinted attribute (5):**
  - 031 WHSE-AHU-1 (VFD) and 094 AHU-06 (economizer);
  - bldg5406 AHU-1 (a key the ASSEMBLIES loop already found dishonest, AS-16);
  - federal FCU-1 (ECM);
  - itd AHU-1 (VFD).

**Next:** open. None of these is a key edit. Reading absences of a drawn device (094 smoke detectors) needs a
fourth, structurally different reader. It is not a weaker agreement rule.

**Re-checked 2026-09-26, at 96df544 (after CI-11 to CI-23):** the same 17, and each is a rule doing what it is
for. GATE B2's class R stays 55/71 (it asks for 57):
- the five absences (094's three smoke detectors and AHU-06's economizer, bldg5406 AC-1's setpoint adjustment): R0
  and one vision run find no device, and the other run does not say so; C9 asks for both;
- the boiler pumps: the readers' evidence is from the heating water system's drawings and names no pump
  (CI2, attribution); R1 reads "commands" and R2 "monitors only" besides;
- federal AHU-1: the return fan and relief fan are one choice and the drawing reads as both (C12); its differential
  economizer and freezestat are R0's alone (C8); CH-1 has one R1 absence and nothing else;
- federal EF-1: R1 reads the hardwired damper interlock as "no" against three readers' "yes" (a verified
  disagreement, C12). In GATE D's live re-run R1 said "not shown" and the damper applied, right (CI-24): the
  question sits on R1's sampling;
- itd HUM-1: R0 alone (C8).
Each would need a weaker CI2, C8, C9 or C12 to apply, which the goal forbids.

## CI-10: held-out project and binding keys were authored after WP2/WP3 code existed (PROCESS NOTE, not a bug)

**What:** GATE 0 asks for the held-out `project.csv` and `binding.csv` before any Track A/B code runs on those
documents. They were authored on 2026-09-25 (commit 08ea06d) after WP2/WP3 existed. However, no control-intent code
had run on the six held-out documents: the corpus robustness sweep and the zone scan exclude them. Each key was
written from its document's own PDF text and renders, with no pipeline output.

**Next:** held-out control-intent results are measured against these keys and reported as aggregates only.

## CI-11: a qualified tag, a mark several kinds of unit share, and point labels bound the wrong units (FIXED, next commit)

**Found:** 2026-09-26, the blind live audit on an unseen set (16_NV, never keyed or tuned on), and a scan of every
snapshot's tags.

**What:**
- 16_NV marks an outdoor air unit, a furnace and a condensing unit all "B1" (its schedules number by building). Its
  "EF-B1 CONTROL DIAGRAM" is an exhaust fan's. The title tokenizer read "EF", "-", "B1", so the diagram bound all
  three B1s by tag. That also kept furnace B1 from its own "FURNACE CONTROL DIAGRAM". The live readers then
  **applied** furnace B1's fan status from "EXHAUST FAN STATUS SHALL BE MONITORED BY THE BUILDING AUTOMATION
  SYSTEM": R0 and R1 agreed, on another unit's clause.
- `tagKey` dropped the letters before a mark, so "AHU-A1" and "DOAH-A1" (001_NC), and "GWP-A-1" and "HWP-A-1"
  (061_IA), were one tag to the binder.
- Condensing units "BO1" and "BO2" were bound inside an RTU control diagram whose "BO-1" and "BO-2" are binary
  outputs.

**Fix (`binding.ts`, the shared binder):**
- A tag keeps the letters printed before its mark (`qualifier`). Two different qualifiers are two tags.
- A qualifier that is a standard designator (`PREFIX_WORDS`: "EF" is an exhaust fan) must name the unit's family, or
  its schedule must print it. Other letters (a building, "WHSE-AHU-1") do not stop a match.
- A mark several kinds of unit share binds by a title only when the title's subject names the unit's family.
  Otherwise the binding is a proposal (C5), and readings through it are proposals only.
- I/O point designators (AI, AO, BI, BO, DI, DO) printed in a packet are never a unit's tag.

**Checked:**
- Dev: the binding eval over the 11 dev snapshots gives the same 657 pair and binding rows before and after (recall
  92.9%, precision 92.9%). Dev bindings are unchanged, so no dev reading can move.
- Unseen sets (the 35 swept so far, before vs after) change on three sets, as intended:
  - 16_NV: the B1s lose "EF-B1"; furnace B1 gets "FURNACE CONTROL DIAGRAM"; BO1 and BO2 lose the point labels.
  - 001_NC: "POINTS LIST AHU-T1A/TIB" now binds AHU-T1A by tag, replacing three family proposals.
  - 017_MD: "MOTOR CONTROL CENTER - MCC-A1" no longer binds S-A-1, CC-A-1 and HC-A-1. "ACU A-1 … SEQUENCE" binds
    them as proposals: the parts of ACU A-1 share the mark A-1, and the title does not say which part. That is a
    recall cost, taken on purpose.
- 16_NV live, re-read: 12 applied, all right (RTUs B2–B5: duct smoke detector, CO2 sensor, economizer, from "ROOFTOP
  UNIT WITH BAROMETRIC RELIEF SEQUENCE OF OPERATION (BID ALTERNATE 1)"). Before the fix, 13 applied, 1 wrong.

**Not fixed here (recall, not a wrong binding):** "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION" names two
families, but the right-headed rule reads only the condensing unit. The furnaces do not get the sequence, and the
condensing units get it as a proposal because their rows do not print "FURNACE".

## CI-12: two sequences printed one under the other were found as one packet (FIXED, next commit)

**Found:** 2026-09-26, the blind live audit on an unseen set (27_WA, sheet 18).

**What:** the sheet prints "EXHAUST FAN (EF-1,2) SEQUENCE OF OPERATION" (the fans run from a manual switch) and, one
line of spacing below its last line, "EXHAUST FAN (EF-3) SEQUENCE OF OPERATION" (the main PLC runs EF-3, whose fan
"SHALL OPEN THE INTERLOCKED MOTORIZED DAMPER"). A body-size heading starts a packet only when nothing is printed right
above it, so the second heading and its text joined the first packet. EF-1 and EF-2 are bound to that packet by
title, so R0 and R1 **applied** their motorized damper from EF-3's clause. That is 2 wrong decisions among 64
audited.

**Fix (`evidence.ts`):** a body-size heading that names its equipment (a tag, or a family the compile's schedule
rules read) and a sequence or points list starts its own packet when every line right above it ends a sentence.

**Also in this finder batch:**
- A caption or a big title that names control evidence keeps a closing period ("LIGHTNG AND EXHAUST FAN CONTROL
  DIAGRAM.", 008_MO). An abbreviated label ending in one ("DIFF. PRESS.") is still no title.
- Other trades' "control" is no packet: seismic and vibration control, noise control, erosion and sediment control
  ("SEISMIC AND VIBRATION CONTROL" held 27_WA's pumps by tag).
- A reader-side guard (CI-13) keeps the same mistake from applying when the finder misses a split.

**Numbers:**
- Dev: all 11 documents were re-snapshotted with the new finder. Extraction (items, tables, printed points, pages)
  is byte-identical, and so are the packets: 0 added, 0 removed, 0 changed. The dev readings cannot move.
- Unseen, 15 sets re-snapshotted:
  - 008_MO gains its diagram;
  - 27_WA gains the EF-3 and HWP-5,6 sequences, loses the seismic detail, and the EF-1,2 and unit-heater sequences
    shrink to their own text;
  - 06_MO loses five civil "EROSION CONTROL" details it had read as control packets;
  - the other 12 are unchanged.
  Extraction is byte-identical on all 15.
- 27_WA live, re-read: 8 applied, all right (EF-3's damper from its own sequence; the unit heaters' standalone
  thermostats). Before, 14 applied with 2 wrong.
- A heading admitted this way heads the text below it, even when that text is further away than the sentence above
  (a second test covers it, and fails without the rule).

## CI-13: in a packet titled for other units of its family, the family noun was read for the unit too (FIXED, next commit)

**Found:** 2026-09-26, with CI-12. 27_WA's EF-3 was bound, by its tag printed in the body, to the packet titled
"EXHAUST FAN (EF-1,2) SEQUENCE OF OPERATION". A shared packet speaks for a unit where a clause names it: by its tag,
its family's noun, or its tag's words. There, "EXHAUST FAN SHALL OPEN THE INTERLOCKED MOTORIZED DAMPER" named EF-3
through "EXHAUST FAN", although the title makes those fans EF-1 and EF-2.

**Fix (`record.ts`, `readers/r0.ts`):** when a title binds the packet to other units of the unit's family, and not
to the unit, only a clause (or its section heading) that prints the unit's tag speaks for it, in R0 and in the model
answers' attribution. A component keeps its parent's packet: SF-1 in "AHU-1 SEQUENCE", a packet titled for another
family, is still named by "SUPPLY FAN". R0 is now `control_r0_v4`.

**Numbers:** the dev replay on the saved snapshots is unchanged: 227/244 exact; 291 applied, 0 wrong; the same
proposals and unresolved decisions, line for line.

## CI-14: a reading through one of several equally bound packets applied to units the other packet governs (FIXED, next commit)

**Found:** 2026-09-26, the blind live audit on an unseen set (21_VA, sheet 55).

**What:** the sheet draws "VAV BOX WITH HEATING COIL CONTROL DIAGRAM" and "COOLING ONLY VAV BOX CONTROL DIAGRAM", each with
its own "VAV BOX SEQUENCE OF OPERATION". The two sequences carry the same title, so every VAV box was bound to both,
flagged ambiguous. Only the reheat boxes' sequence measures room CO2, and R0 and R1 read that clause for all 57 boxes.
The schedule gives 56 boxes reheat coil data; VAV-1-16 has none (a cooling-only box), so its CO2 sensor was applied
wrong. Ambiguity blocked only absences (C9), not applications.

**Fix (`combine.ts`, `control_combine_v5`):** a reading that rests only on doubtful packets (C5 proposals, or one of
several packets bound equally) applies only when every equally bound packet is among its cites. Otherwise it is a
proposal. In 21_VA the boxes' role (both sequences: the DDC modulates the damper) still applies; CO2 becomes a
proposal for all 57.

**Numbers:** 21_VA 114 applied with 1 wrong before, 57 applied with 0 wrong after. The dev replay is unchanged:
227/244 exact; 291 applied, 0 wrong; the same proposals and unresolved decisions, line for line.

## CI-15: a detail per unit type on one sheet, each with a same-titled sequence (FIXED, next commit)

**What:** 21_VA's reheat boxes and its cooling-only box each have a diagram and a sequence, but the binder could not
tell them apart:
- "VAV BOX WITH HEATING COIL" was read right-headed as a coil, so the reheat diagram bound no VAV box. Its subject is
  the part before "WITH".
- The qualifier "HEATING COIL" is printed in the schedule's header ("REHEAT COIL DATA"), and the row fills it with
  values. Qualifiers were confirmed only from the row's own cells.
- Nothing paired each "VAV BOX SEQUENCE OF OPERATION" with the diagram above it in its column.

**Fix (`evidence.ts`, `binding.ts`, the shared finder and binder):**
- A title's subject is the part before "WITH" when that part names a family ("VAV BOX WITH HEATING COIL" is a VAV
  box's). Otherwise the whole part answers, as before.
- A title that names a variant by a part the unit may carry ("WITH HEATING COIL", "W/ ELECTRIC HEAT", "COOLING ONLY";
  ASHRAE Guideline 36 names VAV terminal units "cooling only" and "with reheat") is checked against the columns the
  unit's schedule gives that part:
  - the row fills most of them: the variant is confirmed;
  - the row fills at most a quarter while another row of the schedule fills most: the unit is the other variant, and
    the title is not its.
  - Otherwise nothing is decided, as before.
- Several same-titled details of one kind left for a unit: the one printed right under or over a detail that is the
  unit's is its, when each other one is printed with a detail that is not.

**Checked:**
- 21_VA: the 56 reheat boxes take "VAV BOX WITH HEATING COIL CONTROL DIAGRAM" and the sequence printed under it;
  VAV-1-16, the cooling-only box, takes its own diagram and sequence.
- Dev: all 11 documents re-snapshotted. Extraction and packets are byte-identical; the binding rows and the replay
  are unchanged (see CI-17 for the one change).
- Unseen: 25 sets re-snapshotted with the change. Extraction and packets are byte-identical on all 25. The binder
  changes only 21_VA's 57 boxes.
- Live, with CI-17, CI-18 and CI-20: 21_VA applies 115 readings, all right. Each box's BAS role (57), each reheat box's
  setpoint adjustment (56), and CO2 for exactly the two boxes its sequence names (CI-18). Before: 57.

## CI-16: the robustness work read a held-out document under another corpus id, and tuned on a held-out drafter's document (PROCESS NOTE, disclosed)

**Found:** 2026-09-26, by a hygiene scan of all 121 staged corpus sets before the next audit batch
(`mcp/scripts/corpus-hygiene.py`, `reports/control-intent/00-corpus-hygiene.md`). The scan reads input PDFs only.

**What:**
- `001_NC_FY20_P_228_ATC_Tower_and_Air_Operations` is byte-identical to held-out `navfac-cherry-point-atc`. The
  robustness sweep and the blind audit excluded held-out documents by corpus id only, so they read it as an unseen set:
  - The sweep's deterministic pass and the binder scans covered it.
  - CI-11 names two of its tags ("AHU-A1" and "DOAH-A1") among the qualifier examples, and its points-list binding
    among the changes checked.
  - The live audit inspected its 30 applied decisions.
  - No fix was made for it. None of its decisions was wrong, and CI-11's qualifier rule has examples from two other
    sets. Its outputs were still seen.
- `27_WA_ColvilleTribes_Hatchery_Lab` names Coffman Engineers on 38 pages. Coffman also drafted held-out
  `30_WA_SpokaneTransit_CoolingTower`. The split keeps each drafter on one side, and CI-12 and CI-13 came from 27_WA.
- `060_XX` shares navfac's drafter group (Burns & McDonnell), so navfac's exposure reaches it by drafter.
- Not held-out, but not unseen either:
  - byte-identical copies of dev documents: 019_FL is federal-mech; 062_ID is itd-d1-lab;
  - near copies that share printed text with a dev document (the report lists them).
  - No audit counted any of these as unseen.

**Consequences:**
- **The keys are unaffected.** The held-out project and binding keys were committed (08ea06d) before the sweep started.
- **The unseen audit tally drops 001_NC:** 14 sets, 127 applied, 127 right.
- **Held-out control-intent results are reported twice.** Once over all six documents. Once over the three with no
  exposure: 018_GA, 024_MO and bessemer. The three exposed are:
  - navfac: its outputs were seen, and CI-11 cites two of its tags;
  - 060_XX: navfac, by the same drafter, was seen;
  - 30_WA: 27_WA, by the same drafter, was tuned on.
- **Robustness work now skips every set the report lists.** A held-out twin is never read. A held-out drafter's set
  is never audited or tuned on. A copy of a dev document counts as dev.

## CI-17: a detail whose own label lists units of its family bound every unit of the family (FIXED, next commit)

**Found:** 2026-09-26, the blind live audit on an unseen set (015_VA, sheet AM704).

**What:** "EXHAUST FAN CONTROLS" is drawn over a diagram labelled "EXHAUST FAN (EF-1, 2, 3, 4, & 5)", with the
fans' motorized intake damper. The title names no tag, so the detail bound every fan by family, including EF-7, a
50 CFM toilet-room roof fan from the gatehouse schedule. R0 and R2 **applied** EF-7's motorized damper from EF-1–5's
diagram: 1 wrong among 27 applied on 12 new unseen sets.

**Fix (`binding.ts`):**
- A printed line that is no sentence and lists two or more scheduled tags is the packet's label list. Lists and
  ranges expand, and a line ending in a list's joiner continues on the line right under it ("TYP. FANS EF-A1, /
  EF-A3, & SEF-A3").
- A unit it lists binds by a new kind, `label_list`. The packet is the unit's own, as a title list's is: its
  evidence need not name the unit. But it is no title: other kinds of detail still bind by family.
- A detail whose label lists other units of the family, and not the unit, is no family detail for it. A label that
  says "ALL" still speaks for all.
- A list in a detail about no one family (an emergency shutdown) names what the system acts on, not its units.

**Checked:**
- Dev: the 657 pair and binding rows are unchanged, except itd-d1-lab EF-4. It loses two false family proposals (a
  general exhaust fan detail that lists other fans), and two other proposals are no longer ambiguous. The replay is
  unchanged (227/244, 291 applied, 0 wrong) after the three model calls EF-4's new prompts asked for were recorded.
- Unseen: 4 sets change, as intended.
  - 015_VA: EF-1–5 are bound by their label, and EF-6, EF-7 and the dampers that serve them lose it.
  - 014_MT: the three fans "TYP. FANS EF-A1, EF-A3, & SEF-A3" lists take their detail; the other five lose it.
  - 061_IA: the supply and return fans lose an exhaust fans' sequence.
  - 062_ID changes as its dev copy does.
- Live:
  - 015_VA applies 7, all right: EF-1–5's dampers, and EF-6's damper and BAS role from its own generator room detail
    (with CI-20). EF-7's wrong damper is gone.
  - EF-6's readings had rested partly on EF-1–5's detail. Its own detail binds it only by its tag in the body. One
    vision run's labels there join two cells of a points table, which the label check accepts only since CI-20.
  - 014_MT gains 6 right (the three fans' damper and BAS role, which their schedule confirms: CONTROL 4 "INTERLOCK TO
    INTAKE CONTROL DAMPER", CONTROL 6 "DDC INTERFACE").
  - Two destratification fans' roles, which had rested on another unit's detail, are proposals now.
  - 061_IA: 8 right readings are proposals now. R1 answered the changed prompts "not shown".

## CI-18: a section headed for particular units was read for every unit of the packet (FIXED, next commit)

**Found:** 2026-09-26, auditing CI-15's first live run (21_VA).

**What:** the reheat boxes' sequence carries "MULTI-PURPOSE ROOM (VAV-1-26 AND VAV-1-29) - AHU-1 VENTILATION
CONTROL:", and its diagram marks the CO2 sensor "MULTI-PURPOSE ROOM A-109 REFER TO FLOOR PLANS FOR LOCATIONS". The
packet is every reheat box's own, so R0 read "THE DDC SYSTEM SHALL MEASURE THE ROOM CO2 LEVEL" for all 56. R2 agreed
from the diagram's typical symbol, and CO2 **applied** to 54 boxes that have none. R1 had answered "not shown". The
earlier note that CO2 on the 56 boxes was a recall cost (CI-14, CI-15) was wrong: it was never applied, and it is
right for two boxes only.

**Fix (`readers/r0.ts`, `record.ts`):** a section whose heading names units by tags of the unit's own letters, and
not the unit, is those units' ("VAV-1-26 AND VAV-1-29"), in any packet:
- R0 does not read its clauses for other units.
- A model answer whose every cite lies in such sections is unverified for them.
- Tags compare as their letters and number groups ("VAV-1-01" is "VAV-1-1"; "VAV-11" is not). A heading naming
  another kind's unit ("AHU-2 ONLY") scopes nothing. R0 is now `control_r0_v5`.

**Checked:**
- Dev: the replay is unchanged (227/244; 291 applied, 0 wrong; the same misses).
- 21_VA: CO2 applies to VAV-1-26 and VAV-1-29 only; the other 54 are proposals.

## CI-19: the eval harness corrupted characters that fell on a 64 KiB pipe read (FIXED in the assemblies scripts, next commit)

**Found:** 2026-09-26. Re-snapshotting dev with CI-15 showed 031_MO's heating coil schedule header "HOT WATER LWT
[°C]" as "HOT WATER LWT [��C]". A cold rebuild gave "°", and every cached sheet graph of the set holds "°".

**What:** the snapshot child writes its JSON to stdout, and `snapshotInChild` collected it with `out += chunk`, which
decodes each pipe read on its own. A two-byte character split across two reads becomes two U+FFFD. Where the reads
split depends only on the output's length: the same snapshot broke the same way every time, and a one-digit change
in a timing field moved the boundary. It looked like nondeterministic extraction. Extraction was never involved.

**Fix:** `mcp/scripts/childText.mjs` decodes a child's whole stdout as one stream. `assemblies-attr-eval.mjs` and
`assemblies-baseline.mjs` use it, and a test fails without it (a child writes "x" and 100,000 "°"). Six other eval
scripts read their children the same way (takeoff-eval, graph-eval, reference-eval, tag-eval, table-box-eval,
table-recall-eval). They belong to other loops and are left as they are, noted for their owners.

**Open:** whether any committed assemblies report was affected. A dev attribute eval through the fixed transport
was run, but reading its result was blocked in this session.

## CI-20: the vision reader's labels read across a points table's row were not found (FIXED, next commit)

**Found:** 2026-09-26, with CI-17 (015_VA EF-6).

**What:** R2 must cite labels printed in the drawing. The model reads a points table's row as one label: "BO-2 INTAKE
DAMPER OPEN/CLOSE", "AO1 RETURN AIR DAMPER COMMAND (%)". The designator and the description are printed in two
cells, two lines of the packet's text, so the check found neither one alone and marked the run unverified. EF-6's
motorized damper and BAS role then rested on one reader.

**Fix (`readers/r2.ts`):** a label not printed in one line or paragraph is looked for in the packet's rows: the lines
on one baseline in their reading frame, left to right. The row's lines are the cite. A label joined across two rows
is still not printed.

**Checked:**
- Dev: the replay is unchanged (227/244; 291 applied, 0 wrong).
- Unseen, 25 sets replayed: 3 more readings apply, all right. 015_VA EF-6's damper and BAS role come from its own
  generator room detail. 009_FL AHU-1's BAS role comes from its points table ("AO4 FAN SPEED COMMAND (%)").


## CI-21: title words that say nothing about which unit left family details as proposals (FIXED, next commit)

**Found:** 2026-09-26. The held-out binding aggregate at 1ae6d2b counts 60 of its 171 missed pairs as "bound as a
proposal only" (aggregate miss reasons, added to the binding eval here; no held-out row was read). A census of the
family details on every non-held-out set with packets (1,198 bindings, 532 of them proposals) shows why.

**What:** C5 makes a family detail a proposal when a title qualifier is not printed in the unit's row. These words
were counted as qualifiers, and none says which unit a detail is for:
- another subject the title joins by AND or "&". "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION" left all 23
  condensing units proposals on "FURNACE", and bound none of the 21 furnaces, since the title's family was read as
  the condensing units' (16_NV). "HEAT PUMP & FAN COIL UNITS SEQUENCE OF OPERATION" did the same (083_MA).
- a union: "VAV/CAV TERMINAL BOX CONTROL SCHEMATIC", 58 boxes (096_IN).
- the family's name in another spelling:
  - "ROOF TOP" repaired to "ROOFTOP" in the title but not in the schedule's title (16_NV);
  - "(HP)" after "HEAT PUMP TERMINAL UNIT", 15 heat pumps (011_IL);
  - "ATU", a terminal unit's designator, 15 units (03_FL);
  - "MAKE UP" (14_OR).
- a bid alternate: "BID ALTERNATE #2", "(BID ALTERNATE 1)", "ALTERNATE 3" (061_IA, 16_NV, 014_MT).
- two-position control: "ON OFF" (088_AZ; bldg5406 prints "ON/OFF").

**Fix (`binding.ts`):**
- A title whose subject parts, joined by AND or "&" within one dash-separated segment, each name a family is a
  family detail for each of them. The words of the other subjects are no qualifiers. "FAN COIL UNIT (HEATING AND
  COOLING)" is one subject, since COOLING names no family.
- "A/B" is no qualifier of a unit whose family is A or B, and is printed when either is.
- The schedule title's words count in either spacing. A standard designator of the unit's family ("ATU", "TU") is
  its own word. An abbreviation a title defines for its own words ("(HP)") adds nothing.
- Bid alternates (CSI MasterFormat 01 23 00 Alternates) and "ON/OFF" are no subject.
- New with it: a detail titled for a family's plain kind is the plain schedule's when the project schedules a
  special kind apart ("SMOKE EXHAUST FAN SCHEDULE" beside "EXHAUST FAN SCHEDULE"). For the special kind's units it
  stays a proposal unless the title names what they add. The same shape is in 015_VA (GATEHOUSE), itd-d1-lab
  (LAB) and 096_IN (AHU RETURN/EXHAUST). Without it, dropping "ON OFF" had bound 088_AZ's four smoke exhaust fans
  to the exhaust fans' on/off detail. Those fans are fire alarm fans.
- Held back: "P&ID" as a drawing kind. With it, 028_TX's "DOAS 1&2 P&ID" bound DOAS-3. The title prints its marks
  with a space ("DOAS 3"), and titles read only hyphenated marks as tags. Number words then counted as qualifiers
  and were confirmed wherever a cell printed the digit (a voltage "460/3/60"). Queued with reading "DOAS 3" as a
  tag.

**Checked:**
- Non-held-out bindings (46 sets with packets, dev included): 143 change. All were checked by hand against the
  drawings and schedules: 122 proposals are confirmed, and 21 furnaces and 3 heat pumps take their two-subject
  sequences. The 11 dev documents' bindings and their evidence are byte-identical.
- The binder test fails without the fix.
- Live, on the six audited sets it changes: 25 → 61 applied, 0 lost, 0 changed. The 36 new are right: 16_NV's 21
  furnaces' fan status ("AND THE SUPPLY FAN STATUS IS ON.") and 03_FL's 15 terminal units' setpoint adjustment ("ZONE
  TEMPERATURE SENSOR WITH SET POINT ADJUSTMENT").
- Live, 28 more unseen sets (batch 5; CI-22 below applied to the tally): 102 applied, all right. 096_IN 66
  (AHU-4's role, relief damper, return fans and economizer; its 58 terminal boxes' occupancy sensors, through the
  "VAV/CAV" schematic CI-21 confirms; two general exhaust fans' role; AHU-4's supply fans' static pressure
  control), 088_AZ 23 (fan coil units' role and setpoint adjustment; chillers' role and isolation valves; exhaust
  fans' role), 077_MT 8, 083_MA 3 (the heat pumps' fan status, through the two-subject sequence), 043_FL 2.
- Held-out, aggregate only: the binding eval is unchanged (pair recall 10.5%). CI-21 confirms none of its 60
  proposal-only pairs.

## CI-22: an agreement counted a reader that read only another unit's detail (FIXED, next commit)

**Found:** 2026-09-26, auditing batch 5 (096_IN).

**What:** CH-1 and CH-2, air-cooled chillers, are bound to their own "AIR COOLED CHILLED WATER CONTROL SCHEMATIC"
by their tags, and to "HEATING RECOVERY CHILLER CONTROL SCHEMATIC" as a C5 proposal ("HEATING", "RECOVERY"
unconfirmed). Their role and chilled water isolation valve **applied**, by R0, R1 and R2 agreeing. But R2's two runs,
and R0 for the role, cited only the heat recovery chiller's schematic: "BO-1 HRC-1 START/STOP", "BO-3 HRC-1 CHILLED
WATER ISOLATION VALVE". That is another unit's evidence. The combiner tested for proposals over the union of the
deciding readers' cites, so one reader in the unit's own packet made every reader count. The four values happen to
be right. Their second vote was not the chillers'.

**Fix (`combine.ts`, `control_combine_v6`):** C5 is applied reader by reader. A reader whose every cite lies in
packets bound to the unit as proposals casts no vote that applies. Two readers must read it in the unit's own
packets, or the agreement is a proposal that names which reader read what.

**Checked:**
- The combiner test fails without the fix.
- Dev: the replay is unchanged: 227/244; 291 applied, 0 wrong; class R 55/71.
- Unseen, all 53 audited sets replayed (no model call): 342 → 338 applied. The 4 are exactly CH-1's and CH-2's role
  and isolation valve. Nothing else changes.

## CI-23: the readers trusted any binding as the unit's own; a packet about other units applied their readings (FIXED, next commit)

**Found:** 2026-09-26, GATE D's adversarial swap (goals/CONTROL_INTENT.md WP4.2): every dev packet the binder binds
to a unit was rebound, with the kind it has, to a unit of another family, as a binder mistake would bind it.

**What:** 74 packets rebound to 71 units. Of the 217 decisions the readers made through them, **104 applied**
(47.9%; the gate allows 1%): 84 absences, 17 agreements of two readers, 1 whitelisted R0 phrase, and 2 decisions of
the zone plan that do not rest on the swap. Examples: VAV-4 bound to "EXHAUST FAN - ON/OFF (EF-1 THRU EF-3)" by a
title range that does not print it read its CO2 sensor, occupancy sensor and reheat as absent, and the fans' "BO - FAN
START/STOP" as its role; BP-2, a pump, bound to "GENERAL EXHAUST FAN SEQUENCE OF OPERATION", took "THIS SYSTEM IS
STANDALONE" as whitelisted. R0 reads a packet bound by a title, a list, a reference or a family as wholly the unit's
own; the combiner reads an absence through any title binding; R1 and R2 are told the packet applies and believe it.
Nothing checked the binder's claim against the packet.

**Fix (`readers/r0.ts` `aboutOthers`, `control_r0_v6`; `record.ts`; `combine.ts`, `control_combine_v7`):** the read
side checks a binding that makes a packet the unit's own against the print. The packet is about other units when:
- its title (with its subtitle) names scheduled units by tag and not the unit, unless it is a family's typical
  detail titled for an example unit of the unit's family;
- the subject its title's head names ("X WITH Y" is about X) is another family, neither one of the title's subjects
  joined by AND nor a part the unit's row prints (a drive: `printsDrive`);
- it is bound as a family detail the binder's own rule would not take: its title names another family, or names none
  and the unit's schedule does not print its subject (`scheduleNamesSubject`).

Such a packet is not the unit's own: only a clause printing the unit's tag speaks for it, R1's and R2's evidence
from it must print the tag or it is unverified, and no absence is read through it. A packet that is not the unit's
own anyway (a system drawing its tag is printed in, its host's packet) keeps the shared packets' rule.

**Checked:**
- Real bindings: over all 86 non-held-out sets with packets (1,969 bindings), the check flags **none**. A first
  version flagged 42 siblings of system drawings (a room "D-1 LAB 123" read as a tag; "LAB VENTILATION WITH SNORKEL
  HOODS" read as hoods); the check now asks only of own bindings and reads the title's head.
- Adversarial swap, dev, replayed where recorded (the rest live, recorded to the scratchpad):
  - another family: 74 packets rebound to 71 units asked 402 questions; **0 applied** through the swap, 0 decisions
    at all; every one of the 55 reader answers citing a swapped packet is unverified. The drive's detail is not
    rebound to a unit whose row prints a VFD: that is the binder's own rule, not a mistake (a first run did, and read
    EF-1B's role right).
  - another tag of the same family: 19 packets titled for units rebound to 18 units the title does not name, 72
    questions; **0 applied**; 26 of 26 answers unverified.
  - The zone plan's two decisions (a CO2 symbol in the zone VAV-1 and VAV-2 label) do not rest on the swap and
    still apply.
- The new R0 + combine test and record test (`readers.test.ts`) fail without the fix.
- Dev: the replay is unchanged, 227/244 (the report is identical). Unseen: all 53 audited sets replayed (no model
  call), 338 applied, byte-identical to CI-22's.

## CI-24: a live re-run changes 7 of 491 dev decisions, each where the text model answers a fresh call differently (MEASURE NOTE, GATE D)

**Found:** 2026-09-26, GATE D's replay item (goals/CONTROL_INTENT.md WP4.2: "a live re-run's decision diff ≤ 2%,
every change explained in the catalogue").

**What:** every dev document read again with fresh model calls (an empty run store; 181 calls, recorded to the
scratchpad, never to the repo) against the recorded replay. 7 of the 491 decisions either run makes change (1.4%),
all in federal-mech. In each, R1 (`gpt-oss-120b`) answered the same request differently. R0 is deterministic,
and R2 cast the same votes (AHU-1's vision run b now says "not shown" where it said nothing: no vote either way).

| Unit, question | Replay → live | R1, replay → live | Key |
|---|---|---|---|
| AHU-1 relief damper | proposal true → none | yes → not shown | false: a wrong proposal is gone |
| AHU-1 enthalpy economizer | applied true → proposal | yes → not shown | true: a right decision drops to a proposal |
| AHU-1 freezestat to BAS | proposal false → applied false | not shown → no (agrees with R0) | false: right, newly applied |
| EF-1 motorized damper | unresolved → applied true | no → not shown (R0 and R2 read yes) | true: right, newly applied |
| EF-4 motorized damper | applied true → unresolved | not shown → no | true: a right decision drops to unresolved |
| UH-1, UH-2 setpoint adjust | applied true → proposal | yes → yes, its quote unverified | typical none: moot |

**Why it is not a defect:** the provider serves R1 with sampling, so a fresh call may differ. The combiner is built
for that: a model alone never applies (C8), and a disagreement leaves a question open (C12). So the variance moves
decisions between applied and proposal or unresolved, and no wrong decision applied. Replaying the recorded runs is
byte-identical (twice, all 11 documents): a saved project reads exactly as it was read.

**Not changed:** the gate's 2% holds. Pinning R1's temperature to 0 would not make the provider deterministic, and it
would change every recorded request (a new prompt version) for no measured gain.

## CI-25: a unit's mark printed with a space named no unit, so "DOAS 3 P&ID" was every DOAS's detail (FIXED, next commit)

**Found:** 2026-09-26, a census of the units bound only by proposals over the non-held-out sets, grouped by why
(223 units after CI-21; most are C5 working: electric cabinet unit heaters kept off a "HOT WATER UNIT HEATER"
detail, condensate pumps off a domestic water booster sequence, supply fans off exhaust schematics). 028_TX's three
DOAS units each took "DOAS 1&2 P&ID", "DOAS 3 P&ID" and "DOAS 3 VAV BOX P&ID" as family-detail proposals, and its
11 fan coils took "FCU P&ID" as one. CI-21 had held "P&ID" back: read as the drawing's kind, it left "3" as a
qualifier, and DOAS-1's row confirmed it by its voltage, "460/3/60".

**What:**
- `titleTags` read a tag only with its hyphen ("DOAS-3"), so a title printing the mark with a space named no unit.
- A bare number left as a qualifier was confirmed by any digit its row printed.

**Fix (`binding.ts`):**
- A mark printed with a space ("DOAS 3", "DOAS 1&2") is a tag when its letters and number make a scheduled
  unit's mark. A number after a word never is otherwise: "LEVEL 2", "VAV 100% OA" beside no VAV-100.
- A number a title prints that no tag reading takes ("BOILER 3" beside boilers marked B-n) names a unit by its mark.
  Only the unit's own mark confirms it, never a digit its row prints elsewhere.
- "P&ID" (piping and instrumentation diagram, ANSI/ISA-5.1) is a drawing's kind, like DIAGRAM: no qualifier.

**Checked:**
- The new binder test fails without the fix.
- Over the 86 non-held-out sets with packets (1,969 bindings), only 028_TX's bindings change:
  - DOAS-1 and DOAS-2 take "DOAS 1&2 P&ID" by their list;
  - DOAS-3 takes "DOAS 3 P&ID" and "DOAS 3 VAV BOX P&ID" by its tag;
  - no DOAS takes another's drawing;
  - the 11 fan coils take "FCU P&ID" as their family's detail.
  1,964 bindings remain, the rest byte-identical. CI-23's check still flags none, and the dev documents' bindings are
  byte-identical.
- 028_TX read live with the fix: 0 → 25 applied, all right against their cites:
  - the three DOAS units' duct smoke detectors (each P&ID's points list prints "DUCT SMOKE DETECTOR");
  - the fan coils' variable speed fan ("INTEGRAL VARIABLE SPEED DIRECT DRIVE SUPPLY AIR FAN");
  - the fan coils' role ("THE BAS SHALL ENERGIZE THE CHILLED WATER COIL").
- The audit now stands at 53 unseen sets, 363 applied, 363 right.

**Watch:** "DOAS 3 VAV BOX P&ID" is the drawing of the boxes DOAS-3 serves, and it names DOAS-3; it is now one of
DOAS-3's own drawings. Nothing it prints was applied to DOAS-3 alone (its smoke detector is read in "DOAS 3 P&ID"
too). A title that names a unit but whose subject is another kind of equipment (the unit as the owner of what the
drawing shows) is left to a later batch, with the census that would size it.

## CI-27: a hydronic plant's drawings bound nothing, so its chillers, boilers and pumps went unread (FIXED, next commit)

**Found:** 2026-09-26, a census of the control packets no unit is bound to over the non-held-out sets: 378 of 651
bind nothing, and 1,123 of 2,296 units have no binding. Most are right: lighting, fire alarm, infection control
and code-analysis "details"; grilles, louvers and tanks; and rows that are no units (21_VA's pump schedule is printed
transposed, so its attribute rows, "PUMP FUNCTION" and "MOTOR VOLTAGE", are read as pumps; that is schedule
extraction and is not touched here). A recurring kind is not right: a plant's system drawing ("CHILLED WATER SYSTEM
SEQUENCE OF OPERATION", "HEATING HOT WATER PLANT POINTS LIST", "HOT WATER DDC CONTROL DIAGRAM", "CHILLER PLANT DDC
POINTS LIST") names no unit family and no tag, so it bound nothing. The chillers, boilers and pumps it governs were
left unbound in 012_MO, 014_MT, 021_XX, 028_TX, 03_FL, 061_IA and 009_FL. Held-out B1 counts 45 of its missed
pairs as "no binding at all"; plant sequences are common in larger projects.

**What:** the binder's family detail needs a title that names the unit's family, or a subject its schedule prints.
It deliberately leaves media out of that ("a title about the hot water system names no unit a hot-water unit
heater's row could print"). So a plant's drawing reached no unit at all, the plant's own equipment included.

**Fix (`binding.ts`, a new kind `system`):**
- A title whose subject is a plant and nothing else names its plant or plants: chilled water, heating water,
  condenser water. Examples: "CHILLED WATER SYSTEM …", "HEATING HOT WATER PLANT …", "HOT WATER DDC CONTROL DIAGRAM",
  "CHILLER AND HOT WATER PLANTS …". A title naming a unit ("CHILLED WATER PUMP SEQUENCE") stays a family detail.
  "DOMESTIC HOT WATER …" and "… HOT WATER COIL CONNECTION DIAGRAM" are no plant's. A title that lists its units is
  theirs alone.
- The plant's equipment takes it:
  - its chillers, boilers (a steam boiler is no heating water plant's) or cooling towers, by kind;
  - its pumps and exchangers by the one plant their service, system, function or fluid column or their schedule
    names ("PRIMARY - CHILLED WATER", "SYSTEM: HOT WATER", "FLUID: CHS", "HWS", "CHILLED WATER PUMP SCHEDULE").
  Never a domestic, heat recovery or unit's coil pump ("HEATING HOT WATER - AHU COIL"), a component of another unit,
  a terminal unit, or a row with no tag. A unit takes it only where no drawing of that packet kind is bound to it
  already; two plant drawings of one kind are ambiguous.
- The drawing stays the plant's, not the unit's own. The readers treat it as a shared system drawing, as they treat
  a drawing the unit's tag is printed in: only its clauses that name the unit (its tag, its kind's noun, its tag's
  words) speak for it, and nothing is read as absent through it. R1 is told it is "the control drawing of the
  hydronic plant this unit is part of".

**Checked:**
- The new binder test fails without the fix.
- Over the non-held-out sets (1,964 bindings before), 39 bindings are added over 7 sets and none changes. Each was
  checked against its drawing: 009_FL's chiller and its two chilled water pumps take "CHILLER PLANT DDC POINTS
  LIST"; 012_MO's chillers and five chilled water pumps take the chilled water sequence; 014_MT's two boilers and two
  hot water pumps take "HOT WATER DDC CONTROL DIAGRAM"; 021_XX's four chillers and four chilled water pumps take its
  two chilled water sequences as ambiguous; 028_TX's chiller and boiler take their plants' sequences; 03_FL's chilled
  water pump takes the chilled water sequence and schematic; 061_IA's two heating hot water pumps take the plant's
  points list (its AHU coil pump does not). The dev documents' bindings are byte-identical.
- The seven sets read live: 7 more readings apply, all right against their cites:
  - 012_MO CH-1, CH-2 and CH-3: role, "THE BAS SHALL CONTROL THE STARTING AND STOPPING OF THE CHILLERS…";
  - their chilled water isolation valves, "THE CHILLED WATER ISOLATION VALVE FOR THE LEAD CHILLER SHALL OPEN…";
  - 03_FL CHWP-1: role, "UPON A CALL FOR COOLING, THE DDC SHALL START THE CHILLED WATER PUMP".
  None was lost.
- The 53 unseen sets replayed: 370 applied, 370 right. Dev replay unchanged: 227/244, 291 applied, 0 wrong.

**Watch:** the readers still leave most plant pumps unread (012_MO's eight): the vision model cites pump labels
("PCHP 1") the drawing prints another way, and the text model does not settle them. That is reader recall, not the
binding. Exchangers whose row names no service (061_IA's steam-to-water HX-A-1 and HX-A-2) stay unbound. A chilled
water sequence often covers the condenser water side too; towers and condenser water pumps join only by a title
that names condenser water.

## CI-28: the text reader's role check took a passive clause's subject for its actor (FOUND; fix held for CI-26)

**Found:** 2026-09-26, a census of the reading questions of the confirmed-bound units on the 53 unseen sets
(replayed, 3,233 questions; 1,574 of the confirmed-bound units' questions settle nothing). Most unsettled questions
are C9 working: an absence read through a family's typical detail is no vote. Of 532 model answers that did not
verify, 170 are R1 role answers whose subject quote "does not make the BAS the one commanding". Most of those are
right to fail (a quote with no actor, "THE EXHAUST FAN MUST BE ENERGIZED"; a point label; "AS SET BY THE DCC").
34 are not: the quote is passive, and the check took its grammatical subject ("THE DOAS SHALL BE CONTROLLED BY THE
BAS" read as THE DOAS acting).

**Fix, drafted and held:** the actor of a clause whose own verb is passive ("SHALL/WILL/MUST BE <verb> BY X") is
its agent X, up to where its phrase ends ("… BY THE DDC SYSTEM TO MAINTAIN …" is THE DDC SYSTEM). A negated
passive has none. Over the 53 sets it verifies those 34 answers and moves 24 decisions from proposal to applied.
23 are right (011_IL's 15 heat pumps, "shall be directly controlled by a … DDC controller"; 009_FL's EF-5 and EF-6;
028_TX's DOAS-1 and DOAS-2; 096_IN's boilers; 044_NY's EF-1 and EF-2). One is not supported: 044_NY EF-5.

**Why held:** 044_NY's finder does not find the title "MAKEUP AIR AND EXHAUST SYSTEM" (a keyword-less system title),
so that detail's notes are part of the packet "EMERGENCY GENERATOR ROOM CONTROLS". EF-5 is bound to that packet by
its tag in the generator room's notes, and its role would apply on the other detail's note, "MAKEUP AIR UNIT AND
EXHAUST FAN SHALL BE CONTROLLED BY THE EXISTING ALC CONTROL SYSTEM". The generator room detail draws no BAS output
for the room exhaust fan and says only "EXHAUST FAN STATUS SHALL BE VERIFIED ON BAS".

A narrower attribution rule was tried and rejected: in a packet that prints other units of the unit's kind, only
a clause printing its tag would speak for it. It blocks EF-5, but it also loses a right decision (03_FL HWP-1's
role, read in its system sequence's "SECONDARY HOT WATER PUMP START/STOP: THE DDC CONTROLLER SHALL START THE HOT
WATER PUMP"), and it would cost system sequences generally. The fix ships with CI-26's finder split.

## CI-29: words that say what a drawing is, and a unit's own variant, left its detail a proposal (FIXED, next commit)

**Found:** 2026-09-26, the proposal census again (209 units bound only by proposals after CI-27), now grouped by
whether another detail contests the unit's and whether its row contradicts the qualifier. Confirming every
uncontested, uncontradicted proposal was measured and rejected: it would confirm a gatehouse fan on "GENERATOR
EXHAUST FAN POINTS LIST" (CI-17's case), condensate pumps on "DOMESTIC WATER BOOSTER PUMP SEQUENCE", exhaust fans on
"DESTRATIFICATION FAN DDC CONTROL DIAGRAM" and general fan coils on "TELECOM ROOM FAN COIL UNITS CONTROL SCHEMATIC".
The qualifier check is doing its work there. Three groups were never qualifiers:
- 14_OR titles its sequences "… - SEQUENCE OF OPERATION & BAS INTERFACE". "INTERFACE" was left as a qualifier, so its
  20 fan coils, 4 DOAS units and 3 electric heaters took their own sequences as proposals.
- 096_IN's "UNIT HEATER (HEATING ONLY) CONTROL SCHEMATIC" and "FAN COIL UNIT (HEATING AND COOLING) CONTROL
  SCHEMATIC": a unit heater's schedule has no cooling columns to confirm "heating only", and "heating and cooling"
  was no variant CI-15 read.
- 030_NY's "2-PIPE FAN COIL UNIT CONTROL DIAGRAM" beside its "TWO-PIPE FAN COIL UNIT SCHEDULE".

**Fix (`binding.ts`):**
- "BAS INTERFACE" (or BMS, DDC, EMS, EMCS, FMCS) says what the drawing is, as "P&ID" does: no qualifier.
- "(HEATING AND COOLING)" names both parts CI-15 reads from the row's coil columns. It is confirmed when the row fills
  both, and contradicted when the row's cooling columns are empty while a peer's are filled.
- A kind that never cools (a unit heater, a cabinet unit heater, finned tube) is its "HEATING ONLY" variant with no
  column to say so; a fan coil that fills its cooling columns is not.
- "2-PIPE" is "TWO-PIPE", and "4-PIPE" is "FOUR-PIPE".

**Checked:**
- The new binder test fails without the fix.
- Over the non-held-out sets, 38 bindings change in 3 sets and none elsewhere:
  - 14_OR's 27 units and 096_IN's 8 take their details as confirmed;
  - 030_NY's two-pipe fan coil takes the two-pipe diagram, and loses the two telecom room diagrams it held as
    ambiguous proposals (its row names no telecom room).
  The dev documents' bindings are byte-identical.
- Read live: 42 more readings apply, all right against their cites and the drawings, and none is lost:
  - 14_OR DOAS-1 to DOAS-4, role: "THE BUILDING AUTOMATION SYSTEM (BAS) WILL SEND OCCUPIED, UNOCCUPIED, OPTIMAL
    START, NIGHT HEAT / COOL AND TIMED OVERRIDE COMMANDS";
  - their duct smoke detectors: "SUPPLY FANS SHALL SHUT DOWN WHENEVER THE RELATED DUCT SMOKE DETECTOR ALARMS";
  - their exhaust fans: "… TO CONTROL ALL DOAS UNIT COMPONENTS INCLUDING SUPPLY FANS, EXHAUST FANS, ENERGY RECOVERY
    WHEEL, AND COIL CONTROL VALVES";
  - their variable speed wheels: "THE ENERGY RECOVERY WHEEL IS ENABLED AND SPEED IS MODULATED VIA VFD AND OUTPUT
    SIGNAL FROM BAS";
  - 14_OR's 18 fan coils, role: the same BAS commands;
  - 096_IN FCU-1 to FCU-3, role: the schematic's AO-1, AO-2 and BO-1;
  - 096_IN CUH-1 to CUH-5 (hot water: 140 °F entering, 110 °F leaving), a modulating valve: "BELOW 55° OAT THE UNIT
    COIL VALVE IS MODULATED TO ACHIEVE A SPACE TEMPERATURE SET AT 70°", printed in the unit heater detail's own column.
- The 53 unseen sets replayed: 412 applied, 412 right. Dev replay unchanged: 227/244; 291 applied, 0 applied-wrong.

**Watch:** the packet "UNIT HEATER (HEATING ONLY) CONTROL SCHEMATIC" also takes in a heat recovery chiller's
sequence printed above it (its region is the finder's, CI-26). Nothing was read from that part for the unit heaters.

## CI-30: "SEQUENCE B1:", a construction phase, bound boiler B-1 by its tag (FIXED, next commit)

**Found:** 2026-09-26, the census of the drawings that bind nothing. 03_FL's lettered sequences ("SEQUENCE "A"",
"SEQUENCE "B1"", "SEQUENCE B1:" … "SEQUENCE D:") are construction phasing notes ("SEQUENCE B1: SCOPE OF WORK WILL BE
LIMITED TO ALL RENOVATION EFFORTS IN BOTH AREAS "B1" AND "B2". TEMPORARY RELOCATION OF OCCUPANTS…"). The finder
takes them as sequences, and the binder read "B1" as the tag of the set's one boiler, B-1. Nothing was applied
through them. The binding was still wrong, and it kept CI-27 from giving B-1 its heating water sequence, since B-1
"had" a sequence.

**Fix (`binding.ts`, `titleTags`):** a bare mark right after SEQUENCE (or SEQ.; a quote, "NO." or "#" between) names
the sequence: a sequence a schedule refers to by letter or number, or a construction phase. It is never a unit's
tag. A hyphenated tag after SEQUENCE ("SEQUENCE AHU-1") and a tag list after "SEQUENCE OF OPERATION:" still name
their units.

**Checked:**
- The new binder test fails without the fix.
- Over the non-held-out sets, only 03_FL's B-1 changes: the two phasing notes drop, and B-1 is bound to "SEQUENCE OF
  OPERATIONS HEATING WATER SYSTEM" and "HOT WATER SYSTEM CONTROL SCHEMATIC", which print its tag ("CONDENSING BOILER
  (B - 1)"). The dev documents' bindings are byte-identical.
- 03_FL read live: 17 applied before and after, none new and none lost. The 53 unseen sets replayed: 412 applied,
  412 right. Dev replay unchanged; held-out B1 unchanged (aggregates).

**Watch:** the finder still takes a phasing note titled "SEQUENCE …" for a sequence of operation (CI-26's finder
batch). Only the false binding is fixed here.

## CI-31: a vision reply the token limit cut off returned nothing, and that run's answers vanished (FIXED, next commit)

**Found:** 2026-09-26, the reader recall census. On confirmed-bound questions, one vision run answered while the
other said nothing 402 times. The recorded replies show why: 37 of the unseen audit's 358 vision calls (10%) and 7
of dev's 126 ended with finish_reason "length" and no content. `qwen-3.8-27b` reasons before it answers, and on
those drawings it spent the whole 16,000-token budget reasoning. A finished call's reasoning runs from a few hundred
tokens to 15,848 (median about 3,500), so 16,000 cuts off the tail. A run with no answers is not a disagreement, but
it blocks an absence (C9 needs both vision runs) and any agreement through the vision reader. The text reader never
hit its limit (154 of 154 unseen, 55 of 55 dev).

**Fix (`readers/r2.ts`, `record.ts`):** a reply that ended at the token limit before it held an answer (its JSON has
no answers list) is asked again: with 32,000 tokens, then, still cut off, with 32,000 and low reasoning effort
(`R2_RETRIES`). Each retry is its own request, recorded and replayed like any other. The first request and every
reply that finished are unchanged, so every recorded run still replays; only the cut-off calls gain a retry. Nothing
about what counts changed: a retry's answers pass the same label check (CI2) and combine the same way.

**Checked:**
- The new record test (a run cut off twice, answered at the third ask; replay needs every ask recorded) and a
  `cutOff` test.
- Live, the retry finishes: dev's 7 cut-off calls all recovered (5 at the first retry, with 11,484 to 17,612
  reasoning tokens; 2 at the second, low effort, with 883 and 1,718).
- Dev, replayed with the retries recorded: 294 applied, 0 applied-wrong (was 291, 0). Absences: 48 applied (was 43).
  Vision run a right 312 (was 304), run b 320 (was 317). Two role decisions become unresolved: federal-mech B-1 and
  B-2 had applied "in" on R0 and R1; a recovered run now says "monitors only" on labels the drawing does not print,
  and an unverified contrary reading holds a decision open (CI2). Typical eval 227/244, unchanged; class R 55/71.
- The unseen audit, live (only the retries, and 01_NY, which now snapshots, called the models): 90 sets, 54 read,
  520 calls replayed and 62 live, none missing or failed. 425 decisions apply, all checked by hand, all right:
  - 14 new decisions, all checked against the drawings (all right). 088_AZ's three cooling towers get their role,
    vibration switches and bypass valve from "COOLING TOWER - CONTROLS" ("BO - Fan Start/Stop", "BI - Vibration
    Switch", "AO - Bypass Valve"). 096_IN's five cabinet unit heaters get setpoint adjustment from the unit heater
    schematic's "ZONE SETPOINT ADJUST".
  - 8 of 096_IN's audited decisions now apply with the recovered vision runs agreeing as well (same values).
  - 1 is held open: 03_FL HWP-1's role, which R0 and R1 read in "THE DDC CONTROLLER SHALL START THE HOT WATER
    PUMP". Both recovered runs say "not connected" on evidence that names no part of the pump, and an unverified
    contrary reading holds a decision open (CI2).
- GATE D (live top-up, a fresh re-run) passes every item but the re-run:
  - negative controls, model-off, raster and cost (188 calls, 1.40 M tokens, at most 102 s a document) pass;
  - the adversarial swaps apply nothing through a swapped packet (56 of 56 and 26 of 26 answers fail
    verification);
  - replay is byte-identical, 11 of 11.
  The re-run changes 14 of 493 decisions (2.8%), above the 2% limit; the last re-run changed 7 of 491 (1.4%). All
  14 are federal-mech, the text and vision models answering a fresh call differently (CI-24), in both directions.
  Two are CI-31's own: B-1 and B-2's roles, held open by the recorded retry's unverified claim, apply in the fresh
  re-run, whose runs say nothing. No decision either run applies is wrong against the dev keys. AHU-1's economizer is not a keyed option, but the key's note records its economizer damper D-6. With the vision model now
  answering calls it used to lose, its variability shows in more decisions. The gate item stays failed as defined;
  it was measured once and is not re-run to pass.
- Held-out (aggregates only, live top-up): the recorded runs had 3 cut-off calls. B2: 5 applied, 5 right, 0 wrong
  (unchanged); 13 proposals right, 6 wrong; 228 abstained. Vision run a: 41 right, 9 wrong, 29 abstained, 2
  unverified (was 28 and 1). GATE C 33/91, unchanged. B1 is not re-measured: no binding changed.
- Tests: web control intent and assemblies 215/215; the new record test fails without the retry.

## CI-32: a held-out drafter's document read as unseen, because its title block prints the firm's logo as an image (PROCESS NOTE; FIXED, next commit)

**Found:** 2026-09-26, while naming the drafter of every eligible unseen document for the assemblies second tier
(AS-17). 038_NC's text layer carries "www.coffman.com" on all 54 sheets, and a render of its title block shows why:
the Coffman Engineers logo is an image, with the Raleigh office's address and web address as text under it. Coffman
drafted held-out `30_WA_SpokaneTransit_CoolingTower`. `corpus-hygiene.py` matched the firm's printed name
(`COFFMAN\s+ENGINEERS`) only, so 038_NC stayed eligible. 034_NC, the same VA project, was already withheld on the
one sheet that spells the name out.

**Exposure:** the unseen audit read 038_NC: 4 scheduled units, 3 control packets, their model runs recorded, 0
decisions applied. No decision there was checked, no fix cites it, and it fed only the aggregate recall censuses.
The exposure of `30_WA` through Coffman was already disclosed (CI-16, through 27_WA).

**Fix:**
- `corpus-hygiene.py`: a held-out firm's pattern also matches its web address (`COFFMAN\.COM`, `BURNSMCD\.COM`).
  The rescan adds 038_NC (54 sheets) and finds 034_NC on 36 sheets (was 1) and 075_MT on 3 (was 1); nothing else
  moves.
- A search of every eligible document's text (up to 300 pages each) for the five held-out firms by the looser
  tokens "COFFMAN", "BURNS … MCDONNELL", "BURNSMCD", "CROCKETT", "TIMBERLAKE", "U.P. ENGINEERS", "UPENGINEERS",
  "STONEVILLE" and "SOUTHEAST AREA" finds 038_NC's address and nothing else. A firm printed only as an image, with
  no name or address in the text layer, is beyond any text scan; the second tier's draw checks the title-block render
  of every document it keys (AS-17).
- `control-intent-unseen-audit.mjs`: a set that is no longer eligible leaves the audit's record with its decisions,
  and the record keeps naming it under `totals.withdrawn`. Before, a full run kept a withdrawn set's old entry as if
  it had not been part of the run. Test: `controlIntentUnseenAudit.test.mjs` (4/4).
- The audit record drops 038_NC at its next run.

**Addendum (same day): three more documents withheld, found on title-block renders.** Naming the drafter of every
eligible document for the assemblies second tier (AS-17), each document's title block was also checked by eye on a
low-resolution render of one sheet. A firm printed only as an image has no text for any scan to find:
- **015_VA** prints the "MN+ BMcD Joint Venture" logo (Moffatt & Nichol with Burns & McDonnell) as an image in its
  NAVFAC Mid-Atlantic title block (AM704), and its text layer holds no form of either name. Burns & McDonnell drafted
  held-out `navfac-cherry-point-atc` (NAVFAC Mid-Atlantic, Chesapeake VA office) and `060_XX`. The audit read 015_VA
  and checked its 7 applied decisions (all right). CI-17 was found on it and CI-20 was checked on its EF-6. Both are
  general rules, each with examples from other sets (014_MT and 061_IA; 009_FL), but a held-out drafter's document
  informed them. navfac and 060_XX were already reported as exposed (CI-16); 018_GA, 024_MO and bessemer are not
  touched by this.
- **021_XX** and **023_US** are USDA Agricultural Research Service in-house designs. 021_XX's title block (M-601) is
  the ARS one, naming ARS project staff and no outside firm, and its text layer is nearly empty; 023_US's names the
  ARS Pacific West Area office in Albany CA. Held-out `018_GA` was drafted by the ARS Southeast Area office. The
  offices differ, but the ARS title block and standards are shared, so both are grouped with 018_GA as one design
  organization: conservative, as the split's drafter rule is. The audit read 021_XX and checked its 6 applied
  decisions (all right); CI-27's plant binder counted it among the seven sets it changed (its chillers and pumps took
  two chilled water sequences as ambiguous, applying nothing there); and the CI-31 live probe ran on it. 023_US was
  read with nothing applied. **018_GA's "no exposure" now carries this caveat:** a document of possibly the same
  design organization was among the examples of one general binder rule.
- `drafters.json` records all three in their held-out drafter's group with the render as evidence, and
  `corpus-hygiene.py` now withholds any set drafters.json places in a held-out drafter's group, as it withholds a
  set whose text names the firm.
- **010_US** is byte-identical to `tinker-afb-iwcs-controls`. Both were counted as unseen sets (both have no
  scheduled units, so no decision was counted twice). The scan now lists a copy of another unseen set, and the
  audit counts the original once.
- No other eligible document shows a held-out firm (Burns & McDonnell, Coffman, Crockett/Timberlake, U.P. Engineers
  & Architects, USDA ARS) in its title block.
- At the audit's next run the record withdraws 015_VA, 021_XX, 023_US, 038_NC and 010_US: 425 applied decisions
  become 412, all right; 90 eligible sets become 85.

