// ASSEMBLIES WP7.2 — the assemblies section of the takeoff report PDF
// (src/lib/assemblies/reportPdf.ts): drawn from the shared report, alone or after the
// takeoff tables; text the standard fonts cannot encode never breaks it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { applyAssemblies, type CompiledItem } from "../../src/lib/assemblies/apply.ts";
import { assembliesReport } from "../../src/lib/assemblies/report.ts";
import { assembliesPdfBytes } from "../../src/lib/assemblies/reportPdf.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { buildTakeoffPdfBytes } from "../../src/lib/agentTakeoff.js";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;
const item = (family: string, tag: string, i: number, title = `${family} SCHEDULE`): CompiledItem => ({ family, tag, sheet_id: "m.pdf#3", table_title: title, cells: { MARK: { text: tag, bbox: [i, 0, i + 1, 1] } } });
// Enough units to run past one page, and titles with characters WinAnsi lacks.
const items = Array.from({ length: 90 }, (_, i) => item("PUMP", `P-${i + 1}`, i, i === 0 ? "PUMP SCHEDULE → Δp ≥ 10" : undefined));
const applied = applyAssemblies({ project: { items }, library: LIB });
const report = assembliesReport(applied.instances, applied.applications, applied.lines);

test("the section alone: a real PDF, several pages for many units, stamped as OpenTakeoff's", async () => {
  const bytes = await assembliesPdfBytes(report, { projectName: "Test → project" });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString("latin1"), "%PDF-");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.ok(doc.getPageCount() >= 2, `${doc.getPageCount()} pages for ${report.units!.length} unit rows`);
  assert.equal(doc.getProducer(), "OpenTakeoff");
});

/** The text a PDF draws: its content streams inflated, hex strings decoded. */
function drawnText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try { out += inflateSync(Buffer.from(m[1], "latin1"), { finishFlush: 2 }).toString("latin1"); } catch { /* not a content stream */ }
  }
  return out.replace(/<([0-9A-Fa-f]+)>/g, (_, h: string) => Buffer.from(h, "hex").toString("latin1"));
}

test("partner-entered cost and labor: extended in the section and labelled, only when the partner's library has them", async () => {
  assert.equal(report.partner, null);
  assert.ok(!drawnText(await assembliesPdfBytes(report)).includes("Partner-entered"));
  // Hook-up components priced in a partner's copy of the library (the pumps' come from its parts).
  const priced = LIB.map((a) => ({ ...a, lines: a.lines.map((l) => (l.kind === "component" ? { ...l, partner: { unit_cost: 12.5, hours: 0.25, labor_category: "pipefitter" } } : l)) }));
  const two = applyAssemblies({ project: { items: items.slice(0, 2) }, library: priced });
  const r = assembliesReport(two.instances, two.applications, two.lines);
  assert.ok(r.partner && r.partner.label === "partner-entered" && r.partner.costed_lines > 0, JSON.stringify(r.partner));
  const shown = drawnText(await assembliesPdfBytes(r));
  assert.ok(shown.includes("Partner-entered cost and labor") && shown.includes(`Extended cost (partner-entered): ${r.partner.extended_cost}`), shown.slice(0, 400));
  assert.ok(shown.includes("pipefitter"));
});

test("the takeoff PDF carries the section after its tables when assemblies were applied", async () => {
  const without = await PDFDocument.load(await buildTakeoffPdfBytes([], { title: "Takeoff" }));
  const withSection = await PDFDocument.load(await buildTakeoffPdfBytes([], { title: "Takeoff", assembliesReport: report }));
  assert.ok(withSection.getPageCount() > without.getPageCount());
});
