#!/usr/bin/env python3
"""
TABLE-EXTRACTOR BAKE-OFF — score third-party extractors on OUR sheets, against
OUR hand-authored recall keys, with the same ruler we hold sheetgraph.ts to.

WHY THIS EXISTS
---------------
"Would Docling / MinerU / camelot do better than what we built?" was
unanswerable until the recall tier existed, because there was nothing to score
against. Now `opentakeoff-corpus/keys/<id>.tables.csv` records every schedule
table a human sees on a rendered sheet, authored independently of any
pipeline. This runs the candidates over the same page and scores them the same
way, so the comparison is a number instead of an impression.

THE SCORING RULE, AND WHY IT IS STRICT
--------------------------------------
A detection counts ONLY when a keyed caption sits directly above it and the two
share at least half the caption's width. A bare region count is not a score —
measured on 061_IA#58, camelot-stream returns 12 regions against 13 real
tables, which looks like a near-perfect hit and is actually 3: the other nine
are grid fragments that belong to no titled table. Our own extractor is held
to exactly this bar (the recall tier matches on title), so anything looser
would be scoring the competition on an easier test than the incumbent.

    python3 bakeoff.py <set-id> <page> [--backends a,b,c]
    python3 bakeoff.py 061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building 58

Backends self-register only if importable AND able to load their weights, so a
missing model is reported as UNAVAILABLE with its real reason rather than
silently scoring 0 — a 0 that means "blocked" and a 0 that means "found
nothing" are different facts and must never be printed the same way.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

CORPUS = Path("/home/user/master-plan/opentakeoff-corpus")
BULK = [CORPUS / "bulk/HVAC_BAS_Plan_Sets", CORPUS / "bulk/HVAC_BAS_Plan_Sets_Vol2"]
SCRATCH = Path(os.environ.get("BAKEOFF_TMP", "/tmp/bakeoff"))

norm = lambda s: re.sub(r"\s+", " ", (s or "").upper()).strip()


def find_pdf(set_id: str) -> Path:
    for d in BULK:
        p = d / f"{set_id}.pdf"
        if p.exists():
            return p
    raise SystemExit(f"no PDF for set id {set_id!r} under {[str(d) for d in BULK]}")


def load_key(set_id: str, page: int) -> list[str]:
    """Titles the key records for THIS sheet. Sheet-key codec: page 1 = bare
    file name, pages 2+ = 'name#page' (mirrors Session's own codec)."""
    kp = CORPUS / "keys" / f"{set_id}.tables.csv"
    if not kp.exists():
        raise SystemExit(f"no recall key at {kp} — author one before scoring anything against it")
    want_sheet = f"{set_id}.pdf" if page == 1 else f"{set_id}.pdf#{page}"
    out = []
    for line in kp.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        row = next(csv.reader([line]))
        if row[0] == "sheet":
            continue
        if row[0] == want_sheet:
            out.append(row[1])
    return out


def single_page_pdf(src: Path, page: int) -> Path:
    """qpdf, not a Python lib — nothing here should need a PDF writer
    dependency just to slice one page off for the backends that want a file."""
    SCRATCH.mkdir(parents=True, exist_ok=True)
    dst = SCRATCH / f"{src.stem}-p{page}.pdf"
    if not dst.exists():
        rc = os.system(f'qpdf "{src}" --pages . {page} -- "{dst}" 2>/dev/null')
        if rc != 0 or not dst.exists():
            raise SystemExit(f"qpdf failed to extract page {page} of {src}")
    return dst


# ── backends ────────────────────────────────────────────────────────────────
# Each returns (regions, note) where a region is (x0, top, x1, bottom) in
# pdfplumber's coordinate space: PDF points, origin TOP-left. Every backend
# that natively uses a bottom-left origin converts here, once, at the source.

def bk_pdfplumber(pdf: Path, strategy: str):
    import pdfplumber
    st = {"vertical_strategy": strategy, "horizontal_strategy": strategy}
    with pdfplumber.open(pdf) as d:
        return [t.bbox for t in d.pages[0].find_tables(table_settings=st)], ""


def bk_camelot(pdf: Path, flavor: str):
    import camelot
    import pdfplumber
    with pdfplumber.open(pdf) as d:
        H = float(d.pages[0].height)
    ts = camelot.read_pdf(str(pdf), pages="1", flavor=flavor)
    # camelot bbox is (x0, y0, x1, y1) with a BOTTOM-left origin — flip to top-left
    return [(t._bbox[0], H - t._bbox[3], t._bbox[2], H - t._bbox[1]) for t in ts], ""


def bk_img2table(pdf: Path):
    from img2table.document import PDF as I2TPDF
    import pdfplumber
    with pdfplumber.open(pdf) as d:
        pg = d.pages[0]
        H, W = float(pg.height), float(pg.width)
    doc = I2TPDF(str(pdf), detect_rotation=False, pdf_text_extraction=True)
    got = doc.extract_tables(implicit_rows=False, borderless_tables=True, min_confidence=50)
    regions, sx, sy = [], None, None
    for _pg, tables in got.items():
        for t in tables:
            b = t.bbox
            if sx is None:
                # img2table reports in RENDERED PIXELS, not points. Recover the
                # scale from the page it rendered rather than assuming 200 DPI.
                sx = W / max(getattr(doc, "images", [[None]])[0].shape[1], 1) if getattr(doc, "images", None) else 72.0 / 200.0
                sy = sx
            regions.append((b.x1 * sx, b.y1 * sy, b.x2 * sx, b.y2 * sy))
    return regions, "coords scaled from render px to points"


def bk_docling(pdf: Path):
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    opts = PdfPipelineOptions()
    opts.do_ocr = False                      # our text layer is clean and complete
    opts.do_table_structure = True
    opts.table_structure_options.do_cell_matching = True
    conv = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    doc = conv.convert(str(pdf)).document
    regions = []
    for t in doc.tables:
        for prov in (t.prov or []):
            bb = prov.bbox
            # docling bbox origin depends on coord_origin; normalise to top-left
            top, bot = (bb.t, bb.b) if bb.t < bb.b else (bb.b, bb.t)
            regions.append((bb.l, top, bb.r, bot))
    return regions, f"{len(doc.tables)} tables"


BACKENDS = {
    "pdfplumber-lines":        lambda p: bk_pdfplumber(p, "lines"),
    "pdfplumber-lines_strict": lambda p: bk_pdfplumber(p, "lines_strict"),
    "camelot-lattice":         lambda p: bk_camelot(p, "lattice"),
    "camelot-stream":          lambda p: bk_camelot(p, "stream"),
    "img2table":               bk_img2table,
    "docling":                 bk_docling,
}


# ── scoring ─────────────────────────────────────────────────────────────────

def caption_boxes(pdf: Path, titles: list[str]) -> dict[str, tuple | None]:
    """Where each keyed caption is printed. A caption the text layer does not
    carry is reported as such — it is not the extractor's fault and must not be
    counted against it."""
    import pdfplumber
    with pdfplumber.open(pdf) as d:
        words = d.pages[0].extract_words(use_text_flow=False, keep_blank_chars=False)
    lines: dict[int, list] = {}
    for w in words:
        lines.setdefault(round(w["top"] / 3), []).append(w)
    out = {}
    for t in titles:
        want, hit = norm(t), None
        for _, ws in lines.items():
            ws = sorted(ws, key=lambda w: w["x0"])
            if want in norm(" ".join(w["text"] for w in ws)):
                hit = (min(w["x0"] for w in ws), min(w["top"] for w in ws),
                       max(w["x1"] for w in ws), max(w["bottom"] for w in ws))
                break
        out[t] = hit
    return out


def score(regions, caps) -> list[str]:
    hits = []
    for title, cp in caps.items():
        if not cp:
            continue
        cx0, _ctop, cx1, cbot = cp
        cw = max(cx1 - cx0, 1)
        for (x0, top, x1, bot) in regions:
            if top < cbot - 2 or top > cbot + 120:      # must sit DIRECTLY under the caption
                continue
            if min(x1, cx1) - max(x0, cx0) >= cw * 0.5:  # and share its band
                hits.append(title)
                break
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("set_id")
    ap.add_argument("page", type=int)
    ap.add_argument("--backends", default=",".join(BACKENDS))
    ap.add_argument("--show-misses", action="store_true")
    a = ap.parse_args()

    src = find_pdf(a.set_id)
    titles = load_key(a.set_id, a.page)
    if not titles:
        raise SystemExit(f"key has no rows for {a.set_id} page {a.page}")
    page_pdf = single_page_pdf(src, a.page)
    caps = caption_boxes(page_pdf, titles)
    locatable = sum(1 for v in caps.values() if v)

    print(f"\n{a.set_id}  page {a.page}")
    print(f"ground truth: {len(titles)} tables   captions present in text layer: {locatable}/{len(titles)}\n")
    print(f"{'backend':26s} {'regions':>7s}  {'matched':>9s}   time")
    print("-" * 62)

    for name in [b.strip() for b in a.backends.split(",") if b.strip()]:
        fn = BACKENDS.get(name)
        if not fn:
            print(f"{name:26s} {'—':>7s}  {'UNKNOWN':>9s}")
            continue
        t0 = time.time()
        try:
            regions, note = fn(page_pdf)
        except Exception as e:
            msg = str(e).splitlines()[0][:34] if str(e) else ""
            print(f"{name:26s} {'—':>7s}  {'UNAVAIL':>9s}   {type(e).__name__}: {msg}")
            continue
        hits = score(regions, caps)
        print(f"{name:26s} {len(regions):7d}  {len(hits):4d}/{len(titles):<4d}   {time.time()-t0:5.1f}s  {note}")
        if a.show_misses:
            for t in titles:
                if t not in hits:
                    print(f"      MISS  {t}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
