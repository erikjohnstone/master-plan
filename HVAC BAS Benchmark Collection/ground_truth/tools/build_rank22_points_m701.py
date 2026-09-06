"""Literal M701 chilled-water DDC hardwired I/O matrix for Rank 22.

The source matrix carries additional integration/UI/alarming flags to the right
of the four DDC hardwired columns.  This module deliberately retains every
printed point row and its four published DI/DO/AI/AO flags, while leaving the
other source flag families in the reviewed source rather than recasting them
as hardwired field I/O.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "22__vol2__012"
OUT = AUDIT / "work" / IDENT / "points_m701.json"


def point(number, name, di="", do="", ai="", ao=""):
    return "|".join([str(number), name, di, do, ai, ao])


def chiller_rows(unit, start):
    prefix = f"CHILLER {unit} - "
    names_and_flags = [
        ("REMOTE ENABLE", "", "X", "", ""),
        ("STATUS", "", "", "", ""),
        ("FAULT ALARM", "", "", "", ""),
        ("% UNIT LOADING", "", "", "", ""),
        ("CONDENSER WATER VALVE COMMAND", "", "", "", "X"),
        ("CONDENSER WATER VALVE FEEDBACK", "", "", "X", ""),
        ("CHILLED WATER VALVE COMMAND", "", "", "", "X"),
        ("CHILLED WATER VALVE FEEDBACK", "", "", "X", ""),
        ("CONDENSER WATER DP SENSOR", "", "", "X", ""),
        ("CHILLED WATER DP SENSOR", "", "", "X", ""),
        ("CONDENSER WATER SUPPLY TEMP.", "", "", "X", ""),
        ("CONDENSER WATER RETURN TEMP.", "", "", "X", ""),
        ("CHILLED WATER SUPPLY TEMP.", "", "", "X", ""),
        ("CHILLED WATER RETURN TEMP.", "", "", "X", ""),
    ]
    return [point(start + offset, prefix + name, di, do, ai, ao)
            for offset, (name, di, do, ai, ao) in enumerate(names_and_flags)]


def pump_rows(prefix, units, start):
    suffixes = [
        ("PUMP START/STOP", "", "X", "", ""),
        ("PUMP RUN STATUS", "X", "", "", ""),
        ("PUMP SPEED COMMAND", "", "", "", "X"),
        ("PUMP FAULT", "X", "", "", ""),
    ]
    rows = []
    number = start
    for unit in units:
        for suffix, di, do, ai, ao in suffixes:
            rows.append(point(number, f"{prefix}-{unit} {suffix}", di, do, ai, ao))
            number += 1
    return rows


def cooling_tower_rows(unit, start):
    entries = [
        ("VALVE COMMAND", "", "", "", "X"),
        ("VALVE FEEDBACK", "", "", "X", ""),
        ("BASIN LEVEL", "", "", "X", ""),
        ("FAN START/STOP", "", "X", "", ""),
        ("RUN STATUS", "X", "", "", ""),
        ("SPEED COMMAND", "", "", "", "X"),
        ("PUMP FAULT", "X", "", "", ""),
    ]
    return [point(start + offset, f"COOLING TOWER {unit} {name}", di, do, ai, ao)
            for offset, (name, di, do, ai, ao) in enumerate(entries)]


def rows():
    values = [point(1, "CHILLED WATER SYSTEM ENABLE")]
    values += chiller_rows(1, 2) + chiller_rows(2, 16) + chiller_rows(3, 30)
    values += pump_rows("PCHP", [1, 2, 3], 44)
    values += pump_rows("SCHP", [1, 2], 56)
    values += cooling_tower_rows(1, 64) + cooling_tower_rows(2, 71) + cooling_tower_rows(3, 78)
    values += pump_rows("CWP", [1, 2, 3], 85)
    values += [
        point(97, "CONDENSER WATER 3-WAY VALVE", "", "", "", "X"),
        point(98, "CHILLED WATER SUPPLY TEMP.", "", "", "X", ""),
        point(99, "CHILLED WATER RETURN TEMP.", "", "", "X", ""),
        point(100, "CHILLED WATER DIFFERENTIAL PRESSURE SENSOR", "", "", "X", ""),
        point(101, "REFRIGERANT MONITOR", "X", "", "", ""),
    ]
    assert len(values) == 101
    return values


def main():
    values = rows()
    data = {
        "document_id": IDENT,
        "module_role": "All 101 literal M701 chilled-water-system DDC points with the printed DDC hardwired DI/DO/AI/AO flags.",
        "tables": [{
            "id": "M701-CHW-DDC-HARDWIRED-IO",
            "sheet": "M701", "page": 20,
            "title_as_printed": "DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM",
            "columns": "tag|point_name|digital_input|digital_output|analog_input|analog_output",
            "x_edges": [942, 960, 1190, 1207, 1224, 1241, 1256],
            "y_ranges": [[271 + 12.75 * i, 271 + 12.75 * (i + 1)] for i in range(len(values))],
            "rows": values, "row_reading_order": "right",
            "header_evidence": [
                {"bbox": [1188, 114, 1576, 135], "expected": "DDC POINTS LIST SUMMARY CHILLED WATER SYSTEM"},
            ],
            "source_row_semantics": "Every printed source point row and its four DDC hardwired I/O flags. Other right-hand source columns concern integration, GUI application, alarming and related operational flags; they are not recast as hardwired I/O or counted physical devices here.",
        }],
        "assertions": [],
        "point_scope": "M701 is a formal chilled-water DDC point-list matrix. It establishes source point names and published hardwired I/O classifications but does not publish controller/card/terminal assignment, wiring, installed-device quantities or physical ownership.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
