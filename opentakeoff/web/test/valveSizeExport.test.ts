import test from "node:test";
import assert from "node:assert/strict";
import {
  buildValveSizeExport, parseCleanNumber, parseLineSizeInches, mapPorts, mapSystem,
  mapPositioningSignal, computeConsumerDpPsi, HYDRONIC_CONTROL_VALVE_FAMILIES,
} from "../src/lib/valveSizeExport.ts";

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

test("mapPositioningSignal: analog modulating and floating map, everything else refuses", () => {
  assert.equal(mapPositioningSignal("0-10VDC", null), "0...10 Vdc");
  assert.equal(mapPositioningSignal("2-10 V", null), "0...10 Vdc");
  assert.equal(mapPositioningSignal("FLOATING", null), "Floating control");
  assert.equal(mapPositioningSignal(null, "MODULATING ACTUATOR"), "0...10 Vdc");
  assert.equal(mapPositioningSignal(null, "FLOATING ACTUATOR"), "Floating control");
  assert.equal(mapPositioningSignal("4-20mA", null), null);
  assert.equal(mapPositioningSignal("TWO POSITION", null), null);
  assert.equal(mapPositioningSignal(null, null), null);
});

test("computeConsumerDpPsi: (GPM/Cv)^2, refuses on missing/zero/negative", () => {
  assert.equal(computeConsumerDpPsi(25, 5), 25);
  assert.equal(computeConsumerDpPsi(9, 3), 9);
  assert.equal(computeConsumerDpPsi(null, 5), null);
  assert.equal(computeConsumerDpPsi(25, null), null);
  assert.equal(computeConsumerDpPsi(25, 0), null);
  assert.equal(computeConsumerDpPsi(25, -1), null);
  assert.equal(computeConsumerDpPsi(-1, 5), null);
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
  assert.equal(row.consumerDpPsi, 2.25); // (9/6)^2
  assert.equal(row.branchDpPsi, null);
  assert.equal(row.tolerancePct, null);
  assert.equal(row.positioningSignal, null); // no control-signal/actuator cell printed
  assert.equal(row.operatingVoltage, null); // only defaults alongside a resolved positioning signal
  assert.deepEqual(result.coverage.unitNo, { filled: 1, total: 1 });
  assert.deepEqual(result.coverage.pnClass, { filled: 0, total: 1 });
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
  const disabled = buildValveSizeExport(src, { fillOperatingVoltageDefault: false });
  assert.equal(disabled.rows.every((r) => r.operatingVoltage === null), true);
});

test("toleranceOverridePct applies uniformly only when explicitly passed", () => {
  const src = compiled({ HHW_CONTROL_VALVE: { items: [item("CV-4", {})] } });
  assert.equal(buildValveSizeExport(src).rows[0].tolerancePct, null);
  assert.equal(buildValveSizeExport(src, { toleranceOverridePct: 20 }).rows[0].tolerancePct, 20);
});

test("deriveConsumerDpFromCv:false leaves Consumer Δp blank even with clean GPM/Cv", () => {
  const src = compiled({ HHW_CONTROL_VALVE: { items: [item("CV-5", { GPM: cell("9"), Cv: cell("6") })] } });
  assert.equal(buildValveSizeExport(src, { deriveConsumerDpFromCv: false }).rows[0].consumerDpPsi, null);
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
