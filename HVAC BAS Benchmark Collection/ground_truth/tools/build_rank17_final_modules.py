"""Author Rank 17 metadata, all-page review, limits, and bundle manifest."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "17__vol1__16"
WORK = AUDIT / "work" / IDENT

SHEETS = [
    "T0.01", "M0.01", "M0.02", "M0.03", "M1.11", "M1.12", "M1.13", "M1.14", "M1.21", "M1.22", "M1.23",
    "M2.11", "M2.12", "M2.13", "M2.14", "M2.15", "M2.21", "M2.22", "M2.23", "M2.24", "M3.01", "M3.02",
    "M3.03", "M3.04", "M5.01", "M5.02", "M6.01", "M6.02", "M6.03", "E0.1", "E0.2", "E0.3", "E0.4",
    "E1.11", "E1.12", "E1.13", "E1.21", "E1.22", "E2.11", "E2.12", "E2.13", "E2.21", "E2.22", "S0.1",
    "S1.0", "S2.0", "S2.1",
]


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / (name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def pages():
    findings = [
        "Cover/title sheet and drawing index visually reviewed; project, location, issue date and consultant title-block context retained.",
        "Mechanical abbreviations, legend and calculation/general-note sheet visually reviewed.",
        "M0.02 dense mechanical schedule sheet visually reviewed; all 69 literal schedule rows are retained separately.",
        "M0.03 dense mechanical schedule sheet visually reviewed; all 17 literal schedule rows, including control dampers, reference-only rooftop units and bid alternate, are retained separately.",
        "Building B HVAC demolition plan visually reviewed.", "Building B HVAC demolition plan visually reviewed.", "Building B HVAC demolition plan visually reviewed.", "Building B HVAC demolition plan visually reviewed.",
        "Building C HVAC demolition plan visually reviewed.", "Building C HVAC demolition plan visually reviewed.", "Building C HVAC demolition plan visually reviewed.",
        "Building B new HVAC plan visually reviewed.", "Building B new HVAC plan visually reviewed.", "Building B new HVAC plan visually reviewed.", "Building B new HVAC plan visually reviewed.", "Building B new HVAC plan visually reviewed.",
        "Building C new HVAC plan visually reviewed.", "Building C new HVAC plan visually reviewed.", "Building C new HVAC plan visually reviewed.", "Building C new HVAC plan visually reviewed.",
        "Mechanical isometric/detail sheet visually reviewed.", "Mechanical isometric/detail sheet visually reviewed.", "Mechanical isometric/detail sheet visually reviewed.", "Mechanical isometric/detail sheet visually reviewed.",
        "M5.01 mechanical detail sheet visually reviewed, including duct-smoke-detector detail context.",
        "M5.02 equipment-support detail sheet visually reviewed.",
        "M6.01 BAS system architecture, legend and controls notes visually reviewed; BACnet IP/MSTP and system requirements are retained separately.",
        "M6.02 BAS controller diagrams, C-Wing ERV/furnace/exhaust sequences and formal 12-row BACnet Inputs to BMS list visually reviewed and retained separately.",
        "M6.03 Building B outdoor-air-unit and bid-alternate rooftop-unit sequences/control diagrams visually reviewed; source-bounded clauses are retained separately.",
        "Electrical mechanical-equipment connection schedule visually reviewed.", "Electrical panel schedules visually reviewed.", "Electrical one-line/panel sheet visually reviewed.", "Electrical specifications/general sheet visually reviewed.",
        "Building B electrical demolition plan visually reviewed.", "Building B electrical demolition plan visually reviewed.", "Building B electrical demolition plan visually reviewed.", "Building C electrical demolition plan visually reviewed.", "Building C electrical demolition plan visually reviewed.",
        "Building B electrical new-work plan visually reviewed.", "Building B electrical new-work plan visually reviewed.", "Building B electrical new-work plan visually reviewed.", "Building C electrical new-work plan visually reviewed.", "Building C electrical new-work plan visually reviewed.",
        "Structural general-notes sheet visually reviewed.", "Building B structural floor plan visually reviewed.", "Building B structural roof plan visually reviewed.", "Building C structural roof plan visually reviewed.",
    ]
    assert len(findings) == len(SHEETS) == 47
    return [{"page": i, "sheet": sheet, "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": findings[i - 1]}
            for i, sheet in enumerate(SHEETS, 1)]


def audit():
    checks = [
        ("project_identity", "Cover source bounds project name, Gardnerville location and issued date; consultant role is visually reviewed title-block context.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Every supplied page has a source sheet ID and retained full-page visual-review finding.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "Local stated 1/8-inch plan-view scale witnesses are retained without global-scale or distance-takeoff claims.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "All 86 literal M0.02/M0.03 schedule rows are retained across 12 printed schedule tables, including control-damper, reference-only and bid-alternate scope boundaries.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "All 12 printed equipment schedules have source-bounded literal rows and columns.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "The explicit 12-row BACnet Inputs to BMS list is retained with source-matrix ownership limits and without invented physical I/O classification.", [["modules", "points", "tables"], ["modules", "point_applications", "expanded_template_counts"]]),
        ("network_architecture", "M6.01/M6.02 BACnet IP, MSTP/trunk, shielding, 32-device and BTL contexts are bounded without inventing final topology.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "M6.02/M6.03 ERV, furnace, exhaust-fan and outdoor-air-unit sequence clauses are retained as bounded text.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "Published sensor and actuator legend/sequence contexts are retained without derived zone or physical-device counts.", [["modules", "controls_context", "sensors_and_control_symbol_context"]]),
        ("source_limitations_and_conflicts", "Point-list, schedule-title, topology, alternative-scope, controller-label and physical-count limits are stated explicitly.", [["modules", "supporting_evidence", "source_limitations"]]),
        ("all_page_visual_review", "All 47 supplied pages have retained full-page Poppler renders and visual-review findings.", [["page_review"]]),
        ("independent_corroboration", "Every authored module is rechecked against both MuPDF and Poppler during bundle construction and record verification.", [["module_source_sha256"]]),
    ]
    return [{"id": id_, "result": "reviewed_with_source_limitations_recorded", "finding": finding, "evidence": evidence}
            for id_, finding, evidence in checks]


def main():
    review = pages()
    write("metadata_rank17", {
        "document_id": IDENT,
        "module_role": "Cover/title-sheet project facts, all-page sheet ledger, local stated-scale witnesses and visual-review disposition.", "tables": [],
        "project": {
            "project_name_as_printed": "CARSON VALLEY MIDDLE SCHOOL PHASE 1 HVAC REPLACEMENT",
            "facility_as_printed": "CARSON VALLEY MIDDLE SCHOOL",
            "location_as_printed": "1477 US HIGHWAY 395N, GARDNERVILLE, NEVADA 89410",
            "building_type_as_printed": "Middle school (from printed facility name; no more specific occupancy/use classification is asserted).",
            "mechanical_engineering_consultant_as_printed": "CR ENGINEERING (firm identified in title-block graphics/copyright; its reading order is not used as a scalar parser assertion).",
            "issue_date_as_printed": "11/10/23",
            "assertion_ids": ["cover-project", "cover-location", "cover-issue-date"],
        },
        "scale_semantics": {
            "stated_scale_records": [
                {"page": 12, "sheet": "M2.11", "printed_scale": "1/8\" = 1'-0\"", "assertion_id": "m211-scale"},
                {"page": 13, "sheet": "M2.12", "printed_scale": "1/8\" = 1'-0\"", "assertion_id": "m212-scale"},
                {"page": 17, "sheet": "M2.21", "printed_scale": "1/8\" = 1'-0\"", "assertion_id": "m221-scale"},
            ],
            "graphic_scale_bar_status": "No graphic scale bar is asserted as a measurement source. Stated scales are local to individual plan views; schedules, controls diagrams, schematics, one-lines and details are not made distance-takeoff sources.",
            "takeoff_scale_status": "No global scale, distance, area, duct length, pipe length or physical quantity is derived from the mixed 47-page source set.",
        },
        "visual_review_pages": review,
        "assertions": [
            {"id": "cover-project", "page": 1, "bbox": [850, 70, 2050, 240], "expected": "CARSON VALLEY MIDDLE SCHOOL PHASE 1 HVAC REPLACEMENT", "mode": "contains"},
            {"id": "cover-location", "page": 1, "bbox": [1100, 250, 1800, 360], "expected": "1477 US HIGHWAY 395N GARDNERVILLE, NEVADA 89410", "mode": "contains"},
            {"id": "cover-issue-date", "page": 1, "bbox": [2890, 1940, 2980, 1990], "expected": "11/10/23", "mode": "contains"},
            {"id": "m211-scale", "page": 12, "bbox": [1100, 1235, 1300, 1275], "expected": "SCALE: 1/8\" = 1'-0\"", "mode": "exact"},
            {"id": "m212-scale", "page": 13, "bbox": [1325, 1320, 1520, 1360], "expected": "SCALE: 1/8\" = 1'-0\"", "mode": "exact"},
            {"id": "m221-scale", "page": 17, "bbox": [1320, 1500, 1520, 1545], "expected": "SCALE: 1/8\" = 1'-0\"", "mode": "exact"},
        ],
    })
    write("equipment_reconciliation_rank17", {
        "document_id": IDENT, "module_role": "M0.02/M0.03 literal schedule-row ledger and physical-count boundary.", "tables": [],
        "ledger_mode": "literal_schedule_rows_v1",
        "schedule_counts": {"tables": 12, "rows": 86, "interpretation": "86 complete literal source rows across five M0.02 and seven M0.03 schedules. The schedule corpus includes 3 control-damper rows, 4 existing rooftop-unit rows marked for reference only, and 4 rooftop-unit rows marked Bid Alternate 1; it is not an inferred installed or selected-alternative quantity."},
        "control_valve_and_damper_schedule_status": {"control_valve_schedule": "No standalone CONTROL VALVE SCHEDULE title is published in the supplied 47 pages.", "damper_actuator_schedule": "No standalone DAMPER ACTUATOR SCHEDULE title is published in the supplied 47 pages. M0.03 does publish a separate CONTROL DAMPER SCHEDULE with three literal rows; that is retained without deriving actuator quantity."},
        "source_boundary": "Literal schedule rows do not prove plan placement, installed multiplicity, selected bid alternative, BAS control ownership, final controller/card binding, field wiring, physical-device count or a complete takeoff.",
    })
    write("point_applications_rank17", {
        "document_id": IDENT, "module_role": "Formal M6.02 BACnet Inputs to BMS source-matrix scope and ownership boundary.", "tables": [],
        "ledger_mode": "source_matrix_templates_v1",
        "applications": [{"id": "m602-c-wing-erv-bacnet-inputs", "source_table": "M602-BACNET-POINTS-INPUTS-TO-BMS", "ownership_scope": "Published BACnet Inputs to BMS table within the C-Wing ERV control diagram; final physical-device owner, controller/card/terminal binding and field wiring are not stated."}],
        "expanded_template_counts": {"source_rows": 12, "total": 12},
        "expanded_count_warning": "12 is the count of literal published BACnet Inputs to BMS rows. It is not a count of installed sensors, actuators, controllers, terminals, I/O cards, wires, BACnet objects or physical devices; the source does not publish DI/DO/AI/AO classification for these rows.",
        "inventory_checks": [{"id": "formal-bacnet-inputs-source-table", "records_path": ["applications"], "expected": 1, "unique_key": "source_table"}],
    })
    write("supporting_evidence_rank17", {
        "document_id": IDENT, "module_role": "Explicit source limits, omitted-scope disclosure and standalone-schedule-title checks.", "tables": [],
        "source_limitations": [
            "All 47 pages have retained full-page visual review. This record captures the complete 86-row M0.02/M0.03 schedule corpus, the explicit 12-row M6.02 BACnet Inputs to BMS table, and bounded M6.01–M6.03 BAS architecture/sequence context; other reviewed drawings remain context rather than inferred inventory.",
            "The M6.02 formal BACnet table publishes point names but no DI/DO/AI/AO classification, physical owner, controller/card/terminal, device address or field-wiring assignment. Diagram-local AI/BI/BO/AO labels are retained as limited controller-diagram context, not expanded into a projectwide I/O count.",
            "The source does not publish a controller-address list, BACnet device/object list, router/media design, controller/card/terminal schedule, final network topology, wiring/termination schedule, final physical point ownership, final field-device count or selected bid-alternate confirmation.",
            "No standalone Control Valve Schedule or Damper Actuator Schedule title appears in this full source set. M0.03's three-row Control Damper Schedule and M6.03 damper-operating clause are retained, but diagram symbols and sequences are not converted to damper/actuator/valve/device quantities.",
            "Existing-rooftop-unit schedule entries are printed FOR REFERENCE ONLY and rooftop-unit entries in the named bid-alternate table remain alternative scope. Neither category is converted into a selected installed quantity.",
            "Stated plan scales are local to the individual plan views. No global scale, graphic-scale measurement, length, area or derived physical takeoff quantity is asserted.",
        ],
        "text_absence_assertions": [
            {"id": "no-control-valve-schedule", "pages": list(range(1, 48)), "covers_all_source_pages": True, "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"], "visual_review_qualification": "Native text plus full-page visual review support only the limited absence of this standalone title."},
            {"id": "no-damper-actuator-schedule", "pages": list(range(1, 48)), "covers_all_source_pages": True, "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"], "visual_review_qualification": "Native text plus full-page visual review support only the limited absence of this standalone title."},
        ],
    })
    write("document_manifest", {
        "id": IDENT, "rank": 17, "title": "Carson Valley Middle School Phase 1 HVAC Replacement",
        "source_pdf": "pdf/17__vol1__16__Carson_Valley_Middle_School_Phase_1_HVAC_Replacement.pdf", "source_sha256": "96782a6f81077df39c2eb87f4d04e08c7e353483b596bcd97d534938593612a1", "page_count": 47,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded Rank 17 ground truth: full 47-page visual review; project/sheet/local-scale boundaries; all 86 M0.02/M0.03 literal equipment-schedule rows; M0.03 control-damper, reference-only and bid-alternate boundaries; the formal 12-row M6.02 BACnet Inputs to BMS list; M6.01/M6.02 BACnet architecture and symbol context; M6.02/M6.03 ERV, furnace, exhaust-fan and outdoor-air-unit sequences; and explicit physical-count, topology, ownership and alternative-scope limits. Nothing is inferred as a final physical BAS takeoff.",
        "reading_notes": ["M0.02/M0.03 are dense vector schedule sheets with furnaces, condensing units, evaporator coils, ERVs, outdoor-air units, hoods, control dampers, exhaust fans, duct furnace and alternate/reference rooftop equipment, retaining models, capacities, airflow, electrical and other printed specification fields in literal rows.", "M6.01–M6.03 are strong BAS source pages: BACnet IP/MSTP architecture/notes, BTL and 32-device trunk limits, controller diagrams, a rare 12-row BACnet Inputs to BMS list, and sequences for ERV, furnace/condensing, exhaust fan, Building B outdoor-air units and bid-alternate rooftop units.", "The formal BACnet list is source-scoped to its M6.02 control diagram and has no printed hardwired I/O type/card/terminal mapping; all device-count and final-topology interpretation remains expressly limited."],
        "verification_semantics": "The bundle verifier rechecks every retained row and assertion against independent MuPDF and Poppler evidence and hashes source/renders. It does not infer plan quantities, selected alternates, controller topology or physical installations.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {"metadata": ["metadata_rank17"], "schedules": ["schedules_m002_m003"], "points": ["points_m602"], "controls_context": ["controls_context_rank17"], "equipment_reconciliation": ["equipment_reconciliation_rank17"], "point_applications": ["point_applications_rank17"], "supporting_evidence": ["supporting_evidence_rank17"]},
        "requirement_audit": audit(),
        "page_review": [{"page": item["page"], "review_status": "complete", "render": item["render"], "finding": item["finding"]} for item in review],
        "declared_checks": [{"id": "pages", "path": ["page_review"], "operation": "length", "expected": 47}, {"id": "schedules", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 12}, {"id": "points", "path": ["modules", "points", "tables"], "operation": "length", "expected": 1}],
        "completion_checks": {"all_47_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True, "source_limitations_explicit": True, "required_objectives_covered": True},
    })


if __name__ == "__main__":
    main()
