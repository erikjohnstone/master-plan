/**
 * AS-151: a sheet whose lines are drawn thousands of times over. 041_IL's
 * sheet 11 re-plots one rule 6,834 times; GEOS noded every overlap and the
 * table sidecar grew to 13.5 GB and was killed, so the sheet was never read.
 * The test draws such a sheet (one rule re-plotted 6,000 times in overlapping
 * pieces, crossed by short verticals, beside a small fan schedule) and runs
 * the sidecar's own extract_grid in a child limited to 3 GB of address space,
 * so a regression fails here instead of exhausting the machine. Skipped where
 * vectorgrid's Python is not installed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vectorGridServerPath } from "../src/lib/vectorGridRuntime.mjs";

const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "";
const ready = !!python && spawnSync(python, ["-c", "import pymupdf, pdfplumber, shapely"]).status === 0;
const SIDECAR = dirname(vectorGridServerPath(new URL("../src/lib/vectorGridClient.ts", import.meta.url).href));

const DRAW = String.raw`
import sys, random, pymupdf
doc = pymupdf.open(); page = doc.new_page(width=2592, height=1728)
random.seed(7)
for i in range(6000):
    a = random.uniform(100, 2400)
    page.draw_line((a, 1500), (a + random.uniform(20, 200), 1500), width=0.5)
for x in range(100, 2500, 40):
    page.draw_line((x, 1480), (x, 1520), width=0.5)
x0, y0 = 100, 100
for r in range(5):
    page.draw_line((x0, y0 + 30 * r), (x0 + 400, y0 + 30 * r), width=0.5)
for c in range(5):
    page.draw_line((x0 + 100 * c, y0), (x0 + 100 * c, y0 + 120), width=0.5)
rows = [["MARK", "TYPE", "CFM", "NOTES"], ["EF-1", "ROOF", "400", "1"], ["EF-2", "ROOF", "500", "1"], ["EF-3", "WALL", "250", "2"]]
for r, row in enumerate(rows):
    for c, t in enumerate(row):
        page.insert_text((x0 + 100 * c + 6, y0 + 30 * r + 19), t, fontsize=9)
doc.save(sys.argv[1])
`;

const EXTRACT = String.raw`
import json, resource, sys
resource.setrlimit(resource.RLIMIT_AS, (3 << 30, 3 << 30))
sys.path.insert(0, sys.argv[1])
import vectorgrid_rpc
print(json.dumps(vectorgrid_rpc.extract_grid(sys.argv[2], 1)))
`;

describe("AS-151: a line drawn thousands of times over does not exhaust the table sidecar", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  it("reads the schedule beside it within 3 GB", () => {
    const dir = mkdtempSync(join(tmpdir(), "ot-as151-"));
    try {
      const pdf = join(dir, "sheet.pdf");
      const drawn = spawnSync(python, ["-c", DRAW, pdf], { encoding: "utf8" });
      assert.equal(drawn.status, 0, drawn.stderr);
      const r = spawnSync(python, ["-c", EXTRACT, SIDECAR, pdf], { encoding: "utf8", timeout: 300_000, maxBuffer: 64 << 20 });
      assert.equal(r.status, 0, `extract_grid failed: ${r.stderr.split("\n").slice(-3).join(" ")}`);
      const reply = JSON.parse(r.stdout.trim().split("\n").pop()!);
      const marks = reply.tables.flatMap((t: { cells: { text: string }[] }) => t.cells.map((c) => c.text)).filter((t: string) => /^EF-\d$/.test(t));
      assert.deepEqual(marks.sort(), ["EF-1", "EF-2", "EF-3"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
