"""Assemble source-bounded coordinator modules for White Sturgeon rank 03.

This helper only joins already-authored, dual-parser-correlated schedule and
PLC-I/O modules.  It does not extract PDF content, count symbols, or turn
diagram templates into unprinted installed quantities.
"""
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "03__vol1__27"
WORK = AUDIT / "work" / IDENT


def load(name):
    return json.loads((WORK / f"{name}.json").read_text())


def write(name, payload):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / f"{name}.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


PAGE_REVIEW = [
    (1, "M-101", "MECHANICAL HVAC FLOOR PLAN", "Mechanical HVAC floor plan: ERV, split-system, unit-heater, exhaust/louver and ductwork context; local stated plan scale is visible."),
    (2, "M-102", "MECHANICAL PIPING FLOOR PLAN", "Mechanical piping floor plan: hydronic, wastewater and aerated-water piping context."),
    (3, "M-103", "MECHANICAL PIPING SUPPORT PLAN", "Mechanical piping support plan and support/brace coordination context."),
    (4, "M-301", "MECHANICAL SECTIONS", "Mechanical sections with HVAC/piping elevation and routing context."),
    (5, "M-302", "MECHANICAL SECTIONS", "Mechanical sections with equipment and piping elevation context."),
    (6, "M-401", "ENLARGED MECHANICAL PIPING PLANS", "Enlarged mechanical piping plans for main-room systems."),
    (7, "M-402", "ENLARGED AERATED WATER PLAN", "Enlarged aerated-water plan with process/HVAC coordination context."),
    (8, "M-501", "MECHANICAL DETAILS", "Mechanical detail sheet."),
    (9, "M-502", "MECHANICAL DETAILS", "Mechanical detail sheet."),
    (10, "M-503", "MECHANICAL DETAILS", "Mechanical detail sheet."),
    (11, "M-504", "MECHANICAL DETAILS", "Mechanical detail sheet."),
    (12, "M-505", "MECHANICAL DETAILS", "Mechanical detail sheet."),
    (13, "M-601", "MECHANICAL SCHEDULES", "M-601 schedules: seismic/vibration ledger, ERV, exhaust fans and grille/register/diffuser types."),
    (14, "M-602", "MECHANICAL SCHEDULES", "M-602 schedules: expansion tanks, modular WSHP assembly/modules/accessories and filters/strainers."),
    (15, "M-603", "MECHANICAL SCHEDULES", "M-603 schedules: instrumentation, control valves, pumps, chemical feeders, air separators and louvers."),
    (16, "M-604", "MECHANICAL SCHEDULES", "M-604 schedules: hydronic unit heaters, buffer tanks, heat exchangers and split-system AC."),
    (17, "M-701", "AERATED WATER P&ID", "Aerated-water P&ID with process equipment, instruments and control-valve context."),
    (18, "M-702", "MECHANICAL CONTROL DIAGRAMS", "Control diagrams and written sequences for exhaust fans, unit heaters and HWP-5/HWP-6."),
    (19, "M-703", "AERATED WATER SEQUENCE OF OPERATIONS", "White Sturgeon rearing-water written sequence of operations."),
    (20, "M-901", "PIPING ISOMETRICS", "Piping isometric sheet."),
    (21, "M-902", "PIPING ISOMETRICS", "Piping isometric sheet."),
    (22, "M-903", "PIPING ISOMETRICS", "Piping isometric sheet."),
    (23, "M-904", "PIPING ISOMETRICS", "Piping isometric sheet."),
    (24, "M-905", "PIPING ISOMETRICS", "Piping isometric sheet."),
    (25, "P-101", "PLUMBING UNDER-SLAB PLAN", "Plumbing under-slab plan."),
    (26, "P-101", "PLUMBING UNDER-SLAB PLAN", "Second supplied P-101 plumbing under-slab-plan page; retained as a separate source PDF page."),
    (27, "P-501", "PLUMBING DETAILS", "Plumbing detail sheet."),
    (28, "P-601", "PLUMBING SCHEDULES", "Plumbing schedule sheet."),
    (29, "E-001", "ELECTRICAL SYMBOLS AND INDEX", "Electrical symbols, abbreviations and drawing index."),
    (30, "E-101", "ELECTRICAL SITE PLAN", "Electrical site plan."),
    (31, "E-201", "ELECTRICAL LIGHTING PLAN", "Electrical lighting plan."),
    (32, "E-301", "ELECTRICAL POWER / SYSTEM PLAN", "Electrical power and system plan."),
    (33, "E-501", "ELECTRICAL DIAGRAMS", "Electrical control-network, pump and lift-station diagram context."),
    (34, "E-502", "ELECTRICAL WIRING DIAGRAMS", "Electrical wiring diagrams."),
    (35, "E-503", "ELECTRICAL DETAILS", "Electrical detail sheet."),
    (36, "E-601", "ELECTRICAL ONE-LINE DIAGRAM", "Electrical one-line diagram."),
    (37, "E-701", "ELECTRICAL SCHEDULES", "Electrical schedule sheet."),
    (38, "E-702", "PLC I/O LIST", "White Sturgeon PLC I/O list with I/O channels, protocol, display/action, cable and conduit columns."),
]


FAMILY_DETAILS = {
    "M601-SEISMIC-VIBRATION-LEDGER": ("seismic_and_vibration_schedule_ledger", "M-601 restraint/vibration schedule marks; these are design-ledger rows, not independently counted installed equipment."),
    "M601-ENERGY-RECOVERY-VENTILATOR": ("scheduled_energy_recovery_ventilator", "M-601 ERV schedule row."),
    "M601-FANS": ("scheduled_exhaust_fan", "M-601 exhaust-fan schedule rows."),
    "M601-GRILLES-REGISTERS-DIFFUSERS": ("scheduled_air_device_type", "M-601 grille/register/diffuser product-type rows, not plan-placement or actuator quantities."),
    "M602-EXPANSION-TANKS": ("scheduled_expansion_tank", "M-602 expansion-tank schedule rows."),
    "M602-WSHP-ASSEMBLY-TAG": ("scheduled_water_source_heat_pump_assembly", "M-602 WSHP assembly tag row."),
    "M602-WSHP-MODULES": ("water_source_heat_pump_module_detail", "M-602 literal module-detail rows; shared merged assembly cells are preserved separately and not duplicated."),
    "M602-WSHP-ACCESSORIES": ("water_source_heat_pump_accessory_detail", "M-602 WSHP accessory-detail rows."),
    "M602-FILTERS-STRAINERS": ("scheduled_filter_or_strainer", "M-602 filter/strainer schedule rows."),
    "M603-INSTRUMENTATION": ("scheduled_instrument", "M-603 instrumentation schedule rows."),
    "M603-CONTROL-VALVES": ("scheduled_control_valve", "M-603 control-valve schedule rows with source actuator fields."),
    "M603-PUMP-SCHEDULE-MARKS": ("scheduled_pump", "M-603 literal pump schedule marks. Detailed shared/merged source fields are not manufactured for every mark."),
    "M603-CHEMICAL-POT-FEEDERS": ("scheduled_chemical_pot_feeder", "M-603 chemical pot-feeder schedule rows."),
    "M603-AIR-SEPARATORS": ("scheduled_air_separator", "M-603 air-separator schedule rows."),
    "M603-LOUVERS": ("scheduled_louver", "M-603 louver schedule rows; this is distinct from a standalone damper-actuator schedule."),
    "M604-HYDRONIC-UNIT-HEATERS": ("scheduled_hydronic_unit_heater", "M-604 hydronic unit-heater schedule rows."),
    "M604-BUFFER-TANKS": ("scheduled_buffer_tank", "M-604 buffer-tank schedule rows."),
    "M604-HEAT-EXCHANGERS": ("scheduled_plate_and_frame_heat_exchanger", "M-604 heat-exchanger schedule rows."),
    "M604-SPLIT-SYSTEM-AC": ("scheduled_split_system_air_conditioner", "M-604 shared indoor/outdoor split-system schedule row."),
}


def first_integer(value):
    match = re.match(r"\s*(\d+)", value)
    return int(match.group(1)) if match else 0


def main():
    schedules = {
        name: load(name)
        for name in [
            "schedules_m601_core", "schedules_m602_core",
            "schedules_m603_core", "schedules_m604_core",
        ]
    }
    points = load("points_e702_plc_io")

    visual_pages = [
        {
            "page": page,
            "sheet": sheet,
            "title": title,
            "render": f"reviews/{IDENT}/p{page}-p{page}-full-poppler.png",
            "finding": finding,
        }
        for page, sheet, title, finding in PAGE_REVIEW
    ]
    if [record["page"] for record in visual_pages] != list(range(1, 39)):
        raise ValueError("Rank 03 full-page review ledger is incomplete")

    metadata = {
        "document_id": IDENT,
        "module_role": "Project, title-block, local scale and complete full-page visual-review context for the White Sturgeon Fish Hatchery source set. Schedule, point and controls facts remain in their dedicated source modules.",
        "project": {
            "project_name_as_printed": "WHITE STURGEON FISH HATCHERY",
            "building_type_source_bounded": "Fish hatchery (from the printed project name).",
            "location_as_printed": None,
            "location_status": "A project location is not explicitly printed in the reviewed title block; the Coffman Spokane address is not treated as the project location.",
            "engineering_firm_as_printed": "COFFMAN ENGINEERS INC.",
            "issue_as_printed": "ISSUED FOR CONSTRUCTION",
            "title_block_date_as_printed": "06/07/2024",
            "revision_date_status": "No populated revision date is asserted from the supplied title block; the printed 06/07/2024 field is retained as a title-block date, not recast as a revision date.",
            "project_number_as_printed": "232667",
        },
        "sheet_details": {
            "sheet_ledger_semantics": "All 38 supplied PDF pages have a source-sheet/title visual disposition below. Page 25 and page 26 both print P-101 and are retained separately.",
            "revision_status": "No independently asserted populated revision date is available from the reviewed title block.",
        },
        "scale_semantics": {
            "printed_view_scales_observed": [{"page": 1, "sheet": "M-101", "view": "MECHANICAL HVAC FLOOR PLAN", "scale_as_printed": "3/16\"=1'-0\""}],
            "graphic_scale_bar_status": "No graphic scale bar is asserted for this record. The stated M-101 scale is local to that view and is not generalized to plans, details, schedules, controls, P&IDs, isometrics or electrical sheets.",
            "takeoff_scale_status": "A stated local plan scale is recorded for M-101 only. Distance-based takeoff requires a separate local visual check for the target view.",
        },
        "visual_review_pages": visual_pages,
        "tables": [],
        "assertions": [
            {"id": "rank03-title-project", "page": 1, "bbox": [2215, 605, 2410, 660], "expected": "WHITE STURGEON FISH HATCHERY", "mode": "exact"},
            {"id": "rank03-title-firm", "page": 1, "bbox": [2250, 1210, 2320, 1235], "expected": "COFFMAN", "mode": "exact"},
            {"id": "rank03-title-date", "page": 1, "bbox": [2350, 1175, 2420, 1205], "expected": "06/07/2024", "mode": "exact"},
            {"id": "rank03-title-issue", "page": 1, "bbox": [2225, 668, 2400, 722], "expected": "ISSUED FOR CONSTRUCTION", "mode": "exact"},
            {"id": "rank03-m101-sheet", "page": 1, "bbox": [2245, 1455, 2380, 1520], "expected": "M-101", "mode": "exact"},
            {"id": "rank03-m101-local-scale", "page": 1, "bbox": [1545, 1435, 1645, 1465], "expected": "SCALE: 3/16\"=1'-0\"", "mode": "exact"},
        ],
        "inventory_checks": [{"id": "rank03-full-page-review-ledger", "records_path": ["visual_review_pages"], "expected": 38, "unique_key": "page"}],
    }
    write("metadata_rank03", metadata)

    families = []
    anchors = []
    identity_total = 0
    row_total = 0
    non_instance = {"M601-GRILLES-REGISTERS-DIFFUSERS"}
    for module_name, module in schedules.items():
        for table in module["tables"]:
            table_id = table["id"]
            if table_id not in FAMILY_DETAILS:
                raise ValueError(f"No rank 03 classification for {table_id}")
            classification, source_scope = FAMILY_DETAILS[table_id]
            columns = table["columns"].split("|")
            family = {
                "module": module_name + ".json",
                "bundle_module": "schedules",
                "table": table_id,
                "class": classification,
                "scope": source_scope,
                "rows": len(table["rows"]),
            }
            identity_field = "tag" if "tag" in columns else "indoor_tag" if "indoor_tag" in columns else None
            if identity_field:
                column_index = columns.index(identity_field)
                tags = [row.split("|")[column_index] for row in table["rows"]]
                family[identity_field] = tags
                identity_total += len(tags)
                if table_id not in non_instance:
                    namespace = table_id.split("-", 1)[0]
                    anchors.extend({
                        "id": f"{namespace}-{tag}",
                        "scope": source_scope,
                        "classification": classification,
                    } for tag in tags)
            families.append(family)
            row_total += len(table["rows"])

    if len(families) != 19 or row_total != 111 or identity_total != 75 or len(anchors) != 70:
        raise ValueError("Unexpected rank 03 schedule-registry totals")
    equipment = {
        "document_id": IDENT,
        "module_role": "Source-constrained equipment, instrument and control-valve identity/classification ledger. It covers every linked M-601 through M-604 schedule table exactly once, preserving schedule rows without inventing plan-placement, actuator or device multipliers.",
        "schedule_registry_schema": {
            "namespace_separator": "-",
            "identity_columns": {"tag": "tag", "indoor_tag": "indoor_tag"},
            "anchor_records_path": ["primary_anchors"],
            "non_instance_table_ids": sorted(non_instance),
        },
        "scheduled_families": families,
        "schedule_counts": {
            "tables": len(families),
            "rows": row_total,
            "building_scoped_tag_identities_including_outlet_types": identity_total,
            "other_scheduled_tag_identities": len(anchors),
            "control_valve_schedule_rows": 4,
            "louver_schedule_rows": 3,
            "source_scope": "The four source schedule sheets provide 111 literal rows across 19 tables. There are 75 distinct tag/indoor-tag identities in tables that publish an identifier; 70 are primary anchored schedule identities after retaining five grille/register/diffuser type marks as non-instance schedule rows. The seismic ledger, WSHP module detail and WSHP accessory detail have no generated identity column in this registry.",
        },
        "primary_anchors": anchors,
        "additional_identities": [
            {"id": "M601-SEISMIC-VIBRATION-LEDGER", "classification": "26 restraint/vibration source rows", "source_scope": "schedules_m601_core.tables[M601-SEISMIC-VIBRATION-LEDGER]", "status": "Marks are source design-ledger entries, not added as independently counted installed equipment."},
            {"id": "M602-WSHP-MODULES", "classification": "five module-detail rows", "source_scope": "schedules_m602_core.tables[M602-WSHP-MODULES]", "status": "The source has one WSHP-1 assembly tag plus five literal module rows; vertically merged assembly/location fields are not fabricated into every module row."},
            {"id": "M602-WSHP-ACCESSORIES", "classification": "five accessory-detail rows", "source_scope": "schedules_m602_core.tables[M602-WSHP-ACCESSORIES]", "status": "These rows publish accessory descriptions rather than an equipment tag column."},
            {"id": "M601-GRD-TYPE-ROWS", "classification": "five grille/register/diffuser type rows", "source_scope": "schedules_m601_core.tables[M601-GRILLES-REGISTERS-DIFFUSERS]", "status": "These are literal schedule types, not an installed outlet, damper, actuator or BAS-I/O quantity."},
        ],
        "control_valve_and_damper_schedule_status": {
            "control_valve_schedule": {"status": "present", "source_sheet": "M-603 / PDF p15", "row_count": 4, "tags": ["TCV-105", "TCV-110A", "TCV-110B", "LCV-135"], "note": "The source table publishes valve, flow, size, Cv/characteristic, power, actuator time/action, position feedback, fail position, override and comments fields as printed."},
            "damper_actuator_schedule": {"status": "not_present_as_standalone_tabular_schedule", "value": None, "note": "M-603 has three louver rows and M-702 has louver/damper control context, but the supplied source does not publish a standalone damper-actuator schedule with tag, manufacturer/model, torque, signal, fail action and installed quantity."},
            "louver_schedule": {"status": "present", "source_sheet": "M-603 / PDF p15", "row_count": 3, "tags": ["LV-1", "LV-2", "LV-3"], "note": "Louver performance/details are retained in the source schedule. The table is not recast as a complete damper-actuator schedule."},
        },
        "tables": [],
        "assertions": [],
        "inventory_checks": [
            {"id": "rank03-primary-schedule-anchors", "records_path": ["primary_anchors"], "expected": len(anchors), "unique_key": "id"},
            {"id": "rank03-additional-identity-boundaries", "records_path": ["additional_identities"], "expected": 4, "unique_key": "id"},
        ],
    }
    write("equipment_reconciliation_rank03", equipment)

    point_table = points["tables"][0]
    point_columns = point_table["columns"].split("|")
    channel_counts = {}
    for field, label in [("analog_input", "AI"), ("analog_output", "AO"), ("digital_input", "DI"), ("digital_output", "DO")]:
        index = point_columns.index(field)
        channel_counts[label] = sum(first_integer(row.split("|")[index]) for row in point_table["rows"])
    point_apps = {
        "document_id": IDENT,
        "module_role": "Explicit source-row ownership ledger for the E-702 White Sturgeon PLC I/O list. Each literal source row remains a PLC-I/O declaration rather than an inferred terminal, field-device or generic BAS-template expansion.",
        "ledger_mode": "source_matrix_templates_v1",
        "applications": [
            {"id": "e702-white-sturgeon-plc-io", "source_table": "E702-WHITE-STURGEON-PLC-IO-LIST", "ownership_scope": "Literal E-702 White Sturgeon PLC I/O records, including printed I/O-channel quantities, protocol, display/action, cable and conduit fields.", "source_sheet": "E-702", "source_page": 38},
        ],
        "listed_template_counts": {"total": len(point_table["rows"]), "source_rows": len(point_table["rows"]), **channel_counts},
        "expanded_template_counts": {"total": len(point_table["rows"]), "source_rows": len(point_table["rows"]), **channel_counts},
        "printed_assignment_summary": {"literal_plc_io_records": len(point_table["rows"]), "printed_channel_quantity_totals": channel_counts, "semantics": "AI/AO/DI/DO totals sum the numeric text in the corresponding E-702 source columns, including source cells such as '1 RTD'. They are not a final card, terminal, field-device, wiring or installation quantity beyond this published PLC-I/O list."},
        "expanded_count_warning": "E-702 has 52 literal PLC-I/O records. Its printed channel values are retained under source-row scope; the record does not multiply a row into unprinted individual sensor, controller-card, termination, cable or field-wiring quantities.",
        "ownership_binding_semantics": "A source-table row, its tag text and E-702 scope together identify a point occurrence. Similar tag text in M-603, M-702 or M-703 is not merged automatically into a separate physical-device count.",
        "tables": [],
        "assertions": [],
        "inventory_checks": [{"id": "rank03-e702-application-scope", "records_path": ["applications"], "expected": 1, "unique_key": "id"}],
    }
    write("point_applications_rank03", point_apps)

    supporting = {
        "document_id": IDENT,
        "module_role": "Full-set qualification and explicit source limitations for the White Sturgeon Fish Hatchery HVAC/BAS ground-truth record.",
        "source_limitations": [
            "The M-601 through M-604 source schedules preserve 111 literal rows across 19 tables. Their 75 tag/indoor-tag identities are schedule scope, not a separately validated installed plan-symbol count; M-601 grille/register/diffuser marks are schedule types rather than plan-placement quantities.",
            "The E-702 PLC I/O list preserves 52 literal records and its printed AI/AO/DI/DO column quantities. These are not expanded into a final controller-card, terminal, field-device, cable or field-wiring count.",
            "The source states ETHERNET/IP, BACNET /IP and MODBUS TCP/IP in E-702 and diagrams an Allen-Bradley CompactLogix 5380 / Compact 5000 I/O / PanelView Plus 7 / Ethernet Tap context on E-501. It does not publish a final network-address, subnet/VLAN, controller-card, terminal or switch-port schedule.",
            "M-702 and M-703 publish controls diagrams and written sequence context. Those assertions remain source-sheet scoped and are not transformed into additional unprinted point rows or complete commissioning logic.",
            "M-603 publishes four control-valve rows and three louver rows. The supplied source has no standalone damper-actuator schedule providing tag, make/model, torque, signal, fail action and installed quantity, so none is fabricated.",
            "Sensor/instrument schedule and E-702 rows identify named instruments and PLC actions, but the supplied source does not establish facility-wide installed counts for space sensors, CO2 sensors or smart thermostats. No such total is inferred from repeated diagrams, control templates or generic note text.",
            "All 38 source pages were visually reviewed at full page. MuPDF and Poppler independently corroborate every authored literal schedule/PLC-I/O cell and bounded metadata/controls assertion; parser agreement does not prove physical plan quantities or supply unprinted BAS configuration.",
        ],
        "visual_evidence": [
            {"purpose": "M-601 schedule review", "render": f"reviews/{IDENT}/p13-p13-full-poppler.png", "engine": "poppler"},
            {"purpose": "M-603 instrumentation, control-valve and louver schedule review", "render": f"reviews/{IDENT}/p15-p15-full-poppler.png", "engine": "poppler"},
            {"purpose": "M-702 control diagrams and written sequence review", "render": f"reviews/{IDENT}/p18-p18-full-poppler.png", "engine": "poppler"},
            {"purpose": "M-703 aerated-water sequence review", "render": f"reviews/{IDENT}/p19-p19-full-poppler.png", "engine": "poppler"},
            {"purpose": "E-501 network/control-diagram review", "render": f"reviews/{IDENT}/p33-p33-full-poppler.png", "engine": "poppler"},
            {"purpose": "E-702 PLC I/O list review", "render": f"reviews/{IDENT}/p38-p38-full-poppler.png", "engine": "poppler"},
        ],
        "tables": [],
        "assertions": [],
        "inventory_checks": [
            {"id": "rank03-source-limitations", "records_path": ["source_limitations"], "expected": 7},
            {"id": "rank03-supporting-visual-evidence", "records_path": ["visual_evidence"], "expected": 6},
        ],
    }
    write("supporting_evidence_rank03", supporting)

    audit = [
        ("project_identity", "The printed project name, title-block firm, issue, date and project number are retained; project location is explicitly unavailable rather than inferred.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Each of the 38 source pages has a sheet/title visual disposition, including both supplied P-101 pages; revision-date availability is explicitly constrained.", [["modules", "metadata", "sheet_details"], ["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "The stated M-101 3/16\"=1'-0\" view scale is source-bounded, and no graphic scale bar or document-wide scale is asserted.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "The schedule registry covers all 19 linked M-601-M-604 tables, retains 75 tag/indoor-tag identities and classifies source families without treating GRD types as installed instances.", [["modules", "equipment_reconciliation", "scheduled_families"], ["modules", "equipment_reconciliation", "primary_anchors"]]),
        ("schedule_rows_and_specs", "The core schedule modules retain every authored source cell across 111 schedule rows, including control valves, louver detail and performance fields.", [["modules", "schedules", "tables"], ["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("point_lists_and_equipment_ownership", "The E-702 source list retains 52 literal PLC-I/O records with their printed AI/AO/DI/DO fields and one explicit source-table application scope.", [["modules", "points", "tables"], ["modules", "point_applications", "applications"]]),
        ("network_architecture", "Literal E-702 protocols and E-501 diagram components are retained with unavailable address/card/terminal fields recorded.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "M-702 and M-703 controls diagrams and written sequences are source-sheet bounded and cite the relevant equipment/system context.", [["modules", "controls_context", "sequence_of_operations"], ["modules", "controls_context", "control_diagram_bindings"]]),
        ("space_sensors_and_zones", "The record retains named source instrument/sensor contexts and records that a facility-wide thermostat, space-sensor or CO2 total is not published.", [["modules", "controls_context", "sensor_and_zone_ledger"], ["modules", "supporting_evidence", "source_limitations"]]),
        ("source_limitations_and_conflicts", "Schedule identity, PLC I/O, network, sequence, damper-actuator and facility-wide sensor limitations are explicit rather than filled with assumptions.", [["modules", "supporting_evidence", "source_limitations"], ["modules", "equipment_reconciliation", "control_valve_and_damper_schedule_status"]]),
        ("all_page_visual_review", "All 38 supplied pages have a completed visual finding and retained full-page Poppler render.", [["page_review"], ["modules", "metadata", "visual_review_pages"]]),
        ("independent_corroboration", "The final bundle reruns MuPDF and Poppler evidence checks for every component and hashes the source PDF, modules, manifest and cited review renders.", [["module_source_sha256"], ["modules", "controls_context", "assertions"]]),
    ]
    manifest = {
        "id": IDENT,
        "rank": 3,
        "title": "White Sturgeon Fish Hatchery HVAC/BAS",
        "source_pdf": "pdf/03__vol1__27__Colville_White_Sturgeon_Fish_Hatchery.pdf",
        "source_sha256": "2e123db08407f97acd6bc6387ecab6e08ad8204971fb5c24a3668bbd34dec0cf",
        "page_count": 38,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete source-bounded ground truth for the supplied 38-page White Sturgeon Fish Hatchery set: full-page visual review; project/title-block/sheet/local-scale context; 111 literal schedule rows across M-601-M-604; 75 schedule tag/indoor-tag identities; four control-valve and three louver schedule rows; 52 dual-engine-checked PLC I/O records from E-702; E-501 network-diagram context; M-702/M-703 written sequences and controls diagrams; sensor/instrument context; and documented source limitations. It does not fabricate plan quantities, installed point/device totals, controller/card/terminal/wiring counts, network addressing, or a damper-actuator schedule absent from the source.",
        "reading_notes": [
            "All 38 source pages have retained full-page Poppler renders and a completed visual disposition. Strict source cells and bounded assertions are rechecked against retained MuPDF and Poppler captures during every build/verify run.",
            "The source schedule corpus contains 19 tables and 111 literal rows: 75 tag/indoor-tag identities, 70 primary anchored schedule identities, 26 seismic/vibration ledger rows, five WSHP module-detail rows and five WSHP accessory-detail rows. Grille/register/diffuser marks are type rows rather than installed quantities.",
            "E-702 contains 52 literal PLC I/O records. Its AI/AO/DI/DO fields remain source-row scoped; they are not automatically a final controller-card, terminal, field-device, cable or wiring count.",
            "E-702 prints ETHERNET/IP, BACNET /IP and MODBUS TCP/IP. E-501 diagrams an Allen-Bradley CompactLogix 5380, Compact 5000 I/O, PanelView Plus 7 and Ethernet Tap context, but no final addressing or card/terminal design.",
            "M-603 contains four literal control-valve schedule rows and three louver rows. M-702/M-703 have control behavior, but no standalone damper-actuator schedule with make/model, torque, signal, fail action, tag and installed quantity is supplied.",
        ],
        "verification_semantics": "The bundle verifier reruns independent MuPDF and Poppler raw-capture checks for every authored literal table and bounded assertion, and hashes linked modules, source PDF, manifest and cited full-page review renders. It validates source evidence and annotation integrity; it does not automatically infer physical plan quantities or engineering suitability.",
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {
            "metadata": ["metadata_rank03"],
            "schedules": ["schedules_m601_core", "schedules_m602_core", "schedules_m603_core", "schedules_m604_core"],
            "points": ["points_e702_plc_io"],
            "controls_context": ["controls_context_rank03"],
            "equipment_reconciliation": ["equipment_reconciliation_rank03"],
            "point_applications": ["point_applications_rank03"],
            "supporting_evidence": ["supporting_evidence_rank03"],
        },
        "requirement_audit": [{"id": item[0], "result": "reviewed_with_source_limitations_recorded", "finding": item[1], "evidence": item[2]} for item in audit],
        "page_review": [{"page": item["page"], "review_status": "complete", "render": item["render"], "finding": item["finding"]} for item in visual_pages],
        "declared_checks": [
            {"id": "rank03-full-page-review", "path": ["page_review"], "operation": "length", "expected": 38},
            {"id": "rank03-schedule-table-count", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 19},
            {"id": "rank03-point-table-count", "path": ["modules", "points", "tables"], "operation": "length", "expected": 1},
        ],
        "completion_checks": {
            "all_38_pages_visually_reviewed": True,
            "all_authoring_modules_dual_engine_verified_at_build": True,
            "source_limitations_explicit": True,
            "required_objectives_covered": True,
        },
    }
    write("document_manifest", manifest)


if __name__ == "__main__":
    main()
