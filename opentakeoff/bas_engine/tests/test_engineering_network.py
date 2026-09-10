"""Declared-network checks; controlled scenarios, not inferred installed routes."""
import copy
import itertools
import json
import subprocess
import sys

import pytest
from pydantic import ValidationError

from bas_engine.engineering import check_engineering
from bas_engine.engineering_contracts import EngineeringInput
from bas_engine.engineering_network import canonical_ip
from bas_engine.models import IpCloset, IpEndpoint, SerialNode, SerialRoute
from bas_engine.network import ip_switches, serial_partition


def known(value):
    return {"value": value, "basis": {"origin": "explicit_input", "source_span_ids": [],
        "original_text": None, "reason": "Controlled network test, not an extracted rating or route"}}


def endpoint(i):
    return {"endpoint_id": f"port-{i}", "equipment_id": f"equipment-{i}", "scope_id": "building-A"}


def serial(protocol="bacnet_mstp"):
    return {"check_id": "serial-check", "kind": "serial_network", "equipment_ids": ["equipment-0", "equipment-1"],
        "reason": "Controlled declared single segment", "segment_id": "segment-A", "protocol": known(protocol),
        "media": known("RS485-2wire"), "baud_rate": known(38400), "frame_format": known("8N1" if protocol == "bacnet_mstp" else "8E1"),
        "allowed_scope_ids": known(["building-A"]), "max_devices": known(3), "max_managers": known(3),
        "max_load_microunits": known(3_000_000), "max_length_mm": known(10000), "reserved_devices": known(1),
        "reserved_managers": known(1), "reserved_load_microunits": known(1_000_000),
        "reserved_addresses": known([0] if protocol == "bacnet_mstp" else []), "lead_length_mm": known(1000),
        "nodes": [{"endpoint": endpoint(i), "physical_kind": known("physical_port"), "protocol": known(protocol),
            "media": known("RS485-2wire"), "baud_rate": known(38400), "frame_format": known("8N1" if protocol == "bacnet_mstp" else "8E1"),
            "role": known("manager" if protocol == "bacnet_mstp" else "server"), "address": known(i + 1),
            "load_microunits": known(1_000_000), "position_mm": known(i * 9000)} for i in range(2)]}


def ip():
    return {"check_id": "ip-check", "kind": "ip_network", "equipment_ids": ["equipment-0", "equipment-1"],
        "reason": "Controlled fixed-closet ports and links", "closet_id": "closet-A", "address_domain_id": "network-A",
        "protocol": known("bacnet-ipv4"), "media": known("100BASE-TX"), "allowed_scope_ids": known(["building-A"]),
        "ports_per_switch": known(3), "reserved_ports_per_switch": known(1), "available_switches": known(1),
        "max_link_length_mm": known(100000), "nodes": [{"endpoint": endpoint(i), "physical_kind": known("physical_port"),
            "protocol": known("bacnet-ipv4"), "media": known("100BASE-TX"), "address": known(f"192.0.2.{i+1}"),
            "link_length_mm": known(100000)} for i in range(2)]}


def run(raw):
    request = EngineeringInput.model_validate({"checks": [raw]})
    before = request.model_dump()
    result = check_engineering(request)
    assert result.original.model_dump() == before == request.model_dump()
    assert not result.project_complete
    for constraint in result.checks[0].constraints:
        for path in constraint.input_paths:
            cursor = before["checks"][0]
            for part in path.split("."):
                cursor = cursor[int(part)] if isinstance(cursor, list) else cursor[part]
        assert set(constraint.missing_inputs) <= set(constraint.input_paths)
    assert result.model_dump() == check_engineering(EngineeringInput.model_validate_json(request.model_dump_json())).model_dump()
    return result


def outcome(result, rule):
    return next(c for c in result.checks[0].constraints if c.rule_id == rule)


@pytest.mark.parametrize("make,rule", [(serial, "serial.device_capacity"), (ip, "ip.switch_capacity")])
def test_unknown_port_kind_is_not_counted_as_known_physical_demand(make, rule):
    raw = make()
    raw["nodes"][0]["physical_kind"] = None
    if raw["kind"] == "serial_network":
        raw["max_devices"] = known(2)  # one known node plus one reservation
    else:
        raw["ports_per_switch"] = known(2)  # one usable port
    capacity = outcome(run(raw), rule)
    assert capacity.status == "not_evaluable"
    assert "nodes.0.physical_kind" in capacity.missing_inputs
    if raw["kind"] == "serial_network":
        assert capacity.normalized["known_demand"] == "2"
    else:
        assert capacity.normalized["known_physical_ports"] == "1"
    raw["nodes"][0]["physical_kind"] = known("physical_port")
    assert outcome(run(raw), rule).status == "fail"


def test_serial_software_variable_cannot_receive_a_passing_device_capacity():
    raw = serial()
    raw["nodes"][0]["physical_kind"] = known("software_variable")
    capacity = outcome(run(raw), "serial.device_capacity")
    assert capacity.status == "fail"
    assert capacity.normalized["known_demand"] == "2"


@pytest.mark.parametrize("make", [serial, lambda: serial("modbus_rtu"), ip])
def test_known_declared_network_is_evaluable_and_process_identical(make):
    raw = make()
    result = run(raw)
    assert result.status == "pass"
    process = subprocess.run([sys.executable, "-m", "bas_engine"], input=json.dumps({"engineering": {"checks": [raw]}}),
                             text=True, capture_output=True, timeout=10, check=False)
    assert process.returncode == 0 and not process.stderr
    assert json.loads(process.stdout) == result.model_dump()


@pytest.mark.parametrize("make", [serial, ip])
def test_each_missing_declared_policy_or_node_characteristic_remains_unknown(make):
    original = make()
    for field, value in original.items():
        if isinstance(value, dict) and "basis" in value:
            raw = copy.deepcopy(original)
            raw[field] = None
            result = run(raw)
            assert result.status == "not_evaluable", field
            assert any(field in c.missing_inputs for c in result.checks[0].constraints), field
    for field, value in original["nodes"][0].items():
        if isinstance(value, dict) and "basis" in value:
            raw = copy.deepcopy(original)
            raw["nodes"][0][field] = None
            result = run(raw)
            assert result.status == "not_evaluable", field
            assert any(f"nodes.0.{field}" in c.missing_inputs for c in result.checks[0].constraints), field


@pytest.mark.parametrize("field,value,rule", [("max_devices", 2, "serial.device_capacity"),
    ("max_managers", 2, "serial.manager_capacity"), ("max_load_microunits", 2999999, "serial.unit_load_capacity"),
    ("max_length_mm", 9999, "serial.segment_length")])
def test_serial_exact_one_increment_capacity_boundaries(field, value, rule):
    raw = serial()
    assert run(raw).status == "pass"
    raw[field] = known(value)
    result = run(raw)
    assert result.status == outcome(result, rule).status == "fail"
    assert outcome(result, "serial.partition").status == "fail"


@pytest.mark.parametrize("field,value", [("protocol", "modbus_rtu"), ("media", "RS232"),
    ("baud_rate", 9600), ("frame_format", "8O1"), ("role", "server"), ("physical_kind", "software_variable")])
def test_serial_mismatch_remains_failed_with_other_missing_inputs(field, value):
    raw = serial()
    raw["nodes"][0][field] = known(value)
    raw["nodes"][1]["address"] = None
    result = run(raw)
    assert result.status == "fail"
    if field == "physical_kind":
        assert result.checks[0].network_calculation.serial is None


@pytest.mark.parametrize("protocol,role,address,status", [("bacnet_mstp", "manager", 127, "pass"),
    ("bacnet_mstp", "manager", 128, "fail"), ("bacnet_mstp", "subordinate", 128, "pass"),
    ("bacnet_mstp", "subordinate", 254, "pass"), ("bacnet_mstp", "subordinate", 255, "fail"),
    ("modbus_rtu", "server", 0, "fail"), ("modbus_rtu", "server", 1, "pass"),
    ("modbus_rtu", "server", 247, "pass"), ("modbus_rtu", "server", 248, "fail")])
def test_primary_source_address_role_boundaries(protocol, role, address, status):
    raw = serial(protocol)
    raw["nodes"][0]["role"] = known(role)
    raw["nodes"][0]["address"] = known(address)
    assert outcome(run(raw), "serial.port-0.address_range").status == status


def test_serial_reserved_and_unknown_addresses_do_not_hide_known_duplicates():
    raw = serial()
    raw["nodes"][0]["address"] = known(0)
    raw["nodes"][1]["address"] = None
    result = outcome(run(raw), "serial.addresses_unique")
    assert result.status == "fail" and result.missing_inputs == ["nodes.1.address"]
    raw["nodes"][1]["address"] = known(1)
    raw["nodes"][0]["address"] = known(1)
    raw["reserved_addresses"] = None
    assert outcome(run(raw), "serial.addresses_unique").status == "fail"


def test_partial_serial_route_retained_but_solver_is_capacity_only():
    raw = serial()
    raw["nodes"][0]["position_mm"] = None
    result = run(raw)
    assert result.status == "not_evaluable"
    network = result.checks[0].network_calculation.serial
    assert network.status == "capacity_only" and network.segments[0].length_mm is None
    assert result.original.checks[0].nodes[1].position_mm.value == 9000
    assert outcome(result, "serial.segment_length").missing_inputs == ["nodes.0.position_mm"]


def test_partial_serial_positions_still_expose_known_overlength_and_order_failure():
    raw = serial()
    extra = copy.deepcopy(raw["nodes"][1])
    extra["endpoint"] = {"endpoint_id": "port-2", "equipment_id": "equipment-1", "scope_id": "building-A"}
    extra["address"] = known(3)
    extra["position_mm"] = known(11000)
    raw["nodes"].append(extra)
    raw["nodes"][1]["position_mm"] = None
    result = run(raw)
    length = outcome(result, "serial.segment_length")
    assert length.status == "fail" and "nodes.1.position_mm" in length.missing_inputs
    raw["nodes"][0]["position_mm"] = known(12000)
    result = run(raw)
    assert outcome(result, "serial.route_order").status == "fail"
    assert result.checks[0].network_calculation.serial is None


def test_unknown_serial_load_or_reservation_does_not_erase_known_overload():
    raw = serial()
    raw["nodes"][0]["load_microunits"] = known(3000001)
    raw["nodes"][1]["load_microunits"] = None
    raw["reserved_load_microunits"] = None
    result = run(raw)
    load = outcome(result, "serial.unit_load_capacity")
    assert load.status == "fail" and len(load.missing_inputs) == 2
    assert result.checks[0].network_calculation.serial is None


def test_network_solver_outputs_equal_existing_implementations():
    route = SerialRoute(route_id="segment-A", protocol="bacnet_mstp", max_devices=3, max_managers=3,
        max_load_microunits=3000000, max_length_mm=10000, reserved_devices=1, reserved_managers=1,
        reserved_load_microunits=1000000, lead_length_mm=1000,
        nodes=[SerialNode(node_id=f"port-{i}", manager=True, load_microunits=1000000, position_mm=i*9000) for i in range(2)])
    expected_serial, expected_diagnostics = serial_partition(route)
    result = run(serial()).checks[0].network_calculation
    assert result.serial == expected_serial and result.diagnostics == expected_diagnostics
    closet = IpCloset(closet_id="closet-A", ports=3, reserved_ports_per_switch=1, max_link_length_mm=100000,
                     endpoints=[IpEndpoint(node_id=f"port-{i}", link_length_mm=100000) for i in range(2)])
    expected_ip, expected_diagnostics = ip_switches(closet)
    result = run(ip()).checks[0].network_calculation
    assert result.ip == expected_ip and result.diagnostics == expected_diagnostics


def test_known_ip_reach_failure_survives_missing_switch_and_other_link():
    raw = ip()
    raw["nodes"][0]["link_length_mm"] = known(100001)
    raw["nodes"][1]["link_length_mm"] = None
    raw["ports_per_switch"] = None
    result = run(raw)
    assert result.status == outcome(result, "ip.port-0.reach").status == "fail"
    assert result.checks[0].network_calculation.ip is None
    raw["ports_per_switch"] = known(3)
    raw["available_switches"] = known(1000)
    assert run(raw).status == "fail"  # more same-closet switches do not repair the cable


@pytest.mark.parametrize("ports,reserved,switches", list(itertools.product(range(1, 5), range(4), range(4))))
def test_ip_port_capacity_against_independent_small_integer_oracle(ports, reserved, switches):
    raw = ip()
    raw["ports_per_switch"] = known(ports)
    raw["reserved_ports_per_switch"] = known(reserved)
    raw["available_switches"] = known(switches)
    expected = ports > reserved and (ports - reserved) * switches >= 2
    assert (outcome(run(raw), "ip.switch_capacity").status == "pass") == expected


@pytest.mark.parametrize("field,value", [("protocol", "modbus-tcp"), ("media", "1000BASE-SX"), ("physical_kind", "software_variable")])
def test_ip_configuration_not_inferred_from_enough_ports(field, value):
    raw = ip()
    raw["nodes"][0][field] = known(value)
    assert run(raw).status == "fail"


@pytest.mark.parametrize("address", ["not-an-ip", "999.1.1.1", "0.0.0.0", "255.255.255.255", "224.0.0.1", "::", "ff02::1", "fe80::1%en0"])
def test_invalid_or_nonnodal_ip_literal_is_not_accepted(address):
    raw = ip()
    raw["nodes"][0]["address"] = known(address)
    assert canonical_ip(address) is None
    assert outcome(run(raw), "ip.port-0.address").status == "fail"


def test_ip_duplicates_are_canonical_and_address_domain_scoped_across_closets():
    first, second = ip(), ip()
    second["check_id"], second["closet_id"] = "other-check", "closet-B"
    for i, node in enumerate(second["nodes"]):
        node["endpoint"]["endpoint_id"] = f"other-port-{i}"
    first["nodes"][0]["address"] = known("2001:db8::1")
    second["nodes"][0]["address"] = known("2001:0db8:0000:0000:0000:0000:0000:0001")
    second["nodes"][1]["address"] = known("192.0.2.3")
    request = EngineeringInput.model_validate({"checks": [first, second]})
    result = check_engineering(request)
    assert all(r.status == "fail" for r in result.checks)
    assert all(any(c.rule_id.startswith("network.cross_check_address") for c in r.constraints) for r in result.checks)
    second["address_domain_id"] = "independent-network"
    assert check_engineering(EngineeringInput.model_validate({"checks": [first, second]})).status == "pass"


def test_physical_port_cannot_be_allocated_to_two_different_network_checks():
    first, second = serial(), ip()
    result = check_engineering(EngineeringInput.model_validate({"checks": [first, second]}))
    assert all(r.status == "fail" for r in result.checks)
    assert all(any(c.rule_id.startswith("network.cross_check_port") for c in r.constraints) for r in result.checks)


@pytest.mark.parametrize("make", [serial, ip])
def test_foreign_scope_and_unknown_scope_are_distinct(make):
    raw = make()
    raw["nodes"][0]["endpoint"]["scope_id"] = "building-B"
    assert run(raw).status == "fail"
    raw["allowed_scope_ids"] = None
    assert run(raw).status == "not_evaluable"


@pytest.mark.parametrize("fault", ["empty", "duplicate_port", "foreign_equipment", "negative", "boolean", "numeric_string", "duplicate_reserved", "split_segment", "split_closet"])
def test_network_input_identity_and_strict_count_contract(fault):
    raw = serial()
    checks = [raw]
    if fault == "empty": raw["nodes"] = []
    elif fault == "duplicate_port": raw["nodes"][1]["endpoint"] = copy.deepcopy(raw["nodes"][0]["endpoint"])
    elif fault == "foreign_equipment": raw["nodes"][0]["endpoint"]["equipment_id"] = "foreign"
    elif fault == "negative": raw["nodes"][0]["load_microunits"] = known(-1)
    elif fault == "boolean": raw["max_devices"] = known(True)
    elif fault == "numeric_string": raw["max_devices"] = known("3")
    elif fault == "duplicate_reserved": raw["reserved_addresses"] = known([0, 0])
    elif fault == "split_segment": checks.append({**copy.deepcopy(raw), "check_id": "partial-row"})
    elif fault == "split_closet": checks = [ip(), {**ip(), "check_id": "partial-row"}]
    with pytest.raises(ValidationError):
        EngineeringInput.model_validate({"checks": checks})


def test_ip_known_port_capacity_does_not_require_an_invented_reach_rating():
    raw = ip()
    raw["max_link_length_mm"] = None
    result = run(raw)
    assert result.status == "not_evaluable"
    assert outcome(result, "ip.switch_capacity").status == "pass"
    assert result.checks[0].network_calculation.ip is None
    raw["available_switches"] = known(0)
    assert outcome(run(raw), "ip.switch_capacity").status == "fail"


def test_dense_unknown_addresses_are_accounted_once_without_quadratic_output():
    raw = ip()
    raw["nodes"] = []
    raw["equipment_ids"] = ["equipment-0"]
    for i in range(1000):
        raw["nodes"].append({"endpoint": {"endpoint_id": f"port-{i}", "equipment_id": "equipment-0", "scope_id": "building-A"},
            "physical_kind": known("physical_port"), "protocol": known("bacnet-ipv4"), "media": known("100BASE-TX"),
            "address": None, "link_length_mm": known(100000)})
    raw["ports_per_switch"] = known(1001)
    result = run(raw)
    unique = outcome(result, "ip.addresses_unique")
    assert unique.status == "not_evaluable" and len(unique.missing_inputs) == 1000
    assert len(result.model_dump_json()) < 4_000_000
    assert result.status == "not_evaluable" and len(result.checks[0].constraints) == 6002
