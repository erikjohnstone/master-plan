"""Bounded, one-shot JSON interface. No network, shell, secrets, or PDF parsing."""

from __future__ import annotations

import json
import sys

from pydantic import ValidationError

from .adapters import BlueprintInput, indexed_request
from .engine import calculate
from .models import Contract, EngineRequest, EngineResult
from .point_lists import PointListInput, PointListResult, review_point_lists
from .assignment_demand import AssignmentDemandInput, AssignmentDemandResult, calculate_assignment_demand
from .assemblies import AssemblyQuantityInput, AssemblyQuantityResult, calculate_assembly_quantities
from .engineering_contracts import EngineeringInput
from .engineering import EngineeringResult, check_engineering
from .engineering_replay import EngineeringReplayInput, EngineeringReplayResult, replay_engineering
from .workflow_replay import WorkflowReplayInput, WorkflowReplayResult, replay_workflow
from .revision_quantities import RevisionQuantityInput, RevisionQuantityResult, compare_revision_quantities

MAX_BYTES = 32 * 1024 * 1024


class Envelope(Contract):
    request: EngineRequest | None = None
    blueprint: BlueprintInput | None = None
    point_lists: PointListInput | None = None
    assignment_demand: AssignmentDemandInput | None = None
    assembly_quantities: AssemblyQuantityInput | None = None
    engineering: EngineeringInput | None = None
    engineering_replay: EngineeringReplayInput | None = None
    workflow_replay: WorkflowReplayInput | None = None
    revision_quantities: RevisionQuantityInput | None = None


def main() -> int:
    try:
        data = sys.stdin.buffer.read(MAX_BYTES+1)
        if len(data) > MAX_BYTES:
            raise ValueError("BAS input exceeds 32 MiB")
        envelope = Envelope.model_validate_json(data)
        if sum(item is not None for item in (envelope.request, envelope.blueprint, envelope.point_lists, envelope.assignment_demand, envelope.assembly_quantities, envelope.engineering, envelope.engineering_replay, envelope.workflow_replay, envelope.revision_quantities)) != 1:
            raise ValueError("provide exactly one request, blueprint, point_lists, assignment_demand, assembly_quantities, engineering, engineering_replay, workflow_replay or revision_quantities payload")
        result: EngineResult | PointListResult | AssignmentDemandResult | AssemblyQuantityResult | EngineeringResult | EngineeringReplayResult | WorkflowReplayResult | RevisionQuantityResult
        if envelope.revision_quantities is not None:
            result = compare_revision_quantities(envelope.revision_quantities)
            result = RevisionQuantityResult.model_validate(result.model_dump())
        elif envelope.workflow_replay is not None:
            result = replay_workflow(envelope.workflow_replay)
            result = WorkflowReplayResult.model_validate(result.model_dump())
        elif envelope.engineering_replay is not None:
            result = replay_engineering(envelope.engineering_replay)
            result = EngineeringReplayResult.model_validate(result.model_dump())
        elif envelope.engineering is not None:
            result = check_engineering(envelope.engineering)
            result = EngineeringResult.model_validate(result.model_dump())
        elif envelope.assembly_quantities is not None:
            result = calculate_assembly_quantities(envelope.assembly_quantities)
            result = AssemblyQuantityResult.model_validate(result.model_dump())
        elif envelope.assignment_demand is not None:
            result = calculate_assignment_demand(envelope.assignment_demand)
            result = AssignmentDemandResult.model_validate(result.model_dump())
        elif envelope.point_lists is not None:
            result = review_point_lists(envelope.point_lists)
            result = PointListResult.model_validate(result.model_dump())
        else:
            request = envelope.request
            if request is None:
                assert envelope.blueprint is not None
                request = indexed_request(envelope.blueprint)
            result = calculate(request)
            result = EngineResult.model_validate(result.model_dump())
        # Validate the output contract again before crossing a process boundary.
        output = result.model_dump_json()
        if len(output.encode()) > MAX_BYTES:
            raise ValueError("BAS output exceeds 32 MiB")
        sys.stdout.write(output + "\n")
        return 0
    except (ValueError, ValidationError) as error:
        # Report the structural location, never echo potentially sensitive source text.
        detail = "Invalid BAS payload"
        if isinstance(error, ValidationError):
            fields = [".".join(map(str, e["loc"])) for e in error.errors(include_input=False)[:12]]
            detail += ": " + ", ".join(fields)
        else:
            detail = str(error)
        sys.stdout.write(json.dumps({"error": {"code": "BAS_VALIDATION_ERROR", "message": detail}}) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
