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

/** Strip markdown wrappers models put on tags (`**CV-1**`, `*CV-1*`, `` `CV-1` ``). */
export function cleanTakeoffTag(tag) {
  if (tag == null) return null;
  let t = String(tag).trim();
  for (let i = 0; i < 3; i++) {
    const next = t
      .replace(/^\*\*(.+)\*\*$/s, "$1")
      .replace(/^\*(.+)\*$/s, "$1")
      .replace(/^__(.+)__$/s, "$1")
      .replace(/^_(.+)_$/s, "$1")
      .replace(/^`(.+)`$/s, "$1")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t || null;
}

/** Schedule/list title may arrive as a plain string or { text, bbox }. */
const titleText = (title) => {
  if (title == null) return null;
  if (typeof title === "string") {
    const t = title.trim();
    return t || null;
  }
  if (typeof title === "object") {
    const t = cellText(title).trim();
    return t || null;
  }
  const t = String(title).trim();
  return t || null;
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
  table_bbox_px = null,
  row_bbox_px = null,
  source_tool = null,
  note = null,
} = {}) {
  const rawVal = typeof value === "object" && value !== null && !Array.isArray(value)
    ? cellText(value)
    : value;
  const cleanedTag = cleanTakeoffTag(tag);
  return {
    id: nextId(),
    created_at: Date.now(),
    run_id: runId,
    workflow: String(workflow || "").slice(0, 240),
    tag: cleanedTag,
    field: String(field || "value").trim() || "value",
    value: typeof rawVal === "number" && Number.isFinite(rawVal) ? rawVal : String(rawVal ?? "").trim(),
    unit: unit != null && String(unit).trim() !== "" ? String(unit).trim() : null,
    sheet_id: sheet_id || null,
    table_title: titleText(table_title),
    column: column || null,
    bbox_px: asBbox(bbox_px),
    table_bbox_px: asBbox(table_bbox_px),
    row_bbox_px: asBbox(row_bbox_px),
    source_tool: source_tool || null,
    note: note != null ? String(note) : null,
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
    const title = titleText(data.matches?.[0]?.title) || titleText(args.title) || null;
    const matches = data.matches || [];
    // Title-scan counts stay compact for huge equipment families; row_key /
    // modest result sets expand into full schedule columns. CONTROL VALVE
    // schedules always expand — a partial 10-row dump is not a valve takeoff.
    const titleHint = title || titleText(args.title) || "";
    const valveTitleScan = /CONTROL\s+VALVE\s+SCHEDULE/i.test(titleHint);
    const expandRows = Boolean(args.row_key) || Boolean(args.column)
      || matches.length <= 24 || valveTitleScan;
    if (!expandRows && typeof data.count === "number" && !args.row_key) {
      rows.push(makeTakeoffRow({
        workflow, runId, tag: null, field: "schedule_count", value: data.count,
        sheet_id: matches[0]?.sheet || null, table_title: title || titleText(args.title),
        source_tool: name, note: "query_table count",
      }));
    } else {
      for (const match of matches) {
        const key = match.row?.key || match.row?.identity?.text || args.row_key || null;
        const cells = match.row?.all_cells || match.row?.cells || {};
        const tableTitle = titleText(match.title) || title;
        if (args.column && cells[args.column]) {
          const cell = cells[args.column];
          rows.push(makeTakeoffRow({
            workflow, runId, tag: key, field: args.column, value: cellText(cell),
            sheet_id: match.sheet, table_title: tableTitle,
            column: args.column, bbox_px: cell?.bbox, source_tool: name,
          }));
          continue;
        }
        if (key) {
          const idCell = match.row?.identity || cells.MARK || cells.TAG || cells.SYMBOL || cells.POINT;
          rows.push(makeTakeoffRow({
            workflow, runId, tag: key, field: "MARK", value: key,
            sheet_id: match.sheet, table_title: tableTitle,
            column: match.row?.identity?.header || "MARK",
            bbox_px: idCell?.bbox || (typeof idCell === "object" ? idCell.bbox : null),
            source_tool: name,
          }));
        }
        for (const [header, cell] of Object.entries(cells)) {
          const hu = String(header || "").toUpperCase();
          if (hu === "MARK" || hu === "TAG" || hu === "SYMBOL") continue;
          const text = cellText(cell);
          if (!String(text).trim()) continue;
          rows.push(makeTakeoffRow({
            workflow, runId, tag: key, field: header, value: text,
            sheet_id: match.sheet, table_title: tableTitle,
            column: header,
            bbox_px: cell && typeof cell === "object" ? cell.bbox : null,
            source_tool: name,
          }));
        }
      }
    }
    if (typeof data.count === "number" && !matches.length) {
      rows.push(makeTakeoffRow({
        workflow, runId, field: "schedule_count", value: data.count,
        table_title: titleText(args.title), source_tool: name,
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

  if (name === "compile_corpus_takeoff") {
    rows.push(...rowsFromCompiledTakeoff(data, { workflow, runId, source_tool: name }));
  }

  if (name === "takeoff_summary" || name === "project_takeoff") {
    for (const item of data.items || data.equipment || data.legend_items || data.points || []) {
      const tag = item.tag || item.mark || item.id || item.point || null;
      const qty = item.quantity ?? item.qty ?? item.found ?? (tag ? 1 : null);
      const schedule = item.schedule && typeof item.schedule === "object" ? item.schedule : null;
      const sheet = schedule?.sheet || item.schedule_sheet || item.sheet || null;
      const table = schedule?.title || item.schedule_title || item.table || item.points_list || null;
      if (tag != null && qty != null) {
        rows.push(makeTakeoffRow({
          workflow, runId, tag, field: "quantity", value: qty, unit: item.unit || "EA",
          sheet_id: sheet, table_title: table,
          source_tool: name, note: item.equipment_type || item.type || item.status || null,
        }));
        if (item.equipment_type) {
          rows.push(makeTakeoffRow({
            workflow, runId, tag, field: "equipment_type", value: item.equipment_type,
            sheet_id: sheet, table_title: table, source_tool: name,
          }));
        }
        const attrBags = [
          schedule?.cells, item.cells, item.attrs, item.attributes, item.fields,
        ].filter((x) => x && typeof x === "object" && !Array.isArray(x));
        for (const bag of attrBags) {
          for (const [header, raw] of Object.entries(bag)) {
            const hu = String(header || "").toUpperCase();
            if (hu === "MARK" || hu === "TAG" || hu === "SYMBOL") continue;
            const text = cellText(raw);
            if (!String(text).trim()) continue;
            rows.push(makeTakeoffRow({
              workflow, runId, tag, field: header, value: text,
              sheet_id: sheet, table_title: table, column: header, source_tool: name,
            }));
          }
        }
      }
    }
    if (typeof data.total === "number") {
      rows.push(makeTakeoffRow({
        workflow, runId, field: "project_total", value: data.total,
        source_tool: name,
      }));
    }
    if (typeof data.stats?.total_drawn_instances === "number") {
      rows.push(makeTakeoffRow({
        workflow, runId, field: "project_total", value: data.stats.total_drawn_instances,
        unit: "EA", source_tool: name, note: "total_drawn_instances",
      }));
    }
  }

  return rows;
}

/**
 * Expand a compiled corpus takeoff (T-HVAC-01 / T-BAS-01) into EAV takeoff rows.
 * Takeoff tab compiles these into finished line items; Workflow data keeps the
 * raw aggregate for audit. Shared converter — MCP/UI compile both feed here.
 */
export function rowsFromCompiledTakeoff(compiled, meta = {}) {
  const rows = [];
  if (!compiled || typeof compiled !== "object" || compiled.error) return rows;
  const workflow = meta.workflow
    || compiled.takeoff_id
    || (compiled.kind === "bas_points" ? "BAS points takeoff"
      : compiled.kind === "control_valves" ? "Control valve takeoff"
        : "HVAC equipment takeoff");
  const runId = meta.runId || null;
  const source_tool = meta.source_tool || "compile_corpus_takeoff";

  if (compiled.kind === "hvac_equipment" || compiled.kind === "control_valves"
    || (compiled.categories && !compiled.categories.points_lists)) {
    for (const [catName, cat] of Object.entries(compiled.categories || {})) {
      if (catName === "points_lists" || !cat || typeof cat !== "object") continue;
      const items = Array.isArray(cat.items) ? cat.items : [];
      for (const item of items) {
        const tag = item.tag || item.mark || null;
        if (!tag) continue;
        const sheet = item.sheet_id || item.sheet || null;
        const table = item.table_title || catName;
        rows.push(makeTakeoffRow({
          workflow, runId, tag, field: "quantity",
          value: item.quantity ?? item.qty ?? 1, unit: item.unit || "EA",
          sheet_id: sheet, table_title: table, bbox_px: item.bbox_px || null,
          table_bbox_px: item.table_bbox_px || null,
          row_bbox_px: item.row_bbox_px || null,
          source_tool, note: catName,
        }));
        rows.push(makeTakeoffRow({
          workflow, runId, tag, field: "equipment_type", value: catName,
          sheet_id: sheet, table_title: table, source_tool,
        }));
        if (item.building) {
          // Set-agnostic label — never hardcode project building names.
          const bldgName = /^[A-Z0-9]{1,3}$/i.test(String(item.building))
            ? `Building ${String(item.building).toUpperCase()}`
            : String(item.building);
          rows.push(makeTakeoffRow({
            workflow, runId, tag, field: "BUILDING", value: bldgName,
            sheet_id: sheet, table_title: table, column: "BUILDING", source_tool,
          }));
        }
        if (item.description) {
          const descCell = item.cells && Object.entries(item.cells).find(([h]) => /DESCRIPTION/i.test(h));
          const descBbox = descCell && typeof descCell[1] === "object" ? descCell[1].bbox : null;
          rows.push(makeTakeoffRow({
            workflow, runId, tag, field: "DESCRIPTION", value: item.description,
            sheet_id: sheet, table_title: table, column: "DESCRIPTION",
            bbox_px: descBbox || item.bbox_px || null, source_tool,
          }));
        }
        const cells = item.cells || item.attrs || item.fields;
        if (cells && typeof cells === "object" && !Array.isArray(cells)) {
          for (const [header, raw] of Object.entries(cells)) {
            const hu = String(header || "").toUpperCase();
            if (hu === "MARK" || hu === "TAG" || hu === "SYMBOL" || hu === "DESCRIPTION") continue;
            const text = cellText(raw);
            if (!String(text).trim()) continue;
            const bbox = (raw && typeof raw === "object" && !Array.isArray(raw))
              ? (raw.bbox || raw.bbox_px)
              : null;
            rows.push(makeTakeoffRow({
              workflow, runId, tag, field: header, value: text,
              sheet_id: sheet, table_title: table, column: header,
              bbox_px: bbox || null, source_tool,
            }));
          }
        }
      }
      if (!items.length && typeof cat.count === "number") {
        rows.push(makeTakeoffRow({
          workflow, runId, tag: catName, field: "schedule_count", value: cat.count,
          unit: "EA", table_title: catName, source_tool, note: "category rollup",
        }));
      }
    }
  }

  if (compiled.kind === "bas_points" || compiled.categories?.points_lists) {
    const lists = compiled.categories?.points_lists?.lists || [];
    for (const list of lists) {
      const items = Array.isArray(list.items) ? list.items : [];
      for (const item of items) {
        const tag = item.tag || item.mark || null;
        if (!tag) continue;
        const sheet = item.sheet_id || list.sheet_id || null;
        const table = item.table_title || list.title || null;
        rows.push(makeTakeoffRow({
          workflow, runId, tag, field: "quantity",
          value: item.quantity ?? 1, unit: item.unit || "EA",
          sheet_id: sheet, table_title: table, bbox_px: item.bbox_px || null,
          table_bbox_px: item.table_bbox_px || null,
          source_tool,
        }));
        const m = String(tag).toUpperCase().match(/^(AI|AO|BI|BO)\d/);
        if (m) {
          rows.push(makeTakeoffRow({
            workflow, runId, tag, field: "POINT TYPE", value: m[1],
            sheet_id: sheet, table_title: table, column: "POINT TYPE", source_tool,
          }));
        }
        if (item.description) {
          const descCell = item.cells && Object.entries(item.cells).find(([h]) => /DESCRIPTION/i.test(h));
          const descBbox = descCell && typeof descCell[1] === "object" ? descCell[1].bbox : null;
          rows.push(makeTakeoffRow({
            workflow, runId, tag, field: "DESCRIPTION", value: item.description,
            sheet_id: sheet, table_title: table, column: "DESCRIPTION",
            bbox_px: descBbox || item.bbox_px || null, source_tool,
          }));
        }
        const cells = item.cells || item.attrs || item.fields;
        if (cells && typeof cells === "object" && !Array.isArray(cells)) {
          for (const [header, raw] of Object.entries(cells)) {
            const hu = String(header || "").toUpperCase();
            if (hu === "MARK" || hu === "TAG" || hu === "SYMBOL" || hu === "DESCRIPTION") continue;
            const text = cellText(raw);
            if (!String(text).trim()) continue;
            const bbox = (raw && typeof raw === "object" && !Array.isArray(raw))
              ? (raw.bbox || raw.bbox_px)
              : null;
            rows.push(makeTakeoffRow({
              workflow, runId, tag, field: header, value: text,
              sheet_id: sheet, table_title: table, column: header,
              bbox_px: bbox || null, source_tool,
            }));
          }
        }
      }
      if (!items.length && typeof list.rows === "number") {
        rows.push(makeTakeoffRow({
          workflow, runId, tag: list.title, field: "schedule_count", value: list.rows,
          unit: "EA", sheet_id: list.sheet_id || null, table_title: list.title,
          source_tool, note: "list rollup",
        }));
      }
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
 * the Takeoff UI. Markdown pipe tables are flattened to plain lines so
 * answering values (TYPE, CFM, counts) stay visible in chat — dropping tables
 * entirely made evidence-gate-passing answers lose their facts after strip.
 * finishedLineCount: contractor Takeoff lines only (compile/sweep/summary) —
 * scrap row counts must not advertise "written to the Takeoff panel".
 */
export function splitConversationalAnswer(text, { rowCount = 0, finishedLineCount = 0 } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { chat: "", hadTables: false };

  const lines = raw.split(/\n/);
  const kept = [];
  let hadTables = false;
  let tableHeaders = null;
  const flushTableRow = (cells) => {
    if (!tableHeaders || !cells.length) return;
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) return;
    // Header row — remember labels, don't emit yet.
    if (tableHeaders === true) {
      tableHeaders = cells;
      return;
    }
    const parts = [];
    for (let i = 0; i < cells.length; i++) {
      const h = String(tableHeaders[i] || "").trim();
      const v = String(cells[i] ?? "").trim();
      if (!v) continue;
      parts.push(h ? `${h}: ${v}` : v);
    }
    if (parts.length) kept.push(`- ${parts.join(" · ")}`);
  };
  for (const line of lines) {
    const isTable = /^\s*\|/.test(line);
    if (isTable) {
      hadTables = true;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (!tableHeaders) tableHeaders = true;
      flushTableRow(cells);
      continue;
    }
    if (tableHeaders) tableHeaders = null;
    kept.push(line);
  }
  let chat = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Strip "Answer" header leftovers that only framed a table.
  chat = chat.replace(/^(?:Answer|Key points)\s*$/gim, "").trim();

  const finished = Number(finishedLineCount) || 0;
  if (finished > 0) {
    const note = `Structured takeoff data (${finished} line${finished === 1 ? "" : "s"}) was written to the Takeoff panel — open Takeoff to review and export.`;
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

const QTY_FIELDS = new Set([
  "installed_quantity", "quantity", "mark_count", "schedule_count", "project_total",
]);
const SKIP_ATTR = new Set([
  "MARK", "TAG", "SYMBOL", "VALVE MARK", "VALVE_MARK", "plan_tag", "plan_status",
  ...QTY_FIELDS,
]);

/** Preferred left-to-right order when a field appears — never forces empty columns.
 * Columns only show when at least one line in the (family) group has that field. */
export const TAKEOFF_SPEC_ORDER = [
  // Control-valve contractor columns (Unit Mark / served equipment + ONE Cv)
  "Unit Mark", "Served equipment", "UNIT MARK", "Service", "SERVICE",
  "Size", "VALVE SIZE (IN)", "VALVE SIZE", "PIPE SIZE",
  "GPM", "FLOWRATE (GPM)", "FLOW", "FLOW (GPM)", "MAX GPM", "MIN GPM",
  "Cv", "CV", "CV VALUE",
  "Configuration", "CONFIGURATION", "Notes", "NOTES",
  // Identity / product / duty — BUILDING is a section key, not a trailing col
  "TYPE", "DESCRIPTION", "PATTERN", "STYLE", "APPLICATION", "DUTY",
  "SIZE", "NOMINAL SIZE", "FRAME SIZE",
  // Air-side / terminals
  "CFM", "SUPPLY CFM", "RETURN CFM", "EXHAUST CFM", "OA CFM", "MAX CFM", "MIN CFM",
  "MBH", "HEATING MBH", "COOLING MBH", "TONS", "KW", "HEATING KW", "COOLING KW",
  "EAT", "LAT", "DB", "WB", "EAT DB", "LAT DB",
  "ESP", "S.P. (IN.W.C.)", "SP", "TSP", "EXTERNAL SP",
  "NC", "NC LEVEL", "DISCHARGE", "INLET", "OUTLET",
  // Hydronic / coil (non-valve)
  "CV (MIN)", "CV (MAX)",
  "PRESSURE DROP", "PD", "PD (FT)", "FT HD", "HEAD", "HEAD (FT)",
  "PIPE SIZE", "CONN", "CONNECTION", "BODY", "BODY SIZE", "END CONN", "END CONNECTION",
  "FLUID", "MEDIUM", "DESIGN ΔP", "DELTA P", "ΔP", "CLOSE-OFF", "CLOSE OFF",
  "ACTUATOR", "FAIL POSITION", "FAIL POS", "CONTROL SIGNAL",
  // Dampers / duct / fire-smoke
  "BLADE", "BLADE ACTION", "LEAKAGE", "CLASS", "VELOCITY", "FPM",
  "DUCT SIZE", "W x H", "WIDTH", "HEIGHT", "DIAMETER", "Ø",
  // Electrical / motor
  "HP", "ELECTRICAL HP", "RPM", "MOTORRPM", "MOTOR RPM", "POLES",
  "VOLTAGE", "ELECTRICAL VOLTS", "VOLTS", "V", "PHASE", "ELECTRICAL Ø", "PH",
  "HZ", "ELECTRICAL HZ.", "MCA", "MOCP", "FLA", "RLA", "AMPS", "LRA",
  // Drive / refrigeration / misc equipment
  "DRIVE", "REFRIGERANT", "EER", "IEER", "SEER", "COP", "CAPACITY",
  "WEIGHT", "WEIGHT (LBS)", "AREA", "SF", "LENGTH", "LF",
  "REMARKS", "NOTES", "COMMENT", "COMMENTS",
  // BAS / points lists
  "POINT TYPE", "POINT", "POINT NAME", "POINT DESCRIPTION",
  "SIGNAL", "SIGNAL TYPE", "SIGNAL RANGE", "IO", "I/O", "I/O TYPE",
  "AI", "AO", "BI", "BO", "DI", "DO", "UI", "UO",
  "CONTROLLER", "CONTROLLER NAME", "PANEL", "DEVICE", "DEVICE NAME",
  "ADDRESS", "BACNET", "BACNET OBJECT", "OBJECT", "OBJECT TYPE", "INSTANCE",
  "UNITS", "RANGE", "NORMAL", "ALARM", "TREND", "PRIORITY",
];

const asNumber = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

const normKey = (k) => String(k || "").toUpperCase().replace(/\s+/g, " ").trim();

const pickAttr = (attrs, names) => {
  for (const name of names) {
    const hit = Object.entries(attrs).find(([k]) => normKey(k) === normKey(name));
    if (hit && hit[1] != null && String(hit[1]).trim() !== "") return { key: hit[0], value: hit[1] };
  }
  return null;
};

const familyFromSchedule = (title, tag) => {
  // Prefer the real schedule / list title — that is the modular takeoff section.
  const t = titleText(title) || "";
  if (t) return t;
  const tg = String(tag || "").toUpperCase();
  if (/POINT|POINTS LIST|\bAI-|\bAO-|\bBI-|\bBO-/i.test(tg) || /^(AI|AO|BI|BO|DI|DO)[\s_-]/i.test(tg)) {
    return "BAS points";
  }
  if (/^VAV-/.test(tg)) return "VAV / Air terminals";
  if (/^(CV|BCV|FV|PRV|TCV|MV|HV|CHWV|HWV)-/.test(tg)) return "Valves / hydronic";
  if (/^(FD|SD|FSD|MD)-/.test(tg)) return "Dampers";
  if (/^EF-|^SF-|^RF-|^EF\b/.test(tg)) return "Fans";
  if (/^AHU-|^DOAH-/.test(tg)) return "Air handlers";
  if (/^RTU-/.test(tg)) return "Rooftop / packaged units";
  if (/^CH-/.test(tg)) return "Chillers";
  if (/^P-|^CP-|^CHP-|^HWP-/.test(tg)) return "Pumps";
  if (/^FCU-/.test(tg)) return "Fan coil units";
  if (/^CD-|^SD-|^RCD-/.test(tg)) return "Diffusers / grilles";
  return "Equipment";
};

/** Spec value on a line by column header (case/space tolerant). */
export function lineSpecValue(line, col) {
  if (!line?.specs) return "";
  const hit = Object.entries(line.specs).find(([k]) => normKey(k) === normKey(col));
  if (!hit) return "";
  return cellText(hit[1]);
}

/** Drawing cite for a technical column — same equipment row as the Tag (not a scatter jump). */
export function lineSpecCite(line, col) {
  // Spec values belong to the schedule row; jump to the row, not each cell.
  return lineLeadCite(line, "tag");
}

/** Cite for a lead cell (tag / qty) — whole schedule ROW when available. */
export function lineLeadCite(line, key) {
  if (!line?.sheet_id) return null;
  if (key !== "tag" && key !== "qty" && key !== "unit_mark") return null;
  const bbox = line.row_bbox_px || line.bbox_px;
  if (!bbox) return null;
  return {
    sheet_id: line.sheet_id,
    bbox_px: bbox,
    column: key === "unit_mark" ? "UNIT MARK" : "MARK",
    field: key === "unit_mark" ? "UNIT MARK" : "MARK",
    value: key === "unit_mark"
      ? (line.unit_mark || lineSpecValue(line, "Unit Mark") || line.tag)
      : line.tag,
    tag: line.tag,
    table_title: line.table_title,
    kind: "row",
  };
}

/** Cite for a schedule family section — the whole table title/region on the sheet. */
export function familyTableCite(group) {
  const line = (group?.lines || []).find((l) => l.table_bbox_px && l.sheet_id)
    || (group?.lines || []).find((l) => l.bbox_px && l.sheet_id);
  if (!line) return null;
  const bbox = line.table_bbox_px || line.bbox_px;
  if (!bbox) return null;
  return {
    sheet_id: line.schedule_sheet_id || line.sheet_id,
    bbox_px: bbox,
    column: null,
    field: "table",
    value: group.family,
    tag: null,
    table_title: group.family,
    kind: "table",
  };
}

/**
 * Lead (identity) columns for a family group — only fields that appear.
 * Points lists skip Manufacturer/Model; valve takeoffs keep them when present.
 */
const tagLabelFor = (lines) => {
  const fams = new Set((lines || []).map((l) => l.table_title || l.family || ""));
  if ([...fams].some((f) => /CONTROL\s+VALVE/i.test(f || ""))) return "Valve Mark";
  if (fams.size === 1 && /POINT/i.test([...fams][0] || "")) return "Point";
  return "Tag";
};

export function takeoffLeadColumns(lines = []) {
  const list = lines || [];
  const has = (fn) => list.some(fn);
  const cols = [{ key: "tag", label: tagLabelFor(list) }];
  // Valve / hydronic: Unit Mark (served equipment) is the primary verifiable join.
  if (has((l) => l.unit_mark || lineSpecValue(l, "Unit Mark") || lineSpecValue(l, "Served equipment"))) {
    cols.push({ key: "unit_mark", label: "Unit Mark" });
  }
  if (has((l) => {
    const t = String(l.type || "").trim();
    return t && t !== String(l.tag || "").trim()
      && !/^(CHW|HHW)$/i.test(t); // service is in the section title for valves
  })) {
    cols.push({ key: "type", label: "Type" });
  }
  if (has((l) => l.qty != null && l.qty !== "")) {
    cols.push({ key: "qty", label: "Qty" });
    if (has((l) => l.unit)) cols.push({ key: "unit", label: "Unit" });
  }
  if (has((l) => l.manufacturer)) cols.push({ key: "manufacturer", label: "Manufacturer" });
  if (has((l) => l.model)) cols.push({ key: "model", label: "Model" });
  return cols;
}

/**
 * Technical columns for a set of lines — ONLY fields that appear on at least
 * one line. Valve groups surface GPM/Cv/pipe size; VAV groups surface CFM/MBH/kW;
 * points lists surface Point Type / Signal / Controller. Empty air columns
 * never pad a hydronic or points takeoff.
 * @param {object[]} lines
 * @param {{ max?: number }} [opts] — UI may cap visible columns; exports pass no max.
 */
export function takeoffSpecColumns(lines = [], opts = {}) {
  const seen = new Map();
  for (const line of lines) {
    for (const [k, v] of Object.entries(line.specs || {})) {
      if (v == null || String(v).trim() === "") continue;
      const nk = normKey(k);
      if (!seen.has(nk)) seen.set(nk, k);
    }
  }
  const keys = [...seen.values()];
  keys.sort((a, b) => {
    const ia = TAKEOFF_SPEC_ORDER.findIndex((x) => normKey(x) === normKey(a));
    const ib = TAKEOFF_SPEC_ORDER.findIndex((x) => normKey(x) === normKey(b));
    const aa = ia < 0 ? 999 : ia;
    const bb = ib < 0 ? 999 : ib;
    if (aa !== bb) return aa - bb;
    return a.localeCompare(b);
  });
  const max = Number.isFinite(opts.max) ? opts.max : null;
  if (max != null && keys.length > max) return keys.slice(0, max);
  return keys;
}

/** Group compiled lines by schedule/family (each family gets its own column set).
 * Multi-building valve (and similar) takeoffs section as Building · Schedule so
 * estimators scan building → CHW/HHW, not a flat CHW-then-HHW dump. */
export function groupTakeoffByFamily(lines = [], opts = {}) {
  const map = new Map();
  for (const line of lines) {
    const key = line.family || line.table_title || "Equipment";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(line);
  }
  const uiMax = opts.uiSpecMax ?? null;
  const groups = [...map.entries()].map(([family, group]) => {
    const sorted = [...group].sort((a, b) => {
      const sheetA = sheetSortKey(a.sheet_id || a.schedule_sheet_id);
      const sheetB = sheetSortKey(b.sheet_id || b.schedule_sheet_id);
      if (sheetA !== sheetB) return sheetA - sheetB;
      const at = a.tag || a.type || "";
      const bt = b.tag || b.type || "";
      return at.localeCompare(bt, undefined, { numeric: true, sensitivity: "base" });
    });
    const allSpecs = takeoffSpecColumns(sorted).filter((k) => {
      const nk = normKey(k);
      // Unit Mark is a lead column for valves — don't also trail it in specs.
      if (nk === "UNIT MARK" || nk === "SERVED EQUIPMENT") {
        return !sorted.some((l) => l.unit_mark || lineSpecValue(l, "Unit Mark") || lineSpecValue(l, "Served equipment"));
      }
      if (nk === "SERVICE" || nk === "BUILDING") return false;
      return true;
    });
    return {
      family,
      lines: sorted,
      leadColumns: takeoffLeadColumns(sorted),
      specColumns: uiMax != null ? allSpecs.slice(0, uiMax) : allSpecs,
      specTotal: allSpecs.length,
      qtyTotal: sorted.reduce((n, l) => n + (typeof l.qty === "number" && (l.unit || "EA") === "EA" ? l.qty : 0), 0),
      tableCite: familyTableCite({ family, lines: sorted }),
      building: sorted.find((l) => l.building)?.building || null,
    };
  });
  groups.sort((a, b) => {
    const ba = buildingSortKey(a.building || a.family);
    const bb = buildingSortKey(b.building || b.family);
    if (ba !== bb) return ba.localeCompare(bb, undefined, { numeric: true });
    const sa = serviceSortKey(a.family);
    const sb = serviceSortKey(b.family);
    if (sa !== sb) return sa - sb;
    return String(a.family).localeCompare(String(b.family));
  });
  return groups;
}

function sheetSortKey(sheetId) {
  const s = String(sheetId || "");
  const m = s.match(/#(\d+)$/);
  if (m) return Number(m[1]);
  return 0;
}

function buildingSortKey(familyOrBuilding) {
  const s = String(familyOrBuilding || "");
  const m = s.match(/^Building\s+([A-Z0-9]+)/i);
  if (m) return `0-${m[1].toUpperCase()}`;
  if (/^Building\b/i.test(s)) return `0-${s}`;
  return `1-${s}`;
}

function serviceSortKey(family) {
  const s = String(family || "").toUpperCase();
  if (/\bCHW\b/.test(s)) return 0;
  if (/\bHHW\b/.test(s)) return 1;
  if (/\bBYPASS\b/.test(s)) return 2;
  return 3;
}

/** Cell value for a lead column key. */
export function lineLeadValue(line, key) {
  if (!line) return "";
  if (key === "tag") return line.tag || "";
  if (key === "unit_mark") {
    return line.unit_mark
      || lineSpecValue(line, "Unit Mark")
      || lineSpecValue(line, "Served equipment")
      || "";
  }
  if (key === "type") return line.type || "";
  if (key === "qty") return line.qty ?? "";
  if (key === "unit") return line.unit || "";
  if (key === "manufacturer") return line.manufacturer || "";
  if (key === "model") return line.model || "";
  return "";
}

/** Line identity: Tag alone is wrong for BAS — AI1 on two points lists are two rows. */
function takeoffLineKey(tag, tableTitle, field) {
  const t = tag ? String(tag).trim().toUpperCase() : "";
  const s = String(tableTitle || "").trim().toUpperCase();
  if (t && s) return `tag:${t}|sched:${s}`;
  if (t) return `tag:${t}`;
  return `sched:${s || String(field || "misc").trim().toUpperCase()}`;
}

/**
 * Tools that seed contractor finished-takeoff lines.
 * query_table / answer_table / count_marks scrap stays Workflow data only —
 * never invents Takeoff-tab lines (GOAL: Agent scrap ≠ Takeoff).
 */
export function isFinishedTakeoffSource(sourceTool) {
  const t = String(sourceTool || "");
  return t === "compile_corpus_takeoff"
    || t === "takeoff_summary"
    || t === "project_takeoff"
    || t === "sweep_schedule_row";
}

/**
 * Compile EAV workflow rows into a real equipment takeoff:
 * one line per tag (+ schedule when marks repeat across lists) with qty +
 * technical schedule columns (CFM, MBH, kW, …).
 *
 * When a corpus compile (`compile_corpus_takeoff`) is present, the Takeoff tab
 * is ONLY those finished line items — spot-cite scrap may enrich
 * attrs on those tags but must not invent extra tags or double EA.
 *
 * Without a finished-takeoff seed (compile / project_takeoff / takeoff_summary /
 * sweep_schedule_row), return no Takeoff lines — query_table crawls and answer
 * markdown tables remain Workflow data only.
 *
 * Identity is tag + schedule title so repeating BAS marks (AI1 on DOAH vs AHU
 * lists) stay separate rows; HVAC tags stay unique via their schedule name.
 */
export function compileAgentTakeoff(rows = []) {
  const all = rows || [];
  const compileQtyRows = all.filter((row) => (
    row?.source_tool === "compile_corpus_takeoff"
    && String(row.field || "") === "quantity"
    && row.tag
  ));
  const corpusLocked = compileQtyRows.length > 0;
  const finishedSeedRows = corpusLocked
    ? compileQtyRows
    : all.filter((row) => (
      isFinishedTakeoffSource(row?.source_tool) && row?.tag
    ));
  // Scrap-only Agent runs (FCU building splits, cite crawls, …) must not mint
  // a fake contractor takeoff from query_table / answer_table EAV.
  if (!finishedSeedRows.length) return [];

  const corpusQtyTags = new Set(
    compileQtyRows.map((row) => String(row.tag).trim().toUpperCase()),
  );
  const finishedTags = new Set(
    finishedSeedRows.map((row) => String(row.tag).trim().toUpperCase()).filter(Boolean),
  );
  const scoped = corpusLocked
    ? all.filter((row) => {
      if (!row?.tag) return row?.source_tool === "compile_corpus_takeoff";
      return corpusQtyTags.has(String(row.tag).trim().toUpperCase());
    })
    : all.filter((row) => {
      if (isFinishedTakeoffSource(row?.source_tool)) return true;
      if (!row?.tag) return false;
      return finishedTags.has(String(row.tag).trim().toUpperCase());
    });

  const groups = new Map();
  const groupsByTag = new Map(); // UPPER tag → [group,…] for enrichment merge

  const ensureGroup = (key, tag) => {
    if (!groups.has(key)) {
      const g = {
        id: key,
        tag: tag || null,
        sourceRows: [],
        attrs: {},
        attrCites: {},
        qty: null,
        unit: null,
        qty_kind: null,
        schedule_sheet_id: null,
        plan_sheet_id: null,
        table_title: null,
        workflows: new Set(),
        status: null,
        notes: [],
        bbox_px: null,
        plan_bbox_px: null,
        table_bbox_px: null,
        row_bbox_px: null,
        building: null,
        fromCompile: false,
      };
      groups.set(key, g);
      if (tag) {
        const tu = tag.toUpperCase();
        if (!groupsByTag.has(tu)) groupsByTag.set(tu, []);
        groupsByTag.get(tu).push(g);
      }
    }
    return groups.get(key);
  };

  const resolveGroup = (row, { create }) => {
    const tag = row.tag ? String(row.tag).trim() : "";
    const key = takeoffLineKey(tag, row.table_title, row.field);
    if (groups.has(key)) return groups.get(key);
    if (create) return ensureGroup(key, tag || null);
    // Scrap enrichment: same tag + one compile line → merge there.
    if (tag) {
      const matches = groupsByTag.get(tag.toUpperCase()) || [];
      if (matches.length === 1) return matches[0];
    }
    return null;
  };

  // Seed finished lines first so identity = contractor takeoff (not scrap).
  for (const row of finishedSeedRows) {
    resolveGroup(row, { create: true });
  }

  for (const row of scoped) {
    const isCompileQty = row?.source_tool === "compile_corpus_takeoff"
      && String(row.field || "") === "quantity"
      && row.tag;
    const isFinishedSeed = isFinishedTakeoffSource(row?.source_tool) && row.tag;
    const g = resolveGroup(row, {
      create: corpusLocked ? isCompileQty : isFinishedSeed,
    });
    if (!g) continue;
    const tag = row.tag ? String(row.tag).trim() : "";
    if (!g.tag && tag) g.tag = tag;
    g.sourceRows.push(row);
    if (row.workflow) g.workflows.add(row.workflow);
    // Prefer the corpus compile's schedule title — scrap titles can be noisy.
    if (row.table_title) {
      if (!g.table_title || row.source_tool === "compile_corpus_takeoff") {
        g.table_title = row.table_title;
      }
    }
    if (row.table_bbox_px && (!g.table_bbox_px || row.source_tool === "compile_corpus_takeoff")) {
      g.table_bbox_px = row.table_bbox_px;
    }
    if (row.row_bbox_px && (!g.row_bbox_px || row.source_tool === "compile_corpus_takeoff")) {
      g.row_bbox_px = row.row_bbox_px;
    }
    if (row.source_tool === "compile_corpus_takeoff") g.fromCompile = true;
    const field = String(row.field || "");
    const fieldU = field.toUpperCase();

    if (field === "installed_quantity") {
      const n = asNumber(row.value);
      if (n != null) {
        g.qty = n;
        g.unit = row.unit || "EA";
        g.qty_kind = "installed";
      }
    } else if (field === "quantity") {
      const n = asNumber(row.value);
      // Corpus compile quantity always wins for scheduled takeoff lines.
      if (n != null && (row.source_tool === "compile_corpus_takeoff" || g.qty_kind !== "installed")) {
        if (row.source_tool === "compile_corpus_takeoff" || g.qty_kind !== "scheduled") {
          g.qty = n;
          g.unit = row.unit || "EA";
          g.qty_kind = row.source_tool === "compile_corpus_takeoff" ? "scheduled" : (g.qty_kind || "scheduled");
        }
      }
      if (row.bbox_px && (row.source_tool === "compile_corpus_takeoff" || !g.bbox_px)) {
        g.bbox_px = row.bbox_px;
      }
      if (row.row_bbox_px && (row.source_tool === "compile_corpus_takeoff" || !g.row_bbox_px)) {
        g.row_bbox_px = row.row_bbox_px;
      }
    } else if (field === "mark_count" && g.qty_kind !== "installed" && g.qty_kind !== "scheduled") {
      const n = asNumber(row.value);
      if (n != null) {
        g.qty = n;
        g.unit = row.unit || "EA";
        g.qty_kind = "mark_count";
      }
    } else if (field === "schedule_count" && g.qty == null) {
      const n = asNumber(row.value);
      if (n != null) {
        g.qty = n;
        g.unit = row.unit || "EA";
        g.qty_kind = "scheduled";
      }
    } else if (field === "plan_status") {
      const status = String(row.value || "").trim().toLowerCase();
      if (status === "refused") {
        g.status = "refused";
        g.notes.push("Tag not drawn on plan — sweep refused");
      } else if (status) {
        g.status = status;
        g.notes.push(`Plan: ${row.value}`);
      }
      if (row.sheet_id && !g.schedule_sheet_id) g.schedule_sheet_id = row.sheet_id;
    } else if (field === "plan_tag") {
      if (row.sheet_id) g.plan_sheet_id = row.sheet_id;
      if (row.bbox_px) g.plan_bbox_px = row.bbox_px;
      g.status = g.status || "located";
    } else if (!SKIP_ATTR.has(field) && !SKIP_ATTR.has(fieldU) && row.value != null && String(row.value).trim() !== "") {
      // Prefer first non-empty; later richer tools can overwrite empty.
      if (g.attrs[field] == null || String(g.attrs[field]).trim() === "") {
        g.attrs[field] = row.value;
      }
      if (row.bbox_px && (!g.attrCites[field] || row.source_tool === "compile_corpus_takeoff")) {
        g.attrCites[field] = {
          bbox_px: row.bbox_px,
          sheet_id: row.sheet_id || null,
        };
      }
    }

    if (row.source_tool === "sweep_schedule_row" && row.sheet_id && field === "installed_quantity") {
      g.plan_sheet_id = row.sheet_id;
      if (row.bbox_px) g.plan_bbox_px = row.bbox_px;
      g.status = g.status || "located";
    } else if (row.sheet_id && (field !== "installed_quantity" && field !== "plan_tag")) {
      if (!g.schedule_sheet_id) g.schedule_sheet_id = row.sheet_id;
    }
    if (row.bbox_px && !g.bbox_px && field !== "plan_status" && field !== "plan_tag" && field !== "installed_quantity") {
      // Identity / MARK cites prefer the quantity row's bbox; other fields keep attrCites.
      if (field === "MARK" || field === "TAG" || field === "quantity") g.bbox_px = row.bbox_px;
      else if (!g.bbox_px && row.source_tool === "compile_corpus_takeoff") g.bbox_px = row.bbox_px;
    }
  }

  const lines = [];
  for (const g of groups.values()) {
    // With a corpus compile locked, never invent qty for attr-only junk tags.
    if (g.tag && g.qty == null && Object.keys(g.attrs).length && !corpusLocked) {
      g.qty = 1;
      g.unit = "EA";
      g.qty_kind = "scheduled";
    }
    if (g.qty == null && !g.tag) continue; // drop empty junk
    if (corpusLocked && (g.qty == null || !g.tag)) continue;

    const mfr = pickAttr(g.attrs, ["MANUFACTURER", "MFR", "MANUFACTURER/MODEL", "MANUFACTURER / MODEL"]);
    const model = pickAttr(g.attrs, ["MODEL"]);
    // If manufacturer/model is combined, split display.
    let manufacturer = mfr?.value != null ? String(mfr.value) : null;
    let modelVal = model?.value != null ? String(model.value) : null;
    if (manufacturer && /[/|]/.test(manufacturer) && !modelVal) {
      const parts = manufacturer.split(/\s*[/|]\s*/);
      if (parts.length >= 2) {
        manufacturer = parts[0];
        modelVal = parts.slice(1).join(" / ");
      }
    }

    const typePick = pickAttr(g.attrs, ["TYPE", "POINT TYPE", "SERVICE", "DESCRIPTION", "equipment_type"]);
    let typeLabel = typePick?.value != null ? String(typePick.value) : null;
    // Category codes like AIR_COOLED_CHILLER are redundant when the schedule
    // title already names the family — drop them from the Type lead column.
    if (typeLabel && /^[A-Z][A-Z0-9_]+$/.test(typeLabel) && /_/.test(typeLabel)) {
      typeLabel = null;
    }
    if (!typeLabel) typeLabel = g.tag || "Item";
    const typeKeyNorm = typePick && typeLabel !== g.tag ? normKey(typePick.key) : null;

    const buildingAttr = pickAttr(g.attrs, ["BUILDING"]);
    const building = buildingAttr?.value != null ? String(buildingAttr.value) : null;

    const specs = {};
    const spec_cites = {};
    const valveSched = /CONTROL\s+VALVE\s+SCHEDULE/i.test(g.table_title || "")
      || /CONTROL\s+VALVE\s+SCHEDULE/i.test(familyFromSchedule(g.table_title, g.tag) || "");
    for (const [k, v] of Object.entries(g.attrs)) {
      if (k.endsWith("_unit")) continue;
      const nk = normKey(k);
      // Manufacturer/model live in dedicated columns; category codes stay out of specs.
      if (["MANUFACTURER", "MFR", "MODEL", "MANUFACTURER/MODEL", "MANUFACTURER / MODEL", "EQUIPMENT_TYPE", "BUILDING"].includes(nk)) continue;
      if (typeKeyNorm && nk === typeKeyNorm) continue;
      // Valve schedules have ONE Cv column. Dual "CHW CV" + "HHW CV" on the same
      // row is agent markdown mash — never surface it on a contractor takeoff.
      if (valveSched && /^(CHW\s*CV|HHW\s*CV|MARK\s*NOTES|VALVE\s*MARK)$/i.test(nk)) continue;
      // "Serves X" description duplicates Served equipment — drop the filler.
      if (valveSched && nk === "DESCRIPTION" && /^Serves\s+/i.test(String(v))) continue;
      // Service is carried in the Building · Schedule section title for valves.
      if (valveSched && nk === "SERVICE") continue;
      specs[k] = v;
      if (g.attrCites[k]?.bbox_px) {
        spec_cites[k] = g.attrCites[k];
      }
    }

    const unitMark = pickAttr(g.attrs, ["Unit Mark", "UNIT MARK", "Served equipment"])?.value != null
      ? String(pickAttr(g.attrs, ["Unit Mark", "UNIT MARK", "Served equipment"]).value)
      : null;

    const scheduleTitle = familyFromSchedule(g.table_title, g.tag);
    // Modular sections: Building · schedule when a building code is known
    // (multi-building valve sets). Otherwise keep the schedule title alone.
    const family = (building && /CONTROL\s+VALVE/i.test(scheduleTitle || ""))
      ? `${building} · ${scheduleTitle}`
      : scheduleTitle;
    lines.push({
      id: g.id,
      tag: g.tag,
      family,
      building,
      unit_mark: unitMark,
      type: typeLabel,
      manufacturer,
      model: modelVal,
      qty: g.qty,
      unit: g.unit || (g.qty != null ? "EA" : null),
      qty_kind: g.qty_kind,
      specs,
      spec_cites,
      plan_sheet_id: g.plan_sheet_id || null,
      schedule_sheet_id: g.schedule_sheet_id || g.sheet_id || null,
      table_title: g.table_title,
      status: g.status || null, // blank Status column is noise — only set when real
      notes: g.notes.join("; "),
      workflow: [...g.workflows].join(" · "),
      bbox_px: g.plan_bbox_px || g.bbox_px,
      row_bbox_px: g.row_bbox_px || null,
      table_bbox_px: g.table_bbox_px || null,
      source_ids: g.sourceRows.map((r) => r.id),
      source_count: g.sourceRows.length,
      from_compile: !!g.fromCompile,
      // back-compat aliases used by older panel code
      description: [manufacturer, modelVal].filter(Boolean).join(" / ")
        || (pickAttr(g.attrs, ["DESCRIPTION", "SERVICE"])?.value != null
          ? String(pickAttr(g.attrs, ["DESCRIPTION", "SERVICE"]).value)
          : typeLabel),
      sheet_id: g.plan_sheet_id || g.schedule_sheet_id || null,
      attrs_text: Object.entries(specs).map(([k, v]) => `${k} ${v}`).join(" · "),
    });
  }

  lines.sort((a, b) => {
    const ba = buildingSortKey(a.building || a.family);
    const bb = buildingSortKey(b.building || b.family);
    if (ba !== bb) return ba.localeCompare(bb, undefined, { numeric: true });
    const sa = serviceSortKey(a.table_title || a.family);
    const sb = serviceSortKey(b.table_title || b.family);
    if (sa !== sb) return sa - sb;
    const sheetA = sheetSortKey(a.sheet_id || a.schedule_sheet_id);
    const sheetB = sheetSortKey(b.sheet_id || b.schedule_sheet_id);
    if (sheetA !== sheetB) return sheetA - sheetB;
    const at = a.tag || a.type || "";
    const bt = b.tag || b.type || "";
    return at.localeCompare(bt, undefined, { numeric: true, sensitivity: "base" });
  });
  return lines;
}

export function compiledTakeoffToCsv(lines) {
  // One CSV with union of columns — Excel export prefers per-family sheets.
  const lead = takeoffLeadColumns(lines);
  const specCols = takeoffSpecColumns(lines);
  const header = [
    ...lead.map((c) => c.label),
    ...specCols,
    "Plan sheet", "Schedule sheet", "Schedule", "Status", "Notes", "Workflow",
  ];
  const out = [header.map(esc).join(",")];
  for (const r of lines || []) {
    out.push([
      ...lead.map((c) => lineLeadValue(r, c.key)),
      ...specCols.map((c) => lineSpecValue(r, c)),
      r.plan_sheet_id || "",
      r.schedule_sheet_id || "",
      r.table_title || "",
      r.status || "",
      r.notes || "",
      r.workflow || "",
    ].map(esc).join(","));
  }
  return out.join("\n");
}

/** Evidence / workflow-data CSV (EAV). */
export function workflowDataToCsv(rows) {
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

/** @deprecated Prefer compiledTakeoffToCsv for the Takeoff tab. */
export function takeoffToCsv(rows) {
  return workflowDataToCsv(rows);
}

export function downloadTakeoffCsv(linesOrRows, filename = "takeoff.csv", { mode = "compiled" } = {}) {
  const text = mode === "workflow" ? workflowDataToCsv(linesOrRows) : compiledTakeoffToCsv(linesOrRows);
  downloadText(filename, text, "text/csv;charset=utf-8");
}

export async function downloadTakeoffXlsx(linesOrRows, filename = "takeoff.xlsx", { mode = "compiled" } = {}) {
  let sheets;
  if (mode === "workflow") {
    sheets = [{
      name: "Workflow data",
      rows: [
        ["Tag", "Field", "Value", "Unit", "Sheet", "Schedule", "Column", "Workflow", "Source"],
        ...(linesOrRows || []).map((r) => [
          r.tag || "", r.field || "", typeof r.value === "number" ? r.value : (r.value ?? ""),
          r.unit || "", r.sheet_id || "", r.table_title || "", r.column || "", r.workflow || "", r.source_tool || "",
        ]),
      ],
    }];
  } else {
    // One worksheet per schedule/family — columns adapt to that family's fields only.
    const groups = groupTakeoffByFamily(linesOrRows || []);
    sheets = (groups.length ? groups : [{ family: "Takeoff", lines: [], leadColumns: [], specColumns: [] }]).map((g) => {
      const lead = g.leadColumns || takeoffLeadColumns(g.lines);
      const cols = g.specColumns || takeoffSpecColumns(g.lines);
      const header = [
        ...lead.map((c) => c.label),
        ...cols,
        "Plan sheet", "Schedule sheet", "Status", "Notes",
      ];
      return {
        name: g.family || "Takeoff",
        rows: [
          header,
          ...(g.lines || []).map((r) => [
            ...lead.map((c) => {
              const v = lineLeadValue(r, c.key);
              return c.key === "qty" && typeof v === "number" ? v : v;
            }),
            ...cols.map((c) => lineSpecValue(r, c)),
            r.plan_sheet_id || "",
            r.schedule_sheet_id || "",
            r.status || "",
            r.notes || "",
          ]),
        ],
      };
    });
  }
  const bytes = await buildXlsx(sheets);
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

/** Build takeoff PDF bytes. Compiled mode: one table per family with that family's columns. */
export async function buildTakeoffPdfBytes(linesOrRows, {
  title = "Takeoff",
  projectName = "",
  mode = "compiled",
} = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 28;
  const lineH = 12;
  const list = linesOrRows || [];

  const clip = (text, maxW, size = 8) => {
    const s = String(text ?? "");
    if (font.widthOfTextAtSize(s, size) <= maxW) return s;
    let out = s;
    while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxW) out = out.slice(0, -1);
    return `${out}…`;
  };

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const newPage = () => { page = doc.addPage([pageWidth, pageHeight]); y = pageHeight - margin; };
  const ensure = (need) => { if (y < margin + need) newPage(); };

  page.drawText(title, { x: margin, y, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.15) });
  y -= 14;
  if (projectName) {
    page.drawText(String(projectName), { x: margin, y, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
    y -= 12;
  }
  page.drawText(`Generated ${new Date().toLocaleString()} · ${list.length} line${list.length === 1 ? "" : "s"}`, {
    x: margin, y, size: 8, font, color: rgb(0.45, 0.45, 0.5),
  });
  y -= 16;

  if (mode === "workflow") {
    const headers = ["Tag", "Field", "Value", "Unit", "Sheet", "Schedule"];
    const colWidths = [70, 110, 90, 40, 150, 140];
    ensure(40);
    let x = margin;
    headers.forEach((h, i) => {
      page.drawText(h, { x, y, size: 8, font: fontBold, color: rgb(0.15, 0.15, 0.2) });
      x += colWidths[i];
    });
    y -= 10;
    for (const r of list) {
      ensure(lineH);
      const vals = [r.tag || "—", r.field || "", r.value ?? "", r.unit || "", r.sheet_id || "", r.table_title || ""];
      let xx = margin;
      vals.forEach((v, i) => {
        page.drawText(clip(v, colWidths[i] - 4), { x: xx, y, size: 8, font, color: rgb(0.12, 0.12, 0.16) });
        xx += colWidths[i];
      });
      y -= lineH;
    }
  } else {
    for (const group of groupTakeoffByFamily(list)) {
      ensure(36);
      page.drawText(String(group.family), { x: margin, y, size: 10, font: fontBold, color: rgb(0.15, 0.15, 0.2) });
      y -= 14;
      const lead = (group.leadColumns || takeoffLeadColumns(group.lines)).filter((c) => c.key !== "unit");
      const specs = (group.specColumns || []).slice(0, Math.max(2, 6 - lead.length));
      const headers = [...lead.map((c) => c.label), ...specs, "Plan", "Status"];
      const usable = pageWidth - margin * 2;
      const n = headers.length;
      const base = Math.floor(usable / Math.max(n, 1));
      const colWidths = headers.map((_, i) => (i === 0 ? Math.max(base, 64) : base));
      const drift = usable - colWidths.reduce((a, b) => a + b, 0);
      if (colWidths.length) colWidths[colWidths.length - 1] += drift;
      ensure(20);
      let x = margin;
      headers.forEach((h, i) => {
        page.drawText(clip(h, colWidths[i] - 3, 7), { x, y, size: 7, font: fontBold, color: rgb(0.2, 0.2, 0.25) });
        x += colWidths[i];
      });
      y -= 9;
      page.drawLine({
        start: { x: margin, y }, end: { x: pageWidth - margin, y },
        thickness: 0.6, color: rgb(0.75, 0.75, 0.78),
      });
      y -= 10;
      for (const r of group.lines) {
        ensure(lineH);
        const vals = [
          ...lead.map((c) => lineLeadValue(r, c.key)),
          ...specs.map((c) => lineSpecValue(r, c)),
          r.plan_sheet_id || r.schedule_sheet_id || "", r.status || "",
        ];
        let xx = margin;
        vals.forEach((v, i) => {
          page.drawText(clip(v, (colWidths[i] || 50) - 3), { x: xx, y, size: 8, font, color: rgb(0.12, 0.12, 0.16) });
          xx += colWidths[i] || 50;
        });
        y -= lineH;
      }
      y -= 10;
    }
  }

  return doc.save();
}

export async function downloadTakeoffPdf(linesOrRows, {
  filename = "takeoff.pdf",
  title = "Takeoff",
  projectName = "",
  mode = "compiled",
} = {}) {
  const bytes = await buildTakeoffPdfBytes(linesOrRows, { title, projectName, mode });
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
