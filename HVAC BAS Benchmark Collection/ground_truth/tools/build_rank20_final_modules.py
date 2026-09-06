"""Author Rank 20 metadata, full visual ledger, and source-boundary modules."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "20__vol2__097"
WORK = AUDIT / "work" / IDENT
SHEETS = ["T-001", "H-001", "H-002", "HD101", "HD102", "HD103", "H-101", "H-102", "H-103", "H-501", "H-502", "H-503", "H-601", "P-601", "E-001", "ED101", "ED102", "ED103", "ED601", "E-101", "E-102", "E-103", "E-601", "E-602", "E-603"]


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / (name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def pages():
    findings = [
        "Cover/drawing-index, project identity, issue and multidisciplinary-sheet index visually reviewed.",
        "H-001 dense equipment schedules visually reviewed; all 12 schedule rows retained separately.",
        "Vicinity plan visually reviewed as site/context evidence.",
        "Chlorine-dioxide HVAC demolition plan visually reviewed.",
        "Hydrofluorosilicic-acid HVAC demolition plan visually reviewed.",
        "Primary-coagulant HVAC demolition plan visually reviewed.",
        "Chlorine-dioxide HVAC remodel plan visually reviewed.",
        "Hydrofluorosilicic-acid HVAC remodel plan visually reviewed.",
        "Primary-coagulant HVAC remodel plan visually reviewed.",
        "Mechanical detail sheet visually reviewed.",
        "Mechanical detail sheet visually reviewed.",
        "Mechanical generator-exhaust detail sheet visually reviewed.",
        "H-601 controls diagrams and sequence-of-operations clauses visually reviewed; bounded clauses retained separately.",
        "Gas-flow diagrams visually reviewed as plumbing context.",
        "Electrical controls/instruments and symbol legend visually reviewed.",
        "Chlorine-dioxide electrical demolition plan visually reviewed.",
        "Hydrofluorosilicic-acid electrical demolition plan visually reviewed.",
        "Primary-coagulant electrical demolition plan visually reviewed.",
        "Chlorine-dioxide electrical demolition one-line diagram visually reviewed.",
        "Chlorine-dioxide electrical remodel plan visually reviewed.",
        "Hydrofluorosilicic-acid electrical remodel plan visually reviewed.",
        "Primary-coagulant electrical remodel plan visually reviewed.",
        "Electrical remodel one-line diagram visually reviewed.",
        "Chlorine-dioxide electrical remodel one-line diagram visually reviewed.",
        "E-603 HVAC speed-controller wiring diagrams visually reviewed; bounded functional labels retained separately.",
    ]
    return [{"page": i, "sheet": s, "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": findings[i-1]} for i, s in enumerate(SHEETS, 1)]


def audit():
    checks = [
        ("project_identity", "Cover project, facility, location and issue date are bounded.", [["modules", "metadata", "project"]]),
        ("sheet_details", "All 25 source pages have sheet-ledger and visual-review entries.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "No local plan scale is converted into document-wide takeoff quantities.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "H-001 retains all 12 literal equipment/outlet schedule rows with source tags/specification context.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "All H-001 published schedule rows are literal, coordinate-bounded rows.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "No formal BAS point-list matrix is published; zero-row status is explicit.", [["modules", "points", "point_list_status"], ["modules", "point_applications", "expanded_template_counts"]]),
        ("network_architecture", "Controls-work boundary, terminal strips, and controller-link labels are bounded, with topology limits explicit.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "H-601 retains MAU/EXF, HV/EF, louver and unit-heater logic; E-603 retains wiring labels.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "Thermostat, timer, smoke/freezing and VFD-safety contexts are bounded without inferred device or zone totals.", [["modules", "controls_context", "sensors_and_control_symbol_context"]]),
        ("source_limitations_and_conflicts", "Point-list, topology, physical-count and standalone-schedule-title boundaries are explicit.", [["modules", "supporting_evidence", "source_limitations"]]),
        ("all_page_visual_review", "All 25 source pages have a retained full-page Poppler render and review finding.", [["page_review"]]),
        ("independent_corroboration", "Every authored source module has current MuPDF and Poppler corroboration.", [["module_source_sha256"]]),
    ]
    return [{"id": i, "result": "reviewed_with_source_limitations_recorded", "finding": f, "evidence": e} for i, f, e in checks]


def main():
    review = pages()
    assert len(review) == 25
    write("metadata_rank20", {
        "document_id": IDENT,
        "module_role": "Project/title-sheet facts, complete page/sheet ledger, scale boundary and visual-review disposition.",
        "tables": [],
        "project": {
            "project_name_as_printed": "JVWTP CHEMICAL BUILDINGS HVAC UPGRADES",
            "facility_as_printed": "JORDAN VALLEY WATER TREATMENT PLANT",
            "location_as_printed": "HERRIMAN, UT 84065",
            "issue_date_as_printed": "February 20, 2025",
            "assertion_ids": ["cover-project-main", "cover-project-upgrades", "cover-facility-water", "cover-facility-plant", "cover-location", "cover-date"],
        },
        "scale_semantics": {"takeoff_scale_status": "No global scale is asserted across the mixed plans, schedules, control diagrams, wiring diagrams and one-lines.", "boundary": "Individual plan scales are not transformed into document-wide physical takeoff quantities."},
        "visual_review_pages": review,
        "assertions": [
            {"id": "cover-project-main", "page": 1, "bbox": [560, 84, 1895, 160], "expected": "JVWTP CHEMICAL BUILDINGS HVAC", "mode": "exact"},
            {"id": "cover-project-upgrades", "page": 1, "bbox": [1018, 164, 1435, 240], "expected": "UPGRADES", "mode": "exact"},
            {"id": "cover-facility-water", "page": 1, "bbox": [912, 340, 1540, 396], "expected": "JORDAN VALLEY WATER", "mode": "exact"},
            {"id": "cover-facility-plant", "page": 1, "bbox": [973, 392, 1478, 448], "expected": "TREATMENT PLANT", "mode": "exact"},
            {"id": "cover-location", "page": 1, "bbox": [1069, 490, 1382, 526], "expected": "HERRIMAN, UT 84065", "mode": "exact"},
            {"id": "cover-date", "page": 1, "bbox": [1055, 1070, 1397, 1115], "expected": "February 20, 2025", "mode": "exact"},
        ],
    })
    write("points_rank20", {
        "document_id": IDENT, "module_role": "Formal BAS point-list disposition.", "tables": [], "assertions": [],
        "point_list_status": {"formal_row_matrix": "not_published_in_supplied_drawings", "finding": "H-601 publishes control logic and E-603 publishes wiring diagrams, but no conventional tabular BAS point-list matrix.", "boundary": "No point, controller, I/O, terminal, wiring, relay, thermostat, timer, sensor or device count is inferred from diagrams or symbols."},
    })
    write("equipment_reconciliation_rank20", {
        "document_id": IDENT, "module_role": "Literal H-001 schedule-row ledger and physical-count boundary.", "tables": [], "ledger_mode": "literal_schedule_rows_v1",
        "schedule_counts": {"tables": 6, "rows": 12, "interpretation": "All 12 H-001 schedule rows: one packaged heating/ventilating unit, one makeup-air unit, five ventilation fans, one grille/diffuser, two unit heaters, and two combination louvers."},
        "control_valve_and_damper_schedule_status": {"control_valve_schedule": "No standalone CONTROL VALVE SCHEDULE title is published.", "damper_actuator_schedule": "No standalone DAMPER ACTUATOR SCHEDULE title is published; H-001 louvers carry actuator/interlock specification text instead."},
        "source_boundary": "Literal schedule rows do not prove physical plan placement, installed multiplicity, BAS control ownership, wiring, I/O, field device count, or total takeoff quantity.",
    })
    write("point_applications_rank20", {
        "document_id": IDENT, "module_role": "No-row formal point-list disposition.", "tables": [], "ledger_mode": "literal_source_row_matrices_v1", "applications": [],
        "expanded_template_counts": {"source_rows": 0, "total": 0}, "expanded_count_warning": "0 is the number of formal published BAS point-list rows, not a claim that no controls components occur in diagrams or schedules.",
    })
    write("supporting_evidence_rank20", {
        "document_id": IDENT, "module_role": "Explicit source limits, omitted-scope disclosure and standalone-schedule-title checks.", "tables": [],
        "source_limitations": [
            "All 25 pages received full-page visual review. H-001's complete 12-row schedule corpus and H-601/E-603 high-value control material are source-bounded in this record; plans/details/one-lines remain reviewed context, not inferred inventory.",
            "No conventional BAS point-list matrix, controller address list, I/O-card layout, point-to-controller binding, network protocol, LAN topology or media design is published.",
            "Control/wiring symbols and schedule notes are not expanded into physical controller, card, sensor, timer, relay, actuator, conductor, terminal, damper or device quantities.",
            "The complete supplied set has no standalone Control Valve Schedule or Damper Actuator Schedule title. The H-001 louver actuator text is retained as part of its literal schedule row, not misclassified as a damper-actuator schedule.",
        ],
        "text_absence_assertions": [
            {"id": "no-control-valve-schedule", "pages": list(range(1, 26)), "covers_all_source_pages": True, "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"], "visual_review_qualification": "Native text plus whole-set visual review support only the limited absence of this standalone title."},
            {"id": "no-damper-actuator-schedule", "pages": list(range(1, 26)), "covers_all_source_pages": True, "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"], "visual_review_qualification": "Native text plus whole-set visual review support only the limited absence of this standalone title."},
        ],
    })
    write("document_manifest", {
        "id": IDENT, "rank": 20, "title": "JVWTP Chemical Buildings HVAC Upgrades",
        "source_pdf": "pdf/20__vol2__097__JVWTP_Chemical_Buildings_HVAC_Upgrades.pdf", "source_sha256": "95f1c434a5dca5ea297a5981901483d0f57b6a7277abc6c87d5645f072dfe0e3", "page_count": 25,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded Rank 20 ground truth: full 25-page visual review; project/sheet/scale boundaries; all 12 H-001 literal equipment schedule rows; H-601 source-bounded sequence clauses; E-603 wiring context; and explicit point/topology/physical-count limits. No final BAS point schedule, controller topology or inferred physical quantity is invented.",
        "reading_notes": ["H-001 provides a compact native/vector schedule page with equipment, fans, unit heaters, louvers, specifications and explicit louver/EF interlocks.", "H-601 provides low/high-mode MAU and exhaust logic, thermostat/timer conditions, VFD safety interlocks, louver logic and unit-heater sequencing.", "E-603 makes the functional control implementation testable with low/high command, thermostat, timer, controller and run-status wiring labels."],
        "verification_semantics": "The bundle verifier rechecks every retained row/assertion against independent MuPDF and Poppler evidence and hashes source/renders; it does not infer takeoff quantities or prove physical installation.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {"metadata": ["metadata_rank20"], "schedules": ["schedules_h001"], "points": ["points_rank20"], "controls_context": ["controls_context_rank20"], "equipment_reconciliation": ["equipment_reconciliation_rank20"], "point_applications": ["point_applications_rank20"], "supporting_evidence": ["supporting_evidence_rank20"]},
        "requirement_audit": audit(), "page_review": [{"page": v["page"], "review_status": "complete", "render": v["render"], "finding": v["finding"]} for v in review],
        "declared_checks": [{"id": "pages", "path": ["page_review"], "operation": "length", "expected": 25}, {"id": "schedules", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 6}, {"id": "points", "path": ["modules", "points", "tables"], "operation": "length", "expected": 0}],
        "completion_checks": {"all_25_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True, "source_limitations_explicit": True, "required_objectives_covered": True},
    })


if __name__ == "__main__":
    main()
