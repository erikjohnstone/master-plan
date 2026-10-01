// CONTROL INTENT goal, Track A: what each project answer decides, and what it
// never decides (controlIntent/catalogue.ts; decisions C2–C5, C13).
import test from "node:test";
import assert from "node:assert/strict";
import { answerIntents, existingFlag, hvacService, noSpeedColumn, plumbingService, sanitizeAnswers, type AnswerUnit } from "../../src/lib/controlIntent/catalogue.ts";
import { loadStarterLibrary } from "../../src/lib/assemblies/starterLibrary.ts";
import { selectAssembly } from "../../src/lib/assemblies/select.ts";

const LIB = await loadStarterLibrary();
const cite = { sheet: "m.pdf#3", table_title: "T", header: "TAG", bbox: null };
const unit = (index: number, tag: string, family: string, o: Partial<AnswerUnit> = {}): AnswerUnit => ({
  index, tag, family, attributes: {}, unknown: {}, cells: {}, table_title: `${family} SCHEDULE`, table_headers: ["TAG"], cite, ...o,
});

test("answers keep only catalogue values", () => {
  assert.deepEqual(sanitizeAnswers({ PQ1: "no", PQ2: "maybe", PQ9: "x", PQ4: "constant" }), { PQ1: "no", PQ4: "constant" });
  assert.deepEqual(sanitizeAnswers(null), {});
});

test("PQ1 no puts every unit with a typical outside the BAS scope; unknown decides nothing", () => {
  const units = [unit(0, "AHU-1", "AHU"), unit(1, "CC-1", "DUCT_MOUNTED_COIL")];
  const m = answerIntents(units, { PQ1: "no" }, LIB);
  assert.equal(m.get(0)?.out_of_scope?.rule, "project_answer:PQ1=no");
  assert.equal(m.has(1), false, "a family with no typical is untouched");
  assert.equal(answerIntents(units, { PQ1: "unknown" }, LIB).size, 0);
});

test("existing flags come from structure: table title, (E) tag, a whole-phrase remark — never REPLACE EXISTING", () => {
  assert.match(existingFlag({ tag: "B-1", table_title: "EXISTING CONDENSING HOT WATER BOILER SCHEDULE", cells: {} })!, /titled/);
  assert.match(existingFlag({ tag: "B-1(E)", table_title: "BOILER SCHEDULE", cells: {} })!, /\(E\)/);
  assert.match(existingFlag({ tag: "EUH-1", table_title: "ELECTRIC UNIT HEATER SCHEDULE", cells: { REMARKS: "EXISTING" } })!, /REMARKS/);
  assert.match(existingFlag({ tag: "AHU-1", table_title: "AHU", cells: { REMARKS: "SPECIFICATIONS SHOWN FOR REFERENCE ONLY" } })!, /REFERENCE/);
  assert.equal(existingFlag({ tag: "AHU-2", table_title: "AHU", cells: { REMARKS: "REPLACE EXISTING UNIT" } }), null);
  assert.equal(existingFlag({ tag: "P-1", table_title: "NEW PUMP SCHEDULE", cells: {} }), null);
  const m = answerIntents([unit(0, "B-1(E)", "BOILER"), unit(1, "B-3", "BOILER")], { PQ3: "keep" }, LIB);
  assert.match(m.get(0)!.out_of_scope!.basis, /keeps its controls/);
  assert.equal(m.has(1), false);
});

test("AS-137: a mark printed with (E) is existing though the takeoff names the unit without it; (N) is not", async () => {
  // The flag reads the mark as printed (063_MT's "(E) EF- 4", named EF- 4),
  // a tag printed with (E) before it (088_AZ's (E)FC-1), and a cell printing
  // the unit's own mark with (E) — never another unit's.
  assert.match(existingFlag({ tag: "EF- 4", table_title: "EXHAUST FAN SCHEDULE", cells: {}, printed_mark: "(E) EF- 4" })!, /\(E\) EF- 4/);
  assert.match(existingFlag({ tag: "(E)FC-1", table_title: "FAN COIL SCHEDULE", cells: {} })!, /\(E\)FC-1/);
  assert.match(existingFlag({ tag: "VAV-105", table_title: "VAV SCHEDULE", cells: { TAG: "(E) VAV-105" } })!, /TAG/);
  assert.equal(existingFlag({ tag: "VAV-105", table_title: "VAV SCHEDULE", cells: { SERVES: "(E) VAV-106" } }), null);
  assert.equal(existingFlag({ tag: "ACC-2", table_title: "AIR COOLED CHILLER SCHEDULE", cells: {}, printed_mark: "(N)ACC-2" }), null);
  // The takeoff carries the mark as printed to the apply path.
  const { compileHvacTakeoff } = await import("../../src/lib/corpusTakeoff.mjs");
  const { compiledRowsAndTables } = await import("../../src/lib/assemblies/apply.ts");
  const row = (key: string, mark: string) => ({ key, sheet: "s.pdf#9", cells: { MARK: { text: mark }, MANUFACTURER: { text: "COOK" }, TYPE: { text: "INLINE" }, CFM: { text: "330" }, VOLTAGE: { text: "120" } } });
  const graph = { tables: [{ kind: "equipment", sheet: "s.pdf#9", title: { text: "EXHAUST FAN SCHEDULE" }, region: [0, 0, 100, 100] as [number, number, number, number], headers: ["MARK", "MANUFACTURER", "TYPE", "CFM", "VOLTAGE"],
    rows: [row("EEF-4", "(E) EF- 4"), row("EF-5", "EF-5"), row("NEF-6", "(N)EF-6")] }] };
  const { items } = compiledRowsAndTables(compileHvacTakeoff(null, graph) as unknown as Parameters<typeof compiledRowsAndTables>[0], graph);
  const by = new Map(items.map((it) => [it.tag, it]));
  assert.deepEqual([...by.keys()].sort(), ["EF- 4", "EF-5", "EF-6"]);
  assert.equal(by.get("EF- 4")!.printed_mark, "(E) EF- 4");
  assert.equal(by.get("EF-5")!.printed_mark, undefined);
  const flag = (tag: string) => existingFlag({ tag, table_title: by.get(tag)!.table_title, cells: {}, printed_mark: by.get(tag)!.printed_mark });
  assert.ok(flag("EF- 4"));
  assert.equal(flag("EF-5"), null);
  assert.equal(flag("EF-6"), null);
});

test("PQ5 not_in_scope takes condensate and plumbing pumps out, never an HVAC pump", () => {
  const cond = unit(0, "CP-1", "PUMP", { attributes: { service: { value: "CONDENSATE" } } });
  const dhw = unit(1, "RP-1", "PUMP", { cells: { REMARKS: "DOMESTIC HOT WATER RECIRCULATION" } });
  const chw = unit(2, "CWP-1", "PUMP", { attributes: { service: { value: "CHILLED WATER" } } });
  assert.ok(plumbingService(cond) && plumbingService(dhw));
  assert.equal(plumbingService(chw), null);
  const m = answerIntents([cond, dhw, chw], { PQ5: "not_in_scope" }, LIB);
  assert.ok(m.get(0)?.out_of_scope && m.get(1)?.out_of_scope);
  assert.equal(m.has(2), false);
});

test("PQ4 constant fills vfd only when the schedule has no speed column at all (C13: WHSE-EF2's SPEED CONTROL)", () => {
  const none = unit(0, "EF-1", "FAN", { unknown: { vfd: { reason: "no printed column answers it" } }, table_headers: ["TAG", "CFM", "DRIVE"] });
  const unread = unit(1, "EF-2", "FAN", { unknown: { vfd: { reason: "no printed column answers it" } }, table_headers: ["TAG", "SPEED CONTROL"] });
  const volume = unit(2, "EF-3", "FAN", { unknown: { vfd: { reason: "no printed column answers it" } }, cells: { "VOLUME CONTROL": "CV" } });
  const printed = unit(3, "EF-4", "FAN", { attributes: { vfd: { value: "yes" } } });
  assert.deepEqual([none, unread, volume, printed].map(noSpeedColumn), [true, false, false, false]);
  const m = answerIntents([none, unread, volume, printed], { PQ4: "constant" }, LIB);
  assert.equal(m.get(0)?.attributes?.vfd?.value, "no");
  assert.deepEqual([1, 2, 3].map((i) => m.has(i)), [false, false, false]);
});

test("PQ2 dod sets UFC minimum points on HVAC units and HVAC-service pumps only (C13: a DHW pump keeps false)", () => {
  const ahu = unit(0, "AHU-1", "AHU");
  const hvacPump = unit(1, "HWRP-1", "PUMP", { attributes: { service: { value: "AHU-1" } } });
  const unknownPump = unit(2, "CP-1", "PUMP", { cells: { REMARKS: "STAINLESS STEEL HOUSING AND BMS CONTROLS" } });
  const dhw = unit(3, "RP-1", "PUMP", { attributes: { service: { value: "DOMESTIC HOT WATER" } } });
  const fan = unit(4, "EF-1", "FAN");
  assert.match(hvacService(hvacPump, new Set(["AHU-1"]))!, /serves AHU-1/);
  const m = answerIntents([ahu, hvacPump, unknownPump, dhw, fan], { PQ2: "dod" }, LIB);
  assert.equal(m.get(0)?.options?.ufc_minimum_points?.value, true);
  assert.equal(m.get(1)?.options?.ufc_minimum_points?.value, true);
  assert.deepEqual([2, 3, 4].map((i) => m.has(i)), [false, false, false], "unknown service, plumbing and fan typicals without the option are untouched");
});

// 06_MO (dev 2): SP-1 on the plumbing sheet's SINK PUMP SCHEDULE, TYPE
// "PACKAGED SYSTEM SINK DRAIN PUMP"; keyed "none" under PQ5 not_in_scope.
test("PQ5 plumbing words: a sink drain, grinder or lift station pump; a heat sink loop pump is HVAC", () => {
  const sink = unit(0, "SP-1", "PUMP", { cells: { TYPE: "PACKAGED SYSTEM SINK DRAIN PUMP" }, table_title: "SINK PUMP SCHEDULE" });
  const grinder = unit(1, "GP-1", "PUMP", { attributes: { service: { value: "GRINDER" } } });
  const lift = unit(2, "LP-1", "PUMP", { cells: { DESCRIPTION: "SEWAGE LIFT STATION PUMP" } });
  const heatSink = unit(3, "HSP-1", "PUMP", { attributes: { service: { value: "HEAT SINK LOOP" } } });
  assert.match(plumbingService(sink) ?? "", /TYPE reads "PACKAGED SYSTEM SINK DRAIN PUMP"/);
  assert.ok(plumbingService(grinder) && plumbingService(lift));
  assert.match(plumbingService(unit(4, "SP-2", "PUMP", { table_title: "SINK PUMP SCHEDULE" })) ?? "", /titled "SINK PUMP SCHEDULE"/);
  assert.equal(plumbingService(heatSink), null);
  const m = answerIntents([sink, grinder, lift, heatSink], { PQ5: "not_in_scope" }, LIB);
  assert.deepEqual([0, 1, 2, 3].map((i) => Boolean(m.get(i)?.out_of_scope)), [true, true, true, false]);
});

test("selection: a kind no typical fits → no_assembly with the reason; the estimator's own choice still wins", () => {
  const base = { scope: { building: null, floor: null, system: null }, cites: [cite] };
  const fact = { value: true as const, source: "drawing" as const, rule: "drawing_read:row.duct_heater", basis: "a duct heater", cites: [cite] };
  const edh = { tag: "EDH-1", family: "UNIT_HEATER", attributes: {}, ...base, intent: { no_typical: fact } };
  const rec = selectAssembly(edh, LIB);
  assert.equal(rec.status, "no_assembly");
  assert.equal(rec.assembly, null);
  assert.match(rec.reason ?? "", /^drawing_read:row\.duct_heater: a duct heater$/);
  assert.equal(rec.intent?.[0].target, "typical");
  const chosen = selectAssembly(edh, LIB, {}, { tag: "EDH-1", reason: "estimator", assembly: { id: "unit-heater" } });
  assert.equal(chosen.assembly?.id, "unit-heater");
  assert.equal(chosen.selected_by, "user");
});

test("selection: out of scope → not_in_scope; a project option fills a default; a fact contradicting the schedule is a conflict", () => {
  const base = { scope: { building: null, floor: null, system: null }, cites: [cite] };
  const out = selectAssembly({ tag: "AHU-1", family: "AHU", attributes: {}, ...base, intent: { out_of_scope: { value: true, source: "project", rule: "project_answer:PQ1=no", basis: "no BAS", cites: [] } } }, LIB);
  assert.equal(out.status, "not_in_scope");
  assert.equal(out.intent?.[0].target, "scope");
  const pump = selectAssembly({ tag: "CWP-1", family: "PUMP", attributes: { vfd: { value: "yes" } }, ...base, intent: { options: { ufc_minimum_points: { value: true, source: "project", rule: "project_answer:PQ2=dod", basis: "DoD", cites: [] } } } }, LIB);
  assert.equal(pump.assembly?.id, "pump-vfd");
  assert.deepEqual(pump.options.ufc_minimum_points, { value: true, source: "project" });
  // An auto option the schedule decides; a drawing fact that disagrees leaves it waiting.
  const chiller = selectAssembly({ tag: "CH-1", family: "AIR_COOLED_CHILLER", attributes: { bas_interface: { value: "BACNET" } }, ...base,
    intent: { options: { network_interface: { value: false, source: "drawing", rule: "drawing_read:r0", basis: "hardwired", cites: [] } } } }, LIB);
  assert.equal(chiller.status, "unresolved");
  assert.deepEqual(chiller.unresolved.missing, ["conflict.opt.network_interface"]);
  assert.match(chiller.intent?.[0].conflict ?? "", /schedule makes it true/);
});
