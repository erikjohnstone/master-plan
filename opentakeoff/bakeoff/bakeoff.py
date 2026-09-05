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
    from docling_core.types.doc import CoordOrigin
    import pdfplumber

    with pdfplumber.open(pdf) as d:
        H = float(d.pages[0].height)

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
            # Docling reports BOTTOMLEFT origin (verified live on 061_IA#58:
            # coord_origin=CoordOrigin.BOTTOMLEFT, t=2092 > b=1820 on a 2160pt
            # page, i.e. `t` is the upper edge measured from the page bottom).
            # Merely ordering t/b without flipping the origin mirrors every
            # region vertically and silently loses real matches — it scored
            # docling 3/13 here before this was caught.
            if bb.coord_origin == CoordOrigin.BOTTOMLEFT:
                top, bot = H - max(bb.t, bb.b), H - min(bb.t, bb.b)
            else:
                top, bot = min(bb.t, bb.b), max(bb.t, bb.b)
            regions.append((bb.l, top, bb.r, bot))
    return regions, f"{len(doc.tables)} tables"


def bk_vectorgrid(pdf: Path):
    """Our ruling-graph pipeline — faces of the drawn arrangement, split on
    stroke weight. The only backend here that never rasterises and never
    infers structure from text position."""
    from vectorgrid import find_tables
    out = find_tables(str(pdf), 1)
    d = out["diagnostics"]
    return ([t["bbox"] for t in out["tables"]],
            f"segs={d.get('segments')} cells={d.get('cells')} bw={d.get('border_weight')}")


BACKENDS = {
    "vectorgrid":              bk_vectorgrid,
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
            # Match a CONTIGUOUS RUN of words, not "is this substring anywhere
            # in the line". Two captions routinely share a y on these sheets
            # (SHELL AND TUBE HEAT EXCHANGER on the left, HYDRONIC PUMP on the
            # right of 061_IA#58) — matching the whole line hands both titles
            # the same box, which is the left one's, so the right-hand table
            # can never match any region and scores a false miss.
            for i in range(len(ws)):
                for j in range(i + 1, len(ws) + 1):
                    if norm(" ".join(w["text"] for w in ws[i:j])) == want:
                        run = ws[i:j]
                        hit = (min(w["x0"] for w in run), min(w["top"] for w in run),
                               max(w["x1"] for w in run), max(w["bottom"] for w in run))
                        break
                if hit:
                    break
            if hit:
                break
        if hit is None:
            hit = _wrapped_caption(lines, want)
        out[t] = hit
    return out


def _wrapped_caption(lines: dict, want: str) -> tuple | None:
    """A caption printed on two lines is still that caption.

    Titles on these sheets are centred over their table and wrap when they are
    long: 12_MT#11 draws SINGLE-PLATE SHEAR / CONNECTION SCHEDULE as two
    stacked runs, 21pt type on 26pt leading. A single-line matcher reports the
    caption as absent from the text layer, which counts as unfindable rather
    than as a miss — on that sheet it wrote off one of three tables before any
    extractor ran.

    The join must be exactly the wanted title, the two runs must be vertically
    adjacent and must overlap horizontally, so this can find a caption a
    single-line match missed but never invent one.
    """
    bands = [(min(w["top"] for w in ws), max(w["bottom"] for w in ws),
              sorted(ws, key=lambda w: w["x0"])) for ws in lines.values()]
    bands.sort()
    for ai, (a_top, a_bot, top) in enumerate(bands):
        a_h = max(a_bot - a_top, 1.0)
        for b_top, _b_bot, bot in bands[ai + 1:]:
            if b_top <= a_bot:
                continue
            # Leading is proportional to type size, so the gap separating two
            # lines of one title from two unrelated rows is too — a fixed point
            # threshold either misses a display-type title or swallows the row
            # under a small one. Pair by GEOMETRY, not by list order: on a
            # drawing sheet a dozen unrelated bands sit between a title's two
            # lines in top order.
            if b_top - a_bot > 0.9 * a_h:
                break
            for i in range(len(top)):
                for j in range(i + 1, len(top) + 1):
                    head = norm(" ".join(w["text"] for w in top[i:j]))
                    if not want.startswith(head + " "):
                        continue
                    hx0 = min(w["x0"] for w in top[i:j]); hx1 = max(w["x1"] for w in top[i:j])
                    for k in range(len(bot)):
                        for m in range(k + 1, len(bot) + 1):
                            run = top[i:j] + bot[k:m]
                            if norm(" ".join(w["text"] for w in run)) != want:
                                continue
                            tx0 = min(w["x0"] for w in bot[k:m])
                            tx1 = max(w["x1"] for w in bot[k:m])
                            if min(hx1, tx1) - max(hx0, tx0) <= 0:
                                continue      # side by side, not stacked
                            return (min(hx0, tx0), a_top, max(hx1, tx1),
                                    max(w["bottom"] for w in bot[k:m]))
    return None


def score(regions, caps) -> list[str]:
    """A region matches a caption when the caption sits at the TOP of it —
    either just above it, or inside its upper band.

    Both cases are real and a fair test must accept both: camelot and
    pdfplumber return the grid only, so their region starts below the caption,
    while Docling's region CONTAINS the caption (measured on 061_IA#58: region
    top=68 against caption top=83). An earlier version of this demanded the
    region start below the caption and scored Docling 0/13 on a page where it
    had in fact bracketed eleven of the thirteen captions — the rule was
    measuring which library draws its box where, not which one found the table.

    A region that ENDS above the caption is excluded whatever the top says. The
    +140 window is generous enough that a 29pt-tall region — the trailing rows
    of the table above — can sit entirely above a caption and still claim it:
    measured on 001_NC#49, where DEHUMIDIFIER SCHEDULE and AIR SEPARATOR
    SCHEDULE each collected a stray band belonging to the schedule above and
    were scored SPLIT for it. Nothing that finishes before the title starts is
    that title's table.
    """
    return sorted({t for t in region_owners(regions, caps).values()})


def region_owners(regions, caps) -> dict:
    """Region -> the one caption it belongs to.

    ONE REGION HAS ONE OWNER. Stacked schedules sit close enough that the
    windows overlap — on 073_MT#21 the FOOTING block's top is 42pt under the
    HELICAL PIER caption and 34pt over its own, so both captions pass the test
    for it and the sheet reads as a fragmented table when the extraction is
    exactly right. The nearest caption above wins, which is also what a reader
    does.
    """
    owners = {}
    for r in regions:
        x0, top, x1, bot = r
        best = None
        for title, cp in caps.items():
            if not cp:
                continue
            cx0, ctop, cx1, cbot = cp
            cmid = (ctop + cbot) / 2
            if cmid < top - 60 or cmid > top + 140:  # caption belongs to THIS region's top
                continue
            if cmid > bot + 5:                       # ... and the region outlives it
                continue
            if min(x1, cx1) - max(x0, cx0) < max(cx1 - cx0, 1) * 0.5:   # shares its band
                continue
            d = abs(cmid - top)
            if best is None or d < best[0]:
                best = (d, title)
        if best:
            owners[r] = best[1]
    return owners


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
