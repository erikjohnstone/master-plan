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

## CI-15: a detail per unit type on one sheet, each with a same-titled sequence (OPEN, recall)

**What:** 21_VA's reheat boxes and its cooling-only box each have a diagram and a sequence, but the binder cannot yet
tell them apart:
- "VAV BOX WITH HEATING COIL" is read right-headed as a coil, so the reheat diagram binds no VAV box. Its subject is
  the part before "WITH".
- The qualifier "HEATING COIL" is printed in the schedule's header ("REHEAT COIL DATA"), and the row fills it with
  values. Qualifiers are confirmed only from the row's own cells, never from its headers.
- Nothing pairs each "VAV BOX SEQUENCE OF OPERATION" with the diagram above it in its column.

With all three, the 56 reheat boxes would read CO2 from their own sequence, and apply it.
