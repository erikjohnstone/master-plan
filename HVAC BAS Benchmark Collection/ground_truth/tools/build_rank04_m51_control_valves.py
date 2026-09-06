"""Author the M5.1 hydronic control-valve schedule as literal source rows."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "04__vol2__062"
IDENT = "04__vol2__062"


def source_row_table(identifier, title, x0, x1, y_ranges, rows):
    return {
        "id": identifier,
        "sheet": "M5.1",
        "page": 13,
        "title_as_printed": title,
        "columns": "literal_source_row",
        "x_edges": [x0, x1],
        "y_ranges": y_ranges,
        "rows": rows,
        "row_semantics": "One manually visual-reviewed printed source row, bounded to the source schedule grid. Wrapped source cells retain their native reading order; values are not normalized or supplemented.",
    }


def main():
    reheat_rows = [
        "CV-1|HC-1|RESIDENCY LAB 131 / SAV-1|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|9.0|6.0 TO 42.0|5.0|5.0|1-1/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-2|HC-2|SOIL/AGGREGATE 126 / SAV-2|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|2.0|0.97 TO 5.85|5.0|5.0|3/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-3|HC-3|ASPHALT LAB 124 / SAV-3|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|9.0|6.0 TO 42.0|5.0|5.0|1-1/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-4|HC-4|D-1 LAB 123 / SAV-4|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|5.2|2.64 TO 15.89|5.0|5.0|1\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-5|HC-5|CONCRETE 119 / SAV-5|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|2.0|0.44 TO 2.53|5.0|5.0|3/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-6|HC-6|MATERIAL LAB 118 / SV-6|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|2.7|0.44 TO 2.53|5.0|5.0|3/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-7|HC-7|ASPHALT LAB 117 / SV-7|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|9.0|0.44 TO 2.53|5.0|5.0|3/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-8|HC-8|RESIDENCY NOISE ROOM 130 / SAV-8|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|2.3|0.44 TO 2.53|5.0|5.0|3/4\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
        "CV-9|HC-9|GENERAL LAB 125 / SAV-9|PRESSURE INDEPENDENT FIELD ADJUSTABLE CONTROL VALVE W/ 100% AUTHORITY|2-WAY MODULATING|35% PROPYLENE GLYCOL|4.4|2.64 TO 15.89|5.0|5.0|1\"|BELL & GOSSETT ULTRA SETTER|1 , 2 , 3 , 4 , 5",
    ]
    bypass_row = [
        "PRESSURE 2-WAY REFER TO THE CONTROL BCV-1 HEATING WATER SYSTEM 100% WATER 25 19-110 2.7 5.0 2.0 B&G ULTRA SETTER 1 , 2 , 3 INDEPENDENT MODULATING SCHEMATICS",
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Literal source-row capture of the M5.1 hot-water reheat and bypass control-valve schedules. This source publishes hydronic control-valve data; no damper-actuator schedule is inferred from it.",
        "control_valve_schedule_scope": {
            "sheet": "M5.1 / PDF p13",
            "reheat_control_valves": ["CV-1", "CV-2", "CV-3", "CV-4", "CV-5", "CV-6", "CV-7", "CV-8", "CV-9"],
            "bypass_control_valve": ["BCV-1"],
            "printed_column_context_reheat": ["SYMBOL", "HOT WATER COIL", "AREA SERVED", "VALVE TYPE", "OPERATION", "FLUID", "FLOW (GPM)", "FLOW RANGE (GPM)", "P.D. (PSI)", "MAXIMUM P.D. (PSI)", "SIZE (IN)", "MANUFACTURER AND MODEL", "REMARKS"],
            "printed_column_context_bypass": ["SYMBOL", "SERVES", "VALVE TYPE", "OPERATION", "FLUID", "FLOW (GPM)", "FLOW RANGE (GPM)", "P.D. (PSI)", "MAXIMUM P.D. (PSI)", "SIZE (IN)", "CONTROL", "MANUFACTURER AND MODEL", "REMARKS"],
            "quantity_boundary": "The schedule gives control-valve rows, not a global actuator, field-I/O, terminal or field-wiring count. The associated M6 controls sheets are retained separately for behavior and point context.",
        },
        "tables": [
            {
                "id": "M51-HOT-WATER-REHEAT-CONTROL-VALVES",
                "sheet": "M5.1",
                "page": 13,
                "title_as_printed": "CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)",
                "columns": "tag|hot_water_coil|area_served|valve_type|operation|fluid|flow_gpm|flow_range_gpm|pressure_drop_psi|maximum_pressure_drop_psi|size_in|manufacturer_model|remarks",
                "x_edges": [170, 255, 320, 470, 600, 680, 750, 795, 840, 890, 930, 995, 1165, 1250],
                "y_ranges": [[1087, 1123], [1127, 1163], [1167, 1203], [1206, 1242], [1246, 1282], [1285, 1321], [1325, 1361], [1365, 1401], [1405, 1437]],
                "rows": reheat_rows,
                "row_semantics": "One M5.1 source control-valve row with individual source cells retained. The flow-range cell prints its lower and upper values separated by TO; no Cv, actuator torque, signal or fail position beyond the printed source is added.",
            },
            source_row_table("M51-BYPASS-CONTROL-VALVE", "BYPASS CONTROL VALVE SCHEDULE", 1300, 2415,
                             [[1438, 1471]], bypass_row),
        ],
        "assertions": [
            {"id": "m51-reheat-control-valve-title", "page": 13, "bbox": [380, 970, 1020, 1020], "expected": "CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)", "mode": "exact"},
            {"id": "m51-bypass-control-valve-title", "page": 13, "bbox": [1450, 1355, 2320, 1410], "expected": "BYPASS CONTROL VALVE SCHEDULE", "mode": "exact"},
        ],
        "inventory_checks": [{"id": "rank04-m51-control-valve-tables", "records_path": ["tables"], "expected": 2, "unique_key": "id"}],
    }
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "schedules_m51_control_valves.json").write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
