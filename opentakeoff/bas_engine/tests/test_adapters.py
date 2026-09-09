import json
import subprocess
import sys

import pandas as pd
import pytest
from pydantic import ValidationError

from bas_engine import EngineRequest, calculate
from bas_engine.adapters import (BlueprintInput, BlueprintOptions, DataframeColumns,
                                 IndexedCell, IndexedRow, IndexedTable,
                                 column_type, dataframe_requirements, indexed_request, printed_count)
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
