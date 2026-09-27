// ASSEMBLIES WP5.3/5.4 — the report every surface renders (src/lib/assemblies/report.ts):
// exceptions first, a table per family, a row per unit with its cites.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, type CompiledItem } from "../../src/lib/assemblies/apply.ts";
import type { NormalizedItem } from "../../src/lib/assemblies/normalize.ts";
import { assembliesReport, exceptionGroups, familiesLeftOut, unitsLike, unreadScheduleLabel, type UnitRow } from "../../src/lib/assemblies/report.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;

const row = (family: string, tag: string, i: number): CompiledItem => ({
  family, tag, sheet_id: "s.pdf#2", table_title: `${family} SCHEDULE`, cells: { MARK: { text: tag, bbox: [i, 0, i + 1, 1] } },
});
const norm = (it: CompiledItem, values: Record<string, number | string> = {}): NormalizedItem => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value, printed: String(value), rule: "test", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k, bbox: null } }])),
});

test("the report: exceptions first (each naming what it waits for), a family table, unit rows with line counts and cites", () => {
  const items = [row("PUMP", "P-1", 0), row("PUMP", "P-2", 1), row("PUMP", "P-3", 2), row("FIN_TUBE_RADIATION", "FTR-1", 3), row("AHU", "AHU-7", 4)];
  const normalized = [norm(items[0], { vfd: "yes" }), norm(items[1], { vfd: "no" }), norm(items[2]), norm(items[3]),
    norm(items[4], { supply_cfm: 9000, oa_cfm_min: 9000, energy_recovery: "none", cooling_type: "chw" })];
  const { instances, applications, lines } = applyAssemblies({ project: { items }, library: LIB, normalized });
  const r = assembliesReport(instances, applications, lines);
  assert.equal(r.schema, "opentakeoff.assemblies_report.v1");
  assert.equal(r.totals.units, 5);
  assert.equal(r.totals.records, applications.length);
  assert.equal(r.totals.lines, lines.length);
  // P-3 prints no VFD: its controls record waits for it, and it is listed first.
  const ex = r.exceptions.find((e) => e.tag === "P-3" && e.layer === "controls");
  assert.ok(ex);
  assert.deepEqual(ex.waits_for, ["attr.vfd"]);
  assert.deepEqual(ex.candidates.sort(), ["pump-constant@1", "pump-vfd@1"]);
  assert.ok(r.exceptions.every((e) => e.status === "unresolved"));
  assert.equal(r.exceptions.length, r.totals.by_status.unresolved);
  // The family table counts units once, records per layer, and typicals by id@version.
  const pumps = r.families.find((f) => f.family === "PUMP")!;
  assert.equal(pumps.units, 3);
  assert.equal(pumps.records, applications.filter((a) => a.instance.family === "PUMP").length);
  assert.equal(pumps.assemblies["pump-vfd@1"], 1);
  assert.equal(pumps.assemblies["pump-constant@1"], 1);
  assert.equal(r.families.find((f) => f.family === "FIN_TUBE_RADIATION")!.by_status.no_assembly, 1);
  // Unit rows: the derived family with its rule, the schedule family, cites, line counts.
  const doas = r.units.find((u) => u.tag === "AHU-7" && u.layer === "controls")!;
  assert.equal(doas.family, "DOAS");
  assert.equal(doas.compiled_family, "AHU");
  assert.equal(doas.derived.family.rule, "derive.family.outdoor_air_cfm");
  assert.equal(doas.assembly, "doas@1");
  assert.deepEqual(doas.cites, [{ sheet: "s.pdf#2", table_title: "AHU SCHEDULE", header: "MARK", bbox: [4, 0, 5, 1] }]);
  const p1 = r.units.find((u) => u.tag === "P-1" && u.layer === "controls")!;
  assert.equal(p1.lines.ok + p1.lines.unresolved + p1.lines.replaced + p1.lines.error,
    lines.filter((l) => l.tag === "P-1" && l.layer === "controls").length);
  // Line status totals add up.
  assert.equal(Object.values(r.totals.lines_by_status).reduce((a, b) => a + b, 0), lines.length);
});

test("exception groups: one schedule's rows that wait for the same things with the same candidates resolve together", () => {
  const at = (family: string, tag: string, i: number, sheet = "s.pdf#2"): CompiledItem => ({ ...row(family, tag, i), sheet_id: sheet });
  const items = [at("FAN", "EF-1", 0), at("FAN", "EF-2", 1), at("FAN", "EF-3", 2), at("FAN", "EF-4", 3, "s.pdf#3"),
    at("PUMP", "P-1", 4), at("PUMP", "P-2", 5), at("PUMP", "P-3", 6)];
  const normalized = items.map((it, i) => norm(it, i === 6 ? { vfd: "yes" } : {}));
  const { instances, applications, lines } = applyAssemblies({ project: { items }, library: LIB, normalized });
  const r = assembliesReport(instances, applications, lines);
  const groups = exceptionGroups(r.exceptions);
  assert.deepEqual(groups.map((g) => [g.family, g.layer, g.schedule, g.units.map((u) => u.tag)]), [
    ["FAN", "controls", "FAN SCHEDULE", ["EF-1", "EF-2", "EF-3"]],
    ["PUMP", "controls", "PUMP SCHEDULE", ["P-1", "P-2"]],
  ], "EF-4 is printed on another sheet, and P-3's row prints its drive");
  assert.deepEqual(groups[0].waits_for, ["attr.vfd"]);
  assert.deepEqual([...groups[0].candidates].sort(), ["fan-constant@1", "fan-variable@1"]);
  assert.deepEqual(exceptionGroups(r.exceptions.filter((e) => e.tag === "EF-1")), [], "a group of one is no group");
});

test("exception groups: rows under one typical whose same options wait are one group, one answer each (AS-48)", () => {
  // Fan coils whose row prints no motor type: fcu's variable_speed_fan reads attr.ecm.
  const items = [row("FCU", "FCU-1", 0), row("FCU", "FCU-2", 1), row("FCU", "FCU-3", 2)];
  const normalized = [norm(items[0]), norm(items[1]), norm(items[2], { ecm: "yes" })];
  const run = (overrides: NonNullable<Parameters<typeof applyAssemblies>[0]["overrides"]> = []) => {
    const r = applyAssemblies({ project: { items }, library: LIB, normalized, overrides });
    return exceptionGroups(assembliesReport(r.instances, r.applications, r.lines).exceptions);
  };
  const [g] = run();
  assert.deepEqual([g.family, g.assembly, g.options, g.candidates, g.waits_for, g.units.map((u) => u.tag)],
    ["FCU", "fcu@1", ["variable_speed_fan"], [], ["attr.ecm"], ["FCU-1", "FCU-2"]], "FCU-3 prints its motor");
  // One answer for the group: an option override on each unit, and no group is left.
  assert.deepEqual(run(g.units.map((u) => ({ tag: u.tag, family: u.family, layer: u.layer, reason: "ECM per spec 23 82 19", options: { variable_speed_fan: true } }))), []);
  // A typical the estimator chose for a schedule's rows that still waits
  // forms one too (AS-47): AHU-1 and AHU-2 under ahu-constant-volume wait
  // for the economizer it reads.
  const ahus = [row("AHU", "AHU-1", 3), row("AHU", "AHU-2", 4)];
  const r = applyAssemblies({ project: { items: ahus }, library: LIB, normalized: ahus.map((it) => norm(it)),
    overrides: ahus.map((it) => ({ tag: it.tag, family: "AHU", layer: "controls", reason: "constant volume per the sequence", assembly: { id: "ahu-constant-volume" } })) });
  const chosen = exceptionGroups(assembliesReport(r.instances, r.applications, r.lines).exceptions).find((x) => x.assembly?.startsWith("ahu-constant-volume@"));
  assert.ok(chosen, "the chosen typical's rows wait together");
  assert.deepEqual([chosen.options, chosen.units.map((u) => [u.tag, u.selected_by])], [["economizer"], [["AHU-1", "user"], ["AHU-2", "user"]]]);
});

test("a narrowed reply names the families that leave units out (AS-51)", () => {
  // AHU-7 is scheduled as an air handler and applies as DOAS (100% outdoor air).
  const items = [row("AHU", "AHU-1", 0), row("AHU", "AHU-7", 1), row("PUMP", "P-1", 2)];
  const normalized = [norm(items[0], { supply_cfm: 9000, oa_cfm_min: 1500 }),
    norm(items[1], { supply_cfm: 9000, oa_cfm_min: 9000, energy_recovery: "none", cooling_type: "chw" }), norm(items[2])];
  const { instances } = applyAssemblies({ project: { items }, library: LIB, normalized });
  assert.deepEqual(instances.map((i) => [i.tag, i.compiled_family, i.family]).sort(), [["AHU-1", "AHU", "AHU"], ["AHU-7", "AHU", "DOAS"], ["P-1", "PUMP", "PUMP"]]);
  assert.deepEqual(familiesLeftOut(instances, ["AHU"]), [{ family: "AHU", why: "1 unit scheduled as AHU applies as DOAS (AHU-7); name DOAS too to see it" }]);
  assert.deepEqual(familiesLeftOut(instances, ["AHU", "DOAS"]), []);
  assert.deepEqual(familiesLeftOut(instances, ["PUMPS"]), [{ family: "PUMPS", why: "no unit applies as PUMPS (the families here: AHU, DOAS, PUMP)" }]);
  assert.deepEqual(familiesLeftOut(instances, ["PUMP", "DOAS"]), [], "DOAS is asked for by its applied family");
});

test("lines whose quantity cannot stand are listed beside the exceptions, each with why (AS-53)", () => {
  // A cooling tower whose cell count was misread as -2, beside one read right.
  const items = [row("COOLING_TOWER", "CT-1", 0), row("COOLING_TOWER", "CT-2", 1)];
  const r = applyAssemblies({ project: { items }, library: LIB, normalized: [norm(items[0], { cells: -2 }), norm(items[1], { cells: 2 })] });
  const report = assembliesReport(r.instances, r.applications, r.lines);
  assert.ok(report.line_errors.length > 0);
  assert.equal(report.line_errors.length, report.totals.lines_by_status.error, "every error line is listed");
  assert.ok(report.line_errors.every((l) => l.tag === "CT-1" && /^qty -\d+ is negative$/.test(l.why) && l.cites.length), JSON.stringify(report.line_errors[0]));
  assert.ok(report.line_errors.some((l) => l.rule.startsWith("cooling-tower@1:")), "the tower's own points");
  const clean = applyAssemblies({ project: { items: [items[1]] }, library: LIB, normalized: [norm(items[1], { cells: 2 })] });
  assert.deepEqual(assembliesReport(clean.instances, clean.applications, clean.lines).line_errors, []);
});

test("the schedule sheets whose tables are pictures ride the report, each with why; none when there is none (AS-54)", () => {
  const items = [row("COOLING_TOWER", "CT-2", 1)];
  const r = applyAssemblies({ project: { items }, library: LIB, normalized: [norm(items[0], { cells: 2 })] });
  const unread = [{ sheet: "m.pdf#21", sheet_number: "M-601", picture_share: 0.59 }, { sheet: "m.pdf", picture_share: 0.174 }];
  const report = assembliesReport(r.instances, r.applications, r.lines, unread);
  assert.deepEqual(report.schedules_unread, [
    { ...unread[0], why: "no table could be read from it: 59% of the sheet is pictures (pasted images or a scan), so any unit it schedules is missing from these assemblies" },
    { ...unread[1], why: "no table could be read from it: 17% of the sheet is pictures (pasted images or a scan), so any unit it schedules is missing from these assemblies" },
  ]);
  assert.deepEqual(unread.map(unreadScheduleLabel), ["M-601 (page 21 of m.pdf)", "page 1 of m.pdf"], "the printed sheet number when there is one, the page and its file");
  // A set opened as several files has a page 3 in each (AS-57).
  assert.deepEqual([{ sheet: "mech.pdf#3", picture_share: 0.6 }, { sheet: "elec.pdf#3", sheet_number: "E-601", picture_share: 0.6 }].map(unreadScheduleLabel),
    ["page 3 of mech.pdf", "E-601 (page 3 of elec.pdf)"]);
  assert.equal("schedules_unread" in assembliesReport(r.instances, r.applications, r.lines), false, "absent when there is none");
  const { schedules_unread: _named, ...rest } = report;
  assert.deepEqual(rest, assembliesReport(r.instances, r.applications, r.lines), "nothing else in the report changes");
});

test("exception groups: the rows of a table that prints no title are one untitled schedule", () => {
  // 26_CA's and 061_IA's shape: the compile keeps the table, its title "".
  const untitled = (tag: string, i: number): CompiledItem => ({ ...row("FAN", tag, i), sheet_id: "s.pdf#4", table_title: "" });
  const items = [untitled("SF1", 0), untitled("SF2", 1)];
  const { instances, applications, lines } = applyAssemblies({ project: { items }, library: LIB, normalized: items.map((it) => norm(it)) });
  const groups = exceptionGroups(assembliesReport(instances, applications, lines).exceptions);
  assert.deepEqual(groups.map((g) => [g.schedule, g.sheet, g.units.map((u) => u.tag)]), [[null, "s.pdf#4", ["SF1", "SF2"]]]);
});

test("the units a typical choice is made for together: its schedule's rows of its family and layer with its typical, or none (AS-55)", () => {
  const cite = (sheet: string, table_title: string) => ({ sheet, table_title, header: "MARK", bbox: [0, 0, 1, 1] });
  const row = (tag: string, over: Partial<UnitRow> = {}) => ({ tag, family: "LAB_AIR_VALVE", compiled_family: "LAB_AIR_VALVE", layer: "controls", assembly: null, status: "no_assembly", cites: [cite("m.pdf#4", "GENERAL EXHAUST VALVE SCHEDULE")], ...over }) as UnitRow;
  const units = [
    row("GEV-1"), row("GEV-2"), row("GEV-3"),
    row("GEV-4", { status: "excluded" }),
    row("GEV-5", { assembly: "lab-airflow@1", status: "overridden" }),
    row("SV-1", { cites: [cite("m.pdf#4", "SUPPLY VALVE SCHEDULE")] }),
    row("GEV-9", { cites: [cite("m.pdf#5", "GENERAL EXHAUST VALVE SCHEDULE")] }),
    row("GEV-1", { family: "FAN", compiled_family: "FAN" }),
    row("GEV-1", { layer: "hookup" }),
    row("(project)"),
  ];
  assert.deepEqual(unitsLike(units, units[0]).map((u) => u.tag), ["GEV-1", "GEV-2", "GEV-3"], "not an excluded row, one with another typical, another schedule or sheet, family or layer, or the project's");
  assert.deepEqual(unitsLike(units, units[4]).map((u) => u.tag), ["GEV-5"], "a row with its own typical is like those with the same one");
  assert.deepEqual(unitsLike(units, units[3]), [], "an excluded row is decided nothing for");
  assert.deepEqual(unitsLike(units, units[9]), [], "nor the project's own records");
});
