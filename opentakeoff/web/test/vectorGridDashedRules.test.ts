/**
 * #316: a table ruled in dashes. 061_IA's M-502 rules its five points lists'
 * rows and columns in dashes (4.6 pt strokes 4.4 pt apart; only the title and
 * header bands are solid). With every gap open no row closed into a cell, so
 * vectorgrid found each list's header band alone and none of their points was
 * read. The fixture is the HEATING HOT WATER PLANT POINTS LIST's own ruling
 * and words (every stroke clipped to the table); the test redraws them and
 * runs the real sidecar, so it is skipped where vectorgrid's Python is not
 * installed.
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
const FIXTURE = fileURLToPath(new URL("./fixtures/dashed-rules-061ia-m502-hhw-points.json", import.meta.url));

// Redraw the fixture. "unframed" leaves the list's side borders out, so its
// dashed rows end on no rule across them: dashes, not a table's rows.
// "crossed" lowers every word half a row (the rows are 13.9 pt apart), so the
// dashed rules run through the letters, as a reflected ceiling plan's grid
// runs through the fixture tags lettered over it (004_MO's E-sheets).
const DRAW = String.raw`
import json, sys, pymupdf
spec, out, mode = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3]
unframed, drop = mode == "unframed", 6.95 if mode == "crossed" else 0.0
doc = pymupdf.open(); page = doc.new_page(width=spec["page"][0], height=spec["page"][1])
for x0, y0, x1, y1, w in spec["segments"]:
    if unframed and x0 == x1 and min(abs(x0 - 1755.96), abs(x0 - 2759.4)) < 1:
        continue
    page.draw_line((x0, y0), (x1, y1), width=w)
for x0, y0, x1, y1, text in spec["words"]:
    page.insert_text((x0, y1 - (y1 - y0) * 0.2 + drop), text, fontsize=(y1 - y0) * 0.9)
doc.save(out)
`;

async function read(mode: "framed" | "unframed" | "crossed") {
  const dir = mkdtempSync(join(tmpdir(), "ot-dashed-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const r = spawnSync(python, ["-c", DRAW, FIXTURE, pdf, mode], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return (await extractGridViaSidecar(pdf, 1)).tables;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("#316: a points list ruled in dashes reads row by row", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  after(async () => { await shutdownVectorGrid(); });

  it("reads each point in its own row, its tick under its type", async () => {
    const tables = await read("framed");
    const list = tables.find((t) => t.cells.some((c) => c.text === "STEAM PRESSURE"));
    assert.ok(list, JSON.stringify(tables.map((t) => t.cells.map((c) => c.text))));
    const at = (text: string) => list.cells.find((c) => c.text === text);
    const ai = at("AI")!, steam = at("STEAM PRESSURE")!;
    assert.ok(ai, "the AI header has its own cell");
    const tick = list.cells.find((c) => c.row === steam.row && c.col === ai.col);
    assert.equal(tick?.text, "X", "STEAM PRESSURE's tick sits under AI");
    assert.equal(list.cells.find((c) => c.row === steam.row && c.col === steam.col + 1)?.text, "PSIG");
    for (const point of ["NUMBER OF HEATING REQUESTS", "PUMP DIFFERENTIAL PRESSURE SETPOINT", "HEATING HOT WATER PUMP (HWP-A-2) SPEED COMMAND"]) {
      assert.ok(at(point), `${point} has a row of its own`);
    }
    const ticked = new Set(list.cells.filter((c) => c.text === "X").map((c) => c.row));
    assert.equal(ticked.size, 25, "the list's 25 points each tick one type");
  });

  it("leaves dashes that end on no rule across them as dashes", async () => {
    const tables = await read("unframed");
    for (const t of tables) {
      assert.ok(!t.cells.some((c) => c.text === "PSIG" || c.text === "STEAM PRESSURE"), JSON.stringify(t.cells.map((c) => c.text)));
    }
  });

  it("leaves a dashed grid whose rules run through its letters as dashes", async () => {
    const tables = await read("crossed");
    for (const t of tables) {
      assert.ok(!t.cells.some((c) => c.text === "PSIG" || c.text === "STEAM PRESSURE"), JSON.stringify(t.cells.map((c) => c.text)));
    }
  });
});
