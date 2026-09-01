/**
 * Deterministic schedule / points-list quantity takeoff compiler for corpus
 * takeoffs (T-HVAC-01, T-BAS-01). Counts unique scheduled MARKs / VALVE MARKs
 * and extractable POINTS/DDC rows — not installed drawing instances.
 *
 * Versioned: changing family rules after VALIDATING starts requires a truth
 * CHANGELOG + reset to 0/5.
 */
import { scheduleTitleMatches } from "./scheduleTitleMatch.mjs";

export const CORPUS_TAKEOFF_VERSION = 1;

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
  titleRe, exclude, keyRe, blankKeyRe, identityHeaderRe, titledOnly,
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
    const catchAllSchedule = /MISCELLANEOUS(?:\s+EQUIPMENT)?\s+SCHEDULE|^(?:MECHANICAL\s+)?(?:SPECIALTY\s+)?EQUIPMENT\s+SCHEDULE$|^HYDRONIC\s+ACCESSORIES(?:\s+SCHEDULE)?$/i.test(title);
    const blankGate = blankKeyRe || keyRe;
    const keyGated = Boolean(keyRe || blankKeyRe || altKeyRe);
    if (titleOk || altOk) {
      if (pass !== 1) continue;
    } else {
      if (pass !== 2) continue;
      if (titledOnly) continue;
      if (!(blankTitle && blankGate) && !(catchAllSchedule && keyGated)) continue;
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
    const filterRe = blankTitle ? blankGate : catchAllSchedule ? null : titledFilter;
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
  VRF_INDOOR: {
    titleRe: /VRF\s+INDOOR(?:\s+UNIT)?(?:\s+SCHEDULE)?|VARIABLE\s+REFRIGERANT\s+FLOW\s+INDOOR/i,
    exclude: /POINTS\s*LIST|DDC|OUTDOOR/i,
    keyRe: /^(?:IDU|IU|VI)[\s\-]?/i,
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
  },
  // Isolation / gate / ball / shutoff on dedicated ISOLATION VALVE or bare
  // VALVE SCHEDULE. Not CHW/HHW control valves (V-CHW / V-HHW stay on
  // CHW_CONTROL_VALVE / HHW_CONTROL_VALVE via altKeyRe).
  ISOLATION_VALVE: {
    titleRe: /ISOLATION\s+VALVE\s+SCHEDULE/i,
    altTitleRe: /^(?:\(N\)\s*)?VALVE\s+SCHEDULE\b/i,
    exclude: /CONTROL\s+VALVE|POINTS\s*LIST|DDC|PRESSURE\s+REDUC|MIXING|BYPASS|SAFETY/i,
    keyRe: /^(?:VLV|IV|ISO|GV|BV)[\s\-]/i,
    titledOnly: true,
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
    keyRe: /^(?:MX|MV)[\s\-]/i,
    titledOnly: true,
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
    exclude: /BYPASS/i,
    identityHeaderRe: /VALVE\s*MARK/i,
    // Bare "VALVE SCHEDULE" only — must NOT match "CHW CONTROL VALVE SCHEDULE"
    // or altKeyRe would replace primary matching and drop NAVFAC marks.
    altTitleRe: /^(?:\(N\)\s*)?VALVE\s+SCHEDULE\b/i,
    altKeyRe: /^V[\s\-]?CHW/i,
  },
  HHW_CONTROL_VALVE: {
    titleRe: /(?:HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT).{0,40}CONTROL\s*VALVE|CONTROL\s*VALVE.{0,40}(?:HHW|HOT\s*WATER|HEATING\s*WATER|REHEAT)/i,
    exclude: /BYPASS|CHW|CHILLED\s*WATER/i,
    identityHeaderRe: /VALVE\s*MARK/i,
    // Bare "VALVE SCHEDULE" + V-HHW* / V-HHWR* (VA ER). Start-anchored so
    // "HHW CONTROL VALVE SCHEDULE" keeps primary titleRe matching.
    altTitleRe: /^(?:\(N\)\s*)?VALVE\s+SCHEDULE\b/i,
    altKeyRe: /^V[\s\-]?HHW/i,
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
];

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
    const title = String(table.title?.text || "");
    if (!isBasPointsListTitle(title)) continue;
    const counts = { AI: 0, AO: 0, BI: 0, BO: 0, other: 0 };
    const items = [];
    for (const row of table.rows || []) {
      const tag = String(row.key || "").trim();
      // Skip column-label rows (I/O LIST prints TAG as a data key).
      if (isBasPointsHeaderRow(tag)) continue;
      const m = tag.toUpperCase().match(/^(AI|AO|BI|BO)\d/);
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
    }),
    { rows: 0, AI: 0, AO: 0, BI: 0, BO: 0 },
  );

  const pages = sheets.map((sheet) => {
    const key = sheet.key;
    const tables = (graph.tables || []).filter((t) => t.sheet === key);
    const titles = tables
      .map((t) => String(t.title?.text || ""))
      .filter((t) => isBasPointsListTitle(t));
    return {
      sheet_id: key,
      sheet_number: sheet.sheetNumber ?? sheet.number ?? null,
      status: titles.length === 0 ? "empty_for_bas_points_lists" : "has_bas_points_list",
      titles,
    };
  });

  return {
    schema_version: CORPUS_TAKEOFF_VERSION,
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    compiler: "corpusTakeoff.compileBasTakeoff",
    sheet_count: sheets.length,
    categories: {
      points_lists: {
        provenance: "Each extractable POINTS/DDC/I/O list title-scanned; AI/AO/BI/BO from MARK prefixes when present; on I/O LIST device rows without MARK prefixes, ANALOG/DIGITAL quantity cells roll into AI/BI (direction not distinguished); column-label rows skipped; title-only schematic lists excluded and disclosed.",
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
    },
    page_accounting: {
      sheet_count: sheets.length,
      pages_accounted_for: pages.length,
      empty_pages: pages.filter((p) => p.status.startsWith("empty")).length,
      pages,
    },
    exclusions: BAS_EXCLUSIONS,
  };
}

/** Control / bypass valve schedules only (subset of HVAC equipment families). */
export const CONTROL_VALVE_FAMILIES = ["CHW_CONTROL_VALVE", "HHW_CONTROL_VALVE"];

/**
 * Contractor-facing valve row fields from a schedule row's cells.
 * One Cv / size / GPM / served unit per valve — never invent dual CHW+HHW Cv
 * columns on the same line (those came from bad agent markdown merges).
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
  take(/VALVE\s*SIZE|PIPE\s*SIZE|^\s*SIZE\s*$/i, "Size");
  take(/FLOWRATE|\bFLOW\b|\bGPM\b/i, "GPM");
  // Exactly one Cv — the schedule column is "CV", not "CHW CV" / "HHW CV".
  take(/^\s*C[Vv]\s*$/i, "Cv");
  take(/CONFIGURATION|CONFIG/i, "Configuration");
  take(/^NOTES$/i, "Notes");
  if (service) {
    // Label only — never borrow the whole table region as a "Service" cite.
    out.Service = { text: service, bbox: null };
  }
  return out;
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
    if (wantService === "CHW" && !/^CHW/i.test(name)) continue;
    if (wantService === "HHW" && !/^HHW/i.test(name)) continue;
    const cat = full.categories?.[name];
    if (!cat) continue;
    const service = /^CHW/i.test(name) ? "CHW" : /^HHW/i.test(name) ? "HHW" : null;
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
      provenance: "Unique VALVE MARK rows on CHW/HHW CONTROL VALVE SCHEDULE pages; "
        + "columns = valve mark, served equipment (UNIT MARK), service, size, GPM, Cv, configuration.",
    };
  }
  const itemCount = Object.values(categories).reduce((n, c) => n + (c.items?.length || 0), 0);
  return {
    ...full,
    takeoff_id: "T-VALVE-01",
    kind: "control_valves",
    compiler: "corpusTakeoff.compileControlValveTakeoff",
    service_filter: wantService || null,
    categories,
    totals: {
      categories: Object.keys(categories).length,
      items: itemCount,
    },
    exclusions: [
      ...HVAC_EXCLUSIONS,
      "Non-control-valve HVAC equipment (AHU, FCU, VAV, pumps, …) — use kind hvac_equipment for the full equipment takeoff",
      ...(wantService ? [`${wantService === "CHW" ? "HHW" : "CHW"} CONTROL VALVE SCHEDULE (filtered out — goal asked for ${wantService} only)`] : []),
    ],
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
