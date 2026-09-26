// ASSEMBLIES WP5.3 — the MCP surface of the apply path and its PARITY with
// the UI (goals/ASSEMBLIES.md WP5.3: "MCP and UI produce byte-identical
// ExpandedLines for the same inputs").
//
// The UI's path: the browser posts the plans to /__ot/assemblies-project,
// which runs production-graph-cli --mode assemblies_project, which calls
// sessionAssembliesProject (mcp/src/assemblies.ts); the project crosses the
// wire as JSON and the browser applies its library with applyAssemblies
// (web/src/lib/assemblies/apply.ts). The MCP path: apply_assemblies calls the
// same builder and the same applyAssemblies in-process. So the test builds
// the project once, sends it through JSON the way the wire does, applies it
// as the browser does, and requires the tool's records and lines to be the
// same bytes. A dev document (federal-mech, fixture D04) is the input.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../server.ts";
import { loadAssemblyLibrary, sessionAssembliesProject, sessionControlReadings, STARTER_FILES } from "../src/assemblies.ts";

// Control drawings are read deterministically here: no model is ever called
// from the tests (a configured key would otherwise make the tool read with
// the models by default).
process.env.OPENTAKEOFF_CONTROL_READINGS = "deterministic";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { assembliesReport } from "../../web/src/lib/assemblies/report.ts";
import { assembliesCsvSet } from "../../web/src/lib/assemblies/exportSet.ts";
import { libraryToCsv } from "../../web/src/lib/assemblies/libraryCsv.ts";
import { settingsWithPresets } from "../../web/src/lib/assemblies/presets.ts";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const D04 = resolve(CORPUS, "demos/D04-vav-scope-rollup");

// One call applies the whole library to a real 100+-row document. The SDK's
// 60 s default request timeout is a client default, not what these tests
// assert: PARITY once failed on it while the machine was loaded.
const TOOL_TIMEOUT = 10 * 60 * 1000;

async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT });
  assert.equal(res.content.length, 1);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text), structured: res.structuredContent };
}

test("library load: the starter by default, an assemblies file, a profile, a library CSV; a rejected record fails the call", async () => {
  const starter = await loadAssemblyLibrary();
  assert.equal(starter.library.length, 31 + 16, "US typicals v1 (31) and the hook-ups (16)");
  assert.match(starter.source, new RegExp(STARTER_FILES.join(", ")));
  const dir = await mkdtemp(join(tmpdir(), "ot-asm-lib-"));
  const one = starter.library.find((a) => a.id === "fcu");
  await writeFile(join(dir, "lib.json"), JSON.stringify({ assemblies: [one] }));
  await writeFile(join(dir, "array.json"), JSON.stringify([one]));
  await writeFile(join(dir, "profile.otprofile"), JSON.stringify({ schema: "opentakeoff.profile.v1", assembly_library: [{ id: "asm-duct-rect-default", family: "duct_rect" }, one] }));
  await writeFile(join(dir, "bad.json"), JSON.stringify({ assemblies: [{ ...one, id: "Bad Id" }] }));
  assert.deepEqual((await loadAssemblyLibrary(join(dir, "lib.json"))).library.map((a) => a.id), ["fcu"]);
  assert.deepEqual((await loadAssemblyLibrary(join(dir, "array.json"))).library.map((a) => a.id), ["fcu"]);
  assert.deepEqual((await loadAssemblyLibrary(join(dir, "profile.otprofile"))).library.map((a) => a.id), ["fcu"], "the linear record is not this library's");
  await assert.rejects(loadAssemblyLibrary(join(dir, "bad.json")), /library gate rejected 1 assembly/);
  await assert.rejects(loadAssemblyLibrary(join(dir, "missing.json")), /library_path/);
  // The panel's Library → Export CSV reads back as the same library; its problems by row and column.
  const csv = libraryToCsv(starter.library);
  await writeFile(join(dir, "library.csv"), csv);
  const fromCsv = await loadAssemblyLibrary(join(dir, "library.csv"));
  assert.match(fromCsv.source, /library CSV/);
  assert.equal(JSON.stringify(fromCsv.library), JSON.stringify(starter.library), "the library CSV is lossless");
  const [head, ...rows] = csv.split("\r\n");
  const rowTypeAt = head.split(",").indexOf("row_type");
  const broken = rows.map((r, i) => (i === 3 ? r.split(",").map((c, j) => (j === rowTypeAt ? "widget" : c)).join(",") : r));
  await writeFile(join(dir, "broken.csv"), [head, ...broken].join("\r\n"));
  await assert.rejects(loadAssemblyLibrary(join(dir, "broken.csv")), /broken\.csv: the library CSV has \d+ problems?: row 5 row_type/);
});

test("PARITY: apply_assemblies over MCP and the browser's apply of the wire project give byte-identical records and lines (federal-mech, D04)", { timeout: 20 * 60 * 1000 }, async () => {
  const { session } = await loadFixtureSession(CORPUS, D04);
  // The UI: the project over the wire (JSON), applied in the browser.
  const project = await sessionAssembliesProject(session);
  assert.ok(project.items.length > 100, `${project.items.length} compiled rows`);
  assert.ok(Object.keys(project.pages).length > 0, "the schedule pages' text spans ride with the project");
  const { library } = await loadAssemblyLibrary();
  // The CLI sends the control readings with the project (the same readers,
  // the same mode); the browser applies with them.
  const control_readings = await sessionControlReadings(session, { project, library }, "deterministic");
  const wire = JSON.parse(JSON.stringify({ ...project, control_readings }));
  const ui = applyAssemblies({ project: wire, library, readings: wire.control_readings });

  // MCP: the tool, through a real client/server pair.
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = buildServer(session);
  await server.connect(st);
  const client = new Client({ name: "parity", version: "0.0.0" });
  await client.connect(ct);
  const r = await call(client, "apply_assemblies", { detail: "lines" });
  assert.equal(r.isError, false, JSON.stringify(r.data).slice(0, 500));
  assert.equal(r.data.control.mode, "deterministic");
  assert.equal(r.data.control.units_read, control_readings.units.length, "the tool read the same units");
  assert.equal(JSON.stringify(r.data.lines), JSON.stringify(ui.lines), "ExpandedLines byte-identical");
  assert.equal(JSON.stringify(r.data.applications), JSON.stringify(ui.applications), "records byte-identical");
  assert.deepEqual(r.structured.lines.length, ui.lines.length, "structuredContent carries the same lines");
  assert.equal(JSON.stringify(r.data.report), JSON.stringify(assembliesReport(ui.instances, ui.applications, ui.lines)), "the report is the shared report");

  // The reply's shape: exceptions first, each naming what it waits for.
  assert.equal(r.data.report.exceptions.length, r.data.report.totals.by_status.unresolved);
  for (const e of r.data.report.exceptions) assert.ok(e.waits_for.length || e.candidates.length, `${e.tag} names what it waits for`);
  const vav = r.data.report.families.find((f) => f.family === "VAV");
  assert.ok(vav && vav.units >= 50, "the VAV family table");
  // Every unit's line cites its schedule row. A project assembly's lines
  // (building meters, a front-end) belong to the project, not to a row: they
  // carry their rule and no row cite.
  for (const l of ui.lines) {
    if (l.tag === "(project)") assert.ok(l.family === "project" && l.rule && l.cites.length === 0, `${l.rule}: a project line`);
    else assert.ok(l.cites.length && l.cites[0].sheet && l.cites[0].table_title, `${l.tag} ${l.rule} cites its row`);
  }
  assert.ok(ui.lines.some((l) => l.tag === "(project)"), "the project's own assemblies apply");
  // D6: this set's printed lists number their rows ("1", "2", …); the compile
  // reads that number as the served equipment, and a number names no unit.
  assert.ok(Array.isArray(project.printed_points));
  assert.equal(ui.instances.filter((i) => i.printed_points.length).length, 0);

  // The CSV set: export_dir writes the shared builder's bytes, the same the
  // browser's Download CSV set zips; for the whole project, whatever
  // `families` narrows the reply to.
  const dir = await mkdtemp(join(tmpdir(), "ot-asm-csv-"));
  const exported = await call(client, "apply_assemblies", { export_dir: dir, families: ["AHU"] });
  assert.equal(exported.isError, false, JSON.stringify(exported.data).slice(0, 300));
  const expected = assembliesCsvSet({ ...ui, report: assembliesReport(ui.instances, ui.applications, ui.lines) });
  assert.deepEqual([...exported.data.export_dir.files].sort(), [...Object.keys(expected), "assemblies.pdf"].sort());
  for (const [name, text] of Object.entries(expected)) assert.equal(await readFile(join(dir, name), "utf8"), text, `${name}: the browser builder's bytes`);
  // The report's PDF section, stamped as ours (so a re-export may replace it).
  const pdf = await readFile(join(dir, "assemblies.pdf"));
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  const { PDFDocument } = await import("pdf-lib");
  assert.equal((await PDFDocument.load(pdf, { updateMetadata: false })).getProducer(), "OpenTakeoff");
  assert.ok((await readFile(join(dir, "equipment.csv"), "utf8")).includes(",VAV,"), "every family, not only the reply's");
  // Re-exporting over our own files needs no overwrite; an unrelated file there is refused, and nothing is written.
  assert.equal((await call(client, "apply_assemblies", { export_dir: dir })).isError, false);
  await writeFile(join(dir, "points.csv"), "not,ours\r\n");
  const refused = await client.callTool({ name: "apply_assemblies", arguments: { export_dir: dir } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /points\.csv already exists and is not an OpenTakeoff export/);
  assert.equal(await readFile(join(dir, "points.csv"), "utf8"), "not,ours\r\n");

  // The starter's presets and a scope over MCP are the browser's: the same settings
  // (presets.ts) and the same scoped files.
  const scopedDir = await mkdtemp(join(tmpdir(), "ot-asm-csv-scope-"));
  const presets = { hookup_defaults: true, responsibility_preset: "valve-shipped-to-kit-maker" };
  const scoped = await call(client, "apply_assemblies", { export_dir: scopedDir, export_scope: "mechanical", settings: presets });
  assert.equal(scoped.isError, false, JSON.stringify(scoped.data).slice(0, 300));
  assert.equal(scoped.data.export_dir.scope, "mechanical");
  const uiPresets = applyAssemblies({ project: wire, library, readings: wire.control_readings, settings: settingsWithPresets({}, { hookupDefaults: true, responsibilityPreset: "valve-shipped-to-kit-maker" }) });
  const expectedScoped = assembliesCsvSet({ ...uiPresets, report: assembliesReport(uiPresets.instances, uiPresets.applications, uiPresets.lines), scope: "mechanical" });
  for (const [name, text] of Object.entries(expectedScoped)) assert.equal(await readFile(join(scopedDir, name), "utf8"), text, `${name}: mechanical scope under the presets`);
  assert.notEqual(expectedScoped["lines.csv"], expected["lines.csv"]);
  // export_scope narrows an export (so it needs export_dir); an unknown preset is refused.
  const refused2 = async (args) => {
    try { return !!(await client.callTool({ name: "apply_assemblies", arguments: args })).isError; } catch { return true; }
  };
  assert.equal(await refused2({ export_scope: "mechanical" }), true);
  assert.equal(await refused2({ settings: { responsibility_preset: "no-such-preset" } }), true);

  // summary (default) leaves units and lines out; families narrows the reply only.
  const s = await call(client, "apply_assemblies", {});
  assert.equal(s.data.report.units, undefined);
  assert.equal(s.data.lines, undefined);
  const only = await call(client, "apply_assemblies", { families: ["AHU"], detail: "units" });
  assert.ok(only.data.report.units.every((u) => u.family === "AHU"));
  const ahu = only.data.report.units.find((u) => u.tag === "AHU-1" && u.layer === "controls");
  assert.equal(ahu?.derived?.terminals_served?.rule, "derive.terminals_served.sole_air_handler", "derived against the whole project");

  // An override with a reason is a user choice on the record.
  const o = await call(client, "apply_assemblies", { detail: "units", families: ["AHU"], overrides: [{ tag: "AHU-1", layer: "controls", reason: "test", options: { ufc_minimum_points: true } }] });
  const oa = o.data.report.units.find((u) => u.tag === "AHU-1" && u.layer === "controls");
  assert.deepEqual(oa.options.ufc_minimum_points, { value: true, source: "user" });
  assert.equal(oa.assembly, ahu.assembly, "an option override keeps the rule's typical");
  await client.close();
});
