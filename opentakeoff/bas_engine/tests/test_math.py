from itertools import product

import pytest
from pydantic import ValidationError

from bas_engine import EngineRequest, calculate
from bas_engine.hardware import minimum_blocks, reserve
from bas_engine.models import (
    EquipmentGroup, HardwareProfile, IOVector, IpCloset, IpEndpoint, LicensePolicy,
    PointRequirement, SerialNode, SerialRoute, SoftVariable, SparePolicy,
)
from bas_engine.network import ip_switches, serial_partition


def point(name="temperature", group="AHU", **values):
    return PointRequirement(group_id=group, point_id=name, physical=IOVector(**values))


def request(**kwargs):
    return EngineRequest(groups=[EquipmentGroup(group_id="AHU")], **kwargs)


@pytest.mark.parametrize("invalid", [-1, 0.1, True, "2", None, float("nan"), float("inf")])
def test_invalid_counts_are_not_coerced(invalid):
    with pytest.raises(ValidationError):
        IOVector(AI=invalid)


def test_unknown_fields_and_sources_and_ids():
    with pytest.raises(ValidationError):
        IOVector(BO=2)
    with pytest.raises(ValidationError):
        EngineRequest()
    with pytest.raises(ValidationError):
        EngineRequest(point_list=[point(AI=1)])
    with pytest.raises(ValidationError):
        request(point_list=[point(AI=1), point(AI=1)])
    with pytest.raises(ValidationError):
        request(point_list=[], spare=SparePolicy(basis="installed_unused", numerator=100))


def test_zero_and_missing_differ():
    result = calculate(EngineRequest(point_list=[]))
    assert result.physical_total == IOVector()
    assert result.hardware == []
    assert result.status == "no_evidence"
    assert result.source_coverage == "point_list_only"
    result = calculate(request(soo=[], point_list=[point(AI=1)]))
    assert "SOURCE_POINT_MISSING" in {d.code for d in result.diagnostics}
    assert result.status == "review_required"


@pytest.mark.parametrize("source", ["soo", "point_list"])
def test_asymmetric_input_and_preserved_payload(source):
    payload = request(**{source: [point(AI=4, DO=2)]})
    original = payload.model_dump()
    result = calculate(payload)
    assert result.physical_total.values() == (4, 0, 0, 2)
    assert result.source_coverage == source+"_only"
    assert payload.model_dump() == original
    assert not result.project_complete


def test_identity_union_before_max_and_contradictions():
    result = calculate(request(
        soo=[point("supply", AI=2), point("shared", DI=2)],
        point_list=[point("return", AI=1), point("shared", AO=1, DI=1)],
    ))
    assert result.physical_total.values() == (3, 1, 2, 0)
    assert {p.point_id for p in result.points} == {"supply", "return", "shared"}
    assert {d.code for d in result.diagnostics} >= {
        "SOURCE_POINT_MISSING", "PHYSICAL_TYPE_CONTRADICTION", "PHYSICAL_QUANTITY_DISAGREEMENT",
    }


def test_envelope_lattice_properties_exhaustive():
    vectors = [IOVector(AI=a, DI=d) for a, d in product(range(4), repeat=2)]
    for a, b in product(vectors, repeat=2):
        assert a.envelope(b) == b.envelope(a)
        assert a.envelope(a) == a
        assert all(r >= x and r >= y for r, x, y in zip(a.envelope(b).values(), a.values(), b.values()))
        c = IOVector(AI=2, AO=1, DI=3)
        assert a.envelope(b).envelope(c) == a.envelope(b.envelope(c))


@pytest.mark.parametrize("basis,expected", [("demand_addon", 46), ("installed_unused", 48)])
def test_spare_denominator(basis, expected):
    policy = SparePolicy(basis=basis, numerator=15)
    assert reserve(IOVector(AI=40), policy).AI == expected
    assert reserve(IOVector(), policy) == IOVector()


def test_spare_exact_boundary_large_and_minimum():
    assert reserve(IOVector(AI=10**15), SparePolicy(numerator=1, denominator=3)).AI == 1_333_333_333_333_334
    assert reserve(IOVector(), SparePolicy(minimum=IOVector(AO=2))).AO == 2


def test_hardware_exhaustive_assignment_oracle():
    # Independent oracle enumerates integer UI allocations, not our inequality.
    for a, d, u in product(range(3), repeat=3):
        profile = HardwareProfile(profile_id="abstract", rigid=IOVector(AI=a, AO=1, DI=d, DO=1), universal_inputs=u)
        for A, D in product(range(7), repeat=2):
            demand = IOVector(AI=A, DI=D)
            expected = next((n for n in range(13) if any(
                A <= n*a + ua and D <= n*d + ud
                for ua in range(n*u+1) for ud in range(n*u-ua+1))), None)
            assert minimum_blocks(demand, profile) == expected


def test_universal_no_double_count_outputs_and_maximum():
    profile = HardwareProfile(profile_id="abstract", rigid=IOVector(AI=2, AO=2, DI=2, DO=1), universal_inputs=4)
    result = calculate(request(point_list=[point(AI=6, AO=2, DI=5, DO=1)], hardware=profile))
    hardware = result.hardware[0]
    assert hardware.blocks_per_pool == 2
    assert hardware.assigned_universal_AI == 2
    assert hardware.assigned_universal_DI == 1
    assert hardware.unassigned_universal == 5
    assert minimum_blocks(IOVector(DO=1), HardwareProfile(profile_id="ui", rigid=IOVector(), universal_inputs=100)) is None
    limited = profile.model_copy(update={"max_blocks_per_pool": 1})
    assert minimum_blocks(IOVector(AI=100), limited) is None


def test_group_rounding_and_large_replication():
    profile = HardwareProfile(profile_id="abstract", rigid=IOVector(AI=8))
    for allocation, expected in [("independent", 4), ("shared_pool", 3)]:
        result = calculate(EngineRequest(groups=[EquipmentGroup(group_id="AHU", quantity=2, allocation=allocation)],
                                         point_list=[point(AI=7)], hardware=profile, spare=SparePolicy(numerator=15)))
        assert result.hardware[0].blocks_total == expected
    result = calculate(EngineRequest(groups=[EquipmentGroup(group_id="AHU", quantity=10**12)],
                                     soo=[point(AI=7)], hardware=profile, spare=SparePolicy(numerator=15)))
    assert result.hardware[0].blocks_total == 2*10**12
    assert result.physical_total.AI == 7*10**12
    assert len(result.points) == 1


def test_zero_equipment_does_not_install_spare_hardware():
    result = calculate(EngineRequest(groups=[EquipmentGroup(group_id="AHU", quantity=0)],
                                     point_list=[point(AI=5)], spare=SparePolicy(minimum=IOVector(AI=1)),
                                     hardware=HardwareProfile(profile_id="test", rigid=IOVector(AI=1))))
    assert result.physical_total.AI == 0
    assert result.hardware[0].blocks_total == 0


def test_network_software_does_not_consume_copper():
    soft = [SoftVariable(protocol="bacnet", variable_id="device1:AI:1", quantity=35),
            SoftVariable(protocol="modbus", variable_id="device2:40001:float32", quantity=1),
            SoftVariable(protocol="knx", variable_id="1/2/3", quantity=1)]
    result = calculate(request(point_list=[PointRequirement(group_id="AHU", point_id="network", soft=soft)],
                               licenses=[LicensePolicy(pool="default", mode="packs", base=10, pack_size=10)]))
    assert result.physical_total == IOVector()
    assert result.licenses[0].weighted_points == 37
    assert result.licenses[0].packs == 3
    assert result.licenses[0].entitlement == 40
    assert result.licenses[0].headroom == 3


def test_license_identity_scope_and_tiers():
    soft = SoftVariable(protocol="modbus", variable_id="outdoor", scope="project")
    result = calculate(EngineRequest(
        groups=[EquipmentGroup(group_id="AHU", quantity=100)],
        soo=[PointRequirement(group_id="AHU", point_id="shared", soft=[soft]),
             PointRequirement(group_id="AHU", point_id="alias", soft=[soft])],
        licenses=[LicensePolicy(pool="default", mode="tiers", tiers=[1, 100])],
    ))
    assert result.licenses[0].variables == result.licenses[0].entitlement == 1
    soft.scope = "equipment_group"
    result = calculate(EngineRequest(groups=[EquipmentGroup(group_id="AHU", quantity=101)],
                                     soo=[PointRequirement(group_id="AHU", point_id="shared", soft=[soft])],
                                     licenses=[LicensePolicy(pool="default", mode="tiers", tiers=[1, 100])]))
    assert result.licenses[0].status == "infeasible"
    assert result.licenses[0].entitlement is None


def route(loads, positions=None, **opts):
    return SerialRoute(route_id="trunk", protocol="bacnet_mstp", max_devices=4,
                       max_load_microunits=5, max_length_mm=100,
                       reserved_load_microunits=1,
                       nodes=[SerialNode(node_id=str(i), load_microunits=w,
                                         position_mm=positions[i] if positions is not None else None)
                              for i, w in enumerate(loads)], **opts)


def test_ordered_partition_against_exhaustive_boundaries():
    for loads in product([1, 2, 3], repeat=5):
        positions = [0, 20, 110, 120, 190]
        r = route(loads, positions)
        possible = []
        for cuts in product([False, True], repeat=4):
            ends = [i+1 for i, cut in enumerate(cuts) if cut] + [5]
            start, valid = 0, True
            for end in ends:
                valid &= end-start+1 <= 4 and sum(loads[start:end])+1 <= 5 and positions[end-1]-positions[start] <= 100
                start = end
            if valid:
                possible.append(len(ends))
        result, _ = serial_partition(r)
        assert len(result.segments) == min(possible)
        assert [n for segment in result.segments for n in segment.node_ids] == list(map(str, range(5)))


def test_serial_address_load_length_and_missing_limits():
    result, _ = serial_partition(route([1, 1, 1], [0, 100, 101], max_managers=2))
    assert len(result.segments) == 3  # one manager plus reserved router per trunk
    result, issues = serial_partition(route([5]))
    assert result.status == "infeasible" and result.unassigned_node_ids == ["0"]
    assert "SERIAL_NODE_INFEASIBLE" in {d.code for d in issues}
    result, _ = serial_partition(route([1, 1]))
    assert result.status == "capacity_only"
    assert result.segments[0].length_mm is None
    with pytest.raises(ValidationError):
        route([1], [0], max_managers=129)
    with pytest.raises(ValidationError):
        route([1, 1], [20, 10])
    with pytest.raises(ValidationError):
        route([1, 1], [0, None])


def test_ip_ports_reach_and_no_dividing_total_lengths():
    closet = IpCloset(closet_id="A", ports=4, reserved_ports_per_switch=1, max_link_length_mm=100_000,
                      endpoints=[IpEndpoint(node_id=str(i), link_length_mm=length)
                                 for i, length in enumerate([100_000, 100_001, 10, None])])
    result, issues = ip_switches(closet)
    assert result.switches == 2 and result.spare_ports == 2
    assert result.status == "infeasible"
    assert result.overlength_node_ids == ["1"] and result.unknown_length_node_ids == ["3"]
    assert {d.code for d in issues} == {"IP_LINK_OVERLENGTH", "IP_DISTANCE_UNKNOWN"}


def test_json_roundtrip_and_nested_mutation_cannot_bypass_validation():
    req = request(point_list=[point(AI=4)])
    assert EngineRequest.model_validate_json(req.model_dump_json()) == req
    req.point_list.append(point(AI=4))
    with pytest.raises(ValidationError):
        calculate(req)


def test_zero_equipment_never_adds_project_license_variables():
    from bas_engine.models import SoftVariable
    request = EngineRequest(groups=[EquipmentGroup(group_id="g", quantity=0)],
                            point_list=[PointRequirement(group_id="g", point_id="p", soft=[
                                SoftVariable(protocol="bacnet", variable_id="v", scope="project")])])
    result = calculate(request)
    assert result.licenses == []
    assert result.physical_total == IOVector()
