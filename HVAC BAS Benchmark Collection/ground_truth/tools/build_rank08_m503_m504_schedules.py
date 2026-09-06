"""Literal, bounded schedule capture for Rank 08 MI-503 and MI-504."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "08__vol2__044"
OUT = AUDIT / "work" / IDENT / "schedules_mi503_mi504.json"


def r(y0, y1, *cells):
    return (y0, y1, "|".join(cells))


def table(id_, sheet, page, title, columns, x_edges, rows, title_box):
    return {
        "id": id_, "sheet": sheet, "page": page,
        "title_as_printed": title, "columns": columns, "x_edges": x_edges,
        "y_ranges": [[a, b] for a, b, _ in rows],
        "rows": [text for _, _, text in rows],
        "row_reading_order": "right",
        "header_evidence": [{"bbox": title_box, "expected": title}],
        "source_row_semantics": "Complete literal schedule row. It preserves printed cells, blanks, and continuation rows; it is not a plan-verified installed-count, placement, or procurement conclusion.",
    }


def main():
    prvs = [
        r(235, 258, "PRV-19", "DA TANK", "DAT TANK", "", "2", "5200", "7023", "125", "15", "1/2", "SEE NOTES 1,2,3"),
        r(300, 321, "PRV-25", "MUA-1 MEZZANINE", "MUA-1 AND UH", "PRV-25-1", "1", "1400", "2104", "125", "50", "2/3", "SEE NOTES 1,2,3"),
        r(327, 346, "", "", "", "PRV-25-3", "1-1/2\"", "1400", "1900", "50", "5", "2/3", "SEE NOTES 1,2,3"),
        r(350, 368, "", "", "", "PRV-25-2", "3/4", "700", "1305", "125", "50", "1/3", "SEE NOTES 1,2,3"),
        r(370, 390, "", "", "", "PRV-25-4", "1\"", "700", "997", "50", "5", "1/3", "SEE NOTES 1,2,3"),
        r(415, 437, "PRV-26", "BOILER ROOM", "SWH-1 & 2", "PRV-26-1", "3\"", "14847", "", "125", "15", "2/3", "SEE NOTES 1,2,3"),
        r(441, 463, "", "", "", "PRV-26-2", "2-1/2\"", "11237", "", "125", "15", "1/3", "SEE NOTES 1,2,3"),
    ]
    bpr = [r(225, 248, "BPRV-1", "TEMPORARY BOILER", "8\" HPS IN CHILLER PLANT", "2-1/2\"", "7000", "7500", "130", "130", "SEE NOTES 1")]
    psvs = [
        r(480, 504, "PSV-1", "PRV-25", "5", "15", "2100", "2 X 3", "CAST STEEL", "VIII", "3\"", "SEE NOTE 1"),
        r(512, 532, "PSV-2", "PRV-26", "15", "25", "21600", "6 X 8", "CAST STEEL", "VIII", "8\"", "SEE NOTE 2"),
        r(542, 561, "PSV-3", "DA TANK", "15", "25", "5200", "2-1/2 X 4", "CAST STEEL", "VIII", "4\"", "SEE NOTE 3"),
        r(572, 591, "PSV-4", "FLASH TANK", "15", "18", "300", "1-1/2 X 2", "CAST STEEL", "VIII", "2\"", "SEE NOTE 4"),
    ]
    flash = [r(767, 786, "FT-1", "125", "15", "2400", "270", "2130", "8", "4", "4", "2", "SEE NOTES 1,2,3,4,5")]
    steam_meters = [
        r(894, 913, "SM1", "B-1", "STEAM", "125", "23000", "207", "8\"", "8\"", "48", "24", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(932, 950, "SM2", "B-2", "STEAM", "125", "23000", "207", "8\"", "8\"", "48", "24", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(968, 986, "SM3", "B-3", "STEAM", "125", "11500", "104", "6\"", "6\"", "36", "18", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(1004, 1022, "SM4", "B-4", "STEAM", "125", "11500", "104", "6\"", "6\"", "36", "18", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(1040, 1058, "SM5", "CHILLER PLANT", "STEAM", "125", "15000", "150", "8\"", "6\"", "48", "24", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(1077, 1095, "SM6", "HOSPITAL", "STEAM", "125", "15000", "150", "10\"", "6\"", "60", "30", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(1114, 1132, "SM7", "DA TANK, MUA + UH", "STEAM", "125", "2100", "21", "4\"", "3\"", "24", "12", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
        r(1150, 1167, "SM8", "SWH-1 & 2", "STEAM", "125", "10800", "108", "6\"", "6\"", "361", "18", "100:1", "SEE NOTES 1,2,3,4,5,6,7,8,9"),
    ]
    isolation = [
        r(298, 318, "GV-1", "MAIN HEADER", "BOILER 1", "GATE", "NEW", "8", "8", "HPS", "SEE NOTES 1, 3"),
        r(336, 356, "GV-2", "MAIN HEADER", "BOILER 2", "GATE", "NEW", "8", "8", "HPS", "SEE NOTE 1, 3"),
        r(375, 395, "GV-3", "MAIN HEADER", "BOILER 3", "GATE", "NEW", "6", "6", "HPS", "SEE NOTES 1, 3"),
        r(413, 433, "GV-4", "MAIN HEADER", "BOILER 4", "GATE", "NEW", "6", "6", "HPS", "SEE NOTES 1, 3"),
        r(452, 471, "GV-5", "MAIN HEADER", "8\" TO CHILLER PLANT", "GATE", "REPLACE", "8", "8", "HPS", "SEE NOTES 1, 3"),
        r(490, 510, "GV-6", "MAIN HEADER", "10\" TO HOSPITAL", "GATE", "REPLACE", "10", "10", "HPS", "SEE NOTES 1, 3"),
        r(529, 548, "GV-7", "MAIN HEADER", "4\" TO PRV-19 AND PRV-25", "GATE", "REPLACE", "4", "4", "HPS", "SEE NOTES 1, 3"),
        r(567, 586, "NO USE", "", "", "", "", "", "", "", ""),
        r(605, 625, "GV-9", "MAIN HEADER", "6\" TO PRV-26", "GATE", "NEW", "6", "6", "HPS", "SEE NOTES 1, 3"),
        r(644, 664, "GV-10", "MAIN HEADER", "6\" SPARE", "GATE", "NEW", "6", "6", "HPS", "SEE NOTES 1, 3"),
        r(682, 702, "GV-11", "MAIN HEADER", "6\" SPARE", "GATE", "NEW", "6", "6", "HPS", "SEE NOTES 1, 3"),
        r(721, 740, "GV-12", "MAIN HEADER", "HEADER VENT", "GATE", "REPLACE", "10", "10", "HPS", "SEE NOTES 1, 3"),
        r(759, 779, "GV-13", "SWH-1", "SWH-1", "GATE", "NEW", "6", "6", "LPS", "SEE NOTES 2, 3"),
        r(797, 817, "GV-14", "SWH-2", "SWH-2", "GATE", "NEW", "8", "8", "LPS", "SEE NOTES 2, 3"),
        r(836, 855, "GV-15", "DA TANK", "DA TANK", "GATE", "NEW", "6", "6", "LPS", "SEE NOTE 3"),
        r(873, 892, "GV-16A", "8\" CROSS CONNECT BETWEEN 8\" HPS & 10 HPS", "TEMPORARY BOILER", "GATE", "NEW", "8", "8", "HPS", ""),
        r(911, 931, "GV-16B", "8\" CROSS CONNECT BETWEEN 8\" HPS & 10 HPS", "TEMPORARY BOILER", "GATE", "NEW", "8", "8", "HPS", ""),
        r(950, 970, "GV-17", "8\" TEMPORARY PIPE IN CHILLER PLANT", "TEMPORARY BOILER", "GATE", "NEW", "8", "8", "HPS", "SEE NOTES 1, 3"),
        r(985, 1012, "GV-18", "4\" CROSS CONNECT BETWEEN 4\" HPS & 6\" SECONDARY HEADERS", "TEMPORARY BOILER", "GATE", "NEW", "4", "4", "HPS", ""),
        r(1030, 1050, "GV-19", "4\" HPS", "TEMPORARY BOILER", "GATE", "NEW", "4", "4", "HPS", ""),
        r(1069, 1089, "GV-20", "4\" HPS SERVING PRV-19", "PRV-19", "GATE", "NEW", "4", "4", "HPS", "SEE NOTES 2"),
        r(1108, 1128, "NO USE", "", "", "", "", "", "", "", ""),
        r(1147, 1167, "GV-22", "2-1/2\" HPS", "TEMPORARY BOILER", "GATE", "NEW", "2.5", "2.5", "HPS", "SEE NOTES 2"),
        r(1185, 1205, "GV-23", "4\" HPS", "TEMPORARY BOILER", "GATE", "NEW", "4", "4", "HPS", ""),
        r(1224, 1243, "GV-24", "6\" HPS", "TEMPORARY BOILER", "GATE", "NEW", "6", "6", "HPS", ""),
        r(1255, 1284, "GV-25", "BOILER 1 CONNECTION", "BOILER 1", "NON-RETURN STOP/CHECK VALVE", "NEW", "8", "8", "HPS", ""),
        r(1294, 1322, "GV-26", "BOILER 2 CONNECTION", "BOILER 2", "NON-RETURN STOP/CHECK VALVE", "NEW", "8", "8", "HPS", ""),
        r(1333, 1360, "GV-27", "BOILER 3 CONNECTION", "BOILER 3", "NON-RETURN STOP/CHECK VALVE", "NEW", "6", "6", "HPS", ""),
        r(1372, 1399, "GV-28", "BOILER 4 CONNECTION", "BOILER 4", "NON-RETURN STOP/CHECK VALVE", "NEW", "6", "6", "HPS", ""),
    ]
    fuel_oil_meters = [
        r(341, 362, "FOM-1", "BOILER 1 FUEL OIL", "FUEL OIL", "50", "40", "1", "1", "OVAL GEAR", "10D", "5D", "2.6", "40", "100:1", "SEE NOTES 1,3,4,5"),
        r(378, 399, "FOM-2", "BOILER 2 FUEL OIL", "FUEL OIL", "50", "40", "1", "1", "OVAL GEAR", "10D", "5D", "2.6", "40", "100:1", "SEE NOTES 1,3,4,5"),
        r(415, 437, "FOM-3", "BOILER 3 FUEL OIL", "FUEL OIL", "50", "2.4", "3/8", "3/8", "OVAL GEAR", "10D", "5D", "0.06", "2.4", "100:1", "SEE NOTES 2,3,4,5"),
        r(452, 474, "FOM-4", "BOILER 4 FUEL OIL", "FUEL OIL", "50", "2.4", "3/8", "3/8", "OVAL GEAR", "10D", "5D", "0.06", "2.4", "100:1", "SEE NOTES 2,3,4,5"),
    ]
    day_tank = [r(697, 718, "DT-1", "EMERGENCY GENERATOR ROOM", "NEW GENERATOR", "130 GALLON DAY TANK WITH RUPTURE BASIN & LEAK", "130", "5", "SEE NOTES 1,2,3")]
    condensate_pump = [r(955, 982, "CP-1", "MECH ROOM", "FT-1", "2", "6", "20", "1/3 HP", "1/60/115V TEFC", "25", "304 STAINLESS STEEL", "SEE NOTES 1,2,3")]
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of the selected high-value MI-503/MI-504 boiler-plant schedules: steam pressure reduction/safety, flash vessel, steam meters, isolation valves, fuel-oil meters, emergency day tank and condensate pump.",
        "tables": [
            table("MI503-STEAM-PRESSURE-REDUCING-VALVES", "MI-503", 23, "BOILER PLANT · STEAM PRESSURE REDUCING VALVE SCHEDULE", "mark|area_served|location|system_or_service|valve_size_inches|required_capacity|max_flow_wide_open_valve|pressure_in|pressure_out|reference_size|notes", [190, 300, 450, 620, 770, 845, 965, 1135, 1215, 1280, 1360, 1480], prvs, [380, 110, 1170, 155]),
            table("MI503-PILOT-OPERATED-BACK-PRESSURE-REGULATOR", "MI-503", 23, "PILOT OPERATED BACK PRESSURE REGULATOR", "mark|area_served|location|valve_size_inches|required_capacity|max_flow_wide_open_valve|pressure_in|pressure_out|notes", [1600, 1700, 1850, 2030, 2120, 2220, 2370, 2490, 2550, 2660], bpr, [1820, 110, 2560, 155]),
            table("MI503-STEAM-PRESSURE-SAFETY-VALVES", "MI-503", 23, "STEAM PRESSURE SAFETY VALVE SCHEDULE", "mark|equipment_served|operating_pressure|set_pressure|required_flow|size|material|asme_section|drip_pan|remarks", [1600, 1740, 1870, 1950, 2045, 2160, 2250, 2430, 2520, 2650, 2780], psvs, [1910, 370, 2490, 410]),
            table("MI503-FLASH-VESSEL", "MI-503", 23, "BOILER PLANT · FLASH VESSEL SCHEDULE", "mark|condensate_source_pressure|outlet_pressure|total_load_in|flash_steam_out|condensate_load_out|diameter|inlet_size|vent_size|outlet_size|notes", [190, 260, 460, 570, 670, 800, 960, 1070, 1160, 1240, 1340, 1480], flash, [570, 625, 1120, 670]),
            table("MI503-STEAM-METERS", "MI-503", 23, "BOILER PLANT · STEAM METER SCHEDULE", "mark|area_equipment_service|media|inlet_pressure|flow_rate_max|flow_rate_min|pipe_size|meter_size|straight_length_upstream|straight_length_downstream|turndown|notes", [1600, 1680, 1790, 1870, 1940, 2015, 2080, 2140, 2200, 2320, 2460, 2600, 2780], steam_meters, [1910, 740, 2500, 780]),
            table("MI504-ISOLATION-VALVES", "MI-504", 24, "BOILER PLANT · ISOLATION VALVE SCHEDULE", "mark|location|system_or_service|type|replace_new|pipe_size|valve_size|temp_type|remarks", [220, 280, 550, 700, 820, 950, 1035, 1120, 1200, 1320], isolation, [480, 185, 1070, 230]),
            table("MI504-FUEL-OIL-METERS", "MI-504", 24, "BOILER PLANT · FUEL OIL METER SCHEDULE", "mark|area_equipment_service|media|inlet_pressure|flow_rate_max|pipe_size|meter_size|meter_type|straight_length_upstream|straight_length_downstream|min_flow|max_flow|turndown|remarks", [1570, 1640, 1750, 1830, 1900, 1970, 2030, 2090, 2180, 2300, 2390, 2450, 2510, 2580, 2710], fuel_oil_meters, [1850, 185, 2450, 230]),
            table("MI504-GENERATOR-DAY-TANK", "MI-504", 24, "GENERATOR DAY TANK SCHEDULE", "mark|location|equipment_serve|arrangement|volume|psi_rate|remarks", [1570, 1650, 1850, 2040, 2380, 2460, 2550, 2710], day_tank, [1900, 625, 2410, 670]),
            table("MI504-CONDENSATE-PUMP", "MI-504", 24, "CONDENSATE PUMP", "mark|location|equipment_serve|number_of_pumps|pump_capacity_each|discharge_pressure|motor_hp|voltage|receiver_capacity|material|remarks", [1580, 1650, 1740, 1860, 1950, 2070, 2190, 2280, 2400, 2500, 2600, 2720], condensate_pump, [2010, 855, 2320, 895]),
        ],
        "assertions": [],
        "schedule_scope": {
            "captured_schedule_corpus": "This module completely captures the nine selected high-value schedules on MI-503/MI-504. Other schedule sheets are visually reviewed and retained as source context but are not silently represented as transcribed rows here.",
            "control_valve_schedule": "The supplied set publishes steam pressure-reducing valve schedules and a fuel-oil control-valve point interface, but no standalone schedule titled CONTROL VALVE SCHEDULE is asserted.",
            "damper_actuator_schedule": "No standalone damper-actuator schedule is asserted from this source set.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
