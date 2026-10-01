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

## CI-33: the served vision model scales every image to a 1,536-px edge, so R2 reads large drawings below C7's 200 dpi; tiling them was measured and not adopted (MEASURED; NOT ADOPTED)

**Found:** 2026-09-27, sizing the proposal to tile large drawings for R2 from the recorded runs. R2's prompt tokens
barely grow with the crop: about 2,400 at 1-2 MP and 2,700 at 7-8 MP, text included. A probe of the endpoint settled
why (seven calls, one blank image of each size, `usage.prompt_tokens_details.image_tokens`):

| Image sent | Image tokens |
|---|---|
| 512 × 512 | 256 |
| 1,024 × 1,024 | 1,024 |
| 1,600 × 1,600 | 2,304 |
| 2,048 × 2,048 | 2,304 |
| 3,200 × 2,133 | 1,457 |
| 3,200 × 3,200 | 2,304 |

The served qwen-3.8-27b takes at most 2,304 image tokens of 32 px, so a larger image is scaled down to a 1,536-px long
edge before the model sees it. R2 sends crops of up to 3,200 px (`MAX_LONG_EDGE`), so:
- a region longer than 7.7 inches reaches the model below 200 dpi, whatever its crop's dpi says. A 16-inch packet sent
  at "200 dpi" is read at about 96 dpi, a 36-inch sheet at about 43;
- runs a (200 dpi) and b (250 dpi) of such a region are the same image to the model: one look, twice;
- C9's lowRes flag (a crop below 200 dpi) marks only the regions over 16 inches.

On the 56 drawing packets bound on dev, the model sees a median of about 118 dpi; 19 are below 100 dpi and 14 at 200.

**Legibility, measured (dev packets, no key read):** the model was asked to transcribe every printed text, once from
the crop R2 sends and once from 1,536-px tiles at 200 dpi (6% overlap), and each was scored by word against the
packet's text layer.
- Whole crops read 2,748 of 3,374 printed words (81.4%). 4 of the 56 replies failed outright (cut off or empty, all
  large packets); without those, 96%.
- Tiles read 3,300 (97.8%).
- The gap is the packets the model sees below about 90 dpi: federal-mech's 20#p1 (48 dpi) 77% against 97%, and
  itd-d1-lab's 19#p2 (51 dpi) 68% against 97%.

**Tiling, measured (the dev reading eval, live: 654 new tile calls):** each drawing larger than one 1,536-px image at
the run's dpi was read in overlapping tiles, at most 16 a run. Each tile was asked the same questions about its part,
and the tiles were joined into the drawing's answer: a verified value holds unless another tile's differs, absent
needs every tile to say so, and an unverified tile is a doubt only against a different value.
- R2 alone reads far more: run a right 314 → 405 (abstained 280 → 181), run b right 322 → 412 (abstained 272 → 178).
- It also misreads more: wrong 5 → 20 (a) and 2 → 21 (b), 40 new wrong answers over both runs and 6 fixed.
  - 30 of the 40 are 15 federal-mech VAV boxes read at full resolution, both runs, as drawing no CO2 sensor. Their
    control detail does not draw it; the zone plan does. The combiner casts no vote for an absence read through a
    family detail, so every one of those decisions stays applied and right.
  - 8 are context lost at a tile's edge: a tile showing "AHU-1 BALANCING DIAGRAM (NON-ECONOMIZER)" read as no
    economizer (enthalpy and differential, both runs), a relief fan and damper read from the text beside them (3),
    and a smoke detector cited to label fragments cut at the edge ("SMOK", "DETE").
  - 2 are itd-d1-lab HUM-1's space humidity sensor read as absent from its drawing (both runs); the decision stays
    a proposal.
- Decisions barely move. 294 applied, 0 wrong, before and after; 48 absence decisions, 0 wrong, before and after.
  Three applied decisions are gained (two roles, a freezestat) and three right ones lost: AHU-1's enthalpy economizer
  becomes unresolved on the tile's "no", and two isolation valves become proposals. Proposals wrong 6 → 5, unresolved
  9 → 7.

**Why not adopted:**
- On dev, the answers tiling adds rarely meet an R0 or R1 answer they could confirm, so the decisions are the same.
  Meanwhile each large drawing costs about five times the vision calls (654 new on dev, against 126 before).
- The upside elsewhere is bounded by the same count. Across the 38 non-held sets with recorded runs, only 18 questions
  have a verified R1 answer that a lowRes R2 crop failed to confirm (30 at any resolution), and dev converted none of
  its share.
- The unseen pool's large gap runs the other way: 299 proposals R2 alone reads, where the reader missing is R0 or R1.
  Tiling cannot close it.

**What stays true:** R2's crops reach the model at the resolution above. C7's "at 200 dpi" holds only for regions up to
7.7 inches, and two runs of a larger region are one look. R2's absence decisions rest first on R0 finding no term for
the device in the text layer: 48 on dev and all those audited on the unseen sets, 0 wrong.

## CI-34: a shared drawing's label named a boiler pump by its kind, and the check read it as naming no part of it (FIXED, next commit)

**Found:** 2026-09-27, reading the dev typical misses left after AS-38 (instrument 3 with the keys' project answers
and the recorded readings replayed: 227 of 244). Four are boiler pumps, 069_ID's and itd-d1-lab's BP-1 and BP-2,
each keyed with no typical of its own. 069_ID: "New boiler pump started by its boiler: schematic 'BOILER
INTERLOCK(N)', sequence 'EACH BOILER SHALL ENABLE THE RESPECTIVE BOILER PUMP BEFORE FIRING'. No BAS point on the
pump". itd-d1-lab: "each boiler enables its own pump ('BOILER PUMP INTERLOCK'); the BAS reads the pump status through
a current sensing relay … never commands it". Each takes the pump typical, because its role question ends "not
shown". Replayed, the readers answered:
- **069_ID:** R1 "commands", quoting the heating water pumps' clause ("SEND AN ENABLE COMMAND TO THE LEAD HEATING
  WATER PUMP"). R2, both runs, "commands", citing the schematic's START/STOP, ENABLE/DISABLE and VFD SPEED labels.
  All were unverified, because the evidence comes from drawings the pumps share with the heating water pumps and
  names no part of them. That is right: every one of these readings is about the other pumps.
- **itd-d1-lab:** R2, both runs, "monitors only", citing "CONNECTION TO BUILDING AUTOMATION SYSTEM (BAS)" and
  "BOILER PUMP INTERLOCK". That is the key's reading, and it was unverified the same way. The check (record.ts
  `attributed`, the family of CI-23's defenses) accepts a cite that prints the unit's tag, its family's noun where a
  system has one kind of it, or what its tag's letters stand for ("HOT WATER PUMP" for HWP). BP is in no such list,
  though each pump's own row prints "AREA SERVED: BOILER PUMP (B-1)".

**Fix (shared path: readers/r0.ts and record.ts, which every surface reads through):** what a unit's own schedule row
calls its kind names it too.
- `rowKindWords` reads a cell that says what the unit serves or is for: SERVICE, SERVED, SYSTEM, DESCRIPTION,
  APPLICATION or FUNCTION. It never reads TYPE, which prints how a pump is built, or LOCATION.
- It takes the family's noun and up to three words before it. It stops at a word that names no kind: a duty
  (STANDBY, LEAD), how the pump is built (INLINE, BASE MOUNTED), a small word, or what is left of a tag. "BOILER PUMP
  (B-1)" gives "BOILER PUMP". The noun alone ("PUMP") gives nothing, since it names every pump. The noun must head
  the phrase: "BOILER PUMP ROOM" is a room and gives nothing.
- It applies to pumps only for now, the family that a system holds several kinds of and where the misses are.
- The row's words count wherever the tag's words already count: in a cite of a packet that other units share. They
  never count in a packet titled for other units of the family, where only the tag does.
- R0's own reading does not use them. R0 reads "EACH BOILER SHALL ENABLE THE RESPECTIVE BOILER PUMP" as it did,
  with no BAS command read into it (CI-28's actor question).
- `R0_VERSION` is now control_r0_v7.

**Measured (replay; no model call):**
- The eleven dev documents: two decisions change, both itd-d1-lab's. BP-2's role becomes a proposal, "monitors only"
  (R2 alone, both runs, cited to BOILER PUMP INTERLOCK). BP-1's becomes unresolved and is shown with both sides:
  R2's verified "monitors only" against R1's unverified "commands". 069_ID's stay "not shown", since no reading of
  them names them.
- The 36 eligible unseen sets with recorded runs and a cached snapshot: all 1,504 decisions are identical (176
  applied).
- GATE D, the replayed items: negative controls pass. The adversarial swaps apply nothing through a swapped packet
  (56 of 56 and 26 of 26 answers fail verification, as before). Model-off applies 19 decisions, 0 wrong, and replay
  is byte-identical on 11 of 11 documents.
- The typical eval is unchanged at 227 of 244. The four pumps remain typical misses, because an applied role needs
  two readers to agree and R1 read neither set's boiler pumps. For 069_ID's to be right, the readers would have to
  read that the boiler, not the BAS, enables the pump, and that the schematic draws no point at it.
- Tests (readers.test.ts): "namesUnit: a shared packet names a pump by what its own row calls its kind", on the two
  sets' cells with eleven look-alikes, and "record: a shared drawing's label speaks for the pump whose own row calls
  it by that kind, not for the pump beside it". Disabling the rule fails the second.

## CI-35: the unseen audit's recorded calls fell behind the takeoff, so the units AS-62 to AS-65 added were asked of no model on replay (PROCESS NOTE; FIXED, next commit)

**Found:** 2026-09-28, while re-running the unseen audit after AS-69. From AS-62 (71bca4f) on, the takeoff reads units
on three unseen sets that the audit's recorded runs never asked about:
- 05_MO_VA_StLouis: its 1-VAV-n boxes and 1-TU-28-n terminals (37 → 90 units);
- 041_IL (the VA's Sterile Processing remodel, phase 3): its five VAV boxes, 40-VAV-01 to 40-VAV-05 (7 → 17 units);
- 050_IL (the same project's phase 4): its 1-VAV-01 (2 → 3 units).

The packets that bind them now name them, so each such question is a new prompt, and a replay answers a prompt it has
no recording for with nothing. Every replay run for AS-66 to AS-69 printed "replayed 41, live 0, not recorded 19" and
exited 1. Their entries (AS-66 to AS-69) report that the replay "decides the same (26 applied, 26 right, 0 new,
0 gone)". That was true of the recorded calls, but it said nothing about the new units, whose questions no model had
read.

**Fix:** the 19 calls recorded live on 2026-09-28 (`control-intent-unseen-audit.mjs <corpus> 05_MO… 041_IL… 050_IL…
--live`; R1 gpt-oss-120b, R2 qwen-3.8-27b): 20 live calls, the 19 and one re-ask of a vision reply the token limit
cut off (CI-31), and 4 replayed. Six of 05_MO's recordings that no reading uses any more, its ATU-6 packets' prompts
from before the new units, are pruned. The 30 new decisions are all on the new VAV boxes. Each was checked by hand
against its cites and the drawing, and all are right:
- **The drawings:** each set has one sheet with the VAV TERMINAL SCHEMATIC, its SEQUENCE OF OPERATION and the VAV
  TERMINAL POINTS LIST: 041_IL's M-502-3 (p24) and 050_IL's MH-101-4 (p17). Each box's schedule row cites note 2,
  "DIGITAL CONTROL SEQUENCE SHALL BE AS PER SEQUENCE OF OPERATION PROVIDED ON DRAWING" M-502-3 (MH-101-4).
- **role "in"** (R1 and both R2 runs; R0 answered "not shown") on all six boxes. 041_IL cites "WHEN ZONE TEMPERATURE IS
  GREATER THAN ITS COOLING SETPOINT, THE ZONE DAMPER SHALL MODULATE BETWEEN THE MINIMUM AIRFLOW (ADJ.) AND THE
  MAXIMUM…". 050_IL cites "THE CONTROLLER SHALL MEASURE THE ZONE TEMPERATURE AND MODULATE THE REHEATING COIL VALVE".
  The points list makes the zone damper and the reheating valve hardware outputs (AO).
- **setpoint_adjust true** (R0 and R1) cites "ZONE SETPOINT ADJUST: THE OCCUPANT SHALL BE ABLE TO ADJUST THE ZONE
  TEMPERATURE HEATING AND COOLING SETPOINTS AT THE ZONE SENSOR". The schematic prints "AI - ZONE SETPOINT ADJUST"
  and the points list ZONE TEMPERATURE SETPOINT (AI).
- **co2_sensor, window_switch and scr_heat false** (absence; all four readers found none):
  - the points list (4 AI, 2 AO) has no CO2, window or electric heat point;
  - each box's schedule row gives it a hot water reheat coil (one or two rows, 140 °F entering water), and no
    electric heat;
  - the HVAC plans (041_IL p20, 050_IL p17) give each box's zone a temperature sensor (T) and a "TEMP TRAC ROOM
    MONITOR" (key note 05; 04 on 050_IL), and no CO2 sensor or window switch;
  - the only CO2 on either set is the plumbing legend's gas and the mechanical symbol legend.
- **05_MO:** the new calls, for its 1-VAV-n and 1-TU-28-n boxes and the ATU-6 packets that now name them, apply nothing
  new. Its two audited decisions (AC-57's) are unchanged.

**The record now** (a full run over all 32 eligible sets, `--report`): 61 calls replayed, none live, unrecorded or
failed; 56 applied, all audited, 56 right, 0 wrong; 0 new, 0 gone.
- 11 sets are read (10 before). 02_UT is no longer read: AS-66 took its only unit, SPF, which its key does not count.
  039_TX (186 units) and 087_US (1) now are, since the takeoff reads their marks (none when the record was last
  written, at 8243407). Neither needs a model call or applies a decision.
- 014_MT has 60 units (42 when it was recorded) and decides as before.
- 058_CA still has no snapshot: building it runs out of memory here, as before.

**Process:** a change that adds or removes units on an unseen set changes the prompts of the packets bound to them.
Its replay then prints "not recorded N" and exits 1, and "decides the same" covers only the recorded calls. From
here, a change's entry quotes the replay's model-call line. A replay with unrecorded calls is recorded live, and its
new decisions are audited, before the change's control-intent numbers are called unchanged.

## CI-36: binding tier 2: ten more drafters' documents, and the binder bound 61% of their keyed pairs (MEASURE NOTE)

**Found:** 2026-09-29. The first tier's dev keys cover 11 documents, and its held-out side is essentially three
(CI-16), so how the binder generalizes had barely been measured. The second tier (`reports/control-intent/binding-tier2/`,
5b473eb, 243a31b) draws ten dev documents by seed 181 from the assemblies tiers' documents that print HVAC control
drawings and that this work had already read. Every such document it had not read is held out: nine documents,
scored in aggregate only. All nineteen were keyed from their control sheets before any binder run on them.

**Cold numbers (the binder at 243a31b):**
- dev 2 (272 instances, 629 keyed pairs): pair recall 61.2% (385/629), precision 94.3% over 331 confirmed bindings,
  unit recall 86.5%.
  - Missed pairs by cause: 88 the finder never found the key's packet; 77 the unit bound to other kinds of packet
    only; 30 bound to another packet of that kind; 23 no binding though the tag was read; 19 a proposal only;
    4 instances unmatched; 3 no binding and the tag not read.
- Held-out 2 (aggregates): 23.1% (34/147), precision 76.6% over 47.
- The first tier's held-out (aggregates): 11.0% (21/191), precision 100% over 18.

What the misses were, and what was done: CI-37 to CI-43. The first cut of that batch lost precision on the held-out
side: CI-44.

## CI-37: a qualified mark in a drawing's text ("GWP-A-1", "OAU-B1", "WHSE-P2") was never read, and a schedule's own designator was not asked whose it is (FIXED, next commit)

**Found:** 2026-09-29, dev 2 and dev.
- 061_IA labels its pumps, exchangers and fans by kind, group and number ("GWP-A-1", "HWP-A-2", "HX-A-1") in the heat
  recovery and heating water sequences. The body reader took a tag as letters, a dash and a number, so none was read.
- 031_MO labels "WHSE-HX-1" and "WHSE-P2" in its DUAL HEAT EXCHANGER CONTROLS (HEATING SYSTEM).
- Reading them unguarded bound 10 wrong units on 16_NV. That set marks an outdoor air unit, a furnace and a condensing
  unit all "B1", and prints "OAU-B1" and "EF-B1" in its drawings: every B1 took both.

**Fix (`binding.ts`):**
- The body reader reads a qualified mark as one tag, as titles already did.
- A qualified mark names only the units its designator fits. The unit's schedule decides that where it prints the
  designator over its mark column (16_NV's "OAU ~", "F ~", "CU ~": `scheduleDesignator`); otherwise the standard
  prefix words decide, as before.

**Numbers:** dev 2 +10 pairs, 0 wrong; dev +3 pairs.
- 1 wrong on dev: 031_MO's drawing labels "WHSE-P1" for a pump its key, from the schedule, says the detail does not
  draw.
- 4 wrong on 061_IA: its heat recovery and AHU packets' regions overlap, so the labels in the overlap bind both
  packets. That is the finder's region, not the binder's reading.

## CI-38: a schedule's CONTROL SEQUENCE column named a sequence the binder never looked for (FIXED, next commit)

**Found:** 2026-09-29, 01_NY. Each VAV box row prints CONTROL SEQUENCE A, B or C. The AHU's sequence sheet prints
"A. CONTROL SEQUENCE A (CONSTANT VOLUME WITH REHEAT):", "B. …" and "C. …". The key binds all 25 boxes to that
sequence by cross-reference. The binder read no such column.

**Fix:** a column headed SEQUENCE, SEQ or SOO with a short designator binds the one packet that prints that
sequence's heading ("SEQUENCE B (", "SEQUENCE NO. 3:"), as a cross-reference to a section. When two packets print
the heading, neither is bound. The section does not make the unit "named": its other kinds of packet still bind as
before (the boxes keep their terminal unit diagram).

**Numbers:** dev 2 +25 pairs, 0 wrong.

## CI-39: a terminal box's power-supply schematic was dropped as a less specific variant of its control schematic, and "VAV/CAV/AFCV" named no family (FIXED, next commit)

**Found:** 2026-09-29, 096_IN. M902 prints "VAV/CAV TERMINAL BOX CONTROL SCHEMATIC" and "TERMINAL BOX VAV/CAV/AFCV
POWER SUPPLY CONTROL SCHEMATIC". The key gives every one of the 30 boxes both. Two things kept the second away:
- the finder's family read of its title stops at the three-member union;
- its words POWER SUPPLY were read as an unconfirmed qualifier, and the confirmed schematic beside it outranked it.

**Fix:**
- A union of designators names the family its members name, when they name exactly one (`familyOf`).
- A drawing of one aspect of the kind's controls (POWER SUPPLY, POWER WIRING, WIRING, TRANSFORMER) is no variant.
  It is weighed beside the control diagram, not against it, and its aspect words are no qualifiers.

**Numbers:** dev 2 +30 pairs, 0 wrong.

## CI-40: split systems: the outdoor unit's own row named its indoor half, and a two-subject title bound a condensing unit that serves another kind (FIXED, next commit)

**Found:** 2026-09-29, 16_NV.
- Its condensing units say whose they are: "SERVICE: F-C1 AND EC-C1" (the furnace marked C1, and a coil the set does
  not schedule). The pairing read only an indoor row naming its outdoor unit. So the 21 condensing units never took
  the FURNACE CONTROL DIAGRAM that draws them: the key's 21 missed pairs.
- Two condensing units, BO1 and BO2, serve the outdoor air unit ("SERVICE: OAU-B1"). They took "FURNACE AND
  CONDENSING UNIT SEQUENCE OF OPERATION" by family, and that was wrong.

**Fix:**
- An outdoor unit's row that names exactly one indoor unit pairs them.
- A split system's outdoor unit that has a packet of its own takes its indoor unit's packets of the kinds it has
  none of, as `component_of`. Its own proposals stay.
- A title joining two subjects is an outdoor unit's only when it also names the indoor half that unit serves.

**Numbers:** dev 2 +21 pairs, 2 wrong bindings gone. BO1 and BO2 now bind nothing (CI-44).

## CI-41: siblings were compared with their tag lists, and a label list in a unit's detail printed only its first unit (FIXED, next commit)

**Found:** 2026-09-29.
- **Siblings.** 009_FL prints "LAB EXHAUST FAN CONTROLS (EF-1, 2, & 3)" beside "LAB EXHAUST FANS DDC POINTS LIST",
  and 01_NY prints its AHU's diagram and sequence under titles that differ by their tags. Sibling subjects were
  compared with the tags in them.
  - Fix: they are compared without tags and lists, when the other title names no other scheduled unit. A family's
    typical detail (one that some unit of the family with no title of its own takes by family) is never a named
    unit's sibling.
- **Label lists.** 06_MO labels its VRF cassette diagram "FCU-1&2". FCU-1 bound as a label; FCU-2 did not, because
  lists were expanded only in a detail titled for the unit's family.
  - Fix: a label list prints each unit it lists, in a detail about their kind: its family's, or a title of no family
    whose subject the row prints ("CASSETTE" in the fan coils' description). The detail must name no other kind of
    unit. A first cut that read lists in any detail bound fans that an emergency shutdown diagram and an AHU's
    diagram list (federal-mech, 040_IL), and those are references.

**Numbers:** dev 2 +6 pairs, 0 wrong.

## CI-42: a chiller plant's drawing that describes its condenser water loop, and a row's service that names what a drawing is about (FIXED, next commit)

**Found:** 2026-09-29.
- **Condenser water.** 012_MO's CHILLED WATER SYSTEM SEQUENCE OF OPERATION says "THE CONDENSER WATER SYSTEM INCLUDES
  THE CHILLERS, THREE (3) COOLING TOWERS, THREE (3) CONDENSER WATER PUMPS" and runs a COOLING TOWER OPERATION
  section. The plant rule (CI-27) read its title as the chilled water plant's only.
  - Fix: a chilled water plant's drawing that names the condenser water gear (COOLING TOWER, CONDENSER WATER
    PUMP/SYSTEM/LOOP) binds that loop's members too.
- **Service.** 096_IN's heat recovery chiller pumps print "SYSTEM: HEAT RECOVERY CHILLER CHILLED WATER SIDE" under
  "HEATING RECOVERY CHILLER CONTROL SCHEMATIC". 061_IA's heat recovery pumps print "SERVICE: HEAT RECOVERY -
  CONDENSER" under "BID ALTERNATE #1 HEAT RECOVERY PLANT POINTS LIST".
  - Fix: a row's service cell that prints a drawing's whole subject binds that drawing as the system the unit
    serves. The subject must be two words or more, set apart from the plant nouns and a verb's -ING. The binding is
    `system`, made only where no packet of that kind binds the unit, and never for a hydronic plant's drawing (the
    plant rule's). A domestic hot water recirculation pump now takes the domestic hot water sequence this way. The
    plant rule's test keeps it off the heating plant's drawings.

**Numbers:** dev 2 +14 pairs, 0 wrong.

## CI-43: a fan its schedule describes as part of the set's one air handler never took the air handler's points list (FIXED, next commit)

**Found:** 2026-09-29, 061_IA. Its EQUIPMENT SCHEDULE describes SF-1 to SF-6 as "AHU SUPPLY FAN" and RF-1 to RF-4 as
"AHU RETURN FAN". The set schedules one air handler, AHU-A. The fans are printed in the AHU's schematic (sheet 56),
and the key gives them the AHU POINTS LIST (sheet 57). A sibling on another sheet (the set's one packet of another
kind about the same subject) would reach it too. It was measured and not adopted: +10 pairs, but it carried the
overlapping regions of CI-37 into the points list (4 wrong) and cost 2 pairs of the heating plant's points list.

**Fix:** a unit that has a packet of its own, and whose DESCRIPTION or TYPE puts it in the set's one AHU or RTU,
takes that unit's packets of the kinds it has none of, as `component_of`. With two air handlers, nothing is taken.

**Numbers:** dev 2 +10 pairs, 0 wrong.

## CI-44: the first cut of CI-40 and CI-43 replaced units' own proposals with another unit's packets, and the first tier's held-out precision fell to 59% (FOUND AND NARROWED BEFORE COMMIT; DISCLOSED)

**Found:** 2026-09-29, the first tier's held-out binding eval, read in aggregate only. The first cut of CI-37, CI-40
and CI-43 gave the `component_of` rule three new ways to find a unit's host:
- a qualified mark in a SERVICE or LOCATION cell;
- the outdoor unit's own row;
- a description naming the set's one air handler.

That rule, for a unit with no confirmed packet, replaces everything the unit has, its own proposals included, with
the host's packets. On the held-out side:

| | pair recall | precision | notes |
|---|---:|---:|---|
| before | 11.0% (21/191) | 100% over 18 | |
| first cut | 26.7% | 58.9% over 73 | 27 `component_of` bindings, none right; proposal hits fell 60 → 1 |

No held-out row was opened. The aggregate tables by binding kind and miss reason located it. Every non-held-out
snapshot the scratchpad holds (98 corpus documents and 65 unseen) was then diffed old binder against new, and
nothing like it appeared: the three new host sources fire on dev 2 alone.

**Change, on principle:**
- The three new sources only add packets of the kinds a unit lacks, to a unit that already has a confirmed packet of
  its own. Its proposals stay.
- The replacing rule keeps exactly its old sources: a location or service cell read as before, and the indoor row's
  pairing. BO1 and BO2 on 16_NV lose their 2 pairs.

**Disclosure:** this narrowing was prompted by a held-out aggregate. The first tier's held-out side has now informed
one binder decision (where inherited packets may replace a unit's own), and it is no clean estimate of that rule from
here. Held-out 2 was unchanged by both cuts, so it informed nothing.

## CI-45: binding tier 2 after CI-37 to CI-44 (MEASURE NOTE)

**Binding eval** (`control-intent-binding-eval.mjs --report`):

| side | pair recall | precision | unit recall |
|---|---|---|---|
| dev 2 | 79.7% (501/629; was 61.2%) | 95.3% over 448 (was 94.3% over 331) | 91.7% (was 86.5%) |
| dev (first tier) | 93.8% (303/323; was 92.9%) | 92.5% over 345 (was 92.9% over 340) | 93.3% (was 91.9%) |
| the first tier's held-out (aggregates) | 26.7% (51/191; was 11.0%) | 93.5% over 46 (was 100% over 18) | 44.7% (was 20.0%) |
| held-out 2 (aggregates) | 23.1% (34/147), unchanged | 76.6%, unchanged | |

- dev 2's remaining misses: 88 the finder never found the key's packet (CI-26, held); 19 proposals whose qualifier
  the row does not print (C5: "WITH BAROMETRIC RELIEF", "C-WING", "SWITCH CONTROLLED"). Confirming them all would be
  unsafe on these same tiers: the unconfirmed qualifiers of 14 other proposals are right to hold them, among them
  061_IA's supply and return fans under BID ALTERNATE #2 EXHAUST FAN POINTS LIST and itd-d1-lab's EF-6 under HEAT
  RELIEF FAN SEQUENCE OF OPERATION. 5 other kinds only;
  5 no binding; 4 another packet of that kind (CI-37's overlap); 4 instances unmatched (061_IA's EF-2 and EF-3 sit in
  a table the compile titles differently from the key); 3 tag not read.
- The first tier's held-out side gains its pairs from tags read in a drawing's text: tag pairs 6 → 23 of 59, list
  pairs 7 → 13 of 16.

**Other instruments:**
- **Unseen audit (CI-35's process).** The replay printed "replayed 54, live 0, not recorded 17": 014_MT's unit heaters
  now bind the BURN CHAMBER DDC CONTROL DIAGRAM that prints HWUH-A1 and HWUH-A2.
  - The 17 calls were recorded live (R1 gpt-oss-120b, R2 qwen-3.8-27b). The five decisions they change (HWUH-A1 to
    A5 role "in", now read by all three readers) were checked by hand against the HOT WATER UNIT HEATER DDC CONTROL
    DETAIL (p28): LOW VOLTAGE BO ENABLE, FAN MOTOR HWUH, TYP. ALL. All five are right.
  - The record now: replayed 71, live 0, not recorded 0; 56 applied, 56 audited, 56 right, 0 wrong.
- **Reading eval** (new requests recorded live):
  - dev: 294 applied, all right, 0 wrong, 0 invented. Proposals right 48 (was 47), wrong 6. R-exact 55/71, unchanged
    (its gate fails as before).
  - held-out (aggregates): 5 applied, 0 wrong, 0 invented. Proposals right 16 (was 13), wrong 3 (was 6).
- **GATE D** (`--live --report`): negative controls, both adversarial swaps, model-off, replay, cost and raster pass.
  - Family swap: 78 packets rebound to 75 units asked 442 questions; no decision rests on a swapped packet.
  - Re-run fails as it did (CI-24): 20 of 566 decisions change on a fresh call (3.5%; the committed report had 14 of
    493). Each change is a reader answering differently on a unit whose bindings this batch did not change (040_IL's
    UH-1 to UH-6: R1 "not shown" when recorded, "monitors only" now).
- **GATE C** (the typical eval with the keys' project answers and the recorded readings):
  - dev: 227/244 exact, as before.
  - held-out (aggregates): 35/91, as at 9a83964. Its missed options now split 45 nothing read, 12 no reading question,
    7 on units bound to no control packet (14 at CI-31), 5 proposals only.
- **Guard** (in the worktree the evals run in, whose `session.ts` is held at ef543cf's content for the graph cache):
  - web: typecheck, lint, and `npm test` 3,991 tests (+9), failing only the 3 AS-1 tests, as before.
  - mcp: typecheck; `test:bas` 189/189; the suite 377 of 388. The 8 AS-89 and AS-90 sweep tests need the committed
    `session.ts`, and pass with it and this binder. The other 2 are the known AS-1 conformance test and navfac's
    `sweep_schedule_row` timeout.
  - The shared-path parity tests pass and fail test for test the same with the binder before this batch and after it.

## CI-46: a "variable volume" terminal unit detail, a dual duct box and a hyphenated family name (FIXED, next commit)

**Found:** the dev-2 miss list and a survey of every proposal the binder left over the 89 non-held-out cached
documents (355 proposals on 20 documents), read by qualifier.

- "VARIABLE VOLUME AIR TERMINAL UNIT CONTROL DIAGRAM" (031_MO M-400, 05_MO M-7xx detail 1): VARIABLE and VOLUME were
  two qualifiers a VAV row never prints, so 45 terminal-unit bindings on 031_MO and 05_MO stayed proposals. The
  synonym list read "VARIABLE AIR VOLUME" and "VAV" as one meaning, never "VARIABLE VOLUME".
- 05_MO also schedules dual duct boxes apart from its single duct boxes, and its dual duct detail (detail 3,
  "DUAL-DUCT AIR TERMINAL UNIT DIAGRAM") is a finder miss (CI-26). Read as the family's own name alone, "variable
  volume" would have handed that sheet's single duct diagram to the 15 dual duct boxes. DUAL was dropped as a count
  ("DUAL HEAT EXCHANGER"), so a dual duct schedule was no kind apart from a single duct one.
- "DE-HUMIDIFIER SEQUENCE" (030_NY): the family's own name, hyphenated, was a qualifier.

**Change:**
- "VARIABLE VOLUME" joins "VARIABLE AIR VOLUME" and "VAV".
- DUAL DUCT (DUAL-DUCT, DOUBLE DUCT) is one kind phrase: a dual duct schedule is apart from a single duct one, and a
  detail titled for plain terminal units is a dual duct box's only as a proposal. "DUAL MAXIMUM" confirms no dual duct.
- A qualifier that is the unit's own name in another spelling (hyphens) is none.

**Tests** (`evidence.test.ts`): a variable volume detail is a VAV box's; a dual duct box scheduled apart takes it only
as a proposal; DUAL MAXIMUM is no dual duct; DOUBLE DUCT is its own kind; DE-HUMIDIFIER. Each mutation fails a test.

## CI-47: a sequence column that names the sequence by what it does ("CONSTANT VOLUME") (FIXED, next commit)

**Found with CI-46:** 05_MO's 1-TU-28-1 to 4 print CONTROL TYPE "VAV" and CONTROL SEQUENCE "CONSTANT VOLUME" (min =
max 2500 CFM). CI-38 read a sequence column's letter ("B"), never a phrase, and with CI-46 the variable volume
diagram named their row's whole subject through CONTROL TYPE, so it beat the constant volume diagram. Min = max is no
test: ATU-6-4 to 7 print min = max under a DUAL MAX sequence.

**Change:** a sequence column's phrase of two or more words binds, of each kind, the one untagged detail of the
unit's family whose title prints it, beside another of that kind that does not, as a section (cross_reference). It
chooses for that row only, never for its schedule's other rows; never through the family's own name ("VARIABLE AIR
VOLUME" of a VAV box); never a detail the row's parts contradict. 05_MO's four constant volume boxes keep the constant
volume diagram; its DUAL MAX boxes take the variable volume one.

## CI-48: an air handler variant its row confirms by its columns, or by the terminal units it serves (FIXED, next commit)

- 031_MO's WHSE-AHU-1 (the set's one air handler) takes M-401's "VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM
  OUTSIDE AIR" diagram, sequence and points list only as proposals: its row prints no "MINIMUM" or "OUTSIDE AIR"
  (it prints "AIR FLOW MIN OA CFM 1920" under a column header, and headers never confirm, CI-13). Its four parts
  (WHSE-SF1, RF1, CC-1, PHC1), which the key gives the air handler's sequence and points list, took nothing: a part
  inherits only confirmed packets (CI-44).
- 06_MO's ACU-6, the set's one rooftop unit, takes "VAV ROOFTOP UNIT CONTROLS DIAGRAM" and its sequence and control
  summary only as proposals, though the set schedules nine VAV boxes (their airflow sums to the unit's 3,520 CFM).

**Change:**
- A part (PARTS, CI-15) for minimum outdoor air: "WITH MINIMUM OUTSIDE AIR" in a title is confirmed by the row filling
  a minimum outdoor airflow column (a CFM, L/S, FLOW or % column; never a temperature).
- An air handler serves VAV terminal units: VAV rows naming it as their system, or the set's one air handler where the
  set schedules VAV units, confirm a VAV qualifier. Never where its own row prints a constant volume, and never through
  the one-air-handler reading where a VAV row names another unit as its system.

## CI-49: a part its location names in any spacing; a pump of a water system is no part of the air handler it serves (FIXED, next commit)

- WHSE-SF1's LOCATION prints "WHSE-AHU1": a unit's mark without its dash was no unit in a row's cells.
- WHSE-P4 ("AREA AND/OR BLDG SERVED: WHSE-AHU-1", "SYSTEM AND/OR SERVICE: PREHEAT WATER"), the preheat coil's pump,
  took the air handler's three packets once CI-48 confirmed them. The key gives it none, and M-401 draws no pump.

**Change:**
- A mark in a column that names a unit's owner, location or system is read in any spacing (two letters or more;
  "B1" alone is a room or a level as often as a unit). Everywhere else, as before, only with its dash: a panel "HP1"
  pairs no heat pump.
- A unit whose system cells name a fluid system (water, steam, glycol, refrigerant, fuel...) and no unit is part of
  that piping: what its row says it serves is not its owner. A return fan whose SERVICE is "RETURN AIR" still is.

## CI-50: measured and not adopted: a unit with no binding inheriting through the indoor unit its row serves

16_NV's condensing units BO1 and BO2 ("SERVICE: OAU-B1", read by the designator, CI-37) have no binding, and the key
gives them the outdoor air unit's "BUILDING B OUTSIDE AIR CONTROL DIAGRAM". Letting a unit with no binding at all take
its served indoor unit's packets gains those 2 dev-2 pairs, changes nothing else over the 89 cached documents, and
does not replace a proposal. It reverses CI-44's narrowing, though, which a held-out aggregate prompted and which a
committed test pins ("with no packet of its own, it takes none through the pairing"). Whether the empty-unit case
caused part of that first cut's 27 wrong inherited bindings is unknown without reading the held-out side again, so it
stays out.

## CI-51: a duct smoke detector its unit's points list omits is no BAS point (FIXED, next commit; R0 v8)

**Found:** CI-48 confirmed 031_MO's air handler drawings, and the reading eval then applied WHSE-AHU-1's
duct_smoke_detectors = true, wrong: R0 and R1 read "WHEN SMOKE IS DETECTED BY DUCT SMOKE DETECTOR, SD, ... AN ALARM
SIGNAL SHALL BE TRANSMITTED TO THE FIRE ALARM SYSTEM" as the option. The option is "supply and return duct smoke
detectors monitored by the BAS" (term list v2), and M-401's points list, the air handler's BAS points, lists none.
The dev keys read it so throughout: bldg5406's and federal-mech's are true where their points schedules list the
detectors; 031_MO's is false.

**Change (readers/r0.ts, control_r0_v8):** for an option whose device is a point the BAS monitors (POINTS_DECIDE:
duct_smoke_detectors), the unit's own confirmed points list decides. Where the unit has one and it lists no point for
the device, R0 reads "no", citing the list. With R1's "yes" the question is unresolved (both sides shown), no longer
applied. **Tests** (`readers.test.ts`): omitted, listed, a proposal's list, and an option outside the set; each
mutation fails.

## CI-52: an independent review of the first cut before commit (PROCESS NOTE)

An adversarial review of the first cut (a separate agent, read-only, barred from evidence.ts and the held-out side;
its findings reproduced here before any change) found eight problems, all fixed with a test each:
1. The sequence phrase matched through synonyms (a VAV box's "VARIABLE AIR VOLUME" took "VAV BOX CONTROL DIAGRAM"),
   and its choice fed the schedule's chosen packets, so the schedule's other rows lost the packet by family.
2. Any header with SERVICE or SYSTEM ("MOTOR SERVICE FACTOR") counted as the unit's system.
3. "DUAL MAXIMUM" confirmed DUAL, so a single duct box took a dual duct detail.
4. "DOUBLE DUCT" regressed to a proposal.
5. The one-air-handler VAV reading ignored an air handler printing CONSTANT VOLUME and a VAV row naming another system.
6. The minimum outdoor air column matched "MIN OA TEMP".
7. Marks without a dash were read in every cell, so a panel "HP1" paired a fan coil with heat pump HP-1.
8. DUAL-DUCT was only partly a kind.

A last guard found by typecheck: `cells.flatMap(namedUnits)` passed the cell's index as the column flag, so every cell
but the first read marks without a dash. It changed no binding over the 89 documents; the test now puts the panel cell
second. Three guards that no test could tell from the rest were removed (literal phrase matching, a header word list,
a temperature exclusion): another guard already covers each.

## CI-53: binder batch 3 (MEASURE NOTE)

**Binding eval** (`--report`; held-out in aggregate only):

| side | pair recall | precision | unit recall |
|---|---|---|---|
| dev (first tier) | 96.9% (313/323; was 93.8%) | 91.4% over 360 (was 92.5% over 345) | 95.7% (was 93.3%) |
| dev 2 | 80.1% (504/629; was 79.7%) | 95.3% over 449 (was 95.3% over 448) | 92.1% (was 91.7%) |
| the first tier's held-out (aggregates) | 26.7% (51/191), unchanged | 93.5% over 46, unchanged | |
| held-out 2 (aggregates) | 23.1%, unchanged | 76.6%, unchanged | |

- dev's precision: 5 of the 15 new confirmed bindings are 031_MO's "VARIABLE AIR VOLUME AIR HANDLING UNIT WITH
  MINIMUM OUTSIDE AIR CONTROL DIAGRAM" (M-401 detail 1, drawn above the air handler's sequence and beside its points
  list, both keyed), for WHSE-AHU-1 and its four parts. The key omits the diagram for them. **Key disagreement,
  catalogued, the key not edited:** read on the sheet, the diagram is the set's one air handler's control diagram.
- Over the 89 non-held-out cached documents, 44 units' bindings change on 5 documents, each read against its drawing
  and right: 031_MO's air handler, its four parts and 13 terminal units; 05_MO's 21 single duct boxes (4 constant
  volume, 17 DUAL MAX); 03_FL's AHU-1 and AHU-2 (their schedule is titled VARIABLE VOLUME AIR HANDLING UNIT; the VAV
  AHU diagram and sequence replace a coil piping detail); 06_MO's ACU-6; 030_NY's two dehumidifiers.

**Reading eval:** dev 296 applied (was 294), 0 wrong, 0 invented; unresolved 10 (the smoke detector, CI-51);
held-out unchanged (5 applied, 0 wrong). No request was new: the readers had already read these packets as the
units' proposals, and a live top-up recorded nothing.

**Unseen audit:** 05_MO's 2 new requests recorded live; 56 applied, 56 audited, 56 right; none new, none gone.

**Binding tier 3, cold (CI-54):** the third tier's keys were written after these rules and never informed them. With
the binder before this batch it scores 38.7% (120/310), precision 78.3% over 152; with this batch 40.0% (124/310),
79.9% over 154. The whole change is 03_FL's two VAV air handlers: they gain their VAV AHU diagram and sequence (4
pairs) and lose a coil piping detail the key does not give them (2 wrong bindings).

**GATE D:** every item passes but the live re-run: 23 of 564 decisions change (4.1%, limit 2%; 20 of 566 at CI-45).
Each change is a model answering a fresh call differently, on units whose bindings did not change (040_IL's unit
heaters, federal-mech, itd-d1-lab, bldg5406; 031_MO 0 of 18). Swap: 0 of 463 questions apply through a rebound packet
(another family), 0 of 72 (another tag).

**GATE C:** dev 227/244, held-out 35/91, both as before.

**Guard:** web typecheck, lint and 3,996 tests, failing only the 3 AS-1 tests. mcp typecheck; test:bas 189/189; the
mcp suite and the shared-path files fail exactly the tests they failed at CI-45 in the same worktree (its held-back
session.ts; nothing here touches it). 16 mutations of the binder rules and 3 of R0's rule each fail a test.

## CI-54: binding tier 3: the second tier's undrawn documents, keyed and measured cold (MEASURE NOTE)

**What:** the second tier drew its dev side from the 19 eligible exposed documents (seed 181) and took the first 10;
the other 9 were never keyed. They are now the third tier (`reports/control-intent/binding-tier3/01-split.md`,
`control-intent-binding-split.mjs --tier3`, the eval's `--dev3`): 044_NY, 21_VA, 14_OR, 017_MD, 008_MO, 03_FL,
088_AZ, 043_FL and 030_NY. Every eligible unexposed document is held-out 2 already, so this tier is dev only.

**Keys** (`keys/<set>.binding.csv`, 337 rows over the 173 instances of their attribute keys): each written by a
separate agent from the set's control sheets (text layer and renders), never pipeline output, in the tier-2 header
format; each then re-checked row by row on the renders by a second, independent agent. 7 of the 9 keys drew no
disagreement. The coordinator adjudicated the other ten on the renders:
- 044_NY B-1 to B-4: MI-402 detail 5 "WATER SAMPLE COOLERS / CONDUCTIVITY CONTROLLER" pipes each boiler's surface
  blowdown ("FROM B-1" ... "FROM B-4") through new conductivity sensors, controllers and modulating valves (its note
  1). A boiler control detail the key had left out: **added**, 4 rows (kind tag, as the tier-2 keys key a unit
  labelled inside a drawing).
- 03_FL AHU-1, AHU-2: the checker proposed the "EXHAUST FANS AND SUPPLY FANS" section for its closing sentence
  "ALL FANS AND AIR HANDLING UNITS SHALL SHUTDOWN ON A SIGNAL FROM THE FIRE ALARM CONTROL PANEL". A general
  sentence in a section titled for another kind is not the air handlers' packet; they have their own diagram and
  sequence. **Not added.**
- 03_FL B-1, HWP-1, BP-1 and 044_NY EF-5: binding kind only (tag against semantic for a unit labelled inside a
  drawing whose title names no tag). The tier-2 keys use tag; **kept** for consistency. The eval scores pairs, not
  kinds.

**Cold measure** (the binder at CI-53, before any rule from this tier): pair recall **40.0% (124/310)**, precision
**79.9% over 154** confirmed bindings, unit recall 56.2%. The first tier's dev reads 96.9% and dev 2 80.1%: how far
the binder generalizes to documents that informed no rule is this number. Of the 186 missed pairs:

| why | pairs |
|---|---:|
| the key's packet is not found by the finder (CI-26) | 68 |
| the instance is not matched to a compile item | 44 |
| bound as a proposal only | 33 |
| bound to another packet of that kind | 21 |
| no binding at all (tag read) | 11 |
| bound to packets of other kinds only | 7 |
| no binding at all (tag not read) | 2 |

- The 44 unmatched: 03_FL's 15 air terminal units, which its attribute key names "(N)ATU N" and "(E)ATU H" (30
  pairs); 043_FL's four pumps (12), which the compile does not read (2 compile items); 088_AZ's "(E) CT-1" and
  "(E) CH-3" (4). Schedule extraction and the attribute key's instance names, not the binder.
- By set: 21_VA 98.4%; 030_NY 47.1%; 03_FL 36.2%; 14_OR 54.2% (precision 38.2% over 34); 044_NY 16.9%; 088_AZ
  28.6%; 017_MD 0% (39 semantic pairs: fans and coils of the ACUs, whose schedules name their ACU); 043_FL and
  008_MO 0%.
- 18 units the keys give no packet are bound (precision's main loss), and 54 bindings are ambiguous.

This tier is dev from now: its misses may inform rules, and the cold number above stays the record.

## CI-26: control drawings the finder never found on the open tiers (FIXED in part, this commit; finder v6)

**What:** the second and third tiers' cold measures lost most pairs before any binding: dev 2's key named 16 packets
the finder never found (CI-45), dev 3's 15 (CI-54, 68 pairs). Read on the open documents, the misses fall into a few
shapes of title, none of them document-specific:
- A points list that names no subject ("BAS INPUT/OUTPUT POINT LIST", "INPUT/OUTPUT SUMMARY"), or an I/O list the
  vocabulary did not know ("DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM").
- A points table's title set inside the table the sheet graph extracted: on two lines, in two overlapping runs, as
  the table's first row, or centred over its header row. Text inside an extracted table was never a title.
- A P&ID ("HEATING WATER SYSTEM P&ID", "PIPING AND INSTRUMENTATION DIAGRAM - AHU-1"); a unit's controller as what
  a detail is about ("FURNACE CONTROLLER"), never where one is mounted.
- Two titles side by side on one baseline, each run to a second line (16_NV sheet 29's outside air unit and rooftop
  unit sequences).
- A caption under a sparse diagram whose labels run at a quarter turn above it (017_MD sheet 15's air conditioning
  unit diagrams), on a sheet whose title block, or one of whose own titles, names controls.
- A heading whose subject the line under it repeats heads that block; a sequence about its own subject is never part
  of another drawing's caption (14_OR's "CHILLED WATER SYSTEM CONTROL SEQUENCE (CH-1, CHP-1, CHP-2):").

**Change** (evidence.ts, EVIDENCE_VERSION unchanged in shape): each shape above, with its test in
`test/controlIntent/evidence.test.ts`. Against precision: another trade's controls are none of this trade's ("LIGHT
CONTROLS", "LIGHTING CONTROL DIAGRAM"; "LIGHTING AND EXHAUST FAN CONTROL DIAGRAM" still is), a caption over a
schedule the graph extracted is the schedule's title (over a points table, control evidence), and "HVAC CONTROLS"
alone names the discipline.

**Found now (open tiers, key packets the HEAD finder missed):**
- dev 2 (16 → 2 not found; 83 pairs): 009_FL's "SCHEDULED EXHAUST FAN DDC POINTS LIST" and "ELECTRIC UNIT HEATER
  DDC POINTS LIST"; 012_MO's "DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM" (14 pairs); 01_NY's two INPUT/OUTPUT
  SUMMARY tables (26); 028_TX's two BAS INPUT/OUTPUT POINT LISTs, its CHILLED and HEATING WATER SYSTEM P&IDs and its
  DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE; 16_NV's FURNACE CONTROLLER (21), C-WING ERV sequence, and the two
  side-by-side sequences on sheet 29.
- dev 3 (15 → 10 not found): 017_MD's four "AIR CONDITIONING UNIT (ACU-A-…) - BUILDING 101" diagrams (13 pairs),
  14_OR's chilled water sequence (3), and one on a walled document (never shown).
- dev: unchanged (1 not found). No key packet any tier found before is lost.

**Held-out (aggregates, HEAD's binder, same runner):** the finder without its last step (CONTROLLER read as a
generic word, so "FURNACE CONTROLLER" names the furnace; a points title printed as its table's first row) takes the
first tier's held-out from 26.7% to 40.8% (precision 93.5% over 46 → 97.6% over 85), and held-out 2's precision from
76.6% over 47 to 78.0% over 50 (recall 23.1% both). The last step costs held-out 2 correct pairs and adds 4 wrong
bindings (39.8%, 93.1% over 87): isolated on held-out totals, the same drop shows under HEAD's binder and none under
the synonym fix alone. The step stays: with CI-59 and CI-61 it binds 16_NV's 21 furnace pairs and 01_NY's 26 table
pairs, and its held-out cost is recorded here. The finder still misses 28 held-out pairs and, on held-out 2, 102 of
its 147 pairs in 16 packets (next).

## CI-55: a part whose row names a host the set does not schedule took none of that host's drawings (FIXED, this commit)

- 017_MD (dev 3): the heating coils HC-A-1 to HC-A-6 and the humidifier H-A-3 of the air conditioning units print
  their host in SERVICE ("ACU-A-1"), and the set's drawings are titled for those units ("AIR CONDITIONING UNIT
  (ACU-A-1) - BUILDING 101"), but no schedule the compile reads carries an ACU-A-1. A part took its host's drawings
  only through a scheduled host (CI-15, CI-44), so the tier's 39 semantic pairs on 017_MD went unbound (CI-54: 0%).

**Change:** a mark in a row's owner or place column (SERVICE, SERVES, LOCATION …) that no scheduled unit carries is
an unscheduled host: two letters or more, or qualified by another's letters ("ACU-A-1"), never a bare "A-1" or "B1"
(a zone, a room or a level as often as a unit). The part takes the drawings titled for that host (its letters printed
as a word, then its mark or a list or range carrying it), each as component_of, ambiguous where two of one kind are
titled for it.

## CI-56: a part whose schedule prints no owner column took nothing, where the set's other parts name theirs by one convention (FIXED, this commit)

- 017_MD's supply fans S-A-1 to S-A-6: their schedule prints no SERVICE, LOCATION or SYSTEM column. The set's other
  parts name their host of their own designation without exception (the return fan E-A-3: "ACU-A-3"; the heating coil
  HC-A-1: "ACU-A-1").

**Change:** the set's naming convention is read from its rows that name an owner or a place by a whole qualified
mark: it holds for a host kind's letters when three rows or more, over two hosts or more, name that kind's unit of
their own designation, and no row names one of another. A part whose schedule prints no owner, place or system column
at all, of a family the convention's parts are, takes the host of its own designation when the set's drawings are
titled for exactly one such host. Its evidence names the convention and one example.

## CI-57: a title's letters before a spaced mark were no qualifier ("ACU A-7" read as the return fan E-A-7's mark) (FIXED, this commit)

- 017_MD's drawing titles print "ACU A-7" and lists "ACU A-3, A-4 AND A-5". A spaced mark read without the word before
  it matched any unit marked A-7 of any letters, so the ACU drawings bound the set's return fans.

**Change:** the letters before a spaced mark are its qualifier when they are a kind the set names: the standard
abbreviations (PREFIX_WORDS), its scheduled marks' qualifiers, and the kinds its rows name as an owner or a place by a
qualified mark (two letters or more; a letter alone is a word). A list's or range's later marks carry the leading
mark's qualifier. A word before a mark ("UNIT A-1", "BOX B-2") qualifies nothing.

**Measured (CI-55 to CI-57 together, on the CI-26 finder, same runner):** 017_MD 2.6% → 84.6% (32 pairs: the supply
fans S-A-1 to S-A-6, the heating coils HC-A-1 to HC-A-6 and the humidifier H-A-3); dev 3 42.9% → 53.2% (precision
93.6% over 141 → 94.8% over 173). The 6 pairs still missed are S-A-1 to S-A-3's and HC-A-1 to HC-A-3's sheet 15
drawings. No other document of any tier changes; held-out and held-out 2 unchanged.

## CI-58: a family's one detail whose title prints a qualifier no row does stayed every unit's proposal (FIXED, this commit; amends C5)

- 028_TX: "SWITCH CONTROLLED EXHAUST FAN P&ID", the set's one exhaust fan detail of its kind, for its three exhaust
  fans (their rows print no "SWITCH CONTROLLED").
- 16_NV: "C-WING ERV CONTROL DIAGRAM" for its two ERVs; its "ROOFTOP UNIT WITH BAROMETRIC RELIEF" drawings for its
  four rooftop units.
- 06_MO and 008_MO: a family's one sequence or diagram, qualified by what its units do.
- CI-2 kept these proposals by decision C5: a family-level binding counts only when every qualifier of its title is
  printed in the unit's own row.

**Change:** a qualifier its title prints and no row does describes the family's one design, not a variant, when every
unit of the family took that detail as its only one of the kind, as a proposal, and none holds another of that kind.
Then each unit's binding is confirmed, and its evidence says so ("the family's one diagram detail, taken by each of
its 3 units"; "…, for its one unit"). It stays a proposal where:
- a unit's row says it is another variant (partVariant: it never took the detail);
- a unit of the family took nothing of the kind, or another detail of it (every other unit's stays a proposal);
- a unit's row or its set speaks against the qualifier: a VAV detail for a unit whose row prints a constant volume,
  or for an air handler while the set's VAV units name other air handlers as their system; a constant volume detail
  ("SEQUENCE OF OPERATION - CAV BOXES") for a unit whose row prints a variable air volume.

The goal's C5 now names this case.

**Measured (same runner, cumulative with CI-60):** dev 2 92.5% → 95.7% (028_TX 89.2% → 95.7%; 16_NV 87.6% → 96.9%;
06_MO 95.3% → 100%); dev 3 53.2% → 53.5% (008_MO 0% → 100%); dev unchanged. **Held-out 39.8% → 68.1%, precision
93.1% over 87 → 94.7% over 114** (aggregates; the held-out misses "bound as a proposal only" fall from 55 to 1).
- Measured and not adopted: the first cut confirmed only place qualifiers (C-WING, BUILDING B, EXISTING): dev 2 92.5%,
  held-out unchanged. Without the guard or CI-60, dev 3's precision falls to 86.8%: 030_NY's condensate pumps take
  the DOMESTIC WATER BOOSTER PUMP SEQUENCE as the pump family's one sequence (CI-60).
- Tests 26, 42 and 44 asserted proposals in sets that hold one such detail; each now asserts the family's one detail
  confirmed (with the qualifiers still read as unprinted), and each keeps a case where it stays a proposal.
- The choice between the place-only first cut and this rule was made after both were measured on held-out
  (aggregates only; CI-62).

## CI-59: a points table titled with no subject, and a sequence section inside a sequence, bound nothing (FIXED, this commit)

- 01_NY: its "INPUT/OUTPUT SUMMARY" tables name no subject; each lists the devices of one diagram (T-7, T-8, VR-1,
  D-5, V-3), every mark of which that diagram prints and no other diagram or detail on its sheet does. The finder
  also took the first table's title for the text above it (CI-26).
- 01_NY's terminal units print CONTROL SEQUENCE "B"; the heading "B. CONTROL SEQUENCE B (VAV WITH REHEAT …)" is
  printed both in its own packet and in the air handler's sequence of operation around it, so two packets held it
  and neither bound.

**Change:** a points table whose title names no subject, and whose device marks (two or more) are all printed in one
diagram or detail on its sheet and in no other, is that drawing's table: the drawing's units take it as a sibling,
confirmed or proposed as the drawing is. Of nested packets that print a sequence's heading, the innermost is the
section.

**Measured:** 01_NY 50% → 100%; dev 2 85.7% → 91.9%; nothing else changes on any open tier. Held-out 2 (aggregates):
4 more confirmed bindings, 2 of them wrong (precision 78.8% over 52 → 76.8% over 56), pair recall unchanged.

## CI-60: a pump or fan detail naming another service than the unit's schedule was a proposal, then its family's one detail (FIXED, this commit)

- 030_NY's condensate pumps (CONDENSATE PUMP SCHEDULE) took the "DOMESTIC WATER BOOSTER PUMP SEQUENCE" as a proposal,
  and under CI-58 as the family's one sequence (14 wrong).
- 061_IA's supply and return fans took "BID ALTERNATE #2 EXHAUST FAN POINTS LIST" as proposals (10 wrong).
- itd-d1-lab's exhaust fan EF-4 took the "HEAT RELIEF FAN" sequence and schematic as proposals (2 wrong).

**Change:** what a pump or fan serves, in groups of words that name one service (HOT, HEATING, HHW, HW, BOILER;
CHILLED, CHW; CONDENSER; CONDENSATE; DOMESTIC, DHW, POTABLE, BOOSTER, RECIRCULATION; SUMP, SEWAGE, EJECTOR; FIRE,
JOCKEY; SNOWMELT; SUPPLY; RETURN; EXHAUST, TOILET, KITCHEN, GREASE, FUME; RELIEF; TRANSFER; PRESSURIZATION). A detail
of the unit's family whose title names a service is not the unit's when the unit's own schedule (its title, its type
cells and its service columns) names only another. Never from a tag prefix ("CWP" is a chilled or a condenser water
pump) or a fluid column ("GLYCOL" names no service).

**Measured:** 26 wrong proposals gone on the open tiers, no pair lost; with CI-58, dev 3 precision 86.8% → 94.8%.
Bisected on dev 3's totals: the groups (HOT with HEATING, and so on) and the service columns change nothing there;
RECIRCULATION among the domestic words keeps 2 wrong confirmations out on the tier's walled documents (never shown);
GLYCOL changes nothing.

## CI-61: a split system's outdoor unit inherited its indoor unit's controller detail (FIXED, this commit)

- 16_NV's 21 condensing units (B1 to B9, C1 to C12) took "FURNACE CONTROLLER" from their furnaces (component_of,
  CI-44), once CI-26 read that title as the furnaces' detail. Their key gives them the furnace's control diagram and
  the FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION, not the controller detail.
- Every component_of binding on the open tiers, by the kind of packet inherited: diagrams 42 right, 4 wrong; points
  lists 16 right, 0 wrong; sequences 5 right, 2 wrong; details 0 right, 21 wrong (these).

**Change:** a detail of a unit's own controller ("FURNACE CONTROLLER", "EF-B1 CONTROLLER") draws the unit's
controller, not its parts: a part never inherits one. Other details stay inheritable: "AHU-1 CONTROLS" and "CHILLER
PLANT CONTROLS" are whole control drawings the finder files as details.

**Measured:** dev 2 precision 93.4% over 572 → 96.9% over 551, no pair lost; nothing else changes on any tier.

## CI-62: finder v6 and binder batch 4 (CI-26, CI-55 to CI-61, CI-63 to CI-65) (MEASURE NOTE)

**Binding eval** (every tier; held-out, held-out 2 and the reconcile check documents in totals only; the runner
reproduces the reports committed at 8d46f5c exactly on all five sides, so both columns are one instrument):

| side | pair recall | precision | unit recall |
|---|---|---|---|
| dev | 96.9% (313/323), unchanged | 91.4% over 360 → 91.7% over 362 | 95.7%, unchanged |
| dev 2 | 80.1% → **95.7%** (602/629) | 95.3% over 449 → **96.9% over 551** | 92.1% → 96.4% |
| dev 3 | 40.0% → **53.5%** (166/310) | 79.9% over 154 → **94.8% over 174** | 56.2% → 68.5% |
| held-out (aggregates) | 26.7% → **68.1%** (130/191) | 93.5% over 46 → **94.7% over 114** | 44.7% → **88.2%** |
| held-out 2 (aggregates) | 23.1% (34/147), unchanged | 76.6% over 47 → 76.8% over 56 | 43.1%, unchanged |

The finder and the binder, each alone (same runner, same code otherwise):

| side | HEAD | finder only | binder only | both |
|---|---|---|---|---|
| dev 2 | 80.1% @ 95.3% | 79.5% @ 90.0% | 81.4% @ 95.4% | 95.7% @ 96.9% |
| dev 3 | 40.0% @ 79.9% | 42.9% @ 93.6% | 48.7% @ 82.9% | 53.5% @ 94.8% |
| held-out | 26.7% @ 93.5% | 39.8% @ 93.1% | 55.0% @ 95.9% | 68.1% @ 94.7% |
| held-out 2 | 23.1% @ 76.6% | 23.1% @ 78.8% | 23.1% @ 76.6% | 23.1% @ 76.8% |

The finder's new packets need the binder's new rules to bind right (16_NV's controller detail, CI-61; 01_NY's
tables, CI-59): alone it costs dev 2 precision. Held-out's remaining misses: 28 pairs in packets the finder never
finds, 17 bound to packets of other kinds only, 8 to another packet of the kind, 7 with no binding, 1 a proposal.
Official reports: `reports/control-intent/03-binding-eval-{dev,dev2,dev3,heldout,heldout2}.{md,json}`, written by
the eval's scorer from the same snapshots; the reconcile check documents among the dev tiers (two on each) are
counted in the totals and no longer shown.

**Reading eval (GATE B2):**
- Dev: the new bindings made 27 new requests (7 text, 20 vision), recorded live in `runs/`. Recordings no reading
  uses any more were pruned.
- Dev replay: 223 calls replayed, none unrecorded. 296 applied, 0 wrong, 0 invented, 0 uncited, as at CI-53.
  Control-drawing instances 55/71 exact, as committed. GATE B2's r_exact, 57, still fails as it did.
- Dev proposals: 44 right (46 at CI-53). itd-d1-lab's EF-4 had read its role and motorized damper through the "HEAT
  RELIEF FAN" drawings, which its key says are not its; CI-60 unbinds them. BP-1's role goes from unresolved to
  abstained (a vision run's answer). No other dev decision changes.
- Held-out (aggregates): the new bindings made 127 new requests (27 text, 100 vision), recorded live in `runs/`.
  On the final code all 200 calls replay:
  - applied 5 right, 0 wrong (was 5 and 0);
  - proposals 20 right, 0 wrong (was 16 and 3);
  - the rest abstained.

**GATE C:** dev 227/244, held-out 35/91, both unchanged. The held-out units now have their own drawings bound, but
the readers apply only where two structurally different readers agree (C8), and on held-out they rarely do: R0 reads
9 of 288 questions, the vision reader answers 40 to 44 per run. The reading, not the binding, is now what stands
between the held-out units and their options (next).

**Unseen audit** (the 32 eligible unseen sets; `reports/control-intent/06-unseen-audit.{json,md}`):
- The new bindings made 23 new requests (041_IL 10, 05_MO 13), recorded live in `unseen-runs/`.
- 3 new decisions, each checked by hand against its cites and the drawing. All are right:
  - 05_MO's 1-AC-28 (CI-63), from its own sheet 52:
    - return fan true: "THE SUPPLY AND RETURN FANS SHALL SHUT DOWN", with RAF-1 on its diagram;
    - economizer true: "WHEN IN COOLING MODE BELOW 50°F [10°C], USE AIRSIDE ECONOMIZER …".
  - 041_IL's 40-AHU-2 (CI-63), role "in" from R0 and both vision runs. Its sequence says "THE UNIT IS NORMALLY
    STARTED AND STOPPED REMOTELY AT THE ECC", and its points list's outputs are SUPPLY FAN START/STOP and SPEED
    COMMAND. The decision's first cite, "AO BO", is only the list's column heads.
- Before CI-63 and CI-64, a live run applied 4 decisions to 1-AC-15 and 1-AC-28 from AC-57's sheet. They were never
  recorded, and none applies now.
- The record: 92 calls replayed, none live, unrecorded or failed. 59 applied: 59 right, 0 wrong. 0 new, 0 gone.

**GATE D** (robustness, dev; `05-robustness-dev.{json,md}`, live where not recorded):
- Negative controls: PASS.
- Swap (another family): 89 packets rebound to 84 units, 510 questions. No decision rests on the swap, and all 62
  reader answers that cite a swapped packet are unverified. PASS. Before CI-65, 14 of 15 applied: FAIL.
- Swap (another tag): 19 packets rebound to 17 units, 69 questions. None rests on the swap; 20 of 20 answers are
  unverified. PASS.
- Model-off: R0 alone applies 19, 0 wrong. PASS.
- Replay: 11 of 11 documents byte-identical (223 runs, none unrecorded). PASS.
- Re-run afresh: 36 of 631 decisions change (5.7%, against a 2% bar): FAIL, as at 8d46f5c (4.1%).
  - The same code's run minutes earlier changed 21 of 632 (3.3%). A fresh call reads differently (CI-24).
  - Most changes are proposals that a fresh call's agreement applies: 040_IL's terminal boxes' setpoint
    adjustment and reheat temperatures (absent by all four readers), 094_FL's relief dampers, federal-mech's
    boilers.
  - 004_MO: the text reader now proposes six rooftop units' differential economizer.
- Cost: 221 calls, 1.49 M tokens, at most 118 s a document. PASS. Raster: PASS.

**Guard** (the final code):
- Web: typecheck 0 errors; lint clean. Tests: 4,024 of 4,040 pass, 3 fail, 13 skipped. The 3 failures are B-11
  and B-12 (tableRecallGaps) and the multi-building sheet graph test, which fail the same way at 8d46f5c in a
  clean tree. controlIntent tests: 111/111.
- mcp: typecheck 0 errors.
  - The control-intent and assemblies test files: 71/71 pass.
  - The full `npm test` reported 246 tests passing and none failing before `conformance.test.ts` hung on its table
    sidecar for 50 minutes and the run was stopped.
  - Alone, `conformance.test.ts` fails 2 of 20: the sheet graph (#87) test's material-schedule chain, and
    sweep_schedule_row's 60 s timeout on navfac. A clean checkout of 8d46f5c fails the same 2, and one more
    timeout (detect_rooms).
- 27 mutations, one per rule of this batch, each fail a test:
  - CI-26: the CONTROLLER word, another trade, a subject-less points list, the P&ID, and a first-row title;
  - CI-55 to CI-61, including each guard of CI-58 and each part of CI-60;
  - CI-63's seven sites, CI-64's trap and CI-65's letters.
- The first-row title's mutation, and three of CI-63's, failed no test at first. Tests were added for them.

**Disclosures:**
- The sheet graphs were read from a warm cache built at 0ed8b41 (sheetgraph.ts has changed since, in the reconcile's
  plan work; the plan-sweep lookups in that tree are older still). Compile, finder, binder and readers are this
  commit's. The HEAD column above is the same runner on 8d46f5c's finder and binder, and it matches the committed
  reports on every side. The reports 03 to 06 were written by the committed instruments' scorers (for 04 and 05,
  the instruments themselves, with only their snapshot source pointed at that cache).
- GATE D's report prints, as its instrument always has, the negative controls' and the re-run's per-decision lines
  for every dev document, two of which (baker-county-eoc, 069_ID) are also reconcile check documents. Those lines
  were not read, except baker-county-eoc's two negative-control lines (its rooftop units' CO2 sensor, the same as in
  the committed report), printed once in a log read during this batch. Nothing of a check document's reconcile key
  was read.
- Held-out and held-out 2 were measured in aggregate for each candidate rule during the batch, and the choice
  between CI-58's place-only first cut and the adopted rule was made after both were measured there (CI-58). The
  finder's last step was isolated on held-out totals (CI-26). No held-out row, packet, key or output was read.
- A grep for CONTROLLER over the binding keys (meant for open sets) printed 7 distinct packet titles from 4 keys, one
  of them a held-out-2 key and one a check document's; no row, tag or answer beyond those titles. The change it
  checked (CONTROLLER as a generic word) was designed from 16_NV before the grep. Key greps now read a list of open
  keys only.
- A raster probe during the held-out-2 finder study printed aggregate counts only (its keys' packet sheets and the
  page span counts of those sheets), never a title, row or answer.
- The live top-ups called the models on held-out packets (navfac's runs gained the requests; nothing of them was
  read) and on the unseen sets (above).

## CI-63: a mark with a building's number before it ("1-AC-15") was no tag, so its own drawings bound nothing and another unit's did (FIXED, this commit)

**Found:** 2026-09-30, by the unseen audit's live top-up for this batch. 05_MO (the VA's St. Louis air handler
replacement, an unseen set) schedules its air handlers 1-AC-15, 1-AC-28 and 1-AC-36 (building 1), and AC-57 without
the number. Each has a sheet of its own. Sheet 50, for example, prints "SEQUENCE OF OPERATION FOR VARIABLE AIR VOLUME
AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR (1-AC-15)" and "AHU POINTS LIST (APPLIES TO AC-15)". `tagKey` took only
letters before a mark as its qualifier, so "1-AC-15" was no tag. No title named 1-AC-15 or 1-AC-28, and both took
sheet 54's untitled "AHU POINTS LIST" as their family's. That list is printed beside AC-57's sequence. A live run
applied 4 decisions to the two units from it: their return fan and, from the list's column header, their enthalpy
economizer (CI-64). 1-AC-36 bound nothing.

**Change** (binding.ts): a building's number before a mark (one to three digits: "1-AC-15", "40-AHU-2") is the mark's
qualifier wherever the binder reads a mark:
- `tagKey`;
- a title's tokens;
- a drawing's labels and text;
- a row's owner and place columns: the halves of a split system, a part's host, and CI-55's unscheduled host.

A number says where a unit is, never what it is. A title's "1-AC-57" is AC-57, whose schedule prints no number.
"2-AC-15" is not 1-AC-15. A number is never a designator: the furnace B1, marked under "F ~", is a title's "1-B1".
Tests: `evidence.test.ts`, "a mark with a building's number before it is a tag …" and "a building's number before a
mark is read wherever a mark is …". Seven mutations, one per site (`tagKey`, the title tokenizer and its token test,
labels and text, owner columns, qualified owner marks, the designator check), each fail a test.

**Measured:**
- 05_MO: 1-AC-15 takes sheet 50's points list and sequence, 1-AC-28 sheet 52's, and 1-AC-36 sheet 53's control
  diagram and points list. AC-57 keeps its sequence on sheet 54.
  - Sheet 54's untitled points list is now no unit's. A unit a title names takes no family detail, and nothing
    makes the list AC-57's but its place beside AC-57's sequence (next).
- 041_IL: its dedicated outdoor air unit 40-AHU-2 takes its own control diagram, points list and sequence on sheet
  24. Before, it bound nothing.
- Keyed tiers: no pair changes on any tier. The binding reports are byte-identical on dev, dev 2, held-out and
  held-out 2. On dev 3, 030_NY's 001-DHX-01 is now read as a tag, so 2 of its unbound pairs move from "tag not read"
  to "tag read".

## CI-64: a points list's software-function columns ("TEMPERATURE ECONOMIZER", "ENTHALPY ECONOMIZER") read as the unit's economizer (FIXED, this commit; term list v1)

**Found:** with CI-63, in the same run. 05_MO's points lists follow a VA layout: each point's row carries dots under
columns for the software functions it takes part in, among them "TEMPERATURE ECONOMIZER" and "ENTHALPY ECONOMIZER".
R0 read a column header as a clause printing the option, and answered yes. With the text reader agreeing, the run
applied enthalpy_economizer = true to 1-AC-15 and 1-AC-28 from sheet 54's header. Their sequences change over on
outside air temperature (sensor T-3), and none mentions enthalpy.

**Change** (`termlist/v1.json`; source "unseen-points-function-columns"): a trap, `function_column`, on
enthalpy_economizer and economizer. A clause that is only such a label, or a run of two or more of them ("TEMPERATURE
ECONOMIZER ENTHALPY ECONOMIZER"), names what a column marks, not what the unit has. A sentence keeps its reading:
"USE AN ENTHALPY ECONOMIZER WHEN …" and "OUTDOOR AIR ENTHALPY ECONOMIZER CONTROL" are still yes. Test:
`readers.test.ts`, "R0: a points list's software-function columns …". A mutation dropping the trap fails it.

**Measured:**
- Dev: R0 alone answers the same (319 right, 1 wrong, 326 abstained; 19 applied, 0 wrong).
- 05_MO, recorded runs, with and without the trap:
  - Wrong proposals removed: 1-AC-15's and 1-AC-28's enthalpy economizer, true from the header. Now 1-AC-15's is a
    proposal false (R0 and R1 absent) and 1-AC-28's is not proposed.
  - Right proposal lost: 1-AC-15's economizer (the plain one). Its sequence describes a dry-bulb economizer without
    the word: between 65 °F and the supply air temperature, "D-1 AND D-3 SHALL BE FULLY OPEN (MAXIMUM OUTSIDE AIR
    POSITION)". R0 had said yes only from the header. Now R0 answers absent and R1 yes (unverified), so the question
    is unresolved. Nothing wrong is applied either way.
  - R0 has no term for an economizer described by its dampers (next).
- This source is an unseen set's. 05_MO informed CI-63 and CI-64 and is no longer blind to them; its audit entries
  stay in the record.

## CI-65: a packet whose title leads with the letters the set marks another kind by ("TAB CONTROL …") was trusted as an air handler's own (FIXED, this commit)

**Found:** by GATE D's adversarial swap on this batch's binder. 040_IL's terminal air boxes (TAB-102 to TAB-107,
family VAV) take their sequence "TAB CONTROL W / HOT WATER REHEAT AND ROOM PRESSURE TAB CONTROL - TAB-C" by the
reference in their CONTROL TYPE column. The swap rebinds each bound packet to a unit of another family. This packet
landed on the air handler AHU-15 as its cross-reference, and 14 decisions applied through it:
- AHU-15's role "in" (R0 and R1 agreeing);
- 13 of its options absent.

GATE D's swap (family) arm failed: 14 of 15 decisions resting on the swap applied (at 8d46f5c, 0 of 0). The
defense, CI-23's check of a packet bound as the unit's own, reads a title's subject from its words. "TAB" is no word
of the vocabulary, only the set's own letters for its boxes. The boxes' binding was the same at 8d46f5c. This batch's
new bindings changed which unit the swap gives each packet, so the gap showed now.

**Change** (`readers/r0.ts` `aboutOthers`, read by the readers and the combiner; no model's request changes): a
title head that names no kind in words but leads with letters that the set's marks of one kind carry (TAB-102 …) is
about that kind. The packet is then not the unit's own, as for a title about another kind in words. Only a clause
printing the unit's tag speaks for it, and no absence is read through it. Letters that two kinds' marks share, or
that no mark carries, name no kind. Test: `readers.test.ts`, "a title that leads with the letters the set marks
another kind of unit by is about that kind …". A mutation dropping the letters fails it.

**Measured:**
- GATE D swap (family): 89 packets rebound to 84 units. 0 decisions rest on the swap, and all 62 reader answers that
  cite a swapped packet are unverified. PASS.
- Dev reading eval and GATE C: byte-identical with and without the change (296 applied, 0 wrong; 227/244).
- Unseen audit: the same 59 decisions.
- Held-out reading (aggregates): the same (5 applied right, 0 wrong; 20 proposals right, 0 wrong).

## CI-66: PQ5's plumbing words missed a sink drain pump (FIXED, this commit)

06_MO's SP-1 (plumbing sheet, SINK PUMP SCHEDULE, TYPE "PACKAGED SYSTEM SINK DRAIN PUMP") stayed in scope under PQ5
not_in_scope. The plumbing-service words gain SINK (never HEAT SINK), DRAIN(AGE), GRINDER, SANITARY, WASTEWATER and
LIFT STATION. Census of the 56 open cached documents' pumps: SP-1 is the only pump these words reach. Test:
catalogue.test.ts; mutations dropping SINK or the HEAT SINK guard fail it.

## CI-67: a relief damper holding the return fan plenum's pressure applied as the building-pressure relief damper (FIXED, this commit; term list v1)

061_IA's AHU-A (dev 2): R0 and R1 agreed relief_damper = yes from "RELIEF DAMPER (AE-1) SHALL MODULATE TO MAINTAIN
PRESSURE SETPOINT IN THE RETURN FAN PLENUM", and it applied (the first applied-wrong reading on dev 2). The option is
Guideline 36's building pressure relief (buiPreCon ReliefDamper); with a return fan the relief damper is the return
fan's (its lines come with return_fan). **Change:** a trap, `return_plenum` (source "g36-return-fan"), on
relief_damper: a relief damper tied to the return (fan) plenum is not the device. Traps are not in the models'
prompts: no recorded request changes. Dev 2: applied-wrong 1 → 0; dev, held-out and the unseen audit unchanged. Test:
readers.test.ts; a mutation disabling the trap fails it.

## CI-68: the reading eval's live renderer found only raw/ PDFs (FIXED, this commit; instrument)

`readingTools` rendered crops from `corpus/raw/` alone, so a live run on any set kept under `bulk/` (every tier after
the first) gave the vision reader no image. It now resolves each set's PDFs as the other instruments do
(`corpusFiles.mjs`, per set; `setPdfResolver`). Replay is unaffected. Test: assembliesTypicalEval.test.mjs (bulk/,
raw/, a missing name, an unknown set); a raw-only mutation fails it.

## CI-69: an absence was read only where a title binds the unit, so units the drawings describe only in shared or family packets kept the library's default (FIXED, this commit; R0 v9, combine v8)

**Found:** 2026-09-30, from the held-out typical eval's miss reasons (aggregates only). Held-out GATE C was 35/91;
of its 69 option misses, 45 were "abstained: nothing read". A category-only tally of those misses (each reader's
bare answer and the key's direction, no tag, option or text; see CI-70) showed the text model's verified "absent" in
39 of the 45, beside R0's "not shown": the unit is bound to its drawings only through a shared system drawing or its
family's typical detail, and C9 read an absence only through a packet a title binds to the unit. On the open tiers
the same shape (R1 absent, R0 not shown) was the key's false in 400 of 416 decisions (dev 253, dev 2 147); the
others are 15 zone CO2 sensors the zone-plan reader drew inside the unit's zone (key true; neither vision run had
confirmed the absence there) and one the key leaves undecided.

**Change:**
- R0 reads "absent" wherever no bound packet mentions the device and some packet speaks for the unit: its own
  family detail (whose title the CI-23 check has matched to its family) or a clause or section heading that names
  it (its tag, its family's noun, its tag's words or its row's kind). Without a title binding it says so
  (`UNTITLED`). Packets that never name the unit (a binder's mistake, GATE D's swap) say nothing of its devices.
- C9b (combine.ts): without a title, an absence applies only when the unit's whole bound text is read: R0 finds no
  term in any bound packet, R1 reads it absent and its answer verifies (no paragraph mentions it), and what is
  drawn was looked at: both vision runs find it in none of the unit's drawings, or the unit is bound to no drawing
  at all (sequences only; and, by CI-71, what no unit is bound to beside them is silent too). No binding may be ambiguous or every one a proposal, no bound packet may print no text
  (a scanned page reads as no mention), and some packet must not be about other units. Silence decides nothing a
  reader reads there: a zone plan's CO2 symbol in the unit's zone still applies.
- C9 accepts a unit bound to sequences only (nothing for the vision runs to look at) when R1 reads the device
  absent too (and, by CI-71, what no unit is bound to beside its sequences is silent too); before, such a unit could
  never read an absence.
- An option that is a mode of a part with a printed alternative (the term list's "no": staged heat, a 2-position
  valve, a hardwired freezestat, return-air humidity, a multi-speed fan, a hardwired interface) is never read from
  silence, titled or not: the drawings may print the part and never its mode. Found by dev's one INVENTED
  decision under the first cut: federal-mech FCU-1, a hot-water fan coil, read "no SCR heat" where its key leaves
  SCR heat undecided ("?"). None of dev's 48 C9 absences was such an option.
- The reading eval counts every absence rule (C9, its unconfirmed proposal, C9b) as an absence decision: read from
  silence, it cites nothing by definition, and the dev gate's absence_wrong = 0 now covers C9b too.

**Measured** (replay, recorded runs; no request hash changed):
- dev: applied 296 → 316 (absences 48 → 68), applied-wrong 0, INVENTED 0, uncited 0; GATE C 227/244, no unit's
  outcome changes (the new absences are options whose default was already false); control-drawing instances 55/71.
- dev 2: applied 128 → 133, applied-wrong 0; GATE C 147/202, no unit's outcome changes.
- held-out (aggregates): applied 5 → 128, applied-wrong 0, INVENTED 0; GATE C 35/91 → **62/91** (68.1%; GATE C asks
  for 55), 0 dishonest, 0 undisclosed; option misses 69 → 37 (14 no reading question, 13 abstained, 5 proposal only, 5
  unbound).
- GATE D: every item passes, the live re-run included (14 of 728 decisions change, 1.9%; at CI-62, 5.7%); 222 model
  calls, at most 118 s a document.
- The first cut without the mode rule measured 63/91 with 32 INVENTED on held-out; without the "speaks for the
  unit" condition, 63/91 with 131 applied. Both were rejected: the mode rule is dev's INVENTED case, and the
  speaking condition keeps a binder's mistake from deciding anything (one held-out unit is its price).
- The unseen audit, with CI-71: 61 new applied decisions, each checked against the drawings: right. 05_MO: 17
  terminal units' CO2 sensor, occupancy sensor and window switch, bound to the one VARIABLE VOLUME AIR TERMINAL UNIT
  CONTROL DIAGRAM, which draws a wall sensor, flow element, valves and controller; the set prints CO2 and OCCUPANCY
  SENSOR only in its controls symbol legend (sheet 49), and no plan draws either symbol. AC-57, bound to its sequence
  only: no relief damper or relief fan (its exhaust damper is the return fan's, which the return-fan option carries),
  no enthalpy economizer (its points list marks TEMPERATURE ECONOMIZER), no CO2 sensor, occupancy sensor, window switch
  or setpoint adjustment. 014_MT: HWUH-A3 to A5's fan status, bound to the HOT WATER UNIT HEATER DDC CONTROL DETAIL: a
  relay, speed controller, room sensor, DDC enable and manual starter, no status point. The mode rule withdraws 6
  decisions audited right before (SCR heat absent: 041_IL's 40-VAV-01 to 05, 050_IL's 1-VAV-01). The audit: 114
  applied, 114 right, 0 wrong.
- Spot checks on the open tiers' unkeyed units: 21_VA's 57 terminal units' window switch (the VAV detail draws an
  occupancy override button, setpoint adjustment and a multipurpose room's CO2, no window contact); 074_CA's fan
  coils (a points list: space temperature, supply air, filter, valves, no setpoint adjustment, occupancy or window
  point) and supply fans (status, speed, room pressure, no damper). Right.

Tests: readers.test.ts (R0's untitled absence and its speaking condition: a shared plant sequence, a swapped label
list; C9b each condition and the zone plan's symbol; C9 sequences only; the mode rule).

## CI-70: held-out views before CI-69 and CI-71, disclosed (PROCESS NOTE)

- **Category signatures.** CI-69 was designed after viewing, for the held-out documents' option misses, a tally
  of each reader's bare answer and the key's direction (read-eval's WALLED_SIG: no tag, option, value or text).
  The split it showed (R1's verified absence, with both vision runs absent or nothing drawn, never the key's true)
  is C9's own vision requirement, kept; the mode rule came from dev's INVENTED case, but its held-out effect (32
  INVENTED to 0) was seen before it was adopted. CI-69's held-out figure is therefore not a clean estimate of
  unseen documents. No typicals tier untouched by the work remains; the next tier keyed from renders is its test.
- **Why-strings.** During the tier-2 batch (CI-66 to CI-68) a debugging dump (DUMP_ANSWERS) keyed the walled
  documents' answer counts by the readers' `why` strings, which carry unit tags and label fragments: about a dozen
  held-out unit tags and five label fragments were printed to the terminal. The dump was deleted and fixed to
  category-only keys the same hour; nothing seen there informed a rule (CI-69's changes cite dev cases and C9).
- **CI-71's choice.** CI-71's first cut (every absence held beside any unbound drawing) took held-out's applied 128 →
  20 (0 wrong either way). Two held-out aggregates were then viewed: that count, and how many held-out units bound to
  sequences only sit beside an unbound packet, by packet kind (52 of 55, every one a points list). The adopted cut
  reads such a points list instead of holding everything beside it; its held-out figure is not a clean estimate
  either.

## CI-71: a unit bound to its sequence alone read "not drawn" beside its own unread points list (FIXED, this commit; combine v8)

**Found:** 2026-10-01, auditing CI-69's new unseen decisions by hand against the drawings. 62 of the 66 were right; 4
were wrong: 077_MT's water-source heat pumps HP-5A to HP-8A, read "no occupant setpoint adjustment" (C9, sequences
only). Each is bound to its sequence alone ("SEQUENCE OF OPERATION: HP-5A & HP-6A", M0.4). Directly above it in the
same detail is the detail's points list, titled by the type ("WATER SOURCE HEAT PUMP - SINGLE ZONE") and bound to no
unit: "TEMPERATURE - SPACE: JCI THERMOSTAT (T-SP1)". The zoning plans draw each heat pump's thermostat with the
legend's ADJUSTABLE THERMOSTAT symbol. The sequence names no sensor, so R0 and R1 both read silence, and C9 took it as
the absence CI-69 had just allowed a unit bound to sequences only.

**Change:** what no unit is bound to beside a sequences-only unit's sequences must be silent too. A drawing on the
same sheet that no unit is bound to may be the unit's own detail, never read:
- a points list there is read for the device as R0 reads a mention (the term list's mention, traps blanked;
  `mentionsDevice`, readers/r0.ts): one that prints it holds that question's absence;
- any other drawing there, or the sheet itself as a packet, may draw the device as a bare symbol: it holds every
  absence.
A drawing bound to another unit is that unit's and holds nothing. `record.ts` computes both (`besideMentions`,
`unreadBeside`); `combine.ts` keeps the absence a proposal and says why (C9 and C9b alike).

A first cut held every absence beside any unbound drawing. It cost held-out its new readings (applied 128 → 20, 0
wrong either way): there 52 of the 55 units bound to sequences only sit beside an unbound points list (aggregates
only, by packet kind). Reading the points list keeps those whose list is silent and holds those whose list prints the
device, which is what was wrong on 077_MT.

**Measured:** dev and dev 2 unchanged (316 and 133 applied, 0 wrong): no unit there bound to sequences only sits
beside a drawing no unit is bound to. Held-out (aggregates): applied 128, 0 wrong, 0 invented, GATE C 62/91, as before
it. Unseen: the 4 wrong decisions are withdrawn, held twice over (the sheet M0.4 is itself a packet no unit is bound
to, and the points list beside each sequence prints the thermostat). 05_MO's AC-57 keeps 7 of its 8 absences, all
right: its unbound AHU POINTS LIST prints the return and outdoor air temperatures, so the differential economizer
question is held. The audit reads 114 applied, 114 right.

**Not fixed (recall, queued):** the binder does not pair a points list or diagram titled by type with the sequence
titled by tags below it in the same detail (077_MT M0.4; 05_MO MI705's "AHU POINTS LIST" beside AC-57's sequence).
Bound, the vision runs would read them too; that needs new model runs on every tier.

Tests: readers.test.ts: the combiner (`unreadBeside` holds every absence; `besideMentions` holds its own question
only, C9 and C9b); the record end to end (an unbound points list that prints the damper holds it, a silent one lets
it apply, an unbound diagram holds it, the list bound to another unit lets it apply), each half checked to fail
without the change.

## CI-72: units their set's own words tie to a drawing went unbound: a split system's sequence, a service run together, a designator the text defines, a part's host diagram, a part scheduled under its host's name (FIXED, this commit)

**Found:** 2026-10-01, reading binding tier 3's open misses one by one (03-binding-eval-dev3: 144 of 310 pairs
missed). Five were the binder's:
- 14_OR: "SPLIT SYSTEMS - SEQUENCE OF OPERATION & BAS INTERFACE" never reached the units of the SPLIT SYSTEM HEAT
  PUMPS schedule (FC-01, FC-02, HP-01, HP-02). The title's subject words are SPLIT and INTERFACE (BAS is generic,
  INTERFACE is not), and a title naming no family binds a unit only where its schedule prints the whole subject.
  CI-29 had taken BAS INTERFACE out of a title's qualifiers, not out of that subject. The split fan coils fell back
  to "FAN COIL UNITS - SEQUENCE …", the classroom fan coils' (two false bindings).
- 14_OR: the snowmelt pumps (SP-1, SP-2: "SERVICE: SNOWMELT") never took "SNOW MELT - SEQUENCE …": a service names a
  system's subject word for word, in one spelling.
- 14_OR: HX-1 (the set's one heat exchanger; its row prints only its location) and MAU-1 ("SERVING: KITCHEN"). The
  SNOW MELT sequence reads "HEAT EXCHANGER (HX) CONTROL VALVE SHALL BE CONTROLLED BY THE BAS". The KITCHEN
  MECHANICAL EQUIPMENT sequence reads "MAKEUP AIR UNIT (MAU) SHALL BE INTERLOCKED TO THE KITCHEN HOOD EXHAUST FAN
  (KEF-01)". The text names each by its designator.
- 017_MD: the supply fans and heating coils (S-A-1 to S-A-3, HC-A-1 to HC-A-3) are printed in their air
  conditioning unit's sequence and points schedule, and bound there by their own tags. So they never took its
  control diagram, "AIR CONDITIONING UNIT (ACU-A-1) - BUILDING 101". The host rules (CI-55, CI-56) ran only for a
  part with no packet of its own.
- 030_NY: 001-DHX-01, scheduled under "DOAS HEAT EXCHANGER SCHEDULE", took nothing. Its schedule's title names its
  host's kind before its own; a part's host was read from its DESCRIPTION and TYPE cells only ("AHU SUPPLY FAN").

**Change (binding.ts):**
- A title's subject, as a schedule must print it (`namesRow`, `sharesSubject`), leaves out the words that name no
  subject (NOT_SUBJECT: BAS INTERFACE, bid alternates, ON/OFF, P&ID, power supply, wiring). The finder's
  subjectWords is unchanged.
- A title about split systems and nothing else ("SPLIT SYSTEMS - …") is the subject of a split system's half
  whose row pairs it with its other half, whatever the row prints. Found by the rule's test: the paired halves set
  SPLIT aside, which left such a title no word to match.
- A service names a system's whole subject in either spacing ("SNOWMELT" under "SNOW MELT").
- A system's drawing (its title names no family and no unit) whose text defines a designator after words naming a
  kind of unit ("HEAT EXCHANGER (HX)") names the set's one unit of that designator, of that kind (tag_body). Two
  units of it, or the letters marking another kind, bind nothing.
- A part bound by its own tag takes the drawings titled for its host, of the kinds it has none of. The host is the
  one unscheduled host its row names (CI-55), or the host of its designation under the set's convention (CI-56).
- A part's host is also read from its schedule's title when that title is the set's one AHU, RTU or DOAS followed
  by the part's own kind ("DOAS HEAT EXCHANGER SCHEDULE"). Never a scope note ("AIR TERMINAL UNIT SCHEDULE (AHU
  2)": an air handler's terminal units are not its parts). It is the owner of a part whose row names no other.

**Measured** (binding eval on cached snapshots, finder v6; base a847120):
- Binding tier 3 dev (7 open sets, 2 walled):
  - pair recall 53.5% → 58.7% (166 → 182 of 310); precision 94.8% → 96.3% (174 → 188 confirmed bindings; FC-01
    and FC-02 no longer take the classroom fan coils' sequence); unit recall 68.5% → 74.7%.
  - per set: 14_OR 66.7% → 100% (precision 88.9% → 100%); 017_MD 84.6% → 100%; 030_NY 47.1% → 52.9%.
- Dev, dev 2, held-out and held-out 2: their reports are byte-identical.
- Over all 56 cached open snapshots (25 dev-tier sets, 31 unseen), 21 units change, all in 14_OR, 017_MD and
  030_NY: 22 bindings added, 2 removed. Each was read against the drawings. The six on unkeyed units (return fans
  E-A-1 to E-A-3, cooling coils CC-A-1 to CC-A-3) take their air conditioning unit's control diagram, which draws
  the RETURN FAN and both coil valves (V1, V2).
- None of the three sets is in the typicals, reading or unseen-audit tiers: GATE C, GATE B2 and GATE D are
  untouched.

**Not fixed (recall, documented):**
- 03_FL's 15 terminal units and 043_FL's 4 pumps (42 pairs, "instance not matched"). The binder binds "ATU A" to
  its SINGLE DUCT ATU BOX CONTROL SCHEMATIC, and HWP1-2 and CWP9-10 to their pumps' diagrams and sequences. The
  keys spell the instances "(E)ATU A" and HWP-1/HWP-2: the row "HWP1-2" schedules two pumps, which the takeoff
  reads as one unit (AS-116). Neither key nor scorer is changed.
- 030_NY:
  - The telecom rooms' fan coils, under "TELECOMMUNICATION ROOM CONTROL DIAGRAM (FAN COIL)" (12 pairs): which fan
    coils serve a telecom room is printed only in the plans' room names; their rows give a room number.
  - The CRAC condensing units (4 pairs): the key chooses between the PLC and the standalone controller's drawings
    from the renders.
- The finder's misses (48 pairs, most on the walled documents).

Tests: evidence.test.ts "… (CI-72)". It covers each rule with its negative controls:
- a pump serving another system;
- two heat exchangers;
- the letters marking another kind;
- a fan bound by its tag with no host;
- two DOAS units;
- terminal units scheduled "(AHU 2)";
- the paired split system's halves.

Each rule was checked to fail without its change (six mutations).

## CI-73: a terminal unit named in words ("DUAL DUCT TERMINAL UNIT …") was no family to the binder, so 039_TX's 186 terminal units took none of their drawings (FIXED, this commit; R0 v10)

**Found:** 2026-10-01, by a census of the open sets' units with no confirmed binding (47 sets with packets: 646 of
1,484 units; 202 of 487 packets bound to no unit). The largest gap was 039_TX: all 186 units of its BLDG 109 AIR
TERMINAL UNIT SCHEDULE were unbound beside "DUAL DUCT TERMINAL UNIT CONTROL DIAGRAM", "DUAL DUCT TERMINAL UNIT
CONTROLS" (its points list) and "DUAL DUCT TERMINAL UNIT SEQUENCE OF OPERATION", which no unit took. The binder reads
a title's family by the takeoff's schedule-title rules (FAMILY_SPECS), which name "AIR TERMINAL UNIT" and "FAN
POWERED TERMINAL UNIT" but not a terminal unit qualified otherwise. Those rules decide what the takeoff counts, and
the finder reads them too, so the fix is not made there.

**Change:**
- `controlFamily` (evidence.ts): subjectFamily, else "VAV" for a title that names a terminal unit or box in words
  (DUAL, DOUBLE or SINGLE DUCT, or none). Never a packaged terminal unit, and never where another word of the title,
  or a member of a union ("TERMINAL BOX VAV/FCU/AFCV"), names another family.
- The binder reads every title through it, and so does R0's check that a family detail is about the unit's family
  (R0 v10). The finder keeps subjectFamily: no packet changes.
- 039_TX's rows (TU-101C, TU-101H, …) cite notes that say DUAL DUCT, so the qualifier is confirmed: each unit takes
  the diagram, the points list and the sequence.

**Measured:**
- Binding evals on every tier (dev, dev 2, dev 3, held-out, held-out 2): unchanged beyond CI-72.
- Over the 56 cached open snapshots, the 186 units are the only change beyond CI-72: 558 family details, each a
  terminal unit of the set whose drawings are the dual duct terminal unit's.
- The unseen audit (039_TX is an unseen set): 1,116 new applied decisions, six per unit, each checked against sheet
  M-501. Role "in" (the BAS drives the cold and hot duct dampers, AO on the diagram and the points list); setpoint
  adjustment true (ZONE SETPOINT ADJUST, an AI; "THE OCCUPANT SHALL BE ABLE TO ADJUST ... AT THE ZONE SENSOR"); no CO2
  sensor, occupancy sensor, window switch or reheat water temperatures (C9b: none in the diagram, the points list or
  the sequence; the modes run on schedule). All right. The audit reads 1,230 applied, 1,230 right.
- Found by that audit: the vision runs' crop of the control diagram held only its title. The diagram's own labels
  ("AO - COLD DUCT DAMPER", "NOTE: OPERATE TWO SINGLE DUCT RETROFIT KITS AS A COMBINED DUAL DUCT UNIT.") are printed at
  the title's size on that sheet, so the finder read them as titles and closed the diagram's region at the note. Their
  "none" there looked at nothing; the decisions stand on the points list, the sequence and the drawing read by eye.
  The finder's fix is CI-74.
- GATE D: every item passes; the live re-run changes 11 of 727 decisions (1.5%; the limit is 2%).

**Noted, not changed:** 039_TX schedules each dual duct box as two rows (TU-101C and TU-101H: the same room, the same
airflow, cold and hot deck). The takeoff counts 186 terminal units where the points list ("DUAL DUCT TERMINAL UNIT
CONTROLS": cold and hot duct airflow, cold and hot duct damper, one zone temperature) describes one controller per
box. The plans draw no TU tag that could settle it, so the count stays as printed; it is listed for the estimator's
review (AS candidate).

Tests: evidence.test.ts "… (CI-73)". The finder's subjectFamily is unchanged for these titles. A packaged terminal
unit is excluded, and another family named in words keeps its family. The dual duct drawings bind the terminal units
and not a fan coil. A union naming two families names none. Without a row that says dual duct, the drawing is the
family's one design (CI-58); beside a single duct one, it stays a proposal. The test fails when the fallback is
removed.

## CI-74: the finder read a diagram's own labels and notes as titles, and lost a wrapped title's second line (FIXED, this commit; finder v7)

**Found:** 2026-10-01, auditing CI-73's decisions on 039_TX and the census of units bound to nothing (CI-73).
- 039_TX M-501: the vision runs' crop of DUAL DUCT TERMINAL UNIT CONTROL DIAGRAM held its title alone. On that sheet
  the diagram's point labels ("AO - COLD DUCT DAMPER", "AI - HOT DUCT AIRFLOW") and its note ("NOTE: OPERATE TWO SINGLE
  DUCT RETROFIT KITS AS A COMBINED DUAL DUCT UNIT.") are set in type the size of a title. Each read as a title, and a
  caption's region runs up only to the title above it in its lane: the region stopped at the note, one line above the
  caption.
- 29_TX M8.01: the chiller and VFD network interface boxes print their point legends and their note's sentences at a
  title's size. "AS HARDWIRED CONTROLS." and "AO RF-SPD SPEED CONTROL (% FULL)" were detail packets of their own.
- 040_IL M402: the terminal air boxes print their control detail in a column, "CONTROL TYPE (NOTE 3)": TAB-A, TAB-B,
  TAB-C or TAB-E. TAB-A's and TAB-B's details are titled on two lines each, side by side ("TAB CONTROL W/HOT WATER" over
  "REHEAT AND CFM OFFSET - TAB-A"). The finder stacks a title's next line only when that line stands alone on its
  baseline, so a large-print table row is never a title; the two second lines stand under six line heights apart, so
  each title kept its first line and lost the designator the rows name. Their 16 boxes had only a proposal, the
  TERMINAL AIR BOX REPORT GENERATION diagram; each now takes its own detail by its CONTROL TYPE (TAB-101's "TAB-A").

**Change (evidence.ts):**
- A point label (a point type and its name apart, "AO RF-SPD …", or after a spaced dash or a colon, "AI - ZONE TEMP")
  or a note that runs on after its colon ("NOTE: …") is never a title, at any size. A word the type's letters begin is
  no label ("BI-POLAR IONIZATION CONTROL DETAIL", "DI WATER", "DO NOT"), and "GENERAL NOTES - MECHANICAL" still heads its
  block.
- A line ending in a period is never a packet unless it is a caption (a detail number or scale note beside it): a
  note's sentence keeps bounding the regions around it. "LIGHTNG AND EXHAUST FAN CONTROL DIAGRAM." keeps its packet.
- A line set like the title line above it continues that title when whatever is beside it on its baseline is a title
  column away (two line heights or more), as a first line's neighbours must be. Such a line never starts a title.

**Measured:**
- Finder, v6 against v7, on every sheet of the 81 open sets whose graphs are cached (2,615 sheets): packets 590 → 587.
  Seven packets differ and one region changes, each intended:
  - 29_TX: "AS HARDWIRED CONTROLS." and "AO RF-SPD SPEED CONTROL (% FULL)" are no longer packets.
  - 043_FL: neither is "REPLACE AUTO OPENER AND ACCESS CONTROL AS REQ'D." (a demolition note's sentence).
  - 040_IL: the two "TAB CONTROL W/HOT WATER" titles become "… REHEAT AND CFM OFFSET - TAB-A" and "… - TAB-B".
  - 039_TX: DUAL DUCT TERMINAL UNIT CONTROL DIAGRAM's region grows from 95 to 1,094 units tall (1 span → 14), the whole
    drawing.
- Binding evals on every tier (dev, dev 2, dev 3, held-out, held-out 2): the reports are identical, but for dev 3's
  packets found, 138 → 137 (043_FL's sentence, bound to nothing).
- Reading evals (dev, held-out) and the typical evals: unchanged (dev applied 316, applied-wrong 0; GATE C 227/244 on
  dev, 62/91 on held-out). 040_IL's terminal air boxes are not in its typicals key.
- 040_IL: the 16 boxes whose CONTROL TYPE is TAB-A or TAB-B (TAB-101, TAB-103, TAB-108 to TAB-120, TAB-202) now take
  their own detail. Each applies three absences: no CO2 sensor, occupancy sensor or window switch (48 decisions). Both
  details were checked by eye on M402: an exhaust box and a supply box with hot water reheat (damper, airflow, discharge
  temperature, a wall temperature sensor, a two-way valve), and nothing else. Right. Their role and the other options stay
  proposals.
  - Found doing so: each detail's region holds only the last paragraph of its sequence box. The sub-heading
    "EXHAUST/RETURN TAB SEQUENCE OF OPERATION:" inside the box was read as a caption over everything above it. The
    absences stand on the details read by eye. A fix was measured and not adopted (CI-75).
- The unseen audit: applied 1,230 → 672, audited 672, right 672. With AS-128, 039_TX's 93 hot valves are out of
  scope, and their 558 decisions are gone. Each box's role decision now stands on all three readers: R0 reads "AO -
  COLD DUCT DAMPER" and "AO - HOT DUCT DAMPER", which the region now holds. These 93 decisions are new, each checked
  against M-501. Five model calls were made live, for the regrown diagram.
- GATE D: every item passes. The live re-run changes 16 of 825 decisions (1.9%; the limit is 2%).

Tests: evidence.test.ts "… (CI-74)", two tests.
- 039_TX's diagram: its labels and note fall inside its region, which runs up the whole drawing. 23_GA's and a DI
  WATER caption keep their packets. 29_TX's legend lines are no packets; a period-ended caption is.
- 040_IL's two wrapped titles keep both lines; a row of marks in a large font under a title is no part of it.

Each part was checked to fail without it: the period rule, the note, the label apart from its name, the spaced dash,
the narrower letters (the broad form drops 23_GA), and the wrap.

## CI-75: a sequence sub-heading inside a detail cuts the detail's region at it (NOT ADOPTED, documented ceiling)

**Found:** 2026-10-01, by eye on 040_IL M402 while auditing CI-74's new decisions. Inside TAB-A's, TAB-B's and TAB-C's
SEQUENCE OF OPERATION boxes, "EXHAUST/RETURN TAB SEQUENCE OF OPERATION:" is printed at body size. It stands 24 units
under the last sentence above it and 25 units over its own paragraph. A text title goes with the nearer block of text,
so it read as a caption over everything above it: the diagrams and the box's first part. Each detail's caption region
stops at the first title above it in its lane, so the detail kept only its last paragraph.

**Tried:** a title ending in a colon heads the text under it whenever text follows; then only when that text starts
within half a line of where the text above ends.
- Finder diff on 2,615 sheets of 81 open sets: only 040_IL M402 changed, as intended. The three details ran up their
  whole drawings, and the three sub-headings kept their own paragraphs. Tests and two mutation checks passed.
- On the walled documents, totals only: one document changed, two packets' regions in it. The narrower form changes
  the same two regions.
- That document is in binding dev 2. Under the first form, pair recall 95.7% → 90.9% (602 → 572 of 629) and precision
  96.9% → 91.5%: 30 keyed bindings fell off. Every open document on that tier was unchanged.

**Not adopted:** the geometry cannot tell 040_IL's sub-heading from the walled document's caption. A rule tuned until a
walled document stops moving would be fitted to it. 040_IL's TAB decisions (CI-74) are right on the drawing either
way: no CO2 sensor, occupancy sensor or window switch in TAB-A or TAB-B. Only their evidence is narrower than the
detail. A candidate for a later batch is a box-aware reading of the sequence box, one that needs the drawing's lines,
not only its text.
