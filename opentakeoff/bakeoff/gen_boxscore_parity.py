"""Regenerate the TypeScript port's parity fixture from THIS file's neighbours.

`opentakeoff/web/bench/boxScore.ts` is a port of `boxscore.py`'s `iou` and
`eob` — the ruler the table bake-off reports. A port that drifts from its
original is worse than no port, so the two are pinned by
`web/test/fixtures/boxScoreParity.json`, whose expected values are produced
HERE, by the Python functions themselves, and asserted to 1e-9 in
`web/test/boxScore.test.ts`.

Run this only when boxscore.py's own definitions change, and say so in the
commit — a silently regenerated fixture makes the pin meaningless.

    cd opentakeoff/bakeoff && python3 gen_boxscore_parity.py
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "test", "fixtures", "boxScoreParity.json")

# boxscore.py imports `bakeoff` at module level (which wants the corpus on
# disk), so lift the two pure functions out of its source rather than importing
# the module. They are the definition; nothing else in that file is needed.
_src = open(os.path.join(HERE, "boxscore.py")).read()
_ns: dict = {}
exec(_src[_src.index("def iou("):_src.index("def main(")], _ns)
iou, eob = _ns["iou"], _ns["eob"]

CASES = [
    # shapes the authored key actually produces (009_FL#30's panel schedules)
    ((1024.3, 103.0, 1852.3, 737.2), (1024.3, 103.0, 1852.3, 737.2)),   # exact
    ((1024.3, 103.0, 1852.3, 737.2), (1026.3, 105.0, 1850.3, 735.2)),   # 2pt inset
    ((1024.3, 103.0, 1852.3, 737.2), (1024.3, 103.0, 2698.3, 737.2)),   # right over-run into the neighbour
    ((1024.3, 103.0, 1852.3, 737.2), (1440.0, 103.0, 1852.3, 737.2)),   # left clipped to a later column
    ((167.4, 103.0, 995.4, 737.2), (167.4, 60.0, 995.4, 737.2)),        # title band added on top
    # containment, both directions
    ((0, 0, 100, 100), (25, 25, 75, 75)),
    ((25, 25, 75, 75), (0, 0, 100, 100)),
    # disjoint on x, on y, and on both
    ((0, 0, 10, 10), (20, 0, 30, 10)),
    ((0, 0, 10, 10), (0, 20, 10, 30)),
    ((0, 0, 10, 10), (20, 20, 30, 30)),
    # edge-touching: a zero-area intersection is not an overlap
    ((0, 0, 10, 10), (10, 0, 20, 10)),
    ((0, 0, 10, 10), (10, 10, 20, 20)),
    # degenerate inputs
    ((5, 5, 5, 5), (0, 0, 10, 10)),
    ((0, 0, 10, 10), (5, 5, 5, 5)),
    ((5, 5, 5, 5), (5, 5, 5, 5)),
    ((0, 0, 0, 10), (0, 0, 10, 10)),
    # negative coordinates — the real -1512/-1080 MediaBox sheets
    ((-1512.0, -1080.0, -1000.0, -500.0), (-1510.0, -1078.0, -1002.0, -502.0)),
    ((-1512.0, -1080.0, 1512.0, 1080.0), (-1512.0, -1080.0, 1512.0, 1080.0)),
    ((-100.0, -100.0, -50.0, -50.0), (50.0, 50.0, 100.0, 100.0)),
    # either side of the 4pt CORRECT bar
    ((10.0, 10.0, 20.0, 20.0), (10.0, 10.0, 20.0, 23.999999)),
    ((10.0, 10.0, 20.0, 20.0), (10.0, 10.0, 20.0, 24.000001)),
    ((10.0, 10.0, 20.0, 20.0), (6.0, 10.0, 20.0, 20.0)),
]

# plus a fixed-seed spread over real sheet extents, so float paths are exercised
_rnd = random.Random(20260906)
for _ in range(18):
    ax, ay = round(_rnd.uniform(-1600, 2600), 3), round(_rnd.uniform(-1200, 2000), 3)
    bx, by = ax + round(_rnd.uniform(0.0, 900), 3), ay + round(_rnd.uniform(0.0, 700), 3)
    cx, cy = round(_rnd.uniform(-1600, 2600), 3), round(_rnd.uniform(-1200, 2000), 3)
    dx, dy = cx + round(_rnd.uniform(0.0, 900), 3), cy + round(_rnd.uniform(0.0, 700), 3)
    CASES.append(((ax, ay, bx, by), (cx, cy, dx, dy)))


def main() -> int:
    payload = {
        "note": "Generated from opentakeoff/bakeoff/boxscore.py's own iou()/eob() so "
                "web/bench/boxScore.ts cannot drift from the ruler the table bake-off "
                "reports. Do not hand-edit.",
        "source": "opentakeoff/bakeoff/boxscore.py",
        "generated_by": "opentakeoff/bakeoff/gen_boxscore_parity.py",
        "cases": [{"a": list(a), "b": list(b), "eob": eob(a, b), "iou": iou(a, b)} for a, b in CASES],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(payload, fh, indent=1)
        fh.write("\n")
    print(f"wrote {len(CASES)} cases to {os.path.relpath(OUT, HERE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
