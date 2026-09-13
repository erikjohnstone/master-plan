/**
 * Schedule ↔ plan reconciliation table (shared UI + MCP path).
 * Converts schedule rows + sweep_schedule_row results into contractor-grade
 * reconcile lines: Tag · Family · Scheduled qty · Installed qty · Status · cites.
 *
 * Set-agnostic — no sheet IDs or locked counts in product code.
 */
import { scheduleTitleMatches } from "./scheduleTitleMatch.mjs";
import { normalizeEquipMark, expandAmpersandEquipMarks } from "./corpusTakeoff.mjs";

/** @typedef {"MATCH"|"SCHEDULE_ONLY"|"PLAN_ONLY"|"REFUSED_NO_SCALE"|"REFUSED_NO_TEXT"|"AMBIGUOUS"} ReconcileStatus */

/**
 * Quantity-semantics policy: these schedule families assign a unique mark to
 * one physical asset. Repeated appearances are normally plan/detail/section
 * views of that asset, unlike diffuser/register type marks that intentionally
 * repeat for every installed device. This belongs with reconciliation—not
 * geometric recognition—so every UI/MCP quantity path consumes one policy.
 */
export function isIndividuallyMarkedEquipmentSchedule(title, equipmentFamily = "") {
  const squashed = `${String(title || "")} ${String(equipmentFamily || "")}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /(?:AIRHANDLING|AIRTERMINALBOX|COMPUTERROOMAIRHANDLER|CRAH|DEDICATEDOUT(?:SIDE|DOOR)AIR|FANCOIL|VARIABLEAIRVOLUME|VAV(?:BOX|TERMINAL|UNIT|SCHEDULE)|ENERGYRECOVERY|ROOFTOP|CONDENSINGUNIT|HEATPUMP|PUMP|BOILER|CHILLER|UNITHEATER|DEHUMIDIFIER|HUMIDIFIER|AIRSEPARATOR|EXPANSIONTANK|RADIANT(?:HEATER|PANEL)|RANGEHOOD|CONTROLVALVE|FANSCHEDULE|DUCTSILENCER|SOUNDATTENUATOR)/.test(squashed)
    && !/(?:DIFFUSER|GRILLE|REGISTER|FIXTURE|LUMINAIRE)/.test(squashed);
}

/**
 * A repeatable air-device schedule defines plan type marks, not individually
 * numbered assets. Keeping this policy with reconciliation prevents quantity
 * semantics from becoming an accidental symbol-matcher dependency.
 */
export function isRepeatableAirDeviceSchedule(title) {
  const squashed = String(title || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /(?:DIFFUSER|GRILLE|REGISTER|AIRDEVICE)/.test(squashed)
    && !/(?:VAV|VARIABLEAIRVOLUME|TERMINALUNIT)/.test(squashed);
}

/**
 * Exact tag occurrences can establish a repeatable air-device population only
 * when the authored family is substantial across the set and on every active
 * sheet. A lone note or small isolated cluster never becomes installed qty.
 */
export function hasRepeatableAirDevicePlacementQuorum(activeSheetFamilyCounts, setFamilyCount) {
  return activeSheetFamilyCounts.length > 0
    && setFamilyCount >= 10
    && activeSheetFamilyCounts.every((count) => Number.isFinite(count) && count >= 4);
}

/**
 * Read an explicit drafting multiplier attached to one tag callout. Both
 * `TYP 8` and a parenthesized quantity inside the reconstructed tag bbox are
 * authored quantity evidence; unrelated numbered notes are ignored.
 */
export function scheduleCountMultiplier(spans, tagBox) {
  const [x0, y0, x1, y1] = tagBox;
  const tagCx = (x0 + x1) / 2;
  const tagH = Math.max(1, y1 - y0);
  for (const span of spans) {
    const match = String(span.str || "").trim().match(/^\((\d{1,3})\)(?:\s|$)/);
    if (!match) continue;
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count < 2 || count > 100) continue;
    const verticalOverlap = Math.min(y1, span.y1) - Math.max(y0, span.y0);
    const horizontalOverlap = Math.min(x1, span.x1) - Math.max(x0, span.x0);
    if (verticalOverlap >= Math.min(tagH, Math.max(1, span.y1 - span.y0)) * 0.7
      && horizontalOverlap > 0) return count;
  }
  for (const span of spans) {
    const match = String(span.str || "").trim().match(/^TYP(?:ICAL)?\.?\s*(?:X\s*)?(\d{1,3})$/i);
    if (!match) continue;
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count < 2 || count > 100) continue;
    const spanCx = (span.x0 + span.x1) / 2;
    const spanH = Math.max(1, span.y1 - span.y0);
    const verticalGap = Math.max(0, span.y0 - y1, y0 - span.y1);
    const horizontalOverlap = Math.min(x1, span.x1) - Math.max(x0, span.x0);
    const aligned = horizontalOverlap >= 0
      || Math.abs(spanCx - tagCx) <= Math.max(x1 - x0, span.x1 - span.x0) * 0.75;
    if (aligned && verticalGap <= Math.max(tagH, spanH) * 1.5) return count;
  }
  return 1;
}

/**
 * Recover an exact `(N) TAG` assembled from adjacent text runs. This only
 * starts from a parenthesized count and only joins prefixes of the requested
 * mark on the same baseline, so it cannot manufacture a tag from prose.
 */
export function countPrefixedScheduleTagOccurrences(spans, key) {
  const stripHyphen = (value) => value.replace(/-/g, "");
  const target = stripHyphen(String(key || "").trim().toUpperCase());
  if (!target) return [];
  const normalized = (value) => String(value || "").trim().toUpperCase();
  const out = [];
  for (const start of spans) {
    const prefixed = normalized(start.str).match(/^\((\d{1,3})\)\s*(.+)$/);
    if (!prefixed) continue;
    const count = Number(prefixed[1]);
    let text = prefixed[2];
    if (!Number.isInteger(count) || count < 2 || count > 100
      || !text || !target.startsWith(stripHyphen(text))) continue;
    let x0 = start.x0; let y0 = start.y0; let x1 = start.x1; let y1 = start.y1;
    let current = start;
    const used = new Set([start]);
    for (let guard = 0; stripHyphen(text).length < target.length && guard < 4; guard++) {
      const h = Math.max(current.y1 - current.y0, 6);
      const next = spans
        .filter((span) => {
          if (used.has(span)) return false;
          const candidate = text + normalized(span.str);
          return target.startsWith(stripHyphen(candidate))
            && Math.abs(span.y0 - current.y0) < h * 0.4
            && span.x0 >= current.x0 - 1
            && span.x0 - current.x1 < h * 1.5;
        })
        .sort((a, b) => Math.abs(a.x0 - current.x1) - Math.abs(b.x0 - current.x1))[0];
      if (!next) break;
      used.add(next);
      text += normalized(next.str);
      x0 = Math.min(x0, next.x0); y0 = Math.min(y0, next.y0);
      x1 = Math.max(x1, next.x1); y1 = Math.max(y1, next.y1);
      current = next;
    }
    if (stripHyphen(text) === target) {
      out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: Math.max(y1 - y0, 6), bbox: [x0, y0, x1, y1] });
    }
  }
  return out;
}

/**
 * @param {object} p
 * @param {number|null} p.scheduledQty
 * @param {number|null} p.installedQty
 * @param {"resolved"|"refused"|"error"|undefined} [p.itemStatus]
 * @param {string|null|undefined} [p.failureType]
 * @param {string|null|undefined} [p.reason]
 * @param {boolean} [p.scheduleDefinitionOnly]
 * @returns {ReconcileStatus}
 */
export function classifyReconcileStatus({
  scheduledQty,
  installedQty,
  itemStatus,
  failureType,
  reason,
  scheduleDefinitionOnly = false,
}) {
  const r = String(reason || "");
  if (failureType === "REFUSED_NO_SCALE" || /\bset the scale\b|REFUSED_NO_SCALE/i.test(r)) {
    return "REFUSED_NO_SCALE";
  }
  if (failureType === "AMBIGUOUS_ROW_KEY" || /ambiguous:.*schedule rows carry the key/i.test(r)) {
    return "AMBIGUOUS";
  }
  if (failureType === "INCOMPLETE_PLAN_SEARCH" || /plan search incomplete|count is a floor|candidate work cap/i.test(r)) {
    return "AMBIGUOUS";
  }
  if (/exploded|vector-path|not drawable text|raw vector-path letterforms/i.test(r)) {
    return "REFUSED_NO_TEXT";
  }
  if (scheduleDefinitionOnly) {
    if (itemStatus === "error") return "AMBIGUOUS";
    if (itemStatus === "resolved" && installedQty != null) {
      return installedQty > 0 ? "MATCH" : "SCHEDULE_ONLY";
    }
    return "SCHEDULE_ONLY";
  }
  if (scheduledQty == null || /unparseable.*qty|qty.*unparseable/i.test(r)) {
    return "AMBIGUOUS";
  }
  if (itemStatus === "resolved" && installedQty > 0 && scheduledQty > 0) {
    if (installedQty >= scheduledQty) return "MATCH";
    return "SCHEDULE_ONLY";
  }
  if (scheduledQty > 0 && installedQty === 0) {
    if (/not drawn on any plan|cannot be geometrically anchored/i.test(r)) return "SCHEDULE_ONLY";
    if (itemStatus === "refused") return "SCHEDULE_ONLY";
    return "SCHEDULE_ONLY";
  }
  if (installedQty > 0 && scheduledQty === 0) return "PLAN_ONLY";
  return "SCHEDULE_ONLY";
}

/**
 * Classify a BAS served-equipment / inventory sweep outcome for plan paint.
 * Unanchorable tags (I/O device keys not on a schedule row, or not drawn on
 * plan) are honest SCHEDULE_ONLY — never ERROR and never invented MATCH.
 *
 * @param {{ result?: object|null, error?: Error|string|null }} p
 * @returns {{ status: ReconcileStatus|"ERROR", found: number, cites: number, reason?: string }}
 */
export function classifyBasServedSweepOutcome({ result = null, error = null } = {}) {
  if (error) {
    const msg = String(error?.message || error);
    const status = classifyReconcileStatus({
      scheduledQty: 1,
      installedQty: 0,
      itemStatus: "refused",
      reason: msg,
    });
    // classifyReconcileStatus maps unanchored/not-drawn to SCHEDULE_ONLY.
    if (status === "SCHEDULE_ONLY" || /cannot be geometrically anchored|not drawn on any plan/i.test(msg)) {
      return { status: "SCHEDULE_ONLY", found: 0, cites: 0, reason: msg.slice(0, 240) };
    }
    if (status === "AMBIGUOUS" || /ambiguous:/i.test(msg)) {
      return { status: "AMBIGUOUS", found: 0, cites: 0, reason: msg.slice(0, 240) };
    }
    if (status === "REFUSED_NO_SCALE" || status === "REFUSED_NO_TEXT") {
      return { status, found: 0, cites: 0, reason: msg.slice(0, 240) };
    }
    return { status: "ERROR", found: 0, cites: 0, reason: msg.slice(0, 240) };
  }
  const found = Number(result?.found ?? 0) || 0;
  const cites = (result?.sheets || []).flatMap((ps) => ps.matches || []).length;
  if (found >= 1 && cites >= 1) {
    return { status: "MATCH", found, cites };
  }
  return {
    status: "SCHEDULE_ONLY",
    found,
    cites,
    reason: "no_plan_hits",
  };
}

/**
 * Read a printed QTY/QUANTITY/NO./COUNT/# cell off a schedule row — the
 * scheduled quantity a printed table actually states, as opposed to "one
 * schedule row exists" — plus whether that reading is a genuine refusal
 * (the column exists but its cell will not parse as a positive integer) as
 * distinct from the column being genuinely absent (no such row exists to be
 * ambiguous about). "1" is returned either way for callers that only want a
 * number; `refused`/`reason` let a caller disclose the difference instead of
 * silently guessing on a printed-but-unparseable cell.
 *
 * Tolerates BOTH real row shapes in this codebase: a sheetgraph.ts TableRow's
 * `cells` (`{ header: { text, bbox } }`) and a mcp/src/takeoff.ts TakeoffItem's
 * `schedule_row` (`{ header: string }`, flat text, no bbox) — a cell entry is
 * read as `cell.text` when it's an object, else as the entry itself.
 * @param {{ cells?: Record<string, { text?: string } | string> }} row
 * @param {{ typeDefinition?: boolean }} [opts]
 * @returns {{ qty: number|null, refused: boolean, reason: string|null,
 *   basis: "printed_schedule_quantity"|"one_per_unique_schedule_row"|"unparseable_printed_quantity"|"type_definition_not_quantity",
 *   source_header: string|null, source_text: string|null }}
 */
export function scheduledQtyStatusFromRow(row, opts = {}) {
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    // The trailing period is a real drafting spelling, not a typo — this
    // pattern already admits "NO." for exactly that reason, and "QTY." was
    // simply missing: 028_TX_Renovation_of_Building_615's own NOISE CONTROL
    // DUCT SILENCER SCHEDULE heads its count column "QTY.", so every one of
    // its 16 rows refused its printed count and reported 1 instead (16
    // silencers where the sheet prints 23).
    if (!/^(QTY|QUANTITY|COUNT|NO|#)\.?$/i.test(String(header || "").trim())) continue;
    const text = cell && typeof cell === "object" ? cell.text : cell;
    const raw = String(text || "").trim();
    // A QTY column with an empty or polluted cell is materially different
    // from a schedule with no QTY column. Refuse instead of silently treating
    // the physical row as one unit.
    if (/^[1-9]\d*$/.test(raw)) return {
      qty: Number(raw),
      refused: false,
      reason: null,
      basis: "printed_schedule_quantity",
      source_header: String(header).trim(),
      source_text: raw,
    };
    return {
      // Legacy numeric callers retain one-row cardinality, while `refused`
      // prevents this fallback from being presented as a scheduled quantity.
      qty: 1,
      refused: true,
      reason: raw
        ? `QTY column present but unparseable ("${raw}")`
        : "QTY column present but blank",
      basis: "unparseable_printed_quantity",
      source_header: String(header).trim(),
      source_text: raw || null,
    };
  }
  if (opts.typeDefinition) {
    return {
      qty: null,
      refused: false,
      reason: null,
      basis: "type_definition_not_quantity",
      source_header: null,
      source_text: null,
    };
  }
  return {
    qty: 1,
    refused: false,
    reason: null,
    basis: "one_per_unique_schedule_row",
    source_header: null,
    source_text: null,
  };
}

/**
 * Bare-number convenience over {@link scheduledQtyStatusFromRow} for the two
 * existing reconcile producers, which have no status/reason column to carry
 * a refusal disclosure — exported so corpusTakeoff.mjs's compile path reads
 * the SAME quantity reconcile does, two producers, one meaning, never two.
 * @param {{ cells?: Record<string, { text?: string } | string> }} row
 * @returns {number}
 */
export function scheduledQtyFromRow(row) {
  return scheduledQtyStatusFromRow(row).qty;
}

/**
 * Resolve the row's own device identity while retaining row.key as a legacy
 * lookup alias. A qualified device column such as VALVE MARK outranks the
 * served-equipment cross-reference in UNIT MARK.
 * @param {object} row
 * @param {RegExp|null} [identityHeaderRe]
 * @returns {string|null}
 */
export function rowIdentityTag(row, identityHeaderRe = null) {
  // Return RAW mark text — normalizeEquipMark runs AFTER comma/slash split
  // (parity with compile uniqueFamily). Normalizing "AHU-1, HP-1" first would
  // strip to "AHU-1" and drop the outdoor HP half.
  // Family-specific identity (e.g. VALVE MARK on HHW/CHW control-valve
  // schedules) must beat UNIT MARK / row.key — Object.entries order would
  // otherwise return the served equipment and inflate reconcile vs compile.
  if (identityHeaderRe) {
    for (const [header, cell] of Object.entries(row?.cells || {})) {
      if (!identityHeaderRe.test(String(header || "").trim())) continue;
      const t = String(cell?.text || "").trim();
      if (t) return t;
    }
  }
  // Prefer VALVE MARK before UNIT MARK when both columns exist (NAVFAC HHW/CHW).
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (/^VALVE\s*MARK$/i.test(String(header || "").trim())) {
      const t = String(cell?.text || "").trim();
      if (t) return t;
    }
  }
  const id = row?.identity?.text || row?.identity?.key;
  if (id) return String(id).trim();
  // Prefer MARK / EQUIP.TAG — bare TAG is often a grille type code on mixed sheets.
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (/^(MARK|SYMBOL|UNIT MARK|EQUIP|DESIGNATION|UNIT NO|EQUIP NO|UNIT TAG|EQUIP\.?\s*TAG|ITEM NO)$/i.test(String(header || "").trim())) {
      const t = String(cell?.text || "").trim();
      if (t) return t;
    }
  }
  // Ampersand-paired TAG ("RF-1 & 2") beats a glued row.key ("RF-12").
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (!/^TAG$/i.test(String(header || "").trim())) continue;
    const t = String(cell?.text || "").trim();
    if (t && /&/.test(t) && /^[A-Za-z]{1,8}[\s\-]?\d/i.test(t)) return t;
  }
  // Parity with compile uniqueFamily — extractor often puts the mark on row.key.
  const key = String(row?.key || "").trim();
  return key || null;
}

/**
 * Build reconcile rows from buildPlanSetTakeoff items (installed sweep path).
 * @param {Array<object>} items TakeoffItem[]
 * @param {Array<object>} [failures] TakeoffFailure[]
 * @returns {Array<object>}
 */

/**
 * Sweep a BAS served / HVAC inventory mark on the shared Session path.
 * Pass preferTitle / preferSheet when the caller already knows the owning
 * schedule (cross-family building letters like Carson B1 on furnace + CU +
 * OAU) so the sweep does not refuse AMBIGUOUS when preference uniquely
 * resolves. Never invents MATCH — outcome goes through classifyBasServedSweepOutcome.
 *
 * @param {object} session Session with sweepScheduleRow
 * @param {string} tag
 * @param {{ commit?: boolean, evaluationFast?: boolean, preferTitle?: string|null, preferSheet?: string|null }} [opts]
 */
export async function sweepBasServedMark(session, tag, opts = {}) {
  try {
    const result = await session.sweepScheduleRow(tag, {
      commit: !!opts.commit,
      evaluationFast: opts.evaluationFast !== false,
      preferTitle: opts.preferTitle || null,
      preferSheet: opts.preferSheet || null,
    });
    return classifyBasServedSweepOutcome({ result });
  } catch (error) {
    return classifyBasServedSweepOutcome({ error });
  }
}


export function reconcileRowsFromTakeoffItems(items, failures = []) {
  const failByTag = new Map();
  for (const f of failures || []) {
    if (f?.tag) failByTag.set(f.tag, f);
  }
  return (items || []).map((item) => {
    // item.schedule_row is TakeoffItem's raw extracted cell data (flat
    // { header: string }, mcp/src/takeoff.ts:75) when the item came from a
    // real schedule row — read its printed QTY cell exactly like the compile
    // path does; a synthesized/legend-only item with no backing row still
    // defaults to 1 (one row = one unit), unchanged.
    const scheduleDefinitionOnly = isRepeatableAirDeviceSchedule(item.schedule?.title || "");
    const qtyStatus = item.schedule_row
      ? scheduledQtyStatusFromRow({ cells: item.schedule_row }, { typeDefinition: scheduleDefinitionOnly })
      : scheduledQtyStatusFromRow({ cells: {} });
    const scheduledQty = qtyStatus.refused ? null : qtyStatus.qty;
    // A refused/error sweep proves only that installed quantity could not be
    // verified.  It does not prove zero devices exist on the plans.  Keep the
    // quantity unknown so UI, MCP, Agent evidence, and CSV never turn a
    // coverage gap into a confident zero.
    const installedQty = item.status === "resolved" ? (item.quantity ?? 0) : null;
    const fail = failByTag.get(item.tag);
    const status = classifyReconcileStatus({
      scheduledQty,
      installedQty,
      itemStatus: item.status,
      failureType: fail?.type,
      reason: qtyStatus.reason || item.reason || fail?.detail,
      scheduleDefinitionOnly,
    });
    return {
      row_id: `${item.schedule?.sheet || "(none)"}::${item.tag}`,
      tag: item.tag,
      family: item.equipment_type || item.category || null,
      scheduled_qty: scheduledQty,
      scheduled_qty_basis: qtyStatus.basis,
      scheduled_qty_source_header: qtyStatus.source_header,
      scheduled_qty_source_text: qtyStatus.source_text,
      installed_qty: installedQty,
      placement_count: item.status === "resolved" ? (item.placement_count ?? null) : null,
      observed_plan_qty: item.plan_search_complete === false ? (item.quantity ?? null) : installedQty,
      installed_qty_basis: item.quantity_basis ?? null,
      search_scope: item.search_scope ?? null,
      unlabeled_audit_complete: item.unlabeled_audit_complete ?? null,
      plan_search_complete: item.plan_search_complete ?? null,
      status,
      quantity_comparison: scheduleDefinitionOnly
        ? "type_definition_vs_plan_count"
        : "scheduled_vs_installed",
      schedule_cite: item.schedule
        ? {
            sheet: item.schedule.sheet,
            title: item.schedule.title,
            kind: item.schedule.kind,
            ...(item.schedule.drawing_group ? { drawing_group: item.schedule.drawing_group } : {}),
          }
        : null,
      plan_cites: (item.drawing_locations || []).map((loc) => ({
        sheet: loc.sheet,
        at: loc.at,
        ...(loc.bbox ? { bbox: loc.bbox } : {}),
        ...(Number.isFinite(loc.score) ? { score: loc.score } : {}),
      })),
      reason: qtyStatus.reason || item.reason || fail?.detail
        || (scheduleDefinitionOnly
          ? "This schedule row defines a repeatable air-device type; it does not state project quantity. Installed quantity is grounded from plan callouts."
          : null),
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
 * @param {{ label?: string, title?: string, titleRe?: RegExp, exclude?: RegExp,
 *   keyRe?: RegExp, blankKeyRe?: RegExp, altTitleRe?: RegExp, altKeyRe?: RegExp,
 *   identityHeaderRe?: RegExp, titledOnly?: boolean }} needle
 * @param {Map<string, { installedQty?: number|null, itemStatus?: string, reason?: string, failureType?: string, planCites?: object[] }>} [sweepByTag]
 */
export function reconcileScheduleFamilyFromGraph(graph, needle, sweepByTag = new Map()) {
  const rows = [];
  const seen = new Set();
  const keyRe = needle?.keyRe || null;
  const blankKeyRe = needle?.blankKeyRe || null;
  const altTitleRe = needle?.altTitleRe || null;
  const altKeyRe = needle?.altKeyRe || null;
  // Titled family schedules first (parity with compile uniqueFamily) so shared
  // marks cite the device definition, not a blank/catch-all accessory row.
  for (const pass of [1, 2]) {
  for (const table of graph?.tables || []) {
    const title = String(table.title?.text || "");
    // Parity with compile uniqueFamily: do not gate on table.kind.
    // Title/keyRe already exclude finish/lighting/note tables; Valdosta
    // GRILLE SCHEDULE extracts as reference-kind but is still schedule truth.
    // Match compile's uniqueFamily gate: titled soft-match OR blank title with
    // a family keyRe (Transbay/Macon Bibb blank-title RAH/FCU/EF tables).
    const titleOk = needle?.titleRe
      ? scheduleTitleMatches(title, needle.titleRe, needle.exclude)
      : (needle?.title
        ? scheduleTitleMatches(title, needle.title, needle.exclude)
        : false);
    const altOk = Boolean(altTitleRe) && scheduleTitleMatches(title, altTitleRe, needle.exclude);
    const blankTitle = !title.trim();
    const catchAllSchedule = /MISCELLANEOUS(?:\s+EQUIPMENT)?\s+SCHEDULE|^(?:MECHANICAL\s+)?(?:SPECIALTY\s+)?EQUIPMENT\s+SCHEDULE$|^HYDRONIC\s+ACCESSORIES(?:\s+SCHEDULE)?$/i.test(title);
    const blankGate = blankKeyRe || keyRe;
    const keyGated = Boolean(keyRe || blankKeyRe || altKeyRe);
    // Parity with compile uniqueFamily: blank-title OR catch-all equipment /
    // miscellaneous schedules only when the family has a keyRe/blankKeyRe.
    // titledOnly families skip blank/catch-all (FIN_TUBE vs filter FTR).
    if (titleOk || altOk) {
      if (pass !== 1) continue;
    } else {
      if (pass !== 2) continue;
      if (needle?.titledOnly) continue;
      if (!(blankTitle && blankGate) && !(catchAllSchedule && keyGated)) continue;
    }
    const titledFilter = (altOk && altKeyRe) ? altKeyRe : keyRe;
    const filterRe = blankTitle ? blankGate : catchAllSchedule ? null : titledFilter;
    for (const row of table.rows || []) {
      const rawTag = rowIdentityTag(row, needle?.identityHeaderRe || null);
      if (!rawTag) continue;
      const willFilter = Boolean(catchAllSchedule || filterRe);
      const tagList = String(rawTag)
        .split(willFilter ? /[/,]/ : "/")
        .map((t) => t.trim().replace(/^["'\s]+|["'\s]+$/g, ""))
        .filter(Boolean)
        .flatMap((t) => expandAmpersandEquipMarks(t))
        .map((t) => normalizeEquipMark(t))
        .filter(Boolean);
      for (const tag of (tagList.length ? tagList : [rawTag])) {
        if (/^NOTES?:?\d*$/i.test(String(tag).trim())) continue;
        const canonTag = String(tag).toUpperCase().replace(/\s+/g, "");
        if (catchAllSchedule) {
          const okBlank = blankKeyRe && (blankKeyRe.test(tag) || blankKeyRe.test(canonTag));
          const okKey = keyRe && (keyRe.test(tag) || keyRe.test(canonTag));
          const okAlt = altKeyRe && (altKeyRe.test(tag) || altKeyRe.test(canonTag));
          if (!(okBlank || okKey || okAlt)) continue;
        } else if (filterRe && !filterRe.test(tag) && !filterRe.test(canonTag)) {
          continue;
        }
        // Parity with compile uniqueFamily — continuation / duplicate extracts
        // of the same MARK must not inflate reconcile rows (Douglas HP-20).
        const canon = String(tag).toUpperCase().replace(/\s+/g, "");
        const tableFamily = title.toUpperCase().replace(/[^A-Z0-9]/g, "") || table.kind || "(untitled)";
        const rowId = `${table.sheet}::${canon}`;
        const scopeIdentity = `${canon}\0${tableFamily}\0${table.drawing_group || "(unscoped)"}`;
        if (!canon || seen.has(scopeIdentity)) continue;
        seen.add(scopeIdentity);
        const scheduleDefinitionOnly = isRepeatableAirDeviceSchedule(title);
        const qtyStatus = scheduledQtyStatusFromRow(row, { typeDefinition: scheduleDefinitionOnly });
        const scheduledQty = qtyStatus.refused ? null : qtyStatus.qty;
        const sweep = sweepByTag.get(rowId) || sweepByTag.get(tag) || {};
        const installedQty = Number.isFinite(sweep.installedQty) ? sweep.installedQty : null;
        const status = classifyReconcileStatus({
          scheduledQty,
          installedQty,
          itemStatus: sweep.itemStatus,
          failureType: sweep.failureType,
          reason: qtyStatus.reason || sweep.reason,
          scheduleDefinitionOnly,
        });
        rows.push({
          row_id: rowId,
          tag,
          family: needle?.label || null,
          scheduled_qty: scheduledQty,
          scheduled_qty_basis: qtyStatus.basis,
          scheduled_qty_source_header: qtyStatus.source_header,
          scheduled_qty_source_text: qtyStatus.source_text,
          installed_qty: installedQty,
          placement_count: Number.isFinite(sweep.placementCount) ? sweep.placementCount : null,
          observed_plan_qty: Number.isFinite(sweep.observedPlanQty) ? sweep.observedPlanQty : installedQty,
          installed_qty_basis: sweep.installedQtyBasis || null,
          search_scope: sweep.searchScope || null,
          unlabeled_audit_complete: typeof sweep.unlabeledAuditComplete === "boolean" ? sweep.unlabeledAuditComplete : null,
          plan_search_complete: typeof sweep.planSearchComplete === "boolean" ? sweep.planSearchComplete : null,
          status,
          quantity_comparison: scheduleDefinitionOnly
            ? "type_definition_vs_plan_count"
            : "scheduled_vs_installed",
          schedule_cite: {
            sheet: table.sheet,
            title: table.title?.text || null,
            kind: table.kind,
            ...(table.drawing_group ? { drawing_group: table.drawing_group } : {}),
          },
          plan_cites: sweep.planCites || [],
          reason: qtyStatus.reason || sweep.reason
            || (scheduleDefinitionOnly
              ? "This schedule row defines a repeatable air-device type; it does not state project quantity. Installed quantity is grounded from plan callouts."
              : null),
        });
      }
    }
  }
  } // end titled-first / blank-fallback passes
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
    CEILING_FAN: "CEILING_FAN",
    "CEILING FAN": "CEILING_FAN",
    BOILER: "BOILER",
    ERV: "ERV",
    GRD: "GRD",
    CONDENSING_UNIT: "CONDENSING_UNIT",
    "CONDENSING UNIT": "CONDENSING_UNIT",
    COOLING_TOWER: "COOLING_TOWER",
    "COOLING TOWER": "COOLING_TOWER",
    HEAT_PUMP: "HEAT_PUMP",
    "HEAT PUMP": "HEAT_PUMP",
    CONTROL_DAMPER: "CONTROL_DAMPER",
    "CONTROL DAMPER": "CONTROL_DAMPER",
    MOTORIZED_DAMPER: "CONTROL_DAMPER",
    "MOTORIZED DAMPER": "CONTROL_DAMPER",
    FUME_HOOD_DAMPER: "FUME_HOOD_DAMPER",
    "FUME HOOD DAMPER": "FUME_HOOD_DAMPER",
    ECV: "FUME_HOOD_DAMPER",
    VARIABLE_FREQUENCY_DRIVE: "VARIABLE_FREQUENCY_DRIVE",
    "VARIABLE FREQUENCY DRIVE": "VARIABLE_FREQUENCY_DRIVE",
    VFD: "VARIABLE_FREQUENCY_DRIVE",
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
 * @param {{ tags?: string[], evaluationFast?: boolean, sweepAll?: boolean, onProgress?: Function }} [opts]
 */
export async function reconcileScheduleFamilyWithSweeps(session, graph, needle, opts = {}) {
  const scaffold = reconcileScheduleFamilyFromGraph(graph, needle, new Map());
  const tagFilter = opts.tags?.length
    ? new Set(opts.tags.map((t) => String(t).trim().toUpperCase()))
    : null;
  const sweepAll = opts.sweepAll === true || (!tagFilter && opts.sweepAll !== false);
  const sweepByTag = new Map();
  const total = scaffold.filter((row) => tagFilter ? tagFilter.has(row.tag.toUpperCase()) : sweepAll).length;
  let processed = 0;
  for (const row of scaffold) {
    const shouldSweep = tagFilter ? tagFilter.has(row.tag.toUpperCase()) : sweepAll;
    if (!shouldSweep) continue;
    const started = performance.now();
    opts.onProgress?.({ phase: "reconcile_row", state: "start", tag: row.tag, processed, total });
    try {
      const r = await session.sweepScheduleRow(row.tag, {
        commit: false,
        evaluationFast: !!opts.evaluationFast,
        // A generic multi-family schedule title may not name the row's
        // already-classified equipment family (for example an AIR SEPARATOR
        // row inside MECHANICAL SPECIALTY EQUIPMENT SCHEDULE). Preserve that
        // shared compiler evidence so exact-tag quantity semantics do not
        // fall back to an unnecessary geometric search.
        equipmentFamily: row.family || null,
        // Shared building letters (Carson B1/C1) collide across furnace / CU /
        // OAU / ERV / hood schedules. Prefer the scaffold's owning table.
        preferSheet: row.schedule_cite?.sheet ?? null,
        preferTitle: row.schedule_cite?.title ?? null,
      });
      sweepByTag.set(row.row_id || row.tag, {
        installedQty: r.complete === false ? null : (r.found ?? 0),
        placementCount: (r.sheets || []).reduce((sum, sheet) => sum + (sheet.matches || []).length, 0),
        observedPlanQty: r.found ?? 0,
        installedQtyBasis: r.anchor?.grounding_basis || "symbol_fingerprint",
        searchScope: r.search_scope || null,
        unlabeledAuditComplete: r.unlabeled_audit_complete ?? null,
        planSearchComplete: r.complete !== false,
        itemStatus: r.complete === false ? "refused" : "resolved",
        failureType: r.complete === false ? "INCOMPLETE_PLAN_SEARCH" : null,
        reason: r.complete === false
          ? `Plan search incomplete: ${r.found ?? 0} grounded placement(s) observed, but at least one sheet hit its candidate work cap. The observed count is a floor, not an installed total.`
          : null,
        planCites: (r.sheets || []).flatMap((ps) =>
          (ps.matches || []).flatMap((m) => Array.from({ length: m.multiplier ?? 1 }, () => ({
            sheet: ps.sheet,
            at: m.at,
            ...(m.tag_at ? { bbox: m.tag_at } : {}),
            ...(Number.isFinite(m.score) ? { score: m.score } : {}),
          }))),
        ),
      });
    } catch (e) {
      sweepByTag.set(row.row_id || row.tag, {
        installedQty: null,
        itemStatus: "refused",
        reason: e?.message || String(e),
      });
    }
    processed++;
    opts.onProgress?.({
      phase: "reconcile_row", state: "done", tag: row.tag, processed, total,
      elapsed_ms: Math.round(performance.now() - started),
      status: sweepByTag.get(row.row_id || row.tag)?.itemStatus,
    });
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
  "Scheduled qty basis",
  "Installed qty",
  "Observed plan qty",
  "Installed qty basis",
  "Search scope",
  "Unlabeled audit complete",
  "Plan search complete",
  "Status",
  "Schedule sheet",
  "Schedule title",
  "Plan sheet(s)",
  "Notes",
  "Schedule drawing group",
  "Quantity comparison",
  "Grounded placements",
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
      row.scheduled_qty_basis || "",
      row.installed_qty,
      row.observed_plan_qty,
      row.installed_qty_basis || "",
      row.search_scope || "",
      row.unlabeled_audit_complete,
      row.plan_search_complete,
      row.status,
      row.schedule_cite?.sheet || "",
      row.schedule_cite?.title || "",
      planSheets,
      (row.reason || "").replace(/"/g, '""'),
      row.schedule_cite?.drawing_group || "",
      row.quantity_comparison || "",
      row.placement_count,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return `${lines.join("\n")}\n`;
}
