import json
import subprocess
import sys

import pandas as pd
import pytest
from pydantic import ValidationError

from bas_engine import EngineRequest, calculate
from bas_engine.adapters import (BlueprintInput, BlueprintOptions, DataframeColumns,
                                 IndexedCell, IndexedRow, IndexedTable,
                                 column_type, dataframe_requirements, indexed_request, point_mark_channel,
                                 point_mark_kind,
                                 point_type_header, printed_count, row_point_channel)
from bas_engine.models import EquipmentGroup, IOVector, PointRequirement


def table(cells=None, **kwargs):
    return IndexedTable(sheet="example.pdf#2", title=IndexedCell(text="BAS INPUT/OUTPUT POINT LIST"),
                        region=(1, 2, 100, 200), headers=["TAG", "POINT NAME", "AI", "AO", "DI", "DO", "AV"],
                        rows=[IndexedRow(key="1", cells=cells or {
                            "POINT NAME": IndexedCell(text="Temperature", bbox=(10, 20, 30, 40)),
                            "AI": IndexedCell(text="X", bbox=(31, 20, 40, 40)),
                        })], **kwargs)


@pytest.mark.parametrize("header,expected", [
    ("AI", ("physical", "AI")), ("BO", ("physical", "DO")),
    ("DDC HARD WIRED POINTS DIGITAL INPUTS", ("physical", "DI")),
    ("INTEGRATION ANALOG INPUTS", ("soft", "ANALOG INPUTS")),
    ("BACnet AI", ("soft", "AI")), ("ANALOG", None), ("DIGITAL", None),
    ("TREND", None), ("ALARM", None), ("MAX FLOW AI", None), ("AV", ("soft", "AV")),
])
def test_typed_columns_are_explicit(header, expected):
    assert column_type(header) == expected


@pytest.mark.parametrize("text,expected", [("X", 1), ("✓", 1), ("5", 5), ("0", 0), ("~", None),
                                           ("-", 0), ("1.5", None), ("I", None), ("2/3", None)])
def test_printed_count_grammar(text, expected):
    assert printed_count(text) == expected


@pytest.mark.parametrize("header,expected", [
    ("POINT TYPE", True), ("I/O TYPE", True), ("HARDWARE POINT TYPE", True),
    ("PHYSICAL I/O TYPE", True), ("SOFTWARE POINT TYPE", False), ("TYPE", False),
])
def test_row_point_type_header_is_explicitly_physical(header, expected):
    assert point_type_header(header) is expected


@pytest.mark.parametrize("text,expected", [
    ("AI", "AI"), ("ANALOG OUTPUT", "AO"), ("BI", "DI"),
    ("BINARY OUTPUT", "DO"), ("ANALOG", None), ("STATUS", None),
])
def test_row_point_type_value_is_directional_not_name_inferred(text, expected):
    assert row_point_channel(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("AI1", "AI"), ("AO-12", "AO"), ("BI 3", "DI"), ("BO4*", "DO"),
    ("MI1", None), ("AI", None), ("FAN-AI1", None), ("AI0", None),
])
def test_printed_point_mark_is_exact_and_directional(text, expected):
    assert point_mark_channel(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("AI1", ("physical", "AI")), ("BI2", ("physical", "DI")),
    ("AV3", ("soft", "AV")), ("MI1", ("soft", "MI")), ("FAN-AI1", None),
])
def test_printed_point_mark_retains_physical_versus_software_kind(text, expected):
    assert point_mark_kind(text) == expected


def test_indexed_citation_preserved_and_no_template_scaling():
    req = indexed_request(BlueprintInput(tables=[table()]))
    assert len(req.groups) == 1 and req.groups[0].quantity == 1
    result = calculate(req)
    assert result.physical_total == IOVector(AI=1)
    assert result.points[0].evidence[1].bbox_px == (31, 20, 40, 40)
    assert result.points[0].evidence[0].sheet_id == "example.pdf#2"
    assert result.status == "review_required"
    assert "TABLE_SCOPE_NOT_EQUIPMENT_COUNT" in {d.code for d in result.diagnostics}


def test_network_values_and_alarm_flags_never_create_copper():
    t = table({"AV": IndexedCell(text="X"), "ALARM": IndexedCell(text="X"), "TREND": IndexedCell(text="X")})
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert result.physical_total == IOVector()
    assert result.licenses[0].weighted_points == 1


def test_ambiguous_cell_withholds_row_and_no_direction_guess():
    result = calculate(indexed_request(BlueprintInput(tables=[table({"AI": IndexedCell(text="1-2"), "DI": IndexedCell(text="3")})])))
    assert result.points == []
    assert result.physical_total == IOVector()
    assert "INDEX_COUNT_AMBIGUOUS" in {d.code for d in result.diagnostics}
    t = IndexedTable(sheet="test", title=IndexedCell(text="POINTS LIST"), headers=["ANALOG", "DIGITAL"],
                     rows=[IndexedRow(key="pump", cells={"ANALOG": IndexedCell(text="4")})])
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert result.points == []
    assert "BAS_TABLE_UNTYPED" in {d.code for d in result.diagnostics}


def test_duplicate_alias_channel_is_not_double_counted():
    result = calculate(indexed_request(BlueprintInput(tables=[table({"DI": IndexedCell(text="1"), "BI": IndexedCell(text="1")})])))
    assert result.points == []
    assert "INDEX_DUPLICATE_CHANNEL" in {d.code for d in result.diagnostics}


def test_numeric_tags_on_separate_tables_stay_separate():
    first, second = table(), table()
    second.region = (200, 2, 300, 200)
    result = calculate(indexed_request(BlueprintInput(tables=[first, second])))
    assert len(result.points) == 2
    assert result.points[0].group_id != result.points[1].group_id
    assert result.physical_total.AI == 2


def test_dataframe_only_and_explicit_column_mapping():
    frame = pd.DataFrame([{"equipment": "g", "point": "p", "a": 3, "o": 1, "d": 0, "q": 2}])
    rows = dataframe_requirements(frame, DataframeColumns(group_id="equipment", point_id="point", AI="a", AO="o", DI="d", DO="q"))
    result = calculate(EngineRequest(groups=[EquipmentGroup(group_id="g")], point_list=rows))
    assert result.physical_total.values() == (3, 1, 0, 2)
    with pytest.raises(ValueError):
        dataframe_requirements(frame)
    frame["a"] = float("nan")
    with pytest.raises(ValidationError):
        dataframe_requirements(frame, DataframeColumns(group_id="equipment", point_id="point", AI="a", AO="o", DI="d", DO="q"))


def test_unknown_group_policy_is_rejected_not_silently_ignored():
    payload = BlueprintInput(tables=[table()], options=BlueprintOptions(group_overrides=[EquipmentGroup(group_id="wrong")]))
    with pytest.raises(ValueError, match="Unknown group"):
        indexed_request(payload)


def test_explicit_nested_subheaders_are_consumed_without_graph_changes():
    t = IndexedTable(sheet="plant.pdf#5", title=IndexedCell(text="DDC POINTS LIST SUMMARY"),
                     headers=["Description", "DDC HARD WIRED POINTS", "DDC HARD WIRED POINTS 2", "INTEGRATION", "INTEGRATION 2"],
                     rows=[IndexedRow(key="CONTROL POINTS", cells={
                         "Description": IndexedCell(text="CONTROL POINTS"),
                         "DDC HARD WIRED POINTS": IndexedCell(text="DIGITAL INPUTS", bbox=(10, 10, 20, 20)),
                         "DDC HARD WIRED POINTS 2": IndexedCell(text="ANALOG OUTPUTS"),
                         "INTEGRATION": IndexedCell(text="ANALOG VARIABLE"),
                         "INTEGRATION 2": IndexedCell(text="READ ONLY"),
                     }), IndexedRow(key="Flow", cells={"DDC HARD WIRED POINTS": IndexedCell(text="X"),
                         "INTEGRATION": IndexedCell(text="X"), "INTEGRATION 2": IndexedCell(text="X")})])
    before = t.model_dump()
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert result.physical_total == IOVector(DI=1)
    assert result.licenses[0].weighted_points == 1  # READ ONLY is not another variable
    assert len(result.points) == 1
    assert result.points[0].evidence[1].text == "DIGITAL INPUTS"
    assert t.model_dump() == before
    t.rows[0].cells["Description"].text = "a real device, not a header"
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert result.points == []


def test_duplicate_group_overrides_are_rejected():
    with pytest.raises(ValidationError):
        BlueprintOptions(group_overrides=[EquipmentGroup(group_id="g"), EquipmentGroup(group_id="g")])


def test_soo_only_blueprint_request_preserves_missing_point_list_semantics():
    payload = BlueprintInput(tables=[], options=BlueprintOptions(
        group_overrides=[EquipmentGroup(group_id="g")],
        soo=[PointRequirement(group_id="g", point_id="p", physical=IOVector(AI=1))]))
    result = calculate(indexed_request(payload))
    assert result.source_coverage == "soo_only"
    assert result.physical_total == IOVector(AI=1)
    assert "SOURCE_POINT_MISSING" not in {d.code for d in result.diagnostics}


def test_matrix_structure_does_not_require_a_standard_title():
    t = table()
    t.title.text = "AIR HANDLER CONTROL MATRIX"
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert result.physical_total == IOVector(AI=1)


def test_row_oriented_point_types_feed_shared_math_without_name_inference():
    t = IndexedTable(sheet="controls.pdf#4",
        title=IndexedCell(text="HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - VAV BOXES"),
        region=(1, 2, 100, 200), headers=["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE"], rows=[
            IndexedRow(key="1", cells={"POINT NAME": IndexedCell(text="BOX AIR FLOW"),
                "HARDWARE TAG": IndexedCell(text="T-5"), "HARDWARE POINT TYPE": IndexedCell(text="ANALOG INPUT", bbox=(31, 20, 40, 40))}),
            IndexedRow(key="2", cells={"POINT NAME": IndexedCell(text="DAMPER CONTROL"),
                "HARDWARE TAG": IndexedCell(text="MD-4"), "HARDWARE POINT TYPE": IndexedCell(text="BO", bbox=(31, 50, 40, 70))}),
            IndexedRow(key="3", cells={"POINT NAME": IndexedCell(text="AMBIGUOUS"),
                "HARDWARE TAG": IndexedCell(text="X-1"), "HARDWARE POINT TYPE": IndexedCell(text="ANALOG", bbox=(31, 80, 40, 100))}),
        ])
    before = t.model_dump()
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert t.model_dump() == before
    assert result.physical_total == IOVector(AI=1, DO=1)
    assert [point.point_id for point in result.points] == ["1", "2"]
    assert all(point.evidence[-1].column == "HARDWARE POINT TYPE" for point in result.points)
    assert all(point.evidence[-1].bbox_px is not None for point in result.points)
    assert "INDEX_POINT_TYPE_AMBIGUOUS" in {diagnostic.code for diagnostic in result.diagnostics}


def test_row_oriented_type_requires_explicit_unique_schema():
    generic = IndexedTable(sheet="test", title=IndexedCell(text="FAN SCHEDULE"),
        headers=["DEVICE", "TYPE"], rows=[IndexedRow(key="1", cells={"DEVICE": IndexedCell(text="FAN"),
            "TYPE": IndexedCell(text="AI")})])
    request = indexed_request(BlueprintInput(tables=[generic]))
    result = calculate(request)
    assert result.points == [] and request.groups == []

    duplicate = IndexedTable(sheet="test", title=IndexedCell(text="POINT FUNCTION SCHEDULE"),
        headers=["POINT NAME", "POINT TYPE", "I/O TYPE"], rows=[IndexedRow(key="1", cells={
            "POINT NAME": IndexedCell(text="FAN STATUS"), "POINT TYPE": IndexedCell(text="DI"),
            "I/O TYPE": IndexedCell(text="DI")})])
    request = indexed_request(BlueprintInput(tables=[duplicate]))
    result = calculate(request)
    assert result.points == [] and request.groups == []
    assert "BAS_TABLE_UNTYPED" in {diagnostic.code for diagnostic in result.diagnostics}


def test_explicit_point_marks_feed_shared_math_but_integration_marks_do_not_create_copper():
    t = IndexedTable(sheet="controls.pdf#8", title=IndexedCell(text="AHU DDC POINTS LIST"),
        headers=["NAME", "DESCRIPTION", "TREND"], rows=[
            IndexedRow(key="AI1", cells={"NAME": IndexedCell(text="AI1", bbox=(10, 20, 30, 40)),
                "DESCRIPTION": IndexedCell(text="SUPPLY TEMPERATURE"), "TREND": IndexedCell(text="X")}),
            IndexedRow(key="BO-2", cells={"NAME": IndexedCell(text="BO-2", bbox=(10, 50, 35, 70)),
                "DESCRIPTION": IndexedCell(text="FAN START"), "TREND": IndexedCell(text="X")}),
            IndexedRow(key="MI1", cells={"NAME": IndexedCell(text="MI1", bbox=(10, 80, 30, 100)),
                "DESCRIPTION": IndexedCell(text="CHILLER INTEGRATION"), "TREND": IndexedCell(text="X")}),
        ])
    result = calculate(indexed_request(BlueprintInput(tables=[t])))
    assert result.physical_total == IOVector(AI=1, DO=1)
    assert [point.point_id for point in result.points] == ["AI1", "BO-2", "MI1"]
    assert result.points[-1].soft[0].variable_id == "MI1"
    assert all(point.evidence[-1].column == "NAME" for point in result.points)


def test_cli_validates_requests_outputs_and_errors():
    payload = {"request": {"point_list": []}}
    p = subprocess.run([sys.executable, "-m", "bas_engine"], input=json.dumps(payload), text=True, capture_output=True, check=False)
    assert p.returncode == 0
    assert json.loads(p.stdout)["physical_total"] == {"AI": 0, "AO": 0, "DI": 0, "DO": 0}
    bad = subprocess.run([sys.executable, "-m", "bas_engine"], input='{"request":{"secret_source":"do not echo"}}',
                         text=True, capture_output=True, check=False)
    assert bad.returncode == 2
    assert "do not echo" not in bad.stdout
    assert json.loads(bad.stdout)["error"]["code"] == "BAS_VALIDATION_ERROR"
