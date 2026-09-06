"""Write source-scoped final audit modules for rank 24 from reviewed inputs.

This is an authored serialization helper.  Its scopes, classifications,
limitations and sequence summaries are fixed below from the completed page
review.  It reads the existing, independently rechecked schedule/point modules
only to keep registry totals and literal identities synchronized; it does not
discover PDF content or infer physical quantities.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "24__vol2__019"
WORK = AUDIT / "work" / IDENT


def load(name):
    return json.loads((WORK / f"{name}.json").read_text())


def write(name, payload):
    (WORK / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n")


def main():
    metadata = load("metadata")
    schedules = {name: load(name) for name in ["schedules_m71", "schedules_m72", "schedules_m73"]}
    points = load("points_m83_m88")

    family_classes = {
        "M71-AHU": "scheduled_air_handling_unit",
        "M71-AHU-FANS": "scheduled_ahu_supply_or_relief_fan",
        "M71-CHILLER": "scheduled_air_cooled_chiller",
        "M71-BOILER": "scheduled_condensing_boiler",
        "M71-PUMP": "scheduled_pump",
        "M71-GENERAL-FAN": "scheduled_exhaust_fan",
        "M71-AIR-SEPARATOR": "scheduled_air_separator",
        "M72-GRD": "scheduled_air_device_type",
        "M72-FCU": "scheduled_hot_water_fan_coil_unit",
        "M72-CONDENSING": "scheduled_air_cooled_condensing_unit",
        "M72-EXPANSION-TANK": "scheduled_expansion_tank",
        "M72-DX-FCU": "scheduled_dx_fan_coil_unit",
        "M72-UNIT-HEATER": "scheduled_hot_water_unit_heater",
        "M72-SILENCER": "scheduled_silencer",
        "M72-RADIATOR": "scheduled_finned_tube_radiator",
        "M72-LOUVER": "scheduled_louvered_penthouse",
        "M73-VAV": "scheduled_volume_control_box",
    }
    family_scope = {
        "M71-AHU": "M7.1 AHU-1 schedule row; mechanical-room AHU.",
        "M71-AHU-FANS": "M7.1 AHU-1 supply/relief fan schedule row.",
        "M71-CHILLER": "M7.1 utility-enclosure air-cooled chiller schedule row.",
        "M71-BOILER": "M7.1 mechanical-room condensing boiler schedule row.",
        "M71-PUMP": "M7.1 literal condensate, chilled-water, heating-water, or AHU return-pump schedule row.",
        "M71-GENERAL-FAN": "M7.1 roof general-exhaust-fan schedule row.",
        "M71-AIR-SEPARATOR": "M7.1 mechanical-room air-separator schedule row.",
        "M72-GRD": "M7.2 grille/register/diffuser type mark. This is a schedule type row, not a counted plan placement or actuator.",
        "M72-FCU": "M7.2 vestibule hot-water fan-coil schedule row.",
        "M72-CONDENSING": "M7.2 roof air-cooled condensing-unit schedule row.",
        "M72-EXPANSION-TANK": "M7.2 mechanical-room expansion-tank schedule row.",
        "M72-DX-FCU": "M7.2 DX wall-mounted fan-coil schedule row.",
        "M72-UNIT-HEATER": "M7.2 mechanical-room hot-water unit-heater schedule row.",
        "M72-SILENCER": "M7.2 AHU-1 silencer schedule row.",
        "M72-RADIATOR": "M7.2 finned-tube-radiator schedule row.",
        "M72-LOUVER": "M7.2 roof louvered-penthouse schedule row.",
        "M73-VAV": "M7.3 Price SDV volume-control-box schedule row; the complete literal performance row is retained separately.",
    }
    families = []
    anchors = []
    identity_total = 0
    non_instance = {"M72-GRD"}
    for module_name, module in schedules.items():
        for table in module["tables"]:
            table_id = table["id"]
            marks = list(table["rows"])
            families.append({
                "module": module_name + ".json",
                "bundle_module": "schedules",
                "table": table_id,
                "class": family_classes[table_id],
                "rows": len(marks),
                "schedule_mark": marks,
            })
            identity_total += len(marks)
            if table_id not in non_instance:
                namespace = table_id.split("-", 1)[0]
                anchors.extend({"id": f"{namespace}-{mark}", "scope": family_scope[table_id]} for mark in marks)

    equipment = {
        "document_id": IDENT,
        "module_role": "Source-constrained schedule-identity, classification and quantity ledger. Every printed unique mark on M7.1-M7.3 is retained; M7.2 grille/register/diffuser marks are explicitly schedule types rather than unsupported installed quantities.",
        "schedule_registry_schema": {
            "namespace_separator": "-",
            "identity_columns": {"schedule_mark": "mark"},
            "anchor_records_path": ["primary_anchors"],
            "non_instance_table_ids": ["M72-GRD"],
        },
        "scheduled_families": families,
        "schedule_counts": {
            "tables": len(families),
            "rows": identity_total,
            "building_scoped_tag_identities_including_outlet_types": identity_total,
            "other_scheduled_tag_identities": len(anchors),
            "full_vav_performance_rows": 58,
            "source_scope": "There are 132 literal unique schedule marks: 25 on M7.1, 49 on M7.2, and 58 on M7.3. The M7.3 companion table preserves all 58 performance rows with 18 dual-engine-rechecked fields each. M7.2's 23 grille/register/diffuser marks are product/type rows and are not expanded into plan-placement, actuator, or terminal quantities.",
        },
        "primary_anchors": anchors,
        "additional_identities": [
            {"id": "M71-HYDRONIC-COIL-TYPES", "classification": "AHU-1 CHWC and HWC source schedule rows", "source_scope": "schedules_m71.schedule_detail_records.AHU-1", "status": "untagged source type rows; their M7.1 design-airflow, MBH, water-flow and pressure-drop values are retained as source-scoped schedule detail."},
            {"id": "M72-GRD-TYPE-ROWS", "classification": "23 grille/register/diffuser schedule type marks", "source_scope": "schedules_m72.tables[M72-GRD]", "status": "no installed outlet count, damper-actuator count, or BAS-I/O multiplier is asserted."},
            {"id": "M73-VAV-PERFORMANCE", "classification": "58 literal VAV performance rows", "source_scope": "schedules_m73_performance.tables[M73-VAV-PERFORMANCE]", "status": "one complete source row per M7.3 mark; it is a performance companion, not a duplicate equipment identity registry."},
            {"id": "M6-VALVE-DAMPER-DETAILS", "classification": "mechanical detail context", "source_scope": "M6.1/M6.2 and M6.4 full-page review", "status": "details depict coil valves, dampers and motorized-control-damper context but do not constitute a tabular valve or actuator schedule."},
        ],
        "reconciliation_findings": [
            "The original schedule review missed HWRP-1, CU-5 and CU-6; all are now included in the literal 132-mark registry and each is independently rechecked in the source schedule cell.",
            "M7.3's 58 VAV rows are each literal equipment schedule marks and have an associated complete performance row. The source does not state that a schedule tag establishes controller-terminal, actuator, wiring or field-I/O quantity.",
            "M7.2's GRD table is a type/mark schedule, while plan placement counts require a separately validated plan-symbol quantity workflow; none is fabricated here.",
            "M8 point tags repeat in separate system diagram/template blocks. Tags are therefore retained with the printed table and row scope rather than merged into a global physical device identity.",
        ],
        "control_valve_and_damper_schedule_status": {
            "control_valve_schedule": {"status": "not_present_as_tabular_control_valve_schedule", "value": None, "note": "M6.1/M6.4 details and M8 sequences show modulating coil/bypass valve behavior, but no source table publishes a control-valve tag with Cv, selected actuator, signal, fail position, or quantity."},
            "damper_actuator_schedule": {"status": "not_present_as_tabular_actuator_schedule", "value": None, "note": "M6.2/M6.4 and M8.6 show damper and actuator control context, including separate analog I/O for four AHU dampers, but no actuator schedule publishes tag, make/model, torque, signal or fail action."},
        },
        "tables": [],
        "assertions": [],
        "inventory_checks": [
            {"id": "rank24-primary-schedule-anchors", "records_path": ["primary_anchors"], "expected": len(anchors), "unique_key": "id"},
            {"id": "rank24-supplemental-identity-boundaries", "records_path": ["additional_identities"], "expected": 4, "unique_key": "id"},
        ],
    }
    write("equipment_reconciliation", equipment)

    type_counts = Counter(row.split("|")[-1] for table in points["tables"] for row in table["rows"])
    applications = [
        {"id": "m83-chilled-water", "source_table": "M83-CHW-POINTS", "ownership_scope": "M8.3 chilled-water system point-function template: air-cooled chiller, bypass and two chilled-water pump control context.", "source_sheet": "M8.3", "source_page": 19},
        {"id": "m84-heating-hot-water", "source_table": "M84-HHW-POINTS", "ownership_scope": "M8.4 heating-hot-water point-function template: two boilers, bypass and two heating-water pump control context.", "source_sheet": "M8.4", "source_page": 20},
        {"id": "m85-ahu-1", "source_table": "M85-AHU1-POINTS", "ownership_scope": "M8.5 AHU-1 point-function template, including supply/relief fan, hydronic coil, recovery wheel, damper, airflow, CO2 and space-pressure contexts.", "source_sheet": "M8.5", "source_page": 21},
        {"id": "m87-vav", "source_table": "M87-VAV-POINTS", "ownership_scope": "M8.7 printed VAV-control template rows for constant-air-volume, dual-maximum and VAV applications; no unprinted VAV multiplier is assumed.", "source_sheet": "M8.7", "source_page": 23},
        {"id": "m88-miscellaneous", "source_table": "M88-MISC-POINTS", "ownership_scope": "M8.8 miscellaneous template rows for mechanical/toilet exhaust, unit heater, fan coil, lighting, radiator, emergency shutdown and storm-water leak contexts.", "source_sheet": "M8.8", "source_page": 24},
    ]
    point_apps = {
        "document_id": IDENT,
        "module_role": "Explicit source-matrix ownership ledger for the five M8 point-function schedules. Repeated literal tags are retained by source row rather than falsely made into globally unique field-device identities.",
        "ledger_mode": "source_matrix_templates_v1",
        "source_points_modules": ["points_m83_m88.json"],
        "applications": applications,
        "listed_template_counts": {"total": sum(type_counts.values()), "source_matrix_rows": sum(type_counts.values()), **dict(sorted(type_counts.items()))},
        "expanded_template_counts": {"total": sum(type_counts.values()), "source_rows": sum(type_counts.values()), **dict(sorted(type_counts.items()))},
        "printed_assignment_summary": {"cell_bounded_source_matrix_rows": sum(type_counts.values()), **dict(sorted(type_counts.items())), "semantics": "AI/DI/AO/DO values are the printed point-type column of a source control-system template. They are not a final controller-card, terminal, device, field-wiring or installed point total."},
        "expanded_count_warning": "The record exposes 158 raw-text-cell-bounded source-matrix rows under their printed system scopes. M8.3-M8.8 controls diagrams and sequences do not state final controller card/terminal quantities or an installed-system multiplier, and repeated tag text remains source-row scoped.",
        "ownership_binding_semantics": "A table, source row and named system-template scope together identify each point occurrence. A tag that appears more than once in one matrix is represented with its row number in the presentation identifier, not merged or counted as distinct physical hardware.",
        "tables": [],
        "assertions": [],
        "inventory_checks": [{"id": "rank24-matrix-application-scopes", "records_path": ["applications"], "expected": 5, "unique_key": "id"}],
    }
    write("point_applications", point_apps)

    controls = {
        "document_id": IDENT,
        "module_role": "BAS network, sequence-of-operations and sensor/thermostat context from the completed M8.2-M8.8 review. It preserves printed control behavior while recording unavailable final-programming and installed-count fields.",
        "controls_sources": ["M8.2 / PDF p18", "M8.3 / PDF p19", "M8.4 / PDF p20", "M8.5 / PDF p21", "M8.6 / PDF p22", "M8.7 / PDF p23", "M8.8 / PDF p24"],
        "network_architecture": {
            "as_printed": [
                "M8.2 identifies B-BC-1, B-BC-2 and B-BC-3, and states one B-BC for chilled water, hot water and AHU respectively.",
                "M8.2 identifies B-ASC, gateway, OWS and a portable programmer's tool; it calls for B-BC controls in the main mechanical room and leaves PPT location TBD / OWS final location to client coordination.",
                "The M8.2 legend prints Ethernet (Cat-6), RS-485 twisted shielded pair, RS-232 twisted shielded pair, cloud/internet, switch/hub and gateway symbols.",
                "M8.2 explicitly calls for two MSTP trunks for VAVs and a dedicated MSTP trunk for VFDs.",
            ],
            "protocol_status": {"BACnet_MSTP": "explicitly identified as MSTP trunks on M8.2", "BACnet_IP": "not explicitly named in the supplied M8.2 text; Ethernet/Cat-6 is shown but protocol mapping is not inferred", "Modbus": "not_stated", "LonWorks": "not_stated"},
            "not_stated": ["controller manufacturer/model", "IP address plan", "BACnet device instance numbers", "switch/router port design", "final panel count", "final I/O-card/terminal quantity", "field wiring schedule"],
        },
        "sequence_of_operations": {
            "chilled_water_M83": [
                "The source describes one air-cooled chiller and two variable primary chilled-water pumps, available 24 hours/day, 365 days/year, with functions and alarms monitored by BAS.",
                "The chiller manufacturer's panel controls chiller loading/unloading; the source requires a hardwire interface between that panel and site DDC controls.",
                "BAS lead-lag logic alternates duty and standby pump operation; BAS modulates the duty chilled-water pump from differential pressure and controls the normally closed chilled-water bypass valve when insufficient chiller flow is sensed.",
            ],
            "heating_hot_water_M84": [
                "The source describes two hot-water boilers, one boiler-control panel per boiler, and two variable primary hot-water pumps.",
                "BAS lead-lag logic alternates duty/standby pumps based on runtime and modulates the duty pump from differential pressure.",
                "The master boiler control panel stages boilers to maintain supply temperature. The written sequence uses T-5 at 150 F adjustable, starts lag when lead firing is 50 percent and temperature remains below setpoint, and stops lag at a stated combined firing-rate threshold of 20 percent adjustable.",
            ],
            "ahu_1_M85_M86": [
                "M8.6 starts supply fans only after hardwired damper-open proof; in off mode the listed outdoor-air/economizer/relief/return/supply damper states and fan shutdown are specified, while auto mode starts/stops fans and controls dampers through BMS.",
                "The AHU sequence states an occupancy/optimal-start framework, occupied and unoccupied heating/cooling behavior, fire/smoke/freezestat/static shutdown, and isolation-damper end-switch alarms.",
                "M8.6 describes VAV-request duct-static reset and requires separate modulating actuators and analog I/O for minimum-OA, economizer, return and relief dampers. It also covers minimum OA, economizer, relief-fan/space-pressure, energy-wheel and supply-air-temperature behavior.",
            ],
            "vav_M87": [
                "M8.7 says BAS modulates VAV-box dampers to maintain space airflow setpoint between box minimum and maximum airflow; space temperature drives airflow reset and the hot-water valve opens after a temperature drop when minimum airflow is being supplied.",
                "The written VAV sequences print occupied heating/cooling setpoints of 72 F/75 F and unoccupied heating/cooling setpoints of 65 F/80 F, each marked adjustable where shown.",
            ],
            "miscellaneous_M88": [
                "M8.8 covers mechanical-room and toilet exhaust fan/damper interlocks and alarms, local thermostat operation for unit heaters/fan coils/radiators, DX split-system monitoring, lighting control, emergency shutdown and storm-water drain-pan leak alarm behavior.",
                "The emergency drain-pan sequence requires a water detection sensor connected to BAS with a visual alarm at OWS graphics.",
            ],
        },
        "control_diagram_bindings": [
            {"source_sheet": "M8.3", "system": "Chilled water", "equipment_scope": ["CH-1", "CWP-1", "CWP-2", "chilled-water bypass"]},
            {"source_sheet": "M8.4", "system": "Heating hot water", "equipment_scope": ["B-1", "B-2", "HWP-1", "HWP-2", "heating-water bypass"]},
            {"source_sheet": "M8.5/M8.6", "system": "AHU-1", "equipment_scope": ["AHU-1", "SF-1", "SF-2", "RF-1", "RF-2", "HWRP-1", "ERW-1"]},
            {"source_sheet": "M8.7", "system": "VAV controls", "equipment_scope": ["constant-air-volume template", "dual-maximum VAV template", "VAV template"]},
            {"source_sheet": "M8.8", "system": "Miscellaneous systems", "equipment_scope": ["mechanical/toilet exhaust", "unit heater", "fan coil", "finned-tube radiator", "DX split", "lighting", "storm-water drain pan"]},
        ],
        "sensor_and_zone_ledger": [
            {"source_scope": "M8.3 chilled-water point schedule", "sensor_or_thermostat_mapping": "Template rows include CHWR/CHWS temperatures T-1/T-2/T-3, outside-air temperature T-4, chiller CHWS flow FM-1 and differential pressure DP-1.", "count_status": "six AI rows in this source template; not an installed device total."},
            {"source_scope": "M8.4 heating-hot-water point schedule", "sensor_or_thermostat_mapping": "Template rows include HHWS/HHWR temperatures T-1 through T-6, outside-air temperature T-7, two boiler flow meters and two differential-pressure points.", "count_status": "source-template rows only; repeated/physical placement is not established."},
            {"source_scope": "M8.5/M8.6 AHU-1", "sensor_or_thermostat_mapping": "The point schedule includes temperature, humidity, static-pressure, air-flow, filter-status, freezestat, CO2 and three literal space-pressure-sensor rows (SPS). M8.6 also says to provide a minimum of three space pressure sensors with final location coordinated with the designer of record.", "count_status": "three SPS rows are a stated minimum for the AHU space-pressure sequence; remaining point rows are template occurrences, not a building-wide sensor count."},
            {"source_scope": "M8.7 VAV diagrams", "sensor_or_thermostat_mapping": "Each printed VAV control diagram calls for a room/local space-temperature sensor; point rows include zone temperature and VAV discharge-air temperature references.", "count_status": "diagram/template mappings only; no source-wide VAV-to-sensor installation multiplier is emitted."},
            {"source_scope": "M8.8 miscellaneous diagrams", "sensor_or_thermostat_mapping": "Rows include space-temperature sensors, emergency shutdown switch status and storm-water leak sensor WLS-1; the DX split sequence also calls for a wall-mounted temperature sensor for monitoring.", "count_status": "source-template/diagram context, not a global installed count."},
        ],
        "tables": [],
        "assertions": [
            {"id": "m82-two-vav-mstp-trunks", "page": 18, "bbox": [1570, 1240, 1800, 1268], "expected": "PROVIDE TWO MSTP TRUNKS FOR THE VAVS", "mode": "contains"},
            {"id": "m83-one-chiller-two-pumps", "page": 19, "bbox": [320, 906, 1010, 926], "expected": "THE CHILLED WATER SYSTEM SHALL CONSIST OF A SINGLE AIR COOLED CHILLER AND TWO VARIABLE PRIMARY CHILLED WATER PUMPS", "mode": "contains"},
            {"id": "m83-chw-pump-lead-lag", "page": 19, "bbox": [320, 1048, 1010, 1068], "expected": "THE BMS SHALL AUTOMATICALLY ALTERNATE THE OPERATION OF THE DUTY AND STANDBY PUMP", "mode": "contains"},
            {"id": "m84-two-boilers-two-pumps", "page": 20, "bbox": [165, 980, 1040, 999], "expected": "THE HEATING HOT WATER SYSTEM SHALL CONSIST OF TWO HOT WATER BOILERS, TWO BOILER CONTROL PANELS (ONE PER BOILER), AND TWO VARIABLE PRIMARY HOT WATER PUMPS", "mode": "contains"},
            {"id": "m84-hhw-pump-lead-lag", "page": 20, "bbox": [165, 1315, 850, 1335], "expected": "THE BMS SHALL AUTOMATICALLY ALTERNATE THE OPERATION OF THE DUTY AND STANDBY PUMP ON A LEAD-LAG ARRANGEMENT", "mode": "contains"},
            {"id": "m86-damper-proof-before-fans", "page": 22, "bbox": [125, 204, 850, 226], "expected": "THE SUPPLY FANS SHALL START UPON PROOF OF DAMPER OPENING VIA END SWITCHES", "mode": "contains"},
            {"id": "m86-four-damper-actuator-io", "page": 22, "bbox": [145, 1568, 800, 1592], "expected": "PROVIDE SEPARATE MODULATING ACTUATORS AND ANALOG I/O FOR MINIMUM OA DAMPER, ECONOMIZER DAMPER, RETURN DAMPER, AND RELIEF DAMPER", "mode": "contains"},
            {"id": "m87-vav-airflow-control", "page": 23, "bbox": [200, 1030, 810, 1052], "expected": "THE BMS SHALL MODULATE THE VAV BOX DAMPER TO MAINTAIN THE AMOUNT OF AIR SUPPLIED TO THE SPACE AT THE SPACE AIRFLOW SET POINT", "mode": "contains"},
            {"id": "m88-storm-water-sensor", "page": 24, "bbox": [185, 1870, 590, 1892], "expected": "PROVIDE A WATER DETECTION SENSOR IN THE STORM WATER PIPING EMERGENCY DRAIN PAN", "mode": "contains"},
        ],
        "inventory_checks": [{"id": "rank24-controls-diagram-bindings", "records_path": ["control_diagram_bindings"], "expected": 5, "unique_key": "source_sheet"}],
    }
    write("controls_context", controls)

    supporting = {
        "document_id": IDENT,
        "module_role": "Full-set qualification and explicit source limitations for the Eglin AFB NICoE mechanical and BAS ground-truth record.",
        "source_limitations": [
            "The 132 marks are schedule identities, not an automatic installed-equipment or plan-symbol count. M7.2 GRD marks are explicitly schedule types, and no plan placement multiplier is invented.",
            "The five point schedules have 158 literal AI/DI/AO/DO template rows. Repeated tags are represented by their table and source row; this is not a final controller-card, terminal, wiring or installed-field-point total.",
            "M8.2 identifies Ethernet/Cat-6 and MSTP trunks, but it does not publish a final controller make/model list, IP-address plan, BACnet instance map, switch/router design, panel count, I/O-card count or field-wiring schedule.",
            "The source has mechanical valve/damper details and sequence behavior, including separate AHU damper actuators/analog I/O, but no tabular control-valve or damper-actuator schedule gives Cv, actuator model/torque, signal, fail action, tag or installed quantity.",
            "Thermostat, room-sensor and CO2/pressure references are source-template or diagram scoped except the AHU sequence's stated minimum of three space pressure sensors. The supplied pages do not establish a facility-wide installed sensor/thermostat total.",
            "All 24 pages were reviewed visually at full page. The two text engines corroborate every authored schedule tag/performance cell, point-function cell and bounded control assertion, but parser agreement does not itself prove physical plan quantities or unsupplied configuration.",
        ],
        "visual_evidence": [
            {"purpose": "M8.2 network architecture visual review", "render": "reviews/24__vol2__019/p18-p18-full-poppler.png", "engine": "poppler"},
            {"purpose": "M8.3 chilled-water sequence and point matrix visual review", "render": "reviews/24__vol2__019/p19-p19-full-poppler.png", "engine": "poppler"},
            {"purpose": "M8.5 AHU point matrix visual review", "render": "reviews/24__vol2__019/p21-p21-full-poppler.png", "engine": "poppler"},
            {"purpose": "M8.6 AHU written-sequence visual review", "render": "reviews/24__vol2__019/p22-p22-full-poppler.png", "engine": "poppler"},
            {"purpose": "M8.7 VAV controls visual review", "render": "reviews/24__vol2__019/p23-p23-full-poppler.png", "engine": "poppler"},
            {"purpose": "M8.8 miscellaneous controls visual review", "render": "reviews/24__vol2__019/p24-p24-full-poppler.png", "engine": "poppler"},
        ],
        "tables": [],
        "assertions": [],
        "inventory_checks": [
            {"id": "rank24-source-limitations", "records_path": ["source_limitations"], "expected": 6},
            {"id": "rank24-supporting-visual-evidence", "records_path": ["visual_evidence"], "expected": 6},
        ],
    }
    write("supporting_evidence", supporting)

    manifest = {
        "id": IDENT,
        "rank": 24,
        "title": "Eglin AFB NICoE Mechanical Controls",
        "source_pdf": "pdf/24__vol2__019__Eglin_AFB_NICoE_Mechanical_Controls.pdf",
        "source_sha256": "b98b269834a4abfdbb508bd83c2efc53a46d32f3030789e6bd36446ee7148f10",
        "page_count": 24,
        "review_status": "complete_with_documented_source_limitations",
        "scope": "Complete ground truth for the supplied 24-page Eglin AFB NICoE mechanical and controls set: all pages reviewed; project/sheet/scale context; all 132 literal schedule marks across M7.1-M7.3; a full 58-row, 18-field VAV performance table; 158 dual-engine-checked BAS point-function rows across M8.3/M8.4/M8.5/M8.7/M8.8; M8.2 network architecture; M8.3-M8.8 sequences; sensor/thermostat mapping; and explicit limitations. The record does not fabricate plan-placement, installed device, controller terminal/card, control-valve or damper-actuator quantities/specifications not published by the source.",
        "reading_notes": [
            "Every supplied page has a retained full-page Poppler render and visual disposition. Authoritative strict schedule and point cells are rechecked against both retained MuPDF and Poppler captures during every build/verify run.",
            "The schedule registry contains 132 unique marks: 25 M7.1, 49 M7.2 and 58 M7.3. The companion M7.3 table preserves each VAV's 18 source performance fields (1,044 independently rechecked cells).",
            "The BAS ledger contains 158 literal M8 point-function rows: 21 chilled-water, 32 heating-hot-water, 69 AHU-1, 15 VAV and 21 miscellaneous. Categories are printed AI/DI/AO/DO template columns, not final installed I/O quantities.",
            "M8.2 explicitly identifies two MSTP VAV trunks and a dedicated VFD MSTP trunk. It also identifies Ethernet/Cat-6 and RS-485/RS-232 media; it does not establish an IP/BACnet-instance or final panel/card/terminal design.",
            "The record preserves valve/damper control behavior but records the absence of a tabular control-valve or damper-actuator schedule rather than inventing Cv, actuator, signal, fail-position or quantity data.",
        ],
        "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"],
        "module_sources": {"schedules": ["schedules_m71", "schedules_m72", "schedules_m73", "schedules_m73_performance"], "points": ["points_m83_m88"]},
        "requirement_audit": [
            {"id": "project_identity", "result": "reviewed_with_source_limitations_recorded", "finding": "The project/facility name, Ash Dr Eglin AFB Florida address, SmithGroup/SmithGroup MEP-FP, issue, dates and project number are retained as printed.", "evidence": [["modules", "metadata", "project"]]},
            {"id": "sheet_details", "result": "reviewed_with_source_limitations_recorded", "finding": "All 24 supplied pages have a completed sheet disposition and retained full-page review image; schedule and controls sheet titles are additionally bounded in metadata.", "evidence": [["modules", "metadata", "visual_review_pages"], ["modules", "metadata", "assertions"]]},
            {"id": "scale_verification", "result": "reviewed_with_source_limitations_recorded", "finding": "The observed 1/8, 1/4 and 1-1/2 inch view scales are retained; no document-wide scale or nonexistent graphic scale bar is invented.", "evidence": [["modules", "metadata", "scale_semantics"]]},
            {"id": "equipment_tags_and_classification", "result": "reviewed_with_source_limitations_recorded", "finding": "Every M7.1-M7.3 schedule mark is source-classified/anchored, with untagged coil types and non-instance air-device schedule types explicitly scoped.", "evidence": [["modules", "equipment_reconciliation", "scheduled_families"], ["modules", "equipment_reconciliation", "additional_identities"]]},
            {"id": "schedule_rows_and_specs", "result": "reviewed_with_source_limitations_recorded", "finding": "The schedule registry covers 132 literal marks, and a 58-row VAV companion preserves all 18 printed performance fields per VAV source row.", "evidence": [["modules", "equipment_reconciliation", "schedule_counts"], ["modules", "schedules", "source_components", "schedules_m73_performance", "tables"]]},
            {"id": "point_lists_and_equipment_ownership", "result": "reviewed_with_source_limitations_recorded", "finding": "All 158 cell-bounded source rows retain system/template ownership and printed AI/DI/AO/DO category; repeated tags stay source-row scoped.", "evidence": [["modules", "point_applications", "applications"], ["modules", "points", "tables"]]},
            {"id": "network_architecture", "result": "reviewed_with_source_limitations_recorded", "finding": "Network controllers, gateways/media, two VAV MSTP trunks and a dedicated VFD MSTP trunk are preserved with explicit unavailable topology/addressing fields.", "evidence": [["modules", "controls_context", "network_architecture"]]},
            {"id": "sequences_and_diagrams", "result": "reviewed_with_source_limitations_recorded", "finding": "Chilled-water, heating-hot-water, AHU, VAV and miscellaneous sequence/diagram contexts are summarized under their source sheets.", "evidence": [["modules", "controls_context", "sequence_of_operations"], ["modules", "controls_context", "control_diagram_bindings"]]},
            {"id": "space_sensors_and_zones", "result": "reviewed_with_source_limitations_recorded", "finding": "Temperature, humidity, pressure, CO2, flow, thermostat and leak-sensor mappings retain template scope, including the stated minimum of three AHU space-pressure sensors.", "evidence": [["modules", "controls_context", "sensor_and_zone_ledger"]]},
            {"id": "source_limitations_and_conflicts", "result": "reviewed_with_source_limitations_recorded", "finding": "Point-card quantities, network configuration, valve/actuator schedules and facility-wide sensor counts are explicitly constrained to what the source provides.", "evidence": [["modules", "supporting_evidence", "source_limitations"], ["modules", "equipment_reconciliation", "control_valve_and_damper_schedule_status"]]},
            {"id": "all_page_visual_review", "result": "reviewed_with_source_limitations_recorded", "finding": "Every one of 24 supplied pages is represented once with a completed review finding and retained full-page render.", "evidence": [["page_review"], ["modules", "metadata", "visual_review_pages"]]},
            {"id": "independent_corroboration", "result": "reviewed_with_source_limitations_recorded", "finding": "Build/verify independently rechecks all authored literal schedule/point/assertion evidence against retained MuPDF and Poppler captures and hashes all modules/renders.", "evidence": [["module_source_sha256"], ["modules", "controls_context", "assertions"]]},
        ],
        "page_review": [{"page": review["page"], "review_status": "complete", "render": review["render"], "finding": review["finding"]} for review in metadata["visual_review_pages"]],
        "declared_checks": [
            {"id": "supplied-pages", "path": ["modules", "metadata", "visual_review_pages"], "operation": "length", "expected": 24},
            {"id": "full-page-review", "path": ["page_review"], "operation": "length", "expected": 24},
            {"id": "strict-schedule-identity-tables", "path": ["modules", "equipment_reconciliation", "scheduled_families"], "operation": "length", "expected": len(families)},
            {"id": "strict-schedule-identities", "path": ["modules", "equipment_reconciliation", "schedule_counts", "rows"], "expected": identity_total},
            {"id": "vav-performance-companion-table", "path": ["modules", "schedules", "source_components", "schedules_m73_performance", "tables"], "operation": "length", "expected": 1},
            {"id": "cell-bounded-point-matrices", "path": ["modules", "points", "tables"], "operation": "length", "expected": 5},
            {"id": "source-matrix-ledger-rows", "path": ["point_application_ledger"], "operation": "length", "expected": sum(type_counts.values())},
            {"id": "sequence-groups", "path": ["modules", "controls_context", "sequence_of_operations"], "operation": "length", "expected": 5},
        ],
        "completion_checks": {"every_source_page_reviewed": True, "all_explicit_objective_categories_reviewed": True, "all_populated_schedule_and_points_rows_captured": True, "source_conflicts_and_unavailable_fields_preserved": True, "two_engine_checks_current": True, "final_assembly_audit_complete": True},
        "verification_semantics": "MuPDF and Poppler independently captured all 24 supplied vector-PDF pages. Every authored strict schedule mark, every M7.3 performance cell, every M8 point-function cell and each bounded text witness is rechecked against both engines at build and validation time; full-page Poppler review establishes visible page context. These checks corroborate literal source content and declared bounds, not physical plan quantities or unprovided controller, network, valve, actuator, terminal, wiring, location or device-multiplier details.",
    }
    write("document_manifest", manifest)


if __name__ == "__main__":
    main()
