"""Deterministic declared-constraint checks, not installed-design certification.

Numeric decisions live here once for UI and MCP. Original inputs are retained;
source ownership, register/history and complete constraint coverage are separate
workflow obligations and cannot be established by calling this calculator alone.
"""
from __future__ import annotations

from collections.abc import Callable
from fractions import Fraction
from typing import Literal, TypeVar

from pydantic import Field

from .engineering_contracts import (AllocationCheck, AnalogRangeCheck, ContactCheck, EngineeringCheck,
                                    EngineeringInput, ExpansionCheck, Known, MechanicalCheck,
                                    PowerCheck, PulseCheck, ResistiveLoadingCheck,
                                    SignalCheck)
from .engineering_units import Interval, Quantity, bounded_exact, exact_sum, rational_text
from .models import Contract

Status = Literal["pass", "fail", "not_evaluable"]
T = TypeVar("T")
U = TypeVar("U")


class ConstraintOutcome(Contract):
    rule_id: str
    status: Status
    input_paths: list[str]
    missing_inputs: list[str]
    message: str
    normalized: dict[str, str] = Field(default_factory=dict)


class CheckResult(Contract):
    check_id: str
    kind: str
    status: Status
    constraints: list[ConstraintOutcome]


class EngineeringResult(Contract):
    schema_version: Literal["bas_engineering_result_v1"] = "bas_engineering_result_v1"
    rule_version: Literal["declared_engineering_constraints_1"] = "declared_engineering_constraints_1"
    original: EngineeringInput
    checks: list[CheckResult]
    status: Status
    project_complete: Literal[False] = False
    coverage: Literal["selected_declared_constraints_only"] = "selected_declared_constraints_only"


def aggregate(statuses: list[Status]) -> Status:
    if "fail" in statuses:
        return "fail"
    if not statuses or "not_evaluable" in statuses:
        return "not_evaluable"
    return "pass"


def contains(accepted: Interval, required: Interval) -> bool:
    return (accepted.minimum.exact() <= required.minimum.exact()
            and required.maximum.exact() <= accepted.maximum.exact())


class Outcomes:
    def __init__(self) -> None:
        self.rows: list[ConstraintOutcome] = []

    def add(self, rule: str, paths: list[str], missing: list[str], passed: bool | None,
            message: str, normalized: dict[str, str] | None = None) -> None:
        # A proven failure survives incomplete inputs. Never use truthiness of
        # a number (zero is a value), or replace a missing rating with zero.
        status: Status = "fail" if passed is False else "not_evaluable" if missing or passed is None else "pass"
        self.rows.append(ConstraintOutcome(rule_id=rule, status=status,
                         input_paths=paths, missing_inputs=missing, message=message,
                         normalized=normalized or {}))

    def one(self, rule: str, path: str, rating: Known[T] | None,
            predicate: Callable[[T], bool], message: str) -> None:
        self.add(rule, [path], [path] if rating is None else [],
                 None if rating is None else predicate(rating.value), message)

    def pair(self, rule: str, left_path: str, left: Known[T] | None,
             right_path: str, right: Known[U] | None,
             predicate: Callable[[T, U], bool], message: str) -> None:
        missing = ([left_path] if left is None else []) + ([right_path] if right is None else [])
        self.add(rule, [left_path, right_path], missing,
                 None if left is None or right is None else predicate(left.value, right.value), message)

    def range(self, rule: str, required_path: str, required: Known[Interval] | None,
              accepted_path: str, accepted: Known[Interval] | None) -> None:
        self.pair(rule, required_path, required, accepted_path, accepted,
                  lambda r, a: contains(a, r), "The entire declared interval must fit within the accepted interval.")

    def minimum(self, rule: str, required_path: str, required: Known[Quantity] | None,
                provided_path: str, provided: Known[Quantity] | None) -> None:
        self.pair(rule, required_path, required, provided_path, provided,
                  lambda r, p: p.exact() >= r.exact(), "The provided rating must meet or exceed the declared minimum.")


def signal(check: SignalCheck, out: Outcomes) -> None:
    out.one("signal.source_direction", "source_direction", check.source_direction,
            lambda v: v == "output", "The source endpoint must be configured as an output.")
    out.one("signal.sink_direction", "sink_direction", check.sink_direction,
            lambda v: v == "input", "The receiving endpoint must be configured as an input.")
    out.pair("signal.mode", "source_mode", check.source_mode, "sink_modes", check.sink_modes,
             lambda mode, accepted: mode in accepted, "The receiver must explicitly accept the source's signal mode.")


def analog(check: AnalogRangeCheck, out: Outcomes) -> None:
    out.range("analog.range", "output_range", check.output_range, "accepted_range", check.accepted_range)
    out.pair("analog.waveform", "output_waveform", check.output_waveform,
             "accepted_waveform", check.accepted_waveform, lambda a, b: a == b,
             "AC and DC characteristics must agree; amplitude alone is insufficient.")
    out.pair("analog.excitation", "excitation", check.excitation,
             "accepted_excitation", check.accepted_excitation, lambda a, b: a in b,
             "The declared excitation arrangement must be explicitly accepted.")


def resistive_loading(check: ResistiveLoadingCheck, out: Outcomes) -> None:
    paths = ["topology", "permitted_load"] + [f"parts.{i}.resistance" for i in range(len(check.parts))]
    missing = (["topology"] if check.topology is None else []) + (["permitted_load"] if check.permitted_load is None else [])
    known: list[Fraction] = []
    for i, part in enumerate(check.parts):
        if part.resistance is None:
            missing.append(f"parts.{i}.resistance")
        else:
            known.append(part.resistance.value.exact())
    total: Fraction | None = None
    bound: Fraction | None = None
    passed: bool | None = None
    if check.topology is not None:
        topology = check.topology.value
        if topology in ("series", "effective"):
            bound = exact_sum(known)  # lower bound with nonnegative omitted parts
        elif known:
            bound = Fraction(0) if 0 in known else 1 / exact_sum(1 / r for r in known)
        if len(known) == len(check.parts):
            total = bound
        if check.permitted_load is not None and bound is not None:
            minimum = check.permitted_load.value.minimum.exact()
            maximum = check.permitted_load.value.maximum.exact()
            if total is not None:
                passed = minimum <= total <= maximum
            elif topology == "series" and bound > maximum:
                passed = False
            elif topology == "parallel" and bound < minimum:
                passed = False
    normalized = {"effective_ohm": rational_text(total)} if total is not None else {}
    if bound is not None and total is None and check.topology is not None:
        normalized[f"{check.topology.value}_known_bound_ohm"] = rational_text(bound)
    out.add("loading.declared_resistance", paths, missing, passed,
            "Compare the explicitly declared resistive topology against the permitted load interval; no reactive/cable topology inferred.", normalized)


def contact(check: ContactCheck, out: Outcomes) -> None:
    out.pair("contact.interface", "provided_interface", check.provided_interface,
             "accepted_interfaces", check.accepted_interfaces, lambda a, b: a in b,
             "A relay, triac, energized output or open collector requires explicit receiver acceptance.")
    out.pair("contact.waveform", "circuit_waveform", check.circuit_waveform,
             "rated_waveform", check.rated_waveform, lambda a, b: a == b,
             "The rating must apply to the circuit's AC/DC waveform.")
    out.range("contact.voltage", "circuit_voltage", check.circuit_voltage, "rated_voltage", check.rated_voltage)
    out.pair("contact.current", "operating_current", check.operating_current,
             "rated_current", check.rated_current,
             lambda demand, rated: rated.minimum.exact() <= demand.exact() <= rated.maximum.exact(),
             "Operating current must meet both minimum and maximum switching-current limits.")
    out.pair("contact.load_class", "circuit_load_class", check.circuit_load_class,
             "rated_load_classes", check.rated_load_classes, lambda a, b: a in b,
             "Ratings for a different load class cannot establish this circuit's rating.")


def pulse(check: PulseCheck, out: Outcomes) -> None:
    out.minimum("pulse.frequency", "maximum_frequency", check.maximum_frequency,
                "accepted_maximum_frequency", check.accepted_maximum_frequency)
    out.minimum("pulse.on_time", "required_minimum_on_time", check.required_minimum_on_time,
                "minimum_on_time", check.minimum_on_time)
    out.minimum("pulse.off_time", "required_minimum_off_time", check.required_minimum_off_time,
                "minimum_off_time", check.minimum_off_time)
    paths = ["maximum_frequency", "minimum_on_time", "minimum_off_time"]
    missing = [p for p, v in zip(paths, (check.maximum_frequency, check.minimum_on_time, check.minimum_off_time)) if v is None]
    passed = None
    if check.maximum_frequency is not None and check.minimum_on_time is not None and check.minimum_off_time is not None:
        period = 1 / check.maximum_frequency.value.exact()
        passed = check.minimum_on_time.value.exact() + check.minimum_off_time.value.exact() <= period
    out.add("pulse.timing_consistency", paths, missing, passed,
            "Declared minimum on/off times must fit into the period at maximum pulse frequency.")


def power(check: PowerCheck, out: Outcomes) -> None:
    for i, load in enumerate(check.loads):
        out.range(f"power.load.{load.load_id}.voltage", "output_voltage", check.output_voltage,
                  f"loads.{i}.accepted_voltage", load.accepted_voltage)
        out.pair(f"power.load.{load.load_id}.waveform", "output_waveform", check.output_waveform,
                 f"loads.{i}.accepted_waveform", load.accepted_waveform, lambda a, b: a == b,
                 "The supply waveform must be accepted by this load.")
    if not check.scenarios:
        out.add("power.scenarios", ["scenarios"], ["scenarios"], None,
                "At least one explicit scenario is required; simultaneous startup is never assumed.")
    load_by_id = {load.load_id: (i, load) for i, load in enumerate(check.loads)}
    for i, scenario in enumerate(check.scenarios):
        paths = ["capacity", "usable_fraction"]
        missing = (["capacity"] if check.capacity is None else []) + (["usable_fraction"] if check.usable_fraction is None else [])
        known = Fraction(0)
        for j, state in enumerate(scenario.states):
            paths.append(f"scenarios.{i}.states.{j}.state")
            if state.state.value == "off":
                continue
            index, load = load_by_id[state.load_id]
            rating = load.operating if state.state.value == "operating" else load.startup
            prefix = f"loads.{index}.{state.state.value}"
            paths.append(f"{prefix}.demand")
            if rating.demand is None:
                missing.append(f"{prefix}.demand")
                continue
            if check.capacity is None:
                continue  # do not sum unlike dimensions before a target is known
            value = rating.demand.value.exact()
            if rating.demand.value.dimension != check.capacity.value.dimension:
                paths.append(f"{prefix}.power_factor")
                if rating.power_factor is None:
                    missing.append(f"{prefix}.power_factor")
                    continue
                pf = rating.power_factor.value.exact()
                value = value / pf if check.capacity.value.dimension == "apparent_power" else value * pf
            known = bounded_exact(known + value)
        passed = None
        normalized: dict[str, str] = {}
        if check.capacity is not None:
            capacity = check.capacity.value.exact()
            normalized["power_dimension"] = check.capacity.value.dimension
            normalized["known_load_sum"] = rational_text(known)
            # A missing usable factor is unknown, not an assumed 100%. But an
            # overload of the entire nameplate remains a proven failure.
            limit = capacity * check.usable_fraction.value.exact() if check.usable_fraction is not None else capacity
            normalized["usable_capacity" if check.usable_fraction is not None else "nameplate_capacity_upper_bound"] = rational_text(limit)
            if known > limit:
                passed = False
            elif not missing:
                passed = True
        out.add(f"power.scenario.{scenario.scenario_id}", paths, missing, passed,
                "Sum only the declared scenario states. W/VA conversion requires that state's explicit power factor. Partial sums cannot prove sufficiency.", normalized)


def mechanical(check: MechanicalCheck, out: Outcomes) -> None:
    out.minimum("mechanical.torque", "required_torque", check.required_torque, "available_torque", check.available_torque)
    out.minimum("mechanical.closeoff", "required_closeoff", check.required_closeoff, "available_closeoff", check.available_closeoff)
    out.pair("mechanical.fail_position", "required_fail_position", check.required_fail_position,
             "provided_fail_position", check.provided_fail_position, lambda a, b: a == b,
             "Fail-position declarations must agree; no normal-position or spring-return inference.")
    out.range("mechanical.temperature", "required_environment", check.required_environment,
              "rated_environment", check.rated_environment)
    out.pair("mechanical.enclosure", "required_enclosure", check.required_enclosure,
             "accepted_enclosures", check.accepted_enclosures, lambda a, b: a in b,
             "Require an explicit accepted enclosure/location class; no inferred NEMA/IP equivalence.")


def allocation(check: AllocationCheck, out: Outcomes) -> None:
    channels = {c.channel_id: (i, c) for i, c in enumerate(check.channels)}
    assigned: dict[tuple[str, str], list[int]] = {}
    for i, endpoint in enumerate(check.endpoints):
        if endpoint.channel_id is not None and endpoint.channel_id.value in channels:
            _, channel = channels[endpoint.channel_id.value]
            assigned.setdefault((channel.owner_equipment_id, channel.physical_terminal_id), []).append(i)
    for i, endpoint in enumerate(check.endpoints):
        prefix = f"endpoints.{i}"
        rule = f"allocation.{endpoint.endpoint.endpoint_id}"
        out.one(f"{rule}.physical", f"{prefix}.physical_kind", endpoint.physical_kind,
                lambda kind: kind == "physical_io", "Software variables do not consume physical I/O terminals by name alone.")
        out.one(f"{rule}.channel", f"{prefix}.channel_id", endpoint.channel_id,
                lambda channel_id: channel_id in channels, "The selected physical channel must exist in this allocation register.")
        if endpoint.channel_id is None or endpoint.channel_id.value not in channels:
            continue
        j, channel = channels[endpoint.channel_id.value]
        channel_path = f"channels.{j}"
        peers = assigned[(channel.owner_equipment_id, channel.physical_terminal_id)]
        out.add(f"{rule}.exclusive_terminal", [f"endpoints.{k}.channel_id" for k in peers] +
                [f"{channel_path}.physical_terminal_id", f"{channel_path}.owner_equipment_id"], [], len(peers) == 1,
                "One physical terminal cannot be allocated to multiple independently required endpoints, including universal-mode aliases.")
        out.pair(f"{rule}.mode", f"{prefix}.required_mode", endpoint.required_mode,
                 f"{channel_path}.configured_mode", channel.configured_mode, lambda a, b: a == b,
                 "The allocated channel must be configured for the endpoint's declared mode.")
        out.pair(f"{rule}.direction", f"{prefix}.required_direction", endpoint.required_direction,
                 f"{channel_path}.direction", channel.direction, lambda a, b: a == b,
                 "The allocated channel's direction must meet the endpoint requirement.")
        out.pair(f"{rule}.pool", f"{prefix}.required_pool_id", endpoint.required_pool_id,
                 f"{channel_path}.pool_id", channel.pool_id, lambda a, b: a == b,
                 "Capacity in a different declared panel/pool cannot satisfy this endpoint allocation.")
        out.add(f"{rule}.scope", [f"{prefix}.endpoint.scope_id", f"{channel_path}.allowed_scope_ids"],
                [f"{channel_path}.allowed_scope_ids"] if channel.allowed_scope_ids is None else [],
                None if channel.allowed_scope_ids is None else endpoint.endpoint.scope_id in channel.allowed_scope_ids.value,
                "The endpoint scope must be explicitly permitted for this channel; equal tag labels do not establish scope.")


def expansion(check: ExpansionCheck, out: Outcomes, dependencies: dict[str, CheckResult]) -> None:
    out.add("expansion.module_count", ["modules", "maximum_modules"],
            ["maximum_modules"] if check.maximum_modules is None else [],
            None if check.maximum_modules is None else len(check.modules) <= check.maximum_modules.value,
            "Every explicitly selected expansion module consumes one declared expansion position.")
    channel_paths = [f"modules.{i}.channel_count" for i in range(len(check.modules))]
    missing = [p for p, m in zip(channel_paths, check.modules) if m.channel_count is None]
    if check.maximum_channels is None:
        missing.append("maximum_channels")
    known = sum(m.channel_count.value for m in check.modules if m.channel_count is not None)
    passed = None
    if check.maximum_channels is not None:
        passed = False if known > check.maximum_channels.value else None if missing else True
    out.add("expansion.channel_count", ["maximum_channels", *channel_paths], missing, passed,
            "Known channel subtotal cannot exceed the base limit; an omitted module count cannot establish sufficiency.",
            {"known_channels": str(known)})
    for i, module in enumerate(check.modules):
        prefix = f"modules.{i}"
        rule = f"expansion.{module.module_id}"
        out.one(f"{rule}.kind", f"{prefix}.device_kind", module.device_kind, lambda kind: kind == "expansion",
                "A standalone controller is not an expansion module.")
        out.pair(f"{rule}.interface", f"{prefix}.interface_id", module.interface_id,
                 "accepted_interfaces", check.accepted_interfaces, lambda a, b: a in b,
                 "The base must explicitly support this module's expansion interface.")
        out.add(f"{rule}.base", ["base_id", f"{prefix}.compatible_base_ids"],
                [f"{prefix}.compatible_base_ids"] if module.compatible_base_ids is None else [],
                None if module.compatible_base_ids is None else check.base_id in module.compatible_base_ids.value,
                "Module/base compatibility requires an explicit declaration, not a shared network brand.")
    dependency = dependencies.get(check.power_check_id or "")
    out.add("expansion.power", ["power_check_id"], ["power_check_id"] if dependency is None else [],
            None if dependency is None or dependency.status == "not_evaluable" else dependency.status == "pass",
            "Use the linked same-base/pool power check covering every module; inspect its retained input and constraints.",
            {"dependency_check_id": check.power_check_id} if check.power_check_id is not None else {})


def evaluate_check(check: EngineeringCheck) -> CheckResult:
    out = Outcomes()
    if isinstance(check, SignalCheck):
        signal(check, out)
    elif isinstance(check, AnalogRangeCheck):
        analog(check, out)
    elif isinstance(check, ResistiveLoadingCheck):
        resistive_loading(check, out)
    elif isinstance(check, ContactCheck):
        contact(check, out)
    elif isinstance(check, PulseCheck):
        pulse(check, out)
    elif isinstance(check, PowerCheck):
        power(check, out)
    elif isinstance(check, MechanicalCheck):
        mechanical(check, out)
    elif isinstance(check, AllocationCheck):
        allocation(check, out)
    else:
        raise ValueError("Engineering check requires dependency-aware evaluation")
    return CheckResult(check_id=check.check_id, kind=check.kind,
                       status=aggregate([row.status for row in out.rows]), constraints=out.rows)


def check_engineering(request: EngineeringInput) -> EngineeringResult:
    # Revalidate even typed callers (including model_construct/model_copy).
    original = EngineeringInput.model_validate(request.model_dump())
    evaluated = {check.check_id: evaluate_check(check) for check in original.checks if not isinstance(check, ExpansionCheck)}
    # The same endpoint cannot become voltage in one check and current in
    # another (or input then output) while both rows look independently green.
    endpoint_modes: dict[str, list[tuple[str, str, str]]] = {}
    endpoint_directions: dict[str, list[tuple[str, str, str]]] = {}
    for check in original.checks:
        if isinstance(check, SignalCheck):
            if check.source_mode is not None:
                endpoint_modes.setdefault(check.source.endpoint_id, []).append((check.check_id, "source_mode", check.source_mode.value))
            for endpoint, path, direction in ((check.source, "source_direction", check.source_direction),
                                               (check.sink, "sink_direction", check.sink_direction)):
                if direction is not None:
                    endpoint_directions.setdefault(endpoint.endpoint_id, []).append((check.check_id, path, direction.value))
        elif isinstance(check, AnalogRangeCheck):
            endpoint_modes.setdefault(check.source.endpoint_id, []).append((check.check_id, "signal_dimension", check.signal_dimension))
    for characteristic, declarations in (("mode", endpoint_modes), ("direction", endpoint_directions)):
        for endpoint_id, claims in declarations.items():
            if len({value for _, _, value in claims}) <= 1:
                continue
            for check_id, path, _ in claims:
                result = evaluated[check_id]
                result.constraints.append(ConstraintOutcome(rule_id=f"signal.cross_check_{characteristic}.{endpoint_id}", status="fail",
                    input_paths=[path], missing_inputs=[], message="The same endpoint has conflicting declarations across check rows.",
                    normalized={"conflicting_check_ids": ", ".join(sorted({c for c, _, _ in claims}))}))
                result.status = "fail"
    # Enforce exclusivity across check rows too, not just within one selected
    # allocation. Independent pools cannot reuse a physical terminal by alias.
    terminals: dict[tuple[str, str], list[tuple[str, int]]] = {}
    endpoints: dict[str, list[tuple[str, int]]] = {}
    for check in original.checks:
        if isinstance(check, AllocationCheck):
            channels = {channel.channel_id: channel for channel in check.channels}
            for i, allocated_endpoint in enumerate(check.endpoints):
                endpoints.setdefault(allocated_endpoint.endpoint.endpoint_id, []).append((check.check_id, i))
                if allocated_endpoint.channel_id is not None and allocated_endpoint.channel_id.value in channels:
                    channel = channels[allocated_endpoint.channel_id.value]
                    terminals.setdefault((channel.owner_equipment_id, channel.physical_terminal_id), []).append((check.check_id, i))
    for family, resources in (("terminal", terminals.values()), ("endpoint", endpoints.values())):
        for consumers in resources:
            if len({check_id for check_id, _ in consumers}) <= 1:
                continue  # within-row conflicts are diagnosed by allocation()
            for check_id, index in consumers:
                result = evaluated[check_id]
                result.constraints.append(ConstraintOutcome(rule_id=f"allocation.cross_check_{family}.{index}", status="fail",
                    input_paths=[f"endpoints.{index}.channel_id", f"endpoints.{index}.endpoint.endpoint_id"], missing_inputs=[],
                    message="The same physical resource is allocated in multiple check rows.",
                    normalized={"conflicting_check_ids": ", ".join(sorted({c for c, _ in consumers}))}))
                result.status = "fail"
    for check in original.checks:
        if isinstance(check, ExpansionCheck):
            out = Outcomes()
            expansion(check, out, evaluated)
            evaluated[check.check_id] = CheckResult(check_id=check.check_id, kind=check.kind,
                status=aggregate([row.status for row in out.rows]), constraints=out.rows)
    results = [evaluated[check.check_id] for check in original.checks]
    return EngineeringResult(original=original, checks=results,
                             status=aggregate([result.status for result in results]))
