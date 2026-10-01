// ASSEMBLIES instrument 4 — the points compare (scripts/assemblies-points-compare.mjs):
// per unit a printed list names, the typical's point lines against the printed rows by
// I/O type; every diff needs a class and its evidence (GATE 6).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { comparePoints, diffsOf, documentsToCompare, parseClassification, summarizePoints } from "../scripts/assemblies-points-compare.mjs";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

const STARTER = join(dirname(fileURLToPath(import.meta.url)), "../../web/src/lib/assemblies/starter");
const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;

const item = (family, tag, i) => ({ family, tag, sheet_id: "s.pdf#2", table_title: `${family} SCHEDULE`, cells: { MARK: { text: tag, bbox: [i, 0, i + 1, 1] } } });
const norm = (it, values) => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, printed: String(v), rule: "t", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k, bbox: null } }])),
});
const row = (unit, point, io) => ({ unit, list_title: `${unit} POINTS`, sheet_id: "c.pdf#5", point, io, description: null, bbox: null });

const items = [item("PUMP", "P-1", 0), item("PUMP", "P-2", 1), item("PUMP", "P-3", 2)];
const normalized = [norm(items[0], { vfd: "yes" }), norm(items[1], { vfd: "yes" }), norm(items[2], {})];
// The typical's own point counts for P-1, from an independent application.
const { lines } = applyAssemblies({ project: { items }, library: LIB, normalized });
const counts = { AI: 0, AO: 0, BI: 0, BO: 0 };
for (const l of lines) if (l.tag === "P-1" && l.layer === "controls" && l.kind === "point" && l.io) counts[l.io] += l.qty_base;

test("a unit whose printed list matches its typical by I/O type agrees; one row fewer is a diff of one", () => {
  assert.ok(Object.values(counts).reduce((a, b) => a + b, 0) > 0, "the pump typical has points");
  const matching = Object.entries(counts).flatMap(([io, n]) => Array.from({ length: n }, (_, k) => row("P-1", `${io}${k + 1}`, io)));
  const short = matching.slice(1);
  const snapshot = { items, tables: [], pages: {}, printed_points: [...matching, ...short.map((r) => ({ ...r, unit: "P 2" })), row("P-3", "BI1", "BI"), row("EF-9", "BO1", "BO"), row("EF-9", "X", null)] };
  const r = comparePoints({ setId: "s", snapshot, library: LIB, normalized });
  const by = Object.fromEntries(r.units.map((u) => [u.tag, u]));
  assert.deepEqual(Object.keys(by).sort(), ["P-1", "P-2", "P-3"], "only the units a printed list names");
  assert.deepEqual(by["P-1"].typical, counts);
  assert.equal(by["P-1"].agree, true);
  assert.equal(by["P-2"].agree, false);
  const io = matching[0].io;
  assert.equal(by["P-2"].diff[io], 1, "the typical has one more than the list");
  assert.equal(Object.values(by["P-2"].diff).filter((d) => d !== 0).length, 1);
  // P-3 prints no VFD: its record waits, so it has nothing decided to agree with.
  assert.equal(by["P-3"].status, "unresolved");
  assert.equal(by["P-3"].agree, false);
  assert.deepEqual(r.unmatched, [{ unit: "EF-9", rows: 2, lists: ["c.pdf#5 · EF-9 POINTS"] }], "a printed unit with no scheduled row is listed apart");
  assert.deepEqual(diffsOf(r.units).map((u) => u.tag).sort(), ["P-2", "P-3"]);
});

test("GATE 6: every diff needs a known class and its evidence", () => {
  const units = [
    { set: "s", tag: "P-1", family: "PUMP", status: "ok", agree: true },
    { set: "s", tag: "P-2", family: "PUMP", status: "ok", agree: false },
    { set: "s", tag: "P-3", family: "PUMP", status: "unresolved", agree: false },
  ];
  const partial = summarizePoints(units, parseClassification("set,tag,class,evidence\ns,P-2,project_specific,\"sheet M-601 note 3: owner requires a second DP sensor\"\n"));
  assert.deepEqual([partial.units, partial.agree, partial.diffs, partial.unclassified.map((u) => u.tag)], [3, 1, 2, ["P-3"]]);
  assert.equal(partial.by_class.project_specific, 1);
  const wrongClass = summarizePoints(units, parseClassification("s,P-2,because,evidence\ns,P-3,typical_unresolved,\n"));
  assert.equal(wrongClass.unclassified.length, 2, "an unknown class, or a class without evidence, is not a classification");
  const full = summarizePoints(units, parseClassification("s,P-2,project_specific,note 3\ns,P-3,typical_unresolved,waits for attr.vfd (schedule prints no drive)\n"));
  assert.equal(full.unclassified.length, 0);
  assert.deepEqual(Object.fromEntries(full.by_family), { PUMP: { units: 3, decided: 2, agree: 1 } });
});

test("the documents compared come from the WP0.1 census's points-list rows (the real census and split)", () => {
  const reports = join(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus/reports/assemblies");
  const split = JSON.parse(readFileSync(join(reports, "01-split.json"), "utf8"));
  const baseline = JSON.parse(readFileSync(join(reports, "00-baseline.json"), "utf8"));
  // The census counts printed rows on two documents: one dev, one held-out.
  assert.deepEqual(documentsToCompare(split, baseline, "dev"), ["federal-mech"]);
  assert.deepEqual(documentsToCompare(split, baseline, "heldout"), ["navfac-cherry-point-atc"]);
  // A census with no rows names no document (the field the census writes is points_lists).
  assert.deepEqual(documentsToCompare(split, { per_set: baseline.per_set.map((x) => ({ ...x, points_lists: { rows: 0 } })) }, "dev"), []);
});
