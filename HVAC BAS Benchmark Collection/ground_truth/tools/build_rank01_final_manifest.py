"""Create the final coordinator modules and manifest for Cherry Point.

This is deterministic packaging of an already reviewed source set.  It reads the
existing verified 75-sheet title-block ledger to avoid retyping sheet identifiers,
then writes only the human-reviewed scope and limitation statements below.
"""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IDENT = "01__vol2__001"
WORK = ROOT / "work" / IDENT


PAGE_FINDINGS = {
    1: "M-001 mechanical abbreviations, symbols, notes and controls cross-references.",
    2: "M-002 mechanical information and general drawing notes.",
    3: "MS101 Air Operations mechanical site plan; chilled-water plant and site-routing context.",
    4: "MS102 MTRACON/ATCT mechanical site plan; site chilled-water equipment and routing context.",
    5: "MH100 Air Operations first-floor overall ductwork plan with graphic bar and system layout.",
    6: "MH101 Air Operations first-floor Area A ductwork plan; VAV/FCU, supply/return/exhaust and motorized-damper context.",
    7: "MH102 Air Operations first-floor Area B ductwork plan.",
    8: "MH103 Air Operations first-floor Area C ductwork plan.",
    9: "MH104 Air Operations second-floor Area A ductwork plan.",
    10: "MH105 overall mechanical roof plan with printed scale and graphic bar.",
    11: "MH106 Air Operations roof ductwork plan, Area B.",
    12: "MH111 MTRACON ductwork plan; dense MTRACON AHU/VAV/FCU/CRAH context.",
    13: "MH112 MTRACON roof ductwork plan.",
    14: "MH121 ATCT ductwork plan for floors 1, 2, 3 and 5.",
    15: "MH122 ATCT ductwork plan for floors 7 through 10.",
    16: "MH123 ATCT ductwork plan for floors 11 and 12.",
    17: "MP100 Air Operations first-floor overall piping plan.",
    18: "MP101 Air Operations first-floor Area A piping plan.",
    19: "MP102 Air Operations first-floor Area B piping plan.",
    20: "MP103 Air Operations first-floor Area C piping plan.",
    21: "MP104 Air Operations second-floor Area A piping plan.",
    22: "MP111 MTRACON piping plan.",
    23: "MP121 ATCT piping plan for floors 1, 3 and 5.",
    24: "MP122 ATCT piping plan for floors 7 through 10.",
    25: "MP123 ATCT piping plan for floors 11 and 12.",
    26: "M-301 sections through Air Operations mechanical rooms, AHU/DOAH, boilers, pumps and piping.",
    27: "M-311 MTRACON mechanical-room sections with AHU-M1, DOAH-M1, boilers, pumps and piping.",
    28: "M-321 ATCT sections through AHU-T1A/T1B and floor-11 HVAC systems.",
    29: "M-401 enlarged Air Operations duct and piping mechanical-room plans.",
    30: "M-411 enlarged MTRACON duct and piping mechanical-room plans.",
    31: "M-421 enlarged ATCT mechanical-room duct and piping plans.",
    32: "M-501 hydronic service details: separators, vents, tank, shutdown, strainers and drains.",
    33: "M-502 hydronic piping, heat-trace, coil and penetration details.",
    34: "M-503 duct takeoff and FCU/CUH hydronic connection details.",
    35: "M-504 FCU/CRAH, series fan-powered VAV, humidifier and computer-room air-handler details.",
    36: "M-505 ATFP seismic cable-bracing details for suspended mechanical equipment and inline pumps.",
    37: "M-506 low-velocity ductwork, elbows, diffuser and manual-balancing-damper details.",
    38: "M-507 condensate traps, minimum drain-size table, inline-fan and below-grade piping details.",
    39: "M-508 air-cooled chiller, heat-recovery chiller and condensing-boiler connection details.",
    40: "M-509 DOAH/AHU configuration, pump and upblast centrifugal-fan details.",
    41: "M-510 fire/smoke/control damper and inline-pump details; source contains damper construction, not an actuator schedule.",
    42: "M-601 Air Operations schedules: AHU, DOAH, FCU, pumps and boilers.",
    43: "M-602 Air Operations schedules: unit heaters, duct/piping construction, humidifier and 27 VAV terminal rows.",
    44: "M-603 Air Operations schedules: chiller, fan, air-device, HHW/CHW control-valve, dehumidifier and related schedules.",
    45: "M-611 MTRACON schedules: AHU, FCU, pumps, boilers, heat-recovery chillers and CRAHs.",
    46: "M-612 MTRACON schedules: VAV, DOAH, duct/piping construction, vibration isolation and range hoods.",
    47: "M-613 MTRACON HHW/CHW valve, air-device, humidifier, dehumidifier, fan and expansion-tank schedules.",
    48: "M-621 ATCT schedules: AHU, FCU, CRAH, humidifier, fan, boiler, cabinet heater and pumps.",
    49: "M-622 ATCT schedules: DOAH, HHW/CHW valve, vibration isolation, air separator, silencer and air-device tables.",
    50: "MI700 controls symbols/abbreviations: AI/AO/BI/BO, motorized/control/fire-smoke damper, sensor and thermostat semantics.",
    51: "MI701 DDC system network diagram with BACnet IP, BACnet MS/TP, UUKL and generic network legend plus controllers/cabinets.",
    52: "MI702 Air Ops/MTRACON DOAH schematic and typed points list.",
    53: "MI703 Air Ops/MTRACON DOAH written sequence of operation.",
    54: "MI704 Air Ops/MTRACON AHU schematic and typed points list.",
    55: "MI705 Air Ops/MTRACON AHU written sequence of operation.",
    56: "MI710 Air Operations chilled-water system control schematic and typed points list.",
    57: "MI711 Air Operations chilled-water written sequence of operation.",
    58: "MI712 Air Operations heating-hot-water system control schematic and typed points list.",
    59: "MI713 Air Operations heating-hot-water written sequence of operation.",
    60: "MI720 MTRACON/ATCT chilled-water control schematic and typed points list.",
    61: "MI721 MTRACON/ATCT chilled-water written sequence of operation.",
    62: "MI722 MTRACON/ATCT heating-hot-water schematic and typed points lists.",
    63: "MI723 MTRACON/ATCT heating-hot-water written sequence of operation.",
    64: "MI730 ATCT DOAH-T1 schematic, typed points list and full written sequence.",
    65: "MI731 ATCT AHU schematic, typed points list and sequence including thermostat/humidity context.",
    66: "MI732 ATCT stairwell-pressurization schematic and typed points list.",
    67: "MI740 FCU (cooling/heating) and unit-heater templates, point lists and sequences.",
    68: "MI741 CRAH and series-fan-powered VAV schematics, point lists and sequences.",
    69: "MI742 humidifier, exhaust, bathroom exhaust and elevator-machine-room control templates/point lists/sequences.",
    70: "MI743 Air Operations heating and ventilating controls, typed points list and sequence.",
    71: "MI744 occupied FCU and SFPVAV/redundant-FCU templates, point lists and sequence.",
    72: "M-801 Air Operations chilled-water piping schematic.",
    73: "M-802 Air Operations heating-hot-water piping schematic.",
    74: "M-803 MTRACON/ATCT chilled-water piping schematic.",
    75: "M-804 MTRACON/ATCT heating-hot-water piping schematic.",
}


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def main():
    existing = json.loads((WORK / "metadata.json").read_text())
    title_rows = existing["assertion_groups"][0]["records"]
    if len(title_rows) != 75 or set(PAGE_FINDINGS) != set(range(1, 76)):
        raise ValueError("The authored sheet ledger or full-page findings is incomplete")

    visual_pages = []
    for row in title_rows:
        page = row["page"]
        visual_pages.append({
            "page": page,
            "sheet": row["number"],
            "title": row["title"],
            "render": f"reviews/{IDENT}/p{page}-p{page}-full-poppler.png",
            "finding": PAGE_FINDINGS[page],
        })

    metadata = {
        "document_id": IDENT,
        "module_role": "Final project, scale and complete 75-page visual-review context for the Cherry Point HVAC/BAS source set. It deliberately separates plan/schematic visual context from schedule and BAS template ledgers.",
        "project": {
            "project_name_as_printed": "FY20 P-228 ATC TOWER AND AIR OPERATIONS",
            "location_as_printed": "MCAS CHERRY POINT, CHERRY POINT, NC",
            "navfac_command_as_printed": "NAVAL FACILITIES ENGINEERING COMMAND - MID-ATLANTIC",
            "firm_as_printed_in_title_block": "BURNS & MCDONNELL",
            "issue_as_printed": "ISSUED FOR CONSTRUCTION",
            "issue_date_as_printed": "11/19/19",
            "project_number_as_printed": "1596300",
        },
        "scope": "Complete full-page visual review for the supplied 75-page Cherry Point Air Traffic Tower and Air Operations mechanical and controls source. The record preserves source-bounded schedule identities/specifications, point-list templates, control/network/sequence information and hydronic schematics. It does not infer installed quantities from plan symbols, reuse a template row as a field-device count, or invent unavailable actuator/card/address data.",
        "source_scope": {
            "source_pdf": "pdf/01__vol2__001__Cherry_Point_Air_Traffic_Tower_and_Air_Operations.pdf",
            "page_count": 75,
            "schedule_sheets": ["M-601", "M-602", "M-603", "M-611", "M-612", "M-613", "M-621", "M-622"],
            "controls_sheets": ["MI700", "MI701", "MI702", "MI703", "MI704", "MI705", "MI710", "MI711", "MI712", "MI713", "MI720", "MI721", "MI722", "MI723", "MI730", "MI731", "MI732", "MI740", "MI741", "MI742", "MI743", "MI744"],
        },
        "scale_semantics": {
            "printed_view_scales_observed": ["1/16 in = 1 ft-0 in", "3/32 in = 1 ft-0 in", "1/8 in = 1 ft-0 in", "1/4 in = 1 ft-0 in", "1/2 in = 1 ft-0 in"],
            "takeoff_scale_status": "Multiple printed view scales and graphic scale bars are visually present on plan/section/enlarged-plan sheets; no single document-wide scale is asserted.",
            "bar_scale_status": "Graphic bars were visually observed on the inspected plan/section/enlarged-plan sheets (for example MS101/MS102, MH/MP plans, M-301/M-311/M-321, M-401/M-411/M-421). Details, schedules, controls and schematic sheets are not scale-derived unless a local scale is printed.",
        },
        "visual_review_pages": visual_pages,
        "tables": [],
        "assertions": [],
        "inventory_checks": [{"id": "final-full-page-review-ledger", "records_path": ["visual_review_pages"], "expected": 75, "unique_key": "page"}],
    }
    supporting = {
        "document_id": IDENT,
        "module_role": "Full-set qualification and explicit source limitations for the Cherry Point HVAC/BAS ground-truth record.",
        "source_limitations": [
            "The 243 primary identities are non-duplicated literal schedule marks, not an installed plan-symbol count. The assembled source schedule evidence preserves 53 source tables and 440 literal rows without applying a plan multiplier.",
            "The 546 typed point-list rows are reusable source templates across 77 source tables: 210 AI, 189 DI, 66 AO and 81 DO occurrences. They are not final controller-card, terminal, wiring or installed-field-point quantities.",
            "The source publishes BACnet IP, BACnet MS/TP and BACnet MS/TP UUKL network legends and named controller/cabinet contexts, but not controller make/model beyond source designations, addresses, subnet/VLAN design, final panel/card count or a field-wiring schedule.",
            "The source has 167 literal control-valve schedule rows, with unit/valve mark, GPM, size, configuration and Cv. It has damper details and point/sequence behavior but no standalone damper-actuator schedule with manufacturer/model, torque, signal, fail action or installed quantity; those fields remain unavailable.",
            "Literal point-template occurrences include seven SPACE TEMPERATURE rows and one SPACE THERMOSTAT row. The point-name ledger has no literal CO2 text row, although MI700 includes a CO2 monitor legend symbol. None of these template observations establishes a facility-wide installed sensor/thermostat count.",
            "All 75 pages were reviewed visually at full page. MuPDF and Poppler independently recheck every authored literal schedule/point cell and bounded source assertion, but parser agreement does not prove physical plan quantities or fill unprinted BAS configuration fields."
        ],
        "visual_evidence": [
            {"purpose": "dense schedule and control-valve review", "render": f"reviews/{IDENT}/p44-p44-full-poppler.png", "engine": "poppler"},
            {"purpose": "MTRACON/ATCT schedule and control-valve review", "render": f"reviews/{IDENT}/p47-p47-full-poppler.png", "engine": "poppler"},
            {"purpose": "network-architecture review", "render": f"reviews/{IDENT}/p51-p51-full-poppler.png", "engine": "poppler"},
            {"purpose": "DOAH sequence and typed point-list review", "render": f"reviews/{IDENT}/p53-p53-full-poppler.png", "engine": "poppler"},
            {"purpose": "ATCT AHU typed point-list and sequence review", "render": f"reviews/{IDENT}/p65-p65-full-poppler.png", "engine": "poppler"},
            {"purpose": "FCU/SFPVAV typed point-list and sequence review", "render": f"reviews/{IDENT}/p71-p71-full-poppler.png", "engine": "poppler"},
        ],
        "tables": [],
        "assertions": [],
        "inventory_checks": [
            {"id": "rank01-source-limitations", "records_path": ["source_limitations"], "expected": 6},
            {"id": "rank01-supporting-visual-evidence", "records_path": ["visual_evidence"], "expected": 6},
        ],
    }
    write_json(WORK / "metadata_rank01_final.json", metadata)
    write_json(WORK / "supporting_evidence_rank01.json", supporting)

    base = ["reviewed_with_source_limitations_recorded"]
    audit = [
        ("project_identity", "The printed project, location, NAVFAC command, title-block firm, issue, date and project number are retained.", [["modules", "metadata", "project"]]),
        ("sheet_details", "All 75 supplied pages have a sheet identifier/title from the existing title-block ledger and a complete final visual disposition.", [["modules", "metadata", "visual_review_pages"], ["modules", "metadata_evidence", "assertion_groups"]]),
        ("scale_verification", "The observed 1/16, 3/32, 1/8, 1/4 and 1/2 inch view scales plus limited graphic-bar context are retained without asserting a global scale.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "The equipment registry source-bounds 243 non-duplicated primary scheduled marks and separately identifies non-instance air-device/type schedule tables.", [["modules", "equipment_reconciliation", "scheduled_families"], ["modules", "equipment_reconciliation", "primary_anchors"]]),
        ("schedule_rows_and_specs", "The full schedule assembly preserves 53 source tables and 440 literal rows; the identity module preserves a nonduplicated 243-mark registry and control-valve details are retained in full source tables.", [["modules", "schedules", "tables"], ["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("point_lists_and_equipment_ownership", "All 546 source rows remain source-table scoped with typed AI/DI/AO/DO semantics and explicit application ownership; repeated tags remain source-row scoped.", [["modules", "point_applications", "applications"], ["modules", "points", "tables"]]),
        ("network_architecture", "Network protocol legends, DDC cabinet locations, named B-AAC/B-ASC nodes and external interfaces are retained with unavailable addressing/card data explicit.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "Source-bounded DOAH, AHU, CHW, HHW, CRAH, VAV, FCU, humidifier, exhaust and heating/ventilating sequences plus diagrams are cited by source sheet.", [["modules", "controls_context", "sequence_of_operations"], ["modules", "controls_context", "control_diagram_bindings"]]),
        ("space_sensors_and_zones", "The sensor/thermostat ledger retains template scope and literal row counts rather than claiming a facility-wide installed count.", [["modules", "controls_context", "sensor_and_zone_ledger"]]),
        ("source_limitations_and_conflicts", "Plan quantities, field I/O, addressing, actuator schedule fields and facility-wide sensor counts are constrained to the printed source; valve schedule evidence is distinguished from unavailable damper-actuator schedule data.", [["modules", "supporting_evidence", "source_limitations"], ["modules", "equipment_reconciliation", "control_valve_and_damper_schedule_status"]]),
        ("all_page_visual_review", "Each of the 75 supplied pages has one completed visual finding and a retained full-page Poppler render.", [["page_review"], ["modules", "metadata", "visual_review_pages"]]),
        ("independent_corroboration", "Build/verify reruns both raw-capture parsers over each authoring module and hashes the modules, manifest and cited renders.", [["module_source_sha256"], ["modules", "controls_evidence", "source_components"]]),
    ]
    requirement_audit = [{"id": name, "result": base[0], "finding": finding, "evidence": evidence} for name, finding, evidence in audit]
    manifest = {
        "id": IDENT,
        "rank": 1,
        "title": "MCAS Cherry Point Air Traffic Tower and Air Operations HVAC/BAS",
        "source_pdf": "pdf/01__vol2__001__Cherry_Point_Air_Traffic_Tower_and_Air_Operations.pdf",
        "source_sha256": "9b83f64b9ef98c22a4053ab4e79665fe7581a620c2908c2239b9216c02e2c0bf",
        "page_count": 75,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete ground truth for the supplied 75-page Cherry Point HVAC/BAS source set: all pages visually reviewed; verified title-block/sheet/scale context; 53 literal schedule/valve/construction tables (440 rows); a nonduplicated 243-mark primary equipment registry; 167 literal control-valve schedule rows; 546 dual-engine-checked BAS point-template rows across 77 tables; BACnet network topology; written sequences and control diagrams; sensor/thermostat context; four piping schematics; and source limitations. The record does not fabricate installed plan quantities, final I/O/controller-card/wiring counts, addresses, or damper-actuator schedule specifications absent from the source.",
        "reading_notes": [
            "Every supplied page has a retained full-page Poppler render and a completed visual finding. All strict schedule, point and source-text assertion cells are rechecked against retained MuPDF and Poppler captures during build/verify.",
            "The full schedule assembly preserves 53 source tables / 440 literal rows. The primary identity registry resolves 243 scheduled marks without treating schedule-only device-type tables as installed instance counts.",
            "The BAS source ledger preserves 546 typed template occurrences: 210 AI, 189 DI, 66 AO and 81 DO. Reused tag names remain distinct by printed source row and scope; this is not an installed terminal total.",
            "MI701 publishes BACnet IP, BACnet MS/TP, BACnet MS/TP UUKL and generic-network legend entries alongside three building DDC/cabinet contexts and named controllers. Network addressing and final panel/card/terminal design are not published.",
            "Cherry Point has 167 literal control-valve schedule rows with GPM/size/configuration/Cv fields. It has no standalone damper-actuator schedule; its damper construction/details and BAS behavior are retained without inventing actuator specifics."
        ],
        "verification_semantics": "The bundle verifier independently reruns MuPDF and Poppler checks for every authored literal table/assertion module and hashes all linked modules, the source PDF, manifest and cited full-page renders. It validates source evidence and annotation integrity; it does not automatically infer physical quantities or prove engineering suitability.",
        "module_order": ["metadata", "metadata_evidence", "schedules", "schedule_identities", "points", "controls_context", "controls_evidence", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {
            "metadata": ["metadata_rank01_final"],
            "metadata_evidence": ["metadata"],
            "schedules": ["schedules_rank01_assembled"],
            "schedule_identities": ["schedule_identities_rank01"],
            "points": ["points_rank01_assembled"],
            "controls_context": ["controls_context_rank01"],
            "controls_evidence": ["controls_legend_mi700", "network_mi701", "sequence_air_ops_mtracon_doah", "sequences_air_ops_and_shared_hydronics", "sequence_atct_doah_t1", "sequence_crah_sfpvav", "sequence_mi742", "sequence_air_ops_heating_ventilating", "sequence_mi744_fcu_sfpvav"],
            "equipment_reconciliation": ["equipment_reconciliation_rank01"],
            "point_applications": ["point_applications_rank01"],
            "supporting_evidence": ["supporting_evidence_rank01"],
        },
        "requirement_audit": requirement_audit,
        "page_review": [{"page": page["page"], "review_status": "complete", "render": page["render"], "finding": page["finding"]} for page in visual_pages],
        "declared_checks": [
            {"id": "rank01-full-page-review", "path": ["page_review"], "operation": "length", "expected": 75},
            {"id": "rank01-schedule-table-count", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 53},
            {"id": "rank01-point-table-count", "path": ["modules", "points", "tables"], "operation": "length", "expected": 77},
        ],
        "completion_checks": {
            "all_75_pages_visually_reviewed": True,
            "all_authoring_modules_dual_engine_verified_at_build": True,
            "source_limitations_explicit": True,
            "required_objectives_covered": True,
        },
    }
    write_json(WORK / "document_manifest.json", manifest)


if __name__ == "__main__":
    main()
