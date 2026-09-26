import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { fillValveSizeTemplate, VALVE_SIZE_DOMAIN_VALUES, type ValveSizeRow } from "../src/lib/valveSizeTemplate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, "../public/templates/Valve_Size_Template_US_Global.xlsx");

async function loadTemplateBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(templatePath));
}

test("template asset exists and is the expected ValveTable workbook", async () => {
  const bytes = await loadTemplateBytes();
  const files = unzipSync(bytes);
  assert.ok(files["xl/worksheets/sheet1.xml"]);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.match(workbook, /name="ValveTable"/);
  assert.match(workbook, /name="DomainValues"/);
  assert.match(workbook, /name="Constants"/);
});

test("fills rows starting at row 6, one row per input, all 12 columns in order", async () => {
  const bytes = await loadTemplateBytes();
  const rows: ValveSizeRow[] = [
    {
      unitNo: "FCU-A7", location: "A", system: "SHHW", ports: "2-Way Normally closed", pnClass: "ANSI 125",
      lineSizeIn: 0.5, designFlowRateGpm: 1.1, consumerDpPsi: 5.5, branchDpPsi: 10, tolerancePct: 20,
      positioningSignal: "0...10 Vdc", operatingVoltage: "24 VAC",
    },
    { unitNo: "BCV-1", location: null, system: "SHHW", ports: "3-Way Mixing", pnClass: null,
      lineSizeIn: 2, designFlowRateGpm: 25, consumerDpPsi: null, branchDpPsi: null, tolerancePct: null,
      positioningSignal: null, operatingVoltage: null },
  ];
  const out = await fillValveSizeTemplate(bytes, rows);
  const files = unzipSync(out);
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);

  // row 6 — every column present, text as inline strings, numbers as <v>
  assert.match(xml, /<x:row r="6"[^>]*><x:c r="A6"[^>]*t="inlineStr"><x:is><x:t[^>]*>FCU-A7<\/x:t><\/x:is><\/x:c><x:c r="B6"[^>]*t="inlineStr"><x:is><x:t[^>]*>A<\/x:t><\/x:is><\/x:c><x:c r="C6"[^>]*t="inlineStr"><x:is><x:t[^>]*>SHHW<\/x:t><\/x:is><\/x:c><x:c r="D6"[^>]*t="inlineStr"><x:is><x:t[^>]*>2-Way Normally closed<\/x:t><\/x:is><\/x:c><x:c r="E6"[^>]*t="inlineStr"><x:is><x:t[^>]*>ANSI 125<\/x:t><\/x:is><\/x:c><x:c r="F6"[^>]*><x:v>0\.5<\/x:v><\/x:c><x:c r="G6"[^>]*><x:v>1\.1<\/x:v><\/x:c><x:c r="H6"[^>]*><x:v>5\.5<\/x:v><\/x:c><x:c r="I6"[^>]*><x:v>10<\/x:v><\/x:c><x:c r="J6"[^>]*><x:v>20<\/x:v><\/x:c><x:c r="K6"[^>]*t="inlineStr"><x:is><x:t[^>]*>0\.\.\.10 Vdc<\/x:t><\/x:is><\/x:c><x:c r="L6"[^>]*t="inlineStr"><x:is><x:t[^>]*>24 VAC<\/x:t><\/x:is><\/x:c><\/x:row>/);

  // row 7 — null/blank fields simply omitted, not empty cells
  assert.match(xml, /<x:row r="7"[^>]*>/);
  assert.doesNotMatch(xml, /<x:c r="B7"/);
  assert.doesNotMatch(xml, /<x:c r="E7"/);
  assert.match(xml, /<x:c r="A7"[^>]*t="inlineStr"><x:is><x:t[^>]*>BCV-1<\/x:t>/);
  assert.match(xml, /<x:c r="D7"[^>]*t="inlineStr"><x:is><x:t[^>]*>3-Way Mixing<\/x:t>/);
  assert.match(xml, /<x:c r="G7"[^>]*><x:v>25<\/x:v><\/x:c>/);

  // no row 8+ (only 2 input rows) and none of the original 1005 empty
  // placeholder rows survive
  assert.doesNotMatch(xml, /<x:row r="8"/);
  assert.doesNotMatch(xml, /<x:row r="200"/);
  assert.doesNotMatch(xml, /<x:row r="1010"/);

  // header rows 1-5 untouched
  assert.match(xml, /<x:row r="1"/);
  assert.match(xml, /<x:row r="5"/);

  // dimension widened correctly
  assert.match(xml, /<x:dimension ref="A1:L1010"\s*\/>/);

  // other parts carried through byte-identical
  const originalFiles = unzipSync(bytes);
  for (const part of ["xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/styles.xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "[Content_Types].xml"]) {
    assert.deepEqual(files[part], originalFiles[part], `${part} must be untouched`);
  }
});

test("empty row set still produces a valid, openable workbook with just the header", async () => {
  const bytes = await loadTemplateBytes();
  const out = await fillValveSizeTemplate(bytes, []);
  const files = unzipSync(out);
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.doesNotMatch(xml, /<x:row r="6"/);
  assert.match(xml, /<x:row r="5"/);
});

test("dimension widens past the template's 1010 pre-built rows for a large valve list", async () => {
  const bytes = await loadTemplateBytes();
  const rows: ValveSizeRow[] = Array.from({ length: 1100 }, (_, i) => ({ unitNo: `CV-${i + 1}` }));
  const out = await fillValveSizeTemplate(bytes, rows);
  const xml = strFromU8(unzipSync(out)["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /<x:dimension ref="A1:L1105"\s*\/>/); // 6 + 1100 - 1
  assert.match(xml, /<x:row r="1105"/);
});

test("text values are XML-escaped and never open a formula", async () => {
  const bytes = await loadTemplateBytes();
  const out = await fillValveSizeTemplate(bytes, [{ unitNo: '=HYPERLINK("https://invalid.test","x")<&>' }]);
  const xml = strFromU8(unzipSync(out)["xl/worksheets/sheet1.xml"]);
  assert.doesNotMatch(xml, /<x:f[ >]/);
  assert.match(xml, /t="inlineStr"/);
  assert.match(xml, /&amp;/);
  assert.match(xml, /&lt;/);
});

test("VALVE_SIZE_DOMAIN_VALUES strings are literally present in the template's own DomainValues sheet, not invented", async () => {
  const bytes = await loadTemplateBytes();
  const files = unzipSync(bytes);
  const domainXml = strFromU8(files["xl/worksheets/sheet2.xml"]);
  for (const list of Object.values(VALVE_SIZE_DOMAIN_VALUES)) {
    for (const value of list) assert.match(domainXml, new RegExp(`<x:v>${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/x:v>`), `"${value}" must appear verbatim in DomainValues`);
  }
});

test("split: a valve list longer than the dropdown range becomes several workbooks, each inside rows 6–200, every row once", async () => {
  const { valveSizeTemplateFiles, VALVE_SIZE_TEMPLATE_ROWS_PER_FILE, VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW, VALVE_SIZE_TEMPLATE_FILENAME } = await import("../src/lib/valveSizeTemplate.ts");
  assert.equal(VALVE_SIZE_TEMPLATE_ROWS_PER_FILE, VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW - 6 + 1);
  const bytes = await loadTemplateBytes();
  const row = (i: number): ValveSizeRow => ({ unitNo: `CV-${i}`, location: null, system: "SHHW", ports: null, pnClass: null,
    lineSizeIn: null, designFlowRateGpm: i, consumerDpPsi: null, branchDpPsi: null, tolerancePct: null, positioningSignal: null, operatingVoltage: null });
  const one = await valveSizeTemplateFiles(bytes, [row(1)]);
  assert.deepEqual(one.map((f) => [f.filename, f.rows]), [[VALVE_SIZE_TEMPLATE_FILENAME, 1]], "a list that fits keeps the template's own file name");
  const n = VALVE_SIZE_TEMPLATE_ROWS_PER_FILE * 2 + 3;
  const files = await valveSizeTemplateFiles(bytes, Array.from({ length: n }, (_, i) => row(i + 1)));
  assert.deepEqual(files.map((f) => f.filename), ["Valve_Size_Template_US_Global_part1of3.xlsx", "Valve_Size_Template_US_Global_part2of3.xlsx", "Valve_Size_Template_US_Global_part3of3.xlsx"]);
  assert.deepEqual(files.map((f) => f.rows), [VALVE_SIZE_TEMPLATE_ROWS_PER_FILE, VALVE_SIZE_TEMPLATE_ROWS_PER_FILE, 3]);
  const seen: string[] = [];
  for (const f of files) {
    const xml = strFromU8(unzipSync(f.bytes)["xl/worksheets/sheet1.xml"]);
    const rowNums = [...xml.matchAll(/<x:row r="(\d+)"/g)].map((m) => Number(m[1])).filter((r) => r >= 6);
    assert.ok(Math.max(...rowNums) <= VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW, `${f.filename} stays inside the dropdown range`);
    seen.push(...[...xml.matchAll(/<x:t xml:space="preserve">(CV-\d+)<\/x:t>/g)].map((m) => m[1]));
  }
  assert.equal(seen.length, n);
  assert.equal(new Set(seen).size, n, "every row exactly once");
});
