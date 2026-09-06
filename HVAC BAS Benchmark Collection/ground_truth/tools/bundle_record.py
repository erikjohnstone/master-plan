"""Package authored ground truth, not PDF extraction or production takeoff logic.

SHOULD THIS BE ON THE SHARED PATH? No: these are deterministic serialization,
reference-integrity and presentation checks over manually authored annotations.
No PDF facts, quantities, scope or ownership are inferred by this tool.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

from verify_tables import AUDIT, ROOT, verify

SCHEMA = "authored-module-bundle-v1"
REQUIREMENTS = {
    "project_identity", "sheet_details", "scale_verification",
    "equipment_tags_and_classification", "schedule_rows_and_specs",
    "point_lists_and_equipment_ownership", "network_architecture",
    "sequences_and_diagrams", "space_sensors_and_zones",
    "source_limitations_and_conflicts", "all_page_visual_review",
    "independent_corroboration",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def value_digest(value):
    """Digest an authored in-memory composite deterministically."""
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()


def source_names(manifest, name):
    """Return the authored component names for one logical bundle module.

    A normal module remains a one-file component. A composite is explicit in the
    bundle manifest and only concatenates already-authored, independently
    verified tables/assertions; it never extracts or infers PDF content.
    """
    names = manifest.get("module_sources", {}).get(name, [name])
    if not isinstance(names, list) or not names or not all(isinstance(v, str) and v and "/" not in v and "\\" not in v for v in names):
        raise ValueError(f"Invalid component list for logical module: {name}")
    if len(names) != len(set(names)):
        raise ValueError(f"Duplicate component in logical module: {name}")
    return names


def compose_module(ident, name, names):
    """Load one authored module or expose an explicit composite losslessly."""
    parts = []
    for component in names:
        path = AUDIT / "work" / ident / (component + ".json")
        parts.append((component, json.loads(path.read_text())))
    if len(parts) == 1:
        return parts[0][1]
    document_ids = {part.get("document_id") for _, part in parts}
    if document_ids != {ident}:
        raise ValueError(f"Composite module {name} has a different document id")
    return {
        "document_id": ident,
        "module_role": f"Composite authored module {name}; each named component is embedded without rewriting its facts.",
        "scope": "This composite is an assembly of independently verified authored components. It does not create PDF facts, reconcile aliases, or infer physical quantities.",
        "source_modules": [component for component, _ in parts],
        "source_components": {component: part for component, part in parts},
        "tables": [table for _, part in parts for table in part.get("tables", [])],
        "assertions": [assertion for _, part in parts for assertion in part.get("assertions", [])],
        "inventory_checks": []
    }


def module_digest(ident, names, module):
    if len(names) == 1:
        return digest(AUDIT / "work" / ident / (names[0] + ".json"))
    return value_digest(module)


def pointer(value, path):
    for key in path:
        value = value[key]
    return value


def review_files(value):
    if isinstance(value, str) and value.startswith("reviews/"):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from review_files(child)
    elif isinstance(value, list):
        for child in value:
            yield from review_files(child)


def point_ledger(modules):
    """Expand only authored application/owner bindings; no source inference."""
    points = modules["points"]
    context = modules["point_applications"]
    tables = {t["id"]: t for t in points["tables"]}
    if context.get("ledger_mode") == "literal_source_row_matrices_v1":
        applications = {application["source_table"]: application
                        for application in context["applications"]}
        rows = []
        for table_id, table in tables.items():
            application = applications.get(table_id)
            if application is None:
                raise ValueError(f"No authored matrix scope for {table_id}")
            ys = table.get("y_ranges", list(zip(table.get("y_edges", []), table.get("y_edges", [])[1:])))
            if len(ys) != len(table["rows"]):
                raise ValueError(f"Matrix row geometry differs from rows: {table_id}")
            for index, line in enumerate(table["rows"]):
                rows.append({
                    "id": f"{application['id']}/{index + 1}",
                    "application": application["id"], "source_table": table_id,
                    "source_row": index + 1, "page": table["page"], "sheet": table["sheet"],
                    "row_bbox": [table["x_edges"][0], ys[index][0], table["x_edges"][-1], ys[index][1]],
                    "literal_source_row_as_printed": line,
                    "ownership": {"status": "source_matrix_scope_only",
                                  "value": application["ownership_scope"],
                                  "physical_owner": {"status": "not_stated_in_supplied_excerpt", "value": None}},
                })
        return rows
    if context.get("ledger_mode") == "source_matrix_templates_v1":
        applications = {application["source_table"]: application
                        for application in context["applications"]}
        rows = []
        for table_id, table in tables.items():
            application = applications.get(table_id)
            if application is None:
                raise ValueError(f"No authored matrix scope for {table_id}")
            columns = table["columns"].split("|")
            if "tag" not in columns or "point_name" not in columns:
                raise ValueError(f"Matrix table lacks tag/point_name columns: {table_id}")
            ys = table.get("y_ranges", list(zip(table.get("y_edges", []), table.get("y_edges", [])[1:])))
            if len(ys) != len(table["rows"]):
                raise ValueError(f"Matrix row geometry differs from rows: {table_id}")
            # Point tags are commonly reused within one printed system matrix
            # (for example, a shared sensor reference in several schematic
            # blocks).  Preserve each literal source row instead of rejecting
            # it or inventing a global unique field-device tag.  Existing
            # unique-tag tables retain their established identifier format.
            tag_counts = Counter(
                dict(zip(columns, line.split("|")))["tag"]
                for line in table["rows"]
            )
            for index, line in enumerate(table["rows"]):
                cells = dict(zip(columns, line.split("|")))
                flags = {key: value for key, value in cells.items()
                         if key not in {"tag", "point_name"} and value}
                source_row_identity = (f"{index + 1}-{cells['tag']}"
                                       if tag_counts[cells["tag"]] > 1 else cells["tag"])
                rows.append({
                    "id": f"{application['id']}/{source_row_identity}",
                    "application": application["id"],
                    "source_table": table_id,
                    "source_row": index + 1,
                    "page": table["page"],
                    "sheet": table["sheet"],
                    "row_bbox": [table["x_edges"][0], ys[index][0], table["x_edges"][-1], ys[index][1]],
                    "tag_as_printed": cells["tag"],
                    "point_name_as_printed": cells["point_name"],
                    "printed_flag_columns": flags,
                    "literal_source_row": cells,
                    "ownership": {
                        "status": "source_template_or_schematic_scope_only",
                        "value": application["ownership_scope"],
                        "physical_owner": {"status": "not_stated_in_supplied_excerpt", "value": None}
                    },
                    "application_qualification": {key: value for key, value in application.items()
                                                  if key not in {"id", "source_table", "ownership_scope"}}
                })
        if len(rows) != len({row["id"] for row in rows}):
            raise ValueError("Duplicate source-table/tag identity in matrix ledger")
        return rows
    bindings = {}
    for binding in context.get("leaf_role_bindings", []):
        rule = context["leaf_ownership_rules"][binding["rule_index"]]
        for gi, group in enumerate(rule["groups"]):
            for ai, application in enumerate(rule["applies_to"]):
                for tid in rule["tables"]:
                    for mark in group["marks"]:
                        bindings[application, tid, mark] = {
                            "owners": binding["owners_by_group"][gi][ai],
                            "role": group["role"],
                        }
    rows = []
    for app in context["applications"]:
        if app["instances"] != 1:
            raise ValueError("Explicit instance identities are required for the per-application presentation")
        for tid in app["point_tables"]:
            table = tables[tid]
            columns = table["columns"].split("|")
            ys = table.get("y_ranges", list(zip(table.get("y_edges", []), table.get("y_edges", [])[1:])))
            for index, line in enumerate(table["rows"]):
                cells = dict(zip(columns, line.split("|")))
                mark = cells["mark"]
                key = app["id"], tid, mark
                ownership = bindings.get(key)
                if ownership is None:
                    groups = [g for g in table.get("owner_groups", []) if mark in g["marks"]]
                    if groups:
                        if len(groups) != 1:
                            raise ValueError(f"Ambiguous authored owner group: {key}")
                        ownership = {"owners": [groups[0]["owner"]], "source_group": groups[0]}
                    elif app["id"] in context["single_owner_applications"]:
                        ownership = {"owners": [context["single_owner_applications"][app["id"]]]}
                    else:
                        raise ValueError(f"No authored ownership for {key}")
                prefix = re.fullmatch(r"([A-Z]+)-?\d+", mark)[1]
                aliases = [v for v in modules["equipment_reconciliation"]["valve_aliases"]
                           if v["point_table"] == tid and v["point"] == mark]
                # Valve aliases on a typical table cover several applications.
                # Retain only a valve explicitly in this authored application.
                aliases = [v for v in aliases if v["schedule"] in app["equipment_scope"]]
                rows.append({"id": "/".join(key), "application": app["id"],
                             "source_table": tid, "source_row": index + 1,
                             "page": table["page"], "sheet": table["sheet"],
                             "row_bbox": [table["x_edges"][0], ys[index][0], table["x_edges"][-1], ys[index][1]],
                             "type_as_printed": prefix, "type_normalized": points["normalization"][prefix],
                             **cells, "ownership": ownership, "valve_aliases_same_point": aliases,
                             "application_qualification": {k: v for k, v in app.items() if k not in ["counts", "point_tables"]}})
    return rows


def equipment_ledger(modules):
    """Present the exact authored schedule identity columns and primary anchors."""
    registry = modules["equipment_reconciliation"]
    if registry.get("ledger_mode") == "literal_schedule_rows_v1":
        rows = []
        for table in modules["schedules"]["tables"]:
            ys = table.get("y_ranges", list(zip(table.get("y_edges", []), table.get("y_edges", [])[1:])))
            if len(ys) != len(table["rows"]):
                raise ValueError(f"Schedule row geometry differs from rows: {table['id']}")
            for index, line in enumerate(table["rows"]):
                rows.append({"id": f"{table['id']}/{index + 1}", "source_table": table["id"],
                             "source_row": index + 1, "source_page": table["page"],
                             "row_bbox": [table["x_edges"][0], ys[index][0], table["x_edges"][-1], ys[index][1]],
                             "literal_schedule_row_as_printed": line,
                             "row_semantics": "Literal source schedule row; the bundle does not parse it into an asserted installed equipment identity or quantity."})
        return rows
    schema = registry["schedule_registry_schema"]
    anchors = {a["id"]: a for a in pointer(registry, schema["anchor_records_path"])}
    outlets = {o["id"]: o for o in registry.get("air_outlet_instances", [])}
    output = []
    for family in registry["scheduled_families"]:
        bundle_module = Path(family.get("bundle_module", family["module"])).stem
        table = next(t for t in modules[bundle_module]["tables"] if t["id"] == family["table"])
        namespace = table["id"].split(schema["namespace_separator"], 1)[0]
        for field, column in schema["identity_columns"].items():
            if field not in family:
                continue
            for index, tag in enumerate(family[field]):
                ident = namespace + "-" + tag
                row = dict(zip(table["columns"].split("|"), table["rows"][index].split("|")))
                output.append({"id": ident, "tag": tag, "classification": family["class"],
                               "identity_column": column, "source_table": table["id"],
                               "source_row": index + 1, "source_page": table["page"],
                               "literal_schedule_row": row,
                               "row_semantics": "All cells belong to the cited row. Indoor/outdoor pair rows are shared references, not doubled schedule quantities or per-unit electrical sums.",
                               "primary_anchor": anchors.get(ident), "outlet_instances": outlets.get(ident)})
    return output


def build(manifest_path):
    manifest_path = manifest_path.resolve()
    manifest = json.loads(manifest_path.read_text())
    ident = manifest["id"]
    data = dict(manifest)
    data["schema_version"] = SCHEMA
    data["bundle_manifest"] = str(manifest_path.relative_to(AUDIT))
    data["bundle_manifest_sha256"] = digest(manifest_path)
    data["review_render_sha256"] = {p["render"]: digest(AUDIT / p["render"])
                                    for p in manifest["page_review"]}
    data["modules"] = {}
    data["module_sha256"] = {}
    data["module_source_sha256"] = {}
    for name in manifest["module_order"]:
        names = source_names(manifest, name)
        for component in names:
            path = AUDIT / "work" / ident / (component + ".json")
            # Re-run both raw-capture checks. Cached green reports alone do not
            # establish that the current source/annotation bundle is valid.
            outcome = verify(path, quiet=True)
            if not outcome["pass"]:
                raise ValueError(f"{name}/{component}: {outcome['errors']}")
        module = compose_module(ident, name, names)
        data["modules"][name] = module
        data["module_sha256"][name] = module_digest(ident, names, module)
        data["module_source_sha256"][name] = {
            component: digest(AUDIT / "work" / ident / (component + ".json"))
            for component in names
        }
    data["equipment_inventory"] = equipment_ledger(data["modules"])
    data["point_application_ledger"] = point_ledger(data["modules"])
    data["review_render_sha256"].update({p: digest(AUDIT / p) for p in review_files(data["modules"])})
    output = AUDIT / "records" / (ident + ".json")
    output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    output.with_suffix(".md").write_text(render(data))
    return output


def validate(path, write_report=True, verbose=True):
    record = json.loads(path.read_text())
    ident = record["id"]
    errors = []
    report = {
        "id": ident, "record_sha256": digest(path),
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "errors": errors, "modules": {}, "source_files_sha256": {},
        "scope": "Rechecks every embedded authored module against MuPDF and Poppler, exact bundle/source identity, authored page/requirement coverage and review-file integrity. Visual interpretation and completeness are coordinator audit assertions, not automatic parser proof.",
    }
    try:
        if record.get("schema_version") != SCHEMA:
            raise ValueError("Unsupported bundle schema")
        if record["review_status"] != "complete_with_documented_source_limitations":
            errors.append("Final coordinator requirement audit not complete")
        if digest(ROOT / record["source_pdf"]) != record["source_sha256"]:
            errors.append("Source PDF SHA-256 mismatch")
        capture = json.loads((AUDIT / "evidence" / ident / "capture.json").read_text())
        if (capture["source_sha256"] != record["source_sha256"]
                or capture["page_count"] != record["page_count"]):
            errors.append("Capture source identity/page count mismatch")
        manifest_path = AUDIT / record["bundle_manifest"]
        manifest = json.loads(manifest_path.read_text())
        if digest(manifest_path) != record["bundle_manifest_sha256"]:
            errors.append("Bundle manifest is stale")
        for key, value in manifest.items():
            if record.get(key) != value:
                errors.append(f"Manifest field changed in bundled record: {key}")
        report["source_files_sha256"][str(manifest_path.relative_to(AUDIT))] = digest(manifest_path)
        if (len(record["module_order"]) != len(set(record["module_order"]))
                or set(record["modules"]) != set(record["module_order"])):
            errors.append("Embedded module set differs from authored manifest")
        for name in record["module_order"]:
            names = source_names(manifest, name)
            raw = compose_module(ident, name, names)
            expected_digest = module_digest(ident, names, raw)
            if (record["modules"][name] != raw
                    or record["module_sha256"][name] != expected_digest):
                errors.append(f"Embedded annotation differs from source: {name}")
            expected_component_digests = {
                component: digest(AUDIT / "work" / ident / (component + ".json"))
                for component in names
            }
            if ("module_source_sha256" in record
                    and record["module_source_sha256"].get(name) != expected_component_digests):
                errors.append(f"Component source digest differs from source: {name}")
            component_reports = []
            for component in names:
                module_path = AUDIT / "work" / ident / (component + ".json")
                result = verify(module_path, write=False, quiet=True)
                if not result["pass"]:
                    errors.extend(f"{name}/{component}: {e}" for e in result["errors"])
                if result["source_sha256"] != record["source_sha256"]:
                    errors.append(f"Different PDF used by module: {name}/{component}")
                component_reports.append(result)
                report["source_files_sha256"][str(module_path.relative_to(AUDIT))] = digest(module_path)
            report["modules"][name] = {
                "components": [{key: result[key] for key in
                                ["annotation_sha256", "cell_assertions", "text_assertions", "pass"]}
                               for result in component_reports],
                "cell_assertions": sum(result["cell_assertions"] for result in component_reports),
                "text_assertions": sum(result["text_assertions"] for result in component_reports),
                "pass": all(result["pass"] for result in component_reports)
            }
        if record["equipment_inventory"] != equipment_ledger(record["modules"]):
            errors.append("Equipment presentation differs from authored schedule/anchor bindings")
        if record["point_application_ledger"] != point_ledger(record["modules"]):
            errors.append("Point application presentation differs from authored rows/ownership")
        point_context = record["modules"]["point_applications"]
        if point_context.get("ledger_mode") in {"source_matrix_templates_v1", "literal_source_row_matrices_v1"}:
            expected_rows = point_context["expanded_template_counts"]["source_rows"]
            if len(record["point_application_ledger"]) != expected_rows:
                errors.append("Matrix point presentation total differs from authored source-row count")
        else:
            counts = Counter(p["type_normalized"] for p in record["point_application_ledger"])
            declared = point_context["expanded_template_counts"]
            if counts != Counter({k: v for k, v in declared.items() if k != "total"}):
                errors.append("Point application presentation total differs from authored logical counts")
        requirements = record["requirement_audit"]
        if Counter(r["id"] for r in requirements) != Counter(REQUIREMENTS):
            errors.append("Missing/duplicate required objective coverage")
        for requirement in requirements:
            if requirement["result"] != "reviewed_with_source_limitations_recorded":
                errors.append(f"Incomplete requirement: {requirement['id']}")
            if not requirement.get("evidence") or not requirement.get("finding"):
                errors.append(f"Missing evidence/finding: {requirement['id']}")
            for ref in requirement["evidence"]:
                value = pointer(record, ref)
                if value is None or value == [] or value == {}:
                    errors.append(f"Empty requirement evidence: {requirement['id']} {ref}")
        pages = record["page_review"]
        if sorted(p["page"] for p in pages) != list(range(1, record["page_count"] + 1)):
            errors.append("Full-page visual ledger must cover every source page exactly once")
        for page in pages:
            if page.get("review_status") != "complete" or not page.get("finding"):
                errors.append(f"Missing visual finding on page {page['page']}")
            render_path = AUDIT / page["render"]
            expected_hash = record["review_render_sha256"][page["render"]]
            if not render_path.is_file() or digest(render_path) != expected_hash:
                errors.append(f"Missing/changed full-page review render {page['page']}")
            else:
                report["source_files_sha256"][page["render"]] = expected_hash
        for check in record.get("declared_checks", []):
            value = pointer(record, check["path"])
            actual = len(value) if check.get("operation") == "length" else value
            if actual != check["expected"]:
                errors.append(f"Authored bundle count mismatch: {check['id']}")
        for filename in review_files(record["modules"]):
            expected_hash = record["review_render_sha256"][filename]
            if not (AUDIT / filename).is_file() or digest(AUDIT / filename) != expected_hash:
                errors.append(f"Missing/changed cited visual evidence: {filename}")
            else:
                report["source_files_sha256"][filename] = expected_hash
        if not record.get("completion_checks") or not all(record["completion_checks"].values()):
            errors.append("Document completion gates not all asserted")
        if not path.with_suffix(".md").is_file():
            errors.append("Missing readable document record")
        elif path.with_suffix(".md").read_text() != render(record):
            errors.append("Readable record differs from the current JSON bundle")
    except (KeyError, TypeError, ValueError, IndexError, OSError) as exc:
        errors.append(str(exc))
    report["bounded_assertions"] = sum(
        m["cell_assertions"] + m["text_assertions"] for m in report["modules"].values())
    report["independent_engine_checks"] = 2 * report["bounded_assertions"]
    report["pass"] = not errors
    if write_report:
        (AUDIT / "verification" / (ident + ".json")).write_text(json.dumps(report, indent=2) + "\n")
    if verbose:
        print(json.dumps({k: report[k] for k in
              ["id", "bounded_assertions", "independent_engine_checks", "pass", "errors"]}, indent=2))
    return report["pass"]


def scalar(value):
    if value is None:
        return "null (see recorded status/reason)"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).replace("|", "\\|").replace("\n", " ")


def tree(value, level=0):
    """Readable, lossless field presentation; deliberately no domain inference."""
    lines = []
    pad = "  " * level
    if isinstance(value, dict):
        for key, child in value.items():
            label = key.replace("_", " ")
            if isinstance(child, (dict, list)) and child:
                lines.append(f"{pad}- {label}:")
                lines.extend(tree(child, level + 1))
            else:
                lines.append(f"{pad}- {label}: {scalar(child)}")
    elif isinstance(value, list):
        for child in value:
            if isinstance(child, dict):
                lines.append(f"{pad}- Record:")
                lines.extend(tree(child, level + 1))
            elif isinstance(child, list):
                lines.append(f"{pad}- " + ", ".join(scalar(v) for v in child))
            else:
                lines.append(f"{pad}- {scalar(child)}")
    return lines


def render(data):
    modules = data["modules"]
    metadata = modules["metadata"]
    # Some vector title blocks expose sheet lettering only as outlines.  Those
    # records deliberately keep the visual sheet ledger instead of inventing a
    # text assertion group named "sheets".  Preserve that honest layout in the
    # readable record while retaining the legacy renderer for earlier bundles.
    sheet_group = next((g for g in metadata.get("assertion_groups", []) if g["id"] == "sheets"), None)
    legacy_sheet_layout = (sheet_group is not None and "date_semantics" in metadata
                           and any(g["id"] == "views" for g in metadata["assertion_groups"])
                           and any(g["id"] == "graphic-bars" for g in metadata["assertion_groups"]))
    lines = [f"# {data['title']} - ground truth", "", data["review_status"], "",
             f"Source: [{data['source_pdf']}](../../{data['source_pdf']}). "
             f"{data['page_count']} supplied pages. SHA-256 `{data['source_sha256']}`.", "",
             data["scope"], "", "## Reading this record", "", *tree(data["reading_notes"]), ""]
    if legacy_sheet_layout:
        view_group = next(g for g in metadata["assertion_groups"] if g["id"] == "views")
        bars = next(g for g in metadata["assertion_groups"] if g["id"] == "graphic-bars")["records"]
        lines.extend(["## Project and date semantics", "", *tree(metadata["project"]), "",
                      *tree(metadata["date_semantics"]), "", "## Every sheet and view", ""])
        for sheet in sheet_group["records"]:
            s = {**sheet_group.get("defaults", {}), **sheet}
            lines.extend([f"### PDF {s['page']} - {s['number']}: {s['title']}", "",
                          f"Approval: {s['approval_date']}. Revision: {metadata['date_semantics']['revision_date']['status']}. "
                          f"Title-block scale: {s['title_block_scale']}. Project sheet ordinal: {s['project_ordinal']}.", "",
                          s["view_type"], ""])
            vs = [{**view_group.get("defaults", {}), **v} for v in view_group["records"] if v["page"] == s["page"]]
            if vs:
                lines.extend(["| View | Title | Stated scale | Graphic bar |", "|---|---|---|---|"])
                for v in vs:
                    lines.append("| " + " | ".join(scalar(v[k]) for k in ["number", "title", "scale", "graphic_scale_bar"]) + " |")
                lines.append("")
            for b in bars:
                if b["page"] == s["page"]:
                    lines.extend([f"Graphic bar {b['id']}: {b['labels']}; source bounds {b['bbox']}.", ""])
    else:
        lines.extend(["## Project, scale, and supplied-sheet ledger", "", *tree(metadata["project"]), "",
                      *tree(metadata.get("scale_semantics", {})), ""])
        review_by_page = {p["page"]: p for p in metadata.get("visual_review_pages", [])}
        if sheet_group is not None:
            for sheet in sheet_group["records"]:
                s = {**sheet_group.get("defaults", {}), **sheet}
                review = review_by_page.get(s["page"], {})
                lines.extend([f"### PDF {s['page']} - {s['sheet']}: {s['title']}", "",
                              "Visual review: " + scalar(review.get("finding", "not recorded")) + ".", ""])
        else:
            for review in sorted(review_by_page.values(), key=lambda p: p["page"]):
                lines.extend([f"### PDF {review['page']} - {review.get('sheet', 'sheet ID visually reviewed')}: {review.get('title', 'title visually reviewed')}", "",
                              "Visual review: " + scalar(review.get("finding", "not recorded")) + ".", ""])
    lines.extend(["## Equipment identity index", "", "Specifications are in the full cited schedule rows below and in JSON `equipment_inventory`. These rows are not an installed-device grand total.", ""])
    if modules["equipment_reconciliation"].get("ledger_mode") == "literal_schedule_rows_v1":
        lines.extend(["| Literal source row | PDF / table / row |", "|---|---|"])
        for e in data["equipment_inventory"]:
            lines.append(f"| {scalar(e['id'])} | {e['source_page']} / {e['source_table']} / {e['source_row']} |")
    else:
        lines.extend(["| Scoped identity | Classification | PDF / table / row | Primary plan page / zone |", "|---|---|---|---|"])
        for e in data["equipment_inventory"]:
            anchor = e["primary_anchor"] or e["outlet_instances"] or {}
            lines.append(f"| {scalar(e['id'])} | {scalar(e['classification'])} | {e['source_page']} / {e['source_table']} / {e['source_row']} | {anchor.get('page', '')} / {scalar(anchor.get('zone', anchor.get('zones', 'see outlet record')))} |")
    if modules["point_applications"].get("ledger_mode") == "literal_source_row_matrices_v1":
        lines.extend(["", "## Per-application point ledger", "", modules["point_applications"]["expanded_count_warning"], ""])
        for app in modules["point_applications"]["applications"]:
            lines.extend([f"### {app['id']}", "", "| Source table / row | Literal source row | PDF |", "|---|---|---|"])
            for p in data["point_application_ledger"]:
                if p["application"] == app["id"]:
                    lines.append("| " + " | ".join(scalar(value) for value in [p["source_table"] + "/" + str(p["source_row"]), p["literal_source_row_as_printed"], p["page"]]) + " |")
            lines.append("")
    elif modules["point_applications"].get("ledger_mode") == "source_matrix_templates_v1":
        lines.extend(["", "Additional printed identities / source limitations:", "",
                      *tree(modules["equipment_reconciliation"].get("additional_identities", [])), "",
                      "## Per-application point ledger", "", modules["point_applications"]["expanded_count_warning"], ""])
        for app in modules["point_applications"]["applications"]:
            lines.extend([f"### {app['id']}", "", *tree({key: value for key, value in app.items() if key != "id"}), "",
                          "| Source table / tag | Point name as printed | Printed flag columns | Ownership scope | PDF |", "|---|---|---|---|---|"])
            for p in data["point_application_ledger"]:
                if p["application"] == app["id"]:
                    flags = ", ".join(f"{key}={value}" for key, value in p["printed_flag_columns"].items()) or "(none)"
                    lines.append("| " + " | ".join(scalar(value) for value in [
                        p["source_table"] + "/" + p["tag_as_printed"], p["point_name_as_printed"], flags,
                        p["ownership"]["value"], p["page"]]) + " |")
            lines.append("")
    else:
        lines.extend(["", "Additional printed identities, including unresolved classifications and plan-only EG-3:", "",
                      *tree(modules["equipment_reconciliation"]["additional_identities"]), "",
                      "## Per-application point ledger", "", modules["point_applications"]["expanded_count_warning"], ""])
        for app in modules["point_applications"]["applications"]:
            lines.extend([f"### {app['id']}", "", "Equipment scope: " + ", ".join(app["equipment_scope"]) + ".", "",
                          *tree({k: v for k, v in app.items() if k not in ["id", "equipment_scope", "point_tables", "counts", "instances"]}), "",
                          "| Table / mark | Type | Description as printed | Owner / component | Alarm | Trend | PDF |", "|---|---|---|---|---|---|---|"])
            for p in data["point_application_ledger"]:
                if p["application"] == app["id"]:
                    owner = "; ".join(p["ownership"]["owners"])
                    if p["valve_aliases_same_point"]:
                        owner += "; same point: " + ", ".join(v["schedule"] for v in p["valve_aliases_same_point"])
                    lines.append("| " + " | ".join(scalar(v) for v in [p["source_table"] + "/" + p["mark"], p["type_normalized"], p["description"], owner, p["alarm"], p["trend"], p["page"]]) + " |")
            lines.append("")
    for name in data["module_order"]:
        module = modules[name]
        # Earlier annotation modules use module_role as the concise scope
        # declaration.  Keep their authored wording visible without forcing a
        # duplicate scope field merely for Markdown rendering.
        lines.extend([f"## {name.replace('_', ' ').title()}", "",
                      module.get("scope", module.get("module_role", "Scope not separately stated.")), ""])
        for table in module["tables"]:
            lines.extend([f"### {table['id']} - PDF {table['page']}", "",
                          f"{len(table['rows'])} printed rows. Exact original cells below; units follow authored column keys and header witnesses.", ""])
            columns = table["columns"].split("|")
            lines.extend(["| Row | " + " | ".join(columns) + " |",
                          "|---|" + "---|" * len(columns)])
            for index, row in enumerate(table["rows"], 1):
                lines.append(f"| {index} | " + " | ".join(scalar(cell) if cell else "(blank)" for cell in row.split("|")) + " |")
            lines.append("")
            extra = {k: v for k, v in table.items() if k not in ["id", "page", "columns", "rows"]}
            lines.extend(tree(extra)); lines.append("")
        # Include every authored field: notes, conflict ledger, ownership,
        # literal evidence, bounds, headers, and negative findings are retained.
        extra = {k: v for k, v in module.items() if k not in ["document_id", "tables", "scope"]}
        lines.extend(tree(extra)); lines.append("")
    lines.extend(["## Requirement audit", "", *tree(data["requirement_audit"]), "",
                  "## Page review findings", "", *tree(data["page_review"]), "",
                  "## Verification", "", data["verification_semantics"], "",
                  f"Re-run: `python3 ground_truth/tools/bundle_record.py verify ground_truth/records/{data['id']}.json` from the collection directory.", ""])
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["build", "verify"])
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    target = build(args.path) if args.operation == "build" else args.path
    raise SystemExit(not validate(target))
