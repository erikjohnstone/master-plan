"""Exact four-dimensional sizing; see docs/BAS_MATH_RESEARCH.md §1–2."""

from .models import (Diagnostic, EquipmentGroup, HardwareProfile, HardwareResult,
                     IOVector, SparePolicy)


def ceil_div(numerator: int, denominator: int) -> int:
    if numerator < 0 or denominator <= 0:
        raise ValueError("ceiling requires nonnegative numerator and positive denominator")
    return (numerator + denominator - 1) // denominator


def reserve(live: IOVector, policy: SparePolicy) -> IOVector:
    n, d = policy.numerator, policy.denominator
    factor, divisor = (d+n, d) if policy.basis == "demand_addon" else (d, d-n)
    return IOVector(**{k: max(ceil_div(v*factor, divisor), minimum)
                       for k, v, minimum in zip(("AI", "AO", "DI", "DO"),
                                                live.values(), policy.minimum.values())})


def minimum_blocks(demand: IOVector, profile: HardwareProfile) -> int | None:
    a, o, d, q = profile.rigid.values()
    u = profile.universal_inputs
    constraints = ((demand.AI, a+u), (demand.DI, d+u),
                   (demand.AI+demand.DI, a+d+u), (demand.AO, o), (demand.DO, q))
    if any(need and not capacity for need, capacity in constraints):
        return None
    result = max((ceil_div(need, cap) if need else 0 for need, cap in constraints), default=0)
    if profile.max_blocks_per_pool is not None and result > profile.max_blocks_per_pool:
        return None
    return result


def size_group(group: EquipmentGroup, demand: IOVector, spare: SparePolicy,
               profile: HardwareProfile | None) -> tuple[HardwareResult, list[Diagnostic]]:
    policy = group.spare or spare
    hardware = group.hardware or profile
    pools = group.quantity if group.allocation == "independent" else int(group.quantity > 0)
    live = demand if group.allocation == "independent" else demand.scaled(group.quantity)
    if not pools:
        live = IOVector()
    target = reserve(live, policy) if pools else IOVector()
    result = HardwareResult(group_id=group.group_id, profile_id=hardware.profile_id if hardware else None,
                            allocation=group.allocation, pool_count=pools, live_per_pool=live,
                            required_per_pool=target, spare_policy=policy, status="not_configured")
    if hardware is None:
        if not any(target.values()):
            result.status = "calculated"
            result.blocks_per_pool = result.blocks_total = 0
            return result, []
        return result, [Diagnostic(code="HARDWARE_POLICY_MISSING", severity="warning", group_id=group.group_id,
                                   message="No abstract I/O profile supplied; physical demand is not a controller order.")]
    blocks = minimum_blocks(target, hardware)
    if blocks is None:
        result.status = "infeasible"
        return result, [Diagnostic(code="HARDWARE_INFEASIBLE", severity="error", group_id=group.group_id,
                                   message="Compatible channel capacity or maximum blocks per allocation pool cannot meet demand.")]
    capacity = hardware.rigid.scaled(blocks)
    assigned = IOVector(**{k: min(v, cap) for k, v, cap in zip(("AI", "AO", "DI", "DO"),
                                                              target.values(), capacity.values())})
    u_ai, u_di = target.AI-assigned.AI, target.DI-assigned.DI
    result.status = "calculated"
    result.blocks_per_pool = blocks
    result.blocks_total = blocks*pools
    result.rigid_capacity_per_pool = capacity
    result.universal_capacity_per_pool = blocks*hardware.universal_inputs
    result.assigned_rigid_per_pool = assigned
    result.assigned_universal_AI = u_ai
    result.assigned_universal_DI = u_di
    result.unassigned_universal = blocks*hardware.universal_inputs-u_ai-u_di
    return result, []
