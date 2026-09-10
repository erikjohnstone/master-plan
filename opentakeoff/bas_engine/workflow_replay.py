"""Batch equality against existing calculators; source ownership is checked upstream."""
from __future__ import annotations

from typing import Annotated, Literal
from pydantic import Field
from .models import Contract
from .assignment_demand import AssignmentDemandInput, AssignmentDemandResult, calculate_assignment_demand
from .assemblies import AssemblyQuantityInput, AssemblyQuantityResult, calculate_assembly_quantities
from .engineering import EngineeringResult, check_engineering


class AssignmentReplay(Contract):
    kind: Literal['assignment']
    record_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    input: AssignmentDemandInput
    result: AssignmentDemandResult


class AssemblyReplay(Contract):
    kind: Literal['assembly']
    record_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    input: AssemblyQuantityInput
    result: AssemblyQuantityResult


class EngineeringReplay(Contract):
    kind: Literal['engineering']
    record_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    result: EngineeringResult


ReplayRecord = Annotated[AssignmentReplay | AssemblyReplay | EngineeringReplay, Field(discriminator='kind')]


class WorkflowReplayInput(Contract):
    records: list[ReplayRecord] = Field(max_length=1000)


class CheckedRecord(Contract):
    kind: Literal['assignment', 'assembly', 'engineering']
    record_id: str = Field(pattern=r'^[a-f0-9]{64}$')


class WorkflowReplayResult(Contract):
    schema_version: Literal['bas_workflow_replay_batch_v1'] = 'bas_workflow_replay_batch_v1'
    rule_version: Literal['saved_bas_calculations_1'] = 'saved_bas_calculations_1'
    checked_records: list[CheckedRecord] = Field(max_length=1000)
    match: Literal[True] = True
    project_complete: Literal[False] = False


def replay_workflow(request: WorkflowReplayInput) -> WorkflowReplayResult:
    checked = WorkflowReplayInput.model_validate(request.model_dump())
    seen: set[str] = set()
    result = WorkflowReplayResult(checked_records=[])
    for index, record in enumerate(checked.records):
        if record.record_id in seen:
            raise ValueError('Duplicate saved BAS replay record')
        seen.add(record.record_id)
        if isinstance(record, AssignmentReplay):
            current = calculate_assignment_demand(record.input).model_dump()
        elif isinstance(record, AssemblyReplay):
            current = calculate_assembly_quantities(record.input).model_dump()
        else:
            current = check_engineering(record.result.original).model_dump()
        if current != record.result.model_dump():
            raise ValueError(f'Saved BAS {record.kind} result {index} does not match shared Python replay')
        result.checked_records.append(CheckedRecord(kind=record.kind, record_id=record.record_id))
    return result
