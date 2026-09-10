"""Verify saved engineering math against the same calculator, never a local hash.

Capture/owner/history validation remains in the shared workflow service. This
only proves exact calculator equality for the retained declared inputs.
"""
from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import Field

from .engineering import EngineeringResult, check_engineering
from .models import Contract, Count


class EngineeringReplayInput(Contract):
    results: list[EngineeringResult] = Field(max_length=1000)


class EngineeringReplayResult(Contract):
    schema_version: Literal["bas_engineering_replay_v1"] = "bas_engineering_replay_v1"
    rule_version: Literal["declared_engineering_constraints_1"] = "declared_engineering_constraints_1"
    checked_results: Count
    match: Literal[True] = True
    project_complete: Literal[False] = False


def replay_engineering(request: EngineeringReplayInput) -> EngineeringReplayResult:
    checked = EngineeringReplayInput.model_validate(request.model_dump())
    cache: dict[str, EngineeringResult] = {}
    for index, saved in enumerate(checked.results):
        key = hashlib.sha256(saved.original.model_dump_json().encode()).hexdigest()
        current = cache.get(key)
        if current is None:
            current = check_engineering(saved.original)
            cache[key] = current
        if current.model_dump() != saved.model_dump():
            raise ValueError(f"Saved engineering result {index} does not match shared Python replay")
    return EngineeringReplayResult(checked_results=len(checked.results))
