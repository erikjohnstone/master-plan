"""Point rule version 2: a list's first data row the extraction folded into
its header ("EQUIPMENT DESCRIPTION COOLING VALVE V-1", "... VALVE POSITION
●"), in the printed shape of the VA points list (05_MO sheet 54). The header
is read without the folded row, and the row is read where the page prints
it, only where the page line reads exactly the values the header carries.
"""
from bas_engine.point_lists import PointListInput, review_point_lists

V1, V2 = "point_observations_1", "point_observations_2"
SOURCE_ID = "sha256:" + "d" * 64
PAGE_ID = SOURCE_ID + ":p1"
ROW = 26
# (folded header, x0, x1); the label is the header without the folded value.
COLUMNS = [("EQUIPMENT DESCRIPTION COOLING VALVE V-1", 100, 400), ("CONTROL POINT TAG CLG-V1", 400, 520),
           ("SYSTEM OUTPUTS ANALOG VALVE POSITION ●", 520, 563), ("SYSTEM INPUTS ANALOG TEMPERATURE (TI)", 563, 606),
           ("SYSTEM SOFTWARE / CONTROL APPLICATION / FUNCTION GRAPHIC DISPLAY ●", 606, 649)]
ROWS = [["MIXED AIR TEMPERATURE", "T-5", "", "●", "●"], ["PRE-HEAT VALVE V-2", "HTG-V2", "●", "", "●"]]
FOLDED = ["COOLING VALVE V-1", "CLG-V1", "●", "", "●"]


def payload(columns=COLUMNS, folded=FOLDED, text=True):
    top = 300  # first extracted row
    table = {"sheet": "controlled.pdf", "title": {"text": "AHU POINTS LIST", "bbox": [100, 100, 400, 120]},
             "headers": [h for h, _a, _b in columns], "region": [100, 100, 649, top + ROW * len(ROWS)],
             "rows": [{"key": texts[1], "cells": {h: {"text": t, "bbox": [a, top + ROW * i, b, top + ROW * (i + 1)]}
                                                 for (h, a, b), t in zip(columns, texts) if t}}
                      for i, texts in enumerate(ROWS)]}
    spans = []

    def line(texts, y):
        for (_h, a, b), t in zip(columns, texts):
            if t:
                width = 10 * len(t) if len(t) > 1 else 11
                x = a + 4 if b - a > 60 else (a + b) / 2 - width / 2
                spans.append((t, [x, y + 4, x + width, y + 22]))
    if text:
        line(["EQUIPMENT DESCRIPTION", "CONTROL POINT TAG"], top - 2 * ROW)
        if folded:
            line(folded, top - ROW)
        for i, texts in enumerate(ROWS):
            line(texts, top + ROW * i)
    return PointListInput.model_validate({"tables": [table], "sources": {
        "schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1", "coordinate_frame": "image_px",
        "scope": "available_pdf_text_only",
        "documents": [{"source_id": SOURCE_ID, "sha256": "d" * 64, "byte_length": 1, "page_count": 1,
                       "names": ["controlled.pdf"]}],
        "pages": [{"page_id": PAGE_ID, "source_id": SOURCE_ID, "page_number": 1, "sheet_keys": ["controlled.pdf"],
                   "width_px": 2000, "height_px": 2000, "rotation": 0,
                   "text_status": "available" if spans else "no_text",
                   "spans": [{"span_id": f"{PAGE_ID}:s{i}", "source_index": i, "text": t, "bbox_px": b}
                             for i, (t, b) in enumerate(spans)]}]}})


def io(row):
    return sorted(o.channel for o in row.observations if o.kind == "declared_io")


def test_the_folded_row_is_read_where_the_page_prints_it():
    m = review_point_lists(payload(), V2).matrices[0]
    assert m.issues == []
    assert m.raw.headers[:3] == ["EQUIPMENT DESCRIPTION", "CONTROL POINT TAG", "SYSTEM OUTPUTS ANALOG VALVE POSITION"]
    assert [r.local_key for r in m.rows] == ["CLG-V1", "T-5", "HTG-V2"]
    folded = m.rows[0]
    assert folded.name == "COOLING VALVE V-1" and io(folded) == ["AO"]
    assert folded.issues == ["SOURCE_TEXT_ROW_RECOVERED"] and folded.status == "review_required"
    assert [r.status for r in m.rows[1:]] == ["interpreted", "interpreted"]
    assert io(m.rows[1]) == ["AI"] and io(m.rows[2]) == ["AO"]


def test_version_1_reads_the_header_as_printed():
    m = review_point_lists(payload(), V1).matrices[0]
    assert "POINT_NAME_COLUMN_UNRESOLVED" in m.issues
    assert len(m.rows) == 2
    # Even under a name label version 1 knows.
    columns = [("POINT NAME COOLING VALVE V-1", 100, 400), *COLUMNS[1:]]
    m = review_point_lists(payload(columns=columns), V1).matrices[0]
    assert "POINT_NAME_COLUMN_UNRESOLVED" in m.issues and m.raw.headers[0] == "POINT NAME COOLING VALVE V-1"
    assert len(m.rows) == 2


def test_a_page_line_that_disagrees_with_the_header_changes_nothing():
    for folded in (["COOLING VALVE V-2", "CLG-V1", "●", "", "●"],   # another name
                   ["COOLING VALVE V-1", "CLG-V1", "", "●", "●"],    # a mark in another column
                   None):                                            # no line above the rows
        m = review_point_lists(payload(folded=folded), V2).matrices[0]
        assert "POINT_NAME_COLUMN_UNRESOLVED" in m.issues and len(m.rows) == 2
    m = review_point_lists(payload(text=False), V2).matrices[0]
    assert "POINT_NAME_COLUMN_UNRESOLVED" in m.issues and len(m.rows) == 2


def test_a_name_header_with_more_words_and_no_folded_mark_is_left_as_printed():
    columns = [("EQUIPMENT DESCRIPTION COOLING VALVE V-1", 100, 400), ("CONTROL POINT TAG CLG-V1", 400, 520),
               ("SYSTEM OUTPUTS ANALOG VALVE POSITION", 520, 563), ("SYSTEM INPUTS ANALOG TEMPERATURE (TI)", 563, 606),
               ("SYSTEM SOFTWARE / CONTROL APPLICATION / FUNCTION GRAPHIC DISPLAY", 606, 649)]
    # Even with the line above printing exactly that name and tag: a name header
    # with more words is a fold only beside a header carrying a printed mark.
    m = review_point_lists(payload(columns=columns, folded=["COOLING VALVE V-1", "CLG-V1", "", "", ""]), V2).matrices[0]
    assert "POINT_NAME_COLUMN_UNRESOLVED" in m.issues and len(m.rows) == 2
