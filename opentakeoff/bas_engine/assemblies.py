"""Reviewed assembly quantities, not source parsing or installed verification.

The shared workflow verifies source declarations before invoking this boundary.
Retain complete records; the only arithmetic is explicit scoped replication.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from .models import Contract, Count, Identifier

Sha = Annotated[str, Field(strict=True, pattern=r"^[a-f0-9]{64}$")]
UUID = Annotated[str, Field(strict=True, pattern=r"^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$")]
Reason = Annotated[str, Field(strict=True, min_length=1, max_length=4096, pattern=r"\S")]
Ids = Annotated[list[Identifier], Field(max_length=10000)]
Members = Annotated[list[UUID], Field(max_length=100000)]
Activity = Literal["furnish", "install", "wire", "program", "test"]
Assignment = Literal["factory_furnished", "field_installed", "named_party", "by_others", "unknown"]


class ResponsibilityClaim(Contract):
    claim_id: UUID
    activity: Activity
    assignment: Assignment
    party: Identifier | None
    source_span_ids: Ids
    reason: Reason

    @model_validator(mode="after")
    def activity_scope(self) -> ResponsibilityClaim:
        if (self.assignment == "named_party") != (self.party is not None):
            raise ValueError("Only named-party responsibility has a party name")
        if self.assignment == "factory_furnished" and self.activity != "furnish":
            raise ValueError("Factory furnishing does not assign other activities")
        if self.assignment == "field_installed" and self.activity != "install":
            raise ValueError("Field installation does not assign other activities")
        unique(self.source_span_ids)
        return self


class ResponsibilityResolution(Contract):
    activity: Activity
    selected_claim_id: Identifier
    reason: Reason


class Quantity(Contract):
    value: Annotated[int, Field(strict=True, ge=0, le=9007199254740991)] | None
    basis: Literal["per_equipment", "selected_group_once"]
    origin: Literal["source_declaration", "explicit_decision"]
    reason: Reason


class Condition(Contract):
    status: Literal["unconditional", "satisfied", "not_satisfied", "unresolved"]
    statement: Identifier | None
    source_span_ids: Ids
    reason: Reason

    @model_validator(mode="after")
    def predicate(self) -> Condition:
        if (self.status == "unconditional") != (self.statement is None):
            raise ValueError("Conditional components require their predicate statement")
        unique(self.source_span_ids)
        return self


class AssemblyComponent(Contract):
    component_id: UUID
    scope_id: UUID
    equipment_ids: Annotated[list[UUID], Field(min_length=1, max_length=100000)]
    excluded_equipment_ids: Members
    member_exclusion_reason: Reason | None
    label: Identifier
    component_kind: Literal["variable_frequency_drive", "onboard_controller", "terminal_equipment_controller",
        "controller", "sensor", "valve", "damper_actuator", "damper", "relay", "power_supply", "accessory", "other_physical"]
    source_requirement_ids: Annotated[list[Identifier], Field(max_length=1000)]
    source_span_ids: Ids
    quantity: Quantity
    lifecycle: Literal["new", "existing", "reuse", "demolition", "unknown"]
    disposition: Literal["included", "excluded"]
    exclusion_reason: Reason | None
    condition: Condition
    responsibility_claims: Annotated[list[ResponsibilityClaim], Field(max_length=1000)]
    responsibility_resolutions: Annotated[list[ResponsibilityResolution], Field(max_length=5)]
    reason: Reason

    @model_validator(mode="after")
    def accounting(self) -> AssemblyComponent:
        for ids in (self.equipment_ids, self.excluded_equipment_ids, self.source_requirement_ids, self.source_span_ids):
            unique(ids)
        unique([c.claim_id for c in self.responsibility_claims])
        unique([r.activity for r in self.responsibility_resolutions])
        if not set(self.excluded_equipment_ids).issubset(self.equipment_ids):
            raise ValueError("Excluded assembly members are outside the selection")
        if (self.disposition == "excluded") != (self.exclusion_reason is not None):
            raise ValueError("Excluded component requires an exclusion reason")
        if bool(self.excluded_equipment_ids) != (self.member_exclusion_reason is not None):
            raise ValueError("Member exceptions require an exclusion reason")
        if self.quantity.origin == "source_declaration" and not self.source_requirement_ids:
            raise ValueError("Source-declared quantity requires a source requirement")
        # Source ownership and source-derived responsibility claim IDs are
        # verified by the shared source service, not guessed in Python.
        return self

    def included(self) -> list[str]:
        excluded = set(self.excluded_equipment_ids)
        return [key for key in self.equipment_ids if key not in excluded]


class AssemblyRegister(Contract):
    schema_version: Literal["bas_assembly_register_v1"]
    source_rule_version: Literal["explicit_component_declarations_1"]
    components: Annotated[list[AssemblyComponent], Field(max_length=100000)]


class EquipmentMember(Contract):
    equipment_id: UUID
    scope_id: UUID


def unique(ids: list[str]) -> None:
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate assembly identity/reference")


class AssemblyQuantityInput(Contract):
    capture_id: Sha
    equipment_head: Sha
    assembly_head: Sha
    equipment: Annotated[list[EquipmentMember], Field(max_length=100000)]
    assembly_register: AssemblyRegister

    @model_validator(mode="after")
    def ownership(self) -> AssemblyQuantityInput:
        unique([e.equipment_id for e in self.equipment])
        unique([c.component_id for c in self.assembly_register.components])
        equipment = {e.equipment_id: e.scope_id for e in self.equipment}
        consumed: set[tuple[str, str]] = set()
        for component in self.assembly_register.components:
            if any(equipment.get(key) != component.scope_id for key in component.equipment_ids):
                raise ValueError("Assembly members do not belong to their established scope")
            if component.disposition != "included" or component.condition.status == "not_satisfied":
                continue
            for source_id in component.source_requirement_ids:
                for member in component.included():
                    pair = (source_id, member)
                    if pair in consumed:
                        raise ValueError("One source requirement is consumed by overlapping components")
                    consumed.add(pair)
        return self


Eligibility = Literal["included", "excluded_component", "no_included_members", "condition_not_satisfied", "condition_unresolved"]


class DerivedAssemblyComponent(Contract):
    original: AssemblyComponent
    included_equipment_ids: Members
    replication_factor: Count
    eligibility: Eligibility
    status: Literal["calculated_declared_quantity", "excluded_contribution", "quantity_unknown", "condition_unresolved"]
    assigned_quantity: Count | None
    issues: list[Identifier]
    installed_quantity: None = None


class AssemblyQuantityResult(Contract):
    schema_version: Literal["bas_assembly_quantities_v1"] = "bas_assembly_quantities_v1"
    rule_version: Literal["declared_assembly_quantities_1"] = "declared_assembly_quantities_1"
    engine: Literal["bas_math_v1"] = "bas_math_v1"
    capture_id: Sha
    equipment_head: Sha
    assembly_head: Sha
    source_rule_version: Literal["explicit_component_declarations_1"] = "explicit_component_declarations_1"
    components: list[DerivedAssemblyComponent]
    quantity_basis: Literal["reviewed_declared_components_not_installed"] = "reviewed_declared_components_not_installed"
    project_complete: Literal[False] = False
    installed_quantity: None = None
    unique_physical_total: None = None


def calculate_assembly_quantities(payload: AssemblyQuantityInput) -> AssemblyQuantityResult:
    payload = AssemblyQuantityInput.model_validate(payload.model_dump())
    rows = []
    for component in payload.assembly_register.components:
        included = component.included()
        factor = len(included) if component.quantity.basis == "per_equipment" else int(bool(included))
        eligibility: Eligibility = "included"
        if component.disposition == "excluded":
            eligibility = "excluded_component"
        elif not included:
            eligibility = "no_included_members"
        elif component.condition.status == "not_satisfied":
            eligibility = "condition_not_satisfied"
        elif component.condition.status == "unresolved":
            eligibility = "condition_unresolved"
        quantity = None
        status: Literal["calculated_declared_quantity", "excluded_contribution", "quantity_unknown", "condition_unresolved"]
        if component.quantity.value is None:
            status = "quantity_unknown"
        elif eligibility == "condition_unresolved":
            status = "condition_unresolved"
        elif eligibility != "included":
            quantity = 0
            status = "excluded_contribution"
        else:
            quantity = component.quantity.value * factor
            status = "calculated_declared_quantity"
        issues = []
        if component.quantity.value is None:
            issues.append("COMPONENT_QUANTITY_UNKNOWN")
        if component.condition.status == "unresolved":
            issues.append("COMPONENT_CONDITION_UNRESOLVED")
        if component.lifecycle == "unknown":
            issues.append("COMPONENT_LIFECYCLE_UNKNOWN")
        rows.append(DerivedAssemblyComponent(original=component, included_equipment_ids=included,
            replication_factor=factor, eligibility=eligibility, status=status, assigned_quantity=quantity, issues=issues))
    return AssemblyQuantityResult(capture_id=payload.capture_id, equipment_head=payload.equipment_head,
        assembly_head=payload.assembly_head, components=rows)
