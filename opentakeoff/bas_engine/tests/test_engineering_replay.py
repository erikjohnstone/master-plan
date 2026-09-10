import json
import subprocess
import sys

import pytest
from pydantic import ValidationError

from bas_engine.engineering import check_engineering
from bas_engine.engineering_contracts import EngineeringInput
from bas_engine.engineering_replay import EngineeringReplayInput, replay_engineering
from bas_engine.tests.test_engineering import power, signal


def saved():
    return check_engineering(EngineeringInput.model_validate({"checks": [power()]}))


def test_saved_result_batch_matches_actual_python_process_and_keeps_original():
    request = EngineeringReplayInput(results=[saved(), saved()])
    before = request.model_dump()
    result = replay_engineering(request)
    assert result.checked_results == 2 and result.match and not result.project_complete
    assert request.model_dump() == before
    child = subprocess.run([sys.executable, "-m", "bas_engine"], input=json.dumps({"engineering_replay": before}),
                           text=True, capture_output=True, timeout=10)
    assert child.returncode == 0 and not child.stderr
    assert json.loads(child.stdout) == result.model_dump()


@pytest.mark.parametrize("corruption", ["status", "normalized", "message", "drop", "original"])
def test_forged_results_are_recomputed_not_accepted_by_summary_or_hash(corruption):
    result = saved().model_dump()
    if corruption == "status":
        result["checks"][0]["constraints"][0]["status"] = "fail"
        result["checks"][0]["status"] = result["status"] = "fail"
    elif corruption == "normalized":
        result["checks"][0]["constraints"][-1]["normalized"] = {"fabricated": "0"}
    elif corruption == "message":
        result["checks"][0]["constraints"][0]["message"] = "Invented all-clear wording"
    elif corruption == "drop":
        result["checks"][0]["constraints"].pop()
    else:
        result["original"]["checks"][0]["capacity"]["value"]["value"] = "1"
    request = EngineeringReplayInput.model_validate({"results": [saved().model_dump(), result]})
    with pytest.raises(ValueError, match="result 1 does not match"):
        replay_engineering(request)


def test_repeated_inputs_are_computed_once_without_skipping_comparison(monkeypatch):
    import bas_engine.engineering_replay as module
    calls = []
    actual = module.check_engineering
    def counted(request):
        calls.append(request)
        return actual(request)
    monkeypatch.setattr(module, "check_engineering", counted)
    result = saved()
    request = EngineeringReplayInput(results=[result] * 100)
    assert replay_engineering(request).checked_results == 100
    assert len(calls) == 1
    # Independent records model a serialized history; deepcopy would preserve
    # the deliberately shared aliases in the request above.
    broken = EngineeringReplayInput(results=[result.model_copy(deep=True) for _ in range(100)])
    broken.results[-1].checks[0].constraints[0].message = "Changed"
    with pytest.raises(ValueError, match="result 99"):
        replay_engineering(broken)


def test_empty_replay_and_malformed_or_mixed_envelopes():
    assert not replay_engineering(EngineeringReplayInput(results=[])).project_complete
    with pytest.raises(ValidationError):
        EngineeringReplayInput.model_validate({"results": [saved().model_dump()] * 1001})
    child = subprocess.run([sys.executable, "-m", "bas_engine"], input=json.dumps({
        "engineering_replay": {"results": []}, "engineering": {"checks": [signal()]}}), text=True, capture_output=True, timeout=10)
    assert child.returncode == 2 and "provide exactly one" in child.stdout
