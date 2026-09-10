"""Shared source-bound point-list observations; no installed-quantity inference."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from typing import Any, Literal

from pydantic import TypeAdapter, field_validator, model_validator

from .adapters import IndexedCell, IndexedRow, IndexedTable, indexed_columns, normalized_header, printed_count
from .models import Contract, Count, Identifier
from .sources import Box, SourceContext, SourcePage, SourceSpan, valid_box


class PointListInput(Contract):
    sources: SourceContext
    tables: list[IndexedTable]

    @field_validator("tables", mode="before")
    @classmethod
    def source_boxes(cls, tables: Any) -> Any:
        # This new boundary must not inherit the legacy projection's float
        # coercion. Check even uninterpreted cells; never alter the graph.
        if not isinstance(tables, list):
            return tables  # Normal model validation supplies the location.
        adapter: TypeAdapter[Box] = TypeAdapter(Box)
        for item in tables:
            table = item.model_dump() if isinstance(item, IndexedTable) else item
            if not isinstance(table, dict):
                continue
            cells = [table.get("title")]
            rows = table.get("rows", [])
            for row in rows if isinstance(rows, list) else []:
                if isinstance(row, dict) and isinstance(row.get("cells"), dict):
                    cells.extend(row["cells"].values())
            boxes = [table.get("region"), *(cell.get("bbox") for cell in cells if isinstance(cell, dict))]
            for box in boxes:
                if box is not None and not valid_box(adapter.validate_python(box)):
                    raise ValueError("Unordered indexed source box")
        return tables


class PointSource(Contract):
    source_id: Identifier | None
    page_id: Identifier | None
    sheet_key: Identifier
    column: str | None = None
    span_id: Identifier | None = None
    text: str
    bbox_px: Box | None

    @model_validator(mode="after")
    def ordered(self) -> PointSource:
        if self.bbox_px is not None and not valid_box(self.bbox_px):
            raise ValueError("Unordered point source box")
        return self


class PointObservation(Contract):
    kind: Literal["declared_io", "software_value", "attribute"]
    channel: str
    value: Count | None
    status: Literal["read", "ambiguous"]
    source: PointSource


class PointNote(Contract):
    kind: Literal["controller_provided", "lon_integrated"]
    subject: str
    source: PointSource


class PointRow(Contract):
    row_id: Identifier
    local_key: str
    name: str
    raw: IndexedRow
    status: Literal["interpreted", "unpopulated", "no_typed_requirement", "review_required"]
    observations: list[PointObservation]
    qualifiers: list[PointNote]
    uninterpreted_columns: list[str]
    unobserved_columns: list[str]
    issues: list[str]
    field_wiring_status: Literal["not_established"] = "not_established"


class PointMatrix(Contract):
    matrix_id: Identifier
    source_id: Identifier | None
    page_id: Identifier | None
    raw: IndexedTable
    header_rows: Count
    header_sources: list[PointSource]
    notes: list[PointNote]
    rows: list[PointRow]
    issues: list[str]
    quantity_basis: Literal["listed_matrix_only"] = "listed_matrix_only"


class PointListResult(Contract):
    schema_version: Literal["bas_point_lists_v1"] = "bas_point_lists_v1"
    rule_version: Literal["point_observations_1"] = "point_observations_1"
    scope: Literal["discovered_matrices_only"] = "discovered_matrices_only"
    project_complete: Literal[False] = False
    matrices: list[PointMatrix]
    issues: list[str]


IDENTITIES = {"POINTNAME", "POINTDESCRIPTION", "CONTROLPOINTS", "DESCRIPTION"}
ATTRIBUTES = {"ALARM", "TREND", "ADJUSTABLE", "SHOW ON GRAPHIC", "GRAPHIC", "READ ONLY", "READ WRITE"}


def digest(value: object) -> str:
    canonical = json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def identity_header(text: str) -> bool:
    return normalized_header(text).replace(" ", "") in IDENTITIES


def point_source(page: SourcePage | None, table: IndexedTable, cell: IndexedCell,
                 column: str | None = None, span_id: str | None = None) -> PointSource:
    return PointSource(source_id=page.source_id if page else None, page_id=page.page_id if page else None,
                       sheet_key=table.sheet, column=column, span_id=span_id, text=cell.text, bbox_px=cell.bbox)


def note_grammar(span: SourceSpan) -> tuple[Literal["controller_provided", "lon_integrated"], str] | None:
    if span.rotation not in (None, 0):
        return None
    text = re.sub(r"\s+", " ", span.text.upper()).strip()
    match = re.fullmatch(r"\* INDICATES POINT PULLED FROM ([A-Z][A-Z0-9 -]{0,60}) CONTROLLER\.?", text)
    if match:
        return "controller_provided", match[1] + " CONTROLLER"
    if re.fullmatch(r'NOTE: "\*" INDICATES A POINT THAT IS LON-INTEGRATED WITH DRIVE\.?', text):
        return "lon_integrated", "DRIVE"
    return None


def note_fits(span: SourceSpan, table: IndexedTable, start: int) -> bool:
    if table.region is None:
        return False
    boxes = [c.bbox for r in table.rows[start:] for c in r.cells.values() if c.bbox is not None]
    if not boxes:
        return False
    x0, y0, x1, _y1 = span.bbox_px
    height = span.bbox_px[3] - y0
    if height <= 0:
        return False
    return (table.region[0] <= x0 and x1 <= table.region[2]
            and max(box[3] for box in boxes) <= y0
            and y0 <= table.region[3] + 4 * height)


def review_point_lists(payload: PointListInput) -> PointListResult:
    # Revalidate nested mutations and detach all output from caller-owned data.
    payload = PointListInput.model_validate(payload.model_dump())
    by_sheet = {alias: page for page in payload.sources.pages for alias in page.sheet_keys}
    selected = []
    for table in payload.tables:
        typed, header_evidence, start = indexed_columns(table)
        effective = {h: table.rows[0].cells[h].text if start and h in table.rows[0].cells else h for h in table.headers}
        names = [h for h, label in effective.items() if identity_header(label)]
        title = table.title.text if table.title else ""
        caption_text = normalized_header(title)
        caption = (not re.match(r"^(?:SEE|REFER|REFERENCE|PER)\b", caption_text)
                   and bool(re.search(r"\b(?:POINTS? ?(?:LIST|SCHEDULE)|I\s*/\s*O LIST)$", caption_text)))
        if not caption and not (names and len(set(typed.values())) >= 2):
            continue
        page = by_sheet.get(table.sheet)
        material = [page.source_id if page else None, page.page_number if page else table.sheet, table.region, title]
        matrix_id = "matrix:" + digest(material)
        selected.append((matrix_id, table, page, typed, header_evidence, start, effective, names))

    matrix_counts = Counter(item[0] for item in selected)
    if any(n > 1 for n in matrix_counts.values()):
        raise ValueError("Duplicate indexed matrix identity; reconcile source regions explicitly")

    bound_notes: dict[str, list[PointNote]] = {item[0]: [] for item in selected}
    note_conflicts: set[str] = set()
    for page in payload.sources.pages:
        for span in page.spans:
            meaning = note_grammar(span)
            if meaning is None:
                continue
            owners = [item for item in selected if item[2] is not None
                      and item[2].page_id == page.page_id and note_fits(span, item[1], item[5])]
            if len(owners) != 1:
                note_conflicts.update(item[0] for item in owners)
                continue
            matrix_id, table = owners[0][0], owners[0][1]
            bound_notes[matrix_id].append(PointNote(kind=meaning[0], subject=meaning[1],
                source=point_source(page, table, IndexedCell(text=span.text, bbox=span.bbox_px), span_id=span.span_id)))

    matrices = []
    for matrix_id, table, page, typed, header_evidence, start, effective, names in selected:
        issues = []
        if page is None:
            issues.append("SOURCE_PAGE_UNAVAILABLE")
        if not typed:
            issues.append("POINT_COLUMNS_UNRESOLVED")
        if len(names) != 1:
            issues.append("POINT_NAME_COLUMN_UNRESOLVED")
        if table.region is None:
            issues.append("TABLE_REGION_UNAVAILABLE")
        if matrix_id in note_conflicts:
            issues.append("FOOTNOTE_TABLE_SCOPE_AMBIGUOUS")
        notes = sorted(bound_notes[matrix_id], key=lambda n: n.source.span_id or "")
        local_keys = Counter(r.key for r in table.rows[start:])
        occurrences: Counter[str] = Counter()
        rows = []
        for raw in sorted(table.rows[start:], key=lambda r: (
                min((c.bbox[1] for c in r.cells.values() if c.bbox is not None), default=float("inf")),
                r.key, digest(r.model_dump()))):
            name = raw.cells[names[0]].text if len(names) == 1 and names[0] in raw.cells else ""
            row_issues = []
            if local_keys[raw.key] > 1:
                row_issues.append("DUPLICATE_LOCAL_ROW_KEY")
            observations = []
            uninterpreted = []
            # Graph rows are deliberately sparse. No cell means no observed
            # value/box, not an explicitly printed zero and not proof of loss.
            unobserved = sorted(h for h in table.headers if h not in raw.cells)
            for header, cell in raw.cells.items():
                if header in typed:
                    kind, channel = typed[header]
                    observation_kind: Literal["declared_io", "software_value", "attribute"] = "declared_io" if kind == "physical" else "software_value"
                elif normalized_header(effective.get(header, header)) in ATTRIBUTES:
                    channel, observation_kind = normalized_header(effective.get(header, header)), "attribute"
                else:
                    if (cell.text.strip() and header not in names
                            and normalized_header(effective.get(header, header)) not in {"TAG", "MARK", "COL1"}):
                        uninterpreted.append(header)
                    continue
                value = printed_count(cell.text)
                if value is None:
                    row_issues.append("POINT_CELL_AMBIGUOUS")
                if cell.bbox is None:
                    row_issues.append("POINT_CELL_REGION_UNAVAILABLE")
                observations.append(PointObservation(kind=observation_kind, channel=channel, value=value,
                    status="ambiguous" if value is None else "read", source=point_source(page, table, cell, header)))
            qualifiers = []
            if "*" in name:
                if name.endswith("*") and name.count("*") == 1 and len(notes) == 1 and matrix_id not in note_conflicts:
                    qualifiers = notes
                else:
                    row_issues.append("POINT_FOOTNOTE_UNRESOLVED")
            positive = any(o.kind != "attribute" and o.value for o in observations)
            if uninterpreted:
                row_issues.append("POINT_COLUMNS_UNINTERPRETED")
            if observations and not name.strip():
                row_issues.append("POINT_NAME_UNAVAILABLE")
            if name and raw.cells[names[0]].bbox is None:
                row_issues.append("POINT_NAME_REGION_UNAVAILABLE")
            populated = bool(name.strip() or any(c.text.strip() for h, c in raw.cells.items()
                                                if h not in names and normalized_header(effective.get(h, h)) not in {"TAG", "MARK", "COL1"}))
            status: Literal["interpreted", "unpopulated", "no_typed_requirement", "review_required"] = (
                "review_required" if row_issues or issues else "interpreted" if positive
                else "no_typed_requirement" if populated else "unpopulated")
            fingerprint = digest([matrix_id, raw.model_dump()])
            occurrences[fingerprint] += 1
            rows.append(PointRow(row_id=f"row:{fingerprint}:{occurrences[fingerprint]}", local_key=raw.key,
                name=name, raw=raw, status=status, observations=sorted(observations, key=lambda o: o.source.column or ""),
                qualifiers=qualifiers, uninterpreted_columns=sorted(uninterpreted), unobserved_columns=unobserved,
                issues=sorted(set(row_issues))))
        matrices.append(PointMatrix(matrix_id=matrix_id, source_id=page.source_id if page else None,
            page_id=page.page_id if page else None, raw=table, header_rows=start,
            header_sources=[point_source(page, table, IndexedCell(text=e.text or "", bbox=e.bbox_px), e.column) for e in header_evidence],
            notes=notes, rows=rows, issues=issues))
    return PointListResult(matrices=sorted(matrices, key=lambda m: m.matrix_id),
                           issues=["SOURCE_DISCOVERY_COVERAGE_UNVERIFIED"])
