#!/usr/bin/env python3
"""
L2 table extraction sidecar — JSON-RPC 2.0 over newline-delimited JSON on stdio.

Methods:
  ping          → { "ok": true, "backends": [...] }
  extract_tables → { "tables": SidecarTable[] }
  shutdown      → exit 0

Request params for extract_tables:
  pdfPath: str (absolute)
  page: int (1-based)
  bboxHint?: [x0, y0, x1, y1]  # pdfplumber top-left page coords
  explicitLines?: { horizontal: [[x0,y0,x1,y1],...], vertical: [...] }
  backends?: str[]  # default tries all available in priority order
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
]

SANITY_MIN_ROWS = 2
SANITY_MIN_COLS = 2
SANITY_MIN_FILL = 0.60


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
