#!/usr/bin/env python3
"""Deterministic, versioned crop rendering from PDF coordinate space.

Every render call records the exact inputs (source hash, page, bbox,
dpi/matrix, padding) needed to reproduce the crop byte-for-byte, and the
result's own sha256, so crop provenance is auditable end to end per the
goal doc's training-record schema.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pymupdf  # type: ignore
from PIL import Image

RENDERER_VERSION = "opentakeoff.symbol_metric.render_crops.v1"

# Deterministic raster-DPI ladder used for augmentation-by-resolution and for
# the multi-resolution evidence-packet requirement.
DPI_LADDER = [150, 300, 450, 600]
MODEL_INPUT_SIZE = 280  # divisible by DINOv2's 14px patch size


@dataclass
class RenderedCrop:
    png_bytes: bytes
    sha256: str
    width_px: int
    height_px: int
    dpi: int
    source_bbox_pt: tuple
    padded_bbox_pt: tuple


MIN_CROP_DIM_PT = 2.0  # below this, mupdf's PNG bandwriter can reject the pixmap
                          # outright at high DPI ("Invalid bandwriter header
                          # dimensions/setup") -- floor it rather than crash.


def _clamp_bbox(bbox: tuple, page_rect) -> tuple:
    x0, y0, x1, y1 = bbox
    x0 = max(0.0, min(x0, page_rect.width))
    x1 = max(0.0, min(x1, page_rect.width))
    y0 = max(0.0, min(y0, page_rect.height))
    y1 = max(0.0, min(y1, page_rect.height))
    if x1 - x0 < MIN_CROP_DIM_PT:
        mid = (x0 + x1) / 2
        x0, x1 = mid - MIN_CROP_DIM_PT / 2, mid + MIN_CROP_DIM_PT / 2
    if y1 - y0 < MIN_CROP_DIM_PT:
        mid = (y0 + y1) / 2
        y0, y1 = mid - MIN_CROP_DIM_PT / 2, mid + MIN_CROP_DIM_PT / 2
    x0 = max(0.0, x0)
    y0 = max(0.0, y0)
    x1 = max(x0 + MIN_CROP_DIM_PT, min(x1, page_rect.width))
    y1 = max(y0 + MIN_CROP_DIM_PT, min(y1, page_rect.height))
    return (x0, y0, x1, y1)


def render_bbox(
    page: "pymupdf.Page",
    bbox: tuple,
    dpi: int = 300,
    pad_frac: float = 0.15,
) -> RenderedCrop:
    """Render one bbox (PDF point space, origin top-left) to a PNG at the
    given DPI, with a symmetric padding margin (context, not part of the
    labeled body -- the padded region is recorded so training crop
    generation can white-pad consistently instead of re-deriving it)."""
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    pad_x, pad_y = w * pad_frac, h * pad_frac
    padded = (x0 - pad_x, y0 - pad_y, x1 + pad_x, y1 + pad_y)
    padded = _clamp_bbox(padded, page.rect)

    zoom = dpi / 72.0
    mat = pymupdf.Matrix(zoom, zoom)
    clip = pymupdf.Rect(*padded)
    pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
    png_bytes = pix.tobytes("png")
    return RenderedCrop(
        png_bytes=png_bytes,
        sha256=hashlib.sha256(png_bytes).hexdigest(),
        width_px=pix.width,
        height_px=pix.height,
        dpi=dpi,
        source_bbox_pt=bbox,
        padded_bbox_pt=padded,
    )


def render_full_page(page: "pymupdf.Page", dpi: int = 100) -> RenderedCrop:
    zoom = dpi / 72.0
    mat = pymupdf.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    png_bytes = pix.tobytes("png")
    return RenderedCrop(
        png_bytes=png_bytes,
        sha256=hashlib.sha256(png_bytes).hexdigest(),
        width_px=pix.width,
        height_px=pix.height,
        dpi=dpi,
        source_bbox_pt=(0, 0, page.rect.width, page.rect.height),
        padded_bbox_pt=(0, 0, page.rect.width, page.rect.height),
    )


def to_model_input(png_bytes: bytes, size: int = MODEL_INPUT_SIZE) -> Image.Image:
    """Aspect-preserving resize onto a white size x size canvas, grayscale
    replicated to 3 channels -- the exact baseline preprocessing contract
    from SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md."""
    import io
    img = Image.open(io.BytesIO(png_bytes)).convert("L")
    w, h = img.size
    scale = size / max(w, h)
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    img = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("L", (size, size), color=255)
    off_x, off_y = (size - new_w) // 2, (size - new_h) // 2
    canvas.paste(img, (off_x, off_y))
    return canvas.convert("RGB")


def save_png(rc: RenderedCrop, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(rc.png_bytes)
