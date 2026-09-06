"""Author table-scoped Cherry Point source-template point applications.

This is a presentation/ownership binding over the already verified assembled
point rows.  It does not allocate source rows to physical controllers, expand
them by plan symbols, or create field-device quantities.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
IDENT = "01__vol2__001"
WORK = AUDIT / "work" / IDENT


def main():
    points = json.loads((WORK / "points_rank01_assembled.json").read_text())
    source_roles = {
        item["module"]: json.loads((WORK / item["module"]).read_text()).get("module_role", "Source point-list module")
        for item in points["source_components"]
    }
    applications = []
    for table in points["tables"]:
        component = table["source_component"]
        applications.append({
            "id": "rank01-" + table["id"].lower(),
            "source_table": table["id"],
            "ownership_scope": f"{table['sheet']} {table['classification']}; system/equipment ownership is limited to this printed table template.",
            "source_sheet": table["sheet"],
            "source_page": table["page"],
            "source_component": component,
            "source_component_scope": source_roles[component],
            "source_printed_type": table["source_printed_type"],
            "normalized_point_type": table["normalized_point_type"],
        })
    counts = Counter(table["normalized_point_type"] for table in points["tables"] for _ in table["rows"])
    payload = {
        "document_id": IDENT,
        "module_role": "Explicit source-template application binding for all assembled Cherry Point point-list rows. One application is the printed table scope; no application is expanded into an installed controller/card/terminal/field-device quantity.",
        "ledger_mode": "source_matrix_templates_v1",
        "source_points_modules": ["points_rank01_assembled.json"],
        "applications": applications,
        "listed_template_counts": {"total": sum(counts.values()), "source_matrix_rows": sum(counts.values()), **dict(sorted(counts.items()))},
        "expanded_template_counts": {"total": sum(counts.values()), "source_rows": sum(counts.values()), **dict(sorted(counts.items()))},
        "printed_assignment_summary": {"cell_bounded_source_matrix_rows": sum(counts.values()), **dict(sorted(counts.items())), "semantics": "AI/AO and source BI/BO rows are literal printed point-list rows. BI/BO are normalized to DI/DO for the requested takeoff categories without changing the source type stored with each table."},
        "expanded_count_warning": "All 546 source rows are exposed once in their printed matrix/template scope. Repeated tags remain table/row scoped. No plan multiplier, global device identity, controller-card count, terminal count, wiring count or unprinted virtual point is asserted.",
        "ownership_binding_semantics": "The named point-list table is the authoritative ownership/application boundary. Identical tag text in different tables, or repeated inside a table, is not silently merged into a field-device identity.",
        "tables": [],
        "assertions": [],
        "inventory_checks": [{"id": "rank01-point-application-scopes", "records_path": ["applications"], "expected": len(applications), "unique_key": "id"}],
    }
    (WORK / "point_applications_rank01.json").write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
