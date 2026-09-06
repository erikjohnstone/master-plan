"""Author M5.1 diffuser and grille schedule rows without hiding symbol-cell text."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "ground_truth" / "work" / "04__vol2__062"
IDENT = "04__vol2__062"


def main():
    diffusers = [
        "D-1 CFM 6\"Ø|6X6|6\"Ø|0 - 90|1 , 2 , 3 , 4 , 5 , 6 , 7",
        "D-2 CFM 10\"Ø|10\"Ø|10\"Ø|0-350|1 , 3 , 4 , 5 , 6 , 7 , 9",
        "D-3 CFM 12\"Ø|12\"Ø|12\"Ø|0-400|1 , 3 , 4 , 5 , 6 , 7 , 9",
        "D-4 CFM 14\"Ø|14\"Ø|14\"Ø|0-550|1 , 3 , 4 , 5 , 6 , 7 , 9",
        "D-5 CFM 6\"Ø|13\"Ø|6\"Ø|0 - 90|1 , 3 , 4 , 5 , 6 , 7 , 8",
        "D-6 CFM 8\"Ø|18\"Ø|8\"Ø|90 - 200|1 , 3 , 4 , 5 , 6 , 7 , 8",
        "D-7 CFM 10\"Ø|22\"Ø|10\"Ø|200 - 350|1 , 3 , 4 , 5 , 6 , 7 , 8",
    ]
    grilles = [
        "R-1 8\"Ø|10X10|8\"Ø|80-180|1 , 2 , 3 , 4 , 5 , 6",
        "R-2 10X6|10X6|10X6|0-200|1 , 3 , 5 , 6 , 7",
        "R-3 12X8|12X8|12X8|200-300|1 , 3 , 5 , 6 , 7",
        "R-4 18X10|18X10|18X10|300-550|1 , 3 , 5 , 6 , 7",
    ]
    tag_rows = [
        {"id": "d1", "tag": "D-1", "page": 13, "bbox": [1310, 810, 1338, 823]},
        {"id": "d2", "tag": "D-2", "page": 13, "bbox": [1310, 846, 1338, 859]},
        {"id": "d3", "tag": "D-3", "page": 13, "bbox": [1310, 882, 1338, 895]},
        {"id": "d4", "tag": "D-4", "page": 13, "bbox": [1310, 918, 1338, 931]},
        {"id": "d5", "tag": "D-5", "page": 13, "bbox": [1310, 954, 1338, 967]},
        {"id": "d6", "tag": "D-6", "page": 13, "bbox": [1310, 989, 1338, 1003]},
        {"id": "d7", "tag": "D-7", "page": 13, "bbox": [1310, 1025, 1338, 1039]},
        {"id": "r1", "tag": "R-1", "page": 13, "bbox": [1820, 814, 1848, 828]},
        {"id": "r2", "tag": "R-2", "page": 13, "bbox": [1820, 850, 1848, 864]},
        {"id": "r3", "tag": "R-3", "page": 13, "bbox": [1820, 886, 1848, 900]},
        {"id": "r4", "tag": "R-4", "page": 13, "bbox": [1820, 922, 1848, 936]},
    ]
    assertions = [
        {"id": "m51-diffuser-title", "page": 13, "bbox": [1400, 735, 1650, 775], "expected": "DIFFUSER SCHEDULE", "mode": "exact"},
        {"id": "m51-return-grille-title", "page": 13, "bbox": [1810, 735, 2260, 775], "expected": "RETURN & EXHAUST GRILLE SCHEDULE", "mode": "exact"},
    ]
    for item in tag_rows:
        assertions.append({"id": "m51-device-tag-" + item["id"], "page": item["page"], "bbox": item["bbox"], "expected": item["tag"], "mode": "exact"})
    data = {
        "document_id": IDENT,
        "module_role": "M5.1 air-device schedule capture. The printed symbol cells carry a tag plus stacked CFM/size graphic text, so the source_symbol_cell is retained verbatim and a separate tight bounded tag registry records each unique tag without pretending that the surrounding graphic text is absent.",
        "symbol_registry": {
            "boundary": "These are source schedule identities and performance ranges. They do not constitute a plan placement count or a damper-actuator count.",
            "records": [{"tag": item["tag"], "assertion_ids": ["m51-device-tag-" + item["id"]]} for item in tag_rows],
        },
        "tables": [
            {"id": "M51-DIFFUSERS", "sheet": "M5.1", "page": 13, "title_as_printed": "DIFFUSER SCHEDULE", "columns": "source_symbol_cell|nominal_size|neck_runout_size|cfm_range|remarks", "x_edges": [1300, 1360, 1450, 1540, 1635, 1760], "y_ranges": [[805, 840], [842, 876], [878, 912], [914, 948], [950, 984], [986, 1020], [1022, 1056]], "rows": diffusers, "row_semantics": "Printed schedule row; the first column preserves the source symbol-cell's stacked tag/CFM/size text."},
            {"id": "M51-RETURN-EXHAUST-GRILLES", "sheet": "M5.1", "page": 13, "title_as_printed": "RETURN & EXHAUST GRILLE SCHEDULE", "columns": "source_symbol_cell|nominal_size|neck_runout_size|cfm_range|remarks", "x_edges": [1810, 1855, 1960, 2050, 2150, 2300], "y_ranges": [[805, 840], [842, 876], [878, 912], [914, 948]], "rows": grilles, "row_semantics": "Printed schedule row; the first column preserves the source symbol-cell's stacked tag/CFM/size text."},
        ],
        "assertions": assertions,
        "inventory_checks": [
            {"id": "rank04-m51-air-device-tables", "records_path": ["tables"], "expected": 2, "unique_key": "id"},
            {"id": "rank04-m51-air-device-tags", "records_path": ["symbol_registry", "records"], "expected": 11, "unique_key": "tag"},
        ],
    }
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "schedules_m51_air_devices.json").write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
