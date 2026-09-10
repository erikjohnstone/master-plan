"""Point-identity union before the component-wise least upper bound."""

from .models import (Diagnostic, EngineRequest, IOVector, PointRequirement,
                     ReconciledPoint, SoftVariable)


def soft_key(value: SoftVariable) -> tuple[str, str, str, str]:
    return value.pool, value.scope, value.protocol, value.variable_id


def reconcile(request: EngineRequest) -> tuple[list[ReconciledPoint], list[Diagnostic]]:
    soo = {(p.group_id, p.point_id): p for p in request.soo or []}
    points = {(p.group_id, p.point_id): p for p in request.point_list or []}
    both = request.soo is not None and request.point_list is not None
    result: list[ReconciledPoint] = []
    diagnostics: list[Diagnostic] = []
    if not both:
        diagnostics.append(Diagnostic(code="SINGLE_SOURCE", severity="info",
                                      message="Only one requirement source was supplied; cross-source agreement is unverified."))
    for key in sorted(soo.keys() | points.keys()):
        s, p = soo.get(key), points.get(key)
        evidence = (s.evidence if s else []) + (p.evidence if p else [])
        issues: list[tuple[str, str]] = []
        if both and (s is None or p is None):
            issues.append(("SOURCE_POINT_MISSING", "Point identity is present in only one supplied source; retained in the envelope."))
        if s is not None and p is not None:
            if s.physical != p.physical:
                issues.append(("PHYSICAL_QUANTITY_DISAGREEMENT", "SOO and point list differ; the element-wise maximum is a capacity envelope, not resolved drawing truth."))
                if {i for i, n in enumerate(s.physical.values()) if n} != {i for i, n in enumerate(p.physical.values()) if n}:
                    issues.append(("PHYSICAL_TYPE_CONTRADICTION", "The same point has incompatible physical I/O types or physical-versus-network requirements; review both citations."))
            if sorted((soft_key(v), v.quantity, v.license_weight) for v in s.soft) != sorted(
                    (soft_key(v), v.quantity, v.license_weight) for v in p.soft):
                issues.append(("SOFT_REQUIREMENT_DISAGREEMENT", "Software identity, protocol, quantity, or licensing weight differs between sources."))
        merged: dict[tuple[str, str, str, str], SoftVariable] = {}
        for v in (s.soft if s else []) + (p.soft if p else []):
            previous = merged.get(soft_key(v))
            merged[soft_key(v)] = SoftVariable(**{
                **v.model_dump(), "quantity": max(previous.quantity, v.quantity) if previous else v.quantity,
                "license_weight": max(previous.license_weight, v.license_weight) if previous else v.license_weight,
            })
        for code, message in issues:
            diagnostics.append(Diagnostic(code=code, severity="warning", message=message,
                                          group_id=key[0], point_id=key[1], evidence=evidence))
        result.append(ReconciledPoint(
            group_id=key[0], point_id=key[1],
            physical=(s.physical if s else IOVector()).envelope(p.physical if p else IOVector()),
            soft=[merged[k] for k in sorted(merged)], evidence=evidence,
            sources=(["soo"] if s else []) + (["point_list"] if p else []), conflict=bool(issues),
        ))
    return result, diagnostics


def group_demands(points: list[PointRequirement]) -> dict[str, IOVector]:
    totals: dict[str, IOVector] = {}
    for point in points:
        totals[point.group_id] = totals.get(point.group_id, IOVector()).plus(point.physical)
    return totals
