"""Author Rank 09 metadata, scope boundaries, full page review and manifest."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "09__vol2__014"
WORK = AUDIT / "work" / IDENT

PAGES = [
    ("M0.1", "MECH NOTES & LEGENDS", "Mechanical notes, HVAC/BAS/control legends, sensor/valve symbols, commissioning and source limitations visually reviewed."),
    ("M0.2", "MECH SCHEDULES", "Mechanical schedules and AHU/condensing-unit control notes visually reviewed; selected condensing-unit rows captured."),
    ("M0.3", "MECH SCHEDULES CONTINUED", "Mechanical schedules visually reviewed; the complete 17-row CONTROL DAMPER SCHEDULE is captured."),
    ("M0.4", "MECH SCHEDULES CONTINUED", "Mechanical schedules and central-equipment control notes visually reviewed; selected boiler, steam-generator and pump rows captured."),
    ("M0.5", "MEP COORDINATION SCHEDULE", "MEP coordination schedule visually reviewed; retained as source context."),
    ("MD2.0", "'A' WING MECH DEMO PLANS", "Mechanical demolition plans visually reviewed; retained as source context."),
    ("MD2.1", "'A' WING MECH DEMO PLANS", "Mechanical demolition plans visually reviewed; retained as source context."),
    ("MD2.2", "'A' WING MECH DEMO PLANS", "Mechanical demolition plans visually reviewed; retained as source context."),
    ("MD2.3", "'B' & 'C' WING MECH DEMO", "Mechanical demolition plan visually reviewed; retained as source context."),
    ("MD2.4", "'B' WING - MECH DEMO PLANS", "Mechanical demolition plans visually reviewed; retained as source context."),
    ("MD3.1", "ENLARGED MECH DEMO", "Enlarged mechanical demolition drawings visually reviewed; retained as source context."),
    ("MD5.1", "'A' WING MECH DEMO SECTIONS", "Mechanical demolition section drawings visually reviewed; retained as source context."),
    ("MD5.2", "'A' WING MECH DEMO SECTIONS", "Mechanical demolition section drawings visually reviewed; retained as source context."),
    ("M2.0", "'A' WING MECH PLANS", "Mechanical plan drawings visually reviewed; retained as source context."),
    ("M2.1", "'A' WING MECH PLANS", "Mechanical plan drawings visually reviewed; retained as source context."),
    ("M2.2", "'A' WING MECH PLANS", "Mechanical plan drawings visually reviewed; retained as source context."),
    ("M2.3", "'B' & 'C' WING MECH PLANS", "Mechanical plan drawings visually reviewed; retained as source context."),
    ("M2.4", "'B' WING MECH PLANS", "Mechanical plan drawings visually reviewed; retained as source context."),
    ("M3.1", "ENLARGED MECHANICAL PLANS", "Enlarged mechanical plan drawings visually reviewed; retained as source context."),
    ("M5.1", "'A' WING MECH SECTION", "Mechanical section drawings visually reviewed; retained as source context."),
    ("M5.2", "'A' WING MECH SECTION", "Mechanical section drawings visually reviewed; retained as source context."),
    ("M9.1", "MECH DETAILS", "Mechanical details visually reviewed; retained as source context."),
    ("M9.2", "MECH DETAILS CONTINUED", "Mechanical details including referenced control-valve context visually reviewed; retained as source context."),
    ("M9.3", "MECHANICAL ENLARGED PLANS", "Mechanical enlarged plans visually reviewed; retained as source context."),
    ("M9.4", "MECH DETAILS CONTINUED", "Mechanical detail drawings visually reviewed; retained as source context."),
    ("M9.5", "CONTROL DIAGRAMS", "Control diagrams visually reviewed; retained as source context."),
    ("M9.6", "CONTROL DIAGRAMS", "AHU control diagrams, low-voltage damper note and P/E enable thresholds visually reviewed and bounded clauses captured."),
    ("M9.7", "CONTROL DIAGRAMS", "Hot-water and unit-heater DDC diagrams plus BAS/control-symbol definitions visually reviewed and bounded clauses captured."),
]


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def reviewed_pages():
    return [{"page": i, "sheet": sheet, "title": title,
             "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": finding}
            for i, (sheet, title, finding) in enumerate(PAGES, 1)]


def metadata(pages):
    return {
        "document_id": IDENT,
        "module_role": "Project/title-block facts, full supplied-sheet ledger, scale boundary and complete visual-review disposition for all source pages.",
        "tables": [],
        "project": {
            "project_name_as_printed": "FIRE SCIENCES LABORATORY MECHANICAL UPGRADES",
            "project_number_as_printed": "15044.10",
            "facility_as_printed": "USFS / ROCKY MOUNTAIN RESEARCH STATION",
            "issue_as_printed": "CONSTRUCTION DOCUMENTS",
            "assertion_ids": ["rank09-project", "rank09-number", "rank09-facility", "rank09-first-sheet"],
        },
        "sheet_details": {
            "sheet_ledger_semantics": "All 28 supplied PDF pages have a retained full-page Poppler render and a completed visual-review disposition. Sheet identifiers and titles are transcribed from reviewed title blocks.",
        },
        "scale_semantics": {
            "takeoff_scale_status": "No global drawing scale is asserted. The set mixes schedules, diagrams, notes, plans, details and sections; no local scale is promoted into a document-wide quantity conversion.",
            "printed_local_view_scales_observed": ["N.T.S. appears on individual control-detail views."],
            "boundary": "Schedule, legend and schematic facts are retained as source-bound text/table facts, not distance-based takeoff quantities.",
        },
        "visual_review_pages": pages,
        "assertions": [
            {"id": "rank09-project", "page": 1, "bbox": [1978, 1412, 2287, 1464], "expected": "FIRE SCIENCES LABORATORY MECHANICAL UPGRADES", "mode": "exact"},
            {"id": "rank09-number", "page": 1, "bbox": [1697, 1205, 1750, 1221], "expected": "15044.10", "mode": "exact"},
            {"id": "rank09-facility", "page": 1, "bbox": [2014, 1497, 2251, 1510], "expected": "USFS / ROCKY MOUNTAIN RESEARCH STATION", "mode": "exact"},
            {"id": "rank09-first-sheet", "page": 1, "bbox": [1878, 1426, 1944, 1463], "expected": "M0.1", "mode": "exact"},
        ],
    }


def equipment():
    return {
        "document_id": IDENT,
        "module_role": "Presentation registry for the complete literal schedule-row corpus selected from M0.2-M0.4. It does not infer installed multiplicity, procurement, plan placement or physical equipment identity beyond printed rows.",
        "tables": [], "ledger_mode": "literal_schedule_rows_v1",
        "schedule_counts": {"tables": 5, "rows": 27, "interpretation": "Five selected high-value schedule tables and 27 literal rows are retained: condensing units, control dampers, condensing boilers, steam generators and hot-water pumps."},
        "control_valve_and_damper_schedule_status": {
            "damper_actuator_schedule": "M0.3 explicitly publishes a 17-row CONTROL DAMPER SCHEDULE, including printed control/failure-state fields. It is completely captured in the literal schedule module.",
            "control_valve_schedule": "No standalone schedule titled CONTROL VALVE SCHEDULE is asserted. Control-valve symbols and bounded boiler/coil control language are retained as legend/diagram/source context, not expanded into a schedule row inventory.",
        },
        "source_boundary": "The selected schedule tables are source references, not proof of plan placement, installed quantity, final purchasing scope, actuator count, physical BAS I/O, controllers, terminals or wiring.",
    }


def points():
    return {
        "document_id": IDENT,
        "module_role": "Explicit point-list finding for the supplied Rank 09 source set.",
        "tables": [], "assertions": [],
        "point_list_status": {
            "formal_row_matrix": "not_published_in_supplied_drawings",
            "finding": "The drawings reference a control-points list but do not publish a conventional tabular point-list row matrix within the supplied 28 pages. Symbol definitions, DDC-diagram labels and exact control clauses are retained in controls_context instead.",
            "boundary": "No source row, logical point, controller I/O, terminal, wire, sensor, valve, damper or actuator count is invented from diagram symbols or references to external specifications.",
        },
    }


def point_applications():
    return {
        "document_id": IDENT,
        "module_role": "Explicit no-row point-list disposition for the supplied drawing set.",
        "tables": [], "ledger_mode": "literal_source_row_matrices_v1", "applications": [],
        "expanded_template_counts": {"source_rows": 0, "total": 0},
        "expanded_count_warning": "0 is an explicit count of published formal point-list source rows in this supplied set; it is not an installed BAS point, controller, I/O, terminal, cable, sensor, valve, damper, actuator or device total.",
    }


def supporting():
    return {
        "document_id": IDENT,
        "module_role": "Explicit source limitations and corroboration boundaries for the complete 28-page supplied set.",
        "tables": [],
        "source_limitations": [
            "The literal schedule modules completely capture five selected high-value M0.2-M0.4 schedule tables (27 rows). Other visually reviewed schedules are not silently represented as a transcribed inventory.",
            "M0.3 publishes a 17-row CONTROL DAMPER SCHEDULE with control and fail-state fields. Its literal schedule rows are not expanded into physical damper, actuator, linkage, end-switch, wiring or controller-I/O counts.",
            "The drawings repeatedly reference control-point lists and external specifications, but do not publish a conventional point-list row matrix. DDC symbols and diagram labels are retained as bounded context, not invented I/O rows.",
            "Published BMS, DDC, P/E, gateway/interface, control-valve and sensor language does not constitute a final BAS topology, controller address list, I/O-card layout, terminal schedule, network-media design or wire schedule.",
            "No standalone CONTROL VALVE SCHEDULE is asserted. M0.1/M9.7 control-valve symbols and bounded control clauses are not a substitute for a table that is not published.",
            "All 28 pages were visually reviewed using retained full-page Poppler renders. Every retained schedule cell and bounded source clause is independently verified against MuPDF and Poppler captures.",
        ],
        "text_absence_assertions": [
            {"id": "rank09-no-control-valve-schedule-title", "pages": list(range(1, 29)), "covers_all_source_pages": True, "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"], "visual_review_qualification": "Native-text absence is not engineering proof; paired visual review supports only the limited finding that there is no standalone schedule title with this wording."},
        ],
    }


def requirement_audit():
    rows = [
        ("project_identity", "Printed project, project number, facility and issue context are retained.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Every supplied PDF page has a sheet identifier, title and complete visual-review disposition.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "No global scale is claimed; mixed plans, schedules, diagrams, details and sections are not converted into a document-wide quantity scale.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "Selected M0.2-M0.4 schedule tables retain literal rows rather than invented installed quantities.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "Five high-value schedule tables retain 27 literal central-equipment/damper rows, including size, capacity, control and fail-state fields where printed.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "No formal source point-list matrix is published; the no-row status and count boundary are explicit.", [["modules", "points", "point_list_status"], ["modules", "point_applications", "expanded_template_counts"]]),
        ("network_architecture", "Published BMS/DDC/P-E/gateway context is retained while topology/addressing/controller-hardware information is marked unavailable.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "Bounded clauses retain compressor staging, AHU changeover, damper, boiler, pump, steam-generator and pneumatic/electric interface contexts.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "Sensor/valve/damper symbol context and majority-zone-voting language are retained without an unprinted installed-device count.", [["modules", "controls_context", "sensors_and_control_symbol_context"], ["modules", "controls_context", "sequence_inventory"]]),
        ("source_limitations_and_conflicts", "Schedule-corpus, point-list, valve, actuator, network and physical-count boundaries are explicit.", [["modules", "supporting_evidence", "source_limitations"], ["modules", "equipment_reconciliation", "control_valve_and_damper_schedule_status"]]),
        ("all_page_visual_review", "All 28 supplied pages have retained full-page render evidence and completed review findings.", [["page_review"]]),
        ("independent_corroboration", "Every authored module is rechecked against independent MuPDF and Poppler captures during bundle verification.", [["module_source_sha256"]]),
    ]
    return [{"id": id_, "result": "reviewed_with_source_limitations_recorded", "finding": finding, "evidence": evidence} for id_, finding, evidence in rows]


def manifest(pages):
    return {
        "id": IDENT, "rank": 9, "title": "Missoula Fire Sciences Laboratory Mechanical Upgrade",
        "source_pdf": "pdf/09__vol2__014__Missoula_Fire_Sciences_Laboratory_Mechanical_Upgrade.pdf",
        "source_sha256": "f208e34965aba62b3752f39b2691e2a418ac823bd99dbaadfb2e7b06391fc7ff",
        "page_count": 28, "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded Rank 09 ground truth for the supplied 28-page Missoula Fire Sciences Laboratory Mechanical Upgrade set: full page-by-page visual review; project/sheet/scale boundaries; complete 17-row M0.3 CONTROL DAMPER SCHEDULE; four selected central-equipment schedule tables / 10 literal rows; BMS/DDC/legend context; and 34 bounded controls/sequence clauses. The record does not fabricate installed equipment/sensor/actuator/valve/damper quantities, formal BAS point rows, controller I/O/cards/terminals/wiring, BAS topology/addressing, distances, or an untranscribed schedule corpus.",
        "reading_notes": [
            "All 28 pages have retained Poppler full-page renders and a completed visual-review disposition. Every selected schedule cell and bounded source clause is rechecked on every build/verify run against independently captured MuPDF and Poppler evidence.",
            "M0.3 is especially valuable for BAS takeoff evaluation: it publishes 17 literal control-damper rows with function, maximum CFM, mounting, control mode and failure position, while its notes cover end switches, actuator torque, low/line-voltage power and existing-damper DDC integration.",
            "M0.2/M0.4 provide selected condensing-unit, boiler, gas-fired steam-generator and pump schedules plus bounded DDC, P/E, staging, gateway and fuel-shutoff source clauses.",
            "M9.6/M9.7 control diagrams define source terms/symbols and show controls context, but the supplied drawings do not include a conventional control-points table. No row-level I/O list is inferred from those graphics.",
        ],
        "verification_semantics": "The bundle verifier reruns independent MuPDF and Poppler checks for every retained schedule cell and bounded text assertion, and hashes the source PDF, modules, manifest and all cited full-page renders. It validates source evidence and annotation integrity rather than performing automated takeoff or engineering inference.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {"metadata": ["metadata_rank09"], "schedules": ["schedules_m03_dampers", "schedules_core_equipment"], "points": ["points_rank09"], "controls_context": ["controls_sequences"], "equipment_reconciliation": ["equipment_reconciliation_rank09"], "point_applications": ["point_applications_rank09"], "supporting_evidence": ["supporting_evidence_rank09"]},
        "requirement_audit": requirement_audit(),
        "page_review": [{"page": p["page"], "review_status": "complete", "render": p["render"], "finding": p["finding"]} for p in pages],
        "declared_checks": [
            {"id": "rank09-full-page-review", "path": ["page_review"], "operation": "length", "expected": 28},
            {"id": "rank09-schedule-table-count", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 5},
            {"id": "rank09-point-table-count", "path": ["modules", "points", "tables"], "operation": "length", "expected": 0},
        ],
        "completion_checks": {"all_28_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True, "source_limitations_explicit": True, "required_objectives_covered": True},
    }


def main():
    pages = reviewed_pages()
    if len(pages) != 28:
        raise ValueError("Rank 09 page-review ledger must cover all 28 pages")
    write("metadata_rank09.json", metadata(pages))
    write("points_rank09.json", points())
    write("equipment_reconciliation_rank09.json", equipment())
    write("point_applications_rank09.json", point_applications())
    write("supporting_evidence_rank09.json", supporting())
    write("document_manifest.json", manifest(pages))


if __name__ == "__main__":
    main()
