/**
 * AS-147: a schedule drawn with a double border. The gap between the outer
 * rule and the inner frame closes into one band-shaped face around the whole
 * table; its box is the table's, so every word fell inside two faces and the
 * table came back from vectorgrid with no text at all (04_NV#32's COOLING
 * TOWER SCHEDULE: four cooling towers gone). The fixture is that schedule's own
 * ruling (every stroke and its weight, in the sheet's display space) and its
 * words; the test redraws them on a sheet of the same size and runs the real
 * sidecar, so it is skipped where vectorgrid's Python is not installed.
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
const FIXTURE = fileURLToPath(new URL("./fixtures/as147-04nv-p32-ring.json", import.meta.url));

// Redraw the fixture; with "single", leave out the outer border (the four
// hairlines around the inner frame), which is the same schedule boxed once.
const DRAW = String.raw`
import json, sys, pymupdf
spec, out, single = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3] == "1"
doc = pymupdf.open(); page = doc.new_page(width=spec["page"][0], height=spec["page"][1])
for x0, y0, x1, y1, w in spec["segments"]:
    if single and w == 0:
        continue
    page.draw_line((x0, y0), (x1, y1), width=w)
for x0, y0, x1, y1, text in spec["words"]:
    page.insert_text((x0, y1 - (y1 - y0) * 0.2), text, fontsize=(y1 - y0) * 0.9)
doc.save(out)
`;

async function read(single: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "ot-as147-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const r = spawnSync(python, ["-c", DRAW, FIXTURE, pdf, single ? "1" : "0"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const reply = await extractGridViaSidecar(pdf, 1);
    return reply.tables.map((t) => t.cells.map((c) => c.text).filter(Boolean));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("AS-147: a schedule drawn with a double border keeps its text", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  after(async () => { await shutdownVectorGrid(); });

  it("reads 04_NV's cooling towers inside their double border", async () => {
    const tables = await read(false);
    const schedule = tables.find((cells) => cells.includes("CT-1,2,3,4"));
    assert.ok(schedule, `no table holds CT-1,2,3,4: ${JSON.stringify(tables)}`);
    for (const text of ["ITEM NO.", "EVAPCO AT-114-1024", "INDUCED DRAFT", "2,400"]) assert.ok(schedule.includes(text), `${text} missing: ${JSON.stringify(schedule)}`);
  });

  it("reads the same schedule boxed once the same way", async () => {
    const tables = await read(true);
    const schedule = tables.find((cells) => cells.includes("CT-1,2,3,4"));
    assert.ok(schedule, `no table holds CT-1,2,3,4: ${JSON.stringify(tables)}`);
    assert.ok(schedule.includes("EVAPCO AT-114-1024"));
  });
});
