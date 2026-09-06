"""Losslessly consolidate rank-01 verified point-list tables for final assembly.

The source table rows, geometry and raw printed cells are copied from their
existing independently checked modules.  The only schema adaptation is naming
the first two existing fields ``tag`` and ``point_name`` so the final
source-template ledger can retain repeated tags under their table/row scopes.
No equipment, physical I/O, owner, or quantity is inferred here.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "01__vol2__001"
WORK = AUDIT / "work" / IDENT
TYPE_MAP = {"AI": "AI", "AO": "AO", "BI": "DI", "BO": "DO"}


def printed_type(table_id: str) -> str:
    segments = table_id.split("-")
    matches = [segment for segment in segments if segment in TYPE_MAP]
    if len(matches) != 1:
        raise ValueError(f"{table_id}: cannot identify printed I/O type")
    return matches[0]


def main():
    tables = []
    components = []
    for path in sorted(WORK.glob("points_*.json")):
        if path.name == "points_rank01_assembled.json" or path.name.endswith(".verification.json"):
            continue
        source = json.loads(path.read_text())
        copied = 0
        for original in source.get("tables", []):
            columns = original["columns"].split("|")
            # The SPFVAV/FCU equipment relationship matrix is intentionally
            # left in its own source module; it has no literal point-tag and
            # description columns and is not silently recast as an I/O list.
            if "mark" not in columns or "description" not in columns:
                continue
            table = dict(original)
            table["columns"] = "|".join(
                "tag" if column == "mark" else "point_name" if column == "description" else column
                for column in columns
            )
            table["classification"] = "literal printed BAS point-list row; source type " + printed_type(table["id"])
            table["source_component"] = path.name
            table["source_printed_type"] = printed_type(table["id"])
            table["normalized_point_type"] = TYPE_MAP[printed_type(table["id"])]
            tables.append(table)
            copied += len(table["rows"])
        components.append({"module": path.name, "point_rows_copied": copied})
    if not tables or len({table["id"] for table in tables}) != len(tables):
        raise ValueError("missing or duplicate source point-list tables")
    counts = Counter(table["normalized_point_type"] for table in tables for _ in table["rows"])
    payload = {
        "document_id": IDENT,
        "module_role": "Lossless assembly of all existing raw-text-cell-bounded Cherry Point BAS point-list rows. Existing printed BI/BO categories are normalized to DI/DO only for takeoff-category presentation; the printed source type remains on each table.",
        "source_components": components,
        "tables": tables,
        "printed_point_type_counts": {**dict(sorted(counts.items())), "total": sum(counts.values())},
        "point_count_semantics": "Counts are literal rows in the printed source point matrices/templates. They do not establish installed controller terminal, card, field-device, wiring or system multiplier quantities.",
        "non_point_matrix_scope": {"source_module": "points_mi744_fcu_sfpvav.json", "source_table": "SPFVAV-FCU-MATRIX", "status": "retained in the original verified source module as an equipment relationship matrix; excluded from this point-list ledger because it is not printed as point-tag/description I/O rows."},
        "assertions": [],
        "inventory_checks": [{"id": "rank01-assembled-point-tables", "records_path": ["tables"], "expected": len(tables), "unique_key": "id"}],
    }
    (WORK / "points_rank01_assembled.json").write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
