#!/usr/bin/env python3
"""ASSEMBLIES WP4.4 (a): UFC 3-410-01 (28 July 2025) Table 3-1, "DDC Minimum
Points List", verbatim.

Reads the table's two pages from the PDF by position (each list is a column
under its heading; a bullet starts an item and indented lines continue it)
and writes ufc-3-410-01-table-3-1.json beside this script with every item,
its list, and its page locator. UFC 3-410-01 is marked "APPROVED FOR PUBLIC
RELEASE; DISTRIBUTION UNLIMITED" (a US Government work).

Usage: python3 ufc-3-410-01-table-3-1.py <UFC_3_410_01 PDF>   (needs PyMuPDF)
"""
import hashlib, json, os, sys
import pymupdf

TITLE = "Table 3-1 DDC Minimum Points List"
HEADINGS = ["Hot Water Heating System", "VAV System", "Chilled Water System", "Air Distribution System", "General Building Systems"]

def lines(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t: out.append((l["bbox"][0], l["bbox"][1], l["bbox"][3], t))
    return out

def main():
    path = sys.argv[1]
    raw = open(path, "rb").read()
    doc = pymupdf.open(path)
    pages = [i for i in range(doc.page_count) if any(t.startswith(TITLE) for _, _, _, t in lines(doc[i]))]
    lists = []
    for i in pages:
        ls = lines(doc[i])
        # the printed page number is the footer; nothing at or below it is table text
        foot_y, printed = next((y, t) for x, y, _, t in ls if y > 700 and t.strip().isdigit())
        ls = [r for r in ls if r[1] < foot_y]
        heads = [(x, y, t) for x, y, _, t in ls if t in HEADINGS]
        for hx, hy, name in heads:
            # the column: lines left-aligned under the heading, down to the next heading in it
            right = min([x for x, y, t in heads if x > hx + 50] + [10_000])
            below = [h for h in heads if abs(h[0] - hx) < 50 and h[1] > hy]
            stop = min([h[1] for h in below] + [10_000])
            col = sorted([(y, x, t) for x, y, _, t in ls if hx - 20 <= x < right - 20 and hy < y < stop], key=lambda r: (round(r[0], 1), r[1]))
            items, cur = [], None
            for y, x, t in col:
                if t == "•": cur = None; continue
                if t.startswith("*"): break  # the footnote closes the list
                bullet = any(abs(yy - y) < 1.5 and tt == "•" for yy, xx, tt in col)
                if bullet or cur is None:
                    cur = {"text": t}; items.append(cur)
                else:
                    cur["text"] += " " + t
            for n, it in enumerate(items, 1):
                it["text"] = " ".join(it["text"].split())
                it["id"] = f"{''.join(w[0] for w in name.split()).lower()}-{n:02d}"
            lists.append({"list": name, "pdf_page": i + 1, "printed_page": int(printed), "items": items})
    lists.sort(key=lambda l: HEADINGS.index(l["list"]))
    foot = next((t for p in pages for x, y, _, t in lines(doc[p]) if t.startswith("*For Navy projects")), None)
    out = {
        "document": "UFC 3-410-01, Heating, Ventilating, and Air Conditioning Systems",
        "date": "28 July 2025",
        "table": TITLE,
        "distribution": "APPROVED FOR PUBLIC RELEASE; DISTRIBUTION UNLIMITED",
        "pdf_sha256": hashlib.sha256(raw).hexdigest(),
        "generator": "web/test/assemblies/fixtures/ufc-3-410-01-table-3-1.py",
        "footnote_starts": foot,
        "lists": lists,
    }
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "ufc-3-410-01-table-3-1.json"), "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print({l["list"]: len(l["items"]) for l in lists})

if __name__ == "__main__":
    main()
