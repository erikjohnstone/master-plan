// Agent → Takeoff Data handoff.
// Structured quantities/schedule fields from any agent workflow land here so
// the chat stays conversational while the Takeoff UI aggregates exportable rows.

import { csvEsc as esc } from "./csv.js";
import { downloadText } from "./totals.js";
import { buildXlsx } from "./xlsx.js";

let _seq = 0;
const nextId = () => `at-${Date.now().toString(36)}-${(++_seq).toString(36)}`;

const asBbox = (bbox) => {
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) return bbox;
  if (bbox && typeof bbox === "object") {
    const { x0, y0, x1, y1 } = bbox;
    if ([x0, y0, x1, y1].every((n) => Number.isFinite(n))) return [x0, y0, x1, y1];
  }
  return null;
};

const cellText = (cell) => {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  if (typeof cell.text === "string") return cell.text;
  return String(cell.value ?? "");
};

/** Build one takeoff row. */
export function makeTakeoffRow({
  workflow = "",
  runId = null,
  tag = null,
  field,
  value,
  unit = null,
  sheet_id = null,
  table_title = null,
  column = null,
  bbox_px = null,
  source_tool = null,
  note = null,
} = {}) {
  return {
    id: nextId(),
    created_at: Date.now(),
    run_id: runId,
    workflow: String(workflow || "").slice(0, 240),
    tag: tag != null && String(tag).trim() !== "" ? String(tag).trim() : null,
    field: String(field || "value").trim() || "value",
    value: typeof value === "number" && Number.isFinite(value) ? value : String(value ?? "").trim(),
    unit: unit != null && String(unit).trim() !== "" ? String(unit).trim() : null,
    sheet_id: sheet_id || null,
    table_title: table_title || null,
    column: column || null,
    bbox_px: asBbox(bbox_px),
    source_tool: source_tool || null,
    note: note || null,
  };
}

/** Extract structured rows from a completed agent tool call. */
export function rowsFromToolResult(name, args = {}, result = {}, meta = {}) {
  const rows = [];
  const workflow = meta.workflow || "";
  const runId = meta.runId || null;
  const data = result && typeof result === "object" && !result.error ? result : null;
  if (!data) return rows;

  if (name === "query_table") {
    const title = data.matches?.[0]?.title || args.title || null;
    for (const match of data.matches || []) {
      const key = match.row?.key || match.row?.identity?.text || args.row_key || null;
      const cells = match.row?.all_cells || match.row?.cells || {};
      // Prefer scoped column lookups; otherwise emit identity + a few fields.
      if (args.column && cells[args.column]) {
        const cell = cells[args.column];
        rows.push(makeTakeoffRow({
          workflow, runId, tag: key, field: args.column, value: cellText(cell),
          sheet_id: match.sheet, table_title: match.title || title,
          column: args.column, bbox_px: cell?.bbox, source_tool: name,
        }));
        continue;
      }
      if (key) {
        const idCell = match.row?.identity || cells.MARK || cells.TAG || cells.SYMBOL;
        rows.push(makeTakeoffRow({
          workflow, runId, tag: key, field: "MARK", value: key,
          sheet_id: match.sheet, table_title: match.title || title,
          column: match.row?.identity?.header || "MARK",
          bbox_px: idCell?.bbox, source_tool: name,
        }));
      }
      if (typeof data.count === "number" && !args.row_key) {
        rows.push(makeTakeoffRow({
          workflow, runId, tag: null, field: "schedule_count", value: data.count,
          sheet_id: match.sheet, table_title: match.title || title,
          source_tool: name, note: "query_table count",
        }));
        break;
      }
    }
    if (typeof data.count === "number" && !(data.matches || []).length) {
      rows.push(makeTakeoffRow({
        workflow, runId, field: "schedule_count", value: data.count,
        table_title: args.title || null, source_tool: name,
      }));
    }
  }

  if (name === "sweep_schedule_row") {
    const tag = data.tag || args.tag || null;
    if (typeof data.found === "number") {
      rows.push(makeTakeoffRow({
        workflow, runId, tag, field: "installed_quantity", value: data.found, unit: "EA",
        sheet_id: data.tag_citations?.[0]?.sheet || data.anchor?.sheet || null,
        table_title: data.row?.table || null,
        bbox_px: data.tag_citations?.[0]?.bbox || null,
        source_tool: name,
      }));
    }
    const cells = data.row?.cells || {};
    for (const [header, text] of Object.entries(cells)) {
      if (!text || header === "MARK" || header === "TAG" || header === "SYMBOL") continue;
      const cite = data.row?.cell_citations?.[header];
      rows.push(makeTakeoffRow({
        workflow, runId, tag, field: header, value: text,
        sheet_id: data.row?.sheet || null, table_title: data.row?.table || null,
        column: header, bbox_px: cite?.bbox || null, source_tool: name,
      }));
    }
  }

  if (name === "count_marks" && typeof data.found === "number") {
    rows.push(makeTakeoffRow({
      workflow, runId, tag: args.marks?.[0] || null, field: "mark_count",
      value: data.found, unit: "EA", source_tool: name,
    }));
  }

  if (name === "takeoff_summary" || name === "project_takeoff") {
    for (const item of data.items || data.equipment || []) {
      const tag = item.tag || item.mark || item.id || null;
      const qty = item.quantity ?? item.qty ?? item.found;
      if (tag != null && qty != null) {
        rows.push(makeTakeoffRow({
          workflow, runId, tag, field: "quantity", value: qty, unit: item.unit || "EA",
          sheet_id: item.schedule_sheet || item.sheet || null,
          table_title: item.schedule_title || item.table || null,
          source_tool: name, note: item.type || item.status || null,
        }));
      }
    }
    if (typeof data.total === "number") {
      rows.push(makeTakeoffRow({
        workflow, runId, field: "project_total", value: data.total,
        source_tool: name,
      }));
    }
  }

  return rows;
}

/** Parse markdown pipe-tables from an agent answer into takeoff rows. */
export function rowsFromAnswerMarkdown(text, meta = {}) {
  const rows = [];
  const lines = String(text || "").split(/\n/);
  let headers = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!/^\|/.test(line)) {
      headers = null;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if (!headers) {
      headers = cells;
      continue;
    }
    if (headers.length < 2) continue;
    // Heuristic: first column is often Tag/Mark; remaining are fields.
    const tagHeader = headers[0];
    const tag = /tag|mark|symbol|equipment/i.test(tagHeader) ? cells[0] : null;
    for (let i = tag ? 1 : 0; i < headers.length; i++) {
      const field = headers[i] || `col_${i}`;
      const value = cells[i] ?? "";
      if (!String(value).trim()) continue;
      rows.push(makeTakeoffRow({
        workflow: meta.workflow, runId: meta.runId,
        tag, field, value, source_tool: "answer_table",
      }));
    }
  }
  return rows;
}

/**
 * Split a final agent answer into chat-facing prose vs data that belongs in
 * the Takeoff UI. Large markdown tables are removed from chat.
 */
export function splitConversationalAnswer(text, { rowCount = 0 } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { chat: "", hadTables: false };

  const lines = raw.split(/\n/);
  const kept = [];
  let inTable = false;
  let hadTables = false;
  for (const line of lines) {
    const isTable = /^\s*\|/.test(line);
    if (isTable) {
      hadTables = true;
      inTable = true;
      continue;
    }
    if (inTable && /^\s*$/.test(line)) {
      inTable = false;
      continue;
    }
    inTable = false;
    kept.push(line);
  }
  let chat = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Strip "Answer" header leftovers that only framed a table.
  chat = chat.replace(/^(?:Answer|Key points)\s*$/gim, "").trim();

  if (hadTables || rowCount > 0) {
    const n = rowCount || "the";
    const note = `Structured takeoff data (${typeof n === "number" ? n : "see"} row${n === 1 ? "" : "s"}) was written to the Takeoff panel — open Takeoff to review and export.`;
    chat = chat ? `${chat}\n\n${note}` : note;
  }
  return { chat: chat || raw, hadTables };
}

export function dedupeTakeoffRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = [
      row.tag || "",
      row.field || "",
      String(row.value ?? ""),
      row.sheet_id || "",
      row.column || "",
      row.table_title || "",
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function mergeTakeoffRows(existing, incoming) {
  return dedupeTakeoffRows([...(existing || []), ...(incoming || [])]);
}

export function takeoffToCsv(rows) {
  const header = ["Tag", "Field", "Value", "Unit", "Sheet", "Schedule", "Column", "Workflow", "Source"];
  const lines = [header.map(esc).join(",")];
  for (const r of rows || []) {
    lines.push([
      r.tag || "",
      r.field || "",
      r.value ?? "",
      r.unit || "",
      r.sheet_id || "",
      r.table_title || "",
      r.column || "",
      r.workflow || "",
      r.source_tool || "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}

export function downloadTakeoffCsv(rows, filename = "opentakeoff-takeoff.csv") {
  downloadText(filename, takeoffToCsv(rows), "text/csv;charset=utf-8");
}

export async function downloadTakeoffXlsx(rows, filename = "opentakeoff-takeoff.xlsx") {
  const sheetRows = [
    ["Tag", "Field", "Value", "Unit", "Sheet", "Schedule", "Column", "Workflow", "Source"],
    ...(rows || []).map((r) => [
      r.tag || "",
      r.field || "",
      typeof r.value === "number" ? r.value : (r.value ?? ""),
      r.unit || "",
      r.sheet_id || "",
      r.table_title || "",
      r.column || "",
      r.workflow || "",
      r.source_tool || "",
    ]),
  ];
  const bytes = await buildXlsx([{ name: "Takeoff", rows: sheetRows }]);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build takeoff PDF bytes (landscape table). Used by download + tests. */
export async function buildTakeoffPdfBytes(rows, {
  title = "OpenTakeoff — Takeoff",
  projectName = "",
} = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 792; // landscape letter
  const pageHeight = 612;
  const margin = 36;
  const colWidths = [70, 110, 90, 40, 150, 140];
  const headers = ["Tag", "Field", "Value", "Unit", "Sheet", "Schedule"];
  const lineH = 14;
  const list = rows || [];

  const drawHeader = (page, y) => {
    page.drawText(title, { x: margin, y, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.15) });
    y -= 16;
    if (projectName) {
      page.drawText(String(projectName), { x: margin, y, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
      y -= 14;
    }
    page.drawText(`Generated ${new Date().toLocaleString()} · ${list.length} row${list.length === 1 ? "" : "s"}`, {
      x: margin, y, size: 9, font, color: rgb(0.45, 0.45, 0.5),
    });
    y -= 18;
    let x = margin;
    headers.forEach((h, i) => {
      page.drawText(h, { x, y, size: 9, font: fontBold, color: rgb(0.15, 0.15, 0.2) });
      x += colWidths[i];
    });
    y -= 4;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.8,
      color: rgb(0.7, 0.7, 0.75),
    });
    return y - 12;
  };

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  y = drawHeader(page, y);

  const clip = (text, maxW) => {
    const s = String(text ?? "");
    if (font.widthOfTextAtSize(s, 9) <= maxW) return s;
    let out = s;
    while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, 9) > maxW) out = out.slice(0, -1);
    return `${out}…`;
  };

  for (const r of list) {
    if (y < margin + lineH) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      y = drawHeader(page, y);
    }
    const vals = [
      r.tag || "—",
      r.field || "",
      r.value ?? "",
      r.unit || "",
      r.sheet_id || "",
      r.table_title || "",
    ];
    let x = margin;
    vals.forEach((v, i) => {
      page.drawText(clip(v, colWidths[i] - 6), {
        x, y, size: 9, font, color: rgb(0.12, 0.12, 0.16),
      });
      x += colWidths[i];
    });
    y -= lineH;
  }

  return doc.save();
}

/** Build a simple multi-page PDF table via pdf-lib. */
export async function downloadTakeoffPdf(rows, {
  filename = "opentakeoff-takeoff.pdf",
  title = "OpenTakeoff — Takeoff",
  projectName = "",
} = {}) {
  const bytes = await buildTakeoffPdfBytes(rows, { title, projectName });
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
