"""Losslessly consolidate Cherry Point schedule, valve and construction tables.

The existing modules already contain the literal cell boundaries, rows and
source-scoped notes.  This helper only composes them into one final assembly
component while preserving every table and retaining the originating module.
It neither detects additional equipment nor turns drawing-plan appearances
into quantities.
"""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "01__vol2__001"
WORK = AUDIT / "work" / IDENT


def main():
    candidates = sorted(
        list(WORK.glob("schedules_*.json")) + list(WORK.glob("valves_*.json")) + [WORK / "construction_air_ops.json"]
    )
    tables, components = [], []
    for path in candidates:
        if not path.is_file() or path.name.endswith(".verification.json") or path.name == "schedules_rank01_assembled.json":
            continue
        source = json.loads(path.read_text())
        copied = 0
        for original in source.get("tables", []):
            table = dict(original)
            table["source_component"] = path.name
            tables.append(table)
            copied += len(table["rows"])
        components.append({"module": path.name, "schedule_or_valve_rows_copied": copied})
    if not tables or len({table["id"] for table in tables}) != len(tables):
        raise ValueError("missing or duplicate source schedule table")
    payload = {
        "document_id": IDENT,
        "module_role": "Lossless assembly of all existing Cherry Point schedule, control-valve and duct/piping-construction source tables. Original table cells remain the authoritative source facts and are independently rechecked after assembly.",
        "source_components": components,
        "tables": tables,
        "table_count_semantics": "Counts are literal printed table rows. They do not automatically establish installed plan quantity, actuator count, or controller I/O quantity.",
        "assertions": [],
        "inventory_checks": [{"id": "rank01-assembled-schedule-tables", "records_path": ["tables"], "expected": len(tables), "unique_key": "id"}],
    }
    (WORK / "schedules_rank01_assembled.json").write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
