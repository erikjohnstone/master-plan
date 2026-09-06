"""Create a non-duplicated Cherry Point schedule-identity registry component.

The full schedule assembly retains all 53 source tables.  Several sheets split
one equipment schedule over two tables or repeat marks in a sound-power table;
this component selects the primary mark-bearing table for each equipment
identity so the final index never reports a false duplicate unit.  Excluded
tables remain in the full schedule assembly as source performance/detail data.
"""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "01__vol2__001"
WORK = AUDIT / "work" / IDENT
SECONDARY = {"AIR-OPS-DOAH-2", "AIR-OPS-FAN-SOUND-POWER", "M612-DOAH-M1-PART-2"}


def main():
    full = json.loads((WORK / "schedules_rank01_assembled.json").read_text())
    primary, omitted = [], []
    for original in full["tables"]:
        columns = original["columns"].split("|")
        if "mark" not in columns:
            continue
        if original["id"] in SECONDARY:
            omitted.append({"table": original["id"], "reason": "same equipment mark is detailed in the paired primary schedule table or is repeated sound-power data"})
            continue
        primary.append(original)
    all_ids = []
    for table in primary:
        mark_index = table["columns"].split("|").index("mark")
        namespace = table["id"].split("-", 1)[0]
        all_ids.extend(namespace + "-" + row.split("|")[mark_index] for row in table["rows"])
    if len(all_ids) != len(set(all_ids)):
        raise ValueError("primary schedule selection still contains duplicate scoped mark identities")
    payload = {
        "document_id": IDENT,
        "module_role": "Primary non-duplicated schedule mark registry for Cherry Point equipment identity presentation. All paired/secondary schedule tables remain in schedules_rank01_assembled.json and are not discarded.",
        "tables": primary,
        "secondary_mark_tables": omitted,
        "registry_count_semantics": "A source mark establishes only its printed schedule identity and classification. GRD and vibration/secondary contexts are not converted into installed plan, actuator, controller or field-I/O quantities.",
        "assertions": [],
        "inventory_checks": [
            {"id": "rank01-primary-identity-tables", "records_path": ["tables"], "expected": len(primary), "unique_key": "id"},
            {"id": "rank01-secondary-mark-tables", "records_path": ["secondary_mark_tables"], "expected": len(omitted), "unique_key": "table"},
        ],
    }
    (WORK / "schedule_identities_rank01.json").write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
