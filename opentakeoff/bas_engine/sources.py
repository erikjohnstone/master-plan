"""Validate Session's existing source-context contract at the Python boundary.

No PDF reading or interpretation. Original names/text/coordinates are retained.
"""
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from .models import Contract, Count, Identifier, PositiveCount

Coordinate = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Box = tuple[Coordinate, Coordinate, Coordinate, Coordinate]


def valid_box(box: Box) -> bool:
    return box[2] >= box[0] and box[3] >= box[1]


class SourceSpan(Contract):
    span_id: Identifier
    source_index: Count
    text: str
    bbox_px: Box
    rotation: Coordinate | None = None

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if not valid_box(self.bbox_px):
            raise ValueError("Unordered source box")
        return self


class SourcePage(Contract):
    page_id: Identifier
    source_id: Identifier
    page_number: PositiveCount
    sheet_keys: list[Identifier] = Field(min_length=1)
    width_px: Annotated[Coordinate, Field(gt=0)]
    height_px: Annotated[Coordinate, Field(gt=0)]
    rotation: Coordinate
    text_status: Literal["available", "no_text"]
    spans: list[SourceSpan]

    @model_validator(mode="after")
    def identities(self) -> Self:
        if self.page_id != f"{self.source_id}:p{self.page_number}":
            raise ValueError("Source page identity mismatch")
        if len(set(self.sheet_keys)) != len(self.sheet_keys):
            raise ValueError("Repeated source page alias")
        for index, span in enumerate(self.spans):
            if span.source_index != index or span.span_id != f"{self.page_id}:s{index}":
                raise ValueError("Source span identity mismatch")
        status = "available" if any(s.text.strip() for s in self.spans) else "no_text"
        if self.text_status != status:
            raise ValueError("Source text status mismatch")
        return self


class SourceDocument(Contract):
    source_id: Identifier
    sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    byte_length: PositiveCount
    page_count: PositiveCount
    names: list[Identifier] = Field(min_length=1)

    @model_validator(mode="after")
    def identity(self) -> Self:
        if self.source_id != "sha256:" + self.sha256 or len(set(self.names)) != len(self.names):
            raise ValueError("Source document identity mismatch")
        return self


class SourceContext(Contract):
    schema_version: Literal["bas_sources_v1"]
    adapter: Literal["session_text_spans_v1"]
    coordinate_frame: Literal["image_px"]
    scope: Literal["available_pdf_text_only"]
    documents: list[SourceDocument]
    pages: list[SourcePage]

    @model_validator(mode="after")
    def relationships(self) -> Self:
        documents = {d.source_id: d for d in self.documents}
        if len(documents) != len(self.documents) or len({p.page_id for p in self.pages}) != len(self.pages):
            raise ValueError("Repeated source identity")
        aliases = [key for p in self.pages for key in p.sheet_keys]
        names = [name for d in self.documents for name in d.names]
        if len(set(aliases)) != len(aliases) or len(set(names)) != len(names):
            raise ValueError("Conflicting source alias")
        if any(p.source_id not in documents for p in self.pages):
            raise ValueError("Unknown source version")
        for document in self.documents:
            numbers = sorted(p.page_number for p in self.pages if p.source_id == document.source_id)
            if numbers != list(range(1, document.page_count + 1)):
                raise ValueError("Every source page must be accounted for")
        return self
