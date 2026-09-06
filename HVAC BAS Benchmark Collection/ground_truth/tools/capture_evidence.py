"""Capture two independent raw PDF views; never infer takeoff truth.

Shared-path gate: offline audit evidence only, no equipment/table/count decisions.
Run from any directory. Resume only a matching source and capture schema version.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import statistics
import subprocess
import traceback
import xml.etree.ElementTree as ET

import fitz

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"
CAPTURE_VERSION = 1


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def box(rect):
    return [round(float(x), 4) for x in rect]


def token(text):
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def diagnostics(a, b):
    ca = Counter(token(w["text"]) for w in a["words"] if token(w["text"]))
    cb = Counter(token(w["text"]) for w in b["words"] if token(w["text"]))
    common = sum((ca & cb).values())
    denominator = sum(ca.values()) + sum(cb.values())
    # Compare positions only for tokens unique in BOTH engines: no nearest-tag guess.
    wa = {token(w["text"]): w for w in a["words"] if ca[token(w["text"])] == 1}
    wb = {token(w["text"]): w for w in b["words"] if cb[token(w["text"])] == 1}
    distances = []
    for key in wa.keys() & wb.keys():
        if len(key) < 3:
            continue
        x, y = wa[key]["bbox"], wb[key]["bbox"]
        distances.append((((x[0]+x[2]-y[0]-y[2])/2)**2 +
                          ((x[1]+x[3]-y[1]-y[3])/2)**2)**0.5)
    return {
        "page": a["page"],
        "mupdf_words": len(a["words"]), "poppler_words": len(b["words"]),
        "normalized_multiset_dice": round(2*common/denominator, 6) if denominator else None,
        "unique_token_position_pairs": len(distances),
        "median_center_distance_pt": round(statistics.median(distances), 4) if distances else None,
        "max_center_distance_pt": round(max(distances), 4) if distances else None,
        "low_text_requires_visual_recovery": min(sum(ca.values()), sum(cb.values())) < 40,
        "poppler_reported_dimensions_differ_from_display":
            any(abs(x-y) > .1 for x,y in zip(a["display_size"], b["reported_size"])),
        "ground_truth_status": "not_reviewed",
    }


def capture(entry):
    ident = f'{entry["rank"]:02d}__{entry["key"]}'
    target = AUDIT / "evidence" / ident
    pdf = ROOT / entry["output_file"]
    actual = digest(pdf)
    if actual != entry["sha256"]:
        raise ValueError(f"Source hash mismatch: {ident}")
    done_path = target / "capture.json"
    if done_path.exists():
        previous = json.loads(done_path.read_text())
        if previous.get("source_sha256") == actual and previous.get("capture_version") == CAPTURE_VERSION:
            return {"id": ident, "status": "resumed", "pages": previous["page_count"]}

    target.mkdir(parents=True, exist_ok=True)
    fitz.TOOLS.mupdf_display_errors(False)
    fitz.TOOLS.mupdf_display_warnings(False)
    fitz.TOOLS.mupdf_warnings(reset=True)
    a_pages = []
    with fitz.open(pdf) as doc:
        metadata = doc.metadata
        if len(doc) != entry["page_count"]:
            raise ValueError(f"Page count mismatch: {ident}")
        for num, page in enumerate(doc, 1):
            words = []
            for i,w in enumerate(page.get_text("words", sort=False)):
                words.append({"id": i, "text": w[4], "raw_bbox": box(w[:4]),
                              "bbox": box(fitz.Rect(w[:4])*page.rotation_matrix),
                              "block": w[5], "line": w[6], "word": w[7]})
            spans = []
            for bi, block in enumerate(page.get_text("dict")["blocks"]):
                if block.get("type") != 0:
                    continue
                for li, line in enumerate(block["lines"]):
                    for si,s in enumerate(line["spans"]):
                        spans.append({"id": f"{bi}:{li}:{si}", "text": s["text"],
                                      "raw_bbox": box(s["bbox"]),
                                      "bbox": box(fitz.Rect(s["bbox"])*page.rotation_matrix),
                                      "font": s["font"], "size": s["size"],
                                      "flags": s["flags"], "color": s["color"],
                                      "alpha": s.get("alpha"), "direction": line["dir"]})
            data = {"page": num, "rotation": page.rotation,
                    "display_size": box((page.rect.width, page.rect.height)),
                    "cropbox": box(page.cropbox), "mediabox": box(page.mediabox),
                    "rotation_matrix": list(page.rotation_matrix), "words": words,
                    "spans": spans, "text": page.get_text("text", sort=False)}
            save(target / "mupdf" / f"{num:04d}.json", data)
            a_pages.append(data)
        warnings = fitz.TOOLS.mupdf_warnings(reset=True)
    (target / "mupdf_warnings.txt").write_text(warnings)

    raw = target / "poppler_bbox.html"
    command = ["pdftotext", "-bbox-layout", "-cropbox", "-enc", "UTF-8", str(pdf), str(raw)]
    proc = subprocess.run(command, capture_output=True, text=True, timeout=1800)
    (target / "poppler_stderr.txt").write_text(proc.stderr)
    if proc.returncode != 0:
        raise RuntimeError(f"pdftotext returned {proc.returncode}: {ident}")
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    tree = ET.parse(raw)
    pages = tree.findall(".//x:page", ns)
    if len(pages) != len(a_pages):
        raise ValueError(f"Independent page-count disagreement: {ident}")
    summaries = []
    for num, xmlpage in enumerate(pages, 1):
        words = []
        for bi, block in enumerate(xmlpage.findall(".//x:block", ns)):
            for li, line in enumerate(block.findall("x:line", ns)):
                for wi, word in enumerate(line.findall("x:word", ns)):
                    words.append({"id": len(words), "text": "".join(word.itertext()),
                                  "bbox": box(float(word.get(k)) for k in ("xMin", "yMin", "xMax", "yMax")),
                                  "block": bi, "line": li, "word": wi})
        b = {"page": num,
             "reported_size": [float(xmlpage.get(k)) for k in ("width", "height")],
             "coordinate_note": "Raw Poppler word coordinates, displayed orientation; XML page size may be unrotated.",
             "words": words}
        save(target / "poppler" / f"{num:04d}.json", b)
        summaries.append(diagnostics(a_pages[num-1], b))
    version = subprocess.run(["pdftotext", "-v"], capture_output=True, text=True)
    summary = {"capture_version": CAPTURE_VERSION, "id": ident, "rank": entry["rank"],
               "source_pdf": entry["output_file"], "source_sha256": actual,
               "page_count": len(pages), "captured_utc": datetime.now(timezone.utc).isoformat(),
               "engines": {"mupdf": fitz.VersionBind,
                           "poppler": (version.stderr or version.stdout).splitlines()[0]},
               "mupdf_metadata": metadata, "poppler_command": command,
               "raw_poppler_sha256": digest(raw),
               "mupdf_warnings": warnings, "poppler_warnings": proc.stderr,
               "meaning": "Raw evidence only. No takeoff or field verification claimed.",
               "pages": summaries}
    save(done_path, summary)
    return {"id": ident, "status": "captured", "pages": len(pages),
            "low_text_pages": sum(p["low_text_requires_visual_recovery"] for p in summaries),
            "warnings": bool(warnings or proc.stderr)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ranks", type=int, nargs="*")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    entries = json.loads((ROOT / "manifest.json").read_text())["entries"]
    if args.ranks:
        entries = [e for e in entries if e["rank"] in args.ranks]
    failures = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(capture, e): e for e in entries}
        for f in as_completed(futures):
            try:
                print(json.dumps(f.result()), flush=True)
            except Exception:
                failure = {"rank": futures[f]["rank"], "error": traceback.format_exc()}
                failures.append(failure)
                print(json.dumps(failure), flush=True)
    save(AUDIT / "capture_last_run.json", {"requested_ranks": [e["rank"] for e in entries], "failures": failures})
    raise SystemExit(bool(failures))


if __name__ == "__main__":
    main()
