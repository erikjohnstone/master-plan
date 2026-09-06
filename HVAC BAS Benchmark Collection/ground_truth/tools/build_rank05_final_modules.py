"""Author rank-05 coordinator modules and manifest without PDF discovery."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "05__vol2__009"
WORK = AUDIT / "work" / IDENT


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def review_pages():
    entries = [
        ("GI000", "COVER SHEET", "Project title block, project team, sheet index and issue context."),
        ("GI002", "BUILDING CODE SUMMARY", "Building-code summary."),
        ("GI003", "PHASING PLAN / GENERAL PROJECT SYMBOLOGY", "Phasing, symbology and local plan-scale context."),
        ("GI101", "LIFE SAFETY PLAN", "Level 1 life-safety plan and local scale context."),
        ("S-001", "STRUCTURAL NOTES", "Structural general notes."),
        ("SF101", "ROOF FRAMING PLAN", "Roof framing and structural-detail context."),
        ("A-001", "ARCHITECTURAL LEGEND", "Architectural legend, notes and abbreviations."),
        ("AE101", "LEVEL 1 FLOOR PLAN", "Level 1 architectural floor-plan context."),
        ("AE111", "REFLECTED CEILING PLANS", "Reflected-ceiling-plan context."),
        ("AE121", "ROOF PLANS", "Architectural roof-plan context."),
        ("AE201", "EXTERIOR ELEVATIONS", "Architectural exterior-elevation context."),
        ("AE301", "BUILDING SECTIONS", "Architectural building-section context."),
        ("M-001", "MECHANICAL LEGEND", "Mechanical duct, piping, valve and device legends; duct construction/leakage schedule."),
        ("MD101", "MECHANICAL DEMOLITION PLANS", "Mechanical demolition; explicit thermostat/sensor, damper-actuator and chilled-water-valve demolition context."),
        ("MH101", "MECHANICAL PLANS", "Attic/mezzanine and Level 1 mechanical plans with AHU, exhaust, VAV, duct heater, chiller and pump context."),
        ("MH102", "MECHANICAL ROOF PLAN", "Mechanical roof plan and building air-balance table."),
        ("M-501", "MECHANICAL DETAILS", "Water-coil three-way-valve, fan-curb and inline-pump mechanical details."),
        ("M-601", "MECHANICAL SCHEDULES", "Air device, chiller, fan, hydronic control valve, AHU, VAV, pump and electric duct heater schedules."),
        ("M-801", "CONTROLS", "Controls and point legends, DDC scope/network requirements and VFD BACnet interface schedule."),
        ("M-802", "CONTROLS", "AHU-1 and chilled-water-plant sequences, diagrams and DDC point lists."),
        ("M-803", "CONTROLS", "Laboratory/scheduled exhaust and AHU-2 sequences, diagrams and DDC point lists."),
        ("M-804", "CONTROLS", "VAV/electric-duct-heater sequences, diagrams and DDC point lists."),
        ("E-001", "ELECTRICAL LEGEND", "Electrical legend, notes and abbreviations."),
        ("ED101", "ELECTRICAL DEMOLITION PLAN", "Electrical demolition-plan context."),
        ("EG101", "LIGHTNING PROTECTION PLAN", "Lightning-protection-plan context."),
        ("EG501", "LIGHTNING PROTECTION DETAILS", "Lightning-protection-detail context."),
        ("EL101", "LIGHTING PLANS", "Lighting-plan context."),
        ("EL501", "LIGHTING DETAILS / LUMINAIRE SCHEDULE", "Lighting details and luminaire schedule."),
        ("EP101", "POWER PLANS", "Power-plan context."),
        ("EP601", "PANELBOARD SCHEDULES / ENLARGED PLANS", "Electrical panel schedules and enlarged plan context."),
        ("EP701", "POWER RISER DIAGRAM", "Equipment connection schedules and power riser."),
    ]
    return [{"page": i, "sheet": sheet, "title": title,
             "render": f"reviews/{IDENT}/p{i}-p{i}-full-poppler.png", "finding": finding}
            for i, (sheet, title, finding) in enumerate(entries, 1)]


def metadata(pages):
    return {
        "document_id": IDENT,
        "module_role": "Project/title-block, sheet, local-scale and all-page visual-review context. Dense schedule, point-list, DDC and sequence facts are retained in their own independently corroborated modules.",
        "tables": [],
        "project": {
            "project_name_as_printed": "BUILDING 63 ENVELOPE AND HVAC MODIFICATIONS",
            "owner_as_printed": "U.S. DEPARTMENT OF AGRICULTURE - ANIMAL AND PLANT HEALTH INSPECTION SERVICE (APHIS)",
            "project_location_as_printed": "OLD CUTLER ROAD, CORAL GABLES, FL 33158",
            "project_number_as_printed": "CN 10858",
            "contract_number_as_printed": "12639521D0050",
            "modification_as_printed": "P00001",
            "design_firm_as_printed": "CLARK NEXSEN",
            "issue_as_printed": "FINAL IFC SUBMITTAL",
            "issue_date_as_printed": "2026.07.31",
            "revision_date_status": "No populated revision entry/date is asserted from the reviewed revision block; the issue date is not recast as a revision date.",
            "assertion_ids": ["rank05-project-title", "rank05-project-owner", "rank05-project-location", "rank05-ifc-issue-date"],
        },
        "sheet_details": {
            "sheet_ledger_semantics": "All 31 supplied PDF pages have a completed full-page visual source-sheet/title disposition below.",
            "revision_status": "No populated revision date is asserted from the reviewed title block.",
        },
        "scale_semantics": {
            "printed_local_view_scales_observed": [
                {"page": 3, "sheet": "GI003", "view": "phasing/symbology plan view", "scale_as_printed": "1/8\" = 1'-0\""},
                {"page": 4, "sheet": "GI101", "view": "Level 1 life safety plan", "scale_as_printed": "1/8\" = 1'-0\""},
                {"page": 8, "sheet": "AE101", "view": "Level 1 floor plan", "scale_as_printed": "1/8\" = 1'-0\""},
                {"page": 15, "sheet": "MH101", "view": "mechanical plan views", "scale_as_printed": "1/8\" = 1'-0\""},
                {"page": 16, "sheet": "MH102", "view": "mechanical roof plan", "scale_as_printed": "1/8\" = 1'-0\""},
            ],
            "graphic_scale_bar_status": "Graphic scale bars are visible on plan sheets, but their labels/lengths are not converted into a global scale. The cited printed scale is local to its named view.",
            "takeoff_scale_status": "Distance-based takeoff must use a separately verified local view scale; do not apply these plan scales to schedules, controls, schematics, details or other views.",
        },
        "visual_review_pages": pages,
        "assertions": [
            {"id":"rank05-project-title", "page":1, "bbox":[2750,260,3000,360], "expected":"BUILDING 63 ENVELOPE AND HVAC MODIFICATIONS", "mode":"exact"},
            {"id":"rank05-project-owner", "page":1, "bbox":[2750,210,3000,265], "expected":"U.S. DEPARTMENT OF AGRICULTURE- ANIMAL AND PLANT HEALTH INSPECTION SERVICE (APHIS)", "mode":"exact"},
            {"id":"rank05-project-location", "page":1, "bbox":[2750,370,2900,410], "expected":"OLD CUTLER ROAD CORAL GABLES, FL 33158", "mode":"exact"},
            {"id":"rank05-ifc-issue-date", "page":1, "bbox":[2750,1298,2930,1360], "expected":"2026.07.31 FINAL IFC SUBMITTAL", "mode":"exact"},
            {"id":"rank05-scale-gi003", "page":3, "bbox":[370,1944,470,1967], "expected":"SCALE: 1/8\" = 1'-0\"", "mode":"exact"},
            {"id":"rank05-scale-gi101", "page":4, "bbox":[520,1762,620,1785], "expected":"SCALE: 1/8\" = 1'-0\"", "mode":"exact"},
            {"id":"rank05-scale-ae101", "page":8, "bbox":[470,1080,575,1108], "expected":"SCALE: 1/8\" = 1'-0\"", "mode":"exact"},
            {"id":"rank05-scale-mh101-upper", "page":15, "bbox":[250,937,355,964], "expected":"SCALE: 1/8\" = 1'-0\"", "mode":"exact"},
            {"id":"rank05-scale-mh101-lower", "page":15, "bbox":[250,1830,355,1856], "expected":"SCALE: 1/8\" = 1'-0\"", "mode":"exact"},
            {"id":"rank05-scale-mh102", "page":16, "bbox":[250,937,355,964], "expected":"SCALE: 1/8\" = 1'-0\"", "mode":"exact"},
        ],
    }


def scheduled_families():
    return [
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-AIR-COOLED-CHILLER", "class":"air_cooled_chiller", "scope":"M-601 air-cooled chiller schedule", "rows":1, "tag":["CH-1"]},
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-FANS", "class":"exhaust_fan", "scope":"M-601 fan schedule", "rows":5, "tag":["EF-1","EF-2","EF-3","EF-5","EF-6"]},
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-HYDRONIC-CONTROL-VALVES", "class":"hydronic_control_valve", "scope":"M-601 hydronic control-valve schedule", "rows":2, "tag":["CV-1","CV-2"]},
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-AIR-HANDLING-UNITS", "class":"air_handling_unit", "scope":"M-601 air-handling-unit schedule", "rows":2, "tag":["AHU-1","AHU-2"]},
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-VAV-TERMINALS", "class":"vav_terminal_schedule_type", "scope":"M-601 VAV terminal schedule rows; each is an existing balancing-information schedule row, not a facility instance count", "rows":7, "tag":["VAV-1-1","VAV-1-2","VAV-1-3","VAV-1-4","VAV-1-5","VAV-1-6","VAV-1-7"]},
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-CHILLED-WATER-PUMPS", "class":"chilled_water_pump", "scope":"M-601 chilled-water-pump schedule", "rows":2, "tag":["CWP-1","CWP-2"]},
        {"module":"schedules_m601_core.json", "bundle_module":"schedules", "table":"M601-ELECTRIC-DUCT-HEATERS", "class":"electric_duct_heater", "scope":"M-601 electric-duct-heater schedule", "rows":5, "tag":["EDH-1","EDH-2","EDH-3","EDH-4","EDH-5"]},
        {"module":"schedules_m601_air_devices.json", "bundle_module":"schedules", "table":"M601-AIR-DEVICES", "class":"air_device_type", "scope":"M-601 literal air-device type rows with a rotated/merged accessory matrix; no clean equipment-tag column", "rows":4},
    ]


def equipment_reconciliation():
    families = scheduled_families()
    anchors = []
    for family in families:
        for tag in family.get("tag", []):
            anchors.append({"id":"M601-" + tag, "status":"schedule_identity_only", "page":None,
                            "zone":"No plan placement or installed multiplicity is inferred from a schedule row.",
                            "classification":family["class"], "source_table":family["table"]})
    return {
        "document_id": IDENT,
        "module_role": "Cross-reference registry for every M-601 schedule table. It retains literal schedule identity/classification but does not turn schedule types or rows into plan-instance totals.",
        "tables": [],
        "schedule_registry_schema": {"namespace_separator":"-", "identity_columns":{"tag":"tag"}, "anchor_records_path":["primary_anchors"], "non_instance_table_ids":[]},
        "scheduled_families": families,
        "schedule_counts": {"tables":8, "rows":28, "building_scoped_tag_identities_including_outlet_types":24, "other_scheduled_tag_identities":24,
                            "interpretation":"Counts are literal clean-tag schedule-row identities only. The four air-device type rows are separately retained and are not recast as installed outlets."},
        "primary_anchors": anchors,
        "additional_identities": [{"status":"source_literal_type_rows_not_clean_equipment_tags", "source":"M-601 / M601-AIR-DEVICES", "marks_as_printed":["D","F","H","L"], "reason":"The source has an air-device MARK column and accessory matrix, not a clean installed equipment-tag count."}],
        "control_valve_and_damper_schedule_status": {
            "control_valve_schedule":"Present: M-601 supplies two hydronic control-valve rows, CV-1 and CV-2, with GPM, maximum pressure drop, Cv, valve type/configuration, fluid and fail position.",
            "damper_actuator_schedule":"No standalone damper-actuator schedule is supplied. M-601 refers to replacing damper actuators and M-801 through M-804 contain damper/sequence context, but no actuator tag/make/model/torque/control-signal/fail-action/installed-quantity schedule is asserted.",
            "boundary":"Do not infer damper-actuator quantities or specifications from air-device accessory marks, damper legends, planned VAV rows or sequences.",
        },
        "source_boundary":"The registry validates source schedule coverage and clean identity cells only. It is not an installed device count, plan takeoff or actuator inventory.",
    }


def point_applications():
    pairs = [
        ("vfd-bacnet-interface", "M801-VFD-BACNET-INTERFACE-LEDGER", "Published M-801 template stated typical for each VFD; no individual VFD asset is assigned by this matrix."),
        ("ahu1-ddc", "M802-AHU1-DDC-LEDGER", "Published AHU-1 DDC point-list rows; repeated printed AI3 is retained and no controller terminal owner is inferred."),
        ("chiller-plant-ddc", "M802-CHILLER-PLANT-DDC-LEDGER", "Published chilled-water-plant DDC rows for the source plant context; no final physical I/O/card or per-pump expansion is inferred."),
        ("ahu2-ddc", "M803-AHU2-DDC-LEDGER", "Published AHU-2 DDC point-list rows; repeated printed AI4 and BI2 are retained."),
        ("laboratory-exhaust-ddc", "M803-LAB-EXHAUST-DDC-LEDGER", "Published laboratory-exhaust-fan source matrix for EF-1, EF-2 and EF-3 context; no one-row-per-fan expansion is invented."),
        ("scheduled-exhaust-ddc", "M803-SCHEDULED-EXHAUST-DDC-LEDGER", "Published scheduled-exhaust source matrix for EF-5 and EF-6 context; the rows are not duplicated per fan."),
        ("electric-unit-heater-ddc", "M804-ELECTRIC-UNIT-HEATER-DDC-LEDGER", "Published electric-unit-heater DDC source rows, including repeated BI1 labels; no equipment-tag mapping is printed."),
        ("vav-terminal-ddc", "M804-VAV-TERMINAL-DDC-LEDGER", "Published VAV terminal DDC source rows; these do not establish a one-row-per-scheduled-VAV physical point count."),
    ]
    return {
        "document_id": IDENT,
        "module_role": "Explicit source-table application scopes for the 75 published M-801 through M-804 point-list rows. Each remains a literal source occurrence rather than a projected hardware I/O count.",
        "tables": [], "ledger_mode":"source_matrix_templates_v1",
        "applications":[{"id":i, "source_table":t, "ownership_scope":s} for i,t,s in pairs],
        "listed_template_counts":{"source_rows":75, "total":75},
        "expanded_template_counts":{"source_rows":75, "total":75},
        "expanded_count_warning":"75 is the count of literal published point-list rows, including repeated identifiers and typical matrices. It is not an installed BAS point, controller-card, terminal, wiring, device or VFD total.",
    }


def supporting():
    return {
        "document_id": IDENT,
        "module_role": "Explicit source limitations, parser/visual-review boundary statements and corroboration scope for the supplied 31-page set.",
        "tables": [],
        "source_limitations": [
            "M-601 supplies a two-row hydronic control-valve schedule, but no standalone damper-actuator schedule with actuator tag, make/model, torque, control signal, fail action and installed quantity.",
            "M-801 through M-804 publish 75 source point-list rows, including templates and repeated point identifiers. They are not a final physical I/O, device, controller-card, terminal, cable or wiring count.",
            "M-801 specifies BACnet-native DDC and remote-access/cybersecurity requirements, but it does not establish a final BACnet transport/topology, device address list, selected IP values, network counts or controller-card layout.",
            "M-601 schedule rows and air-device types are source schedule references. This record does not infer plan placements, duplicated installed instances, exact sensor/thermostat quantity, damper-actuator total, or distance-based takeoff quantity.",
            "All 31 pages were visually reviewed using retained full-page renders. Every authored table cell and bounded textual assertion is independently rechecked against MuPDF and Poppler captures at build/verification time.",
        ],
        "text_absence_assertions": [{"id":"rank05-no-standalone-damper-actuator-schedule-title", "pages":list(range(1,32)), "covers_all_source_pages":True,
                                      "patterns":[r"DAMPER\s+ACTUATOR\s+SCHEDULE"],
                                      "visual_review_qualification":"Native-text absence is not engineering proof. It is paired with completed visual review of every sheet; the limited finding is that no standalone schedule title/row set is supplied."}],
    }


def requirement_audit():
    entries = [
        ("project_identity", "Printed project/owner/location/issue context is retained; the issue date is not relabeled as a revision date.", [["modules","metadata","project"]]),
        ("sheet_details", "Every supplied page has a visual sheet/title disposition and an explicit no-populated-revision-date status.", [["modules","metadata","sheet_details"],["modules","metadata","visual_review_pages"]]),
        ("scale_verification", "Only observed local printed plan scales are recorded; no global or detail/control scale is asserted.", [["modules","metadata","scale_semantics"]]),
        ("equipment_tags_and_classification", "All eight M-601 tables are classified, with 24 clean schedule-tag rows and four separately retained type marks.", [["modules","equipment_reconciliation","scheduled_families"],["modules","equipment_reconciliation","additional_identities"]]),
        ("schedule_rows_and_specs", "All 28 literal M-601 schedule rows are retained across core equipment and the full air-device accessory matrix.", [["modules","schedules","tables"],["modules","equipment_reconciliation","schedule_counts"]]),
        ("point_lists_and_equipment_ownership", "All 75 source point-list rows are preserved with matrix-specific application scopes and no invented physical owner/terminal count.", [["modules","points","tables"],["modules","point_applications","applications"]]),
        ("network_architecture", "Existing/new DDC, BACnet-native, remote web, IP/drop/firewall/VPN/VLAN/MFA and RBAC requirements are retained with final topology deliberately unavailable.", [["modules","controls_context","source_components","controls_sequences_network","network_architecture"]]),
        ("sequences_and_diagrams", "Seven printed controls/sequence subjects are inventoried with checked operational clauses and the complete published point matrices.", [["modules","controls_context","source_components","controls_sequences_network","sequence_inventory"],["modules","controls_context","source_components","points_m801_m804","tables"]]),
        ("space_sensors_and_zones", "Existing-VAV reuse/new space and discharge sensors plus VAV/electric-heater control context are retained without a fabricated document-wide sensor total.", [["modules","controls_context","source_components","controls_sequences_network","network_architecture","vav_reuse_and_sensors"],["modules","supporting_evidence","source_limitations"]]),
        ("source_limitations_and_conflicts", "Actuator, point-count, network and revision limitations are explicit rather than supplied by inference.", [["modules","supporting_evidence","source_limitations"],["modules","equipment_reconciliation","control_valve_and_damper_schedule_status"]]),
        ("all_page_visual_review", "All 31 supplied pages have retained full-page render evidence and a completed disposition.", [["page_review"],["modules","metadata","visual_review_pages"]]),
        ("independent_corroboration", "Build/verify rerun MuPDF and Poppler checks for every embedded component and hash the PDF, manifest, modules and cited renders.", [["module_source_sha256"],["modules","metadata","assertions"]]),
    ]
    return [{"id":i,"result":"reviewed_with_source_limitations_recorded","finding":f,"evidence":e} for i,f,e in entries]


def manifest(pages):
    return {
        "id":IDENT, "rank":5, "title":"USDA APHIS Building 63 Envelope and HVAC Modifications",
        "source_pdf":"pdf/05__vol2__009__USDA_APHIS_Plant_Inspection_Station_Building_63.pdf",
        "source_sha256":"d2e1967964c07d7bd1c058e1e17acaae79c344c83f0e8c9d5241dc9493637da1", "page_count":31,
        "review_status":"complete_with_documented_source_limitations",
        "scope":"Complete source-bounded ground truth for the supplied 31-page Building 63 set: full-page visual review; title-block/sheet/local-scale context; all 28 literal M-601 schedule rows including the air-device accessory matrix and two hydronic control valves; all 75 M-801 through M-804 point-list rows including trend/alarm/graphic marks and source duplicates; DDC/network requirements; seven sequence subjects with checked clauses; and explicit limitations. It does not fabricate installed equipment/sensor/thermostat/damper-actuator counts, controller I/O/cards/terminals/wiring, network addressing/topology or distances.",
        "reading_notes":[
            "All 31 source pages have retained full-page Poppler renders and a completed visual disposition. Strict source cells and bounded assertions are rechecked against MuPDF and Poppler captures during every build/verify run.",
            "M-601 supplies eight source tables and 28 literal rows. The registry retains 24 clean-tag schedule identities and four separately cited air-device type marks without converting either to an installed plan count.",
            "M-801 through M-804 supply 75 literal point-list rows across eight matrices. Repeated printed identifiers and VFD-typical logic remain source facts rather than an automated unique physical I/O count.",
            "M-801 prints BACnet-native DDC/remote-access requirements, and M-802 through M-804 print seven controls/sequence subjects; no final address/topology schedule or standalone damper-actuator schedule is supplied.",
        ],
        "verification_semantics":"The bundle verifier reruns independent MuPDF and Poppler raw-capture checks for every authored literal table and bounded assertion, and hashes linked modules, source PDF, manifest and cited review renders. It validates source evidence and annotation integrity; it does not automatically infer physical plan quantities or engineering suitability.",
        "module_order":["metadata","schedules","points","controls_context","equipment_reconciliation","point_applications","supporting_evidence"],
        "module_sources":{
            "metadata":["metadata_rank05"], "schedules":["schedules_m601_core","schedules_m601_air_devices"], "points":["points_rank05_ledger"],
            "controls_context":["points_m801_m804","controls_sequences_network"], "equipment_reconciliation":["equipment_reconciliation_rank05"],
            "point_applications":["point_applications_rank05"], "supporting_evidence":["supporting_evidence_rank05"],
        },
        "requirement_audit":requirement_audit(),
        "page_review":[{"page":p["page"],"review_status":"complete","render":p["render"],"finding":p["finding"]} for p in pages],
        "declared_checks":[
            {"id":"rank05-full-page-review","path":["page_review"],"operation":"length","expected":31},
            {"id":"rank05-schedule-table-count","path":["modules","schedules","tables"],"operation":"length","expected":8},
            {"id":"rank05-point-table-count","path":["modules","points","tables"],"operation":"length","expected":8},
        ],
        "completion_checks":{"all_31_pages_visually_reviewed":True,"all_authoring_modules_dual_engine_verified_at_build":True,"source_limitations_explicit":True,"required_objectives_covered":True},
    }


def main():
    pages=review_pages()
    write("metadata_rank05.json", metadata(pages))
    write("equipment_reconciliation_rank05.json", equipment_reconciliation())
    write("point_applications_rank05.json", point_applications())
    write("supporting_evidence_rank05.json", supporting())
    write("document_manifest.json", manifest(pages))


if __name__ == "__main__":
    main()
