// Label corroboration for symbol placements (#308): the plan already NAMES
// its labeled families — fixtures, tagged equipment, keyed devices — and a
// sweep that ignores those names leaves identity on the table in both
// directions. Measured before building, on two real sets from two offices:
//
//   A gym set (leader-line convention, color-plotted): following the black
//   leader from each P-7/P-6/P-6A label named 10 of 11 drain spots — every
//   committed match confirmed as the seed's own tag, five of six withheld
//   resolved as a DIFFERENT fixture by name, one true question left.
//
//   A mixed-use renovation (labels beside symbols, ONE pen): nearest-token
//   adjacency named all 5 real drains — and flagged two 0.97+ matches with
//   NO label anywhere near them: circles inside a backflow-preventer
//   assembly. Geometry alone was confident and wrong; the absent label
//   caught what the shape could not.
//
// This module is PURE — spans, segments, and placements in; names out — so
// the canvas Symbol tool (#264) and MCP symbol_sweep use the same decision.
// Geometry still has to clear the engine's near-match floor; inside that
// bounded set, the drawing's own tag can promote/demote a placement when it
// agrees/disagrees with the seed tag. That is stronger evidence than a brittle
// PDF path split, and weaker than accepting text alone.
import type { Point } from "./oneclick.ts";
import type { SweepMatch, SweepWithheld } from "./symbolsweep.ts";
import { isEquipTag, joinHyphenatedTags } from "./equiptags.ts";

export interface LabelSpan {
  str: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rot?: number;
  /** Structurally established equipment family. Used for split/stacked
   * control-element tags whose short prefix could otherwise also be a
   * repeatable schedule type (BP over 2, BP over 1). */
  family?: string;
  /** Actual lettering height when this token was reconstructed from several
   * source runs. Its union box may instead measure a multi-line block. */
  text_height_px?: number;
}

export interface PlacementLabel {
  /** The tag the drawing itself puts on this placement, e.g. "P-7", "FD1". */
  label: string;
  /** How the tag reached the placement: written beside it, or connected by a
   * drawn leader line. */
  via: "adjacent" | "leader";
  /** Center-to-center (adjacent) or chase-endpoint (leader) distance, px. */
  distance_px: number;
  /** Exact PDF text-run box that supplied the label. Kept on the shared pure
   * result so corpus evaluation can prove one-to-one tag attachment; current
   * UI/MCP wire formats may disclose only the compact label/via fields. */
  token_bbox?: [number, number, number, number];
  /** Family established by the source tag's layout, when stronger than the
   * token spelling alone. Internal reconciliation evidence; compact public
   * wire formats may omit it. */
  family?: string;
  /** Source lettering height retained for annotation-context comparison. */
  text_height_px?: number;
}

export interface LabelPlacementOptions {
  /** When the seed itself is labeled, prefer that exact family while
   * resolving the sweep's other already-geometric candidates. */
  preferredLabel?: string;
  /** Structural family carried by the already-resolved seed label. */
  preferredFamily?: string;
  /** Geometry confidence for each placement, aligned with `placements`.
   * Used only to choose between two spatially plausible claims; it never
   * creates an edge outside the measured adjacency/leader gates. */
  scores?: number[];
  /** Total vector-ink length of the swept fingerprint at this sheet's scale.
   * Equipment tags may sit near remote thermostats/sensors connected to the
   * equipment they name. The ink scale keeps a large equipment identity from
   * renaming a tiny point glyph reached through shared duct/control linework.
   * Omit only for callers that do not know the swept geometry. */
  symbolInkLengthPx?: number;
  /** Aligned with `placements`. A placement marked `false` is disclosed
   * geometry that is NOT a corroboration candidate — a `SweepWithheld.hold`
   * row (out-of-bounds or density-suspect: a degenerate or contaminated fit
   * that nonetheless cleared the score bar). It proposes no edge at all, so
   * it can neither win nor be stolen a text run: a high-scoring held phantom
   * can no longer beat a genuine, lower-scoring instance for the tag that
   * identifies it (docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md §2, C1, measured
   * on the real corpus — case 11's four `scale_x: 0, scale_y: 0, score: 1`
   * matches held the tags `1-VAV-4/10/12/16` that named the real
   * thermostats). Omitted, or `true`, means eligible — today's behavior. */
  eligible?: boolean[];
}

const canonicalLabel = (label: string): string => label.trim().toUpperCase().replace(/[–—−]/g, "-").replace(/\s+/g, "");

/** Glyph height is the narrow axis of a quarter-turned text run. Treating a
 * vertical word's full y extent as its lettering height inflates every
 * height-scaled adjacency/leader gate by the word length and lets a nearby
 * equipment tag claim the next component in a schematic. */
const labelSpanRotation = (span: LabelSpan): number =>
  ((Math.round((span.rot ?? 0) / 90) * 90) % 360 + 360) % 360;

const labelSpanHeight = (span: LabelSpan): number => {
  const rot = labelSpanRotation(span);
  return Math.max(rot === 90 || rot === 270 ? span.x1 - span.x0 : span.y1 - span.y0, 1);
};

/** Multi-part equipment tags conventionally end in an instance identifier:
 * VAV-E-101, VAV-E-105, etc. Those are distinct assets in one graphical
 * family. Two-part schedule/type marks such as CD-1 and RG-1 remain exact so
 * a same-shaped sibling fixture cannot change a takeoff count. */
export function canonicalLabelFamily(label: string): string {
  const tag = canonicalLabel(label);
  const parts = tag.split("-");
  if (parts.length >= 3) return parts.slice(0, -1).join("-");
  // Compact instance form used by control dampers: CD-A13, CD-A14, ...
  // The alphabetic prefix inside the second segment is the stable family;
  // a digit-led variant such as P-6A remains an exact schedule/type mark.
  if (parts.length === 2) {
    // Long equipment-class prefixes conventionally carry a unique numeric
    // instance suffix: HWP-1/HWP-2, AHU-1/AHU-2, VAV-1/VAV-2. Short marks
    // such as CD-1, RG-1, and P-6A are repeatable schedule/type identities
    // and deliberately remain exact.
    if (/^[A-Z]{3,8}$/.test(parts[0]) && /^\d{1,4}[A-Z]?$/.test(parts[1])) return parts[0];
    const compactInstance = parts[1].match(/^([A-Z]{1,4})\d{1,4}$/);
    if (compactInstance) return `${parts[0]}-${compactInstance[1]}`;
  }
  return tag;
}

/** Relay identifiers on controls wiring diagrams name distinct relay coils
 * (R1, R2, R3) drawn with one symbol convention. They are not fixture types
 * whose differing numeric suffix changes the physical glyph, so a relay
 * sweep reconciles them as one R family while still using each literal tag
 * for one-to-one attachment. Keep this narrower than the broader BAS-token
 * classifier: TS-1 versus TS-3 can denote different sensor assemblies. */
const sweepLabelFamily = (label: string): string =>
  /^R-?\d{1,3}[A-Z]?$/.test(canonicalLabel(label)) ? "R" : canonicalLabelFamily(label);

/** Some facilities prefix equipment identity with a floor/building number,
 * e.g. `1-VAV-2`. Keep this local to symbol labeling: the middle segment
 * must be a letter-only equipment class and the final segment an explicit
 * instance, which excludes duct sizes and dimensions such as `20-8-SA`. */
const isFloorPrefixedEquipmentTag = (label: string): boolean =>
  /^\d{1,3}-[A-Z]{2,8}-[A-Z0-9]{1,8}$/.test(canonicalLabel(label));

/** Point/device names printed on BAS schematics. These are repeatable control
 * identities/templates, not globally unique equipment assets, even when a
 * three-letter prefix superficially resembles AHU-1. */
const isBasControlLabel = (label: string): boolean =>
  /^(?:TS|HS|DPS|DPT|OAT|RAT|SAT|MAT|DAT|ZNT|ZNS|CO2|RH|FS|PS|SP|FZ|CV|DM)-?\d{1,3}[A-Z]?$/.test(canonicalLabel(label));

/** Full BAS integration point identifiers are commonly printed inside a
 * rounded point-callout symbol rather than beside it. This exact structure
 * is specific enough to permit an internal tag/placement relationship; the
 * general inside-glyph guard remains in force for fixture tags and prose. */
const isEmbeddedBasPointLabel = (label: string): boolean =>
  /^(?:[A-Z]{1,4}-(?:AI|AO|DI|DO)-\d{1,3}[A-Z]?|(?:AI|AO|DI|DO)-\d{1,3})$/.test(canonicalLabel(label));

/** Instrument bubbles often print the point function above an instance
 * number inside the very circle whose vector body is being swept (`TT` over
 * `4`, `PDS` over `1`, etc.). Only tokens reconstructed from a repeated,
 * tightly stacked convention carry `family`, so admitting these families
 * inside their glyph does not weaken the guard for ordinary single-run text
 * or equipment tags. */
const EMBEDDED_INSTRUMENT_FAMILIES = new Set([
  "AI", "ALM", "AO", "CO2", "CS", "DAT", "DI", "DO", "DPS", "DPT", "FS", "FT", "HS", "IT", "MAT", "MSH",
  "MT", "OAT", "PDS", "PDT", "PSH", "PSL", "PT", "RAT", "RH", "SAT", "SC",
  "SD", "SP", "SPS", "SS", "SST", "T", "TC", "TS", "TSL", "TT", "ZC", "ZNS", "ZNT", "ZS",
]);

/** These short functions are valid inside control bubbles but too ambiguous
 * as a one-off text run (`T` in particular). Repetition establishes the
 * sheet's instrument convention before they enter label assignment. */
const REPEATED_BARE_INSTRUMENT_FAMILIES = new Set(["AI", "AO", "CS", "DI", "DO", "SS", "T"]);

const isStackedInstrumentFamily = (family?: string): boolean =>
  !!family && EMBEDDED_INSTRUMENT_FAMILIES.has(canonicalLabel(family));

const isEmbeddedLabelToken = (token: LabelSpan): boolean =>
  isEmbeddedBasPointLabel(token.str)
  || isStackedInstrumentFamily(token.family);

/** Embedded point text names the glyph that encloses it. Its multi-line box
 * can be tall enough that the ordinary 2.2x adjacency radius reaches a
 * neighboring damper/actuator; an internal convention must not become an
 * outward proximity convention. */
const placementInsideEmbeddedToken = (token: LabelSpan, x: number, y: number): boolean =>
  !isEmbeddedLabelToken(token)
  || (() => {
    // The point text can sit on one side of its divided bubble while the
    // vector hypothesis lands on the divider/centerline a few pixels beyond
    // the text union. Scale that tiny ownership pad with actual lettering;
    // a fixed two-pixel gate missed a reviewed ZS-2 by 0.3 px at 144 dpi.
    const pad = Math.max(2, 0.2 * (token.text_height_px ?? labelSpanHeight(token)));
    return x >= token.x0 - pad && x <= token.x1 + pad
      && y >= token.y0 - pad && y <= token.y1 + pad;
  })();

const isEquipmentInstanceLabel = (label: string): boolean => {
  const tag = canonicalLabel(label);
  return !isBasControlLabel(tag) && (isEquipTag(tag) || isFloorPrefixedEquipmentTag(tag))
    && (tag.split("-").length >= 3 || canonicalLabelFamily(tag) !== tag);
};

/** The generic token shape fixture tags take on real sheets: 1–4 letters,
 * optional dash, one or more digits, optional variant letter — P-7, P-6A,
 * FD1, WC1, WH-1, T1. Requiring a digit matters: without it ordinary drawing
 * text such as APPR, VAV, and a lone D was observed attaching to real symbol
 * candidates on the 30-PDF HVAC corpus. A small set of established, complete
 * digitless fixture/device abbreviations is admitted separately. */
export const LABEL_TOKEN_RE = /^[A-Z]{1,4}-?\d{1,3}[A-Z]?$/;

/** Complete digitless mark tokens used as fixture/device callouts, rather
 * than generic equipment words. Keep deliberately conservative: a missed
 * label leaves geometry unchanged; a prose token attached as a label can
 * change the count. */
export const DIGITLESS_LABEL_TOKENS = new Set([
  "AD", "CO", "ED", "EG", "FCO", "FD", "FS", "OD", "RD", "RG", "SD", "TG", "TS", "VFD", "VTR", "WCO",
]);

/** A few complete device-class marks label a controller-sized body without
 * an instance suffix. They remain repeatable types, not unique equipment IDs. */
const DEVICE_CLASS_LABELS = new Set(["ASC", "VFD"]);
const isRepeatedBuildingDeviceClass = (text: string, counts: Map<string, number>): boolean =>
  /^[A-Z]-[A-Z]{2,6}$/.test(text) && (counts.get(text) ?? 0) >= 2;

/** Some air-device callouts encode `type - airflow` on one line, but the CAD
 * export splits it at the hyphen: `SS15-` + `65`. The type is the identity;
 * the trailing number is the scheduled airflow, just like the separate
 * `CD-1` / `120 CFM` convention. Recover only the conservative two-or-more
 * digit form and retain the type run's exact box so an equipment instance
 * such as `AHU1-` + `2` is not collapsed into a family. */
function inlineAirflowFamilyTokens(spans: LabelSpan[]): LabelSpan[] {
  const out: LabelSpan[] = [];
  for (const t of spans) {
    const displayed = t.str.trim().toUpperCase().replace(/[–—−]/g, "-");
    const oneRunFamily = displayed.match(/^([A-Z]{1,4}\d{1,2})-\s+\d{2,4}$/)?.[1];
    if (oneRunFamily) {
      out.push({ ...t, str: oneRunFamily });
      continue;
    }
    const raw = displayed.replace(/\s+/g, "");
    const family = raw.match(/^([A-Z]{1,4}\d{1,2})-$/)?.[1];
    if (!family) continue;
    const th = labelSpanHeight(t), tcy = (t.y0 + t.y1) / 2;
    const value = spans
      .filter((s) => {
        if ((s.rot ?? 0) !== (t.rot ?? 0) || !/^\d{2,4}$/.test(s.str.trim())) return false;
        const sh = labelSpanHeight(s), scy = (s.y0 + s.y1) / 2;
        const gap = s.x0 - t.x1;
        return Math.max(th, sh) <= 2 * Math.min(th, sh)
          && Math.abs(scy - tcy) <= 0.4 * Math.max(th, sh)
          && gap >= -0.1 * Math.max(th, sh)
          && gap <= 0.6 * Math.max(th, sh);
      })
      .sort((a, b) => a.x0 - b.x0)[0];
    if (value) out.push({ ...t, str: family });
  }
  return out;
}

/** Architectural space names that commonly sit over a room number. Their
 * two-line typography is indistinguishable from a divided equipment tag in
 * text extraction alone, but the words themselves describe spaces, not BAS
 * assets. Keep this narrow to unambiguous room uses. */
const STACKED_SPACE_PREFIXES = new Set([
  "BATH", "CLST", "CONF", "CORR", "ELEC", "EXAM", "HALL", "JAN", "LAB",
  "MECH", "OFC", "RM", "STOR", "TOIL", "UTIL", "VEST", "WAIT",
]);

/** Controls drawings commonly place an equipment/control-element prefix over
 * its instance number inside one divided hexagonal tag: `BP` over `2`, `HWP`
 * over `1`, `VFD` over `2`. PDF text extraction returns two runs and no
 * hyphen, although the tag is one visual identity. Reassemble only a tightly
 * centered, immediately stacked pair whose result is a valid equipment tag.
 * The union box is retained so downstream tests prove attachment to the
 * complete local tag block. */
function stackedEquipmentTagTokens(spans: LabelSpan[]): LabelSpan[] {
  const candidates: LabelSpan[] = [];
  for (const top of spans) {
    const prefix = top.str.trim().toUpperCase();
    if (!/^[A-Z]{1,4}$/.test(prefix) || STACKED_SPACE_PREFIXES.has(prefix) || (top.rot ?? 0) !== 0) continue;
    const th = Math.max(top.y1 - top.y0, 1);
    const tcx = (top.x0 + top.x1) / 2;
    const suffix = spans
      .filter((candidate) => {
        const raw = candidate.str.trim();
        if (!/^[A-Z]{0,2}\d{1,3}[A-Z]?$/.test(raw.toUpperCase()) || (candidate.rot ?? 0) !== 0) return false;
        const ch = Math.max(candidate.y1 - candidate.y0, 1);
        if (Math.max(th, ch) > 1.35 * Math.min(th, ch)) return false;
        const gap = candidate.y0 - top.y1;
        const ccx = (candidate.x0 + candidate.x1) / 2;
        const xGate = 0.3 * Math.max(top.x1 - top.x0, th);
        return gap >= -0.1 * Math.max(th, ch)
          && gap <= 0.8 * Math.max(th, ch)
          && Math.abs(ccx - tcx) <= xGate
          && isEquipTag(`${prefix}-${raw}`);
      })
      .sort((a, b) => a.y0 - b.y0 || Math.abs((a.x0 + a.x1) / 2 - tcx) - Math.abs((b.x0 + b.x1) / 2 - tcx))[0];
    if (!suffix) continue;
    candidates.push({
      ...top,
      str: `${prefix}-${suffix.str.trim()}`,
      x0: Math.min(top.x0, suffix.x0),
      y0: Math.min(top.y0, suffix.y0),
      x1: Math.max(top.x1, suffix.x1),
      y1: Math.max(top.y1, suffix.y1),
      family: prefix,
      text_height_px: Math.min(th, Math.max(suffix.y1 - suffix.y0, 1)),
    });
  }
  const perFamily = new Map<string, number>();
  for (const candidate of candidates) {
    const family = candidate.family!;
    perFamily.set(family, (perFamily.get(family) ?? 0) + 1);
  }
  const demonstratedFamilies = new Set(joinHyphenatedTags(spans).flatMap((span) => {
    const raw = span.str.trim().toUpperCase();
    if (/\s/.test(raw) || !isEquipTag(raw)) return [];
    const family = canonicalLabelFamily(raw);
    return family !== canonicalLabel(raw) ? [family] : [];
  }));
  // A short two-letter pair can arise accidentally in ordinary annotations
  // (the corpus caught PH above 1 beside a roof-drain assembly). Require the
  // drawing to demonstrate a stacked family twice, or independently print
  // the same family in an explicit hyphenated equipment tag. This evidence
  // rule applies to long prefixes too: room labels such as BATH over 21C have
  // exactly the same text topology as a divided VFD tag, and length alone
  // cannot establish that they name mechanical equipment.
  return candidates.filter((candidate) =>
    (perFamily.get(candidate.family!) ?? 0) >= 2
    || demonstratedFamilies.has(canonicalLabel(candidate.family!)));
}

/** Some BAS schematics draw a divided point bubble with the point number on
 * top and the I/O type below (`13` over `AI`). Reconstruct the visual point
 * identity as AI-13 and retain the complete two-cell box. Requiring at least
 * two such tightly stacked pairs on the sheet prevents a coincidental table
 * number above an abbreviation from establishing the convention. */
function stackedBasPointTagTokens(spans: LabelSpan[]): LabelSpan[] {
  const candidates: LabelSpan[] = [];
  for (const top of spans) {
    const number = top.str.trim();
    if (!/^\d{1,3}$/.test(number) || (top.rot ?? 0) !== 0) continue;
    const th = Math.max(top.y1 - top.y0, 1);
    const tcx = (top.x0 + top.x1) / 2;
    const bottom = spans
      .filter((candidate) => {
        const type = candidate.str.trim().toUpperCase();
        if (!/^(?:AI|AO|DI|DO)$/.test(type) || (candidate.rot ?? 0) !== 0) return false;
        const ch = Math.max(candidate.y1 - candidate.y0, 1);
        if (Math.max(th, ch) > 1.35 * Math.min(th, ch)) return false;
        const gap = candidate.y0 - top.y1;
        const ccx = (candidate.x0 + candidate.x1) / 2;
        return gap >= -0.15 * Math.max(th, ch)
          && gap <= 0.65 * Math.max(th, ch)
          && Math.abs(ccx - tcx) <= 0.35 * Math.max(top.x1 - top.x0, candidate.x1 - candidate.x0, th);
      })
      .sort((a, b) => a.y0 - b.y0 || Math.abs((a.x0 + a.x1) / 2 - tcx) - Math.abs((b.x0 + b.x1) / 2 - tcx))[0];
    if (!bottom) continue;
    const type = bottom.str.trim().toUpperCase();
    candidates.push({
      ...top,
      str: `${type}-${number}`,
      x0: Math.min(top.x0, bottom.x0),
      y0: Math.min(top.y0, bottom.y0),
      x1: Math.max(top.x1, bottom.x1),
      y1: Math.max(top.y1, bottom.y1),
      family: type,
      text_height_px: Math.min(th, Math.max(bottom.y1 - bottom.y0, 1)),
    });
  }
  return candidates.length >= 2 ? candidates : [];
}

export function labelTokens(spans: LabelSpan[]): LabelSpan[] {
  const joined = joinHyphenatedTags(spans);
  const exactRuns = new Map<string, number>();
  for (const span of joined) {
    const text = canonicalLabel(span.str);
    if (!/\s/.test(span.str.trim())) exactRuns.set(text, (exactRuns.get(text) ?? 0) + 1);
  }
  const isBareInstrument = (text: string): boolean =>
    EMBEDDED_INSTRUMENT_FAMILIES.has(text)
    && (!REPEATED_BARE_INSTRUMENT_FAMILIES.has(text) || (exactRuns.get(text) ?? 0) >= 2);
  const isDeviceClass = (text: string): boolean =>
    DEVICE_CLASS_LABELS.has(text) || isRepeatedBuildingDeviceClass(text, exactRuns);
  const ordinary = joined.filter((s) => {
    const t = s.str.trim().toUpperCase();
    // Mechanical note/detail bubbles commonly extract as M12, M110, etc.
    // Equipment using M is conventionally hyphenated (M-1); the bare form is
    // a sheet reference and was observed stealing nearby diffuser symbols.
    if (/^M\d{1,3}$/.test(t)) return false;
    // `isEquipTag` canonicalizes whitespace because fragmented CAD glyphs
    // are joined before this point. A whole prose run such as
    // `RUN EXH-1` must not therefore become the synthetic tag RUNEXH-1.
    // Real single-run equipment identities contain no word spaces; split
    // identities have already been compacted by joinHyphenatedTags.
    if (!/\s/.test(t) && (isEquipTag(t) || isFloorPrefixedEquipmentTag(t))) return true;
    return t.length <= 6 && (
      LABEL_TOKEN_RE.test(t)
      || DIGITLESS_LABEL_TOKENS.has(t)
      || isBareInstrument(t)
      || isDeviceClass(t)
    );
  }).map((s) => {
    const t = canonicalLabel(s.str);
    // A bare function such as DPT or DPS is the complete identity printed
    // inside an instrument bubble. Carrying its explicit family marks that
    // inside-glyph relationship as intentional; generic digitless equipment
    // words remain excluded above.
    return isBareInstrument(t) ? { ...s, family: t } : s;
  });
  const stacked = stackedEquipmentTagTokens(spans);
  const stackedPoints = stackedBasPointTagTokens(spans);
  // A divided block's component runs can themselves be token-shaped. Once
  // TT over 4 or CU over B1 establishes TT-4/CU-B1, do not also offer the
  // same physical prefix/suffix ink as a competing standalone label.
  const consumedByStackedEquipment = (token: LabelSpan): boolean => stacked.some((block) => {
    const suffix = block.str.split("-").at(-1);
    const text = token.str.trim().toUpperCase();
    const midY = (block.y0 + block.y1) / 2;
    const contained = token.x0 >= block.x0 && token.x1 <= block.x1
      && token.y0 >= block.y0 && token.y1 <= block.y1;
    return contained && (
      (text === suffix && token.y0 >= midY)
      || (text === canonicalLabel(block.family ?? "") && token.y1 <= midY)
    );
  });
  const consumedByStackedPoint = (token: LabelSpan): boolean => stackedPoints.some((block) => {
    const number = block.str.split("-").at(-1);
    const text = token.str.trim().toUpperCase();
    const midY = (block.y0 + block.y1) / 2;
    const contained = token.x0 >= block.x0 && token.x1 <= block.x1
      && token.y0 >= block.y0 && token.y1 <= block.y1;
    // BAS point blocks use the inverse vertical grammar from equipment tags:
    // point number above, I/O family below (`13` over `AI`).
    return contained && (
      (text === number && token.y1 <= midY)
      || (text === canonicalLabel(block.family ?? "") && token.y0 >= midY)
    );
  });
  const unconsumedOrdinary = ordinary.filter((token) =>
    !consumedByStackedEquipment(token) && !consumedByStackedPoint(token));
  return [...unconsumedOrdinary, ...inlineAirflowFamilyTokens(spans), ...stacked, ...stackedPoints]
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/** Adjacency radius, scaled off the token's own text height: this office's
 * lettering sets the spacing between a tag and the symbol it names. Measured:
 * true beside-the-symbol pairs sat at 1.2–1.9× the text height; the nearest
 * impostor (a same-shaped valve circle one fixture over) at 2.6×. */
export const LABEL_ADJACENT_K = 2.2;
/** Multi-part equipment instance tags are often set beside a large terminal
 * unit rather than immediately against its centroid. Ames MH101E measures
 * 4.6-4.9 text heights for four VAV-E instances; keep a separate, typed gate
 * instead of widening adjacency for short fixture and note tokens. */
export const LABEL_EQUIPMENT_ADJACENT_K = 5.5;

/** Two-line air-device callouts put the airflow value between the type tag and
 * symbol. On the corpus that moves the type token to ~3.4–3.6 text heights
 * away while it remains tightly aligned over/under the symbol. This separate
 * directional gate recovers that convention without widening the radial
 * gate that correctly rejects a neighboring fixture. */
export const LABEL_STACKED_K = 4.2;
export const LABEL_STACKED_X_K = 1.5;
/** A labeled-family sweep may inspect weaker geometry down to this floor; only
 * an exact seed-tag agreement can promote it. Everything else below the
 * engine's normal 0.75 review floor is discarded again. */
export const LABEL_CORROBORATION_SCORE_LOW = 0.45;
const LABEL_REVIEW_SCORE_LOW = 0.75;
/** Geometry confidence is expressed as an equivalent route distance while a
 * text token chooses between already-detected vector peaks. The value is
 * deliberately large enough that a strong symbol body beats a nearby glyph
 * fragment, but it never creates a spatial edge of its own. */
const LABEL_GEOMETRY_PENALTY_PX = 800;
/** A committed vector glyph may legitimately enclose its own compact tag
 * (T1/T2 diamonds are a common example). Weak candidates retain the strict
 * text-glyph exclusion so letter outlines cannot corroborate themselves. */
const LABEL_INTERNAL_GEOMETRY_MIN = 0.92;
/** A leader can terminate on one edge of a compound symbol while the best
 * transform hypothesis reports the same ink a few pixels away. Treat peaks
 * within roughly one tag height as one physical target before assigning a
 * unique equipment ID; real neighboring equipment in the corpus is much
 * farther apart. */
const EQUIPMENT_LEADER_PEAK_K = 1.4;
const EQUIPMENT_LEADER_PEAK_MIN_PX = 18;
/** An equipment-instance tag must resolve to equipment-scale linework. On the
 * stadium plan that exposed this guard, a remote thermostat fingerprint held
 * 63.6 px of ink beside a 44.4 px-tall FCU tag; the actual FCU body contains
 * orders more ink. A 2x text-height floor remains well below compact pump,
 * terminal, controller, and actuator symbols while rejecting the point-glyph
 * topology. This is a scale relationship, not a document token or coordinate. */
const EQUIPMENT_TAG_MIN_INK_LENGTH_K = 2;

/** Leader chasing arms only when the sheet draws in more than one pen: on a
 * color-plotted set the annotation pen (dark) is separable from the work
 * (#260's luminance channel), so a chase follows leaders and nothing else.
 * On a one-pen sheet the same walk would flood through walls and piping, so
 * adjacency carries the sheet alone. The share is length-weighted. */
export const LEADER_MAX_DARK_SHARE = 0.9;
export const LEADER_DARK_LUM = 60;
const LEADER_HOP_PX = 14;
/** A leader may begin just outside the union of a type + airflow callout.
 * Cherry Point MH111 measured a 14.7 px gap from that block edge to the
 * leader endpoint; 20 px admits it without loosening any later join. */
const LEADER_CALLOUT_HOP_PX = 20;
const LEADER_JOIN_PX = 3;
const LEADER_HOPS = 4;
const LEADER_HIT_PX = 30;

interface DarkIndex { segs: number[][]; cells: Map<number, number[]>; cell: number }

function buildDarkIndex(segs: number[], lum: Uint8Array): DarkIndex {
  const dark: number[][] = [];
  const n = segs.length >> 2;
  for (let i = 0; i < n; i++) {
    if (lum[i] < LEADER_DARK_LUM) dark.push([segs[i * 4], segs[i * 4 + 1], segs[i * 4 + 2], segs[i * 4 + 3]]);
  }
  const cell = LEADER_HOP_PX * 2;
  const key = (x: number, y: number): number => Math.floor(x / cell) * 73856093 ^ Math.floor(y / cell) * 19349663;
  const cells = new Map<number, number[]>();
  dark.forEach((s, i) => {
    for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]] as const) {
      const k = key(x, y);
      const a = cells.get(k);
      if (a) a.push(i); else cells.set(k, [i]);
    }
  });
  return { segs: dark, cells, cell };
}

function nearDark(idx: DarkIndex, x: number, y: number): number[] {
  const out: number[] = [];
  const cx = Math.floor(x / idx.cell), cy = Math.floor(y / idx.cell);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const a = idx.cells.get((cx + dx) * 73856093 ^ (cy + dy) * 19349663);
    if (a) for (const i of a) if (!out.includes(i)) out.push(i);
  }
  return out;
}

/** Walk touching dark segments outward from a start point, a few hops — the
 * shape of a leader: tail, maybe one bend, arrowhead. Returns every endpoint
 * reached. */
function chase(idx: DarkIndex, start: Point, firstJoin = LEADER_HOP_PX): Point[] {
  let frontier: Point[] = [start];
  const seen = new Set<string>();
  const reached: Point[] = [start];
  for (let hop = 0; hop < LEADER_HOPS; hop++) {
    const next: Point[] = [];
    const join = hop === 0 ? firstJoin : LEADER_JOIN_PX;
    for (const p of frontier) {
      for (const i of nearDark(idx, p[0], p[1])) {
        const s = idx.segs[i];
        const ends: Point[] = [[s[0], s[1]], [s[2], s[3]]];
        for (let e = 0; e < 2; e++) {
          if (Math.hypot(ends[e][0] - p[0], ends[e][1] - p[1]) > join) continue;
          const other = ends[1 - e];
          const k = `${i}:${1 - e}`;
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(other); reached.push(other);
        }
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return reached;
}

interface LabelEdge {
  placement: number;
  token: number;
  tag: string;
  via: "adjacent" | "leader";
  distance: number;
  /** Lower is stronger. Adjacency is preferred over a leader only as a
   * modest route prior; geometry and literal distance still decide between
   * competing hypotheses for the same physical symbol. */
  priority: number;
  /** Distance used for assignment; output still reports the literal distance.
   * Structured callouts penalize diagonal drift so an axis-aligned CD-1 block
   * beats a slightly nearer RG label in a crowded ceiling plan. */
  assignmentDistance?: number;
  preferred: boolean;
  geometryScore: number;
  family?: string;
}

function airflowValuesFor(t: LabelSpan, spans: LabelSpan[]): LabelSpan[] {
  const h = Math.max(labelSpanHeight(t), 8), cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2;
  const w = Math.max(t.x1 - t.x0, h);
  return spans.filter((s) => {
    const text = s.str.trim().toUpperCase();
    if (!/\d.*CFM|CFM.*\d/.test(text) || (s.rot ?? 0) !== (t.rot ?? 0)) return false;
    const sx = (s.x0 + s.x1) / 2, sy = (s.y0 + s.y1) / 2;
    const aligned = Math.abs(sx - cx) <= Math.max(w, s.x1 - s.x0);
    // The value paired to a device type is the next line below it. A broad
    // symmetric y-window admitted the previous fixture's CFM line on dense
    // plans; unioning that unrelated line into the callout then moved the
    // leader start onto the wrong symbol. Same-row values are also admitted
    // for compact `CD-1 120 CFM` callouts.
    const below = aligned && s.y0 >= t.y1 - 0.4 * h && s.y0 <= t.y1 + 2.4 * h;
    const sameRow = Math.abs(sy - cy) <= 0.4 * h && (
      (s.x0 >= t.x1 - 0.2 * h && s.x0 - t.x1 <= 1.5 * h)
      || (t.x0 >= s.x1 - 0.2 * h && t.x0 - s.x1 <= 1.5 * h)
    );
    return below || sameRow;
  });
}

function leaderStarts(t: LabelSpan): Point[] {
  const cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2;
  const rot = ((Math.round((t.rot ?? 0) / 90) * 90) % 360 + 360) % 360;
  return rot === 90 || rot === 270
    ? [[cx, t.y0 - 4], [cx, t.y1 + 4]]
    : [[t.x0 - 4, cy], [t.x1 + 4, cy]];
}

/** Equipment leaders are frequently anchored at a tag-box corner rather
 * than its side midpoint. This route is reserved for multi-part instance
 * tags and keeps the measured 20 px text pickup used by structured callouts. */
function equipmentLeaderStarts(t: LabelSpan): Point[] {
  return [
    [t.x0, t.y0], [t.x1, t.y0],
    [t.x0, t.y1], [t.x1, t.y1],
  ];
}

/** Leader starts for the complete type/value callout, not just the type
 * glyph box. Real sheets sometimes draw the leader from the combined block's
 * outer edge; looking only beside "CD-1" misses that literal connection and
 * leaves a nearby line fragment free to steal the label. */
function calloutLeaderStarts(t: LabelSpan, values: LabelSpan[]): Point[] {
  if (!values.length) return [];
  const box: LabelSpan = {
    str: t.str,
    x0: Math.min(t.x0, ...values.map((v) => v.x0)),
    y0: Math.min(t.y0, ...values.map((v) => v.y0)),
    x1: Math.max(t.x1, ...values.map((v) => v.x1)),
    y1: Math.max(t.y1, ...values.map((v) => v.y1)),
    rot: t.rot,
  };
  return leaderStarts(box);
}

const edgeCost = (e: LabelEdge): number =>
  (e.preferred ? -1_000_000 : 0) + e.priority * 2_500 + Math.round((e.assignmentDistance ?? e.distance) * 100);

/** Rank the alternative placements proposed by one physical text token.
 * Family preference is intentionally absent: every edge in this list comes
 * from that same token, so using the seed-family bonus here can make a weak
 * incidental leader beat a materially stronger adjacent geometry peak. The
 * preference still applies when different tokens compete for one placement. */
const tokenChoiceCost = (e: LabelEdge): number =>
  e.priority * 2_500 + Math.round((e.assignmentDistance ?? e.distance) * 100);

/** Stable one-to-one assignment with tags as the proposing side. Each drawn
 * token first claims its strongest local symbol; a placement keeps the
 * stronger claim and the rejected token tries its next candidate. This avoids
 * a maximum-cardinality failure seen on a dense HVAC plan, where a sheet-wide
 * optimization deliberately moved correct CD-1 tags onto weaker candidates
 * merely to give unrelated M12/RG tokens somewhere to go. */
function assignEdges(placements: Point[], tokens: LabelSpan[], edges: LabelEdge[]): (PlacementLabel | null)[] {
  const placementCount = placements.length;
  const out: (PlacementLabel | null)[] = Array.from({ length: placementCount }, () => null);
  if (!edges.length) return out;
  const tokenCount = tokens.length;
  const tokenIsEquipment = (ti: number): boolean => !!tokens[ti].family || isEquipmentInstanceLabel(tokens[ti].str);
  // The seed-family bonus is necessary for compact fixture/type marks (T1,
  // FD1) because their shared bubble/leader can reach sibling tokens. Only
  // true equipment-instance tags get the within-token geometry ranking that
  // prevents a weak incidental leader from moving the physical center.
  const proposalCost = (e: LabelEdge): number => tokenIsEquipment(e.token) ? tokenChoiceCost(e) : edgeCost(e);
  const choices = Array.from({ length: tokenCount }, () => [] as LabelEdge[]);
  for (const e of edges) {
    const prior = choices[e.token].findIndex((old) => old.placement === e.placement);
    if (prior < 0) choices[e.token].push(e);
    else if (proposalCost(e) < proposalCost(choices[e.token][prior])) choices[e.token][prior] = e;
  }
  for (let ti = 0; ti < choices.length; ti++) {
    // A strong vector candidate inside the calibrated adjacency gate is
    // better evidence than a leader chase that can enter connected ductwork.
    // Weak variants still retain leader recovery.
    const equipmentToken = tokenIsEquipment(ti);
    if (equipmentToken) {
      // Literal leaders identify the physical equipment occurrence, but an
      // eccentric/partially symmetric seed can cast several transform peaks
      // across that same symbol. Transfer the leader evidence to the strongest
      // nearby peak so a tag never makes the reported center less accurate.
      const h = Math.max(labelSpanHeight(tokens[ti]), 8);
      const samePhysicalR = Math.max(EQUIPMENT_LEADER_PEAK_MIN_PX, EQUIPMENT_LEADER_PEAK_K * h);
      const leaders = choices[ti].filter((edge) => edge.via === "leader");
      for (const leader of leaders) {
        const canonical = choices[ti]
          .filter((edge) => Math.hypot(
            placements[edge.placement][0] - placements[leader.placement][0],
            placements[edge.placement][1] - placements[leader.placement][1],
          ) <= samePhysicalR)
          .sort((a, b) => b.geometryScore - a.geometryScore || proposalCost(a) - proposalCost(b))[0];
        if (!canonical || canonical.placement === leader.placement || canonical.geometryScore <= leader.geometryScore) continue;
        const transferred: LabelEdge = {
          ...leader,
          placement: canonical.placement,
          geometryScore: canonical.geometryScore,
          assignmentDistance: leader.distance + LABEL_GEOMETRY_PENALTY_PX * (1 - canonical.geometryScore),
        };
        const prior = choices[ti].findIndex((edge) => edge.placement === transferred.placement);
        if (prior < 0) choices[ti].push(transferred);
        else if (proposalCost(transferred) < proposalCost(choices[ti][prior])) choices[ti][prior] = transferred;
      }
    }
    if (!equipmentToken && choices[ti].some((e) => e.via === "adjacent" && e.geometryScore >= LABEL_REVIEW_SCORE_LOW)) {
      choices[ti] = choices[ti].filter((e) => e.via === "adjacent");
    }
  }
  for (const a of choices) a.sort((x, y) => proposalCost(x) - proposalCost(y) || x.placement - y.placement);
  const next = new Array<number>(tokenCount).fill(0);
  const held = new Array<LabelEdge | null>(placementCount).fill(null);
  const queue = choices.map((_, i) => i).filter((i) => choices[i].length);
  while (queue.length) {
    const ti = queue.shift()!;
    const edge = choices[ti][next[ti]++];
    if (!edge) continue;
    const old = held[edge.placement];
    if (!old || edgeCost(edge) < edgeCost(old) || (edgeCost(edge) === edgeCost(old) && edge.token < old.token)) {
      held[edge.placement] = edge;
      if (old && next[old.token] < choices[old.token].length) queue.push(old.token);
    } else if (next[ti] < choices[ti].length) queue.push(ti);
  }
  held.forEach((e, p) => {
    if (e) {
      const t = tokens[e.token];
      out[p] = {
        label: e.tag,
        via: e.via,
        distance_px: Math.round(e.distance),
        token_bbox: [t.x0, t.y0, t.x1, t.y1],
        text_height_px: t.text_height_px ?? labelSpanHeight(t),
        ...(e.family ? { family: e.family } : {}),
      };
    }
  });
  return out;
}

/**
 * Resolve the drawing's own name for each placement. Adjacency first — the
 * office that writes the tag beside the symbol — then, where the sheet's pens
 * allow it, leader-following from each token's left and right edges. Every
 * result names its route and distance so a label is auditable, never oracular.
 */
export function labelPlacements(
  placements: Point[],
  spans: LabelSpan[],
  segs: number[],
  lum?: Uint8Array,
  options: LabelPlacementOptions = {},
): (PlacementLabel | null)[] {
  const tokens = labelTokens(spans);
  if (!tokens.length || !placements.length) return placements.map(() => null);

  const edges: LabelEdge[] = [];
  const airflowValues = tokens.map((t) => airflowValuesFor(t, spans));
  const airflow = airflowValues.map((v) => v.length > 0);
  const preferred = options.preferredLabel ? canonicalLabel(options.preferredLabel) : null;
  const preferredFamily = options.preferredFamily
    ? canonicalLabel(options.preferredFamily)
    : preferred ? sweepLabelFamily(preferred) : null;
  // A structural family normally denotes a stacked equipment tag. Divided
  // instrument bubbles also carry a family, but their TT-1/DPS-2-style names
  // are point functions, not unique equipment assets.
  const tokenIsEquipmentInstance = (t: LabelSpan): boolean =>
    !isStackedInstrumentFamily(t.family) && (!!t.family || isEquipmentInstanceLabel(t.str));
  const tokenUsesExtendedReach = (t: LabelSpan): boolean =>
    tokenIsEquipmentInstance(t)
    || isBasControlLabel(t.str)
    || DEVICE_CLASS_LABELS.has(canonicalLabel(t.str))
    || /^[A-Z]-[A-Z]{2,6}$/.test(canonicalLabel(t.str));
  const tokenFitsSymbolInkScale = (t: LabelSpan): boolean => {
    if (!tokenIsEquipmentInstance(t) || options.symbolInkLengthPx === undefined) return true;
    const h = Math.max(labelSpanHeight(t), 8);
    return Number.isFinite(options.symbolInkLengthPx)
      && options.symbolInkLengthPx >= EQUIPMENT_TAG_MIN_INK_LENGTH_K * h;
  };
  // A tag must choose the actual symbol peak, not a nearby fragment that
  // merely sits closer to the lettering. At 800 px of full-scale penalty,
  // the measured Cherry Point 0.90 diffuser beats a 0.47 leader/text decoy
  // even when the real callout is roughly 7.4 text heights away.
  const geometryPenalty = (p: number): number => LABEL_GEOMETRY_PENALTY_PX * (1 - Math.max(0, Math.min(1, options.scores?.[p] ?? 1)));

  // ── adjacent: nearest token within its own text-height radius ─────────────
  for (let p = 0; p < placements.length; p++) {
    if (options.eligible?.[p] === false) continue;
    const [px, py] = placements[p];
    for (let ti = 0; ti < tokens.length; ti++) {
      const t = tokens[ti];
      if (!tokenFitsSymbolInkScale(t)) continue;
      const h = Math.max(labelSpanHeight(t), 8);
      const dx = (t.x0 + t.x1) / 2 - px, dy = (t.y0 + t.y1) / 2 - py;
      const d = Math.hypot(dx, dy);
      if (!placementInsideEmbeddedToken(t, px, py)) continue;
      const glyphPad = (options.scores?.[p] ?? 1) < LABEL_REVIEW_SCORE_LOW ? h * 0.6 : 2;
      if (!isEmbeddedLabelToken(t) && (options.scores?.[p] ?? 0) < LABEL_INTERNAL_GEOMETRY_MIN
        && px >= t.x0 - glyphPad && px <= t.x1 + glyphPad
        && py >= t.y0 - glyphPad && py <= t.y1 + glyphPad) continue;
      const radial = d <= (tokenUsesExtendedReach(t) ? LABEL_EQUIPMENT_ADJACENT_K : LABEL_ADJACENT_K) * h;
      const structured = airflow[ti] && d <= LABEL_STACKED_K * h;
      const stacked = airflow[ti] && Math.abs(dx) <= LABEL_STACKED_X_K * h && Math.abs(dy) <= LABEL_STACKED_K * h;
      if (radial || structured || stacked) edges.push({
        placement: p, token: ti, tag: t.str.trim(), via: "adjacent", distance: d,
        priority: 0,
        assignmentDistance: d + geometryPenalty(p) + (airflow[ti] ? 2 * Math.min(Math.abs(dx), Math.abs(dy)) : 0),
        // Family preference disambiguates genuinely local sibling tags, but
        // must not let a far equipment label steal a weak candidate from a
        // much closer tag. Broad-radius edges therefore compete on measured
        // distance unless a structured/internal ownership convention exists.
        preferred: preferredFamily !== null
          && (t.family ? canonicalLabel(t.family) : sweepLabelFamily(t.str)) === preferredFamily
          && (d <= LABEL_ADJACENT_K * h || structured || stacked || isEmbeddedLabelToken(t)),
        geometryScore: Math.max(0, Math.min(1, options.scores?.[p] ?? 1)),
        ...(t.family ? { family: t.family } : {}),
      });
    }
  }

  // ── leader: multi-pen sheets, plus high-specificity equipment tags ────────
  if (lum && lum.length) {
    let darkLen = 0, totalLen = 0;
    const n = segs.length >> 2;
    for (let i = 0; i < n; i++) {
      const L = Math.hypot(segs[i * 4 + 2] - segs[i * 4], segs[i * 4 + 3] - segs[i * 4 + 1]);
      totalLen += L;
      if (lum[i] < LEADER_DARK_LUM) darkLen += L;
    }
    const multiPen = totalLen > 0 && darkLen / totalLen <= LEADER_MAX_DARK_SHARE;
    const equipmentInstance = (t: LabelSpan): boolean => tokenIsEquipmentInstance(t);
    // A one-pen plan cannot safely chase short generic marks through walls or
    // piping. A multi-part equipment instance tag is much more specific, and
    // may still use a literal short leader; retain the same tight 14 px pickup,
    // 3 px joins, and four-hop ceiling rather than widening spatial adjacency.
    if (multiPen || tokens.some(equipmentInstance)) {
      const idx = buildDarkIndex(segs, lum);
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti];
        if (!tokenFitsSymbolInkScale(t)) continue;
        if (!multiPen && !equipmentInstance(t)) continue;
        // A quarter-turned equipment mark is commonly printed inside an
        // inline coil, filter, or damper body. Its surrounding outline joins
        // the duct/pipe network, so a graph walk from the text would mistake
        // system linework for an annotation leader and rename the next
        // component. Local adjacency remains available; only the ambiguous
        // remote chase is withheld.
        if (equipmentInstance(t) && labelSpanRotation(t) % 180 !== 0) continue;
        const starts = [
          ...leaderStarts(t).map((point) => ({ point, firstJoin: LEADER_HOP_PX })),
          ...calloutLeaderStarts(t, airflowValues[ti]).map((point) => ({ point, firstJoin: LEADER_CALLOUT_HOP_PX })),
          ...(equipmentInstance(t) ? equipmentLeaderStarts(t).map((point) => ({ point, firstJoin: LEADER_CALLOUT_HOP_PX })) : []),
        ];
        for (const start of starts) {
          const reach = chase(idx, start.point, start.firstJoin);
          for (let p = 0; p < placements.length; p++) {
            if (options.eligible?.[p] === false) continue;
            const h = Math.max(labelSpanHeight(t), 8);
            if (!placementInsideEmbeddedToken(t, placements[p][0], placements[p][1])) continue;
            const glyphPad = (options.scores?.[p] ?? 1) < LABEL_REVIEW_SCORE_LOW ? h * 0.6 : 2;
            if (!isEmbeddedLabelToken(t) && (options.scores?.[p] ?? 0) < LABEL_INTERNAL_GEOMETRY_MIN
              && placements[p][0] >= t.x0 - glyphPad && placements[p][0] <= t.x1 + glyphPad
              && placements[p][1] >= t.y0 - glyphPad && placements[p][1] <= t.y1 + glyphPad) continue;
            const hit = reach.reduce((m, q) => Math.min(m, Math.hypot(q[0] - placements[p][0], q[1] - placements[p][1])), Infinity);
            if (hit <= LEADER_HIT_PX) edges.push({
              placement: p, token: ti, tag: t.str.trim(), via: "leader", distance: hit,
              // A literal equipment leader is stronger than the intentionally
              // wide instance-adjacency gate. Ordinary fixture tags retain
              // their adjacency-first prior.
              priority: equipmentInstance(t) ? -1 : 1,
              preferred: preferredFamily !== null && (t.family ? canonicalLabel(t.family) : sweepLabelFamily(t.str)) === preferredFamily,
              assignmentDistance: hit + geometryPenalty(p),
              geometryScore: Math.max(0, Math.min(1, options.scores?.[p] ?? 1)),
              ...(t.family ? { family: t.family } : {}),
            });
          }
        }
      }
    }
  }
  return assignEdges(placements, tokens, edges);
}

export interface ReconciledSweepLabels {
  matches: SweepMatch[];
  withheld: SweepWithheld[];
  matchLabels: (PlacementLabel | null)[];
  withheldLabels: (PlacementLabel | null)[];
  promoted: number;
  demoted: number;
}

const labelTokenHeight = (label: PlacementLabel): number | null => {
  if (label.text_height_px !== undefined) return Math.max(label.text_height_px, 1);
  const b = label.token_bbox;
  // PlacementLabel intentionally carries the exact box but not the source
  // rotation. The narrow axis is the safest fallback for callers that build
  // labels directly; production labels retain their measured source height.
  return b ? Math.max(Math.min(b[2] - b[0], b[3] - b[1]), 1) : null;
};

/** The family asserted by a resolved placement, including the structural
 * family recovered from a split/stacked source tag. */
export const placementLabelFamily = (label: PlacementLabel): string =>
  label.family ? canonicalLabel(label.family) : sweepLabelFamily(label.label);

const isEquipmentPlacementLabel = (label: PlacementLabel): boolean =>
  !isStackedInstrumentFamily(label.family) && (!!label.family || isEquipmentInstanceLabel(label.label));

/** An equipment instance may be printed more than once on one sheet: once at
 * its body and once beside a remote thermostat/sensor. The symbol seeded at
 * one of those contexts must stay with the matching annotation convention.
 * Text height is stable within one convention and sharply different between
 * them on real CAD exports. Missing boxes preserve prior behavior. */
const equipmentLabelStyleCompatible = (seed: PlacementLabel, claim: PlacementLabel): boolean => {
  if (!isEquipmentPlacementLabel(seed) || !isEquipmentPlacementLabel(claim)) return true;
  const sh = labelTokenHeight(seed), ch = labelTokenHeight(claim);
  return sh === null || ch === null || Math.max(sh, ch) <= 1.3 * Math.min(sh, ch);
};

/** Reconcile geometry with the drawing's own tag, without ever turning text
 * into a symbol detector. Only candidates already found by vector geometry
 * (score >= the engine's near-match floor) participate. Same-tag near-matches
 * are promoted; different-tag committed matches are demoted; unlabeled rows
 * keep their geometry disposition. */
export function reconcileSweepLabels(
  seedLabel: PlacementLabel | null,
  matches: SweepMatch[],
  matchLabels: (PlacementLabel | null)[],
  withheld: SweepWithheld[],
  withheldLabels: (PlacementLabel | null)[],
  options: { requireLabel?: boolean } = {},
): ReconciledSweepLabels {
  if (!seedLabel) {
    return { matches, withheld, matchLabels, withheldLabels, promoted: 0, demoted: 0 };
  }
  const seed = placementLabelFamily(seedLabel);
  const accepted: Array<{ row: SweepMatch; label: PlacementLabel | null }> = [];
  const review: Array<{ row: SweepWithheld; label: PlacementLabel | null }> = [];
  let promoted = 0, demoted = 0;
  matches.forEach((row, i) => {
    const label = matchLabels[i] ?? null;
    if (label && placementLabelFamily(label) !== seed) {
      demoted++;
      review.push({
        row: { ...row, reason: `geometry cleared the match bar, but the drawing labels this placement "${label.label}" outside the seed family "${seedLabel.label}"` },
        label,
      });
    } else if (label && !equipmentLabelStyleCompatible(seedLabel, label)) {
      demoted++;
      review.push({
        row: { ...row, reason: `the tag is in the seed family, but its text height belongs to a different equipment annotation context than the seeded ${seedLabel.label} symbol` },
        label,
      });
    } else if (!label && options.requireLabel) {
      demoted++;
      review.push({
        row: { ...row, reason: `geometry cleared the match bar, but this set-wide placement has no ${seedLabel.label}-family drawing tag to establish its identity` },
        label,
      });
    } else if (!label && (row.extra ?? 0) > 0.3) {
      demoted++;
      review.push({
        row: { ...row, reason: `geometry cleared the match bar but carries substantial extra linework and no ${seedLabel.label} tag corroborates it` },
        label,
      });
    } else accepted.push({ row, label });
  });
  withheld.forEach((row, i) => {
    const label = withheldLabels[i] ?? null;
    // A held row (out-of-bounds or density-suspect — docs/SYMBOL-SWEEP-
    // CLEAN-CORPUS-GOAL.md §2, C1) is disclosed geometry, never a
    // corroboration candidate: it is excluded from the label ASSIGNMENT
    // itself (LabelPlacementOptions.eligible), so `label` should already be
    // null here, but the promotion gate is repeated explicitly — the one
    // place a degenerate or contaminated fit could otherwise be promoted on
    // the strength of a tag it never legitimately earned.
    if (!row.hold && label && placementLabelFamily(label) === seed && equipmentLabelStyleCompatible(seedLabel, label)) {
      promoted++;
      const { reason: _reason, ...match } = row;
      accepted.push({ row: match, label });
    } else if (row.score >= LABEL_REVIEW_SCORE_LOW) review.push({ row, label });
  });

  // A compact tag printed inside a glyph can sit inside several
  // transform-equivalent peaks of that ONE physical occurrence. Assignment
  // intentionally gives the text token to only one peak; without this pass,
  // the remaining unlabeled peaks can survive as extra counts even though
  // their reported centers occupy the exact same source-text footprint.
  // This is label-topology evidence, not a broad distance merge: adjacent
  // real symbols remain independent unless their centers literally overlap
  // another candidate's claimed tag box.
  const labeledClaims = [
    ...matches.map((row, i) => ({ row, label: matchLabels[i] ?? null })),
    ...withheld.map((row, i) => ({ row, label: withheldLabels[i] ?? null })),
  ].filter((item): item is { row: SweepMatch; label: PlacementLabel } => !!item.label?.token_bbox);
  for (let i = accepted.length - 1; i >= 0; i--) {
    const item = accepted[i];
    if (item.label) continue;
    const claim = labeledClaims.find(({ row, label }) => {
      if (row === item.row || !label.token_bbox) return false;
      const [x0, y0, x1, y1] = label.token_bbox;
      return item.row.at[0] >= x0 && item.row.at[0] <= x1
        && item.row.at[1] >= y0 && item.row.at[1] <= y1;
    });
    if (!claim) continue;
    accepted.splice(i, 1);
    demoted++;
    review.push({
      row: {
        ...item.row,
        reason: `a nearby geometry peak already owns the "${claim.label.label}" tag covering this center — one tag footprint is one physical symbol occurrence, not multiple transform counts`,
      },
      label: null,
    });
  }

  // Equipment instance IDs are unique assets, unlike repeatable schedule/type
  // marks such as CD-1. A duplicated exact equipment tag can therefore
  // corroborate at most one vector placement. The seed already owns its own
  // ID; among other duplicates retain the strongest geometry in the same
  // typography context and disclose every discarded claimant for review.
  if (isEquipmentPlacementLabel(seedLabel)) {
    const seedId = canonicalLabel(seedLabel.label);
    const grouped = new Map<string, Array<{ row: SweepMatch; label: PlacementLabel }>>();
    const ungrouped: typeof accepted = [];
    for (const item of accepted) {
      if (!item.label || !isEquipmentPlacementLabel(item.label)) {
        ungrouped.push(item);
        continue;
      }
      const id = canonicalLabel(item.label.label);
      const group = grouped.get(id);
      if (group) group.push(item as { row: SweepMatch; label: PlacementLabel });
      else grouped.set(id, [item as { row: SweepMatch; label: PlacementLabel }]);
    }
    accepted.length = 0;
    accepted.push(...ungrouped);
    for (const [id, group] of grouped) {
      // Some drawings use the numeric suffix as a scheduled TYPE rather than
      // a globally unique asset number. Guaranteed Rate M1.41, for example,
      // draws eleven separate FCU-5 units and prints eleven separate FCU/5
      // tag blocks; its schedule independently says QTY 11. Three distinct
      // same-style source boxes establish that repeated-type convention on
      // the plan itself. This does not relax the one-token/one-placement
      // assignment, and a unique ID repeated once in another annotation
      // context is still rejected by the typography guard above.
      const drawnTagBoxes = new Set(group.flatMap((item) => item.label.token_bbox
        ? [item.label.token_bbox.map((value) => Math.round(value * 10) / 10).join(",")]
        : []));
      if (id === seedId && seedLabel.token_bbox) {
        drawnTagBoxes.add(seedLabel.token_bbox.map((value) => Math.round(value * 10) / 10).join(","));
      }
      if (drawnTagBoxes.size >= 3) {
        accepted.push(...group);
        continue;
      }
      group.sort((a, b) => b.row.score - a.row.score
        || Number(a.label.via === "leader") - Number(b.label.via === "leader")
        || a.label.distance_px - b.label.distance_px);
      const keep = id === seedId ? null : group[0];
      if (keep) accepted.push(keep);
      for (const item of keep ? group.slice(1) : group) {
        demoted++;
        review.push({
          row: { ...item.row, reason: id === seedId
            ? `equipment instance ${item.label.label} is the seeded asset and cannot be counted again from a repeated tag`
            : `equipment instance ${item.label.label} has multiple geometric claimants; one unique asset ID can own only the strongest physical placement` },
          label: item.label,
        });
      }
    }
  }
  const order = (a: { row: SweepMatch }, b: { row: SweepMatch }): number =>
    a.row.at[1] - b.row.at[1] || a.row.at[0] - b.row.at[0] || a.row.rotation - b.row.rotation || Number(a.row.mirrored) - Number(b.row.mirrored);
  accepted.sort(order); review.sort(order);
  return {
    matches: accepted.map((x) => x.row),
    withheld: review.map((x) => x.row),
    matchLabels: accepted.map((x) => x.label),
    withheldLabels: review.map((x) => x.label),
    promoted,
    demoted,
  };
}

export interface PositionedSweepMatches {
  matches: SweepMatch[];
  withheld: SweepWithheld[];
  withheldLabels: (PlacementLabel | null)[];
}

/** docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md Phase F — a `hold: "density"` row
 * is, by construction, never degenerate (only `hold: "bounds"` rows are);
 * when one scores higher than an ALREADY-labeled, already-counted match
 * within the seed's own shadow-suppression radius, it is very likely a more
 * precisely-located reading of the SAME physical instance the tag already,
 * correctly, identified — the committed match's own coordinate was just
 * imprecise. This corrects ONLY the reported position/score/transform of an
 * already-decided match; it never touches which match owns which label, nor
 * whether anything is promoted or demoted, so it cannot reopen case `11`'s
 * own regression (Phase B) the way transferring the TAG itself did.
 *
 * A placement's own corroborating tag/leader box (`token_bbox`) is real,
 * drawn evidence of where its physical instance actually sits — the SAME
 * signal the ground-truth reviewers used by hand to disambiguate a tight
 * cluster of near-identical readings ("own literal equipment leaders attach
 * to the same [equipment] family", case `17`'s own review notes). Used only
 * to pick among candidates that already cleared every other gate below;
 * never on its own.
 *
 * Factored out of mcp/src/session.ts (where this shipped first, as an
 * MCP-agent-only fix) specifically so every caller of `reconcileSweepLabels`
 * — the MCP tool paths AND TakeoffCanvas.jsx's own manual Symbol-tool
 * marquee — applies the SAME correction. A fix that lives only in one
 * caller is not a fix for the product; a real human dragging the marquee
 * must see exactly what an agent calling `symbol_sweep` sees. */
export function positionMatchesToClosestReading(
  matches: SweepMatch[],
  matchLabels: (PlacementLabel | null)[],
  withheld: SweepWithheld[],
  withheldLabels: (PlacementLabel | null)[],
  footprint: number,
): PositionedSweepMatches {
  const mergeR = footprint / 2;
  const anchorDist = (at: Point, label: PlacementLabel | null | undefined): number | null => {
    if (!label?.token_bbox) return null;
    const [x0, y0, x1, y1] = label.token_bbox;
    const nx = Math.min(Math.max(at[0], x0), x1);
    const ny = Math.min(Math.max(at[1], y0), y1);
    return Math.hypot(at[0] - nx, at[1] - ny);
  };
  const usedWithheld = new Set<number>();
  const positionedMatches = matches.map((m, mi) => {
    const lbl = matchLabels[mi];
    const usable: { w: SweepWithheld; i: number }[] = [];
    for (let i = 0; i < withheld.length; i++) {
      const w = withheld[i];
      if (usedWithheld.has(i) || w.hold !== "density" || w.score <= m.score) continue;
      if (Math.hypot(w.at[0] - m.at[0], w.at[1] - m.at[1]) > mergeR) continue;
      usable.push({ w, i });
    }
    if (!usable.length) return m;
    // §3 Phase D/F Findings: several candidates around one busy real
    // location can score nearly identically (a phantom scoring 1.0, 18px
    // from the true reading at 0.992) — score alone cannot break that tie.
    // When this match's own tag gives an anchor, prefer whichever candidate
    // sits closest to it; otherwise keep the original highest-score rule
    // unchanged (every case with zero or one usable candidate here behaves
    // exactly as before).
    let chosen = usable[0];
    if (lbl?.token_bbox) {
      let bestD = anchorDist(chosen.w.at, lbl)!;
      for (const cand of usable.slice(1)) {
        const d = anchorDist(cand.w.at, lbl)!;
        if (d < bestD) { chosen = cand; bestD = d; }
      }
    } else {
      for (const cand of usable.slice(1)) if (cand.w.score > chosen.w.score) chosen = cand;
    }
    usedWithheld.add(chosen.i);
    const bestW = chosen.w;
    return { ...m, at: bestW.at, score: bestW.score, rotation: bestW.rotation, mirrored: bestW.mirrored, ...(bestW.transform ? { transform: bestW.transform } : { transform: undefined }) };
  });
  const positionedWithheld = withheld.filter((_, i) => !usedWithheld.has(i));
  const positionedWithheldLabels = withheldLabels.filter((_, i) => !usedWithheld.has(i));
  return { matches: positionedMatches, withheld: positionedWithheld, withheldLabels: positionedWithheldLabels };
}
