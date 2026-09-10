"""Comparable retained-count deltas only. Identity, correspondence and basis
review are validated by the shared source service, not inferred by this math.
Original point interpretations are checked with the existing point authority.
"""
from __future__ import annotations

from typing import Annotated, Literal
from pydantic import Field
from .models import Contract
from .point_lists import PointMatrix
from .assignment_demand import validate_observations

MAX_SAFE_COUNT = 9007199254740991
SafeCount = Annotated[int, Field(strict=True, ge=0, le=MAX_SAFE_COUNT)]
SafeDelta = Annotated[int, Field(strict=True, ge=-MAX_SAFE_COUNT, le=MAX_SAFE_COUNT)]
Digest = Annotated[str, Field(strict=True, pattern=r'^[a-f0-9]{64}$')]
Key = Annotated[str, Field(strict=True, min_length=1, max_length=4096)]


class QuantityPair(Contract):
    row_id: Digest
    metric_key: Key
    dimension: Key
    basis: Key
    before: SafeCount
    after: SafeCount


class QuantityDelta(QuantityPair):
    delta: SafeDelta


class RetainedPointMatrix(Contract):
    capture_id: Digest
    matrix: PointMatrix


class RevisionQuantityInput(Contract):
    pairs: list[QuantityPair] = Field(max_length=1000)
    point_matrices: list[RetainedPointMatrix] = Field(max_length=1000)


class CheckedPointMatrix(Contract):
    capture_id: Digest
    matrix_id: Key


class RevisionQuantityResult(Contract):
    schema_version: Literal['bas_revision_quantities_v1'] = 'bas_revision_quantities_v1'
    rule_version: Literal['comparable_declared_count_deltas_1'] = 'comparable_declared_count_deltas_1'
    engine: Literal['bas_math_v1'] = 'bas_math_v1'
    pairs: list[QuantityDelta] = Field(max_length=1000)
    checked_point_matrices: list[CheckedPointMatrix] = Field(max_length=1000)
    installed_quantity: None = None
    approved: Literal[False] = False
    project_complete: Literal[False] = False


def compare_revision_quantities(request: RevisionQuantityInput) -> RevisionQuantityResult:
    checked = RevisionQuantityInput.model_validate(request.model_dump())
    seen: set[tuple[str, str]] = set()
    matrices: set[tuple[str, str]] = set()
    result = RevisionQuantityResult(pairs=[], checked_point_matrices=[])
    for source in checked.point_matrices:
        key = (source.capture_id, source.matrix.matrix_id)
        if key in matrices:
            raise ValueError('Duplicate retained revision point matrix')
        matrices.add(key)
        validate_observations(source.matrix)
        result.checked_point_matrices.append(CheckedPointMatrix(capture_id=source.capture_id, matrix_id=source.matrix.matrix_id))
    for pair in checked.pairs:
        key = (pair.row_id, pair.metric_key)
        if key in seen:
            raise ValueError('Duplicate revision quantity pair')
        seen.add(key)
        result.pairs.append(QuantityDelta(**pair.model_dump(), delta=pair.after - pair.before))
    return result
