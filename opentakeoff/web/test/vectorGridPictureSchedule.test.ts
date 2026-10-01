/**
 * AS-153: a schedule pasted into a sheet as a picture. 07_MO's M-601 prints
 * its VAV BOX SCHEDULE, EXPANSION & BUFFER TANK SCHEDULE and AIR DEVICE
 * SCHEDULE as spreadsheet images; vectorgrid could only call them raster
 * regions, and the takeoff read no unit from the sheet. The fixtures are two
 * crops of that sheet's own pictures (the VAV schedule's first columns, with
 * its marks set in hexagons in a hairline font, and the tank schedule whole);
 * the test places each where M-601 places it and runs the real sidecar, so it
 * is skipped where vectorgrid's Python or its OCR is not installed.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractGridViaSidecar, shutdownVectorGrid } from "../src/lib/vectorGridClient.ts";

const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "";
const ready = !!python && spawnSync(python, ["-c", "import pymupdf, pdfplumber, shapely, cv2, rapidocr_onnxruntime"]).status === 0;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
// The pictures these tests read are kept in a folder of their own (the
// sidecar reads the variable when it starts), never the user's cache.
const cacheDir = mkdtempSync(join(tmpdir(), "ot-as153-cache-"));
process.env.OPENTAKEOFF_PICTURE_CACHE = cacheDir;

// One picture on an M-601-sized sheet, where the sheet places it; "noise"
// draws a photograph-like picture (no rules, no paper) instead. With a
// rotation, the sheet is stored turned (/Rotate) and the picture placed so
// it displays upright at the same box, as 029_ME's ME601 is drawn.
const DRAW = String.raw`
import sys, random, pymupdf
png, out, x0, y0, x1, y1, rot = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7]), int(sys.argv[7])
copies = int(sys.argv[8]) if len(sys.argv) > 8 else 1
doc = pymupdf.open()
if copies > 1:
    # The same picture on every page of the set, as a title-block logo is.
    for _ in range(copies):
        doc.new_page(width=2592, height=1728).insert_image(pymupdf.Rect(x0, y0, x1, y1), filename=png)
    doc.save(out); sys.exit(0)
if rot:
    page = doc.new_page(width=1728, height=2592); page.set_rotation(rot)
    page.insert_image(pymupdf.Rect(x0, y0, x1, y1) * page.derotation_matrix, filename=png, rotate=rot)
    doc.save(out); sys.exit(0)
page = doc.new_page(width=2592, height=1728)
if png == "noise":
    random.seed(3)
    pix = pymupdf.Pixmap(pymupdf.csGRAY, pymupdf.IRect(0, 0, 600, 400), False)
    pix.set_rect(pix.irect, (128,))
    for _ in range(40000):
        pix.set_pixel(random.randrange(600), random.randrange(400), (random.randrange(256),))
    page.insert_image(pymupdf.Rect(x0, y0, x1, y1), pixmap=pix)
elif png == "ruling":
    # A picture of the ruling alone, its text printed over it as the page's
    # own words (01_NY's #59): a 4 x 3 grid, a mark and a number per row.
    import cv2, numpy as np
    W, H = 600, 400
    img = np.full((H, W), 255, np.uint8)
    for y in range(0, H + 1, H // 4): cv2.line(img, (0, min(y, H - 2)), (W, min(y, H - 2)), 0, 1)
    for x in (0, 200, 400, W - 2): cv2.line(img, (x, 0), (x, H), 0, 1)
    ok, buf = cv2.imencode(".png", img)
    page.insert_image(pymupdf.Rect(x0, y0, x1, y1), stream=buf.tobytes(), keep_proportion=False)
    sx, sy = (x1 - x0) / W, (y1 - y0) / H
    rows = [("MARK", "CFM", "VOLTS"), ("EF-1", "330", "120"), ("EF-2", "450", "120"), ("EF-3", "900", "208")]
    for i, row in enumerate(rows):
        for j, text in enumerate(row):
            page.insert_text((x0 + (j * 200 + 30) * sx, y0 + (i * 100 + 60) * sy), text, fontsize=14)
elif png.startswith("tiles:"):
    # The picture cut into n x n tiles placed edge to edge, as some PDF
    # writers place a large image (23_GA's E-series sheet): each tile is far
    # under vectorgrid's picture floor, the whole is not.
    import cv2
    _, n, path = png.split(":", 2); n = int(n)
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    H, W = img.shape
    for i in range(n):
        for j in range(n):
            ys, ye, xs, xe = H * i // n, H * (i + 1) // n, W * j // n, W * (j + 1) // n
            ok, buf = cv2.imencode(".png", img[ys:ye, xs:xe])
            r = pymupdf.Rect(x0 + (x1 - x0) * xs / W, y0 + (y1 - y0) * ys / H, x0 + (x1 - x0) * xe / W, y0 + (y1 - y0) * ye / H)
            page.insert_image(r, stream=buf.tobytes(), keep_proportion=False)
else:
    page.insert_image(pymupdf.Rect(x0, y0, x1, y1), filename=png)
    if len(sys.argv) > 9 and sys.argv[9] == "lines":
        # A few drawn lines that close no cell (a sheet border's corner, a
        # leader), as on 082_OR's M002: the sheet's only table is the picture.
        page.draw_line((40, 40), (2552, 40), width=2)
        page.draw_line((40, 40), (40, 1688), width=2)
doc.save(out)
`;

function draw(dir: string, png: string, rect: [number, number, number, number], rotation = 0, copies = 1, extra = ""): string {
  const pdf = join(dir, "sheet.pdf");
  const r = spawnSync(python, ["-c", DRAW, png, pdf, ...rect.map(String), String(rotation), String(copies), ...(extra ? [extra] : [])], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return pdf;
}

async function read(png: string, rect: [number, number, number, number], rotation = 0, copies = 1) {
  const dir = mkdtempSync(join(tmpdir(), "ot-as153-"));
  try {
    return (await extractGridViaSidecar(draw(dir, png, rect, rotation, copies), 1)).tables;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const texts = (t: { cells: { text: string }[] }) => t.cells.map((c) => c.text);

describe("AS-153: a schedule pasted as a picture is read", { skip: ready ? false : "vectorgrid's Python or its OCR is not installed" }, () => {
  after(async () => {
    await shutdownVectorGrid();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("reads 07_MO's VAV marks set in hexagons, and their rows", async () => {
    const tables = await read(fixture("as153-07mo-m601-vav.png"), [104, 68, 620, 600]);
    const vav = tables.find((t) => t.ocr && texts(t).includes("MARK"));
    assert.ok(vav, JSON.stringify(tables.map(texts)));
    const cells = texts(vav);
    for (const mark of ["VAV 1", "VAV 2", "VAV 3", "VAV 4", "VAV 5"]) assert.ok(cells.includes(mark), `${mark} missing: ${JSON.stringify(cells)}`);
    assert.ok(cells.includes("AHU-1") && cells.includes("TITUS"), JSON.stringify(cells));
    assert.ok(!cells.some((c) => /^\/|\/$|^NAV\b/.test(c)), `a hexagon's side read as a letter: ${JSON.stringify(cells)}`);
  });

  it("reads a picture placed as tiles each under the picture floor, as one picture (AS-154)", async () => {
    const tables = await read(`tiles:4:${fixture("as153-07mo-m601-vav.png")}`, [104, 68, 620, 600]);
    const vav = tables.find((t) => t.ocr && texts(t).includes("MARK"));
    assert.ok(vav, JSON.stringify(tables.map((t) => ({ raster: t.raster, bbox: t.bbox, cells: texts(t).slice(0, 8) }))));
    const cells = texts(vav);
    for (const mark of ["VAV 1", "VAV 2", "VAV 3", "VAV 4", "VAV 5"]) assert.ok(cells.includes(mark), `${mark} missing: ${JSON.stringify(cells)}`);
    assert.ok(vav.bbox[0] < 110 && vav.bbox[2] > 600, `one table across the tiles: ${JSON.stringify(vav.bbox)}`);
  });

  it("reads a picture's ruling with the page's own words printed over it from those words, not OCR (AS-154)", async () => {
    const tables = await read("ruling", [300, 300, 900, 700]);
    const t = tables.find((x) => texts(x).includes("EF-2"));
    assert.ok(t, JSON.stringify(tables.map((x) => ({ raster: x.raster, ocr: x.ocr, cells: texts(x) }))));
    assert.ok(!t.ocr, "read from the page's words, so no OCR reading to disclose");
    for (const text of ["MARK", "CFM", "EF-1", "330", "EF-3", "900", "208"]) assert.ok(texts(t).includes(text), `${text} missing: ${JSON.stringify(texts(t))}`);
  });

  it("reads a small picture that is the sheet's own, never one placed on every sheet as a logo is (AS-154)", async () => {
    // 450 x 214pt, 96,300 pt^2: under the 100,000 floor for any picture.
    const rect: [number, number, number, number] = [1545, 68, 1995, 282];
    const own = await read(fixture("as153-07mo-m601-tanks.png"), rect);
    const tank = own.find((t) => t.ocr && texts(t).includes("AMTROL"));
    assert.ok(tank, JSON.stringify(own.map((t) => ({ raster: t.raster, cells: texts(t).slice(0, 8) }))));
    assert.ok(texts(tank).includes("EXT 1") && texts(tank).includes("EXT 2"), JSON.stringify(texts(tank)));
    const everywhere = await read(fixture("as153-07mo-m601-tanks.png"), rect, 0, 5);
    assert.ok(!everywhere.some((t) => t.ocr || t.raster), JSON.stringify(everywhere.map((t) => ({ raster: t.raster, ocr: t.ocr }))));
  });

  it("reads 07_MO's tank schedule: its title, header and marks", async () => {
    const tables = await read(fixture("as153-07mo-m601-tanks.png"), [1545, 68, 2181, 370]);
    const tank = tables.find((t) => t.ocr && texts(t).includes("AMTROL"));
    assert.ok(tank, JSON.stringify(tables.map(texts)));
    const cells = texts(tank);
    for (const text of ["EXPANSION & BUFFER TANK SCHEDULE", "MARK", "EXT 1", "EXT 2", "130LBC", "AX-40-DD"]) {
      assert.ok(cells.includes(text), `${text} missing: ${JSON.stringify(cells)}`);
    }
  });

  it("reads it on a sheet stored turned (029_ME's /Rotate 270), where the box is the displayed one", async () => {
    const tables = await read(fixture("as153-07mo-m601-tanks.png"), [1545, 68, 2181, 370], 270);
    const tank = tables.find((t) => t.ocr && texts(t).includes("AMTROL"));
    assert.ok(tank, JSON.stringify(tables.map(texts)));
    for (const text of ["EXT 1", "EXT 2", "130LBC"]) assert.ok(texts(tank).includes(text), `${text} missing: ${JSON.stringify(texts(tank))}`);
  });

  it("reads the picture on a sheet whose own lines close no cell, and says the sheet's size (AS-156)", async () => {
    // 082_OR's M002: a border's lines and a whole schedule sheet as one
    // picture. The reply had no page size there, so the picture was read on
    // a 0 x 0 page (no face fits) and the browser refused the whole sheet.
    const dir = mkdtempSync(join(tmpdir(), "ot-as156-"));
    try {
      const reply = await extractGridViaSidecar(draw(dir, fixture("as153-07mo-m601-tanks.png"), [1545, 68, 2181, 370], 0, 1, "lines"), 1);
      assert.equal(reply.pageWidth, 2592);
      assert.equal(reply.pageHeight, 1728);
      const tank = reply.tables.find((t) => t.ocr && texts(t).includes("AMTROL"));
      assert.ok(tank, JSON.stringify(reply.tables.map((t) => ({ raster: t.raster, cells: texts(t).slice(0, 8) }))));
      assert.ok(texts(tank).includes("EXT 1"), JSON.stringify(texts(tank)));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("leaves a picture that is no table alone", async () => {
    const tables = await read("noise", [300, 300, 900, 700]);
    assert.ok(!tables.some((t) => t.ocr), JSON.stringify(tables.map(texts)));
  });

  it("reads a picture once: the same drawing set is answered from the cache, unless it is off", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ot-as153-"));
    const saved = process.env.OPENTAKEOFF_PICTURE_CACHE;
    const savedXdg = process.env.XDG_CACHE_HOME;
    try {
      // A cache of its own, so the files this test finds are this sheet's.
      await shutdownVectorGrid();
      const own = join(dir, "cache");
      process.env.OPENTAKEOFF_PICTURE_CACHE = own;
      const pdf = draw(dir, fixture("as153-07mo-m601-tanks.png"), [1545, 68, 2181, 370]);
      const first = (await extractGridViaSidecar(pdf, 1)).tables;
      assert.ok(first.some((t) => t.ocr && texts(t).includes("AMTROL")), JSON.stringify(first.map(texts)));
      const kept = readdirSync(own).filter((f) => f.endsWith(".json"));
      assert.equal(kept.length, 1, JSON.stringify(readdirSync(own)));
      // Mark the kept read: a second read that returns the mark came from it.
      const file = join(own, kept[0]);
      writeFileSync(file, readFileSync(file, "utf8").split("AMTROL").join("KEPT AMTROL"));
      const second = (await extractGridViaSidecar(pdf, 1)).tables;
      assert.ok(second.some((t) => t.ocr && texts(t).includes("KEPT AMTROL")), JSON.stringify(second.map(texts)));
      // Off: the picture is read again, and nothing is kept anywhere (not
      // in the default folder, nor in a folder named "0").
      await shutdownVectorGrid();
      process.env.OPENTAKEOFF_PICTURE_CACHE = "0";
      process.env.XDG_CACHE_HOME = join(dir, "xdg");
      const third = (await extractGridViaSidecar(pdf, 1)).tables;
      assert.ok(third.some((t) => t.ocr && texts(t).includes("AMTROL")), JSON.stringify(third.map(texts)));
      assert.ok(!third.some((t) => texts(t).includes("KEPT AMTROL")), JSON.stringify(third.map(texts)));
      assert.ok(!existsSync(join(dir, "xdg", "opentakeoff-picture")) && !existsSync(join(process.cwd(), "0")), "the cache was off, yet a read was kept");
    } finally {
      await shutdownVectorGrid();
      process.env.OPENTAKEOFF_PICTURE_CACHE = saved;
      if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = savedXdg;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("without OCR, a picture stays a raster region, as before", async () => {
    await shutdownVectorGrid();
    const saved = process.env.OPENTAKEOFF_RASTER_OCR;
    process.env.OPENTAKEOFF_RASTER_OCR = "0";
    try {
      const tables = await read(fixture("as153-07mo-m601-tanks.png"), [1545, 68, 2181, 370]);
      assert.ok(!tables.some((t) => t.ocr), JSON.stringify(tables.map(texts)));
      assert.ok(tables.some((t) => t.raster && !t.cells.length), JSON.stringify(tables));
    } finally {
      await shutdownVectorGrid();
      if (saved === undefined) delete process.env.OPENTAKEOFF_RASTER_OCR;
      else process.env.OPENTAKEOFF_RASTER_OCR = saved;
    }
  });
});
