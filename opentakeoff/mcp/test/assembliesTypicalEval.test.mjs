// ASSEMBLIES instrument 3 — the typical eval's scoring rules
// (scripts/assemblies-typical-eval.mjs), on synthetic keys and compile
// items, plus a check that every committed typicals key reads, names only
// the frozen library's typicals and options, and keys exactly the instances
// its attribute key keys.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KEY_COLUMNS, parseAttrKeyCsv } from "../scripts/assemblies-attr-eval.mjs";
import { gateVerdict, parseOptions, parseTypicalKeyCsv, scoreTypicalSet, summarize, TYPICAL_KEY_COLUMNS } from "../scripts/assemblies-typical-eval.mjs";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const STARTER = resolve(HERE, "../../web/src/lib/assemblies/starter/us-typicals-v1.json");
const { assemblies: LIB } = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(STARTER, "utf8")).assemblies);

const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const attrCsv = (lines) => [KEY_COLUMNS.join(","), ...lines.map((l) => KEY_COLUMNS.map((c) => q(l[c] ?? "")).join(","))].join("\n");
const typCsv = (rows) => [TYPICAL_KEY_COLUMNS.join(","), ...rows.map((r) => TYPICAL_KEY_COLUMNS.map((c) => q(r[c] ?? "")).join(","))].join("\n");
const aline = (tag, attribute, value) => ({ sheet: "a.pdf#2", table_title: "PUMP SCHEDULE", tag, family: "PUMP", attribute, value, unit: "", source_header: value ? "VFD" : "", note: value ? "" : "not printed" });
const item = (tag, cells) => ({ family: "PUMP", tag, sheet_id: "a.pdf#2", table_title: "PUMP SCHEDULE",
  cells: Object.fromEntries(Object.entries({ MARK: tag, ...cells }).map(([h, text], i) => [h, { text, bbox: [i, 0, i + 1, 1] }])) });

test("reads options: decided, left open with the library default (x?), and undecided auto (x=?)", () => {
  assert.deepEqual(parseOptions("a=true;b=false?;c=?"), {
    a: { value: true, decided: true }, b: { value: false, decided: false }, c: { value: null, decided: false },
  });
  assert.deepEqual(parseOptions(""), {});
  assert.throws(() => parseOptions("a=yes"), /not id=true/);
  assert.throws(() => parseTypicalKeyCsv("sheet,tag\nx,y"), /expected/);
  assert.throws(() => parseTypicalKeyCsv(typCsv([{ sheet: "s", tag: "X", family: "PUMP", typical_id: "none", options: "a=true" }])), /none but lists options/);
});

test("scores exact, option_wrong, wrong_typical, unresolved (honest or not) and unmatched; never counts unresolved", () => {
  const attrKey = parseAttrKeyCsv(attrCsv([
    aline("P-1", "vfd", "yes"), aline("P-2", "vfd", "yes"), aline("P-3", "vfd", "no"),
    aline("P-4", "vfd", ""), aline("P-5", "vfd", "yes"), aline("P-6", "vfd", "yes"),
  ]));
  const typKey = parseTypicalKeyCsv(typCsv([
    { sheet: "a.pdf#2", tag: "P-1", family: "PUMP", typical_id: "pump-vfd", options: "ufc_minimum_points=false" },
    { sheet: "a.pdf#2", tag: "P-2", family: "PUMP", typical_id: "pump-vfd", options: "ufc_minimum_points=true" },
    { sheet: "a.pdf#2", tag: "P-3", family: "PUMP", typical_id: "none" },
    { sheet: "a.pdf#2", tag: "P-4", family: "PUMP", typical_id: "pump-constant", options: "ufc_minimum_points=false" },
    { sheet: "a.pdf#2", tag: "P-5", family: "PUMP", typical_id: "pump-vfd", options: "ufc_minimum_points=false?" },
    { sheet: "a.pdf#2", tag: "P-6", family: "PUMP", typical_id: "pump-vfd", options: "ufc_minimum_points=false" },
  ]));
  const snapshot = {
    items: [item("P-1", { VFD: "YES" }), item("P-2", { VFD: "YES" }), item("P-3", { VFD: "NO" }), item("P-4", {}), item("P-5", {})],
    tables: [{ sheet: "a.pdf#2", title: "PUMP SCHEDULE", headers: ["MARK", "VFD"], region: null, rows: [] }],
    pages: {},
  };
  const { outcomes } = scoreTypicalSet({ setId: "s", typKey, attrKey, snapshot, library: LIB });
  const by = Object.fromEntries(outcomes.map((o) => [o.tag, o]));
  assert.equal(by["P-1"].outcome, "exact");
  assert.equal(by["P-2"].outcome, "option_wrong");
  assert.deepEqual(by["P-2"].option_diffs.map((d) => [d.id, d.key, d.got, d.source]), [["ufc_minimum_points", true, false, "starter_default"]]);
  assert.equal(by["P-3"].outcome, "wrong_typical", "a typical where the key says none");
  assert.equal(by["P-4"].outcome, "unresolved");
  assert.deepEqual(by["P-4"].waits, [{ ref: "attr.vfd", honesty: "honest" }]);
  assert.equal(by["P-5"].outcome, "unresolved", "unresolved is never exact, even when the key is right to leave it open");
  assert.deepEqual(by["P-5"].waits.map((w) => w.honesty), ["dishonest"], "the key prints the VFD the pipeline did not read");
  assert.equal(by["P-6"].outcome, "unmatched");
  const total = summarize(outcomes).total;
  assert.deepEqual([total.instances, total.exact, total.option_wrong, total.wrong_typical, total.unresolved, total.unmatched, total.unresolved_dishonest],
    [6, 1, 1, 1, 2, 1, 1]);
  assert.equal(gateVerdict(total, "dev").pass, false);
});

test("a decided record resting on a value the attribute key says is not printed fails GATE 5's disclosure check", () => {
  const attrKey = parseAttrKeyCsv(attrCsv([aline("P-1", "vfd", "")]));
  const typKey = parseTypicalKeyCsv(typCsv([{ sheet: "a.pdf#2", tag: "P-1", family: "PUMP", typical_id: "pump-vfd", options: "ufc_minimum_points=false" }]));
  // The pipeline reads a VFD the key says the drawing does not print.
  const snapshot = { items: [item("P-1", { VFD: "YES" })], tables: [], pages: {} };
  const { outcomes } = scoreTypicalSet({ setId: "s", typKey, attrKey, snapshot, library: LIB });
  assert.equal(outcomes[0].outcome, "exact");
  assert.deepEqual(outcomes[0].rests_on_unprinted, ["vfd"]);
  const total = summarize(outcomes).total;
  assert.equal(total.rests_on_unprinted, 1);
  const verdict = gateVerdict({ ...total, exact_pct: 1 }, "dev");
  assert.equal(verdict.pass, false);
  assert.equal(verdict.checks.find((c) => c.name === "undisclosed").ok, false);
});

test("every committed typicals key reads, names v1's typicals and all their options, and keys its attribute key's instances", () => {
  const files = readdirSync(join(CORPUS, "keys")).filter((f) => f.endsWith(".typicals.csv"));
  assert.ok(files.length >= 17, `found ${files.length} typicals keys`);
  const byId = new Map(LIB.map((a) => [a.id, a]));
  for (const f of files) {
    const setId = f.replace(/\.typicals\.csv$/, "");
    const rows = parseTypicalKeyCsv(readFileSync(join(CORPUS, "keys", f), "utf8"), f);
    const attr = parseAttrKeyCsv(readFileSync(join(CORPUS, "keys", `${setId}.attrs.csv`), "utf8"));
    const keyed = new Set(attr.rows.filter((r) => r.tag).map((r) => `${r.sheet}|${r.tag}|${r.family}`));
    const seen = new Set();
    for (const r of rows) {
      const k = `${r.sheet}|${r.tag}|${r.family}`;
      assert.ok(keyed.has(k), `${f}: ${r.tag} is not an instance of the attribute key`);
      assert.ok(!seen.has(k), `${f}: ${r.tag} keyed twice`);
      seen.add(k);
      if (r.typical_id === "none") continue;
      const def = byId.get(r.typical_id);
      assert.ok(def, `${f}: ${r.tag} names ${r.typical_id}, not a v1 typical`);
      assert.deepEqual(Object.keys(r.options).sort(), def.options.map((o) => o.id).sort(), `${f}: ${r.tag} options`);
    }
    assert.equal(seen.size, keyed.size, `${f}: keys ${seen.size} of the attribute key's ${keyed.size} instances`);
  }
});
