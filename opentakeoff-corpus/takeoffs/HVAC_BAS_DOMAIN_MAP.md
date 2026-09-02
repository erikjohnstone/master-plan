# Where HVAC/BAS takeoff information actually lives

Written 2026-09-02, required reading before any valve/damper/actuator or
BAS points/SOO extraction or ground-truth work. Combines real web research
(sourced below) with real, empirical findings from this corpus (cited by
set ID). Supersedes any assumption that "look for a table titled valve
schedule" or "look for a table titled points list" is a complete model —
it is not, and treating it as complete is a production-readiness bug, not
a nuance.

## Core principle

A hydronic coil that needs flow control **always** implies a control
valve exists — that's physics, not drafting convention. A BAS-monitored
piece of equipment **always** implies real points exist. What varies by
drafter, by firm, and by whether a project even had a full specifications
book delivered alongside the drawings, is **where that information gets
written down**. The platform's job is to look everywhere it can legally
be, and honestly disclose when it can't (out-of-scope document, missing
discipline) rather than report a silent zero.

## Valve / damper / actuator data — every real location

1. **Dedicated, tagged schedule table** (`CONTROL VALVE SCHEDULE`, `BYPASS
   CONTROL VALVE SCHEDULE`, `DAMPER SCHEDULE`). Title + header vocabulary
   + row-tag-prefix corroboration. This is the only shape the platform
   handled before 2026-09-02 (`isControlValveHeaderShape`,
   `hasValveOrDamperMark`).
2. **Embedded inside a broader equipment schedule** — the coil's own GPM /
   EWT / LWT performance data sits directly in the AHU/RTU/FCU row, with
   **no separate valve schedule anywhere in the set**. Real, confirmed
   case: `001_NC_FY20_P_228_ATC_Tower_and_Air_Operations`'s own `AIR
   HANDLING UNIT SCHEDULE` and `DEDICATED OUTDOOR AIR HANDLING UNIT
   SCHEDULE`. Handled as of 2026-09-02 by `extractEmbeddedCoils` /
   `compileEmbeddedCoilGaps` in `corpusTakeoff.mjs`.
3. **Split across cross-referenced tables** — a coil schedule and a valve
   schedule that are two separate tables joined by a column (e.g. a `HOT
   WATER COIL` or `AREA / SUPPLY VALVE SERVED` reference). Real, confirmed
   case: `itd-d1-lab-mechanical.pdf` (`HOT WATER REHEAT COIL SCHEDULE` +
   `CONTROL VALVE SCHEDULE`, joined by tag reference).
4. **Riser diagrams** — a schematic (not to-scale) vertical pipe layout
   showing valve *placement* and *instance count* (isolation valves at
   floor branches, PRVs at zone boundaries) with annotations, cross-
   referencing back to a schedule for full specs. This is a real,
   independent corroboration source for valve *count* the platform does
   not yet read as such — a riser diagram is currently only handled as a
   generic "plan-ish" sheet, not specifically mined for valve instances.
5. **Control schematic / flow diagrams** — show the actual physical
   configuration of fans, coils, dampers, valves, pumps, heat exchangers,
   *and* each hardware point type, controller, and mnemonic together. This
   is where a valve's drawn *symbol* and its BAS *point tag* are shown
   linked to each other directly — distinct from both a tabular schedule
   and a plan-sheet symbol sweep, and not yet a dedicated extraction path.
6. **Drawn symbols on plan/riser/detail sheets** — matched via
   `find_legend_symbols` (read the set's own legend) + `symbol_sweep`
   (geometric fingerprint match from a real seed). Real capability,
   confirmed real via `match_reference_symbol`'s own failure mode
   (2026-09-02) that a hand-seeded fixed library does not generalize — the
   legend-read path is the right generalized mechanism, prioritized as
   default 2026-09-02, but not yet stress-tested across the corpus.
7. **Fire / smoke dampers specifically — a real, cross-discipline scope
   gap.** Real industry practice: fire dampers are counted off the
   **architectural fire-rated wall plan**, not from the mechanical
   drawings — an access door is added at every one. The platform currently
   only ingests mechanical-discipline PDFs. If a corpus set's architectural
   sheets aren't part of what was uploaded, a fire/smoke damper count from
   mechanical sheets alone is **necessarily incomplete**, and the output
   must disclose that explicitly (e.g. "counted from mechanical sheets
   only; a complete fire-rated-wall cross-check requires architectural
   sheets not present in this set") rather than present a plausible-looking
   total as if it were authoritative.
8. **The specifications book — often a separate document from the
   drawings.** Valve *type* and performance requirements, and especially
   commissioning/TAB scope, are frequently written in the spec book (CSI
   Division 23) and never appear on the drawings at all. If a corpus set
   is drawings-only (no attached spec book), the platform structurally
   cannot see that content. This must be disclosed as an explicit
   exclusion on every valve/damper/actuator takeoff output, not silently
   absorbed into "0 found."

## BAS points list / sequence of operations — every real location

1. **Points list, tabular** — either in the drawings (a points-schedule
   table, what the platform currently extracts) **or** in the
   specifications' temperature-controls section (CSI Section 23 09 00-
   series), per-controller, listing each point's AI/AO/BI/BO type and a
   descriptor. If specs are a separate document, this is the same
   exclusion-disclosure requirement as item 8 above.
2. **Sequence of Operations — formally standardized as CSI Section 23 09
   93 "Sequence of Operations for HVAC Controls."** Can live in the spec
   book as prose, **and/or** on a drawing control-schematic sheet as prose
   — real, confirmed case: `itd-d1-lab-mechanical.pdf` sheet M6.0 has real,
   substantial SOO prose directly on the drawing (`HEAT RELIEF FAN
   SEQUENCE OF OPERATION`, `DUCTLESS SPLIT SYSTEM SEQUENCE OF OPERATION`,
   etc.), which is exactly what `sequenceExtract.ts` already extracts.
   Confirms the platform's SOO extraction is looking in a real, correct
   place — the gap is coverage/testing depth, not the wrong location.
3. **Control schematic flow diagrams** — as above, show each hardware
   point type + controller + mnemonic directly linked to its physical
   device on one drawing. A richer, structured source for point↔device
   linkage than a bare points-list table; not yet a dedicated extraction
   path.
4. **Point naming/tagging conventions** — real institutional standards
   (GSA's own point-naming convention across its federal portfolio,
   modeled on Project Haystack tagging; per-institution schemes like a
   structured multi-part descriptor) exist and are consistent within a
   given owner's portfolio (a real, practical implication: two federal/VA
   sets in this corpus from the same owner likely share a point-naming
   convention worth exploiting, though not yet verified). AI/AO/BI/BO
   semantics: Analog = a range of values (valves/dampers commonly reported
   as %open/%closed); Binary = two states (open/closed, on/off); Input =
   data FROM the field device TO the BAS; Output = the BAS COMMANDING the
   device. The real, BACnet-ID-keyed points format already found on
   `013_MO_T2523_01`'s page 20 is one real instance of a structured
   descriptor convention — worth generalizing, not treating as one-off.

## Architectural implications — what actually has to change

- **Shipped 2026-09-02:** `compileEmbeddedCoilGaps` (item 2 above).
- **Not yet built, real next work:**
  - Riser-diagram valve-instance mining (item 4) — a real, independent
    corroboration source for valve count, currently unused.
  - Control-schematic point↔device extraction (item 5 / BAS item 3) — a
    genuinely different extraction shape from either a table or a plan-
    sheet symbol sweep; needs its own detector, not a bolt-on to either
    existing path.
  - Explicit exclusion-disclosure on every valve/damper/actuator and BAS
    takeoff output when: (a) the set has no architectural sheets (fire/
    smoke damper undercounting risk), or (b) the set is drawings-only with
    no attached specifications book (valve-type/commissioning/TAB and
    points-list-in-spec risk). Silence on these is a false "complete"
    claim even when every real drawing-sheet extraction is itself correct.
  - Corpus-wide stress test of `find_legend_symbols`-first symbol
    detection (item 6) — prioritized in tool descriptions 2026-09-02, not
    yet run at scale.

## Sources (web research, 2026-09-02)

- [Kamai — How to Do Mechanical and HVAC Takeoffs](https://kamai.io/blog/how-to-do-mechanical-and-hvac-takeoffs)
- [Kamai — Technology (geometric foundational models)](https://kamai.io/technology)
- [Kamai — AI construction takeoff: how it works](https://kamai.io/learn/ai-construction-takeoff)
- [Helonic — How to Read Equipment Schedules](https://helonic.com/knowledge-base/how-to-read-equipment-schedules)
- [Helonic — How to Read HVAC Drawings](https://helonic.com/knowledge-base/how-to-read-hvac-drawings)
- [Helonic — Construction Drawing Sheet Organization (NCS)](https://helonic.com/knowledge-base/sheet-organization)
- [Helonic — How to Read Plumbing Riser Diagrams](https://helonic.com/knowledge-base/plumbing-riser-diagram-guide)
- [Getstructured.ai — How to Read MEP Drawings](https://getstructured.ai/knowledge-base/mep-drawings/)
- [AutomatedBuildings.com — Points List Primer](https://www.automatedbuildings.com/news/may09/columns/090415012333calabrese.htm)
- [Computrols — The Value Of Universal I/O](https://www.computrols.com/universal-io/)
- [GSA — Data Normalization for Building Automation Systems](https://imlive.s3.amazonaws.com/Federal%20Government/ID225042502317072408508488262343172231156/Exhibit_B.pdf)
- [GSA — Building Technologies Technical Reference Guide v3.0](https://www.gsa.gov/system/files/Building_Technologies_Technical_Reference_Guide_(BTTRG)_Version_3.0_(REDACTED_Final)_May2024.pdf)
- [BSD Sequence of Operations for HVAC Controls (Section 23 09 93 template)](https://assets.contentstack.io/v3/assets/blt7b132cfc09cf5e18/blt658357b5eb3a51b8/230993-BSD-Sequence-of-Operations-for-HVAC-Controls.pdf)
- [University of Colorado Anschutz — Section 23 09 93 design standard](https://www.cuanschutz.edu/docs/librariesprovider260/design-and-construction/guidelines-and-standards/division-23/230993---sequence-of-operations-for-hvac-controls.pdf)
- [Projectmaterials — P&ID Symbols List](https://blog.projectmaterials.com/epc-projects/engineering/pid-symbols-list/)
- [ibeam.ai — Guide to Accurate HVAC Takeoffs](https://www.ibeam.ai/blog/guide-to-accurate-hvac-takeoffs)
- [The Virtual Estimation — HVAC Estimating Explained](https://thevirtualestimation.com/blog/hvac-estimating-explained-ductwork-equipment-controls-commissioning/)

Direct fetches of several of these (WebFetch) were blocked by this
sandbox's egress proxy on essentially every domain tried; the content
above came through WebSearch's own synthesis instead, which does get
through. Where a source above couldn't be read directly, treat it as
corroborating rather than independently re-verified line-by-line.
