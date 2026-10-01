/**
 * AS-150: a schedule whose mark column a heavy rule cuts off. 23_GA's M601
 * draws a heavy rule after TAG on its FAN COIL UNITS table; vectorgrid cut the
 * table at that rule (a border-weight wall), so TAG and FCU-1 were a strip of
 * their own and the table was keyed by its model number. The fixture is that
 * table's own ruling (every stroke and its weight, clipped to the table) and
 * words; the test redraws them and runs the real sidecar, so it is skipped
 * where vectorgrid's Python is not installed.
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
const FIXTURE = fileURLToPath(new URL("./fixtures/as150-23ga-m601-fcu-ruling.json", import.meta.url));

// Redraw the fixture; with "shifted", the TAG strip is drawn 40pt lower, so
// its row lines are not the table's: a column of something else beside it.
const DRAW = String.raw`
import json, sys, pymupdf
spec, out, shifted = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3] == "1"
doc = pymupdf.open(); page = doc.new_page(width=spec["page"][0], height=spec["page"][1])
dy = lambda x: 40 if shifted and x < 435 else 0
for x0, y0, x1, y1, w in spec["segments"]:
    if shifted and x0 < 435 and x1 > 436:
        page.draw_line((x0, y0 + 40), (435.6, y1 + 40), width=w)
        page.draw_line((435.6, y0), (x1, y1), width=w)
        continue
    page.draw_line((x0, y0 + dy(x0)), (x1, y1 + dy(x1)), width=w)
for x0, y0, x1, y1, text in spec["words"]:
    page.insert_text((x0, y1 + dy(x0) - (y1 - y0) * 0.2), text, fontsize=(y1 - y0) * 0.9)
doc.save(out)
`;

async function read(shifted: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "ot-as150-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const r = spawnSync(python, ["-c", DRAW, FIXTURE, pdf, shifted ? "1" : "0"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return (await extractGridViaSidecar(pdf, 1)).tables.map((t) => t.cells.map((c) => c.text));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("AS-150: a schedule's mark column cut off by a heavy rule is the schedule's", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  after(async () => { await shutdownVectorGrid(); });

  it("reads 23_GA's fan coil unit with its TAG", async () => {
    const tables = await read(false);
    const fcu = tables.find((cells) => cells.includes("CARRIER MODEL NUMBER"));
    assert.ok(fcu, JSON.stringify(tables));
    assert.ok(fcu.includes("TAG") && fcu.includes("FCU-1"), `TAG column missing: ${JSON.stringify(fcu)}`);
    assert.ok(fcu.includes("FV4C"));
  });

  it("leaves a strip whose rows are not the table's on its own", async () => {
    const tables = await read(true);
    const fcu = tables.find((cells) => cells.includes("CARRIER MODEL NUMBER"));
    assert.ok(fcu, JSON.stringify(tables));
    assert.ok(!fcu.includes("FCU-1"), JSON.stringify(fcu));
  });
});
