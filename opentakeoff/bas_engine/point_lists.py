"""Shared source-bound point-list observations; no installed-quantity inference."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from typing import Any, Literal

from pydantic import TypeAdapter, field_validator, model_validator

from .adapters import (CURRENT_POINT_RULE, POINT_RULE_V1, IndexedCell, IndexedRow, IndexedTable, PointRule,
                       alarm_cell_roles, normalized_header, point_columns, point_mark_kind, point_matrix_caption,
                       point_type_header, printed_count, row_point_channel)
from .models import Contract, Count, Evidence, Identifier
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
    rule_version: PointRule = CURRENT_POINT_RULE
    scope: Literal["discovered_matrices_only"] = "discovered_matrices_only"
    project_complete: Literal[False] = False
    matrices: list[PointMatrix]
    issues: list[str]


IDENTITIES = {"POINTNAME", "POINTDESCRIPTION", "CONTROLPOINTS", "DESCRIPTION"}
ATTRIBUTES = {"ALARM", "TREND", "ADJUSTABLE", "SHOW ON GRAPHIC", "GRAPHIC", "READ ONLY", "READ WRITE"}
ROW_METADATA = {"TAG", "MARK", "COL1", "POINT NUMBER", "POINT NO", "NO",
                "HARDWARE TAG", "PHYSICAL TAG", "HARDWIRED TAG", "HARD WIRED TAG"}

# Version 2 (point_observations_2) reads the columns standard point lists
# print around their I/O: the software functions a point carries (UFGS point
# function schedules, VA points lists, Guideline 13 lists), a row's number and
# its tags, and the parameters a point is programmed with. A function column is
# an attribute only when every cell it prints is a mark or a count; nothing it
# reads is a quantity. A note, a network or calculated point, and any column
# that names who furnishes, reuses or defers a point stay unread for review.
IDENTITIES_V2 = IDENTITIES | {"EQUIPMENTDESCRIPTION"}
ROW_METADATA_V2 = ROW_METADATA | {
    "#", "NO.", "ITEM", "ITEM NO", "ITEM NO.", "ITEM #", "POINT #", "POINT ID", "POINT TAG",
    "CONTROL POINT TAG", "DEVICE TAG", "ABBREVIATION", "ABBREV", "ABBREV.", "POINT ABBREVIATION",
    "OBJECT ID", "OBJECT INSTANCE", "POINT ADDRESS", "ADDRESS"}
FUNCTION_SCOPE = re.compile(
    r"\b(?:SOFTWARE|GUI|APPLICATIONS?|FUNCTIONS?|ALARMING|ALARMS?|TRENDS?|TRENDING|PRIORITIES|"
    r"FAIL(?:URE)?\s+MODES?|TRD|ALM|DISP|DISPLAY(?:ED)?|GRAPHICS?|ADJ|ADJUSTABLE|SCH|SCHED|"
    r"SCHEDULE[DS]?|LOOPS?|OVERRIDES?|RUN\s*TIME|TOTALIZ\w*|HISTORY|LOGGING)\b")
NOT_A_FUNCTION = re.compile(
    r"\b(?:NETWORK\s+POINTS?|CALCULATED\s+POINTS?|NOTES?|REMARKS?|COMMENTS?|OTHERS|EXISTING|FUTURE|"
    r"SPARES?|N\.?I\.?C\.?|ALTERNATES?|OPTIONAL|FURNISH\w*|PROVIDED|INSTALL\w*|REUSE[D]?|RELOCAT\w*|"
    r"REMOVE[D]?|DEMO\w*|VENDOR|FACTORY|OEM|MANUFACTURER|CONTRACTOR|DIV(?:ISION)?|INTEGRAT\w*)\b")
PARAMETER = re.compile(
    r"\b(?:LIMITS?|RANGES?|SET\s*POINTS?|SETPOINTS?|INTERVALS?|DURATIONS?|ACCURACY|DEADBANDS?|DELAYS?)\b")


def digest(value: object) -> str:
    canonical = json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def header_label(text: str, rule: PointRule = CURRENT_POINT_RULE) -> str:
    """A printed header as the rule reads it. Version 2 reads a header the
    extraction printed twice ("POINT ID POINT ID", a cell spanning two header
    rows) as the header once; the source header itself is never changed."""
    label = normalized_header(text)
    if rule == POINT_RULE_V1:
        return label
    words = label.split(" ")
    half = len(words) // 2
    return " ".join(words[:half]) if len(words) % 2 == 0 and half and words[:half] == words[half:] else label


def identity_header(text: str, rule: PointRule = CURRENT_POINT_RULE) -> bool:
    identities = IDENTITIES if rule == POINT_RULE_V1 else IDENTITIES_V2
    return header_label(text, rule).replace(" ", "") in identities


class ColumnRoles(Contract):
    """How a rule reads a matrix's columns that are neither typed I/O nor its
    point name: attribute channels, and columns that describe a row without
    being a point (its number, tags and programmed parameters)."""
    attributes: dict[str, str]
    metadata: list[str]


def column_roles(table: IndexedTable, start: int, typed: dict[str, tuple[Literal["physical", "soft"], str]],
                 rule: PointRule = CURRENT_POINT_RULE) -> ColumnRoles:
    """The one reading of a matrix's other columns, shared by the observation
    pass and every later check of a saved result under the rule that made it."""
    columns = list(dict.fromkeys([*table.headers, *(h for r in table.rows for h in r.cells)]))
    first = table.rows[0] if start and table.rows else None
    # Version 2: a header cell the extraction shares between several columns
    # ("AV BV ADJ SCH" over four) is not any one column's label; each column
    # is read by its own header.
    merged = Counter(c.bbox for h, c in first.cells.items() if h in table.headers and c.bbox is not None) \
        if first is not None and rule != POINT_RULE_V1 else Counter()
    attributes: dict[str, str] = {}
    metadata: list[str] = []
    for h in columns:
        if h in typed:
            continue
        cell = first.cells.get(h) if first is not None and h in table.headers else None
        child = cell.text if cell is not None and not (cell.bbox is not None and merged[cell.bbox] > 1) else h
        label = header_label(child, rule)
        if rule == POINT_RULE_V1:
            if label in ATTRIBUTES:
                attributes[h] = label
            elif label in ROW_METADATA:
                metadata.append(h)
            continue
        # A subheader is read with its group ("GUI APPLICATION" over "TREND LOGGING").
        parent = re.sub(r"\s+\d+$", "", normalized_header(h)) if child != h else ""
        full = header_label(parent if parent.endswith(label) else f"{parent} {child}".strip(), rule)
        values = [row.cells[h].text for row in table.rows[start:] if h in row.cells and row.cells[h].text.strip()]
        counts = all(printed_count(value, rule) is not None for value in values)
        if PARAMETER.search(full) and any(printed_count(value, rule) not in (0, 1) for value in values):
            # A limit, range or set point column printing its values ("55",
            # "2") programs the point; a mark under it only says it has one.
            counts = False
        if label in ATTRIBUTES:
            attributes[h] = label
        elif counts and values and FUNCTION_SCOPE.search(full) and not NOT_A_FUNCTION.search(full):
            attributes[h] = full
        elif label in ROW_METADATA_V2 or (PARAMETER.search(full) and not NOT_A_FUNCTION.search(full)):
            metadata.append(h)
        elif values and all(re.fullmatch(r"\d{1,4}", (row.cells[h].text if h in row.cells else "").strip())
                            and row.cells[h].text.strip() == row.key.strip()
                            for row in table.rows[start:] if h in row.cells and row.cells[h].text.strip()):
            # The column the row's own number was read from.
            metadata.append(h)
    return ColumnRoles(attributes=attributes, metadata=metadata)


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


def function_columns(spans: list[SourceSpan], title: SourceSpan, type_header: SourceSpan,
                     ) -> tuple[list[tuple[str, float, float]], float] | None:
    """Version 2: the columns a point function schedule prints right of its
    POINT TYPE, each under a rotated header and named with the group label
    printed over it, as the graph names them where it extracts the schedule
    ("FAIL MODE FAIL ON (OPEN)", "SOFTWARE TREND", "ALARM LIMITS LOW LIMIT"),
    then NOTES. Returns (name, left, right) per column and the schedule's
    right edge, or None where a header, a group or the pitch is unclear."""
    type_x = box_center(type_header.bbox_px)[0]
    bottom = type_header.bbox_px[3]
    rotated = sorted((span for span in spans if span.rotation in (90, 270)
                      and box_center(span.bbox_px)[0] > type_x + 10
                      and abs(span.bbox_px[3] - bottom) <= 20 and span.bbox_px[1] > title.bbox_px[3]),
                     key=lambda span: box_center(span.bbox_px)[0])
    if len(rotated) < 2:
        return None
    centres = [box_center(span.bbox_px)[0] for span in rotated]
    gaps = [b - a for a, b in zip(centres, centres[1:])]
    pitch = sorted(gaps)[len(gaps) // 2]
    if pitch <= 0 or any(gap < 0.5 * pitch or gap > 3 * pitch for gap in gaps):
        return None
    top = min(span.bbox_px[1] for span in rotated)
    # Group labels: the horizontal text between the title and the rotated
    # headers, over them; a label printed on two lines ("ALARM" / "LIMITS")
    # is one label. Footnote digits are not labels.
    words = sorted((span for span in spans if span.rotation in (None, 0) and span.text.strip()
                    and not span.text.strip().isdigit()
                    and title.bbox_px[3] <= span.bbox_px[1] and span.bbox_px[3] <= top
                    and centres[0] - pitch <= box_center(span.bbox_px)[0] <= centres[-1] + pitch),
                   key=lambda span: (box_center(span.bbox_px)[0], span.bbox_px[1]))
    labels: list[tuple[float, str]] = []
    for span in words:
        x = box_center(span.bbox_px)[0]
        if labels and abs(labels[-1][0] - x) <= pitch / 2:
            labels[-1] = (labels[-1][0], f"{labels[-1][1]} {span.text.strip()}")
        else:
            labels.append((x, span.text.strip()))
    groups: list[tuple[str, int, int]] = []
    start = 0
    for x, label in labels:
        if start >= len(centres):
            return None
        end = min(range(start, len(centres)), key=lambda j: abs((centres[start] + centres[j]) / 2 - x))
        if abs((centres[start] + centres[end]) / 2 - x) > 0.35 * pitch:
            return None
        groups.append((normalized_header(label), start, end))
        start = end + 1
    if not groups or start != len(centres):
        return None
    columns: list[tuple[str, float, float]] = []
    for label, first, last in groups:
        for j in range(first, last + 1):
            left = (centres[j - 1] + centres[j]) / 2 if j else centres[j] - gaps[0] / 2
            right = (centres[j] + centres[j + 1]) / 2 if j + 1 < len(centres) else centres[j] + gaps[-1] / 2
            columns.append((f"{label} {normalized_header(rotated[j].text)}", left, right))
    edge = columns[-1][2]
    notes = [span for span in spans if span.rotation in (None, 0) and normalized_header(span.text) in ("NOTES", "REMARKS")
             and span.bbox_px[0] >= edge - 2 and abs(span.bbox_px[3] - bottom) <= 40]
    if len(notes) == 1:
        right = notes[0].bbox_px[2] + (notes[0].bbox_px[0] - edge)
        columns.append((normalized_header(notes[0].text), edge, right))
        edge = right
    return columns, edge


def function_cells(spans: list[SourceSpan], type_span: SourceSpan, columns: list[tuple[str, float, float]],
                   edge: float) -> dict[str, IndexedCell] | None:
    """A recovered row's cells under the schedule's function columns: every
    span on its printed line between the first column and the schedule's
    edge must sit at a column's centre (NOTES anywhere in its cell), or the
    row is not read beyond its core columns."""
    parts: dict[str, list[SourceSpan]] = {}
    for span in spans:
        if span is type_span or span.rotation not in (None, 0) or not same_printed_line(span, type_span):
            continue
        x = box_center(span.bbox_px)[0]
        if not columns[0][1] <= x <= edge:
            continue
        hits = [(name, a, b) for name, a, b in columns if a <= x < b]
        if len(hits) != 1:
            return None
        name, a, b = hits[0]
        if name not in ("NOTES", "REMARKS") and abs(x - (a + b) / 2) > 0.3 * (b - a):
            return None
        parts.setdefault(name, []).append(span)
    return {name: IndexedCell(text=joined_text(found), bbox=union_boxes([span.bbox_px for span in found]))
            for name, found in parts.items()}


def source_point_function_tables(sources: SourceContext, rule: PointRule = CURRENT_POINT_RULE,
                                  ) -> list[IndexedTable]:
    """Recover bounded core columns from an explicit vector-text point schedule.

    This is a consumer-side fallback for a table the shared graph omitted or
    truncated. It requires a POINT FUNCTION SCHEDULE caption plus the printed
    POINT NAME, TAG and POINT TYPE headers, and then binds only rows with an
    aligned printed integer, name, tag and exact directional I/O type. Other
    schedule columns remain unresolved instead of being reconstructed by
    proximity or mark shape. Version 2 also reads the columns the schedule
    prints right of POINT TYPE under rotated headers (`function_columns`),
    only where every mark on every row sits at a column's centre.
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
            typed_by_row: list[SourceSpan] = []
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
                typed_by_row.append(type_span)
                seen_numbers.add(key)
            if len(recovered) < 2:
                continue
            headers = ["POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE"]
            extra: list[Box] = []
            found = function_columns(spans, title, type_header) if rule != POINT_RULE_V1 else None
            if found is not None:
                columns, edge = found
                read = [function_cells(spans, type_span, columns, edge) for type_span in typed_by_row]
                if all(cells is not None for cells in read):
                    recovered = [IndexedRow(key=row.key, cells={**row.cells, **(cells or {})})
                                 for row, cells in zip(recovered, read)]
                    headers += [name for name, _a, _b in columns]
                    extra = [span.bbox_px for span in spans if span.rotation in (90, 270)
                             and columns[0][1] <= box_center(span.bbox_px)[0] <= edge
                             and abs(span.bbox_px[3] - type_header.bbox_px[3]) <= 20]
            cells = [cell.bbox for row in recovered for cell in row.cells.values() if cell.bbox is not None]
            region = union_boxes([title.bbox_px, name_header.bbox_px, tag_header.bbox_px,
                                  type_header.bbox_px, *cells, *extra])
            tables.append(IndexedTable(sheet=page.sheet_keys[0],
                title=IndexedCell(text=title.text, bbox=title.bbox_px),
                headers=headers, region=region, rows=recovered))
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


def point_tables_with_source_recovery(payload: PointListInput, rule: PointRule = CURRENT_POINT_RULE,
                                      ) -> tuple[list[IndexedTable], set[int]]:
    tables = list(payload.tables)
    recovered_ids: set[int] = set()
    for recovered in [*source_point_function_tables(payload.sources, rule),
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
        existing_identity_headers = [header for header in existing.headers if identity_header(header, rule)]
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


def identity_spill(table: IndexedTable, start: int, names: list[str]) -> list[str]:
    """Version 2: a point name printed under its header but extracted into the
    unlabelled column beside it. The printed identity column holds no text in
    any row, and exactly one adjacent column with no printed header holds the
    names; anything else leaves the identity as printed."""
    if len(names) != 1:
        return names
    rows = table.rows[start:]
    if not rows or any(names[0] in row.cells and row.cells[names[0]].text.strip() for row in rows):
        return names
    index = table.headers.index(names[0]) if names[0] in table.headers else -1
    adjacent = [table.headers[i] for i in (index - 1, index + 1) if index >= 0 and 0 <= i < len(table.headers)]
    unlabelled = [h for h in adjacent if re.fullmatch(r"COL\d+", h)
                  and not (start and h in table.rows[0].cells and table.rows[0].cells[h].text.strip())
                  and any(h in row.cells and row.cells[h].text.strip() for row in rows)]
    return unlabelled if len(unlabelled) == 1 else names


class MatrixReading(Contract):
    """One rule's reading of a matrix's header: what every row is read through."""
    typed: dict[str, tuple[Literal["physical", "soft"], str]]
    header_evidence: list[Evidence]
    start: Count
    effective: dict[str, str]
    names: list[str]
    row_type_headers: list[str]
    roles: ColumnRoles
    alarm_headed: list[str]


def read_matrix(table: IndexedTable, rule: PointRule = CURRENT_POINT_RULE) -> MatrixReading:
    typed, header_evidence, start, flags = point_columns(table, rule)
    effective = {h: table.rows[0].cells[h].text if start and h in table.rows[0].cells else h for h in table.headers}
    names = [h for h, label in effective.items() if identity_header(label, rule)]
    if rule != POINT_RULE_V1:
        names = identity_spill(table, start, names)
    row_type_headers = [h for h, label in effective.items() if point_type_header(header_label(label, rule))]
    return MatrixReading(typed=typed, header_evidence=header_evidence, start=start, effective=effective, names=names,
                         row_type_headers=row_type_headers, roles=column_roles(table, start, typed, rule),
                         alarm_headed=sorted(flags))


class CellReading(Contract):
    column: str
    kind: Literal["declared_io", "software_value", "attribute"]
    channel: str
    value: Count | None


class RowReading(Contract):
    cells: list[CellReading]
    issues: list[str]
    uninterpreted: list[str]


# Version 2: a row the list prints as its totals is a check on the rows above
# it, never points of its own.
TOTAL_ROWS = {"TOTAL", "TOTALS", "SUBTOTAL", "SUBTOTALS", "SUB-TOTAL", "SUB TOTAL", "GRAND TOTAL",
              "TOTAL POINTS", "POINT TOTALS", "POINTS TOTAL"}


def printed_total_row(reading: MatrixReading, raw: IndexedRow, rule: PointRule = CURRENT_POINT_RULE) -> bool:
    if rule == POINT_RULE_V1:
        return False
    name = raw.cells[reading.names[0]].text if len(reading.names) == 1 and reading.names[0] in raw.cells else ""
    return normalized_header(name) in TOTAL_ROWS or (not name.strip() and normalized_header(raw.key) in TOTAL_ROWS)


def read_row(reading: MatrixReading, raw: IndexedRow, rule: PointRule = CURRENT_POINT_RULE) -> RowReading:
    """Every observation a row's cells give under one rule. The observation pass
    and the later checks of a saved result both read rows here, so a mark, a
    per-row point type or a typed column is checked exactly as it was read."""
    if printed_total_row(reading, raw, rule):
        return RowReading(cells=[], issues=[], uninterpreted=[])
    cells: list[CellReading] = []
    issues: list[str] = []
    uninterpreted: list[str] = []
    marked: set[str] = set()
    alarm_roles = alarm_cell_roles(raw, reading.typed, set(reading.alarm_headed), rule)
    if not reading.typed and not reading.row_type_headers:
        mark_cells = [(header, cell) for header, cell in raw.cells.items() if point_mark_kind(cell.text) is not None]
        if len(mark_cells) > 1:
            issues.append("POINT_MARK_AMBIGUOUS")
        elif len(mark_cells) == 1:
            header, cell = mark_cells[0]
            mark_kind = point_mark_kind(cell.text)
            assert mark_kind is not None
            kind, mark_channel = mark_kind
            if cell.bbox is None:
                issues.append("POINT_CELL_REGION_UNAVAILABLE")
            cells.append(CellReading(column=header, kind="declared_io" if kind == "physical" else "software_value",
                                     channel=mark_channel, value=1))
            marked.add(header)
    for header, cell in raw.cells.items():
        if header in marked:
            continue
        observation_kind: Literal["declared_io", "software_value", "attribute"]
        channel: str
        value: int | None
        if len(reading.row_type_headers) == 1 and header == reading.row_type_headers[0]:
            row_channel = row_point_channel(cell.text)
            if row_channel is None:
                issues.append("POINT_TYPE_AMBIGUOUS")
                continue
            channel = row_channel
            observation_kind, value = "declared_io", 1
        elif header in alarm_roles:
            # The row's own point's alarm, read as its attribute (version 2).
            channel, observation_kind = normalized_header(header), "attribute"
            value = printed_count(cell.text, rule)
            if alarm_roles[header] == "ambiguous":
                issues.append("POINT_CHANNEL_AMBIGUOUS")
        elif header in reading.typed:
            kind, channel = reading.typed[header]
            observation_kind = "declared_io" if kind == "physical" else "software_value"
            value = printed_count(cell.text, rule)
        elif header in reading.roles.attributes:
            channel, observation_kind = reading.roles.attributes[header], "attribute"
            value = printed_count(cell.text, rule)
        else:
            if cell.text.strip() and header not in reading.names and header not in reading.roles.metadata:
                uninterpreted.append(header)
            continue
        if value is None:
            issues.append("POINT_CELL_AMBIGUOUS")
        if cell.bbox is None:
            issues.append("POINT_CELL_REGION_UNAVAILABLE")
        cells.append(CellReading(column=header, kind=observation_kind, channel=channel, value=value))
    return RowReading(cells=cells, issues=issues, uninterpreted=uninterpreted)


def column_spans(table: IndexedTable) -> dict[str, tuple[float, float]]:
    """Each printed column's x-extent from its own extracted cells. A cell the
    extraction merged over several columns ("AV BV ADJ SCH") gives the columns
    it covers an even share in header order, only where a column has no cell
    of its own."""
    own: dict[str, list[Box]] = {}
    merged: dict[Box, list[str]] = {}
    for row in table.rows:
        boxes = {h: c.bbox for h, c in row.cells.items() if h in table.headers and c.bbox is not None}
        shared = Counter(boxes.values())
        for header in table.headers:
            box = boxes.get(header)
            if box is not None and shared[box] == 1:
                own.setdefault(header, []).append(box)
            elif box is not None and header not in merged.setdefault(box, []):
                merged[box].append(header)
    spans = {h: (sorted(b[0] for b in boxes)[len(boxes) // 2], sorted(b[2] for b in boxes)[len(boxes) // 2])
             for h, boxes in own.items()}
    for box, headers in merged.items():
        width = (box[2] - box[0]) / len(headers)
        for index, header in enumerate(headers):
            spans.setdefault(header, (box[0] + width * index, box[0] + width * (index + 1)))
    return spans


def joined_text(parts: list[SourceSpan]) -> str:
    parts = sorted(parts, key=lambda span: (span.bbox_px[0], span.source_index))
    text = parts[0].text.strip()
    for previous, span in zip(parts, parts[1:]):
        gap = span.bbox_px[0] - previous.bbox_px[2]
        text += (" " if gap > 0.15 * (span.bbox_px[3] - span.bbox_px[1]) else "") + span.text.strip()
    return re.sub(r"\s+", " ", text).strip()


def source_text_rows(table: IndexedTable, reading: MatrixReading, page: SourcePage, others: list[IndexedTable],
                     rule: PointRule = CURRENT_POINT_RULE) -> list[tuple[int, IndexedRow]]:
    """Version 2: the rows a point list prints that its extraction dropped,
    read from the page's own text. A full-width section band ("CROSS-TIE
    LOOP", "DDC CONTROLLER") ends many extractions while the list goes on,
    and a row can fall out between two extracted rows. A printed line is a
    row only where every span on it sits inside one of the list's own
    columns, it names the row in the name or key column, and it marks an
    I/O, attribute or count column or prints the row's point type, its cells
    set apart as cells are, not run on a word space apart. Reading stops at
    text wider than the list, at a sentence or heading, at another point
    list, a point-list caption or the list's own header printed again, at a
    row named as one the list already printed, at a gap of more than three
    rows, or after three printed lines that are not rows. Returns (insert
    position, row) pairs in page order;
    each row is flagged for review where its observations are made."""
    if rule == POINT_RULE_V1 or table.region is None or len(reading.names) != 1:
        return []
    data = table.rows[reading.start:]
    bands = []
    for row in data:
        boxes = [c.bbox for c in row.cells.values() if c.bbox is not None]
        if not boxes:
            return []
        bands.append((min(b[1] for b in boxes), max(b[3] for b in boxes)))
    if not bands:
        return []
    spans_x = column_spans(table)
    marked = [*reading.typed, *reading.roles.attributes]
    mark_list = not reading.typed and not reading.row_type_headers
    if reading.names[0] not in spans_x:
        return []
    key_columns = [h for h in table.headers
                   if all(h in row.cells and row.cells[h].text.strip() == row.key.strip() for row in data)]
    identity = [*reading.names, *key_columns[:1]]
    extracted_keys = {normalized_header(row.key) for row in data}
    x0, _y0, x1, y1 = table.region
    top = min(band[0] for band in bands)
    pitch = sorted(b - a for a, b in bands)[len(bands) // 2]
    centres = [(a + b) / 2 for a, b in bands]
    in_order = all(a <= b for a, b in zip(centres, centres[1:]))
    stops = [other.region[1] for other in others
             if other is not table and other.region is not None and other.sheet == table.sheet
             and other.region[1] > top and min(other.region[2], x1) > max(other.region[0], x0)]
    captions = [span.bbox_px[1] for span in page.spans if span.bbox_px[1] > y1 and point_matrix_caption(span.text)
                and min(span.bbox_px[2], x1) > max(span.bbox_px[0], x0)]
    limit = min([*stops, *captions, page.height_px])
    spans = sorted((span for span in page.spans if span.text.strip() and span.rotation in (None, 0)
                    and top - 2 <= box_center(span.bbox_px)[1] < limit
                    and min(span.bbox_px[2], x1) > max(span.bbox_px[0], x0)),
                   key=lambda span: (box_center(span.bbox_px)[1], span.bbox_px[0], span.source_index))
    lines: list[list[SourceSpan]] = []
    for span in spans:
        if lines and same_printed_line(lines[-1][0], span):
            lines[-1].append(span)
        else:
            lines.append([span])

    def column_of(span: SourceSpan) -> str | None:
        cx = box_center(span.bbox_px)[0]
        inside = [h for h, (a, b) in spans_x.items() if a <= cx <= b]
        if len(inside) != 1:
            return None
        a, b = spans_x[inside[0]]
        slack = max(3.0, min(0.15 * (b - a), 12.0))
        return inside[0] if a - slack <= span.bbox_px[0] and span.bbox_px[2] <= b + slack else None

    found: list[tuple[float, IndexedRow]] = []
    misses, last = 0, max(band[1] for band in bands)
    for line in lines:
        cy = box_center(line[0].bbox_px)[1]
        if any(a - 2 <= cy <= b + 2 for a, b in bands):
            continue
        below = cy > max(centres)
        if below and cy - last > 3.5 * pitch:
            break
        outside = any(span.bbox_px[0] < x0 - 2 or span.bbox_px[2] > x1 + 2 for span in line)
        cells: dict[str, list[SourceSpan]] = {}
        for span in line:
            column = column_of(span)
            if column is None:
                cells = {}
                break
            cells.setdefault(column, []).append(span)
        ordered = sorted(line, key=lambda span: span.bbox_px[0])
        height = max(span.bbox_px[3] - span.bbox_px[1] for span in line)
        if cells and any(column_of(a) != column_of(b) and b.bbox_px[0] - a.bbox_px[2] < 0.8 * height
                         for a, b in zip(ordered, ordered[1:])):
            # Words set a word space apart run on as one text, not across cells.
            cells = {}
        texts = {h: joined_text(parts) for h, parts in cells.items()}
        if (normalized_header(texts.get(reading.names[0], "")) == header_label(reading.effective[reading.names[0]], rule)
                or sum(normalized_header(text) == normalized_header(reading.effective.get(h, h))
                       for h, text in texts.items()) >= 2):
            # The list's own header printed again: another list starts here.
            if below:
                break
            continue
        named = any(texts.get(h) for h in identity)
        if mark_list:
            io = any(point_mark_kind(text) is not None for text in texts.values())
        else:
            io = (any(h in texts and printed_count(texts[h], rule) is not None for h in marked)
                  or any(h in texts and re.fullmatch(r"[A-Z0-9/-]{1,8}", texts[h]) for h in reading.row_type_headers))
        if outside or not named or not io or not (in_order or below):
            words = joined_text(line)
            prose = len(words.split()) > 6 or ":" in words or words.endswith(".")
            if below and (outside or prose or misses >= 2):
                # A sentence or a heading ends the list; a short band ("DDC
                # CONTROLLER", "CROSS-TIE LOOP") names the rows that follow.
                break
            misses += 1 if below else 0
            continue
        key = next((texts[h] for h in (*key_columns[:1], *reading.names) if texts.get(h)), "")
        if normalized_header(key) in extracted_keys:
            # A row named as one the list already printed starts a repeated
            # block or another list: never this list's own new row.
            if below:
                break
            continue
        misses, last = 0, max(last, max(span.bbox_px[3] for span in line))
        found.append((cy, IndexedRow(key=key, cells={
            h: IndexedCell(text=texts[h], bbox=union_boxes([span.bbox_px for span in cells[h]])) for h in texts})))
    return [(reading.start + sum(c < cy for c in centres), row) for cy, row in found]


def review_point_lists(payload: PointListInput, rule: PointRule = CURRENT_POINT_RULE) -> PointListResult:
    # Revalidate nested mutations and detach all output from caller-owned data.
    payload = PointListInput.model_validate(payload.model_dump())
    by_sheet = {alias: page for page in payload.sources.pages for alias in page.sheet_keys}
    selected = []
    candidate_tables, recovered_ids = point_tables_with_source_recovery(payload, rule)
    for table in candidate_tables:
        reading = read_matrix(table, rule)
        typed, start, names, row_type_headers = reading.typed, reading.start, reading.names, reading.row_type_headers
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
        selected.append((matrix_id, table, page, reading, id(table) in recovered_ids))

    matrix_counts = Counter(item[0] for item in selected)
    if any(n > 1 for n in matrix_counts.values()):
        raise ValueError("Duplicate indexed matrix identity; reconcile source regions explicitly")

    # Version 2: rows the list prints beyond (or between) its extracted rows,
    # read from the page text. The matrix keeps its identity and extracted
    # region (math swaps the graph's copy for it by title or region); each row
    # cites its own cells and is flagged for review. They are kept only where
    # the list's I/O columns, name and point types read as before and every
    # extracted row reads exactly as before; a column only they fill may gain
    # its meaning.
    text_rows: dict[str, set[int]] = {}
    selected_tables = [item[1] for item in selected]
    for index, (matrix_id, table, page, reading, source_recovered) in enumerate(selected):
        found = source_text_rows(table, reading, page, selected_tables, rule) if page is not None else []
        if not found:
            continue
        extended_rows = list(table.rows)
        positions = set()
        for offset, (position, row) in enumerate(found):
            extended_rows.insert(position + offset, row)
            positions.add(position + offset)
        extended = IndexedTable(sheet=table.sheet, title=table.title, headers=table.headers,
                                region=table.region, rows=extended_rows)
        again = read_matrix(extended, rule)
        if ((again.typed, again.names, again.row_type_headers, again.start, again.alarm_headed)
                != (reading.typed, reading.names, reading.row_type_headers, reading.start, reading.alarm_headed)
                or any(read_row(again, raw, rule) != read_row(reading, raw, rule) for raw in table.rows[reading.start:])):
            continue
        selected[index] = (matrix_id, extended, page, again, source_recovered)
        text_rows[matrix_id] = positions

    bound_notes: dict[str, list[PointNote]] = {item[0]: [] for item in selected}
    note_conflicts: set[str] = set()
    for page in payload.sources.pages:
        for span in page.spans:
            meaning = note_grammar(span)
            if meaning is None:
                continue
            owners = [item for item in selected if item[2] is not None
                      and item[2].page_id == page.page_id and note_fits(span, item[1], item[3].start)]
            if len(owners) != 1:
                note_conflicts.update(item[0] for item in owners)
                continue
            matrix_id, table = owners[0][0], owners[0][1]
            bound_notes[matrix_id].append(PointNote(kind=meaning[0], subject=meaning[1],
                source=point_source(page, table, IndexedCell(text=span.text, bbox=span.bbox_px), span_id=span.span_id)))

    matrices = []
    for matrix_id, table, page, reading, source_recovered in selected:
        typed, start, names, row_type_headers = reading.typed, reading.start, reading.names, reading.row_type_headers
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
        totals = [raw for raw in table.rows[start:] if printed_total_row(reading, raw, rule)]
        column_sums: Counter[str] = Counter()
        for raw in table.rows[start:]:
            if not printed_total_row(reading, raw, rule):
                column_sums.update({c.column: c.value or 0 for c in read_row(reading, raw, rule).cells})
        checked_columns = {*reading.typed, *reading.roles.attributes}
        occurrences: Counter[str] = Counter()
        rows = []
        # `table.rows` is the indexed source order retained in `raw`.  Do not
        # silently re-sort it by bbox: fragmented/merged vector tables can
        # legitimately carry a non-monotonic y order, and the source-bound
        # result must replay the exact matrix it cites.  Determinism comes from
        # the owned input order; changing it here makes `rows` disagree with
        # `raw.rows` and correctly fails the shared JS evidence contract.
        for position, raw in enumerate(table.rows[start:], start):
            name = raw.cells[names[0]].text if len(names) == 1 and names[0] in raw.cells else ""
            row_issues = []
            if local_keys[raw.key] > 1:
                row_issues.append("DUPLICATE_LOCAL_ROW_KEY")
            if position in text_rows.get(matrix_id, set()):
                row_issues.append("SOURCE_TEXT_ROW_RECOVERED")
            read = read_row(reading, raw, rule)
            row_issues.extend(read.issues)
            if any(raw is total for total in totals) and (len(totals) > 1 or any(
                    printed_count(cell.text, rule) is not None and printed_count(cell.text, rule) != column_sums[header]
                    for header, cell in raw.cells.items() if header in checked_columns)):
                # One printed total row is a check on the rows above it.
                row_issues.append("PRINTED_TOTAL_MISMATCH")
            uninterpreted = read.uninterpreted
            observations = [PointObservation(kind=c.kind, channel=c.channel, value=c.value,
                                             status="ambiguous" if c.value is None else "read",
                                             source=point_source(page, table, raw.cells[c.column], c.column))
                            for c in read.cells]
            # Graph rows are deliberately sparse. No cell means no observed
            # value/box, not an explicitly printed zero and not proof of loss.
            unobserved = sorted(h for h in table.headers if h not in raw.cells)
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
                                                if h not in names and h not in reading.roles.metadata))
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
            header_sources=[point_source(page, table, IndexedCell(text=e.text or "", bbox=e.bbox_px), e.column) for e in reading.header_evidence],
            notes=notes, rows=rows, issues=issues))
    return PointListResult(rule_version=rule, matrices=sorted(matrices, key=lambda m: m.matrix_id),
                           issues=["SOURCE_DISCOVERY_COVERAGE_UNVERIFIED"])
