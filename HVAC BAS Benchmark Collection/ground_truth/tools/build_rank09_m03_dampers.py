"""Literal, bounded control-damper/actuator schedule capture for Rank 09."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "09__vol2__014"
OUT = AUDIT / "work" / IDENT / "schedules_m03_dampers.json"


def r(y0, y1, *cells):
    return (y0, y1, "|".join(cells))


def main():
    rows = [
        r(102, 126, "CD-A1", "BASE", "RUSKIN", "CD40x2", "17'-0\" x 7'-0\"", "TWO-ROW, OPPOSED BLADE, LOW-LEAKAGE, INSULATED", "OUTDOOR AIR INTAKE FOR AHU-A1", "75,000", "WALL", "MODULATING, FAIL-CLOSED", "SEE BELOW"),
        r(126, 149, "CD-A2", "(E)", "-", "-", "10'-0\" x 10'-0\"", "VERIFY IN FIELD", "LOW VELOCITY WIND TUNNEL ISOLATION", "75,000", "DUCT IN-LINE BELOW ROOF", "TWO-POSITION, FAIL-OPEN", "SEE BELOW"),
        r(149, 172, "CD-A3", "(E)", "-", "-", "5'-0\" x 5'-0\"", "VERIFY IN FIELD", "HIGH VELOCITY WIND TUNNEL ISOLATION", "75,000", "DUCT IN-LINE BELOW ROOF", "TWO-POSITION, FAIL-OPEN", "SEE BELOW"),
        r(172, 195, "CD-A4", "BASE", "RUSKIN", "CD60", "3'-0\" x 2'-6\"", "OPPOSED BLADE, LOW-LEAKAGE", "BURN CHAMBER RECIRCULATION", "30,000", "DUCT ABOVE FLOOR", "MODULATING, FAIL-OPEN", "SEE BELOW"),
        r(197, 231, "CD-A5", "BASE", "RUSKIN", "CD60", "17'-0\" x 4'-0\"", "OPPOSED BLADE, LOW-LEAKAGE", "WIND TUNNEL COMMON RECIRCULATION", "75,000", "WALL", "MODULATING, FAIL-OPEN", "SEE BELOW"),
        r(233, 257, "CD-A6", "BASE", "RUSKIN", "CD60", "17'-0\" x 4'-0\"", "OPPOSED BLADE, LOW-LEAKAGE", "SMOKE RELIEF DAMPER", "75,000", "WALL", "MODULATING, FAIL-OPEN", "SEE BELOW"),
        r(257, 280, "CD-A7", "(E)", "-", "-", "40'-0\" x 2'-6\"", "VERIFY IN FIELD", "SUPPLY AIR PLENUM", "75,000", "WALL", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
        r(280, 303, "CD-A8", "ALT. 12", "RUSKIN", "CD60", "30'-0\" x 1'-0\"", "OPPOSED BLADE, LOW-LEAKAGE", "SUPPLY TO RELIEF BYPASS", "30,000", "PLENUM", "MODULATING, FAIL-CLOSED", "SEE BELOW"),
        r(304, 327, "CD-A9", "(E)", "-", "-", "11'-0\" x 8'-0\"", "VERIFY IN FIELD", "FLUE STACK SMOKE EXHAUST", "17,500", "ROOF VENTILATOR", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
        r(328, 351, "CD-A10", "BASE", "RUSKIN", "CD60", "14\"x24\"", "OPPOSED BLADE, LOW-LEAKAGE", "BOILER ROOM INTAKE LOUVER", "600", "WALL", "TWO-POSITION, FAIL-CLOSED", "SEE BELOW"),
        r(352, 385, "CD-A11", "ALT. 10", "RUSKIN", "CD60", "18\"x24\"", "OPPOSED BLADE, LOW-LEAKAGE", "AIR CONDITIONING EQUIPMENT INTAKE LOUVER", "900", "WALL", "TWO-POSITION, FAIL-CLOSED", "SEE BELOW"),
        r(386, 409, "CD-A12", "BASE", "RUSKIN", "CD60", "24\"x24\"", "OPPOSED BLADE, LOW-LEAKAGE", "MECHANICAL LOFT INTAKE LOUVER", "1,200", "WALL", "TWO-POSITION, FAIL-CLOSED", "SEE BELOW"),
        r(410, 434, "CD-A13", "ALT. 3", "RUSKIN", "CD60", "14\"x12\"", "OPPOSED BLADE, LOW-LEAKAGE", "VAV SA ZONE 1", "1,240", "DUCT", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
        r(434, 458, "CD-A14", "ALT. 3", "RUSKIN", "CD60", "20\"x12\"", "OPPOSED BLADE, LOW-LEAKAGE", "VAV SA ZONE 2", "1,590", "DUCT", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
        r(458, 482, "CD-A15", "ALT. 3", "RUSKIN", "CD60", "24\"x12\"", "OPPOSED BLADE, LOW-LEAKAGE", "VAV SA ZONE 3", "2,460", "DUCT", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
        r(482, 506, "CD-A16", "ALT. 3", "RUSKIN", "CD60", "14\"x12\"", "OPPOSED BLADE, LOW-LEAKAGE", "VAV SA ZONE 4", "905", "DUCT", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
        r(506, 530, "CD-A17", "ALT. 3", "RUSKIN", "CD60", "10\"x8\"", "OPPOSED BLADE, LOW-LEAKAGE", "VAV SA ZONE 5", "205", "DUCT", "MODULATING, FAIL LAST POSITION", "SEE BELOW"),
    ]
    table = {
        "id": "M03-CONTROL-DAMPER-SCHEDULE",
        "sheet": "M0.3",
        "page": 3,
        "title_as_printed": "CONTROL DAMPER SCHEDULE",
        "columns": "mark|base_alt_or_existing|manufacturer|model_number|size|type|function|max_cfm|mounting|control|notes",
        "x_edges": [1470, 1535, 1600, 1660, 1745, 1820, 1965, 2090, 2150, 2230, 2330, 2430],
        "y_ranges": [[a, b] for a, b, _ in rows],
        "rows": [line for _, _, line in rows],
        "row_reading_order": "right",
        "header_evidence": [{"bbox": [1480, 35, 1870, 75], "expected": "CONTROL DAMPER SCHEDULE"}],
        "source_row_semantics": "Complete literal schedule row. It preserves the printed control/fail-state field and schedule notes without inferring installed multiplicity, physical actuator count, torque, wiring, final controller I/O, or plan placement.",
    }
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal-row capture of the 17-row M0.3 CONTROL DAMPER SCHEDULE, including printed control mode and failure position.",
        "tables": [table],
        "assertions": [],
        "damper_actuator_schedule_scope": {
            "status": "published_and_captured",
            "finding": "M0.3 explicitly publishes a CONTROL DAMPER SCHEDULE with 17 literal rows and printed control/fail-state entries. Schedule note 5 separately addresses actuator torque and control-power responsibility; that clause is retained in the controls context module.",
            "boundary": "A schedule row with a control field is not expanded into a count of physical actuators, end switches, linkage sets, wiring runs, BAS I/O, or installed dampers beyond the literal row itself.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
