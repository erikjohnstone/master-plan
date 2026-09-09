"""The sole BAS math orchestration used by Python, UI and MCP callers."""

from .hardware import size_group
from .licensing import license_points
from .models import EngineRequest, EngineResult, IOVector
from .network import ip_switches, serial_partition
from .reconcile import group_demands, reconcile


def calculate(request: EngineRequest) -> EngineResult:
    # Revalidate callers' model instances too; no unchecked model_construct or
    # mutation of nested lists may bypass the boundary's invariants.
    request = EngineRequest.model_validate(request.model_dump())
    points, diagnostics = reconcile(request)
    diagnostics = [*request.input_diagnostics, *diagnostics]
    demands = group_demands(list(points))
    hardware = []
    total = IOVector()
    for group in request.groups:
        demand = demands.get(group.group_id, IOVector())
        total = total.plus(demand.scaled(group.quantity))
        row, issues = size_group(group, demand, request.spare, request.hardware)
        hardware.append(row)
        diagnostics.extend(issues)
    licenses, issues = license_points(request, points)
    diagnostics.extend(issues)
    serial = []
    for route in request.serial_routes:
        row_serial, issues = serial_partition(route)
        serial.append(row_serial)
        diagnostics.extend(issues)
    ip = []
    for closet in request.ip_closets:
        row_ip, issues = ip_switches(closet)
        ip.append(row_ip)
        diagnostics.extend(issues)
    return EngineResult(
        status="review_required" if any(d.severity != "info" for d in diagnostics) else "calculated" if points or request.groups or serial or ip or licenses else "no_evidence",
        source_coverage="both" if request.soo is not None and request.point_list is not None else "soo_only" if request.soo is not None else "point_list_only",
        physical_total=total, points=points, hardware=hardware, licenses=licenses,
        serial=serial, ip=ip, diagnostics=diagnostics,
    )
