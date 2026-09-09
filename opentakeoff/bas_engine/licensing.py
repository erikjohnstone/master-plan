"""Software licensing is independent of physical copper and protocol addressing."""

from .hardware import ceil_div
from .models import Diagnostic, EngineRequest, LicenseResult, ReconciledPoint


def license_points(request: EngineRequest, points: list[ReconciledPoint]) -> tuple[list[LicenseResult], list[Diagnostic]]:
    quantities = {g.group_id: g.quantity for g in request.groups}
    # Identity includes an explicit namespace. Project-scope variables are shared
    # once; equipment-group variables represent distinct replicated devices.
    variables: dict[tuple[str, str, str, str], tuple[int, int]] = {}
    diagnostics: list[Diagnostic] = []
    for point in points:
        if quantities[point.group_id] == 0:
            continue
        for soft in point.soft:
            scope = point.group_id if soft.scope == "equipment_group" else ""
            key = (soft.pool, scope, soft.protocol, soft.variable_id)
            count = soft.quantity * (quantities[point.group_id] if scope else 1)
            value = count, soft.license_weight
            if key in variables and variables[key] != value:
                diagnostics.append(Diagnostic(code="SOFT_IDENTITY_CONFLICT", severity="warning",
                                              message="Repeated software identity has inconsistent multiplicity or weight; conservative maximum retained.",
                                              group_id=point.group_id, point_id=point.point_id, evidence=point.evidence))
                old = variables[key]
                value = max(old[0], count), max(old[1], soft.license_weight)
            variables[key] = value
    policies = {p.pool: p for p in request.licenses}
    pools = set(policies) | {key[0] for key in variables}
    result: list[LicenseResult] = []
    for pool in sorted(pools):
        entries = [v for k, v in variables.items() if k[0] == pool]
        total = sum(quantity*weight for quantity, weight in entries)
        row = LicenseResult(pool=pool, weighted_points=total, variables=sum(q for q, _ in entries), status="not_configured")
        policy = policies.get(pool)
        if policy is None:
            diagnostics.append(Diagnostic(code="LICENSE_POLICY_MISSING", severity="warning",
                                          message=f"Software pool {pool!r} has no declared license entitlement policy."))
        else:
            if policy.mode == "packs":
                assert policy.pack_size is not None  # enforced by the input contract
                row.packs = ceil_div(max(0, total-policy.base), policy.pack_size)
                row.entitlement = policy.base + row.packs*policy.pack_size
            else:
                row.entitlement = next((n for n in policy.tiers if n >= total), None)
            if row.entitlement is None:
                row.status = "infeasible"
                diagnostics.append(Diagnostic(code="LICENSE_CAPACITY_EXCEEDED", severity="error",
                                              message=f"No declared license tier covers pool {pool!r}; no larger tier is invented."))
            else:
                row.status = "calculated"
                row.headroom = row.entitlement-total
        result.append(row)
    return result, diagnostics
