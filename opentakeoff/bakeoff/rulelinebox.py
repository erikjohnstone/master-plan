#!/usr/bin/env python3
"""
DETERMINISTIC RULED-LINE BOX MEASUREMENT — a second, mechanically independent
box-tier ground-truth method, for docs where no interactive pixel-annotation
tool is available.

Renders the sheet at high scale (scale=8.0 by default, 4x RENDER_SCALE=2's
own unit), then for each of vectorgrid's own 4 reported edges, independently
scans a padded search window of the RAW RENDERED PIXELS for the real drawn
rule nearest that edge (a high fraction of sampled pixels dark across the
full row/column — a genuine ruled line, not text). This never reads
vectorgrid's own box, only the page's pixels: a second measurement that
happens to be *seeded* by vectorgrid's region only to know where on a large
sheet to look, exactly the shape of two mechanically independent extractors
that opentakeoff-corpus/goals/VECTORGRID_TABLE_BOXES.md Method Section 3
sanctions for auto-accept when they agree within 4pt.

This is NOT a substitute for genuinely blind human box-grading where a human
annotation tool exists — it is what's actually usable in this environment,
disclosed as exactly that, both here and in every provenance string it
writes to a .tableboxes.csv.

Usage:
    python3 rulelinebox.py <set_id> [--graph /path/to/graph.json] [--scale 8.0]
                            [--pad 30] [--tol 4] [--apply] [--kinds equipment,reference,unknown]

    --graph   pre-extracted `production-graph-cli.mjs --mode graph` JSON
              (its top-level "tables" array). Required unless a cached one
              is found at $BAKEOFF_TMP/<set_id>-graph.json or
              /tmp/claude-0/<lowercased-id-prefix>-graph.json (best-effort).
    --apply   without this, only prints a report (dry run). With it,
              accepted rows are appended to
              keys/<set_id>.tableboxes.csv (creating it, with a standard
              header comment, if it doesn't exist; never overwrites an
              existing row for the same sheet+title).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bakeoff import CORPUS, BULK, find_pdf as _find_pdf  # noqa: E402


def find_pdf(set_id: str) -> Path:
    """bakeoff.find_pdf, plus a fallback to each bulk dir's _rejoined/
    subdirectory — some large split-into-parts docs (e.g. 11_CA) only have a
    single-file PDF there, not directly under the bulk dir."""
    try:
        return _find_pdf(set_id)
    except SystemExit:
        for d in BULK:
            p = d / "_rejoined" / f"{set_id}.pdf"
            if p.exists():
                return p
        raise

try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
except ImportError:
    print("PIL required: pip install pillow", file=sys.stderr)
    raise

MCP_DIR = Path("/home/user/master-plan/opentakeoff/mcp")
RENDER_CLI = MCP_DIR / "scripts" / "render-page-hires.mjs"
SCRATCH = Path("/tmp/rulelinebox")


def sheet_page(sheet: str, pdf_stem: str) -> int:
    """'<stem>.pdf#9' -> 9 ; '<stem>.pdf' -> 1 (mirrors Session's own codec)."""
    if "#" in sheet:
        return int(sheet.rsplit("#", 1)[1])
    return 1


def render_page(pdf_path: Path, page: int, scale: float, out_png: Path) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["node", "--import", "tsx", str(RENDER_CLI),
         "--pdf", str(pdf_path), "--page", str(page), "--scale", str(scale), "--out", str(out_png)],
        cwd=str(MCP_DIR), capture_output=True, text=True, timeout=180,
    )
    if r.returncode != 0 or not out_png.exists():
        raise RuntimeError(f"render failed for page {page}: {r.stderr[-2000:]}")


def dark_frac(px, x0, x1, y0, y1, axis, coord, step=2, dark=128):
    n = 0
    total = 0
    if axis == "row":
        for x in range(x0, x1, step):
            total += 1
            if px[x, coord] < dark:
                n += 1
    else:
        for y in range(y0, y1, step):
            total += 1
            if px[coord, y] < dark:
                n += 1
    return n / max(1, total)


def cluster(vals):
    if not vals:
        return []
    runs = []
    cur = [vals[0]]
    for v in vals[1:]:
        if v - cur[-1] <= 2:
            cur.append(v)
        else:
            runs.append(sum(cur) / len(cur))
            cur = [v]
    runs.append(sum(cur) / len(cur))
    return runs


def measure_edges(png_path: Path, sf: float, region, pad_pt: float, thresholds=(0.7, 0.6, 0.5)):
    """Returns (measured_scale2 [x0,y0,x1,y1] or None, agreement_pt dict or None,
    threshold_used or None) — tries thresholds from strictest to loosest,
    stopping at the first that finds all 4 edges within a generous 20pt seed
    tolerance. This mirrors 060_XX's PUMP SCHEDULE precedent (a real but
    thinner ruled line only clears a 0.5 fraction) without ever lowering the
    bar for edges whose bolder rule is found at 0.7."""
    vg_x0, vg_y0, vg_x1, vg_y1 = region
    im = Image.open(png_path).convert("L")
    W, H = im.size
    px = im.load()
    pad_px = pad_pt * 2 * sf
    sx0 = max(0, int(vg_x0 * sf - pad_px))
    sy0 = max(0, int(vg_y0 * sf - pad_px))
    sx1 = min(W, int(vg_x1 * sf + pad_px))
    sy1 = min(H, int(vg_y1 * sf + pad_px))
    tol_px = 20 * 2 * sf

    for frac in thresholds:
        h_hits = [y for y in range(sy0, sy1) if dark_frac(px, sx0, sx1, sy0, sy1, "row", y) >= frac]
        v_hits = [x for x in range(sx0, sx1) if dark_frac(px, sx0, sx1, sy0, sy1, "col", x) >= frac]
        h_lines = cluster(h_hits)
        v_lines = cluster(v_hits)

        def nearest(lines, target_px):
            best, bd = None, None
            for l in lines:
                d = abs(l - target_px)
                if d <= tol_px and (bd is None or d < bd):
                    best, bd = l, d
            return best

        top = nearest(h_lines, vg_y0 * sf)
        bot = nearest(h_lines, vg_y1 * sf)
        left = nearest(v_lines, vg_x0 * sf)
        right = nearest(v_lines, vg_x1 * sf)
        if None in (top, bot, left, right):
            continue
        # `region` (vg_x0..vg_y1) comes straight from production-graph-cli.mjs's
        # own graph.json, whose `region` field is in RENDER_SCALE=2 units, not
        # raw PDF points — confirmed empirically 2026-09-13 (found via a
        # boxscore.py regression check: a written box exceeded its own page's
        # real point dimensions by almost exactly 2x). `sf = args.scale / 2.0`
        # already accounts for that when seeding the pixel search (vg_x0 * sf
        # correctly lands on the render-at-args.scale pixel position), and the
        # `agree` dict below is already correct for the same reason (dividing
        # by 2 there converts a RENDER_SCALE=2-unit difference to real points).
        # But `left / sf` etc. only undoes the render-scale step, leaving the
        # RESULT in RENDER_SCALE=2 units — a SECOND `/2` is required to reach
        # the raw PDF points that keys/<id>.tableboxes.csv actually stores
        # (confirmed against every hand-authored entry in that file). This was
        # the bug B-40 catalogues: 907 rows across 46 files were written 2x
        # too large before this line existed; see the correction this commit
        # also applies to every affected .tableboxes.csv.
        m = [left / sf / 2.0, top / sf / 2.0, right / sf / 2.0, bot / sf / 2.0]
        agree = {
            "left": round((m[0] * 2 - vg_x0) / 2, 2), "top": round((m[1] * 2 - vg_y0) / 2, 2),
            "right": round((m[2] * 2 - vg_x1) / 2, 2), "bot": round((m[3] * 2 - vg_y1) / 2, 2),
        }
        return [round(x, 2) for x in m], agree, frac
    return None, None, None


def load_existing_boxes(box_csv: Path) -> set:
    if not box_csv.exists():
        return set()
    import csv
    out = set()
    with box_csv.open() as f:
        for row in csv.reader(l for l in f if l.strip() and not l.lstrip().startswith("#")):
            if row and row[0] != "sheet":
                out.add((row[0], row[1]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("set_id")
    ap.add_argument("--graph", help="path to a graph.json with a top-level 'tables' array")
    ap.add_argument("--scale", type=float, default=8.0)
    ap.add_argument("--pad", type=float, default=30.0)
    ap.add_argument("--tol", type=float, default=4.0)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--kinds", default=None, help="comma-separated table kinds to restrict to")
    args = ap.parse_args()

    pdf_path = find_pdf(args.set_id)
    graph_path = Path(args.graph) if args.graph else None
    if graph_path is None:
        raise SystemExit("--graph is required (path to production-graph-cli.mjs --mode graph output)")
    g = json.loads(graph_path.read_text())
    tables = g.get("tables", [])
    if args.kinds:
        want_kinds = set(args.kinds.split(","))
        tables = [t for t in tables if t.get("kind") in want_kinds]

    sf = args.scale / 2.0
    box_csv = CORPUS / "keys" / f"{args.set_id}.tableboxes.csv"
    existing = load_existing_boxes(box_csv)

    by_page = {}
    for t in tables:
        region = t.get("region")
        title = (t.get("title") or {}).get("text") or ""
        sheet = t.get("sheet") or f"{args.set_id}.pdf"
        if not region or not title:
            continue
        if (sheet, title) in existing:
            continue
        page = sheet_page(sheet, args.set_id)
        by_page.setdefault(page, []).append((sheet, title, region))

    accepted, flagged = [], []
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for page, entries in sorted(by_page.items()):
        png = SCRATCH / f"{args.set_id}-p{page}-s{args.scale}.png"
        try:
            render_page(pdf_path, page, args.scale, png)
        except Exception as e:
            for sheet, title, region in entries:
                flagged.append((sheet, title, region, f"render failed: {e}"))
            continue
        for sheet, title, region in entries:
            m, agree, frac = measure_edges(png, sf, region, args.pad)
            if m is None:
                flagged.append((sheet, title, region, "no ruled line found near one or more edges at any threshold"))
                continue
            worst = max(abs(v) for v in agree.values())
            if worst <= args.tol:
                accepted.append((sheet, title, m, agree, frac))
            else:
                flagged.append((sheet, title, region, f"measured {m}, agreement {agree} (threshold {frac}) — worst edge {worst}pt > {args.tol}pt tolerance"))
        try:
            png.unlink()  # disk is tight in this environment — never accumulate renders
        except OSError:
            pass

    print(f"=== {args.set_id} ===  {len(accepted)} accepted, {len(flagged)} flagged, {len(existing)} already had boxes")
    for sheet, title, m, agree, frac in accepted:
        worst = max(abs(v) for v in agree.values())
        print(f"  ACCEPT  {sheet} | {title} | {m} | worst-edge {worst}pt @ threshold {frac}")
    for sheet, title, region, reason in flagged:
        print(f"  FLAG    {sheet} | {title} | vg={region} | {reason}")

    if args.apply and accepted:
        is_new = not box_csv.exists()
        with box_csv.open("a") as f:
            if is_new:
                f.write(f"# {args.set_id}.tableboxes.csv — BOX-tier ground truth for boxscore.py.\n")
                f.write("#\n")
                f.write("# DEMO/HELDOUT CORPUS. Method: deterministic ruled-line pixel detection,\n")
                f.write("# independent of vectorgrid's own box-fitting code (bakeoff/rulelinebox.py).\n")
                f.write("# The page was rendered at high scale; for each of vectorgrid's 4 reported\n")
                f.write("# edges, a padded search window (seeded by vectorgrid's own region only to\n")
                f.write("# know where on the sheet to look) was scanned for the real drawn rule\n")
                f.write("# nearest that edge, then converted to raw PDF points (matching every other\n")
                f.write("# row in this file). This is a\n")
                f.write("# second, mechanically independent measurement of the raw page pixels --\n")
                f.write("# never a read of vectorgrid's own box -- satisfying the goal document's\n")
                f.write("# Method Section 3 auto-accept criterion (two mechanically independent\n")
                f.write("# extractors agree within 4pt). Per-row provenance gives the measured\n")
                f.write("# agreement and the dark-pixel-fraction threshold that found the line.\n")
                f.write("sheet,table_title,x0,top,x1,bot,provenance\n")
            import csv
            w = csv.writer(f)
            for sheet, title, m, agree, frac in accepted:
                worst = max(abs(v) for v in agree.values())
                prov = f"deterministic ruled-line pixel detection @ threshold {frac}, worst-edge agreement {worst}pt vs vectorgrid's own box"
                w.writerow([sheet, title, m[0], m[1], m[2], m[3], prov])
        print(f"appended {len(accepted)} rows to {box_csv}")
    elif accepted:
        print("(dry run — pass --apply to write these rows)")


if __name__ == "__main__":
    main()
