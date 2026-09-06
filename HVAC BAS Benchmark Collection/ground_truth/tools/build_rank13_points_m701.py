"""Literal M-703 ACU DDC point-matrix transcription for Rank 13."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "13__vol2__017"
OUT = AUDIT / "work" / IDENT / "points_m701.json"


def table(id_, scope, x0, x1, start, rows):
    return {
        "id": id_, "sheet": "M-703", "page": 17,
        "title_as_printed": "DDC INPUT/OUPUT POINT SCHEDULE - " + scope,
        "columns": "source_row_as_printed", "x_edges": [x0, x1],
        "y_ranges": [[start + 18*i, start + 18*(i+1)] for i in range(len(rows))],
        "rows": rows, "row_reading_order": "right",
        "source_row_semantics": "Complete literal printed DDC source-template row, including source flag marks and tag text. It is not expanded into installed controllers, terminal cards, wiring, devices or physical I/O totals."
    }


def main():
    acu_a1 = [
        "SUPPLY FAN STATUS SENSOR X X X X X VFD",
        "X RETURN FAN STATUS SENSOR X X X X VFD",
        "MIXED AIR TEMP SENSOR X T2",
        "COLD DECK TEMP SENSOR (E) X T3",
        "HOT DECK TEMP SENSOR (E) X T4",
        "RETURN AIR TEMP SENSOR (E) X T5",
        "RETURN AIR HUMIDITY SENSOR (E) X H2",
        "SUPPLY FAN AND RETURN FAN X X SF, RF, AFMS",
        "PREHEAT VALVE X V1",
        "COOLING VALVE X V2",
        "REHEAT VALVE X V3",
        "M1(E), M2, M4(E) DAMPERS X X",
        "MINIMUM OUTSIDE AIR DAMPER X X X M3, AFMS",
        "OUTSIDE AIR TEMP SENSOR X T1",
        "OUTSIDE HUMIDITY SENSOR X H1",
        "PURGE SWITCH X S1",
        "SMOKE DETECTOR X SD",
        "FILTER PRESSURE SENSOR X X DPS",
        "LEAK DETECTION X X LD",
    ]
    acu_a3_a6 = [
        "SUPPLY FAN STATUS SENSOR X X X X X VFD",
        "RETURN FAN STATUS SENSOR X X X X X VFD",
        "MIXED AIR TEMP SENSOR X T2",
        "SUPPLY AIR TEMP SENSOR X T3",
        "RETURN AIR TEMP SENSOR (E) X T4",
        "RETURN AIR HUMIDITY SENSOR (E) X H2",
        "SUPPLY FAN X X SF, AFMS",
        "RETURN FAN X X RF, AFMS",
        "PREHEAT VALVE X V1",
        "COOLING COIL VALVE X V2",
        "M1(E), M2, M4(E) DAMPERS X X",
        "MINIMUM OUTSIDE AIR DAMPER X X X M3, AFMS",
        "OUTSIDE AIR TEMP SENSOR X T1",
        "OUTSIDE HUMIDITY SENSOR X H1",
        "PURGE SWITCH X S1",
        "SMOKE DETECTOR X SD",
        "FILTER PRESSURE SENSOR X X DPS",
        "LEAK DETECTION X X LD",
        "HUMIDIFIER X X X X X X H-A-3",
        "STEAM CONTROL VALVE X V3",
        "RETURN AIR HUMIDITY SENSOR (E) X H2",
        "HL HIGH LIMIT HUMIDITY SENSOR X X X H",
        "AIRFLOW SWITCH X DP",
        "COLD WATER CONTROL VALVE X V4",
    ]
    acu_a2 = [
        "SUPPLY FAN STATUS SENSOR X X X X X VFD",
        "RETURN FAN STATUS SENSOR X X X X X VFD",
        "MIXED AIR TEMP SENSOR X T2",
        "SUPPLY AIR TEMP SENSOR X T3",
        "RETURN AIR TEMP SENSOR (E) X T4",
        "RETURN AIR HUMIDITY SENSOR (E) X H2",
        "SUPPLY FAN AND RETURN FAN X X SF, RF, AFMS",
        "PREHEAT VALVE X V1",
        "COOLING COIL VALVE X V2",
        "DAMPERS X X M1(E), M2, M4(E)",
        "MINIMUM OUTSIDE AIR DAMPER X X X M3, AFMS",
        "OUTSIDE AIR TEMP SENSOR X T1",
        "OUTSIDE HUMIDITY SENSOR X H1",
        "PURGE SWITCH X S1",
        "SMOKE DETECTOR X SD",
        "FILTER PRESSURE SENSOR X X DPS",
        "LEAK DETECTION X X LD",
    ]
    a1_table = table("M703-ACU-A1-DDC", "ACU A-1", 1870, 2700, 286, acu_a1)
    a1_table["parser_exclusions"] = [
        {"engine": "mupdf", "word_ids": [225, 226, 227],
         "reason": "MuPDF combines the printed parenthetical qualifier into three tokens while Poppler emits four reordered parenthesis tokens; the row's qualifier is retained in the visual source review but excluded from this strict cross-engine token comparison."},
        {"engine": "poppler", "word_ids": [360, 361, 362, 363, 364],
         "reason": "Poppler separates/reorders the printed parenthetical qualifier; see the paired MuPDF exclusion for the bounded parser disagreement."},
    ]
    data = {
        "document_id": IDENT,
        "module_role": "All 60 literal M-703 ACU DDC point-schedule rows for the three printed source-template scopes.",
        "tables": [
            a1_table,
            table("M703-ACU-A3-A6-DDC", "ACU A-3, A-4, A-5, AND A-6", 875, 1710, 286, acu_a3_a6),
            table("M703-ACU-A2-DDC", "ACU A-2", 1870, 2700, 1120, acu_a2),
        ],
        "assertions": [],
        "point_scope": "M-703 says the points are existing to remain and shown for reference only. Its local DDC templates are retained as printed and are not a final building controller, card, terminal, wiring, address or field-device schedule."
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
