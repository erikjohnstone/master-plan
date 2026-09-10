"""Controlled assembly arithmetic/contract cases; not installed/PDF truth."""
import copy

import pytest
from pydantic import ValidationError

from bas_engine.assemblies import AssemblyQuantityInput, calculate_assembly_quantities


def uuid(n):
    return f"00000000-0000-4000-8000-{n:012d}"


def raw_payload():
    return {"capture_id": "a" * 64, "equipment_head": "b" * 64, "assembly_head": "c" * 64,
        "equipment": [{"equipment_id": uuid(n), "scope_id": uuid(1)} for n in [11, 12, 13]],
        "assembly_register": {"schema_version": "bas_assembly_register_v1", "source_rule_version": "explicit_component_declarations_1",
            "components": [{"component_id": uuid(20), "scope_id": uuid(1), "equipment_ids": [uuid(n) for n in [11, 12, 13]],
                "excluded_equipment_ids": [], "member_exclusion_reason": None, "label": "Declared accessory",
                "component_kind": "accessory", "source_requirement_ids": [], "source_span_ids": [],
                "quantity": {"value": 2, "basis": "per_equipment", "origin": "explicit_decision", "reason": "Controlled literal two"},
                "lifecycle": "new", "disposition": "included", "exclusion_reason": None,
                "condition": {"status": "unconditional", "statement": None, "source_span_ids": [], "reason": "Unconditional test"},
                "responsibility_claims": [{"claim_id": uuid(30), "activity": "wire", "assignment": "named_party", "party": "Test wiring party",
                    "source_span_ids": [], "reason": "Explicit wiring decision, not source inference"}],
                "responsibility_resolutions": [], "reason": "Controlled input, not a default physical kit"}]}}


@pytest.mark.parametrize("basis,excluded,factor", [
    ("per_equipment", [], 3), ("per_equipment", [12], 2),
    ("selected_group_once", [], 1), ("selected_group_once", [12], 1),
    ("per_equipment", [11, 12, 13], 0), ("selected_group_once", [11, 12, 13], 0)])
def test_explicit_replication_retains_original_decisions_and_never_claims_installed(basis, excluded, factor):
    raw = raw_payload()
    component = raw["assembly_register"]["components"][0]
    component["quantity"]["basis"] = basis
    component["excluded_equipment_ids"] = [uuid(n) for n in excluded]
    component["member_exclusion_reason"] = "Controlled exception" if excluded else None
    before = copy.deepcopy(raw)
    request = AssemblyQuantityInput.model_validate(raw)
    result = calculate_assembly_quantities(request)
    assert raw == before and request.model_dump() == before
    row = result.components[0]
    assert row.original.model_dump() == component
    assert row.replication_factor == factor and row.assigned_quantity == 2 * factor
    assert row.included_equipment_ids == [uuid(n) for n in [11, 12, 13] if n not in excluded]
    assert row.eligibility == ("no_included_members" if not factor else "included")
    assert result.installed_quantity is None and result.unique_physical_total is None and not result.project_complete
    assert "physical_total" not in result.model_dump()
    assert result.model_dump() == calculate_assembly_quantities(AssemblyQuantityInput.model_validate_json(request.model_dump_json())).model_dump()


@pytest.mark.parametrize("value", [None, 0, 2])
@pytest.mark.parametrize("condition", ["unconditional", "satisfied", "not_satisfied", "unresolved"])
@pytest.mark.parametrize("excluded", [True, False])
def test_unknown_zero_condition_and_exclusion_are_distinct(value, condition, excluded):
    raw = raw_payload()
    component = raw["assembly_register"]["components"][0]
    component["quantity"]["value"] = value
    component["condition"]["status"] = condition
    component["condition"]["statement"] = None if condition == "unconditional" else "Explicit test predicate"
    component["disposition"] = "excluded" if excluded else "included"
    component["exclusion_reason"] = "Explicitly outside test scope" if excluded else None
    row = calculate_assembly_quantities(AssemblyQuantityInput.model_validate(raw)).components[0]
    if value is None:
        assert row.assigned_quantity is None and row.status == "quantity_unknown"
    elif excluded or condition == "not_satisfied":
        assert row.assigned_quantity == 0 and row.status == "excluded_contribution"
    elif condition == "unresolved":
        assert row.assigned_quantity is None and row.status == "condition_unresolved"
    else:
        assert row.assigned_quantity == value * 3 and row.status == "calculated_declared_quantity"
    assert ("COMPONENT_QUANTITY_UNKNOWN" in row.issues) == (value is None)
    assert ("COMPONENT_CONDITION_UNRESOLVED" in row.issues) == (condition == "unresolved")
    assert row.original.quantity.value == value


@pytest.mark.parametrize("lifecycle", ["new", "existing", "reuse", "demolition", "unknown"])
def test_lifecycle_and_responsibilities_are_preserved_not_converted_to_new_devices(lifecycle):
    raw = raw_payload()
    raw["assembly_register"]["components"][0]["lifecycle"] = lifecycle
    row = calculate_assembly_quantities(AssemblyQuantityInput.model_validate(raw)).components[0]
    assert row.original.lifecycle == lifecycle and row.assigned_quantity == 6 and row.installed_quantity is None
    assert row.original.responsibility_claims[0].activity == "wire"
    assert row.original.responsibility_claims[0].party == "Test wiring party"
    assert ("COMPONENT_LIFECYCLE_UNKNOWN" in row.issues) == (lifecycle == "unknown")


@pytest.mark.parametrize("invalid", ["foreign_member", "duplicate_member", "foreign_exception", "scope", "duplicate_component",
    "duplicate_source_consumption", "unknown_rule", "unknown_property", "unknown_quantity_kind", "source_without_requirement", "factory_programs", "reason"])
def test_invalid_records_reject_without_repairing_or_mutating(invalid):
    raw = raw_payload()
    component = raw["assembly_register"]["components"][0]
    if invalid == "foreign_member":
        component["equipment_ids"] = [uuid(999)]
    elif invalid == "duplicate_member":
        component["equipment_ids"].append(component["equipment_ids"][0])
    elif invalid == "foreign_exception":
        component["excluded_equipment_ids"] = [uuid(999)]
        component["member_exclusion_reason"] = "Foreign member"
    elif invalid == "scope":
        component["scope_id"] = uuid(2)
    elif invalid in {"duplicate_component", "duplicate_source_consumption"}:
        component["source_requirement_ids"] = ["explicit-source-requirement"]
        other = copy.deepcopy(component)
        if invalid == "duplicate_source_consumption":
            other["component_id"] = uuid(21)
        raw["assembly_register"]["components"].append(other)
    elif invalid == "unknown_rule":
        raw["assembly_register"]["source_rule_version"] = "future"
    elif invalid == "unknown_property":
        component["installed_quantity"] = 6
    elif invalid == "unknown_quantity_kind":
        component["component_kind"] = "software_variable"
    elif invalid == "source_without_requirement":
        component["quantity"]["origin"] = "source_declaration"
    elif invalid == "factory_programs":
        component["responsibility_claims"][0].update(activity="program", assignment="factory_furnished", party=None)
    else:
        component["reason"] = " "
    before = copy.deepcopy(raw)
    with pytest.raises(ValidationError):
        AssemblyQuantityInput.model_validate(raw)
    assert raw == before


@pytest.mark.parametrize("value", [True, 1.5, "2", -1, 9007199254740992])
def test_input_counts_are_safe_integers_not_coerced(value):
    raw = raw_payload()
    raw["assembly_register"]["components"][0]["quantity"]["value"] = value
    with pytest.raises(ValidationError):
        AssemblyQuantityInput.model_validate(raw)


def test_python_product_is_exact_and_empty_assemblies_are_not_project_zero():
    raw = raw_payload()
    raw["assembly_register"]["components"][0]["quantity"]["value"] = 9007199254740991
    row = calculate_assembly_quantities(AssemblyQuantityInput.model_validate(raw)).components[0]
    assert row.assigned_quantity == 27021597764222973  # Transport must refuse this unsafe JS integer.
    raw["assembly_register"]["components"] = []
    result = calculate_assembly_quantities(AssemblyQuantityInput.model_validate(raw))
    assert result.components == [] and result.unique_physical_total is None and not result.project_complete
