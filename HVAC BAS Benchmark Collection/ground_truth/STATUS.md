# Ground-truth status - all 30 PDFs

Updated 2026-09-05T10:37:39.903889+00:00.

- Independent raw capture: 30/30 PDFs, 1489/1,489 pages.
- Complete detailed records: 30/30 PDFs, covering 1489/1,489 pages.
- The goal remains active. Parser capture, text agreement and curation previews are not completed ground truth.
- Completion below reflects authored page-by-page review plus current, hash-matched verification, not an automatic parser score.

## All-document ledger

| Rank | Document | Pages | MuPDF + Poppler raw capture | Detailed ground truth |
|---:|---|---:|---|---|
| 01 | Cherry Point Air Traffic Tower and Air Operations | 75 | Captured | [Complete; source limitations recorded](records/01__vol2__001.md) |
| 02 | Norfolk Submarine Pier 3 Utility Services | 27 | Captured | [Complete; source limitations recorded](records/02__vol2__015.md) |
| 03 | Colville White Sturgeon Fish Hatchery | 38 | Captured | [Complete; source limitations recorded](records/03__vol1__27.md) |
| 04 | ITD District 1 Testing Laboratory | 29 | Captured | [Complete; source limitations recorded](records/04__vol2__062.md) |
| 05 | USDA APHIS Plant Inspection Station Building 63 | 31 | Captured | [Complete; source limitations recorded](records/05__vol2__009.md) |
| 06 | Vermillion County Jail | 36 | Captured | [Complete; source limitations recorded](records/06__vol2__096.md) |
| 07 | Ames Laboratory Harley Wilhelm Hall HVAC Upgrade | 71 | Captured | [Complete; source limitations recorded](records/07__vol2__061.md) |
| 08 | Albany VA Main Boiler Replacement | 31 | Captured | [Complete; source limitations recorded](records/08__vol2__044.md) |
| 09 | Missoula Fire Sciences Laboratory Mechanical Upgrade | 28 | Captured | [Complete; source limitations recorded](records/09__vol2__014.md) |
| 10 | Lovell Federal Health Care Center Sterile Processing Expansion | 48 | Captured | [Complete; source limitations recorded](records/10__vol2__040.md) |
| 11 | St. Louis John Cochran VA AHU and VAV Replacement | 67 | Captured | [Complete; source limitations recorded](records/11__vol1__05.md) |
| 12 | Fort Sam Houston Building 615 Controls Excerpt | 9 | Captured | [Complete; source limitations recorded](records/12__vol2__028.md) |
| 13 | NIST Gaithersburg Building 101 HVAC Renovation | 25 | Captured | [Complete; source limitations recorded](records/13__vol2__017.md) |
| 14 | USDA ARS Laboratory Mechanical Set (2019) | 19 | Captured | [Complete; source limitations recorded](records/14__vol2__021.md) |
| 15 | SLAC LCLS-II-HE Process Cooling Water Skid | 13 | Captured | [Complete; source limitations recorded](records/15__vol2__067.md) |
| 16 | ITD District 2 Laboratory Heating Upgrades Rebid | 9 | Captured | [Complete; source limitations recorded](records/16__vol2__069.md) |
| 17 | Carson Valley Middle School Phase 1 HVAC Replacement | 47 | Captured | [Complete; source limitations recorded](records/17__vol1__16.md) |
| 18 | Guaranteed Rate Field HVAC Phase IX | 13 | Captured | [Complete; source limitations recorded](records/18__vol2__092.md) |
| 19 | Orange County Regional History Center HVAC | 9 | Captured | [Complete; source limitations recorded](records/19__vol2__094.md) |
| 20 | JVWTP Chemical Buildings HVAC Upgrades | 25 | Captured | [Complete; source limitations recorded](records/20__vol2__097.md) |
| 21 | JVWTP Washwater Reclaim Pump Station 2 HVAC | 8 | Captured | [Complete; source limitations recorded](records/21__vol2__095.md) |
| 22 | Center for Behavioral Medicine Chiller Upgrade | 29 | Captured | [Complete; source limitations recorded](records/22__vol2__012.md) |
| 23 | St. Cloud VA Building 51 MEP Replacement | 80 | Captured | [Complete; source limitations recorded](records/23__vol2__033.md) |
| 24 | Eglin AFB NICoE Mechanical Controls | 24 | Captured | [Complete; source limitations recorded](records/24__vol2__019.md) |
| 25 | Houston VA Emergency Room Expansion | 12 | Captured | [Complete; source limitations recorded](records/25__vol2__053.md) |
| 26 | Columbia Truman VA Pandemic-Preparedness Warehouse | 90 | Captured | [Complete; source limitations recorded](records/26__vol2__031.md) |
| 27 | Orange County Public Safety Building | 128 | Captured | [Complete; source limitations recorded](records/27__vol1__21.md) |
| 28 | Transbay Tower Mechanical Schedules and Plans | 64 | Captured | [Complete; source limitations recorded](records/28__vol1__26.md) |
| 29 | Syracuse VA EHRM Infrastructure Controls | 93 | Captured | [Complete; source limitations recorded](records/29__vol2__030.md) |
| 30 | LBNL Building 59 NERSC Facility Upgrade II | 311 | Captured | [Complete; source limitations recorded](records/30__vol2__058.md) |

## Next work

1. Follow the current document ledger above. Norfolk (02) has a ten-module assembled record; it counts as complete only with a current passing final audit. Proceed to Cherry Point (01) after its completion gate passes.
2. Continue the full 30-document queue; do not substitute selected preview-page reviews for complete records.
3. Investigate all parser disagreements in the relevant fields. USDA ARS has a Poppler character-collection warning; Transbay has substantial text-segmentation differences. Low-text/outlined areas require visual and independent corroboration.
4. Once all records are complete, run the full source-integrity/verification/completeness audit and package the new records. The existing focus ZIP is the original curation package and does not yet contain these ground-truth records.

## Current verification tools

- `tools/capture_evidence.py`: immutable-source MuPDF/Poppler raw captures, coordinate and text diagnostics; resumable.
- `tools/render_region.py`: source-page/region rendering by either independent engine.
- `tools/validate_record.py`: bounded authored field/cell checks and annotation consistency; no production takeoff inference.
- `tools/test_validation.py`: positive case and deliberately corrupt negative controls.
- `tools/verify_tables.py`: strict authored schedule/points cells, bounded sequence text and declared-count/reference checks.
- `tools/test_tables.py`: positive modules and corrupt cell, bounds, type-count, ownership, header, sign and reference controls.
- `tools/bundle_record.py`: self-contained authored-module records, equipment/point presentation, whole-document coverage and source/render hash checks.
- `tools/update_status.py`: all-30 ledger with stale-verification detection.

See [audit protocol](README.md) for scope, evidence semantics and shared-path decision.
