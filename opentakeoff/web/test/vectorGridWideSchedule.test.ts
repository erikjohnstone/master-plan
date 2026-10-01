/**
 * AS-146: a schedule drawn edge to edge. vectorgrid drops a region wider than
 * 92% of its sheet as the sheet's own furniture (a title block strip), and
 * 014_MT M0.2 runs its COMFORT AIR HANDLING UNIT SCHEDULE across 92.7% of the
 * sheet: 42 columns, one air handler. The fixture is that schedule's own
 * ruling (every stroke and its weight) and words; the test redraws them on a
 * sheet of the same size and runs the real sidecar, so it is skipped where
 * vectorgrid's Python is not installed. A title strip as wide, ruled into ten
 * fields, is still furniture.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractGridViaSidecar, shutdownVectorGrid } from "../src/lib/vectorGridClient.ts";

const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "";
const ready = !!python && spawnSync(python, ["-c", "import pymupdf, pdfplumber, shapely"]).status === 0;
const FIXTURE = fileURLToPath(new URL("./fixtures/as146-014mt-m02-comfort-ruling.json", import.meta.url));

// Redraw the fixture; with "strip", draw instead a title strip as wide as the
// schedule, two rows of ten fields, each field labelled.
const DRAW = String.raw`
import json, sys, pymupdf
spec, out, strip = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3] == "1"
doc = pymupdf.open(); page = doc.new_page(width=spec["page"][0], height=spec["page"][1])
if strip:
    x0, x1, y0 = 102.0, 2371.0, 1400.0
    for y in (y0, y0 + 30, y0 + 60):
        page.draw_line((x0, y), (x1, y), width=0.5)
    for i in range(11):
        x = x0 + (x1 - x0) * i / 10
        page.draw_line((x, y0), (x, y0 + 60), width=0.5)
    for i in range(10):
        x = x0 + (x1 - x0) * i / 10
        page.insert_text((x + 6, y0 + 20), f"FIELD {i + 1}", fontsize=8)
        page.insert_text((x + 6, y0 + 50), f"VALUE {i + 1}", fontsize=8)
else:
    for x0, y0, x1, y1, w in spec["segments"]:
        page.draw_line((x0, y0), (x1, y1), width=w)
    for x0, y0, x1, y1, text in spec["words"]:
        page.insert_text((x0, y1 - (y1 - y0) * 0.2), text, fontsize=(y1 - y0) * 0.9)
doc.save(out)
`;

async function read(strip: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "ot-as146-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const r = spawnSync(python, ["-c", DRAW, FIXTURE, pdf, strip ? "1" : "0"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return (await extractGridViaSidecar(pdf, 1)).tables;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("AS-146: a schedule drawn edge to edge is a schedule", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  after(async () => { await shutdownVectorGrid(); });

  it("reads 014_MT's comfort air handler schedule across the sheet", async () => {
    const tables = await read(false);
    const schedule = tables.find((t) => t.cells.some((c) => c.text === "AHU-A2"));
    assert.ok(schedule, `no table holds AHU-A2: ${JSON.stringify(tables.map((t) => [t.bbox, t.cols]))}`);
    assert.ok(schedule.cols >= 40, `${schedule.cols} columns`);
    assert.ok(schedule.cells.some((c) => c.text === "DAIKIN"));
  });

  it("still drops a title strip as wide as the sheet", async () => {
    const tables = await read(true);
    assert.ok(!tables.some((t) => t.cells.some((c) => /^FIELD \d+$/.test(c.text))), JSON.stringify(tables.map((t) => [t.bbox, t.cols])));
  });
});
