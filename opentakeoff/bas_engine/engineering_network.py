"""Declared network compatibility around the unchanged serial/IP solvers.

No route synthesis, defaults from example guides, network discovery or socket I/O.
"""
from __future__ import annotations

from ipaddress import ip_address
from typing import TYPE_CHECKING

from .engineering_contracts import IpNetworkCheck, Known, SerialNetworkCheck
from .models import Diagnostic, IpCloset, IpEndpoint, IpResult, SerialNode, SerialResult, SerialRoute
from .network import ip_switches, serial_partition

if TYPE_CHECKING:
    from .engineering import Outcomes


def canonical_ip(value: str) -> str | None:
    # Address domains are explicit; do not hide a second scope inside a literal.
    if "%" in value:
        return None
    try:
        address = ip_address(value)
        if address.is_multicast or address.is_unspecified or str(address) == "255.255.255.255":
            return None
        return str(address)
    except ValueError:
        return None


def count_budget(out: Outcomes, rule: str, parts: list[tuple[str, Known[int] | None]],
                 maximum_path: str, maximum: Known[int] | None, *, fixed_count: int = 0,
                 fixed_path: str | None = None, prerequisite_paths: list[str] | None = None,
                 unknown_prerequisites: list[str] | None = None, invalid_prerequisites: bool = False) -> None:
    paths = [p for p, _ in parts] + [maximum_path] + ([fixed_path] if fixed_path else [])
    missing = [p for p, value in parts if value is None] + ([maximum_path] if maximum is None else [])
    paths += prerequisite_paths or []
    missing += unknown_prerequisites or []
    known = fixed_count + sum(value.value for _, value in parts if value is not None)
    passed = False if invalid_prerequisites else None if maximum is None else False if known > maximum.value else None if missing else True
    out.add(rule, paths, missing, passed,
            "Known resource demand cannot exceed the declared budget; unknown physical identity or contributions prevent a sufficiency claim, and nonphysical consumers are invalid.",
            {"known_demand": str(known)})


def address_uniqueness(out: Outcomes, rule: str, addresses: list[tuple[str, str | None]],
                       reserved: list[str] | None = None, reserved_path: str | None = None) -> None:
    paths = [p for p, _ in addresses]
    missing = [p for p, value in addresses if value is None]
    seen = set(reserved or [])
    duplicates: set[str] = set()
    for _, value in addresses:
        if value is not None:
            if value in seen:
                duplicates.add(value)
            seen.add(value)
    if reserved_path is not None:
        paths.append(reserved_path)
        if reserved is None:
            missing.append(reserved_path)
    out.add(rule, paths, missing, False if duplicates else None if missing else True,
            "Known addresses must be unique within the declared address domain, including reserved endpoints. Missing/invalid addresses do not erase a known collision.",
            {"duplicate_addresses": ", ".join(sorted(duplicates))} if duplicates else {})


def serial_checks(check: SerialNetworkCheck, out: Outcomes) -> tuple[SerialResult | None, list[Diagnostic]]:
    for i, node in enumerate(check.nodes):
        p = f"nodes.{i}"
        rule = f"serial.{node.endpoint.endpoint_id}"
        out.one(f"{rule}.physical", f"{p}.physical_kind", node.physical_kind,
                lambda value: value == "physical_port", "Network nodes must be explicitly declared physical ports, not software variables.")
        out.pair(f"{rule}.protocol", f"{p}.protocol", node.protocol, "protocol", check.protocol,
                 lambda a, b: a == b, "The port must use the declared segment protocol; no translation is inferred.")
        out.pair(f"{rule}.media", f"{p}.media", node.media, "media", check.media,
                 lambda a, b: a == b, "The port and segment must use the same declared electrical interface.")
        out.pair(f"{rule}.baud", f"{p}.baud_rate", node.baud_rate, "baud_rate", check.baud_rate,
                 lambda a, b: a == b, "The configured serial rates must agree.")
        out.pair(f"{rule}.frame", f"{p}.frame_format", node.frame_format, "frame_format", check.frame_format,
                 lambda a, b: a == b, "The configured serial frame formats must agree.")
        out.pair(f"{rule}.role", f"{p}.protocol", node.protocol, f"{p}.role", node.role,
                 lambda protocol, role: role == "server" if protocol == "modbus_rtu" else role in ("manager", "subordinate"),
                 "Modbus servers and MS/TP managers/subordinates have different roles.")
        out.add(f"{rule}.scope", [f"{p}.endpoint.scope_id", "allowed_scope_ids"],
                ["allowed_scope_ids"] if check.allowed_scope_ids is None else [],
                None if check.allowed_scope_ids is None else node.endpoint.scope_id in check.allowed_scope_ids.value,
                "The physical port's scope must be explicitly included in this segment.")
        address_paths = [f"{p}.address", f"{p}.protocol", f"{p}.role"]
        missing = [path for path, value in zip(address_paths, (node.address, node.protocol, node.role)) if value is None]
        address_pass = None
        if node.address is not None:
            address = node.address.value
            if address >= 255:
                address_pass = False
            elif node.protocol is not None:
                if node.protocol.value == "modbus_rtu":
                    address_pass = 1 <= address <= 247
                elif node.role is not None:
                    address_pass = address <= (127 if node.role.value == "manager" else 254)
        out.add(f"{rule}.address_range", address_paths, missing, address_pass,
                "MS/TP managers use 0–127, subordinates 0–254; Modbus servers use 1–247. Broadcast addresses are not endpoint addresses.")
    address_uniqueness(out, "serial.addresses_unique", [(f"nodes.{i}.address", str(n.address.value) if n.address is not None else None) for i, n in enumerate(check.nodes)],
                       [str(a) for a in check.reserved_addresses.value] if check.reserved_addresses is not None else None, "reserved_addresses")
    count_budget(out, "serial.device_capacity", [("reserved_devices", check.reserved_devices)],
                 "max_devices", check.max_devices,
                 fixed_count=sum(n.physical_kind is not None and n.physical_kind.value == "physical_port" for n in check.nodes),
                 fixed_path="nodes", prerequisite_paths=[f"nodes.{i}.physical_kind" for i in range(len(check.nodes))],
                 unknown_prerequisites=[f"nodes.{i}.physical_kind" for i, n in enumerate(check.nodes) if n.physical_kind is None],
                 invalid_prerequisites=any(n.physical_kind is not None and n.physical_kind.value != "physical_port" for n in check.nodes))
    count_budget(out, "serial.unit_load_capacity", [(f"nodes.{i}.load_microunits", n.load_microunits) for i, n in enumerate(check.nodes)] +
                 [("reserved_load_microunits", check.reserved_load_microunits)], "max_load_microunits", check.max_load_microunits)
    if check.protocol is None or check.protocol.value == "bacnet_mstp":
        paths = ["protocol", "max_managers", "reserved_managers"] + [f"nodes.{i}.role" for i in range(len(check.nodes))]
        missing = [p for p, v in (("protocol", check.protocol), ("max_managers", check.max_managers), ("reserved_managers", check.reserved_managers)) if v is None]
        missing += [f"nodes.{i}.role" for i, node in enumerate(check.nodes) if node.role is None]
        managers = sum(n.role is not None and n.role.value == "manager" for n in check.nodes)
        managers += check.reserved_managers.value if check.reserved_managers is not None else 0
        passed = None if check.max_managers is None else False if managers > check.max_managers.value else None if missing else True
        out.add("serial.manager_capacity", paths, missing, passed, "MS/TP managers consume their own declared budget.", {"known_managers": str(managers)})
        out.pair("serial.reserved_manager_count", "reserved_managers", check.reserved_managers,
                 "reserved_devices", check.reserved_devices, lambda a, b: a <= b,
                 "Reserved managers cannot exceed the number of reserved physical devices.")
    out.pair("serial.reserved_address_count", "reserved_addresses", check.reserved_addresses,
             "reserved_devices", check.reserved_devices, lambda a, b: len(a) <= b,
             "Every reserved addressed endpoint also consumes a reserved device position.")
    out.pair("serial.reserved_address_range", "reserved_addresses", check.reserved_addresses,
             "protocol", check.protocol,
             lambda addresses, protocol: all(1 <= a <= 247 if protocol == "modbus_rtu" else a <= 254 for a in addresses),
             "Reserved endpoint addresses must also be valid unicast addresses for the protocol.")

    positions = [(i, n.position_mm.value) for i, n in enumerate(check.nodes) if n.position_mm is not None]
    position_paths = [f"nodes.{i}.position_mm" for i in range(len(check.nodes))]
    missing_positions = [f"nodes.{i}.position_mm" for i, n in enumerate(check.nodes) if n.position_mm is None]
    ordered = all(a[1] <= b[1] for a, b in zip(positions, positions[1:]))
    out.add("serial.route_order", position_paths, missing_positions, False if not ordered else None if missing_positions else True,
            "Declared node order must have nondecreasing chainage; unknown positions are not reconstructed.")
    missing_length = missing_positions + (["lead_length_mm"] if check.lead_length_mm is None else []) + (["max_length_mm"] if check.max_length_mm is None else [])
    span = max((v for _, v in positions), default=0) - min((v for _, v in positions), default=0)
    known_length = span + (check.lead_length_mm.value if check.lead_length_mm is not None else 0)
    length_pass = None if check.max_length_mm is None else False if known_length > check.max_length_mm.value else None if missing_length else True
    out.add("serial.segment_length", [*position_paths, "lead_length_mm", "max_length_mm"], missing_length, length_pass,
            "A known chainage span plus lead is a lower bound when positions are missing; an overlength segment remains failed.",
            {"known_length_lower_bound_mm": str(known_length)})

    # Feed ONLY established policies to the existing solver. Modbus does not
    # use manager budgets; explicit neutral arguments below cannot affect it.
    policies = [("protocol", check.protocol), ("max_devices", check.max_devices),
                ("max_load_microunits", check.max_load_microunits), ("max_length_mm", check.max_length_mm),
                ("reserved_devices", check.reserved_devices), ("reserved_load_microunits", check.reserved_load_microunits),
                ("lead_length_mm", check.lead_length_mm)]
    required_paths = [p for p, _ in policies] + [f"nodes.{i}.load_microunits" for i in range(len(check.nodes))]
    missing_policy = [p for p, v in policies if v is None] + [f"nodes.{i}.load_microunits" for i, n in enumerate(check.nodes) if n.load_microunits is None]
    if check.protocol is None or check.protocol.value == "bacnet_mstp":
        required_paths += ["max_managers", "reserved_managers"] + [f"nodes.{i}.role" for i in range(len(check.nodes))]
        missing_policy += [p for p, v in (("max_managers", check.max_managers), ("reserved_managers", check.reserved_managers)) if v is None]
        missing_policy += [f"nodes.{i}.role" for i, n in enumerate(check.nodes) if n.role is None]
    required_paths += position_paths
    physical_paths = [f"nodes.{i}.physical_kind" for i in range(len(check.nodes))]
    missing_policy += [f"nodes.{i}.physical_kind" for i, n in enumerate(check.nodes) if n.physical_kind is None]
    required_paths += physical_paths
    nonphysical = any(n.physical_kind is not None and n.physical_kind.value != "physical_port" for n in check.nodes)
    if missing_policy or not ordered or nonphysical:
        out.add("serial.partition", required_paths, missing_policy,
                False if not ordered or nonphysical else None, "The existing solver requires physical ports, declared policies and an ordered route; no defaults supplied.")
        return None, []
    assert check.protocol and check.max_devices and check.max_load_microunits and check.max_length_mm
    assert check.reserved_devices and check.reserved_load_microunits and check.lead_length_mm
    nodes = [SerialNode(node_id=n.endpoint.endpoint_id, load_microunits=n.load_microunits.value,
                        manager=n.role is not None and n.role.value == "manager",
                        position_mm=n.position_mm.value if not missing_positions and n.position_mm is not None else None)
             for n in check.nodes if n.load_microunits is not None]
    try:
        route = SerialRoute(route_id=check.segment_id, protocol=check.protocol.value, nodes=nodes,
            max_devices=check.max_devices.value, max_load_microunits=check.max_load_microunits.value,
            max_length_mm=check.max_length_mm.value, max_managers=check.max_managers.value if check.max_managers is not None else 1,
            reserved_devices=check.reserved_devices.value, reserved_managers=check.reserved_managers.value if check.reserved_managers is not None else 0,
            reserved_load_microunits=check.reserved_load_microunits.value, lead_length_mm=check.lead_length_mm.value)
    except ValueError:
        out.add("serial.partition", required_paths, [], False, "The declared policies violate the existing protocol/address-space or route contract.")
        return None, []
    result, diagnostics = serial_partition(route)
    passed = False if result.unassigned_node_ids or len(result.segments) != 1 else None if missing_positions else True
    out.add("serial.partition", required_paths, missing_positions, passed,
            "This check allocates one declared segment. A multi-segment solution requires explicit reallocation, not inferred gateways. Partial route positions remain in the original input; a capacity-only solver omits all positions.",
            {"required_segments": str(len(result.segments)), "solver_status": result.status})
    return result, diagnostics


def ip_checks(check: IpNetworkCheck, out: Outcomes) -> tuple[IpResult | None, list[Diagnostic]]:
    addresses = [canonical_ip(n.address.value) if n.address is not None else None for n in check.nodes]
    for i, node in enumerate(check.nodes):
        p = f"nodes.{i}"
        rule = f"ip.{node.endpoint.endpoint_id}"
        out.one(f"{rule}.physical", f"{p}.physical_kind", node.physical_kind,
                lambda value: value == "physical_port", "IP endpoint counts require physical network ports, not software variables.")
        out.pair(f"{rule}.protocol", f"{p}.protocol", node.protocol, "protocol", check.protocol,
                 lambda a, b: a == b, "The port must use the declared network protocol; routing/translation is not inferred.")
        out.pair(f"{rule}.media", f"{p}.media", node.media, "media", check.media,
                 lambda a, b: a == b, "Compare the explicit endpoint and closet media declarations.")
        out.add(f"{rule}.scope", [f"{p}.endpoint.scope_id", "allowed_scope_ids"],
                ["allowed_scope_ids"] if check.allowed_scope_ids is None else [],
                None if check.allowed_scope_ids is None else node.endpoint.scope_id in check.allowed_scope_ids.value,
                "The endpoint location must belong to an explicitly permitted scope.")
        out.one(f"{rule}.address", f"{p}.address", node.address, lambda value: canonical_ip(value) is not None,
                "Require a valid, non-broadcast/non-multicast IP literal; subnet, routing and protocol configuration remain separate.")
        out.pair(f"{rule}.reach", f"{p}.link_length_mm", node.link_length_mm, "max_link_length_mm", check.max_link_length_mm,
                 lambda distance, limit: distance <= limit,
                 "Each endpoint link must meet the declared media reach limit; additional same-closet switches do not fix overlength links.")
    address_uniqueness(out, "ip.addresses_unique", [(f"nodes.{i}.address", address) for i, address in enumerate(addresses)])
    paths = ["ports_per_switch", "reserved_ports_per_switch", "max_link_length_mm"]
    missing = [p for p, v in zip(paths, (check.ports_per_switch, check.reserved_ports_per_switch, check.max_link_length_mm)) if v is None]
    result: IpResult | None = None
    diagnostics: list[Diagnostic] = []
    missing += [f"nodes.{i}.physical_kind" for i, n in enumerate(check.nodes) if n.physical_kind is None]
    paths += [f"nodes.{i}.physical_kind" for i in range(len(check.nodes))]
    nonphysical = any(n.physical_kind is not None and n.physical_kind.value != "physical_port" for n in check.nodes)
    if not missing and not nonphysical:
        assert check.ports_per_switch and check.reserved_ports_per_switch and check.max_link_length_mm
        closet = IpCloset(closet_id=check.closet_id, ports=check.ports_per_switch.value,
            reserved_ports_per_switch=check.reserved_ports_per_switch.value, max_link_length_mm=check.max_link_length_mm.value,
            endpoints=[IpEndpoint(node_id=n.endpoint.endpoint_id,
                       link_length_mm=n.link_length_mm.value if n.link_length_mm is not None else None) for n in check.nodes])
        result, diagnostics = ip_switches(closet)
    # Allocated usable ports are a separate constraint from the solver's
    # minimum switch quantity and media reach. Unknown reach cannot hide a
    # known port shortage, and no invented distance is passed to the solver.
    paths = ["nodes", "ports_per_switch", "reserved_ports_per_switch", "available_switches"]
    missing = [p for p, value in (("ports_per_switch", check.ports_per_switch),
        ("reserved_ports_per_switch", check.reserved_ports_per_switch), ("available_switches", check.available_switches)) if value is None]
    missing += [f"nodes.{i}.physical_kind" for i, n in enumerate(check.nodes) if n.physical_kind is None]
    paths += [f"nodes.{i}.physical_kind" for i in range(len(check.nodes))]
    passed = False if nonphysical else None
    physical_ports = sum(n.physical_kind is not None and n.physical_kind.value == "physical_port" for n in check.nodes)
    normalized: dict[str, str] = {"known_physical_ports": str(physical_ports)}
    if check.ports_per_switch is not None and check.reserved_ports_per_switch is not None and check.ports_per_switch.value <= check.reserved_ports_per_switch.value:
        passed = False
    elif check.ports_per_switch is not None and check.reserved_ports_per_switch is not None and check.available_switches is not None:
        available_ports = (check.ports_per_switch.value - check.reserved_ports_per_switch.value) * check.available_switches.value
        normalized["declared_usable_ports"] = str(available_ports)
        passed = False if nonphysical or available_ports < physical_ports else None if missing else True
    if result is not None and result.switches is not None:
        normalized["required_switches"] = str(result.switches)
    out.add("ip.switch_capacity", paths, missing, passed,
            "Declared usable ports must serve every selected physical endpoint. The unchanged fixed-closet solver supplies minimum switch quantity when its inputs are available; no installed switch count inferred.", normalized)
    return result, diagnostics
