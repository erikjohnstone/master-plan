# Research R3 pilot inputs (dev documents only): the positioned text lines of the pilot pages, in display
# coordinates and reading order, and a 200 dpi crop of one bound control detail for the vision probe.
#   opentakeoff/.venv-sidecar/bin/python plans/05-research/pilot/r3-extract.py
import glob, json, os, pymupdf
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "../../../opentakeoff-corpus/raw")
def find(name): return glob.glob(os.path.join(RAW, "**", name), recursive=True)[0]
pages = {"040": (find("040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf"), [44]),
         "094": (find("094_FL_Orange_County_Regional_History_Center_HVAC.pdf"), [5]),
         "itd": (find("itd-d1-lab-mechanical.pdf"), [11, 20])}
out = {}
for k, (path, idxs) in pages.items():
    doc = pymupdf.open(path)
    for i in idxs:
        page = doc[i]; m = page.rotation_matrix
        lines = []
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                t = "".join(s["text"] for s in l["spans"]).strip()
                if not t: continue
                r = pymupdf.Rect(l["bbox"]) * m
                lines.append({"x": round(r.x0), "y": round(r.y0), "t": t})
        lines.sort(key=lambda x: (round(x["y"] / 6), x["x"]))
        out[f"{k}#{i}"] = {"rotation": page.rotation, "lines": lines}
json.dump(out, open(os.path.join(HERE, "out/pilot-pages.json"), "w"))
# The AHU-4/5/8 control detail on the 094 controls sheet (display coordinates; the page is rotated 90).
doc = pymupdf.open(find("094_FL_Orange_County_Regional_History_Center_HVAC.pdf"))
doc[5].get_pixmap(dpi=200, clip=pymupdf.Rect(1580, 235, 2570, 700)).save(os.path.join(HERE, "out/094-ahu458.png"))
print({k: len(v["lines"]) for k, v in out.items()})
