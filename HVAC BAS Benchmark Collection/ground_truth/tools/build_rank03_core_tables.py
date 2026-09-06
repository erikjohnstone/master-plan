"""Write manually transcribed core tables for Colville rank 03.

This is deliberately an annotation fixture, not a PDF extraction path. All
grid bounds and literal values below were read from the two captured pages and
visually audited before being committed here. It writes only authored JSON
annotation modules consumed by the normal independent-engine verifier.
"""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "03__vol1__27"
IDENT = "03__vol1__27"


def rows(*cells):
    assert all("|" not in cell for cell in cells), cells
    return "|".join(cells)


def around(centers, radius):
    return [[round(center - radius, 4), round(center + radius, 4)] for center in centers]


def mid_ranges(centers, lower, upper):
    return [[round(lower if index == 0 else (centers[index - 1] + center) / 2, 4),
             round(upper if index == len(centers) - 1 else (center + centers[index + 1]) / 2, 4)]
            for index, center in enumerate(centers)]


instrumentation_centers = [
    151.90, 187.42, 222.76, 258.22, 294.52, 334.60, 377.62, 416.92,
    452.32, 487.78, 526.96, 569.98, 613.00, 656.02, 691.90, 714.70,
    731.56,
]
instrumentation_rows = [
    rows("PIT-113", "PRESSURE", "CAW", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIG", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("PIT-114", "PRESSURE", "TAW", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIG", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("PIT-115", "PRESSURE", "EFFLUENT", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIG", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("PIT-116", "PRESSURE", "EFFLUENT", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIG", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("TE-100", "TEMPERATURE", "EFFLUENT", '4" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "1"),
    rows("TE-105", "TEMPERATURE", "TAW", '1/2" ON 4" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "1"),
    rows("TE-110", "TEMPERATURE", "TAW", '1/2" ON 4" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "1"),
    rows("DPIT-117", "PRES. DIFF.", "HWS", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIA", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("PIT-221", "PRESSURE", "EWS", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIG", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("PIT-222", "PRESSURE", "HWS", '1/4" MNPT', "PIEZO-RESISTIVE", "125", "0-125", "PSIG", "4-20 mA", "ROSEMOUNT 1151", "3"),
    rows("TE-101", "TEMPERATURE", "EWS", '1/2" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "2"),
    rows("TE-102", "TEMPERATURE", "EWS", '1/2" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "2"),
    rows("TE-103", "TEMPERATURE", "HWS", '1/2" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "2"),
    rows("TE-104", "TEMPERATURE", "HWS", '1/2" MNPT', "RTD", "125", "0-150", "F", "1000 OHM RTD", "DWYER SERIES T TEMPERATURE SENSOR ASSEMBLY", "2"),
    rows("TE-300", "TEMPERATURE", "OUTDOOR AIR", "NA NA", "THERMISTER", "0", "-40 TO 250", "F", "10 kOHM", "DWYER SERIES O-4", "2"),
    rows("FIT-143", "FLOW", "CAW", '6" CL 150 FLG', "TURBINE", "125", "0-500", "GPM", "4-20 mA", "SEAMETRICS WTP109-600-18", "3"),
    rows("FIT-145", "FLOW", "TAW", '4" CL 150 FLG', "TURBINE", "125", "0-200", "GPM", "4-20 mA", "SEAMETRICS WTP109-400-18", "3"),
]

valve_rows = [
    rows("TCV-105", "BELIMO G780+ EVX24-SR", "HWS", "125", "130 F", "133", '3"', "85 LINEAR", "3-WAY MIXING, GLOBE", "Ni PLATED BRASS, EPDM", "CL 125 FF FLANGE", "24 VDC", "5", "7.5", "90", "MODULATING", "YES", "LAST POSITION", "YES", "NORMALLY CLOSED, 4-20 mA POSITION FEEDBACK TO PLC"),
    rows("TCV-110A", "BELIMO B2050QPW-N+ LRB24-SR-T", "CAW POTABLE", "125", "60 F", "11", '1/2"', "32 NONE", "2-WAY BALL", "LEAD FREE BRASS, EPDM", "FNPT", "24 VDC", "1.5", "3", "90", "MODULATING", "NO", "LAST POSITION", "YES", "NORMALLY CLOSED, 4-20 mA POSITION FEEDBACK TO PLC. PROVIDE VALVE STEM ADAPTER."),
    rows("TCV-110B", "BELIMO B2050QPW-N+ LRB24-SR-T", "CAW POTABLE", "125", "60 F", "11", '1/2"', "32 NONE", "2-WAY BALL", "LEAD FREE BRASS, EPDM", "FNPT", "24 VDC", "1.5", "3", "90", "MODULATING", "NO", "LAST POSITION", "YES", "NORMALLY CLOSED, 4-20 mA POSITION FEEDBACK TO PLC. PROVIDE VALVE STEM ADAPTER."),
    rows("LCV-135", "BELIMO F680HD+ ARX24-3", "EFFLUENT", "125", "60 F", "265", '3"', "302 NONE", "BUTTERFLY", "DUCTILE IRON, EPDM", "WAFER, CL 125", "24 VDC", "6", "11", "75", "2-POSITION", "NO", "LAST POSITION", "YES", "NORMALLY CLOSED"),
]

schedules = {
    "document_id": IDENT,
    "module_role": "Cell-for-cell core M-603 schedule ledger. It deliberately retains source spellings, merged header semantics and literal values; nothing is inferred from a P&ID or a generic controls convention.",
    "source_sheet": "M-603",
    "source_page": 15,
    "tables": [
        {
            "id": "M603-INSTRUMENTATION",
            "page": 15,
            "sheet": "M-603",
            "title": "INSTRUMENTATION SCHEDULE",
            "classification": "Literal instrumentation schedule rows",
            "columns": "tag|function|service|connection|type|pressure_psig|operating_range|units|interface|basis_of_design_manufacturer_model|remarks",
            "x_edges": [185, 235, 315, 374, 476, 570, 626, 699, 747, 820, 1042, 1190],
            "y_ranges": mid_ranges(instrumentation_centers, 127, 744),
            "rows": instrumentation_rows,
            "header_evidence": [{
                "bbox": [180, 65, 1195, 130],
                "expected": "INSTRUMENTATION SCHEDULE TAG FUNCTION SERVICE CONNECTION TYPE PRESSURE OPERATING RANGE UNITS INTERFACE BASIS OF DESIGN MANUFACTURER AND MODEL REMARKS",
            }],
        },
        {
            "id": "M603-CONTROL-VALVES",
            "page": 15,
            "sheet": "M-603",
            "title": "CONTROL VALVE SCHEDULE",
            "classification": "Literal BAS control-valve/actuator schedule rows",
            "columns": "tag|manufacturer_model|fluid|pressure_psig|temperature|flow_gpm|size_nps|cv_characteristic|valve_pattern|valve_material|connection|power|watts|va|actuator_time_s|actuator_action|position_feedback|fail_position|override|comments",
            "x_edges": [940, 980, 1080, 1137, 1182, 1236, 1292, 1336, 1380, 1432, 1495, 1565, 1618, 1661, 1700, 1740, 1810, 1870, 1930, 1965, 2165],
            "y_ranges": [[1205, 1260], [1260, 1326], [1326, 1387], [1387, 1450]],
            "rows": valve_rows,
            "header_evidence": [{
                "bbox": [930, 1120, 2165, 1210],
                "expected": "CONTROL VALVE SCHEDULE TAG MANUFACT MODEL SERVICE VALVE ACTUATOR POWER POSITION FEEDBACK FAIL POSITION OVER RIDE COMMENTS",
            }],
        },
        {
            "id": "M603-PUMP-SCHEDULE-MARKS",
            "page": 15,
            "sheet": "M-603",
            "title": "PUMP SCHEDULE",
            "classification": "Literal pump schedule tags. Shared vertical pump cells are deliberately not expanded into copied performance fields in this source-mark ledger.",
            "columns": "tag",
            "x_edges": [1180, 1250],
            "y_ranges": [[140, 175], [175, 210], [210, 242], [242, 277], [277, 310], [310, 344], [345, 405], [405, 455], [455, 512], [512, 560], [560, 605], [605, 640], [640, 675], [675, 708], [708, 740]],
            "rows": ["HWP-1", "HWP-2", "HWP-3", "HWP-4", "HWP-5", "HWP-6", "BP-1", "BP-2", "BP-3", "CP-1", "CP-2", "EP-1", "EP-2", "EP-3", "EP-4"],
            "header_evidence": [{"bbox": [1180, 65, 2165, 145], "expected": "PUMP SCHEDULE TAG SERVES MANUFACTURER MODEL TYPE FLOW HEAD MOTOR PUMP SPEED POWER REQUIREMENTS PROVIDE WITH VFD UNIT WT FLUID REMARKS"}],
            "source_layout_notes": "This registry establishes every printed pump tag. EP-1 and EP-2 share vertically merged model/type/weight cells in the source and are not normalized here by duplicating values into two physical rows.",
        },
        {
            "id": "M603-CHEMICAL-POT-FEEDERS",
            "page": 15,
            "sheet": "M-603",
            "title": "CHEMICAL POT FEEDER SCHEDULE",
            "classification": "Literal chemical pot feeder schedule rows",
            "columns": "tag|location|serves|make_model|fluid|tank_size_gal|pressure_rating_psi|weight_lbs|remark",
            "x_edges": [180, 225, 325, 450, 560, 630, 690, 770, 850, 1000],
            "y_ranges": [[880, 909], [909, 935]],
            "rows": [
                rows("PF-1", "MECH. RM.", "EVAPORATOR LOOP", "NEPTUNE/VTF-5HP", "WATER", "5", "300", "37", "EXISTING TO REMAIN."),
                rows("PF-2", "MECH. RM.", "CONDENSER LOOP", "NEPTUNE/VTF-5HP", "WATER", "5", "300", "37", "EXISTING TO REMAIN."),
            ],
            "header_evidence": [{"bbox": [180, 820, 1000, 880], "expected": "CHEMICAL POT FEEDER SCHEDULE TAG LOCATION SERVES MAKE MODEL FLUID TANK SIZE PRESSURE RATING WT REMARK"}],
        },
        {
            "id": "M603-AIR-SEPARATORS",
            "page": 15,
            "sheet": "M-603",
            "title": "AIR SEPARATOR SCHEDULE",
            "classification": "Literal air separator schedule rows",
            "columns": "tag|location|system|manufacturer_model|type|pipe_size_in|fluid|max_temp_f|flow_gpm|wpd_ft_wc|volume_gal|operating_weight_lbs|remarks",
            "x_edges": [180, 245, 325, 450, 550, 640, 680, 740, 785, 835, 880, 930, 980, 1050],
            "y_ranges": [[1018, 1056], [1056, 1095]],
            "rows": [
                rows("AS-1", "MECH. RM.", "EVAPORATOR LOOP", "FLAMCOVENT FSADS600N 150F", "COALESCING", '6"', "WATER", "110", "385", "0.7", "20.6", "285", ""),
                rows("AS-2", "MECH. RM.", "CONDENSOR LOOP", "FLAMCOVENT FSADS500N 125F", "COALESCING", '5"', "WATER", "110", "165", "0.3", "20.6", "275", ""),
            ],
            "header_evidence": [{"bbox": [180, 955, 1050, 1018], "expected": "AIR SEPARATOR SCHEDULE TAG LOCATION SYSTEM MANUFACTURER MODEL TYPE PIPE SIZE FLUID MAX TEMP FLOW WPD VOL OPER WT REMARKS"}],
        },
        {
            "id": "M603-LOUVERS",
            "page": 15,
            "sheet": "M-603",
            "title": "LOUVER SCHEDULE",
            "classification": "Literal louver schedule rows",
            "columns": "tag|serves|manufacturer_model|material|frame_type|airflow_cfm|louver_size_wxh|face_area_sf|face_velocity_fpm|free_area_sf|free_area_velocity_fpm|pressure_drop_in_wc|drainable_blade|blade_angle_deg|frame_depth_in|weight_lbs|bottom_of_louver_elevation|notes",
            "x_edges": [1090, 1140, 1230, 1320, 1390, 1460, 1505, 1565, 1610, 1660, 1715, 1770, 1830, 1890, 1950, 2000, 2050, 2120, 2170],
            "y_ranges": [[955, 990], [990, 1025], [1025, 1065]],
            "rows": [
                rows("LV-1", "HATCHERY", "GREENHECK/ ECD-401", "ALUMINUM", "CHANNEL", "750", "18 x 22", "2.75", "273", "1.01", "743", "0.09", "YES", "45", "4", "6", "8'", "1,2,3"),
                rows("LV-2", "HATCHERY", "GREENHECK/ ECD-401", "ALUMINUM", "CHANNEL", "750", "18 x 22", "2.75", "273", "1.01", "743", "0.09", "YES", "45", "4", "6", "8'", "1,2,3"),
                rows("LV-3", "MECHANICAL ROOM", "GREENHECK/ ECD-401", "ALUMINUM", "CHANNEL", "480", "18 x 18", "2.25", "213", "0.75", "640", "0.07", "YES", "45", "4", "9", "8'", "1,2,3"),
            ],
            "header_evidence": [{"bbox": [1090, 890, 2170, 955], "expected": "LOUVER SCHEDULE TAG SERVES MANUFACTURER MODEL MATERIAL FRAME TYPE AIRFLOW LOUVER SIZE FACE AREA VELOCITY FREE AREA DRAINABLE BLADE ANGLE FRAME DEPTH WEIGHT BOTTOM ELEVATION NOTES"}],
        },
    ],
    "inventory_checks": [
        {"id": "m603-core-table-count", "records_path": ["tables"], "expected": 6, "unique_key": "id"},
    ],
}


# M-604 uses four independent schedule grids.  These are source cells, not
# calculations: for example the split-system schedule prints the voltage and
# phase in one physical cell, so this fixture retains that layout rather than
# manufacturing separate values.
unit_heater_rows = [
    rows(tag, location, model, orientation, supply_cfm, fan_rpm, drive, heating_mbh,
         eat_f, lat_f, ewt_f, lwt_f, coil_gpm, wpd_ft_wc, motor_hp, motor_volts,
         motor_phase, fla, unit_weight_lbs, remarks)
    for tag, location, model, orientation, supply_cfm, fan_rpm, drive, heating_mbh,
        eat_f, lat_f, ewt_f, lwt_f, coil_gpm, wpd_ft_wc, motor_hp, motor_volts,
        motor_phase, fla, unit_weight_lbs, remarks in [
        ("UH-01", "MAIN ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
        ("UH-02", "MAIN ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
        ("UH-03", "MAIN ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
        ("UH-04", "MAIN ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
        ("UH-05", "MAIN ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
        ("UH-06", "MAIN ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
        ("UH-07", "MECHANICAL ROOM", "STERLING/ HSB07211", "HORIZONTAL", "950", "1550", "DIRECT", "20.5", "50", "70", "120", "100", "2.5", "0.23", "1/20", "115", "1", "1.4", "50", "1"),
    ]
]

buffer_tank_rows = [
    rows("BT-1", "MAIN ROOM", "EVAPORATOR WATER LOOP", "AMTROL HWBT300-4/4-125", "WATER", "300", "12", "125", '(4) 4" CL 150 FLG', "3500", "SEE NOTES. ASME TANK. PROVIDE WITH ASME PRESSURE RELIEF VALVE. TANK IS FOR HEATING WATER THERMAL STORAGE."),
    rows("BT-2", "MAIN ROOM", "EVAPORATOR WATER LOOP", "AMTROL HWBT300-4/4-125", "WATER", "300", "12", "125", '(4) 4" CL 150 FLG', "3500", "SEE NOTES. ASME TANK. PROVIDE WITH ASME PRESSURE RELIEF VALVE. TANK IS FOR HEATING WATER THERMAL STORAGE."),
    rows("BT-3", "MAIN ROOM", "CONDENSER WATER LOOP", "AMTROL HWBT300-4/4-125", "WATER", "300", "12", "125", '(4) 4" CL 150 FLG', "3500", "SEE NOTES. ASME TANK. PROVIDE WITH ASME PRESSURE RELIEF VALVE. TANK IS FOR HEATING WATER THERMAL STORAGE."),
    rows("BT-4", "MAIN ROOM", "CONDENSER WATER LOOP", "AMTROL HWBT300-4/4-125", "WATER", "300", "12", "125", '(4) 4" CL 150 FLG', "3500", "SEE NOTES. ASME TANK. PROVIDE WITH ASME PRESSURE RELIEF VALVE. TANK IS FOR HEATING WATER THERMAL STORAGE."),
]

heat_exchanger_rows = [
    rows("HX-1A", '28" X 22"', "EVAPORATOR WATER HEATING", "AIC AT", "PLATE AND FRAME", "265", "5", "373", "5", "265", "60", "51.2", "45.8", "52", "338/1155", "689", "WASTEWATER, 100 MICRON FILTERED", "1, 3, 4, 5"),
    rows("HX-1B", '28" X 22"', "EVAPORATOR WATER HEATING", "AIC AT", "PLATE AND FRAME", "265", "5", "373", "5", "265", "60", "51.2", "45.8", "52", "338/1155", "689", "WASTEWATER, 100 MICRON FILTERED", "1, 3, 4, 5"),
    rows("HX-2A", '44" X 26"', "TAW HEATING", "AIC AT1100X-IS1-109/70-DW", "PLATE AND FRAME", "132", "5", "132", "5", "80", "74", "50", "48", "72", "464/1584", "3624", "AERATED WATER", "1, 2, 3, 4, 5"),
    rows("HX-2B", '44" X 26"', "TAW HEATING", "AIC AT1100X-IS1-109/70-DW", "PLATE AND FRAME", "132", "5", "132", "5", "80", "74", "50", "48", "72", "464/1584", "3624", "AERATED WATER", "1, 2, 3, 4, 5"),
]

m604_schedules = {
    "document_id": IDENT,
    "module_role": "Cell-for-cell M-604 equipment-schedule ledger. Values, including visibly combined or blank source cells, are retained as printed rather than completed from equipment knowledge.",
    "source_sheet": "M-604",
    "source_page": 16,
    "tables": [
        {
            "id": "M604-HYDRONIC-UNIT-HEATERS",
            "page": 16,
            "sheet": "M-604",
            "title": "HYDRONIC UNIT HEATER SCHEDULE",
            "classification": "Literal hydronic unit heater schedule rows",
            "columns": "tag|location|manufacturer_model|orientation|supply_flow_cfm|fan_high_speed_rpm|drive|heating_capacity_mbh|eat_f|lat_f|ewt_f|lwt_f|coil_flow_gpm|wpd_ft_wc|motor_hp|motor_volts|motor_phase|fla|unit_weight_lbs|remarks",
            "x_edges": [290, 365, 460, 580, 675, 720, 760, 818, 875, 908, 941, 973, 1004, 1055, 1100, 1140, 1190, 1215, 1244, 1290, 1360],
            "y_ranges": mid_ranges([376.15, 404.05, 431.95, 459.67, 487.57, 515.47, 543.19], 360, 555),
            "rows": unit_heater_rows,
            "header_evidence": [{"bbox": [285, 290, 1365, 360], "expected": "HYDRONIC UNIT HEATER SCHEDULE TAG LOCATION MANUFACTURER MODEL ORIENTATION SUPPLY FAN FLOW SPEED HEATING COIL MOTOR ELECTRICAL"}],
        },
        {
            "id": "M604-BUFFER-TANKS",
            "page": 16,
            "sheet": "M-604",
            "title": "BUFFER TANK SCHEDULE",
            "classification": "Literal buffer tank schedule rows",
            "columns": "tag|location|serves|manufacturer_model|fluid|tank_size_gal|fill_pressure_psi|maop_psi|connections|operating_weight_lbs|remarks",
            "x_edges": [210, 275, 365, 475, 600, 680, 740, 800, 860, 970, 1040, 1375],
            "y_ranges": [[700, 744.31], [744.31, 785.35], [785.35, 826.12], [826.12, 860]],
            "rows": buffer_tank_rows,
            "header_evidence": [{"bbox": [210, 640, 1375, 700], "expected": "BUFFER TANK SCHEDULE TAG LOCATION SERVES MANUFACTURER MODEL FLUID TANK SIZE FILL PRESS MAOP CONNECTIONS WEIGHT REMARKS"}],
        },
        {
            "id": "M604-HEAT-EXCHANGERS",
            "page": 16,
            "sheet": "M-604",
            "title": "HEAT EXCHANGERS",
            "classification": "Literal heat exchanger schedule rows",
            "columns": "tag|footprint|serves|manufacturer_model|type|hot_side_flow_gpm|hot_side_dp_psi|cold_side_flow_gpm|cold_side_dp_psi|minimum_flow_gpm|hot_side_in_f|hot_side_out_f|cold_side_in_f|cold_side_out_f|transfer_kw_mbh|unit_weight_lbs|fluid|remarks",
            "x_edges": [250, 295, 370, 465, 580, 680, 744, 785, 830, 875, 925, 970, 1025, 1075, 1135, 1185, 1230, 1330, 1400],
            "y_ranges": [[1048, 1086], [1086, 1120], [1120, 1149], [1149, 1180]],
            "rows": heat_exchanger_rows,
            "header_evidence": [{"bbox": [250, 970, 1400, 1050], "expected": "HEAT EXCHANGERS TAG FOOT PRINT SERVES MANUFACTURER MODEL TYPE HOT SIDE COLD SIDE MINIMUM FLOW TRANSFER UNIT WT FLUID REMARKS"}],
        },
        {
            "id": "M604-SPLIT-SYSTEM-AC",
            "page": 16,
            "sheet": "M-604",
            "title": "SPLIT-SYSTEM AIR CONDITIONING UNIT SCHEDULE",
            "classification": "Literal split-system air-conditioning schedule row",
            "columns": "indoor_tag|serves|indoor_model|indoor_cfm|indoor_unit_weight_lbs|outdoor_tag|outdoor_model|fan_motor_details|unit_power_volts_phase|mca|mocp|outdoor_unit_weight_lbs|heating_capacity_mbh|heating_min_hspf_47f|cooling_capacity_mbh|cooling_tons|eer",
            "x_edges": [930, 970, 1050, 1160, 1200, 1245, 1300, 1400, 1660, 1730, 1770, 1810, 1850, 1900, 1950, 2000, 2050, 2100],
            "y_ranges": [[130, 160]],
            "rows": [rows("FCU-1", "OFFICE, LAB", "LG/ LHN188HV1", "635", "", "CU-1", "LG/ LUU180HHV", "", "208-230 1", "22", "30", "150", "20.0", "9.2", "18.0", "2", "12.3")],
            "header_evidence": [{"bbox": [930, 75, 2100, 130], "expected": "INDOOR UNIT OUTDOOR UNIT HEATING CAPACITY COOLING CAPACITY"}],
            "source_layout_notes": "The printed VOLTS and PHASE fields share one source cell for FCU-1/CU-1, retained as unit_power_volts_phase. Empty physical schedule cells remain empty strings.",
        },
    ],
    "inventory_checks": [{"id": "m604-core-table-count", "records_path": ["tables"], "expected": 4, "unique_key": "id"}],
}


# M-601 contains both takeoff-relevant equipment schedules and a separate
# seismic-control ledger.  The latter is intentionally a one-cell mark ledger:
# it reports design restraint requirements, not installed equipment quantities,
# and therefore must never be used as a multiplier for the equipment schedule.
seismic_centers = [
    139.2685, 153.4884, 167.8884, 182.2884, 196.5084, 210.9085,
    225.3085, 239.5286, 253.9286, 268.3287, 282.5486, 296.9487,
    311.3487, 325.5687, 339.0686, 354.1886, 368.5888, 382.9887,
    397.3887, 411.7887, 426.0087, 440.4087, 454.8088, 469.0287,
    483.4288, 497.8288,
]
seismic_marks = [
    "ERV-1", "BT-1", "BT-2", "BT-3", "BT-4", "HX-1A", "HX-1B",
    "HX-2A", "HX-2B", "WSHP-1", "FTR-1", "AS-1", "AS-2",
    "DISTRIBUTED", "EP-1,2", "EP-3", "EP-4", "CP-1", "CP-2",
    "HWP-1", "HWP-2", "HWP-3", "HWP-4", "HWP-5", "HWP-6",
    "DISTRIBUTED",
]

m601_schedules = {
    "document_id": IDENT,
    "module_role": "Cell-for-cell M-601 schedule ledger. The seismic ledger is kept distinct from equipment schedules because a restraint-design row is not evidence of an installed-equipment quantity.",
    "source_sheet": "M-601",
    "source_page": 13,
    "tables": [
        {
            "id": "M601-SEISMIC-VIBRATION-LEDGER",
            "page": 13,
            "sheet": "M-601",
            "title": "SEISMIC AND VIBRATION CONTROL",
            "classification": "Literal seismic/vibration-control ledger marks; not a quantity or installation ledger",
            "columns": "mark",
            "x_edges": [600, 700],
            "y_ranges": around(seismic_centers, 6.4),
            "rows": seismic_marks,
            "header_evidence": [{"bbox": [600, 45, 1370, 130], "expected": "SEISMIC AND VIBRATION CONTROL TAG EQUIPMENT LEVEL RESTRAINTS FLEXIBLE CONNECTORS VIBRATION ISOLATORS DEFLECTION"}],
            "source_layout_notes": "DISTRIBUTED appears twice as printed (piping and mechanical-room exhaust duct). EP-1,2 is also a single printed shared mark. Neither is expanded into inferred equipment or placement counts.",
        },
        {
            "id": "M601-ENERGY-RECOVERY-VENTILATOR",
            "page": 13,
            "sheet": "M-601",
            "title": "ENERGY RECOVERY VENTILATOR SCHEDULE",
            "classification": "Literal ERV equipment schedule row",
            "columns": "tag|location|serves|manufacturer_model|supply_cfm|supply_esp_in_wc|supply_motor_bhp|supply_motor_hp|exhaust_cfm|exhaust_esp_in_wc|exhaust_motor_bhp|exhaust_motor_hp|cooling_eat|cooling_lat|cooling_sensible_effectiveness|heating_eat|heating_lat|heating_sensible_effectiveness|volts|phase|mca|mop|filter_count|filter_merv|filter_size_in|unit_weight_lbs|remarks",
            "x_edges": [770, 830, 915, 1028, 1142, 1186, 1230, 1275, 1300, 1345, 1388, 1430, 1460, 1506, 1560, 1620, 1677, 1729, 1790, 1837, 1860, 1895, 1926, 1955, 1990, 2056, 2100, 2155],
            "y_ranges": [[760, 795]],
            "rows": [rows("ERV-1", "HATCHERY", "OFFICE AND LAB VENTILATION", "GREENHECK/ MINIVENT-450-VG", "150", "0.35", "0.038", "1/4", "150", "0.35", "0.045", "1/4", "97.9 DB 67.6 WB", "78.9 DB 63.1 WB", "82.6%", "8.6 DB", "59.9 DB 47.9 WB", "83.1%", "120", "1", "7.1", "15", "1 1", "13 8", "14x20x2 14x20x2", "160", "1,2,3")],
            "header_evidence": [{"bbox": [770, 655, 2160, 760], "expected": "ENERGY RECOVERY VENTILATOR SCHEDULE TAG LOCATION SERVES MANUFACTURER SUPPLY FAN EXHAUST FAN HEAT EXCHANGER UNIT ELECTRICAL FILTERS UNIT WT REMARKS"}],
            "source_layout_notes": "The source prints the two filter MERV and size values vertically within shared physical cells; the literal cell text is retained as `13 8` and `14x20x2 14x20x2` rather than materializing two child records.",
        },
        {
            "id": "M601-FANS",
            "page": 13,
            "sheet": "M-601",
            "title": "FAN SCHEDULE",
            "classification": "Literal fan equipment schedule rows",
            "columns": "tag|serves|manufacturer_model|type|drive|flow_cfm|esp_in_wc|speed_rpm|bhp|motor_hp|motor_volts|motor_phase|fla|unit_weight_lbs|remarks",
            "x_edges": [680, 744, 823, 925, 1000, 1054, 1100, 1144, 1190, 1232, 1276, 1320, 1344, 1388, 1434, 1498],
            "y_ranges": [[965, 1000], [1000, 1035], [1035, 1073]],
            "rows": [
                rows("EF-1", "HATCHERY", "GREENHECK/ SE1-12-432-VG", "AXIAL WALL", "DIRECT", "750", "0.25", "1317", "0.09", "1/10", "115", "1", "2.85", "84", "1,2"),
                rows("EF-2", "HATCHERY", "GREENHECK/ SE1-12-432-VG", "AXIAL WALL", "DIRECT", "750", "0.25", "1317", "0.09", "1/10", "115", "1", "2.85", "84", "1,2"),
                rows("EF-3", "MECHANICAL ROOM", "GREENHECK/ SQ-90-VG", "INLINE", "DIRECT", "150/480", "0.15", "1282", "0.03", "1/10", "115", "1", "1.38", "48", "3"),
            ],
            "header_evidence": [{"bbox": [680, 900, 1500, 965], "expected": "FAN SCHEDULE TAG SERVES MANUFACTURER MODEL DESCRIPTION FAN PERFORMANCE MOTOR ELECTRICAL UNIT WT REMARKS"}],
        },
        {
            "id": "M601-GRILLES-REGISTERS-DIFFUSERS",
            "page": 13,
            "sheet": "M-601",
            "title": "GRILLES, REGISTERS, DIFFUSERS SCHEDULE",
            "classification": "Literal grille/register/diffuser type schedule rows",
            "columns": "tag|type|manufacturer_model|grille_size|neck_size|material|frame_style|finish|notes",
            "x_edges": [1530, 1570, 1650, 1765, 1845, 1906, 1980, 2050, 2120, 2170],
            "y_ranges": [[960, 993], [993, 1022], [1022, 1051], [1051, 1079], [1079, 1110]],
            "rows": [
                rows("1S", "SUPPLY", "GREENHECK/ XG-5750", "24x24", "6", "STEEL", "LAY-IN", "WHITE", "1,2"),
                rows("2S", "SUPPLY", "GREENHECK/ XG-5750", "24x24", "10", "STEEL", "LAY-IN", "WHITE", "1,2"),
                rows("1R", "RETURN", "GREENHECK/ XG-H4002R", "6x12", "-", "STEEL", "LAY-IN", "WHITE", "1,2"),
                rows("2R", "RETURN", "GREENHECK/ XG-H4002R", "12x16", "-", "STEEL", "LAY-IN", "WHITE", "1,2"),
                rows("1E", "EXHAUST", "GREENHECK/ XG-H4002R", "6x12", "-", "STEEL", "LAY-IN", "WHITE", "1,2"),
            ],
            "header_evidence": [{"bbox": [1530, 900, 2170, 960], "expected": "GRILLES REGISTERS DIFFUSERS SCHEDULE TAG TYPE MANUFACTURER MODEL GRILLE SIZE NECK SIZE MATERIAL FRAME STYLE FINISH NOTES"}],
        },
    ],
    "inventory_checks": [{"id": "m601-core-table-count", "records_path": ["tables"], "expected": 4, "unique_key": "id"}],
}


m602_schedules = {
    "document_id": IDENT,
    "module_role": "Cell-for-cell M-602 schedule ledger for the expansion tanks and filtration equipment. M-602's separately structured modular-chiller schedule is captured in its own module so its vertically merged assembly cells are not flattened into invented repetitions.",
    "source_sheet": "M-602",
    "source_page": 14,
    "tables": [
        {
            "id": "M602-EXPANSION-TANKS",
            "page": 14,
            "sheet": "M-602",
            "title": "EXPANSION TANK SCHEDULE",
            "classification": "Literal expansion tank schedule rows",
            "columns": "tag|location|system|manufacturer_model|type|system_volume_gal|low_temp_f|high_temp_f|required_tank_volume_gal|required_acceptance_volume_gal|fluid|charge_pressure_psig|operating_pressure_psig|maop_psig|connection_size_in|operating_weight_lbs|remarks",
            "x_edges": [470, 525, 600, 710, 840, 915, 975, 1035, 1100, 1165, 1240, 1325, 1390, 1450, 1510, 1575, 1625, 2170],
            "y_ranges": [[145, 188], [188, 229], [229, 270], [270, 312]],
            "rows": [
                rows("DT-1", "MAIN RM.", "BOOSTER PUMP DRAWDOWN", "ARMSTRONG FX-60", "BLADDER", "N/A", "48", "140", "16", "16", "WATER", "12", "45", "150", '1/2"', "175", "THIS TANK IS PART OF THE WATER BOOSTER PUMP BP-1 ASSEMBLY."),
                rows("ET-1", "MAIN RM.", "EVAPORATOR LOOP", "FLAMCO NEXP-023", "BLADDER", "1100", "40", "85", "23", "23", "WATER", "12", "30", "125", '1"', "420", "INSTALL WITH PRESSURE RELIEF VALVE, PRESSURE GAUGE, INTEGRITY MONITOR, AND AIR ACCESS VALVE."),
                rows("ET-2", "MAIN RM.", "CONDENSER LOOP", "FLAMCO NEXP-106", "BLADDER", "1100", "48", "158", "106", "106", "WATER", "12", "30", "125", '1 1/2"', "1200", "INSTALL WITH PRESSURE RELIEF VALVE, PRESSURE GAUGE, INTEGRITY MONITOR, AND AIR ACCESS VALVE."),
                rows("ET-3", "MAIN RM.", "TEMPERED WATER LOOP", "FLAMCO NEXP-023", "BLADDER", "300", "45", "95", "23", "23", "WATER", "12", "30", "125", '1"', "282", "POTABLE WATER COMPATIBLE BLADDER AND FITTINGS. INSTALL WITH PRESSURE RELIEF VALVE, PRESSURE GAUGE, INTEGRITY MONITOR, AND AIR ACCESS VALVE."),
            ],
            "header_evidence": [{"bbox": [470, 55, 2170, 145], "expected": "EXPANSION TANK SCHEDULE TAG LOCATION SYSTEM MANUFACTURER MODEL TYPE VOLUME FLUID CHARGE PRESS MAOP REMARKS"}],
        },
        {
            "id": "M602-WSHP-ASSEMBLY-TAG",
            "page": 14,
            "sheet": "M-602",
            "title": "MODULAR HEAT RECOVERY CHILLER SCHEDULE",
            "classification": "Literal chiller assembly tag in vertically merged source cell",
            "columns": "tag",
            "x_edges": [530, 590],
            "y_ranges": [[700, 740]],
            "rows": ["WSHP-1"],
            "source_layout_notes": "WSHP-1 is one printed assembly tag spanning the modular equipment and accessory schedule area. It is intentionally not repeated in the five module rows.",
        },
        {
            "id": "M602-WSHP-MODULES",
            "page": 14,
            "sheet": "M-602",
            "title": "MODULAR HEAT RECOVERY CHILLER SCHEDULE",
            "classification": "Literal modular heat-recovery chiller module rows; the assembly tag/location/service are separate vertically merged source cells",
            "columns": "module|merged_location_serves_source_cell|manufacturer_model|refrigerant_circuits_charge|load_side_ewt_f|load_side_gpm|source_side_ewt_f|source_side_gpm|cooling|heating_mbh|heating_kw_in|heating_lwt_f|full_load_kw_per_ton|full_load_eer|part_load_iplv_kw_per_ton|part_load_iplv_eer|volts|phase|fla|mca|mocp|unit_weight_lbs",
            "x_edges": [590, 650, 805, 950, 1060, 1126, 1170, 1224, 1265, 1330, 1378, 1425, 1482, 1537, 1573, 1628, 1664, 1716, 1730, 1780, 1820, 1860, 1900],
            "y_ranges": [[400, 456], [456, 511], [511, 566], [566, 621], [621, 676]],
            "rows": [
                rows("1", "", "WATER FURNACE T5HS030SN24AACHNN6 GCNNNSSS", "R-454B / 2 /10 LBS", "110", "39.9", "52", "97.4", "", "414.3", "32.88", "130.78", "0.752", "16.00", "0.575", "20.00", "480", "3", "49.50", "55.70", "80", "3,000"),
                rows("2", "", "WATER FURNACE T5HS030SN24AACHNN6 GCNNNSSS", "R-454B / 2 /10 LBS", "110", "39.9", "52", "97.4", "", "414.3", "32.88", "130.78", "0.752", "16.00", "0.575", "20.00", "480", "3", "49.50", "55.70", "80", "3,000"),
                rows("3", "AERATED MECHANICAL WATER ROOM HEATING", "WATER FURNACE T5HS030SN24AACHNN6 GCNNNSSS", "R-454B / 2 /10 LBS", "110", "39.9", "52", "97.4", "NA", "414.3", "32.88", "130.78", "0.752", "16.00", "0.575", "20.00", "480", "3", "49.50", "55.70", "80", "3,000"),
                rows("4", "", "WATER FURNACE T5HS030SN24AACHNN6 GCNNNSSS", "R-454B / 2 /10 LBS", "110", "39.9", "52", "97.4", "", "414.3", "32.88", "130.78", "0.752", "16.00", "0.575", "20.00", "480", "3", "49.50", "55.70", "80", "3,000"),
                rows("5", "", "WATER FURNACE T5HS030SN24AACHNN6 GCNNNSSS", "R-454B / 2 /10 LBS", "110", "39.9", "52", "97.4", "", "414.3", "32.88", "130.78", "0.752", "16.00", "0.575", "20.00", "480", "3", "49.50", "55.70", "80", "3,000"),
            ],
            "header_evidence": [{"bbox": [540, 325, 1900, 400], "expected": "MODULAR HEAT RECOVERY CHILLER SCHEDULE MODULE MANUFACTURER REFRIGERANT LOAD SIDE SOURCE SIDE CAPACITIES EFFICIENCY UNIT ELECTRICAL"}],
            "source_layout_notes": "The cooling field is a shared vertically centered `NA` cell, physically printed only in the module-3 row band. Blank module cells are kept blank rather than mechanically copied across all five rows.",
        },
        {
            "id": "M602-WSHP-ACCESSORIES",
            "page": 14,
            "sheet": "M-602",
            "title": "MODULAR HEAT RECOVERY CHILLER SCHEDULE — ACCESSORIES",
            "classification": "Literal WSHP accessory schedule rows",
            "columns": "accessory|manufacturer_model|description|volts|phase|fla|mca|mocp|remarks",
            "x_edges": [590, 730, 960, 1660, 1710, 1730, 1780, 1820, 1860, 2170],
            "y_ranges": [[775, 825], [825, 875], [875, 925], [925, 975], [975, 1050]],
            "rows": [
                rows("BYPASS HEADER KITS", "WATER FURNACE", "PIPE ASSEMBLY WITH BYPASS VALVE, WATER PRESSURE AND TEMPERATURE SENSORS.", "", "", "NA", "", "", "PROVIDE CHECK-TEST-STARTUP AT SITE. ASSEMBLE PER MANUFACTURER INSTRUCTIONS."),
                rows("DIFFERENTIAL WATER PRESSURE TRANSDUCERS", "WATER FURNACE 19P685-01", "DIFFERENTIAL HEADER WATER TRANSUCERS", "", "", "NA", "", "", "PROVIDE CHECK-TEST-STARTUP AT SITE. ASSEMBLE PER MANUFACTURER INSTRUCTIONS."),
                rows("HEADER END CAPS", "WATER FURNACE/ VICTAULIC 29P522-03", "DUCTILE IRON CAP, COUPLING, AND GASKET", "", "", "NA", "", "", "PROVIDE CHECK-TEST-STARTUP AT SITE. ASSEMBLE PER MANUFACTURER INSTRUCTIONS."),
                rows("STRAINER", "WATER FURNACE/ VICTAULIC 23P535-03", "STRAINER, DUCTILE IRON BODY, GROOVED END, 30 MESH SS SCREEN.", "", "", "NA", "", "", "PROVIDE CHECK-TEST-STARTUP AT SITE. ASSEMBLE PER MANUFACTURER INSTRUCTIONS."),
                rows("WSHP MASTER CONTROL PANEL", "WATER FURNACE HSCDB1DUSSC HYDROLINK SUPERVISORY CONTROL PANEL", 'HYDROLINK 2 CONTROLLER BACNET/IP CONTROL INTERFACE CONTROL PANEL ENCLOSURE 20.6" W X 28.5" H X 6.6" DEEP', "120", "1", "", "", "20", "SUPERVISORY, SEQUENCING, CONTROL PANEL FOR MODULES TO BE PROVIDED BY CHILLER MANUFACTURER. BACNET/IP INTERFACE, TOUCHPAD HMI."),
            ],
            "header_evidence": [{"bbox": [590, 710, 1900, 775], "expected": "ACCESSORY MANUFACTURER MODEL DESCRIPTION VOLTS FLA MCA MOCP"}],
        },
        {
            "id": "M602-FILTERS-STRAINERS",
            "page": 14,
            "sheet": "M-602",
            "title": "FILTER & STRAINER SCHEDULE",
            "classification": "Literal filter and strainer schedule rows",
            "columns": "tag|location|serves|manufacturer_model|filtration|minimum_pressure|pressure_drop|flow_gpm|volts|phase|fla|unit_weight_lbs|remarks",
            "x_edges": [960, 1020, 1115, 1225, 1355, 1450, 1530, 1580, 1640, 1680, 1710, 1740, 1780, 2170],
            "y_ranges": [[1140, 1180], [1180, 1220]],
            "rows": [
                rows("FTR-1", "MAIN ROOM", "WASTEWATER TO HX-1", "TEKLEEN LPF4-LPE PANEL GB6-LPF", "100 MICRON, 2.5 SF FILTER", "20 PSI", "1 PSI", "265", "110", "1", "10", "200", 'AUTOMATIC SELF CLEANING FILTER & CONTROL PANEL. 4" CLASS 150 CONNECTIONS, 1" NPT FLUSHING BALL VALVE.'),
                rows("STR-1", "MAIN ROOM", "WASTEWATER TO HX-1", 'KECKLEY STYLE GFV 6"', "60 MESH", "NONE", "0.25 PSI", "265", "NA", "NA", "NA", "120", "BASKET STRAINER. CLASS 125 FLANGE CONNECTIONS."),
            ],
            "header_evidence": [{"bbox": [960, 1060, 2170, 1140], "expected": "FILTER STRAINER SCHEDULE TAG LOCATION SERVES MANUFACTURER MODEL FILTRATION PRESSURE FLOW UNIT ELECTRICAL UNIT WT REMARKS"}],
        },
    ],
    "assembly_context": {
        "assembly_tag": "WSHP-1",
        "location": "MECHANICAL ROOM",
        "serves": "AERATED WATER HEATING",
        "assertion_ids": ["m602-wshp-location", "m602-wshp-serves"],
        "source_layout_note": "Location and serves are vertical merged cells adjacent to the five literal module rows; they do not repeat in every module row.",
    },
    "assertions": [
        {"id": "m602-wshp-location", "page": 14, "bbox": [650, 510, 735, 560], "expected": "MECHANICAL ROOM", "mode": "exact"},
        {"id": "m602-wshp-serves", "page": 14, "bbox": [735, 510, 805, 570], "expected": "AERATED WATER HEATING", "mode": "exact"},
    ],
    "inventory_checks": [{"id": "m602-core-table-count", "records_path": ["tables"], "expected": 5, "unique_key": "id"}],
}


def io(tag, ai="", ao="", di="", do="", power="", protocol="", primary="", primary_units="", secondary="", secondary_units="", action="", cable="", conduit=""):
    return rows(tag, ai, ao, di, do, power, protocol, primary, primary_units, secondary, secondary_units, action, cable, conduit)


motor_action = "START/STOP PUMP, MOTOR RUN STATUS, MOTOR CONTROL, & FEEDBACK"
motor_cable = "(4) 1/C #16 AWG, (1) 1/PR/SH #18 AWG, (1) CAT6, (1) #12G"
io_rows = [
    io(tag, "", "1", "1", "1", "", "ETHERNET/IP", "STATUS", "ON/OFF", "PUMP SPEED", "RPM", motor_action, motor_cable, '3/4"C')
    for tag in ["HWP-1", "HWP-2", "HWP-3", "HWP-4", "HWP-5", "HWP-6", "CP-1", "CP-2", "EP-1", "EP-2", "EP-3", "EP-4"]
]
io_rows += [
    io("LIFT STATION", "", "", "4", "1", "", "NONE", "STATUS", "ON/OFF", "PUMP SPEED", "RPM", "START/STOP PUMP, MOTOR RUN STATUS, HIGH/LOW FLOAT SWITHC FOR VALVE CONTROL, & LOW LOW FLOAT SWITCH FOR ALARM", "(12) 1/C #16 AWG, (1) #12G", '3/4"C'),
    io("BS-1 PNL", protocol="BACNET /IP", primary="STATUS", primary_units="ALARM", secondary="PUMP SPEED", secondary_units="RPM", action="ALARM, MOTOR RUN STATUS, & FEEDBACK", cable="(1) CAT6, (1) #12G", conduit='1/2"C'),
    io("WSHP-1", protocol="BACNET /IP", primary="STATUS", primary_units="ON/OFF", action="ENABLE/DISABLE", cable="(1) CAT6, (1) #12G", conduit='1/2"C'),
    io("LSH-135", di="1", protocol="NONE", primary="STATUS", primary_units="HIGH", action="CLOSED SWITCH TO CLOSE LCV-135", cable="(2) 1/C #16 AWG, (1) #12G", conduit='1/2"C'),
    io("LSL-135", di="1", protocol="NONE", primary="STATUS", primary_units="LOW", action="CLOSED SWITCH TO OPEN LCV-135", cable="(2) 1/C #16 AWG, (1) #12G", conduit='1/2"C'),
    io("LSLL-135", di="1", protocol="NONE", primary="STATUS", primary_units="ALARM", action="ALARM, STOP PUMPS", cable="(2) 1/C #16 AWG, (1) #12G", conduit='1/2"C'),
    io("LCV-135", do="2", protocol="NONE", primary="STATUS", primary_units="OPEN/CLOSED", action="OPEN/CLOSE VALVE COMMAND", cable="(4) 1/C #16 AWG, (1) #12G", conduit='1/2"C'),
]
for tag in ["PIT-116", "PIT-115", "PIT-114", "PIT-113"]:
    io_rows.append(io(tag, ai="1", protocol="NONE", primary="VALUE", primary_units="PSI", action="DISPLAY AND ALARM IF PRESSURE IS LOW", cable="(1) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'))
io_rows += [
    io("DPIT-117", ai="1", protocol="NONE", primary="VALUE", primary_units="PSI", action="DISPLAY & CONTROL INPUT FOR HWP-5,6 SPEED", cable="(1) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TCV-105", ai="1", ao="1", power="1", protocol="NONE", primary="VALUE", primary_units="%SIGNAL", secondary="VALUE", secondary_units="%OPEN", action="PRIMARY TAW TEMPERATURE CONTROL, 4-20mA CONTROL, 2-10VDC POSITION FEED BACK, 24VDC POWER", cable="(2) 1/C #16AWG, (2) 1/PR/SH #18 AWG, (1) #12G", conduit='3/4"C'),
    io("TE-105", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="PRIMARY TAW TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("FIT-143", ai="1", protocol="NONE", primary="VALUE", primary_units="GPM", secondary="TOTAL", secondary_units="GALLONS", action="CAW FLOW RATE, DISPLAY AND TOTALIZE", cable="(1) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("FIT-145", ai="1", protocol="NONE", primary="VALUE", primary_units="GPM", secondary="TOTAL", secondary_units="GALLONS", action="CAW FLOW RATE, DISPLAY AND TOTALIZE", cable="(1) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TE-110", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="TAW SUPPLY TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TCV-110A", ai="1", ao="1", power="1", protocol="NONE", primary="VALUE", primary_units="%SIGNAL", secondary="VALUE", secondary_units="%OPEN", action="PRIMARY TAW TEMPERATURE CONTROL, 4-20mA CONTROL, 2-10VDC POSITION FEED BACK, 24VDC POWER", cable="(2) 1/C #16AWG, (2) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TCV-110B", ai="1", ao="1", power="1", protocol="NONE", primary="VALUE", primary_units="%SIGNAL", secondary="VALUE", secondary_units="%OPEN", action="PRIMARY TAW TEMPERATURE CONTROL, 4-20mA CONTROL, 2-10VDC POSITION FEED BACK, 24VDC POWER", cable="(2) 1/C #16AWG, (2) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TE-100", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="EFLUENT TO HX TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("PIT-221", ai="1", protocol="NONE", primary="VALUE", primary_units="PSI", action="DISPLAY AND ALARM IF PRESSURE IS LOW, WSHP EVAPORATOR INLET", cable="(1) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("PIT-222", ai="1", protocol="NONE", primary="VALUE", primary_units="PSI", action="DISPLAY AND ALARM IF PRESSURE IS LOW, WSHP CONDENSER INLET", cable="(1) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TE-101", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="BT-1 TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TE-102", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="BT-2 TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TE-203", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="BT-3 TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("TE-204", ai="1 RTD", protocol="NONE", primary="VALUE", primary_units="°C", action="BT-4 TEMPERATURE", cable="(1) 3/C/SH #18 AWG, (1) #12G", conduit='1/2"C'),
    io("REFIGERANT LEAK DETECTION", di="1", power="1", protocol="NONE", primary="STATUS", primary_units="ALARM", action="ALARM WHEN REFIGERENT LEAK IS DETECTED", cable="(4) 1/C #16 AWG, (1) #12G", conduit='1/2"C'),
    io("EF-3", ao="1", di="1", do="1", protocol="NONE", primary="STATUS", primary_units="ON/OFF", secondary="FAN SPEED", secondary_units="RPM", action="START/STOP FAN, MOTOR RUN STATUS, FAN SPPED CONTROL", cable="(4) 1/C #16 AWG,(1) 1/PR/SH #18 AWG, (1) #12G", conduit='3/4"C'),
    io("PLUG VALVE", do="2", protocol="NONE", primary="STATUS", primary_units="OPEN/CLOSED", action="OPEN/CLOSE VALVE COMMAND", cable="(4) 1/C #16 AWG, (1) #12G", conduit='1/2"C'),
]
for tag in ["HORN 1", "HORN 2", "HORN 3"]:
    io_rows.append(io(tag, do="1", protocol="NONE", primary="STATUS", primary_units="ALARM", action="NOTIFICATION OF ALAMR THROUGH ELECTRONIC ALARM HORN", cable="(2) 1/C #16 AWG, (1) #12G", conduit='1/2"C'))
io_rows += [io("FISH HATCHERY CONTROL PANEL", protocol="MODBUS TCP/IP", primary="STATUS", primary_units="ALARM", action="COMMUNICATE WITH EXISTING FISH HATCHERY BUILDING CONTROL PANEL FOR EMERGENCY ALARM DIAL OUT", cable="(1) CAT6, (1) #12G", conduit='1/2"C')]
for tag in ["5D-1", "5D-2", "5D-3", "5D-4", "15D-1", "15D-2"]:
    io_rows.append(io(tag, di="1", protocol="NONE", primary="STATUS", primary_units="ALARM", action="ALARM WHEN LOW LEVEL", cable="(2) 1/C #16 AWG, (1) #12G", conduit='1/2"C'))
io_rows.append(io("TE-300", ai="1", protocol="NONE", primary="VALUE", primary_units="°C", action="HVAC OUTSIDE AIR TEMPERATURE SENSOR, START STOP HWP-5/6", cable="(2) 1/PR/SH #18 AWG, (1) #12G", conduit='1/2"C'))
assert len(io_rows) == 52

points = {
    "document_id": IDENT,
    "module_role": "Exact E-702 White Sturgeon PLC I/O list. Each row is an equipment/control-record I/O declaration rather than an inferred field-device expansion. The normalized point_name key preserves the literal ACTION column because this source prints no separate point-name column.",
    "source_sheet": "E-702",
    "source_page": 38,
    "source_column_mapping": {"tag": "TAG", "point_name": "ACTION; E-702 does not print a separate point-name column.", "io_count_columns": "ANALOG INPUT/OUTPUT, DIGITAL INPUT/OUTPUT, and POWER 24VDC"},
    "tables": [{
        "id": "E702-WHITE-STURGEON-PLC-IO-LIST",
        "page": 38,
        "sheet": "E-702",
        "title": "IO LIST WHITE STURGEON PLC",
        "classification": "Literal PLC I/O device/control record",
        "columns": "tag|analog_input|analog_output|digital_input|digital_output|power_24vdc|communication_protocol|primary_display|primary_display_units|secondary_display|secondary_display_units|point_name|cable|conduit",
        "x_edges": [388, 525, 568, 611, 656, 703, 749, 900, 987, 1056, 1124, 1197, 1825, 2098, 2165],
        "y_ranges": around([123.21 + 15.18 * index for index in range(52)], 7.3),
        "rows": io_rows,
        "header_evidence": [{"bbox": [385, 70, 2165, 111], "expected": "TAG ANALOG INPUT OUTPUT DIGITAL POWER 24VDC COMMUNICATION PROTOCOL PRIMARY DISPLAY SECONDARY DISPLAY ACTION CABLE CONDUIT"}],
    }],
    "inventory_checks": [{"id": "e702-plc-io-source-rows", "records_path": ["tables", 0, "rows"], "expected": 52}],
}


def write(name, payload):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


write("schedules_m603_core.json", schedules)
write("schedules_m604_core.json", m604_schedules)
write("schedules_m601_core.json", m601_schedules)
write("schedules_m602_core.json", m602_schedules)
write("points_e702_plc_io.json", points)
