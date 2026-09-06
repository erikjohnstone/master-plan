"""Hand-authored strict capture of the core M-601 schedule grids (rank 05).

No PDF discovery occurs here. Coordinates, rows, and every expected literal
cell were read from the rendered schedule and independently checked later by
MuPDF and Poppler.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "05__vol2__009"
OUT = AUDIT / "work" / IDENT / "schedules_m601_core.json"


def table(identifier, title, columns, xs, ys, rows, **extra):
    return {
        "id": identifier,
        "sheet": "M-601",
        "page": 18,
        "title_as_printed": title,
        "columns": columns,
        "x_edges": xs,
        "y_ranges": ys,
        "rows": rows,
        **extra,
    }


def main():
    tables = [
        table(
            "M601-AIR-COOLED-CHILLER", "AIR COOLED CHILLER SCHEDULE",
            "tag|capacity_tons|min_eer|min_iplv|ewt_f|lwt_f|gpm|fouling_factor|max_pressure_drop_ft_wg|fluid|notes",
            [875, 935, 995, 1075, 1155, 1225, 1300, 1360, 1435, 1515, 1585, 1640],
            [[638, 663]],
            ["CH-1|60|10.29|15.53|44|45|99|0.0001|20|WATER|1:2:3:"],
            header_evidence=[{"bbox": [1165, 502, 1340, 522], "expected": "AIR COOLED CHILLER SCHEDULE"}],
            source_note="The printed chiller notes, including the R-32 requirement, are retained as bounded assertions rather than normalized equipment assumptions.",
        ),
        table(
            "M601-FANS", "FAN SCHEDULE",
            "tag|cfm|esp_in_wg|direct_drive_mark|model|max_hp|max_oper_weight_lb|max_fan_speed_rpm|max_noise_sones|accessory_marks|notes",
            [1660, 1725, 1785, 1845, 1910, 2010, 2080, 2170, 2240, 2315, 2620, 2660],
            [[693, 712], [712, 728], [728, 744], [758, 776], [776, 792]],
            [
                "EF-1|2,200|2.00|X|VK-H|2|700|2,000|21|X X X|1:2:",
                "EF-2|1,400|1.00|X|VK-H|1|500|2,200|20|X X X|1:2:",
                "EF-3|1,400|1.00|X|VK-H|1|500|2,200|20|X X X|1:2:",
                "EF-5|150|0.125|X|70 SQN|1/4|-|-|-||3:",
                "EF-6|200|0.125|X|70 SQN|1/4|||||3:",
            ],
            header_evidence=[{"bbox": [2140, 506, 2240, 530], "expected": "FAN SCHEDULE"}],
            source_note="Manufacturer text is rendered as a table-level/merged vertical layout and is retained in source layout context; it is not assigned to a row where the source does not make a clean one-row association.",
        ),
        table(
            "M601-HYDRONIC-CONTROL-VALVES", "HYDRONIC CONTROL VALVE SCHEDULE",
            "tag|gpm|max_pressure_drop_ft|min_cv|type|configuration|fluid|fail_position",
            [1230, 1290, 1360, 1440, 1515, 1600, 1710, 1785, 1870],
            [[1058, 1079], [1079, 1100]],
            ["CV-1|19|10|6|BALL|3-WAY|WATER|CLOSED", "CV-2|80|10|25|BALL|3-WAY|WATER|CLOSED"],
            header_evidence=[{"bbox": [1440, 934, 1650, 958], "expected": "HYDRONIC CONTROL VALVE SCHEDULE"}],
            source_note="The two source notes bind CV-1 to AHU-1 and CV-2 to AHU-2; they are preserved in the bounded assertions below.",
        ),
        table(
            "M601-AIR-HANDLING-UNITS", "AIR HANDLING UNIT SCHEDULE",
            "tag|mark|model_series|max_cfm|min_oa_cfm|unoccupied_cfm|external_static_in_wg|max_motor_hp|max_rpm|total_cooling_mbh|sensible_cooling_mbh|eat_db_f|eat_wb_f|lat_db_f|lat_wb_f|gpm|notes",
            [1890, 1940, 2020, 2080, 2132, 2172, 2228, 2268, 2325, 2372, 2420, 2470, 2500, 2530, 2560, 2595, 2660, 2715],
            [[1118, 1139], [1139, 1157]],
            [
                "AHU-1|X|39MN|2,565|640|-|3.5|5|3,500|106.2|64.5|78.3|66.5|55|54|19|1:2:3",
                "AHU-2|X|39MN|4,930|4,930|4,200|3.25|15|1,800|461.4|191.7|91|79|55|54|80|1:2:4",
            ],
            header_evidence=[{"bbox": [2210, 940, 2390, 965], "expected": "AIR HANDLING UNIT SCHEDULE"}],
            source_note="The printed MNFR column is a merged/rotated allowed-make layout (CARRIER, JCI, DAIKIN), not a clean one-make-per-unit field. It is recorded as a table-level source layout fact, not projected onto AHU-1/AHU-2.",
        ),
        table(
            "M601-VAV-TERMINALS", "VAV TERMINAL SCHEDULE",
            "tag|max_cfm|min_cfm|shutoff_mark|reheat_mark|inlet_duct_connection|air_handling_system|hot_water_mark|electric_mark|kw|notes",
            [2045, 2110, 2170, 2240, 2275, 2330, 2415, 2515, 2565, 2610, 2670, 2715],
            [[1408, 1426], [1426, 1442], [1442, 1458], [1458, 1473], [1473, 1489], [1489, 1504], [1504, 1521]],
            [
                "VAV-1-1|500|250||X|8\"|AHU-1||X|2.0|1:",
                "VAV-1-2|210|125||X|6\"|AHU-1||X|1.0|1:",
                "VAV-1-3|450|200||X|6\"|AHU-1||X|1.5|1:",
                "VAV-1-4|600|300||X|8\"|AHU-1||X|2.5|1:",
                "VAV-1-5|245|150||X|6\"|AHU-1||X|1.0|1:",
                "VAV-1-6|270|110||X|6\"|AHU-1||X|1.0|1:",
                "VAV-1-7|290|290||X|8\"|AHU-1||X|2.0|1:",
            ],
            header_evidence=[{"bbox": [2310, 1280, 2450, 1305], "expected": "VAV TERMINAL SCHEDULE"}],
            source_note="Rows are printed VAV schedule types/marks. This source table has no installed quantity column, so the seven rows are not a plan-instance total.",
        ),
        table(
            "M601-CHILLED-WATER-PUMPS", "CHILLED WATER PUMP",
            "tag|gpm|head_ft_wg|motor_hp|fluid|notes",
            [1850, 1930, 1995, 2070, 2150, 2225, 2270],
            [[1712, 1729], [1729, 1747]],
            ["CWP-1|99|35|2|WATER|1:", "CWP-2|99|35|2|WATER|1:"],
            header_evidence=[{"bbox": [2000, 1585, 2125, 1608], "expected": "CHILLED WATER PUMP"}],
        ),
        table(
            "M601-ELECTRIC-DUCT-HEATERS", "ELECTRIC DUCT HEATER",
            "tag|cfm|preheat_mark|reheat_mark|air_handling_system|kw|notes",
            [2300, 2360, 2425, 2470, 2540, 2605, 2670, 2720],
            [[1712, 1729], [1729, 1745], [1745, 1761], [1761, 1777], [1777, 1793]],
            [
                "EDH-1|1,750||X|AHU-2|10.0|1:",
                "EDH-2|690||X|AHU-2|8.0|1:",
                "EDH-3|900||X|AHU-2|8.0|1:",
                "EDH-4|690||X|AHU-2|10.0|1:",
                "EDH-5|900||X|AHU-2|8.0|1:",
            ],
            header_evidence=[{"bbox": [2440, 1585, 2575, 1610], "expected": "ELECTRIC DUCT HEATER"}],
        ),
    ]
    data = {
        "document_id": IDENT,
        "module_role": "M-601 core equipment schedule capture: air-cooled chiller, exhaust fans, hydronic control valves, air handling units, VAV terminals, chilled-water pumps and electric duct heaters. Accessory matrices and air-device types are captured separately so their rotated/merged layout is not falsely flattened.",
        "tables": tables,
        "assertions": [
            {"id": "m601-chiller-r32-note", "page": 18, "bbox": [860, 728, 1080, 754], "expected": "1. UNIT SHALL UTILIZE R-32 REFRIGERANT", "mode": "exact"},
            {"id": "m601-cv1-serves-ahu1", "page": 18, "bbox": [1210, 1105, 1340, 1126], "expected": "1. CV-1 SERVES AHU-1", "mode": "exact"},
            {"id": "m601-cv2-serves-ahu2", "page": 18, "bbox": [1210, 1121, 1340, 1142], "expected": "2. CV-2 SERVES AHU-2", "mode": "exact"},
            {"id": "m601-ahus-replace-actuators-note", "page": 18, "bbox": [1880, 1198, 2490, 1220], "expected": "2. CLEAN ALL COILS, REPLACE FAN BELTS, AND DAMPER ACTUATORS. ENSURE DAMPER ARE IN OPERATING CONDITION.", "mode": "exact"},
            {"id": "m601-vav-existing-note", "page": 18, "bbox": [2025, 1528, 2320, 1558], "expected": "NOTES: 1. EXISTING VAV UNIT. INFORMATION PROVIDED FOR BALANCING.", "mode": "exact"},
            {"id": "m601-edh-three-stages-note", "page": 18, "bbox": [2290, 1830, 2565, 1865], "expected": "NOTES: 1. PROVIDE DUCT HEATER WITH A MINIMUM OF THREE STAGES.", "mode": "exact"},
        ],
        "schedule_scope": {
            "air_device_matrix": "The separate four-row Air Device Schedule has rotated headers and an accessory X-matrix. It will be retained in a dedicated literal-source-row module rather than silently assigning rotated/merged marks to equipment rows.",
            "control_valve_schedule": "Present: two complete hydronic control-valve rows, CV-1 and CV-2, including GPM, pressure drop, Cv, configuration, fluid and fail position.",
            "damper_actuator_schedule": "No standalone actuator schedule is asserted. The M-601 note says to replace damper actuators, and legends/sequences show damper context, but no separate actuator tag/make/torque/signal/fail-action schedule is supplied.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
