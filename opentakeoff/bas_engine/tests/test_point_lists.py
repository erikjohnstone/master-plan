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


def row_oriented_source_input():
    raw = real_input()
    raw["tables"] = []
    page = raw["sources"]["pages"][0]
    values = [
        ("HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - AHU-1", [400, 100, 900, 125], None),
        ("POINT TYPE", [700, 160, 725, 260], 270),
        ("POINT NAME", [350, 235, 450, 260], None),
        ("TAG", [600, 235, 650, 260], None),
        ("1", [200, 280, 215, 305], None),
        ("DUCT STATIC PRESSURE", [230, 280, 480, 305], None),
        ("SP-1", [610, 280, 650, 305], None),
        ("AI", [705, 280, 725, 305], None),
        ("2", [200, 320, 215, 345], None),
        ("STATIC PRESSURE SENSOR - HIGH STATIC", [230, 320, 540, 345], None),
        ("SP-2", [610, 320, 650, 345], None),
        ("AI", [705, 320, 725, 345], None),
        ("SHUTDOWN", [230, 347, 320, 365], None),
        ("SHEET-4", [200, 380, 900, 405], None),
        ("FAN START/STOP", [230, 380, 430, 405], None),
        ("SS-1", [610, 380, 650, 405], None),
        ("BO", [705, 380, 725, 405], None),
        ("99", [200, 500, 225, 525], None),
        ("AI", [705, 500, 725, 525], None),
    ]
    page["spans"] = [{"span_id": f'{page["page_id"]}:s{i}', "source_index": i,
        "text": text, "bbox_px": box, **({"rotation": rotation} if rotation is not None else {})}
        for i, (text, box, rotation) in enumerate(values)]
    page["text_status"] = "available"
    return raw


def marked_source_input(title="CHILLER PLANT DDC POINTS LIST"):
    raw = real_input()
    raw["tables"] = []
    page = raw["sources"]["pages"][0]
    values = [
        (title, [300, 100, 950, 125]),
        ("NAME", [350, 150, 400, 175]),
        ("DESCRIPTION", [470, 150, 600, 175]),
        ("TREND", [800, 150, 840, 175]),
        ("ALARM", [850, 150, 890, 175]),
        ("GRAPHIC", [900, 150, 950, 175]),
        ("AI1", [360, 200, 390, 225]),
        ("SUPPLY WATER TEMPERATURE", [430, 200, 690, 225]),
        ("BI2", [360, 240, 390, 265]),
        ("PUMP STATUS", [430, 240, 570, 265]),
        ("BO3", [360, 280, 390, 305]),
        ("PUMP START STOP", [430, 280, 600, 305]),
        ("AI99", [100, 320, 135, 345]),
        ("AI88", [360, 600, 395, 625]),
        ("UNRELATED DIAGRAM LABEL", [430, 600, 650, 625]),
    ]
    page["spans"] = [{"span_id": f'{page["page_id"]}:s{i}', "source_index": i,
        "text": text, "bbox_px": box} for i, (text, box) in enumerate(values)]
    page["text_status"] = "available"
    return raw


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


def test_row_oriented_point_function_schedule_is_source_bound_and_counted_once_per_row():
    raw = real_input()
    sheet = raw["sources"]["pages"][0]["sheet_keys"][0]
    raw["tables"] = [{"sheet": sheet,
        "title": {"text": "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - AHU-1",
                  "bbox": [100, 100, 900, 140]},
        "region": [100, 100, 900, 500], "headers": ["POINT NAME", "TAG", "POINT TYPE"],
        "rows": [
            {"key": "1", "cells": {"POINT NAME": {"text": "DUCT STATIC PRESSURE", "bbox": [110, 160, 400, 190]},
              "TAG": {"text": "SP-1", "bbox": [410, 160, 500, 190]},
              "POINT TYPE": {"text": "AI", "bbox": [510, 160, 560, 190]}}},
            {"key": "2", "cells": {"POINT NAME": {"text": "FAN START/STOP", "bbox": [110, 200, 400, 230]},
              "TAG": {"text": "SS-1", "bbox": [410, 200, 500, 230]},
              "POINT TYPE": {"text": "BO", "bbox": [510, 200, 560, 230]}}},
            {"key": "3", "cells": {"POINT NAME": {"text": "FAN STATUS", "bbox": [110, 240, 400, 270]},
              "TAG": {"text": "CSR-1", "bbox": [410, 240, 500, 270]},
              "POINT TYPE": {"text": "BINARY INPUT", "bbox": [510, 240, 650, 270]}}},
        ]}]
    before = copy.deepcopy(raw)
    result = review_point_lists(PointListInput.model_validate(raw))
    assert raw == before
    assert len(result.matrices) == 1
    rows = result.matrices[0].rows
    assert [row.name for row in rows] == ["DUCT STATIC PRESSURE", "FAN START/STOP", "FAN STATUS"]
    assert [row.observations[0].channel for row in rows] == ["AI", "DO", "DI"]
    assert all(row.observations[0].value == 1 for row in rows)
    assert all(row.observations[0].source.column == "POINT TYPE" for row in rows)
    assert all(row.observations[0].source.bbox_px == row.raw.cells["POINT TYPE"].bbox for row in rows)
    assert all(row.status == "interpreted" and not row.issues for row in rows)


def test_row_oriented_unknown_or_duplicate_type_schema_is_review_only():
    raw = real_input()
    sheet = raw["sources"]["pages"][0]["sheet_keys"][0]
    base = {"sheet": sheet, "title": {"text": "BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS"},
        "region": [100, 100, 900, 500], "headers": ["POINT NAME", "POINT TYPE"],
        "rows": [{"key": "1", "cells": {"POINT NAME": {"text": "UNKNOWN SIGNAL", "bbox": [110, 160, 400, 190]},
            "POINT TYPE": {"text": "ANALOG", "bbox": [510, 160, 600, 190]}}}]}
    raw["tables"] = [base]
    row = review_point_lists(PointListInput.model_validate(raw)).matrices[0].rows[0]
    assert row.status == "review_required" and not row.observations
    assert "POINT_TYPE_AMBIGUOUS" in row.issues

    duplicate = copy.deepcopy(base)
    duplicate["headers"].append("I/O TYPE")
    duplicate["rows"][0]["cells"]["I/O TYPE"] = {"text": "AI", "bbox": [610, 160, 680, 190]}
    raw["tables"] = [duplicate]
    matrix = review_point_lists(PointListInput.model_validate(raw)).matrices[0]
    assert "POINT_TYPE_COLUMN_UNRESOLVED" in matrix.issues
    assert not matrix.rows[0].observations


def test_generic_equipment_type_column_is_not_a_row_oriented_point_matrix():
    raw = real_input()
    raw["tables"] = [{"sheet": raw["sources"]["pages"][0]["sheet_keys"][0],
        "title": {"text": "AIR HANDLING UNIT SCHEDULE"}, "headers": ["DEVICE", "TYPE"],
        "rows": [{"key": "AHU-1", "cells": {"DEVICE": {"text": "AHU-1"}, "TYPE": {"text": "AI"}}}]}]
    assert not review_point_lists(PointListInput.model_validate(raw)).matrices


def test_explicit_point_function_schedule_recovers_core_rows_from_source_spans():
    raw = row_oriented_source_input()
    before = copy.deepcopy(raw)
    result = review_point_lists(PointListInput.model_validate(raw))
    assert raw == before
    assert len(result.matrices) == 1
    matrix = result.matrices[0]
    assert matrix.page_id == raw["sources"]["pages"][0]["page_id"]
    assert matrix.issues == ["SOURCE_SPAN_CORE_COLUMNS_ONLY"]
    assert [row.local_key for row in matrix.rows] == ["1", "2", "4"]
    assert [row.name for row in matrix.rows] == [
        "DUCT STATIC PRESSURE", "STATIC PRESSURE SENSOR - HIGH STATIC SHUTDOWN", "FAN START/STOP"]
    assert [row.observations[0].channel for row in matrix.rows] == ["AI", "AI", "DO"]
    assert all(row.observations[0].value == 1 for row in matrix.rows)
    assert all(row.observations[0].source.bbox_px == row.raw.cells["HARDWARE POINT TYPE"].bbox
               for row in matrix.rows)
    assert all(row.status == "review_required" for row in matrix.rows)


def test_source_recovery_replaces_a_partial_matching_graph_table_without_losing_cells():
    raw = row_oriented_source_input()
    page = raw["sources"]["pages"][0]
    raw["tables"] = [{"sheet": page["sheet_keys"][0],
        "title": {"text": "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - AHU-1",
                  "bbox": [400, 100, 900, 125]},
        "region": [190, 100, 900, 310],
        "headers": ["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE", "SOFTWARE TREND"],
        "rows": [{"key": "1", "cells": {
            "POINT NAME": {"text": "DUCT STATIC PRESSURE", "bbox": [230, 280, 480, 305]},
            "HARDWARE TAG": {"text": "SP-1", "bbox": [610, 280, 650, 305]},
            "HARDWARE POINT TYPE": {"text": "AI", "bbox": [705, 280, 725, 305]},
            "SOFTWARE TREND": {"text": "X", "bbox": [760, 280, 780, 305]},
        }}]}]
    matrix = review_point_lists(PointListInput.model_validate(raw)).matrices[0]
    assert len(matrix.rows) == 3
    assert "SOFTWARE TREND" in matrix.raw.headers
    assert matrix.rows[0].raw.cells["SOFTWARE TREND"].text == "X"
    assert "SOURCE_SPAN_CORE_COLUMNS_ONLY" not in matrix.issues
    assert matrix.raw.region[3] >= 405


def test_source_recovery_retains_graph_rows_outside_its_bounded_row_run():
    raw = row_oriented_source_input()
    page = raw["sources"]["pages"][0]
    raw["tables"] = [{"sheet": page["sheet_keys"][0],
        "title": {"text": "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - AHU-1",
                  "bbox": [400, 100, 900, 125]},
        "region": [190, 100, 900, 310],
        "headers": ["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE", "NOTE"],
        "rows": [
            {"key": "1", "cells": {
                "POINT NAME": {"text": "DUCT STATIC PRESSURE", "bbox": [230, 280, 480, 305]},
                "HARDWARE TAG": {"text": "SP-1", "bbox": [610, 280, 650, 305]},
                "HARDWARE POINT TYPE": {"text": "AI", "bbox": [705, 280, 725, 305]}},
            },
            {"key": "GRAPH-ONLY", "cells": {
                "POINT NAME": {"text": "EXPLICIT GRAPH ROW", "bbox": [230, 430, 480, 455]},
                "HARDWARE TAG": {"text": "GO-1", "bbox": [610, 430, 650, 455]},
                "HARDWARE POINT TYPE": {"text": "AO", "bbox": [705, 430, 725, 455]},
                "NOTE": {"text": "Retain me", "bbox": [760, 430, 850, 455]}},
            },
        ]}]
    matrix = review_point_lists(PointListInput.model_validate(raw)).matrices[0]
    assert [row.local_key for row in matrix.rows] == ["1", "2", "4", "GRAPH-ONLY"]
    retained = matrix.rows[-1]
    assert retained.raw.cells["NOTE"].text == "Retain me"
    assert retained.observations[0].channel == "AO"


@pytest.mark.parametrize("title", [
    "CHILLER PLANT DDC POINTS LIST",
    "VARIABLE FREQUENCY DRIVE BACNET INTERFACE SCHEDULE",
])
def test_marked_point_schedule_recovers_grounded_core_rows_and_direction(title):
    raw = marked_source_input(title)
    before = copy.deepcopy(raw)
    matrix = review_point_lists(PointListInput.model_validate(raw)).matrices[0]
    assert raw == before
    assert matrix.issues == ["SOURCE_SPAN_CORE_COLUMNS_ONLY"]
    assert [row.local_key for row in matrix.rows] == ["AI1", "BI2", "BO3"]
    assert [row.name for row in matrix.rows] == [
        "SUPPLY WATER TEMPERATURE", "PUMP STATUS", "PUMP START STOP"]
    assert [row.observations[0].channel for row in matrix.rows] == ["AI", "DI", "DO"]
    assert all(row.observations[0].source.column == "POINT NUMBER" for row in matrix.rows)
    assert all(row.status == "review_required" for row in matrix.rows)


def test_marked_source_recovery_extends_a_clipped_graph_table_without_inventing_flags():
    raw = marked_source_input()
    page = raw["sources"]["pages"][0]
    raw["tables"] = [{"sheet": page["sheet_keys"][0],
        "title": {"text": "CHILLER PLANT DDC POINTS LIST", "bbox": [300, 100, 950, 125]},
        "region": [300, 100, 950, 230],
        "headers": ["NAME", "DESCRIPTION", "TREND", "ALARM", "GRAPHIC"],
        "rows": [{"key": "AI1", "cells": {
            "NAME": {"text": "AI1", "bbox": [360, 200, 390, 225]},
            "DESCRIPTION": {"text": "SUPPLY WATER TEMPERATURE", "bbox": [430, 200, 690, 225]},
            "TREND": {"text": "X", "bbox": [800, 200, 820, 225]},
        }}]}]
    matrix = review_point_lists(PointListInput.model_validate(raw)).matrices[0]
    assert len(matrix.rows) == 3
    assert matrix.rows[0].raw.cells["TREND"].text == "X"
    assert matrix.rows[1].unobserved_columns == ["ALARM", "GRAPHIC", "TREND"]
    assert "SOURCE_SPAN_CORE_COLUMNS_ONLY" not in matrix.issues
    assert [row.observations[0].channel for row in matrix.rows] == ["AI", "DI", "DO"]


def test_split_bacnet_caption_merges_with_the_overlapping_full_graph_title_once():
    raw = marked_source_input("BACNET INTERFACE SCHEDULE")
    page = raw["sources"]["pages"][0]
    raw["tables"] = [{"sheet": page["sheet_keys"][0],
        "title": {"text": "VARIABLE FREQUENCY DRIVE BACNET INTERFACE SCHEDULE",
                  "bbox": [300, 80, 950, 125]},
        "region": [300, 80, 950, 230], "headers": ["NAME", "DESCRIPTION", "TREND"],
        "rows": [{"key": "AI1", "cells": {
            "NAME": {"text": "AI1", "bbox": [360, 200, 390, 225]},
            "DESCRIPTION": {"text": "SUPPLY WATER TEMPERATURE", "bbox": [430, 200, 690, 225]}}}]}]
    result = review_point_lists(PointListInput.model_validate(raw))
    assert len(result.matrices) == 1
    assert result.matrices[0].raw.title.text == "VARIABLE FREQUENCY DRIVE BACNET INTERFACE SCHEDULE"
    assert len(result.matrices[0].rows) == 3


def test_source_span_recovery_requires_all_three_explicit_headers():
    raw = row_oriented_source_input()
    page = raw["sources"]["pages"][0]
    page["spans"] = [span for span in page["spans"] if span["text"] != "TAG"]
    for index, span in enumerate(page["spans"]):
        span["source_index"] = index
        span["span_id"] = f'{page["page_id"]}:s{index}'
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
