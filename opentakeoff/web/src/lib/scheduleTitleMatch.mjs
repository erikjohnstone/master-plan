/**
 * Set-agnostic schedule title matching.
 *
 * Drawing offices omit spaces (`AIRHANDLINGUNITSCHEDULE`), add parentheticals,
 * or use sibling phrasings. Exact regexes that assume NAVFAC spacing miss
 * those titles. Compact-form matching keeps sibling exclusions intact.
 */

/** Uppercase + collapse whitespace. */
export function spacedScheduleTitle(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Alphanumeric-only form (drops spaces/punct). */
export function compactScheduleTitle(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * RegExp that matches the same pattern with spaces optional — so
 * /AIR HANDLING UNIT/i hits both "AIR HANDLING UNIT SCHEDULE" and
 * "AIRHANDLINGUNITSCHEDULE".
 * @param {RegExp} re
 */
export function compactScheduleTitleRe(re) {
  const flags = re.flags.includes("i") ? re.flags : `${re.flags}i`;
  // Drop spacing and light punctuation so /GRILLE,\s*REGISTER/ still hits
  // "GRILLE,REGISTERANDDIFFUSERSCHEDULE" after alphanumeric compaction.
  const src = re.source
    .replace(/\\s[\*\+]?/g, "")
    .replace(/ /g, "")
    .replace(/\\[,.\-_/]/g, "")
    .replace(/[,.\-_/]/g, "");
  return new RegExp(src, flags);
}

/**
 * True when a drawing schedule title matches a family needle.
 * Exact / spaced regex wins first; compact form is the soft fallback.
 * @param {string} rawTitle
 * @param {RegExp} titleRe
 * @param {RegExp} [exclude]
 */
export function scheduleTitleMatches(rawTitle, titleRe, exclude) {
  if (!titleRe) return false;
  const raw = String(rawTitle || "");
  const spaced = spacedScheduleTitle(raw);
  const compact = compactScheduleTitle(raw);
  if (exclude) {
    if (exclude.test(raw) || exclude.test(spaced) || exclude.test(compact)) return false;
  }
  if (titleRe.test(raw) || titleRe.test(spaced)) return true;
  try {
    const cre = compactScheduleTitleRe(titleRe);
    if (cre.test(compact) || cre.test(spaced) || cre.test(raw)) return true;
  } catch {
    /* malformed compactification — fall through */
  }
  return false;
}

/**
 * Index of `needle` in `haystack` starting at a token boundary (start of string
 * or after a non-alphanumeric). Rejects mid-token hits like DEHUMIDIFIER⊃HUMIDIFIER.
 * @param {string} haystack already uppercased
 * @param {string} needle already uppercased
 * @returns {number} index or -1
 */
function indexAtTokenBoundary(haystack, needle) {
  if (!needle) return 0;
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return -1;
    if (idx === 0 || !/[A-Z0-9]/.test(haystack[idx - 1])) return idx;
    from = idx + 1;
  }
  return -1;
}

/** Leading adjectives that still mean the same schedule family (ELECTRIC HUMIDIFIER). */
const QUERY_SOFT_PREFIX_RE =
  /^(?:ELECTRIC|HYDRONIC|GAS(?:[\s\-]*FIRED)?|LAB(?:ORATORY)?|GENERAL|PACKAGED|DEDICATED|OUTDOOR|INDOOR|HOT\s+WATER|CHILLED\s+WATER|SUPPLY|RETURN|EXHAUST)(?:\s+(?:ELECTRIC|HYDRONIC|GAS(?:[\s\-]*FIRED)?|LAB(?:ORATORY)?|GENERAL|PACKAGED|DEDICATED|OUTDOOR|INDOOR|HOT\s+WATER|CHILLED\s+WATER|SUPPLY|RETURN|EXHAUST))?$/i;

/**
 * Soft includes: token-boundary match, and if the needle is not title-leading,
 * the prefix must be a known adjective — not a different equipment noun
 * (CABINET UNIT HEATER ⊄ UNIT HEATER; DEHUMIDIFIER ⊄ HUMIDIFIER).
 */
function softNeedleIncludes(haystack, needle) {
  const idx = indexAtTokenBoundary(haystack, needle);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const prefix = haystack.slice(0, idx).trim();
  return QUERY_SOFT_PREFIX_RE.test(prefix);
}

/**
 * Soft title needle for query_table: exact / prefix / includes on spaced form,
 * then compact includes when the needle is long enough (≥8 compact chars).
 * Never soft-matches very short needles (avoids "FAN" → "FAN COIL").
 * Token-boundary + adjective-prefix rules avoid DEHUMIDIFIER / CABINET UNIT HEATER
 * false hits while keeping ELECTRIC HUMIDIFIER and no-space titles.
 * @param {string} rawTitle
 * @param {string} needle  already trimmed; may be empty
 * @returns {boolean}
 */
export function queryTitleMatchesNeedle(rawTitle, needle) {
  if (!needle) return true;
  const titleNeedle = spacedScheduleTitle(needle);
  const spaced = spacedScheduleTitle(rawTitle);
  const base = spaced.replace(/\s+\d+\s+OF\s+\d+\s*$/i, "").trim();
  if (base === titleNeedle || spaced === titleNeedle) return true;
  if (titleNeedle.length < 12) {
    // Short needles: exact / prefix only on spaced form (legacy query_table).
    return base.startsWith(`${titleNeedle} `) || spaced.startsWith(`${titleNeedle} `);
  }
  if (base.startsWith(`${titleNeedle} `) || spaced.startsWith(`${titleNeedle} `)) return true;
  if (softNeedleIncludes(spaced, titleNeedle) || softNeedleIncludes(base, titleNeedle)) {
    return true;
  }
  const compactNeedle = compactScheduleTitle(titleNeedle);
  const compactTitle = compactScheduleTitle(rawTitle);
  // Compact soft match only when the needle is title-leading (idx 0) — no-space
  // AIRHANDLINGUNITSCHEDULE — not mid-token DEHUMIDIFIER / CABINETUNITHEATER.
  if (compactNeedle.length >= 8 && indexAtTokenBoundary(compactTitle, compactNeedle) === 0) {
    return true;
  }
  return false;
}
