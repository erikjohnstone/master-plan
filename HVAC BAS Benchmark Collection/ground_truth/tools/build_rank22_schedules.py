"""Complete equipment schedule-row capture from M601 for Rank 22."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "22__vol2__012"
OUT = AUDIT / "work" / IDENT / "schedules_m601.json"


def table(id_, title, x0, x1, ranges, rows, header=None):
    value = {
        "id": id_, "sheet": "M601", "page": 19, "title_as_printed": title,
        "columns": "literal_source_row_as_printed", "x_edges": [x0, x1],
        "y_ranges": ranges, "rows": rows, "row_reading_order": "right",
        "source_row_semantics": "Complete literal printed equipment-schedule row. It remains source specification evidence and is not converted into a plan-placement, installed-multiplicity, controller-I/O, wiring, ownership, or physical takeoff assertion.",
    }
    if header:
        value["header_evidence"] = [{"bbox": header, "expected": title}]
    return value


def main():
    chillers = [
        "CH-1 DAIKIN WMC060DDSNA MAG. BEARING 300.0 WATER 162.8 598.5 6.93 56 44.0 0.0001 WATER 912.3 14.6 85 94.3 0.00025 R-513A A1 1,093 0.5851 0.3407 188.6 55.2 94.5 15531 480 / 3 65,000 286 350 1-9",
        "CH-2 DAIKIN WMC060DDSNA MAG. BEARING 300.0 WATER 162.8 598.5 6.93 56 44.0 0.0001 WATER 912.3 14.6 85 94.3 0.00025 R-513A A1 1,093 0.5851 0.3407 188.6 55.2 94.5 15531 480 / 3 65,000 286 350 1-9",
        "CH-3 DAIKIN WMC060DDSNA MAG. BEARING 300.0 WATER 162.8 598.5 6.93 56 44.0 0.0001 WATER 912.3 14.6 85 94.3 0.00025 R-513A A1 1,093 0.5851 0.3407 188.6 55.2 94.5 15531 480 / 3 65,000 286 350 1-9",
    ]
    towers = [
        "INDUCED DRAFT 480V / 3PH / CT-1 MARLEY AV6807RAN 1 300 900 95 85 78.7 2 1 25 70 9 kW 20 12,810 1-14 CROSSFLOW 60 HZ",
        "INDUCED DRAFT 480V / 3PH / CT-2 MARLEY AV6807RAN 1 300 900 95 85 78.7 2 1 25 70 9 kW 20 12,810 1-14 CROSSFLOW 60 HZ",
        "INDUCED DRAFT 480V / 3PH / CT-3 MARLEY AV6807RAN 1 300 900 95 85 78.7 2 1 25 70 9 kW 20 12,810 1-14 CROSSFLOW 60 HZ",
    ]
    pumps = [
        "CONDENSER CWP-1 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 80 900 1698 30 480 40 3 1-2 WATER",
        "CONDENSER CWP-2 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 80 900 1698 30 480 40 3 1-2 WATER",
        "CONDENSER CWP-3 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 80 900 1698 30 480 40 3 1-2 WATER",
        "PRIMARY - CHILLED PCHP-1 BELL & GOSSETT e-1510 END SUCTION 5\" 4\" 45 600 1650 10 480 14 3 1-2 WATER",
        "PRIMARY - CHILLED PCHP-2 BELL & GOSSETT e-1510 END SUCTION 5\" 4\" 45 600 1650 10 480 14 3 1-2 WATER",
        "PRIMARY - CHILLED PCHP-3 BELL & GOSSETT e-1510 END SUCTION 5\" 4\" 45 600 1650 10 480 14 3 1-2 WATER",
        "SECONDARY - SCHP-1 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 100 1200 1645 50 480 65 3 1-2 CHILLED WATER",
        "SECONDARY - SCHP-2 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 100 1200 1645 50 480 65 3 1-2 CHILLED WATER",
        "PRIMARY - HEATING PHWP-1 BELL & GOSSETT e-1510 END SUCTION 4\" 3\" 45 340 1615 7.5 480 11 3 1-2 HW",
        "PRIMARY - HEATING PHWP-2 BELL & GOSSETT e-1510 END SUCTION 4\" 3\" 45 340 1615 7.5 480 11 3 1-2 HW",
        "PRIMARY - HEATING PHWP-3 BELL & GOSSETT e-1510 END SUCTION 4\" 3\" 45 340 1615 7.5 480 11 3 1-2 HW",
        "SECONDARY - SHWP-1 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 100 1000 1680 40 480 52 3 1-2 HEATING HW",
        "SECONDARY - SHWP-2 BELL & GOSSETT e-1510 END SUCTION 6\" 5\" 100 1000 1680 40 480 52 3 1-2 HEATING HW",
    ]
    data = {
        "document_id": IDENT,
        "module_role": "All 24 printed M601 equipment-schedule rows: chillers, cooling towers, expansion tank, air separators, chemical feeders, and pumps.",
        "tables": [
            table("M601-WATER-COOLED-CHILLERS", "WATER-COOLED CHILLER SCHEDULE", 560, 2260, [[201, 221], [221, 236], [236, 251]], chillers, [560, 110, 950, 140]),
            table("M601-COOLING-TOWERS", "COOLING TOWER SCHEDULE", 1190, 2265, [[507, 537], [537, 567], [567, 597]], towers, [1180, 415, 1500, 440]),
            table("M601-EXPANSION-TANK", "EXPANSION TANK SCHEDULE", 1110, 2268, [[955, 974]], ["ET-1 CHILLED WATER BELL & GOSSETT B300 54.96 28.75 80.0 80.0 40 / 100 40 / 100 5,000 WATER 125 1"], [1110, 885, 1430, 915]),
            table("M601-AIR-SEPARATORS", "AIR SEPARATOR SCHEDULE", 760, 1405, [[1129, 1149], [1158, 1179]], [
                "AS-1 CHILLED WATER BELL & GOSSETT RL-12F 4,800 291 12 3,538 1",
                "HEATING AS-2 BELL & GOSSETT RL-10F 3,600 150 10 2,052 1 HOT WATER",
            ], [760, 1060, 1065, 1090]),
            table("M601-CHEMICAL-FEEDERS", "CHEMICAL FEEDER SCHEDULE", 1030, 1405, [[1337, 1354], [1354, 1371]], [
                "CF-1 NEPTUNE CHW SYSTEM DBFC-5 5 GAL. 1",
                "CF-2 NEPTUNE HHW SYSTEM DBFC-5 5 GAL. 1",
            ], [1030, 1270, 1335, 1305]),
            table("M601-PUMPS", "PUMP SCHEDULE", 1440, 2269, [[1145 + 30*i, 1175 + 30*i] for i in range(len(pumps))], pumps, [1440, 1060, 1630, 1090]),
        ],
        "assertions": [],
        "schedule_scope": "M601's complete 24-row equipment-schedule corpus is preserved as coordinate-bounded literal rows. The same sheet's piping-material/insulation table is visually reviewed as construction-specification context; it is not included in this equipment-row quantity because it does not identify equipment instances.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
