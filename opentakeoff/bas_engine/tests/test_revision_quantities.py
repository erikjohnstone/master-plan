"""Controlled count arithmetic and retained-point parity, not installed truth."""
import json
import subprocess
import sys

import pytest
from pydantic import ValidationError
from bas_engine.revision_quantities import RevisionQuantityInput, compare_revision_quantities, MAX_SAFE_COUNT
from bas_engine.tests.test_assignment_demand import payload


def pair(before=2, after=5, metric='AI'):
    return {'row_id': 'a' * 64, 'metric_key': metric, 'dimension': 'declared_io:AI',
            'basis': 'listed_matrix_only', 'before': before, 'after': after}


def test_signed_exact_deltas_preserve_every_original_and_actual_process_parity():
    data = {'pairs': [pair(), pair(5, 2, 'decrease'), pair(0, 0, 'zero'),
                      pair(MAX_SAFE_COUNT, 0, 'negative-limit'), pair(0, MAX_SAFE_COUNT, 'positive-limit')], 'point_matrices': []}
    request = RevisionQuantityInput.model_validate(data)
    result = compare_revision_quantities(request)
    assert [p.delta for p in result.pairs] == [3, -3, 0, -MAX_SAFE_COUNT, MAX_SAFE_COUNT]
    assert [p.model_dump(exclude={'delta'}) for p in result.pairs] == data['pairs']
    assert request.model_dump() == data
    assert not result.approved and not result.project_complete and result.installed_quantity is None
    process = subprocess.run([sys.executable, '-m', 'bas_engine'], input=json.dumps({'revision_quantities': data}),
                             text=True, capture_output=True, timeout=10)
    assert process.returncode == 0 and json.loads(process.stdout) == result.model_dump()


@pytest.mark.parametrize('bad', [True, False, 2.5, '2', -1, None, MAX_SAFE_COUNT + 1])
def test_counts_cannot_be_coerced_or_unavailable_values_changed_to_zero(bad):
    with pytest.raises(ValidationError):
        RevisionQuantityInput.model_validate({'pairs': [pair(before=bad)], 'point_matrices': []})


def test_duplicate_oversized_unknown_and_multi_operation_payloads_fail():
    with pytest.raises(ValueError, match='Duplicate'):
        compare_revision_quantities(RevisionQuantityInput.model_validate({'pairs': [pair(), pair()], 'point_matrices': []}))
    with pytest.raises(ValidationError):
        RevisionQuantityInput.model_validate({'pairs': [pair()] * 1001, 'point_matrices': []})
    with pytest.raises(ValidationError):
        RevisionQuantityInput.model_validate({'pairs': [{**pair(), 'installed': True}], 'point_matrices': []})
    process = subprocess.run([sys.executable, '-m', 'bas_engine'], input=json.dumps({'revision_quantities': {'pairs': [], 'point_matrices': []},
        'workflow_replay': {'records': []}}), text=True, capture_output=True, timeout=10)
    assert process.returncode == 2 and 'exactly one' in process.stdout


def test_existing_point_authority_rejects_re_signed_plausible_values_and_channels():
    source = payload()
    data = {'pairs': [], 'point_matrices': [{'capture_id': source.capture_id, 'matrix': source.points.matrices[0].model_dump()}]}
    result = compare_revision_quantities(RevisionQuantityInput.model_validate(data))
    assert result.checked_point_matrices[0].matrix_id == source.points.matrices[0].matrix_id
    for field, value in [('value', 999), ('channel', 'DO')]:
        corrupt = json.loads(json.dumps(data))
        corrupt['point_matrices'][0]['matrix']['rows'][0]['observations'][0][field] = value
        with pytest.raises(ValueError, match='differs'):
            compare_revision_quantities(RevisionQuantityInput.model_validate(corrupt))
    with pytest.raises(ValueError, match='Duplicate retained'):
        compare_revision_quantities(RevisionQuantityInput.model_validate({'pairs': [], 'point_matrices': data['point_matrices'] * 2}))
