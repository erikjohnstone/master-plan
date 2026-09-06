"""Capture the published M6.02 BACnet-input table without I/O reclassification."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "17__vol1__16"
OUT = AUDIT / "work" / IDENT / "points_m602.json"


def main():
    rows = [
        "1.|SA TEMPERATURE SETPOINT", "2.|SA AIRFLOW", "3.|OA DAMPER POSITION",
        "4.|EA DAMPER POSITION", "5.|SA FAN LEVEL", "6.|SA FILTER PRESSURE DROP",
        "7.|EA FILTER PRESSURE DROP", "8.|EA AIRFLOW", "9.|EA FAN LEVEL",
        "10.|ALARMS", "11.|SA MINIMUM SETPOINT", "12.|SA MAXIMUM SETPOINT",
    ]
    data = {
        "document_id": IDENT,
        "module_role": "Published 12-row BACnet Inputs to BMS list within the M6.02 C-Wing energy-recovery-ventilator control diagram.",
        "tables": [{
            "id": "M602-BACNET-POINTS-INPUTS-TO-BMS", "sheet": "M6.02", "page": 28,
            "title_as_printed": "BACNET POINTS INPUTS TO BMS", "columns": "tag|point_name",
            "x_edges": [1060, 1097, 1235],
            "y_ranges": [[1671.5 + 21.35*i, 1671.5 + 21.35*(i + 1)] for i in range(12)],
            "rows": rows,
            "source_row_semantics": "Complete literal source list labeled BACnet Points Inputs to BMS. The source does not classify the rows as physical AI/AO/BI/BO, assign a final controller/card/terminal, or establish field-device ownership.",
        }],
        "assertions": [
            {"id": "m602-bacnet-inputs-title", "page": 28, "bbox": [1065, 1600, 1260, 1640], "expected": "BACNET POINTS", "mode": "contains"},
            {"id": "m602-furnace-diagram-ai2", "page": 28, "bbox": [555, 267, 582, 285], "expected": "AI-2", "mode": "exact"},
            {"id": "m602-furnace-diagram-supply-air-temp", "page": 28, "bbox": [400, 269, 485, 288], "expected": "SUPPLY AIR TEMP", "mode": "contains"},
            {"id": "m602-furnace-diagram-ai3", "page": 28, "bbox": [555, 310, 582, 328], "expected": "AI-3", "mode": "exact"},
            {"id": "m602-furnace-diagram-return-air-temp", "page": 28, "bbox": [398, 310, 485, 330], "expected": "RETURN AIR TEMP", "mode": "contains"},
            {"id": "m602-furnace-diagram-ai4", "page": 28, "bbox": [555, 352, 582, 369], "expected": "AI-4", "mode": "exact"},
            {"id": "m602-furnace-diagram-mixed-air-temp", "page": 28, "bbox": [390, 360, 470, 379], "expected": "MIXED AIR TEMP", "mode": "contains"},
            {"id": "m602-furnace-diagram-bi6", "page": 28, "bbox": [555, 418, 582, 436], "expected": "BI-6", "mode": "exact"},
            {"id": "m602-furnace-diagram-supply-fan-status", "page": 28, "bbox": [430, 409, 535, 428], "expected": "SUPPLY FAN STATUS", "mode": "contains"},
            {"id": "m602-furnace-diagram-ao1", "page": 28, "bbox": [1135, 460, 1170, 481], "expected": "AO-1", "mode": "contains"},
            {"id": "m602-furnace-diagram-economizer", "page": 28, "bbox": [1220, 485, 1300, 505], "expected": "ECONOMIZER", "mode": "contains"},
        ],
        "diagram_label_context": "The retained AI/BI/BO/AO labels are bounded diagram-local controller-label context. They are intentionally not expanded into a projectwide point list, final terminal/card count, or physical device inventory.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
