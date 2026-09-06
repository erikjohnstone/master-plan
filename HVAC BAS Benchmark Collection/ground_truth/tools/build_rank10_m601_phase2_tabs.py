"""Literal M601 phase-2 terminal-air-box schedule capture for Rank 10."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "10__vol2__040"
OUT = AUDIT / "work" / IDENT / "schedules_m601_phase2_tabs.json"


def r(y0, y1, *cells):
    return y0, y1, "|".join(cells)


def main():
    rows = [
        r(317, 326, "TAB-101", "CRAWL SPACE", "600", "600", "600", "46.0", "85.0", "150", "2.9", "10", "-", "-", "TAB-A", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(330, 339, "TAB-102", "DECONTAMINATION", "3600", "3900", "3900", "46.0", "85.0", "150", "11.0", "-", "24", "16", "TAB-C", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(343, 352, "TAB-103", "WATER TREATMENT/STORAGE", "525", "525", "525", "46.0", "95.0", "150", "2.8", "8", "-", "-", "TAB-A", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(355, 365, "TAB-104", "SCOPE PROCESSING", "625", "625", "625", "46.0", "85.0", "150", "3.2", "10", "-", "-", "TAB-C", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(368, 378, "TAB-105", "CLEAN WORKROOM", "1875", "1875", "1875", "46.0", "85.0", "150", "5.3", "-", "24", "16", "TAB-C", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(381, 391, "TAB-106", "CART WASHER", "1150", "1150", "1150", "46.0", "85.0", "150", "2.5", "12", "-", "-", "TAB-C", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(394, 404, "TAB-107", "STERILIZER AREA", "2875", "2875", "2875", "46.0", "85.0", "150", "8.1", "-", "24", "16", "TAB-C", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(407, 417, "TAB-108", "STORAGE STERILE DURABLES", "650", "650", "650", "46.0", "95.0", "150", "2.5", "8", "-", "-", "TAB-B", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(420, 430, "TAB-109", "UNLOADING/COOLING", "400", "400", "400", "46.0", "95.0", "150", "1.5", "8", "-", "-", "TAB-B", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(433, 443, "TAB-201", "ELECTRICAL ROOM", "400", "0", "150", "46.0", "0.0", "", "", "8", "-", "-", "TAB-E", "2", "TITUS", "DESV", "NOTES 1, 2"),
        r(446, 456, "TAB-202", "MECH ROOM", "600", "200", "200", "46.0", "95.0", "150", "1.1", "8", "-", "-", "TAB-B", "2", "TITUS", "DESV", "NOTES 1, 2"),
    ]
    table = {
        "id": "M601-TERMINAL-AIR-BOX-PHASE-2",
        "sheet": "M601", "page": 48,
        "title_as_printed": "TERMINAL AIR BOX SCHEDULE - SINGLE DUCT - PHASE 2",
        "columns": "tag_name|area_served|cooling_cfm_max|heating_cfm_max|heating_cfm_min|heating_eat_f|heating_lat_f|heating_ewt_f|max_gpm|min_inlet_dia_inches|min_inlet_width_inches|min_inlet_height_inches|control_type|sensor_type|manufacturer|model|remarks",
        "x_edges": [1900, 1980, 2120, 2180, 2240, 2280, 2315, 2345, 2380, 2425, 2480, 2520, 2575, 2630, 2690, 2790, 2850, 2925],
        "y_ranges": [[a, b] for a, b, _ in rows], "rows": [v for _, _, v in rows],
        "row_reading_order": "right",
        "header_evidence": [{"bbox": [1917, 145, 2449, 165], "expected": "TERMINAL AIR BOX SCHEDULE - SINGLE DUCT - PHASE 2"}],
        "source_row_semantics": "Complete literal schedule row. It preserves the printed airflow, coil, control and sensor-type fields without inferring a final physical device count, wiring, controller I/O, terminal, ownership or plan placement.",
    }
    data = {
        "document_id": IDENT,
        "module_role": "Complete literal 11-row capture of the M601 single-duct terminal-air-box schedule for Phase 2.",
        "tables": [table], "assertions": [],
        "source_boundary": "The schedule has printed control and sensor types. These fields remain schedule facts and are not expanded into controller, actuator, sensor, valve, wire, terminal or physical-I/O counts.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
