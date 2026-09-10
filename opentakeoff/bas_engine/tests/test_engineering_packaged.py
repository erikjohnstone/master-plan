"""Optional explicit packaging gate; run after MCP build, never installs tools."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.skipif(os.environ.get("OT_BAS_VERIFY_PACKAGE") != "1",
                    reason="Explicit packaging gate: build MCP, then set OT_BAS_VERIFY_PACKAGE=1")
def test_packaged_engineering_sources_and_actual_process_match_checkout():
    root = Path(__file__).parents[2]
    bundled = root / "mcp/dist/python"
    source_files = list((root / "bas_engine").glob("*.py"))
    assert source_files
    for path in source_files:
        assert path.read_bytes() == (bundled / "bas_engine" / path.name).read_bytes(), path.name
    payload = {"engineering": {"checks": [{"kind": "signal", "check_id": "packaged-signal",
        "equipment_ids": ["controller", "actuator"], "reason": "Controlled packaging fixture, not a real drawing",
        "source": {"endpoint_id": "AO-1", "equipment_id": "controller", "scope_id": "scope-A"},
        "sink": {"endpoint_id": "signal-in", "equipment_id": "actuator", "scope_id": "scope-A"},
        "source_direction": None, "sink_direction": None, "source_mode": None, "sink_modes": None}]}}
    outputs = []
    for cwd in [root, bundled]:
        runtime = subprocess.run([sys.executable, "-c", "import bas_engine; print(bas_engine.__file__)"],
                                 cwd=cwd, capture_output=True, text=True, timeout=10, check=True)
        assert Path(runtime.stdout.strip()).resolve() == (cwd / "bas_engine/__init__.py").resolve()
        process = subprocess.run([sys.executable, "-m", "bas_engine"], cwd=cwd, input=json.dumps(payload),
                                 text=True, capture_output=True, timeout=10, check=False)
        assert process.returncode == 0 and not process.stderr
        output = json.loads(process.stdout)
        assert output["status"] == "not_evaluable" and not output["project_complete"]
        assert output["original"]["checks"] == payload["engineering"]["checks"]
        outputs.append(output)
    assert outputs[0] == outputs[1]
    # New comparison arithmetic must also execute from the shipped runtime,
    # without using the source checkout or silently claiming installed scope.
    pair = {"row_id": "a" * 64, "metric_key": "AI", "dimension": "declared_io:AI",
            "basis": "listed_matrix_only", "before": 5, "after": 2}
    revision_outputs = []
    for cwd in [root, bundled]:
        process = subprocess.run([sys.executable, "-m", "bas_engine"], cwd=cwd,
                                 input=json.dumps({"revision_quantities": {"pairs": [pair], "point_matrices": []}}),
                                 text=True, capture_output=True, timeout=10, check=False)
        assert process.returncode == 0 and not process.stderr
        result = json.loads(process.stdout)
        assert result["pairs"] == [{**pair, "delta": -3}]
        assert result["installed_quantity"] is None and not result["approved"] and not result["project_complete"]
        revision_outputs.append(result)
    assert revision_outputs[0] == revision_outputs[1]
