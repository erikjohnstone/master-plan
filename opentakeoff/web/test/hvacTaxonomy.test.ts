// hvacTaxonomy.ts (maturity plan Phase 2) — pure reference data, no
// extraction/classification logic of its own. The tests here check two
// things: (1) basic structural integrity (every entry is well-formed, no
// silently-empty fields), and (2) that specific real-corpus claims the
// taxonomy makes are actually true against the one real fixture already
// committed in this repo (m601-spans.json / Bessemer) — a taxonomy entry
// that CLAIMS "real, observed on Bessemer" is checked against that same
// real data, not just trusted on the word of the doc comment that wrote it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HVAC_TAXONOMY, VALVES, ACTUATORS, DAMPERS, AIR_TERMINALS, MAJOR_EQUIPMENT, SENSORS, ROW_KEY_CONVENTIONS,
} from "../src/lib/hvacTaxonomy.ts";
import { extractAllTables, type SheetSpans } from "../src/lib/sheetgraph.ts";

const ALL_LISTS = [VALVES, ACTUATORS, DAMPERS, AIR_TERMINALS, MAJOR_EQUIPMENT, SENSORS];

test("every taxonomy entry is well-formed: real name, real note, tagPrefixes is an array", () => {
  for (const list of ALL_LISTS) {
    assert.ok(list.length > 0);
    for (const c of list) {
      assert.ok(c.name && c.name.trim().length > 0, `entry in ${c.category} has an empty name`);
      assert.ok(c.note && c.note.trim().length > 20, `${c.name}: note is missing or too thin to mean anything`);
      assert.ok(Array.isArray(c.tagPrefixes), `${c.name}: tagPrefixes must be an array (possibly empty)`);
      assert.ok(!c.scheduleKind || c.scheduleKind === "equipment" || c.scheduleKind === "finish", `${c.name}: scheduleKind must be a real TableKind or undefined`);
    }
  }
});

test("no duplicate canonical names within a single category", () => {
  for (const list of ALL_LISTS) {
    const names = list.map((c) => c.name);
    assert.equal(new Set(names).size, names.length, `duplicate name(s) in one category: ${names.join(", ")}`);
  }
});

test("row-key conventions: three real, distinct header words, each naming where it was observed", () => {
  assert.ok(ROW_KEY_CONVENTIONS.length >= 3);
  const headers = ROW_KEY_CONVENTIONS.map((r) => r.header);
  assert.deepEqual(new Set(headers), new Set(["ID", "SYMBOL", "TAG", "MARK"]));
  for (const r of ROW_KEY_CONVENTIONS) assert.ok(r.observedOn.trim().length > 0);
});

test("HVAC_TAXONOMY re-exports every list under its own key", () => {
  assert.equal(HVAC_TAXONOMY.VALVES, VALVES);
  assert.equal(HVAC_TAXONOMY.ACTUATORS, ACTUATORS);
  assert.equal(HVAC_TAXONOMY.DAMPERS, DAMPERS);
  assert.equal(HVAC_TAXONOMY.AIR_TERMINALS, AIR_TERMINALS);
  assert.equal(HVAC_TAXONOMY.MAJOR_EQUIPMENT, MAJOR_EQUIPMENT);
  assert.equal(HVAC_TAXONOMY.SENSORS, SENSORS);
});

// ── cross-check against the one real, committed fixture ────────────────────
const m601 = JSON.parse(
  readFileSync(new URL("./fixtures/m601-spans.json", import.meta.url), "utf8"),
) as SheetSpans;

test("taxonomy claims for Bessemer are actually true: EWH-/EBB-/HP- extract as real equipment-kind row keys", () => {
  const tables = extractAllTables(m601, "equipment");
  const allKeys = tables.flatMap((t) => t.rows.map((r) => r.key));
  const heaterEntry = MAJOR_EQUIPMENT.find((c) => c.name.startsWith("Unit heater"))!;
  const vrfEntry = MAJOR_EQUIPMENT.find((c) => c.name.includes("VRF"))!;
  assert.ok(heaterEntry.tagPrefixes.includes("EWH-"));
  assert.ok(heaterEntry.tagPrefixes.includes("EBB-"));
  assert.ok(vrfEntry.tagPrefixes.includes("HP-"));
  assert.ok(allKeys.some((k) => k.startsWith("EWH-")), `taxonomy claims EWH- is real on Bessemer; found keys: ${allKeys.join(", ")}`);
  assert.ok(allKeys.some((k) => k.startsWith("EBB-")), "taxonomy claims EBB- is real on Bessemer");
  assert.ok(allKeys.some((k) => k.startsWith("HP-")), "taxonomy claims HP- is real on Bessemer");
});

test("taxonomy's ID row-key claim for Bessemer matches the fixture: every equipment table anchors on an ID (or backward-merged) key column", () => {
  const tables = extractAllTables(m601, "equipment");
  assert.ok(tables.length > 0);
  for (const t of tables) assert.ok(t.headers.includes("ID"), `${t.title?.text}: expected an ID column, got ${t.headers.join(", ")}`);
});
