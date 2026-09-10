"""Source-retaining inputs for the shared engineering calculator.

These contracts do not authenticate sources. The workflow service must establish
source/equipment ownership before accepting a register or saving a calculation.
"""
from __future__ import annotations

from typing import Annotated, Generic, Literal, Self, TypeVar

from pydantic import Field, model_validator

from .engineering_units import Interval, Quantity, require_dimension
from .models import Contract, Count

Text = Annotated[str, Field(strict=True, min_length=1, max_length=4000, pattern=r"\S")]
Id = Annotated[str, Field(strict=True, min_length=1, max_length=512, pattern=r"\S")]
T = TypeVar("T")
Waveform = Literal["AC", "DC"]
Mode = Literal["voltage", "current", "resistance", "dry_contact", "relay_contact", "triac", "switched_voltage", "pulse"]
Modes = Annotated[list[Mode], Field(min_length=1, max_length=8)]
Names = Annotated[list[Id], Field(min_length=1, max_length=100)]


def unique(items: list[str], description: str) -> None:
    if len(items) != len(set(items)):
        raise ValueError(f"duplicate {description}")


class Basis(Contract):
    origin: Literal["drawing_transcription", "explicit_input"]
    source_span_ids: list[Id] = Field(max_length=200)
    original_text: Text | None
    reason: Text

    @model_validator(mode="after")
    def source_requirement(self) -> Self:
        unique(self.source_span_ids, "source span")
        if self.origin == "drawing_transcription" and (not self.source_span_ids or self.original_text is None):
            raise ValueError("drawing transcription requires original wording and source spans")
        return self


class Known(Contract, Generic[T]):
    value: T
    basis: Basis


class Endpoint(Contract):
    endpoint_id: Id
    equipment_id: Id
    scope_id: Id


class Check(Contract):
    check_id: Id
    equipment_ids: list[Id] = Field(min_length=1, max_length=200)
    reason: Text

    @model_validator(mode="after")
    def identities(self) -> Self:
        unique(self.equipment_ids, "equipment identity")
        return self


class Connection(Check):
    source: Endpoint
    sink: Endpoint

    @model_validator(mode="after")
    def endpoint_ownership(self) -> Self:
        if self.source.endpoint_id == self.sink.endpoint_id:
            raise ValueError("a connection requires distinct endpoints")
        if any(e.equipment_id not in self.equipment_ids for e in (self.source, self.sink)):
            raise ValueError("endpoint must reference a check equipment identity")
        return self


class SignalCheck(Connection):
    kind: Literal["signal"]
    source_direction: Known[Literal["input", "output"]] | None
    sink_direction: Known[Literal["input", "output"]] | None
    source_mode: Known[Mode] | None
    sink_modes: Known[Modes] | None

    @model_validator(mode="after")
    def modes_unique(self) -> Self:
        if self.sink_modes is not None:
            unique(list(self.sink_modes.value), "accepted mode")
        return self


class AnalogRangeCheck(Connection):
    kind: Literal["analog_range"]
    signal_dimension: Literal["voltage", "current", "resistance"]
    output_range: Known[Interval] | None
    accepted_range: Known[Interval] | None
    output_waveform: Known[Waveform] | None
    accepted_waveform: Known[Waveform] | None
    excitation: Known[Id] | None
    accepted_excitation: Known[Names] | None

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        for rating in (self.output_range, self.accepted_range):
            if rating is not None:
                require_dimension(rating.value, self.signal_dimension, nonnegative=self.signal_dimension == "resistance")
        if self.accepted_excitation is not None:
            unique(self.accepted_excitation.value, "excitation mode")
        return self


class ResistancePart(Contract):
    part_id: Id
    resistance: Known[Quantity] | None

    @model_validator(mode="after")
    def dimension(self) -> Self:
        if self.resistance is not None:
            require_dimension(self.resistance.value, "resistance")
        return self


class ResistiveLoadingCheck(Connection):
    kind: Literal["resistive_loading"]
    # Declared topology only. No arbitrary impedance, cable or excitation model.
    topology: Known[Literal["series", "parallel", "effective"]] | None
    permitted_load: Known[Interval] | None
    parts: list[ResistancePart] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        unique([p.part_id for p in self.parts], "load part")
        if self.permitted_load is not None:
            require_dimension(self.permitted_load.value, "resistance")
        if self.topology is not None and self.topology.value == "effective" and len(self.parts) != 1:
            raise ValueError("effective resistance requires exactly one declared value")
        return self


class ContactCheck(Connection):
    kind: Literal["contact"]
    provided_interface: Known[Literal["dry_relay", "triac", "wet_voltage", "open_collector"]] | None
    accepted_interfaces: Known[Annotated[list[Literal["dry_relay", "triac", "wet_voltage", "open_collector"]], Field(min_length=1, max_length=4)]] | None
    circuit_waveform: Known[Waveform] | None
    rated_waveform: Known[Waveform] | None
    circuit_voltage: Known[Interval] | None
    rated_voltage: Known[Interval] | None
    operating_current: Known[Quantity] | None
    rated_current: Known[Interval] | None
    # A rating is conditional on load class; resistive != inductive by default.
    circuit_load_class: Known[Id] | None
    rated_load_classes: Known[Names] | None

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        for rating in (self.circuit_voltage, self.rated_voltage):
            if rating is not None:
                require_dimension(rating.value, "voltage")
        for current in (self.operating_current, self.rated_current):
            if current is not None:
                require_dimension(current.value, "current")
        for names in (self.accepted_interfaces, self.rated_load_classes):
            if names is not None:
                unique(list(names.value), "accepted contact characteristic")
        return self


class PulseCheck(Connection):
    kind: Literal["pulse"]
    maximum_frequency: Known[Quantity] | None
    accepted_maximum_frequency: Known[Quantity] | None
    minimum_on_time: Known[Quantity] | None
    required_minimum_on_time: Known[Quantity] | None
    minimum_off_time: Known[Quantity] | None
    required_minimum_off_time: Known[Quantity] | None

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        for name in ("maximum_frequency", "accepted_maximum_frequency", "minimum_on_time",
                     "required_minimum_on_time", "minimum_off_time", "required_minimum_off_time"):
            rating = getattr(self, name)
            if rating is not None:
                require_dimension(rating.value, "frequency" if "frequency" in name else "time")
                if rating.value.exact() <= 0:
                    raise ValueError("pulse timing/frequency must be positive")
        return self


class PowerDemand(Contract):
    demand: Known[Quantity] | None
    power_factor: Known[Quantity] | None

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        if self.demand is not None:
            if self.demand.value.dimension not in ("real_power", "apparent_power"):
                raise ValueError("power demand requires W or VA units")
            require_dimension(self.demand.value, self.demand.value.dimension)
        if self.power_factor is not None:
            require_dimension(self.power_factor.value, "ratio")
            if not 0 < self.power_factor.value.exact() <= 1:
                raise ValueError("power factor must be greater than zero and no greater than one")
        return self


class PowerLoad(Contract):
    load_id: Id
    equipment_id: Id
    accepted_voltage: Known[Interval] | None
    accepted_waveform: Known[Waveform] | None
    operating: PowerDemand
    startup: PowerDemand

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        if self.accepted_voltage is not None:
            require_dimension(self.accepted_voltage.value, "voltage")
        return self


class LoadState(Contract):
    load_id: Id
    state: Known[Literal["operating", "startup", "off"]]


class PowerScenario(Contract):
    scenario_id: Id
    states: list[LoadState] = Field(min_length=1, max_length=1000)
    reason: Text


class PowerCheck(Check):
    kind: Literal["power"]
    supply_id: Id
    pool_id: Id
    output_voltage: Known[Interval] | None
    output_waveform: Known[Waveform] | None
    capacity: Known[Quantity] | None
    usable_fraction: Known[Quantity] | None
    loads: list[PowerLoad] = Field(min_length=1, max_length=1000)
    scenarios: list[PowerScenario] = Field(max_length=100)

    @model_validator(mode="after")
    def dimensions_and_members(self) -> Self:
        if self.output_voltage is not None:
            require_dimension(self.output_voltage.value, "voltage")
        if self.capacity is not None:
            if self.capacity.value.dimension not in ("real_power", "apparent_power"):
                raise ValueError("power capacity requires W or VA units")
            require_dimension(self.capacity.value, self.capacity.value.dimension)
        if self.usable_fraction is not None:
            require_dimension(self.usable_fraction.value, "ratio")
            if not 0 < self.usable_fraction.value.exact() <= 1:
                raise ValueError("usable fraction must be greater than zero and no greater than one")
        ids = [load.load_id for load in self.loads]
        unique(ids, "connected load")
        unique([s.scenario_id for s in self.scenarios], "power scenario")
        if any(load.equipment_id not in self.equipment_ids for load in self.loads):
            raise ValueError("power load references foreign equipment")
        for scenario in self.scenarios:
            members = [state.load_id for state in scenario.states]
            unique(members, "scenario load")
            if set(members) != set(ids):
                raise ValueError("each scenario must declare a state for every connected load")
        return self


class MechanicalCheck(Check):
    kind: Literal["mechanical"]
    required_torque: Known[Quantity] | None
    available_torque: Known[Quantity] | None
    required_closeoff: Known[Quantity] | None
    available_closeoff: Known[Quantity] | None
    required_fail_position: Known[Id] | None
    provided_fail_position: Known[Id] | None
    required_environment: Known[Interval] | None
    rated_environment: Known[Interval] | None
    required_enclosure: Known[Id] | None
    accepted_enclosures: Known[Names] | None

    @model_validator(mode="after")
    def dimensions(self) -> Self:
        for name, dimension in (("required_torque", "torque"), ("available_torque", "torque"),
                                ("required_closeoff", "pressure"), ("available_closeoff", "pressure"),
                                ("required_environment", "temperature"), ("rated_environment", "temperature")):
            rating = getattr(self, name)
            if rating is not None:
                require_dimension(rating.value, dimension, nonnegative=dimension != "temperature")
        if self.accepted_enclosures is not None:
            unique(self.accepted_enclosures.value, "enclosure class")
        return self


class Channel(Contract):
    channel_id: Id
    # Universal mode aliases may name the SAME physical terminal. Allocation
    # checks count the terminal, never the alias or advertised mode count.
    physical_terminal_id: Id
    owner_equipment_id: Id
    pool_id: Known[Id] | None
    allowed_scope_ids: Known[Names] | None
    configured_mode: Known[Mode] | None
    direction: Known[Literal["input", "output"]] | None


class EndpointAllocation(Contract):
    endpoint: Endpoint
    physical_kind: Known[Literal["physical_io", "software_variable"]] | None
    required_mode: Known[Mode] | None
    required_direction: Known[Literal["input", "output"]] | None
    required_pool_id: Known[Id] | None
    channel_id: Known[Id] | None


class AllocationCheck(Check):
    kind: Literal["allocation"]
    channels: list[Channel] = Field(max_length=10000)
    endpoints: list[EndpointAllocation] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def ownership(self) -> Self:
        unique([c.channel_id for c in self.channels], "channel identity")
        unique([e.endpoint.endpoint_id for e in self.endpoints], "endpoint identity")
        owners = [c.owner_equipment_id for c in self.channels] + [e.endpoint.equipment_id for e in self.endpoints]
        if any(owner not in self.equipment_ids for owner in owners):
            raise ValueError("channel/endpoint references foreign equipment")
        for channel in self.channels:
            if channel.allowed_scope_ids is not None:
                unique(channel.allowed_scope_ids.value, "allowed scope")
        return self


class ExpansionModule(Contract):
    module_id: Id
    equipment_id: Id
    device_kind: Known[Literal["expansion", "standalone_controller"]] | None
    interface_id: Known[Id] | None
    compatible_base_ids: Known[Names] | None
    channel_count: Known[Count] | None

    @model_validator(mode="after")
    def compatible_bases_unique(self) -> Self:
        if self.compatible_base_ids is not None:
            unique(self.compatible_base_ids.value, "compatible base identity")
        return self


class ExpansionCheck(Check):
    kind: Literal["expansion"]
    base_id: Id
    pool_id: Id
    accepted_interfaces: Known[Names] | None
    maximum_modules: Known[Count] | None
    maximum_channels: Known[Count] | None
    modules: list[ExpansionModule] = Field(min_length=1, max_length=1000)
    # Reuse the power solver, with an explicit link; no second bus-load math.
    power_check_id: Id | None

    @model_validator(mode="after")
    def ownership(self) -> Self:
        unique([m.module_id for m in self.modules], "module identity")
        if any(m.equipment_id not in self.equipment_ids for m in self.modules):
            raise ValueError("module references foreign equipment")
        if self.accepted_interfaces is not None:
            unique(self.accepted_interfaces.value, "expansion interface")
        return self


EngineeringCheck = Annotated[SignalCheck | AnalogRangeCheck | ResistiveLoadingCheck | ContactCheck |
                             PulseCheck | PowerCheck | MechanicalCheck | AllocationCheck | ExpansionCheck,
                             Field(discriminator="kind")]


class EngineeringInput(Contract):
    schema_version: Literal["bas_engineering_input_v1"] = "bas_engineering_input_v1"
    rule_version: Literal["declared_engineering_constraints_1"] = "declared_engineering_constraints_1"
    checks: list[EngineeringCheck] = Field(max_length=2000)

    @model_validator(mode="after")
    def check_ids(self) -> Self:
        unique([check.check_id for check in self.checks], "engineering check")
        # A shared physical supply must be calculated with all its loads in one
        # check, not made to look sufficient by splitting it across check rows.
        powers = [check for check in self.checks if isinstance(check, PowerCheck)]
        unique([check.supply_id for check in powers], "physical power supply")
        unique([load.load_id for check in powers for load in check.loads], "power load allocation")
        expansions = [check for check in self.checks if isinstance(check, ExpansionCheck)]
        unique([check.base_id for check in expansions], "expansion base allocation")
        unique([module.module_id for check in expansions for module in check.modules], "module allocation")
        endpoints: dict[str, Endpoint] = {}
        for check in self.checks:
            references = [check.source, check.sink] if isinstance(check, Connection) else []
            if isinstance(check, AllocationCheck):
                references += [e.endpoint for e in check.endpoints]
            for endpoint in references:
                previous = endpoints.get(endpoint.endpoint_id)
                if previous is not None and previous != endpoint:
                    raise ValueError("endpoint identity cannot change equipment or scope between checks")
                endpoints[endpoint.endpoint_id] = endpoint
        by_id = {check.check_id: check for check in self.checks}
        for check in self.checks:
            if isinstance(check, ExpansionCheck) and check.power_check_id is not None:
                power = by_id.get(check.power_check_id)
                if not isinstance(power, PowerCheck):
                    raise ValueError("expansion power dependency must reference a power check")
                if power.supply_id != check.base_id or power.pool_id != check.pool_id:
                    raise ValueError("expansion power dependency must belong to the same base and pool")
                loads = {load.load_id: load.equipment_id for load in power.loads}
                if any(loads.get(module.module_id) != module.equipment_id for module in check.modules):
                    raise ValueError("expansion power dependency must include every module with its equipment owner")
        return self
