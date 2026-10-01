/**
 * Schedule ↔ plan reconciliation table (shared UI + MCP path).
 * Converts schedule rows + sweep_schedule_row results into contractor-grade
 * reconcile lines: Tag · Family · Scheduled qty · Installed qty · Status · cites.
 *
 * Set-agnostic — no sheet IDs or locked counts in product code.
 */
import {
  normalizeEquipMark, scheduleTableView, sameKindMarks, isScheduleHeaderJunkMark, expandEquipMarkRange, expandMarkList, expandEquipMarks, markLetters,
  familyTableGate, familyMarkRead, familyRowRead, rowIdentityText, rowMarkText, splitRowMarks, plainMark, plainMarkText, isGroupedMarkHeader, unitMarkKey,
  HVAC_FAMILY_SPECS,
} from "./corpusTakeoff.mjs";
import { markKey } from "./markid.ts";
import { tagIndexFor } from "./tagIndex.ts";

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
 * @param {"symbol_geometry"|"explicit_installation_note"|"tag_text_only"|"mixed_geometry_and_tag_text"|"unverified"|null} [p.installedEvidenceGrade]
 * @returns {ReconcileStatus}
 */
export function classifyReconcileStatus({
  scheduledQty,
  installedQty,
  itemStatus,
  failureType,
  reason,
  scheduleDefinitionOnly = false,
  installedEvidenceGrade = null,
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
  // Exact authored text proves that a mark was printed on a plan. It does
  // not, by itself, prove that the nearby glyph is the scheduled device or
  // establish a releasable installed quantity. Keep this as a review state
  // until the shared geometric path verifies the marker.
  if (installedEvidenceGrade === "tag_text_only" || installedEvidenceGrade === "mixed_geometry_and_tag_text") return "AMBIGUOUS";
  if (itemStatus === "resolved" && installedEvidenceGrade === "unverified") return "AMBIGUOUS";
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
  if (result?.anchor?.grounding_basis === "exact_plan_tag" && found >= 1) {
    return {
      status: "AMBIGUOUS",
      found,
      cites,
      reason: "Exact plan tag text was found, but matching symbol geometry was not verified.",
    };
  }
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
 *
 * A row whose mark cell names several units of one kind ("EF-1 THRU EF-4",
 * "B-1/B-2"; `opts.marks`, AS-75) prints one QTY for all of them: a QTY equal
 * to that count is one unit per mark; any other QTY says nothing of each
 * mark's count and is refused, never divided or multiplied.
 * @param {{ cells?: Record<string, { text?: string } | string> }} row
 * @param {{ typeDefinition?: boolean, marks?: number }} [opts]
 * @returns {{ qty: number|null, refused: boolean, reason: string|null,
 *   basis: "printed_schedule_quantity"|"printed_schedule_quantity_per_mark"|"one_per_unique_schedule_row"|"unparseable_printed_quantity"|"printed_quantity_for_several_marks"|"type_definition_not_quantity",
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
    const marks = Number.isInteger(opts.marks) && opts.marks > 1 ? opts.marks : 1;
    if (/^[1-9]\d*$/.test(raw) && marks > 1) return Number(raw) === marks ? {
      qty: 1,
      refused: false,
      reason: null,
      basis: "printed_schedule_quantity_per_mark",
      source_header: String(header).trim(),
      source_text: raw,
    } : {
      qty: 1,
      refused: true,
      reason: `QTY ${raw} is printed for the ${marks} marks the row names, not for each`,
      basis: "printed_quantity_for_several_marks",
      source_header: String(header).trim(),
      source_text: raw,
    };
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
  const printed = rowIdentityPrint(row, identityHeaderRe);
  return printed == null ? null : plainIdentity(printed);
}

/** A unit's mark as one token, in plain type: AHU-1, EF-2A, SF-P1-4, B1. */
const PLAIN_MARK_TOKEN_RE = /^[A-Z]{1,8}(?:-[A-Z0-9]{1,8})*-?\d{1,4}[A-Z]?$/i;

/**
 * A row's identity in plain type (AS-85), as the mark rules read a mark: its
 * dash glyphs and spaces plain (plainMarkText: AHU‐1 is AHU-1), and a mark
 * printed as one token without the footnote mark printed with it (plainMark:
 * AHU-1*, EF-2†, P-1¹ are AHU-1, EF-2, P-1). The sweep's row lookup
 * (session.ts) and project_takeoff read it, so a row printed AHU‐1, which the
 * extraction keys AHU1, answers for a plan's AHU-1. Words, a list and a
 * note's number keep what they print (DUCT SMOKE DETECTOR*, "1.").
 * @param {string} text
 */
function plainIdentity(text) {
  const plain = plainMarkText(text);
  const mark = plainMark(plain);
  return mark !== plain && PLAIN_MARK_TOKEN_RE.test(mark) ? mark : plain;
}

/** The row's identity as printed (rowIdentityTag reads it in plain type). */
function rowIdentityPrint(row, identityHeaderRe = null) {
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
  // A key that prints no mark (12_MT keys its split systems by their MANUF.
  // cell, DAIKIN) gives way to the first mark column under a group heading
  // whose cell prints one (OUTDOOR UNIT DATA PLAN CODE: HP-1; AS-95).
  if (!/\d/.test(key)) {
    for (const [header, cell] of Object.entries(row?.cells || {})) {
      if (!isGroupedMarkHeader(header)) continue;
      const t = String(cell?.text || "").trim();
      if (/^[A-Z]{1,8}[\s\-]?\d/i.test(t)) return t;
    }
  }
  return key || null;
}

/**
 * The units a whole-set reconcile row's name schedules (AS-98): each mark of
 * a range or a list of one family's marks, as the takeoff and the family
 * reconcile read the row (AS-75, AS-86) — 26_CA's "SF-P1-4 THRU 11" is eight
 * supply fans, "EF-P1-1 & 2" two exhaust fans, "WCU-2-1 ,2" two chillers —
 * and the number of the row's units of that mark's kind (sameKindMarks: the
 * row's printed QTY counts them all, never each). Any other name is one unit.
 * @param {string} identity the row's name (rowIdentityTag)
 * @returns {Array<{ tag: string, marks: number }>}
 */
export function rowUnitMarks(identity) {
  const name = String(identity || "").trim();
  const marks = (expandEquipMarkRange(name) ?? expandMarkList(name) ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (marks.length < 2) return name ? [{ tag: name, marks: 1 }] : [];
  return [...new Set(marks)].map((tag) => ({ tag, marks: sameKindMarks(marks, tag) }));
}

/** The key two spellings of one unit's mark share (AS-99): the takeoff's own
 * (unitMarkKey), in plain type. */
export function reconcileUnitKey(tag) {
  return unitMarkKey(plainMark(String(tag || "")).toUpperCase().replace(/\s+/g, ""));
}

/**
 * Whether a row's name prints a mark (AS-99): the mark's letter and number
 * groups in order, whatever separates them, starting after no letter or
 * digit and never run on into a longer number ("FC-1" is in "(E) FC-1",
 * "CV-FCU-1-HHW" holds FCU-1, "FC-10" never holds FC-1). `whole` also
 * forbids a letter after it ("FOP-8AB" holds FOP-8A only as a part).
 */
function nameHoldsMark(name, mark, whole) {
  const groups = String(plainMark(String(mark || "")) || "").toUpperCase().match(/[A-Z]+|\d+/g);
  if (!groups?.length) return false;
  const re = new RegExp(`(?:^|[^A-Z0-9])${groups.join("[^A-Z0-9]*")}${whole ? "(?![A-Z0-9])" : "(?![0-9])"}`);
  return re.test(String(plainMark(String(name || "")) || "").toUpperCase());
}

/**
 * The units a whole-set reconcile row stands for (AS-99): the units its name
 * schedules (rowUnitMarks), and each unit the takeoff counts from the row
 * (takeoffUnitsByRow) that its name does not print and no row of the set
 * names (a split system's indoor unit beside its outdoor unit: 12_MT's HP-1
 * row counts FC-1A). A name the takeoff reads as several units, printing
 * one or more of them and never itself one ("F-1 , CU-1", "B-1/B-2" for
 * "B-1 & 2"), stands for those units, each once, never for one unit drawn
 * nowhere. A name that prints the one unit counted from it in another
 * spelling ("(E) CT-1", "CV-FCU-1-HHW" beside FCU-1) stands as it is.
 * @param {string} identity the row's name (rowIdentityTag)
 * @param {Array<{ tag: string, marks: number }>} counted the takeoff's units from the row
 * @param {Set<string>} [namedElsewhere] reconcileUnitKey of every unit a row of the set names
 * @returns {Array<{ tag: string, marks: number }>}
 */
export function rowReconcileUnits(identity, counted = [], namedElsewhere = new Set()) {
  const named = rowUnitMarks(identity);
  if (!counted.length) return named;
  const countedKeys = new Set(counted.map((u) => reconcileUnitKey(u.tag)));
  const compound = named.length === 1 && counted.length > 1 && !countedKeys.has(reconcileUnitKey(named[0].tag))
    && counted.some((u) => nameHoldsMark(named[0].tag, u.tag, false));
  const units = compound ? [] : [...named];
  for (const u of counted) {
    const key = reconcileUnitKey(u.tag);
    if (units.some((v) => reconcileUnitKey(v.tag) === key)) continue;
    if (!compound && (named.some((v) => nameHoldsMark(v.tag, u.tag, true)) || namedElsewhere.has(key))) continue;
    units.push({ tag: u.tag, marks: u.marks });
  }
  return units;
}

/**
 * A mark as a plan may print it with the zero its number is padded with
 * dropped or added (AS-97): 14_OR schedules HP-02 and tags it HP-2 on its
 * floor plans. The mark with each number unpadded (HP-02 → HP-2, AHU-010 →
 * AHU-10), and with its last number padded to two digits (HP-2 → HP-02). A
 * lone zero stays (FCU-00). The sweep tries them after every printed form
 * of the row, and only where no row of the set is named so.
 * @param {string} mark
 * @returns {string[]}
 */
export function markZeroRespellings(mark) {
  const t = String(mark || "").trim();
  const out = [];
  for (const variant of [t.replace(/(^|[^0-9])0+(?=[1-9])/g, "$1"), t.replace(/(^|[^0-9])([1-9])(?!\d)(?!.*\d)/, "$10$2")]) {
    if (variant && variant !== t && !out.includes(variant)) out.push(variant);
  }
  return out;
}

/**
 * A mark's letter and number groups, joined by hyphens (AS-111): the form two
 * spellings of one mark share where only their separators differ (EF-1, EF 1
 * and EF1 read EF-1), never where a number group does, as the run-together
 * markKey would (AHU-5-02 reads AHU-5-02, AHU 50-2 AHU-50-2).
 * @param {string} mark
 * @returns {string}
 */
function markGroups(mark) {
  return (plainMark(String(mark || "")).toUpperCase().match(/[A-Z]+|\d+/g) || []).join("-");
}

/**
 * The unit a row's own device SERVES (or is served BY), when the schedule
 * names it in a separate column — a valve row's own identity is the VALVE
 * MARK, but UNIT MARK/SERVES/SERVED EQUIPMENT/EQUIPMENT SERVED name the
 * host unit that is actually drawn on the plan. Neighbour of
 * rowIdentityTag: same header-scan shape, a different header set, and
 * genuinely a different mark — never a substitute identity for the row.
 * @param {object} row
 * @returns {string|null}
 */
export function servedEquipmentTag(row) {
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (!/^(UNIT\s*MARK|SERVES|SERVED\s*EQUIPMENT|EQUIPMENT\s*SERVED)$/i.test(String(header || "").trim())) continue;
    const t = String(cell?.text || "").trim();
    if (t) return t;
  }
  return null;
}

/**
 * True only when `a`/`b` (already markKey-canonicalized, upper-case,
 * hyphen/space-stripped) are exactly one edit apart AND the edited
 * character is a letter on every side it appears — a substitution swaps
 * one letter for another, an insert/delete adds/removes one letter. An
 * edit that touches a digit (inserts, deletes, or changes one) never
 * qualifies: "FCU1" vs "FCU10" differs by inserting the digit "0", so it
 * is never an alias candidate — see WP6's own worked examples.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function letterEditDistanceOne(a, b) {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  const LETTER = /[A-Z]/;
  if (la === lb) {
    let diffIndex = -1;
    let diffCount = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diffCount++;
        if (diffCount > 1) return false;
        diffIndex = i;
      }
    }
    if (diffCount !== 1) return false;
    return LETTER.test(a[diffIndex]) && LETTER.test(b[diffIndex]);
  }
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  const extra = longer[i];
  for (let j = i; j < shorter.length; j++) {
    if (shorter[j] !== longer[j + 1]) return false;
  }
  return LETTER.test(extra);
}

/**
 * WP6: two review lists, neither changes any quantity.
 * `unscheduled_tags` — every drawn tag occurrence (WP2's graph.tags, sheet
 * callouts excluded) whose key never appears as any schedule row's own
 * identity anywhere in the set (row.key and rowIdentityTag(row), each
 * split on compound "/" marks, the same way countMarks and the family
 * reconcile builder already split them), nor as a unit a row lists (AS-111):
 * each mark of a pair, list or range a row's name prints, as the takeoff
 * splits a row's marks for a family (splitRowMarks: itd-d1-lab's furnace and
 * condensing unit "F-1 , CU-1", 26_CA's "FCU-17-1&2"), and a row's mark with
 * the zero its number is padded with dropped or added (markZeroRespellings,
 * the sweep's own respelling: 009_FL's electrical demolition plan tags its
 * exhaust fans EF-01 to EF-03, scheduled EF-1 to EF-3). A tag no row names
 * as drawn is the respelling of a unit a family's schedule lists, as the sweep
 * reads it, where it prints its letters, a separator and its number, and only
 * its zero differs: 011_IL's diffuser type D3 is not its door D03, nor 26_CA's
 * AHU-5-2 its AHU 50-2 (the letter and number groups, markGroups).
 * `alias_candidates` — for every distinct drawn key, the nearest distinct
 * schedule-row key at letterEditDistanceOne, if any — a likely typo/OCR
 * spelling drift between the schedule and the drawing, or between two
 * schedule rows themselves, surfaced for human review only.
 * @param {{tables?: object[], tags?: object[]}} graph
 * @returns {{unscheduled_tags: object[], alias_candidates: {drawn: string, nearest_row_key: string, distance: number}[]}}
 */
export function unscheduledTagsAndAliasCandidates(graph) {
  const rowKeys = new Set();
  const unitKeys = new Set();
  for (const printed of graph?.tables || []) {
    // A transposed schedule's units are its column headers (AS-65).
    const table = scheduleTableView(printed);
    for (const row of table.rows || []) {
      for (const raw of [row?.key, rowIdentityTag(row)]) {
        if (!raw) continue;
        for (const part of markKey(raw).split("/").filter(Boolean)) rowKeys.add(part);
        for (const mark of splitRowMarks(String(raw), true)) {
          const key = markKey(mark);
          if (key) unitKeys.add(key);
        }
      }
    }
  }
  // A respelling reads as a unit a family's schedule lists (scheduleMarksRead),
  // never a sheet index's or a note's entry (004_MO's P-001, a plumbing sheet).
  const unitGroups = new Set(scheduleMarksRead(graph).map(markGroups).filter(Boolean));
  const respelled = (t) => {
    const text = plainMark(String(t.text || "")).trim();
    return /^[A-Z]+[\s-]+\d/i.test(text) && markZeroRespellings(text).some((variant) => unitGroups.has(markGroups(variant)));
  };
  const scheduled = (t) => rowKeys.has(t.key) || unitKeys.has(t.key) || respelled(t);
  const drawnTags = (graph?.tags || []).filter((t) => !t.sheet_callout);
  // Wire shape (bbox tuple → object, optional fields omitted rather than
  // null) matches Session.listTags exactly, so both surfaces agree.
  const unscheduled_tags = drawnTags.filter((t) => !scheduled(t)).map((t) => ({
    sheet: t.sheet, role: t.role, text: t.text, key: t.key, family: t.family,
    bbox: { x0: t.bbox[0], y0: t.bbox[1], x1: t.bbox[2], y1: t.bbox[3] },
    ...(t.rot ? { rot: t.rot } : {}),
    source: t.source,
    ...(t.multiplier > 1 ? { multiplier: t.multiplier } : {}),
    ...(t.in_table ? { in_table: t.in_table } : {}),
    ...(t.sheet_callout ? { sheet_callout: true } : {}),
  }));
  const distinctDrawnKeys = [...new Set(drawnTags.map((t) => t.key))].sort();
  const sortedRowKeys = [...rowKeys].sort();
  const alias_candidates = [];
  for (const drawn of distinctDrawnKeys) {
    let nearest = null;
    for (const rowKey of sortedRowKeys) {
      if (drawn === rowKey) continue;
      if (letterEditDistanceOne(drawn, rowKey)) {
        nearest = rowKey;
        break;
      }
    }
    if (nearest) alias_candidates.push({ drawn, nearest_row_key: nearest, distance: 1 });
  }
  return { unscheduled_tags, alias_candidates };
}

/** HVAC families whose schedule marks are types repeated for every device,
 * never one unit's mark. */
const TYPE_MARK_FAMILIES = new Set(["GRD", "LOUVER", "LOUVERED_PENTHOUSE", "FIN_TUBE_RADIATION", "FILTER", "STRAINER"]);

/**
 * Whether a unit family's row names one unit once (AS-96): one mark, no
 * placeholder for a level or room (26_CA's CAV-X-2), and no word that it is
 * a typical unit repeated floor by floor or room by room (its TYPICAL FLOORS
 * column: "3-4, 6-34"). A split system's indoor and outdoor pair (040_IL's
 * SS-1/SSCU-1) names two.
 * @param {{ cells?: Record<string, { text?: string } | string> }} row
 * @param {string} mark the row's name
 */
export function rowNamesOneUnitOnce(row, mark) {
  const name = String(mark || "").toUpperCase();
  if (!name || /[\/&,]|\bTHRU\b|\bTO\b/.test(name) || /(?:^|[-\s])X(?:[-\s]|$)/.test(name)) return false;
  const TYPICAL = /\bTYP(?:ICAL|\.)?\b/i;
  return !Object.entries(row?.cells || {}).some(([header, cell]) => TYPICAL.test(header) || TYPICAL.test(String(cell && typeof cell === "object" ? cell.text : cell || "")));
}

/**
 * Whether a unit family's row names each of several units once (AS-106): its
 * name is a range or list of one family's marks with the swept mark among
 * them (26_CA's "SF-P1-4 THRU 11" and "EF-P1-1 & 2"; expandEquipMarks), it
 * schedules one unit per mark (a QTY printed for the marks together, or none;
 * scheduledQtyStatusFromRow), and no word says they are typical units nor
 * does a placeholder stand for a level. Two families' marks name no one unit
 * per mark: 040_IL's SS-1/SSCU-1, a split system's indoor and outdoor pair,
 * stands for two systems (AS-103).
 * @param {{ cells?: Record<string, { text?: string } | string> }} row
 * @param {string} name the row's name
 * @param {string} mark the mark swept
 */
export function rowNamesEachUnitOnce(row, name, mark) {
  const marks = expandEquipMarks(String(name || "").toUpperCase());
  const keys = marks.map((m) => markKey(m));
  if (marks.length < 2 || new Set(keys).size !== marks.length || !keys.includes(markKey(mark))) return false;
  if (new Set(marks.map((m) => markLetters(normalizeEquipMark(m)))).size !== 1) return false;
  if (marks.some((m) => /(?:^|[-\s])X(?:[-\s]|$)/.test(m))) return false;
  const status = scheduledQtyStatusFromRow(row, { marks: marks.length });
  if (status.refused || status.qty !== 1) return false;
  const TYPICAL = /\bTYP(?:ICAL|\.)?\b/i;
  return !Object.entries(row?.cells || {}).some(([header, cell]) => TYPICAL.test(header) || TYPICAL.test(String(cell && typeof cell === "object" ? cell.text : cell || "")));
}

const unitFamilyTableCache = new WeakMap();
/**
 * A table a unit family reads by its own title (familyTableGate's titled
 * pass): its rows name units one by one, as an individually marked
 * schedule's title says (isIndividuallyMarkedEquipmentSchedule) — 040_IL's
 * TERMINAL AIR BOX SCHEDULE, 26_CA's FANS and FAN POWERED TERMINAL UNIT
 * SCHEDULE, federal-mech's VOLUME CONTROL BOX SCHEDULE. Never a type-mark
 * family's table (grilles, louvers, fin tube, filters, strainers) nor a
 * repeatable air device schedule (AS-96).
 * @param {object} printed a sheet graph table
 * @returns {boolean}
 */
export function isUnitFamilyTable(printed) {
  if (!printed || typeof printed !== "object") return false;
  const cached = unitFamilyTableCache.get(printed);
  if (cached !== undefined) return cached;
  const table = scheduleTableView(printed);
  const hit = !!table && !isRepeatableAirDeviceSchedule(table.title?.text || "")
    && Object.entries(HVAC_FAMILY_SPECS).some(([name, spec]) => !TYPE_MARK_FAMILIES.has(name) && familyTableGate(table, spec, name)?.pass === 1);
  unitFamilyTableCache.set(printed, hit);
  return hit;
}

/**
 * A mark's form for the review list: its letter and number groups, with the
 * separators drafters vary (a hyphen, a space, none) read alike and a dot or
 * slash kept, so "EF-25", "EF 25" and "EF25" share a form while a grid bubble
 * "B.1" or a zone label "AHU-1-Z-2" do not share one with a unit mark.
 * `hyphen` says whether a separator stands between the leading letters and
 * the first number ("D-1" has one; a detail callout "D57" does not).
 * @param {string} text
 */
function unitMarkForm(text) {
  const upper = String(text || "").toUpperCase().trim();
  const groups = upper.match(/[A-Z]+|\d+|[./]/g) || [];
  if (!groups.length || !/^[A-Z]+$/.test(groups[0]) || !groups.some((g) => /^\d+$/.test(g))) return null;
  return {
    letters: groups[0],
    form: groups.map((g) => (/^[A-Z]+$/.test(g) ? "A" : /^\d+$/.test(g) ? "9" : g)).join(""),
    hyphen: /^[A-Z]+[\s\-‐-―−]+\d/.test(upper),
  };
}

/**
 * The review list's likely units (AS-93): drawn tags on plan and demolition
 * plan sheets, outside every table and sheet callout, that no schedule row
 * lists (unscheduledTagsAndAliasCandidates) yet read as a unit of a scheduled
 * family: the same letters and the same form as a unit mark an HVAC unit
 * schedule prints (a table an HVAC family reads, familyTableGate; a door or
 * luminaire schedule's marks and a grille, louver, fin-tube or filter type
 * schedule's marks are no units). A one-letter family must also match the
 * schedule's separator (a plan's "P9" callout is not a pump "P-1", as "P-9"
 * would be). A drawn EF-25 beside
 * a fan schedule of EF-1 to EF-12 is listed; a room number, a grid bubble, a
 * sheet or detail reference, a zone label or a circuit is not. A review list
 * like unscheduled_tags: it never changes any row's quantity or status.
 * @param {{tables?: object[], tags?: object[]}} graph
 * @param {object[]} [unscheduledTags] unscheduledTagsAndAliasCandidates(graph).unscheduled_tags
 */
export function unscheduledUnitCandidates(graph, unscheduledTags = unscheduledTagsAndAliasCandidates(graph).unscheduled_tags) {
  /** family (letters|form) -> separator flags seen in the schedules */
  const families = new Map();
  for (const printed of graph?.tables || []) {
    const table = scheduleTableView(printed);
    if (!table || isRepeatableAirDeviceSchedule(table.title?.text || "")) continue;
    if (!Object.entries(HVAC_FAMILY_SPECS).some(([name, spec]) => !TYPE_MARK_FAMILIES.has(name) && familyTableGate(table, spec, name))) continue;
    for (const row of table.rows || []) {
      for (const raw of [rowIdentityTag(row), row?.key]) {
        for (const mark of String(raw || "").split(/[/,]/)) {
          const f = unitMarkForm(mark);
          if (!f) continue;
          const id = `${f.letters}|${f.form}`;
          if (!families.has(id)) families.set(id, new Set());
          families.get(id).add(f.hyphen);
        }
      }
    }
  }
  return (unscheduledTags || []).filter((t) => {
    if ((t.role !== "plan" && t.role !== "demolition") || t.in_table || t.sheet_callout) return false;
    const f = unitMarkForm(t.text);
    const seps = f && families.get(`${f.letters}|${f.form}`);
    return !!seps && (f.letters.length >= 2 || seps.has(f.hyphen));
  });
}

/** @typedef {{ sheet: string, at: [number, number], bbox?: { x0: number, y0: number, x1: number, y1: number }, reason: "repeat_view" | "unattached_tag" | "demolition_view" | "reference_view", counted_on?: string }} PlanOtherCite */

/**
 * Every other drawn occurrence of a row's own mark on a plan-like sheet that
 * the row does not count (AS-92), so each drawn tag links to its row: the
 * same unit drawn again on another view (an enlarged plan, another trade's
 * plan, a piping plan beside the duct plan — the sweep's redundant views,
 * each naming the sheet that counts it), the mark's own text with no attached
 * symbol beside counted ones, and the mark on a demolition plan. Links only,
 * never installed quantity. On a demolition plan the mark is read as the
 * sweep reads it (Session.demolitionTagOccurrences, AS-101) where the caller
 * has a session, and as the graph's tag index reads it besides. And the mark
 * on the set's other drawing sheets, a zone plan titled by its legend, a
 * detail, a diagram, an elevation (AS-109): a reference view.
 * @param {object|null} sweep sweep_schedule_row's result (null when it threw)
 * @param {{tags?: object[]}} graph
 * @param {string} tag the row's mark as swept
 * @param {Array<{ sheet: string, at: [number, number], bbox?: { x0: number, y0: number, x1: number, y1: number } }>} [demolitionOccurrences]
 * @param {Array<{ sheet: string, at: [number, number], bbox?: { x0: number, y0: number, x1: number, y1: number } }>} [referenceOccurrences]
 * @returns {PlanOtherCite[]}
 */
export function planOtherCites(sweep, graph, tag, demolitionOccurrences = [], referenceOccurrences = []) {
  /** @type {PlanOtherCite[]} */
  const out = [];
  for (const ps of sweep?.sheets || []) {
    for (const m of ps.redundant_view || []) {
      out.push({ sheet: ps.sheet, at: m.at, ...(m.tag_at ? { bbox: m.tag_at } : {}), reason: "repeat_view", ...(m.kept_sheet ? { counted_on: m.kept_sheet } : {}) });
    }
    for (const t of ps.text_only || []) out.push({ sheet: ps.sheet, at: t.at, reason: "unattached_tag" });
  }
  const round1 = (v) => Math.round(v * 10) / 10;
  const demolition = (demolitionOccurrences || []).map((o) => ({ sheet: o.sheet, at: o.at, ...(o.bbox ? { bbox: o.bbox } : {}), reason: "demolition_view" }));
  // one cite a drawn tag, however many readings find it
  const seen = (sheet, at) => demolition.some((d) => d.sheet === sheet && Math.hypot(d.at[0] - at[0], d.at[1] - at[1]) <= 5);
  for (const dt of tag ? tagIndexFor(graph?.tags || [], tag) : []) {
    if (dt.role !== "demolition" || dt.in_table || dt.sheet_callout) continue;
    const at = [round1((dt.bbox[0] + dt.bbox[2]) / 2), round1((dt.bbox[1] + dt.bbox[3]) / 2)];
    if (seen(dt.sheet, at)) continue;
    demolition.push({ sheet: dt.sheet, at, bbox: { x0: dt.bbox[0], y0: dt.bbox[1], x1: dt.bbox[2], y1: dt.bbox[3] }, reason: "demolition_view" });
  }
  const reference = (referenceOccurrences || []).map((o) => ({ sheet: o.sheet, at: o.at, ...(o.bbox ? { bbox: o.bbox } : {}), reason: "reference_view" }));
  return [...out, ...demolition, ...reference];
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
    // A unit of a row naming several (AS-98): the row's printed QTY counts
    // them all, never each.
    const qtyStatus = item.schedule_row
      ? scheduledQtyStatusFromRow({ cells: item.schedule_row }, { typeDefinition: scheduleDefinitionOnly, ...(item.row_marks > 1 ? { marks: item.row_marks } : {}) })
      : scheduledQtyStatusFromRow({ cells: {} });
    const scheduledQty = qtyStatus.refused ? null : qtyStatus.qty;
    // A refused/error sweep proves only that installed quantity could not be
    // verified.  It does not prove zero devices exist on the plans.  Keep the
    // quantity unknown so UI, MCP, Agent evidence, and CSV never turn a
    // coverage gap into a confident zero.
    const basis = item.quantity_basis ?? null;
    const derivedEvidenceGrade = basis === "symbol_fingerprint" || basis === "tag_attached_vector"
      ? "symbol_geometry"
      : basis === "explicit_installation_note"
        ? "explicit_installation_note"
        : basis === "exact_plan_tag"
          ? "tag_text_only"
          : "unverified";
    const installedEvidenceGrade = item.installed_evidence_grade || derivedEvidenceGrade;
    const geometryVerified = item.status === "resolved" && installedEvidenceGrade === "symbol_geometry";
    const hasGeometryEvidence = item.status === "resolved" && (installedEvidenceGrade === "symbol_geometry"
      || installedEvidenceGrade === "mixed_geometry_and_tag_text");
    const explicitInstallationVerified = item.status === "resolved" && installedEvidenceGrade === "explicit_installation_note";
    const tagTextOnly = item.status === "resolved" && (installedEvidenceGrade === "tag_text_only"
      || installedEvidenceGrade === "mixed_geometry_and_tag_text");
    const installedQty = geometryVerified || explicitInstallationVerified ? (item.quantity ?? 0) : null;
    const taggedPlanQty = tagTextOnly ? (item.tagged_plan_quantity ?? (basis === "exact_plan_tag" ? item.quantity : 0) ?? 0) : null;
    const fail = failByTag.get(item.tag);
    const status = classifyReconcileStatus({
      scheduledQty,
      installedQty,
      itemStatus: item.status,
      failureType: fail?.type,
      reason: qtyStatus.reason || item.reason || fail?.detail,
      scheduleDefinitionOnly,
      installedEvidenceGrade,
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
      tagged_plan_qty: taggedPlanQty,
      placement_count: hasGeometryEvidence || explicitInstallationVerified ? (item.placement_count ?? null) : null,
      observed_plan_qty: installedEvidenceGrade === "mixed_geometry_and_tag_text"
        || (item.plan_search_complete === false
          && (basis === "symbol_fingerprint" || basis === "tag_attached_vector"))
        ? (item.quantity ?? null)
        : installedQty,
      installed_qty_basis: item.quantity_basis ?? null,
      installed_evidence_grade: installedEvidenceGrade,
      geometry_verified: geometryVerified,
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
      plan_cites: (hasGeometryEvidence ? (item.drawing_locations || []) : []).map((loc) => ({
        sheet: loc.sheet,
        at: loc.at,
        ...(loc.bbox ? { bbox: loc.bbox } : {}),
        ...(loc.tag_bbox ? { tag_bbox: loc.tag_bbox } : {}),
        ...(Number.isFinite(loc.score) ? { score: loc.score } : {}),
        ...(loc.attachment_via ? { attachment_via: loc.attachment_via } : {}),
        ...(Number.isFinite(loc.attachment_distance_px) ? { attachment_distance_px: loc.attachment_distance_px } : {}),
      })),
      plan_tag_cites: (tagTextOnly ? (item.plan_tag_locations || item.drawing_locations || []) : []).map((loc) => ({
        sheet: loc.sheet,
        at: loc.at,
        ...(loc.bbox ? { bbox: loc.bbox } : {}),
      })),
      plan_candidate_cites: (item.plan_candidate_locations || []).map((loc) => ({
        sheet: loc.sheet,
        at: loc.at,
        ...(Number.isFinite(loc.score) ? { score: loc.score } : {}),
        ...(loc.reason ? { reason: loc.reason } : {}),
        ...(loc.hold ? { hold: loc.hold } : {}),
      })),
      ...(item.plan_other_locations?.length ? { plan_other_cites: item.plan_other_locations } : {}),
      ...(item.reference_tags?.length ? { reference_tag_cites: item.reference_tags } : {}),
      ...(item.served_equipment_cites?.length ? { served_equipment_cites: item.served_equipment_cites } : {}),
      reason: qtyStatus.reason || item.reason || fail?.detail
        || (tagTextOnly
          ? `Exact plan tag text was found ${taggedPlanQty} time${taggedPlanQty === 1 ? "" : "s"}, but matching symbol geometry was not verified. Installed quantity remains unknown pending geometric or human review.`
          : null)
        || (scheduleDefinitionOnly
          ? "This schedule row defines a repeatable air-device type; it does not state project quantity. Installed quantity is grounded from plan callouts."
          : null),
    };
  });
}

const exactDiagramTagKey = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[‐‑‒–—−]/g, "-")
  .replace(/\s+/g, "");

const scheduleRefMatchesRow = (ref, row) => {
  if (!ref?.sheet || !row?.schedule_cite?.sheet || ref.sheet !== row.schedule_cite.sheet) return false;
  const refTitle = String(ref.title || "").trim().toUpperCase();
  const rowTitle = String(row.schedule_cite.title || "").trim().toUpperCase();
  return !refTitle || !rowTitle || refTitle === rowTitle;
};

/**
 * Carry exact authored schematic/riser tag evidence into reconciliation
 * without promoting a diagram occurrence into installed quantity. A device
 * can be repeated on a control schematic and a piping diagram while still
 * representing one physical scheduled valve; this evidence is therefore a
 * separate corroboration axis from `plan_cites`/`installed_qty`.
 *
 * A short tag reused by multiple schedules is attached only when the diagram
 * extractor's own schedule refs include this row. With one unique schedule
 * row for the tag, an otherwise-unbound diagram token remains visible but is
 * explicitly marked unbound rather than silently discarded.
 *
 * @param {Array<object>} rows reconcile rows
 * @param {object|null|undefined} controls shared ControlSchematicResult
 * @returns {Array<object>}
 */
export function attachDiagramCorroboration(rows, controls) {
  const candidates = [];
  for (const schematic of controls?.schematics || []) {
    for (const equipment of schematic.equipment || []) {
      candidates.push({
        tag: equipment.tag,
        sheet: equipment.evidence?.sheet || schematic.sheet,
        title: schematic.title,
        diagram_kind: "control_schematic",
        bbox: equipment.evidence?.bbox || null,
        source_text: equipment.evidence?.text || equipment.tag,
        grounding_basis: "exact_authored_diagram_tag",
        schedule_refs: equipment.schedule_refs || [],
      });
    }
  }
  for (const diagram of controls?.risers || []) {
    for (const group of diagram.diagram_tags || []) {
      for (const evidence of group.evidence || []) {
        candidates.push({
          tag: group.tag,
          sheet: evidence?.sheet || diagram.sheet,
          title: diagram.title,
          diagram_kind: diagram.diagram_kind,
          bbox: evidence?.bbox || null,
          source_text: evidence?.text || group.tag,
          grounding_basis: "exact_authored_diagram_tag",
          schedule_refs: group.schedule_refs || [],
        });
      }
    }
  }

  const rowCountByTag = new Map();
  for (const row of rows || []) {
    const key = exactDiagramTagKey(row?.tag);
    if (key) rowCountByTag.set(key, (rowCountByTag.get(key) || 0) + 1);
  }

  return (rows || []).map((row) => {
    const key = exactDiagramTagKey(row?.tag);
    const cites = [];
    const seen = new Set();
    for (const candidate of candidates) {
      if (!key || exactDiagramTagKey(candidate.tag) !== key) continue;
      const matchingRefs = candidate.schedule_refs.filter((ref) => scheduleRefMatchesRow(ref, row));
      if (candidate.schedule_refs.length && !matchingRefs.length) continue;
      if (!candidate.schedule_refs.length && rowCountByTag.get(key) !== 1) continue;
      const binding = candidate.schedule_refs.length === 1 && matchingRefs.length === 1
        ? "bound"
        : candidate.schedule_refs.length > 1 && matchingRefs.length
          ? "ambiguous"
          : "unbound";
      const identity = `${candidate.sheet}\0${candidate.title}\0${candidate.diagram_kind}\0${JSON.stringify(candidate.bbox)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      cites.push({
        sheet: candidate.sheet,
        title: candidate.title,
        diagram_kind: candidate.diagram_kind,
        tag: candidate.tag,
        ...(candidate.bbox ? { bbox: candidate.bbox } : {}),
        source_text: candidate.source_text,
        grounding_basis: candidate.grounding_basis,
        schedule_binding_status: binding,
      });
    }
    cites.sort((a, b) => String(a.sheet).localeCompare(String(b.sheet), undefined, { numeric: true })
      || String(a.title).localeCompare(String(b.title))
      || JSON.stringify(a.bbox || []).localeCompare(JSON.stringify(b.bbox || [])));
    return {
      ...row,
      diagram_corroborated: cites.some((cite) => cite.schedule_binding_status === "bound"),
      diagram_cites: cites,
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
 *   identityHeaderRe?: RegExp, titledOnly?: boolean }} needle a family's
 *   HVAC_FAMILY_SPECS entry (familyNeedleFromSpecs), read by the takeoff's
 *   own gate (familyTableGate, AS-77)
 * @param {Map<string, { installedQty?: number|null, itemStatus?: string, reason?: string, failureType?: string, planCites?: object[] }>} [sweepByTag]
 * @param {{ sources?: Map<string, Array<{ table: any, row: any, tag: string, families: string[] }>>|null }} [opts]
 *   sources: filled with the table and row each unit is read from, by its
 *   markKey (scheduleRowsReadingMark; AS-89)
 */
export function reconcileScheduleFamilyFromGraph(graph, needle, sweepByTag = new Map(), { sources = null } = {}) {
  const rows = [];
  const seen = new Set();
  // The marks the scaffold holds a row for, in any table (AS-62).
  const held = new Set();
  // Parity with compile uniqueFamily: a reading of the mark as printed ranks
  // above a widened one, so the scan first finds every unit a printed
  // reading holds.
  const printedCanons = new Set();
  // Each table's reading by the family, by the takeoff's own gate (AS-77), so
  // the scaffold holds a row for every unit the takeoff counts and for none it
  // does not. A transposed schedule is read one row per unit (AS-65); a titled
  // table is not gated on table.kind (Valdosta's GRILLE SCHEDULE extracts as
  // reference-kind but is still schedule truth), one no title vouches for is
  // (AS-66).
  // The family's HVAC_FAMILY_SPECS key (familyNeedleFromSpecs labels it).
  const family = String(needle?.label || "").trim().replace(/\s+/g, "_").toUpperCase();
  const gated = [];
  for (const printed of graph?.tables || []) {
    const table = scheduleTableView(printed);
    const gate = familyTableGate(table, needle, family);
    if (gate) gated.push({ table, gate });
  }
  for (const mode of ["scan", "emit"]) {
  // Titled family schedules first (parity with compile uniqueFamily) so shared
  // marks cite the device definition, not a blank/catch-all accessory row.
  for (const pass of [1, 2]) {
  for (const { table, gate } of gated) {
    if (gate.pass !== pass) continue;
    const { title } = gate;
    for (const row of table.rows || []) {
      // In a valve table whose rows name both waters, the row's own, as the
      // takeoff reads it (AS-78).
      if (!familyRowRead(gate, row, table)) continue;
      // The text the row names its unit by, the takeoff's own (AS-79).
      const rawTag = rowIdentityText(row, gate.identity);
      if (!rawTag) continue;
      // The takeoff's split of a row's marks (AS-77).
      const willFilter = Boolean(gate.catchAll || gate.filterRe);
      const rowKey = String(row.key || "").trim().replace(/^["'\s]+|["'\s]+$/g, "");
      const working = rowMarkText(rawTag, rowKey, willFilter);
      const tagList = splitRowMarks(working, willFilter, gate.wordsNamed)
        .map((t) => normalizeEquipMark(t))
        .filter(Boolean);
      for (const tag of (tagList.length ? tagList : [working])) {
        if (/^NOTES?:?\d*$/i.test(String(tag).trim())) continue;
        const canonTag = String(tag).toUpperCase().replace(/\s+/g, "");
        // Parity with compile uniqueFamily: a header word or a legend's
        // heading is no mark.
        if (isScheduleHeaderJunkMark(canonTag)) continue;
        // The takeoff's own mark rules (AS-77): 2 = read as printed; 1 = only
        // in one of its forms (a building prefix WHSE-ET-1 or letter FC-A-2),
        // through a title's vouching or in another family's schedule, a new
        // admission, which adds no second row for a unit held; 0 = not the
        // family's here, or read by its mark alone a word or another thing's.
        const read = familyMarkRead(gate, needle, tag, canonTag);
        if (!read) continue;
        // Parity with compile uniqueFamily — continuation / duplicate extracts
        // of the same MARK must not inflate reconcile rows (Douglas HP-20).
        const canon = markKey(tag);
        const tableFamily = title.toUpperCase().replace(/[^A-Z0-9]/g, "") || table.kind || "(untitled)";
        const rowId = `${table.sheet}::${canon}`;
        const scopeIdentity = `${canon}\0${tableFamily}\0${table.drawing_group || "(unscoped)"}`;
        if (!canon) continue;
        if (mode === "scan") {
          if (read === 2) printedCanons.add(canon);
          continue;
        }
        if (seen.has(scopeIdentity)) continue;
        // A mark only one of its forms reads adds a row only for a unit the
        // scaffold holds none for yet, as the compile counts it once: a second
        // listing of 05_MO's 1-CP-1 in an untitled table, or of 061_IA's
        // HWP-A-1 in a general EQUIPMENT SCHEDULE, is the same pump. Nor for a
        // unit a printed reading holds anywhere, in whichever table comes first.
        if (read === 1 && (held.has(canon) || printedCanons.has(canon))) continue;
        seen.add(scopeIdentity);
        held.add(canon);
        const scheduleDefinitionOnly = isRepeatableAirDeviceSchedule(title);
        const qtyStatus = scheduledQtyStatusFromRow(row, { typeDefinition: scheduleDefinitionOnly, marks: sameKindMarks(tagList, tag) });
        const scheduledQty = qtyStatus.refused ? null : qtyStatus.qty;
        const sweep = sweepByTag.get(rowId) || sweepByTag.get(tag) || {};
        const reportedInstalledQty = Number.isFinite(sweep.installedQty) ? sweep.installedQty : null;
        // Served-equipment location grade (WP5): a row's own mark (often a
        // VALVE MARK) sometimes has zero drawn occurrences anywhere — the
        // schedule names the valve, but only the UNIT it serves is ever
        // actually labeled on the drawings. Look up the served mark's own
        // drawn occurrences directly from the tag index. This never
        // substitutes for the row's own identity and never counts as
        // installed quantity — sweepScheduleRow still refuses to count the
        // served unit as the valve — it only locates the row for review.
        const ownDrawn = tagIndexFor(graph.tags ?? [], tag).some((dt) => !dt.sheet_callout && !dt.in_table);
        let servedEquipmentCites = [];
        if (!ownDrawn) {
          const servedTag = servedEquipmentTag(row);
          if (servedTag) {
            servedEquipmentCites = tagIndexFor(graph.tags ?? [], servedTag)
              .filter((dt) => !dt.sheet_callout && !dt.in_table)
              .map((dt) => ({
                tag: servedTag, sheet: dt.sheet, role: dt.role,
                bbox: { x0: dt.bbox[0], y0: dt.bbox[1], x1: dt.bbox[2], y1: dt.bbox[3] },
              }));
          }
        }
        const installedEvidenceGrade = servedEquipmentCites.length
          ? "located_via_served_equipment"
          : sweep.installedEvidenceGrade
            || (sweep.installedQtyBasis === "symbol_fingerprint" || sweep.installedQtyBasis === "tag_attached_vector" ? "symbol_geometry"
              : sweep.installedQtyBasis === "explicit_installation_note" ? "explicit_installation_note"
                : sweep.installedQtyBasis === "exact_plan_tag" ? "tag_text_only" : "unverified");
        const installedQty = installedEvidenceGrade === "symbol_geometry"
          || installedEvidenceGrade === "explicit_installation_note"
          ? reportedInstalledQty
          : null;
        const status = classifyReconcileStatus({
          scheduledQty,
          installedQty,
          itemStatus: sweep.itemStatus,
          failureType: sweep.failureType,
          reason: qtyStatus.reason || sweep.reason,
          scheduleDefinitionOnly,
          installedEvidenceGrade,
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
          tagged_plan_qty: Number.isFinite(sweep.taggedPlanQty) ? sweep.taggedPlanQty : null,
          placement_count: Number.isFinite(sweep.placementCount) ? sweep.placementCount : null,
          observed_plan_qty: Number.isFinite(sweep.observedPlanQty) ? sweep.observedPlanQty : installedQty,
          installed_qty_basis: sweep.installedQtyBasis || null,
          installed_evidence_grade: installedEvidenceGrade,
          geometry_verified: sweep.geometryVerified === true,
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
          plan_tag_cites: sweep.planTagCites || [],
          plan_candidate_cites: sweep.planCandidateCites || [],
          ...(sweep.planOtherCites?.length ? { plan_other_cites: sweep.planOtherCites } : {}),
          ...(sweep.referenceTagCites?.length ? { reference_tag_cites: sweep.referenceTagCites } : {}),
          ...(servedEquipmentCites.length ? { served_equipment_cites: servedEquipmentCites } : {}),
          reason: qtyStatus.reason || sweep.reason
            || (installedEvidenceGrade === "tag_text_only"
              ? `Exact plan tag text was found ${sweep.taggedPlanQty ?? 0} time${sweep.taggedPlanQty === 1 ? "" : "s"}, but matching symbol geometry was not verified. Installed quantity remains unknown pending geometric or human review.`
              : null)
            || (reportedInstalledQty != null && installedEvidenceGrade === "unverified"
              ? "A numeric plan quantity was reported without recognized grounding provenance, so it was withheld from installed quantity pending review."
              : null)
            || (scheduleDefinitionOnly
              ? "This schedule row defines a repeatable air-device type; it does not state project quantity. Installed quantity is grounded from plan callouts."
              : null),
        });
        // The table and row this unit's row is read from, the mark read and
        // the family reading it, for the plan sweep (scheduleRowsReadingMark;
        // AS-89).
        if (sources) {
          const hits = sources.get(canon) || [];
          const hit = hits.find((h) => h.table === table && h.row === row);
          if (!hit) hits.push({ table, row, tag, families: [family] });
          else if (!hit.families.includes(family)) hit.families.push(family);
          sources.set(canon, hits);
        }
      }
    }
  }
  } // end titled-first / blank-fallback passes
  } // end scan / emit
  return rows;
}

/** Each graph's reading: its schedule rows by the marks the reconcile reads
 * in them, and the marks read in each table. */
const SCHEDULE_READINGS = new WeakMap();

/** The graph's reading by every family, read once per graph, and again if
 * its tables are no longer the ones read (a graph still being built gains
 * tables). */
function scheduleReading(graph) {
  const tables = graph && typeof graph === "object" && Array.isArray(graph.tables) ? graph.tables : null;
  if (!tables) return null;
  let read = SCHEDULE_READINGS.get(graph);
  if (!read || read.tables.length !== tables.length || read.tables.some((table, i) => table !== tables[i])) {
    const byMark = new Map();
    for (const family of Object.keys(HVAC_FAMILY_SPECS)) {
      const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
      if (needle) reconcileScheduleFamilyFromGraph(graph, needle, new Map(), { sources: byMark });
    }
    const byTable = new Map();
    for (const [canon, hits] of byMark) {
      for (const { table, tag, families } of hits) {
        const marks = byTable.get(table) || new Map();
        const mark = marks.get(canon) || { tag, families: new Set() };
        for (const family of families) mark.families.add(family);
        marks.set(canon, mark);
        byTable.set(table, marks);
      }
    }
    read = { tables: [...tables], byMark, byTable, vocabulary: null };
    SCHEDULE_READINGS.set(graph, read);
  }
  return read;
}

/**
 * The schedule rows the reconcile reads a unit's mark from (AS-89), each
 * with its table, the mark as read and the families reading it: every
 * family's rows, read by the takeoff's own gate, mark reading and split, as
 * reconcileScheduleFamilyFromGraph holds them. The plan sweep (session.ts
 * sweepScheduleRow) finds a row by the extraction's key or its printed
 * identity; a unit the reconcile holds whose row answers by neither (a
 * schedule printed on its side, a row naming a range or list of units, an
 * outdoor unit's mark column, a mark the extraction ran a size into) is
 * found here. A transposed schedule's row is its view's, one per unit.
 * @param {object|null|undefined} graph the sheet graph
 * @param {string} tag the unit's mark
 * @returns {Array<{ table: any, row: any, tag: string, families: string[] }>}
 */
export function scheduleRowsReadingMark(graph, tag) {
  return (scheduleReading(graph)?.byMark.get(markKey(tag)) || []).map((hit) => ({ ...hit, families: [...hit.families] }));
}

/**
 * The marks the reconcile reads in a table (a transposed schedule's view, as
 * scheduleRowsReadingMark returns it), by the given families or by any, or
 * in every table of the graph: one spelling per unit (AS-89).
 * @param {object|null|undefined} graph the sheet graph
 * @param {object|null} [table]
 * @param {string[]|null} [families]
 * @returns {string[]}
 */
export function scheduleMarksRead(graph, table = null, families = null) {
  const read = scheduleReading(graph);
  if (!read) return [];
  const out = new Map();
  for (const [t, marks] of read.byTable) {
    if (table && t !== table) continue;
    for (const [canon, { tag, families: by }] of marks) {
      if (families && ![...by].some((family) => families.includes(family))) continue;
      if (!out.has(canon)) out.set(canon, tag);
    }
  }
  return [...out.values()];
}

/**
 * Every mark the set's schedules name (AS-89): each row's key or printed
 * identity as the plan sweep reads it, split on "/", and every unit the
 * reconcile's reading reads, spaces dropped and upper-cased. The vocabulary
 * a drawn span is told apart from where the sweep looks for a unit its
 * reading found: a bare prefix answers for a mark only where no other mark
 * shares it (markid.ts spanAnswersFor), so a bare "D" is no DCU-1 where
 * DAC-1 is scheduled, nor "DCU" where DCU-2 is, whichever table names them.
 * @param {object|null|undefined} graph the sheet graph
 * @returns {string[]}
 */
export function scheduleMarkVocabulary(graph) {
  const read = scheduleReading(graph);
  if (!read) return [];
  if (!read.vocabulary) {
    const canon = (text) => String(text || "").trim().toUpperCase().replace(/\s+/g, "");
    const marks = new Set();
    for (const table of graph.tables) {
      for (const row of table?.rows || []) {
        for (const part of canon(rowIdentityTag(row) || row.key).split("/")) if (part.trim()) marks.add(part.trim());
      }
    }
    for (const mark of scheduleMarksRead(graph)) if (canon(mark)) marks.add(canon(mark));
    read.vocabulary = [...marks];
  }
  return [...read.vocabulary];
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
        // Tagged-only reconciliation still verifies the marker geometry in
        // bounded windows around exact authored tags. It skips the expensive
        // whole-sheet unlabeled audit, but never turns text alone into MATCH.
        verifyTaggedGeometry: true,
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
      // Not drawn on any plan sheet, but sweep_schedule_row still located it
      // on a schematic/legend/detail/etc sheet and disclosed the citation
      // instead of throwing (WP4). This is not a geometric search result —
      // skip the generic anchor/sheets handling below entirely, since
      // r.anchor is null and r.sheets is an all-zero placeholder (nothing
      // was actually swept). installedQty stays null: text never proves
      // installation.
      if (r.status === "reference_only") {
        sweepByTag.set(row.row_id || row.tag, {
          installedQty: null,
          installedQtyBasis: null,
          installedEvidenceGrade: "unverified",
          geometryVerified: false,
          searchScope: r.search_scope || null,
          unlabeledAuditComplete: r.unlabeled_audit_complete ?? null,
          planSearchComplete: r.complete !== false,
          itemStatus: "refused",
          reason: "drawn on schematic/legend sheets only",
          referenceTagCites: (r.reference_tags || []).map((rt) => ({
            sheet: rt.sheet, role: rt.role, bbox: rt.bbox, text: rt.text,
          })),
          planOtherCites: planOtherCites(null, graph, row.tag, session?.demolitionTagOccurrences?.(graph, row.tag) ?? [], session?.referenceTagOccurrences?.(graph, row.tag) ?? []),
        });
        processed++;
        opts.onProgress?.({
          phase: "reconcile_row", state: "done", tag: row.tag, processed, total,
          elapsed_ms: Math.round(performance.now() - started),
          status: "refused",
        });
        continue;
      }
      const installedQtyBasis = r.anchor?.grounding_basis || "symbol_fingerprint";
      const matchedCites = (r.sheets || []).flatMap((ps) =>
        (ps.matches || []).flatMap((m) => Array.from({ length: m.multiplier ?? 1 }, () => ({
          sheet: ps.sheet,
          at: m.at,
          ...(m.geometry_bbox || m.tag_at ? { bbox: m.geometry_bbox || m.tag_at } : {}),
          ...(m.tag_at ? { tag_bbox: m.tag_at } : {}),
          ...(Number.isFinite(m.score) ? { score: m.score } : {}),
          ...(m.attachment_via ? { attachment_via: m.attachment_via } : {}),
          ...(Number.isFinite(m.attachment_distance_px) ? { attachment_distance_px: m.attachment_distance_px } : {}),
          ...(m.counted_from === "explicit_label" ? { counted_from: "explicit_label" } : {}),
        }))),
      );
      const planTagCites = matchedCites.filter((cite) =>
        installedQtyBasis === "exact_plan_tag" || cite.counted_from === "explicit_label");
      const geometryCites = matchedCites.filter((cite) =>
        (installedQtyBasis === "symbol_fingerprint" || installedQtyBasis === "tag_attached_vector")
        && cite.counted_from !== "explicit_label");
      const geometryPlacementCount = (r.sheets || []).reduce((sum, sheet) =>
        sum + (sheet.matches || []).filter((match) => match.counted_from !== "explicit_label").length, 0);
      const taggedPlanQty = planTagCites.length;
      const observedPlanQty = geometryCites.length;
      const mixedEvidence = taggedPlanQty > 0 && observedPlanQty > 0;
      const tagTextOnly = taggedPlanQty > 0 && observedPlanQty === 0;
      const geometryVerified = (installedQtyBasis === "symbol_fingerprint" || installedQtyBasis === "tag_attached_vector")
        && taggedPlanQty === 0 && r.complete !== false;
      const candidateCites = (r.sheets || []).flatMap((ps) =>
        (ps.withheld || []).map((candidate) => ({
          sheet: ps.sheet,
          at: candidate.at,
          ...(Number.isFinite(candidate.score) ? { score: candidate.score } : {}),
          ...(candidate.reason ? { reason: candidate.reason } : {}),
          ...(candidate.hold ? { hold: candidate.hold } : {}),
        })),
      );
      sweepByTag.set(row.row_id || row.tag, {
        installedQty: geometryVerified ? observedPlanQty : null,
        taggedPlanQty: taggedPlanQty || null,
        placementCount: geometryPlacementCount || null,
        observedPlanQty: observedPlanQty || null,
        installedQtyBasis,
        installedEvidenceGrade: mixedEvidence
          ? "mixed_geometry_and_tag_text"
          : tagTextOnly
            ? "tag_text_only"
            : installedQtyBasis === "symbol_fingerprint" || installedQtyBasis === "tag_attached_vector"
              ? "symbol_geometry"
              : "unverified",
        geometryVerified,
        searchScope: r.search_scope || null,
        unlabeledAuditComplete: r.unlabeled_audit_complete ?? null,
        planSearchComplete: r.complete !== false,
        itemStatus: r.complete === false ? "refused" : "resolved",
        failureType: r.complete === false ? "INCOMPLETE_PLAN_SEARCH" : null,
        reason: r.complete === false
          ? `Plan search incomplete: ${r.found ?? 0} grounded placement(s) observed, but at least one sheet hit its candidate work cap. The observed count is a floor, not an installed total.`
          : taggedPlanQty
            ? `${taggedPlanQty} exact plan-tag observation${taggedPlanQty === 1 ? " was" : "s were"} not verified against matching symbol geometry${observedPlanQty ? `; ${observedPlanQty} separate geometry-grounded placement${observedPlanQty === 1 ? " was" : "s were"} retained as observed evidence` : ""}. Installed total remains unknown.`
            : null,
        planCites: geometryCites,
        planTagCites,
        planCandidateCites: candidateCites,
        planOtherCites: planOtherCites(r, graph, row.tag, session?.demolitionTagOccurrences?.(graph, row.tag) ?? [], session?.referenceTagOccurrences?.(graph, row.tag) ?? []),
      });
    } catch (e) {
      sweepByTag.set(row.row_id || row.tag, {
        installedQty: null,
        itemStatus: "refused",
        reason: e?.message || String(e),
        planOtherCites: planOtherCites(null, graph, row.tag, session?.demolitionTagOccurrences?.(graph, row.tag) ?? [], session?.referenceTagOccurrences?.(graph, row.tag) ?? []),
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

/**
 * A family reconcile run as several calls of the shared reconcile (AS-117).
 * The canvas's production run stops at its post-index limit; past it, the
 * same family reconcile runs again in tag chunks. `run` is one call of the
 * shared reconcile for the family (MCP's reconcile_schedule_plan on the
 * Session, over the remote bridge or the production path) scoped to `tags`,
 * so every row is the row that reconcile computes and the rows equal its one
 * call's. `run({ familySweepAll: false })` reads the family's rows unswept;
 * each chunk then sweeps its own tags. A chunk that fails is split in half and
 * run again; a tag that fails alone keeps its row, marked as a plan search
 * that did not finish (AMBIGUOUS, installed quantity unknown).
 *
 * @param {(o: { tags?: string[], familySweepAll?: boolean }) => Promise<any>} run
 * @param {{ tags?: string[]|null, familySweepAll?: boolean, chunkSize?: number,
 *   onChunk?: (p: { done: number, total: number, tags: string[], ok: boolean }) => void }} [opts]
 */
export async function reconcileFamilyInChunks(run, opts = {}) {
  const attempt = async (o) => {
    try {
      const result = await run(o);
      return result && !result.error && Array.isArray(result.rows)
        ? result
        : { error: result?.error || "The reconcile returned no rows." };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  };
  const scaffold = await attempt({ familySweepAll: false });
  if (scaffold.error) return scaffold;
  const norm = (tag) => String(tag ?? "").trim().toUpperCase();
  const requested = opts.tags?.length ? new Set(opts.tags.map(norm).filter(Boolean)) : null;
  // reconcileSchedulePlan's rule: a family with no tag list sweeps every row
  // unless the caller opts out.
  const sweepAll = !requested && opts.familySweepAll !== false;
  const wanted = [];
  const seen = new Set();
  for (const row of scaffold.rows) {
    const tag = norm(row.tag);
    if (!tag || seen.has(tag) || !(requested ? requested.has(tag) : sweepAll)) continue;
    seen.add(tag);
    wanted.push(tag);
  }
  const size = Math.max(1, Math.floor(opts.chunkSize || 8));
  const queue = [];
  for (let i = 0; i < wanted.length; i += size) queue.push(wanted.slice(i, i + size));
  const key = (row) => row.row_id ?? `${row.schedule_cite?.sheet ?? ""}|${row.schedule_cite?.title ?? ""}|${row.tag}`;
  const swept = new Map();
  const failed = new Map();
  let done = 0;
  while (queue.length) {
    const tags = queue.shift();
    const result = await attempt({ tags });
    if (result.error && tags.length > 1) {
      const half = Math.ceil(tags.length / 2);
      queue.unshift(tags.slice(0, half), tags.slice(half));
      continue;
    }
    if (result.error) failed.set(tags[0], result.error);
    else {
      const own = new Set(tags);
      for (const row of result.rows) if (own.has(norm(row.tag))) swept.set(key(row), row);
    }
    done += tags.length;
    opts.onChunk?.({ done, total: wanted.length, tags, ok: !result.error });
  }
  const rows = scaffold.rows.map((row) => {
    const own = swept.get(key(row));
    if (own) return own;
    const error = failed.get(norm(row.tag));
    if (error == null) return row;
    return {
      ...row,
      status: "AMBIGUOUS",
      plan_search_complete: false,
      reason: `The plan search for ${row.tag} did not finish (${error}); its installed quantity is unknown.`,
    };
  });
  return { ...scaffold, rows, summary: summarizeReconcile(rows) };
}

/** CSV header row for contractor reconcile export. */
export const RECONCILE_CSV_HEADERS = [
  "Tag",
  "Family",
  "Scheduled qty",
  "Scheduled qty basis",
  "Installed qty",
  "Tagged plan qty (unverified)",
  "Observed plan qty",
  "Installed qty basis",
  "Installed evidence grade",
  "Geometry verified",
  "Search scope",
  "Unlabeled audit complete",
  "Plan search complete",
  "Status",
  "Schedule sheet",
  "Schedule title",
  "Plan sheet(s)",
  "Tag-only plan sheet(s)",
  "Plan candidate count",
  "Notes",
  "Schedule drawing group",
  "Quantity comparison",
  "Grounded placements",
  "Diagram corroborated",
  "Diagram sheet(s)",
  "Diagram kind(s)",
];

/**
 * @param {Array<object>} rows
 * @returns {string}
 */
export function reconcileRowsToCsv(rows) {
  const lines = [RECONCILE_CSV_HEADERS.join(",")];
  for (const row of rows || []) {
    const planSheets = [...new Set((row.plan_cites || []).map((c) => c.sheet).filter(Boolean))].join("; ");
    const planTagSheets = [...new Set((row.plan_tag_cites || []).map((c) => c.sheet).filter(Boolean))].join("; ");
    const diagramSheets = [...new Set((row.diagram_cites || []).map((c) => c.sheet).filter(Boolean))].join("; ");
    const diagramKinds = [...new Set((row.diagram_cites || []).map((c) => c.diagram_kind).filter(Boolean))].join("; ");
    lines.push([
      row.tag,
      row.family || "",
      row.scheduled_qty,
      row.scheduled_qty_basis || "",
      row.installed_qty,
      row.tagged_plan_qty,
      row.observed_plan_qty,
      row.installed_qty_basis || "",
      row.installed_evidence_grade || "",
      row.geometry_verified,
      row.search_scope || "",
      row.unlabeled_audit_complete,
      row.plan_search_complete,
      row.status,
      row.schedule_cite?.sheet || "",
      row.schedule_cite?.title || "",
      planSheets,
      planTagSheets,
      (row.plan_candidate_cites || []).length,
      (row.reason || "").replace(/"/g, '""'),
      row.schedule_cite?.drawing_group || "",
      row.quantity_comparison || "",
      row.placement_count,
      row.diagram_corroborated,
      diagramSheets,
      diagramKinds,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return `${lines.join("\n")}\n`;
}
