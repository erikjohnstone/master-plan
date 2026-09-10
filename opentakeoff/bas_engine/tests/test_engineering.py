"""Independently enumerated declared-rating cases; not installed/PDF counts."""
import copy
import itertools
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

import pytest
from pydantic import ValidationError

from bas_engine.engineering import check_engineering
from bas_engine.engineering_contracts import EngineeringInput
from bas_engine.engineering_units import Interval, Quantity, bounded_exact, exact_sum, rational_text


def known(value):
    return {"value": value, "basis": {"origin": "explicit_input", "source_span_ids": [],
            "original_text": None, "reason": "Controlled test input, not a drawing rating"}}


def quantity(value, unit):
    return {"value": str(value), "unit": unit}


def q(value, unit):
    return known(quantity(value, unit))


def interval(lo, hi, unit):
    return known({"minimum": quantity(lo, unit), "maximum": quantity(hi, unit)})


def base(kind):
    return {"check_id": "test-check", "equipment_ids": ["controller", "actuator"],
            "reason": "Controlled declared-characteristic comparison", "kind": kind}


def connection(kind):
    return {**base(kind), "source": {"endpoint_id": "AO-1", "equipment_id": "controller", "scope_id": "building-A"},
            "sink": {"endpoint_id": "signal-in", "equipment_id": "actuator", "scope_id": "building-A"}}


def signal():
    return {**connection("signal"), "source_direction": known("output"), "sink_direction": known("input"),
            "source_mode": known("voltage"), "sink_modes": known(["voltage"])}


def analog():
    return {**connection("analog_range"), "signal_dimension": "voltage",
            "output_range": interval(0, 10, "V"), "accepted_range": interval(0, 10, "V"),
            "output_waveform": known("DC"), "accepted_waveform": known("DC"),
            "excitation": known("internally_powered"), "accepted_excitation": known(["internally_powered"])}


def loading(topology="series", parts=(200, 300), permitted=(0, 500)):
    return {**connection("resistive_loading"), "topology": known(topology),
            "permitted_load": interval(*permitted, "ohm"),
            "parts": [{"part_id": f"part-{i}", "resistance": q(v, "ohm") if v is not None else None} for i, v in enumerate(parts)]}


def contact():
    return {**connection("contact"), "provided_interface": known("dry_relay"),
            "accepted_interfaces": known(["dry_relay"]), "circuit_waveform": known("AC"), "rated_waveform": known("AC"),
            "circuit_voltage": interval(22, 26, "V"), "rated_voltage": interval(0, 30, "V"),
            "operating_current": q("0.5", "A"), "rated_current": interval("0.01", "0.5", "A"),
            "circuit_load_class": known("inductive"), "rated_load_classes": known(["inductive"])}


def pulse():
    return {**connection("pulse"), "maximum_frequency": q(20, "Hz"), "accepted_maximum_frequency": q(20, "Hz"),
            "minimum_on_time": q(25, "ms"), "required_minimum_on_time": q(5, "ms"),
            "minimum_off_time": q(25, "ms"), "required_minimum_off_time": q(5, "ms")}


def power():
    return {**base("power"), "supply_id": "transformer-A", "pool_id": "panel-A",
            "output_voltage": interval(22, 26, "V"), "output_waveform": known("AC"),
            "capacity": q(50, "VA"), "usable_fraction": q(1, "ratio"),
            "loads": [{"load_id": f"load-{i}", "equipment_id": "actuator",
                       "accepted_voltage": interval(20, 28, "V"), "accepted_waveform": known("AC"),
                       "operating": {"demand": q(25, "VA"), "power_factor": None},
                       "startup": {"demand": q(40, "VA"), "power_factor": None}} for i in range(2)],
            "scenarios": [{"scenario_id": "operating", "states": [
                {"load_id": f"load-{i}", "state": known("operating")} for i in range(2)],
                "reason": "Both connected loads operating; no simultaneous startup assumption"}]}


def mechanical():
    return {**base("mechanical"), "required_torque": q(12, "lbf*in"), "available_torque": q(1, "lbf*ft"),
            "required_closeoff": q(100, "kPa"), "available_closeoff": q(100000, "Pa"),
            "required_fail_position": known("closed"), "provided_fail_position": known("closed"),
            "required_environment": interval(0, 100, "degC"), "rated_environment": interval(32, 212, "degF"),
            "required_enclosure": known("NEMA-4"), "accepted_enclosures": known(["NEMA-4"])}


def allocation():
    return {**base("allocation"), "channels": [{"channel_id": "UI-1", "physical_terminal_id": "terminal-1",
                "owner_equipment_id": "controller", "pool_id": known("panel-A"), "allowed_scope_ids": known(["building-A"]),
                "configured_mode": known("voltage"), "direction": known("input")}],
            "endpoints": [{"endpoint": {"endpoint_id": "sensor-out", "equipment_id": "actuator", "scope_id": "building-A"},
                "physical_kind": known("physical_io"), "required_mode": known("voltage"), "required_direction": known("input"),
                "required_pool_id": known("panel-A"), "channel_id": known("UI-1")}]}


def expansion():
    return {**base("expansion"), "base_id": "transformer-A", "pool_id": "panel-A",
            "accepted_interfaces": known(["abstract-local-bus"]), "maximum_modules": known(2), "maximum_channels": known(8),
            "modules": [{"module_id": f"load-{i}", "equipment_id": "actuator", "device_kind": known("expansion"),
                "interface_id": known("abstract-local-bus"), "compatible_base_ids": known(["transformer-A"]),
                "channel_count": known(4)} for i in range(2)], "power_check_id": "power-check"}


def run(raw):
    request = EngineeringInput.model_validate({"checks": [raw]})
    before = request.model_dump()
    result = check_engineering(request)
    assert request.model_dump() == before == result.original.model_dump()
    assert not result.project_complete and result.coverage == "selected_declared_constraints_only"
    # Prove every outcome points to its real original input, including nulls.
    for row in result.checks[0].constraints:
        for path in row.input_paths:
            cursor = before["checks"][0]
            for part in path.split("."):
                cursor = cursor[int(part)] if isinstance(cursor, list) else cursor[part]
        assert set(row.missing_inputs) <= set(row.input_paths)
    assert check_engineering(EngineeringInput.model_validate_json(request.model_dump_json())).model_dump() == result.model_dump()
    return result


def row(result, rule):
    return next(r for r in result.checks[0].constraints if r.rule_id == rule)


@pytest.mark.parametrize("make", [signal, analog, loading, contact, pulse, power, mechanical])
def test_fully_declared_compatible_constraints_preserve_inputs(make):
    result = run(make())
    assert result.status == "pass"
    assert all(r.status == "pass" and not r.missing_inputs for r in result.checks[0].constraints)


@pytest.mark.parametrize("make", [signal, analog, loading, contact, pulse, power, mechanical])
def test_each_omitted_rating_is_not_a_passing_constraint(make):
    raw = make()
    for field, value in raw.items():
        if isinstance(value, dict) and "basis" in value:
            candidate = copy.deepcopy(raw)
            candidate[field] = None
            result = run(candidate)
            assert result.status == "not_evaluable", field
            assert any(field in r.missing_inputs for r in result.checks[0].constraints)


@pytest.mark.parametrize("field,value", [("source_direction", "input"), ("sink_direction", "output"), ("source_mode", "current")])
def test_signal_mismatch_with_another_unknown_still_fails(field, value):
    raw = signal()
    raw[field] = known(value)
    raw["sink_modes" if "direction" in field else "source_direction"] = None
    result = run(raw)
    assert result.status == "fail"
    assert any(r.status == "not_evaluable" for r in result.checks[0].constraints)


@pytest.mark.parametrize("lo,hi,expected", [(0, 10, "pass"), (2, 10, "fail"), (0, 8, "fail"), (-1, 11, "pass"), (11, 12, "fail")])
def test_range_is_inclusive_full_containment_not_overlap(lo, hi, expected):
    raw = analog()
    raw["accepted_range"] = interval(lo, hi, "V")
    assert run(raw).status == expected


def test_equivalent_voltage_and_one_decimal_increment_over_boundary():
    raw = analog()
    raw["accepted_range"] = interval(0, 10000, "mV")
    assert run(raw).status == "pass"
    raw["output_range"] = interval(0, "10.000000000000000001", "V")
    assert run(raw).status == "fail"


@pytest.mark.parametrize("parts,limits,status", [((200, 300), (0, 500), "pass"), ((200, 301), (0, 500), "fail"),
    ((200, None), (0, 500), "not_evaluable"), ((501, None), (0, 500), "fail")])
def test_series_resistance_missing_parts_and_known_overload(parts, limits, status):
    assert run(loading("series", parts, limits)).status == status


@pytest.mark.parametrize("parts,minimum,status", [((1000, 1000), 500, "pass"), ((1000, 1000), 501, "fail"),
    ((0, 1000), 1, "fail"), ((1000, None), 500, "not_evaluable"), ((499, None), 500, "fail")])
def test_parallel_resistance_does_not_sum_as_series(parts, minimum, status):
    assert run(loading("parallel", parts, (minimum, 10000))).status == status


def test_loading_enumeration_uses_independent_fraction_oracle():
    for topology, a, b, threshold in itertools.product(["series", "parallel"], range(1, 5), range(1, 5), range(1, 9)):
        expected = Fraction(a + b) if topology == "series" else Fraction(a * b, a + b)
        result = run(loading(topology, (a, b), (0, threshold)))
        assert (result.status == "pass") == (expected <= threshold)


@pytest.mark.parametrize("field,rating", [("provided_interface", known("triac")), ("rated_waveform", known("DC")),
    ("rated_voltage", interval(0, 24, "V")), ("operating_current", q("0.501", "A")),
    ("operating_current", q("0.009", "A")), ("rated_load_classes", known(["resistive"]))])
def test_contact_characteristics_are_independent(field, rating):
    raw = contact()
    raw[field] = rating
    assert run(raw).status == "fail"


@pytest.mark.parametrize("field,rating,rule", [("maximum_frequency", q(21, "Hz"), "pulse.frequency"),
    ("minimum_on_time", q(4, "ms"), "pulse.on_time"), ("minimum_off_time", q(4, "ms"), "pulse.off_time"),
    ("minimum_on_time", q(26, "ms"), "pulse.timing_consistency")])
def test_pulse_frequency_width_and_physical_period(field, rating, rule):
    raw = pulse()
    raw[field] = rating
    assert row(run(raw), rule).status == "fail"


def test_explicit_power_scenarios_and_derating_are_not_invented():
    raw = power()
    assert run(raw).status == "pass"  # 25+25 = 50
    raw["scenarios"][0]["states"][0]["state"] = known("startup")
    assert run(raw).status == "fail"  # 40+25 = 65
    raw["scenarios"][0]["states"][1]["state"] = known("off")
    assert run(raw).status == "pass"  # explicitly off, not missing = 40
    raw["usable_fraction"] = q("0.8", "ratio")
    assert run(raw).status == "pass"  # 40 = 50*.8, boundary
    raw["usable_fraction"] = q("0.799999999999999999", "ratio")
    assert run(raw).status == "fail"
    raw["scenarios"] = []
    assert run(raw).status == "not_evaluable"


def test_watts_are_not_volt_amperes_and_pf_is_scenario_specific():
    raw = power()
    raw["loads"][0]["operating"]["demand"] = q(20, "W")
    assert row(run(raw), "power.scenario.operating").status == "not_evaluable"
    raw["loads"][0]["startup"]["power_factor"] = q("0.8", "ratio")
    assert run(raw).status == "not_evaluable"  # wrong scenario is not a fallback
    raw["loads"][0]["operating"]["power_factor"] = q("0.8", "ratio")
    assert run(raw).status == "pass"  # 20/.8 + 25 = 50
    raw["loads"][0]["operating"]["power_factor"] = q("0.799999999999999999", "ratio")
    assert run(raw).status == "fail"


def test_power_known_overload_survives_missing_load_and_missing_factor():
    raw = power()
    raw["loads"][0]["operating"]["demand"] = q(51, "VA")
    raw["loads"][1]["operating"]["demand"] = None
    raw["usable_fraction"] = None
    result = row(run(raw), "power.scenario.operating")
    assert result.status == "fail"
    assert set(result.missing_inputs) == {"usable_fraction", "loads.1.operating.demand"}
    assert result.normalized["known_load_sum"] == "51"
    assert "usable_capacity" not in result.normalized


def test_power_small_scenarios_against_independent_integer_oracle():
    for a, b, state_a, state_b, capacity in itertools.product(range(3), range(3), ["operating", "startup", "off"], ["operating", "startup", "off"], range(1, 4)):
        raw = power()
        raw["capacity"] = q(capacity, "VA")
        for i, (value, state) in enumerate(((a, state_a), (b, state_b))):
            raw["loads"][i]["operating"]["demand"] = q(value, "VA")
            raw["loads"][i]["startup"]["demand"] = q(2 * value, "VA")
            raw["scenarios"][0]["states"][i]["state"] = known(state)
        factors = {"off": 0, "operating": 1, "startup": 2}
        assert (run(raw).status == "pass") == (a * factors[state_a] + b * factors[state_b] <= capacity)


@pytest.mark.parametrize("field,rating,rule", [("available_torque", q("0.999999999999999999", "lbf*ft"), "mechanical.torque"),
    ("available_closeoff", q(99999, "Pa"), "mechanical.closeoff"), ("provided_fail_position", known("open"), "mechanical.fail_position"),
    ("rated_environment", interval(33, 212, "degF"), "mechanical.temperature"),
    ("accepted_enclosures", known(["IP65"]), "mechanical.enclosure")])
def test_mechanical_constraints_do_not_infer_equivalences(field, rating, rule):
    raw = mechanical()
    raw[field] = rating
    assert row(run(raw), rule).status == "fail"


@pytest.mark.parametrize("a,b", [(quantity(12, "lbf*in"), quantity(1, "lbf*ft")),
    (quantity(1, "lbf*in"), quantity("0.1129848290276167", "N*m")),
    (quantity(32, "degF"), quantity(0, "degC")), (quantity(212, "degF"), quantity(100, "degC")),
    (quantity(1000, "mV"), quantity(1, "V")), (quantity(1000, "mA"), quantity(1, "A"))])
def test_exact_unit_definitions(a, b):
    assert Quantity.model_validate(a).exact() == Quantity.model_validate(b).exact()


def test_pressure_uses_exact_force_and_length_not_rounded_conversion_table():
    psi = Quantity(value="1", unit="psi").exact()
    assert psi == Fraction(44482216152605, 10000000000000) / Fraction(254, 10000)**2


@pytest.mark.parametrize("invalid", [True, 1, 1.0, float("nan"), float("inf"), "NaN", "Infinity", "1e9", " 1", "1 ", "+1", "01", "", "1/3", "1,000", "1\n", "9" * 21, "0." + "1" * 19])
def test_quantity_rejects_coercion_nonfinite_and_unbounded_decimals(invalid):
    with pytest.raises(ValidationError):
        Quantity.model_validate({"value": invalid, "unit": "V"})


@pytest.mark.parametrize("minimum,maximum", [(quantity(2, "V"), quantity(1, "V")), (quantity(1, "V"), quantity(2, "A"))])
def test_invalid_intervals(minimum, maximum):
    with pytest.raises(ValidationError):
        Interval.model_validate({"minimum": minimum, "maximum": maximum})


@pytest.mark.parametrize("fault", ["dimension", "negative", "foreign", "duplicate", "missing_state", "extra_state", "duplicate_state", "zero_pf", "high_pf", "bad_factor", "source", "blank_reason", "extra"])
def test_invalid_power_or_source_contract(fault):
    raw = power()
    if fault == "dimension": raw["capacity"] = q(50, "V")
    elif fault == "negative": raw["loads"][0]["operating"]["demand"] = q(-1, "VA")
    elif fault == "foreign": raw["loads"][0]["equipment_id"] = "foreign"
    elif fault == "duplicate": raw["loads"][1]["load_id"] = "load-0"
    elif fault == "missing_state": raw["scenarios"][0]["states"].pop()
    elif fault == "extra_state": raw["scenarios"][0]["states"][0]["load_id"] = "foreign"
    elif fault == "duplicate_state": raw["scenarios"][0]["states"][1]["load_id"] = "load-0"
    elif fault == "zero_pf": raw["loads"][0]["operating"]["power_factor"] = q(0, "ratio")
    elif fault == "high_pf": raw["loads"][0]["operating"]["power_factor"] = q("1.01", "ratio")
    elif fault == "bad_factor": raw["usable_fraction"] = q(80, "ratio")
    elif fault == "source": raw["capacity"]["basis"]["origin"] = "drawing_transcription"
    elif fault == "blank_reason": raw["capacity"]["basis"]["reason"] = " \n "
    elif fault == "extra": raw["capacity"]["hidden_default"] = 50
    with pytest.raises(ValidationError):
        EngineeringInput.model_validate({"checks": [raw]})


def test_empty_selection_and_unknown_not_project_complete():
    result = check_engineering(EngineeringInput(checks=[]))
    assert result.status == "not_evaluable" and not result.project_complete and not result.checks


def test_duplicate_ids_and_invalid_typed_copy_rejected_before_calculation():
    with pytest.raises(ValidationError):
        EngineeringInput.model_validate({"checks": [signal(), signal()]})
    request = EngineeringInput.model_validate({"checks": [signal()]})
    forged = request.model_copy(update={"rule_version": "future"})
    with pytest.raises(ValidationError):
        check_engineering(forged)


def test_real_note_supports_signal_only_missing_counterpart_is_unknown():
    # This independent key was full-page reviewed before engineering code.
    key = json.loads((Path(__file__).parents[2] / "web/test/fixtures/bas-compatibility-source-cases.json").read_text())
    rating = key["explicit_signal_requirement"]
    raw = analog()
    raw["accepted_range"] = interval(rating["minimum"], rating["maximum"], rating["unit"])
    raw["accepted_range"]["basis"] = {"origin": "drawing_transcription", "original_text": key["note_text"],
        "source_span_ids": [f'{key["source_sha256"]}:p{key["page"]}:span{key["note_span_index"]}'],
        "reason": "User-transcribed signal requirement from the independently reviewed note; no power or quantity inferred"}
    raw["accepted_waveform"] = known(rating["waveform"])
    raw["accepted_waveform"]["basis"] = copy.deepcopy(raw["accepted_range"]["basis"])
    raw["output_range"] = None
    raw["output_waveform"] = None
    raw["excitation"] = None
    raw["accepted_excitation"] = None
    result = run(raw)
    assert result.status == "not_evaluable"
    assert result.original.checks[0].accepted_range.basis.original_text == key["note_text"]
    assert "power" not in result.model_dump() and "installed_quantity" not in result.model_dump()
    raw["output_range"] = interval(0, 12, "V")  # explicit controlled counterpart, not extracted
    assert row(run(raw), "analog.range").status == "fail"


def test_allocation_requires_physical_identity_mode_direction_pool_and_scope():
    assert run(allocation()).status == "pass"
    for field, bad in [("physical_kind", "software_variable"), ("required_mode", "current"),
                       ("required_direction", "output"), ("required_pool_id", "panel-B"), ("channel_id", "missing")]:
        raw = allocation()
        raw["endpoints"][0][field] = known(bad)
        assert run(raw).status == "fail", field
        raw["endpoints"][0][field] = None
        assert run(raw).status == "not_evaluable", field
    raw = allocation()
    raw["endpoints"][0]["endpoint"]["scope_id"] = "building-B"
    assert run(raw).status == "fail"
    raw["channels"][0]["allowed_scope_ids"] = None
    assert run(raw).status == "not_evaluable"


def test_universal_mode_alias_is_not_a_second_physical_terminal():
    raw = allocation()
    alias = copy.deepcopy(raw["channels"][0])
    alias["channel_id"] = "UI-1-DI-alias"
    alias["configured_mode"] = known("dry_contact")
    raw["channels"].append(alias)
    endpoint = copy.deepcopy(raw["endpoints"][0])
    endpoint["endpoint"]["endpoint_id"] = "second-sensor"
    endpoint["channel_id"] = known("UI-1-DI-alias")
    endpoint["required_mode"] = known("dry_contact")
    raw["endpoints"].append(endpoint)
    result = run(raw)
    conflicts = [r for r in result.checks[0].constraints if r.rule_id.endswith("exclusive_terminal")]
    assert len(conflicts) == 2 and all(r.status == "fail" for r in conflicts)
    raw["channels"][1]["physical_terminal_id"] = "terminal-2"
    assert run(raw).status == "pass"


def test_terminal_and_endpoint_exclusivity_also_cross_check_rows():
    first = allocation()
    second = copy.deepcopy(first)
    second["check_id"] = "second-check"
    second["channels"][0]["channel_id"] = "alias"
    second["endpoints"][0]["channel_id"] = known("alias")
    result = check_engineering(EngineeringInput.model_validate({"checks": [first, second]}))
    assert all(r.status == "fail" for r in result.checks)
    assert all(any(c.rule_id.startswith("allocation.cross_check_terminal") for c in r.constraints) for r in result.checks)
    second["channels"][0]["physical_terminal_id"] = "terminal-2"
    result = check_engineering(EngineeringInput.model_validate({"checks": [first, second]}))
    assert all(any(c.rule_id.startswith("allocation.cross_check_endpoint") for c in r.constraints) for r in result.checks)
    second["endpoints"][0]["endpoint"]["endpoint_id"] = "sensor-2"
    assert check_engineering(EngineeringInput.model_validate({"checks": [first, second]})).status == "pass"


def run_expansion(raw=None, power_raw=None):
    raw = expansion() if raw is None else raw
    power_raw = power() if power_raw is None else power_raw
    power_raw["check_id"] = "power-check"
    request = EngineeringInput.model_validate({"checks": [raw, power_raw]})
    result = check_engineering(request)
    assert result.original.model_dump() == request.model_dump()
    # Dependency order is independent of caller-selected ordering.
    reverse = check_engineering(EngineeringInput.model_validate({"checks": [power_raw, raw]}))
    assert result.checks[0].model_dump() == reverse.checks[1].model_dump()
    return result


@pytest.mark.parametrize("field,bad", [("maximum_modules", known(1)), ("maximum_channels", known(7)),
    ("accepted_interfaces", known(["other-bus"]))])
def test_expansion_hard_limits_and_omissions(field, bad):
    assert run_expansion().status == "pass"
    raw = expansion()
    raw[field] = bad
    assert run_expansion(raw).checks[0].status == "fail"
    raw[field] = None
    assert run_expansion(raw).checks[0].status == "not_evaluable"


@pytest.mark.parametrize("field,bad", [("device_kind", known("standalone_controller")),
    ("compatible_base_ids", known(["other-base"])), ("interface_id", known("BACnet")), ("channel_count", known(5))])
def test_expansion_module_characteristics_and_unknowns(field, bad):
    raw = expansion()
    raw["modules"][0][field] = bad
    assert run_expansion(raw).checks[0].status == "fail"
    raw["modules"][0][field] = None
    assert run_expansion(raw).checks[0].status == "not_evaluable"


def test_expansion_known_channel_overrun_survives_another_missing_count():
    raw = expansion()
    raw["modules"][0]["channel_count"] = known(9)
    raw["modules"][1]["channel_count"] = None
    result = row(run_expansion(raw), "expansion.channel_count")
    assert result.status == "fail" and result.missing_inputs == ["modules.1.channel_count"]


def test_expansion_uses_shared_power_result_not_independent_bus_math():
    p = power()
    p["capacity"] = q(49, "VA")
    assert row(run_expansion(power_raw=p), "expansion.power").status == "fail"
    p["capacity"] = None
    assert row(run_expansion(power_raw=p), "expansion.power").status == "not_evaluable"
    raw = expansion()
    raw["power_check_id"] = None
    assert run(raw).status == "not_evaluable"


@pytest.mark.parametrize("fault", ["foreign_check", "wrong_kind", "wrong_base", "wrong_pool", "missing_module", "wrong_owner", "duplicate_supply", "duplicate_endpoint_identity", "coerced_count"])
def test_cross_check_identity_and_dependency_contracts(fault):
    e, p = expansion(), power()
    p["check_id"] = "power-check"
    checks = [e, p]
    if fault == "foreign_check": e["power_check_id"] = "missing"
    elif fault == "wrong_kind": checks[1] = {**signal(), "check_id": "power-check"}
    elif fault == "wrong_base": p["supply_id"] = "other-base"
    elif fault == "wrong_pool": p["pool_id"] = "other-pool"
    elif fault == "missing_module": e["modules"][0]["module_id"] = "unpowered-module"
    elif fault == "wrong_owner": p["loads"][0]["equipment_id"] = "controller"
    elif fault == "duplicate_supply": checks.append({**copy.deepcopy(p), "check_id": "split-loads"})
    elif fault == "duplicate_endpoint_identity":
        checks = [signal(), analog()]
        checks[1]["check_id"] = "range"
        checks[1]["source"]["scope_id"] = "other-building"
    elif fault == "coerced_count": e["maximum_channels"] = known("8")
    with pytest.raises(ValidationError):
        EngineeringInput.model_validate({"checks": checks})


@pytest.mark.parametrize("make", [signal, analog, loading, contact, pulse, power, mechanical, allocation])
def test_actual_bounded_python_process_matches_typed_calculation(make):
    raw = {"checks": [make()]}
    result = subprocess.run([sys.executable, "-m", "bas_engine"], input=json.dumps({"engineering": raw}),
                            text=True, capture_output=True, timeout=10, check=False)
    assert result.returncode == 0 and not result.stderr
    assert json.loads(result.stdout) == check_engineering(EngineeringInput.model_validate(raw)).model_dump()


def test_actual_process_expansion_and_power_dependencies():
    e, p = expansion(), power()
    p["check_id"] = "power-check"
    raw = {"checks": [e, p]}
    result = subprocess.run([sys.executable, "-m", "bas_engine"], input=json.dumps({"engineering": raw}),
                            text=True, capture_output=True, timeout=10, check=False)
    assert result.returncode == 0 and not result.stderr
    assert json.loads(result.stdout) == check_engineering(EngineeringInput.model_validate(raw)).model_dump()


@pytest.mark.parametrize("fault", ["dual_envelope", "bad_quantity", "oversized"])
def test_actual_process_rejects_invalid_input_without_echoing_source(fault):
    payload = {"engineering": {"checks": [analog()]}}
    if fault == "dual_envelope": payload["request"] = {"point_list": []}
    elif fault == "bad_quantity": payload["engineering"]["checks"][0]["output_range"]["value"]["minimum"]["value"] = "PRIVATE-SOURCE-NOT-TO-BE-ECHOED"
    serialized = json.dumps(payload) if fault != "oversized" else "x" * (32 * 1024 * 1024 + 1)
    result = subprocess.run([sys.executable, "-m", "bas_engine"], input=serialized,
                            text=True, capture_output=True, timeout=10, check=False)
    assert result.returncode == 2 and not result.stderr
    assert json.loads(result.stdout)["error"]["code"] == "BAS_VALIDATION_ERROR"
    assert "PRIVATE-SOURCE" not in result.stdout


def test_exact_complexity_guard_rejects_without_rounding_or_truncation():
    safe = Fraction(2**8191 - 1, 2**8190)
    assert bounded_exact(safe) == safe
    assert Fraction(rational_text(safe)) == safe
    for oversized in (Fraction(2**8192), Fraction(1, 2**8192)):
        with pytest.raises(ValueError, match="exact rational complexity"):
            bounded_exact(oversized)
    with pytest.raises(ValueError, match="exact rational complexity"):
        exact_sum([safe, safe, safe])


def test_realistic_dense_parallel_input_and_explicit_complexity_refusal():
    # Twenty-digit, unlike declared resistances can produce huge coprime
    # denominators. Exercise the real input path, not just the guard helper.
    raw = loading("parallel", (1000,) * 1000, (0, 10000))
    assert run(raw).status == "pass"
    for i, part in enumerate(raw["parts"]):
        part["resistance"] = q(10**19 + 7 + 2 * i, "ohm")
    with pytest.raises(ValueError, match="exact rational complexity"):
        check_engineering(EngineeringInput.model_validate({"checks": [raw]}))


def test_each_check_passing_separately_cannot_hide_conflicting_endpoint_modes():
    s, a = signal(), analog()
    s["check_id"], a["check_id"] = "signal", "range"
    s["source_mode"] = known("current")
    s["sink_modes"] = known(["current"])
    assert run(s).status == run(a).status == "pass"
    result = check_engineering(EngineeringInput.model_validate({"checks": [s, a]}))
    assert all(r.status == "fail" for r in result.checks)
    assert all(any(c.rule_id.startswith("signal.cross_check_mode") for c in r.constraints) for r in result.checks)


def test_reversing_endpoint_roles_cannot_pass_conflicting_direction_claims():
    first, second = signal(), signal()
    second["check_id"] = "reverse"
    second["source"], second["sink"] = second["sink"], second["source"]
    assert run(first).status == run(second).status == "pass"
    result = check_engineering(EngineeringInput.model_validate({"checks": [first, second]}))
    assert all(r.status == "fail" for r in result.checks)
    assert all(any(c.rule_id.startswith("signal.cross_check_direction") for c in r.constraints) for r in result.checks)
