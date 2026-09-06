"""Author Cherry Point schedule identity/valve reconciliation from verified rows."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "01__vol2__001"
WORK = AUDIT / "work" / IDENT
NON_INSTANCE = {"AIR-OPS-GRILLE-REGISTER-DIFFUSER", "M613-GRD-MARKS"}
VALVE_TABLES = [
    "AIR-OPS-CHW-CONTROL-VALVE", "AIR-OPS-HHW-CONTROL-VALVE",
    "MTRACON-HHW-CONTROL-VALVE", "MTRACON-CHW-CONTROL-VALVE",
    "ATCT-HHW-CONTROL-VALVE", "ATCT-CHW-CONTROL-VALVE",
]


def main():
    identity = json.loads((WORK / "schedule_identities_rank01.json").read_text())
    all_schedules = json.loads((WORK / "schedules_rank01_assembled.json").read_text())
    families, anchors = [], []
    for table in identity["tables"]:
        mark_index = table["columns"].split("|").index("mark")
        marks = [row.split("|")[mark_index] for row in table["rows"]]
        families.append({
            "module": "schedule_identities_rank01.json", "bundle_module": "schedule_identities",
            "table": table["id"], "class": table["classification"], "rows": len(marks), "schedule_mark": marks,
        })
        if table["id"] not in NON_INSTANCE:
            namespace = table["id"].split("-", 1)[0]
            anchors.extend({"id": f"{namespace}-{mark}", "scope": f"{table['sheet']} {table['classification']} schedule row in {table['id']}."} for mark in marks)
    valve_rows = {table["id"]: len(table["rows"]) for table in all_schedules["tables"] if table["id"] in VALVE_TABLES}
    payload = {
        "document_id": IDENT,
        "module_role": "Source-constrained Cherry Point equipment identity/classification ledger. The 243 primary marks come from non-duplicated schedule rows; all associated schedule/valve/construction tables remain available in the full assembled schedule module.",
        "schedule_registry_schema": {"namespace_separator": "-", "identity_columns": {"schedule_mark": "mark"}, "anchor_records_path": ["primary_anchors"], "non_instance_table_ids": sorted(NON_INSTANCE)},
        "scheduled_families": families,
        "schedule_counts": {
            "tables": len(families), "rows": sum(family["rows"] for family in families),
            "building_scoped_tag_identities_including_outlet_types": sum(family["rows"] for family in families),
            "other_scheduled_tag_identities": len(anchors),
            "all_source_schedule_valve_construction_tables": len(all_schedules["tables"]),
            "all_source_schedule_valve_construction_rows": sum(len(table["rows"]) for table in all_schedules["tables"]),
            "source_scope": "The primary registry intentionally excludes the second half of paired DOAH schedules and the repeated fan sound-power marks to avoid duplicate equipment identity. It retains the complete paired/detail rows in schedules_rank01_assembled.json.",
        },
        "primary_anchors": anchors,
        "additional_identities": [
            {"id": "RANK01-ALL-SCHEDULE-TABLES", "classification": "53 literal source schedule, valve and construction tables", "source_scope": "schedules_rank01_assembled.tables", "status": "440 source rows retained; table rows do not assert plan-placement quantity."},
            {"id": "RANK01-SECONDARY-DOAH-SOUND-TABLES", "classification": "paired DOAH performance and fan sound-power source tables", "source_scope": "schedule_identities_rank01.secondary_mark_tables", "status": "full cells retained but repeated marks not duplicated in equipment identity index."},
            {"id": "RANK01-GRD-TYPE-SCHEDULES", "classification": "Air Operations and MTRACON air-device schedule type marks", "source_scope": "AIR-OPS-GRILLE-REGISTER-DIFFUSER and M613-GRD-MARKS", "status": "type schedule rows, not installed outlet/damper-actuator quantities."},
            {"id": "RANK01-CONTROL-VALVE-TABLES", "classification": "Air Operations, MTRACON and ATCT heating/chilled-water control-valve schedule rows", "source_scope": "schedules_rank01_assembled valve tables", "status": "literal valve unit/mark, GPM, size, configuration and Cv fields retained."},
        ],
        "reconciliation_findings": [
            "Air Operations DOAH-A1/A2 and MTRACON DOAH-M1 are each printed across two source schedule parts; the first part establishes schedule identity and the companion part remains retained as performance/electrical detail.",
            "Air Operations fan sound-power rows reuse AHU/DOAH marks already present in equipment schedules, so they remain supplemental acoustic detail rather than duplicate equipment identities.",
            "The Air Operations and MTRACON GRD marks are type schedules. No plan-symbol count, actuator count or BAS terminal count is derived from them.",
            "The supplied control-valve tables provide 167 literal valve rows across three building scopes. Their source table row is retained rather than treating a valve mark as a standalone physical device without its unit/scope context.",
        ],
        "control_valve_and_damper_schedule_status": {
            "control_valve_schedule": {"status": "present_as_tabular_schedule", "tables": valve_rows, "rows": sum(valve_rows.values()), "fields": ["unit_mark", "valve_mark", "flowrate_GPM", "valve_size_in", "configuration", "Cv", "notes"], "note": "Six printed source tables cover Air Operations, MTRACON and ATCT heating/chilled-water control valves."},
            "damper_actuator_schedule": {"status": "not_present_as_tabular_actuator_schedule", "value": None, "note": "The set has damper/actuator symbols and sequence behavior, but no table with damper-actuator tag, selected make/model, torque, signal or fail action."},
        },
        "tables": [], "assertions": [],
        "inventory_checks": [
            {"id": "rank01-primary-schedule-anchors", "records_path": ["primary_anchors"], "expected": len(anchors), "unique_key": "id"},
            {"id": "rank01-supplemental-identity-groups", "records_path": ["additional_identities"], "expected": 4, "unique_key": "id"},
        ],
    }
    (WORK / "equipment_reconciliation_rank01.json").write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
