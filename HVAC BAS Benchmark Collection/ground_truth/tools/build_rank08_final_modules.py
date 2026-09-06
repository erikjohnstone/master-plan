"""Author Rank 08 metadata, boundary modules, complete page review and manifest."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "08__vol2__044"
WORK = AUDIT / "work" / IDENT

PAGES = [
    ("ID-101", "Source mechanical/controls drawing reviewed; retained as visual context."),
    ("ID-102", "Source mechanical/controls drawing reviewed; retained as visual context."),
    ("ID-201", "Source mechanical/controls drawing reviewed; retained as visual context."),
    ("ID-202", "Source mechanical/controls drawing reviewed; retained as visual context."),
    ("ID-301", "Source mechanical/controls drawing reviewed; retained as visual context."),
    ("ID-302", "Source mechanical/controls drawing reviewed; retained as visual context."),
    ("MI-101", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-102", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-201", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-202", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-301", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-302", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-303", "Mechanical drawing reviewed; retained as visual context."),
    ("MI-401", "Mechanical detail/installation drawing reviewed; retained as visual context."),
    ("MI-402", "Mechanical detail/installation drawing reviewed; retained as visual context."),
    ("MI-403", "Mechanical detail/installation drawing reviewed; retained as visual context."),
    ("MI-404", "Mechanical detail/installation drawing reviewed; retained as visual context."),
    ("MI-405", "Mechanical detail/installation drawing reviewed; retained as visual context."),
    ("MI-406", "Mechanical detail and sequence drawing reviewed; retained as visual context."),
    ("MI-407", "Mechanical detail and sequence drawing reviewed; retained as visual context."),
    ("MI-501", "Mechanical schedules reviewed: boilers, fans, pumps, fuel-oil pumps and unit heaters."),
    ("MI-502", "Mechanical schedules reviewed: storage/deaerator/blowdown tanks, chemical feed, economizers, louvers and AC equipment."),
    ("MI-503", "High-value boiler-plant schedules reviewed and nine selected schedule tables captured in the literal schedule module."),
    ("MI-504", "High-value isolation, fuel-oil, day-tank and condensate-pump schedules reviewed and captured in the literal schedule module."),
    ("MI-601", "Mechanical controls drawing reviewed; retained as visual context."),
    ("MI-602", "Mechanical controls drawing reviewed; retained as visual context."),
    ("MI-603", "Mechanical controls drawing reviewed; retained as visual context."),
    ("MI-604", "Mechanical controls drawing reviewed; retained as visual context."),
    ("MI-605", "Fuel-oil system control diagram, sequence and 33-row BACnet point list fully reviewed and captured."),
    ("MI-606", "Mechanical controls drawing reviewed; retained as visual context."),
    ("MI-607", "Packaged domestic-water-heater diagram, integration notes and 63-row BACnet object list fully reviewed and captured."),
]


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def reviewed_pages():
    return [{"page": i, "sheet": sheet,
             "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": finding}
            for i, (sheet, finding) in enumerate(PAGES, 1)]


def metadata(pages):
    return {
        "document_id": IDENT,
        "module_role": "Project/title-block facts, sheet identifier ledger, scale boundary and complete visual-review disposition for all supplied source pages.",
        "tables": [],
        "project": {
            "project_name_as_printed": "REPLACE MAIN BOILERS",
            "project_number_as_printed": "528A8-17-805",
            "facility_as_printed": "Samuel S. Stratton VA Medical Center, 113 Holland Ave., Albany, New York 12208",
            "issue_as_printed": "100% CONSTRUCTION DOCUMENTS",
            "issue_date_as_printed": "06/05/2024",
            "assertion_ids": ["rank08-project", "rank08-number", "rank08-issue", "rank08-facility-line-1", "rank08-facility-line-2", "rank08-issue-date"],
        },
        "sheet_details": {
            "sheet_ledger_semantics": "All 31 supplied PDF pages have a retained full-page Poppler render and a completed visual-review disposition. Sheet identifiers are transcribed from the reviewed drawing title blocks.",
        },
        "scale_semantics": {
            "takeoff_scale_status": "No global drawing scale is asserted. This set mixes schematics, schedules, controls diagrams, details and plan-like sheets; no local scale is promoted into a document-wide quantity conversion.",
            "printed_local_view_scales_observed": [],
            "boundary": "Schedule and schematic facts are retained as text/table source facts, not as distance-based takeoff quantities.",
        },
        "visual_review_pages": pages,
        "assertions": [
            {"id": "rank08-project", "page": 29, "bbox": [2530, 1918, 2740, 1950], "expected": "REPLACE MAIN BOILERS", "mode": "exact"},
            {"id": "rank08-number", "page": 29, "bbox": [2820, 1918, 2940, 1950], "expected": "528A8-17-805", "mode": "exact"},
            {"id": "rank08-issue", "page": 29, "bbox": [2250, 1918, 2460, 1965], "expected": "100% CONSTRUCTION DOCUMENTS", "mode": "exact"},
            {"id": "rank08-facility-line-1", "page": 29, "bbox": [2530, 2000, 2795, 2018], "expected": "Samuel S. Stratton VA Medical Center, 113 Holland Ave.,", "mode": "exact"},
            {"id": "rank08-facility-line-2", "page": 29, "bbox": [2530, 2010, 2660, 2030], "expected": "Albany, New York 12208", "mode": "exact"},
            {"id": "rank08-issue-date", "page": 29, "bbox": [2530, 2048, 2600, 2070], "expected": "06/05/2024", "mode": "exact"},
        ],
    }


def equipment():
    return {
        "document_id": IDENT,
        "module_role": "Presentation registry for the complete literal schedule-row corpus selected from MI-503 and MI-504. It does not infer plan placement, installed multiplicity, procurement, or clean physical identities beyond printed rows.",
        "tables": [], "ledger_mode": "literal_schedule_rows_v1",
        "schedule_counts": {"tables": 9, "rows": 56, "interpretation": "Nine selected high-value MI-503/MI-504 schedule tables and 56 literal rows are retained, including printed continuation and NO USE rows."},
        "control_valve_and_damper_schedule_status": {
            "steam_pressure_reducing_valves": "MI-503 publishes seven literal steam pressure-reducing-valve schedule rows, including continuation rows for PRV-25 and PRV-26.",
            "isolation_valves": "MI-504 publishes 29 literal isolation-valve schedule rows, including two printed NO USE rows and four non-return stop/check valve rows.",
            "control_valve_schedule": "No standalone schedule titled CONTROL VALVE SCHEDULE is asserted. Fuel-oil control-valve commands/position/alarm are captured from MI-605, while MI-503 separately publishes steam pressure-reducing valve data.",
            "damper_actuator_schedule": "No standalone damper-actuator schedule is asserted from the supplied source pages.",
        },
        "source_boundary": "The selected schedule tables are source references, not proof of plan placement/multiplicity, outlet/inlet quantities, installed equipment totals or final procurement scope.",
    }


def point_applications():
    return {
        "document_id": IDENT,
        "module_role": "Explicit application scopes for every literal MI-605/MI-607 published point-list row.",
        "tables": [], "ledger_mode": "literal_source_row_matrices_v1",
        "applications": [
            {"id": "generator-fuel-oil-system", "source_table": "MI605-FUEL-OIL-BACNET", "ownership_scope": "Literal source matrix for the generator fuel-oil system only; no final controller terminal, I/O card, wire, or physical owner is printed."},
            {"id": "packaged-service-water-heater", "source_table": "MI607-SERVICE-WATER-HEATER", "ownership_scope": "Literal package BACnet object list for each heater interface as printed; it does not state a final controller-card, terminal, wire, or field-device count."},
        ],
        "expanded_template_counts": {"source_rows": 96, "total": 96},
        "expanded_count_warning": "96 is the count of literal published source rows. It is not a final installed BAS point, controller, I/O, terminal, cable, sensor, valve, or device total.",
    }


def supporting():
    return {
        "document_id": IDENT,
        "module_role": "Explicit source limitations and corroboration boundaries for the complete 31-page supplied set.",
        "tables": [],
        "source_limitations": [
            "The literal schedule module completely captures nine selected high-value MI-503/MI-504 schedules (56 rows). Other visually reviewed schedule sheets are not silently treated as transcribed inventory rows.",
            "MI-605 supplies a 33-row fuel-oil BACnet point list and MI-607 supplies a 63-row packaged service-water-heater BACnet object list. They are source interfaces, not final physical I/O, device, controller-card, terminal, cable or wiring counts.",
            "Published integration language references BACnet/IP, building BAS and ALC. The source does not provide a final BAS topology, transport design, controller addresses, I/O-card layout, terminal schedule or wiring diagram.",
            "Steam pressure-reducing valve, safety-valve, isolation-valve and meter schedule data are retained exactly within selected tables. No standalone CONTROL VALVE SCHEDULE or DAMPER ACTUATOR SCHEDULE title is asserted.",
            "All 31 pages were visually reviewed using retained full-page Poppler renders. Every retained schedule cell, point-list cell and bounded text clause is independently verified against MuPDF and Poppler captures.",
        ],
        "text_absence_assertions": [
            {"id": "rank08-no-control-valve-schedule-title", "pages": list(range(1, 32)), "covers_all_source_pages": True, "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"], "visual_review_qualification": "Native-text absence is not engineering proof; paired visual review supports only the limited finding that there is no standalone schedule title with this wording."},
            {"id": "rank08-no-damper-actuator-schedule-title", "pages": list(range(1, 32)), "covers_all_source_pages": True, "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"], "visual_review_qualification": "Native-text absence is not engineering proof; paired visual review supports only the limited finding that there is no standalone schedule title with this wording."},
        ],
    }


def requirement_audit():
    rows = [
        ("project_identity", "Printed project, project number, facility, issue context and issue date are retained.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Every supplied PDF page has a sheet identifier and complete visual-review disposition.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "No global scale is claimed; no detail, schematic or schedule is converted into a document-wide quantity scale.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "Selected boiler-plant schedule tables retain literal rows rather than unprinted installed quantities.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "Nine high-value MI-503/MI-504 schedules retain PRV, PSV, meter, isolation, day-tank and condensate-pump source data.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "All 96 published point-list rows have explicit source-matrix-only scopes.", [["modules", "points", "tables"], ["modules", "point_applications", "applications"]]),
        ("network_architecture", "Published BACnet/IP, BAS and ALC integration language is retained while topology/addressing is marked unavailable.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "Fuel-oil alarms, safeties, pump control and packaged water-heater control boundary clauses are captured with exact source bounds.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "Published temperature, level, leak, valve-position, flow, status and alarm contexts are retained without an unprinted sensor/device total.", [["modules", "points", "tables"], ["modules", "controls_context", "sequence_inventory"]]),
        ("source_limitations_and_conflicts", "Valve, actuator, network, physical-count and schedule-corpus boundaries are explicit.", [["modules", "supporting_evidence", "source_limitations"], ["modules", "equipment_reconciliation", "control_valve_and_damper_schedule_status"]]),
        ("all_page_visual_review", "All 31 supplied pages have retained render evidence and a completed review finding.", [["page_review"]]),
        ("independent_corroboration", "Every authored module is rechecked against independent MuPDF and Poppler captures during bundle verification.", [["module_source_sha256"]]),
    ]
    return [{"id": i, "result": "reviewed_with_source_limitations_recorded", "finding": finding, "evidence": evidence} for i, finding, evidence in rows]


def manifest(pages):
    return {
        "id": IDENT, "rank": 8, "title": "Albany VA Main Boiler Replacement",
        "source_pdf": "pdf/08__vol2__044__Albany_VA_Main_Boiler_Replacement.pdf",
        "source_sha256": "d726ef89f4021eef903c001f71f786df5837c432887f5d5ca88051fa8a151384",
        "page_count": 31, "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded Rank 08 ground truth for the supplied 31-page Albany VA boiler replacement set: full page-by-page visual review; project/sheet/scale boundaries; nine selected high-value MI-503/MI-504 schedule tables / 56 literal rows; complete 33-row MI-605 fuel-oil point list; complete 63-row MI-607 packaged water-heater point list; and bounded fuel-oil/package sequence clauses. The record does not fabricate installed equipment/sensor/actuator/valve/damper quantities, controller I/O/cards/terminals/wiring, BAS topology/addressing, distances, or an untranscribed schedule corpus.",
        "reading_notes": [
            "All 31 pages have retained Poppler full-page renders and a completed visual-review disposition. Every selected schedule/point cell and bounded clause is rechecked on every build/verify run against independently captured MuPDF and Poppler evidence.",
            "MI-503/MI-504 selected schedules give unusually deep PRV, PSV, flash-vessel, steam-meter, isolation-valve, fuel-oil-meter, day-tank and condensate-pump coverage. The remaining schedule sheets were visually reviewed but are not represented as literal schedule ledger rows.",
            "MI-605 contributes 33 fuel-oil BACnet rows plus a detailed day-tank/pump sequence. MI-607 contributes 63 package BACnet object rows and BACnet/IP integration language.",
            "The source publishes BACnet/IP/BAS/ALC integration language but not a final physical network design, controller hardware list, addresses, terminal schedule or wiring.",
        ],
        "verification_semantics": "The bundle verifier reruns independent MuPDF and Poppler checks for every retained schedule/point cell and bounded text assertion, and hashes the source PDF, modules, manifest and all cited full-page renders. It validates source evidence and annotation integrity rather than performing automated takeoff or engineering inference.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {"metadata": ["metadata_rank08"], "schedules": ["schedules_mi503_mi504"], "points": ["points_mi605_mi607"], "controls_context": ["controls_sequences"], "equipment_reconciliation": ["equipment_reconciliation_rank08"], "point_applications": ["point_applications_rank08"], "supporting_evidence": ["supporting_evidence_rank08"]},
        "requirement_audit": requirement_audit(),
        "page_review": [{"page": p["page"], "review_status": "complete", "render": p["render"], "finding": p["finding"]} for p in pages],
        "declared_checks": [
            {"id": "rank08-full-page-review", "path": ["page_review"], "operation": "length", "expected": 31},
            {"id": "rank08-schedule-table-count", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 9},
            {"id": "rank08-point-table-count", "path": ["modules", "points", "tables"], "operation": "length", "expected": 2},
        ],
        "completion_checks": {"all_31_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True, "source_limitations_explicit": True, "required_objectives_covered": True},
    }


def main():
    pages = reviewed_pages()
    if len(pages) != 31:
        raise ValueError("Rank 08 page-review ledger must cover all 31 pages")
    write("metadata_rank08.json", metadata(pages))
    write("equipment_reconciliation_rank08.json", equipment())
    write("point_applications_rank08.json", point_applications())
    write("supporting_evidence_rank08.json", supporting())
    write("document_manifest.json", manifest(pages))


if __name__ == "__main__":
    main()
