"""Point rule version 2 (point_observations_2). Controlled fixtures in the
printed shapes of real point lists (UFGS point function schedules, the VA
points list, Guideline 13 lists), each with the negative control that keeps
the rule from reading what a drawing does not print. Version 1 results stay
reproducible and are checked again under their own rule.
"""
import pytest

from bas_engine import calculate
from bas_engine.adapters import BlueprintInput, IndexedTable, column_type, indexed_request, printed_count
from bas_engine.assignment_demand import AssignmentDemandInput, calculate_assignment_demand, validate_observations
from bas_engine.point_lists import PointListInput, review_point_lists
from bas_engine.revision_quantities import RevisionQuantityInput, compare_revision_quantities

V1, V2 = "point_observations_1", "point_observations_2"
SOURCE_ID = "sha256:" + "a" * 64


def sources():
    return {"schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1",
            "coordinate_frame": "image_px", "scope": "available_pdf_text_only",
            "documents": [{"source_id": SOURCE_ID, "sha256": "a" * 64, "byte_length": 1,
                           "page_count": 1, "names": ["controlled.pdf"]}],
            "pages": [{"page_id": SOURCE_ID + ":p1", "source_id": SOURCE_ID, "page_number": 1,
                       "sheet_keys": ["controlled.pdf"], "width_px": 2000, "height_px": 2000, "rotation": 0,
                       "text_status": "no_text", "spans": []}]}


def table(headers, rows, title="AHU POINTS LIST", keys=None):
    return {"sheet": "controlled.pdf", "title": {"text": title, "bbox": [0, 0, 500, 20]},
            "headers": headers, "region": [0, 0, 1900, 40 + 20 * len(rows)], "rows": [
                {"key": keys[i] if keys else str(i + 1), "cells": {
                    h: {"text": text, "bbox": [j * 40, 30 + i * 20, j * 40 + 39, 45 + i * 20]}
                    for j, (h, text) in enumerate(zip(headers, row)) if text != ""}}
                for i, row in enumerate(rows)]}


def review(tables, rule=V2):
    return review_point_lists(PointListInput.model_validate({"sources": sources(), "tables": tables}), rule)


def io(row):
    return sorted((o.channel, o.value) for o in row.observations if o.kind != "attribute")


def attributes(row):
    return sorted((o.channel, o.value) for o in row.observations if o.kind == "attribute")


def test_filled_square_marks_read_as_marks_and_hollow_shapes_stay_unread():
    assert printed_count("■", V2) == 1 and printed_count("▪", V2) == 1
    assert printed_count("■", V1) is None
    assert printed_count("□", V2) is None and printed_count("○", V2) is None


@pytest.mark.parametrize("header,expected", [
    ("SYSTEM INPUTS ANALOG TEMPERATURE (TI)", ("physical", "AI")),
    ("SYSTEM INPUTS BINARY STATUS", ("physical", "DI")),
    ("SYSTEM OUTPUTS BINARY START / STOP", ("physical", "DO")),
    ("SYSTEM OUTPUTS ANALOG DAMPER POSITION", ("physical", "AO")),
    ("DIGITAL OUTPUTS FAN ENABLE", ("physical", "DO")),
    # No direction, two directions, two signal kinds, values or a software scope decide nothing.
    ("HARDWARE POINTS ANALOG", None),
    ("DIGITAL INPUT / OUTPUT", None),
    ("ANALOG / BINARY INPUTS", None),
    ("ANALOG VALUE INPUTS", None),
    ("SYSTEM SOFTWARE / CONTROL ALARM PROCESSING HIGH LIMIT", None),
    ("NETWORK INPUTS ANALOG", None),
])
def test_direction_and_signal_headers_are_physical_channels(header, expected):
    assert column_type(header, V2) == expected
    # Version 1 kept: none of these grammar-only headers was typed before.
    assert column_type(header, V1) is None


def ufgs_rows():
    headers = ["COL1", "POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE", "FAIL MODE LAST COMMANDED STATE",
               "SOFTWARE TREND", "SOFTWARE ALARM LIMITS", "ALARM LIMITS LOW LIMIT", "SOFTWARE NETWORK POINT", "NOTES"]
    rows = [["1", "BOILER HHWS FLOW", "FM-1", "AI", "", "■", "■", "5 PSI", "", ""],
            ["2", "BOILER ENABLE/DISABLE", "ED-1", "DO", "■", "", "", "", "", ""],
            ["3", "BOILER STATUS", "AX-2", "DI", "", "■", "", "", "■", ""],
            ["4", "BOILER ALARM", "AX-3", "DI", "", "", "", "", "", "BY BOILER MANUFACTURER"]]
    return headers, rows


def test_ufgs_function_columns_are_attributes_and_scope_columns_stay_for_review():
    headers, rows = ufgs_rows()
    result = review([table(headers, rows, "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - HHW")])
    by_name = {r.name: r for r in result.matrices[0].rows}
    flow = by_name["BOILER HHWS FLOW"]
    assert flow.status == "interpreted" and io(flow) == [("AI", 1)]
    assert attributes(flow) == [("SOFTWARE ALARM LIMITS", 1), ("SOFTWARE TREND", 1)]
    assert by_name["BOILER ENABLE/DISABLE"].status == "interpreted"
    assert attributes(by_name["BOILER ENABLE/DISABLE"]) == [("FAIL MODE LAST COMMANDED STATE", 1)]
    # A network point flag and a furnishing note are never read away.
    assert by_name["BOILER STATUS"].uninterpreted_columns == ["SOFTWARE NETWORK POINT"]
    assert by_name["BOILER ALARM"].uninterpreted_columns == ["NOTES"]
    assert {by_name[n].status for n in ("BOILER STATUS", "BOILER ALARM")} == {"review_required"}
    # Version 1 read none of these columns.
    old = review([table(headers, rows, "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - HHW")], V1)
    assert {r.status for r in old.matrices[0].rows} == {"review_required"}
    assert old.rule_version == V1 and result.rule_version == V2


def test_function_column_with_free_text_is_not_an_attribute():
    headers = ["POINT NAME", "AI", "SOFTWARE TREND"]
    result = review([table(headers, [["SUPPLY AIR TEMP", "X", "EVERY 15 MIN"]])])
    row = result.matrices[0].rows[0]
    assert row.uninterpreted_columns == ["SOFTWARE TREND"] and row.status == "review_required"


def test_row_number_column_is_metadata_only_when_it_is_the_row_key():
    headers = ["B-1", "POINT NAME", "AI", "DI"]
    numbered = review([table(headers, [["1", "HHWS TEMP", "X", ""], ["2", "PUMP STATUS", "", "X"]])])
    assert {r.status for r in numbered.matrices[0].rows} == {"interpreted"}
    # Integers that are not the rows' own numbers stay unread.
    other = review([table(headers, [["7", "HHWS TEMP", "X", ""], ["9", "PUMP STATUS", "", "X"]], keys=["1", "2"])])
    assert {tuple(r.uninterpreted_columns) for r in other.matrices[0].rows} == {("B-1",)}


def test_subheader_groups_read_gui_and_alarm_functions():
    headers = ["COL1", "COL2", "DDC HARD WIRED POINTS", "DDC HARD WIRED POINTS 2", "GUI APPLICATION",
               "ALARM PRIORITIES", "COL7"]
    sub = ["#", "CONTROL POINTS", "DIGITAL INPUTS", "ANALOG INPUTS", "TREND LOGGING", "MAINTENANCE",
           "SUPPLEMENTARY NOTES"]
    result = review([table(headers, [sub, ["1", "CHW SUPPLY TEMP", "", "X", "X", "X", ""],
                                      ["2", "CHILLER ALARM", "X", "", "X", "", "SEE NOTE 4"]],
                           "DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM")])
    matrix = result.matrices[0]
    assert matrix.header_rows == 1
    first, second = matrix.rows
    assert first.status == "interpreted" and io(first) == [("AI", 1)]
    assert attributes(first) == [("ALARM PRIORITIES MAINTENANCE", 1), ("GUI APPLICATION TREND LOGGING", 1)]
    assert second.uninterpreted_columns == ["COL7"] and second.status == "review_required"


def va_list(rows):
    headers = ["EQUIPMENT DESCRIPTION", "CONTROL POINT TAG", "ABBREVIATION", "SYSTEM OUTPUTS BINARY START / STOP",
               "SYSTEM OUTPUTS ANALOG VALVE POSITION", "SYSTEM INPUTS BINARY STATUS", "SYSTEM INPUTS BINARY ALARM",
               "SYSTEM INPUTS ANALOG TEMPERATURE (TI)", "SYSTEM SOFTWARE / CONTROL APPLICATION / FUNCTION TRENDING"]
    return table(headers, rows, "AHU POINTS LIST (APPLIES TO AC-15)", keys=[r[1] for r in rows])


def test_va_points_list_reads_each_rows_channel_and_alarm_flags():
    result = review([va_list([
        ["LEAVING COIL TEMPERATURE", "T-6", "LCT", "", "", "", "●", "●", "●"],
        ["SUPPLY FAN STATUS", "SF-STS", "SF-STS", "", "", "●", "", "", "●"],
        ["SUPPLY FAN ALARM", "SF-ALA", "SF-ALA", "", "", "", "●", "", "●"],
        ["CONDENSING UNIT START/STOP", "CU-SST", "CU-SST", "●", "", "", "●", "", "●"],
        ["COOLING VALVE V-1", "CLG-V1", "CLG-V1", "", "●", "", "", "", "●"]])])
    rows = {r.local_key: r for r in result.matrices[0].rows}
    assert result.matrices[0].issues == []
    # An analog sensor's alarm mark is its reading's alarm, not a second input.
    assert io(rows["T-6"]) == [("AI", 1)] and ("SYSTEM INPUTS BINARY ALARM", 1) in attributes(rows["T-6"])
    assert rows["T-6"].status == "interpreted"
    # Alone, the alarm column is the row's own binary input.
    assert io(rows["SF-ALA"]) == [("DI", 1)] and rows["SF-ALA"].status == "interpreted"
    # Beside an output it is left for review and never counted.
    assert io(rows["CU-SST"]) == [("DO", 1)] and rows["CU-SST"].issues == ["POINT_CHANNEL_AMBIGUOUS"]
    assert io(rows["CLG-V1"]) == [("AO", 1)] and io(rows["SF-STS"]) == [("DI", 1)]
    assert rows["CLG-V1"].name == "COOLING VALVE V-1"
    for matrix in result.matrices:
        validate_observations(matrix, V2)


def test_math_reads_the_same_channels_as_the_point_lists():
    raw = va_list([["LEAVING COIL TEMPERATURE", "T-6", "LCT", "", "", "", "●", "●", "●"],
                   ["SUPPLY FAN ALARM", "SF-ALA", "SF-ALA", "", "", "", "●", "", "●"],
                   ["CONDENSING UNIT START/STOP", "CU-SST", "CU-SST", "●", "", "", "●", "", "●"]])
    result = calculate(indexed_request(BlueprintInput(tables=[IndexedTable.model_validate(raw)])))
    assert result.physical_total.model_dump() == {"AI": 1, "AO": 0, "DI": 1, "DO": 1}
    assert "INDEX_ALARM_CHANNEL_AMBIGUOUS" in {d.code for d in result.diagnostics}


def test_a_printed_header_twice_is_read_once():
    headers = ["POINT ID POINT ID", "DESCRIPTION DESCRIPTION", "POINT TYPE POINT TYPE", "DEFAULT SET POINT DEFAULT SET POINT"]
    result = review([table(headers, [["SHWS-T", "HOT WATER SUPPLY TEMPERATURE", "AI", "42 F"]],
                           "POINTS LIST - BOILER WATER PLANT CROSS-TIE")])
    row = result.matrices[0].rows[0]
    assert io(row) == [("AI", 1)] and row.name == "HOT WATER SUPPLY TEMPERATURE"
    assert row.status == "interpreted"
    assert review([table(headers, [["SHWS-T", "X", "AI", "42 F"]], "POINTS LIST - X")], V1).matrices[0].issues


def test_a_name_printed_beside_its_header_is_the_points_name():
    headers = ["NAME", "COL2", "DESCRIPTION", "TREND", "ALARM", "GRAPHIC"]
    rows = [["BI1", "FAN STATUS", "", "●", "●", "●"], ["BO1", "START / STOP COMMAND", "", "●", "", "●"]]
    spilled = review([table(headers, rows, "SCHEDULED EXHAUST FAN DDC POINTS LIST", keys=["BI1", "BO1"])])
    assert [(r.name, r.status) for r in spilled.matrices[0].rows] == [
        ("FAN STATUS", "interpreted"), ("START / STOP COMMAND", "interpreted")]
    # Where the printed identity column holds any name, nothing moves.
    held = [["BI1", "FAN STATUS", "FAN", "●", "●", "●"], ["BO1", "START / STOP COMMAND", "", "●", "", "●"]]
    kept = review([table(headers, held, "SCHEDULED EXHAUST FAN DDC POINTS LIST", keys=["BI1", "BO1"])])
    assert [r.name for r in kept.matrices[0].rows] == ["FAN", ""]


def g13_list(totals):
    headers = ["POINT NAME", "AI", "AO", "BI", "BO", "AV", "LOOP", "SCHED", "TREND", "ALARM"]
    return table(headers, [["ZONE TEMP", "X", "", "", "", "", "0", "0", "X", ""],
                           ["PUMP STATUS", "", "", "X", "", "", "", "", "X", "X"],
                           ["TOTAL FLOW", "X", "", "", "", "", "", "", "", ""],
                           ["TOTALS", *totals]], "HARDWARE POINTS SOFTWARE POINTS")


def test_a_printed_totals_row_checks_the_rows_and_is_never_points():
    result = review([g13_list(["2", "0", "1", "0", "0", "0", "0", "2", "1"])])
    rows = {r.name: r for r in result.matrices[0].rows}
    assert rows["TOTALS"].observations == [] and rows["TOTALS"].issues == []
    # A point named for a total is a point.
    assert io(rows["TOTAL FLOW"]) == [("AI", 1)]
    assert sum(v for r in rows.values() for c, v in io(r) if c == "AI") == 2
    assert io(rows["ZONE TEMP"]) == [("AI", 1)] and ("LOOP", 0) in attributes(rows["ZONE TEMP"])
    wrong = review([g13_list(["2", "0", "1", "0", "0", "0", "0", "2", "2"])])
    assert {r.name: r.issues for r in wrong.matrices[0].rows}["TOTALS"] == ["PRINTED_TOTAL_MISMATCH"]
    # Version 1 counted the printed totals as points.
    old = review([g13_list(["2", "0", "1", "0", "0", "0", "0", "2", "1"])], V1)
    assert io({r.name: r for r in old.matrices[0].rows}["TOTALS"]) != []


def test_saved_results_are_checked_under_their_own_rule():
    headers, rows = ufgs_rows()
    tables = [table(headers, rows, "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - HHW"),
              va_list([["SUPPLY FAN ALARM", "SF-ALA", "SF-ALA", "", "", "", "●", "", "●"]])]
    old, new = review(tables, V1), review(tables, V2)
    # A per-row point type is checked as it was read (version 1 refused it).
    for matrix in old.matrices:
        validate_observations(matrix, V1)
    for matrix in new.matrices:
        validate_observations(matrix, V2)
    ufgs_v2 = next(m for m in new.matrices if "FUNCTION" in (m.raw.title.text if m.raw.title else ""))
    with pytest.raises(ValueError):
        validate_observations(ufgs_v2, V1)


def test_marked_point_lists_validate_for_assignment():
    rows = [["AI1", "SUPPLY AIR TEMPERATURE", "●", "", "●"], ["BO1", "FAN START STOP", "●", "", "●"]]
    points = review([table(["NAME", "DESCRIPTION", "TREND", "ALARM", "GRAPHIC"], rows,
                           "AHU-1 DDC POINTS LIST", keys=["AI1", "BO1"])])
    for rule, result in ((V2, points), (V1, review([table(["NAME", "DESCRIPTION", "TREND", "ALARM", "GRAPHIC"], rows,
                                                         "AHU-1 DDC POINTS LIST", keys=["AI1", "BO1"])], V1))):
        demand = calculate_assignment_demand(AssignmentDemandInput.model_validate({
            "capture_id": "b" * 64, "equipment_head": "c" * 64, "points": result.model_dump(),
            "assignments": [{"assignment_id": "a-1", "matrix_id": result.matrices[0].matrix_id, "scope_id": "s-1",
                             "applicability": "per_equipment", "equipment_ids": ["AHU-1"], "excluded_equipment_ids": [],
                             "source_span_ids": [], "sequence_region_ids": [], "reason": "Controlled",
                             "quantity_basis": "scheduled_named_members"}]}))
        assert demand.point_rule_version == rule
        assert demand.assignments[0].known_listed_io_subtotal.model_dump() == {"AI": 1, "AO": 0, "DI": 0, "DO": 1}


def test_revision_matrices_carry_their_rule():
    headers, rows = ufgs_rows()
    matrix = review([table(headers, rows, "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - HHW")]).matrices[0]
    request = {"pairs": [], "point_matrices": [{"capture_id": "d" * 64, "matrix": matrix.model_dump(),
                                                "point_rule_version": V2}]}
    assert compare_revision_quantities(RevisionQuantityInput.model_validate(request)).checked_point_matrices
    request["point_matrices"][0].pop("point_rule_version")
    with pytest.raises(ValueError):
        compare_revision_quantities(RevisionQuantityInput.model_validate(request))
