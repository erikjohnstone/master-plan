/**
 * A drawn table lettered in ink (29_TX's M9.01): the rules are drawn, every
 * letter is a path, and the text layer holds none of it. vectorgrid reads such
 * a grid from its pixels, as it reads a picture of a table (AS-153). The test
 * draws a fan schedule, plots its letters as outlines (SVG text-as-path, back
 * to PDF), and checks the sidecar reads every cell; the same schedule printed
 * as text is read from its text, and an empty ruled grid is not read at all.
 * Skipped where vectorgrid's Python or its OCR engine is not installed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vectorGridServerPath } from "../src/lib/vectorGridRuntime.mjs";

const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "";
const ready = !!python && spawnSync(python, ["-c", "import pymupdf, pdfplumber, shapely, cv2, rapidocr_onnxruntime"]).status === 0;
const SIDECAR = dirname(vectorGridServerPath(new URL("../src/lib/vectorGridClient.ts", import.meta.url).href));

const DRAW = String.raw`
import sys, pymupdf
mode, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(); page = doc.new_page(width=792, height=612)
x0, y0 = 100, 100
for r in range(5): page.draw_line((x0, y0 + 30 * r), (x0 + 400, y0 + 30 * r), width=0.8)
for c in range(5): page.draw_line((x0 + 100 * c, y0), (x0 + 100 * c, y0 + 120), width=0.8)
if mode != "empty":
    rows = [["MARK", "TYPE", "CFM", "NOTES"], ["EF-1", "ROOF", "400", "1"], ["EF-2", "ROOF", "500", "1"], ["EF-3", "WALL", "250", "2"]]
    for r, row in enumerate(rows):
        for c, t in enumerate(row): page.insert_text((x0 + 100 * c + 8, y0 + 30 * r + 20), t, fontsize=10)
    page.insert_text((x0, y0 - 12), "EXHAUST FAN SCHEDULE", fontsize=12)
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

function read(mode: string): Array<{ ocr?: boolean; cells: Array<{ text?: string }> }> {
  const dir = mkdtempSync(join(tmpdir(), "ot-ink-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const drawn = spawnSync(python, ["-c", DRAW, mode, pdf], { encoding: "utf8" });
    assert.equal(drawn.status, 0, drawn.stderr);
    const r = spawnSync(python, ["-c", EXTRACT, SIDECAR, pdf], {
      encoding: "utf8", timeout: 300_000, maxBuffer: 64 << 20,
      env: { ...process.env, OPENTAKEOFF_PICTURE_CACHE: "0" },
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split("\n").pop()!).tables;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("a drawn table lettered in ink is read from its pixels", { skip: ready ? false : "vectorgrid's Python or OCR is not installed" }, () => {
  it("reads every cell of a schedule whose letters are outlines", () => {
    const tables = read("ink");
    const texts = tables.flatMap((t) => t.cells.map((c) => c.text).filter(Boolean));
    assert.ok(tables.some((t) => t.ocr), "read by OCR");
    for (const want of ["MARK", "CFM", "EF-1", "EF-2", "EF-3", "WALL", "250"]) assert.ok(texts.includes(want), `${want} in ${texts.join(",")}`);
  });
  it("reads the same schedule printed as text from its text, not by OCR", () => {
    const tables = read("text");
    assert.ok(tables.length && tables.every((t) => !t.ocr));
    assert.ok(tables.flatMap((t) => t.cells.map((c) => c.text)).includes("EF-3"));
  });
  it("does not read an empty ruled grid", () => {
    assert.ok(read("empty").every((t) => !t.ocr));
  });
});
