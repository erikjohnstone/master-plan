"""Source-backed point observations. Mutated contexts below are controlled
negative fixtures, not actual revisions or an independent PDF extraction.
"""
import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from bas_engine.point_lists import PointListInput, review_point_lists


ROOT = Path(__file__).resolve().parents[2] / "docs/bas-production/evidence"


def real_input():
    capture = json.loads((ROOT / "baseline/fort-sam-text.json").read_text())
    graph = json.loads((ROOT / "fort-sam-routing-final-graph.json").read_text())
    source_id = "sha256:" + capture["sha256"]
    name = Path(capture["source"]).name
    pages = []
    for page in capture["pages"]:
        page_id = f'{source_id}:p{page["page"]}'
        pages.append({"page_id": page_id, "source_id": source_id, "page_number": page["page"],
            "sheet_keys": [name if page["page"] == 1 else f'{name}#{page["page"]}'],
            "width_px": page["width"], "height_px": page["height"], "rotation": 0,
            "text_status": "available" if any(s["str"].strip() for s in page["spans"]) else "no_text",
            "spans": [{"span_id": f"{page_id}:s{i}", "source_index": i, "text": s["str"],
                "bbox_px": [s["x0"], s["y0"], s["x1"], s["y1"]],
                **({"rotation": s["rot"]} if "rot" in s else {})} for i, s in enumerate(page["spans"])]})
    return {"tables": graph["tables"], "sources": {"schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1",
        "coordinate_frame": "image_px", "scope": "available_pdf_text_only",
        "documents": [{"source_id": source_id, "sha256": capture["sha256"], "byte_length": 924578,
            "page_count": 9, "names": [name]}], "pages": pages}}


def matrix(result, page):
    matches = [m for m in result.matrices if m.page_id and m.page_id.endswith(f":p{page}")]
    assert len(matches) == 1
    return matches[0]


def test_real_source_rows_flags_and_controller_qualifiers_are_preserved():
    payload = PointListInput.model_validate(real_input())
    before = payload.model_dump()
    result = review_point_lists(payload)
    assert payload.model_dump() == before
    assert len(result.matrices) == 12
    assert sum(len(m.rows) for m in result.matrices) == 193
    assert sum(m.header_rows for m in result.matrices) == 4
    assert sum(r.status == "unpopulated" for m in result.matrices for r in m.rows) == 3
    expected = {3: ({1, 3, 4, 6, 7, 18, 20}, "CHILLER CONTROLLER"),
                4: ({1, 2, 3, 4, 5, 6, 7, 26, 28}, "BOILER CONTROLLER")}
    for page, (starred, subject) in expected.items():
        m = matrix(result, page)
        assert {int(r.local_key) for r in m.rows if r.qualifiers} == starred
        for row in m.rows:
            if int(row.local_key) in starred:
                assert row.qualifiers[0].subject == subject
                assert row.qualifiers[0].kind == "controller_provided"
                assert row.qualifiers[0].source.span_id
                assert row.field_wiring_status == "not_established"
    for m in result.matrices:
        assert not m.issues
        assert all(not r.issues for r in m.rows)
        for row in m.rows:
            for obs in row.observations:
                cell = row.raw.cells[obs.source.column]
                assert obs.source.text == cell.text and obs.source.bbox_px == cell.bbox
                assert obs.source.page_id == m.page_id
                if obs.channel in {"ALARM", "TREND", "ADJUSTABLE", "SHOW ON GRAPHIC"}:
                    assert obs.kind == "attribute"
    assert not result.project_complete
    assert "physical_total" not in result.model_dump()


def test_no_qualifier_from_an_unmarked_row_or_missing_note():
    raw = real_input()
    for page in raw["sources"]["pages"]:
        for span in page["spans"]:
            if "INDICATES POINT PULLED" in span["text"]:
                span["text"] = "UNSUPPORTED SOURCE NOTE"
    result = review_point_lists(PointListInput.model_validate(raw))
    for page in (3, 4):
        for row in matrix(result, page).rows:
            assert not row.qualifiers
            assert ("POINT_FOOTNOTE_UNRESOLVED" in row.issues) == ("*" in row.name)
    # The four LON notes are real but their rows have no asterisks.
    assert all(not row.qualifiers for m in result.matrices if m.page_id.endswith(":p2") for row in m.rows)


def test_conflicting_notes_are_not_resolved_by_first_match():
    raw = real_input()
    page = raw["sources"]["pages"][2]
    note = copy.deepcopy(next(s for s in page["spans"] if "INDICATES POINT PULLED" in s["text"]))
    note.update(source_index=len(page["spans"]), span_id=f'{page["page_id"]}:s{len(page["spans"])}')
    note["text"] = "* INDICATES POINT PULLED FROM OTHER CONTROLLER"
    page["spans"].append(note)
    result = review_point_lists(PointListInput.model_validate(raw))
    row = matrix(result, 3).rows[0]
    assert "POINT_FOOTNOTE_UNRESOLVED" in row.issues and not row.qualifiers


def test_a_note_with_two_possible_matrix_owners_binds_to_neither():
    raw = real_input()
    table = copy.deepcopy(next(t for t in raw["tables"] if t["sheet"].endswith("#3")))
    table["title"]["text"] = "BACKUP BAS POINT LIST"  # Controlled overlapping-region conflict.
    raw["tables"].append(table)
    result = review_point_lists(PointListInput.model_validate(raw))
    affected = [m for m in result.matrices if m.page_id.endswith(":p3")]
    assert len(affected) == 2
    assert all("FOOTNOTE_TABLE_SCOPE_AMBIGUOUS" in m.issues for m in affected)
    assert all(not r.qualifiers for m in affected for r in m.rows)


@pytest.mark.parametrize("mutation", ["above", "outside", "rotated"])
def test_explicit_note_outside_supported_source_scope_is_unresolved(mutation):
    raw = real_input()
    note = next(s for s in raw["sources"]["pages"][2]["spans"] if "INDICATES POINT PULLED" in s["text"])
    if mutation == "above":
        note["bbox_px"] = [3104.4, 1400, 3754.4, 1428]
    elif mutation == "outside":
        note["bbox_px"] = [100, 2628, 750, 2656.1]
    else:
        note["rotation"] = 90
    result = matrix(review_point_lists(PointListInput.model_validate(raw)), 3)
    assert not result.notes
    assert all(not r.qualifiers for r in result.rows)
    assert all("POINT_FOOTNOTE_UNRESOLVED" in r.issues for r in result.rows if "*" in r.name)


def test_alias_rename_and_table_input_order_do_not_change_source_identities():
    raw = real_input()
    original = review_point_lists(PointListInput.model_validate(raw))
    aliases = {}
    raw["sources"]["documents"][0]["names"] = ["renamed.pdf"]
    for page in raw["sources"]["pages"]:
        aliases[page["sheet_keys"][0]] = f'renamed.pdf#{page["page_number"]}'
        page["sheet_keys"] = [aliases[page["sheet_keys"][0]]]
    for table in raw["tables"]:
        table["sheet"] = aliases[table["sheet"]]
    raw["tables"].reverse()
    renamed = review_point_lists(PointListInput.model_validate(raw))
    assert [(m.matrix_id, [r.row_id for r in m.rows]) for m in original.matrices] == [
        (m.matrix_id, [r.row_id for r in m.rows]) for m in renamed.matrices]
    assert original == review_point_lists(PointListInput.model_validate(real_input()))


def test_local_row_duplicates_remain_visible_not_added_to_a_quantity():
    raw = real_input()
    table = next(t for t in raw["tables"] if t["sheet"].endswith("#3"))
    table["rows"].append(copy.deepcopy(table["rows"][0]))
    rows = matrix(review_point_lists(PointListInput.model_validate(raw)), 3).rows
    duplicates = [r for r in rows if r.local_key == "1"]
    assert len(duplicates) == 2 and len({r.row_id for r in duplicates}) == 2
    assert all("DUPLICATE_LOCAL_ROW_KEY" in r.issues for r in duplicates)


def test_sparse_unobserved_cell_is_not_an_explicit_blank_or_zero():
    raw = real_input()
    table = next(t for t in raw["tables"] if t["sheet"].endswith("#3"))
    header = "DI"  # The real first row has an explicit DI mark; other cells are sparse.
    del table["rows"][0]["cells"][header]
    row = matrix(review_point_lists(PointListInput.model_validate(raw)), 3).rows[0]
    assert header in row.unobserved_columns
    assert all(o.source.column != header for o in row.observations)
    table["rows"][0]["cells"][header] = {"text": "", "bbox": [3971.52, 1572.24, 4057.44, 1611.84]}
    explicit = matrix(review_point_lists(PointListInput.model_validate(raw)), 3).rows[0]
    assert header not in explicit.unobserved_columns
    assert next(o for o in explicit.observations if o.source.column == header).value == 0


@pytest.mark.parametrize("title", ["BAS CONTROL DIAGRAM", "DDC PANEL BILL OF MATERIAL", "SEE POINT LIST", "I/O WIRING DETAIL"])
def test_keyword_only_or_reference_caption_is_not_a_point_matrix(title):
    raw = real_input()
    raw["tables"] = [{"sheet": raw["tables"][0]["sheet"], "title": {"text": title},
                      "headers": ["ITEM", "QUANTITY"], "rows": [{"key": "1", "cells": {
                          "ITEM": {"text": "Controller"}, "QUANTITY": {"text": "1"}}}]}]
    assert not review_point_lists(PointListInput.model_validate(raw)).matrices


@pytest.mark.parametrize("box", [[10, 10, 0, 0], [False, 0, 1, 1], ["0", 0, 1, 1], [0, 0, float("inf"), 1]])
def test_invalid_box_in_uninterpreted_raw_cell_is_not_accepted(box):
    raw = real_input()
    raw["tables"][0]["rows"][0]["cells"]["UNINTERPRETED"] = {"text": "unknown", "bbox": box}
    with pytest.raises(ValidationError):
        PointListInput.model_validate(raw)


@pytest.mark.parametrize("corrupt", ["source_hash", "page_identity", "span_identity", "box", "nan", "alias"])
def test_invalid_source_contract_refuses(corrupt):
    raw = real_input()
    p = raw["sources"]["pages"][0]
    if corrupt == "source_hash":
        raw["sources"]["documents"][0]["sha256"] = "0" * 64
    elif corrupt == "page_identity":
        p["page_number"] = 20
    elif corrupt == "span_identity":
        p["spans"][0]["source_index"] = 8
    elif corrupt == "box":
        p["spans"][0]["bbox_px"] = [10, 10, 0, 0]
    elif corrupt == "nan":
        p["spans"][0]["bbox_px"][0] = float("nan")
    else:
        raw["sources"]["pages"][1]["sheet_keys"] = p["sheet_keys"]
    with pytest.raises(ValidationError):
        PointListInput.model_validate(raw)
