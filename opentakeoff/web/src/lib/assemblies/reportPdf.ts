// ASSEMBLIES goal, WP7.2 — the assemblies section of the takeoff report PDF
// (plan §8.7): a summary, the exceptions first, a table per family, and a
// row per unit with the schedule row it cites. When the partner's library
// carries its own cost and labor fields, their extension, labelled
// "partner-entered" (WP9, decision D14).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The section is drawn from the
// shared report (report.ts) by this one function; the Takeoff panel's PDF
// appends it, and apply_assemblies' export_dir writes it as assemblies.pdf.
// Neither surface lays out a row of its own.
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import type { AssembliesReport } from "./report";

const W = 792;
const H = 612;
const M = 28;
const ROW = 11;

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  rgb: (r: number, g: number, b: number) => ReturnType<typeof import("pdf-lib").rgb>;
  page: PDFPage;
  y: number;
}

function clip(font: PDFFont, text: unknown, maxW: number, size: number): string {
  // The standard fonts encode WinAnsi only: anything else prints as "?".
  const s = String(text ?? "").replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  let out = s;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function ensure(c: Ctx, need: number) {
  if (c.y < M + need) {
    c.page = c.doc.addPage([W, H]);
    c.y = H - M;
  }
}

function text(c: Ctx, s: string, size: number, bold = false, color = 0.12) {
  ensure(c, size + 4);
  c.page.drawText(clip(bold ? c.bold : c.font, s, W - 2 * M, size), { x: M, y: c.y, size, font: bold ? c.bold : c.font, color: c.rgb(color, color, color + 0.04) });
  c.y -= size + 4;
}

/** A table: a bold header row, then rows; widths are fractions of the page. */
function table(c: Ctx, headers: string[], widths: number[], rows: unknown[][]) {
  const usable = W - 2 * M;
  const px = widths.map((w) => w * usable);
  const drawHeader = () => {
    let x = M;
    headers.forEach((h, i) => { c.page.drawText(clip(c.bold, h, px[i] - 3, 7), { x, y: c.y, size: 7, font: c.bold, color: c.rgb(0.2, 0.2, 0.25) }); x += px[i]; });
    c.y -= 8;
    c.page.drawLine({ start: { x: M, y: c.y }, end: { x: W - M, y: c.y }, thickness: 0.5, color: c.rgb(0.75, 0.75, 0.78) });
    c.y -= 9;
  };
  ensure(c, 30);
  drawHeader();
  for (const r of rows) {
    if (c.y < M + ROW) { ensure(c, ROW + 20); drawHeader(); }
    let x = M;
    r.forEach((v, i) => { c.page.drawText(clip(c.font, v, px[i] - 3, 7.5), { x, y: c.y, size: 7.5, font: c.font, color: c.rgb(0.12, 0.12, 0.16) }); x += px[i]; });
    c.y -= ROW;
  }
  c.y -= 8;
}

const cite = (u: { cites: Array<{ sheet: string; table_title: string }> }) => (u.cites[0] ? `${u.cites[0].sheet} · ${u.cites[0].table_title}` : "");

/** Draw the assemblies section onto `doc`, starting a new page. */
export async function drawAssembliesSection(doc: PDFDocument, report: AssembliesReport, opts: { projectName?: string } = {}): Promise<void> {
  const { StandardFonts, rgb } = await import("pdf-lib");
  const c: Ctx = {
    doc, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), rgb,
    page: doc.addPage([W, H]), y: H - M,
  };
  const t = report.totals;
  text(c, "Controls assemblies", 13, true);
  if (opts.projectName) text(c, opts.projectName, 9, false, 0.35);
  text(c, `${t.units} units · ${t.records} records: ${t.by_status.ok ?? 0} ok, ${t.by_status.overridden ?? 0} overridden, ${t.by_status.unresolved ?? 0} unresolved, ${t.by_status.no_assembly ?? 0} without a typical, ${t.by_status.excluded ?? 0} excluded`, 8.5, false, 0.3);
  text(c, `${t.lines} lines: ${t.lines_by_status.ok ?? 0} ok, ${t.lines_by_status.unresolved ?? 0} unresolved, ${t.lines_by_status.replaced ?? 0} replaced by drawing evidence, ${t.lines_by_status.error ?? 0} errors. Every line cites its schedule row and its library rule; nothing is guessed.`, 8.5, false, 0.3);
  c.y -= 6;

  text(c, report.exceptions.length ? `Exceptions first: ${report.exceptions.length} record(s) wait for something` : "Exceptions: none", 10, true);
  if (report.exceptions.length) {
    table(c, ["Unit", "Family", "Layer", "Waits for", "Candidates", "Schedule row"], [0.1, 0.12, 0.07, 0.29, 0.18, 0.24],
      report.exceptions.map((e) => [e.tag, e.family, e.layer, e.waits_for.join(", ") || "—", e.candidates.join(", ") || "—", cite(e)]));
  }

  text(c, "By family", 10, true);
  table(c, ["Family", "Units", "Typicals", "Unresolved", "No typical", "Lines"], [0.16, 0.07, 0.47, 0.1, 0.1, 0.1],
    report.families.map((f) => [f.family, f.units, Object.entries(f.assemblies).map(([a, n]) => `${a} ×${n}`).join(", ") || "—",
      f.by_status.unresolved ?? 0, f.by_status.no_assembly ?? 0, Object.values(f.lines).reduce((a, b) => a + b, 0)]));

  if (report.partner) {
    const p = report.partner;
    text(c, "Partner-entered cost and labor", 10, true);
    text(c, "Partner-entered: the partner's own figures from their library, extended by each line's quantity. OpenTakeoff ships no prices, rates or hours.", 8, false, 0.3);
    text(c, `${p.lines} line(s) carry partner fields; ${p.costed_lines} extended to a cost${p.not_extended ? `; ${p.not_extended} not extended (quantity unresolved, or replaced by drawing evidence)` : ""}.`, 8, false, 0.3);
    text(c, `Extended cost (partner-entered): ${p.extended_cost ?? "none"}`, 9, true);
    if (p.hours.length) {
      table(c, ["Labor category (partner-entered)", "Extended hours", "Lines"], [0.5, 0.25, 0.25],
        p.hours.map((h) => [h.labor_category || "(none named)", h.extended_hours, h.lines]));
    }
  }

  if (report.units) {
    text(c, "Units", 10, true);
    table(c, ["Unit", "Family", "Layer", "Typical", "Status", "Lines", "Printed points", "Schedule row"], [0.1, 0.12, 0.07, 0.17, 0.09, 0.06, 0.12, 0.27],
      report.units.map((u) => [u.tag, u.family, u.layer, u.assembly ?? "—", u.status, Object.values(u.lines).reduce((a, b) => a + b, 0),
        u.printed_points ? `${u.printed_points.rows} rows` : "—", cite(u)]));
  }
}

/** The section alone, as a PDF (apply_assemblies' export_dir writes it). */
export async function assembliesPdfBytes(report: AssembliesReport, opts: { projectName?: string } = {}): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setProducer("OpenTakeoff");
  doc.setTitle("Controls assemblies");
  await drawAssembliesSection(doc, report, opts);
  return doc.save();
}
