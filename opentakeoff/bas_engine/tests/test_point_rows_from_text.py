"""Point rule version 2: rows a point list prints that its extraction dropped,
read from the page's own text (a full-width section band ends many
extractions while the list goes on; a row can fall out between two rows).
Controlled grid fixtures in the printed shape of real lists, each with the
negative control that keeps the reader from taking text that is not the
list's: paragraphs, a stacked second list, its caption, a repeated header, a
gap, a value that would change how the extracted rows read, and version 1.
"""
from bas_engine import calculate
from bas_engine.adapters import BlueprintInput, IndexedTable, indexed_request
from bas_engine.assignment_demand import validate_observations
from bas_engine.point_lists import PointListInput, review_point_lists

V1, V2 = "point_observations_1", "point_observations_2"
SOURCE_ID = "sha256:" + "b" * 64
PAGE_ID = SOURCE_ID + ":p1"
ROW = 36
# (header, printed subheader, x0, x1): a grid like the 077_MT/VA lists.
COLUMNS = [("POINT NAME", "POINT NAME", 100, 400), ("HARDWARE POINTS AI", "AI", 400, 460),
           ("HARDWARE POINTS AO", "AO", 460, 520), ("HARDWARE POINTS BI", "BI", 520, 580),
           ("HARDWARE POINTS BO", "BO", 580, 640), ("SOFTWARE POINTS TRD", "TRD", 640, 700),
           ("NOTES", "NOTES", 700, 1000)]


def grid(rows, top=200, title="AHU-1 POINTS LIST", columns=COLUMNS, at=None):
    """An extracted grid table: its header row, then `rows` placed at the
    printed row positions `at` (default: one after another)."""
    def cells(texts, y):
        return {h: {"text": t, "bbox": [x0, y, x1, y + ROW]} for (h, _, x0, x1), t in zip(columns, texts) if t}
    at = at or list(range(len(rows)))
    raw = [{"key": "POINT NAME", "cells": cells([c[1] for c in columns], top)}]
    raw += [{"key": texts[0], "cells": cells(texts, top + ROW * (i + 1))} for i, texts in zip(at, rows)]
    return {"sheet": "controlled.pdf", "title": {"text": title, "bbox": [100, top - 40, 600, top - 10]},
            "headers": [c[0] for c in columns], "region": [100, top - 40, columns[-1][3], top + ROW * (max(at) + 2)],
            "rows": raw}


def printed(rows, top=200, columns=COLUMNS, first=1):
    """The page text of printed rows (names left-aligned, marks centred),
    starting at printed row `first` below the header row at `top`."""
    spans = []
    for i, texts in enumerate(rows):
        y = top + ROW * (i + first)
        for (_, _, x0, x1), t in zip(columns, texts):
            if t:
                width = 10 * len(t)
                sx = x0 + 6 if x1 - x0 > 100 else (x0 + x1) / 2 - width / 2
                spans.append((t, [sx, y + 8, sx + width, y + 28]))
    return spans


def header_text(top=200, columns=COLUMNS):
    return printed([[c[1] for c in columns]], top, columns, first=0)


def line(text, x0, y):
    return [(text, [x0, y + 8, x0 + 10 * len(text), y + 28])]


def payload(tables, spans):
    spans = sorted(spans, key=lambda s: (s[1][1], s[1][0]))
    return PointListInput.model_validate({"sources": {
        "schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1", "coordinate_frame": "image_px",
        "scope": "available_pdf_text_only",
        "documents": [{"source_id": SOURCE_ID, "sha256": "b" * 64, "byte_length": 1, "page_count": 1,
                       "names": ["controlled.pdf"]}],
        "pages": [{"page_id": PAGE_ID, "source_id": SOURCE_ID, "page_number": 1, "sheet_keys": ["controlled.pdf"],
                   "width_px": 3000, "height_px": 3000, "rotation": 0,
                   "text_status": "available" if spans else "no_text",
                   "spans": [{"span_id": f"{PAGE_ID}:s{i}", "source_index": i, "text": t, "bbox_px": b}
                             for i, (t, b) in enumerate(spans)]}]}, "tables": tables})


def matrix(result, title="AHU-1 POINTS LIST"):
    return next(m for m in result.matrices if m.raw.title and m.raw.title.text == title)


def io(row):
    return sorted((o.channel.split()[-1], o.value) for o in row.observations if o.kind == "declared_io")


EXTRACTED = [["SUPPLY AIR TEMP", "X", "", "", "", "X", ""], ["FAN STATUS", "", "", "X", "", "X", ""]]
DDC = [["SPACE TEMP", "X", "", "", "", "X", ""], ["FAN START/STOP", "", "", "", "X", "", ""]]


def band_list(after=()):
    """Two extracted rows, a full-width DDC CONTROLLER band, two more rows the
    extraction dropped, then whatever `after` prints below."""
    spans = header_text() + printed(EXTRACTED) + line("DDC CONTROLLER", 450, 200 + ROW * 3) + printed(DDC, first=4)
    return payload([grid(EXTRACTED)], spans + list(after))


def test_rows_after_a_section_band_are_read_from_the_page_and_flagged_for_review():
    result = review_point_lists(band_list(), V2)
    m = matrix(result)
    names = [r.name for r in m.rows]
    assert names == ["SUPPLY AIR TEMP", "FAN STATUS", "SPACE TEMP", "FAN START/STOP"]
    recovered = [r for r in m.rows if "SOURCE_TEXT_ROW_RECOVERED" in r.issues]
    assert [r.name for r in recovered] == ["SPACE TEMP", "FAN START/STOP"]
    assert all(r.status == "review_required" for r in recovered)
    assert io(recovered[0]) == [("AI", 1)] and io(recovered[1]) == [("DO", 1)]
    # Every recovered observation cites the printed span it was read from.
    assert all(o.source.bbox_px is not None and o.source.text == "X" for r in recovered for o in r.observations)
    # The extracted rows read exactly as before, and the matrix keeps its identity and region.
    plain = matrix(review_point_lists(payload([grid(EXTRACTED)], []), V2))
    assert m.matrix_id == plain.matrix_id and m.raw.region == plain.raw.region
    assert [(r.row_id, r.status, r.issues) for r in m.rows[:2]] == [(r.row_id, r.status, r.issues) for r in plain.rows]
    # A saved result replays: the assignment check re-reads the extended matrix.
    validate_observations(m, V2)


def test_version_1_reads_only_the_extracted_rows():
    assert [r.name for r in matrix(review_point_lists(band_list(), V1)).rows] == ["SUPPLY AIR TEMP", "FAN STATUS"]


def words(text, x0, y, space=6):
    """A line exported word by word (some CAD PDFs): one span per word."""
    spans = []
    for word in text.split():
        spans.append((word, [x0, y + 8, x0 + 10 * len(word), y + 28]))
        x0 += 10 * len(word) + space
    return spans


FOUR = ["SUPPLY AIR TEMP", "FAN STATUS", "SPACE TEMP", "FAN START/STOP"]


def test_a_heading_or_sentence_below_the_list_ends_it():
    # A row-shaped line right after a heading is the notes', not the list's.
    after = line("SEQUENCE OF OPERATION: FAN SHALL RUN CONTINUOUSLY", 100, 200 + ROW * 7)
    after += line("SPACE TEMP SENSOR BY OTHERS", 106, 200 + ROW * 8) + line("1", 425, 200 + ROW * 8)
    assert [r.name for r in matrix(review_point_lists(band_list(after), V2)).rows] == FOUR
    after = line("FAN SHALL RUN.", 100, 200 + ROW * 7)
    after += line("SPACE TEMP SENSOR BY OTHERS", 106, 200 + ROW * 8) + line("1", 425, 200 + ROW * 8)
    assert [r.name for r in matrix(review_point_lists(band_list(after), V2)).rows] == FOUR


def test_words_a_word_space_apart_are_one_text_not_cells():
    # Exported word by word, "SPACE TEMP SENSOR AT" sits in the name column and
    # "4" inside the AI column, but it runs on from "AT" a word space apart: a
    # sentence, not a row with four analog inputs.
    after = words("SPACE TEMP SENSOR AT 4", 212, 200 + ROW * 6, space=6)
    centre = {text: (b[0] + b[2]) / 2 for text, b in after}
    assert centre["AT"] < 400 <= centre["4"] <= 460
    assert [r.name for r in matrix(review_point_lists(band_list(after), V2)).rows] == FOUR
    # The same words set apart as cells are a row.
    cells = words("SPACE TEMP SENSOR AT", 106, 200 + ROW * 6) + line("4", 425, 200 + ROW * 6)
    rows = matrix(review_point_lists(band_list(cells), V2)).rows
    assert [r.name for r in rows] == [*FOUR, "SPACE TEMP SENSOR AT"] and io(rows[-1]) == [("AI", 4)]


HEATING = [["HEATING VALVE", "", "X", "", "", "X", ""]]


def test_a_second_point_list_below_keeps_its_own_rows():
    # Its title is no point-list caption and its header is drawn, not text:
    # the other matrix's own region ends this one.
    second_top = 200 + ROW * 7
    other = grid(HEATING, top=second_top, title="HEAT PUMP HP-2")
    spans = (header_text() + printed(EXTRACTED) + line("DDC CONTROLLER", 450, 200 + ROW * 3) + printed(DDC, first=4)
             + line("HEAT PUMP HP-2", 100, second_top - 40) + printed(HEATING, top=second_top))
    result = review_point_lists(payload([grid(EXTRACTED), other], spans), V2)
    assert [r.name for r in matrix(result).rows] == FOUR
    assert [r.name for r in matrix(result, "HEAT PUMP HP-2").rows] == ["HEATING VALVE"]


def test_an_unextracted_list_below_is_never_absorbed():
    second_top = 200 + ROW * 7
    # Its caption names a point list (its header drawn, not text): reading stops there.
    below = line("AHU-2 POINTS LIST", 100, second_top - 40) + printed(HEATING, top=second_top)
    assert [r.name for r in matrix(review_point_lists(band_list(below), V2)).rows] == FOUR
    # A title that names no point list: the list's own header printed again stops it.
    header = printed([["POINT NAME", "AI", "AO"]], top=second_top, first=0)
    below = line("HEAT PUMP HP-2", 100, second_top - 40) + header + printed(HEATING, top=second_top)
    assert [r.name for r in matrix(review_point_lists(band_list(below), V2)).rows] == FOUR


def test_three_lines_that_are_not_rows_end_the_list():
    # Short lines set 24 px apart (closer than the list's rows), then a row-shaped line.
    y = 200 + ROW * 6
    after = (line("LEGEND", 100, y) + line("X INDICATES POINT", 100, y + 24) + line("BLANK NOT USED", 100, y + 48)
             + printed(HEATING, top=y + 72 - ROW))
    assert [r.name for r in matrix(review_point_lists(band_list(after), V2)).rows] == FOUR
    # Two such lines (a band and a subtitle) do not.
    after = line("LEGEND", 100, y) + line("X INDICATES POINT", 100, y + 24) + printed(HEATING, top=y + 48 - ROW)
    assert [r.name for r in matrix(review_point_lists(band_list(after), V2)).rows] == [*FOUR, "HEATING VALVE"]


def test_a_row_named_as_an_extracted_row_starts_another_block():
    # A second block repeating the list's names (another unit's copy): neither it
    # nor what follows it is this list's, and the extracted row stays unflagged.
    after = printed([["SUPPLY AIR TEMP", "", "", "", "", "X", ""], ["RETURN FAN STATUS", "", "", "X", "", "", ""]], first=6)
    m = matrix(review_point_lists(band_list(after), V2))
    assert [r.name for r in m.rows] == FOUR
    assert "DUPLICATE_LOCAL_ROW_KEY" not in m.rows[0].issues


def test_text_wider_than_its_column_is_not_a_cell():
    # "SEE NOTE 4" centred on the AI column spills over its rules: not the list's cell.
    after = printed([["SPACE HUMIDITY", "", "", "", "", "X", ""]], first=6) + line("SEE NOTE 4", 380, 200 + ROW * 6)
    assert [r.name for r in matrix(review_point_lists(band_list(after), V2)).rows] == FOUR


def test_rows_beyond_a_gap_are_not_the_lists():
    spans = header_text() + printed(EXTRACTED) + printed(DDC, first=8)
    m = matrix(review_point_lists(payload([grid(EXTRACTED)], spans), V2))
    assert [r.name for r in m.rows] == ["SUPPLY AIR TEMP", "FAN STATUS"]


def test_a_row_between_extracted_rows_completes_the_printed_totals():
    rows = [["ZONE TEMP", "X", "", "", "", "X", ""], ["TOTALS", "2", "0", "0", "0", "2", ""]]
    dropped = [["ZONE CO2", "X", "", "", "", "X", ""]]
    spans = header_text() + printed(rows[:1]) + printed(dropped, first=2) + printed(rows[1:], first=3)
    before = matrix(review_point_lists(payload([grid(rows, at=[0, 2])], []), V2))
    assert "PRINTED_TOTAL_MISMATCH" in before.rows[-1].issues
    m = matrix(review_point_lists(payload([grid(rows, at=[0, 2])], spans), V2))
    assert [r.name for r in m.rows] == ["ZONE TEMP", "ZONE CO2", "TOTALS"]
    assert m.rows[1].issues == ["SOURCE_TEXT_ROW_RECOVERED"] and io(m.rows[1]) == [("AI", 1)]
    # The printed totals now equal the rows above them: no mismatch, and never points.
    assert m.rows[2].issues == [] and m.rows[2].observations == []


def test_a_value_that_would_change_how_the_extracted_rows_read_keeps_them_as_they_were():
    # TRD is an attribute only while every value is a mark or a count. A
    # recovered "NOTE 2" would unread the extracted rows' TRD: no recovery.
    odd = [["SPACE TEMP", "X", "", "", "", "NOTE 2", ""]]
    spans = header_text() + printed(EXTRACTED) + line("DDC CONTROLLER", 450, 200 + ROW * 3) + printed(odd, first=4)
    m = matrix(review_point_lists(payload([grid(EXTRACTED)], spans), V2))
    assert [r.name for r in m.rows] == ["SUPPLY AIR TEMP", "FAN STATUS"]
    assert all("SOFTWARE POINTS TRD" in {o.channel for o in r.observations} for r in m.rows)


def test_a_header_cell_merged_over_columns_reads_each_column_by_its_own_header():
    columns = [*COLUMNS[:5], ("SOFTWARE POINTS AV", "AV BV ADJ SCH", 640, 700), ("SOFTWARE POINTS BV", "AV BV ADJ SCH", 700, 760),
               ("SOFTWARE POINTS ADJ", "AV BV ADJ SCH", 760, 820), ("SOFTWARE POINTS SCH", "AV BV ADJ SCH", 820, 880),
               ("SOFTWARE POINTS TRD", "TRD", 880, 940), ("NOTES", "NOTES", 940, 1200)]
    table = grid([["SUPPLY AIR TEMP", "X", "", "", "", "", "", "", "", "X", ""]], columns=columns)
    for row in table["rows"][:1]:  # the merged cell: one box over AV, BV, ADJ and SCH
        for h in ("SOFTWARE POINTS AV", "SOFTWARE POINTS BV", "SOFTWARE POINTS ADJ", "SOFTWARE POINTS SCH"):
            row["cells"][h]["bbox"] = [640, 200, 880, 200 + ROW]
    setpoint = [["SPACE SETPOINT", "", "", "", "", "X", "", "X", "X", "X", ""]]
    spans = (printed([["POINT NAME", "AI", "AO", "BI", "BO"]], columns=columns, first=0)
             + line("AV BV ADJ SCH", 650, 200) + printed([["SUPPLY AIR TEMP", "X", "", "", "", "", "", "", "", "X", ""]],
                                                       columns=columns) + printed(setpoint, columns=columns, first=2))
    m = matrix(review_point_lists(payload([table], spans), V2))
    row = m.rows[-1]
    assert row.name == "SPACE SETPOINT" and "SOURCE_TEXT_ROW_RECOVERED" in row.issues
    assert sorted(o.channel for o in row.observations) == [
        "SOFTWARE POINTS ADJ", "SOFTWARE POINTS AV", "SOFTWARE POINTS SCH", "SOFTWARE POINTS TRD"]


def test_math_counts_the_rows_the_point_lists_read():
    m = matrix(review_point_lists(band_list(), V2))
    # Production math swaps the graph's copy for the point list's matrix.
    result = calculate(indexed_request(BlueprintInput(tables=[IndexedTable.model_validate(m.raw.model_dump())])))
    assert result.physical_total.model_dump() == {"AI": 2, "AO": 0, "DI": 1, "DO": 1}


def test_math_never_counts_a_printed_subtotal_row():
    table = grid([["SUPPLY AIR TEMP", "X", "", "", "", "", ""], ["RETURN AIR TEMP", "X", "", "", "", "", ""],
                  ["SUB-TOTAL", "2", "0", "0", "0", "", ""]])
    table["rows"][-1]["key"] = "ST"
    result = calculate(indexed_request(BlueprintInput(tables=[IndexedTable.model_validate(table)])))
    assert result.physical_total.model_dump() == {"AI": 2, "AO": 0, "DI": 0, "DO": 0}


def test_math_reads_a_doubled_header_and_skips_a_printed_subtotal():
    # The extraction printed each header twice (a cell spanning two header rows).
    table = {"sheet": "s", "title": {"text": "POINTS LIST - PLANT", "bbox": [0, 0, 10, 10]},
             "headers": ["POINT ID POINT ID", "DESCRIPTION DESCRIPTION", "POINT TYPE POINT TYPE"],
             "region": [0, 0, 100, 100], "rows": [
                 {"key": key, "cells": {"POINT ID POINT ID": {"text": key, "bbox": [0, y, 9, y + 9]},
                                        "DESCRIPTION DESCRIPTION": {"text": name, "bbox": [10, y, 19, y + 9]},
                                        "POINT TYPE POINT TYPE": {"text": kind, "bbox": [20, y, 29, y + 9]}}}
                 for key, name, kind, y in (("HWS-T", "SUPPLY TEMPERATURE", "AI", 10), ("P-C", "PUMP COMMAND", "DO", 20),
                                            ("ST", "SUBTOTAL", "2", 30))]}
    result = calculate(indexed_request(BlueprintInput(tables=[IndexedTable.model_validate(table)])))
    assert result.physical_total.model_dump() == {"AI": 1, "AO": 0, "DI": 0, "DO": 1}
    lists = review_point_lists(PointListInput.model_validate({"sources": {
        "schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1", "coordinate_frame": "image_px",
        "scope": "available_pdf_text_only", "documents": [], "pages": []}, "tables": [table]}), V2)
    read = sorted(o.channel for r in lists.matrices[0].rows for o in r.observations if o.kind == "declared_io")
    assert read == ["AI", "DO"]
