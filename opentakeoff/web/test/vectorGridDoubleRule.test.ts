/**
 * A schedule drawn with a double rule under its header (08_ME's M102 and
 * P103: the ELECTRIC COVE HEATER, LOUVER, WATER SPECIALTIES and ELECTRIC
 * WATER HEATER schedules). No vertical crosses the slot between the two rules,
 * so the slot is one face as wide as the table, and the title-band splitter
 * read it as a second schedule's title: each table came back as a header and
 * a body. Lettered in ink, neither half was shaped like a schedule, so neither
 * was read and the sheet's heaters, louvers and water heater were gone.
 *
 * The test draws such a schedule, as text and with its letters as outlines,
 * and runs the real sidecar: one table must hold the header and both units.
 * A second schedule under the first, with a title band of its own, and an
 * empty spacer band over that title still part the two schedules. Skipped
 * where vectorgrid's Python (or, for the ink case, its OCR) is not installed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vectorGridServerPath } from "../src/lib/vectorGridRuntime.mjs";

const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "";
const ready = !!python && spawnSync(python, ["-c", "import pymupdf, pdfplumber, shapely"]).status === 0;
const ocr = ready && spawnSync(python, ["-c", "import cv2, rapidocr_onnxruntime"]).status === 0;
const SIDECAR = dirname(vectorGridServerPath(new URL("../src/lib/vectorGridClient.ts", import.meta.url).href));

// mode: "text" | "ink" (letters as outlines) | "stacked" (a LOUVER SCHEDULE
// under it, its own title band between) | "spacer" (the same, with an empty
// thin band over the second title).
const DRAW = String.raw`
import sys, pymupdf
mode, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(); page = doc.new_page(width=2592, height=1728)   # a D sheet: furniture is judged by its share of the page
W = 0.9
xs = [100, 160, 320, 470, 540, 620, 680, 900]          # TAG MODEL TYPE LENGTH | POWER WATTS | REMARKS
line = lambda a, b, c, d: page.draw_line((a, b), (c, d), width=W)
text = lambda x, y, t, s=9: page.insert_text((x, y), t, fontsize=s)

def schedule(top, title, head, units):
    # Title band, a two-tier header (ELECTRIC over POWER and WATTS), a double
    # rule under it whose slot no vertical crosses, then one row per unit.
    t1, h1, h2, d1 = top + 40, top + 70, top + 100, top + 108
    bottom = d1 + 30 * len(units)
    for y in (top, t1, h2, d1, bottom):
        line(xs[0], y, xs[-1], y)
    line(xs[4], h1, xs[6], h1)
    for y in range(len(units) - 1):
        line(xs[0], d1 + 30 * (y + 1), xs[-1], d1 + 30 * (y + 1))
    line(xs[0], top, xs[0], bottom); line(xs[-1], top, xs[-1], bottom)
    for i, x in enumerate(xs[1:-1], start=1):
        line(x, h1 if i == 5 else t1, x, h2)
        line(x, d1, x, bottom)
    text(xs[0] + 250, top + 27, title, 14)
    for i, label in enumerate(head):
        if i in (4, 5):
            text(xs[i] + 8, h1 + 20, label)
        else:
            text(xs[i] + 8, t1 + 34, label)
    text(xs[4] + 30, t1 + 20, "ELECTRIC")
    for r, row in enumerate(units):
        for i, value in enumerate(row):
            text(xs[i] + 8, d1 + 30 * r + 20, value)
    return bottom

head = ["TAG", "MODEL", "TYPE", "LENGTH", "POWER", "WATTS", "REMARKS"]
end = schedule(60, "ELECTRIC COVE HEATER SCHEDULE", head, [
    ["CH-1", "MARKEL CV-4512X", "WALL COVE", "42", "115/60/1", "450", "LINE-VOLTAGE THERMOSTAT"],
    ["CH-2", "MARKEL CV-4512X", "WALL COVE", "42", "115/60/1", "450", "LINE-VOLTAGE THERMOSTAT"]])
if mode in ("stacked", "spacer"):
    top = end
    if mode == "spacer":
        line(xs[0], end + 8, xs[-1], end + 8); line(xs[0], end, xs[0], end + 8); line(xs[-1], end, xs[-1], end + 8)
        top = end + 8
    schedule(top, "LOUVER SCHEDULE", ["LOUVER", "MODEL", "TYPE", "WIDTH", "POWER", "WATTS", "REMARKS"], [
        ["L-1", "RUSKIN ELF6375", "FIXED", "6", "NONE", "0", "BIRD SCREEN"],
        ["L-2", "RUSKIN ELF6375", "FIXED", "6", "NONE", "0", "BIRD SCREEN"]])
if mode == "ink":
    doc = pymupdf.open("pdf", pymupdf.open("svg", page.get_svg_image(text_as_path=True).encode()).convert_to_pdf())
    assert not doc[0].get_text().strip()
doc.save(out)
`;

const EXTRACT = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
import vectorgrid_rpc
print(json.dumps(vectorgrid_rpc.extract_grid(sys.argv[2], 1)))
`;

interface Table { ocr?: boolean; cells: Array<{ text?: string }> }

function read(mode: string): string[][] {
  const dir = mkdtempSync(join(tmpdir(), "ot-double-rule-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const drawn = spawnSync(python, ["-c", DRAW, mode, pdf], { encoding: "utf8" });
    assert.equal(drawn.status, 0, drawn.stderr);
    const r = spawnSync(python, ["-c", EXTRACT, SIDECAR, pdf], {
      encoding: "utf8", timeout: 300_000, maxBuffer: 64 << 20,
      env: { ...process.env, OPENTAKEOFF_PICTURE_CACHE: "0" },
    });
    assert.equal(r.status, 0, r.stderr);
    const tables: Table[] = JSON.parse(r.stdout.trim().split("\n").pop()!).tables;
    return tables.map((t) => t.cells.map((c) => String(c.text ?? "").trim()).filter(Boolean));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const holding = (tables: string[][], text: string) => tables.find((cells) => cells.includes(text));

describe("a double rule under a schedule's header does not split it", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  it("reads the header and both units as one table", () => {
    const tables = read("text");
    const schedule = holding(tables, "CH-1");
    assert.ok(schedule, `no table holds CH-1: ${JSON.stringify(tables)}`);
    for (const want of ["TAG", "WATTS", "CH-2", "450"]) assert.ok(schedule.includes(want), `${want} missing: ${JSON.stringify(schedule)}`);
  });

  it("still parts a second schedule under its own title band", () => {
    const tables = read("stacked");
    const heaters = holding(tables, "CH-1");
    const louvers = holding(tables, "L-1");
    assert.ok(heaters && louvers, JSON.stringify(tables));
    assert.ok(!heaters.includes("L-1") && !louvers.includes("CH-1"), JSON.stringify(tables));
    assert.ok(heaters.includes("TAG") && louvers.includes("LOUVER"), JSON.stringify(tables));
  });

  it("still parts them when an empty spacer band sits over the second title", () => {
    const tables = read("spacer");
    const heaters = holding(tables, "CH-1");
    const louvers = holding(tables, "L-1");
    assert.ok(heaters && louvers, JSON.stringify(tables));
    assert.ok(!heaters.includes("L-1") && !louvers.includes("CH-1"), JSON.stringify(tables));
  });

  it("reads the schedule lettered in ink whole, from its pixels", { skip: ocr ? false : "vectorgrid's OCR is not installed" }, () => {
    const tables = read("ink");
    const schedule = holding(tables, "CH-1");
    assert.ok(schedule, `no table holds CH-1: ${JSON.stringify(tables)}`);
    for (const want of ["TAG", "CH-2"]) assert.ok(schedule.includes(want), `${want} missing: ${JSON.stringify(schedule)}`);
  });
});
