import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildValveSizeExport, parseCleanNumber, parseLineSizeInches, mapPorts, mapSystem,
  mapPositioningSignal, resolvePositioningSignal, computeValveDpPsi, HYDRONIC_CONTROL_VALVE_FAMILIES,
  HIT_TOLERANCE_PCT_VALUES,
} from "../src/lib/valveSizeExport.ts";
import { fillValveSizeTemplate } from "../src/lib/valveSizeTemplate.ts";

const cell = (text: string) => ({ text, bbox: [0, 0, 1, 1] });
const item = (tag: string, cells: Record<string, { text: string }>, extra: Record<string, unknown> = {}) => ({
  tag, description: `Serves ${tag}`, building: extra.building ?? null, sheet_id: "plan.pdf#1",
  table_title: extra.table_title ?? null, cells,
});
const compiled = (categories: Record<string, { items: unknown[] }>) => ({ kind: "control_valves", categories });

test("parseCleanNumber: clean, unit-suffixed, and ambiguous compound cells", () => {
  assert.equal(parseCleanNumber("25"), 25);
  assert.equal(parseCleanNumber("2.7"), 2.7);
  assert.equal(parseCleanNumber("25 GPM"), 25);
  assert.equal(parseCleanNumber("(2.7)"), 2.7);
  assert.equal(parseCleanNumber(null), null);
  assert.equal(parseCleanNumber(""), null);
  // real found-live bug shape from sheetgraph.ts's own comments — multiple
  // numbers bled into one cell must never silently pick one
  assert.equal(parseCleanNumber("100% WATER 25 19-110 2.7 INDEPENDENT MODULATING"), null);
  assert.equal(parseCleanNumber("1,250"), 1250);
});

test("parseLineSizeInches: fractions, mixed numbers, decimals, inch marks", () => {
  assert.equal(parseLineSizeInches("3/4"), 0.75);
  assert.equal(parseLineSizeInches("1-1/4"), 1.25);
  assert.equal(parseLineSizeInches("1 1/4"), 1.25);
  assert.equal(parseLineSizeInches("2"), 2);
  assert.equal(parseLineSizeInches("2\""), 2);
  assert.equal(parseLineSizeInches("0.75"), 0.75);
  assert.equal(parseLineSizeInches(null), null);
  assert.equal(parseLineSizeInches("VARIES"), null);
});

test("mapPorts: 3-way resolves alone; 2-way needs fail position for NC/NO", () => {
  assert.equal(mapPorts("3-WAY", null), "3-Way Mixing");
  assert.equal(mapPorts("3 WAY", "anything"), "3-Way Mixing");
  assert.equal(mapPorts("2-WAY", "N.C."), "2-Way Normally closed");
  assert.equal(mapPorts("2 WAY", "FAIL CLOSED"), "2-Way Normally closed");
  assert.equal(mapPorts("2-WAY", "N.O."), "2-Way Normally open");
  assert.equal(mapPorts("2-WAY", "FAIL OPEN"), "2-Way Normally open");
  assert.equal(mapPorts("2-WAY", null), null); // no fail position — refuse, don't guess
  assert.equal(mapPorts(null, "N.C."), null);
});

test("mapSystem: CHW/HHW/STEAM with the caller's primary/secondary tier", () => {
  assert.equal(mapSystem("CHW", "secondary"), "SCHW");
  assert.equal(mapSystem("CHW", "primary"), "PCHW");
  assert.equal(mapSystem("HHW", "secondary"), "SHHW");
  assert.equal(mapSystem("HHW", "primary"), "PHHW");
  assert.equal(mapSystem("HOT WATER REHEAT CONTROL VALVE SCHEDULE", "secondary"), "SHHW");
  assert.equal(mapSystem("STEAM", "secondary"), "STEAM");
  assert.equal(mapSystem(null, "secondary"), null);
  assert.equal(mapSystem("CONDENSATE", "secondary"), null);
});

test("mapPositioningSignal: only a printed 0-10 V or floating signal maps", () => {
  // printed 0–10 V, in the spellings schedules use
  for (const printed of ["0-10VDC", "0-10 V", "0 - 10 VDC", "0–10 Vdc", "0 TO 10 VDC", "0...10 Vdc", "MODULATING (0-10V)", "0-10 VOLTS"]) {
    assert.equal(mapPositioningSignal(printed, null), "0...10 Vdc", printed);
  }
  // printed floating — also written tri-state / 3-point
  for (const printed of ["FLOATING", "FLOAT", "TRI-STATE", "3-POINT FLOATING", "THREE POINT"]) {
    assert.equal(mapPositioningSignal(printed, null), "Floating control", printed);
  }
  // any other printed signal is not one of the template's two options
  for (const printed of ["2-10 V", "2-10VDC", "4-20mA", "3-15 PSI", "0-5 VDC", "TWO POSITION", "2-POSITION", "ON/OFF", "MODULATING", "DDC"]) {
    assert.equal(mapPositioningSignal(printed, null), null, printed);
  }
  // an actuator described only as modulating names no signal type — never defaulted
  assert.equal(mapPositioningSignal(null, "MODULATING ACTUATOR"), null);
  assert.equal(mapPositioningSignal(null, "ELECTRIC MODULATING"), null);
  // an Actuator cell that spells the signal out is printed evidence
  assert.equal(mapPositioningSignal(null, "FLOATING ACTUATOR"), "Floating control");
  assert.equal(mapPositioningSignal(null, "ELECTRIC, 0-10VDC"), "0...10 Vdc");
  assert.equal(mapPositioningSignal(null, null), null);
});

test("resolvePositioningSignal: the Control signal cell decides alone, and every blank says why", () => {
  assert.deepEqual(resolvePositioningSignal("0-10VDC", "FLOATING"),
    { value: "0...10 Vdc", header: "Control signal", printed: "0-10VDC", blankReason: null });
  // a printed but unrepresentable control signal is not overridden by the actuator cell
  assert.deepEqual(resolvePositioningSignal("2-10 VDC", "0-10V"),
    { value: null, header: "Control signal", printed: "2-10 VDC", blankReason: "not_representable" });
  assert.deepEqual(resolvePositioningSignal(null, "FLOATING ACTUATOR"),
    { value: "Floating control", header: "Actuator", printed: "FLOATING ACTUATOR", blankReason: null });
  assert.deepEqual(resolvePositioningSignal(null, "MODULATING ACTUATOR"),
    { value: null, header: "Actuator", printed: "MODULATING ACTUATOR", blankReason: "actuator_names_no_signal" });
  assert.deepEqual(resolvePositioningSignal(null, "4-20 MA"),
    { value: null, header: "Actuator", printed: "4-20 MA", blankReason: "not_representable" });
  // more than one signal type printed — picking one would be a guess
  assert.equal(resolvePositioningSignal("0-10V OR 4-20MA", null).blankReason, "multiple_signals_printed");
  assert.equal(resolvePositioningSignal("FLOATING OR 0-10VDC", null).blankReason, "multiple_signals_printed");
  assert.equal(resolvePositioningSignal("0-10V OR 4-20MA", null).value, null);
  assert.deepEqual(resolvePositioningSignal("  ", null),
    { value: null, header: null, printed: null, blankReason: "no_signal_printed" });
  // numbers that are not a signal range never read as one
  assert.equal(resolvePositioningSignal(null, "1-1/4\" 24VAC").blankReason, "actuator_names_no_signal");
  assert.equal(resolvePositioningSignal("10-10V", null).value, null);
});

test("computeValveDpPsi: (GPM/Cv)^2, refuses on missing/zero/negative", () => {
  assert.equal(computeValveDpPsi(25, 5), 25);
  assert.equal(computeValveDpPsi(9, 3), 9);
  assert.equal(computeValveDpPsi(null, 5), null);
  assert.equal(computeValveDpPsi(25, null), null);
  assert.equal(computeValveDpPsi(25, 0), null);
  assert.equal(computeValveDpPsi(25, -1), null);
  assert.equal(computeValveDpPsi(-1, 5), null);
});

test("buildValveSizeExport: end-to-end row shape matches the D06/T-VALVE-01 golden CV-1 case", () => {
  const result = buildValveSizeExport(compiled({
    HHW_CONTROL_VALVE: {
      items: [
        item("CV-1", {
          "Unit Mark": cell("HC-1"), Size: cell("1-1/4"), GPM: cell("9"), Cv: cell("6"),
          Configuration: cell("2-WAY"), "Fail position": cell("N.C."), Service: cell("HHW"),
        }, { building: "A" }),
      ],
    },
  }));
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.equal(row.unitNo, "HC-1");
  assert.equal(row.location, "A");
  assert.equal(row.system, "SHHW");
  assert.equal(row.ports, "2-Way Normally closed");
  assert.equal(row.pnClass, null);
  assert.equal(row.lineSizeIn, 1.25);
  assert.equal(row.designFlowRateGpm, 9);
  // Column H is CoilDP (the coil's drop): blank. The valve's own (9/6)^2 is
  // reported, never written.
  assert.equal(row.consumerDpPsi, null);
  assert.equal(row._derived.valveDpPsi, 2.25);
  assert.equal(row.branchDpPsi, null);
  assert.equal(row.tolerancePct, null);
  assert.equal(row.positioningSignal, null); // no control-signal/actuator cell printed
  assert.equal(row.operatingVoltage, null); // only defaults alongside a resolved positioning signal
  assert.deepEqual(row._derived.positioningSignal, { value: null, header: null, printed: null, blankReason: "no_signal_printed" });
  assert.deepEqual(result.coverage.unitNo, { filled: 1, total: 1 });
  assert.deepEqual(result.coverage.pnClass, { filled: 0, total: 1 });
  assert.deepEqual(result.coverage.consumerDpPsi, { filled: 0, total: 1 });
  assert.ok(result.notes.some((n) => /Valve Δp \(derived\).*computed for 1 of 1 row/.test(n)), "notes report the derived valve Δp");
  assert.ok(result.notes.some((n) => /Consumer Δp \(column H\) is always blank.*CoilDP/.test(n)), "notes say why column H is blank");
});

test("excludes non-hydronic families by default and reports why", () => {
  const result = buildValveSizeExport(compiled({
    CHW_CONTROL_VALVE: { items: [item("CV-CHW-1", { GPM: cell("10") })] },
    ISOLATION_VALVE: { items: [item("ISO-1", {})] },
    CONTROL_DAMPER: { items: [item("CD-1", {}), item("CD-2", {})] },
  }));
  assert.equal(result.rows.length, 1);
  assert.equal(result.sourceItemCount, 1);
  const families = result.excludedFamilies.map((f) => f.family).sort();
  assert.deepEqual(families, ["CONTROL_DAMPER", "ISOLATION_VALVE"]);
  const damper = result.excludedFamilies.find((f) => f.family === "CONTROL_DAMPER")!;
  assert.equal(damper.count, 2);
  assert.match(damper.reason, /air-side/);
});

test("operatingVoltage only defaults alongside a resolved positioningSignal; fillOperatingVoltageDefault:false disables it", () => {
  const src = compiled({
    HHW_CONTROL_VALVE: {
      items: [
        item("CV-2", { "Control signal": cell("0-10VDC") }),
        item("CV-3", {}),
      ],
    },
  });
  const withDefault = buildValveSizeExport(src);
  assert.equal(withDefault.rows.find((r) => r.unitNo === "CV-2")!.operatingVoltage, "24 VAC");
  assert.equal(withDefault.rows.find((r) => r.unitNo === "CV-3")!.operatingVoltage, null);
  // an unrepresentable printed signal writes neither column
  const twoToTen = buildValveSizeExport(compiled({ HHW_CONTROL_VALVE: { items: [item("CV-6", { "Control signal": cell("2-10VDC") })] } }));
  assert.equal(twoToTen.rows[0].positioningSignal, null);
  assert.equal(twoToTen.rows[0].operatingVoltage, null);
  const disabled = buildValveSizeExport(src, { fillOperatingVoltageDefault: false });
  assert.equal(disabled.rows.every((r) => r.operatingVoltage === null), true);
});

test("toleranceOverridePct applies uniformly only when explicitly passed, and only from the template's list", () => {
  const src = compiled({ HHW_CONTROL_VALVE: { items: [item("CV-4", {})] } });
  assert.equal(buildValveSizeExport(src).rows[0].tolerancePct, null);
  assert.equal(buildValveSizeExport(src, { toleranceOverridePct: null }).rows[0].tolerancePct, null);
  assert.deepEqual([...HIT_TOLERANCE_PCT_VALUES], [10, 20, 30, 40, 50]);
  for (const pct of HIT_TOLERANCE_PCT_VALUES) {
    assert.equal(buildValveSizeExport(src, { toleranceOverridePct: pct }).rows[0].tolerancePct, pct);
  }
  // anything else is refused with a message, never written
  for (const bad of [25, 0, 5, 60, 100, 20.5, Number.NaN, "20" as unknown as number]) {
    assert.throws(() => buildValveSizeExport(src, { toleranceOverridePct: bad }),
      (e: Error) => e instanceof RangeError && /one of 10, 20, 30, 40, 50/.test(e.message), String(bad));
  }
});

test("Consumer Δp (column H, CoilDP) is never filled, even with clean GPM/Cv — the valve Δp is reported only", async () => {
  const src = compiled({ HHW_CONTROL_VALVE: { items: [item("CV-5", { GPM: cell("9"), Cv: cell("6"), "Control signal": cell("0-10VDC") })] } });
  const result = buildValveSizeExport(src);
  assert.equal(result.rows[0].consumerDpPsi, null);
  assert.equal(result.rows[0]._derived.valveDpPsi, 2.25);
  // and the derived value cannot reach the workbook through the row object
  const here = dirname(fileURLToPath(import.meta.url));
  const template = new Uint8Array(await readFile(resolve(here, "../public/templates/Valve_Size_Template_US_Global.xlsx")));
  const xml = strFromU8(unzipSync(await fillValveSizeTemplate(template, result.rows))["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /<x:c r="G6"[^>]*><x:v>9<\/x:v><\/x:c>/);
  assert.doesNotMatch(xml, /<x:c r="H6"/);
  assert.doesNotMatch(xml, /2\.25/);
  assert.match(xml, /<x:c r="K6"[^>]*t="inlineStr"><x:is><x:t[^>]*>0\.\.\.10 Vdc<\/x:t>/);
});

test("notes disclose every blank Positioning Signal with the printed text", () => {
  const result = buildValveSizeExport(compiled({
    HHW_CONTROL_VALVE: {
      items: [
        item("CV-7", { "Control signal": cell("2-10 VDC") }),
        item("CV-8", { "Control signal": cell("2-10 VDC") }),
        item("CV-9", { "Control signal": cell("4-20mA") }),
        item("CV-10", { Actuator: cell("MODULATING") }),
        item("CV-11", { Actuator: cell("FLOATING") }),
        item("CV-12", { "Control signal": cell("0-10V OR 4-20MA") }),
        item("CV-13", {}),
      ],
    },
  }));
  const note = result.notes.find((n) => n.startsWith("Positioning Signal comes only from printed signal text"));
  assert.ok(note, "positioning-signal note present");
  assert.match(note!, /0 from a Control signal cell/);
  assert.match(note!, /1 from an Actuator cell that names the signal type/);
  assert.match(note!, /3 blank because the printed signal is not one of the template's two options \("2-10 VDC" ×2, "4-20mA" ×1\)/);
  assert.match(note!, /1 blank because the printed text names more than one signal type \("0-10V OR 4-20MA" ×1\)/);
  assert.match(note!, /1 blank because the Actuator cell names no signal type \("MODULATING" ×1\)/);
  assert.match(note!, /1 blank with no signal printed/);
  assert.equal(result.rows.filter((r) => r.positioningSignal).length, 1);
  assert.deepEqual(result.coverage.positioningSignal, { filled: 1, total: 7 });
});

test("default family scope is exactly the hydronic control-valve families", () => {
  assert.deepEqual(HYDRONIC_CONTROL_VALVE_FAMILIES, ["CHW_CONTROL_VALVE", "HHW_CONTROL_VALVE", "BYPASS_CONTROL_VALVE", "MIXING_VALVE"]);
});

test("falls back to the valve's own tag as unitNo only when no served-equipment mark exists", () => {
  const src = compiled({ HHW_CONTROL_VALVE: { items: [item("CV-CH-H-MT-1", {})] } });
  assert.equal(buildValveSizeExport(src).rows[0].unitNo, "CV-CH-H-MT-1");
});

test("empty compile produces zero rows, not an error", () => {
  const result = buildValveSizeExport({ kind: "control_valves", categories: {} });
  assert.deepEqual(result.rows, []);
  assert.equal(result.sourceItemCount, 0);
});
