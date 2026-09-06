"""Make a ledger-shaped projection of the already-authorized point matrices.

This does not read the PDF or discover points.  It selects point identifier and
description cells from the strict, independently checked full-matrix authoring
module so the generic bundle can present literal source rows without treating
trend/alarm/graphic marks as hardware ownership.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "05__vol2__009"
INPUT = AUDIT / "work" / IDENT / "points_m801_m804.json"
OUT = AUDIT / "work" / IDENT / "points_rank05_ledger.json"


def main():
    source = json.loads(INPUT.read_text())
    tables = []
    for table in source["tables"]:
        cols = table["columns"].split("|")
        code = cols.index("point_id")
        desc = cols.index("description")
        rows = []
        for line in table["rows"]:
            cells = line.split("|")
            rows.append(cells[code] + "|" + cells[desc])
        tables.append({
            "id": table["id"] + "-LEDGER",
            "sheet": table["sheet"], "page": table["page"],
            "title_as_printed": table["title_as_printed"],
            "columns": "tag|point_name",
            "x_edges": [table["x_edges"][0], table["x_edges"][1], table["x_edges"][2]],
            "y_ranges": table["y_ranges"], "rows": rows,
            "source_row_semantics": "Literal point-list identifier and description, projected without renaming from points_m801_m804.json. Trend/alarm/graphic marks remain in that full source-matrix component.",
        })
    data = {
        "document_id": IDENT,
        "module_role": "Ledger-form projection of the 75 already-authored M-801 through M-804 point-list rows for source-row application presentation. It adds no PDF fact or physical ownership.",
        "tables": tables,
        "assertions": [],
        "source_boundary": "Use the full points_m801_m804 component for literal trend/alarm/graphic mark columns. This ledger preserves identifier and description only, including repeated printed identifiers.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
