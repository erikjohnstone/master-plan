/**
 * Deterministic schedule / points-list quantity takeoff compiler for corpus
 * takeoffs (T-HVAC-01, T-BAS-01). Counts unique scheduled MARKs / VALVE MARKs
 * and extractable POINTS/DDC rows — not installed drawing instances.
 *
 * Versioned: changing family rules after VALIDATING starts requires a truth
 * CHANGELOG + reset to 0/5.
 */
import { scheduleTitleMatches } from "./scheduleTitleMatch.mjs";
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

/** True when at least one row's own key starts with a real, hand-verified
 * valve/damper/actuator tag prefix — mark-SHAPE corroboration, not a title
 * string match. This is what actually distinguishes "CV-7" (a real control
 * valve mark) from "RTU-1" (a rooftop unit that merely shares the same
 * generic TAG/GPM/SIZE/MODEL header columns). */
export function hasValveOrDamperMark(table) {
  for (const row of table?.rows || []) {
    const key = String(row?.key || "").trim().toUpperCase();
    if (!key) continue;
    if (VALVE_DAMPER_TAG_PREFIXES.some((p) => key.startsWith(p.toUpperCase()))) return true;
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

/**
 * Optional building/area prefix on marks (WHSE-ET-1, AREA-AHU-1). Strip one
 * leading TOKEN- when the remainder still looks like an equipment mark so
 * family keyRe stays set-agnostic across multi-building schedules.
 */
export function markCoreForKeyRe(tag) {
  const canon = String(tag || "").toUpperCase().replace(/\s+/g, "");
  if (!canon) return canon;
  // WHSE-ET-1 → ET-1; WHSE-SH1 → SH1. Remainder must start with a ≥2-letter
  // family token so steam-trap ST-H-3 is NOT stripped to H-3 (false humidifier).
  const stripped = canon.replace(/^[A-Z]{2,8}-(?=[A-Z]{2,8}[\s\-]?\d)/, "");
  if (stripped === canon) return canon;
  // Only accept building-prefix strip when the remainder is a short equip mark
  // (ET-1, SH1, CC-15-6, S-A-1) — not catalog models (TPLFY-EP15NEM4 → EP15NEM4
  // falsely matching PUMP blankKeyRe /^EP/).
  if (/^[A-Z]{1,8}(?:-[A-Z]{1,8})*-?\d{1,4}(?:-[A-Z0-9]{1,4})?$/.test(stripped)) {
    return stripped;
  }
  return canon;
}

function markMatchesKeyRe(re, one, canon) {
  if (!re) return false;
  if (re.test(canon) || re.test(one)) return true;
  const core = markCoreForKeyRe(canon);
  // Building-prefix strip (WHSE-ET-1 → ET-1) keeps family keyRe set-agnostic.
  if (core !== canon && re.test(core)) return true;
  return false;
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

/** Infer schedule service from header blob + sample marks on untitled valve tables. */
export function inferValveServiceFromTable(table) {
  const blob = tableHeaderBlob(table);
  if (/\b(?:HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT|STEAM)\b/.test(blob)) return "HHW";
  if (/\b(?:CHW|CHILLED\s*WATER|COOLING\s*WATER)\b/.test(blob)) return "CHW";
  // Real bug, found and fixed 2026-09-02 in self-review: bare /HW/i tested
  // against a real row tag like "CHW-1" matches — "CHW-1" contains "HW" as
  // a substring — so a genuinely chilled-water valve fell through to the
  // HHW bucket, exactly backwards. Word boundaries, and the more specific
  // CHW/CW check tried first as defense in depth.
  for (const row of table?.rows || []) {
    const tag = String(row.key || cellText(row, /^(?:TAG|MARK|VALVE\s*MARK)$/i) || "").trim();
    if (/\bCHW\b|\bCW\b/i.test(tag)) return "CHW";
    if (/\bHHW\b|REHEAT|\bHW\b/i.test(tag)) return "HHW";
  }
  return "CHW";
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
  if (!m) return [s];
  const [, p1, sep1, n1, p2, sep2, n2] = m;
  const leftSep = sep1 || "-";
  const left = `${p1}${leftSep}${n1}`.replace(/\s+/g, "");
  const right = p2
    ? `${p2}${sep2 || "-"}${n2}`.replace(/\s+/g, "")
    : `${p1}${leftSep}${n2}`.replace(/\s+/g, "");
  return [left, right];
}

function uniqueFamily(graph, {
  titleRe, exclude, keyRe, blankKeyRe, blankHeaderRes, blankServiceHint,
  identityHeaderRe, titledOnly,
  // Secondary titles that need a stricter key filter than the primary titleRe
  // (e.g. SPLIT SYSTEM SYMBOL "F-1 , CU-1" → only CU-* for CONDENSING_UNIT,
  // while titled CONDENSING UNIT SCHEDULE keeps set-local B1/B2 with no keyRe).
  altTitleRe, altKeyRe,
}) {
  const keys = new Set();
  const items = [];
  // Two passes: titled family schedules first, then blank/catch-all fallbacks.
  // Same mark on a blank seismic summary and a titled ERV schedule (Colville)
  // must cite the titled device definition — blank-first walk poisoned
  // prefer-schedule sweeps.
  for (const pass of [1, 2]) {
  for (const table of graph.tables || []) {
    const title = String(table.title?.text || "");
    // Soft title match: exact regex first, then compact (no-space) form so
    // AIRHANDLINGUNITSCHEDULE still joins AIR HANDLING UNIT — set-agnostic.
    // Blank titles: still accept when keyRe/blankKeyRe can identify family marks
    // (Transbay RAH-/WFU- tables extract without a recoverable caption).
    // MISCELLANEOUS / bare EQUIPMENT / SPECIALTY EQUIPMENT / HYDRONIC
    // ACCESSORIES: same gate — only families with keyRe may claim rows.
    // titledOnly: skip blank/catch-all entirely (FIN_TUBE FTR vs filter panels).
    const titleOk = scheduleTitleMatches(title, titleRe, exclude);
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
    const catchAllSchedule = /MISCELLANEOUS(?:\s+EQUIPMENT)?\s+SCHEDULE|^(?:MECHANICAL\s+)?(?:SPECIALTY\s+)?EQUIPMENT\s+SCHEDULE$|^HYDRONIC\s+ACCESSORIES(?:\s+SCHEDULE)?$/i.test(title);
    const blankGate = blankKeyRe || keyRe;
    const keyGated = Boolean(keyRe || blankKeyRe || altKeyRe);
    const headerValveShape = (blankTitle || genericValveTitle) && isControlValveHeaderShape(table);
    if (titleOk || altOk) {
      if (pass !== 1) continue;
    } else {
      if (pass !== 2) continue;
      if (titledOnly) continue;
      const blankHeaderOk = !blankHeaderRes || headerShapeMatches(table, blankHeaderRes) || headerValveShape;
      if ((blankTitle || genericValveTitle) && blankGate) {
        if (!blankHeaderOk) continue;
        if (blankServiceHint && headerValveShape) {
          const inferred = inferValveServiceFromTable(table);
          if (blankServiceHint === "CHW" && inferred === "HHW") continue;
          if (blankServiceHint === "HHW" && inferred !== "HHW") continue;
        }
      } else if (!(catchAllSchedule && keyGated)) {
        continue;
      }
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
    const filterRe = (blankTitle || genericValveTitle) ? blankGate : catchAllSchedule ? null : titledFilter;
    const catchAllFilter = catchAllSchedule;
    for (const row of table.rows || []) {
      const rowKey = String(row.key || "").trim().replace(/^["'\s]+|["'\s]+$/g, "");
      let tag = rowKey;
      // Prefer explicit MARK / EQUIP.TAG / DESIGNATION. Do NOT prefer bare TAG —
      // Colville FAN SCHEDULE shares a TAG column with grille type codes (1S/2R)
      // while row.key correctly holds EF-1.
      const markCell = cellText(row, /^(MARK|SYMBOL|VALVE\s*MARK|UNIT\s*MARK|EQUIP(?:\.?\s*TAG)?|DESIGNATION|UNIT\s*NO|UNIT\s*TAG|ITEM\s*NO)$/i);
      if (markCell) tag = String(markCell).replace(/^["'\s]+|["'\s]+$/g, "").trim();
      // Ampersand-paired TAG ("RF-1 & 2") beats a glued row.key ("RF-12") — Northport
      // blank return-fan schedule. Still never prefer bare grille-type TAG codes.
      const tagCell = cellText(row, /^TAG$/i);
      if (
        tagCell
        && /&/.test(tagCell)
        && /^[A-Za-z]{1,8}[\s\-]?\d/i.test(tagCell.trim())
      ) {
        tag = String(tagCell).replace(/^["'\s]+|["'\s]+$/g, "").trim();
      }
      if (identityHeaderRe) {
        const ident = cellText(row, identityHeaderRe);
        if (ident) tag = String(ident).replace(/^["'\s]+|["'\s]+$/g, "").trim();
      }
      // Always expand slash compounds (CWP-1/CWP-2). Comma-split only when a
      // key filter can pick family marks (DFC-1 , DCU-1). Untagged titled
      // families keep row.key when SYMBOL is a comma list (Baker ERU-1, HP-4).
      const willFilter = Boolean(catchAllFilter || filterRe);
      let working = tag;
      if (!willFilter && /,/.test(tag) && rowKey && !/,/.test(rowKey)) {
        working = rowKey;
      }
      const tagList = String(working)
        .split(willFilter ? /[/,]/ : "/")
        .map((t) => t.trim().replace(/^["'\s]+|["'\s]+$/g, ""))
        .filter(Boolean)
        .flatMap((t) => expandAmpersandEquipMarks(t));
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
        if (catchAllFilter) {
          const okBlank = blankKeyRe && markMatchesKeyRe(blankKeyRe, one, canon);
          const okKey = keyRe && markMatchesKeyRe(keyRe, one, canon);
          if (!(okBlank || okKey)) continue;
        } else if (filterRe && !markMatchesKeyRe(filterRe, one, canon)) {
          continue;
        }
        if (keys.has(canon)) continue;
        keys.add(canon);
        const bbox = identityHeaderRe
          ? (cellBbox(row, identityHeaderRe) || cellBbox(row, /^MARK$/i) || row.identity?.bbox)
          : (cellBbox(row, /^MARK$/i) || row.identity?.bbox || cellBbox(row, /./));
        const { cells, description } = scheduleAttrs(row);
        const unitMark = cellText(row, /^UNIT\s*MARK$/i) || null;
        // Prefer UNIT MARK for building (valve marks often end in -CHW/-HHW).
        const bldg = buildingLetter(unitMark) || buildingLetter(one);
        const rowBbox = rowCellsBbox(row);
        const tableBbox = Array.isArray(table.title?.bbox) && table.title.bbox.length === 4
          ? table.title.bbox
          : (Array.isArray(table.region) && table.region.length === 4 ? table.region : null);
        items.push({
          tag: one,
          quantity: 1,
          unit: "EA",
          sheet_id: table.sheet,
          table_title: title.replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim(),
          bbox_px: bbox || null,
          // Whole schedule row for cite paints — not just the MARK cell.
          row_bbox_px: rowBbox || bbox || null,
          table_bbox_px: tableBbox,
          description: description || null,
          building: bldg,
          cells,
        });
      }
    }
  }
  } // end titled-first / blank-fallback passes
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
  },
  VAV: {
    titleRe: /VARIABLE AIR VOLUME|VOLUME CONTROL BOX|VAV\s+TERMINAL\s+BOX|AIR TERMINAL BOX|AIR\s+TERMINAL\s+UNIT|SINGLE\s+DUCT\s+AIR\s+TERMINAL|SINGLE\s+DUCT\s+CAV|CAV\s+EXHAUST\s+TERMINAL|CAV\s+TERMINAL|LAB\s+CAV|\bCAV\s+SCHEDULE/i,
    exclude: /POINTS\s*LIST|DDC\s+POINTS/i,
    // ECAV-* = lab exhaust CAV on LAB CAV schedules (SDSU); CAV/VAV/ATU/ATB/VTU indoor.
    keyRe: /^(?:VAV|ATB|VTU|ECAV|CAV|ATU)/i,
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
    altKeyRe: /^(?:CU|DCU|ACCU)[\s\-]/i,
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
  },
  HEAT_RECOVERY_CHILLER: {
    titleRe: /HEAT RECOVERY CHILLER/i,
    // Require separator after CH so blank-title CHECK:/CHP-* junk is not stolen.
    keyRe: /^(?:CH[\s\-]|HRC)/i,
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
    titleRe: /PUMP\s*SCHEDULE|PUPSCHEDULE|HYDRONIC\s+PUMPS?|(?:HEATING\s+)?(?:HOT|CHILLED)\s+WATER\s+PUMP/i,
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
    titleRe: /(?:GENERAL\s+)?(?:EXHAUST\s+|SUPPLY\s+|RETURN\s+|LAB\s+EXHAUST\s+|RELIEF\s+|LABORATORY\s+EXHAUST\s+|KITCHEN\s+EXHAUST\s+)?FAN SCHEDULE/i,
    exclude: /FAN\s*COIL|FAN\s+SOUND|AIR\s+HANDLING\s+UNIT\s+FAN|POINTS\s*LIST|FURNACE|CEILING\s+FAN/i,
    // REF-* = relief; TEF-* toilet/transfer; GX-* general exhaust (lab);
    // KEF-* kitchen exhaust (blank-title hydronic/exhaust summaries — Klamath).
    // S-A-* / R-A-* = supply/return fans on zone-lettered SUPPLY/RETURN FAN schedules
    // (NIST-style); DSF-* = duct supply fans; EG-* = general exhaust; SEF-* = stair/smoke exhaust on HVAC FAN schedules.
    keyRe: /^(?:EF|SF|RF|REF|SPF|GEF|GCF|LEF|LF|GF|TEF|GX|KEF|DSF|EG|SEF|FAN|(?:S|R)-[A-Z]-)[\s\-]?/i,
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
    altTitleRe: /ELECTRIC\s+HUMIDIFI?ER/i,
    altKeyRe: /^(?:(?:EH|HUM|SH)(?:[\s\-]+[A-Z]+)*[\s\-]*\d|H[\-])/i,
  },
  AIR_SEPARATOR: {
    // Hydraulic separators (HS-*); "AIR SEPARATORS" boards without SCHEDULE.
    titleRe: /AIR\s+SEPARATORS?(?:\s+SCHEDULE)?|HYDRAULIC\s+SEPARATOR(?:\s+SCHEDULE)?/i,
    // AS-/IAS-/HS- — digit required (not prose); optional zone letter.
    keyRe: /^(?:I?AS|HS)(?:[\s\-]+[A-Z]+)*[\s\-]*\d/i,
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
  for (const table of graph.tables) {
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
  if (/\bPOINTS\s+LIST\b/i.test(t)) return true;
  if (/\bDDC\s+POINTS\b/i.test(t)) return true;
  if (/\bI\s*\/\s*O\s+LIST\b/i.test(t)) return true;
  if (/\bIO\s+LIST\b/i.test(t)) return true;
  // Lab/VA DDC controller I/O summaries (device-point rows, not AI## MARK lists).
  if (/\bDDC\s+CONTROLLER\s+INPUT\s*\/?\s*OUTPUT\b/i.test(t)) return true;
  if (/\bCONTROLLER\s+I\s*\/?\s*O\s+(?:SUMMARY|LEGEND|LIST)\b/i.test(t)) return true;
  // MISCELLANEOUS POINTS SCHEDULE / POINTS SCHEDULE (not SOO "point list table"
  // narratives — those lack the SCHEDULE token after POINTS).
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
  return !tag || /^(TAG|MARK|SYMBOL|POINT|DESCRIPTION|NOTES?)$/i.test(tag);
}

/**
 * Schedule column headers / schema labels that sometimes leak into row.key
 * when ODL treats a header band as a data row. Not equipment marks.
 */
export function isScheduleHeaderJunkMark(canon) {
  return /^(MODEL|TAG|MARK|TYPE|SYMBOL|DESCRIPTION|REMARKS?|NOTES?|SIZE|CAPACITY|MANUFACTURER|MANUF|QTY|QUANTITY|UNITS?|SERVICE|DESIGNATION|LOCATION|AREA|FLOOR|SHEET|HEADER|MIN\.?|MAX\.?)$/i.test(
    String(canon || ""),
  );
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
    const fam = uniqueFamily(graph, spec);
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
    const tables = (graph.tables || []).filter((t) => t.sheet === key);
    const titles = tables
      .map((t) => String(t.title?.text || ""))
      .filter((t) => t && !/GENERAL NOTES|VIBRATION|SOUND POWER|PIPING CONSTRUCTION/i.test(t) && !isBasPointsListTitle(t));
    return {
      sheet_id: key,
      sheet_number: sheet.sheetNumber ?? sheet.number ?? null,
      status: titles.length === 0 ? "empty_for_hvac_equipment_schedules" : "has_hvac_equipment_schedule",
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
    exclusions: HVAC_EXCLUSIONS,
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
      const tag = String(row.key || "").trim();
      // Skip column-label rows (I/O LIST prints TAG as a data key).
      if (isBasPointsHeaderRow(tag)) continue;
      const m = tag.toUpperCase().match(/^(AI|AO|BI|BO)[\s\-]?\d/);
      if (m) {
        counts[m[1]] += 1;
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
      const tableBbox = Array.isArray(table.title?.bbox) && table.title.bbox.length === 4
        ? table.title.bbox
        : (Array.isArray(table.region) && table.region.length === 4 ? table.region : null);
      items.push({
        tag,
        quantity: 1,
        unit: "EA",
        sheet_id: table.sheet,
        table_title: title,
        bbox_px: cellBbox(row, /^MARK/i) || row.identity?.bbox || null,
        table_bbox_px: tableBbox,
        description: description || cellText(row, /DESCRIPTION/i) || null,
        cells,
        alarm: pointExtras.alarm,
        trend: pointExtras.trend,
        wiring: pointExtras.wiring,
        served_equipment: servedEquipment,
      });
    }
    // Empty after header skip → title-only schematic; disclose via exclusions, do not count.
    if (items.length === 0) continue;
    lists.push({
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
    });
  }

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
    const titles = tables
      .map((t) => {
        const raw = String(t.title?.text || "").trim();
        if (isBasPointsListTitle(raw)) return raw;
        if (isBasPointsListTable(t)) return inferBasListTitle(t);
        return "";
      })
      .filter(Boolean);
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
        provenance: "Each extractable POINTS/DDC/I/O list title-scanned; AI/AO/BI/BO from MARK prefixes when present; on I/O LIST device rows without MARK prefixes, ANALOG/DIGITAL quantity cells roll into AI/BI (direction not distinguished); printed ALARM / TREND / hardwired-vs-soft columns promoted when present (never invented); served_equipment from UNIT/EQUIPMENT/SERVED columns, I/O device keys, or POINTS LIST title unit token when printed (plan paint joins on that mark — never invented); column-label rows skipped; title-only schematic lists excluded and disclosed. Sequence-of-operations narratives are not a points source. Schedule-derived qty×points/unit estimates are labeled estimate_only and never merged into these printed totals.",
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
    exclusions: BAS_EXCLUSIONS,
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
  for (const cat of Object.values(valveCompile.categories || {})) {
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
        items: gaps.map((g) => ({
          tag: g.tag || `${g.coilLabel}@${g.sheet}`,
          sheet_id: g.sheet,
          table_title: g.source_table_title,
          quantity: 1,
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
      const rows = [["tag", "description", "qty", "unit", "building", "sheet_id", "table_title", ...attrKeys, "bbox_px"]];
      for (const item of cat.items || []) {
        rows.push([
          item.tag,
          item.description || "",
          item.quantity,
          item.unit,
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
      const rows = [["tag", "point_type", "description", "qty", "unit", "sheet_id", "table_title", ...attrKeys, "bbox_px"]];
      for (const item of list.items || []) {
        const pt = String(item.tag || "").toUpperCase().match(/^(AI|AO|BI|BO)/)?.[1] || "";
        rows.push([
          item.tag,
          pt,
          item.description || "",
          item.quantity,
          item.unit,
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
