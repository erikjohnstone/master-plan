"""Read existing indexed facts and explicit dataframe columns, never PDF geometry."""

from __future__ import annotations

import hashlib
import json
import re
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import (Contract, Diagnostic, EngineRequest, EquipmentGroup, Evidence,
                     HardwareProfile, IOVector, IpCloset, LicensePolicy,
                     PointRequirement, SerialRoute, SoftVariable, SparePolicy)

if TYPE_CHECKING:
    import pandas as pd


class Observed(BaseModel):
    # The existing graph has additional geometry and metadata we do not consume.
    # Ignoring those fields keeps this a read-only projection, not a new graph contract.
    model_config = ConfigDict(extra="ignore")


class IndexedCell(Observed):
    text: str = ""
    bbox: tuple[float, float, float, float] | None = None


class IndexedRow(Observed):
    key: str = ""
    cells: dict[str, IndexedCell] = Field(default_factory=dict)


class IndexedTable(Observed):
    sheet: str
    title: IndexedCell | None = None
    headers: list[str] = Field(default_factory=list)
    region: tuple[float, float, float, float] | None = None
    rows: list[IndexedRow] = Field(default_factory=list)


class BlueprintOptions(Contract):
    """Optional engineering policy; no manufacturer data or defaults are inferred."""
    hardware: HardwareProfile | None = None
    spare: SparePolicy = Field(default_factory=SparePolicy)
    licenses: list[LicensePolicy] = Field(default_factory=list)
    serial_routes: list[SerialRoute] = Field(default_factory=list)
    ip_closets: list[IpCloset] = Field(default_factory=list)
    group_overrides: list[EquipmentGroup] = Field(default_factory=list)
    soo: list[PointRequirement] | None = None

    @model_validator(mode="after")
    def unique_overrides(self) -> BlueprintOptions:
        if len({g.group_id for g in self.group_overrides}) != len(self.group_overrides):
            raise ValueError("duplicate group override identity")
        return self


class BlueprintInput(Contract):
    tables: list[IndexedTable]
    sequence_count: int = Field(default=0, ge=0, strict=True)
    options: BlueprintOptions = Field(default_factory=BlueprintOptions)


class DataframeColumns(Contract):
    group_id: str = "group_id"
    point_id: str = "point_id"
    AI: str = "AI"
    AO: str = "AO"
    DI: str = "DI"
    DO: str = "DO"


def dataframe_requirements(frame: pd.DataFrame, columns: DataframeColumns | None = None) -> list[PointRequirement]:
    """Explicit mapped physical-count dataframe. NaN/unknown is not silently zero.

    Network variables use PointRequirement.soft, not these four physical columns.
    Rows are per instance; scaling is declared once in EngineRequest.groups.
    """
    mapping = columns or DataframeColumns()
    names = list(mapping.model_dump().values())
    if len(names) != len(set(names)):
        raise ValueError("dataframe columns must map one-to-one")
    if not frame.columns.is_unique or any(n not in frame.columns for n in names):
        raise ValueError("dataframe requires unique, explicitly mapped identity and four I/O columns")
    result = []
    for row in frame.to_dict(orient="records"):
        result.append(PointRequirement(group_id=row[mapping.group_id], point_id=row[mapping.point_id],
                                       physical=IOVector(AI=row[mapping.AI], AO=row[mapping.AO],
                                                         DI=row[mapping.DI], DO=row[mapping.DO])))
    return result


def normalized_header(value: str) -> str:
    return re.sub(r"\s+", " ", value.upper().replace("_", " ")).strip()


PHYSICAL_COLUMN_SCOPE = re.compile(r"\b(?:HARDWARE|HARDWIRED|HARD WIRED|PHYSICAL)\b")
SOFTWARE_COLUMN_SCOPE = re.compile(r"\b(?:SOFTWARE|INTEGRATION|SOFT|NETWORK|BACNET|MODBUS|KNX)\b")
POINT_TYPE_HEADERS = {"POINT TYPE", "I/O TYPE", "IO TYPE"}
POINT_TYPE_CHANNELS = {
    "AI": "AI", "ANALOG INPUT": "AI",
    "AO": "AO", "ANALOG OUTPUT": "AO",
    "DI": "DI", "DIGITAL INPUT": "DI", "BI": "DI", "BINARY INPUT": "DI",
    "DO": "DO", "DIGITAL OUTPUT": "DO", "BO": "DO", "BINARY OUTPUT": "DO",
}
# SHOULD THIS BE ON THE SHARED PATH? Yes: a printed point mark determines
# source-backed BAS point truth for both browser and MCP workflows.  Leading
# zeroes are a common authored convention (AI01/BO001), not a different point
# type.  Keep the token bounded to four digits and reject the all-zero form so
# permissive numeric text never becomes a point by accident.
POINT_MARK = re.compile(
    r"^(AI|AO|BI|BO|DI|DO|AV|BV|MI|MO|MSV)\s*[-]?\s*(?=\d{1,4}\*?$)(?!0+\*?$)\d+\*?$",
    re.I,
)


def column_type(header: str) -> tuple[Literal["physical", "soft"], str] | None:
    h = normalized_header(header)
    aliases = {"AI": "AI", "AO": "AO", "DI": "DI", "DO": "DO", "BI": "DI", "BO": "DO",
               "ANALOG INPUT": "AI", "ANALOG INPUTS": "AI", "ANALOG OUTPUT": "AO", "ANALOG OUTPUTS": "AO",
               "DIGITAL INPUT": "DI", "DIGITAL INPUTS": "DI", "DIGITAL OUTPUT": "DO", "DIGITAL OUTPUTS": "DO",
               "BINARY INPUT": "DI", "BINARY INPUTS": "DI", "BINARY OUTPUT": "DO", "BINARY OUTPUTS": "DO"}
    soft = ("AV", "BV", "MV", "ANALOG VALUE", "ANALOG VALUES", "BINARY VALUE", "BINARY VALUES", "MULTISTATE VALUE",
            "ANALOG VARIABLE", "BINARY VARIABLE", "MULTISTATE VARIABLE", "MULTISTAGE VARIABLE")
    if h in soft:
        return "soft", h
    network = SOFTWARE_COLUMN_SCOPE.search(h)
    physical = PHYSICAL_COLUMN_SCOPE.search(h)
    # A contradictory parent is unresolved, not whichever scope we test first.
    # DDC alone is not a contradiction: DDC INTEGRATION is a valid soft scope.
    if network and physical:
        return None
    for name in sorted(aliases, key=len, reverse=True):
        if h == name:
            return "physical", aliases[name]
        if h.endswith(" " + name):
            if network:
                return "soft", name
            if physical or re.search(r"\bDDC\b", h):
                return "physical", aliases[name]
    if network and any(h.endswith(" "+name) for name in soft):
        return "soft", h
    return None


def indexed_columns(table: IndexedTable) -> tuple[dict[str, tuple[Literal["physical", "soft"], str]], list[Evidence], int]:
    """Consume an explicit first-row subheader without modifying the graph.

    Recognition requires a header identity and at least two typed subheadings
    beneath declared hardwired/network parent groups. An arbitrary data row or
    a generic ANALOG/DIGITAL heading cannot establish terminal direction.
    """
    headers = list(dict.fromkeys([*table.headers, *(h for r in table.rows for h in r.cells)]))
    typed = {h: detected for h in headers if (detected := column_type(h)) is not None}
    if not table.rows:
        return typed, [], 0
    first = table.rows[0]
    identities = {"CONTROL POINTS", "POINT NAME", "POINT DESCRIPTION", "DESCRIPTION", "POINTS"}
    if not any(normalized_header(c.text) in identities for c in first.cells.values()):
        return typed, [], 0
    children: dict[str, tuple[Literal["physical", "soft"], str]] = {}
    cites: list[Evidence] = []
    for h, cell in first.cells.items():
        parent = re.sub(r"\s+\d+$", "", normalized_header(h))
        if not (PHYSICAL_COLUMN_SCOPE.search(parent) or SOFTWARE_COLUMN_SCOPE.search(parent)):
            continue
        detected = column_type(parent + " " + cell.text)
        if detected is not None:
            children[h] = detected
            cites.append(Evidence(sheet_id=table.sheet, table_title=table.title.text if table.title else None,
                                  row_key=first.key, column=h, text=cell.text, bbox_px=cell.bbox, origin="blueprint_index"))
    if len(children) < 2:
        return typed, [], 0
    return {**typed, **children}, cites, 1


def printed_count(text: str) -> int | None:
    token = text.strip().upper()
    if token in ("", "-", "—", "–", "N/A", "NA", "NO", "N", "FALSE"):
        return 0
    if token in ("X", "✓", "✔", "●", "•", "YES", "Y", "TRUE"):
        return 1
    if re.fullmatch(r"\d+", token):
        return int(token)
    return None


def point_matrix_caption(text: str) -> bool:
    """Recognize an explicit point-matrix caption without accepting references."""
    title = normalized_header(text)
    if not title or re.match(r"^(?:SEE|REFER|REFERENCE|PER)\b", title):
        return False
    return bool(re.search(
        r"\b(?:POINTS?\s+(?:LIST|SCHEDULE)|POINT\s+FUNCTION\s+SCHEDULE|"
        r"BACNET\s+INTERFACE\s+SCHEDULE|I\s*/\s*O\s+LIST|IO\s+LIST)\b",
        title,
    ))


def point_type_header(text: str) -> bool:
    header = normalized_header(text)
    if header in POINT_TYPE_HEADERS:
        return True
    return bool(re.fullmatch(
        r"(?:HARDWARE|HARDWIRED|HARD WIRED|PHYSICAL) (?:POINT TYPE|I/O TYPE|IO TYPE)",
        header,
    ))


def row_point_channel(text: str) -> str | None:
    """Read a printed per-row physical I/O type; never infer from a point name."""
    return POINT_TYPE_CHANNELS.get(normalized_header(text))


def point_mark_channel(text: str) -> str | None:
    """Read a source-printed directional point identifier such as AI1/BO-12."""
    typed = point_mark_kind(text)
    return typed[1] if typed and typed[0] == "physical" else None


def point_mark_kind(text: str) -> tuple[Literal["physical", "soft"], str] | None:
    """Classify an exact printed point/object mark without inferring its role."""
    match = POINT_MARK.fullmatch(text.strip())
    if match is None:
        return None
    token = match.group(1).upper()
    if token in {"AI", "AO", "BI", "BO", "DI", "DO"}:
        return "physical", {"BI": "DI", "BO": "DO"}.get(token, token)
    return "soft", token


def indexed_request(payload: BlueprintInput) -> EngineRequest:
    groups: list[EquipmentGroup] = []
    points: list[PointRequirement] = []
    diagnostics: list[Diagnostic] = []
    for table in payload.tables:
        title = table.title.text if table.title else ""
        typed, column_evidence, data_start = indexed_columns(table)
        is_bas = bool(re.search(r"\b(?:BAS|DDC|POINTS?\s+(?:LIST|SCHEDULE)|POINT\s+FUNCTION\s+SCHEDULE|BACNET\s+INTERFACE\s+SCHEDULE|I\s*/\s*O)\b", title, re.I))
        has_point_identity = any(normalized_header(h) in {"POINT NAME", "POINT DESCRIPTION", "CONTROL POINTS", "DESCRIPTION"} for h in table.headers)
        row_type_headers = [header for header in table.headers if point_type_header(header)]
        has_marked_rows = any(sum(point_mark_kind(cell.text) is not None for cell in row.cells.values()) == 1
                              for row in table.rows[data_start:])
        # A directional point matrix establishes scope even when its title is
        # missing/nonstandard. Titles corroborate structure, not the only gate.
        typed_shape = ((len(set(typed.values())) >= 2 and (has_point_identity or bool(data_start)))
                       or (has_point_identity and len(row_type_headers) == 1
                           and any(row_point_channel(row.cells.get(row_type_headers[0], IndexedCell()).text)
                                   for row in table.rows[data_start:])))
        if not (is_bas or typed_shape):
            continue
        scope_material = json.dumps([table.sheet, title, table.region], separators=(",", ":"))
        group_id = "table-" + hashlib.sha256(scope_material.encode()).hexdigest()[:16]
        table_evidence = Evidence(sheet_id=table.sheet, table_title=title, text=title,
                                  bbox_px=table.region, origin="blueprint_index")
        if not typed and len(row_type_headers) != 1 and not has_marked_rows:
            diagnostics.append(Diagnostic(code="BAS_TABLE_UNTYPED", severity="warning", group_id=group_id,
                                          message="Indexed BAS table lacks explicit directional I/O or software-value columns; no copper count inferred from names or generic ANALOG/DIGITAL labels.",
                                          evidence=[table_evidence]))
            continue
        groups.append(EquipmentGroup(group_id=group_id, evidence=[table_evidence]))
        if data_start:
            diagnostics.append(Diagnostic(code="INDEX_SUBHEADERS_CONSUMED", severity="info", group_id=group_id,
                                          message="Explicit first-row subheadings establish physical versus integration column types; original indexed cells are unchanged.",
                                          evidence=column_evidence))
        diagnostics.append(Diagnostic(code="TABLE_SCOPE_NOT_EQUIPMENT_COUNT", severity="warning", group_id=group_id,
                                      message="Counts cover this listed table once. Template replication, controller grouping and installed equipment counts are not established by the table alone.",
                                      evidence=[table_evidence]))
        seen: set[str] = set()
        for row in table.rows[data_start:]:
            key = row.key.strip()
            if not key or normalized_header(key) in ("TAG", "MARK", "POINT", "TOTAL", "TOTALS", "DESCRIPTION"):
                continue
            identity = row.cells.get("POINT NAME") or row.cells.get("DESCRIPTION") or row.cells.get("TAG") or row.cells.get("MARK")
            if identity is None:
                identity = next((c for c in row.cells.values() if c.text.strip() == key), None)
            ev = Evidence(sheet_id=table.sheet, table_title=title, row_key=key,
                          text=(identity.text if identity else key), bbox_px=identity.bbox if identity else None,
                          origin="blueprint_index")
            if key in seen:
                diagnostics.append(Diagnostic(code="INDEX_DUPLICATE_POINT", severity="error", group_id=group_id,
                                              point_id=key, message="Repeated local row identity is ambiguous; additional occurrence withheld, not silently added.", evidence=[ev]))
                continue
            seen.add(key)
            physical = {k: 0 for k in ("AI", "AO", "DI", "DO")}
            soft: list[SoftVariable] = []
            evidence = [ev, *column_evidence]
            valid, recognized = True, False
            channels_seen: set[str] = set()
            if not typed and not row_type_headers:
                mark_cells = [(header, cell) for header, cell in row.cells.items()
                              if point_mark_kind(cell.text) is not None]
                if len(mark_cells) == 1:
                    header, cell = mark_cells[0]
                    mark_kind = point_mark_kind(cell.text)
                    assert mark_kind is not None
                    kind, channel = mark_kind
                    cite = Evidence(sheet_id=table.sheet, table_title=title, row_key=key, column=header,
                                    text=cell.text, bbox_px=cell.bbox, origin="blueprint_index")
                    recognized = True
                    if kind == "physical":
                        channels_seen.add(channel)
                        physical[channel] = 1
                    else:
                        soft.append(SoftVariable(protocol="bacnet" if "BACNET" in title.upper() else "other",
                                                 variable_id=key, quantity=1))
                    evidence.append(cite)
            if len(row_type_headers) == 1:
                type_header = row_type_headers[0]
                type_cell = row.cells.get(type_header)
                if type_cell is not None:
                    cite = Evidence(sheet_id=table.sheet, table_title=title, row_key=key, column=type_header,
                                    text=type_cell.text, bbox_px=type_cell.bbox, origin="blueprint_index")
                    type_channel = row_point_channel(type_cell.text)
                    if type_channel is None:
                        valid = False
                        diagnostics.append(Diagnostic(code="INDEX_POINT_TYPE_AMBIGUOUS", severity="warning",
                                                      group_id=group_id, point_id=key,
                                                      message="Cannot safely interpret the printed per-row POINT TYPE; row withheld from math.",
                                                      evidence=[cite]))
                    else:
                        recognized = True
                        channels_seen.add(type_channel)
                        physical[type_channel] = 1
                        evidence.append(cite)
            for typed_header, (kind, typed_channel) in typed.items():
                typed_cell = row.cells.get(typed_header)
                if typed_cell is None:
                    continue
                count = printed_count(typed_cell.text)
                cite = Evidence(sheet_id=table.sheet, table_title=title, row_key=key, column=typed_header,
                                text=typed_cell.text, bbox_px=typed_cell.bbox, origin="blueprint_index")
                if count is None:
                    valid = False
                    diagnostics.append(Diagnostic(code="INDEX_COUNT_AMBIGUOUS", severity="warning", group_id=group_id,
                                                  point_id=key, message=f"Cannot safely interpret I/O cell {typed_header!r}; row withheld from math.", evidence=[cite]))
                    continue
                evidence.append(cite)
                if not count:
                    continue
                recognized = True
                if kind == "physical":
                    if typed_channel in channels_seen:
                        valid = False
                        diagnostics.append(Diagnostic(code="INDEX_DUPLICATE_CHANNEL", severity="warning", group_id=group_id,
                                                      point_id=key, message="Multiple columns map to the same physical channel; row withheld until column scope is clarified.", evidence=[cite]))
                    channels_seen.add(typed_channel)
                    physical[typed_channel] = count
                else:
                    protocol: Literal["bacnet", "modbus", "knx", "other"] = "other"
                    for token in ("bacnet", "modbus", "knx"):
                        if token in typed_header.lower():
                            if token == "bacnet":
                                protocol = "bacnet"
                            elif token == "modbus":
                                protocol = "modbus"
                            else:
                                protocol = "knx"
                    soft.append(SoftVariable(protocol=protocol, variable_id=f"{key}:{typed_header}", quantity=count))
                    diagnostics.append(Diagnostic(code="SOFT_MAPPING_UNVERIFIED", severity="warning", group_id=group_id,
                                                  point_id=key, message="Listed software variable retained separately from copper; device/object mapping and license weight need confirmation.", evidence=[cite]))
            if not recognized:
                diagnostics.append(Diagnostic(code="INDEX_ROW_NO_TYPED_POINTS", severity="info", group_id=group_id,
                                              point_id=key, message="No positive typed I/O or software-value cell. Alarm/trend-only rows do not create physical terminals.", evidence=[ev]))
            if valid and recognized:
                points.append(PointRequirement(group_id=group_id, point_id=key,
                                               physical=IOVector(**physical), soft=soft, evidence=evidence))
    if not groups:
        diagnostics.append(Diagnostic(code="BAS_INDEX_NO_TYPED_TABLES", severity="warning",
                                      message="No typed BAS point table available in the current index; this does not prove the blueprint has none."))
    diagnostics.append(Diagnostic(code="SOO_TYPING_UNAVAILABLE" if payload.sequence_count else "SOO_INDEX_NOT_FOUND",
                                  severity="warning", message=(
                                      f"Index exposes {payload.sequence_count} sequence(s), but narrative has not been converted into verified typed requirements."
                                      if payload.sequence_count else "No sequence returned by the current index; inspect the blueprint before concluding SOO is absent.")))
    if payload.options.soo is not None:
        diagnostics[-1] = Diagnostic(code="SOO_STRUCTURED_INPUT", severity="info",
                                     message="Explicit typed SOO requirements were supplied; their provenance is carried on each requirement, not inferred from the index.")
    diagnostics.append(Diagnostic(code="INDEX_COVERAGE_UNVERIFIED", severity="warning",
                                  message="Math covers indexed, typed cells only; source completeness, wire distances and equipment replication require verification."))
    by_id = {g.group_id: g for g in groups}
    for override in payload.options.group_overrides:
        if override.group_id in by_id:
            original = by_id[override.group_id]
            by_id[override.group_id] = EquipmentGroup(**{**override.model_dump(), "evidence": original.evidence})
        else:
            # Additional groups are allowed for explicitly typed SOO-only equipment.
            if not any(p.group_id == override.group_id for p in payload.options.soo or []):
                raise ValueError(f"Unknown group override {override.group_id!r}")
            by_id[override.group_id] = override
    point_source = points if groups or payload.options.soo is None else None
    return EngineRequest(groups=list(by_id.values()), point_list=point_source, soo=payload.options.soo,
                         hardware=payload.options.hardware, spare=payload.options.spare,
                         licenses=payload.options.licenses, serial_routes=payload.options.serial_routes,
                         ip_closets=payload.options.ip_closets, input_diagnostics=diagnostics)
