/**
 * #319: a page whose box does not start at (0,0). pdfplumber reports such a
 * page's characters in the PDF's own space, shifted from the cells the table
 * extractor builds out of the page's rules, and the title-band splitter read
 * the characters unshifted: its test of a band's type found no letter, so a
 * table that labels its own bands in body type (004_MO's FINISH LEGEND: KEY
 * NAME, TYPE, MANUFACTURER over BASE, CEILINGS, FLOORING, PAINT) was cut at
 * every band, and every piece after the first lost the header. 197 pages of
 * 12 keyed sets start elsewhere than (0,0).
 *
 * The test builds one such table, a header over a band two rows deep that
 * labels the rows under it, and reads it twice: on a page at (0,0) and on the
 * same page placed at (-1512, 1080), as 009_FL's sheets are. The tables must
 * be the same. Skipped where vectorgrid's Python is not installed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { vectorGridServerPath } from "../src/lib/vectorGridRuntime.mjs";

const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "";
const ready = !!python && spawnSync(python, ["-c", "import pymupdf, pdfplumber, shapely"]).status === 0;
const BAKEOFF = join(dirname(vectorGridServerPath(new URL("../src/lib/vectorGridClient.ts", import.meta.url).href)), "..", "bakeoff");

const READ = String.raw`
import sys, json
sys.path.insert(0, sys.argv[1])
import vectorgrid as vg
xs = [100, 250, 400, 550, 700]
rows = [100, 130, 150, 165, 180, 210, 225, 240, 255]
undivided = {0, 4}                      # the title band and the SIDEWALL DEVICES band
segs = [(xs[0], y, xs[-1], y, 0.5) for y in rows]
for i, (a, b) in enumerate(zip(rows, rows[1:])):
    if i not in undivided:
        segs += [(x, a, x, b, 0.5) for x in xs[1:-1]]
segs += [(xs[0], rows[0], xs[0], rows[-1], 0.5), (xs[-1], rows[0], xs[-1], rows[-1], 0.5)]

def word(x, y, text, h):
    return [{"text": ch, "x0": x + k * h * 0.6, "x1": x + (k + 1) * h * 0.6, "top": y, "bottom": y + h,
             "height": h, "upright": True} for k, ch in enumerate(text)]

def chars(ox, oy):
    cs = word(260, 108, "AIR DEVICE SCHEDULE", 12)
    for i, label in enumerate(["MARK", "TYPE", "CFM", "NOTES"]):
        cs += word(xs[i] + 5, 136, label, 8)
    for y, row in ((154, ["A", "CEILING", "200", "-"]), (169, ["B", "CEILING", "300", "-"]),
                   (214, ["C", "SIDEWALL", "150", "-"]), (229, ["D", "SIDEWALL", "120", "-"]),
                   (244, ["E", "SIDEWALL", "100", "-"])):
        for i, v in enumerate(row):
            cs += word(xs[i] + 5, y, v, 8)
    cs += word(xs[0] + 5, 191, "SIDEWALL DEVICES", 8)
    # pdfplumber's characters sit in the PDF's own space: the cells' plus the page box's corner.
    return [dict(c, x0=c["x0"] + ox, x1=c["x1"] + ox, top=c["top"] + oy, bottom=c["bottom"] + oy) for c in cs]

def tables(origin):
    r = vg.tables_from_segments(segs, chars(*origin), 2592, 1728, [], origin)
    return sorted([round(v, 1) for v in t["bbox"]] + [t["n_cells"]] for t in r["tables"])

print(json.dumps({"at_zero": tables((0.0, 0.0)), "shifted": tables((-1512.0, 1080.0))}))
`;

describe("#319: a page whose box does not start at (0,0)", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  it("reads a table that labels its own bands the same as at (0,0)", () => {
    const r = spawnSync(python, ["-c", READ, BAKEOFF], { encoding: "utf8", timeout: 120_000 });
    assert.equal(r.status, 0, r.stderr);
    const { at_zero: atZero, shifted } = JSON.parse(r.stdout.trim().split("\n").pop()!);
    assert.equal(atZero.length, 1, `one table, its band inside it: ${JSON.stringify(atZero)}`);
    assert.deepEqual(shifted, atZero);
  });
});
