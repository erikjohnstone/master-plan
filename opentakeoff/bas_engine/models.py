"""Validated wire contracts. Counts reject floats, booleans and numeric strings."""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

Count = Annotated[int, Field(strict=True, ge=0)]
PositiveCount = Annotated[int, Field(strict=True, gt=0)]
Identifier = Annotated[str, Field(strict=True, min_length=1, max_length=512)]
Protocol = Literal["bacnet", "modbus", "knx", "other"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class IOVector(Contract):
    AI: Count = 0
    AO: Count = 0
    DI: Count = 0
    DO: Count = 0

    def values(self) -> tuple[int, int, int, int]:
        return self.AI, self.AO, self.DI, self.DO

    def scaled(self, n: int) -> IOVector:
        return IOVector(AI=self.AI*n, AO=self.AO*n, DI=self.DI*n, DO=self.DO*n)

    def plus(self, other: IOVector) -> IOVector:
        return IOVector(**dict(zip(("AI", "AO", "DI", "DO"),
                                 (a+b for a, b in zip(self.values(), other.values())))))

    def envelope(self, other: IOVector) -> IOVector:
        return IOVector(**dict(zip(("AI", "AO", "DI", "DO"),
                                 (max(a, b) for a, b in zip(self.values(), other.values())))))


class Evidence(Contract):
    sheet_id: str | None = None
    table_title: str | None = None
    row_key: str | None = None
    column: str | None = None
    text: str | None = None
    bbox_px: tuple[float, float, float, float] | None = None
    origin: Literal["blueprint_index", "manual_blueprint_review", "structured_input"] = "structured_input"

    @model_validator(mode="after")
    def valid_box(self) -> Self:
        if self.bbox_px is not None:
            from math import isfinite
            x1, y1, x2, y2 = self.bbox_px
            if not all(isfinite(v) for v in self.bbox_px) or x2 < x1 or y2 < y1:
                raise ValueError("bbox_px must be finite, ordered source coordinates")
        return self


class Diagnostic(Contract):
    code: Identifier
    severity: Literal["info", "warning", "error"]
    message: str
    group_id: str | None = None
    point_id: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)


class SoftVariable(Contract):
    protocol: Protocol
    variable_id: Identifier
    pool: Identifier = "default"
    scope: Literal["equipment_group", "project"] = "equipment_group"
    quantity: Count = 1
    license_weight: Count = 1


class PointRequirement(Contract):
    group_id: Identifier
    point_id: Identifier
    physical: IOVector = Field(default_factory=IOVector)
    soft: list[SoftVariable] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_soft_ids(self) -> Self:
        keys = [(s.pool, s.scope, s.protocol, s.variable_id) for s in self.soft]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate software identities in one point requirement")
        return self


class SparePolicy(Contract):
    basis: Literal["demand_addon", "installed_unused"] = "demand_addon"
    numerator: Count = 0
    denominator: PositiveCount = 100
    minimum: IOVector = Field(default_factory=IOVector)

    @model_validator(mode="after")
    def valid_fraction(self) -> Self:
        if self.basis == "installed_unused" and self.numerator >= self.denominator:
            raise ValueError("installed-unused fraction must be less than one")
        return self


class HardwareProfile(Contract):
    profile_id: Identifier
    rigid: IOVector
    universal_inputs: Count = 0
    max_blocks_per_pool: PositiveCount | None = None


class EquipmentGroup(Contract):
    group_id: Identifier
    quantity: Count = 1
    allocation: Literal["independent", "shared_pool"] = "independent"
    hardware: HardwareProfile | None = None
    spare: SparePolicy | None = None
    evidence: list[Evidence] = Field(default_factory=list)


class LicensePolicy(Contract):
    pool: Identifier
    mode: Literal["packs", "tiers"]
    base: Count = 0
    pack_size: PositiveCount | None = None
    tiers: list[Count] = Field(default_factory=list)

    @model_validator(mode="after")
    def valid_mode(self) -> Self:
        if self.mode == "packs" and (self.pack_size is None or self.tiers):
            raise ValueError("pack licensing requires pack_size and no tiers")
        if self.mode == "tiers" and (not self.tiers or self.pack_size is not None or self.base):
            raise ValueError("tier licensing requires absolute tiers, no base or pack size")
        if self.tiers != sorted(set(self.tiers)):
            raise ValueError("tiers must be unique and ascending")
        return self


class SerialNode(Contract):
    node_id: Identifier
    # Integer micro-unit-loads eliminate floating-point comparison at capacity.
    load_microunits: Count
    manager: StrictBool = True
    position_mm: Count | None = None


class SerialRoute(Contract):
    route_id: Identifier
    protocol: Literal["bacnet_mstp", "modbus_rtu"]
    nodes: list[SerialNode]
    max_devices: PositiveCount
    max_load_microunits: PositiveCount
    max_length_mm: PositiveCount
    max_managers: PositiveCount = 128
    reserved_devices: Count = 1
    reserved_managers: Count = 1
    reserved_load_microunits: Count = 1_000_000
    lead_length_mm: Count = 0

    @model_validator(mode="after")
    def consistent_route(self) -> Self:
        ids = [n.node_id for n in self.nodes]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate node identity on a serial route")
        positions = [n.position_mm for n in self.nodes]
        known = [p for p in positions if p is not None]
        if known and (len(known) != len(positions) or known != sorted(known)):
            raise ValueError("route positions must be entirely known and nondecreasing, or entirely omitted")
        if self.protocol == "bacnet_mstp" and (self.max_managers > 128 or self.max_devices > 255):
            raise ValueError("MS/TP address-space limits exceeded")
        if self.protocol == "modbus_rtu" and self.max_devices - self.reserved_devices > 247:
            raise ValueError("Modbus serial supports at most 247 addressed servers")
        return self


class IpEndpoint(Contract):
    node_id: Identifier
    link_length_mm: Count | None = None


class IpCloset(Contract):
    closet_id: Identifier
    endpoints: list[IpEndpoint]
    ports: PositiveCount
    reserved_ports_per_switch: Count
    max_link_length_mm: PositiveCount

    @model_validator(mode="after")
    def unique_nodes(self) -> Self:
        if len({e.node_id for e in self.endpoints}) != len(self.endpoints):
            raise ValueError("duplicate IP endpoint identity in a closet")
        return self


class EngineRequest(Contract):
    schema_version: Literal["1"] = "1"
    groups: list[EquipmentGroup] = Field(default_factory=list)
    soo: list[PointRequirement] | None = None
    point_list: list[PointRequirement] | None = None
    spare: SparePolicy = Field(default_factory=SparePolicy)
    hardware: HardwareProfile | None = None
    licenses: list[LicensePolicy] = Field(default_factory=list)
    serial_routes: list[SerialRoute] = Field(default_factory=list)
    ip_closets: list[IpCloset] = Field(default_factory=list)
    input_diagnostics: list[Diagnostic] = Field(default_factory=list)

    @model_validator(mode="after")
    def identities(self) -> Self:
        if self.soo is None and self.point_list is None:
            raise ValueError("provide soo, point_list, or both (an explicit empty list is valid)")
        group_ids = [g.group_id for g in self.groups]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("duplicate equipment group identity")
        for source in (self.soo, self.point_list):
            keys = [(p.group_id, p.point_id) for p in source or []]
            if len(keys) != len(set(keys)):
                raise ValueError("duplicate point identity within one source; normalize explicitly first")
            if any(g not in group_ids for g, _ in keys):
                raise ValueError("point references an undefined equipment group")
        for ids in ([p.pool for p in self.licenses], [r.route_id for r in self.serial_routes],
                    [c.closet_id for c in self.ip_closets]):
            if len(ids) != len(set(ids)):
                raise ValueError("duplicate policy/network identifier")
        network_ids = [n.node_id for r in self.serial_routes for n in r.nodes]
        network_ids += [e.node_id for c in self.ip_closets for e in c.endpoints]
        if len(network_ids) != len(set(network_ids)):
            raise ValueError("a network endpoint must be assigned once; use port-scoped IDs for multiport devices")
        return self


class ReconciledPoint(PointRequirement):
    sources: list[Literal["soo", "point_list"]]
    conflict: bool = False


class HardwareResult(Contract):
    group_id: str
    profile_id: str | None
    allocation: Literal["independent", "shared_pool"]
    pool_count: Count
    live_per_pool: IOVector
    required_per_pool: IOVector
    spare_policy: SparePolicy
    blocks_per_pool: Count | None = None
    blocks_total: Count | None = None
    rigid_capacity_per_pool: IOVector | None = None
    universal_capacity_per_pool: Count | None = None
    assigned_rigid_per_pool: IOVector | None = None
    assigned_universal_AI: Count | None = None
    assigned_universal_DI: Count | None = None
    unassigned_universal: Count | None = None
    status: Literal["calculated", "not_configured", "infeasible"]


class LicenseResult(Contract):
    pool: str
    weighted_points: Count
    variables: Count
    entitlement: Count | None = None
    packs: Count | None = None
    headroom: Count | None = None
    status: Literal["calculated", "not_configured", "infeasible"]


class SerialSegment(Contract):
    node_ids: list[str]
    device_count: Count
    manager_count: Count
    load_microunits: Count
    length_mm: Count | None


class SerialResult(Contract):
    route_id: str
    segments: list[SerialSegment]
    unassigned_node_ids: list[str]
    status: Literal["calculated", "capacity_only", "infeasible"]


class IpResult(Contract):
    closet_id: str
    switches: Count | None
    endpoint_count: Count
    spare_ports: Count | None
    overlength_node_ids: list[str]
    unknown_length_node_ids: list[str]
    status: Literal["calculated", "capacity_only", "infeasible"]


class EngineResult(Contract):
    schema_version: Literal["1"] = "1"
    engine: Literal["bas_math_v1"] = "bas_math_v1"
    status: Literal["calculated", "review_required", "no_evidence"]
    project_complete: Literal[False] = False
    source_coverage: Literal["soo_only", "point_list_only", "both"]
    physical_total: IOVector
    points: list[ReconciledPoint]
    hardware: list[HardwareResult]
    licenses: list[LicenseResult]
    serial: list[SerialResult]
    ip: list[IpResult]
    diagnostics: list[Diagnostic]
