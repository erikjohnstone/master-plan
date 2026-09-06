# Norfolk Submarine Pier 3 - completed source audit

The [assembled ground truth](../../records/02__vol2__015.md) and
[machine-readable record](../../records/02__vol2__015.json) cover the complete
supplied PDF, with source limitations retained. Original source:
27 pages, SHA-256 `7ac5b4d6d97b5416f7d04a2a3abd303513ac9f19cec5930d0b9aa3bcd550da97`.
Page numbers below are 1-based PDF pages, not project drawing ordinals.

## Captured and corroborated

| Module | Content | Authored checks passing in both MuPDF and Poppler |
|---|---|---|
| [Main schedules](schedules.json) | AM601-AM603, PDF 18-20: 23 tables, 104 rows | 1,194 cells |
| [Guard-booth schedule](supplemental_schedules.json) | AM107, PDF 9: DSS-4/CU-4 paired row | 28 cells |
| [BAS matrices](points.json) | AM703-AM706, PDF 24-27: 9 systems in 10 printed blocks, 117 rows | 468 cells |
| [Controls context](controls_context.json) | Network architecture, 9 written sequence groups, 9 operating-flow combinations | 46 bounded text assertions and 27 flow cells |
| [Metadata](metadata.json) | 27 sheets, 59 views, 21 graphic bars | 414 text assertions |
| [Space controls](sensors.json) | 23 drawn marks by zone; mounting-height instructions; all-page CO2 review | 56 text assertions |
| [Reference tables](reference_tables.json) | 3 tables, 7 rows | 35 cells |
| [Equipment reconciliation](equipment_reconciliation.json) | 109 scheduled identities, 99 primary anchors, 19 additional identities, valve aliases and conflicts | 144 text assertions plus linked registry checks |
| [Point applications](point_applications.json) | 26 explicit applications, 192 logical occurrences and component ownership | Linked row/count/owner checks; no new physical-I/O claim |
| [Supporting evidence](supporting_evidence.json) | 17 complete schedule-note blocks; 15 valve labels; 18 state witnesses | 50 text assertions |

Totals above are **1,752 data cells plus 710 bounded text assertions**, each checked
against both engines: **4,924 engine checks**. Header witnesses and inventory/
reference checks are additional and retained separately.
The 24 schedule tables have 105 rows, not 105 verified installed devices.
Point matrices contain 31 AI, 43 DI (printed BI), 10 AO and 33 DO (printed BO):
**117 listed/template rows, not 117 installed physical terminals**.
Each module has a sibling `.verification.json` retaining annotation/source hashes,
individual word IDs, bounds, expected values, both engines' text and pass/fail.

All 27 full pages were visually reviewed, including plans, sections, details,
tables, controls and title blocks. The final record contains a page-by-page
finding ledger and hash-matched review images. Outlined firm/seal text and
geometric relationships are disclosed visual interpretation, not falsely claimed
as two independent automatic engineering interpretations.

## Important source and extraction traps already found

- The point marks' PDF stream order differs from their actual table row positions.
  Geometric row checks prevent swapping CCC-2/pump speed marks, FC electric heat
  versus pump commands, and generator zone temperature versus fan-speed feedback.
- Condenser-water BI-17 through BI-20 all **print MPAC-1**; AM702 diagram assigns
  those marks to MPAC-1 through MPAC-4. Both versions must remain in the record.
- Bypass V-3 / schedule VLV-3 is controlled by AO-1 and a modulating sequence but
  scheduled as two-position. It is **not V-1**; an earlier working-note ambiguity
  was corrected after reading the complete AM702 diagram.
- AM610 shows NO at cooler/compressor isolation valves V-1, V-2, V-4 through V-10;
  AM702 shows NC. Normal/fail positions cannot be resolved by choosing one sheet.
- FC-1 and EF-1 each require two temperature sensors, but their typical matrices
  assign only one temperature mark. FC-1 selects lowest; EF-1 selects highest.
- MPAC relief uses the FC-3 temperature signal. Repeated control applications do
  not imply repeated physical space sensors.
- Water-meter pulse input is labeled AI1 / ANALOG INPUT in the source. Preserve
  that classification and flag terminal technology for clarification. Calculated
  freeze-protection flow is not a fourth physical meter.
- Guard booth has a DSS-4/CU-4 schedule and local remote controller; AM706 expressly
  excludes its extra DDC temperature sensor. The approval field reads 5/19/2020,
  not the 03/05/2021 on the other supplied mechanical sheets.
- Network-controller number/arrangement is expressly diagrammatic. No fabricated
  controller quantity, cable length, address list or terminal roster.
- Schedule/source warnings include VLV-15's FC-4 location, DSS-2's room, L-6/L-7
  free area, HP-1's capacity unit scale, missing referenced note numbers and
  building-scoped repeated grille/damper identifiers. See individual records.

## Completion and remaining collection work

The final requirement audit covers metadata, every view scale, schedule rows and
specifications, all equipment identities, typed points with component ownership,
networks, sequences, zone sensors, and source limitations. Its equipment index
and 192-row logical point ledger are presentations of the authored facts, not a
new production extraction engine. The source does not establish an exact field
terminal total, untagged commodity count, or controller quantity.

Norfolk and rank 21 are complete: **2/30 documents, 35/1,489 pages**. The other
28 PDFs remain in scope. See [all-document status](../../STATUS.md).

## Re-run verification

From the collection directory, run `python3 ground_truth/tools/validate_record.py`
to verify both complete records. Use `python3 -m unittest discover -s
ground_truth/tools -p 'test_*.py'` for all 56 regression checks. Rebuilding this
record with `bundle_record.py build` refreshes modules in dependency order.
These are offline reference checks; no production takeoff path, corpus scorer
or threshold changed.
