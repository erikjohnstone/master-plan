"""Author M5.2 equipment schedules using visually reviewed, cell-bounded text.

Every field below was transcribed from the printed M5.2 grids.  The separate
verifier checks each field against both the MuPDF and Poppler captures; this
builder never reads either parser output to populate the annotation.
"""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "04__vol2__062"
IDENT = "04__vol2__062"


def grid(identifier, title, columns, x_edges, y_ranges, rows):
    return {
        "id": identifier, "sheet": "M5.2", "page": 14,
        "title_as_printed": title, "columns": "|".join(columns),
        "x_edges": x_edges, "y_ranges": y_ranges, "rows": rows,
        "row_semantics": "One printed schedule line item. Wrapped source cells are retained in their source cell; no plan multiplier, inferred installed quantity, I/O, or unprinted control attribute is added.",
    }


def main():
    heaters = [
        "EH-1|NUCLEAR GAUGE STORAGE 128|SURFACE MOUNTED|245|1,400|1/8|3.0|1|208 / 1|14.4|MARKEL MODEL 3420 SERIES|1 , 3 , 5",
        "EH-2|ENCLOSED MATERIAL STORAGE 127|SURFACE MOUNTED|245|1,400|1/8|3.0|1|208 / 1|14.4|MARKEL MODEL 3420 SERIES|1 , 3 , 5",
        "EH-3|ENCLOSED MATERIAL STORAGE 127|SURFACE MOUNTED|245|1,400|1/8|3.0|1|208 / 1|14.4|MARKEL MODEL 3420 SERIES|1 , 3 , 5",
        "EH-4|FIRE RISER 121|SURFACE MOUNTED|245|1,400|1/8|2.0|1|208 / 1|9.6|MARKEL MODEL 3420 SERIES|1 , 3 , 5",
        "EH-5|LAB MECHANICAL 120|WALL MOUNTED UNIT HEATER|300|1,400|-|3.0|1|208 / 1|14.4|REZNOR MODEL EGW-3|1 , 4 , 5",
        "EH-6|ELECTRICAL 116|RECESSED|245|1,400|1/8|2.0|1|208 / 1|9.6|MARKEL MODEL 3420 SERIES|1 , 3 , 5",
        "EH-7|LOBBY 101|RECESSED|245|1,400|1/8|2.0|1|208 / 1|9.6|MARKEL MODEL 3420 SERIES|1 , 2 , 6",
        "EH-8|OPEN OFFICE 110|RECESSED|245|1,400|1/8|2.0|1|208 / 1|9.6|MARKEL MODEL 3420 SERIES|1 , 2 , 6",
        "EH-9|REST. 102|RECESSED|245|1,400|1/8|2.0|1|208 / 1|9.6|MARKEL MODEL 3420 SERIES|1 , 2 , 6",
    ]
    specialty = [
        "AS-1|AIR SEDIMENT SEPARATOR|HOT WATER LOOP|DESIGN FLOW IS 80 GPM WITH A DESIGN PD OF 1.0 FT-H|B & G MODEL SRS-3F ALTERNATE APPROVED MANUFACTURERS: TACO, ARMSTRONG, AND PACO",
        "ET-1|EXPANSION TANK (VERTICAL DIAPHRAGM TYPE)|HOT WATER LOOP|7.8 GALLON CAPACITY, ACCEPTANCE 6.3 GALLONS-DIAPHRAGM TYPE EXPANSION TANK. (PRE-CHARGED TO 10 PSI)|B & G MODEL D-15 ALTERNATE APPROVED MANUFACTURERS: TACO, ARMSTRONG, AND PACO",
        "FM-1|HYDRONIC FLOW METER|HOT WATER LOOP|ELECTROMAGNETIC FLOW METER|ONICON F-3200 FLOW METER",
        "PF-1|POT FEEDER|HOT WATER LOOP|CHEMICAL POT FEEDER TANK|WESSELS MODEL CPFT-2",
    ]
    split = [
        "F-1 , CU-1|MULTIPOISE|5|2,250|0.70|1.0|115/1|52.0|52.0|80|78.0|32.4|50|208/1|260|14.0|450|CARRIER 59SC6A080C211-20 FURNACE CARRIER 24SCA460 CONDENSING UNIT|1 , 2 , 3 , 4",
    ]
    sound = [
        "SA-1|DUCT SILENCER|AHU-1 SUPPLY|13,000|2,500|84|58|22|-|0.22|-|11|18|28|30|36|26|22|14|VIBRO ACOUSTICS SA-S|1 , 2",
    ]
    penthouse = ["PH-1|EQUIPMENT T01|TIERED|2|8X8|0.45|AAMA 2604|COOK MODEL 8 TR|1 , 2 , 3"]
    louvers = [
        "L-1|EF-6 MAKEUP AIR|FIXED DRAINABLE|20\"X12\"|0.54|AAMA2604|RUSKIN ELF6375DX|1 , 2 , 3 , 4",
        "L-2|EF-7 MAKEUP AIR|FIXED DRAINABLE|14\"X12\"|0.36|AAMA2604|RUSKIN ELF6375DX|1 , 2 , 3 , 4",
    ]
    ductless = [
        "DFC-1 , DCU-1|IT 115|2.0|HIGH WALL COOLING ONLY|640|THRU O/U|25.0|18.0|18|25|208/1|18.5|35 / 95|CARRIER FAN COIL MODEL 40MHH24 CARRIER CONDENSING UNIT MODEL 38MHRBC24|1 , 2 , 3 , 4 , 5 , 6",
    ]
    data = {
        "document_id": IDENT,
        "module_role": "M5.2 equipment-schedule capture. It explicitly distinguishes printed schedule rows from field/plan quantities and leaves absent control-point, damper-actuator, sequence, and network values absent rather than fabricating them.",
        "schedule_scope": {
            "sheet": "M5.2 / PDF p14", "literal_line_items": 19,
            "coverage": ["electric heaters", "hydronic specialty equipment", "gas split system", "sound attenuator", "penthouse", "louvers", "ductless split cooling unit"],
            "control_boundary": "The EH remarks mark EH-9 through EH-6 as standalone / not DDC controlled via remark 6 where printed. Separate M6 sheets, rather than this schedule, publish sequences and labeled control context. No full damper-actuator schedule appears on M5.2.",
        },
        "tables": [
            grid("M52-ELECTRIC-HEATERS", "ELECTRIC HEATER SCHEDULE",
                 ["tag", "area_served", "unit_type", "cfm", "rpm", "hp", "kw", "steps", "voltage_phase", "amps", "manufacturer_model", "remarks"],
                 [200, 255, 405, 548, 590, 640, 680, 720, 760, 815, 850, 1000, 1285],
                 [[180, 210], [215, 245], [251, 281], [287, 317], [323, 353], [359, 389], [395, 425], [431, 461], [467, 497]], heaters),
            {**grid("M52-MECHANICAL-SPECIALTY", "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE",
                 ["tag", "equipment_description", "system_served", "description", "manufacturer_model_and_alternates"],
                 [200, 255, 400, 525, 980, 1275],
                 [[760, 797], [797, 835], [835, 870], [870, 908]], specialty),
             "parser_exclusions": [
                 {"engine": "mupdf", "word_ids": [329], "reason": "The H2O suffix is one MuPDF word but Poppler reports overlapping baseline and subscript words; exclude the disputed glyph cluster rather than asserting a parser-normalized rendering."},
                 {"engine": "poppler", "word_ids": [548, 549], "reason": "The H2O suffix is one MuPDF word but Poppler reports overlapping baseline and subscript words; exclude the disputed glyph cluster rather than asserting a parser-normalized rendering."},
             ],
             "source_note": "The AS-1 printed pressure-drop suffix is visually rendered as H2O. Its overlapping super/subscript glyph cluster disagrees between engines (MuPDF: one word; Poppler: two words), so the corroborated cell ends at FT-H and the suffix is deliberately not normalized."},
            grid("M52-GAS-SPLIT-SYSTEM", "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS)",
                 ["tag", "unit_type", "nominal_tons", "supply_cfm", "esp", "hp", "supply_voltage_phase", "total_cooling_mbh", "sensible_cooling_mbh", "heating_input_mbh", "heating_output_mbh", "mca", "mocp", "condensing_voltage_phase", "osa_cfm", "minimum_seer2", "operating_weight_lb", "manufacturer_model", "remarks"],
                 [200, 275, 345, 389, 427, 461, 497, 539, 587, 648, 693, 737, 775, 810, 848, 880, 916, 963, 1210, 1285],
                 [[1050, 1083]], split),
            grid("M52-SOUND-ATTENUATOR", "SOUND ATTENUATOR SCHEDULE",
                 ["tag", "type", "location", "airflow_cfm", "maximum_face_velocity_fpm", "length_in", "width_in", "height_in", "face_area_sq_ft", "maximum_pressure_drop_in_wc", "weight_lb", "il_63", "il_125", "il_250", "il_500", "il_1000", "il_2000", "il_4000", "il_8000", "manufacturer_model", "remarks"],
                 [1300, 1360, 1405, 1470, 1520, 1570, 1620, 1665, 1725, 1775, 1835, 1885, 1912, 1939, 1966, 1993, 2020, 2047, 2074, 2102, 2295, 2420],
                 [[285, 315]], sound),
            grid("M52-PENTHOUSE", "PENTHOUSE SCHEDULE",
                 ["tag", "area_served", "type", "number_of_tiers", "throat_size", "minimum_free_area_sq_ft", "finish", "manufacturer_model", "remarks"],
                 [1300, 1400, 1550, 1630, 1730, 1840, 1915, 1990, 2295, 2420],
                 [[485, 515]], penthouse),
            grid("M52-LOUVERS", "LOUVER SCHEDULE",
                 ["tag", "service", "type", "nominal_size", "minimum_free_area_sq_ft", "finish", "manufacturer_model", "remarks"],
                 [1300, 1360, 1480, 1600, 1710, 1790, 1890, 2270, 2420],
                 [[700, 730], [736, 766]], louvers),
            grid("M52-DUCTLESS-SPLIT-HIGH-WALL", "DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE",
                 ["tag", "area_served", "unit_type", "supply_cfm", "supply_voltage_phase", "nominal_tons", "total_cooling_mbh", "sensible_cooling_mbh", "mca", "mocp", "outdoor_voltage_phase", "minimum_seer", "indoor_outdoor_weight_lb", "manufacturer_model", "remarks"],
                 [1300, 1380, 1470, 1515, 1595, 1635, 1670, 1715, 1760, 1795, 1828, 1870, 1910, 1960, 2310, 2420],
                 [[1010, 1045]], ductless),
        ],
        "assertions": [
            {"id": "m52-electric-heater-title", "page": 14, "bbox": [560, 60, 950, 110], "expected": "ELECTRIC HEATER SCHEDULE", "mode": "exact"},
            {"id": "m52-specialty-title", "page": 14, "bbox": [450, 675, 980, 715], "expected": "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE", "mode": "exact"},
            {"id": "m52-split-title", "page": 14, "bbox": [400, 930, 1200, 975], "expected": "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS)", "mode": "exact"},
            {"id": "m52-ductless-title", "page": 14, "bbox": [1530, 890, 2100, 930], "expected": "DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE", "mode": "exact"},
        ],
        "inventory_checks": [{"id": "rank04-m52-tables", "records_path": ["tables"], "expected": 7, "unique_key": "id"}],
    }
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "schedules_m52_equipment.json").write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
