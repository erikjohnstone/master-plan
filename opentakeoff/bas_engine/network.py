"""Exact fixed-route/fixed-closet subproblems, not arbitrary cable-routing claims."""

from .hardware import ceil_div
from .models import (Diagnostic, IpCloset, IpResult, SerialNode, SerialResult,
                     SerialRoute, SerialSegment)


def serial_partition(route: SerialRoute) -> tuple[SerialResult, list[Diagnostic]]:
    segments: list[SerialSegment] = []
    failed: list[str] = []
    diagnostics: list[Diagnostic] = []
    current: list[SerialNode] = []
    load, managers = 0, 0

    def length(first: SerialNode, last: SerialNode) -> int | None:
        if first.position_mm is None or last.position_mm is None:
            return None
        return route.lead_length_mm + last.position_mm-first.position_mm

    def fits(first: SerialNode, last: SerialNode, count: int, node_load: int, manager_count: int) -> bool:
        distance = length(first, last)
        return (count+route.reserved_devices <= route.max_devices
                and node_load+route.reserved_load_microunits <= route.max_load_microunits
                and (route.protocol != "bacnet_mstp" or manager_count+route.reserved_managers <= route.max_managers)
                and route.lead_length_mm <= route.max_length_mm
                and (distance is None or distance <= route.max_length_mm))

    def append_segment(nodes: list[SerialNode], node_load: int, manager_count: int) -> None:
        if nodes:
            segments.append(SerialSegment(node_ids=[n.node_id for n in nodes],
                                          device_count=len(nodes)+route.reserved_devices,
                                          manager_count=manager_count+route.reserved_managers if route.protocol == "bacnet_mstp" else 0,
                                          load_microunits=node_load+route.reserved_load_microunits,
                                          length_mm=length(nodes[0], nodes[-1])))

    for node in route.nodes:
        m = int(node.manager) if route.protocol == "bacnet_mstp" else 0
        if current and not fits(current[0], node, len(current)+1, load+node.load_microunits, managers+m):
            append_segment(current, load, managers)
            current, load, managers = [], 0, 0
        if not fits(node, node, 1, node.load_microunits, m):
            failed.append(node.node_id)
            continue
        current.append(node)
        load += node.load_microunits
        managers += m
    append_segment(current, load, managers)
    missing_distances = any(n.position_mm is None for n in route.nodes)
    if missing_distances:
        diagnostics.append(Diagnostic(code="SERIAL_DISTANCE_UNKNOWN", severity="warning",
                                      message=f"Route {route.route_id!r}: capacity-only partition; physical lengths have not been supplied."))
    if failed:
        diagnostics.append(Diagnostic(code="SERIAL_NODE_INFEASIBLE", severity="error",
                                      message=f"Route {route.route_id!r}: {len(failed)} node(s) cannot fit even alone with reserved head-end resources."))
    if segments:
        diagnostics.append(Diagnostic(code="SERIAL_ROUTE_SCOPE", severity="info",
                                      message=f"Route {route.route_id!r}: contiguous linear partition assumes a local head end at each segment start; upstream links, placement, baud rate and electrical compatibility require verification."))
    return SerialResult(route_id=route.route_id, segments=segments, unassigned_node_ids=failed,
                        status="infeasible" if failed else "capacity_only" if missing_distances else "calculated"), diagnostics


def ip_switches(closet: IpCloset) -> tuple[IpResult, list[Diagnostic]]:
    count = len(closet.endpoints)
    available = closet.ports-closet.reserved_ports_per_switch
    switches = ceil_div(count, available) if available > 0 else (0 if count == 0 else None)
    too_long = [e.node_id for e in closet.endpoints if e.link_length_mm is not None and e.link_length_mm > closet.max_link_length_mm]
    unknown = [e.node_id for e in closet.endpoints if e.link_length_mm is None]
    diagnostics: list[Diagnostic] = []
    if switches is None:
        diagnostics.append(Diagnostic(code="IP_PORTS_EXHAUSTED", severity="error",
                                      message=f"Closet {closet.closet_id!r}: reserved ports leave no endpoint capacity."))
    if too_long:
        diagnostics.append(Diagnostic(code="IP_LINK_OVERLENGTH", severity="error",
                                      message=f"Closet {closet.closet_id!r}: {len(too_long)} link(s) exceed the selected media limit; additional same-closet switches do not solve distance."))
    if unknown:
        diagnostics.append(Diagnostic(code="IP_DISTANCE_UNKNOWN", severity="warning",
                                      message=f"Closet {closet.closet_id!r}: {len(unknown)} link length(s) are unverified."))
    return IpResult(closet_id=closet.closet_id, switches=switches, endpoint_count=count,
                    spare_ports=switches*available-count if switches is not None else None,
                    overlength_node_ids=too_long, unknown_length_node_ids=unknown,
                    status="infeasible" if switches is None or too_long else "capacity_only" if unknown else "calculated"), diagnostics
