"""Read-only source rendering for manual audit, not a takeoff inference path."""
import argparse
import json
from pathlib import Path
import subprocess

import fitz

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument("rank", type=int)
p.add_argument("page", type=int)
p.add_argument("name")
p.add_argument("--box", nargs=4, type=float)
p.add_argument("--dpi", type=int, default=144)
p.add_argument("--engine", choices=["poppler", "mupdf"], default="poppler")
a = p.parse_args()
entry = next(e for e in json.loads((ROOT/"manifest.json").read_text())["entries"] if e["rank"] == a.rank)
pdf = ROOT/entry["output_file"]
out = ROOT/"ground_truth"/"reviews"/f'{a.rank:02d}__{entry["key"]}'
out.mkdir(parents=True, exist_ok=True)
stem = out / f"p{a.page}-{a.name}-{a.engine}"
if a.engine == "poppler":
    cmd = ["pdftoppm", "-f", str(a.page), "-l", str(a.page), "-singlefile", "-r", str(a.dpi), "-png"]
    if a.box:
        x0,y0,x1,y1 = [round(v*a.dpi/72) for v in a.box]
        cmd += ["-x",str(x0),"-y",str(y0),"-W",str(x1-x0),"-H",str(y1-y0)]
    subprocess.run(cmd+[str(pdf),str(stem)],check=True)
else:
    with fitz.open(pdf) as doc:
        doc[a.page-1].get_pixmap(dpi=a.dpi,clip=fitz.Rect(a.box) if a.box else None).save(str(stem)+".png")
print(str(stem)+".png")
