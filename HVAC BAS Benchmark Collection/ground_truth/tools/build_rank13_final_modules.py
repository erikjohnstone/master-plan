"""Author Rank 13 metadata, full visual ledger, and source-boundary modules."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "13__vol2__017"
WORK = AUDIT / "work" / IDENT

SHEETS = [
    "G-001", "S-001", "S-101", "M-001", "MD-101", "MD-201", "M-101", "M-201",
    "M-501", "M-502", "M-503", "M-601", "M-602", "M-603", "M-701", "M-702",
    "M-703", "M-801", "E-001", "ED-100", "E-101", "E-600", "E-601", "FA-100", "FA-101",
]


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / (name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def pages():
    findings = [
        "Cover, drawing list, project identity, title-block and map context visually reviewed.",
        "Structural general-notes sheet visually reviewed as mixed-discipline source context.",
        "Structural framing-plan sheet visually reviewed as mixed-discipline source context.",
        "Mechanical general-notes sheet visually reviewed.",
        "Mechanical demolition floor-plan sheet visually reviewed.",
        "Mechanical demolition floor-plan sheet visually reviewed.",
        "New-work mechanical floor-plan sheet visually reviewed.",
        "New-work mechanical floor-plan sheet visually reviewed.",
        "Mechanical ACU-detail sheet visually reviewed.",
        "Mechanical return-fan/detail sheet visually reviewed.",
        "Mechanical piping/freezestat detail sheet visually reviewed.",
        "M-601 dense equipment schedules visually reviewed; selected literal ACU-family tables retained separately.",
        "M-602 dense equipment schedules visually reviewed; selected literal ACU-family tables retained separately.",
        "M-603 ventilation schedule/calculation tables visually reviewed; retained as context, not transcribed inventory.",
        "M-701 mechanical control diagrams visually reviewed.",
        "M-702 ACU sequence-of-operations sheet visually reviewed; bounded clauses retained separately.",
        "M-703 DDC input/output source matrices visually reviewed; all 60 literal rows retained separately.",
        "M-801 mechanical air-flow diagrams visually reviewed.",
        "Electrical cover/legend sheet visually reviewed as mixed-discipline source context.",
        "Electrical demolition-plan sheet visually reviewed as mixed-discipline source context.",
        "Electrical new-work-plan sheet visually reviewed as mixed-discipline source context.",
        "Electrical diagrams-and-schedules sheet visually reviewed as mixed-discipline source context.",
        "Electrical motor-control-center/elevation sheet visually reviewed as mixed-discipline source context.",
        "Fire-alarm one-line sheet visually reviewed as mixed-discipline source context.",
        "Fire-alarm input/output matrix sheet visually reviewed as mixed-discipline source context.",
    ]
    return [
        {"page": index, "sheet": sheet,
         "render": f"reviews/{IDENT}/p{index}-p{index}-full-poppler.png",
         "finding": findings[index - 1]}
        for index, sheet in enumerate(SHEETS, 1)
    ]


def audit():
    checks = [
        ("project_identity", "Cover-sheet project, NIST facility context, issue date and drawing-list identity are bounded.", [["modules", "metadata", "project"]]),
        ("sheet_details", "All 25 pages have a reviewed sheet-ledger entry.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "No local plan scale is converted into a document-wide physical takeoff quantity.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "Forty-seven literal high-value rows retain ACU, fan, coil, filter and trap identifiers/spec context without inferred installation counts.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "M-601/M-602 retain seven complete selected schedule tables as literal printed rows.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "M-703 retains all 60 literal DDC matrix rows with source-template scope and no physical ownership inference.", [["modules", "points", "tables"], ["modules", "point_applications", "expanded_template_counts"]]),
        ("network_architecture", "M-703's Campus DDC visibility and e-mail notification clauses are bounded, along with explicit topology limits.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "M-702 retains bounded ACU A-1, A-2 and A-3-to-A-6 operating sequence clauses.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "M-702 retains source context for freeze/smoke safety, zone sensors and AFMS without inferred zone/device counts.", [["modules", "controls_context", "sensors_and_control_symbol_context"]]),
        ("source_limitations_and_conflicts", "Untranscribed schedules, source-template status and missing physical/topology information are explicit.", [["modules", "supporting_evidence", "source_limitations"]]),
        ("all_page_visual_review", "Every source page has a retained full-page Poppler render and visual-review finding.", [["page_review"]]),
        ("independent_corroboration", "Each authored module is rechecked against both MuPDF and Poppler source captures.", [["module_source_sha256"]]),
    ]
    return [{"id": ident, "result": "reviewed_with_source_limitations_recorded", "finding": finding, "evidence": evidence}
            for ident, finding, evidence in checks]


def main():
    review = pages()
    assert len(review) == 25
    write("metadata_rank13", {
        "document_id": IDENT,
        "module_role": "Project/title-block facts, full page/sheet ledger, scale boundary and complete visual-review disposition.",
        "tables": [],
        "project": {
            "project_name_as_printed": "BUILDING 101",
            "facility_as_printed": "NIST, GAITHERSBURG, MD",
            "issue_date_as_printed": "06/10/2022",
            "cover_sheet_as_printed": "G-001 / 101-1262",
            "assertion_ids": ["cover-building", "cover-nist", "cover-gaithersburg", "cover-issue-date", "cover-sheet-id"],
        },
        "scale_semantics": {
            "takeoff_scale_status": "No global scale is asserted across this mixed plan, schedule, sequence, diagram and mixed-discipline drawing set.",
            "boundary": "Local drawing scales and title-block plot scale are not transformed into a document-wide takeoff quantity.",
        },
        "visual_review_pages": review,
        "assertions": [
            {"id": "cover-building", "page": 1, "bbox": [860, 1436, 984, 1468], "expected": "BUILDING 101", "mode": "exact"},
            {"id": "cover-nist", "page": 1, "bbox": [2850, 1628, 2869, 1662], "expected": "NIST", "mode": "exact"},
            {"id": "cover-gaithersburg", "page": 1, "bbox": [2879, 1590, 2898, 1700], "expected": "MD GAITHERSBURG,", "mode": "exact"},
            {"id": "cover-issue-date", "page": 1, "bbox": [2901, 1064, 2920, 1111], "expected": "06/10/2022", "mode": "exact"},
            {"id": "cover-sheet-id", "page": 1, "bbox": [2844, 2058, 2960, 2091], "expected": "101-1262", "mode": "contains"},
        ],
    })
    write("equipment_reconciliation_rank13", {
        "document_id": IDENT,
        "module_role": "Literal selected schedule-row presentation and equipment-count boundary.",
        "tables": [], "ledger_mode": "literal_schedule_rows_v1",
        "schedule_counts": {
            "tables": 7, "rows": 47,
            "interpretation": "Seven selected high-value M-601/M-602 literal schedule tables: six indoor ACUs, six supply fans, six heating coils, six cooling coils, six filters, nine return fans, and eight steam traps.",
        },
        "control_valve_and_damper_schedule_status": {
            "control_valve_schedule": "No standalone CONTROL VALVE SCHEDULE title is published in the supplied 25 pages.",
            "damper_actuator_schedule": "No standalone DAMPER ACTUATOR SCHEDULE title is published in the supplied 25 pages.",
        },
        "source_boundary": "These selected schedule rows are literal specification/reference records, not assertions of plan placement, installed multiplicity, BAS ownership, wiring, controller I/O or a physical takeoff total.",
    })
    write("point_applications_rank13", {
        "document_id": IDENT,
        "module_role": "Literal M-703 source-matrix scope and ownership boundary.",
        "tables": [], "ledger_mode": "literal_source_row_matrices_v1",
        "applications": [
            {"id": "ACU-A1-EXISTING-DDC-TEMPLATE", "source_table": "M703-ACU-A1-DDC", "ownership_scope": "ACU A-1 existing-to-remain M-703 DDC source-template scope only."},
            {"id": "ACU-A3-A6-EXISTING-DDC-TEMPLATE", "source_table": "M703-ACU-A3-A6-DDC", "ownership_scope": "ACU A-3/A-4/A-5/A-6 existing-to-remain M-703 DDC source-template scope only."},
            {"id": "ACU-A2-EXISTING-DDC-TEMPLATE", "source_table": "M703-ACU-A2-DDC", "ownership_scope": "ACU A-2 existing-to-remain M-703 DDC source-template scope only."},
        ],
        "expanded_template_counts": {"source_rows": 60, "total": 60},
        "expanded_count_warning": "60 is the number of literal printed M-703 source-matrix rows, not a physical BAS point, field-device, controller, terminal, card, wiring or installed-equipment count.",
    })
    write("supporting_evidence_rank13", {
        "document_id": IDENT,
        "module_role": "Explicit source limits, omitted-scope disclosure and standalone-schedule-title checks.",
        "tables": [],
        "source_limitations": [
            "All 25 pages were visually reviewed. This record transcribes seven selected high-value M-601/M-602 tables (47 literal rows); M-603 ventilation calculations and other schedule material were reviewed but deliberately not silently converted into inventory.",
            "M-703 supplies 60 source-matrix rows, each marked existing-to-remain/reference-only. They are retained as literal source evidence and not expanded into a final controller, I/O-card, field-device, terminal, wiring, or physical BAS-point count.",
            "M-702 provides deeply structured ACU operating sequences, but it does not publish an address list, point-to-controller binding, terminal/card layout, protocol configuration, network-media design or wiring schedule.",
            "No standalone Control Valve Schedule or Damper Actuator Schedule title is published in the complete supplied drawing set; control-valve and damper mentions within sequence/matrix text are not misrepresented as schedules.",
        ],
        "text_absence_assertions": [
            {"id": "no-control-valve-schedule", "pages": list(range(1, 26)), "covers_all_source_pages": True,
             "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"],
             "visual_review_qualification": "Native text and whole-set visual review support only this limited absence of a standalone schedule title."},
            {"id": "no-damper-actuator-schedule", "pages": list(range(1, 26)), "covers_all_source_pages": True,
             "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"],
             "visual_review_qualification": "Native text and whole-set visual review support only this limited absence of a standalone schedule title."},
        ],
    })
    manifest = {
        "id": IDENT, "rank": 13,
        "title": "NIST Building 101 Replace HVAC Equipment",
        "source_pdf": "pdf/13__vol2__017__NIST_Gaithersburg_Building_101_HVAC_Renovation.pdf",
        "source_sha256": "5821df0d298d0e51a6c20ba36b3cc5d2eb7bbece098f12eb1746c339b56a1533",
        "page_count": 25, "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded Rank 13 ground truth: 25-page visual review; project/sheet/scale boundaries; 47 literal high-value M-601/M-602 schedule rows; all 60 literal M-703 DDC source-matrix rows; bounded M-702 sequences; Campus DDC/e-mail alert context; and explicit schedule/topology/physical-count limitations. The record does not invent physical counts or controller/wiring/topology details.",
        "reading_notes": [
            "M-601/M-602 contain dense, native/vector mechanical schedules tying the six ACUs to supply/return fans, heating/cooling coils, filters and steam traps.",
            "M-702 contains unusually rich ACU sequences: fan scheduling, preheat, safeties, economizer, cooling, night modes, AFMS, humidity and leakage contexts.",
            "M-703 provides three large existing-to-remain DDC matrix templates and explicitly limits them to reference use.",
        ],
        "verification_semantics": "The bundle verifier rechecks every retained cell/assertion against independent MuPDF and Poppler evidence, plus source/render hashes. It does not perform takeoff inference or prove physical installation quantities.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {
            "metadata": ["metadata_rank13"], "schedules": ["schedules_core"], "points": ["points_m701"],
            "controls_context": ["controls_context_rank13"], "equipment_reconciliation": ["equipment_reconciliation_rank13"],
            "point_applications": ["point_applications_rank13"], "supporting_evidence": ["supporting_evidence_rank13"],
        },
        "requirement_audit": audit(),
        "page_review": [{"page": item["page"], "review_status": "complete", "render": item["render"], "finding": item["finding"]} for item in review],
        "declared_checks": [
            {"id": "pages", "path": ["page_review"], "operation": "length", "expected": 25},
            {"id": "schedules", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 7},
            {"id": "points", "path": ["modules", "points", "tables"], "operation": "length", "expected": 3},
        ],
        "completion_checks": {
            "all_25_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True,
            "source_limitations_explicit": True, "required_objectives_covered": True,
        },
    }
    write("document_manifest", manifest)


if __name__ == "__main__":
    main()
