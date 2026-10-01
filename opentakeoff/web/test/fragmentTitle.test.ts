/**
 * AS-148: a schedule title whose family word lost its glyphs. bldg5406's text
 * layer has no M, V or X, so its PUMP SCHEDULE reads "P SCHEDULE"; the table
 * itself (CWP-1, CWP-2 under MARK) is read whole. The fixture is the cached
 * sheet graph's own tables: that one, and two whose whole title is a bare
 * "SCHEDULE" (017_MD's occupancy schedule, 054_NV's pipe hanger sizes).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { compileCorpusTakeoff } from "../src/lib/corpusTakeoff.mjs";

type Table = { kind: string; sheet: string; title: { text: string }; headers: string[]; rows: { key: string }[] };
const FX = JSON.parse(readFileSync(new URL("./fixtures/as148-fragment-titles.json", import.meta.url), "utf8")) as { tables: Table[] };
type Cat = { count: number; items: { tag: string }[] };
const compile = (tables: Table[]) =>
  (compileCorpusTakeoff(null, { tables, sheets: [], rooms: [], callouts: [], buildings: [], notes: [] }, "hvac_equipment") as unknown as
    { categories: Record<string, Cat> }).categories;
const pumpTable = FX.tables.find((t) => t.title.text === "P SCHEDULE")!;
const bare = FX.tables.filter((t) => t.title.text === "SCHEDULE");

describe("AS-148: a title that lost its family word names no family", () => {
  it("reads bldg5406's pumps by their own marks", () => {
    const cats = compile([pumpTable]);
    assert.deepEqual(cats.PUMP?.items.map((i) => i.tag).sort(), ["CWP-1", "CWP-2"]);
  });

  it("still reads nothing from a table whose marks are no family's", () => {
    const renamed = { ...pumpTable, rows: pumpTable.rows.map((r, i) => ({ ...r, key: `ZZ-${i + 1}`,
      cells: { ...(r as { cells?: Record<string, { text: string }> }).cells, MARK: { text: `ZZ-${i + 1}` } } })) };
    const cats = compile([renamed]);
    assert.equal(Object.values(cats).reduce((n, c) => n + (c.count || 0), 0), 0, JSON.stringify(cats));
  });

  it("keeps a bare SCHEDULE title what it was", () => {
    assert.equal(bare.length, 3);
    const cats = compile(bare);
    assert.equal(Object.values(cats).reduce((n, c) => n + (c.count || 0), 0), 0, JSON.stringify(cats));
  });
});
