"""Shared source-bound point-list observations; no installed-quantity inference."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from typing import Any, Literal

from pydantic import TypeAdapter, field_validator, model_validator

from .adapters import (IndexedCell, IndexedRow, IndexedTable, indexed_columns, normalized_header,
                       point_mark_kind, point_matrix_caption, point_type_header, printed_count,
                       row_point_channel)
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
ROW_METADATA = {"TAG", "MARK", "COL1", "POINT NUMBER", "POINT NO", "NO",
                "HARDWARE TAG", "PHYSICAL TAG", "HARDWIRED TAG", "HARD WIRED TAG"}


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


def box_center(box: Box) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def union_boxes(boxes: list[Box]) -> Box:
    return (min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes))


def same_printed_line(left: SourceSpan, right: SourceSpan) -> bool:
    left_height = left.bbox_px[3] - left.bbox_px[1]
    right_height = right.bbox_px[3] - right.bbox_px[1]
    tolerance = max(3.0, min(left_height, right_height) * 0.35)
    return abs(box_center(left.bbox_px)[1] - box_center(right.bbox_px)[1]) <= tolerance


def boxes_overlap(left: Box | None, right: Box | None) -> bool:
    if left is None or right is None:
        return False
    return min(left[2], right[2]) > max(left[0], right[0]) and min(left[3], right[3]) > max(left[1], right[1])


def source_point_function_tables(sources: SourceContext) -> list[IndexedTable]:
    """Recover bounded core columns from an explicit vector-text point schedule.

    This is a consumer-side fallback for a table the shared graph omitted or
    truncated. It requires a POINT FUNCTION SCHEDULE caption plus the printed
    POINT NAME, TAG and POINT TYPE headers, and then binds only rows with an
    aligned printed integer, name, tag and exact directional I/O type. Other
    schedule columns remain unresolved instead of being reconstructed by
    proximity or mark shape.
    """
    tables: list[IndexedTable] = []
    for page in sources.pages:
        spans = [span for span in page.spans if span.text.strip()]
        titles = [span for span in spans if re.search(r"\bPOINT\s+FUNCTION\s+SCHEDULE\b",
                                                      normalized_header(span.text))
                  and point_matrix_caption(span.text)]
        for title in titles:
            title_x0, title_y0, title_x1, title_y1 = title.bbox_px
            header_window_y = title_y1 + page.height_px * 0.20
            type_headers = [span for span in spans if span.source_index > title.source_index
                            and point_type_header(span.text)
                            and title_y0 <= span.bbox_px[1] <= header_window_y
                            and title_x0 - page.width_px * 0.08 <= box_center(span.bbox_px)[0]
                            <= title_x1 + page.width_px * 0.08]
            if len(type_headers) != 1:
                continue
            type_header = type_headers[0]
            header_y1 = type_header.bbox_px[3] + page.height_px * 0.02
            name_headers = [span for span in spans if normalized_header(span.text) in {"POINT NAME", "POINT DESCRIPTION"}
                            and title.source_index < span.source_index
                            and title_y1 <= span.bbox_px[1] <= header_y1
                            and box_center(span.bbox_px)[0] < box_center(type_header.bbox_px)[0]]
            tag_headers = [span for span in spans if normalized_header(span.text) == "TAG"
                           and title.source_index < span.source_index
                           and title_y1 <= span.bbox_px[1] <= header_y1
                           and box_center(span.bbox_px)[0] < box_center(type_header.bbox_px)[0]]
            if len(name_headers) != 1 or len(tag_headers) != 1:
                continue
            name_header, tag_header = name_headers[0], tag_headers[0]
            name_x = box_center(name_header.bbox_px)[0]
            tag_x = box_center(tag_header.bbox_px)[0]
            type_x = box_center(type_header.bbox_px)[0]
            if not name_x < tag_x < type_x:
                continue
            next_title_y = min((other.bbox_px[1] for other in titles if other.bbox_px[1] > title_y0),
                               default=page.height_px)
            type_tolerance = max(18.0, page.width_px * 0.012)
            row_types = sorted((span for span in spans
                if row_point_channel(span.text) is not None
                and max(name_header.bbox_px[3], type_header.bbox_px[3]) - 6 <= span.bbox_px[1] < next_title_y
                and abs(box_center(span.bbox_px)[0] - type_x) <= type_tolerance),
                key=lambda span: (box_center(span.bbox_px)[1], span.source_index))
            recovered: list[IndexedRow] = []
            seen_numbers: set[str] = set()
            for index, type_span in enumerate(row_types):
                row_y = box_center(type_span.bbox_px)[1]
                number_candidates = []
                for span in spans:
                    if not (name_header.bbox_px[0] - page.width_px * 0.18 <= span.bbox_px[0] < name_header.bbox_px[0]
                            and same_printed_line(span, type_span)):
                        continue
                    token = span.text.strip()
                    match = re.fullmatch(r"([1-9]\d{0,3})", token)
                    # Some vector PDFs coalesce the row number with distant
                    # title-block text into one span (for example CONTROLS-19).
                    # Accept only a final hyphenated integer anchored from the
                    # numeric column and still require the aligned name/tag/type.
                    if match is None and span.bbox_px[2] >= type_x:
                        match = re.search(r"[-–—]\s*([1-9]\d{0,3})$", token)
                    if match is not None:
                        number_candidates.append((span, match.group(1), match.start() != 0))
                if not number_candidates:
                    continue
                number, key, coalesced = min(number_candidates, key=lambda candidate: (
                    candidate[2], abs(box_center(candidate[0].bbox_px)[1] - row_y),
                    -candidate[0].bbox_px[0], candidate[0].source_index))
                if key in seen_numbers:
                    continue
                tag_right = (tag_x + type_x) / 2
                tag_candidates = [span for span in spans if tag_header.bbox_px[0] - page.width_px * 0.02 <= box_center(span.bbox_px)[0] < tag_right
                                  and span.text.strip() and same_printed_line(span, type_span)
                                  and span.source_index not in {number.source_index, type_span.source_index}]
                if not tag_candidates:
                    continue
                tag = min(tag_candidates, key=lambda span: (
                    abs(box_center(span.bbox_px)[0] - tag_x), span.source_index))
                next_y = (box_center(row_types[index + 1].bbox_px)[1] + row_y) / 2 if index + 1 < len(row_types) else (
                    row_y + max(24.0, page.height_px * 0.012))
                name_left = number.bbox_px[0] if coalesced else number.bbox_px[2]
                name_parts = [span for span in spans
                              if name_left < span.bbox_px[0] < tag_header.bbox_px[0]
                              and type_span.bbox_px[1] - 6 <= box_center(span.bbox_px)[1] < next_y
                              and span.source_index not in {number.source_index, tag.source_index, type_span.source_index}]
                if not name_parts:
                    continue
                name_parts.sort(key=lambda span: (box_center(span.bbox_px)[1], span.bbox_px[0], span.source_index))
                name_text = re.sub(r"\s+", " ", " ".join(span.text.strip() for span in name_parts)).strip()
                if not name_text:
                    continue
                name_box = union_boxes([span.bbox_px for span in name_parts])
                recovered.append(IndexedRow(key=key, cells={
                    "POINT NAME": IndexedCell(text=name_text, bbox=name_box),
                    "HARDWARE TAG": IndexedCell(text=tag.text, bbox=tag.bbox_px),
                    "HARDWARE POINT TYPE": IndexedCell(text=type_span.text, bbox=type_span.bbox_px),
                }))
                seen_numbers.add(key)
            if len(recovered) < 2:
                continue
            cells = [cell.bbox for row in recovered for cell in row.cells.values() if cell.bbox is not None]
            region = union_boxes([title.bbox_px, name_header.bbox_px, tag_header.bbox_px,
                                  type_header.bbox_px, *cells])
            tables.append(IndexedTable(sheet=page.sheet_keys[0],
                title=IndexedCell(text=title.text, bbox=title.bbox_px),
                headers=["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE"],
                region=region, rows=recovered))
    return tables


def source_marked_point_tables(sources: SourceContext) -> list[IndexedTable]:
    """Recover the printed point ID and description of a clipped point list.

    The fallback is limited to explicitly captioned DDC point lists and BACnet
    interface schedules whose vector text also prints NAME, DESCRIPTION and at
    least two review-attribute headers. It does not reconstruct attribute flags;
    those remain review work when the graph copy omitted the row.
    """
    tables: list[IndexedTable] = []
    for page in sources.pages:
        spans = [span for span in page.spans if span.text.strip()]
        titles = [span for span in spans
                  if point_matrix_caption(span.text)
                  and re.search(r"\b(?:DDC\s+POINTS?\s+LIST|BACNET\s+INTERFACE\s+SCHEDULE)\b",
                                normalized_header(span.text))]
        for title in titles:
            title_x0, title_y0, title_x1, title_y1 = title.bbox_px
            next_title_y = min((other.bbox_px[1] for other in titles if other.bbox_px[1] > title_y0),
                               default=page.height_px)
            header_limit = min(next_title_y, title_y1 + page.height_px * 0.10)
            header_spans = [span for span in spans if title.source_index < span.source_index
                            and title_y1 <= span.bbox_px[1] <= header_limit
                            and title_x0 - page.width_px * 0.10 <= box_center(span.bbox_px)[0]
                            <= title_x1 + page.width_px * 0.10]
            names = [span for span in header_spans if normalized_header(span.text) == "NAME"]
            descriptions = [span for span in header_spans if normalized_header(span.text) == "DESCRIPTION"]
            attributes = [span for span in header_spans if normalized_header(span.text) in ATTRIBUTES]
            if len(names) != 1 or len(descriptions) != 1 or len(attributes) < 2:
                continue
            name_header, description_header = names[0], descriptions[0]
            name_x = box_center(name_header.bbox_px)[0]
            description_x = box_center(description_header.bbox_px)[0]
            attribute_left = min(span.bbox_px[0] for span in attributes)
            if not name_x < description_x < attribute_left:
                continue
            mark_tolerance = max(24.0, page.width_px * 0.015)
            row_marks = sorted((span for span in spans
                if point_mark_kind(span.text) is not None
                and max(name_header.bbox_px[3], description_header.bbox_px[3]) - 4 <= span.bbox_px[1] < next_title_y
                and abs(box_center(span.bbox_px)[0] - name_x) <= mark_tolerance),
                key=lambda span: (box_center(span.bbox_px)[1], span.source_index))
            if not row_marks:
                continue
            # A later diagram can share AI/BO labels. Retain only the first
            # vertically contiguous run beginning below this table's headers.
            contiguous = [row_marks[0]]
            gap_limit = max(100.0, page.height_px * 0.05)
            for mark in row_marks[1:]:
                if box_center(mark.bbox_px)[1] - box_center(contiguous[-1].bbox_px)[1] > gap_limit:
                    break
                contiguous.append(mark)
            recovered: list[IndexedRow] = []
            for mark in contiguous:
                description_parts = [span for span in spans
                    if name_header.bbox_px[2] < span.bbox_px[0] < attribute_left
                    and same_printed_line(span, mark)
                    and span.source_index not in {mark.source_index, title.source_index,
                                                  name_header.source_index, description_header.source_index}]
                if not description_parts:
                    continue
                description_parts.sort(key=lambda span: (span.bbox_px[0], span.source_index))
                description = re.sub(r"\s+", " ", " ".join(
                    span.text.strip() for span in description_parts)).strip()
                if not description:
                    continue
                recovered.append(IndexedRow(key=mark.text.strip(), cells={
                    "POINT NAME": IndexedCell(text=description,
                                              bbox=union_boxes([span.bbox_px for span in description_parts])),
                    "POINT NUMBER": IndexedCell(text=mark.text, bbox=mark.bbox_px),
                }))
            if len(recovered) < 2:
                continue
            cells = [cell.bbox for row in recovered for cell in row.cells.values() if cell.bbox is not None]
            tables.append(IndexedTable(sheet=page.sheet_keys[0],
                title=IndexedCell(text=title.text, bbox=title.bbox_px),
                headers=["POINT NAME", "POINT NUMBER"],
                region=union_boxes([title.bbox_px, name_header.bbox_px, description_header.bbox_px,
                                    *[span.bbox_px for span in attributes], *cells]), rows=recovered))
    return tables


def point_tables_with_source_recovery(payload: PointListInput) -> tuple[list[IndexedTable], set[int]]:
    tables = list(payload.tables)
    recovered_ids: set[int] = set()
    for recovered in [*source_point_function_tables(payload.sources),
                      *source_marked_point_tables(payload.sources)]:
        title = normalized_header(recovered.title.text if recovered.title else "")
        matches = [index for index, table in enumerate(tables)
                   if table.sheet == recovered.sheet
                   and ((normalized_header(table.title.text if table.title else "") == title)
                        or (title and (title in normalized_header(table.title.text if table.title else "")
                                       or normalized_header(table.title.text if table.title else "") in title)
                            and boxes_overlap(table.region, recovered.region)))]
        if len(matches) != 1:
            if not matches:
                tables.append(recovered)
                recovered_ids.add(id(recovered))
            continue
        index = matches[0]
        existing = tables[index]
        if len(existing.rows) >= len(recovered.rows):
            continue
        existing_counts = Counter(row.key for row in existing.rows)
        existing_rows = {row.key: row for row in existing.rows if existing_counts[row.key] == 1}
        recovered_keys = {row.key for row in recovered.rows}
        merged_rows = []
        merged_headers = list(existing.headers)
        existing_identity_headers = [header for header in existing.headers if identity_header(header)]
        existing_type_headers = [header for header in existing.headers if point_type_header(header)]
        for row in recovered.rows:
            previous = existing_rows.get(row.key)
            mapped: dict[str, IndexedCell] = {}
            for header, cell in row.cells.items():
                target = header
                if header == "POINT NAME" and len(existing_identity_headers) == 1:
                    target = existing_identity_headers[0]
                elif header == "POINT NUMBER" and "NAME" in existing.headers:
                    target = "NAME"
                elif header == "HARDWARE TAG" and "TAG" in existing.headers:
                    target = "TAG"
                elif header == "HARDWARE POINT TYPE" and len(existing_type_headers) == 1:
                    target = existing_type_headers[0]
                mapped[target] = cell
                if target not in merged_headers:
                    merged_headers.append(target)
            merged_rows.append(IndexedRow(key=row.key,
                cells={**mapped, **(previous.cells if previous else {})}))
        # Recovery can extend an incomplete table but cannot erase graph
        # evidence outside its bounded row run. Duplicate graph keys stay
        # visible too, so the ordinary duplicate-key review gate can withhold
        # them rather than silently choosing one.
        merged_rows.extend(row for row in existing.rows
                           if row.key not in recovered_keys or existing_counts[row.key] > 1)
        regions = [box for box in (existing.region, recovered.region) if box is not None]
        tables[index] = IndexedTable(sheet=existing.sheet, title=existing.title or recovered.title,
            headers=merged_headers,
            region=union_boxes(regions) if regions else None, rows=merged_rows)
        recovered_ids.add(id(tables[index]))
    return tables, recovered_ids


def review_point_lists(payload: PointListInput) -> PointListResult:
    # Revalidate nested mutations and detach all output from caller-owned data.
    payload = PointListInput.model_validate(payload.model_dump())
    by_sheet = {alias: page for page in payload.sources.pages for alias in page.sheet_keys}
    selected = []
    candidate_tables, recovered_ids = point_tables_with_source_recovery(payload)
    for table in candidate_tables:
        typed, header_evidence, start = indexed_columns(table)
        effective = {h: table.rows[0].cells[h].text if start and h in table.rows[0].cells else h for h in table.headers}
        names = [h for h, label in effective.items() if identity_header(label)]
        row_type_headers = [h for h, label in effective.items() if point_type_header(label)]
        title = table.title.text if table.title else ""
        caption = point_matrix_caption(title)
        row_typed_shape = (len(names) == 1 and len(row_type_headers) == 1
                           and any(row_point_channel(row.cells.get(row_type_headers[0], IndexedCell()).text)
                                   for row in table.rows[start:]))
        if not caption and not (names and len(set(typed.values())) >= 2) and not row_typed_shape:
            continue
        page = by_sheet.get(table.sheet)
        material = [page.source_id if page else None, page.page_number if page else table.sheet, table.region, title]
        matrix_id = "matrix:" + digest(material)
        selected.append((matrix_id, table, page, typed, header_evidence, start, effective, names,
                         row_type_headers, id(table) in recovered_ids))

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
    for (matrix_id, table, page, typed, header_evidence, start, effective, names,
         row_type_headers, source_recovered) in selected:
        issues = []
        has_marked_rows = any(sum(point_mark_kind(cell.text) is not None for cell in row.cells.values()) == 1
                              for row in table.rows[start:])
        if page is None:
            issues.append("SOURCE_PAGE_UNAVAILABLE")
        if not typed and len(row_type_headers) != 1 and not has_marked_rows:
            issues.append("POINT_COLUMNS_UNRESOLVED")
        if len(row_type_headers) > 1:
            issues.append("POINT_TYPE_COLUMN_UNRESOLVED")
        if source_recovered and set(table.headers).issubset({
                "POINT NAME", "POINT NUMBER", "HARDWARE TAG", "HARDWARE POINT TYPE"}):
            issues.append("SOURCE_SPAN_CORE_COLUMNS_ONLY")
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
        # `table.rows` is the indexed source order retained in `raw`.  Do not
        # silently re-sort it by bbox: fragmented/merged vector tables can
        # legitimately carry a non-monotonic y order, and the source-bound
        # result must replay the exact matrix it cites.  Determinism comes from
        # the owned input order; changing it here makes `rows` disagree with
        # `raw.rows` and correctly fails the shared JS evidence contract.
        for raw in table.rows[start:]:
            name = raw.cells[names[0]].text if len(names) == 1 and names[0] in raw.cells else ""
            row_issues = []
            if local_keys[raw.key] > 1:
                row_issues.append("DUPLICATE_LOCAL_ROW_KEY")
            observations = []
            uninterpreted = []
            mark_observation_headers: set[str] = set()
            if not typed and not row_type_headers:
                mark_cells = [(header, cell) for header, cell in raw.cells.items()
                              if point_mark_kind(cell.text) is not None]
                if len(mark_cells) > 1:
                    row_issues.append("POINT_MARK_AMBIGUOUS")
                elif len(mark_cells) == 1:
                    header, cell = mark_cells[0]
                    mark_kind = point_mark_kind(cell.text)
                    assert mark_kind is not None
                    kind, mark_channel = mark_kind
                    if cell.bbox is None:
                        row_issues.append("POINT_CELL_REGION_UNAVAILABLE")
                    observations.append(PointObservation(kind="declared_io" if kind == "physical" else "software_value",
                        channel=mark_channel, value=1,
                        status="read", source=point_source(page, table, cell, header)))
                    mark_observation_headers.add(header)
            # Graph rows are deliberately sparse. No cell means no observed
            # value/box, not an explicitly printed zero and not proof of loss.
            unobserved = sorted(h for h in table.headers if h not in raw.cells)
            for header, cell in raw.cells.items():
                if header in mark_observation_headers:
                    continue
                observation_kind: Literal["declared_io", "software_value", "attribute"]
                channel: str
                value: int | None
                if len(row_type_headers) == 1 and header == row_type_headers[0]:
                    row_channel = row_point_channel(cell.text)
                    if row_channel is None:
                        row_issues.append("POINT_TYPE_AMBIGUOUS")
                        continue
                    channel = row_channel
                    observation_kind, value = "declared_io", 1
                elif header in typed:
                    kind, channel = typed[header]
                    observation_kind = "declared_io" if kind == "physical" else "software_value"
                    value = printed_count(cell.text)
                elif normalized_header(effective.get(header, header)) in ATTRIBUTES:
                    channel, observation_kind = normalized_header(effective.get(header, header)), "attribute"
                    value = printed_count(cell.text)
                else:
                    if (cell.text.strip() and header not in names
                            and normalized_header(effective.get(header, header)) not in ROW_METADATA):
                        uninterpreted.append(header)
                    continue
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
                                                if h not in names and normalized_header(effective.get(h, h)) not in ROW_METADATA))
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
