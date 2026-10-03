/**
 * #317: two lists stacked on the same columns, each under its own title.
 * 061_IA's M-502 prints its HEATING HOT WATER PLANT POINTS LIST 26 pt under
 * its TYPICAL VARIABLE AIR VOLUME ZONE POINTS LIST, column for column, and
 * vectorgrid joined the two as one list continued. The title-band splitter
 * could not part them again: each list ends in an empty row as wide as the
 * list, so the upper list's last row and the lower list's title read as one
 * title stack, and the lower list's last row left a piece too small to stand.
 * The plant's points were read as the zone list's, a TYPICAL list's.
 *
 * The test draws two such lists and runs the real sidecar: each must be its
 * own table. A lower piece with no title of its own (the list continued under
 * a gap) still joins the list above. And a continuation never jumps a piece:
 * 12_MT's sheet 38 stacks three legends 15 pt apart, each title in a band of
 * its own under a heavy rule, and a merge that jumped a title band joined one
 * legend's body to the next one's. Skipped where vectorgrid's Python is not
 * installed.
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
const SIDECAR = dirname(vectorGridServerPath(new URL("../src/lib/vectorGridClient.ts", import.meta.url).href));

// mode: "titled" (the lower list under its own title band) | "continued" (the
// lower piece carries on the list above, no title band of its own).
const DRAW = String.raw`
import sys, pymupdf
mode, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(); page = doc.new_page(width=2592, height=1728)
xs = [100, 420, 480, 520, 560, 600, 640, 900]          # POINT DESCRIPTION | UNIT | DI AI DO AO | ALARMS
line = lambda a, b, c, d: page.draw_line((a, b), (c, d), width=0.9)
text = lambda x, y, t, s=9: page.insert_text((x, y), t, fontsize=s)

def points_list(top, title, points):
    # A title band lettered larger than the list (none for a continued piece),
    # a header row, a row a point ticked under its type, and an empty last row
    # as wide as the list.
    y, rules = top, [top]
    if title:
        text(xs[0] + 220, y + 18, title, 13)
        y += 24; rules.append(y)
        for i, label in enumerate(["POINT DESCRIPTION", "UNIT", "DI", "AI", "DO", "AO", "ALARMS"]):
            text(xs[i] + 4, y + 12, label)
        y += 16; rules.append(y)
    body = rules[-1]
    for name, unit, kind in points:
        text(xs[0] + 4, y + 11, name); text(xs[1] + 4, y + 11, unit); text(xs[2 + kind] + 7, y + 11, "X")
        y += 14; rules.append(y)
    last = y
    y += 14; rules.append(y)
    for r in rules:
        line(xs[0], r, xs[-1], r)
    line(xs[0], top, xs[0], y); line(xs[-1], top, xs[-1], y)
    for x in xs[1:-1]:
        line(x, body - (16 if title else 0), x, last)
    return y

end = points_list(60, "TYPICAL VARIABLE AIR VOLUME ZONE POINTS LIST", [
    ("ZONE TEMPERATURE", "DEG F", 1), ("ZONE OCCUPANCY", "-", 0), ("DISCHARGE AIR TEMPERATURE", "DEG F", 1),
    ("REHEAT COIL VALVE POSITION COMMAND", "%", 3), ("HEATING PLANT REQUESTS", "-", 0)])
if mode == "titled":
    points_list(end + 26, "HEATING HOT WATER PLANT POINTS LIST", [
        ("NUMBER OF HEATING REQUESTS", "-", 0), ("STEAM PRESSURE", "PSIG", 1), ("HOT WATER SUPPLY TEMPERATURE", "DEG F", 1),
        ("PUMP SPEED COMMAND", "%", 3), ("PUMP STATUS", "-", 0)])
else:
    points_list(end + 26, None, [
        ("ZONE CO2 CONCENTRATION", "PPM", 1), ("DAMPER POSITION COMMAND", "%", 3), ("AIRFLOW", "CFM", 1)])
doc.save(out)
`;

// Three legends stacked 15 pt apart, as 12_MT's sheet 38 draws them: each boxed
// in a heavy rule, its title in a band of its own under a heavy rule (and a
// hairline), its symbol and description columns parted by hairlines.
const DRAW_LEGENDS = String.raw`
import sys, pymupdf
out = sys.argv[1]
doc = pymupdf.open(); page = doc.new_page(width=2592, height=1728)
x0, xm, x1 = 100, 135, 510
line = lambda a, b, c, d, w: page.draw_line((a, b), (c, d), width=w)
text = lambda x, y, t, s=9: page.insert_text((x, y), t, fontsize=s)

def legend(top, title, rows):
    text(x0 + 60, top + 34, title, 22)
    band = top + 48; y = band
    for symbol, meaning in rows:
        text(x0 + 8, y + 14, symbol); text(xm + 8, y + 14, meaning)
        y += 20
    for r in range(len(rows)):
        line(x0, band + 20 * r, x1, band + 20 * r, 0.24)
    line(xm, band, xm, y, 0.24)
    for a in ((x0, top, x1, top), (x0, y, x1, y), (x0, top, x0, y), (x1, top, x1, y), (x0, band, x1, band)):
        line(*a, 1.68)
    return y

end = legend(60, "COMMUNICATION DEVICES", [("V", "COMBINATION VOICE/DATA JACK"), ("S", "CEILING MOUNTED SPEAKER"),
    ("WS", "WALL MOUNTED SPEAKER"), ("AP", "WIRELESS ACCESS POINT"), ("C", "WALL CLOCK"), ("CC", "CLASSROOM CAMERA"), ("D", "DATA JACK")])
end = legend(end + 15, "SECURITY SYSTEM DEVICES", [("CCTV", "CLOSED CIRCUIT CAMERA"), ("CR", "CARD READER"), ("HC", "HANDICAP PUSH BUTTON")])
legend(end + 15, "MISCELLANEOUS LEGEND", [("1", "REFER TO ELECTRICAL NOTES"), ("HR", "HOMERUN TO PANEL"), ("N", "NORMAL CIRCUIT"),
    ("U", "UNDERGROUND CIRCUIT"), ("G", "GROUND")])
doc.save(out)
`;

const EXTRACT = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
import vectorgrid_rpc
print(json.dumps(vectorgrid_rpc.extract_grid(sys.argv[2], 1)))
`;

interface Table { cells: Array<{ text?: string }> }

function read(mode: string): string[][] {
  const dir = mkdtempSync(join(tmpdir(), "ot-stacked-titles-"));
  try {
    const pdf = join(dir, "sheet.pdf");
    const drawn = mode === "legends"
      ? spawnSync(python, ["-c", DRAW_LEGENDS, pdf], { encoding: "utf8" })
      : spawnSync(python, ["-c", DRAW, mode, pdf], { encoding: "utf8" });
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

describe("#317: a list stacked under another on the same columns", { skip: ready ? false : "vectorgrid's Python environment is not installed" }, () => {
  it("is its own table when it opens with its own title", () => {
    const tables = read("titled");
    const zone = holding(tables, "ZONE TEMPERATURE");
    const plant = holding(tables, "STEAM PRESSURE");
    assert.ok(zone && plant, JSON.stringify(tables));
    assert.ok(!zone.includes("STEAM PRESSURE") && !plant.includes("ZONE TEMPERATURE"), JSON.stringify(tables));
    assert.ok(plant.includes("HEATING HOT WATER PLANT POINTS LIST") && plant.includes("POINT DESCRIPTION"), JSON.stringify(plant));
  });

  it("still joins the list above when it carries that list on with no title", () => {
    const tables = read("continued");
    const zone = holding(tables, "ZONE TEMPERATURE");
    assert.ok(zone, JSON.stringify(tables));
    assert.ok(zone.includes("AIRFLOW") && zone.includes("ZONE CO2 CONCENTRATION"), JSON.stringify(tables));
  });

  it("joins no legend to the next across the title band between them", () => {
    const tables = read("legends");
    const legends = [
      ["COMMUNICATION DEVICES", "WALL CLOCK"],
      ["SECURITY SYSTEM DEVICES", "CARD READER"],
      ["MISCELLANEOUS LEGEND", "HOMERUN TO PANEL"],
    ];
    for (const [title, row] of legends) {
      const own = holding(tables, row);
      assert.ok(own, `${row}: ${JSON.stringify(tables)}`);
      assert.ok(own.includes(title), `${row} under ${title}: ${JSON.stringify(own)}`);
      for (const [other, otherRow] of legends) {
        if (other !== title) assert.ok(!own.includes(otherRow) && !own.includes(other), `${row} apart from ${other}: ${JSON.stringify(own)}`);
      }
    }
  });
});
