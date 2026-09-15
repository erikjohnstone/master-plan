#!/usr/bin/env python3
"""Run a declared model bakeoff unattended without manufacturing a winner.

The configuration is intentionally JSON (not executable Python). Each
experiment must declare its one hypothesis, its immutable control evaluation,
and its expected evaluation JSON. The runner records every command and refuses
to call an experiment a production candidate unless the independent
project-grounding evaluator says the evidence is eligible and every declared
metric gate beats the frozen control.

This is an offline training runner. It never imports OpenTakeoff production
modules, changes a takeoff, changes user quantities, or deploys a checkpoint.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


SCHEMA = "opentakeoff.controlled_metric_bakeoff.v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True, help="Declared JSON experiment matrix")
    parser.add_argument("--output", type=Path, required=True, help="Bakeoff report JSON")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the fixed matrix without training")
    parser.add_argument("--resume", action="store_true", help="Reuse completed result records from an earlier output report")
    parser.add_argument("--max-experiments", type=int, default=None, help="Bound this invocation without changing the matrix")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in {path}: {error.msg}") from error
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return payload


def command_from(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item for item in value):
        raise ValueError(f"{field} must be a non-empty command string list")
    return list(value)


def nested_value(payload: dict[str, Any], dotted_path: str) -> float | bool | None:
    value: Any = payload
    for part in dotted_path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value if isinstance(value, (int, float, bool)) else None


def validate_config(config: dict[str, Any]) -> None:
    if config.get("schema") != SCHEMA:
        raise ValueError(f"Expected schema {SCHEMA}")
    control = config.get("control")
    if not isinstance(control, dict):
        raise ValueError("config requires a control object")
    if not isinstance(control.get("id"), str) or not control["id"]:
        raise ValueError("control needs a non-empty id")
    if not isinstance(control.get("evaluation_json"), str) or not control["evaluation_json"]:
        raise ValueError("control needs an evaluation_json path")
    comparisons = config.get("comparison_gates")
    if not isinstance(comparisons, list) or not comparisons:
        raise ValueError("config needs at least one comparison gate")
    for gate in comparisons:
        if not isinstance(gate, dict) or not isinstance(gate.get("metric"), str):
            raise ValueError("Each comparison gate needs a metric path")
        if gate.get("direction") not in {"higher", "lower"}:
            raise ValueError("Each comparison gate needs direction higher or lower")
        if not isinstance(gate.get("minimum_delta"), (int, float)):
            raise ValueError("Each comparison gate needs numeric minimum_delta")
    experiments = config.get("experiments")
    if not isinstance(experiments, list) or not experiments:
        raise ValueError("config needs experiments")
    seen: set[str] = set()
    for experiment in experiments:
        if not isinstance(experiment, dict):
            raise ValueError("Each experiment must be an object")
        identifier = experiment.get("id")
        if not isinstance(identifier, str) or not identifier:
            raise ValueError("Each experiment needs a non-empty id")
        if identifier in seen:
            raise ValueError(f"Duplicate experiment id: {identifier}")
        seen.add(identifier)
        if not isinstance(experiment.get("hypothesis"), str) or not experiment["hypothesis"]:
            raise ValueError(f"Experiment {identifier} needs one stated hypothesis")
        command_from(experiment.get("command"), f"experiment {identifier} command")
        if not isinstance(experiment.get("evaluation_json"), str) or not experiment["evaluation_json"]:
            raise ValueError(f"Experiment {identifier} needs evaluation_json")


def gate_decision(control: dict[str, Any], experiment: dict[str, Any], gates: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """Return only a candidate-for-review when independent evidence is eligible."""
    checks: list[dict[str, Any]] = []
    control_eligible = nested_value(control, "production_evidence_eligible") is True
    experiment_eligible = nested_value(experiment, "production_evidence_eligible") is True
    for gate in gates:
        before = nested_value(control, gate["metric"])
        after = nested_value(experiment, gate["metric"])
        passed = False
        delta: float | None = None
        if isinstance(before, (int, float)) and not isinstance(before, bool) and isinstance(after, (int, float)) and not isinstance(after, bool):
            delta = float(after) - float(before)
            passed = delta >= float(gate["minimum_delta"]) if gate["direction"] == "higher" else -delta >= float(gate["minimum_delta"])
        checks.append({"metric": gate["metric"], "direction": gate["direction"], "control": before, "experiment": after, "delta": delta, "passed": passed})
    if not control_eligible or not experiment_eligible:
        return "diagnostic_only_not_promotable", checks
    return ("candidate_for_human_release_review" if all(check["passed"] for check in checks) else "rejected_by_fixed_control_gates"), checks


def render_command(command: list[str], config_dir: Path, experiment_id: str) -> list[str]:
    replacements = {"{config_dir}": str(config_dir), "{experiment_id}": experiment_id}
    rendered: list[str] = []
    for piece in command:
        for old, new in replacements.items():
            piece = piece.replace(old, new)
        rendered.append(piece)
    return rendered


def prior_by_id(path: Path) -> dict[str, dict[str, Any]]:
    if not path.is_file():
        return {}
    report = read_json(path)
    rows = report.get("experiments", [])
    return {row["id"]: row for row in rows if isinstance(row, dict) and isinstance(row.get("id"), str)}


def run(config: dict[str, Any], config_dir: Path, output: Path, dry_run: bool, resume: bool, max_experiments: int | None) -> dict[str, Any]:
    validate_config(config)
    control_path = (config_dir / config["control"]["evaluation_json"]).resolve()
    control = read_json(control_path)
    existing = prior_by_id(output) if resume else {}
    experiments: list[dict[str, Any]] = []
    selected = config["experiments"][:max_experiments] if max_experiments is not None else config["experiments"]
    for spec in selected:
        identifier = spec["id"]
        if resume and existing.get(identifier, {}).get("status") == "completed":
            experiments.append(existing[identifier])
            continue
        command = render_command(command_from(spec["command"], f"experiment {identifier} command"), config_dir, identifier)
        row: dict[str, Any] = {
            "id": identifier,
            "hypothesis": spec["hypothesis"],
            "command": command,
            "evaluation_json": str((config_dir / spec["evaluation_json"]).resolve()),
        }
        if dry_run:
            row["status"] = "planned"
            experiments.append(row)
            continue
        started = dt.datetime.now(dt.timezone.utc).isoformat()
        completed = subprocess.run(command, cwd=config_dir, text=True, capture_output=True, check=False)
        row.update({
            "started_at": started,
            "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "returncode": completed.returncode,
            "stdout_tail": completed.stdout[-4000:],
            "stderr_tail": completed.stderr[-4000:],
        })
        evaluation_path = Path(row["evaluation_json"])
        if completed.returncode != 0:
            row["status"] = "command_failed"
        elif not evaluation_path.is_file():
            row["status"] = "evaluation_missing"
        else:
            evaluation = read_json(evaluation_path)
            decision, checks = gate_decision(control, evaluation, config["comparison_gates"])
            row.update({"status": "completed", "evaluation": evaluation, "decision": decision, "gate_checks": checks})
        experiments.append(row)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"schema": "opentakeoff.controlled_metric_bakeoff_report.v1", "control": control, "experiments": experiments}, indent=2) + "\n", encoding="utf-8")
    return {"schema": "opentakeoff.controlled_metric_bakeoff_report.v1", "control": control, "experiments": experiments}


def main() -> int:
    args = parse_args()
    if args.max_experiments is not None and args.max_experiments < 1:
        raise ValueError("--max-experiments must be positive")
    config_path = args.config.resolve()
    report = run(read_json(config_path), config_path.parent, args.output.resolve(), args.dry_run, args.resume, args.max_experiments)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
