// Size-label grammar — Stage 3's sibling to the geometry pipeline (WP3.5,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan Appendix A / §3.1).
// Pure: no React, no DOM, no pdf.js. Parses a normalized PDF text span into
// a `RunSize` (WP1's own type, `types.ts`) plus whatever system/direction
// context rides along, or refuses — refusal over guessing, the same
// doctrine `layers.ts`/`mepsystems.ts` both state explicitly: a wrong
// "MAX" read as a duct size corrupts a real bid.
//
// One deliberate, documented extension beyond Appendix A's own LITERAL
// regex text: the plan's own §3.1 table cites `14x3½` as a real label the
// grammar must parse (Bessemer M101's own callout), but Appendix A's RECT
// pattern's dimension groups (`\d{1,3}(?:\.\d+)?`) have no fraction syntax
// at all — only PIPE's own grammar spells out a fraction sub-pattern. This
// is a genuine gap between the plan's illustrative example and its own
// precise grammar, not a typo to route around silently: `resolveFractions`
// below (a preprocessing pass, not a change to RECT/ROUND/PIPE's own
// structural patterns) resolves EVERY embedded whole+fraction span
// (`3½` → `3.5`, `1-1/4` → `1.25`, `¾` alone → `0.75`) to a decimal BEFORE
// the three structural patterns ever run, so `14x3½` reaches RECT as
// `14x3.5` and parses the same way `14x3.5` always would have. PIPE's own
// literal fraction sub-pattern becomes redundant once this preprocessing
// runs first, but is examined and rejected here in favor of the ONE
// consistent decimal-first pipeline used for get RECT/ROUND/PIPE alike.
//
// The second half of this file is plan §6.6's "label association": once a
// span parses to a size, decide which nearby run segment it binds to.
// `associateLabel` scores orientation (label rot parallel to the segment,
// ±10°) and placement (beside the run beats a leader line to it), per the
// plan's own tie-break order. `resolveSizeConflicts` is the OTHER half of
// "uniqueness" — two labels landing on the same segment with different
// parsed sizes is a conflict, withheld with both, never silently picked.
//
// One honest, undone gap, not guessed around: "size carried along the run
// until the next label / branch / transition vertex" (plan §6.6) needs to
// know, for each hop of a walked run, whether a branch/transition sits at
// its far end — but `walk.ts`'s own `WalkVertex[]` is sparse (only
// elbow/tee/crossing hops get an entry; collinear hops don't), so it has no
// hop-indexed shape to carry a size across yet. Building that mapping here
// would mean guessing a shape WP3.6 (`receipt.ts`, which needs its own
// `segs`/`stops` receipt fields per the goal doc) might have to redesign
// anyway — deferred to that checkpoint, the same posture `walk.ts`'s own
// header takes with its two undone gaps (equipment/riser detection, curve
// chains not yet collapsed to arc vertices).
import type { RunSize } from "./types.ts";
import { nearestSegment, segmentsInBox, type SegmentIndex } from "./index.ts";

/** Plan Appendix A's own pre-normalisation rules, applied in order:
 *  strip a leading AutoCAD MTEXT alignment code, `× → x`, `Ø ⌀ %%c → ø`,
 *  `″ ” → "`, insert a space after a size's own closing quote when the
 *  extractor ran it straight into the following system letters, Unicode
 *  fractions → `N/D` text, collapse whitespace, uppercase (system tokens
 *  are always upper — a lowercase size digit has no case to preserve
 *  either way). */
export function normalizeLabelText(raw: string): string {
  let s = String(raw ?? "");
  // A real corpus label (`\A1;5"CHWR`, Contra Costa College Chiller
  // Replacement M1.0/M3.1) came through pdf.js's own text extraction still
  // carrying its own AutoCAD MTEXT alignment code (`\A0;`/`\A1;`/`\A2;` —
  // bottom/center/top alignment, the three real values AutoCAD emits) —
  // the CAD-to-PDF export flattened the MTEXT run's own formatting into
  // plain text without stripping the code itself. Stripped here, first,
  // before anything else ever sees the string; every other real label on
  // the same sheet extracted clean (no code), confirming this is a
  // per-run leftover, not something every span on an affected sheet
  // carries.
  s = s.replace(/^\\A\d;/, "");
  s = s.replace(/×/g, "x");
  s = s.replace(/[″”]/g, '"');
  // A real corpus label (`2"CHWS&R`, Orange County Regional History Center
  // M-102) came through pdf.js's own text extraction with NO space between
  // the inch mark and the system token at all — tight CAD kerning collapsed
  // to zero gap, not a typo in the source drawing. PIPE_RE's own trailing
  // system group requires `\s+` there by design (plan Appendix A's literal
  // grammar), so without this the whole match fails, not just the system
  // tag. Inserted here, before that requirement is ever checked, rather
  // than loosened to `\s*` in the regex itself — this keeps the grammar's
  // own stated shape intact and fixes the one real, narrow extraction
  // artifact instead of quietly accepting a run-together token everywhere.
  s = s.replace(/"(?=[A-Za-z])/g, '" ');
  s = s
    .replace(/½/g, "1/2").replace(/¼/g, "1/4").replace(/¾/g, "3/4")
    .replace(/⅛/g, "1/8").replace(/⅜/g, "3/8").replace(/⅝/g, "5/8").replace(/⅞/g, "7/8");
  s = s.replace(/\s+/g, " ").trim();
  s = s.toUpperCase();
  // AFTER uppercasing (so a pre-uppercased "Ø"/"%%C" still matches): the ø
  // marker itself stays lowercase, matching RECT/ROUND's own pattern text.
  return s.replace(/[Ø⌀]/g, "ø").replace(/%%C/g, "ø");
}

/** Resolves every embedded `[whole][ -]?num/den` span to its decimal value
 *  — see this file's header. Relies on ordinary regex backtracking to
 *  split a run like `31/2` (no separator at all) into whole `3` + fraction
 *  `1/2`, exactly the way Appendix A's own PIPE sub-pattern already
 *  anticipates a fraction can follow a whole number with no space. */
function resolveFractions(s: string): string {
  return s.replace(/(\d{1,3})?[ -]?(\d)\/(\d{1,2})/g, (_m, whole, num, den) => {
    const w = whole ? Number(whole) : 0;
    const v = w + Number(num) / Number(den);
    return String(Math.round(v * 1000) / 1000);
  });
}

const ELEV_RE = /\b(BOD|BOP|TOD|TOP|COD|COP|CL|IE|INV|FFL|AFF|EL|ELEV)\b|^\d+'-\d+|\b(MIN|MAX|O\.?C\.?|TYP|ABOVE|BELOW)\b/;

// Longest-first so a shared prefix (CW/CWS/CWR, HW/HWS/HWR/HWC) never
// needs the regex engine to backtrack past a wrong shorter alternative.
const SYS_ALT = "HHWS|HHWR|CHWS|CHWR|EHWS|EHWR|HWS|HWR|HWC|CWS|CWR|SAN|GEX|HPS|MPS|LPS|GLS|GLR|CW|HW|SA|RA|EA|OA|MA|TA|RL|RS|RD|CD|PC|NG|ST|G|V|W";
const DIR_ALT = "UP|DN|DOWN|UP/DN|VTR";

const RECT_RE = new RegExp(`^(\\d{1,3}(?:\\.\\d+)?)"?\\s*X\\s*(\\d{1,3}(?:\\.\\d+)?)"?(?:\\s*(FO|F\\.O\\.|FLAT OVAL))?(?:\\s+(${SYS_ALT}))?(?:\\s+(${DIR_ALT}))?$`);
const ROUND_RE = new RegExp(`^(?:ø\\s*)?(\\d{1,3}(?:\\.\\d+)?)"?\\s*(?:ø|DIA\\.?|DIAM|RD|ROUND)(?:\\s+(${SYS_ALT}))?(?:\\s+(${DIR_ALT}))?$`);
// The trailing system group needs its OWN non-capturing wrapper around
// SYS_ALT before the "/[A-Z]{1,5}" suffix: `|` has the lowest precedence of
// any regex operator, so `A|B|C(?:\/X)?` binds that suffix only to the last
// alternative C, not to the whole A|B|C group — a real bug caught by this
// file's own test suite (`2" CWS/R"`, `¾" HW/CW UP` both failed to parse
// until this wrapper was added).
//
// `[/&]` rather than a bare `/`: a real corpus label (`2" CHWS&R`, Orange
// County Regional History Center M-102/M-103, GATE 3 corpus-hunting pass)
// uses `&` for the identical "one drawn line, two co-located systems"
// convention `/` already covers (`CWS/R` → `systems:["CWS","R"]`) — same
// second-token shorthand (`R` alone, not a standalone code), just a
// different real-world separator glyph. `splitSystems` below widened the
// same way so both separators land in the same two-entry `systems[]` shape.
// `\s*` around the separator, not bare `[/&]`: the SAME Contra Costa sheet
// that motivated the `\A1;` strip above also has this exact convention
// written with spaces (`5" CHWS & R`), not run together — a real drafter's
// choice, not a different grammar, so both spacings resolve identically.
const PIPE_RE = new RegExp(`^(?:(${SYS_ALT})\\s+)?(\\d{1,2}(?:\\.\\d+)?)?"(?:\\s+((?:${SYS_ALT})(?:\\s*[/&]\\s*[A-Z]{1,5})?))?(?:\\s+(${DIR_ALT}))?(?:\\s+(TO|FROM)\\b.*)?$`);
const PIPE_DN_RE = /^(?:DN|NPS)\s*(\d{2,4})$/;
const PIPE_MM_RE = /^(\d{2,4})\s*MM$/;

export type DuctDirection = "up" | "down" | "both" | "vtr";

export interface ParsedSize {
  size: RunSize;
  /** system tag(s) riding in the same span — 0, 1 (a single system), or 2
   *  (multi-service, e.g. `HW/CW`: plan's own "one size and a systems[] of
   *  two, the run flagged shared_geometry"). */
  systems: string[];
  direction?: DuctDirection;
  /** the exact text this parsed from, post-normalization — the audit trail. */
  raw: string;
}

function dirOf(tok: string | undefined): DuctDirection | undefined {
  if (!tok) return undefined;
  if (tok === "VTR") return "vtr";
  if (tok === "UP/DN") return "both";
  if (tok === "UP") return "up";
  return "down";   // DN, DOWN both read as "down" — types.ts's own vertex_overrides dir vocabulary ("up"|"down"|"both") is the model reused here
}

function splitSystems(tok: string | undefined): string[] {
  if (!tok) return [];
  // PIPE_RE's own separator group tolerates surrounding spaces (`CHWS & R`,
  // not just `CHWS&R`) — trim each side so a spaced form never leaks stray
  // whitespace into a systems[] entry.
  return tok.split(/[/&]/).map((t) => t.trim()).filter(Boolean);
}

/** Plan Appendix A / §3.1: parse one normalized label into a `RunSize`, or
 *  `null` when it is not a size at all (a dimension string, an elevation
 *  callout, a keyed note with no embedded size, or simply unrecognized
 *  text) — refusal over guessing. Callers pass RAW text; this normalizes
 *  and resolves fractions itself, so a caller never needs its own
 *  preprocessing step. */
export function parseSize(rawText: string): ParsedSize | null {
  const normalized = normalizeLabelText(rawText);
  if (!normalized) return null;
  const resolved = resolveFractions(normalized);
  if (ELEV_RE.test(resolved)) return null;

  const rect = RECT_RE.exec(resolved);
  if (rect) {
    const a = Number(rect[1]), b = Number(rect[2]);
    if (!(a > 0) || !(b > 0)) return null;
    const flatOval = !!rect[3];
    const size: RunSize = flatOval ? { kind: "oval", major_in: Math.max(a, b), minor_in: Math.min(a, b) } : { kind: "rect", w_in: a, h_in: b };
    return { size, systems: splitSystems(rect[4]), direction: dirOf(rect[5]), raw: resolved };
  }

  const round = ROUND_RE.exec(resolved);
  if (round) {
    const d = Number(round[1]);
    if (!(d > 0)) return null;
    return { size: { kind: "round", d_in: d }, systems: splitSystems(round[2]), direction: dirOf(round[3]), raw: resolved };
  }

  const dn = PIPE_DN_RE.exec(resolved);
  if (dn) {
    const mm = Number(dn[1]);
    if (!(mm > 0)) return null;
    return { size: { kind: "pipe", nps_in: Math.round((mm / 25.4) * 100) / 100 }, systems: [], raw: resolved };
  }
  const mmMatch = PIPE_MM_RE.exec(resolved);
  if (mmMatch) {
    const mm = Number(mmMatch[1]);
    if (!(mm > 0)) return null;
    return { size: { kind: "pipe", nps_in: Math.round((mm / 25.4) * 100) / 100 }, systems: [], raw: resolved };
  }

  const pipe = PIPE_RE.exec(resolved);
  if (pipe) {
    const nps = pipe[2] != null ? Number(pipe[2]) : NaN;
    if (!(nps > 0)) return null;   // a bare `"` with no number at all is never a size
    const leadingSys = pipe[1] ? [pipe[1]] : [];
    const trailingSys = splitSystems(pipe[3]);
    return { size: { kind: "pipe", nps_in: nps }, systems: leadingSys.length ? leadingSys : trailingSys, direction: dirOf(pipe[4]), raw: resolved };
  }

  return null;
}

// ── Label association (plan §6.6) ──────────────────────────────────────────

/** The label-scoring subset of `symbollabels.ts`'s own `LabelSpan` — kept
 *  independent so this pure grammar module never needs that file's much
 *  larger equipment-tag machinery for a single size label. */
export interface SizeLabelSpan {
  text: string;
  x0: number; y0: number; x1: number; y1: number;
  rotDeg?: number;
  textHeightPx?: number;
}

export type SizePlacement = "beside" | "leader" | "on-run";

export interface BoundSize {
  parsed: ParsedSize;
  seg: number;
  placement: SizePlacement;
  confidence: number;
  factors: { orientation: number; placement: number };
}

const ORIENTATION_TOL_DEG = 10;
const BESIDE_CONFIDENCE = 0.9;
const ON_RUN_CONFIDENCE = 0.6;   // below LEADER_CONFIDENCE — see associateOnRunFallback's own header
const LEADER_CONFIDENCE = 0.75;

function labelHeightPx(label: SizeLabelSpan): number {
  // No textHeightPx supplied: fall back to the SHORTER of the bbox's two
  // dimensions, not the longer one — a text run's bbox is (almost) always
  // wider than it is tall along its own baseline (mcp/src/pdf.ts's own
  // TextSpan is exactly this: a rotation-aware hull, tall-narrow at rot 90/
  // 270, wide-short at 0/180), so the MINIMUM dimension is font height
  // regardless of rotation, while the MAXIMUM is the string's own length —
  // using the max here would inflate the association window by the label's
  // character count instead of its actual lettering size.
  return label.textHeightPx ?? Math.max(Math.min(Math.abs(label.y1 - label.y0), Math.abs(label.x1 - label.x0)), 1);
}

/** Plan §6.6's own association window: "max(6 × text height, 4 ft × ppf)." */
export function associationWindowPx(label: SizeLabelSpan, ppf: number): number {
  return Math.max(6 * labelHeightPx(label), 4 * ppf);
}

function angleOfSegDeg(x1: number, y1: number, x2: number, y2: number): number {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

/** A text baseline and a duct run are both undirected LINES for this
 *  purpose (rot=0 and rot=180 read the same line) — fold the difference
 *  into [0,90], not graph.ts/walk.ts's own [0,180] segment-vs-segment fold. */
function lineAngleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

/** `null` when the label is past the ±10° tolerance (not a candidate at
 *  all); otherwise 1.0 at perfect alignment, floored to 0.7 at the edge. */
function orientationFactor(label: SizeLabelSpan, segAngleDeg: number): number | null {
  const dev = lineAngleDiffDeg(label.rotDeg ?? 0, segAngleDeg);
  if (dev > ORIENTATION_TOL_DEG) return null;
  return 1 - (dev / ORIENTATION_TOL_DEG) * 0.3;
}

/** geometry.js's own `distToSeg` formula (index.ts's `projectToSeg`
 *  duplicated here, distance only — this codebase's own convention for
 *  small geometric primitives, per walk.ts's identical `angleDiff` copy). */
function distPointToSeg(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Binds one already-legible label to the single best nearby run segment —
 *  plan §6.6's own tie-break order (beside beats leader; "inside" a
 *  double-line duct pair is WP4 scope, not buildable against this single-
 *  line Stage 3 engine, and width agreement needs that same pair). Returns
 *  `null` when the text isn't a size at all, or no candidate within the
 *  window survives the orientation gate.
 *
 *  Callers resolve the leader terminal points themselves — via
 *  `symbollabels.ts`'s own `leaderTerminalPointsForLabel`, which needs the
 *  full sheet's `spans`/`lum` this pure module has no other reason to
 *  import — and pass them in as `opts.leaderPoints`. */
export function associateLabel(
  index: SegmentIndex, label: SizeLabelSpan, ppf: number,
  opts: { leaderPoints?: [number, number][] } = {},
): BoundSize | null {
  const parsed = parseSize(label.text);
  if (!parsed) return null;

  const cx = (label.x0 + label.x1) / 2, cy = (label.y0 + label.y1) / 2;
  const windowPx = associationWindowPx(label, ppf);
  const besideMaxPerpPx = 2 * labelHeightPx(label);

  let best: { seg: number; placement: SizePlacement; orientation: number; placementFactor: number; total: number } | null = null;
  const consider = (seg: number, orientation: number, placement: SizePlacement, placementFactor: number) => {
    const total = Math.min(orientation, placementFactor);
    if (!best || total > best.total) best = { seg, placement, orientation, placementFactor, total };
  };

  for (const seg of segmentsInBox(index, cx - windowPx, cy - windowPx, cx + windowPx, cy + windowPx)) {
    const x1 = index.segs[seg * 4], y1 = index.segs[seg * 4 + 1], x2 = index.segs[seg * 4 + 2], y2 = index.segs[seg * 4 + 3];
    const perp = distPointToSeg(cx, cy, x1, y1, x2, y2);
    if (perp > besideMaxPerpPx) continue;
    const orientation = orientationFactor(label, angleOfSegDeg(x1, y1, x2, y2));
    if (orientation == null) continue;
    consider(seg, orientation, "beside", BESIDE_CONFIDENCE);
  }

  for (const [lx, ly] of opts.leaderPoints ?? []) {
    const hit = nearestSegment(index, lx, ly, windowPx);
    if (!hit) continue;
    const x1 = index.segs[hit.seg * 4], y1 = index.segs[hit.seg * 4 + 1], x2 = index.segs[hit.seg * 4 + 2], y2 = index.segs[hit.seg * 4 + 3];
    const orientation = orientationFactor(label, angleOfSegDeg(x1, y1, x2, y2));
    if (orientation == null) continue;
    consider(hit.seg, orientation, "leader", LEADER_CONFIDENCE);
  }

  if (!best) return null;
  const b: { seg: number; placement: SizePlacement; orientation: number; placementFactor: number; total: number } = best;
  return { parsed, seg: b.seg, placement: b.placement, confidence: b.total, factors: { orientation: b.orientation, placement: b.placementFactor } };
}

/** GATE 3 bug catalogue (docs/LINEAR-TRACE-EVAL.md Run 76): `associateLabel`'s
 *  own orientation gate is right in general — a label rotated to match ITS
 *  OWN pipe is the strongest available signal that it describes THIS line,
 *  not some other nearby one — but it has a real, disclosed blind spot: a
 *  label kept horizontal beside a VERTICAL run (a common, legitimate riser-
 *  diagram convention, confirmed on three independent real-corpus instances
 *  across two unrelated projects and both pipe and rect geometry) can never
 *  pass it at all. `orientationFactor` doesn't merely score the vertical run
 *  lower, it excludes it outright, so whatever OTHER correctly-oriented
 *  stroke happens to sit within the label's own small window wins instead —
 *  in every confirmed instance, an unrelated tick-mark or leader stub, not
 *  the pipe.
 *
 *  This is a STRICTLY ADDITIVE fallback, meant to be tried only once the
 *  ordinary sheet-wide `associateLabel` pass has already run and produced
 *  NOTHING landing on this specific run's own walked segments (the caller's
 *  `onRun.length === 0`) — it can only ever turn a `size_missing` result
 *  into a disclosed, lower-confidence one; it never competes with or
 *  overrides an existing "beside"/"leader" bind, so no already-passing case
 *  can regress from adding this. It drops the orientation gate entirely,
 *  but ONLY for segments THIS run actually walked (never sheet-wide — a
 *  bare proximity match across a whole sheet would be a real regression
 *  risk), and it keeps the same "uniqueness" doctrine `resolveSizeConflicts`
 *  already applies elsewhere: if more than one DISTINCT size shows up
 *  within range of the walked path, that's a genuine ambiguity, withheld
 *  rather than guessed, not silently resolved by picking the closest one.
 *
 *  NOT WIRED IN to either `session.ts`'s or `TakeoffCanvas.jsx`'s own
 *  trace path (Run 77): measured against the real corpus, this fixed three
 *  genuine no-label cases but ALSO turned an already-hard stacked-multi-
 *  system-label sheet's own no-label triple into a confidently WRONG size
 *  (dropping orientation let an unrelated header pipe's own real label win
 *  by proximity at the junction it connects to, with nothing left here to
 *  rule it out — the "uniqueness" check only catches DISAGREEING nearby
 *  candidates, not a single wrong one with no competitor). Kept, tested,
 *  and correct for what it claims to do — just not safe to deploy as-is
 *  given that trade-off; a future pass with a sharper safeguard (e.g.
 *  excluding candidates near a `branch_joins_main`/tee stop) may change
 *  that verdict. See docs/LINEAR-TRACE-EVAL.md Run 77 for the full numbers. */
export function associateOnRunFallback(
  index: SegmentIndex, labels: SizeLabelSpan[], walkedSegs: ReadonlySet<number>,
): BoundSize | null {
  const found: { parsed: ParsedSize; seg: number; perp: number }[] = [];
  for (const label of labels) {
    const parsed = parseSize(label.text);
    if (!parsed) continue;
    const cx = (label.x0 + label.x1) / 2, cy = (label.y0 + label.y1) / 2;
    const besideMaxPerpPx = 2 * labelHeightPx(label);
    let best: { seg: number; perp: number } | null = null;
    for (const seg of walkedSegs) {
      const x1 = index.segs[seg * 4], y1 = index.segs[seg * 4 + 1], x2 = index.segs[seg * 4 + 2], y2 = index.segs[seg * 4 + 3];
      const perp = distPointToSeg(cx, cy, x1, y1, x2, y2);
      if (perp > besideMaxPerpPx) continue;
      if (!best || perp < best.perp) best = { seg, perp };
    }
    if (best) found.push({ parsed, seg: best.seg, perp: best.perp });
  }
  if (!found.length) return null;
  const distinctSizes = new Set(found.map((f) => JSON.stringify(f.parsed.size)));
  if (distinctSizes.size > 1) return null;   // genuinely ambiguous — withheld, never guessed
  const best = found.reduce((a, b) => (b.perp < a.perp ? b : a));
  return { parsed: best.parsed, seg: best.seg, placement: "on-run", confidence: ON_RUN_CONFIDENCE, factors: { orientation: 0, placement: ON_RUN_CONFIDENCE } };
}

export interface SizeConflict {
  seg: number;
  candidates: BoundSize[];
}

/** Plan §6.6's other half of "uniqueness": "Two labels on one segment that
 *  disagree → withheld with both." Groups a batch of already-resolved
 *  `associateLabel` bindings by the segment they landed on; a segment with
 *  more than one DISTINCT parsed size is a conflict, both candidates kept
 *  for the audit trail rather than one silently picked (refusal over
 *  guessing — the same doctrine this file's header states for the grammar
 *  itself). A segment with no conflict resolves to its highest-confidence
 *  binding (there is normally only one). */
export function resolveSizeConflicts(bindings: BoundSize[]): { resolved: Map<number, BoundSize>; conflicts: SizeConflict[] } {
  const bySeg = new Map<number, BoundSize[]>();
  for (const b of bindings) {
    const list = bySeg.get(b.seg);
    if (list) list.push(b); else bySeg.set(b.seg, [b]);
  }
  const resolved = new Map<number, BoundSize>();
  const conflicts: SizeConflict[] = [];
  for (const [seg, list] of bySeg) {
    const distinctSizes = new Set(list.map((b) => JSON.stringify(b.parsed.size)));
    if (distinctSizes.size > 1) conflicts.push({ seg, candidates: list });
    else resolved.set(seg, list.reduce((a, b) => (b.confidence > a.confidence ? b : a)));
  }
  return { resolved, conflicts };
}
