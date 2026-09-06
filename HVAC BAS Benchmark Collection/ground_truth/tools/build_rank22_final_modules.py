"""Author Rank 22 metadata, full visual ledger, boundaries, and bundle manifest."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "22__vol2__012"
WORK = AUDIT / "work" / IDENT

SHEETS = [
    "G000", "G001", "G003", "A100", "A101", "S001", "S002", "S101", "ME001", "ME002",
    "MPD110A", "MPD110B", "MP110A", "MP110B", "M501", "MD511", "M511", "M512", "M601", "M701", "M702",
    "ED110A", "ED110B", "E110A", "E110B", "E501", "E601", "ED701", "E701",
]


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / (name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def pages():
    findings = [
        "Cover sheet, project identity, issue date, team/title-block information and full drawing index visually reviewed.",
        "Overall Level 1 plan visually reviewed as site/building context.",
        "Code-analysis sheet visually reviewed.",
        "Architectural general-information and enlarged-floor-plan sheet visually reviewed.",
        "Architectural wall-section/detail sheet visually reviewed.",
        "Structural general-notes sheet visually reviewed.",
        "Structural typical-details sheet visually reviewed.",
        "Structural partial-plans sheet visually reviewed.",
        "Mechanical/electrical symbols sheet visually reviewed as legend context.",
        "Mechanical/electrical general-notes sheet visually reviewed.",
        "Level 1 mechanical piping demolition plan A visually reviewed.",
        "Level 1 mechanical piping demolition plan B visually reviewed.",
        "Level 1 mechanical piping new-work plan A visually reviewed.",
        "Level 1 mechanical piping new-work plan B visually reviewed.",
        "Mechanical detail sheet visually reviewed.",
        "Mechanical P&ID demolition sheet visually reviewed.",
        "Mechanical P&ID new-work sheet visually reviewed.",
        "Mechanical P&ID sheet visually reviewed.",
        "M601 dense mechanical schedule sheet visually reviewed; all 24 equipment-schedule rows are retained separately.",
        "M701 formal 101-row DDC point matrix and staged chilled-water sequence of operation visually reviewed; coordinate-bounded rows and clauses are retained separately.",
        "M702 chilled/condenser-water controls diagram and sensor notes visually reviewed.",
        "Level 1 electrical power-plan demolition A visually reviewed.",
        "Level 1 electrical power-plan demolition B visually reviewed.",
        "Level 1 electrical power-plan new-work A visually reviewed.",
        "Level 1 electrical power-plan new-work B visually reviewed.",
        "Electrical-detail sheet visually reviewed, including typical BAS-panel-nameplate context.",
        "E601 VFD, disconnect-switch and existing panelboard schedules visually reviewed; VFD controls-interface clauses are retained separately.",
        "Electrical one-line demolition diagram visually reviewed.",
        "Electrical one-line new-work diagram visually reviewed.",
    ]
    return [{"page": i, "sheet": sheet, "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": findings[i - 1]}
            for i, sheet in enumerate(SHEETS, 1)]


def audit():
    checks = [
        ("project_identity", "Cover source bounds the project, behavioral-medicine facility, Kansas City location, MEP engineer and issue date.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Every one of the 29 supplied pages is represented by a source sheet identifier and retained visual-review finding.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "Stated scales are retained for reviewed plan sheets; no local scale is made document-global or converted to distances.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "All 24 M601 equipment schedule rows are literal source rows, including three chillers, three towers, one tank, two separators, two feeders and thirteen pumps.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "Six M601 schedule tables and all printed equipment rows have bounded source cells/rows.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "M701's 101 formal chilled-water point rows retain the published DI/DO/AI/AO flags, while ownership and controller assignment limits remain explicit.", [["modules", "points", "tables"], ["modules", "point_applications", "expanded_template_counts"]]),
        ("network_architecture", "M601 BACnet MS/TP note plus M701 BAS control and E601 VFD controls-interface requirements are bounded without an invented topology.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "M701's staged chiller, differential-pressure, tower, condenser-pump, lead/lag and refrigerant-purge logic is retained as bounded clauses.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "Source sensor contexts and M702 thermowell note are retained without derived zone or physical-device counts.", [["modules", "controls_context", "sensors_and_control_symbol_context"]]),
        ("source_limitations_and_conflicts", "Formal point scope, standalone schedule-title limits, topology limits and physical-count limits are explicit.", [["modules", "supporting_evidence", "source_limitations"]]),
        ("all_page_visual_review", "All 29 source pages have retained full-page Poppler renders and review findings.", [["page_review"]]),
        ("independent_corroboration", "Every authored source module is rechecked against both MuPDF and Poppler during bundle construction and verification.", [["module_source_sha256"]]),
    ]
    return [{"id": id_, "result": "reviewed_with_source_limitations_recorded", "finding": finding, "evidence": evidence}
            for id_, finding, evidence in checks]


def main():
    review = pages()
    assert len(review) == 29
    write("metadata_rank22", {
        "document_id": IDENT,
        "module_role": "Cover/title-sheet project facts, all-page sheet ledger, stated-scale witnesses and visual-review disposition.",
        "tables": [],
        "project": {
            "project_name_as_printed": "CHILLER SYSTEM UPGRADE",
            "facility_as_printed": "CENTER FOR BEHAVIORAL MEDICINE",
            "location_as_printed": "KANSAS CITY, MISSOURI",
            "building_type_as_printed": "Behavioral medicine facility (from printed facility name; a more specific occupancy/use classification is not published in this set).",
            "mep_engineer_as_printed": "INSITE GROUP, INC.",
            "issue_date_as_printed": "FEBRUARY 4, 2025",
            "assertion_ids": ["cover-project", "cover-facility", "cover-location", "cover-mep-engineer", "cover-issue-date"],
        },
        "scale_semantics": {
            "stated_scale_records": [
                {"page": 2, "sheet": "G001", "printed_scale": "1/16\" = 1'-0\"", "assertion_id": "g001-scale"},
                {"page": 11, "sheet": "MPD110A", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "mpd110a-scale"},
                {"page": 12, "sheet": "MPD110B", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "mpd110b-scale"},
                {"page": 13, "sheet": "MP110A", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "mp110a-scale"},
                {"page": 14, "sheet": "MP110B", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "mp110b-scale"},
                {"page": 22, "sheet": "ED110A", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "ed110a-scale"},
                {"page": 23, "sheet": "ED110B", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "ed110b-scale"},
                {"page": 24, "sheet": "E110A", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "e110a-scale"},
                {"page": 25, "sheet": "E110B", "printed_scale": "1/4\" = 1'-0\"", "assertion_id": "e110b-scale"},
            ],
            "graphic_scale_bar_status": "No graphic scale bar is asserted as a source of measurement. The stated scales are local to their individual plan views; schedules, P&IDs, controls diagrams, schematics and one-lines are not made distance-takeoff sources.",
            "takeoff_scale_status": "No global scale is asserted across this mixed 29-sheet source set and no physical distance or quantity is derived from a local stated scale.",
        },
        "visual_review_pages": review,
        "assertions": [
            {"id": "cover-project", "page": 1, "bbox": [2335, 980, 2570, 1015], "expected": "CHILLER SYSTEM UPGRADE", "mode": "exact"},
            {"id": "cover-facility", "page": 1, "bbox": [370, 285, 2110, 430], "expected": "CENTER FOR BEHAVIORAL MEDICINE", "mode": "contains"},
            {"id": "cover-location", "page": 1, "bbox": [810, 395, 1700, 515], "expected": "KANSAS CITY, MISSOURI", "mode": "contains"},
            {"id": "cover-mep-engineer", "page": 1, "bbox": [1848, 650, 2085, 695], "expected": "INSITE GROUP, INC.", "mode": "contains"},
            {"id": "cover-issue-date", "page": 1, "bbox": [2335, 1668, 2465, 1700], "expected": "FEBRUARY 4, 2025", "mode": "contains"},
            {"id": "g001-scale", "page": 2, "bbox": [1088, 1598, 1205, 1625], "expected": "SCALE: 1/16\" = 1'-0\"", "mode": "exact"},
            {"id": "mpd110a-scale", "page": 11, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "mpd110b-scale", "page": 12, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "mp110a-scale", "page": 13, "bbox": [767, 1635, 878, 1662], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "mp110b-scale", "page": 14, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "ed110a-scale", "page": 22, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "ed110b-scale", "page": 23, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "e110a-scale", "page": 24, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
            {"id": "e110b-scale", "page": 25, "bbox": [767, 1598, 878, 1625], "expected": "SCALE: 1/4\" = 1'-0\"", "mode": "exact"},
        ],
    })
    write("equipment_reconciliation_rank22", {
        "document_id": IDENT,
        "module_role": "M601 literal schedule-row ledger and physical-count boundary.", "tables": [],
        "ledger_mode": "literal_schedule_rows_v1",
        "schedule_counts": {"tables": 6, "rows": 24, "interpretation": "Three water-cooled chillers, three cooling towers, one expansion tank, two air separators, two chemical feeders and thirteen pumps. These are source schedule rows, not inferred plan-installation counts."},
        "control_valve_and_damper_schedule_status": {"control_valve_schedule": "No standalone CONTROL VALVE SCHEDULE title is published in the supplied 29 pages.", "damper_actuator_schedule": "No standalone DAMPER ACTUATOR SCHEDULE title is published in the supplied 29 pages."},
        "source_boundary": "Literal equipment schedule rows do not prove plan placement, installed multiplicity, BAS control ownership, field wiring, controller I/O, field-device count or a total physical takeoff.",
    })
    write("point_applications_rank22", {
        "document_id": IDENT, "module_role": "Formal M701 source-matrix scope and ownership boundary.", "tables": [],
        "ledger_mode": "source_matrix_templates_v1",
        "applications": [{"id": "m701-chilled-water-system", "source_table": "M701-CHW-DDC-HARDWIRED-IO", "ownership_scope": "M701 printed chilled-water-system source-matrix scope; physical owner, final controller/card binding and installed-device assignment are not stated."}],
        "expanded_template_counts": {"source_rows": 101, "total": 101},
        "expanded_count_warning": "101 is the count of literal published M701 source rows. It is not a count of installed physical sensors, actuators, controllers, terminations, cards, wires or devices.",
    })
    write("supporting_evidence_rank22", {
        "document_id": IDENT, "module_role": "Explicit source limits, omitted-scope disclosure and standalone-schedule-title checks.", "tables": [],
        "source_limitations": [
            "All 29 pages have retained full-page visual review. M601's complete 24-row equipment schedule corpus, M701's complete 101-row DDC hardwired-I/O matrix, and source-bounded sequence/integration material are retained; other plans, details and one-lines remain reviewed context rather than inferred inventory.",
            "M701's formal point matrix includes additional integration, GUI application, alarming and operational flags. This record preserves its 101 rows and the published DI/DO/AI/AO cells without reclassifying other flags as hardwired physical I/O.",
            "The supplied set does not publish a controller-address list, controller/card/terminal assignment, BACnet object list, router/media design, wiring/termination schedule, final network topology, physical point ownership, or a final installed field-device count.",
            "No standalone Control Valve Schedule or Damper Actuator Schedule title appears in this full source set. Diagram symbols and sequence references are not converted to valve, damper, actuator or device quantities.",
            "Stated plan scales are local to individual plan views. No global scale, graphic-scale measurement, length, area or derived takeoff quantity is asserted.",
        ],
        "text_absence_assertions": [
            {"id": "no-control-valve-schedule", "pages": list(range(1, 30)), "covers_all_source_pages": True, "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"], "visual_review_qualification": "Native text plus full-page visual review support only the limited absence of this standalone title."},
            {"id": "no-damper-actuator-schedule", "pages": list(range(1, 30)), "covers_all_source_pages": True, "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"], "visual_review_qualification": "Native text plus full-page visual review support only the limited absence of this standalone title."},
        ],
    })
    write("document_manifest", {
        "id": IDENT, "rank": 22, "title": "Center for Behavioral Medicine Chiller Upgrade",
        "source_pdf": "pdf/22__vol2__012__Center_for_Behavioral_Medicine_Chiller_Upgrade.pdf", "source_sha256": "b008fd1b72a48adc5ccbacfa74fcf377dd93bbd30c4b8d2ebec2c540a6248711", "page_count": 29,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded Rank 22 ground truth: full 29-page visual review; project/sheet/scale boundaries; all 24 M601 equipment schedule rows; all 101 M701 point rows with printed hardwired DI/DO/AI/AO cells; staged M701 sequences; M601 BACnet MS/TP note; M702 sensor-note context; E601 VFD controls-interface context; and explicit topology, physical-count and ownership limitations. Nothing is inferred as a final physical BAS takeoff.",
        "reading_notes": ["M601 is a dense vector schedule source for three water-cooled chillers, three cooling towers and thirteen water pumps, with capacities, flow, power and specification information in the literal rows.", "M701 is a rare formal 101-row DDC chilled-water point matrix plus a detailed staged chiller sequence covering lead/lag, DP, tower, refrigeration-monitor and seasonal operations.", "M601 explicitly calls for a BACnet MS/TP chiller communication interface and E601 records a controls-contractor VFD interface requirement."],
        "verification_semantics": "The bundle verifier rechecks every retained row/assertion against independent MuPDF and Poppler evidence and hashes source/renders. It does not infer plan quantities, controller topology or physical installations.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {"metadata": ["metadata_rank22"], "schedules": ["schedules_m601"], "points": ["points_m701"], "controls_context": ["controls_context_rank22"], "equipment_reconciliation": ["equipment_reconciliation_rank22"], "point_applications": ["point_applications_rank22"], "supporting_evidence": ["supporting_evidence_rank22"]},
        "requirement_audit": audit(),
        "page_review": [{"page": item["page"], "review_status": "complete", "render": item["render"], "finding": item["finding"]} for item in review],
        "declared_checks": [{"id": "pages", "path": ["page_review"], "operation": "length", "expected": 29}, {"id": "schedules", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 6}, {"id": "points", "path": ["modules", "points", "tables"], "operation": "length", "expected": 1}],
        "completion_checks": {"all_29_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True, "source_limitations_explicit": True, "required_objectives_covered": True},
    })


if __name__ == "__main__":
    main()
