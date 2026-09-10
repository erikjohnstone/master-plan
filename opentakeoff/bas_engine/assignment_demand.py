"""Source-listed assignment arithmetic, not physical-device identity resolution.

The shared workflow service verifies capture and register provenance before this
boundary. Python retains original observations and performs every multiplication.
Known subtotals are expressly not complete, unique or installed point totals.
"""
from __future__ import annotations

from collections import Counter
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .adapters import indexed_columns, normalized_header, printed_count
from .models import Contract, Count, Identifier, IOVector
from .point_lists import ATTRIBUTES, PointListResult, PointMatrix, PointNote, PointObservation, digest

Sha = Annotated[str, Field(strict=True, pattern=r"^[a-f0-9]{64}$")]
Ids = Annotated[list[Identifier], Field(max_length=100000)]


class Assignment(Contract):
    assignment_id: Identifier
    matrix_id: Identifier
    scope_id: Identifier
    applicability: Literal["per_equipment", "system_once"]
    equipment_ids: Annotated[list[Identifier], Field(min_length=1, max_length=100000)]
    excluded_equipment_ids: Ids
    source_span_ids: Ids
    sequence_region_ids: Ids
    reason: Annotated[str, Field(strict=True, min_length=1, max_length=4096)]
    quantity_basis: Literal["scheduled_named_members"]

    @model_validator(mode="after")
    def selection(self) -> Assignment:
        for values in (self.equipment_ids, self.excluded_equipment_ids,
                       self.source_span_ids, self.sequence_region_ids):
            if len(values) != len(set(values)):
                raise ValueError("Duplicate assignment reference")
        if not set(self.excluded_equipment_ids).issubset(self.equipment_ids):
            raise ValueError("Assignment exception is not a selected member")
        return self

    def included(self) -> list[str]:
        excluded = set(self.excluded_equipment_ids)
        return [key for key in self.equipment_ids if key not in excluded]


class AssignmentDemandInput(Contract):
    capture_id: Sha
    equipment_head: Sha
    points: PointListResult
    assignments: Annotated[list[Assignment], Field(max_length=100000)]

    @model_validator(mode="after")
    def identities(self) -> AssignmentDemandInput:
        matrices = {m.matrix_id: m for m in self.points.matrices}
        if len(matrices) != len(self.points.matrices):
            raise ValueError("Duplicate point matrix identity")
        if len({a.assignment_id for a in self.assignments}) != len(self.assignments):
            raise ValueError("Duplicate assignment identity")
        members: set[tuple[str, str]] = set()
        scopes: dict[tuple[str, str], set[str]] = {}
        equipment_scopes: dict[str, str] = {}
        for a in self.assignments:
            matrix = matrices.get(a.matrix_id)
            if matrix is None or matrix.page_id is None or matrix.source_id is None:
                raise ValueError("Assignment point matrix has no owned source")
            for key in a.equipment_ids:
                if equipment_scopes.setdefault(key, a.scope_id) != a.scope_id:
                    raise ValueError("One equipment identity cannot belong to different scopes")
            included = a.included()
            for key in included:
                pair = (a.matrix_id, key)
                if pair in members:
                    raise ValueError("One matrix cannot be assigned twice to the same equipment")
                members.add(pair)
            prior = scopes.setdefault((a.matrix_id, a.scope_id), set())
            if included and prior and (a.applicability == "system_once" or "system_once" in prior):
                raise ValueError("A system matrix cannot be replicated or mixed with local assignments")
            if included:
                prior.add(a.applicability)
        return self


class DerivedObservation(Contract):
    observation_id: Identifier
    observation_index: Count
    original: PointObservation
    assigned_value: Count | None
    status: Literal["calculated_listed_value", "unavailable", "attribute_not_quantity"]


class DerivedRow(Contract):
    row_id: Identifier
    name: str
    observations: list[DerivedObservation]
    qualifiers: list[PointNote]
    unobserved_columns: list[str]
    unobserved_typed_columns: list[str]
    uninterpreted_columns: list[str]
    issues: list[str]
    field_wiring_status: Literal["not_established"] = "not_established"


class SoftwareSubtotal(Contract):
    channel: str
    known_listed_value: Count


class AssignmentDemand(Contract):
    assignment: Assignment
    included_equipment_ids: Ids
    replication_factor: Count
    rows: list[DerivedRow]
    known_listed_io_subtotal: IOVector
    known_listed_software_subtotals: list[SoftwareSubtotal]
    subtotal_basis: Literal["known_source_observations_not_unique_requirements"] = "known_source_observations_not_unique_requirements"
    unobserved_typed_cells: Count
    ambiguous_observations: Count
    issues: list[str]
    installed_quantity: None = None
    field_wiring_status: Literal["not_established"] = "not_established"


class AssignmentDemandResult(Contract):
    schema_version: Literal["bas_assignment_demand_v1"] = "bas_assignment_demand_v1"
    rule_version: Literal["assigned_listed_observations_1"] = "assigned_listed_observations_1"
    engine: Literal["bas_math_v1"] = "bas_math_v1"
    capture_id: Sha
    equipment_head: Sha
    point_rule_version: Literal["point_observations_1"] = "point_observations_1"
    scope: Literal["explicit_assignments_discovered_matrices_only"] = "explicit_assignments_discovered_matrices_only"
    assignments: list[AssignmentDemand]
    issues: list[str]
    unique_requirement_total: None = None
    installed_quantity: None = None
    project_complete: Literal[False] = False


def validate_observations(matrix: PointMatrix) -> dict[str, tuple[Literal["physical", "soft"], str]]:
    """Defensive source identity/value checks; use the existing header/count rules."""
    typed, _headers, start = indexed_columns(matrix.raw)
    effective = {h: matrix.raw.rows[0].cells[h].text if start and h in matrix.raw.rows[0].cells else h for h in matrix.raw.headers}
    source_columns = set(matrix.raw.headers).union(*(row.cells for row in matrix.raw.rows))
    attributes = {h: normalized_header(effective.get(h, h)) for h in source_columns
                  if normalized_header(effective.get(h, h)) in ATTRIBUTES and h not in typed}
    if start != matrix.header_rows:
        raise ValueError("Point matrix header interpretation changed")
    raw_rows = Counter(digest(r.model_dump()) for r in matrix.raw.rows[start:])
    if raw_rows != Counter(digest(r.raw.model_dump()) for r in matrix.rows):
        raise ValueError("Point source rows were omitted or changed")
    if len({r.row_id for r in matrix.rows}) != len(matrix.rows):
        raise ValueError("Duplicate point row identity")
    for row in matrix.rows:
        if row.local_key != row.raw.key:
            raise ValueError("Point row key differs from original source")
        missing = set(matrix.raw.headers) - set(row.raw.cells)
        if len(row.unobserved_columns) != len(missing) or set(row.unobserved_columns) != missing:
            raise ValueError("Missing source columns are not accounted for")
        columns: set[str] = set()
        for observation in row.observations:
            source = observation.source
            column = source.column
            cell = row.raw.cells.get(column) if column else None
            if (column is None or column in columns or cell is None
                    or source.text != cell.text or source.bbox_px != cell.bbox
                    or source.source_id != matrix.source_id or source.page_id != matrix.page_id
                    or source.sheet_key != matrix.raw.sheet):
                raise ValueError("Point observation differs from original source cell")
            columns.add(column)
            if (observation.value != printed_count(cell.text)
                    or (observation.status == "ambiguous") != (observation.value is None)):
                raise ValueError("Point observation value differs from source interpretation")
            if observation.kind == "attribute":
                if attributes.get(column) != observation.channel:
                    raise ValueError("Point attribute differs from original header interpretation")
            else:
                expected = ("physical" if observation.kind == "declared_io" else "soft", observation.channel)
                if typed.get(column) != expected:
                    raise ValueError("Point channel differs from original header interpretation")
        if any(h in row.raw.cells and h not in columns for h in {*typed, *attributes}):
            raise ValueError("Source observation was omitted")
        if any(note not in matrix.notes for note in row.qualifiers):
            raise ValueError("Point qualifier is not a retained matrix note")
    return typed


def calculate_assignment_demand(payload: AssignmentDemandInput) -> AssignmentDemandResult:
    payload = AssignmentDemandInput.model_validate(payload.model_dump())
    matrices = {m.matrix_id: m for m in payload.points.matrices}
    classifications = {key: validate_observations(matrices[key]) for key in {a.matrix_id for a in payload.assignments}}
    included_by_assignment = {a.assignment_id: a.included() for a in payload.assignments}
    scope_assignments: Counter[str] = Counter()
    global_scopes: set[str] = set()
    equipment_assignments: Counter[str] = Counter()
    for a in payload.assignments:
        included = included_by_assignment[a.assignment_id]
        if included:
            scope_assignments[a.scope_id] += 1
            equipment_assignments.update(included)
            if a.applicability == "system_once":
                global_scopes.add(a.scope_id)
    result = []
    for a in payload.assignments:
        matrix = matrices[a.matrix_id]
        included = included_by_assignment[a.assignment_id]
        factor = len(included) if a.applicability == "per_equipment" else int(bool(included))
        total = IOVector()
        software: Counter[str] = Counter()
        missing_count = ambiguous_count = 0
        rows = []
        issues = [*matrix.issues, "FIELD_WIRING_NOT_ESTABLISHED", "UNIQUE_POINT_IDENTITIES_NOT_ESTABLISHED"]
        if not included:
            issues.append("ALL_MEMBERS_EXPLICITLY_EXCLUDED")
        labels = Counter(r.name.strip().casefold() for r in matrix.rows if r.name.strip())
        if any(n > 1 for n in labels.values()):
            issues.append("REPEATED_POINT_LABEL_REQUIRES_IDENTITY_REVIEW")
        # A global matrix can repeat local points even when its selected member
        # list differs. Never combine these into an asserted project total.
        if included and ((a.scope_id in global_scopes and scope_assignments[a.scope_id] > 1)
                         or any(equipment_assignments[key] > 1 for key in included)):
            issues.append("MULTIPLE_TEMPLATES_REQUIRE_POINT_IDENTITY_REVIEW")
        for row in matrix.rows:
            derived = []
            unobserved = sorted(set(classifications[a.matrix_id]) - set(row.raw.cells))
            missing_count += len(unobserved)
            row_issues = list(row.issues)
            if unobserved:
                row_issues.append("TYPED_SOURCE_CELLS_UNOBSERVED")
            if row.qualifiers:
                row_issues.append("CONTROLLER_QUALIFIER_RETAINED_NOT_FIELD_WIRING")
            for index, obs in enumerate(row.observations):
                assigned = None
                status: Literal["calculated_listed_value", "unavailable", "attribute_not_quantity"]
                if obs.kind == "attribute":
                    status = "attribute_not_quantity"
                elif obs.value is None:
                    status = "unavailable"
                    ambiguous_count += 1
                else:
                    status = "calculated_listed_value"
                    assigned = obs.value * factor
                    if obs.kind == "declared_io":
                        total = total.plus(IOVector(**{obs.channel: obs.value}).scaled(factor))
                    else:
                        software[obs.channel] += assigned
                derived.append(DerivedObservation(observation_id="observation:" + digest(
                    [a.matrix_id, row.row_id, obs.source.column]), observation_index=index,
                    original=obs, assigned_value=assigned, status=status))
            rows.append(DerivedRow(row_id=row.row_id, name=row.name, observations=derived,
                qualifiers=row.qualifiers, unobserved_columns=row.unobserved_columns,
                unobserved_typed_columns=unobserved, uninterpreted_columns=row.uninterpreted_columns,
                issues=sorted(set(row_issues))))
        if missing_count:
            issues.append("TYPED_SOURCE_CELLS_UNOBSERVED")
        if ambiguous_count:
            issues.append("AMBIGUOUS_SOURCE_VALUES_RETAINED")
        if any(r.issues or r.uninterpreted_columns for r in rows):
            issues.append("SOURCE_ROWS_REQUIRE_REVIEW")
        result.append(AssignmentDemand(assignment=a, included_equipment_ids=included,
            replication_factor=factor, rows=rows, known_listed_io_subtotal=total,
            known_listed_software_subtotals=[SoftwareSubtotal(channel=key, known_listed_value=software[key]) for key in sorted(software)],
            unobserved_typed_cells=missing_count, ambiguous_observations=ambiguous_count,
            issues=sorted(set(issues))))
    return AssignmentDemandResult(capture_id=payload.capture_id, equipment_head=payload.equipment_head,
        assignments=result, issues=sorted(set([*payload.points.issues,
            "SOURCE_DISCOVERY_COVERAGE_UNVERIFIED", "PROJECT_TOTAL_WITHHELD_UNRESOLVED_POINT_IDENTITIES"])))
