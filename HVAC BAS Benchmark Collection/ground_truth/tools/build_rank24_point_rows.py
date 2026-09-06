"""Create bounded rank-24 point-list rows from visually reviewed M8 matrices.

The five source tables and their column bounds/counts are fixed below from the
page review.  This helper only serializes the literal words inside those
declared table cells.  Every generated cell is independently rechecked by
verify_tables.py against both retained raw-text engines.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "24__vol2__019"
POINT_TYPES = {"AI", "DI", "AO", "DO"}


def center(word, axis):
    return (word["bbox"][axis] + word["bbox"][axis + 2]) / 2


def words(page):
    return json.loads((AUDIT / "evidence" / IDENT / "mupdf" / f"{page:04d}.json").read_text())["words"]


def cell_text(source, x, y0, y1):
    chosen = [word for word in source if x[0] <= center(word, 0) < x[1] and y0 <= center(word, 1) < y1]
    chosen.sort(key=lambda word: (round(center(word, 1) / 3) * 3, word["bbox"][0]))
    return " ".join(word["text"] for word in chosen)


def matrix(table_id, page, sheet, title, x_name, x_tag, x_type, y, expected_rows):
    source = words(page)
    types = [word for word in source if word["text"] in POINT_TYPES and x_type[0] <= center(word, 0) < x_type[1]
             and y[0] <= center(word, 1) <= y[1]]
    types.sort(key=lambda word: center(word, 1))
    if len(types) != expected_rows:
        raise ValueError(f"{table_id}: expected {expected_rows} point rows, found {len(types)}")
    centers = [center(word, 1) for word in types]
    # Point labels occupy one printed baseline.  Use a narrow, literal band
    # around each point-type cell rather than the midpoint to its neighbours:
    # the drawings place section captions and unrelated diagrams between rows.
    # A 7-unit band retains same-baseline words in both parsers while excluding
    # those nearby captions.
    ranges = [[value - 7, value + 7] for value in centers]
    rows = []
    for word, (y0, y1) in zip(types, ranges):
        name = cell_text(source, x_name, y0, y1)
        tag = cell_text(source, x_tag, y0, y1)
        kind = cell_text(source, x_type, y0, y1)
        if not name or not tag or kind not in POINT_TYPES:
            raise ValueError(f"{table_id}: unable to form declared point row {name!r}|{tag!r}|{kind!r}")
        rows.append("|".join([name, tag, kind]))
    return {
        "id": table_id, "page": page, "sheet": sheet, "title": title,
        "classification": "literal printed BAS point-function matrix row",
        "columns": "point_name|tag|point_type",
        "x_edges": [*x_name, x_tag[1], x_type[1]],
        "y_ranges": [[round(a, 3), round(b, 3)] for a, b in ranges],
        "rows": rows,
    }


def main():
    tables = [
        matrix("M83-CHW-POINTS", 19, "M8.3", "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - CHW SYSTEM", (1160, 1605), (1605, 1690), (1690, 1740), (975, 1425), 21),
        matrix("M84-HHW-POINTS", 20, "M8.4", "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - HHW SYSTEM", (1160, 1600), (1600, 1685), (1685, 1730), (1090, 1740), 32),
        matrix("M85-AHU1-POINTS", 21, "M8.5", "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - AHU-1", (1535, 1860), (1860, 1925), (1925, 1960), (760, 2125), 69),
        matrix("M87-VAV-POINTS", 23, "M8.7", "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - VAV BOXES", (1400, 1925), (1925, 1985), (1985, 2030), (345, 660), 15),
        matrix("M88-MISC-POINTS", 24, "M8.8", "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS", (1150, 1620), (1620, 1680), (1680, 1730), (1500, 2000), 21),
    ]
    point_counts = Counter(row.split("|")[-1] for table in tables for row in table["rows"])
    payload = {
        "document_id": IDENT,
        "module_role": "Literal M8.3/M8.4/M8.5/M8.7/M8.8 BAS point-function rows. The row scope is the printed control-system template; repeated tag text in separate sheets/templates is intentionally not silently merged into an installed terminal or field-device count.",
        "source_sheets": ["M8.3", "M8.4", "M8.5", "M8.7", "M8.8"],
        "tables": tables,
        "printed_point_type_counts": {**dict(sorted(point_counts.items())), "total": sum(point_counts.values())},
        "point_count_semantics": "Counts are rows categorized by the printed AI/DI/AO/DO point-type column. They are source-matrix/template occurrences, not controller card, wiring, field-device or installed-terminal quantities.",
        "assertions": [],
        "inventory_checks": [{"id": "rank24-point-matrix-tables", "records_path": ["tables"], "expected": 5, "unique_key": "id"}]
    }
    target = AUDIT / "work" / IDENT / "points_m83_m88.json"
    target.write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
