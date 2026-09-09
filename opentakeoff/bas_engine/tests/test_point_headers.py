"""Printed header semantics, not equipment or installed-terminal quantities.

Real expectations are independently transcribed in the original Fort Sam keys.
The production graph is only the input; expected memberships below are authored.
"""
import json
from pathlib import Path

import pytest

from bas_engine import calculate
from bas_engine.adapters import BlueprintInput, IndexedTable, column_type, indexed_columns, indexed_request
from bas_engine.models import IOVector


@pytest.mark.parametrize("header,expected", [
    ("HARDWARE POINTS AI", ("physical", "AI")),
    ("HARDWARE POINTS BO", ("physical", "DO")),
    ("SOFTWARE POINTS AV", ("soft", "SOFTWARE POINTS AV")),
    ("SOFTWARE POINTS AI", ("soft", "AI")),
    ("SOFTWARE POINTS TREND", None),
    ("SOFTWARE POINTS ALARM", None),
    ("HARDWARE SOFTWARE POINTS AI", None),
    ("HARDWIRED NETWORK AI", None),
    ("HARDWARE POINTS ANALOG", None),
    ("HARDWARE POINTS AV", None),
])
def test_declared_hardware_software_parent_vocabulary(header, expected):
    assert column_type(header) == expected


def test_real_meter_and_global_subheaders_preserve_all_source_cells():
    root = Path(__file__).resolve().parents[2]
    graph = json.loads((root / "docs/bas-production/evidence/fort-sam-routing-final-graph.json").read_text())
    tables = [IndexedTable.model_validate(t) for t in graph["tables"] if "HARDWARE POINTS" in t["headers"]]
    assert len(tables) == 4
    # Water, gas, electric, global: listed positive cell identities only.
    expected = [({1}, set()), ({1}, set()), (set(), set(range(1, 16))), ({1, 2}, set())]
    for table, (ai_rows, av_rows) in zip(tables, expected, strict=True):
        before = table.model_dump()
        typed, evidence, start = indexed_columns(table)
        assert start == 1
        assert typed == {
            "HARDWARE POINTS": ("physical", "AI"),
            "HARDWARE POINTS 2": ("physical", "AO"),
            "HARDWARE POINTS 3": ("physical", "DI"),
            "HARDWARE POINTS 4": ("physical", "DO"),
            "SOFTWARE POINTS": ("soft", "SOFTWARE POINTS AV"),
            "SOFTWARE POINTS 2": ("soft", "SOFTWARE POINTS BV"),
        }
        assert len(evidence) == 6
        for cite in evidence:
            cell = table.rows[0].cells[cite.column]
            assert cite.text == cell.text and cite.bbox_px == cell.bbox
        result = calculate(indexed_request(BlueprintInput(tables=[table])))
        assert {int(p.point_id) for p in result.points if p.physical.AI} == ai_rows
        assert {int(p.point_id) for p in result.points if p.soft} == av_rows
        assert result.physical_total == IOVector(AI=len(ai_rows))
        assert sum(s.quantity for p in result.points for s in p.soft) == len(av_rows)
        assert not result.project_complete
        assert {d.code for d in result.diagnostics} >= {"TABLE_SCOPE_NOT_EQUIPMENT_COUNT", "INDEX_COVERAGE_UNVERIFIED"}
        assert table.model_dump() == before


def test_subheader_detection_still_requires_a_real_identity_header():
    table = IndexedTable.model_validate({"sheet": "test.pdf#1", "headers": ["COL1", "HARDWARE POINTS", "SOFTWARE POINTS"],
        "rows": [{"key": "device", "cells": {"COL1": {"text": "real equipment"},
            "HARDWARE POINTS": {"text": "AI"}, "SOFTWARE POINTS": {"text": "AV"}}}]})
    assert indexed_columns(table) == ({}, [], 0)
