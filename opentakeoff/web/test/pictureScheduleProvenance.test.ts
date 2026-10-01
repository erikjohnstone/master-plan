/**
 * AS-153: a schedule read from a picture says so, from the sidecar's reply to
 * every unit the takeoff and the assemblies read from it. The fixture is
 * vectorgrid's reply for 029_ME's ME601 (a sheet stored at /Rotate 270 whose
 * BOILER SCHEDULE and PUMP SCHEDULE are pasted pictures), as the sidecar read
 * them by OCR: no text layer is involved, so the test needs no OCR.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { vectorGridTableToScheduleTable } from "../src/lib/vectorGridAdapter.ts";
import type { VectorGridTable } from "../src/lib/vectorGridClient.ts";
import type { ScheduleTable } from "../src/lib/sheetgraph.ts";
import { compileCorpusTakeoff } from "../src/lib/corpusTakeoff.mjs";
import { compiledRowsAndTables, rowCite } from "../src/lib/assemblies/apply.ts";

const FX = JSON.parse(readFileSync(new URL("./fixtures/as153-029me-me601-pictures.vectorgrid.json", import.meta.url), "utf8")) as
  { scale: number; page: { width: number; height: number }; tables: VectorGridTable[] };
const KEY = "029_ME_BGS_Project_3548_MEANG_Building_493_Boiler.pdf#7";

function build(t: VectorGridTable): ScheduleTable {
  const s = FX.scale;
  const built = vectorGridTableToScheduleTable(t, 7, {
    sheetKey: KEY, pdfPath: "/nonexistent.pdf", spans: [],
    pageViewportTransform: [s, 0, 0, -s, 0, FX.page.height * s], width: FX.page.width * s, height: FX.page.height * s,
  }, s);
  assert.ok(built);
  return built;
}
type Item = { tag: string; read_from_picture?: boolean; sheet_id: string; table_title: string; cells?: Record<string, { text: string; bbox: number[] | null }> };
const compile = (tables: ScheduleTable[]) =>
  (compileCorpusTakeoff(null, { tables, sheets: [], rooms: [], callouts: [], buildings: [], notes: [] }, "hvac_equipment") as unknown as
    { categories: Record<string, { items: Item[] }> });

describe("AS-153: a schedule read from a picture says so", () => {
  it("marks the tables, and every unit the takeoff reads from them", () => {
    const tables = FX.tables.map(build);
    assert.deepEqual(tables.map((t) => [t.title?.text, t.read_from_picture]), [["BOILER SCHEDULE", true], ["PUMP SCHEDULE", true]]);
    const cats = compile(tables).categories;
    assert.deepEqual(cats.BOILER.items.map((i) => i.tag).sort(), ["B-1", "B-2"]);
    assert.deepEqual(cats.PUMP.items.map((i) => i.tag).sort(), ["P-1", "P-1E", "P-2", "P-2E", "P-3", "P-4"]);
    for (const it of [...cats.BOILER.items, ...cats.PUMP.items]) assert.equal(it.read_from_picture, true, it.tag);
  });

  it("carries it to the assemblies' cites", () => {
    const compiled = compile(FX.tables.map(build));
    const { items } = compiledRowsAndTables(compiled as never, { tables: [] });
    const boiler = items.find((i) => i.tag === "B-1");
    assert.ok(boiler);
    assert.equal(rowCite(boiler).read_from_picture, true);
  });

  it("says nothing of a table read from the text layer", () => {
    const tables = FX.tables.map((t) => build({ ...t, ocr: undefined }));
    assert.ok(tables.every((t) => !("read_from_picture" in t)));
    const cats = compile(tables).categories;
    assert.ok([...cats.BOILER.items, ...cats.PUMP.items].every((i) => !("read_from_picture" in i)));
  });
});
