#!/usr/bin/env python3
"""
L2 table extraction sidecar — JSON-RPC 2.0 over newline-delimited JSON on stdio.

Methods:
  ping          → { "ok": true, "backends": [...] }
  extract_tables → { "tables": SidecarTable[] }
  extract_grid  → { "space": "pdf-points-topleft", "tables": VectorGridTable[] }
                  the measured vectorgrid extractor (see vectorgrid_rpc.py);
                  params { pdfPath, page }
  shutdown      → exit 0

Request params for extract_tables:
  pdfPath: str (absolute)
  page: int (1-based)
  bboxHint?: [x0, y0, x1, y1]  # pdfplumber top-left page coords
  explicitLines?: { horizontal: [[x0,y0,x1,y1],...], vertical: [...] }
  backends?: str[]  # default tries all available in priority order

Backend priority (first hit wins, see BACKEND_ORDER): vector-lines and the two
pdfplumber strategies, then camelot lattice/stream, then — only if every one
of those found nothing — gmft-tatr (Fallback C: Microsoft Table Transformer
for borderless grids). gmft needs `pip install gmft` (pulls in transformers +
torch) and fetches its checkpoint from Hugging Face Hub on first use; if
either isn't available it's simply absent from `backends`/silently yields no
tables, same as pdfplumber/camelot when uninstalled.
"""
from __future__ import annotations

import json
import sys
import traceback
from typing import Any

BACKEND_ORDER = [
    "vector-lines",
    "pdfplumber-lines",
    "pdfplumber-lines_strict",
    "camelot-lattice",
    "camelot-stream",
    "gmft-tatr",
]

SANITY_MIN_ROWS = 2
SANITY_MIN_COLS = 2
SANITY_MIN_FILL = 0.60

# Lazy singletons for gmft's TATR detector/formatter — loading the checkpoint
# (fetched from Hugging Face Hub on first use) costs real time, so load it at
# most once per sidecar process, and remember a load failure (e.g. no network
# route to huggingface.co, or a first-time-only cache miss) so we don't retry
# it on every request. `None` = not yet attempted; `False` = attempted and
# failed; else the (detector, formatter) tuple.
_GMFT_MODELS: Any = None

# huggingface_hub retries a blocked/unreachable connection with real backoff
# delays (observed: multi-minute) before finally raising — fine on a real
# deployment fetching a genuinely slow host, but on a network policy that
# flat-out denies the connection (this sandbox; possibly some production
# deployments too) that turns "gmft isn't reachable" into a multi-minute
# stall on every sidecar process that ever calls extract_tables with no
# tables found upstream. Pre-flight a short, non-retrying connectivity probe
# so the failure mode is always fast, never a hang — same graceful-absence
# behavior either way, just without the tax.
def _hf_hub_reachable() -> bool:
    # A raw TCP connect can succeed even when an HTTP-layer gateway/proxy
    # policy denies the actual request (observed in this project's own CI
    # sandbox: TCP connect succeeds, then every real HTTPS request 403s at
    # the CONNECT) — so probe with an actual HTTP request through whatever
    # proxy config urllib picks up from the environment, not a bare socket.
    import urllib.request

    try:
        req = urllib.request.Request("https://huggingface.co/api/models", method="HEAD")
        urllib.request.urlopen(req, timeout=2.0)
        return True
    except Exception:
        return False


def _gmft_models():
    global _GMFT_MODELS
    if _GMFT_MODELS is None:
        if not _hf_hub_reachable():
            _GMFT_MODELS = False
            return None
        try:
            from gmft.auto import AutoTableDetector, AutoTableFormatter

            _GMFT_MODELS = (AutoTableDetector(), AutoTableFormatter())
        except Exception:
            _GMFT_MODELS = False
    return _GMFT_MODELS or None


def _reply(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _err(req_id: Any, code: int, message: str) -> None:
    _reply({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def _ok(req_id: Any, result: Any) -> None:
    _reply({"jsonrpc": "2.0", "id": req_id, "result": result})


def _available_backends() -> list[str]:
    out: list[str] = []
    try:
        import pdfplumber  # noqa: F401

        out.extend(["vector-lines", "pdfplumber-lines", "pdfplumber-lines_strict"])
    except ImportError:
        pass
    try:
        import camelot  # noqa: F401

        out.extend(["camelot-lattice", "camelot-stream"])
    except ImportError:
        pass
    try:
        import gmft  # noqa: F401
        import gmft.pdf_bindings.pdfium  # noqa: F401

        # Package presence only — the TATR checkpoint itself is fetched
        # lazily (and may still fail, e.g. no route to huggingface.co) on
        # the first real extract_tables call; see _gmft_models().
        out.append("gmft-tatr")
    except ImportError:
        pass
    return out


def _cell_bbox(row_cells: list[Any], col: int) -> list[float]:
    if col >= len(row_cells):
        return [0.0, 0.0, 0.0, 0.0]
    c = row_cells[col]
    if c is None:
        return [0.0, 0.0, 0.0, 0.0]
    if hasattr(c, "x0"):
        return [float(c.x0), float(c.top), float(c.x1), float(c.bottom)]
    return [0.0, 0.0, 0.0, 0.0]


def _table_bbox(cells: list[dict[str, Any]]) -> list[float]:
    xs0, ys0, xs1, ys1 = [], [], [], []
    for c in cells:
        b = c.get("bbox") or [0, 0, 0, 0]
        if b[2] <= b[0] or b[3] <= b[1]:
            continue
        xs0.append(b[0])
        ys0.append(b[1])
        xs1.append(b[2])
        ys1.append(b[3])
    if not xs0:
        return [0.0, 0.0, 0.0, 0.0]
    return [min(xs0), min(ys0), max(xs1), max(ys1)]


def _passes_sanity(table: dict[str, Any]) -> bool:
    rows = int(table.get("rows") or 0)
    cols = int(table.get("cols") or 0)
    if rows < SANITY_MIN_ROWS or cols < SANITY_MIN_COLS:
        return False
    cells = table.get("cells") or []
    if not cells:
        return False
    non_empty = sum(1 for c in cells if str(c.get("text") or "").strip())
    if non_empty / max(1, len(cells)) < SANITY_MIN_FILL:
        return False
    tb = table.get("bbox") or [0, 0, 0, 0]
    for c in cells:
        cb = c.get("bbox") or [0, 0, 0, 0]
        if cb[0] < tb[0] - 2 or cb[1] < tb[1] - 2 or cb[2] > tb[2] + 2 or cb[3] > tb[3] + 2:
            if cb[2] > cb[0] and cb[3] > cb[1]:
                return False
    header_row = [c for c in cells if c.get("row") == 0]
    if not header_row:
        return False
    header_text = " ".join(str(c.get("text") or "") for c in header_row).upper()
    if not header_text.strip():
        return False
    return True


def _grid_from_pdfplumber(page, table, source: str, page_num: int) -> dict[str, Any] | None:
    if not table:
        return None
    rows = len(table)
    cols = max((len(r) for r in table), default=0)
    if rows < SANITY_MIN_ROWS or cols < SANITY_MIN_COLS:
        return None
    cells: list[dict[str, Any]] = []
    for ri, row in enumerate(table):
        for ci in range(cols):
            text = ""
            if ci < len(row) and row[ci] is not None:
                text = str(row[ci]).replace("\n", " ").strip()
            bbox = _cell_bbox(row, ci)
            cells.append(
                {
                    "row": ri,
                    "col": ci,
                    "rowSpan": 1,
                    "colSpan": 1,
                    "text": text,
                    "bbox": bbox,
                    "confidence": 0.85 if text else 0.4,
                }
            )
    out = {
        "source": source,
        "score": 0.85,
        "page": page_num,
        "rows": rows,
        "cols": cols,
        "cells": cells,
        "bbox": _table_bbox(cells),
    }
    return out if _passes_sanity(out) else None


def _extract_vector_lines(page, page_num: int, explicit: dict[str, Any]) -> list[dict[str, Any]]:
    import pdfplumber

    h_lines = explicit.get("horizontal") or []
    v_lines = explicit.get("vertical") or []
    if not h_lines and not v_lines:
        return []
    settings = {
        "vertical_strategy": "explicit",
        "horizontal_strategy": "explicit",
        "explicit_vertical_lines": v_lines,
        "explicit_horizontal_lines": h_lines,
        "snap_tolerance": 3,
        "join_tolerance": 3,
        "intersection_tolerance": 3,
        "edge_min_length_prefilter": 0.5,
    }
    tables = page.extract_tables(table_settings=settings) or []
    out: list[dict[str, Any]] = []
    for t in tables:
        built = _grid_from_pdfplumber(page, t, "vector-lines", page_num)
        if built:
            out.append(built)
    return out


def _extract_pdfplumber(page, page_num: int, strategy: str) -> list[dict[str, Any]]:
    settings = {
        "vertical_strategy": strategy,
        "horizontal_strategy": strategy,
        "snap_tolerance": 3,
        "join_tolerance": 3,
        "intersection_tolerance": 3,
        "edge_min_length_prefilter": 0.5,
    }
    tables = page.extract_tables(table_settings=settings) or []
    source = "pdfplumber-lines" if strategy == "lines" else "pdfplumber-lines_strict"
    out: list[dict[str, Any]] = []
    for t in tables:
        built = _grid_from_pdfplumber(page, t, source, page_num)
        if built:
            out.append(built)
    return out


def _extract_camelot(pdf_path: str, page_num: int, flavor: str) -> list[dict[str, Any]]:
    import camelot

    tables = camelot.read_pdf(pdf_path, pages=str(page_num), flavor=flavor)
    out: list[dict[str, Any]] = []
    source = "camelot-lattice" if flavor == "lattice" else "camelot-stream"
    for t in tables:
        df = t.df
        rows, cols = df.shape
        if rows < SANITY_MIN_ROWS or cols < SANITY_MIN_COLS:
            continue
        cells: list[dict[str, Any]] = []
        x0, y0, x1, y1 = t._bbox if hasattr(t, "_bbox") else (0, 0, page_num, page_num)
        cell_w = max(1.0, (x1 - x0) / cols)
        cell_h = max(1.0, (y1 - y0) / rows)
        for ri in range(rows):
            for ci in range(cols):
                text = str(df.iat[ri, ci]).replace("\n", " ").strip()
                cx0 = x0 + ci * cell_w
                cy0 = y0 + ri * cell_h
                cells.append(
                    {
                        "row": ri,
                        "col": ci,
                        "rowSpan": 1,
                        "colSpan": 1,
                        "text": text,
                        "bbox": [cx0, cy0, cx0 + cell_w, cy0 + cell_h],
                        "confidence": float(getattr(t, "accuracy", 80) or 80) / 100.0,
                    }
                )
        built = {
            "source": source,
            "score": float(getattr(t, "accuracy", 80) or 80) / 100.0,
            "page": page_num,
            "rows": rows,
            "cols": cols,
            "cells": cells,
            "bbox": [float(x0), float(y0), float(x1), float(y1)],
        }
        if _passes_sanity(built):
            out.append(built)
    return out


def _extract_gmft(pdf_path: str, page_num: int, bbox_hint: list[float] | None) -> list[dict[str, Any]]:
    """Fallback C — Microsoft Table Transformer (TATR) via gmft, for borderless
    grids none of the geometric/ruled backends above found. Only ever reached
    when every earlier backend in BACKEND_ORDER returned nothing (see the
    `break`-on-first-hit loop in extract_tables), and never on a scanned-only
    page — callers gate this sidecar on the same vector-text presence check
    used everywhere else on the shared path (rasterTableAssist.ts / GOAL
    policy), so this still isn't a raster-first shortcut."""
    models = _gmft_models()
    if not models:
        return []
    detector, formatter = models

    from gmft.pdf_bindings.pdfium import PyPDFium2Document

    doc = PyPDFium2Document(pdf_path)
    try:
        try:
            page = doc.get_page(page_num - 1)
        except Exception:
            return []

        try:
            cropped = detector.extract(page)
        except Exception:
            return []

        if bbox_hint and len(bbox_hint) == 4:
            hx0, hy0, hx1, hy1 = bbox_hint

            def _overlaps(b: Any) -> bool:
                return not (b[2] < hx0 - 4 or b[0] > hx1 + 4 or b[3] < hy0 - 4 or b[1] > hy1 + 4)

            cropped = [c for c in cropped if _overlaps(c.bbox)]

        out: list[dict[str, Any]] = []
        for ct in cropped:
            try:
                df = formatter.extract(ct).df()
            except Exception:
                continue
            rows, cols = df.shape
            if rows < SANITY_MIN_ROWS or cols < SANITY_MIN_COLS:
                continue
            x0, y0, x1, y1 = ct.bbox
            cell_w = max(1.0, (x1 - x0) / max(1, cols))
            cell_h = max(1.0, (y1 - y0) / max(1, rows))
            cells: list[dict[str, Any]] = []
            for ri in range(rows):
                for ci in range(cols):
                    text = str(df.iat[ri, ci]).strip()
                    if text.lower() == "nan":
                        text = ""
                    cx0 = x0 + ci * cell_w
                    cy0 = y0 + ri * cell_h
                    cells.append(
                        {
                            "row": ri,
                            "col": ci,
                            "rowSpan": 1,
                            "colSpan": 1,
                            "text": text,
                            "bbox": [cx0, cy0, cx0 + cell_w, cy0 + cell_h],
                            # TATR is a learned layout detector, not an OCR
                            # confidence score — kept conservative so this
                            # backend only ever fills a true gap and never
                            # outranks a vector or ruled-grid extraction.
                            "confidence": 0.55 if text else 0.3,
                        }
                    )
            built = {
                "source": "gmft-tatr",
                "score": 0.55,
                "page": page_num,
                "rows": rows,
                "cols": cols,
                "cells": cells,
                "bbox": [float(x0), float(y0), float(x1), float(y1)],
            }
            if _passes_sanity(built):
                out.append(built)
        return out
    finally:
        doc.close()


def extract_tables(params: dict[str, Any]) -> dict[str, Any]:
    pdf_path = params.get("pdfPath")
    page_num = int(params.get("page") or 0)
    if not pdf_path or page_num < 1:
        raise ValueError("pdfPath and page (1-based) required")
    bbox_hint = params.get("bboxHint")
    explicit = params.get("explicitLines") or {}
    want = params.get("backends") or BACKEND_ORDER
    available = set(_available_backends())
    tables: list[dict[str, Any]] = []

    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        if page_num > len(pdf.pages):
            return {"tables": []}
        page = pdf.pages[page_num - 1]
        if bbox_hint and len(bbox_hint) == 4:
            x0, y0, x1, y1 = bbox_hint
            pb = page.bbox
            cx0 = max(float(pb[0]), min(float(x0), float(pb[2])))
            cy0 = max(float(pb[1]), min(float(y0), float(pb[3])))
            cx1 = max(float(pb[0]), min(float(x1), float(pb[2])))
            cy1 = max(float(pb[1]), min(float(y1), float(pb[3])))
            if cx1 - cx0 > 8 and cy1 - cy0 > 8:
                try:
                    page = page.within_bbox((cx0, cy0, cx1, cy1))
                except ValueError:
                    pass

        for backend in want:
            if backend not in available:
                continue
            try:
                if backend == "vector-lines":
                    found = _extract_vector_lines(page, page_num, explicit)
                elif backend == "pdfplumber-lines":
                    found = _extract_pdfplumber(page, page_num, "lines")
                elif backend == "pdfplumber-lines_strict":
                    found = _extract_pdfplumber(page, page_num, "lines_strict")
                elif backend == "camelot-lattice":
                    found = _extract_camelot(pdf_path, page_num, "lattice")
                elif backend == "camelot-stream":
                    found = _extract_camelot(pdf_path, page_num, "stream")
                else:
                    continue
                if found:
                    tables.extend(found)
                    break
            except Exception:
                continue

    return {"tables": tables}


def handle(req: dict[str, Any]) -> None:
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}
    try:
        if method == "ping":
            _ok(req_id, {"ok": True, "backends": _available_backends()})
        elif method == "extract_tables":
            _ok(req_id, extract_tables(params))
        elif method == "extract_grid":
            # Imported lazily and only here: vectorgrid needs shapely and
            # pymupdf, and a deployment without them must still serve
            # ping/extract_tables rather than failing at process start.
            from vectorgrid_rpc import extract_grid_rpc
            _ok(req_id, extract_grid_rpc(params))
        elif method == "shutdown":
            _ok(req_id, {"ok": True})
            sys.exit(0)
        else:
            _err(req_id, -32601, f"unknown method: {method}")
    except Exception as e:
        _err(req_id, -32000, f"{e}\n{traceback.format_exc()}")


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            _err(None, -32700, f"parse error: {e}")
            continue
        if not isinstance(req, dict):
            _err(None, -32600, "request must be a JSON object")
            continue
        handle(req)


if __name__ == "__main__":
    main()
