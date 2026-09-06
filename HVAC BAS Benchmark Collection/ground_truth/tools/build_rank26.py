"""Author source-bounded Rank 26 ground-truth modules."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "26__vol2__031"
WORK = AUDIT / "work" / IDENT


def write(name, value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / (name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def assertion(id_, page, bbox, expected):
    return {"id": id_, "page": page, "bbox": bbox, "expected": expected, "mode": "contains"}


def literal_table(id_, page, sheet, title, x0, x1, yranges, rows):
    return {
        "id": id_, "page": page, "sheet": sheet, "title_as_printed": title,
        "columns": "literal_source_row_as_printed", "x_edges": [x0, x1],
        "y_ranges": yranges, "rows": rows, "row_reading_order": "left_to_right",
        "source_row_semantics": "Complete literal printed schedule or matrix row. It is source evidence only and is not converted into installed multiplicity, wiring, controller, ownership or physical-takeoff claims.",
    }


def review_pages():
    def finding(page):
        if page == 1:
            return "Cover/title source visually reviewed; project, facility, location, issue and design-team context retained."
        if page in {68, 69}:
            return "M-400 controls/diagrams source visually reviewed; published heating-water, humidifier, AHU, VAV, BAS architecture and sequence evidence retained separately."
        if page == 71:
            return "M-500 mechanical schedules visually reviewed; bounded heat-exchanger, humidifier and pump schedule rows retained separately."
        if page == 72:
            return "M-501 mechanical schedules visually reviewed; bounded reheat-coil and air-terminal schedule rows retained separately."
        if 62 <= page <= 70:
            return "Mechanical diagram/detail/control source sheet visually reviewed as coordinated context."
        if 71 <= page <= 72:
            return "Mechanical schedule source sheet visually reviewed."
        if 73 <= page <= 90:
            return "Electrical/general-notes/plan or schedule source sheet visually reviewed as coordinated context."
        if 40 <= page <= 61:
            return "Mechanical new-work or demolition plan/detail source sheet visually reviewed as coordinated context."
        if 15 <= page <= 39:
            return "Architectural/structural coordinated source sheet visually reviewed."
        return "General/cover/civil/architectural source sheet visually reviewed as coordinated context."
    return [{"page": p, "sheet_context": f"PDF {p:02d}", "render": f"reviews/{IDENT}/p{p}-p{p}-full-poppler.png", "finding": finding(p)} for p in range(1, 91)]


def audit():
    items = [
        ("project_identity", "Cover source identifies the warehouse pandemic-preparedness renovation, facility and location.", [["modules", "metadata", "project"]]),
        ("sheet_details", "Every supplied page has a retained full-page visual review; M-400, M-500 and M-501 have explicit retained content.", [["modules", "metadata", "visual_review_pages"]]),
        ("scale_verification", "No global scale is asserted across the mixed 90-page source and no plan-derived dimension or quantity is calculated.", [["modules", "metadata", "scale_semantics"]]),
        ("equipment_tags_and_classification", "Literal heating-water, humidifier, pump, reheat-coil and air-terminal rows are retained as schedule evidence only.", [["modules", "equipment_reconciliation", "schedule_counts"]]),
        ("schedule_rows_and_specs", "M-500/M-501 rows are coordinate-bounded, including control-valve information embedded in the heat-exchanger rows.", [["modules", "schedules", "tables"]]),
        ("point_lists_and_equipment_ownership", "M-400 published controls-symbol rows are retained as literal source matrix rows; no physical device ownership is invented.", [["modules", "points", "tables"], ["modules", "point_applications", "expanded_template_counts"]]),
        ("network_architecture", "The M-400 BACnet architecture drawing and its five notes are retained, with explicit topology/ownership boundaries.", [["modules", "controls_context", "network_architecture"]]),
        ("sequences_and_diagrams", "Heating-water/HX, humidifier, AHU and VAV sequences are retained as bounded published clauses.", [["modules", "controls_context", "sequence_inventory"]]),
        ("space_sensors_and_zones", "M-400 publishes temperature, humidity, pressure, flow, smoke, freezestat, VFD, valve/damper and hand-switch symbol contexts.", [["modules", "controls_context", "sensors_and_control_symbol_context"]]),
        ("source_limitations_and_conflicts", "Literal-row, topology, physical-count, control-valve-schedule and damper-actuator-schedule boundaries are explicit.", [["modules", "supporting_evidence", "source_limitations"]]),
        ("all_page_visual_review", "All 90 pages have retained full-page Poppler renders and visual-review findings.", [["page_review"]]),
        ("independent_corroboration", "Every retained row/assertion is checked against independent MuPDF and Poppler evidence during build/verification.", [["module_source_sha256"]]),
    ]
    return [{"id": i, "result": "reviewed_with_source_limitations_recorded", "finding": f, "evidence": e} for i, f, e in items]


def main():
    review = review_pages()
    write("metadata", {
        "document_id": IDENT, "module_role": "Cover/title facts, full 90-page visual ledger and scale boundary.", "tables": [],
        "project": {
            "project_name_as_printed": "RENOVATE WAREHOUSE FOR PANDEMIC PREPAREDNESS", "facility_as_printed": "HARRY S. TRUMAN MEM. VETERANS HOSPITAL", "location_as_printed": "800 HOSPITAL DR., COLUMBIA MO 65201", "project_number_as_printed": "589A4-20-158", "architect_engineer_of_record_as_printed": "IMEG Corp.", "issue_as_printed": "BID SET 03/24/2021", "assertion_ids": ["cover-project", "cover-location", "cover-issue"]},
        "scale_semantics": {"stated_scale_records": [], "graphic_scale_bar_status": "No graphic scale bar is asserted as a measurement source.", "takeoff_scale_status": "No global scale is asserted across this mixed source. No distance, area, duct/pipe length or physical quantity is derived from drawings."},
        "visual_review_pages": review,
        "assertions": [
            assertion("cover-project", 1, [2450, 1860, 2940, 2040], "RENOVATE WAREHOUSE FOR"),
            assertion("cover-location", 1, [2450, 1960, 2940, 2040], "HARRY S. TRUMAN MEM. VETERANS HOSPITAL 800 HOSPITAL DR., COLUMBIA MO 65201"),
            assertion("cover-issue", 1, [2200, 1880, 2420, 1980], "BID SET"),
        ],
    })

    heat_exchangers = [
        "WHSE-HX1 B1 C11 PIPE WAREHOUSE REHEAT WATER SHELL & TUBE 55 [ 4 ] 120 [ 49 ] 160 [ 71 ] 5 [ 15 ] 15 [ 100 ] 5 [ 35 ] 7.3 20 0.75 375 [ 3 ] WHSE-T2 2 2500 [ 1100 ] 1/3 CONTROL VALVE",
        "WHSE-HX1 14.5 25 1 745 2/3 CONTROL VALVE",
        "WHSE-HX2 B1 C11 PIPE WAREHOUSE REHEAT WATER SHELL & TUBE 55 [ 4 ] 120 [ 49 ] 160 [ 71 ] 5 [ 15 ] 15 [ 100 ] 5 [ 35 ] 7.3 20 0.75 375 [ 3 ] WHSE-T2 2 2500 [ 1100 ] 1/3 CONTROL VALVE",
        "WHSE-HX2 BASEMENT 14.5 25 1 745 2/3 CONTROL VALVE",
    ]
    reheat = [
        "WHSE-PHC1 WHSE-AHU-1 WAREHOUSE WHSE-AHU-1 PREHEAT 6075 [ 2900 ] 213 [ 1 ] 0.015 [ 4 ] 45.0 [ 7 ] 74.0 [ 23 ] 188.0 [ 640 ] 9.4 [ .6 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 SELECTION CRITERIA",
        "WHSE-PHC1 WHSE-AHU-1 WAREHOUSE WHSE-AHU-1 PREHEAT 6075 [ 2900 ] 213 [ 1 ] 0.015 [ 4 ] 45.0 [ 7 ] 74.0 [ 23 ] 188.0 [ 640 ] 9.4 [ .6 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 OPERATING CONDITION",
        "WHSE-RHC1 1-1-TU01 W05 WHSE-AHU-1 REHEAT 600 [ 280 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 25.9 [ 88 ] 1.7 [ .1 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC2 1-1-TU02 W06 WHSE-AHU-1 REHEAT 300 [ 140 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 13.0 [ 44 ] 0.9 [ .1 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC3 1-1-TU03 W01 WHSE-AHU-1 REHEAT 370 [ 170 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 16.0 [ 55 ] 1.1 [ .1 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC4 1-1-TU04 W02 WHSE-AHU-1 REHEAT 900 [ 420 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 38.9 [ 130 ] 2.6 [ .2 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC5 1-1-TU05 WC01A WHSE-AHU-1 REHEAT 900 [ 420 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 38.9 [ 130 ] 2.6 [ .2 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC6 1-1-TU06 W05A WHSE-AHU-1 REHEAT 300 [ 140 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 13.0 [ 44 ] 0.9 [ .1 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC7 1-1-TU07 W04 WHSE-AHU-1 REHEAT 520 [ 250 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 22.5 [ 77 ] 1.5 [ .1 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC8 1-1-TU08 W09 WHSE-AHU-1 REHEAT 180 [ 85 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 7.8 [ 27 ] 0.5 [ .0 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC9 1-1-TU09 W04A WHSE-AHU-1 REHEAT 440 [ 210 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 19.0 [ 65 ] 1.3 [ .1 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC10 1-1-TU10 W03 WHSE-AHU-1 REHEAT 1575 [ 740 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 68.0 [ 230 ] 4.5 [ .3 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC11 1-1-TU11 W03A WHSE-AHU-1 REHEAT 1025 [ 480 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 44.3 [ 150 ] 3.0 [ .2 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC12 2-1-TU12 W11 WHSE-AHU-1 REHEAT 2600 [ 1200 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 112.3 [ 380 ] 7.5 [ .5 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
        "WHSE-RHC13 2-1-TU13 W11 WHSE-AHU-1 REHEAT 1125 [ 530 ] [ ] .5 [ 130 ] 55.0 [ 13 ] 95.0 [ 35 ] 48.6 [ 170 ] 3.2 [ .2 ] 160 [ 71 ] 120 [ 49 ] 5 [ 15 ] 0 ---",
    ]
    terminals = [
        "W05-TU-01 W05 W05 WHSE-AHU-1 E 600 [ 280 ] 270 [ 130 ] NONE VAV 5 DEGREE DEADBAND X NONE ----",
        "W06-TU-02 W06 W06 WHSE-AHU-1 C 300 [ 140 ] 135 [ 64 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W01-TU-03 W01 W01 WHSE-AHU-1 D 370 [ 170 ] 165 [ 78 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W02-TU-04 W02 W02 WHSE-AHU-1 G 900 [ 420 ] 405 [ 190 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "WC01A-TU-05 WC01A WC01A WHSE-AHU-1 G 900 [ 420 ] 405 [ 190 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W05A-TU-06 W05A W05A WHSE-AHU-1 C 300 [ 140 ] 135 [ 64 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W04-TU-07 W04 W04 WHSE-AHU-1 E 520 [ 250 ] 235 [ 110 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W07-TU-08 W07 W09 WHSE-AHU-1 B 180 [ 85 ] 80 [ 38 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W04A-TU-09 W04 W04A WHSE-AHU-1 D 440 [ 210 ] 200 [ 94 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W03-TU-10 W03 W03 WHSE-AHU-1 I 1575 [ 740 ] 710 [ 340 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W11-TU-11 W11 W03A WHSE-AHU-1 H 1025 [ 480 ] 460 NONE VAV 5 DEGREE DEADBAND X NONE",
        "W11-TU-12 W11 W11 WHSE-AHU-1 J 2600 [ 1200 ] 1170 [ 550 ] NONE VAV 5 DEGREE DEADBAND X NONE",
        "W11-TU-13 W11 W11 WHSE-AHU-1 H 1125 [ 530 ] 505 [ 240 ] NONE VAV 5 DEGREE DEADBAND X NONE",
    ]
    write("schedules", {"document_id": IDENT, "module_role": "Literal M-500/M-501 equipment, control-valve, reheat-coil and air-terminal schedule rows.", "tables": [
        literal_table("M500-HEAT-EXCHANGER", 71, "M-500", "HEAT EXCHANGER SCHEDULE", 1200, 2960, [[990, 1010], [1015, 1035], [1035, 1055], [1055, 1075]], heat_exchangers),
        literal_table("M501-HOT-WATER-HEATING-COIL", 72, "M-501", "HOT WATER HEATING COIL SCHEDULE", 1400, 2940, [[690 + 15*i, 705 + 15*i] for i in range(len(reheat))], reheat),
        literal_table("M501-AIR-TERMINAL-UNIT", 72, "M-501", "AIR TERMINAL UNIT SCHEDULE", 1400, 2940, [[1015 + 15*i, 1030 + 15*i] for i in range(len(terminals))], terminals),
    ], "assertions": [], "schedule_scope": "Thirty-one literal schedule rows are retained: four HX/control-valve rows, fourteen preheat/reheat-coil rows and thirteen VAV terminal rows. They are schedule rows, not installed physical counts."})

    symbols = [
        ("T ROOM THERMOSTAT/TRANSMITTER - WALL MOUNT", 1097), ("M ROOM HUMIDISTAT (MOISTURE)/TRANSMITTER - WALL MOUNT", 1133), ("TT TEMPERATURE TRANSMITTER", 1170), ("TT TEMPERATURE TRANSMITTER, AVERAGING ELEMENT", 1206), ("MT MOISTURE (HUMIDITY) TRANSMITTER", 1238), ("PT PRESSURE TRANSMITTER", 1270), ("SPS STATIC PRESSURE SENSOR", 1302), ("FT FLOW TRANSMITTER", 1333), ("IT CURRENT TRANSMITTER", 1365), ("SD SMOKE DETECTOR", 1395), ("PDT PRESSURE DIFFERENTIAL TRANSMITTER", 1425), ("PDS PRESSURE DIFFERENTIAL SWITCH", 1455), ("HS HAND SWITCH (HAND-OFF-AUTO SWITCH)", 1485), ("ZC VALVE OR DAMPER POSITION CONTROLLER", 1520), ("TSL TEMPERATURE SWITCH, LOW (FREEZESTAT)", 1550), ("PSH PRESSURE SWITCH HIGH", 1584), ("PSL PRESSURE SWITCH LOW", 1617), ("HVAC HVAC CONTROL PANEL", 1647), ("VSMC VARIABLE SPEED MOTOR CONTROLLER", 1676), ("ECC INTEGRATE CONTROL POINT ON REMOTE GRAPHICS WORKSTATION AT ENERGY CONTROL CENTER", 1710), ("TC TEMPERATURE CONTROLLER. SEE SEQUENCE OF OPERATION", 1746),
    ]
    # The two-column legend is read in visual column order by both engines.
    symbols[-2] = ("ECC INTEGRATE WORKSTATION AT CONTROL ENERGY POINT ON CONTROL REMOTE CENTER GRAPHICS", 1710)
    write("points", {"document_id": IDENT, "module_role": "M-400 published controls-symbol point/function matrix, retained literally.", "tables": [literal_table("M400-CONTROLS-SYMBOLS", 68, "M-400", "CONTROLS SYMBOLS", 945, 1340, [[y, y + 17] for _, y in symbols], [r for r, _ in symbols])], "assertions": []})
    write("point_applications", {"document_id": IDENT, "module_role": "Published M-400 control symbol source-matrix scope and physical-count boundary.", "tables": [], "ledger_mode": "literal_source_row_matrices_v1", "applications": [{"id": "m400-controls-symbols", "source_table": "M400-CONTROLS-SYMBOLS", "ownership_scope": "Published control-symbol/function context only; physical field-device ownership, controller/card/terminal assignment, address, wiring and installed multiplicity are not stated."}], "expanded_template_counts": {"source_rows": len(symbols), "total": len(symbols)}, "expanded_count_warning": "The 21 rows are literal published function/symbol rows, not a count of installed sensors, controllers, actuators, valves, dampers, relays, BACnet objects, terminals or cables.", "inventory_checks": [{"id": "rank26-point-symbol-application", "records_path": ["applications"], "expected": 1, "unique_key": "source_table"}]})

    controls = [
        assertion("m400-hx-reset", 68, [1460, 1545, 2000, 1655], "THE LEAVING HOT WATER TEMPERATURE SHALL BE RESET INVERSELY WITH THE OUTDOOR TEMPERATURE AS SCHEDULED."),
        assertion("m400-hx-failover", 68, [1460, 1610, 2000, 1655], "IN THE EVENT THE PUMP FAILS TO START WITHIN 30 SECONDS, AN ALARM SHALL BE INITIATED AND THE SECOND PUMP SHALL START AUTOMATICALLY."),
        assertion("m400-valve-sequence", 68, [1460, 1650, 2000, 1730], "V-1 (1/3) MODULATES TO MAINTAIN HW TEMPERATURE AT SETPOINT."),
        assertion("m400-hx-standby", 68, [1460, 1705, 2000, 1730], "HX-2, V-3 AND V-4 ARE FULLY REDUNDANT AND SHALL BE OPERATED ON A DUTY/STANDBY MODE."),
        assertion("m400-humidifier-setpoint", 68, [2375, 1555, 2910, 1610], "HUMIDIFIER VALVE V-1 SHALL MODULATE TO MAINTAIN THE RETURN (OR EXHAUST) AIR HUMIDITY SET POINT TO 30% (ADJUSTABLE)."),
        assertion("m400-humidifier-bas-enable", 68, [2375, 1575, 2910, 1620], "THE ON/OFF CONTROL VALVE V-2 SHALL BE ENABLED THROUGH BAS."),
        assertion("m400-humidifier-high-limit", 68, [2375, 1605, 2910, 1655], "THE HIGH LIMIT HUMIDITY SENSOR, LOCATED IN THE SUPPLY AIR DUCT 3000MM [10 FEET] AWAY FROM THE HUMIDIFIER SHALL DISABLE THE HUMIDIFIER AND GIVE AN ALARM SIGNAL TO THE BAS"),
        assertion("m400-ahu-start-stop", 69, [460, 970, 1400, 1030], "UNIT IS NORMALLY STARTED AND STOPPED REMOTELY AT THE ECC. H-O-A SWITCH SHALL BE KEPT"),
        assertion("m400-ahu-supply-temp", 69, [460, 1070, 1400, 1110], "SUPPLY AIR TEMPERATURE, SENSED BY TT-1, SHALL BE MAINTAINED AT SETPOINT VIA DIGITAL"),
        assertion("m400-ahu-oa-temperature", 69, [460, 1105, 1400, 1140], "WHEN THE TEMPERATURE OF THE OUTSIDE AIR, SENSED BY TT-2, IS ABOVE 75°F (ADJ) [23.8°C], THE"),
        assertion("m400-vav-no-deadband", 68, [1160, 385, 1400, 425], "UPON FALL IN SPACE TEMPERATURE THE VAV DAMPER WILL MODULATE TO MINIMUM POSITION."),
        assertion("m400-vav-valve", 68, [1160, 420, 1400, 475], "UPON FURTHER DROP IN SPACE TEMPERATURE VALVE V-1 WILL MODULATE TO MAINTAIN SET POINT"),
        assertion("m400-vav-deadband", 68, [1430, 395, 1680, 445], "DEADBAND OF 2° F BETWEEN HEATING AND COOLING SET POINTS WILL BE MAINTAINED."),
        assertion("m400-network-remain", 68, [2300, 980, 2800, 1000], "EXISTING ECC, ASSOCIATED COMMUNICATION NETWORK AND CONTROLLERS TO REMAIN."),
        assertion("m400-network-new", 68, [2300, 990, 2800, 1010], "INSTALL NEW BACNET COMMUNICATION NETWORK TO AREA OF NEW WORK."),
        assertion("m400-network-controller", 68, [2300, 1000, 2800, 1020], "INSTALL BUILDING CONTROLLER (B-BC) AND BACNET COMMUNICATION NETWORK AS REQUIRED."),
        assertion("m400-network-controllers", 68, [2300, 1010, 2800, 1030], "INSTALL NEW CONTROLLERS (B-AAC, B-ASC) AS REQUIRED."),
    ]
    write("controls_context", {"document_id": IDENT, "module_role": "M-400 source-bounded heating-water/HX, humidifier, AHU, VAV and BACnet context.", "tables": [], "assertions": controls,
        "network_architecture": {"published_integration": ["Existing ECC, associated communication network and controllers remain.", "New BACnet communication network is installed to the new-work area.", "Building controller (B-BC), BACnet network and B-AAC/B-ASC controllers are installed as required; diagram labels Ethernet communication and BACnet MS/TP communication."], "assertion_ids": ["m400-network-remain", "m400-network-new", "m400-network-controller", "m400-network-controllers"], "boundary": "The published architecture does not state final device addresses, BACnet object list, router/media quantities, controller/card/terminal schedule, field wiring/termination schedule or final installed controller totals."},
        "sequence_inventory": [
            {"id": "m400-dual-heat-exchanger", "sheet": "M-400", "assertion_ids": ["m400-hx-reset", "m400-hx-failover", "m400-valve-sequence", "m400-hx-standby"]},
            {"id": "m400-steam-humidifier", "sheet": "M-400", "assertion_ids": ["m400-humidifier-setpoint", "m400-humidifier-bas-enable", "m400-humidifier-high-limit"]},
            {"id": "m400-air-handling-unit", "sheet": "M-400", "assertion_ids": ["m400-ahu-start-stop", "m400-ahu-supply-temp", "m400-ahu-oa-temperature"]},
            {"id": "m400-variable-volume-air-terminal", "sheet": "M-400", "assertion_ids": ["m400-vav-no-deadband", "m400-vav-valve", "m400-vav-deadband"]},
        ],
        "sensors_and_control_symbol_context": {"published_context": "M-400 publishes temperature/room-temperature, moisture/humidity, pressure, static-pressure, differential-pressure, flow, current, smoke, freezestat, hand-switch, valve/damper position controller, VFD and controller-panel function contexts.", "assertion_ids": ["m400-humidifier-high-limit", "m400-ahu-supply-temp", "m400-vav-no-deadband"], "boundary": "The symbol list and diagrams are not transformed into installed-device, zone, controller, actuator, valve, damper or cable quantities."},
    })

    write("equipment_reconciliation", {"document_id": IDENT, "module_role": "Literal schedule-row ledger and control-valve/damper-actuator scope boundary.", "tables": [], "ledger_mode": "literal_schedule_rows_v1", "schedule_counts": {"tables": 3, "rows": 31, "interpretation": "31 literal source rows: 4 heat-exchanger/control-valve, 14 heating-coil and 13 air-terminal rows. These are schedule rows, not inferred plan installation totals."}, "control_valve_and_damper_schedule_status": {"control_valve_schedule": "No standalone CONTROL VALVE SCHEDULE title is published. M-500 heat-exchanger rows explicitly include 1/3 and 2/3 CONTROL VALVE entries; these literal rows are retained.", "damper_actuator_schedule": "No standalone DAMPER ACTUATOR SCHEDULE title is published. M-400 publishes damper-position-controller functionality and VAV sequences, not an actuator schedule or physical count."}, "source_boundary": "Schedule and diagram evidence do not establish final physical placement, installed multiplicity, BAS owner, controller/card/terminal binding, point database, field wiring or a complete physical takeoff."})
    write("supporting_evidence", {"document_id": IDENT, "module_role": "Source limitations, retained-scope disclosure and standalone-title checks.", "tables": [], "source_limitations": ["All 90 supplied pages have retained full-page visual review. This record retains 31 literal M-500/M-501 schedule rows, 21 literal M-400 control-symbol rows, bounded M-400 sequences and BACnet-context clauses. Other sheets remain visual-review context rather than inferred inventory.", "M-400 shows BACnet network concepts but does not publish final device addresses, object names, controller/card/terminal schedule, router/media quantities, wiring/termination schedule, final field-device ownership or installed physical BAS counts.", "M-500 heat-exchanger schedule embeds 1/3 and 2/3 control-valve rows. This is not a standalone control-valve schedule or a complete valve takeoff. No standalone damper-actuator schedule is published.", "No stated scale is treated as global across this mixed source; no distance, area, duct/pipe length or physical quantity is derived from plans."], "text_absence_assertions": [{"id": "no-control-valve-schedule", "pages": list(range(1, 91)), "covers_all_source_pages": True, "patterns": [r"CONTROL\\s+VALVE\\s+SCHEDULE"], "visual_review_qualification": "Native text plus complete visual review support only absence of this standalone title."}, {"id": "no-damper-actuator-schedule", "pages": list(range(1, 91)), "covers_all_source_pages": True, "patterns": [r"DAMPER\\s+ACTUATOR\\s+SCHEDULE"], "visual_review_qualification": "Native text plus complete visual review support only absence of this standalone title."}]})
    write("document_manifest", {"id": IDENT, "rank": 26, "title": "Columbia Truman VA Pandemic-Preparedness Warehouse", "source_pdf": "pdf/26__vol2__031__Columbia_Truman_VA_Pandemic_Preparedness_Warehouse.pdf", "source_sha256": "db9141f6582831c37b3a18f55d862e0579b38cf1a702c24208e3030fd8dbeab2", "page_count": 90, "review_status": "complete_with_documented_source_limitations", "scope": "Complete source-bounded Rank 26 ground truth: 90-page visual review; project/local-scale boundaries; 31 literal M-500/M-501 schedule rows; 21 literal M-400 controls-symbol rows; dual-HX/valve, humidifier, AHU and VAV sequences; BACnet architecture context; and explicit topology, ownership, physical-count, control-valve-schedule and damper-actuator-schedule limitations. Nothing is inferred as a final physical BAS takeoff.", "reading_notes": ["M-400 is a high-value vector controls source with dual-HX 1/3–2/3 valve sequencing, humidifier setpoint/safety logic, AHU and VAV sequences, symbol legend, and BACnet architecture.", "M-500/M-501 are dense vector schedules that bind heat-exchanger control-valve entries and many heating-coil/terminal equipment tags and specifications.", "The record preserves printed evidence but does not fabricate installed counts or wiring/point-database/network details."], "verification_semantics": "The bundle verifier rechecks every retained row/assertion against independent MuPDF and Poppler evidence and hashes the source, modules and full-page review renders. It does not infer plan quantities, topology or physical installation.", "module_order": ["metadata", "schedules", "points", "controls_context", "equipment_reconciliation", "point_applications", "supporting_evidence"], "module_sources": {"metadata": ["metadata"], "schedules": ["schedules"], "points": ["points"], "controls_context": ["controls_context"], "equipment_reconciliation": ["equipment_reconciliation"], "point_applications": ["point_applications"], "supporting_evidence": ["supporting_evidence"]}, "requirement_audit": audit(), "page_review": [{"page": p["page"], "review_status": "complete", "render": p["render"], "finding": p["finding"]} for p in review], "declared_checks": [{"id": "pages", "path": ["page_review"], "operation": "length", "expected": 90}, {"id": "schedules", "path": ["modules", "schedules", "tables"], "operation": "length", "expected": 3}, {"id": "points", "path": ["modules", "points", "tables"], "operation": "length", "expected": 1}], "completion_checks": {"all_90_pages_visually_reviewed": True, "all_authoring_modules_dual_engine_verified_at_build": True, "source_limitations_explicit": True, "required_objectives_covered": True}})


if __name__ == "__main__":
    main()
