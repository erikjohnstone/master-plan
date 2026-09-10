"""Controlled replay tests; no claim of source discovery or installed accuracy."""
import json
import subprocess
import sys

import pytest
from pydantic import ValidationError
from bas_engine.assignment_demand import calculate_assignment_demand
from bas_engine.assemblies import AssemblyQuantityInput, calculate_assembly_quantities
from bas_engine.engineering import check_engineering
from bas_engine.engineering_contracts import EngineeringInput
from bas_engine.workflow_replay import WorkflowReplayInput, replay_workflow
from bas_engine.tests.test_assignment_demand import payload
from bas_engine.tests.test_assemblies import raw_payload
from bas_engine.tests.test_engineering import signal


def records():
    assignment = payload()
    assembly = AssemblyQuantityInput.model_validate(raw_payload())
    engineering = check_engineering(EngineeringInput.model_validate({'checks': [signal()]}))
    return [
        {'kind': 'assignment', 'record_id': 'a' * 64, 'input': assignment.model_dump(),
         'result': calculate_assignment_demand(assignment).model_dump()},
        {'kind': 'assembly', 'record_id': 'b' * 64, 'input': assembly.model_dump(),
         'result': calculate_assembly_quantities(assembly).model_dump()},
        {'kind': 'engineering', 'record_id': 'c' * 64, 'result': engineering.model_dump()},
    ]


def test_complete_batch_matches_existing_calculators_and_actual_process():
    request = WorkflowReplayInput.model_validate({'records': records()})
    before = request.model_dump()
    checked = replay_workflow(request)
    assert checked.checked_records[0].kind == 'assignment'
    assert [r.record_id for r in checked.checked_records] == ['a' * 64, 'b' * 64, 'c' * 64]
    assert not checked.project_complete and request.model_dump() == before
    process = subprocess.run([sys.executable, '-m', 'bas_engine'], input=json.dumps({'workflow_replay': before}),
                             text=True, capture_output=True, timeout=10)
    assert process.returncode == 0 and not process.stderr
    assert json.loads(process.stdout) == checked.model_dump()


@pytest.mark.parametrize('kind', ['assignment', 'assembly', 'engineering'])
def test_plausible_but_wrong_saved_arithmetic_is_not_accepted(kind):
    data = records()
    record = next(r for r in data if r['kind'] == kind)
    if kind == 'assignment':
        record['result']['assignments'][0]['known_listed_io_subtotal']['AI'] += 1
    elif kind == 'assembly':
        record['result']['components'][0]['assigned_quantity'] += 1
    else:
        record['result']['checks'][0]['constraints'][0]['message'] = 'Invented outcome'
    request = WorkflowReplayInput.model_validate({'records': data})
    with pytest.raises(ValueError, match=f'{kind} result .* does not match'):
        replay_workflow(request)


def test_empty_duplicate_and_malformed_batches():
    assert replay_workflow(WorkflowReplayInput(records=[])).checked_records == []
    data = records()
    with pytest.raises(ValueError, match='Duplicate'):
        replay_workflow(WorkflowReplayInput.model_validate({'records': [data[0], data[0]]}))
    with pytest.raises(ValidationError):
        WorkflowReplayInput.model_validate({'records': [data[0]] * 1001})
    with pytest.raises(ValidationError):
        WorkflowReplayInput.model_validate({'records': [{**data[0], 'kind': 'unknown'}]})
    child = subprocess.run([sys.executable, '-m', 'bas_engine'], input=json.dumps({
        'workflow_replay': {'records': []}, 'engineering_replay': {'results': []}}), text=True, capture_output=True, timeout=10)
    assert child.returncode == 2 and 'provide exactly one' in child.stdout
