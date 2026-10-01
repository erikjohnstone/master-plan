"""Point rule version 2: a point function schedule recovered from the page
text (the graph omitted it) also reads the columns it prints right of POINT
TYPE under rotated headers, named with their group (FAIL MODE, SOFTWARE,
ALARM LIMITS) as the graph names them where it extracts the schedule. Built
in the printed shape of the UFGS schedule (federal-mech / 019_FL sheet 21);
each rule with the negative control that keeps the schedule at its core
columns.
"""
from bas_engine.point_lists import PointListInput, review_point_lists

V1, V2 = "point_observations_1", "point_observations_2"
SOURCE_ID = "sha256:" + "c" * 64
PAGE_ID = SOURCE_ID + ":p1"
# Function columns: (group, header, centre x); pitch 40.
FUNCTIONS = [("FAIL MODE", "FAIL ON (OPEN)", 760), ("FAIL MODE", "FAIL OFF (CLOSED)", 800),
             ("SOFTWARE", "NETWORK POINT", 840), ("SOFTWARE", "ALARM INSTRUCTIONS", 880), ("SOFTWARE", "TREND", 920),
             ("ALARM LIMITS", "LOW LIMIT", 960), ("ALARM LIMITS", "HIGH LIMIT", 1000)]
ROWS = [("1", "DUCT STATIC PRESSURE", "SP-1", "AI", ["ALARM INSTRUCTIONS", "TREND"], ""),
        ("2", "SUPPLY AIR ISOLATION DAMPER", "D-1", "AO", ["FAIL ON (OPEN)"], ""),
        ("3", "SUPPLY FAN STATUS", "CSR-1", "DI", ["TREND"], "1")]


def schedule(rows=ROWS, labels=None, move=None, title_block=True):
    """Spans of a schedule: caption, group labels, POINT NAME/TAG headers, a
    rotated POINT TYPE and function headers, NOTES, then numbered rows."""
    labels = labels or [("HARDWARE", 665), ("FAIL MODE", 780), ("SOFTWARE", 880), ("ALARM", 980), ("LIMITS", 980)]
    spans = [("HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE", [400, 100, 900, 125], None),
             ("POINT NAME", [350, 235, 450, 260], None), ("TAG", [600, 235, 650, 260], None),
             ("POINT TYPE", [700, 160, 725, 260], 270), ("NOTES", [1030, 235, 1090, 260], None)]
    for i, (text, x) in enumerate(labels):
        y = 130 if text != "LIMITS" else 150
        spans.append((text, [x - 5 * len(text), y, x + 5 * len(text), y + 18], None))
    spans += [(header, [x - 12, 170, x + 12, 260], 270) for _group, header, x in FUNCTIONS]
    centre = {header: x for _group, header, x in FUNCTIONS}
    for i, (number, name, tag, kind, marks, note) in enumerate(rows):
        y = 280 + 40 * i
        spans += [(number, [200, y, 215, y + 25], None), (name, [230, y, 230 + 10 * len(name), y + 25], None),
                  (tag, [610, y, 650, y + 25], None), (kind, [705, y, 725, y + 25], None)]
        for mark in marks:
            x = centre[mark] + (move if move and mark == "TREND" and number == "1" else 0)
            spans.append(("■", [x - 5, y, x + 5, y + 25], None))
        if note:
            spans.append((note, [1050, y, 1060, y + 25], None))
        if title_block and i == 0:
            spans.append(("SmithGroup", [1500, y, 1600, y + 25], None))
    return PointListInput.model_validate({"tables": [], "sources": {
        "schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1", "coordinate_frame": "image_px",
        "scope": "available_pdf_text_only",
        "documents": [{"source_id": SOURCE_ID, "sha256": "c" * 64, "byte_length": 1, "page_count": 1,
                       "names": ["controlled.pdf"]}],
        "pages": [{"page_id": PAGE_ID, "source_id": SOURCE_ID, "page_number": 1, "sheet_keys": ["controlled.pdf"],
                   "width_px": 3000, "height_px": 2000, "rotation": 0, "text_status": "available",
                   "spans": [{"span_id": f"{PAGE_ID}:s{i}", "source_index": i, "text": text, "bbox_px": box,
                              **({"rotation": rotation} if rotation is not None else {})}
                             for i, (text, box, rotation) in enumerate(spans)]}]}})


def attributes(row):
    return sorted((o.channel, o.value) for o in row.observations if o.kind == "attribute")


def test_function_columns_are_read_under_their_groups():
    m = review_point_lists(schedule(), V2).matrices[0]
    assert m.issues == []
    assert m.raw.headers == ["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE",
                             "FAIL MODE FAIL ON (OPEN)", "FAIL MODE FAIL OFF (CLOSED)", "SOFTWARE NETWORK POINT",
                             "SOFTWARE ALARM INSTRUCTIONS", "SOFTWARE TREND", "ALARM LIMITS LOW LIMIT",
                             "ALARM LIMITS HIGH LIMIT", "NOTES"]
    one, two, three = m.rows
    assert attributes(one) == [("SOFTWARE ALARM INSTRUCTIONS", 1), ("SOFTWARE TREND", 1)]
    assert attributes(two) == [("FAIL MODE FAIL ON (OPEN)", 1)]
    assert one.status == two.status == "interpreted"
    # A note stays for review; text beyond the schedule's edge (the title block) is no cell.
    assert three.raw.cells["NOTES"].text == "1" and three.status == "review_required"
    assert all("SmithGroup" not in cell.text for row in m.rows for cell in row.raw.cells.values())
    # The I/O is still the row's printed type.
    assert [o.channel for row in m.rows for o in row.observations if o.kind == "declared_io"] == ["AI", "AO", "DI"]


def test_version_1_keeps_the_core_columns():
    m = review_point_lists(schedule(), V1).matrices[0]
    assert m.issues == ["SOURCE_SPAN_CORE_COLUMNS_ONLY"]
    assert m.raw.headers == ["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE"]


def test_a_mark_between_two_columns_keeps_the_core_columns():
    m = review_point_lists(schedule(move=20), V2).matrices[0]
    assert m.issues == ["SOURCE_SPAN_CORE_COLUMNS_ONLY"]
    assert all(row.status == "review_required" for row in m.rows)


def test_a_group_label_off_its_columns_keeps_the_core_columns():
    # SOFTWARE printed off-centre: its columns cannot be told from ALARM LIMITS'.
    labels = [("HARDWARE", 665), ("FAIL MODE", 780), ("SOFTWARE", 860), ("ALARM", 980), ("LIMITS", 980)]
    m = review_point_lists(schedule(labels=labels), V2).matrices[0]
    assert m.issues == ["SOURCE_SPAN_CORE_COLUMNS_ONLY"]


def test_a_network_point_mark_stays_for_review():
    rows = [*ROWS[:2], ("3", "OUTSIDE AIR TEMPERATURE", "T-9", "AI", ["NETWORK POINT", "TREND"], "")]
    m = review_point_lists(schedule(rows=rows), V2).matrices[0]
    assert m.rows[2].status == "review_required" and "SOFTWARE NETWORK POINT" in m.rows[2].uninterpreted_columns


def test_printed_limit_values_are_programmed_not_counted():
    rows = [("1", "DUCT STATIC PRESSURE", "SP-1", "AI", ["TREND"], ""), ROWS[1]]
    p = schedule(rows=rows)
    page = p.sources.pages[0]
    spans = [s.model_dump() for s in page.spans] + [
        {"span_id": f"{PAGE_ID}:s{len(page.spans)}", "source_index": len(page.spans), "text": "55",
         "bbox_px": [950, 280, 970, 305]}]
    raw = p.model_dump()
    raw["sources"]["pages"][0]["spans"] = spans
    m = review_point_lists(PointListInput.model_validate(raw), V2).matrices[0]
    row = m.rows[0]
    assert row.raw.cells["ALARM LIMITS LOW LIMIT"].text == "55"
    assert "ALARM LIMITS LOW LIMIT" not in {o.channel for o in row.observations}
    assert row.status == "interpreted"
