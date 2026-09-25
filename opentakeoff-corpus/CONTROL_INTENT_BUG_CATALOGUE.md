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
