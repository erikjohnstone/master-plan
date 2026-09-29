/**
 * Deterministic schedule / points-list quantity takeoff compiler for corpus
 * takeoffs (T-HVAC-01, T-BAS-01). Counts unique scheduled MARKs / VALVE MARKs
 * and extractable POINTS/DDC rows — not installed drawing instances.
 *
 * Versioned: changing family rules after VALIDATING starts requires a truth
 * CHANGELOG + reset to 0/5.
 */
import { scheduleTitleMatches } from "./scheduleTitleMatch.mjs";
import { scheduledQtyStatusFromRow } from "./schedulePlanReconcile.mjs";
import { VALVES, ACTUATORS, DAMPERS } from "./hvacTaxonomy.ts";
import { disciplineOfSheetNumber } from "./symbolsweep.ts";

/**
 * Real, evidence-based scope exclusions computed from THIS graph — never
 * static boilerplate copy-pasted across sets. Per HVAC_BAS_DOMAIN_MAP.md
 * (2026-09-02, GOAL.md rule 7): fire/smoke damper counts are only
 * authoritative when cross-checked against the architectural fire-rated
 * wall plan; this platform ingests mechanical-discipline PDFs, and when
 * the loaded set carries zero real "A"-prefixed (AIA discipline) sheets,
 * that cross-check is structurally impossible and must be disclosed —
 * never silently absorbed into a plausible-looking damper count. Same
 * principle for a separate specifications book: this platform can only
 * see what's actually in the uploaded PDF(s).
 */
export function scopeExclusionsForGraph(graph) {
  const exclusions = [];
  const sheets = graph?.sheets || [];
  const hasArchSheets = sheets.some(
    (s) => disciplineOfSheetNumber(s?.number ?? s?.sheetNumber) === "A",
  );
  if (!hasArchSheets) {
    exclusions.push(
      "No architectural sheets in this upload — fire/smoke damper counts are from mechanical sheets only; "
      + "a complete count requires cross-checking the architectural fire-rated wall plan, not present in this set.",
    );
  }
  exclusions.push(
    "Valve/damper type or performance requirements and commissioning/TAB scope that exist only in a separate "
    + "specifications book (CSI Division 23) are out of scope unless that book is part of this upload — this "
    + "platform can only see what was actually provided.",
  );
  return exclusions;
}

export const CORPUS_TAKEOFF_VERSION = 1;

// Real, hand-verified valve/damper/actuator tag prefixes from hvacTaxonomy.ts
// (evidence-disclosed, cross-corpus) — the structural signal that
// distinguishes a genuine valve/damper schedule from any other equipment
// schedule sharing the same generic TAG+MODEL/SIZE/MANUFACTURER header
// shape. VAV/CAV/FPT air-terminal prefixes are deliberately excluded — a
// VAV box is not a valve, even though its own schedule can share the same
// header columns.
const VALVE_DAMPER_TAG_PREFIXES = [...VALVES, ...ACTUATORS, ...DAMPERS]
  .flatMap((c) => c.tagPrefixes)
  .filter(Boolean);

// A row's mark columns (AS-79): the takeoff's and the reconcile's identity,
// and the valve's own where a row prints a UNIT MARK beside its VALVE MARK.
const MARK_HEADER_RE = /^(MARK|SYMBOL|VALVE\s*MARK|UNIT\s*MARK|EQUIP(?:\.?\s*TAG)?|DESIGNATION|UNIT\s*NO|UNIT\s*TAG|ITEM\s*NO)$/i;
const UNIT_MARK_HEADER_RE = /^UNIT\s*MARK$/i;
const VALVE_MARK_HEADER_RE = /^VALVE\s*MARK$/i;

/** True when at least one row's own mark (its key, or the VALVE MARK it
 * prints, whichever column leads the row) starts with a real, hand-verified
 * valve/damper/actuator tag prefix — mark-SHAPE corroboration, not a title
 * string match. This is what actually distinguishes "CV-7" (a real control
 * valve mark) from "RTU-1" (a rooftop unit that merely shares the same
 * generic TAG/GPM/SIZE/MODEL header columns). */
export function hasValveOrDamperMark(table) {
  for (const row of table?.rows || []) {
    for (const mark of [row?.key, cellText(row, VALVE_MARK_HEADER_RE)]) {
      const key = String(mark || "").trim().toUpperCase();
      if (!key) continue;
      if (VALVE_DAMPER_TAG_PREFIXES.some((p) => key.startsWith(p.toUpperCase()))) return true;
    }
  }
  return false;
}

/**
 * Real bug, found and fixed 2026-09-02 in compileEmbeddedCoilGaps, then
 * found present TWICE MORE (BAS points inventory↔printed reconciliation)
 * by sweeping the codebase for the same pattern once the first instance
 * was understood: plain String.includes() is a substring match with no
 * word boundary — "AHU-10".includes("AHU-1") === true — which silently
 * treats two DIFFERENT tags as the same one and hides a real gap behind
 * a false "already accounted for". Any tag/mark reconciliation across
 * this codebase should use this, never a bare .includes() on tag text.
 */
function tagMatches(needle, haystack) {
  const n = String(needle || "");
  const h = String(haystack || "");
  if (!n || !h) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:[^A-Z0-9]|$)`).test(h);
}

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

/** Sum positive integers under matching headers (PLC I/O LIST ANALOG/DIGITAL counts). */
function sumNumericCells(row, headerRe) {
  let sum = 0;
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (!headerRe.test(header)) continue;
    const n = parseInt(String(cell?.text ?? cell ?? "").trim(), 10);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

function cellBbox(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header) && Array.isArray(cell?.bbox)) return cell.bbox;
  }
  return null;
}

/** Union of cell bboxes → one schedule-row rect for cite highlights. */
export function unionBboxPx(boxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let any = false;
  for (const b of boxes || []) {
    if (!Array.isArray(b) || b.length !== 4) continue;
    const [a, c, d, e] = b.map(Number);
    if (![a, c, d, e].every(Number.isFinite) || !(d > a && e > c)) continue;
    any = true;
    if (a < x0) x0 = a;
    if (c < y0) y0 = c;
    if (d > x1) x1 = d;
    if (e > y1) y1 = e;
  }
  return any ? [x0, y0, x1, y1] : null;
}

function rowCellsBbox(row) {
  const boxes = [];
  for (const cell of Object.values(row?.cells || {})) {
    if (Array.isArray(cell?.bbox) && cell.bbox.length === 4) boxes.push(cell.bbox);
  }
  if (Array.isArray(row?.identity?.bbox) && row.identity.bbox.length === 4) {
    boxes.push(row.identity.bbox);
  }
  return unionBboxPx(boxes);
}

/** Flatten schedule row cells into text + bbox for takeoff line cites. */
function scheduleAttrs(row) {
  const cells = {};
  for (const [header, cell] of Object.entries(row.cells || {})) {
    const hu = String(header || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (/^(MARK|TAG|SYMBOL|VALVE MARK|ID|KEY)$/.test(hu)) continue;
    const text = String(cell?.text ?? "").trim();
    if (!text) continue;
    cells[header] = {
      text,
      bbox: Array.isArray(cell?.bbox) && cell.bbox.length === 4 ? cell.bbox : null,
    };
  }
  const description = cellText(row, /^DESCRIPTION$/i)
    || cellText(row, /DESCRIPTION/i)
    || cellText(row, /^SERVICE$/i)
    || null;
  return { cells, description };
}

/**
 * Printed ALARM/TREND cells often say "No" / "-" for every row. Only promote
 * affirmative / configured values — never treat a negation as an alarm/trend.
 */
export function printedBasFlag(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^(?:N|NO|NONE|NIL|FALSE|0|-|—|–|n\/?a)$/i.test(s)) return null;
  return s;
}

/**
 * First-class BAS point extras when the source table prints them (WP8).
 * Never invent alarms/trends/hard-vs-soft — only promote printed columns.
 * Header match is exact (ALARM / TREND / TREND LOG) so DESCRIPTION free-text
 * and compound headers do not inflate rollups.
 * @returns {{ alarm: string|null, trend: string|null, wiring: "hardwired"|"soft"|null }}
 */
export function basPointExtras(row) {
  const alarm = printedBasFlag(cellText(row, /^\s*ALARMS?\s*$/i));
  const trend = printedBasFlag(cellText(row, /^\s*TREND(?:\s*LOG)?S?\s*$/i));
  // Hardwired vs soft/supervisory — only when the sheet distinguishes them.
  // Do not scan POINT TYPE (usually AI/AO/BI/BO) or free-text DESCRIPTION.
  const wiringRaw = (
    cellText(row, /^\s*WIRING\s*$/i)
    || cellText(row, /^\s*SIGNAL\s*TYPE\s*$/i)
    || cellText(row, /^\s*(?:HARD\s*WIRED|HARDWIRED|CONNECTION)\s*$/i)
    || ""
  ).trim();
  let wiring = null;
  if (wiringRaw && !/^(?:N|NO|NONE|-|—|–|n\/?a)$/i.test(wiringRaw)) {
    if (/\bHARD\s*WIRED\b|\bHARDWIRED\b|\bDISCRETE\b|\bFIELD\s*I\s*\/?\s*O\b/i.test(wiringRaw)) {
      wiring = "hardwired";
    } else if (/\bBACnet\b|\bMODBUS\b|\bSOFT\b|\bINTEGRATED\b|\bSUPERVISORY\b|\bNETWORK\b|\bSOFTWARE\b/i.test(wiringRaw)) {
      wiring = "soft";
    }
  }
  return {
    alarm,
    trend,
    wiring,
  };
}

/**
 * Vector/CAD fonts often render digit 1 as letter I inside equipment marks
 * (DOAH-TI → DOAH-T1, AHU-T1A/TIB → AHU-T1A/T1B). Set-agnostic glyph repair
 * only — never invents a new family or unit that isn't already in the token.
 */
export function ocrFixEquipMark(raw) {
  let t = String(raw || "").trim();
  if (!t) return t;
  // Slash compounds: AHU-T1A/TIB → fix each side; bare right side inherits family.
  if (t.includes("/")) {
    const parts = t.split("/").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return t;
    const left = ocrFixEquipMark(parts[0]);
    const fam = left.match(/^([A-Za-z]{1,8})[\s\-]/)?.[1] || null;
    const rest = parts.slice(1).map((p) => {
      let side = p;
      // "TIB" after "AHU-T1A" → "AHU-TIB" before I→1 repair.
      if (fam && !/^[A-Za-z]{2,8}[\s\-]?\d/i.test(side) && /^[A-Za-z]/i.test(side)) {
        side = `${fam}-${side}`;
      }
      return ocrFixEquipMark(side);
    });
    return [left, ...rest].join("/");
  }
  // After a hyphenated letter prefix, trailing I or Ix → 1 / 1x (TI→T1, TIB→T1B).
  t = t.replace(/([A-Za-z]{1,8}-[A-Za-z]*)I([A-Za-z]?)$/i, (_, a, b) => `${a}1${b || ""}`);
  return t;
}

/**
 * Leading equipment mark in a points DESCRIPTION ("AHU-T1B SA TEMP…").
 * Prefer this over title tokens when present — per-row truth on dual-unit lists.
 */
export function equipMarkFromBasDescription(description = "") {
  const d = String(description || "").replace(/\s+/g, " ").trim();
  if (!d) return null;
  // Require a hyphenated equipment mark (AHU-T1B, DOAH-T1, FCU-A8). Reject
  // filter ratings / prose ("MERV 8", "SPACE TEMPERATURE").
  const m = d.match(/^([A-Z]{1,8}-[A-Z]*\d+[A-Z0-9]*)\b/i);
  if (!m) return null;
  return ocrFixEquipMark(normalizeEquipMark(m[1]) || m[1]);
}

/**
 * Served equipment for a BAS points row (Pillar C — estimator join key).
 * Prefer printed UNIT/EQUIPMENT/SERVED columns; else a mark leading the
 * DESCRIPTION; else I/O LIST device keys (HWP-1); else a unit token trailing
 * "POINTS LIST …". OCR I→1 repair applied so plan paint can join schedules.
 * Never invent families or units absent from printed text.
 * @returns {string|null}
 */
export function servedEquipmentFromBasRow(row, listTitle = "") {
  const fromCell = (
    cellText(row, /^\s*UNIT(?:\s*MARK|\s*TAG|\s*NO\.?)?\s*$/i)
    || cellText(row, /^\s*EQUIP(?:MENT)?(?:\s*MARK|\s*TAG|\s*NO\.?)?\s*$/i)
    || cellText(row, /^\s*SERVED(?:\s*(?:UNIT|EQUIP(?:MENT)?))?\s*$/i)
    || cellText(row, /^\s*ASSOCIATED\s*EQUIP(?:MENT)?\s*$/i)
    || ""
  ).trim();
  if (fromCell) {
    const n = ocrFixEquipMark(normalizeEquipMark(fromCell) || fromCell);
    // Dual-unit UNIT cells are rare; if DESCRIPTION names one side, prefer it.
    const fromDesc = equipMarkFromBasDescription(
      cellText(row, /DESCRIPTION/i) || scheduleAttrs(row).description || "",
    );
    if (fromDesc && (fromCell.includes("/") || /\/|I$/i.test(fromCell))) return fromDesc;
    return n;
  }

  const fromDesc = equipMarkFromBasDescription(
    cellText(row, /DESCRIPTION/i) || scheduleAttrs(row).description || "",
  );
  if (fromDesc) return fromDesc;

  const tag = String(row?.key || "").trim();
  // I/O LIST device rows: key is the equipment/device, not AI## / AI-1 / AO 2.
  // Hyphenated/spaced point tags must not become served_equipment (pier 015).
  if (
    tag
    && !/^(AI|AO|BI|BO)[\s\-]?\d/i.test(tag)
    && !isBasPointsHeaderRow(tag)
  ) {
    return ocrFixEquipMark(normalizeEquipMark(tag) || tag);
  }

  const title = String(listTitle || "").replace(/\s+/g, " ").trim();
  const m = title.match(/\bPOINTS\s+LIST\s+(.+)$/i);
  if (m) {
    let rest = m[1].replace(/\s*(?:SCHEDULE|CONTINUATION|CONT'?D)\s*$/i, "").trim();
    // "FCU WITH COOLING COILS DDC …" is a family caption, not a unit mark.
    if (rest && !/^(?:WITH|FOR|AND)\b/i.test(rest) && !/\bWITH\b/i.test(rest)) {
      // Keep first mark-like token (AHU-1 / DOAH-TI / AHU-T1A/T1B).
      const tok = rest.match(/^([A-Z]{1,8}[\s\-]?\d*[A-Z0-9\/\-]*)/i);
      if (tok) {
        const fixed = ocrFixEquipMark(normalizeEquipMark(tok[1]) || tok[1].trim());
        // Slash title without per-row desc: return first side only (joinable).
        if (fixed.includes("/")) return fixed.split("/")[0];
        return fixed;
      }
    }
  }
  return null;
}

/**
 * Building code from equipment / unit tags (set-agnostic): letter immediately
 * before digits in a hyphen segment (AHU-A1 → A, FCU-T12 → T), or a trailing
 * single letter (CV-CHW-BP-A → A). Not a project name map — callers display
 * "Building A", never hard-coded job titles.
 */
export function buildingCodeFromTag(tag) {
  const s = String(tag || "").toUpperCase();
  const beforeDigits = s.match(/-([A-Z])(?=\d)/);
  if (beforeDigits) return beforeDigits[1];
  const trailing = s.match(/-([A-Z])$/);
  if (trailing) return trailing[1];
  return null;
}

function buildingLetter(tag) {
  return buildingCodeFromTag(tag);
}

/**
 * Drawing revision prefixes — "(N)" new, "(E)" existing, "(R)" relocated —
 * often glue into extractor keys (NACC-2 from "(N)ACC-2"). Strip them so
 * family keyRe matches set-agnostic ACC-/ATU-/AHU- marks.
 */
export function normalizeEquipMark(raw) {
  let t = String(raw || "").trim();
  if (!t) return t;
  t = t.replace(/^\(([NER])\)\s*/i, "");
  // Glued forms when parentheses were dropped: NACC-2, NATUK1, NAHU-1.
  const glued = t.match(/^N((?:AHU|ATU|ACC|FCU|VAV|RTU|CU|EF|SF|RF|DOAS|ERV)[\s\-A-Z0-9].*)$/i);
  if (glued) t = glued[1];
  // Building letter + space before equip mark (boiler-plant "B GV-7"). Require
  // a ≥2-letter family token so "G 2 CFM" still reaches the trailer strip below.
  t = t.replace(/^[A-Za-z]\s+(?=[A-Za-z]{2,8}[\s\-]?\d)/, "");
  // SYMBOL cells often append size/CFM/room: "G-2 CFM", "R-1 30x6", "EH-1 TOILET 135".
  // Keep the leading mark when a space-separated trailer remains (Baker GRD).
  // Do NOT strip comma/slash compounds ("AHU-1, HP-1") — callers split those later.
  const lead = t.match(/^([A-Za-z]{1,8}[\s\-]?\d+[A-Za-z]?(?:\/[A-Za-z0-9\-]+)*)\b/);
  if (lead) {
    const rest = t.slice(lead[0].length);
    if (/^\s+\S/.test(rest) && !/^[\s]*[,/]/.test(rest)) {
      t = lead[1];
    }
  }
  return t.trim();
}

/**
 * Expand paired schedule marks joined by "&" (Northport "RF-1 & 2", "RF-1 & RF-2").
 * Digits-only right half reuses the left prefix. Prose ("B & G MODEL") is unchanged.
 */

/** A short equipment mark: a family token, optional lettered segments, a
 * number of at most four digits and one short trailing segment of up to six
 * letters and digits, such as a room code (ET-1, SH1, CC-15-6, S-A-1,
 * TU-28-1, AHU-3001, 030_NY's FCU-01-CG06A; AS-63) — never a catalog model. */
const SHORT_EQUIP_MARK_RE = /^[A-Z]{1,8}(?:-[A-Z]{1,8})*-?\d{1,4}(?:-[A-Z0-9]{1,6})?$/;

/**
 * Optional building/area prefix on marks (WHSE-ET-1, AREA-AHU-1), including
 * a numbered or coded building or area (1-VAV-1, 40-AHU-2, W05-TU-01,
 * B950-AHU-3001: 05_MO, 041_IL, 031_MO and 067_CA print their marks so, AS-62),
 * and a numbered or coded building followed by its floor or wing (01-1-DAC-1,
 * 05-B-DAC-1, 07-A-CU-1: 036_LA prints its marks so, AS-64).
 * Strip the leading TOKEN- (or building and floor) when the remainder still
 * looks like an equipment mark so family keyRe stays set-agnostic across
 * multi-building schedules.
 */
export function markCoreForKeyRe(tag) {
  const canon = String(tag || "").toUpperCase().replace(/\s+/g, "");
  if (!canon) return canon;
  // WHSE-ET-1 → ET-1; WHSE-SH1 → SH1; 1-VAV-1 → VAV-1; W05-TU-01 → TU-01.
  // The token is letters, a number of at most three digits, or a short code
  // of letters and digits. Remainder must start with a ≥2-letter family
  // token so steam-trap ST-H-3 is NOT stripped to H-3 (false humidifier).
  // A numbered or coded building may be followed by its floor (a number of
  // at most two digits) or wing (one letter): 01-1-DAC-1 → DAC-1,
  // 05-B-DAC-1 → DAC-1 (AS-64). A lettered token is never a building there,
  // so a unit's own mark (AHU-1-SF-1) keeps the reading it had.
  const building = canon.replace(/^(?:[A-Z]{2,8}|\d{1,3}|[A-Z]{1,3}\d{1,4}[A-Z]?)-(?=[A-Z]{2,8}[\s\-]?\d)/, "");
  const stripped = building !== canon ? building
    : canon.replace(/^(?:\d{1,3}|[A-Z]{1,3}\d{1,4}[A-Z]?)-(?:\d{1,2}|[A-Z])-(?=[A-Z]{2,8}[\s\-]?\d)/, "");
  if (stripped === canon) return canon;
  // Only accept building-prefix strip when the remainder is a short equip mark
  // (ET-1, SH1, CC-15-6, S-A-1) — not catalog models (TPLFY-EP15NEM4 → EP15NEM4
  // falsely matching PUMP blankKeyRe /^EP/).
  if (SHORT_EQUIP_MARK_RE.test(stripped)) {
    return stripped;
  }
  return canon;
}

/**
 * The forms of a mark a family keyRe reads: the mark, its core without a
 * building prefix (markCoreForKeyRe), and either without a building letter
 * printed between the family token and the number (074_CA's FC-A-2,
 * FC-A-13-1 → FC-2, FC-13-1; the letter buildingCodeFromTag reads in
 * AHU-A1), when what is left is still a short equipment mark (AS-62).
 */
export function markFormsForKeyRe(tag) {
  const canon = String(tag || "").toUpperCase().replace(/\s+/g, "");
  if (!canon) return [];
  const forms = [canon];
  const core = markCoreForKeyRe(canon);
  if (core !== canon) forms.push(core);
  for (const f of [...forms]) {
    const lettered = f.replace(/^([A-Z]{2,8})-[A-Z]-(?=\d)/, "$1-");
    if (lettered !== f && SHORT_EQUIP_MARK_RE.test(lettered) && !forms.includes(lettered)) forms.push(lettered);
  }
  return forms;
}

/** Whether a family's mark rule reads a mark, in any of its forms
 * (markFormsForKeyRe). The compile and the reconcile scaffold both gate rows
 * through it (AS-62), so a unit the takeoff counts has its reconcile row. */
export function markMatchesKeyRe(re, one, canon) {
  if (!re) return false;
  if (re.test(canon) || re.test(one)) return true;
  // Building-prefix strip (WHSE-ET-1 → ET-1, 1-VAV-1 → VAV-1) and a building
  // letter between the family token and the number (FC-A-2 → FC-2) keep
  // family keyRe set-agnostic.
  return markFormsForKeyRe(canon).slice(1).some((f) => re.test(f));
}

/**
 * A transposed schedule runs its units across the columns and its attributes
 * down the rows. Its corner prints the label of the header row of marks
 * (21_VA's DESIGNATION, 071_ME's UNIT and UNIT NO., 040_IL's SYMBOL); each
 * later header names a unit (AHU-1, "EF-2, EF-5, EF-7, EF-9", "CHWP-1 AND
 * CHWP-2", "ACU-1 / ACCU-3") and each row is one attribute. Read row by row,
 * its attribute names were units (21_VA's "MANUFACTURER" as a condensing unit,
 * 071_ME's "24%" as a rooftop unit) and its units none (AS-65).
 */
const MARK_ROW_LABEL_RE = /^(?:DESIGNATION\b.*|SYMBOL|MARK|TAG|UNIT(?:\s*(?:NO\.?|NUMBER|TAG|MARK|ID))?|EQUIP(?:MENT)?(?:\s*(?:NO\.?|TAG|MARK|ID))?|ITEM(?:\s*NO\.?)?)$/i;

/** A row label that names an identity, not an attribute: the row of marks
 * printed again, or a column a reader takes a unit's mark from. Read as a
 * unit's attribute, it would stand beside, or for, the unit's own mark. */
const IDENTITY_LABEL_RE = /^(?:VALVE\s*MARK|UNIT\s*MARK|EQUIP(?:\.?\s*TAG)?|ID|KEY)$/i;

const markCanon = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");
/** A mark with a number, in any form the family rules read (AHU-1, 1-VAV-1). */
const numberedMark = (s) => SHORT_EQUIP_MARK_RE.test(markCoreForKeyRe(markCanon(s)));
/** A unit a letter names beside its numbered siblings (071_ME's RTU-G). */
const letteredMark = (s) => /^[A-Z]{2,8}-[A-Z]{1,2}$/.test(markCanon(s));

/**
 * A table no title vouches for (untitled, or a general MISCELLANEOUS,
 * EQUIPMENT, SPECIALTY EQUIPMENT or HYDRONIC ACCESSORIES schedule) names a
 * family's units only by the marks its rows print. One the sheet graph
 * classes as a reference or room/finish table holds none: a notes list, a
 * drawing index, a furnishings list, an occupant-load table. Read by mark
 * alone, 061_IA's STEEL FRAMING NOTES (SF1 to SF10) and SPECIAL INSPECTION
 * notes (SP1 to SP5) were fans and pumps, 08_ME's drawing index (P101 to
 * P103) pumps, 23_GA's architectural SPECIALTY EQUIPMENT SCHEDULE (toilet
 * accessories T1 to T24) ERVs, and 031_MO's JSN list (RF-2, a refrigerator)
 * and occupant loads (WH 1ST FLR) a fan and a water heater (AS-66). A titled
 * table is read as its title says, whatever its kind.
 */
export function unvouchedTableHoldsUnits(table) {
  return !["reference", "room-finish", "finish"].includes(table?.kind);
}

/**
 * In a table no title vouches for, a mark of letters alone is a word, not a
 * unit: 02_UT's SPF and 19_CA's SFD, from abbreviation lists, were fans
 * (AS-66). A unit's mark carries its number, a letter beside its family token
 * (061_IA's WWHP-A) or a code (NAVFAC's CV-CHW-BP-A).
 */
export function unvouchedMarkNamesUnit(mark) {
  return !/^[A-Z]+$/i.test(String(mark ?? "").trim());
}

/** The units a transposed schedule's column header names, as the row keys the
 * takeoff reads: one per mark of a list, of an AND pair or of a range ("UH-1
 * THRU UH-3"), and an indoor/outdoor "/" pair kept as one key, as a row
 * printing it is read. Trailing words after a mark (071_ME's "RTU-1 (ALT#2)",
 * a chiller's model or a unit heater's ratings run into its header) are
 * dropped by the compile's own normalization. Null when any part is no mark. */
function transposedHeaderKeys(header) {
  let s = String(header || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(/\b([A-Z]{1,8})([\s\-]?)(\d{1,4})\s+(?:THRU|THROUGH|TO)\s+(?:\1[\s\-]?)?(\d{1,4})\b/g, (m, p, sep, a, b) => {
    const lo = Number(a), hi = Number(b);
    if (!(hi > lo && hi - lo <= 50)) return m;
    return Array.from({ length: hi - lo + 1 }, (_, i) => `${p}${sep || "-"}${lo + i}`).join(" & ");
  });
  const keys = [];
  for (const group of s.split(/\s*(?:,|&|\bAND\b)\s*/).filter(Boolean)) {
    // A range the expansion above did not read (too long, backwards, dashed,
    // between two families' marks) would read as its first mark alone.
    if (/^\S+\s+(?:[-\u2013\u2014]|THRU|THROUGH|TO)\s+(?:[A-Z]{1,8}[\s\-]?)?\d/.test(group)) return null;
    // The words after a mark first, so a rating run into the header (21_VA's
    // "UH-1 THRU UH-3 ... 1/20 115/1 DIRECT") is no pair.
    const pair = normalizeEquipMark(group).split(/\s*\/\s*/).filter(Boolean).map((p) => normalizeEquipMark(p).trim());
    if (!pair.length || !pair.every((p) => numberedMark(p) || letteredMark(p))) return null;
    keys.push(pair.join(" / "));
  }
  return keys.length ? keys : null;
}

/** The box a column's cells share, without a cell the extraction placed off
 * its column. */
function columnBox(boxes) {
  const ok = boxes.filter((b) => Array.isArray(b) && b.length === 4);
  if (!ok.length) return null;
  const mid = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const cx = mid(ok.map((b) => (b[0] + b[2]) / 2));
  const w = mid(ok.map((b) => b[2] - b[0]));
  const inCol = ok.filter((b) => Math.abs((b[0] + b[2]) / 2 - cx) <= Math.max(w, 1));
  const use = inCol.length ? inCol : ok;
  return [Math.min(...use.map((b) => b[0])), Math.min(...use.map((b) => b[1])), Math.max(...use.map((b) => b[2])), Math.max(...use.map((b) => b[3]))];
}

/**
 * A transposed family schedule read as one row per unit (AS-65), or null
 * when the table is no such schedule. It is one when its title names a family
 * the takeoff reads, a column's header labels the header row as marks
 * (MARK_ROW_LABEL_RE) and every later header names units, and its rows are
 * attributes, not marks. Each unit's row carries the unit's mark (MARK) and
 * one cell per attribute, named by the attribute's printed label; the columns
 * before the label column name sections ("SUPPLY FAN", "SECONDARY HEAT"),
 * joined to the labels they cover where each sits on its section's first row
 * (071_ME). Where a section label is drawn down a merged cell beside its rows
 * (21_VA's air handlers) no row says which section it is in, so only the rows
 * whose own label spans the section column are read. A label printed twice
 * (a supply and a return fan's CFM) is ambiguous and read for neither.
 */
function transposedScheduleView(table) {
  const headers = (table?.headers || []).map((h) => String(h ?? ""));
  const rows = table?.rows || [];
  if (headers.length < 2 || !rows.length) return null;
  const title = String(table.title?.text || "");
  if (!Object.values(HVAC_FAMILY_SPECS).some((s) => s.titleRe?.test(title) && !s.exclude?.test(title))) return null;
  // A points list is never a schedule of units, however it is laid out.
  if (isBasPointsListTitle(title) || isBasPointsListTable(table)) return null;
  let L = -1;
  for (let i = 0; i < headers.length - 1; i++) if (MARK_ROW_LABEL_RE.test(headers[i].trim())) L = i;
  if (L < 0) return null;
  const unitHeaders = headers.slice(L + 1);
  const unitKeys = unitHeaders.map(transposedHeaderKeys);
  if (unitKeys.some((k) => !k) || !unitKeys.flat().some((k) => k.split(" / ").some(numberedMark))) return null;
  const labelHeader = headers[L];
  const labelOf = (row) => String(row.cells?.[labelHeader]?.text ?? row.key ?? "").replace(/\s+/g, " ").trim();
  const labels = rows.map(labelOf).filter(Boolean);
  if (!labels.length || labels.filter((l) => numberedMark(normalizeEquipMark(l))).length > 0.3 * labels.length) return null;

  const sectionHeaders = headers.slice(0, L);
  const top = (row) => {
    const b = row.cells?.[labelHeader]?.bbox;
    return Array.isArray(b) ? b[1] : Math.min(...Object.values(row.cells || {}).map((c) => (Array.isArray(c?.bbox) ? c.bbox[1] : Infinity)));
  };
  const ordered = rows.map((row, i) => ({ row, i, y: top(row) })).sort((a, b) => a.y - b.y || a.i - b.i);
  const sectionCells = (row) => sectionHeaders.map((h) => row.cells?.[h]).filter((c) => String(c?.text ?? "").trim());
  // Sections sit on their first row (071_ME) or are drawn down merged cells
  // (21_VA): a section cell no taller than its row and level with its label.
  let firstRow = true;
  for (const { row } of ordered) {
    const label = row.cells?.[labelHeader];
    const lb = label?.bbox;
    for (const c of sectionCells(row)) {
      if (String(c.text).trim() === labelOf(row)) continue;
      const cb = c.bbox;
      const lh = Array.isArray(lb) ? lb[3] - lb[1] : 0;
      if (!(Array.isArray(cb) && lh > 0 && cb[3] - cb[1] <= 1.5 * lh && Math.abs(cb[1] - lb[1]) <= 0.3 * lh)) firstRow = false;
    }
  }
  // A heading printed across the unit columns with no value names a section
  // whose end is not drawn (040_IL's air handler prints SUPPLY FAN so, its
  // fan's rows indented under it and OUTSIDE AIR CFM after them): the rows
  // after it are read for no unit.
  const unitX0 = Math.min(...unitHeaders.map((h) => columnBox(ordered.map(({ row }) => row.cells?.[h]?.bbox))?.[0] ?? Infinity));
  const heading = (row) => {
    const b = row.cells?.[labelHeader]?.bbox;
    return Array.isArray(b) && b[2] > unitX0 + 1 && unitHeaders.every((h) => !String(row.cells?.[h]?.text ?? "").trim());
  };
  const composed = [];
  let section = "";
  let unbounded = false;
  for (const { row } of ordered) {
    const label = labelOf(row);
    if (!label) continue;
    if (unbounded || heading(row)) { unbounded = true; continue; }
    const texts = sectionCells(row).map((c) => String(c.text).replace(/\s+/g, " ").trim());
    const spans = texts.length > 0 && texts.every((t) => t === label);
    const named = texts.find((t) => t !== label);
    if (!sectionHeaders.length) composed.push({ row, label });
    else if (firstRow) {
      if (spans) section = "";
      else if (named) section = named;
      composed.push({ row, label: section ? `${section} ${label}` : label });
    } else if (spans) composed.push({ row, label });
  }
  const seen = new Map();
  for (const c of composed) seen.set(c.label, (seen.get(c.label) || 0) + 1);
  const usable = composed.filter((c) => seen.get(c.label) === 1 && !MARK_ROW_LABEL_RE.test(c.label) && !IDENTITY_LABEL_RE.test(c.label));
  const usableRows = new Set(usable.map((u) => u.row));

  const out = [];
  unitHeaders.forEach((h, j) => {
    const cells = {};
    const boxes = [];
    for (const { row } of ordered) if (Array.isArray(row.cells?.[h]?.bbox)) boxes.push(row.cells[h].bbox);
    for (const { row, label } of usable) {
      const c = row.cells?.[h];
      const text = String(c?.text ?? "").trim();
      if (text) cells[label] = { text, bbox: Array.isArray(c?.bbox) ? c.bbox : null };
    }
    const box = columnBox(boxes);
    for (const key of unitKeys[j]) {
      out.push({ key, cells: { MARK: { text: key, bbox: box }, ...cells }, identity: { text: key, bbox: box }, transposed: true });
    }
  });
  return {
    ...table,
    headers: ["MARK", ...usable.map((u) => u.label)],
    rows: out,
    transposed: {
      label_header: labelHeader,
      unit_headers: unitHeaders,
      sections: !sectionHeaders.length ? "none" : firstRow ? "first_row" : "merged",
      // The labels read for no unit: one printed twice, one a merged section
      // cell covers, one under a heading whose section's end is not drawn,
      // or one naming an identity.
      unread_labels: [...new Set(ordered.filter(({ row }) => labelOf(row) && !usableRows.has(row)).map(({ row }) => labelOf(row)))],
    },
  };
}

const scheduleViews = new WeakMap();
/**
 * The table the takeoff, the reconcile scaffold and the notice of rows read
 * as no unit all read: a transposed family schedule as one row per unit
 * (transposedScheduleView), any other table as extracted. One view for every
 * reader, so a unit the takeoff counts has its reconcile row and its notice
 * line (AS-65). A table is not edited once the sheet graph holds it, so its
 * view is made once.
 */
export function scheduleTableView(table) {
  if (!table || typeof table !== "object") return table;
  let view = scheduleViews.get(table);
  if (!view) {
    view = transposedScheduleView(table) || table;
    scheduleViews.set(table, view);
  }
  return view;
}

/**
 * L5 geometry: concatenate column headers from table.headers and row-0 cell keys.
 * Used to classify untitled schedule grids by header shape — not title regex alone.
 */
export function tableHeaderBlob(table) {
  const seen = new Set();
  const parts = [];
  const push = (raw) => {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    const key = t.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(t);
  };
  for (const h of table?.headers || []) push(h);
  const first = (table?.rows || [])[0];
  if (first?.cells) {
    for (const header of Object.keys(first.cells)) push(header);
  }
  return parts.join(" ").toUpperCase();
}

/** True when every required header-token regex matches the table header blob. */
export function headerShapeMatches(table, requiredRes) {
  const blob = tableHeaderBlob(table);
  if (!blob.trim()) return false;
  const reqs = Array.isArray(requiredRes) ? requiredRes : [requiredRes];
  return reqs.every((re) => re.test(blob));
}

/**
 * Untitled hydronic control-valve grid (TAG + GPM/Cv/SERVED/MODEL — not BAS
 * I/O). This header shape alone is NOT valve-specific — a generic equipment
 * schedule (RTU, AHU, boiler, ...) commonly shares the exact same
 * TAG/MODEL/SIZE/MANUFACTURER columns, so a real RTU sample this project
 * found (024_MO_E2508_01) false-positived here (harness snapshot, not
 * production compile — production's per-family uniqueFamily already
 * refused it correctly, but this shared shape gate is also what
 * gridClassify.mjs's classifyGrid uses to LABEL a table, so hardening it
 * generally, not just re-checking downstream, is the real fix). Since this
 * function exists specifically for the UNTITLED case (no title text to
 * corroborate against), require row-key mark-SHAPE corroboration against
 * the real, hand-verified valve/damper/actuator prefixes in
 * hvacTaxonomy.ts — structure confirming structure, never a title regex.
 */
export function isControlValveHeaderShape(table) {
  const blob = tableHeaderBlob(table);
  if (!blob) return false;
  if (/\b(?:AI|AO|BI|BO)\b/.test(blob) && !/\b(?:GPM|\bCV\b)\b/.test(blob)) return false;
  if (!hasValveOrDamperMark(table)) return false;
  return headerShapeMatches(table, [
    /\b(?:TAG|MARK|VALVE\s*MARK)\b/,
    /\b(?:GPM|\bCV\b|SERVED|MANUFACTURER|MODEL|SIZE|ACTUATOR|FLOW)\b/,
  ]);
}

// ── embedded coil detection (equipment schedules, not just valve schedules) ──
// Real, found-live gap (2026-09-02, 001_NC_FY20_P_228_ATC_Tower_and_Air_
// Operations): real hydronic coil performance data (GPM + EWT/LWT) is
// drawn directly inside an AHU/RTU/FCU equipment-schedule ROW on some real
// drafters' sets, with no separate valve/coil schedule anywhere in the
// set — the equipment row IS the only record a control valve exists.
// "Look for a valve table" cannot find this by construction: there is no
// valve table. A coil that needs hydronic flow control always implies a
// control valve — that's physics, not a drafting convention — so
// detection has to walk every equipment schedule's own header shape for
// coil sub-blocks, never gated on the table already being believed to be
// about valves.
const COIL_MARKER_RE = /\bGPM\b|\bE\.?W\.?T\.?\b|\bL\.?W\.?T\.?\b|ENTERING\s+WATER|LEAVING\s+WATER|CAPACITY\s*\(MBH\)|FLUID\s+P\.?D\.?|PRESSURE\s+DROP|\bROWS?\b|\bFPI\b|COIL\s+SIZE|PIPING\s+RUNOUT|\bMBH\b/i;
const COIL_GPM_RE = /\bGPM\b/i;
const COIL_WATER_TEMP_RE = /\bE\.?W\.?T\.?\b|\bL\.?W\.?T\.?\b|ENTERING\s+WATER|LEAVING\s+WATER/i;
// Real, found-live gap (2026-09-02, 021_XX_Laboratory_building's own AIR
// HANDLING UNIT SCHEDULE and AIR TERMINAL UNIT SCHEDULE): a real coil can
// report GPM + capacity (MBH) + physical row count with NO water-temp
// columns at all — the design EWT/LWT is a fixed system-wide value stated
// once elsewhere, not repeated per-unit. GPM+CAPACITY+ROWS together is
// itself a real, coil-specific structural signature (a pump or a valve
// schedule never reports "ROWS" — that's a heat-exchanger-coil-only term)
// — a second, independent admission gate alongside GPM+water-temp, not a
// replacement for it.
const COIL_CAPACITY_RE = /\bMBH\b|CAPACITY/i;
const COIL_ROWS_RE = /\bROWS?\b/i;
// Real, found-live gap (2026-09-02, same 021_XX AIR HANDLING UNIT
// SCHEDULE): "COOLING COIL DATA FLOW (GPM)" has neither a water temp nor
// a row count — just capacity + GPM — but the word "COIL" is right there
// in the header text itself. A third, independent admission gate: GPM
// co-occurring with a header that literally says "COIL" is real, explicit
// textual evidence, the same kind of header-vocabulary signal already
// used for valve detection (GPM/CV/SERVED), not a title-string guess.
const COIL_WORD_RE = /\bCOIL\b/i;

/** True when a header set carries any real admission signature for a
 * hydronic coil block: GPM + a water temperature, GPM + capacity + row
 * count, or GPM + a header that literally names a coil. Shared by both
 * the prefix-grouped pass and the whole-table fallback so the gates never
 * drift apart. */
function hasCoilSignal(hs) {
  const hasGpm = hs.some((h) => COIL_GPM_RE.test(h));
  if (!hasGpm) return false;
  if (hs.some((h) => COIL_WATER_TEMP_RE.test(h))) return true;
  if (hs.some((h) => COIL_CAPACITY_RE.test(h)) && hs.some((h) => COIL_ROWS_RE.test(h))) return true;
  return hs.some((h) => COIL_WORD_RE.test(h));
}

/** Header text with the first coil-data marker token (and everything from
 * it onward) stripped, so "PREHEAT COIL GPM" and "PREHEAT COIL EWT °F"
 * both normalize to the shared prefix "PREHEAT COIL" — real structural
 * grouping of columns that belong to the same coil sub-block, never a
 * title match. */
function coilPrefixFor(header) {
  const h = String(header || "").toUpperCase();
  const m = h.match(COIL_MARKER_RE);
  if (!m) return null;
  // Trailing punctuation left dangling by the strip point ("COOLING COIL
  // DATA FLOW (GPM)" strips at "GPM", leaving a bare "(" behind) is never
  // part of a real distinguishing prefix — trim it along with whitespace.
  return h.slice(0, m.index).replace(/[\s([{,/-]+$/, "").trim();
}

/**
 * Find hydronic coil sub-column blocks inside ANY table — structural
 * (header co-occurrence under a shared prefix), never gated on the
 * table's own title or "kind". A block only counts when GPM AND a water
 * temperature column (EWT or LWT) share the same prefix: GPM alone (a
 * pump schedule, an unrelated flow spec) is not enough — that pairing is
 * what distinguishes real hydronic coil performance data from any other
 * GPM column that happens to sit on the same sheet.
 */
export function extractEmbeddedCoils(table) {
  const headers = new Set();
  for (const h of table?.headers || []) headers.add(String(h));
  for (const row of table?.rows || []) for (const h of Object.keys(row?.cells || {})) headers.add(h);
  const byPrefix = new Map();
  for (const h of headers) {
    const prefix = coilPrefixFor(h);
    if (prefix === null) continue;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(h);
  }
  const coilBlocks = [];
  for (const [prefix, hs] of byPrefix) {
    if (!hasCoilSignal(hs)) continue;
    coilBlocks.push({ prefix, headers: hs });
  }
  // Real, found-live gap (2026-09-02, 019_FL_Eglin_AFB's own AIR HANDLING
  // UNIT HYDRONIC COIL SCHEDULE): bare "EWT"/"LWT" columns compute an
  // empty prefix, but "FLOW GPM" computes prefix "FLOW" — different
  // strings for columns that plainly belong to the same one-coil-per-row
  // schedule, because there's no OTHER coil type on the same table
  // needing a disambiguating prefix in the first place. Prefix-grouping
  // only matters when MULTIPLE coil types share one row (001_NC's
  // "PREHEAT COIL" vs "COOLING COIL DATA"); when it finds nothing at all,
  // fall back to treating the WHOLE table's headers as a single implicit
  // group — still gated on the same real coil signal, just without
  // requiring a literal shared prefix string.
  if (!coilBlocks.length) {
    const all = [...headers];
    if (hasCoilSignal(all)) {
      coilBlocks.push({ prefix: null, headers: all });
    }
  }
  if (!coilBlocks.length) return [];

  const results = [];
  for (const row of table?.rows || []) {
    // Real, found-live bug (2026-09-02, 021_XX_Laboratory_building's own
    // AIR TERMINAL UNIT SCHEDULE, sheet #13): row.key is an upstream,
    // BANDED guess (sheetgraph.ts's rowKeyOf) — not always right. Measured
    // directly: this table's own REMARKS column wraps across multiple
    // physical lines ("0.8 / P-1A,B PENTHOUSE EAST / 0.8") and mentions a
    // cross-referenced PUMP tag ("P-1A,B") that isn't this row's own
    // equipment at all — the row's real identity is its own MARK column
    // ("VVR2 - 8 VVR2 - 10"). row.key picked up "P-1AB" (the pump
    // cross-reference) as this row's tag; the real MARK cell sat right
    // there, unused. An explicit, present TAG/MARK/SYMBOL cell for THIS
    // row is always more directly grounded than a generically-banded key,
    // so it's checked FIRST now — row.key is only a fallback for rows with
    // no such column at all (still correct there: e.g. this same table's
    // sibling AHU schedule has no exact "TAG"/"MARK" header match and
    // relies on row.key, unaffected by this reordering).
    const TAG_CELL_RE = /^(?:TAG|MARK|SYMBOL|EQUIP(?:\.?\s*TAG)?|UNIT\s*(?:MARK|TAG|NO)?)$/i;
    const tag = String(cellText(row, TAG_CELL_RE) || row?.key || "").trim();
    // Real, found-live gap (2026-09-02, Eglin AFB's own AIR HANDLING UNIT
    // HYDRONIC COIL SCHEDULE): the coil's own serving equipment is right
    // there in the row (SYSTEM: "AHU-1"), real and correct, but the column
    // is named SYSTEM, not SERVED/AREA — served came back null on a row
    // that had the answer sitting in plain sight. Anchored to the exact
    // header (not a bare substring test) for the same reason TAG_CELL_RE
    // is anchored: an unrelated header that merely CONTAINS one of these
    // words must never be read as the serving-equipment column.
    const served = cellText(row, /^(?:SERVED|SERVES|AREA|SYSTEM)$/i);
    for (const block of coilBlocks) {
      // Real, found-live bug (2026-09-02, 05_MO_VA_StLouis's own SINGLE
      // DUCT AIR TERMINAL UNIT SCHEDULE): this table's real header row is
      // "EWT HW | EWT ELEC | EWT NONE | EWT | GPM | EWT COIL" — three
      // checkbox-style reheat-TYPE indicator columns ("EWT HW" etc., real
      // values "YES"/blank, nothing to do with temperature) sitting right
      // next to the one real numeric EWT column. The old findCell returned
      // the FIRST header matching the regex by column order, so it grabbed
      // "EWT HW" and reported ewt: "YES" — a temperature field can never
      // legitimately be that. Try every header matching the regex in
      // order, but only accept one whose own cell text actually looks
      // numeric — a checkbox/label column never does, a real temperature
      // or flow value always does. Applies to gpm too, for the same reason
      // (a decoy non-numeric column sharing "GPM" in its name is the same
      // failure mode, just not yet observed live for that field).
      const findNumericCell = (re) => {
        for (const [header, cell] of Object.entries(row?.cells || {})) {
          if (!block.headers.includes(header) || !re.test(header)) continue;
          const text = String(cell?.text ?? cell ?? "").trim();
          if (/\d/.test(text)) return cell;
        }
        return null;
      };
      const gpmCell = findNumericCell(COIL_GPM_RE);
      const gpm = gpmCell ? String(gpmCell.text ?? gpmCell ?? "").trim() : "";
      // Real numeric flow required — a blank/dash placeholder row isn't a
      // real coil instance, just an unused schedule row. Exactly ONE
      // numeric token required, not just "contains a digit": the same real
      // 021_XX table's row 0 shows two real rows merged into one cell
      // object by the upstream table extraction (wrapped REMARKS threw off
      // row segmentation) — GPM came back "0.7 1.2", two real units'
      // values concatenated with a space, unattributable to either. That
      // is real, structural evidence the row itself is corrupted, not one
      // clean coil instance — skip it rather than report a number that
      // can't be traced to a real single unit.
      const gpmNums = gpm.match(/\d+(?:\.\d+)?/g) || [];
      if (gpmNums.length !== 1) continue;
      const ewtCell = findNumericCell(/E\.?W\.?T\.?|ENTERING\s+WATER/i);
      const lwtCell = findNumericCell(/L\.?W\.?T\.?|LEAVING\s+WATER/i);
      results.push({
        tag: tag || null,
        served: served || null,
        coilLabel: block.prefix || String(table?.title?.text || "").trim() || "COIL",
        gpm,
        ewt: ewtCell ? String(ewtCell.text ?? ewtCell ?? "").trim() : null,
        lwt: lwtCell ? String(lwtCell.text ?? lwtCell ?? "").trim() : null,
      });
    }
  }
  return results;
}

const VALVE_HOT_HEADER_RE = /\b(?:HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT|STEAM)\b/;
const VALVE_COLD_HEADER_RE = /\b(?:CHW|CHILLED\s*WATER|COOLING\s*WATER)\b/;

/** Infer schedule service from header blob + sample marks on untitled valve tables. */
export function inferValveServiceFromTable(table) {
  const blob = tableHeaderBlob(table);
  if (VALVE_HOT_HEADER_RE.test(blob)) return "HHW";
  if (VALVE_COLD_HEADER_RE.test(blob)) return "CHW";
  // Real bug, found and fixed 2026-09-02 in self-review: bare /HW/i tested
  // against a real row tag like "CHW-1" matches — "CHW-1" contains "HW" as
  // a substring — so a genuinely chilled-water valve fell through to the
  // HHW bucket, exactly backwards. Word boundaries, and the more specific
  // CHW/CW check tried first as defense in depth.
  // A row's own mark: the VALVE MARK it prints, whichever column leads the
  // row (a UNIT MARK names the unit the valve serves), then its key (AS-79).
  for (const row of table?.rows || []) {
    const tag = String(cellText(row, VALVE_MARK_HEADER_RE) || row.key || cellText(row, /^(?:TAG|MARK)$/i) || "").trim();
    if (/\bCHW\b|\bCW\b/i.test(tag)) return "CHW";
    if (/\bHHW\b|REHEAT|\bHW\b/i.test(tag)) return "HHW";
  }
  return "CHW";
}

// The columns a valve row names its water in: SERVICE "CHW, FC-A-2" (072_CA's
// and 074_CA's EQUIPMENT CONTROL VALVES), SERVED "CROSS-TIE HHWS/R" (013_MO's
// CONTROL VALVES), a SYSTEM or FLUID.
const VALVE_ROW_SERVICE_HEADER_RE = /\b(?:SERVICE|SYSTEM|FLUID|MEDI(?:UM|A)|PIPING|SERVED|SERVES)\b/i;
// A water named outright, with its supply and return spellings; a pump's or a
// unit's mark (CHWP-1, HWP-1) names none.
const VALVE_ROW_HOT_RE = /\b(?:H?HW[SR]?|HOT\s*WATER|HEATING\s*(?:HOT\s*)?WATER|REHEAT|STEAM)\b/i;
const VALVE_ROW_COLD_RE = /\b(?:CHW[SR]?|CHILLED\s*WATER|COOLING\s*WATER)\b/i;

/**
 * The water a valve schedule's row names in its own service, system, fluid
 * or served cell (AS-78): "HHW", "CHW", or null where it names none, or both.
 */
export function valveRowService(row) {
  let hot = false;
  let cold = false;
  for (const [header, cell] of Object.entries(row?.cells || {})) {
    if (!VALVE_ROW_SERVICE_HEADER_RE.test(String(header || ""))) continue;
    const text = String(cell?.text ?? (typeof cell === "string" ? cell : ""));
    if (VALVE_ROW_HOT_RE.test(text)) hot = true;
    if (VALVE_ROW_COLD_RE.test(text)) cold = true;
  }
  return hot === cold ? null : hot ? "HHW" : "CHW";
}

/**
 * The water of a valve table whose title names none (AS-78): its headers',
 * as before; else the one its rows' service cells name, or "MIXED" where
 * they name both (072_CA's EQUIPMENT CONTROL VALVES: SERVICE "CHW, FC-A-2"
 * and "HHW, FC-A-2" row by row), each row then its own; else its marks', or
 * chilled water (inferValveServiceFromTable). The takeoff had read the whole
 * table as the headers' or marks' water, so 072_CA's and 074_CA's heating
 * valves were chilled water's, and 013_MO's boiler valves too.
 */
export function valveTableService(table) {
  const blob = tableHeaderBlob(table);
  if (!VALVE_HOT_HEADER_RE.test(blob) && !VALVE_COLD_HEADER_RE.test(blob)) {
    const named = new Set((table?.rows || []).map((row) => valveRowService(row)).filter(Boolean));
    if (named.size > 1) return "MIXED";
    if (named.size === 1) return [...named][0];
  }
  return inferValveServiceFromTable(table);
}

// Real, found-live gap (2026-09-02, 074_CA_West_Valley_College_STEM_Classroom_HVAC):
// a table titled "EQUIPMENT CONTROL VALVES" — real, schedule-verified control
// valves, mark-corroborated — has NO service qualifier in its own title (no
// CHW/CHILLED WATER, no HHW/HOT WATER/HEATING WATER/REHEAT, no BYPASS), so it
// fails every family's specific titleRe *and* is denied the blank-title
// fallback in uniqueFamily solely because it has SOME title text. A titled
// control-valve table that doesn't name its own service is exactly the same
// shape of problem as an untitled one — service has to come from the table's
// own header/mark content either way. Generalized, set-agnostic (title text
// varies by drafter — "CONTROL VALVES", "CONTROL VALVE SCHEDULE",
// "EQUIPMENT CONTROL VALVES" all qualify), not this one PDF's fix.
export function isGenericControlValveTitle(title) {
  const t = String(title || "");
  if (!/\bCONTROL\s+VALVES?\b/i.test(t)) return false;
  if (/BYPASS|CHW|CHILLED\s*WATER|HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT/i.test(t)) return false;
  return true;
}

export function expandAmpersandEquipMarks(raw) {
  const s = String(raw || "").trim();
  if (!s || !/&/.test(s)) return [s];
  const m = s.match(
    /^([A-Za-z]{1,8})([\s\-]?)(\d+[A-Za-z]?)\s*&\s*(?:([A-Za-z]{1,8})([\s\-]?)?)?(\d+[A-Za-z]?)$/,
  );
  if (!m) {
    // A mark with a qualifier before its number (26_CA's "SF-P2-1 & 2",
    // "EF-P1-1 & EF-P1-2"; AS-75): the right half is the same mark with
    // another number, printing the prefix again, a trailing part of it, or
    // the number alone.
    const q = s.match(/^(.*?[\s\-])(\d{1,4}[A-Za-z]?)\s*&\s*(.*?)(\d{1,4}[A-Za-z]?)$/);
    if (!q || !q[1].includes("-") || !isMarkPrefix(q[1]) || !prefixRepeats(q[1], q[3])) return [s];
    return [`${q[1]}${q[2]}`, `${q[1]}${q[4]}`].map((t) => t.replace(/\s+/g, ""));
  }
  const [, p1, sep1, n1, p2, sep2, n2] = m;
  const leftSep = sep1 || "-";
  const left = `${p1}${leftSep}${n1}`.replace(/\s+/g, "");
  const right = p2
    ? `${p2}${sep2 || "-"}${n2}`.replace(/\s+/g, "")
    : `${p1}${leftSep}${n2}`.replace(/\s+/g, "");
  return [left, right];
}

/** Whether the text before a mark's number is a mark's prefix: a family's
 * letters, with any lettered or numbered qualifiers, ending in a separator or
 * a letter ("EF-", "SF-P1-", "VAV-1-", "1-VAV-", "AHU"). */
function isMarkPrefix(pre) {
  const p = String(pre || "").toUpperCase();
  return /[A-Z]/.test(p) && !/\d$/.test(p) && /^[A-Z0-9]+(?:[\s-][A-Z0-9]+)*[\s-]?$/.test(p);
}

/** Whether a range's or pair's right end repeats the left mark's prefix: in
 * full, as its trailing tokens ("1-" of "VAV-1-"), or not at all. */
function prefixRepeats(pre, tail) {
  const toks = (x) => String(x || "").toUpperCase().split(/[\s-]+/).filter(Boolean);
  const p = toks(pre), t = toks(tail);
  return t.length <= p.length && t.every((x, i) => x === p[p.length - t.length + i]);
}

/**
 * The marks a range printed in one mark cell names: one row scheduling
 * several units of one kind alike ("EF-1 THRU EF-4", "EF-1 THRU 4",
 * "VAV-1-1 THRU 1-12", "EF-1 ~ 4"; 26_CA's "SF-P1-4 THRU 11" and
 * "ST-3-1A THRU 12A", 013_MO's "CV-7-CV-10"; AS-75). The right end is the
 * left mark with a higher number: it prints the mark's prefix again, its
 * trailing tokens, or the number alone, and the letter after the number
 * alike. Between two marks a dash is a range only where the right end
 * prints the whole prefix again, since "AHU-1-2" is one mark. Null for any
 * other text: two kinds of mark, a backwards range, or more than 100 units.
 */
export function expandEquipMarkRange(raw) {
  const s = String(raw || "").toUpperCase().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
  if (!s || s.length > 48) return null;
  const splits = [];
  const word = s.match(/^(.+?)\s+(?:THRU|THROUGH|TO)\s+(.+)$/);
  if (word) splits.push([word[1], word[2], false]);
  const tilde = s.match(/^(.+?)\s*~\s*(.+)$/);
  if (tilde) splits.push([tilde[1], tilde[2], false]);
  for (let i = s.indexOf("-"); i > 0; i = s.indexOf("-", i + 1)) splits.push([s.slice(0, i).trim(), s.slice(i + 1).trim(), true]);
  for (const [left, right, dash] of splits) {
    const l = left.match(/^(.*?)(\d{1,4})([A-Z]?)$/);
    const r = right.match(/^(.*?)(\d{1,4})([A-Z]?)$/);
    if (!l || !r) continue;
    const [, pre, a, sa] = l;
    const [, tail, b, sb] = r;
    if (!isMarkPrefix(pre) || sa !== sb || /\d$/.test(tail) || !prefixRepeats(pre, tail)) continue;
    if (dash && !(tail && prefixRepeats(tail, pre))) continue;
    const lo = Number(a), hi = Number(b);
    if (!(hi > lo && hi - lo < 100)) continue;
    const width = /^0\d/.test(a) ? a.length : 0;
    return Array.from({ length: hi - lo + 1 }, (_, i) => `${pre}${String(lo + i).padStart(width, "0")}${sa}`);
  }
  return null;
}

/** The marks one printed mark cell names (after its "/" or "," split): a
 * range's every mark, an "&" pair's two, else the mark itself. */
export function expandEquipMarks(raw) {
  return expandEquipMarkRange(raw) ?? expandAmpersandEquipMarks(raw);
}

/** A mark's family letters: its first run of two or more letters (SF-P1-4 →
 * SF, B950-AHU-3001 → AHU), else its letters (B-1 → B). */
export function markLetters(mark) {
  const s = String(mark || "").toUpperCase();
  return (s.match(/[A-Z]{2,}/) ?? s.match(/[A-Z]+/))?.[0] ?? "";
}

/** How many units of one mark's kind the row's mark cell names (AS-75): the
 * row's printed QTY counts them, never each. "EF-1 THRU EF-4" names four
 * fans; "FC-1 , HP-1" one fan coil and one heat pump. */
export function sameKindMarks(tagList, one) {
  const k = markLetters(one);
  return Math.max(1, tagList.filter((t) => markLetters(normalizeEquipMark(t)) === k).length);
}

/** B-3: does this table's row-key column actually IDENTIFY its rows, or is it
 * a COUNT column the key-column pick landed on because it happens to sit
 * leftmost? sheetgraph keys a reference table from `anchors[0]` — its
 * left-most column — which is right for the overwhelming majority of real
 * schedules (MARK/TAG/SYMBOL lead) and wrong for a table that carries no
 * identifier column at all.
 *
 * The property that actually distinguishes the two is CARDINALITY, not
 * position: an identifier is near-unique per row and tag-shaped; a count
 * column is a handful of small integers repeated down the page.
 *
 * Real, measured (028_TX_Renovation_of_Building_615 p1, the B-3 page): its
 * NOISE CONTROL DUCT SILENCER SCHEDULE's column 0 is literally "QTY." —
 * 16 real rows keyed 2,1,1,1,1,1,2,1,1,1,1,2,2,2,2,2, i.e. TWO distinct
 * values across sixteen rows (ratio 0.125). Deduping by that key collapsed
 * the whole table to 2 items keyed "1" and "2" — 23 real silencers reported
 * as 2. A real MARK column scores ratio 1.0 and is untouched by this test.
 *
 * Returns the header of the column that SHOULD identify these rows (chosen
 * by cardinality among the table's own populated columns), or null when the
 * key column is a genuine identifier — in which case nothing changes. */
const B3_COUNT_KEY_RE = /^\d{1,3}$/;
function identifierColumnByCardinality(table) {
  const rows = table?.rows || [];
  // Under 3 rows there is no cardinality to measure — refuse rather than guess.
  if (rows.length < 3) return null;
  const keys = rows.map((r) => String(r.key || "").trim());
  // Only a column that is ENTIRELY bare small integers is a count column.
  // Real reference-table keys in this corpus are letter+hyphen+digit tags or
  // short noun phrases — "never bare digits" (see genericRowKeyOf's own
  // outline-marker comment in sheetgraph.ts).
  if (!keys.every((k) => B3_COUNT_KEY_RE.test(k))) return null;
  if (new Set(keys).size / rows.length > 0.5) return null;   // high-cardinality integers could be real
  // High cardinality alone is not enough — the catalogue's own fix shape says
  // "high-cardinality AND TAG-SHAPED", and dropping the second half picks a
  // measurement column: on this very table AIR VELOCITY (FPM) is 16-of-16
  // distinct and scored higher than the real identifier, keying a silencer
  // "60". A real identifier carries LETTERS (a tag, or a noun phrase like
  // "GROUP REHEARSAL 123 - SUPPLY/RETURN"); a measurement column is bare
  // numerics with units. Walk the table's OWN header order and take the
  // first column that qualifies — by drafting convention the identifier
  // leads, and every later near-unique column is data about it.
  for (const header of table.headers || []) {
    if (!header || /^QTY\.?$/i.test(header.trim())) continue;
    const vals = rows.map((r) => String(r.cells?.[header]?.text || "").trim()).filter(Boolean);
    if (vals.length < rows.length * 0.8) continue;           // must be populated on nearly every row
    const lettered = vals.filter((v) => /[A-Za-z]/.test(v)).length;
    if (lettered < vals.length * 0.8) continue;              // a measurement column, not an identifier
    // 0.6, measured on this table's own columns: the count column scores
    // 0.19 (3 distinct of 16) and the real identifier 0.75 (12 of 16 — a
    // location legitimately repeats when two silencers serve one room, so
    // demanding near-uniqueness rejects the very column we want). A MARK
    // column on an ordinary schedule scores 1.0.
    if (new Set(vals).size / rows.length >= 0.6) return header;
  }
  // No near-unique lettered column either — this table genuinely cannot
  // identify its own rows, so refuse the override rather than inventing one.
  return null;
}

// MISCELLANEOUS / bare EQUIPMENT / SPECIALTY EQUIPMENT / HYDRONIC ACCESSORIES:
// a general schedule, where only a family's mark rule may claim a row.
const CATCH_ALL_SCHEDULE_RE = /MISCELLANEOUS(?:\s+EQUIPMENT)?\s+SCHEDULE|^(?:MECHANICAL\s+)?(?:SPECIALTY\s+)?EQUIPMENT\s+SCHEDULE$|^HYDRONIC\s+ACCESSORIES(?:\s+SCHEDULE)?$/i;

/**
 * How a family reads one schedule table, or null when it reads no unit there:
 * the one gate the takeoff (uniqueFamily) and the schedule↔plan reconcile
 * scaffold share (AS-77), so each reads the tables the other does. The
 * reconcile kept a copy of it that drifted: it read no CONTROL VALVES table
 * that names no water (013_MO's, 072_CA's and 074_CA's), never checked an
 * untitled table's header shape or valve service, and in a general schedule
 * read a family's alternate marks (25_WA's electric heaters EH-20 and EH-30
 * as humidifiers, 043_FL's air handler ED 203 as a damper).
 *
 * `pass` 1 is a table titled as the family, read first so a unit cites its
 * own schedule; 2 another family's schedule that lists the family's units, an
 * untitled table or a general one. `filterRe` picks the family's marks from
 * the table's rows (none: every row), `titledAlso` the marks a title also
 * vouches for; `unvouched` says no title vouches for the family here.
 * `coTitled` are the other families a title names too, with their mark
 * rules, where the family reads every row by its title alone (AS-80).
 * @param {object} table a schedule table, as scheduleTableView gives it
 * @param {object} spec an HVAC_FAMILY_SPECS entry, or a reconcile needle
 *   (whose `title` stands in for a titleRe)
 * @param {string|null} [family] the spec's HVAC_FAMILY_SPECS key
 */
export function familyTableGate(table, spec, family = null) {
  const {
    exclude, keyRe = null, blankKeyRe = null, blankHeaderRes = null, blankServiceHint = null,
    titledOnly = false, altTitleRe = null, altKeyRe = null, titledKeyRe = null, host = null,
  } = spec || {};
  const titleRe = spec?.titleRe || spec?.title || null;
  const title = String(table?.title?.text || "");
  // A points-list caption can legitimately name its served equipment family
  // (for example CRAH DDC POINTS LIST). It is still an I/O inventory, never
  // an equipment schedule. Apply this boundary once for every HVAC family
  // instead of relying on dozens of family-specific exclude regexes to stay
  // perfectly synchronized with the BAS title/table grammar.
  if (isBasPointsListTitle(title) || isBasPointsListTable(table)) return null;
  // Soft title match: exact regex first, then compact (no-space) form so
  // AIRHANDLINGUNITSCHEDULE still joins AIR HANDLING UNIT — set-agnostic.
  // Blank titles: still accept when keyRe/blankKeyRe can identify family marks
  // (Transbay RAH-/WFU- tables extract without a recoverable caption).
  // General schedules: same gate — only families with keyRe may claim rows.
  // titledOnly: skip blank/catch-all entirely (FIN_TUBE FTR vs filter panels).
  const titleOk = Boolean(titleRe) && scheduleTitleMatches(title, titleRe, exclude);
  const altOk = Boolean(altTitleRe) && scheduleTitleMatches(title, altTitleRe, exclude);
  const blankTitle = !title.trim();
  // A titled-but-service-unqualified "CONTROL VALVE(S)" table is the same
  // problem as a blank title for CHW_CONTROL_VALVE/HHW_CONTROL_VALVE
  // specifically (blankServiceHint set) — service still has to come from
  // header/mark content either way, never invented from a title that
  // doesn't state it. Scoped to blankServiceHint families only so no other
  // family's blank-title handling (LOUVER, FIN_TUBE, etc.) is touched.
  const genericValveTitle = Boolean(blankServiceHint) && !blankTitle
    && isGenericControlValveTitle(title);
  const catchAll = CATCH_ALL_SCHEDULE_RE.test(title);
  const blankGate = blankKeyRe || keyRe;
  const keyGated = Boolean(keyRe || blankKeyRe || altKeyRe);
  const headerValveShape = (blankTitle || genericValveTitle) && isControlValveHeaderShape(table);
  const hostOk = Boolean(host?.titleRe) && !titleOk && !altOk
    && scheduleTitleMatches(title, host.titleRe, host.exclude);
  // Read by its marks alone: no title vouches for the family here (AS-66).
  const unvouched = !(titleOk || altOk || hostOk) && (blankTitle || catchAll);
  let pass = 2;
  // A valve table whose rows name both waters is read row by row (AS-78).
  let rowService = null;
  if (titleOk || altOk) {
    pass = 1;
  } else if (!hostOk) {
    // A family's own schedules, then another's that lists its units, then
    // the rest, so a unit they define cites them.
    if (titledOnly) return null;
    const blankHeaderOk = !blankHeaderRes || headerShapeMatches(table, blankHeaderRes) || headerValveShape;
    if ((blankTitle || genericValveTitle) && blankGate) {
      if (!blankHeaderOk) return null;
      if (blankServiceHint && headerValveShape) {
        const service = valveTableService(table);
        if (service === "MIXED") rowService = blankServiceHint;
        else if (blankServiceHint === "CHW" && service === "HHW") return null;
        else if (blankServiceHint === "HHW" && service !== "HHW") return null;
      }
    } else if (!(catchAll && keyGated)) {
      return null;
    }
    // Notes, a drawing index or a furnishings list hold no unit (AS-66); an
    // untitled grid of valve marks keeps the word of its header shape.
    if (unvouched && !headerValveShape && !unvouchedTableHoldsUnits(table)) return null;
  }
  // keyRe filters titled rows (AHU/FCU); blankKeyRe only gates blank titles
  // (Carson CONDENSING UNIT uses B1/B2 marks — must not apply ACC/CU filter).
  // altTitleRe hits use altKeyRe so split outdoor CU/DCU can join without
  // forcing a CU filter onto primary CONDENSING UNIT schedules.
  // Catch-all tables: OR blankKeyRe|keyRe so HEAT_PUMP blankKeyRe (/^HP/)
  // does not shadow WSHP/GSHP matches that only keyRe accepts.
  // Prefer altKeyRe whenever altTitleRe matched (ELECTRIC HUMIDIFIER EH-*,
  // SPLIT outdoor CU-*). Primary titled CONDENSING UNIT stays unfiltered
  // because altOk is false there.
  const titledFilter = (altOk && altKeyRe) ? altKeyRe : keyRe;
  const filterRe = hostOk ? host.keyRe
    : (blankTitle || genericValveTitle) ? blankGate : catchAll ? null : titledFilter;
  // In a table titled as the family, a mark its untitled rule reads
  // (blankKeyRe: a CONTROL DAMPER SCHEDULE's CD-1) or its title vouches for
  // (titledKeyRe) is read too (AS-63): a title never reads less than none.
  const titledAlso = titleOk && keyRe ? [blankKeyRe, titledKeyRe].filter(Boolean) : [];
  // A title that names another family too, whose own mark rule reads its
  // rows ("OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE"; AS-80).
  const coTitled = (titleOk || altOk) && !filterRe && family && HVAC_FAMILY_SPECS[family]
    ? titleFamilies(title).filter((named) => named.family !== family)
    : [];
  return {
    pass, title, titleOk, altOk, hostOk, blankTitle, genericValveTitle,
    catchAll, unvouched, filterRe, titledAlso, rowService, coTitled,
  };
}

// The families each title names, with the mark rule each reads its rows by.
const TITLE_FAMILIES = new Map();

/**
 * The families a schedule title names, each with the mark rule it reads the
 * table's rows by (its other title's where that is what matched) and the
 * marks it reads under its own title only: a title can name two, as 089_FL's
 * HEAT PUMP OR CONDENSING UNIT SCHEDULE does (AS-80). A family with no mark
 * rule of its own for the title is left out.
 * @param {string} title
 * @returns {Array<{ family: string, markRe: RegExp, titledOnlyRe: RegExp|null }>}
 */
function titleFamilies(title) {
  let named = TITLE_FAMILIES.get(title);
  if (named) return named;
  named = [];
  for (const [family, spec] of Object.entries(HVAC_FAMILY_SPECS)) {
    const titleRe = spec.titleRe || spec.title || null;
    const titleOk = Boolean(titleRe) && scheduleTitleMatches(title, titleRe, spec.exclude);
    const altOk = Boolean(spec.altTitleRe) && scheduleTitleMatches(title, spec.altTitleRe, spec.exclude);
    if (!titleOk && !altOk) continue;
    const markRe = (altOk && spec.altKeyRe) ? spec.altKeyRe : spec.keyRe;
    if (markRe) named.push({ family, markRe, titledOnlyRe: spec.titledOnlyRe || null });
  }
  TITLE_FAMILIES.set(title, named);
  return named;
}

/**
 * Whether a family's gate reads a row of its table (AS-78, for the takeoff
 * and the reconcile alike): in a valve table whose rows name both waters, a
 * row is the family's its own cell names, and one that names none the
 * table's, by its headers and marks.
 */
export function familyRowRead(gate, row, table) {
  if (!gate.rowService) return true;
  return (valveRowService(row) || inferValveServiceFromTable(table)) === gate.rowService;
}

/**
 * How a family's table gate reads one of a row's marks (AS-77), for the
 * takeoff and the reconcile alike: 0 not as the family's; 2 as printed, by
 * the rule that gates the table; 1 only in one of the mark's forms (AS-62),
 * through a title's vouching or in another family's schedule (AS-63), a
 * widened reading that never takes a unit a printed one holds. In a general
 * schedule only the family's own mark rules read (never its alternate
 * title's), and read by its mark alone a word, or a mark only a title
 * vouches for, is no unit (AS-66).
 * @param {object} gate familyTableGate's reading of the row's table
 * @param {object} spec the family's spec or needle
 * @param {string} one the mark, normalized
 * @param {string} canon the mark upper-cased without spaces
 * @param {{ countKeyed?: boolean }} [opts] countKeyed: the row is named by
 *   a count-keyed table's identifier column (B-3), not a mark
 */
export function familyMarkRead(gate, spec, one, canon, { countKeyed = false } = {}) {
  const { keyRe = null, blankKeyRe = null, titledOnlyRe = null } = spec || {};
  const reads = (re) => (!re ? 0
    : re.test(canon) || re.test(one) ? 2
      : markMatchesKeyRe(re, one, canon) ? 1 : 0);
  let read = 2;
  if (gate.catchAll) {
    read = Math.max(reads(blankKeyRe), reads(keyRe));
  } else if (gate.filterRe) {
    read = reads(gate.filterRe);
    if (!read && gate.titledAlso.some((re) => markMatchesKeyRe(re, one, canon))) read = 1;
  } else if (gate.coTitled?.some((named) => markMatchesKeyRe(named.markRe, one, canon)
      && !markMatchesKeyRe(named.titledOnlyRe, one, canon))
    && ![keyRe, blankKeyRe, spec?.altKeyRe, spec?.titledKeyRe].some((re) => markMatchesKeyRe(re, one, canon))) {
    // Another family the title names reads the mark by its own rule (as
    // printed or in one of its forms, 1-FCU-1), not one only its own title
    // reads (FCU's F-1), and none of this family's own rules reads it: it is
    // that family's unit (AS-80).
    return 0;
  }
  if (!read) return 0;
  if (gate.unvouched && ((!countKeyed && !unvouchedMarkNamesUnit(one))
    || markMatchesKeyRe(titledOnlyRe, one, canon))) return 0;
  return gate.hostOk ? 1 : read;
}

const QUOTES_RE = /^["'\s]+|["'\s]+$/g;

/**
 * Whether a row printing both a UNIT MARK and a VALVE MARK is, to a family,
 * its UNIT MARK's unit beside that unit's valve (AS-79): in a table titled as
 * a family of units, or another family's schedule that lists them. To a
 * valve's, a damper's or an air valve's family the row is the valve its
 * VALVE MARK names, and anywhere no title vouches for a family of units it is
 * a valve's too, its UNIT MARK the unit the valve serves.
 * @param {object} gate the family's familyTableGate reading of the table
 * @param {string} family the family's HVAC_FAMILY_SPECS key
 */
export function familyReadsUnitMark(gate, family) {
  return Boolean(gate?.titleOk || gate?.altOk || gate?.hostOk) && !CONTROL_VALVE_FAMILIES.includes(family);
}

/**
 * The text a row names its unit by, for the takeoff and the reconcile alike
 * (AS-79): its key; a count-keyed table's identifier column (B-3); its mark
 * column (MARK, SYMBOL, EQUIP. TAG, DESIGNATION, UNIT NO, UNIT TAG, ITEM NO,
 * or a UNIT or VALVE MARK), whichever the row prints first; a TAG that pairs
 * marks ("RF-1 & 2" beats a glued key "RF-12"; a bare TAG is often a grille's
 * type code, 1S or 2R); and the family's own identity column (a control
 * valve's VALVE MARK). A row printing both a UNIT MARK and a VALVE MARK is
 * read by the family, never by their column order (familyReadsUnitMark).
 * @param {object} row a schedule table's row
 * @param {{ countKeyedIdentCol?: string|null, identityHeaderRe?: RegExp|null, unitMark?: boolean }} [opts]
 */
export function rowIdentityText(row, { countKeyedIdentCol = null, identityHeaderRe = null, unitMark = false } = {}) {
  let tag = String(row.key || "").trim().replace(QUOTES_RE, "");
  if (countKeyedIdentCol) {
    const ident = String(row.cells?.[countKeyedIdentCol]?.text || "").trim();
    if (ident) tag = ident;
  }
  // Prefer explicit MARK / EQUIP.TAG / DESIGNATION. Do NOT prefer bare TAG —
  // Colville FAN SCHEDULE shares a TAG column with grille type codes (1S/2R)
  // while row.key correctly holds EF-1.
  const headers = Object.keys(row.cells || {});
  let markHeader = headers.find((header) => MARK_HEADER_RE.test(header));
  if (markHeader && (UNIT_MARK_HEADER_RE.test(markHeader) || VALVE_MARK_HEADER_RE.test(markHeader))) {
    const own = unitMark ? UNIT_MARK_HEADER_RE : VALVE_MARK_HEADER_RE;
    markHeader = headers.find((header) => own.test(header)) || markHeader;
  }
  const markCell = markHeader ? String(row.cells[markHeader]?.text || "").trim() : "";
  if (markCell) tag = markCell.replace(QUOTES_RE, "").trim();
  // Ampersand-paired TAG ("RF-1 & 2") beats a glued row.key ("RF-12") — Northport
  // blank return-fan schedule. Still never prefer bare grille-type TAG codes.
  const tagCell = cellText(row, /^TAG$/i);
  if (tagCell && /&/.test(tagCell) && /^[A-Za-z]{1,8}[\s\-]?\d/i.test(tagCell.trim())) {
    tag = String(tagCell).replace(QUOTES_RE, "").trim();
  }
  if (identityHeaderRe) {
    const ident = cellText(row, identityHeaderRe);
    if (ident) tag = String(ident).replace(QUOTES_RE, "").trim();
  }
  return tag;
}

/**
 * The text a row's marks are split from (AS-77, the takeoff's rule the
 * reconcile shares): a mark cell printing a comma list, in a table no key
 * filter reads, gives way to a row key that prints none (Baker's SYMBOL
 * "ERU-1, HP-4" beside ERU-1; 044_NY's MARK "FOP-1, 2" beside FOP-1/FOP-2).
 */
export function rowMarkText(text, rowKey, willFilter) {
  return !willFilter && /,/.test(text) && rowKey && !/,/.test(rowKey) ? rowKey : text;
}

/**
 * A row's marks, before each is normalized (AS-77, shared by the takeoff and
 * the reconcile): split on "/" always and on "," only where a key filter
 * picks the family's marks from a list (DFC-1 , DCU-1), each range or pair
 * expanded (AS-75).
 */
export function splitRowMarks(text, willFilter) {
  return String(text)
    .split(willFilter ? /[/,]/ : "/")
    .map((t) => t.trim().replace(/^["'\s]+|["'\s]+$/g, ""))
    .filter(Boolean)
    .flatMap((t) => expandEquipMarks(t));
}

function uniqueFamily(graph, spec, family) {
  const { identityHeaderRe } = spec;
  const keys = new Set();
  const items = [];
  // A reading of the mark as printed, by the rule that gates its table, ranks
  // above a widened one: through one of the mark's forms (AS-62), a title that
  // vouches for it or another family's schedule (AS-63). The scan finds every
  // unit a printed reading holds, so a widened reading only adds units, and
  // never takes a unit's row from its printed listing, whatever the table order.
  const printedCanons = new Set();
  // Each table's reading by the family, the gate the reconcile scaffold shares
  // (AS-77). A transposed schedule is read one row per unit (AS-65).
  const gated = [];
  for (const printed of graph.tables || []) {
    const table = scheduleTableView(printed);
    const gate = familyTableGate(table, spec, family);
    if (gate) gated.push({ table, gate });
  }
  for (const mode of ["scan", "emit"]) {
  // Two passes: titled family schedules first, then blank/catch-all fallbacks.
  // Same mark on a blank seismic summary and a titled ERV schedule (Colville)
  // must cite the titled device definition — blank-first walk poisoned
  // prefer-schedule sweeps.
  for (const pass of [1, 2]) {
  for (const { table, gate } of gated) {
    if (gate.pass !== pass) continue;
    const { title, filterRe, catchAll: catchAllFilter } = gate;
    // B-3: when the key column is a COUNT column, identify rows by the
    // highest-cardinality column instead, and never dedupe on the count —
    // two rows both reading "1" are two physical silencers, not one tag
    // seen twice. Computed once per table; null for every ordinary
    // MARK/TAG-led schedule, which is therefore completely unaffected.
    const countKeyedIdentCol = identifierColumnByCardinality(table);
    let rowIdx = -1;
    for (const row of table.rows || []) {
      rowIdx++;
      // In a valve table whose rows name both waters, the row's own (AS-78).
      if (!familyRowRead(gate, row, table)) continue;
      const rowKey = String(row.key || "").trim().replace(/^["'\s]+|["'\s]+$/g, "");
      // The text the row names its unit by, as the reconcile reads it (AS-79).
      const tag = rowIdentityText(row, {
        countKeyedIdentCol, identityHeaderRe, unitMark: familyReadsUnitMark(gate, family),
      });
      // Always expand slash compounds (CWP-1/CWP-2). Comma-split only when a
      // key filter can pick family marks (DFC-1 , DCU-1). Untagged titled
      // families keep row.key when SYMBOL is a comma list (Baker ERU-1, HP-4).
      const willFilter = Boolean(catchAllFilter || filterRe);
      const working = rowMarkText(tag, rowKey, willFilter);
      // A count-keyed table's identifier is a descriptive NOUN PHRASE
      // ("GROUP REHEARSAL 123 - SUPPLY/RETURN"), never a compound tag list —
      // splitting it on "/" the way CWP-1/CWP-2 is split shreds one real
      // silencer into two bogus lines ("GROUP REHEARSAL 123 - SUPPLY" and
      // "RETURN"), measured: 16 real rows became 31 items.
      const tagList = countKeyedIdentCol
        ? [String(working).trim()].filter(Boolean)
        : splitRowMarks(working, willFilter);
      for (const rawOne of tagList.length ? tagList : [working || tag]) {
        const one = normalizeEquipMark(rawOne);
        const canon = one.toUpperCase().replace(/\s+/g, "");
        if (!canon) continue;
        // Footnote / notes rows that leaked into the key column.
        if (/^NOTES?:?\d*$/i.test(canon) || /^NOTES?:?$/i.test(one.trim())) continue;
        // Column-header labels extracted as data rows (Colville HX "MODEL"/"TAG").
        // Do NOT require a digit here — NAVFAC valve marks like CV-CHW-BP-A are
        // letter-suffixed building tags with no digits.
        if (isScheduleHeaderJunkMark(canon)) continue;
        // The family's mark rules, and read by its mark alone a mark is a word
        // or another thing's (AS-66), as the reconcile reads it (AS-77).
        const read = familyMarkRead(gate, spec, one, canon, { countKeyed: Boolean(countKeyedIdentCol) });
        if (!read) continue;
        const widened = read === 1;
        if (mode === "scan") {
          if (!widened && !countKeyedIdentCol) printedCanons.add(canon);
          continue;
        }
        if (widened && printedCanons.has(canon)) continue;
        // B-3: a count-keyed table emits one line per PHYSICAL ROW. Its rows
        // are not tag-identified, so cross-row dedupe would collapse real,
        // distinct pieces of equipment (16 real silencers -> 2). Ordinary
        // tag-keyed tables keep the dedupe exactly as before.
        if (countKeyedIdentCol) {
          // Still counted — a category's `count` is keys.size — but keyed per
          // PHYSICAL ROW so two rows reading the same location stay two real
          // silencers instead of collapsing into one.
          keys.add(`${canon}#${table.sheet}#${rowIdx}`);
        } else {
          if (keys.has(canon)) continue;
          keys.add(canon);
        }
        const bbox = identityHeaderRe
          ? (cellBbox(row, identityHeaderRe) || cellBbox(row, /^MARK$/i) || row.identity?.bbox)
          : (cellBbox(row, /^MARK$/i) || row.identity?.bbox || cellBbox(row, /./));
        const { cells, description } = scheduleAttrs(row);
        const unitMark = cellText(row, /^UNIT\s*MARK$/i) || null;
        // Prefer UNIT MARK for building (valve marks often end in -CHW/-HHW).
        const bldg = buildingLetter(unitMark) || buildingLetter(one);
        const rowBbox = rowCellsBbox(row);
        // table_bbox_px is the SCHEDULE's own region — a ~200x20px title
        // caption is not "the table" for a citation highlight to paint.
        // title_bbox_px carries the caption separately for anyone who
        // specifically wants it (unchanged meaning, just its own field now).
        const tableBbox = Array.isArray(table.region) && table.region.length === 4 ? table.region : null;
        const titleBbox = Array.isArray(table.title?.bbox) && table.title.bbox.length === 4
          ? table.title.bbox
          : null;
        // `quantity` remains the legacy physical-row cardinality so existing
        // scorers and callers keep their contract. Its explicit basis prevents
        // that compatibility field from masquerading as a printed or installed
        // quantity. `scheduled_qty` is the printed QTY cell when present, or
        // one-per-unique-row when the schedule genuinely has no QTY column.
        // A printed-but-unparseable QTY is null and refused, never guessed.
        // installed_qty/status stay null until a reconcile_schedule_plan pass
        // merges plan-drawn counts onto this same tag — status here is a
        // compile-time-only disclosure (not a ReconcileStatus value) and is
        // superseded once that merge happens.
        const qtyStatus = scheduledQtyStatusFromRow(row, { marks: sameKindMarks(tagList, one) });
        items.push({
          tag: one,
          quantity: 1,
          quantity_basis: "schedule_row_cardinality",
          scheduled_qty: qtyStatus.refused ? null : qtyStatus.qty,
          scheduled_qty_basis: qtyStatus.basis,
          scheduled_qty_source_header: qtyStatus.source_header,
          scheduled_qty_source_text: qtyStatus.source_text,
          installed_qty: null,
          status: qtyStatus.refused ? "REFUSED_UNPARSEABLE_QTY" : null,
          qty_kind: qtyStatus.refused ? "unresolved" : "scheduled",
          unit: "EA",
          sheet_id: table.sheet,
          table_title: title.replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim(),
          bbox_px: bbox || null,
          // Whole schedule row for cite paints — not just the MARK cell.
          row_bbox_px: rowBbox || bbox || null,
          table_bbox_px: tableBbox,
          title_bbox_px: titleBbox,
          description: description || null,
          building: bldg,
          cells,
          ...(qtyStatus.refused ? { reason: qtyStatus.reason } : {}),
        });
      }
    }
  }
  } // end titled-first / blank-fallback passes
  } // end scan / emit
  const building = { other: 0 };
  for (const item of items) {
    const code = item.building || buildingLetter(item.tag);
    if (code) building[code] = (building[code] || 0) + 1;
    else building.other += 1;
  }
  return {
    count: keys.size,
    building,
    items: items.sort((a, b) => {
      const ba = a.building || "";
      const bb = b.building || "";
      if (ba !== bb) return ba.localeCompare(bb);
      return a.tag.localeCompare(b.tag, undefined, { numeric: true });
    }),
  };
}

/**
 * Family extractors — keep in lockstep with build-takeoff-truth-inventory.mjs.
 * Title patterns are set-agnostic US MEP phrasing (soft-matched via
 * scheduleTitleMatches). keyRe filters junk remarks rows when present; omit
 * when a schedule family's marks are not a single prefix convention.
 *
 * Bulk corpus gaps (RTU / ERV / furnace / condensing / outdoor-air / heat-pump)
 * are first-class families here — same path the Agent UI calls for a user
 * upload. Do not add per-PDF set IDs.
 */
export const HVAC_FAMILY_SPECS = {
  // AC-* marks appear on VA / hospital AIR HANDLING UNIT schedules (not only AHU-*).
  // "AIR HANDLER HEAT PUMP" (Baker) is the indoor AHU half of a split HP pair.
  AHU: {
    titleRe: /AIR HANDLING UNIT|AIR\s+HANDLER(?:\s+HEAT\s+PUMP)?(?:\s+SCHEDULE)?/i,
    exclude: /DEDICATED|HYDRONIC\s+COIL|FAN\s+SCHEDULE|FAN\s*COIL/i,
    keyRe: /^(?:AHU|AC)[\s\-]/i,
  },
  DOAH_UNIT: { titleRe: /DEDICATED OUTDOOR AIR UNIT/i, exclude: /HANDLING/i, keyRe: /^DOAH/i },
  DOAH_HANDLING: { titleRe: /DEDICATED OUTDOOR AIR HANDLING/i, keyRe: /^DOAH/i },
  DOAS: {
    titleRe: /DOAS\s+UNIT|\bDOAS\b|DEDICATED\s+OUTDOORS?\s+AIR\s+SYSTEM|DEDICATED\s+OUTSIDE\s+AIR\s+SYSTEM/i,
    exclude: /POINTS\s*LIST|DDC|DEDICATED\s+OUTDOOR\s+AIR\s+HANDLING|DEDICATED\s+OUTDOOR\s+AIR\s+UNIT/i,
    keyRe: /^DOAS/i,
    // A DOAS listed in an air handling unit schedule is a DOAS (096_IN's
    // AIR HANDLING UNIT SYSTEM INDEX SCHEDULE: DOAS-1 to DOAS-3, AHU-4).
    host: {
      titleRe: /AIR HANDLING UNIT|AIR\s+HANDLER/i,
      exclude: /POINTS\s*LIST|DDC|DEDICATED\s+OUTDOOR\s+AIR/i,
      keyRe: /^DOAS[\s\-]?\d/i,
    },
  },
  // Common US school / light-commercial phrasing (not always "DOAH").
  OUTDOOR_AIR_UNIT: {
    titleRe: /OUTDOOR\s+AIR\s+UNIT\s+SCHEDULE|MAKE[\s\-]*UP\s+AIR\s+UNIT|MAKEUP\s+AIR\s+UNIT|\bMAU\s+SCHEDULE/i,
    exclude: /DEDICATED\s+OUTDOOR\s+AIR|POINTS\s*LIST|DDC/i,
    // Blank-title only — titled schedules may use set-local marks (Carson B1/B2).
    blankKeyRe: /^(?:OAU|MAU|OA)[\s\-]/i,
  },
  // FCUC / FCUH / FC-01 style marks (cooling/heating suffix or hyphenated FC).
  // DUCTLESS indoor DFC + gas-split indoor F-#; outdoor CU/DCU → CONDENSING_UNIT.
  // Split-system indoor AC-* (bldg5406 AC-1/ACCU-1) — not AHU (AHU titles differ).
  // "SPLIT SYSTEM HEAT PUMPS" (Klamath) lists indoor FC-* beside outdoor HP-*.
  FCU: {
    titleRe: /FAN\s*COIL|SPLIT[\s\-]*SYSTEM\s+AIR\s+CONDITIONING|SPLIT[\s\-]*SYSTEM\s+HEAT\s+PUMP|DUCTLESS\s+SPLIT/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS/i,
    keyRe: /^(?:FCU|FC[\s\-]?\d|EV|DFC|F[\s\-]?\d|AC[\s\-])/i,
    // Under a split or ductless title: DAC-* ductless units, SS-* split
    // systems (03_FL, 22_GA, 040_IL; AS-63). Under a fan coil title, FCC-*
    // fan coils (028_TX's CHILLED WATER FAN COIL UNIT SCHEDULE lists FCC1-1
    // beside FCU1-3; AS-64).
    titledKeyRe: /^(?:DAC|SS|FCC)[\s\-]?\d/i,
    // A bare F-* is a fan coil under the family's title only: 016_NY's fans
    // F-1 and F-2, in an untitled panel schedule, and 041_IL's F0535, a
    // utility cart in an architectural list, were fan coils too (AS-66).
    titledOnlyRe: /^F[\s\-]?\d/i,
    // A split system air handler schedule's indoor FCU-* (22_GA's
    // "FCU-1/HP-1" rows; its HP-* are HEAT_PUMP's).
    host: {
      titleRe: /SPLIT[\s\-]*SYSTEM\s+AIR\s+HANDLER/i,
      exclude: /POINTS\s*LIST|DDC/i,
      keyRe: /^FCU[\s\-]?\d/i,
    },
  },
  VAV: {
    // A VAV box or terminal schedule (009_FL's VAV TERMINAL SCHEDULE, 033_MN's
    // VAV BOX WITH HOT WATER REHEAT SCHEDULE) and a variable volume terminal
    // (061_IA's VARIABLE VOLUME SUPPLY TERMINAL UNIT SCHEDULE; AS-68), and a
    // title that begins with a fan-powered terminal, box or unit (26_CA's FAN
    // POWERED TERMINAL UNIT SCHEDULE; AS-69), never a box's connections,
    // wiring, points or details.
    titleRe: /VARIABLE AIR VOLUME|VOLUME CONTROL BOX|VAV\s+TERMINAL\s+BOX|AIR TERMINAL BOX|AIR\s+TERMINAL\s+UNIT|SINGLE\s+DUCT\s+AIR\s+TERMINAL|SINGLE\s+DUCT\s+CAV|CAV\s+EXHAUST\s+TERMINAL|CAV\s+TERMINAL|LAB\s+CAV|\bCAV\s+SCHEDULE|\bVAV\s+(?:BOX(?:ES)?|TERMINALS?)\b(?!.*\b(?:CONNECTIONS?|ELECTRICAL|WIRING|CONTROLS?|POINTS?|SEQUENCES?|DIAGRAMS?|DETAILS?)\b)|\bVARIABLE\s+VOLUME\s+(?:(?:SUPPLY|EXHAUST|RETURN)\s+)?TERMINAL|^\s*(?:(?:SERIES|PARALLEL|VAV|HOT\s+WATER|ELECTRIC)\s+){0,2}FAN[\s\-]*POWERED\s+(?:VAV\s+|AIR\s+)?(?:TERMINAL(?:\s+UNITS?)?|BOX(?:ES)?|UNITS?)\b(?!.*\b(?:CONNECTIONS?|ELECTRICAL|WIRING|CONTROLS?|POINTS?|SEQUENCES?|DIAGRAMS?|DETAILS?)\b)/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS/i,
    // ECAV-* = lab exhaust CAV on LAB CAV schedules (SDSU); CAV/VAV/ATU/ATB/VTU indoor;
    // TU-* terminal units numbered under an AIR TERMINAL UNIT title (AS-62).
    keyRe: /^(?:VAV|ATB|VTU|ECAV|CAV|ATU|TU(?=[\s\-]?\d))/i,
    // Under the family's own title, a fan-powered box (26_CA's FPB-3-11 under
    // FAN POWERED TERMINAL UNIT SCHEDULE; AS-69).
    titledKeyRe: /^(?:FPB|FPTU|FPVAV|FPV|FPU|FP|[SP]FPB|[SP]FP|[SP]FTU)(?=[\s\-]?\d)/i,
  },
  RTU: {
    // PACKAGED EQUIPMENT SCHEDULE (RTU) — common finish/replacement sheets.
    // No keyRe: Carson/Suwannee RTU marks are set-local (B*/C*/bare); titled
    // rows on RTU schedules stay fully claimed. Title gate is the filter.
    titleRe: /ROOF[\s\-]*TOP\s+UNIT|PACKAGED\s+ROOFTOP|PACKAGED\s+EQUIPMENT\s+SCHEDULE\s*\(?\s*RTU|RTU\s+SCHEDULE|GAS[\s\-]*FIRED\s+DX\s+COOLING\s+ROOF\s+TOP/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS|CONNECTION\s+SCHEDULE/i,
  },
  ERV: {
    titleRe: /ENERGY\s+RECOVERY\s+VENTILATOR|ENERGY\s+RECOVERY\s+UNIT|\bERV\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS/i,
    // Titled: ERU-*/ERV-* plus bare letter+digits (Carson C1/C2).
    // Blank: only ERU/ERV — letter+digit blank gates steal finish A1/B1 (Johnson).
    keyRe: /^(?:ERU|ERV)[\s\-]|^[A-Z]\d{1,3}$/i,
    blankKeyRe: /^(?:ERU|ERV)[\s\-]/i,
    // A letter and a number are an ERV's mark under its title only: a general
    // schedule's T1 is a toilet accessory (23_GA; AS-66).
    titledOnlyRe: /^[A-Z]\d{1,3}$/i,
  },
  FURNACE: {
    titleRe: /FURNACE\s+SCHEDULE|GAS[\s\-]*FIRED\s+.*FURNACE/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS|WATER\s+HEATER/i,
  },
  CONDENSING_UNIT: {
    titleRe: /CONDENSING\s+UNIT(?:\s+SCHEDULE)?|AIR[\s\-]*COOLED\s+CONDENSING\s+UNIT/i,
    exclude: /AIR[\s\-]*COOLED\s+CHILLER|POINTS\s*LIST|DDC/i,
    // Blank-title only on primary titles — Carson titled B1/B2 must not be
    // filtered by a CU/ACC keyRe.
    blankKeyRe: /^(?:CU|ACC)[\s\-]/i,
    // Split indoor/outdoor SYMBOL columns ("F-1 , CU-1" / "DFC-1 , DCU-1"):
    // claim outdoor marks only; primary CONDENSING UNIT titles stay unfiltered.
    altTitleRe: /SPLIT\s+SYSTEM\s+AIR\s+CONDITIONING|DUCTLESS\s+SPLIT/i,
    // SSCU-* split system condensing units (040_IL's "SS-1/SSCU-1"; AS-63).
    altKeyRe: /^(?:CU|DCU|ACCU|SSCU)[\s\-]/i,
  },
  HEAT_PUMP: {
    titleRe: /HEAT\s+PUMP/i,
    // ENERGY RECOVERY schedules titled "(WITH HEAT PUMP)" carry outdoor HP-*
    // halves (Baker ERU-1, HP-4). keyRe keeps only HP/CC/… so ERU-* stays on ERV.
    exclude: /POINTS\s*LIST|DDC\s+POINTS|WATER\s+HEATER|CHILLER/i,
    // HP (not CHP); SCU/SAC multi-split; VRF indoor cassette CC-* / AH-* terminals.
    keyRe: /(?<![C])HP|^(?:SCU|SAC|CC|AH)[\s\-]/i,
    // Blank-title: only strong HP-* marks (Colville blank WSHP-1 is a chiller nameplate).
    blankKeyRe: /^HP[\s\-]/i,
    // A split system air handler schedule's outdoor HP-* (22_GA; AS-63).
    host: {
      titleRe: /SPLIT[\s\-]*SYSTEM\s+AIR\s+HANDLER/i,
      exclude: /POINTS\s*LIST|DDC/i,
      keyRe: /^HP[\s\-]?\d/i,
    },
  },
  // Return / exhaust air handlers often titled RAH / without "AIR HANDLING UNIT".
  // VRF split indoor/outdoor unit schedules (IDU-*/ODU-* / IU-*/OU-*).
  // A SINGLE combined "VRF SYSTEM SCHEDULE" (089 Airport Terminal/Hangar) lists
  // real indoor air-handler rows (AC-1..AC-12) with nested outdoor heat-pump
  // sub-columns in the SAME row, rather than split INDOOR/OUTDOOR titled
  // tables — titleRe alone can't reach it (no "INDOOR"/"OUTDOOR" in the
  // title), so it needs its own altTitleRe/altKeyRe path, same mechanism
  // already proven for CONDENSING_UNIT's split CU/DCU marks (GOAL.md rule 39).
  VRF_INDOOR: {
    titleRe: /VRF\s+INDOOR(?:\s+UNIT)?(?:\s+SCHEDULE)?|VARIABLE\s+REFRIGERANT\s+FLOW\s+INDOOR/i,
    exclude: /POINTS\s*LIST|DDC|OUTDOOR/i,
    keyRe: /^(?:IDU|IU|VI)[\s\-]?/i,
    altTitleRe: /VRF\s+SYSTEM\s+SCHEDULE/i,
    altKeyRe: /^AC[\s\-]/i,
    titledOnly: true,
  },
  VRF_OUTDOOR: {
    titleRe: /VRF\s+OUTDOOR(?:\s+UNIT)?(?:\s+SCHEDULE)?|VARIABLE\s+REFRIGERANT\s+FLOW\s+OUTDOOR/i,
    exclude: /POINTS\s*LIST|DDC|INDOOR/i,
    keyRe: /^(?:ODU|OU|VO)[\s\-]?/i,
    titledOnly: true,
  },

  RAH: {
    titleRe: /RETURN\s+AIR\s+HANDLER|RETURN\s+AIR\s+HANDLING|\bRAH\b.*SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^RAH[\s\-]/i,
  },
  // Wash / water filter units (Transbay blank-title WFU-* rows).
  WFU: {
    titleRe: /WATER\s+FILTER|WASHER\s+FILTER|\bWFU\b.*SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^WFU[\s\-]/i,
  },
  AIR_COOLED_CHILLER: {
    titleRe: /AIR[\s\-]*COOLED[\s\-]*CHILLER|CHILLER SCHEDULE/i,
    exclude: /HEAT RECOVERY/i,
    // CH-/PAC- only — ACC-* is air-cooled condenser (CONDENSING_UNIT blankKeyRe).
    keyRe: /^(?:CH|PAC)[\s\-]/i,
    // Under an AIR COOLED CHILLER title, ACC-* and ACCH-* are the chiller
    // (03_FL, AS-63; 087_US, AS-64).
    titledKeyRe: /^ACCH?[\s\-]?\d/i,
  },
  HEAT_RECOVERY_CHILLER: {
    titleRe: /HEAT RECOVERY CHILLER/i,
    // Require separator after CH so blank-title CHECK:/CHP-* junk is not stolen.
    keyRe: /^(?:CH[\s\-]|HRC)/i,
    // CH-* is this family's under its own title only; read by its mark alone
    // it is any chiller (047_NC's electrical EQUIPMENT SCHEDULE lists its
    // air-cooled chillers CH-1 and CH-2; AS-66).
    titledOnlyRe: /^CH[\s\-]/i,
    // HRC-* listed in a chiller schedule (096_IN's AIR COOLED CHILLER
    // SCHEDULE: HRC-1, HRC-2 beside CH-1, CH-2; AS-63).
    host: {
      titleRe: /AIR[\s\-]*COOLED[\s\-]*CHILLER|CHILLER SCHEDULE/i,
      exclude: /POINTS\s*LIST|DDC/i,
      keyRe: /^HRC[\s\-]?\d/i,
    },
  },
  // Prefer boiler equipment captions over bare /BOILER/ so "BOILER PLANT ·
  // ISOLATION VALVE SCHEDULE" and pump boards do not claim B-* / "B GV-*"
  // plant marks. Keep "HOT WATER BOILER" / "HOT WATER CONDENSING BOILER"
  // (Klamath / Antelope) and "...BOILER SCHEDULE" (VA plant).
  BOILER: {
    titleRe: /HOT\s+WATER(?:\s+CONDENSING)?\s+BOILER\b|BOILER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS|FUEL\s+OIL\s+PUMP|PUMP\s+SCHEDULE|ISOLATION\s+VALVE|VALVE\s+SCHEDULE|SAFETY\s+VALVE/i,
    keyRe: /^(?:B[\s\-]|BOILER)/i,
  },
  // Titled pump schedules keep every equipment row (IWP/HWRP/…). blankKeyRe
  // only — claims HWP/CP/… from bare EQUIPMENT/MISC catch-all + blank titles
  // without filtering titled PUMP SCHEDULE rows. PUPSCHEDULE = common OCR miss.
  PUMP: {
    // Also match untitled-suffix hydronic pump boards (HEATING HOT WATER PUMP).
    // Or a condensate pump's own title, no SCHEDULE printed (044_NY's
    // CONDENSATE PUMP; AS-68).
    titleRe: /PUMP\s*SCHEDULE|PUPSCHEDULE|HYDRONIC\s+PUMPS?|(?:HEATING\s+)?(?:HOT|CHILLED)\s+WATER\s+PUMP|^\s*(?:STEAM\s+)?CONDENSATE\s+(?:RETURN\s+)?PUMPS?(?:\s+SCHEDULE)?\s*$/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS|HEAT\s+PUMP|VACUUM/i,
    // BS-* = packaged booster pump systems on EQUIPMENT catch-all lists.
    blankKeyRe: /^(?:P|CP|CWP|HWP|HHWP|CHWP|CHP|HWRP|IWP|BP|SP|SCHWP|RP|PP|EP|BS)[\s\-]?\d/i,
  },
  // Lab / medical vacuum pumps on dedicated VACUUM PUMP schedules (SDSU V-1).
  // Separate from hydronic PUMP (title exclude VACUUM) so V-* is not orphaned.
  VACUUM_PUMP: {
    titleRe: /VACUUM\s+PUMP(?:\s+SCHEDULE)?/i,
    exclude: /POINTS\s*LIST|DDC|HEAT\s+PUMP|HYDRONIC|CONDENSER|CHILLED\s+WATER/i,
    keyRe: /^V[\s\-]\d/i,
    titledOnly: true,
  },
  COOLING_TOWER: {
    titleRe: /COOLING\s+TOWER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^CT[\s\-]/i,
  },
  WATER_HEATER: {
    titleRe: /(?:INSTANTANEOUS\s+)?(?:GAS\s+)?WATER\s+HEATER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|BOILER/i,
    keyRe: /^(?:DWH|WH|WHW|EWH)[\s\-]/i,
  },
  WATER_SOFTENER: {
    titleRe: /WATER\s+SOFTENER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^WS[\s\-]/i,
  },
  // Brine / salt tanks listed on softener schedules (SDSU BT-1). titledOnly so
  // blank/catch-all BT-* stay on BUFFER_TANK (Colville) and are not double-counted.
  BRINE_TANK: {
    titleRe: /BRINE\s+TANK(?:\s+SCHEDULE)?|WATER\s+SOFTENER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|BUFFER\s+TANK|EXPANSION\s+TANK/i,
    keyRe: /^BT[\s\-]/i,
    titledOnly: true,
  },
  FAN: {
    // Or a title that is the fans' own name, no SCHEDULE printed: 23_GA's and
    // 14_OR's EXHAUST FANS, 072_CA's and 074_CA's SUPPLY FANS, 097_UT's
    // VENTILATION FANS, 26_CA's "FANS (SPECIFICATION SECTION 23 34 00)"
    // (AS-68). The whole title names them, from its first word to its last, so
    // an electrical list ending "- EXHAUST FANS" is not theirs.
    titleRe: /(?:GENERAL\s+)?(?:EXHAUST\s+|SUPPLY\s+|RETURN\s+|LAB\s+EXHAUST\s+|RELIEF\s+|LABORATORY\s+EXHAUST\s+|KITCHEN\s+EXHAUST\s+)?FAN SCHEDULE|^\s*(?:(?:EXHAUST|SUPPLY|RETURN|RELIEF|VENTILATION|VENTILATING|TRANSFER|TOILET|KITCHEN|ROOF|INLINE|UTILITY|GENERAL|SMOKE|STAIR|STAIRWELL|GARAGE|LAB|LABORATORY|PROPELLER|CENTRIFUGAL)\s+){0,3}FANS?(?:\s*\([^)]*\))?\s*$/i,
    exclude: /FAN\s*COIL|FAN\s+SOUND|AIR\s+HANDLING\s+UNIT\s+FAN|POINTS\s*LIST|FURNACE|CEILING\s+FAN/i,
    // REF-* = relief; TEF-* toilet/transfer; GX-* general exhaust (lab);
    // KEF-* kitchen exhaust (blank-title hydronic/exhaust summaries — Klamath).
    // S-A-* / R-A-* = supply/return fans on zone-lettered SUPPLY/RETURN FAN schedules
    // (NIST-style); DSF-* = duct supply fans; EG-* = general exhaust; SEF-* = stair/smoke exhaust on HVAC FAN schedules.
    // Any exhaust fan named by a one- or two-letter qualifier before EF and a
    // number (the KEF/GEF/TEF/LEF/SEF convention: 096_IN's pod and jail
    // exhaust fans PEF-1, JEF-1; AS-62).
    keyRe: /^(?:EF|SF|RF|REF|SPF|GEF|GCF|LEF|LF|GF|TEF|GX|KEF|DSF|EG|SEF|FAN|(?:S|R)-[A-Z]-|[A-Z]{1,2}EF(?=[\s\-]?\d))[\s\-]?/i,
    // Under a FAN SCHEDULE title: E-A-* zone-lettered fans (017_MD's RETURN
    // FAN SCHEDULE), bare F-* (016_NY) and BF-* (096_IN; AS-63); EXF-* (097_UT's
    // VENTILATION FANS) and transfer fans TF-* (26_CA's TF-P2-1; AS-68).
    titledKeyRe: /^(?:(?:E-[A-Z]-|F|BF|EXF)[\s\-]?\d|TF[\s\-])/i,
    // Read by its mark alone, EG-* is an exhaust grille (096_IN's untitled
    // diffuser and grille schedule lists EG2 and EG3; AS-66).
    titledOnlyRe: /^EG[\s\-]?\d/i,
  },
  // Destratification / room ceiling fans (CF-*). Separate from exhaust/supply FAN
  // — FAN titleRe already excludes CEILING FAN so these do not double-count.
  CEILING_FAN: {
    titleRe: /CEILING\s+FAN\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|FAN\s*COIL|CABINET/i,
    keyRe: /^CF[\s\-]/i,
    titledOnly: true,
  },
  CABINET_UNIT_HEATER: { titleRe: /CABINET UNIT HEATER/i },
  UNIT_HEATER: {
    // Connection-schedule duct-heater panels (EDH-*) use the same family marks.
    titleRe: /UNIT HEATER SCHEDULE|ELECTRIC\s+HEATERS?(?:\s+SCHEDULE)?|ELECTRIC\s+DUCT\s+HEATER|DUCT\s+HEATERS?(?:\s+SCHEDULE)?/i,
    exclude: /CABINET|POINTS\s*LIST|DDC/i,
    // UH/CUH/EH room heaters; EDH-* duct-mounted electric; ECUH-* electric
    // cabinet/unit; HWUH-* hot-water; GUH/NUH-* gas/natural unit heaters.
    keyRe: /^(?:UH|CUH|EH|EDH|ECUH|HWUH|HUH|EUH|GUH|NUH)[\s\-]?/i,
    // Under a unit heater title: EWH-* electric wall heaters (baker-county-eoc;
    // a water heater anywhere else) and SUH-* suspended (033_MN; AS-63).
    titledKeyRe: /^(?:EWH|SUH)[\s\-]?\d/i,
  },
  // Electric radiant ceiling panels (school/courthouse schedules; ECP-* marks).
  RADIANT_CEILING_PANEL: {
    titleRe: /RADIANT\s+CEILING\s+PANEL|ELECTRIC\s+RADIANT/i,
    exclude: /POINTS\s*LIST|DDC|HYDRONIC\s+RADIANT\s+FLOOR/i,
    keyRe: /^ECP[\s\-]/i,
  },
  // Hydronic fin-tube / finned-pipe radiation (FTR-* or FT-* marks).
  FIN_TUBE_RADIATION: {
    titleRe: /FIN[\s\-]*TUBE\s+RADIATION|FINNED\s+PIPE\s+RADIATION|FIN[\s\-]*TUBE\s+RADIATOR/i,
    exclude: /POINTS\s*LIST|DDC|CEILING\s+PANEL/i,
    keyRe: /^(?:FTR|FT)[\s\-]/i,
    // Titled-only: FTR-* also appears on FILTER & STRAINER / vibration tables
    // (Colville) and must not join via blank/catch-all keyRe.
    titledOnly: true,
  },
  // Filter panels on FILTER & STRAINER / AIR FILTER / FILTER schedules.
  // F-* on titled FILTER SCHEDULE (SDSU F-1); FTR-* on filter/strainer tables.
  // titledOnly: do not claim F-# from split-system / catch-all lists.
  FILTER: {
    titleRe: /FILTER\s*&\s*STRAINER\s+SCHEDULE|FILTER\s+AND\s+STRAINER\s+SCHEDULE|AIR\s+FILTER\s+SCHEDULE|\bFILTER\s+SCHEDULE\b/i,
    exclude: /POINTS\s*LIST|DDC|FIN[\s\-]*TUBE|WATER\s+FILTER\s+UNIT/i,
    keyRe: /^(?:FTR|F)[\s\-]?\d/i,
    titledOnly: true,
  },
  CRAH: { titleRe: /COMPUTER ROOM AIR HANDLER|\bCRAH\b/i },
  DEHUMIDIFIER: { titleRe: /DEHUMIDIFIER SCHEDULE/i, keyRe: /^DH[\-]/i },
  // HUM-*; bare H-* on humidifier / blank titles. EH-* only via altTitleRe
  // ELECTRIC HUMIDIFIER (EH on MISC stays UNIT_HEATER — Douglas EH-20/30).
  HUMIDIFIER: {
    // OCR often drops the second I (HUMIDIFER); STEAM HUMIDIFIER schedules common.
    titleRe: /HUMIDIFI?ER\s+SCHEDULE|STEAM\s+HUMIDIFI?ER/i,
    exclude: /DEHUMIDIFIER|POINTS\s*LIST|DDC/i,
    // HUM/SH must include a digit (SH1/SH-1/SH-A1) so sheet headers like
    // "SHT. NO." never match. Bare H-* still requires hyphen (H-A-3) so
    // HC-/HP-/HWC-* coils are not stolen. WHSE-SH1 works via markCoreForKeyRe.
    keyRe: /^(?:(?:HUM|SH)(?:[\s\-]+[A-Z]+)*[\s\-]*\d|H[\-])/i,
    // HF-* under a humidifier title (094_FL; AS-63), and HUM with one
    // letter for its number (061_IA's HUM-A; AS-64): the digit keyRe asks for
    // keeps sheet headers out, which a humidifier title already does.
    titledKeyRe: /^(?:HF[\s\-]?\d|HUM[\s\-]?[A-Z]$)/i,
    altTitleRe: /ELECTRIC\s+HUMIDIFI?ER/i,
    altKeyRe: /^(?:(?:EH|HUM|SH)(?:[\s\-]+[A-Z]+)*[\s\-]*\d|H[\-])/i,
  },
  AIR_SEPARATOR: {
    // Hydraulic separators (HS-*); "AIR SEPARATORS" boards without SCHEDULE.
    // An air and dirt separator (014_MT's and 061_IA's AIR/DIRT SEPARATOR
    // SCHEDULE; AS-68) or a dirt separator.
    titleRe: /AIR\s+SEPARATORS?(?:\s+SCHEDULE)?|HYDRAULIC\s+SEPARATOR(?:\s+SCHEDULE)?|\bAIR\s*(?:\/|&|AND)\s*DIRT\s+SEPARATORS?|\bDIRT\s+SEPARATORS?\b/i,
    // AS-/IAS-/HS- — digit required (not prose); optional zone letter.
    keyRe: /^(?:I?AS|HS)(?:[\s\-]+[A-Z]+)*[\s\-]*\d/i,
    // Under its own title, a separator lettered for its system (061_IA's
    // AS-A to AS-C; AS-68).
    titledKeyRe: /^(?:I?AS|HS)[\s\-]?[A-Z]$/i,
  },
  EXPANSION_TANK: {
    // OCR: EPANSIONANDCOPRESSIONTANKSCHEDULE (bldg5406) — expansion + compression.
    // EXPANSION SYSTEM SCHEDULE is the same vessel family on chiller plants.
    titleRe: /EXPANSION\s+TANK|EXPANSION\s+SYSTEM(?:\s+SCHEDULE)?|COMPRESSION\s+TANK|EPANSION|DRAWDOWN\s+TANK\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|BUFFER/i,
    // ET-1 / ET-A1 / DT-* — digit required so "ETC. NOT SHOWN…" never matches.
    keyRe: /^(?:ET|XT|DT)(?:[\s\-]+[A-Z]+)*[\s\-]*\d/i,
  },
  BUFFER_TANK: {
    titleRe: /BUFFER\s+TANK\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|EXPANSION/i,
    // BT-*; GST-* glycol/storage vessels listed on buffer-tank schedules.
    keyRe: /^(?:BT|GST)(?:[\s\-]+[A-Z]+)*[\s\-]*\d/i,
  },
  FLASH_TANK: {
    titleRe: /FLASH\s+TANK\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^FT(?:[\s\-]+[A-Z]+)*[\s\-]*\d/i,
  },
  HEAT_EXCHANGER: {
    // "(N) HEAT EXCHANGER SCHEDULE" and shell-and-tube / water-to-water boards.
    titleRe: /HEAT\s+EXCHANGER(?:\s+SCHEDULE)?|WATER[\s\-]*TO[\s\-]*WATER\s+HEAT\s+EXCHANGER|SHELL\s+AND\s+TUBE\s+HEAT\s+EXCHANGER/i,
    exclude: /POINTS\s*LIST|DDC/i,
    // HX/PHX/HE on catch-all; titled HX schedules keep set-local marks (B950A).
    blankKeyRe: /^(?:HX|PHX|HE)[\s\-]/i,
  },
  DUCT_MOUNTED_COIL: {
    // Electric duct-coil boards (DH-*) sit with hydronic CC/HC/RHC schedules.
    titleRe: /DUCT\s+MOUNTED\s+COIL|ELECTRIC\s+DUCT\s+COIL|HEATING\s+COIL\s+SCHEDULE|COOLING\s+COIL\s+SCHEDULE|HOT\s+WATER\s+REHEAT\s+COIL|REHEAT\s+COIL\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|FAN\s*COIL|AIR\s+HANDLING|CONTROL\s+VALVE|DUCT\s+HEATER/i,
    // CC/HC/RC coils; HWC-* hot-water; PHC/RHC preheat/reheat; DH-* electric duct coil.
    keyRe: /^(?:CC|HC|RC|HWC|PHC|RHC|DH)[\s\-]?/i,
    // Under a coil schedule title: RH-* reheat, SHC-* steam heating and DXC-*
    // direct expansion coils (05_MO; AS-63).
    titledKeyRe: /^(?:RH|SHC|DXC)[\s\-]?\d/i,
  },
  WATER_TREATMENT: {
    titleRe: /WATER\s+TREATMENT\s+SCHEDULE|REVERSE\s+OSMOSIS|\bRO\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|WATER\s+SOFTENER|WATER\s+HEATER/i,
    keyRe: /^(?:RO|WT|WTP)[\s\-]/i,
  },
  // Chemical bypass / pot feeders (PF-*) — hydronic water treatment accessory.
  CHEMICAL_POT_FEEDER: {
    titleRe: /(?:CHEMICAL\s+)?POT\s+FEEDER(?:\s+SCHEDULE)?|CHEMICAL\s+BYPASS\s+FEEDER/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^PF[\s\-]/i,
  },
  // Glycol makeup / dosing units (GMU-*).
  GLYCOL_MAKEUP: {
    titleRe: /GLYCOL\s+MAKE[\s\-]*UP(?:\s+UNIT)?(?:\s+SCHEDULE)?|\bGMU\b.*SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^GMU[\s\-]/i,
  },
  // Basket / y-strainers (STR-*). Do not claim FTR-* (fin-tube or filter panels).
  STRAINER: {
    titleRe: /STRAINER\s+SCHEDULE|FILTER\s*&\s*STRAINER\s+SCHEDULE|FILTER\s+AND\s+STRAINER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|AIR\s+FILTER|WATER\s+FILTER\s+UNIT/i,
    keyRe: /^STR[\s\-]/i,
  },
  AIR_COMPRESSOR: {
    titleRe: /AIR\s+COMPRESSOR\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|AIR\s+CONDITION/i,
    // No keyRe — avoid catch-all stealing AC-* air-conditioners.
  },
  // Specialty hydronic flow meters (itd FM-1 Onicon) — catch-all via keyRe.
  FLOW_METER: {
    titleRe: /(?:HYDRONIC\s+)?FLOW\s+METER(?:\s+SCHEDULE)?/i,
    exclude: /POINTS\s*LIST|DDC|AIR\s+FLOW|AIRFLOW/i,
    keyRe: /^FM[\s\-]/i,
  },
  // Motor VFDs on dedicated VARIABLE FREQUENCY DRIVE schedules (Spokane CT fans).
  VARIABLE_FREQUENCY_DRIVE: {
    titleRe: /VARIABLE\s+FREQUENCY\s+DRIVE(?:\s+SCHEDULE)?|\bVFD\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^VFD[\s\-]/i,
    titledOnly: true,
  },
  // Motorized OA/RA control dampers on dedicated CONTROL DAMPER schedules.
  // keyRe drops building-only marks (Carson B1 on the same table as OA1/OA2).
  // Primary: CONTROL DAMPER SCHEDULE + OA/RA/EA/SA (Carson). Alt: MOTORIZED
  // DAMPER SCHEDULE — MD-* plus other *D equipment marks (JED/PED/MAD/MOD),
  // not OA/RA (those stay on the primary keyRe only).
  CONTROL_DAMPER: {
    titleRe: /CONTROL\s+DAMPER\s+SCHEDULE/i,
    altTitleRe: /MOTORIZED\s+DAMPER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|FIRE\s+DAMPER|SMOKE\s+DAMPER|FUME\s+HOOD/i,
    keyRe: /^(?:OA|RA|EA|SA)[\s\-]?\d/i,
    altKeyRe: /^[A-Z]{1,3}D[\s\-]?\d/i,
    blankKeyRe: /^(?:MD|CD|DMP|OA|RA|EA|SA)[\s\-]/i,
    blankHeaderRes: [
      /\b(?:TAG|MARK|SYMBOL)\b/,
      /\b(?:DAMPER|ACTUATOR|SIZE|AIRFLOW|CFM)\b/,
    ],
  },
  // Isolation / gate / ball / shutoff on dedicated ISOLATION VALVE or bare
  // VALVE SCHEDULE. Not CHW/HHW control valves (V-CHW / V-HHW stay on
  // CHW_CONTROL_VALVE / HHW_CONTROL_VALVE via altKeyRe).
  ISOLATION_VALVE: {
    titleRe: /ISOLATION\s+VALVE\s+SCHEDULE/i,
    altTitleRe: /^(?:\(N\)\s*)?VALVE\s+SCHEDULE\b/i,
    exclude: /CONTROL\s+VALVE|POINTS\s*LIST|DDC|PRESSURE\s+REDUC|MIXING|BYPASS|SAFETY/i,
    keyRe: /^(?:VLV|IV|ISO|GV|BV)[\s\-]/i,
    blankKeyRe: /^(?:VLV|IV|ISO|GV|BV)[\s\-]/i,
    blankHeaderRes: [
      /\b(?:TAG|MARK|VALVE\s*MARK)\b/,
      /\b(?:SIZE|MANUFACTURER|MODEL|SERVICE)\b/,
    ],
  },
  PRESSURE_REDUCING_VALVE: {
    titleRe: /PRESSURE\s+REDUC(?:ING|TION)\s+VALVE\s+SCHEDULE/i,
    // Compact steam-station captions (SDSU "STEAM PRV" / bare PRV SCHEDULE).
    altTitleRe: /\bSTEAM\s+PRV\b|\bPRV\s+SCHEDULE\b/i,
    exclude: /POINTS\s*LIST|DDC|FLASH\s+TANK|SAFETY/i,
    keyRe: /^PRV[\s\-]/i,
    titledOnly: true,
  },
  // Steam/plant PSV schedules — distinct from PRV (do not collapse).
  PRESSURE_SAFETY_VALVE: {
    titleRe: /(?:STEAM\s+)?PRESSURE\s+SAFETY\s+VALVE\s+SCHEDULE|SAFETY\s+RELIEF\s+VALVE\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|PRESSURE\s+REDUC/i,
    keyRe: /^PSV[\s\-]/i,
    titledOnly: true,
  },
  MIXING_VALVE: {
    titleRe: /MIXING\s+VALVE\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^(?:MX|MV|TMV)[\s\-]/i,
    blankKeyRe: /^(?:MX|MV|TMV)[\s\-]/i,
    blankHeaderRes: [
      /\b(?:TAG|MARK|VALVE\s*MARK)\b/,
      /\b(?:SIZE|MANUFACTURER|MODEL|MIXING)\b/,
    ],
  },
  // Lab fume-hood exhaust control valves / VAV dampers (ECV-*). Titled-only —
  // VAV titleRe also hits "VARIABLE AIR VOLUME" in these captions, but ECV
  // marks fail VAV keyRe; claim them here instead of leaving orphans.
  FUME_HOOD_DAMPER: {
    titleRe: /FUME\s+HOOD.{0,40}(?:VARIABLE\s+AIR\s+VOLUME|VAV).{0,40}DAMPER|FUME\s+HOOD\s+DAMPER\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC|FIRE\s+DAMPER|SMOKE\s+DAMPER/i,
    keyRe: /^ECV[\s\-]/i,
    titledOnly: true,
  },
  // CHW / HHW from title signals (abbrev or spelled-out). Bypass valves stay out.
  CHW_CONTROL_VALVE: {
    titleRe: /(?:CHW|CHILLED\s*WATER).{0,40}CONTROL\s*VALVE|CONTROL\s*VALVE.{0,40}(?:CHW|CHILLED\s*WATER)/i,
    exclude: /BYPASS|HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT/i,
    identityHeaderRe: /VALVE\s*MARK/i,
    altTitleRe: /^(?:\(N\)\s*)?VALVE\s+SCHEDULE\b/i,
    altKeyRe: /^V[\s\-]?CHW/i,
    blankKeyRe: /^CV[\s\-]/i,
    blankServiceHint: "CHW",
    blankHeaderRes: [
      /\b(?:TAG|MARK|VALVE\s*MARK)\b/,
      /\b(?:GPM|\bCV\b|SERVED|MANUFACTURER|MODEL|SIZE|FLOW)\b/,
    ],
  },
  HHW_CONTROL_VALVE: {
    titleRe: /(?:HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT).{0,40}CONTROL\s*VALVE|CONTROL\s*VALVE.{0,40}(?:HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT)/i,
    exclude: /BYPASS|CHW|CHILLED\s*WATER/i,
    identityHeaderRe: /VALVE\s*MARK/i,
    altTitleRe: /^(?:\(N\)\s*)?VALVE\s+SCHEDULE\b/i,
    altKeyRe: /^V[\s\-]?HHW/i,
    blankKeyRe: /^CV[\s\-]/i,
    blankServiceHint: "HHW",
    blankHeaderRes: [
      /\b(?:TAG|MARK|VALVE\s*MARK)\b/,
      /\b(?:GPM|\bCV\b|SERVED|MANUFACTURER|MODEL|SIZE|FLOW|HHW|REHEAT|HOT\s*WATER)\b/,
    ],
  },
  BYPASS_CONTROL_VALVE: {
    titleRe: /BYPASS\s+CONTROL\s+VALVE/i,
    exclude: /POINTS\s*LIST|DDC/i,
    keyRe: /^BCV[\s\-]/i,
    identityHeaderRe: /(?:VALVE\s*MARK|SYMBOL)/i,
  },
  // Lab / cleanroom pressure-independent air valves (Phoenix-style SAV/GEV/SEV).
  // Not hydronic CHW/HHW control valves — stay out of CONTROL_VALVE_FAMILIES.
  LAB_AIR_VALVE: {
    titleRe: /PRESSURE\s+INDEPENDENT.{0,60}VALVE|(?:ROOM\s+SUPPLY|GENERAL\s+EXHAUST|SNORKEL\s+EXHAUST)\s+VALVE\s+SCHEDULE/i,
    exclude: /BYPASS|HHW|CHW|HOT\s+WATER|CHILLED\s+WATER|REHEAT|POINTS\s*LIST|DDC/i,
    keyRe: /^(?:SAV|GEV|SEV)[\s\-]/i,
  },
  GRD: {
    titleRe: /GRILLES?[,\s]*REGISTERS?[,\s]*(?:AND\s*)?DIFFUSERS?|GRILLE\s+SCHEDULE|DIFFUSERS?[\s\-]*GRILLES?|DIFFUSER\s+SCHEDULE|AIR\s+DEVICE\s+SCHEDULE|AIR\s+INLETS?\s*(?:&|AND)\s*OUTLETS?/i,
  },
  RANGE_HOOD: {
    titleRe: /RANGE HOOD SCHEDULE|CANOPY HOOD SCHEDULE|RELIEF HOOD SCHEDULE|INTAKE HOOD SCHEDULE|SNORKEL\s+HOOD\s+SCHEDULE/i,
  },
  DUCT_SILENCER: {
    titleRe: /DUCT SILENCER SCHEDULE|SILENCER SCHEDULE|SOUND ATTENUATOR SCHEDULE|SOUND\s+TRAP\s+SCHEDULE/i,
  },
  // Wall / intake louvers (LV-* / L-*). Titled-only — no keyRe so catch-all
  // cannot steal L-* lamp/luminaire marks. LOUER = OCR miss (bldg5406).
  LOUVER: {
    titleRe: /\bLOUVERS?\s*SCHEDULE\b|\bLOUER\s*SCHEDULE\b/i,
    exclude: /PENTHOUSE|POINTS\s*LIST|DDC|LOUVERED/i,
  },
  // Roof penthouse / architectural louvered penthouse (PH-* / ALP-*).
  LOUVERED_PENTHOUSE: {
    titleRe: /(?:ARCHITECTURAL\s+)?LOUVERED\s+PENTHOUSE(?:\s+SCHEDULE)?|\bPENTHOUSE\s+SCHEDULE\b/i,
    exclude: /POINTS\s*LIST|DDC/i,
  },
};

export const HVAC_EXCLUSIONS = [
  "VIBRATION ISOLATION SCHEDULE (accessory, not equipment units)",
  "FAN SOUND POWER LEVEL SCHEDULE (acoustic data, not equipment count)",
  "POINTS LIST / DDC POINTS LIST / I/O LIST (counted under T-BAS-01)",
  "GENERAL NOTES / PIPING CONSTRUCTION SCHEDULE",
];

export const BAS_EXCLUSIONS = [
  "Title-only schematic points lists (non-extractable typed rows)",
  "HVAC equipment schedules (counted under T-HVAC-01)",
  "Sequence-of-operations / narrative controls text (not a typed points table — refuse / not done; never invent points from SOO)",
];

/**
 * ASHRAE G13 / BMS estimating practice: spare I/O is a bid policy note
 * (typically ~10–25% per point type). Never applied into printed totals.
 */
export const BAS_SPARE_IO_POLICY = {
  label: "policy_disclose_only",
  typical_pct_per_point_type: { min: 10, max: 25, common: 15 },
  note: "ASHRAE Guideline 13 practice — spare % is a hardware bid disclose, never merged into POINTS LIST truth.",
};

/**
 * Conservative schedule→points estimate templates (qty × points/unit).
 * Labeled estimate_only — never merged into printed POINTS/I/O totals.
 * Rough BMS estimating practice for common US MEP families; sets without a
 * family template stay out of the estimate (honest gap, not invented).
 */
export const SCHEDULE_POINT_ESTIMATE_PER_UNIT = {
  AHU: { AI: 8, AO: 3, BI: 6, BO: 4 },
  DOAH_UNIT: { AI: 10, AO: 4, BI: 8, BO: 5 },
  DOAH_HANDLING: { AI: 10, AO: 4, BI: 8, BO: 5 },
  DOAS: { AI: 8, AO: 3, BI: 6, BO: 4 },
  OUTDOOR_AIR_UNIT: { AI: 6, AO: 2, BI: 4, BO: 3 },
  FCU: { AI: 3, AO: 1, BI: 2, BO: 2 },
  VAV: { AI: 2, AO: 1, BI: 1, BO: 1 },
  RTU: { AI: 6, AO: 2, BI: 4, BO: 3 },
  CHILLER: { AI: 4, AO: 1, BI: 4, BO: 2 },
  BOILER: { AI: 3, AO: 1, BI: 3, BO: 2 },
  PUMP: { AI: 1, AO: 0, BI: 1, BO: 1 },
  FAN: { AI: 1, AO: 0, BI: 1, BO: 1 },
  HEAT_EXCHANGER: { AI: 2, AO: 0, BI: 1, BO: 0 },
  COOLING_TOWER: { AI: 2, AO: 1, BI: 2, BO: 1 },
};

/** Point-bearing HVAC families used for inventory ↔ POINTS gap reports. */
export const BAS_POINT_BEARING_FAMILIES = Object.keys(SCHEDULE_POINT_ESTIMATE_PER_UNIT);

/**
 * Sequence-of-operations / controls narrative titles (not typed POINTS rows).
 * Presence is disclosed; points are never invented from SOO prose.
 */
export function isSooNarrativeTitle(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\bSEQUENCES?\s+OF\s+OPERATIONS?\b/i.test(t)) return true;
  if (/\bSEQUENCE\s+OF\s+CONTROL\b/i.test(t)) return true;
  if (/\bCONTROL\s+SEQUENCES?\b/i.test(t)) return true;
  if (/\bSYSTEM\s+OPERATION\s+SEQUENCES?\b/i.test(t)) return true;
  if (/\bCONTROLS?\s+NARRATIVE\b/i.test(t)) return true;
  // SOO-shaped "POINT LIST TABLE" captions (rejected by isBasPointsListTitle).
  if (/\bPOINT\s+LIST\s+TABLE\b/i.test(t)) return true;
  return false;
}

/**
 * Resolve schedule table_title + sheet for plan-paint preferTitle/preferSheet when
 * the HVAC row title is blank, wrong-sheet, or a BAS list (I/O LIST ≠ owner).
 * Scans graph tables for the tag on an equipment schedule — never invents tags.
 * @returns {{ title: string|null, sheet_id: string|null }}
 */
function preferScheduleHintForEquipmentTag(graph, tag, fallbackTitle = null) {
  const fb = String(fallbackTitle || "").replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
  if (fb && !isBasPointsListTitle(fb)) {
    const want = String(tag || "").trim().toUpperCase();
    for (const table of graph?.tables || []) {
      const title = String(table.title?.text || "").replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
      if (title !== fb) continue;
      for (const row of table.rows || []) {
        const key = String(row.key || row.identity?.text || row.identity?.key || "").trim().toUpperCase();
        if (key === want) return { title: fb, sheet_id: table.sheet || null };
      }
    }
    return { title: fb, sheet_id: null };
  }
  const want = String(tag || "").trim().toUpperCase();
  if (!want || !graph?.tables?.length) return { title: null, sheet_id: null };
  let generic = null;
  for (const printed of graph.tables) {
    const table = scheduleTableView(printed);
    const title = String(table.title?.text || "").replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
    if (!title || isBasPointsListTitle(title)) continue;
    for (const row of table.rows || []) {
      const key = String(row.key || row.identity?.text || row.identity?.key || "").trim().toUpperCase();
      if (key !== want) continue;
      const hint = { title, sheet_id: table.sheet || null };
      if (/SCHEDULE|EQUIPMENT|PUMP|BOILER|AHU|FCU|VAV|DOAS|RTU|FAN|CHILLER|VALVE|DAMPER/i.test(title)) {
        return hint;
      }
      generic = generic || hint;
    }
  }
  return generic || { title: null, sheet_id: null };
}

/** @deprecated internal — use preferScheduleHintForEquipmentTag */
function preferScheduleTitleForEquipmentTag(graph, tag, fallbackTitle = null) {
  return preferScheduleHintForEquipmentTag(graph, tag, fallbackTitle).title;
}

/** Plan-paint preferTitle/preferSheet from HVAC row or graph scan (never wrong-sheet pairing). */
function planPaintPreferHint(graph, tag, itemTableTitle = null, itemSheetId = null, listTitle = null) {
  const tableTitle = String(itemTableTitle || "").replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
  if (tableTitle && !isBasPointsListTitle(tableTitle)) {
    return { prefer_schedule_title: tableTitle, prefer_schedule_sheet: itemSheetId || null };
  }
  const hint = preferScheduleHintForEquipmentTag(graph, tag, tableTitle || listTitle);
  return {
    prefer_schedule_title: hint.title,
    // Graph-resolved title must pair with its owning sheet — inventory sheet_id
    // may point at a blank reference table on another sheet (Colville CP-1).
    prefer_schedule_sheet: hint.sheet_id || itemSheetId || null,
  };
}

/**
 * Scan schedule/table titles for SOO presence. Tabular SOO scoring is still
 * refuse_not_done — narrative-only / raster never invents points.
 */
export function detectSooPresence(graph) {
  const titles = [];
  for (const table of graph?.tables || []) {
    const title = String(table.title?.text || "").replace(/\s+/g, " ").trim();
    if (!title || !isSooNarrativeTitle(title)) continue;
    titles.push({
      title: title.slice(0, 160),
      sheet_id: table.sheet || null,
      tabular_points: false,
    });
  }
  if (!titles.length) {
    return {
      present: false,
      status: "absent_or_not_detected",
      tabular_extractable: false,
      titles: [],
      note: "No SOO / sequence-of-operations titles detected on extractable tables — refuse_not_done for SOO-derived points.",
    };
  }
  return {
    present: true,
    status: "present_not_row_extractable",
    tabular_extractable: false,
    titles,
    note: "SOO present but not a typed points source — refuse_not_done; never invent points from narrative.",
  };
}

function tableHeaderNames(table) {
  if (Array.isArray(table?.headers) && table.headers.length) {
    return table.headers.map((h) => String(h).replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  const out = new Set();
  for (const row of table?.rows || []) {
    for (const h of Object.keys(row.cells || {})) {
      const name = String(h).replace(/\s+/g, " ").trim();
      if (name) out.add(name);
    }
  }
  return [...out];
}

/**
 * Strict column-header probe on BAS/I/O tables for PROOF/INTERLOCK/SPARE columns.
 * CAPACITY-only false positives are excluded — only explicit spare/proof headers count.
 * Presence is disclosed; points are never invented from column labels alone.
 */
export function probeBasProofSpareColumnHeaders(graph) {
  const hits = [];
  const proofHeaders = new Set();
  const spareHeaders = new Set();
  let basTables = 0;
  for (const table of graph?.tables || []) {
    const title = String(table.title?.text || "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    const basTable = isBasPointsListTitle(title)
      || /\bI\s*\/?\s*O\b|\bPOINTS?\s+LIST\b|\bDDC\s+CONTROLLER\b/i.test(title);
    if (!basTable) continue;
    basTables += 1;
    const matched = [];
    for (const header of tableHeaderNames(table)) {
      const hu = header.toUpperCase();
      if (/\bSPARE\b/.test(hu) && /\b(?:I\s*\/?\s*O|POINT|CAPACITY)\b/.test(hu)) {
        spareHeaders.add(header);
        matched.push({ kind: "spare_io", header });
      } else if (/^(?:PROOF(?:\s+OF\s+\w+)?|INTERLOCK|HOA|HAND[\s-]*OFF[\s-]*AUTO|END\s*SW(?:ITCH)?|SAFETY|FIRE\s*SMOKE)$/.test(hu)) {
        proofHeaders.add(header);
        matched.push({ kind: "proof_interlock", header });
      }
    }
    if (matched.length) {
      hits.push({
        title: title.slice(0, 160),
        sheet_id: table.sheet || null,
        matched,
      });
    }
  }
  const proof = [...proofHeaders];
  const spare = [...spareHeaders];
  return {
    bas_tables_scanned: basTables,
    proof_interlock_column_headers: proof,
    spare_io_column_headers: spare,
    hits,
    status: proof.length || spare.length ? "printed_columns_present" : "no_proof_spare_columns",
    note: proof.length || spare.length
      ? "Printed PROOF/INTERLOCK/SPARE column headers detected — disclose only; refuse_not_done until row values are extractable points."
      : "No PROOF/INTERLOCK/SPARE column headers on BAS/I/O tables — SOO-derived proofs/spares remain refuse_not_done.",
  };
}

/**
 * Labeled schedule-derived point estimate (qty × points/unit) + gap vs printed.
 * Totals here are estimate_only — never merge into printed POINTS LIST truth.
 *
 * @param {object} hvacTakeoff compileHvacTakeoff result
 * @param {object[]} basLists printed points lists from compileBasTakeoff
 */
export function buildBasEstimatorProduct(hvacTakeoff, basLists, graph) {
  const soo = detectSooPresence(graph);
  const controls_column_probe = probeBasProofSpareColumnHeaders(graph);
  const inventory = [];
  const estimateByFamily = [];
  let estimateUnits = 0;
  const estimateTotals = { AI: 0, AO: 0, BI: 0, BO: 0, points: 0 };

  for (const family of BAS_POINT_BEARING_FAMILIES) {
    const cat = hvacTakeoff?.categories?.[family];
    const count = cat?.count ?? cat?.items?.length ?? 0;
    if (!count) continue;
    const tags = (cat.items || []).map((it) => String(it.tag || it.mark || "").trim()).filter(Boolean);
    // Plan-paint hints: prefer_schedule_title from the HVAC row's own table_title
    // so cross-family building letters (Carson B1) resolve — never invent titles.
    const plan_paint_targets = (cat.items || []).slice(0, 40).map((it) => {
      const tag = String(it.tag || it.mark || "").trim();
      if (!tag) return null;
      const hint = planPaintPreferHint(graph, tag, it.table_title, it.sheet_id);
      return { tag, ...hint };
    }).filter(Boolean);
    inventory.push({ family, count, tags: tags.slice(0, 40), plan_paint_targets });
    const per = SCHEDULE_POINT_ESTIMATE_PER_UNIT[family];
    if (!per) continue;
    const famPoints = {
      family,
      units: count,
      per_unit: { ...per },
      estimated: {
        AI: per.AI * count,
        AO: per.AO * count,
        BI: per.BI * count,
        BO: per.BO * count,
      },
    };
    famPoints.estimated.points = famPoints.estimated.AI + famPoints.estimated.AO
      + famPoints.estimated.BI + famPoints.estimated.BO;
    estimateByFamily.push(famPoints);
    estimateUnits += count;
    estimateTotals.AI += famPoints.estimated.AI;
    estimateTotals.AO += famPoints.estimated.AO;
    estimateTotals.BI += famPoints.estimated.BI;
    estimateTotals.BO += famPoints.estimated.BO;
    estimateTotals.points += famPoints.estimated.points;
  }

  const printedServed = new Set();
  let printedRows = 0;
  for (const list of basLists || []) {
    for (const item of list.items || []) {
      printedRows += 1;
      const served = String(item.served_equipment || "").trim().toUpperCase();
      if (served) printedServed.add(served);
    }
  }

  // HVAC tag → schedule title for plan-paint preferTitle (pumps, AHUs, …).
  const hvacByTag = new Map();
  for (const cat of Object.values(hvacTakeoff?.categories || {})) {
    for (const item of cat.items || []) {
      const tag = String(item.tag || item.mark || "").trim().toUpperCase();
      if (!tag || hvacByTag.has(tag)) continue;
      const hint = planPaintPreferHint(graph, tag, item.table_title, item.sheet_id);
      hvacByTag.set(tag, hint);
    }
  }

  const targetSeen = new Set();
  const planPaintTargets = [];
  const pushPlanPaintTarget = (t) => {
    if (!t?.tag) return;
    const key = `${String(t.source || "unknown")}::${String(t.tag).toUpperCase()}::${String(t.prefer_schedule_title || "").toUpperCase()}`;
    if (targetSeen.has(key)) return;
    targetSeen.add(key);
    planPaintTargets.push(t);
  };
  for (const row of inventory) {
    for (const t of row.plan_paint_targets || []) {
      pushPlanPaintTarget({ ...t, source: "inventory" });
    }
  }
  const servedSeen = new Set();
  for (const list of basLists || []) {
    for (const item of list.items || []) {
      const served = String(item.served_equipment || "").trim();
      if (!served || /^(AI|AO|BI|BO)[\s-]?\d/i.test(served)) continue;
      const key = served.toUpperCase();
      if (servedSeen.has(key)) continue;
      servedSeen.add(key);
      const hint = hvacByTag.get(key)
        || planPaintPreferHint(graph, served, item.table_title, item.sheet_id, list.title);
      pushPlanPaintTarget({
        tag: served,
        source: "served_equipment",
        prefer_schedule_title: hint.prefer_schedule_title,
        prefer_schedule_sheet: hint.prefer_schedule_sheet || item.sheet_id || list.sheet_id || null,
      });
    }
  }

  const inventoryTags = new Set();
  for (const row of inventory) {
    for (const tag of row.tags || []) inventoryTags.add(String(tag).trim().toUpperCase());
  }

  const inventoryWithoutPrintedPoints = [];
  for (const tag of inventoryTags) {
    if (!tag) continue;
    // Loose join: exact mark, or printed served contains mark / mark contains served token.
    let hit = printedServed.has(tag);
    if (!hit) {
      for (const served of printedServed) {
        if (served === tag || tagMatches(tag, served) || tagMatches(served, tag)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) inventoryWithoutPrintedPoints.push(tag);
  }

  const printedWithoutInventory = [];
  for (const served of printedServed) {
    let hit = inventoryTags.has(served);
    if (!hit) {
      for (const tag of inventoryTags) {
        if (tag === served || tagMatches(served, tag) || tagMatches(tag, served)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) printedWithoutInventory.push(served);
  }

  return {
    kind: "bas_estimator_product",
    estimator_complete: false,
    equipment_inventory: {
      source: "compileHvacTakeoff",
      point_bearing_families: inventory,
      unit_count: inventory.reduce((n, r) => n + r.count, 0),
    },
    soo,
    controls_column_probe,
    schedule_derived_estimate: {
      label: "estimate_only",
      never_merge_into_printed_truth: true,
      template: "SCHEDULE_POINT_ESTIMATE_PER_UNIT",
      units: estimateUnits,
      by_family: estimateByFamily,
      totals: estimateTotals,
      note: "Equipment qty × typed points/unit — labeled estimate only; never silently merge into POINTS LIST totals.",
    },
    gap_vs_printed: {
      printed_rows: printedRows,
      printed_served_marks: printedServed.size,
      inventory_marks: inventoryTags.size,
      inventory_without_printed_points: inventoryWithoutPrintedPoints.slice(0, 60),
      inventory_without_printed_points_count: inventoryWithoutPrintedPoints.length,
      printed_served_without_inventory: printedWithoutInventory.slice(0, 60),
      printed_served_without_inventory_count: printedWithoutInventory.length,
      note: "Gap report only — does not invent POINTS rows for missing units.",
    },
    spare_io_policy: BAS_SPARE_IO_POLICY,
    plan_paint: {
      status: "refuse_not_done",
      note: "Served-equipment / inventory plan MATCH or honest SCHEDULE_ONLY paint still required per mark — printed POINTS ≠ installed takeoff. When sweeping served_equipment or inventory marks, pass prefer_schedule_title from plan_paint targets (HVAC table_title or owning POINTS/I/O list) so cross-schedule collisions resolve; never invent plan qty.",
      targets: (() => {
        const served = planPaintTargets.filter((t) => t.source === "served_equipment");
        const inventoryT = planPaintTargets.filter((t) => t.source === "inventory");
        // Keyed BAS sets can have 100+ served marks — never drop them for inventory samples.
        const cap = 120;
        const room = Math.max(0, cap - served.length);
        return [...served, ...inventoryT.slice(0, room)];
      })(),
    },
  };
}

/**
 * Estimator-completeness disclosure for Pillar C (shared UI+MCP).
 * Printed POINTS/I/O rows alone are never a complete commercial BAS takeoff.
 * Each gate is open | refuse_not_done | n/a — refuse means unfinished work,
 * not a success metric or locked ceiling.
 *
 * @param {{ lists: object[], totals: object, sheets: object[], product?: object }} parts
 */
export function basEstimatorStatus({ lists, totals, sheets, product = null }) {
  const rowCount = totals?.rows ?? 0;
  const listCount = lists?.length ?? 0;
  let withServed = 0;
  let withoutServed = 0;
  for (const list of lists || []) {
    for (const item of list.items || []) {
      if (item?.served_equipment) withServed += 1;
      else withoutServed += 1;
    }
  }
  const printedLists = listCount === 0
    ? "empty"
    : (rowCount > 0 ? "partial_printed_only" : "title_only_excluded");
  const open = [];
  const refuseNotDone = [
    {
      gate: "plan_paint",
      status: "refuse_not_done",
      note: product?.plan_paint?.note
        || "Served-equipment / inventory plan MATCH or honest SCHEDULE_ONLY still required — refuse, not complete.",
    },
    {
      gate: "soo_derived_points",
      status: "refuse_not_done",
      note: product?.soo?.present
        ? (product.soo.note || "SOO present but not row-extractable — refuse, not complete.")
        : "SOO / sequence narratives are not a points source yet — refuse, not complete.",
    },
    {
      gate: "spare_io_capacity",
      status: "refuse_not_done",
      note: BAS_SPARE_IO_POLICY.note + " — refuse_not_done until controller spare is drawing-backed.",
    },
    {
      gate: "proofs_interlocks_alarms_trends_beyond_printed",
      status: "refuse_not_done",
      note: product?.controls_column_probe?.proof_interlock_column_headers?.length
        ? `Printed proof/interlock columns (${product.controls_column_probe.proof_interlock_column_headers.join(", ")}) — row extract still refuse_not_done.`
        : "Only printed ALARM/TREND columns are promoted; SOO proofs/interlocks remain open.",
    },
    {
      gate: "schedule_derived_estimate_not_merged",
      status: "open",
      note: product?.schedule_derived_estimate
        ? `Estimate_only ${product.schedule_derived_estimate.totals?.points ?? 0} pts across ${product.schedule_derived_estimate.units ?? 0} units — never merged into printed totals.`
        : "Schedule-derived estimate path available as labeled estimate_only.",
    },
    {
      gate: "gt_lock",
      status: "refuse_not_done",
      note: "Coordinator self-check + pipeline GT lock not granted for this compile alone.",
    },
  ];
  if (printedLists === "empty") {
    open.push({
      gate: "extractable_points_lists",
      status: "refuse_not_done",
      note: "No extractable POINTS/DDC/I/O list titles on this set under current set-agnostic needles.",
    });
  } else {
    open.push({
      gate: "printed_points_lists",
      status: "open",
      note: `${listCount} list(s), ${rowCount} printed row(s) — necessary plumbing, not estimator-complete.`,
    });
  }
  if (withoutServed > 0) {
    open.push({
      gate: "served_equipment_join",
      status: "open",
      note: `${withServed} rows with served_equipment; ${withoutServed} still unjoined — plan paint incomplete.`,
    });
  } else if (withServed > 0) {
    open.push({
      gate: "served_equipment_join",
      status: "open",
      note: `All ${withServed} printed rows carry served_equipment text; plan MATCH still required per unit.`,
    });
  }
  const gapCount = product?.gap_vs_printed?.inventory_without_printed_points_count ?? 0;
  if (gapCount > 0) {
    open.push({
      gate: "inventory_points_gap",
      status: "open",
      note: `${gapCount} inventory mark(s) lack printed POINTS/I/O joins — gap disclosed, points not invented.`,
    });
  }
  const invUnits = product?.equipment_inventory?.unit_count ?? 0;
  if (invUnits > 0) {
    open.push({
      gate: "equipment_inventory",
      status: "open",
      note: `${invUnits} point-bearing schedule unit(s) from HVAC compile — inventory only; not estimator-complete.`,
    });
  } else {
    refuseNotDone.unshift({
      gate: "equipment_inventory",
      status: "refuse_not_done",
      note: "No point-bearing HVAC schedule units extracted — equipment inventory incomplete.",
    });
  }
  return {
    estimator_complete: false,
    gt_locked: false,
    meaning: "refuse_not_done = unfinished Pillar C work, not a locked success/ceiling",
    printed_lists: printedLists,
    sheet_count: sheets?.length ?? 0,
    served_equipment: { with_join: withServed, without_join: withoutServed },
    soo_status: product?.soo?.status || "unknown",
    schedule_estimate_points: product?.schedule_derived_estimate?.totals?.points ?? null,
    inventory_gap_count: gapCount,
    gates: [...open, ...refuseNotDone],
  };
}

/**
 * Shared UI+MCP gate for T-BAS-01 list titles.
 * Covers NAVFAC-shaped POINTS/DDC lists and PLC panel I/O LIST / IO LIST
 * schedules (device rows with analog/digital columns — not AI## MARK prefixes).
 * Set-agnostic: no sheet IDs or locked counts.
 */
export function isBasPointsListTitle(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  // A controls narrative may call an explanatory section "POINT LIST
  // TABLE" without printing a typed point grid. Keep that known narrative
  // caption out while accepting both common authored table spellings:
  // POINTS LIST and POINT LIST.
  if (/\bPOINT\s+LIST\s+TABLE\b/i.test(t)) return false;
  if (/\bPOINTS?\s+LIST\b/i.test(t)) return true;
  if (/\bDDC\s+POINTS\b/i.test(t)) return true;
  if (/\bI\s*\/\s*O\s+LIST\b/i.test(t)) return true;
  if (/\bIO\s+LIST\b/i.test(t)) return true;
  // Lab/VA DDC controller I/O summaries (device-point rows, not AI## MARK lists).
  if (/\bDDC\s+CONTROLLER\s+INPUT\s*\/?\s*OUTPUT\b/i.test(t)) return true;
  if (/\bCONTROLLER\s+I\s*\/?\s*O\s+(?:SUMMARY|LEGEND|LIST)\b/i.test(t)) return true;
  // Explicit object/interface matrices enumerate BAS-visible values even when
  // the drafter did not put POINTS LIST in the caption.
  if (/\bBACNET\s+INTERFACE\s+SCHEDULE\b/i.test(t)) return true;
  // MISCELLANEOUS POINTS SCHEDULE / POINT FUNCTION SCHEDULE (not SOO
  // "point list table" narratives — those lack the SCHEDULE token).
  if (/\bPOINTS?\s+FUNCTION\s+SCHEDULE\b/i.test(t)) return true;
  if (/\bPOINTS?\s+SCHEDULE\b/i.test(t)) return true;
  return false;
}

/**
 * L5 geometry: untitled BAS / I/O grids — header shape, not title regex alone.
 * Requires point/I/O column tokens and rejects valve-schedule header shapes.
 */
export function isBasPointsListTable(table) {
  const title = String(table?.title?.text || "").replace(/\s+/g, " ").trim();
  if (isBasPointsListTitle(title)) return true;
  if (title) return false;
  if (isControlValveHeaderShape(table)) return false;
  const blob = tableHeaderBlob(table);
  if (!blob) return false;
  if (/\b(?:GPM|\bCV\b)\b/.test(blob) && /\bSERVED\b/.test(blob)) return false;
  return headerShapeMatches(table, [
    /\b(?:TAG|MARK|POINT|DESCRIPTION|DEVICE)\b/,
    /\b(?:AI|AO|BI|BO|ANALOG|DIGITAL|INPUT|OUTPUT|I\s*\/\s*O)\b/,
  ]);
}

/** Display title for header-inferred BAS tables (never used as a family regex). */
export function inferBasListTitle(table) {
  const blob = tableHeaderBlob(table);
  if (/\bI\s*\/\s*O\s+LIST\b|\bIO\s+LIST\b/i.test(blob)) return "I/O LIST (header-inferred)";
  if (/\bDDC\s+CONTROLLER\b/i.test(blob)) return "DDC CONTROLLER I/O (header-inferred)";
  if (/\bPOINTS?\s+SCHEDULE\b/i.test(blob)) return "POINTS SCHEDULE (header-inferred)";
  if (/\bPOINTS?\s+LIST\b/i.test(blob)) return "POINTS LIST (header-inferred)";
  return "BAS POINTS TABLE (header-inferred)";
}

/** Column-label rows that are not countable I/O or points marks. */
function isBasPointsHeaderRow(tag) {
  return !tag || /^(?:TAG|MARK|SYMBOL|POINT|DESCRIPTION|NOTES?|(?:ANALOG|BINARY|DIGITAL)\s+(?:INPUT|OUTPUT))$/i.test(tag);
}

const BAS_POINT_TYPE_HEADER_RE = /^(?:HARDWARE\s+)?(?:POINT|I\s*\/?\s*O)\s+TYPE$/i;

/**
 * Resolve one printed BAS point type without guessing from the point name.
 * The public takeoff vocabulary uses BI/BO; drawings commonly print the
 * equivalent DI/DO terminology, so those exact authored values normalize to
 * BI/BO while the unmodified source token remains on the item. Conflicting
 * MARK and type-cell evidence is deliberately left untyped.
 */
function basPointTypeEvidence(row, tag) {
  const markType = String(tag || "").toUpperCase().match(/^(AI|AO|BI|BO)[\s\-]?(?:\d|#+)/)?.[1] || null;
  const raw = String(cellText(row, BAS_POINT_TYPE_HEADER_RE) || "").trim();
  const normalized = raw.toUpperCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  const explicitType = ({
    AI: "AI",
    AO: "AO",
    BI: "BI",
    BO: "BO",
    DI: "BI",
    DO: "BO",
    "ANALOG INPUT": "AI",
    "ANALOG OUTPUT": "AO",
    "BINARY INPUT": "BI",
    "BINARY OUTPUT": "BO",
    "DIGITAL INPUT": "BI",
    "DIGITAL OUTPUT": "BO",
    "DISCRETE INPUT": "BI",
    "DISCRETE OUTPUT": "BO",
  })[normalized] || null;

  if (markType && explicitType && markType !== explicitType) {
    return {
      type: null,
      raw,
      basis: "conflicting_mark_and_point_type_cell",
      status: "REFUSED_POINT_TYPE_CONFLICT",
    };
  }
  if (markType && explicitType) {
    return { type: markType, raw, basis: "mark_prefix_and_explicit_point_type_cell", status: "typed" };
  }
  if (markType) return { type: markType, raw: null, basis: "mark_prefix", status: "typed" };
  if (explicitType) return { type: explicitType, raw, basis: "explicit_point_type_cell", status: "typed" };
  return {
    type: null,
    raw: raw || null,
    basis: raw ? "unrecognized_explicit_point_type_cell" : null,
    status: raw ? "REFUSED_UNRECOGNIZED_POINT_TYPE" : "untyped",
  };
}

/**
 * Schedule column headers / schema labels that sometimes leak into row.key
 * when ODL treats a header band as a data row. Not equipment marks.
 */
export function isScheduleHeaderJunkMark(canon) {
  return /^(MODEL|TAG|MARK|TYPE|SYMBOL|DESCRIPTION|REMARKS?|NOTES?|SIZE|CAPACITY|MANUFACTURER|MANUF|QTY|QUANTITY|UNITS?|SERVICE|DESIGNATION|LOCATION|AREA|FLOOR|SHEET|HEADER|MIN\.?|MAX\.?)$/i.test(
    String(canon || ""),
  )
    // A legend's heading: 047_NC's "PIPING LEGEND", under a legend sheet's
    // "-CONDENSING UNIT" read as a title, was a condensing unit (AS-66).
    || /LEGEND$/i.test(String(canon || ""));
}

function sheetRecords(sessionOrSheets, graph) {
  if (Array.isArray(sessionOrSheets)) return sessionOrSheets;
  if (sessionOrSheets?.sheetList) return sessionOrSheets.sheetList();
  // Web/UI path: derive page list from the sheet graph when no Session is present.
  return (graph.sheets || []).map((s) => ({
    key: s.key || s.sheet || s.id,
    number: s.number ?? s.sheetNumber ?? null,
    sheetNumber: s.sheetNumber ?? s.number ?? null,
    title: s.title || null,
  }));
}

export function compileHvacTakeoff(sessionOrSheets, graph) {
  const sheets = sheetRecords(sessionOrSheets, graph);
  const categories = {};
  for (const [name, spec] of Object.entries(HVAC_FAMILY_SPECS)) {
    const fam = uniqueFamily(graph, spec, name);
    categories[name] = {
      count: fam.count,
      tolerance: 0,
      building: fam.building,
      provenance: "Unique MARK/VALVE MARK rows on the named equipment schedule family; continuation pages deduped by tag; vibration-isolation / sound / points lists excluded from HVAC.",
      items: fam.items,
    };
  }

  const pages = sheets.map((sheet) => {
    const key = sheet.key;
    // Page accounting reports actual compiled HVAC scope, not merely any
    // extracted table title on the page. Otherwise reference matrices,
    // project-symbol legends, and BAS points lists can make a controls page
    // look like an equipment-schedule page despite contributing zero HVAC
    // items. Use the categories assembled above so reporting cannot drift
    // from the compiler's own family boundaries.
    const contributingItems = Object.values(categories)
      .flatMap((category) => category.items || [])
      .filter((item) => item.sheet_id === key);
    const titles = [...new Set(contributingItems.map((item) => item.table_title).filter(Boolean))];
    return {
      sheet_id: key,
      sheet_number: sheet.sheetNumber ?? sheet.number ?? null,
      status: contributingItems.length === 0 ? "empty_for_hvac_equipment_schedules" : "has_hvac_equipment_schedule",
      titles,
    };
  });

  const itemCount = Object.values(categories).reduce((n, c) => n + c.items.length, 0);
  return {
    schema_version: CORPUS_TAKEOFF_VERSION,
    takeoff_id: "T-HVAC-01",
    kind: "hvac_equipment",
    compiler: "corpusTakeoff.compileHvacTakeoff",
    sheet_count: sheets.length,
    categories,
    totals: {
      categories: Object.keys(categories).length,
      items: itemCount,
    },
    page_accounting: {
      sheet_count: sheets.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    // Valve/coil compiles already disclose the same architectural-sheet gap
    // (control_valves ships CONTROL_DAMPER/FUME_HOOD_DAMPER too) — HVAC must
    // carry it for the same categories, not report damper counts silently.
    exclusions: [...HVAC_EXCLUSIONS, ...scopeExclusionsForGraph(graph)],
  };
}

export function compileBasTakeoff(sessionOrSheets, graph) {
  const sheets = sheetRecords(sessionOrSheets, graph);
  const lists = [];
  for (const table of graph.tables || []) {
    const rawTitle = String(table.title?.text || "");
    if (!isBasPointsListTitle(rawTitle) && !isBasPointsListTable(table)) continue;
    const title = rawTitle.trim() || inferBasListTitle(table);
    const counts = { AI: 0, AO: 0, BI: 0, BO: 0, other: 0 };
    const extras = { alarm: 0, trend: 0, hardwired: 0, soft: 0 };
    const items = [];
    for (const row of table.rows || []) {
      // The MARK cell is authored point identity. `row.key` is an extractor
      // convenience and can retain a section-prefix fragment (for example
      // "BI BI#") even when the cited MARK cell correctly reads "BI#".
      // Prefer the evidence-bearing cell so type counts, exports, and Agent
      // citations all refer to the same printed token.
      const tag = String(cellText(row, /^MARK$/i) || row.key || "").trim();
      // Skip column-label rows (I/O LIST prints TAG as a data key).
      if (isBasPointsHeaderRow(tag)) continue;
      // Some templates print a literal placeholder mark (BI#, BI##, BO#)
      // for a repeated or field-numbered point. It is still an authored
      // typed point row; the wildcard is not a reason to demote it to
      // `other` or invent a number for it.
      const pointType = basPointTypeEvidence(row, tag);
      if (pointType.type) {
        counts[pointType.type] += 1;
      } else if (pointType.status === "REFUSED_POINT_TYPE_CONFLICT") {
        counts.other += 1;
      } else {
        // PLC I/O LIST shape: device rows carry ANALOG/DIGITAL quantity cells
        // (not AI## MARK prefixes). Roll those into AI/BI point totals — set-
        // agnostic; INPUT/OUTPUT direction is not reliably extracted, so
        // analog→AI and digital→BI is the disclosed convention.
        const analog = sumNumericCells(row, /^ANALOG\b/i);
        const digital = sumNumericCells(row, /^DIGITAL\b/i);
        if (analog > 0 || digital > 0) {
          counts.AI += analog;
          counts.BI += digital;
        } else {
          counts.other += 1;
        }
      }
      const { cells, description } = scheduleAttrs(row);
      const pointExtras = basPointExtras(row);
      const servedEquipment = servedEquipmentFromBasRow(row, title);
      if (pointExtras.alarm) extras.alarm += 1;
      if (pointExtras.trend) extras.trend += 1;
      if (pointExtras.wiring === "hardwired") extras.hardwired += 1;
      if (pointExtras.wiring === "soft") extras.soft += 1;
      // table_bbox_px is the SCHEDULE's own region, not its title caption —
      // see the same fix's comment at uniqueFamily's item construction.
      const tableBbox = Array.isArray(table.region) && table.region.length === 4 ? table.region : null;
      const titleBbox = Array.isArray(table.title?.bbox) && table.title.bbox.length === 4
        ? table.title.bbox
        : null;
      const qtyStatus2 = scheduledQtyStatusFromRow(row);
      items.push({
        tag,
        quantity: 1,
        quantity_basis: "schedule_row_cardinality",
        scheduled_qty: qtyStatus2.refused ? null : qtyStatus2.qty,
        scheduled_qty_basis: qtyStatus2.basis,
        scheduled_qty_source_header: qtyStatus2.source_header,
        scheduled_qty_source_text: qtyStatus2.source_text,
        installed_qty: null,
        status: qtyStatus2.refused ? "REFUSED_UNPARSEABLE_QTY" : null,
        qty_kind: qtyStatus2.refused ? "unresolved" : "scheduled",
        unit: "EA",
        sheet_id: table.sheet,
        table_title: title,
        bbox_px: cellBbox(row, /^MARK/i) || row.identity?.bbox || null,
        table_bbox_px: tableBbox,
        title_bbox_px: titleBbox,
        description: description || cellText(row, /DESCRIPTION/i) || null,
        point_type: pointType.type,
        point_type_raw: pointType.raw,
        point_type_basis: pointType.basis,
        point_type_status: pointType.status,
        point_type_bbox_px: cellBbox(row, BAS_POINT_TYPE_HEADER_RE),
        cells,
        alarm: pointExtras.alarm,
        trend: pointExtras.trend,
        wiring: pointExtras.wiring,
        served_equipment: servedEquipment,
        ...(qtyStatus2.refused ? { reason: qtyStatus2.reason } : {}),
      });
    }
    // Empty after header skip → title-only schematic; disclose via exclusions, do not count.
    if (items.length === 0) continue;
    const compiled = {
      title,
      sheet_id: table.sheet,
      rows: items.length,
      AI: counts.AI,
      AO: counts.AO,
      BI: counts.BI,
      BO: counts.BO,
      alarm: extras.alarm,
      trend: extras.trend,
      hardwired: extras.hardwired,
      soft: extras.soft,
      items,
    };
    // Vector/ODL table recovery can split one wide or tall authored points
    // list into adjacent fragments. Same page + same normalized title is one
    // logical list; keep the row-level citations but present and total it
    // once. Whole duplicate tables are already removed by graph reconcile,
    // so fragment counts add without suppressing legitimate repeated point
    // definitions that happen to share a tag but have different descriptions.
    const listKey = `${String(table.sheet)}\0${title.toUpperCase().replace(/\s+/g, " ").trim()}`;
    const prior = lists.find((candidate) => candidate._merge_key === listKey);
    if (prior) {
      prior.rows += compiled.rows;
      prior.AI += compiled.AI;
      prior.AO += compiled.AO;
      prior.BI += compiled.BI;
      prior.BO += compiled.BO;
      prior.alarm += compiled.alarm;
      prior.trend += compiled.trend;
      prior.hardwired += compiled.hardwired;
      prior.soft += compiled.soft;
      prior.items.push(...compiled.items);
    } else {
      lists.push({ ...compiled, _merge_key: listKey });
    }
  }

  for (const list of lists) delete list._merge_key;

  const totals = lists.reduce(
    (acc, l) => ({
      rows: acc.rows + l.rows,
      AI: acc.AI + l.AI,
      AO: acc.AO + l.AO,
      BI: acc.BI + l.BI,
      BO: acc.BO + l.BO,
      alarm: acc.alarm + (l.alarm || 0),
      trend: acc.trend + (l.trend || 0),
      hardwired: acc.hardwired + (l.hardwired || 0),
      soft: acc.soft + (l.soft || 0),
    }),
    { rows: 0, AI: 0, AO: 0, BI: 0, BO: 0, alarm: 0, trend: 0, hardwired: 0, soft: 0 },
  );

  const pages = sheets.map((sheet) => {
    const key = sheet.key;
    const tables = (graph.tables || []).filter((t) => t.sheet === key);
    const titles = [...new Set(tables
      .map((t) => {
        const raw = String(t.title?.text || "").trim();
        if (isBasPointsListTitle(raw)) return raw;
        if (isBasPointsListTable(t)) return inferBasListTitle(t);
        return "";
      })
      .filter(Boolean))];
    return {
      sheet_id: key,
      sheet_number: sheet.sheetNumber ?? sheet.number ?? null,
      status: titles.length === 0 ? "empty_for_bas_points_lists" : "has_bas_points_list",
      titles,
    };
  });

  const hvac = compileHvacTakeoff(sessionOrSheets, graph);
  const estimator_product = buildBasEstimatorProduct(hvac, lists, graph);
  const estimator_status = basEstimatorStatus({ lists, totals, sheets, product: estimator_product });

  return {
    schema_version: CORPUS_TAKEOFF_VERSION,
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    compiler: "corpusTakeoff.compileBasTakeoff",
    sheet_count: sheets.length,
    categories: {
      points_lists: {
        provenance: "Each extractable POINTS/DDC/I/O list title-scanned; AI/AO/BI/BO comes from authored MARK prefixes or exact POINT TYPE / HARDWARE POINT TYPE / I/O TYPE cells (DI/DO normalize to BI/BO while retaining the printed token). Conflicting authored types remain untyped. On I/O LIST device rows without typed marks/cells, ANALOG/DIGITAL quantity cells roll into AI/BI (direction not distinguished); printed ALARM / TREND / hardwired-vs-soft columns promoted when present (never invented); served_equipment from UNIT/EQUIPMENT/SERVED columns, I/O device keys, or POINTS LIST title unit token when printed (plan paint joins on that mark — never invented); column-label rows skipped; title-only schematic lists excluded and disclosed. Sequence-of-operations narratives are not a points source. Schedule-derived qty×points/unit estimates are labeled estimate_only and never merged into these printed totals.",
        tolerance: { count: 0, point_type: 0 },
        lists,
        totals,
      },
    },
    totals: {
      lists: lists.length,
      rows: totals.rows,
      AI: totals.AI,
      AO: totals.AO,
      BI: totals.BI,
      BO: totals.BO,
      alarm: totals.alarm,
      trend: totals.trend,
      hardwired: totals.hardwired,
      soft: totals.soft,
    },
    /** Pillar C: printed lists ≠ done. See gates with status refuse_not_done. */
    estimator_status,
    /** Equipment inventory + SOO disclose + labeled estimate + gap — never merges into totals. */
    estimator_product,
    page_accounting: {
      sheet_count: sheets.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    exclusions: [...BAS_EXCLUSIONS, ...scopeExclusionsForGraph(graph)],
  };
}

/**
 * Valve / damper / air-valve families for kind=control_valves (Pillar C / WP7).
 * CHW+HHW remain the hydronic core (T-VALVE-01); additional US MEP families are
 * first-class when their schedules extract — never invent rows.
 * Service filter CHW|HHW still scopes to the matching hydronic family only.
 */
export const CONTROL_VALVE_FAMILIES = [
  "CHW_CONTROL_VALVE",
  "HHW_CONTROL_VALVE",
  "BYPASS_CONTROL_VALVE",
  "ISOLATION_VALVE",
  "PRESSURE_REDUCING_VALVE",
  "PRESSURE_SAFETY_VALVE",
  "MIXING_VALVE",
  "CONTROL_DAMPER",
  "FUME_HOOD_DAMPER",
  "LAB_AIR_VALVE",
];

/** The valve takeoff's air-side families: they control air, never a coil's water. */
const AIR_SIDE_VALVE_FAMILIES = new Set(["CONTROL_DAMPER", "FUME_HOOD_DAMPER", "LAB_AIR_VALVE"]);

/**
 * Contractor-facing valve row fields from a schedule row's cells.
 * One Cv / size / GPM / served unit per valve — never invent dual CHW+HHW Cv
 * columns on the same line (those came from bad agent markdown merges).
 * Promote printed Actuator / Fail position / control signal when present
 * (WP7 research); never invent missing actuator fields.
 */
export function normalizeControlValveCells(item, service) {
  const cells = item?.cells && typeof item.cells === "object" ? item.cells : {};
  const out = {};
  const take = (re, label) => {
    for (const [header, cell] of Object.entries(cells)) {
      if (!re.test(String(header || ""))) continue;
      const text = String(cell?.text ?? (typeof cell === "string" ? cell : "")).trim();
      if (!text) continue;
      out[label] = {
        text,
        bbox: Array.isArray(cell?.bbox) && cell.bbox.length === 4 ? cell.bbox : (cell?.bbox_px || null),
      };
      return;
    }
  };
  // Schedule header is UNIT MARK — surface both labels (same value) so the
  // Takeoff panel can lead with "Unit Mark" without losing "Served equipment".
  take(/^UNIT\s*MARK$/i, "Unit Mark");
  if (out["Unit Mark"]) out["Served equipment"] = { ...out["Unit Mark"] };
  else take(/SERVED|EQUIPMENT\s*MARK/i, "Served equipment");
  take(/VALVE\s*SIZE|PIPE\s*SIZE|DAMPER\s*SIZE|^\s*SIZE\s*$/i, "Size");
  take(/FLOWRATE|\bFLOW\b|\bGPM\b/i, "GPM");
  // Exactly one Cv — the schedule column is "CV", not "CHW CV" / "HHW CV".
  take(/^\s*C[Vv]\s*$/i, "Cv");
  take(/CONFIGURATION|CONFIG/i, "Configuration");
  take(/\bACTUATOR\b|ACTUATION/i, "Actuator");
  take(/FAIL\s*POSITION|FAIL[\s\-]?SAFE|SPRING[\s\-]?RETURN/i, "Fail position");
  take(/CONTROL\s*SIGNAL|SIGNAL\s*TYPE|INPUT\s*SIGNAL|0[\s\-]?10\s*V|4[\s\-]?20\s*M\s*A|3[\s\-]?15\s*P\s*S\s*I/i, "Control signal");
  take(/^NOTES$/i, "Notes");
  if (service) {
    // Label only — never borrow the whole table region as a "Service" cite.
    out.Service = { text: service, bbox: null };
  }
  return out;
}

/** Contractor columns that a commercial valve takeoff expects when printed. */
export const VALVE_CONTRACTOR_COLUMNS = [
  "Served equipment",
  "Size",
  "GPM",
  "Cv",
  "Actuator",
  "Fail position",
  "Control signal",
];

/**
 * Pillar C valve estimator disclose — printed valve/damper rows alone are never
 * a complete commercial valve takeoff (plan paint + actuator completeness + GT).
 * refuse_not_done = unfinished work, not a locked ceiling.
 *
 * @param {{ categories: object, totals: object }} parts
 */
export function buildValveEstimatorProduct({ categories, totals }) {
  const familyRollup = [];
  let withServed = 0;
  let withCv = 0;
  let withSize = 0;
  let withGpm = 0;
  let withActuator = 0;
  let withFail = 0;
  let withSignal = 0;
  let itemCount = 0;
  const planPaintTargets = [];
  for (const [name, cat] of Object.entries(categories || {})) {
    const items = cat.items || [];
    if (!items.length) continue;
    let famServed = 0;
    let famCv = 0;
    let famAct = 0;
    for (const item of items) {
      itemCount += 1;
      const cells = item.cells || {};
      const tag = String(item.tag || item.mark || "").trim();
      if (tag) {
        planPaintTargets.push({
          tag,
          family: name,
          prefer_schedule_title: item.table_title || null,
          prefer_schedule_sheet: item.sheet_id || null,
        });
      }
      const served = cells["Unit Mark"]?.text || cells["Served equipment"]?.text;
      const cv = cells.Cv?.text;
      const size = cells.Size?.text;
      const gpm = cells.GPM?.text;
      const act = cells.Actuator?.text;
      const fail = cells["Fail position"]?.text;
      const signal = cells["Control signal"]?.text;
      if (served) { withServed += 1; famServed += 1; }
      if (cv) { withCv += 1; famCv += 1; }
      if (size) withSize += 1;
      if (gpm) withGpm += 1;
      if (act) { withActuator += 1; famAct += 1; }
      if (fail) withFail += 1;
      if (signal) withSignal += 1;
    }
    familyRollup.push({
      family: name,
      count: items.length,
      with_served: famServed,
      with_cv: famCv,
      with_actuator: famAct,
    });
  }
  const missingContractor = [];
  if (itemCount > 0) {
    if (withServed < itemCount) missingContractor.push("Served equipment");
    if (withSize < itemCount) missingContractor.push("Size");
    if (withGpm < itemCount) missingContractor.push("GPM");
    if (withCv < itemCount) missingContractor.push("Cv");
    if (withActuator < itemCount) missingContractor.push("Actuator");
    if (withFail < itemCount) missingContractor.push("Fail position");
    if (withSignal < itemCount) missingContractor.push("Control signal");
  }
  return {
    kind: "valve_estimator_product",
    estimator_complete: false,
    printed_items: itemCount || totals?.items || 0,
    families: familyRollup,
    contractor_column_coverage: {
      served_equipment: withServed,
      size: withSize,
      gpm: withGpm,
      cv: withCv,
      actuator: withActuator,
      fail_position: withFail,
      control_signal: withSignal,
      missing_on_some_rows: missingContractor,
      note: "Coverage of printed schedule columns only — never invent missing Cv/actuator/GPM.",
    },
    plan_paint: {
      status: "refuse_not_done",
      note: "Plan MATCH / SCHEDULE_ONLY paint still required per mark — printed schedule ≠ installed takeoff. When sweeping valve/damper MARKs, pass prefer_schedule_title from targets (schedule table_title) when the same MARK appears on multiple schedules; never invent plan qty.",
      targets: planPaintTargets.slice(0, 80),
    },
  };
}

/**
 * @param {{ product?: object, totals?: object }} parts
 */
export function valveEstimatorStatus({ product = null, totals = null } = {}) {
  const items = product?.printed_items ?? totals?.items ?? 0;
  const open = [];
  const refuseNotDone = [
    {
      gate: "plan_paint",
      status: "refuse_not_done",
      note: "Valve/damper plan paint MATCH or honest SCHEDULE_ONLY still required — refuse, not complete.",
    },
    {
      gate: "actuator_fail_signal_complete",
      status: "refuse_not_done",
      note: "Actuator / fail / signal only when printed; missing columns stay refuse_not_done — never invent.",
    },
    {
      gate: "gt_lock",
      status: "refuse_not_done",
      note: "Coordinator self-check + pipeline GT lock not granted for this valve compile alone.",
    },
  ];
  if (items === 0) {
    open.push({
      gate: "extractable_valve_schedules",
      status: "refuse_not_done",
      note: "No extractable valve/damper/air-valve schedule rows under current set-agnostic families.",
    });
  } else {
    open.push({
      gate: "printed_valve_schedules",
      status: "open",
      note: `${items} printed valve/damper row(s) — necessary plumbing, not estimator-complete.`,
    });
  }
  const missing = product?.contractor_column_coverage?.missing_on_some_rows || [];
  if (missing.length) {
    open.push({
      gate: "contractor_column_gaps",
      status: "open",
      note: `Printed rows missing some of: ${missing.join(", ")} — disclose only, do not invent.`,
    });
  }
  return {
    estimator_complete: false,
    gt_locked: false,
    meaning: "refuse_not_done = unfinished Pillar C valve work, not a locked success/ceiling",
    printed_items: items,
    gates: [...open, ...refuseNotDone],
  };
}

/**
 * Deterministic CHW + HHW control-valve takeoff for "complete valve takeoff"
 * goals. Same Session+ODL family extractors as T-HVAC-01, filtered to valves,
 * with contractor columns: valve mark, served equipment, service, size, GPM, Cv.
 *
 * @param {object} [opts]
 * @param {"CHW"|"HHW"|null} [opts.service] — when set, only that hydronic
 *   service family's schedule (set-agnostic: matches CHW_/HHW_ family keys /
 *   schedule titles, not a corpus hardcode).
 */
export function compileControlValveTakeoff(sessionOrSheets, graph, opts = {}) {
  const full = compileHvacTakeoff(sessionOrSheets, graph);
  const wantService = opts.service ? String(opts.service).toUpperCase() : null;
  const categories = {};
  for (const name of CONTROL_VALVE_FAMILIES) {
    // CHW|HHW service filter keeps hydronic-only scope (T-VALVE-01 / phrase
    // "chilled-water valve takeoff"); air-side + isolation families appear
    // when the goal asks for a complete valve takeoff (no service filter).
    if (wantService === "CHW" && name !== "CHW_CONTROL_VALVE") continue;
    if (wantService === "HHW" && name !== "HHW_CONTROL_VALVE") continue;
    const cat = full.categories?.[name];
    if (!cat) continue;
    const service = name === "CHW_CONTROL_VALVE" ? "CHW"
      : name === "HHW_CONTROL_VALVE" ? "HHW"
      : null;
    const items = (cat.items || []).map((item) => {
      const cells = normalizeControlValveCells(item, service);
      const served = cells["Unit Mark"]?.text || cells["Served equipment"]?.text || null;
      const bldg = item.building
        || buildingCodeFromTag(served)
        || buildingCodeFromTag(item.tag);
      return {
        ...item,
        building: bldg,
        cells,
        description: served ? `Serves ${served}` : (item.description || null),
      };
    });
    categories[name] = {
      ...cat,
      count: items.length,
      items,
      provenance: "Unique MARK rows on valve/damper/air-valve schedules; "
        + "columns = mark, served equipment, service (when hydronic), size, GPM, Cv, "
        + "configuration, actuator / fail position / control signal when printed.",
    };
  }
  const itemCount = Object.values(categories).reduce((n, c) => n + (c.items?.length || 0), 0);
  const totals = {
    categories: Object.keys(categories).length,
    items: itemCount,
  };
  const estimator_product = buildValveEstimatorProduct({ categories, totals });
  const estimator_status = valveEstimatorStatus({ product: estimator_product, totals });
  return {
    ...full,
    takeoff_id: "T-VALVE-01",
    kind: "control_valves",
    compiler: "corpusTakeoff.compileControlValveTakeoff",
    service_filter: wantService || null,
    categories,
    totals,
    /** Pillar C: printed valve rows ≠ done. */
    estimator_status,
    estimator_product,
    exclusions: [
      ...HVAC_EXCLUSIONS,
      "Non-valve HVAC equipment (AHU, FCU, VAV, pumps, …) — use kind hvac_equipment for the full equipment takeoff",
      ...(wantService ? [
        `${wantService === "CHW" ? "HHW" : "CHW"} CONTROL VALVE SCHEDULE (filtered out — goal asked for ${wantService} only)`,
        "Isolation / PRV / damper / lab-air valve families (filtered out — hydronic service scope)",
      ] : []),
      ...scopeExclusionsForGraph(graph),
    ],
  };
}

/**
 * Real coils imply real control valves (physics), whether or not a
 * dedicated valve schedule exists for them. This walks EVERY table in the
 * graph (not just tables already believed to be valve schedules) for
 * embedded coil data (extractEmbeddedCoils), then checks whether the
 * existing tag/schedule-based control-valve compile already accounts for
 * each one — by tag or served-area text match. A coil with no matching
 * scheduled valve is a real, evidence-cited gap: disclosed, never
 * silently dropped, and never invented as a fabricated valve tag or size.
 * Real, found-live motivating case (2026-09-02):
 * 001_NC_FY20_P_228_ATC_Tower_and_Air_Operations's own AIR HANDLING UNIT
 * SCHEDULE and DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE both embed
 * real coil GPM/EWT/LWT data with no separate valve schedule anywhere in
 * the set.
 */
export function compileEmbeddedCoilGaps(sessionOrSheets, graph) {
  const valveCompile = compileControlValveTakeoff(sessionOrSheets, graph);
  const scheduledValveText = new Set();
  for (const [family, cat] of Object.entries(valveCompile.categories || {})) {
    // A damper or air valve that serves a unit never controls its coil's
    // water (AS-63): 016_NY's CONTROL DAMPER SCHEDULE lists CD rows serving
    // AHU-1, whose heating coil still has no scheduled valve.
    if (AIR_SIDE_VALVE_FAMILIES.has(family)) continue;
    for (const item of cat.items || []) {
      if (item.tag) scheduledValveText.add(String(item.tag).toUpperCase());
      const served = item.cells?.["Served equipment"]?.text || item.description || "";
      if (served) scheduledValveText.add(String(served).toUpperCase());
    }
  }
  const scheduledList = [...scheduledValveText];

  // Real, found-live bug (2026-09-02, caught in self-review before this
  // shipped further): plain .includes() substring matching would mark
  // AHU-1's coil as already having a scheduled valve when the schedule
  // only lists AHU-10 ("AHU-10".includes("AHU-1") === true) — a false
  // corroboration that would silently hide a real gap. Word-boundary
  // matching so a tag only matches its own whole occurrence, never a
  // numeric prefix of a different tag.
  const coils = [];
  for (const table of graph?.tables || []) {
    for (const coil of extractEmbeddedCoils(table)) {
      const keys = [coil.tag, coil.served].filter(Boolean).map((s) => s.toUpperCase());
      const hasScheduledValve = keys.some(
        (k) => scheduledList.some((v) => tagMatches(k, v) || tagMatches(v, k)),
      );
      coils.push({
        ...coil,
        sheet: table.sheet,
        source_table_title: table.title?.text || null,
        has_scheduled_valve: hasScheduledValve,
      });
    }
  }
  const gaps = coils.filter((c) => !c.has_scheduled_valve);

  const sheetKeys = Array.isArray(graph?.sheets)
    ? graph.sheets.map((s) => ({ key: s.key || s.sheet || s.id, number: s.sheetNumber ?? s.number ?? null }))
    : [];
  const coilsBySheet = new Map();
  for (const c of coils) {
    const list = coilsBySheet.get(c.sheet) || [];
    list.push(c);
    coilsBySheet.set(c.sheet, list);
  }
  const pages = sheetKeys.map((s) => {
    const here = coilsBySheet.get(s.key) || [];
    return {
      sheet_id: s.key,
      sheet_number: s.number,
      status: here.length === 0 ? "empty_for_embedded_coils" : "has_embedded_coil",
      coils_on_sheet: here.length,
      gaps_on_sheet: here.filter((c) => !c.has_scheduled_valve).length,
    };
  });

  return {
    schema_version: 1,
    takeoff_id: "T-VALVE-EMBEDDED-01",
    kind: "embedded_coil_valve_gaps",
    compiler: "corpusTakeoff.compileEmbeddedCoilGaps",
    sheet_count: sheetKeys.length,
    note: "Real coil hydronic performance data (GPM + EWT/LWT) found "
      + "embedded inside equipment schedules (AHU/RTU/FCU/etc.), "
      + "cross-referenced against the tag/schedule-based control-valve "
      + "compile. A coil requiring hydronic flow control always implies a "
      + "control valve — entries in `gaps` have no matching scheduled "
      + "valve found; disclosed with real evidence, never invented as a "
      + "fabricated tag.",
    categories: {
      embedded_coil_gaps: {
        provenance: "extractEmbeddedCoils structural detector (header "
          + "co-occurrence: GPM + EWT/LWT under a shared prefix) over "
          + "every table in the graph, cross-referenced against "
          + "compileControlValveTakeoff by tag/served-area text.",
        totals: { coils_found: coils.length, gaps: gaps.length },
        // Real rows for the shared rowsFromCompiledTakeoff grounding path
        // (canvas highlights, cite-backed columns) — only the real gaps
        // (has_scheduled_valve: false) surface as takeoff items; a
        // corroborated coil is already represented by its own scheduled
        // valve row and would double-count if it appeared here too.
        // No real schedule row backs a gap. It is an inferred absence, one per
        // evidenced coil instance, and therefore must never be presented as a
        // scheduled or installed quantity.
        items: gaps.map((g) => ({
          tag: g.tag || `${g.coilLabel}@${g.sheet}`,
          sheet_id: g.sheet,
          table_title: g.source_table_title,
          quantity: 1,
          quantity_basis: "inferred_embedded_coil_gap",
          scheduled_qty: null,
          scheduled_qty_basis: null,
          installed_qty: null,
          status: null,
          qty_kind: "inferred_gap",
          unit: "EA",
          description: `Embedded ${g.coilLabel} — GPM ${g.gpm}${g.ewt ? `, EWT ${g.ewt}` : ""}${g.lwt ? `, LWT ${g.lwt}` : ""} — no matching scheduled valve found`,
          cells: {
            "COIL LABEL": { text: g.coilLabel },
            GPM: { text: g.gpm },
            ...(g.ewt ? { EWT: { text: g.ewt } } : {}),
            ...(g.lwt ? { LWT: { text: g.lwt } } : {}),
            SERVED: { text: g.served || "" },
          },
        })),
      },
    },
    totals: { coils_found: coils.length, gaps: gaps.length },
    page_accounting: {
      sheet_count: sheetKeys.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    exclusions: [
      "Riser-diagram valve-instance counts (not yet mined as a source)",
      "Control-schematic device↔point linkage (not yet a dedicated extraction path)",
      ...scopeExclusionsForGraph(graph),
    ],
    coils,
    gaps,
  };
}

export function compileCorpusTakeoff(session, graph, kind, opts = {}) {
  if (kind === "hvac_equipment" || kind === "T-HVAC-01") return compileHvacTakeoff(session, graph);
  if (kind === "bas_points" || kind === "T-BAS-01") return compileBasTakeoff(session, graph);
  if (kind === "control_valves" || kind === "T-VALVE-01") return compileControlValveTakeoff(session, graph, opts);
  throw new Error(`Unknown takeoff kind: ${kind}`);
}

/** Build workbook sheet rows for CSV/XLSX export from a compiled takeoff. */
export function takeoffWorkbookSheets(takeoff, { interrogationLog = null } = {}) {
  const sheets = [];
  if (takeoff.kind === "hvac_equipment" || takeoff.kind === "control_valves") {
    const bldgKeys = [...new Set(
      Object.values(takeoff.categories || {})
        .flatMap((cat) => Object.keys(cat.building || {})),
    )].sort((a, b) => {
      if (a === "other") return 1;
      if (b === "other") return -1;
      return a.localeCompare(b);
    });
    const rollup = [["category", "count", "unit", ...bldgKeys.map((k) => `building_${k}`)]];
    for (const [name, cat] of Object.entries(takeoff.categories || {})) {
      rollup.push([
        name,
        cat.count,
        "EA",
        ...bldgKeys.map((k) => cat.building?.[k] ?? 0),
      ]);
      const attrKeys = [];
      const seenAttr = new Set();
      for (const item of cat.items || []) {
        for (const k of Object.keys(item.cells || {})) {
          const nk = String(k).toUpperCase();
          if (seenAttr.has(nk)) continue;
          seenAttr.add(nk);
          attrKeys.push(k);
        }
      }
      // Prefer contractor-facing columns first; keep the rest stable by name.
      const prefer = [
        /DESCRIPTION/i, /^SERVICE$/i, /^TYPE$/i, /LOCATION|AREA SERVED/i,
        /\bCFM\b/i, /\bGPM\b/i, /\bMBH\b|\bTONS?\b|\bKW\b/i,
        /HEAD|FT HD|ESP|STATIC/i, /VOLTAGE|VOLTS|\bPHASE\b|\bHP\b/i,
        /\bCV\b|PIPE SIZE|CONN/i, /MANUFACTURER|MODEL/i, /REMARKS|NOTES/i,
      ];
      attrKeys.sort((a, b) => {
        const ia = prefer.findIndex((re) => re.test(a));
        const ib = prefer.findIndex((re) => re.test(b));
        const aa = ia < 0 ? 999 : ia;
        const bb = ib < 0 ? 999 : ib;
        if (aa !== bb) return aa - bb;
        return String(a).localeCompare(String(b));
      });
      const rows = [["tag", "description", "qty", "quantity_basis", "unit", "scheduled_qty", "scheduled_qty_basis", "installed_qty", "status", "qty_kind", "building", "sheet_id", "table_title", ...attrKeys, "bbox_px"]];
      for (const item of cat.items || []) {
        rows.push([
          item.tag,
          item.description || "",
          item.quantity,
          item.quantity_basis ?? "",
          item.unit,
          item.scheduled_qty ?? "",
          item.scheduled_qty_basis ?? "",
          item.installed_qty ?? "",
          item.status ?? "",
          item.qty_kind ?? "",
          item.building || "",
          item.sheet_id,
          item.table_title,
          ...attrKeys.map((k) => {
            const c = item.cells?.[k];
            if (c == null) return "";
            if (typeof c === "object") return c.text ?? "";
            return c;
          }),
          Array.isArray(item.bbox_px) ? item.bbox_px.join(",") : "",
        ]);
      }
      sheets.push({ name, rows });
    }
    sheets.unshift({ name: "ROLLUP", rows: rollup });
  } else if (takeoff.kind === "bas_points") {
    const lists = takeoff.categories?.points_lists?.lists || [];
    const totals = takeoff.categories?.points_lists?.totals || {};
    const rollup = [
      ["list_title", "sheet_id", "rows", "AI", "AO", "BI", "BO"],
      ...lists.map((l) => [l.title, l.sheet_id, l.rows, l.AI, l.AO, l.BI, l.BO]),
      ["TOTAL", "", totals.rows, totals.AI, totals.AO, totals.BI, totals.BO],
    ];
    sheets.push({ name: "ROLLUP", rows: rollup });
    for (const list of lists) {
      const attrKeys = [];
      const seenAttr = new Set();
      for (const item of list.items || []) {
        for (const k of Object.keys(item.cells || {})) {
          const nk = String(k).toUpperCase();
          if (seenAttr.has(nk)) continue;
          seenAttr.add(nk);
          attrKeys.push(k);
        }
      }
      attrKeys.sort((a, b) => String(a).localeCompare(String(b)));
      const rows = [["tag", "point_type", "description", "qty", "quantity_basis", "unit", "scheduled_qty", "scheduled_qty_basis", "installed_qty", "status", "qty_kind", "sheet_id", "table_title", ...attrKeys, "bbox_px"]];
      for (const item of list.items || []) {
        const pt = item.point_type
          || String(item.tag || "").toUpperCase().match(/^(AI|AO|BI|BO)/)?.[1]
          || "";
        rows.push([
          item.tag,
          pt,
          item.description || "",
          item.quantity,
          item.quantity_basis ?? "",
          item.unit,
          item.scheduled_qty ?? "",
          item.scheduled_qty_basis ?? "",
          item.installed_qty ?? "",
          item.status ?? "",
          item.qty_kind ?? "",
          item.sheet_id,
          item.table_title,
          ...attrKeys.map((k) => {
            const c = item.cells?.[k];
            if (c == null) return "";
            if (typeof c === "object") return c.text ?? "";
            return c;
          }),
          Array.isArray(item.bbox_px) ? item.bbox_px.join(",") : "",
        ]);
      }
      const short = String(list.title).replace(/\s+/g, " ").slice(0, 28);
      sheets.push({ name: short, rows });
    }
  } else if (takeoff.kind === "embedded_coil_valve_gaps") {
    const items = takeoff.categories?.embedded_coil_gaps?.items || [];
    const rollup = [
      ["tag", "sheet_id", "table_title", "qty", "quantity_basis", "unit", "scheduled_qty", "scheduled_qty_basis", "installed_qty", "status", "qty_kind", "description"],
      ...items.map((item) => [
        item.tag, item.sheet_id, item.table_title, item.quantity, item.quantity_basis ?? "", item.unit,
        item.scheduled_qty ?? "", item.scheduled_qty_basis ?? "", item.installed_qty ?? "", item.status ?? "", item.qty_kind ?? "",
        item.description || "",
      ]),
    ];
    sheets.push({ name: "ROLLUP", rows: rollup });
    const attrKeys = [];
    const seenAttr = new Set();
    for (const item of items) {
      for (const k of Object.keys(item.cells || {})) {
        const nk = String(k).toUpperCase();
        if (seenAttr.has(nk)) continue;
        seenAttr.add(nk);
        attrKeys.push(k);
      }
    }
    attrKeys.sort((a, b) => String(a).localeCompare(String(b)));
    const rows = [["tag", "sheet_id", "table_title", ...attrKeys]];
    for (const item of items) {
      rows.push([
        item.tag, item.sheet_id, item.table_title,
        ...attrKeys.map((k) => {
          const c = item.cells?.[k];
          if (c == null) return "";
          if (typeof c === "object") return c.text ?? "";
          return c;
        }),
      ]);
    }
    sheets.push({ name: "EMBEDDED_COIL_GAPS", rows });
  } else if (takeoff.kind === "sequences") {
    const list = takeoff.categories?.sequences?.list || [];
    const rollup = [
      ["title", "system_tag", "status", "sheet_id", "section_count"],
      ...list.map((s) => [s.title, s.system_tag, s.status, s.sheet_id, s.section_count]),
    ];
    sheets.push({ name: "ROLLUP", rows: rollup });
    for (const seq of list) {
      const rows = [["heading", "body", "sheet_id"]];
      for (const section of seq.sections || []) {
        rows.push([section.heading, section.body, seq.sheet_id]);
      }
      const short = String(seq.title).replace(/\s+/g, " ").slice(0, 28) || `seq_${seq.id}`;
      sheets.push({ name: short, rows });
    }
  }
  if (interrogationLog) {
    const rows = [["turn", "role", "text"]];
    for (const turn of interrogationLog.turns || []) {
      rows.push([turn.turn ?? "", turn.role ?? "", turn.text ?? ""]);
    }
    if (interrogationLog.verdict) {
      rows.push(["", "verdict", JSON.stringify(interrogationLog.verdict)]);
    }
    sheets.push({ name: "INTERROGATION", rows });
  }
  return sheets;
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map((cell) => {
    const s = cell == null ? "" : String(cell);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(",")).join("\n") + "\n";
}
