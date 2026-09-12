"""The bundled revision path must equal the two existing Python authorities."""
import json
import subprocess
import sys

from bas_engine.revision_bundle import RevisionBundleInput, calculate_revision_bundle
from bas_engine.revision_quantities import compare_revision_quantities
from bas_engine.workflow_replay import replay_workflow
from bas_engine.tests.test_assignment_demand import payload
from bas_engine.tests.test_revision_quantities import pair
from bas_engine.tests.test_workflow_replay import records


def request_data():
    source = payload()
    return {
        'workflow_replay': {'records': records()},
        'revision_quantities': {
            'pairs': [pair(), pair(9, 4, 'decrease')],
            'point_matrices': [{
                'capture_id': source.capture_id,
                'matrix': source.points.matrices[0].model_dump(),
            }],
        },
    }


def test_bundle_is_exactly_the_existing_replay_and_quantity_results():
    request = RevisionBundleInput.model_validate(request_data())
    before = request.model_dump()
    result = calculate_revision_bundle(request)
    assert result.workflow_replay == replay_workflow(request.workflow_replay)
    assert result.revision_quantities == compare_revision_quantities(request.revision_quantities)
    assert result.installed_quantity is None
    assert not result.approved and not result.project_complete
    assert request.model_dump() == before

    process = subprocess.run(
        [sys.executable, '-m', 'bas_engine'],
        input=json.dumps({'revision_bundle': before}),
        text=True,
        capture_output=True,
        timeout=10,
    )
    assert process.returncode == 0 and not process.stderr
    assert json.loads(process.stdout) == result.model_dump()
