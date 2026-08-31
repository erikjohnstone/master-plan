/**
 * Schedule ↔ plan reconciliation table (shared UI + MCP path).
 * Converts schedule rows + sweep_schedule_row results into contractor-grade
 * reconcile lines: Tag · Family · Scheduled qty · Installed qty · Status · cites.
 *
 * Set-agnostic — no sheet IDs or locked counts in product code.
 */
import { scheduleTitleMatches } from "./scheduleTitleMatch.mjs";

/** @typedef {"MATCH"|"SCHEDULE_ONLY"|"PLAN_ONLY"|"REFUSED_NO_SCALE"|"REFUSED_NO_TEXT"|"AMBIGUOUS"} ReconcileStatus */

/**
 * @param {object} p
 * @param {number} p.scheduledQty
 * @param {number} p.installedQty
 * @param {"resolved"|"refused"|"error"|undefined} [p.itemStatus]
 * @param {string|null|undefined} [p.failureType]
 * @param {string|null|undefined} [p.reason]
 * @returns {ReconcileStatus}
 */
export function classifyReconcileStatus({
  scheduledQty,
  installedQty,
  itemStatus,
  failureType,
  reason,
}) {
  const r = String(reason || "");
  if (failureType === "REFUSED_NO_SCALE" || /\bset the scale\b|REFUSED_NO_SCALE/i.test(r)) {
    return "REFUSED_NO_SCALE";
  }
  if (failureType === "AMBIGUOUS_ROW_KEY" || /ambiguous:.*schedule rows carry the key/i.test(r)) {
    return "AMBIGUOUS";
  }
  if (/exploded|vector-path|not drawable text|raw vector-path letterforms/i.test(r)) {
    return "REFUSED_NO_TEXT";
  }
  if (itemStatus === "resolved" && installedQty > 0 && scheduledQty > 0) {
    if (installedQty >= scheduledQty) return "MATCH";
    return "SCHEDULE_ONLY";
  }
  if (scheduledQty > 0 && installedQty === 0) {
    if (/not drawn on any plan/i.test(r)) return "SCHEDULE_ONLY";
    if (itemStatus === "refused") return "SCHEDULE_ONLY";
    return "SCHEDULE_ONLY";
  }
  if (installedQty > 0 && scheduledQty === 0) return "PLAN_ONLY";
  return "SCHEDULE_ONLY";
}

function scheduledQtyFromRow(row) {
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (/^(QTY|QUANTITY|NO\.|COUNT|#)$/i.test(String(header || "").trim())) {
      const n = parseInt(String(cell?.text || "").trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 1;
}

function rowIdentityTag(row) {
  const id = row?.identity?.text || row?.identity?.key;
  if (id) return String(id).trim();
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (/^(MARK|TAG|SYMBOL|VALVE MARK|ID|KEY|UNIT MARK|EQUIP)$/i.test(String(header || "").trim())) {
      const t = String(cell?.text || "").trim();
      if (t) return t;
    }
  }
  return null;
}

/**
 * Build reconcile rows from buildPlanSetTakeoff items (installed sweep path).
 * @param {Array<object>} items TakeoffItem[]
 * @param {Array<object>} [failures] TakeoffFailure[]
 * @returns {Array<object>}
 */
export function reconcileRowsFromTakeoffItems(items, failures = []) {
  const failByTag = new Map();
  for (const f of failures || []) {
    if (f?.tag) failByTag.set(f.tag, f);
  }
  return (items || []).map((item) => {
    const scheduledQty = 1;
    const installedQty = item.status === "resolved" ? (item.quantity ?? 0) : 0;
    const fail = failByTag.get(item.tag);
    const status = classifyReconcileStatus({
      scheduledQty,
      installedQty,
      itemStatus: item.status,
      failureType: fail?.type,
      reason: item.reason || fail?.detail,
    });
    return {
      tag: item.tag,
      family: item.equipment_type || item.category || null,
      scheduled_qty: scheduledQty,
      installed_qty: installedQty,
      status,
      schedule_cite: item.schedule
        ? {
            sheet: item.schedule.sheet,
            title: item.schedule.title,
            kind: item.schedule.kind,
          }
        : null,
      plan_cites: (item.drawing_locations || []).map((loc) => ({
        sheet: loc.sheet,
        at: loc.at,
      })),
      reason: item.reason || fail?.detail || null,
    };
  });
}

/**
 * Summarize reconcile rows for agent answers / takeoff tab headers.
 * @param {Array<object>} rows
 */
export function summarizeReconcile(rows) {
  const summary = {
    total: rows.length,
    match: 0,
    schedule_only: 0,
    plan_only: 0,
    refused_no_scale: 0,
    refused_no_text: 0,
    ambiguous: 0,
  };
  for (const row of rows || []) {
    switch (row.status) {
      case "MATCH": summary.match++; break;
      case "SCHEDULE_ONLY": summary.schedule_only++; break;
      case "PLAN_ONLY": summary.plan_only++; break;
      case "REFUSED_NO_SCALE": summary.refused_no_scale++; break;
      case "REFUSED_NO_TEXT": summary.refused_no_text++; break;
      case "AMBIGUOUS": summary.ambiguous++; break;
      default: break;
    }
  }
  return summary;
}

/**
 * Schedule-side reconcile scaffold from extracted graph tables (no plan sweep).
 * Used when sweeps are supplied separately via sweepByTag map.
 * @param {object} graph sheet graph
 * @param {{ label?: string, title?: string, titleRe?: RegExp, exclude?: RegExp }} needle
 * @param {Map<string, { installedQty?: number, itemStatus?: string, reason?: string, failureType?: string, planCites?: object[] }>} [sweepByTag]
 */
export function reconcileScheduleFamilyFromGraph(graph, needle, sweepByTag = new Map()) {
  const rows = [];
  for (const table of graph?.tables || []) {
    const title = String(table.title?.text || "");
    if (table.kind !== "equipment") continue;
    if (needle?.titleRe && !scheduleTitleMatches(title, needle.titleRe, needle.exclude)) continue;
    if (needle?.title && !scheduleTitleMatches(title, needle.title, needle.exclude)) continue;
    for (const row of table.rows || []) {
      const tag = rowIdentityTag(row);
      if (!tag) continue;
      const scheduledQty = scheduledQtyFromRow(row);
      const sweep = sweepByTag.get(tag) || {};
      const installedQty = sweep.installedQty ?? 0;
      const status = classifyReconcileStatus({
        scheduledQty,
        installedQty,
        itemStatus: sweep.itemStatus,
        failureType: sweep.failureType,
        reason: sweep.reason,
      });
      rows.push({
        tag,
        family: needle?.label || null,
        scheduled_qty: scheduledQty,
        installed_qty: installedQty,
        status,
        schedule_cite: {
          sheet: table.sheet,
          title: table.title?.text || null,
          kind: table.kind,
        },
        plan_cites: sweep.planCites || [],
        reason: sweep.reason || null,
      });
    }
  }
  return rows;
}

/** Map user family word → schedule needle via HVAC_FAMILY_SPECS (set-agnostic). */
export function familyNeedleFromSpecs(specs, family) {
  const raw = String(family || "").trim();
  if (!raw) return null;
  const u = raw.toUpperCase();
  const aliases = {
    VAV: "VAV",
    FCU: "FCU",
    AHU: "AHU",
    PUMP: "PUMP",
    RTU: "RTU",
    FAN: "FAN",
  };
  const key = aliases[u] || Object.keys(specs).find((k) =>
    k === u || k.replace(/_/g, " ") === u.replace(/_/g, " "));
  if (!key || !specs[key]) return null;
  return { label: key.replace(/_/g, " "), ...specs[key] };
}

/**
 * Reconcile one schedule family with selective sweep_schedule_row calls (shared Session path).
 * @param {object} session Session with sweepScheduleRow(tag, opts)
 * @param {object} graph
 * @param {object} needle schedule family needle (titleRe, exclude, label)
 * @param {{ tags?: string[], evaluationFast?: boolean, sweepAll?: boolean }} [opts]
 */
export async function reconcileScheduleFamilyWithSweeps(session, graph, needle, opts = {}) {
  const scaffold = reconcileScheduleFamilyFromGraph(graph, needle, new Map());
  const tagFilter = opts.tags?.length
    ? new Set(opts.tags.map((t) => String(t).trim().toUpperCase()))
    : null;
  const sweepAll = opts.sweepAll === true || (!tagFilter && opts.sweepAll !== false);
  const sweepByTag = new Map();
  for (const row of scaffold) {
    const shouldSweep = tagFilter ? tagFilter.has(row.tag.toUpperCase()) : sweepAll;
    if (!shouldSweep) continue;
    try {
      const r = await session.sweepScheduleRow(row.tag, {
        commit: false,
        evaluationFast: !!opts.evaluationFast,
      });
      sweepByTag.set(row.tag, {
        installedQty: r.found ?? 0,
        itemStatus: "resolved",
        planCites: (r.sheets || []).flatMap((ps) =>
          (ps.matches || []).map((m) => ({ sheet: ps.sheet, at: m.at })),
        ),
      });
    } catch (e) {
      sweepByTag.set(row.tag, {
        installedQty: 0,
        itemStatus: "refused",
        reason: e?.message || String(e),
      });
    }
  }
  const rows = reconcileScheduleFamilyFromGraph(graph, needle, sweepByTag);
  return {
    rows,
    summary: summarizeReconcile(rows),
    family_filter: needle?.label || null,
  };
}

/** CSV header row for contractor reconcile export. */
export const RECONCILE_CSV_HEADERS = [
  "Tag",
  "Family",
  "Scheduled qty",
  "Installed qty",
  "Status",
  "Schedule sheet",
  "Schedule title",
  "Plan sheet(s)",
  "Notes",
];

/**
 * @param {Array<object>} rows
 * @returns {string}
 */
export function reconcileRowsToCsv(rows) {
  const lines = [RECONCILE_CSV_HEADERS.join(",")];
  for (const row of rows || []) {
    const planSheets = [...new Set((row.plan_cites || []).map((c) => c.sheet).filter(Boolean))].join("; ");
    lines.push([
      row.tag,
      row.family || "",
      row.scheduled_qty,
      row.installed_qty,
      row.status,
      row.schedule_cite?.sheet || "",
      row.schedule_cite?.title || "",
      planSheets,
      (row.reason || "").replace(/"/g, '""'),
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return `${lines.join("\n")}\n`;
}
