/**
 * B-3 — a schedule with NO identifier column.
 *
 * sheetgraph keys a reference table from its LEFT-MOST column (`anchors[0]`),
 * which is right for the overwhelming majority of real schedules (MARK/TAG/
 * SYMBOL lead) and wrong for a table that carries no identifier column at
 * all. 028_TX_Renovation_of_Building_615 p1's NOISE CONTROL DUCT SILENCER
 * SCHEDULE is exactly that table: its column 0 is literally "QTY.".
 *
 * Measured before the fix: 16 real rows keyed 2,1,1,1,1,1,2,1,1,1,1,2,2,2,2,2
 * — THREE distinct values across sixteen rows — deduped by tag down to TWO
 * items keyed "1" and "2". 23 real silencers reported as 2.
 *
 * The property that actually distinguishes an identifier from a count column
 * is CARDINALITY (and letters), not position.
 *
 * Real captured spans (no PDF bytes), same idiom as m601-spans.json, so this
 * runs without the gitignored bulk corpus.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildSheetGraph, type GraphSpan } from "../src/lib/sheetgraph.ts";
import { compileCorpusTakeoff } from "../src/lib/corpusTakeoff.mjs";

const FX = JSON.parse(
  readFileSync(new URL("./fixtures/b3-028tx-p1.spans.json", import.meta.url), "utf8"),
) as { key: string; sheet_number: string | null; spans: GraphSpan[] };

type Cat = { count: number; items: { tag: string; scheduled_qty: number | null; status: string | null }[] };
const compile = () => {
  const g = buildSheetGraph([{ key: FX.key, sheet_number: FX.sheet_number, spans: FX.spans }]);
  const out = compileCorpusTakeoff(null, g, "hvac_equipment") as unknown as { categories: Record<string, Cat> };
  return { g, out };
};

test("B-3: a count-keyed schedule emits one line per physical row, not one per distinct count", () => {
  const { out } = compile();
  const sil = out.categories.DUCT_SILENCER;
  assert.ok(sil, "the silencer family must be present");
  assert.equal(sil.count, 16, `16 real rows must survive as 16 lines, not collapse to 2: got ${sil.count}`);
  assert.equal(sil.items.length, 16);
  // The identifier is chosen by cardinality + letters, so the lines carry the
  // schedule's real descriptive identity rather than a repeated count value.
  assert.ok(!sil.items.some((i) => /^\d+$/.test(String(i.tag).trim())),
    `no line may be keyed by a bare count value: ${JSON.stringify(sil.items.map((i) => i.tag).slice(0, 4))}`);
  assert.ok(sil.items.some((i) => /GROUP REHEARSAL/i.test(i.tag)),
    "the real LOCATION & SERVES identity must key the lines");
});

test("B-3: the printed QTY. column is read (trailing period is a real spelling)", () => {
  const { out } = compile();
  const items = out.categories.DUCT_SILENCER.items;
  // The sheet prints 23 across its 16 rows. 22 are read; the 16th refuses
  // because a full-width section banner banded into that row's QTY cell
  // ("SECOND FLOOR 2") — refuse-and-disclose, never a guessed digit.
  const sum = items.reduce((n, i) => n + (i.scheduled_qty || 0), 0);
  const refused = items.filter((i) => i.status === "REFUSED_UNPARSEABLE_QTY");
  assert.equal(refused.length, 1, "the polluted QTY cell must be disclosed, not silently defaulted");
  assert.equal(sum + 1, 23, `22 read + 1 refused must account for the sheet's printed 23: got ${sum}`);
  assert.ok(items.some((i) => i.scheduled_qty === 2), "a printed QTY. of 2 must be read as 2, not 1");
});

test("B-3: an ordinary MARK-keyed schedule on the same page is untouched", () => {
  // The same sheet's CEILING CONCEALED FAN COIL UNIT schedule leads with a
  // real identifier column, scores cardinality 1.0, and must still dedupe by
  // tag exactly as before — the fix fires only where there is no identifier.
  const { out } = compile();
  const fcu = out.categories.FCU;
  assert.ok(fcu && fcu.count > 0, "the FCU family must still compile");
  assert.ok(fcu.items.every((i) => /[A-Za-z]/.test(i.tag)), "FCU tags stay real marks");
  const tags = fcu.items.map((i) => i.tag);
  assert.equal(new Set(tags).size, tags.length, "a tag-keyed family still dedupes by tag");
});
