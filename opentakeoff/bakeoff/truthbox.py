#!/usr/bin/env python3
"""
AUTHOR REAL BOX GROUND TRUTH — by looking, not by trusting the extractor.

WHY THIS EXISTS
---------------
`boxfit.py` scores whether a box is CLEAN using a proxy: caption positions and
drawn rules. I wrote that proxy, and over one session I changed it four times
and every change raised the score. Each change was defensible on its own and
each was checked against the pdfplumber baseline too — but the structural
problem does not go away by being careful. There is no hand-authored box truth
in this corpus, so "121/122 clean" means *no check I wrote found a fault*, not
*121 boxes are correct*. Those are different claims and only one of them is
worth anything.

This produces the missing thing: `keys/<id>.tableboxes.csv`, four numbers per
keyed table, in PDF points, authored by INSPECTION.

THE METHOD, AND WHY IT IS NOT CIRCULAR
--------------------------------------
The extractor proposes a box. This renders the table's neighbourhood with that
box drawn on it in red, and a labelled coordinate grid — 100pt majors, 20pt
minors — printed over the top. A human then reads the TRUE edges off the ruler
and writes them down. The proposal is only there to aim the crop and to save
typing; what gets recorded is what the eye measured, and a wrong proposal is
visible immediately as a red line sitting somewhere other than the table's
border.

That keeps the authoring honest in the one way that matters: the number
written down comes from the drawing, not from the code being graded.

    python3 truthbox.py --sheet 073_MT_... 21        # render every table on a sheet
    python3 truthbox.py --sheets                     # list what still needs authoring
"""
from __future__ import annotations

import argparse
import csv
import subprocess
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

from PIL import Image, ImageDraw                                   # noqa: E402

from bakeoff import detail_captions, CORPUS, caption_boxes, find_pdf, region_owners, single_page_pdf  # noqa: E402
from boxfit import keyed_sheets                                    # noqa: E402
from vectorgrid import find_tables                                 # noqa: E402

RENDER = Path(__file__).resolve().parents[1] / "mcp/scripts/render-page-crop.mjs"
MCP = Path(__file__).resolve().parents[1] / "mcp"
OUT = Path("/tmp/claude-0/-home-user-master-plan/aec616a5-4685-5c5d-9d69-b4590b606bae/scratchpad/truth")
PAD = 70.0          # points of context around the proposal, so a box that is
                    # too SMALL is as visible as one that is too large


def render(pdf: Path, page: int, crop: tuple, png: Path, scale: float) -> None:
    png.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["node", "--import", "tsx", str(RENDER), str(pdf), str(page), str(png),
         "--scale", str(scale),
         "--crop", ",".join(f"{v:.0f}" for v in crop)],
        cwd=MCP, check=True, capture_output=True)


def overlay(png: Path, crop: tuple, scale: float, boxes: list) -> None:
    """Draw the proposals and a readable coordinate ruler in PDF points."""
    im = Image.open(png).convert("RGB")
    d = ImageDraw.Draw(im)
    cx, cy = crop[0], crop[1]

    def to_px(x, y):
        return ((x - cx) * scale, (y - cy) * scale)

    # minor ticks every 20pt, majors every 100pt with the coordinate printed
    x = (int(cx) // 20) * 20
    while x < cx + crop[2]:
        px, _ = to_px(x, 0)
        major = x % 100 == 0
        d.line([(px, 0), (px, 14 if major else 7)], fill=(0, 140, 255), width=1)
        if major:
            d.text((px + 2, 15), str(int(x)), fill=(0, 140, 255))
        x += 20
    y = (int(cy) // 20) * 20
    while y < cy + crop[3]:
        _, py = to_px(0, y)
        major = y % 100 == 0
        d.line([(0, py), (14 if major else 7, py)], fill=(0, 140, 255), width=1)
        if major:
            d.text((16, py + 2), str(int(y)), fill=(0, 140, 255))
        y += 20

    for (x0, top, x1, bot), label in boxes:
        a, b = to_px(x0, top)
        c, e = to_px(x1, bot)
        d.rectangle([a, b, c, e], outline=(220, 0, 0), width=2)
        d.text((a + 3, b - 12), label, fill=(220, 0, 0))
    im.save(png)


def do_sheet(set_id: str, page: int, scale: float) -> int:
    pdf = single_page_pdf(find_pdf(set_id), page)
    titles = next(t for s, p, t in keyed_sheets() if s == set_id and p == page)
    caps = caption_boxes(pdf, titles)
    tables = find_tables(str(pdf), 1)["tables"]
    owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))

    done = 0
    for i, t in enumerate(titles):
        prop = [b for b, ti in owners.items() if ti == t]
        if not prop:
            print(f"  !! {t[:50]} — NO PROPOSAL; crop from the caption instead")
            cp = caps.get(t)
            if not cp:
                continue
            prop = [(cp[0] - 200, cp[1], cp[2] + 200, cp[3] + 400)]
        b = prop[0]
        crop = (max(0.0, b[0] - PAD), max(0.0, b[1] - PAD),
                b[2] - b[0] + 2 * PAD, b[3] - b[1] + 2 * PAD)
        png = OUT / f"{set_id[:24]}_p{page}_{i:02d}.png"
        render(find_pdf(set_id), page, crop, png, scale)
        overlay(png, crop, scale, [(b, t[:34])])
        print(f"  {png}   proposal ({b[0]:.0f},{b[1]:.0f})-({b[2]:.0f},{b[3]:.0f})  {t[:44]}")
        done += 1
    return done


def do_full(set_id: str, page: int, scale: float) -> int:
    """The whole sheet, every proposal drawn. Cheaper to audit than N crops
    when a sheet's tables are all suspect, and it also shows a table the
    extractor placed somewhere absurd, which a per-table crop hides by
    construction (it crops AROUND the proposal)."""
    import pdfplumber
    pdf = single_page_pdf(find_pdf(set_id), page)
    titles = next(t for s, p, t in keyed_sheets() if s == set_id and p == page)
    caps = caption_boxes(pdf, titles)
    tables = find_tables(str(pdf), 1)["tables"]
    owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))
    with pdfplumber.open(pdf) as doc:
        W, H = float(doc.pages[0].width), float(doc.pages[0].height)
    png = OUT / f"{set_id[:24]}_p{page}_FULL.png"
    crop = (0.0, 0.0, W, H)
    render(find_pdf(set_id), page, crop, png, scale)
    overlay(png, crop, scale,
            [(b, t[:26]) for b, t in owners.items()])
    print(f"  {png}   {len(owners)}/{len(titles)} proposals drawn, page {W:.0f}x{H:.0f}")
    for b, t in sorted(owners.items(), key=lambda kv: kv[0][1]):
        print(f"     ({b[0]:7.0f},{b[1]:7.0f})-({b[2]:7.0f},{b[3]:7.0f})  {t[:46]}")
    for t in titles:
        if t not in owners.values():
            print(f"     -- NO PROPOSAL: {t[:46]}")
    return 1


def screen() -> int:
    """Which proposals need EYES on them, and which are safe to spot-check.

    This does not decide truth — looking does. It decides where to look, which
    is the difference between auditing 122 crops and auditing the dozen that
    can actually be wrong. A box edge that lies exactly on a drawn rule
    spanning the box is almost certainly the table's real border; an edge
    floating in white space is either wrong or the table has no border there,
    and either way a human has to look.
    """
    import pdfplumber
    from vectorgrid import segments_from_page

    print(f"{'sheet / table':64s} {'edges on a rule':>16s}  verdict")
    print("-" * 96)
    weak = ok = 0
    for set_id, page, titles in keyed_sheets():
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        tables = find_tables(str(pdf), 1)["tables"]
        owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))
        with pdfplumber.open(pdf) as doc:
            segs = segments_from_page(doc.pages[0])
        hs = [(x0, x1, y0) for x0, y0, x1, y1, _w in segs if y0 == y1]
        vs = [(y0, y1, x0) for x0, y0, x1, y1, _w in segs if x0 == x1]

        for t in titles:
            b = next((r for r, ti in owners.items() if ti == t), None)
            if b is None:
                print(f"{(set_id[:26] + ' p' + str(page) + ' ' + t[:28]):64s} "
                      f"{'NO PROPOSAL':>16s}  LOOK")
                weak += 1
                continue
            x0, top, x1, bot = b
            w, h = max(x1 - x0, 1.0), max(bot - top, 1.0)
            on = 0
            for edge, coord in (("h", top), ("h", bot)):
                if any(abs(hy - coord) <= 2 and min(hx1, x1) - max(hx0, x0) >= w * 0.8
                       for hx0, hx1, hy in hs):
                    on += 1
            for edge, coord in (("v", x0), ("v", x1)):
                if any(abs(vx - coord) <= 2 and min(vy1, bot) - max(vy0, top) >= h * 0.8
                       for vy0, vy1, vx in vs):
                    on += 1
            verdict = "ok" if on == 4 else "LOOK"
            if on == 4:
                ok += 1
            else:
                weak += 1
            print(f"{(set_id[:26] + ' p' + str(page) + ' ' + t[:28]):64s} "
                  f"{str(on) + '/4':>16s}  {verdict}")
    print("-" * 96)
    print(f"{ok} proposals sit on a drawn rule on all four sides; {weak} need eyes")
    return 0


HEADER = "sheet,table_title,x0,top,x1,bot,provenance\n"


def accept(set_id: str, page: int, note: str) -> int:
    """Record the current proposals for one sheet as ground truth.

    ONLY call this for a sheet whose overlay has actually been looked at. The
    provenance column says so, and it says at what scale — a box confirmed on a
    0.75x whole-sheet render is confirmed to about five points, not to one, and
    a later reader is entitled to know which. Where a proposal was wrong, the
    row is corrected by hand afterwards and its provenance changed to
    `corrected`; the file is the record, not this function.
    """
    pdf = single_page_pdf(find_pdf(set_id), page)
    titles = next(t for s, p, t in keyed_sheets() if s == set_id and p == page)
    caps = caption_boxes(pdf, titles)
    owners = region_owners([t["bbox"] for t in find_tables(str(pdf), 1)["tables"]], caps)
    sheet = f"{set_id}.pdf" if page == 1 else f"{set_id}.pdf#{page}"

    kp = CORPUS / "keys" / f"{set_id}.tableboxes.csv"
    rows = []
    if kp.exists():
        rows = [r for r in csv.reader(kp.read_text().splitlines())
                if r and r[0] not in ("sheet",) and r[0] != sheet]
    n = 0
    for t in titles:
        b = next((r for r, ti in owners.items() if ti == t), None)
        if b is None:
            rows.append([sheet, t, "", "", "", "", "NOT LOCATED — needs authoring by hand"])
            continue
        rows.append([sheet, t, f"{b[0]:.1f}", f"{b[1]:.1f}", f"{b[2]:.1f}", f"{b[3]:.1f}", note])
        n += 1
    rows.sort(key=lambda r: (r[0], r[1]))
    with kp.open("w") as f:
        f.write(HEADER)
        csv.writer(f).writerows(rows)
    print(f"  wrote {n} boxes for {sheet} -> {kp.name}  ({note})")
    return 0


def status() -> int:
    print(f"{'sheet':46s} {'tables':>7s} {'authored':>9s}")
    for set_id, page, titles in keyed_sheets():
        kp = CORPUS / "keys" / f"{set_id}.tableboxes.csv"
        have = 0
        if kp.exists():
            want = f"{set_id}.pdf" if page == 1 else f"{set_id}.pdf#{page}"
            for line in kp.read_text().splitlines():
                if line.strip() and not line.startswith("#"):
                    row = next(csv.reader([line]))
                    if row[0] == want:
                        have += 1
        print(f"{(set_id[:32] + ' p' + str(page)):46s} {len(titles):7d} {have:9d}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", nargs=2, metavar=("SET_ID", "PAGE"))
    ap.add_argument("--sheets", action="store_true")
    ap.add_argument("--screen", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--accept", metavar="PROVENANCE",
                    help="record this sheet's proposals as truth; only after looking")
    ap.add_argument("--scale", type=float, default=1.4)
    a = ap.parse_args()
    if a.accept:
        if not a.sheet:
            ap.error("--accept needs --sheet SET_ID PAGE")
        return accept(a.sheet[0], int(a.sheet[1]), a.accept)
    if a.screen:
        return screen()
    if a.sheets:
        return status()
    if not a.sheet:
        ap.error("give --sheet SET_ID PAGE, or --sheets")
    n = (do_full if a.full else do_sheet)(a.sheet[0], int(a.sheet[1]), a.scale)
    print(f"\n{n} crops written to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
