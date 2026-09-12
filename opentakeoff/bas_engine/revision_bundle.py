"""One-process revision verification and arithmetic.

The source/identity comparison remains in the shared TypeScript authority. This
module only combines two existing Python operations so an ordinary revision
preview does not pay multiple interpreter and Pydantic startup costs.
"""
from __future__ import annotations

from typing import Literal

from .models import Contract
from .revision_quantities import (
    RevisionQuantityInput,
    RevisionQuantityResult,
    compare_revision_quantities,
)
from .workflow_replay import (
    WorkflowReplayInput,
    WorkflowReplayResult,
    replay_workflow,
)


class RevisionBundleInput(Contract):
    workflow_replay: WorkflowReplayInput
    revision_quantities: RevisionQuantityInput


class RevisionBundleResult(Contract):
    schema_version: Literal['bas_revision_bundle_v1'] = 'bas_revision_bundle_v1'
    workflow_replay: WorkflowReplayResult
    revision_quantities: RevisionQuantityResult
    installed_quantity: None = None
    approved: Literal[False] = False
    project_complete: Literal[False] = False


def calculate_revision_bundle(request: RevisionBundleInput) -> RevisionBundleResult:
    checked = RevisionBundleInput.model_validate(request.model_dump())
    return RevisionBundleResult(
        workflow_replay=replay_workflow(checked.workflow_replay),
        revision_quantities=compare_revision_quantities(checked.revision_quantities),
    )
