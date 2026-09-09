"""Controlled arithmetic/negative fixtures, not original-PDF ground truths."""
import copy

import pytest
from pydantic import ValidationError

from bas_engine.assignment_demand import AssignmentDemandInput, calculate_assignment_demand
from bas_engine.point_lists import PointListInput, review_point_lists


def payload():
    source_id = "sha256:" + "a" * 64
    page_id = source_id + ":p1"
    headers = ["POINT NAME", "AI", "AO", "DI", "DO", "AV", "ALARM"]
    values = [["Supply temperature", "2", "0", "0", "0", "3", "X"],
              ["Fan status and command", "0", "0", "1", "1", "0", ""]]
    table = {"sheet": "controlled.pdf", "title": {"text": "BAS POINTS LIST", "bbox": [0, 0, 500, 20]},
        "headers": headers, "region": [0, 0, 500, 100], "rows": [
            {"key": str(i), "cells": {h: {"text": text, "bbox": [j * 20, 30 + i * 20, j * 20 + 19, 40 + i * 20]}
                for j, (h, text) in enumerate(zip(headers, row))}} for i, row in enumerate(values)]}
    sources = {"schema_version": "bas_sources_v1", "adapter": "session_text_spans_v1",
        "coordinate_frame": "image_px", "scope": "available_pdf_text_only",
        "documents": [{"source_id": source_id, "sha256": "a" * 64, "byte_length": 1,
            "page_count": 1, "names": ["controlled.pdf"]}],
        "pages": [{"page_id": page_id, "source_id": source_id, "page_number": 1,
            "sheet_keys": ["controlled.pdf"], "width_px": 1000, "height_px": 1000, "rotation": 0,
            "text_status": "no_text", "spans": []}]}
    points = review_point_lists(PointListInput.model_validate({"sources": sources, "tables": [table]}))
    return AssignmentDemandInput.model_validate({"capture_id": "b" * 64, "equipment_head": "c" * 64,
        "points": points.model_dump(), "assignments": [{"assignment_id": "assignment-1", "matrix_id": points.matrices[0].matrix_id,
            "scope_id": "scope-1", "applicability": "per_equipment", "equipment_ids": ["unit-1", "unit-2", "unit-3"],
            "excluded_equipment_ids": [], "source_span_ids": [], "sequence_region_ids": [],
            "reason": "Controlled explicit unit-template application", "quantity_basis": "scheduled_named_members"}]})


@pytest.mark.parametrize("mode,excluded,factor", [
    ("per_equipment", [], 3), ("per_equipment", ["unit-2"], 2),
    ("system_once", [], 1), ("system_once", ["unit-2"], 1),
    ("per_equipment", ["unit-1", "unit-2", "unit-3"], 0),
    ("system_once", ["unit-1", "unit-2", "unit-3"], 0),
])
def test_exact_scoped_multipliers_and_original_cells(mode, excluded, factor):
    request = payload()
    request.assignments[0].applicability = mode
    request.assignments[0].excluded_equipment_ids = excluded
    before = request.model_dump()
    result = calculate_assignment_demand(request)
    assert request.model_dump() == before
    row = result.assignments[0]
    assert row.replication_factor == factor
    assert row.known_listed_io_subtotal.model_dump() == {"AI": 2 * factor, "AO": 0, "DI": factor, "DO": factor}
    assert row.known_listed_software_subtotals[0].model_dump() == {"channel": "AV", "known_listed_value": 3 * factor}
    assert row.unobserved_typed_cells == row.ambiguous_observations == 0
    for original_row, derived_row in zip(request.points.matrices[0].rows, row.rows):
        for index, (original, derived) in enumerate(zip(original_row.observations, derived_row.observations)):
            assert original == derived.original and derived.observation_index == index
            if original.kind == "attribute":
                assert derived.status == "attribute_not_quantity" and derived.assigned_value is None
            else:
                assert derived.assigned_value == original.value * factor
    assert result.unique_requirement_total is None and result.installed_quantity is None
    assert not result.project_complete
    assert "physical_total" not in result.model_dump() and "hardware" not in result.model_dump()


def test_unobserved_and_ambiguous_are_not_zero_even_when_excluded():
    request = payload()
    matrix = request.points.matrices[0]
    row = matrix.rows[0]
    del row.raw.cells["DI"]
    del matrix.raw.rows[0].cells["DI"]
    row.unobserved_columns = ["DI"]
    row.observations = [o for o in row.observations if o.source.column != "DI"]
    obs = next(o for o in row.observations if o.channel == "AI")
    obs.value = None
    obs.status = "ambiguous"
    obs.source.text = "?"
    row.raw.cells["AI"].text = matrix.raw.rows[0].cells["AI"].text = "?"
    request.assignments[0].excluded_equipment_ids = list(request.assignments[0].equipment_ids)
    result = calculate_assignment_demand(request).assignments[0]
    assert result.replication_factor == 0 and result.ambiguous_observations == 1
    assert result.unobserved_typed_cells == 1 and result.rows[0].unobserved_typed_columns == ["DI"]
    derived = next(o for o in result.rows[0].observations if o.original.channel == "AI")
    assert derived.status == "unavailable" and derived.assigned_value is None
    assert result.known_listed_io_subtotal.AI == 0  # Known subtotal, expressly not a complete count.


def test_global_and_local_templates_flag_possible_overlap_even_with_disjoint_members():
    request = payload()
    other_matrix = copy.deepcopy(request.points.matrices[0])
    other_matrix.matrix_id = "controlled-second-matrix"
    for r in other_matrix.rows:
        r.row_id += "-second"
    request.points.matrices.append(other_matrix)
    other = copy.deepcopy(request.assignments[0])
    other.assignment_id = "assignment-2"
    other.matrix_id = other_matrix.matrix_id
    other.equipment_ids = ["unit-4"]
    request.assignments.append(other)
    request.assignments[0].applicability = "system_once"
    result = calculate_assignment_demand(request)
    assert all("MULTIPLE_TEMPLATES_REQUIRE_POINT_IDENTITY_REVIEW" in a.issues for a in result.assignments)
    assert result.unique_requirement_total is None
    other.scope_id = "scope-2"
    result = calculate_assignment_demand(request)
    assert all("MULTIPLE_TEMPLATES_REQUIRE_POINT_IDENTITY_REVIEW" not in a.issues for a in result.assignments)


@pytest.mark.parametrize("corruption", ["foreign_matrix", "duplicate_member", "foreign_exception", "duplicate_assignment",
    "duplicate_matrix_member", "mixed_global", "source_value", "source_box", "omit_observation", "hide_missing", "fake_attribute"])
def test_invalid_or_incomplete_references_refuse_without_mutating(corruption):
    request = payload()
    a = request.assignments[0]
    if corruption == "foreign_matrix":
        a.matrix_id = "missing"
    elif corruption == "duplicate_member":
        a.equipment_ids.append("unit-1")
    elif corruption == "foreign_exception":
        a.excluded_equipment_ids.append("unit-4")
    elif corruption in {"duplicate_assignment", "duplicate_matrix_member", "mixed_global"}:
        duplicate = copy.deepcopy(a)
        if corruption != "duplicate_assignment":
            duplicate.assignment_id = "assignment-2"
        if corruption == "mixed_global":
            duplicate.equipment_ids = ["unit-4"]
            duplicate.applicability = "system_once"
        request.assignments.append(duplicate)
    else:
        row = request.points.matrices[0].rows[0]
        obs = next(o for o in row.observations if o.channel == "AI")
        if corruption == "source_value":
            obs.value = 200
        elif corruption == "source_box":
            obs.source.bbox_px = (1, 1, 2, 2)
        elif corruption == "omit_observation":
            row.observations.remove(obs)
        elif corruption == "hide_missing":
            row.unobserved_columns = ["FAKE"]
        else:
            obs.kind = "attribute"
    before = request.model_dump()
    with pytest.raises((ValueError, ValidationError)):
        calculate_assignment_demand(request)
    assert request.model_dump() == before


def test_empty_selection_is_not_a_zero_project_and_huge_counts_stay_exact_in_python():
    request = payload()
    request.assignments = []
    result = calculate_assignment_demand(request)
    assert not result.assignments and result.unique_requirement_total is None
    request = payload()
    matrix = request.points.matrices[0]
    row = matrix.rows[0]
    obs = next(o for o in row.observations if o.channel == "AI")
    obs.value = 9_007_199_254_740_991
    obs.source.text = str(obs.value)
    row.raw.cells["AI"].text = matrix.raw.rows[0].cells["AI"].text = str(obs.value)
    assert calculate_assignment_demand(request).assignments[0].known_listed_io_subtotal.AI == 27_021_597_764_222_973


def test_retained_attribute_column_outside_header_array_keeps_original_meaning():
    # The existing point reader admits explicitly supplied cells even when a
    # sparse table's header array omits that column. Do not reinterpret it here.
    request = payload()
    request.points.matrices[0].raw.headers.remove("ALARM")
    result = calculate_assignment_demand(request).assignments[0]
    attributes = [o for row in result.rows for o in row.observations if o.original.channel == "ALARM"]
    assert len(attributes) == 2
    assert all(o.status == "attribute_not_quantity" and o.assigned_value is None for o in attributes)


def test_real_retained_fort_sam_cells_and_controller_notes_survive_derivation():
    # Existing captured graph/text, not a new extraction or automatic assignment.
    from test_point_lists import real_input
    points = review_point_lists(PointListInput.model_validate(real_input()))
    matrix = next(m for m in points.matrices if m.page_id.endswith(":p3"))
    raw = payload().model_dump()
    raw["points"] = points.model_dump()
    raw["assignments"][0]["matrix_id"] = matrix.matrix_id
    raw["assignments"][0]["applicability"] = "system_once"
    request = AssignmentDemandInput.model_validate(raw)
    result = calculate_assignment_demand(request).assignments[0]
    assert result.replication_factor == 1
    assert len(result.rows) == len(matrix.rows)
    for source, derived in zip(matrix.rows, result.rows):
        assert source.qualifiers == derived.qualifiers
        assert [o.original for o in derived.observations] == source.observations
        assert derived.field_wiring_status == "not_established"
        for obs in derived.observations:
            if obs.original.kind != "attribute":
                assert obs.assigned_value == obs.original.value
    assert {int(row_id.local_key) for row_id, derived in zip(matrix.rows, result.rows) if derived.qualifiers} == {1, 3, 4, 6, 7, 18, 20}
