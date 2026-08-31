// The sheet graph (#87, phases 1–3) — a pure, client-side plan-set index built
// from positioned text spans: sheet roles, schedule tables (including tables
// that CONTINUE across sheets and tables with rotated column headers), room
// tags qualified by building, detail callouts, revision markers (delta
// triangles / REV tags — the flag that a row's answer changed under an
// addendum), and the resolution room tag → schedule row → finish definition.
// No pdf.js, no DOM — the MCP server and the canvas both feed it spans.
//
// Doctrine (the RFC's): every edge carries an EVIDENCE pointer (sheet, text,
// bbox) — an edge without provenance is a hallucination with extra steps and
// is never created. A room on the plan with no schedule row comes back
// UNRESOLVED WITH A REASON, never silently omitted — the omission is how a
// bid gets lost. A room number reused across buildings is AMBIGUOUS until the
// tag is qualified ("A-134"), and the refusal lists the candidates rather
// than picking the first match. A set with no text layer degrades to
// "unavailable", cleanly.
//
// Composes the machinery the repo already trusts: scheduleParse's header-
// anchor table idiom (generalized here to arbitrary header vocabularies),
// detectRooms' room-tag pattern, and the span shape the MCP server already
// serves (sheet_context.text.spans).

import { ROOM_LABEL_RE } from "./detectRooms";

/** rot: text rotation in degrees, clockwise in device space (y down). Absent
 * or 0 = horizontal; 90/270 = a quarter-turn — the rotated-header case. When
 * rot is not provided (older span sources), a span at least four characters
 * long whose box is more than twice as tall as it is wide is treated as
 * vertical — a real horizontal token that long cannot be taller than wide. */
export interface GraphSpan { str: string; x: number; y: number; w: number; h: number; rot?: number }
/** segs (optional): the sheet's vector linework as flat [x1,y1,x2,y2, ...] in
 * the same px space as the spans (VectorGeometry.segs) — feeds the drawn
 * delta-triangle hunt. Text-only callers omit it and lose only that lane. */
export interface SheetSpans { key: string; sheet_number?: string | null; spans: GraphSpan[]; segs?: ArrayLike<number> }

export type SheetRole = "plan" | "schedule" | "legend" | "detail" | "elevation" | "demolition" | "unknown";
export type Bbox = [number, number, number, number];
export interface Evidence { sheet: string; text: string; bbox: Bbox }

const bboxOf = (s: GraphSpan): Bbox => [s.x, s.y, s.x + (s.w || 0), s.y + (s.h || 0)];
const merge = (a: Bbox, b: Bbox): Bbox => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const norm = (s: string) => (s || "").trim().toUpperCase();
const isVertical = (s: GraphSpan): boolean =>
  s.rot != null
    ? Math.abs(s.rot % 180) === 90
    : (s.str || "").trim().length >= 4 && (s.w || 0) > 0 && (s.h || 0) > 2 * s.w;

// ── sheet role ──────────────────────────────────────────────────────────────
// Title text first (what the sheet SAYS it is), sheet-number convention as a
// weak fallback. Wrong-here poisons everything downstream, so mixed signals
// lower confidence instead of picking a winner silently — and a sheet can
// legitimately be a plan that CARRIES schedules (the common case); schedules
// are found per-region below regardless of the sheet's role.
// A standalone schedule TITLE ("ROOM FINISH SCHEDULE - FIRST FLOOR") is a far
// stronger signal than the word SCHEDULE appearing in running text.
// Apostrophes arrive both ways: ASCII ' and the typographic ’ (U+2019 —
// pdf.js maps a Type1 quoteright there), so every CONT'D pattern accepts both.
const SCHEDULE_TITLE_RE = /^[A-Z][A-Z ()/&.'’-]* SCHEDULE( *[-–] *[A-Z0-9 ()/&.'’-]+)?( *\(?(?:CONTINUATION|CONTINUED|CONT['’]?D?)\.?\)?)?$/;
const ROLE_SIGNALS: Array<{ re: RegExp; role: SheetRole; conf: number }> = [
  // Real, found live (baker-county-eoc's own sheet #36, immediately after the
  // "- LEVEL N PLAN" fix above started matching MORE titles): a SHEET INDEX
  // page literally PRINTS every other real sheet's own title as its table of
  // contents ("MECHANICAL SHEET INDEX / MECHANICAL LEGEND / MECHANICAL -
  // LEVEL 1 PLAN / MECHANICAL - ROOF PLAN / ..." all as real spans on the
  // SAME index sheet) — once "LEVEL N PLAN" started matching too, this one
  // sheet had TWO distinct real "plan"-role hits at equal confidence, and the
  // tie-break (first in document order) happened to pick the wrong one,
  // reporting the index sheet itself as "MECHANICAL - LEVEL 1 PLAN". This
  // signal is checked FIRST (highest confidence, always wins the sort) so an
  // index page's own real "___ SHEET INDEX" title is what gets reported for
  // it, honestly as role "unknown" (an index isn't a plan/schedule/legend/
  // etc. itself) — not silently misattributed to one of the sheets it lists.
  { re: /SHEET\s+INDEX|DRAWING\s+INDEX|INDEX\s+OF\s+DRAWINGS/, role: "unknown", conf: 0.95 },
  // Real, found live (tarrant-county-mechanical's own real sheet #1, no `#N`
  // suffix — the set's first page): a real ABBREVIATIONS/SYMBOLS/LINE TYPES/
  // VALVES AND FITTINGS legend-and-glossary cover sheet produced NO signal
  // at all under the OLD signal set — none of those real box titles contain
  // "LEGEND", "SCHEDULE", or a discipline+PLAN phrase — while a small
  // callout-symbol-legend ENTRY on the SAME sheet ("ELEVATION NUMBER",
  // "DRAWING/DETAIL NUMBER" — reference-symbol definitions, not the sheet's
  // own real content) accidentally satisfied the generic ELEVATION/DETAIL
  // signals below, so the sheet reported role "elevation" off a stray
  // legend-entry mention instead of its own real title. Confirmed by direct
  // render (`view_sheet`): the sheet's own real, single-line title reads
  // "MECHANICAL SYMBOLS AND ABBREVIATIONS", beside real boxes titled
  // ABBREVIATIONS / SYMBOLS / LINE TYPES / VALVES AND FITTINGS — no plan,
  // schedule, or elevation content anywhere on it. Fixed with a new signal
  // recognizing a legend/glossary box's own real title — an optional single
  // leading qualifier word (MECHANICAL/CONTROL/REFERENCE/…) plus
  // ABBREVIATIONS or SYMBOLS (either order, "X AND Y"), or the fixed
  // phrases LINE TYPES / VALVES AND FITTINGS. Deliberately anchored to the
  // WHOLE span (not a substring) and capped at ONE leading word —
  // "MECHANICAL FLOOR PLAN SYMBOLS" (a real, DIFFERENT legend-box title
  // found live on federal-attachment4-mechanical.pdf's own sheet #1, three
  // leading words) does NOT match, left alone rather than risk bridging an
  // unrelated "PLAN" match into this signal's own territory.
  //
  // TWO real problems found and fixed in this signal via the required
  // corpus-wide before/after sweep before shipping, not assumed safe:
  //   1. A first version also accepted bare "LEGEND" itself — REVERTED:
  //      "LEGEND" alone is far too generic (a small "MATERIAL LEGEND"/
  //      "KEYNOTE LEGEND" annotation box is common on an ordinary REAL
  //      elevation/plan sheet too, not just a legend cover sheet —
  //      baker-county-eoc-bidset.pdf#16, a real 4-view "EXTERIOR ELEVATIONS"
  //      sheet with its own small "MATERIAL LEGEND"/"KEYNOTE LEGEND" side
  //      boxes, wrongly flipped from role "elevation" to "legend"). The
  //      existing bare `/LEGEND/` substring signal below (conf 0.5,
  //      unchanged) still catches genuine LEGEND-titled sheets without this
  //      signal's own priority overriding real content.
  //   2. Confidence 0.8 (a first shipped value) was caught by the FULL MCP
  //      test suite, not the corpus sweep — `sample-finish-plan.pdf`'s real
  //      floor PLAN (AF101) carries its OWN small corner "ROOM FINISH
  //      LEGEND & ABBREVIATIONS" reference box beside genuine plan content,
  //      and the schedule sheet behind it carries an identical small
  //      "ABBREVIATIONS" box of its own — a single such box is a common,
  //      legitimate, MINOR feature of an ordinary real plan/schedule sheet,
  //      not proof the whole sheet IS a legend. At 0.8 this signal beat the
  //      dissent threshold (best.conf - 0.1) against BOTH sheets' own real
  //      0.85-confidence plan/schedule titles, halving them to 0.425 and
  //      breaking `conformance.test.ts`'s "rooms come from the plan sheet
  //      only" assertion (a schedule-corroborated room's sheet attribution
  //      reads the schedule sheet's own role/confidence). Retuned to 0.72:
  //      still strictly above every wrong/weak signal this fix targets
  //      (elevation 0.7, detail 0.6, generic schedule/legend 0.5) without
  //      dissenting against — or ever outranking — a real, confidently
  //      classified 0.85 plan/schedule title anywhere in the corpus or this
  //      fixture (dissent needs conf >= best.conf - 0.1 = 0.75; 0.72 < 0.75).
  //      A side effect of the 0.8 value — federal-attachment4-mechanical.pdf's
  //      own sheet #1 (also a real legend cover sheet, mislabeled "plan" off
  //      a "MECHANICAL FLOOR PLAN SYMBOLS" box title, a DIFFERENT real,
  //      out-of-scope bug) losing confidence via dissent from 0.85 to
  //      0.425 without changing role — no longer happens at 0.72; that
  //      sheet is deliberately left untouched, matching this fix's real
  //      scope.
  { re: /^(?:[A-Z]+\s+)?(?:ABBREVIATIONS|SYMBOLS)(?:\s+AND\s+(?:ABBREVIATIONS|SYMBOLS))?$|^LINE\s+TYPES$|^VALVES\s+AND\s+FITTINGS$/, role: "legend", conf: 0.72 },
  { re: /DEMOLITION\s+PLAN|DEMO\s+PLAN/, role: "demolition", conf: 0.9 },
  // every discipline draws plans, not just finishes — an M-sheet's "SECOND
  // FLOOR DUCTWORK PLAN" is as much a plan title as an A-sheet's finish plan.
  // An optional "- LEVEL N " infix (real, found live on baker-county-eoc's
  // own real HVAC/plumbing/electrical floor plans — sheets #38/#45/#54/#55,
  // each titled, as one single text run, "<DISCIPLINE> - LEVEL 1 PLAN": a
  // real, consistent story-numbering convention this firm uses across every
  // discipline, missed entirely by the plain `\s+PLAN` tail since no
  // discipline word sits directly adjacent to "PLAN" itself. A SEPARATE
  // alternative, not a loosened shared tail — a first attempt collapsed the
  // base case's own required `\s+` down to `\s*`, which silently ALSO
  // started matching a one-word "FLOORPLAN" (no space at all) that has
  // nothing to do with this fix; caught via a real corpus-wide before/after
  // role diff, not assumed safe. Deliberately narrow here too —
  // `-\s*LEVEL\s+\d+\s*`, not a generic `.*` gap — so this can't bridge an
  // unrelated word into a false plan match; "KEY PLAN"/bare "LEVEL 1 PLAN"
  // (no discipline word) still correctly fail to match, unaffected.
  //
  // An optional ENLARGED/PARTIAL qualifier between the level number and
  // "PLAN" (real, found live: this same set's own sheet #47, title
  // "PLUMBING - LEVEL 1 ENLARGED PLAN" — a real Plumbing plan sheet, not a
  // detail or schedule, that was scoring role "unknown" with zero hits
  // because the base "- LEVEL N PLAN" alternative requires "PLAN" to sit
  // directly after the level digit). "ENLARGED PLAN"/"PARTIAL PLAN" are
  // standard, generic AEC drafting vocabulary for a zoomed-in segment of a
  // larger level plan — not this firm's own naming, not baker-county-
  // specific — so this widening generalizes, it doesn't special-case one
  // sheet. Every real, downstream consequence of a plan sheet reading as
  // "unknown" is severe (every equipment tag drawn on it becomes invisible
  // to sweep_schedule_row: its role is never "plan", so its occurrences are
  // silently skipped, same code path as a genuine detail/schedule sheet) —
  // this sheet #47 case alone was the true root cause behind three
  // separately-diagnosed-looking symptoms (FD-1 refusing with "not drawn on
  // any plan sheet" even though it's real and tagged there three times; a
  // real single HB-1 on this sheet never being swept at all; MS-1/EWC-1/
  // WH-1/ET-1 all sharing the identical fate) — one general regex gap, not
  // four separate bugs. Still narrow: only these two named qualifiers, still
  // anchored to `LEVEL\s+\d+`, so "KEY PLAN" and a bare "LEVEL 1 PLAN" (no
  // discipline word) are unaffected, exactly as before.
  { re: /(?:FINISH|FLOOR|FURNITURE|CEILING|DUCTWORK|PIPING|MECHANICAL|ELECTRICAL|LIGHTING|POWER|PLUMBING|SPRINKLER|HVAC|FRAMING|FOUNDATION|ROOF|SITE|EQUIPMENT)\s+PLAN\b|(?:FINISH|FLOOR|FURNITURE|CEILING|DUCTWORK|PIPING|MECHANICAL|ELECTRICAL|LIGHTING|POWER|PLUMBING|SPRINKLER|HVAC|FRAMING|FOUNDATION|ROOF|SITE|EQUIPMENT)\s*-\s*LEVEL\s+\d+\s+(?:ENLARGED\s+|PARTIAL\s+)?PLAN\b/, role: "plan", conf: 0.85 },
  // A ROOM-scoped enlarged plan — real, standard AEC drafting convention for
  // a zoomed-in mechanical/electrical ROOM (not a whole building LEVEL) —
  // was invisible to the signal above, which only ever recognized "LEVEL
  // N ... PLAN". Real, found live (navfac-cherry-point-atc-mechanical.pdf's
  // own M-401/M-411/M-421, all THREE building areas): "MECHANICAL - ROOM
  // 151 ENLARGED DUCT PLAN", "MECHANICAL - DUCT ENLARGED PLAN",
  // "MECHANICAL DUCT ENLARGED PLAN - MECH RM" — three real, differently-
  // worded titles for the exact same real drawing convention (a mechanical-
  // room enlarged duct/pipe plan), none matching "LEVEL N" (no level number
  // at all — a ROOM-scoped plan, not a building-story one) NOR the base
  // signal's required direct DISCIPLINE-adjacent-to-PLAN adjacency (DUCT/
  // PIPE/ENLARGED words sit between them). classifySheetRole scored every
  // one of these real sheets role "unknown" (confirmed live, zero hits) —
  // the single most severe class of miss this file has: every equipment
  // tag drawn ONLY on such a sheet (this corpus's own real PCHWP-/PHHWP-/
  // SHHWP-/HHWP-DOAH-/SCHWP- pumps, AS-CHW-/AS-HHW- air separators, DH-
  // dehumidifiers, B- boilers, CV- control valves, FCU-/CUH- units — all
  // drawn ONLY on these enlarged room plans, never on a whole-floor plan)
  // becomes silently invisible to sweep_schedule_row (same "not drawn on
  // any plan sheet" refusal path as a genuine absence), across all three
  // real building areas at once — one general regex gap, not dozens of
  // separate per-tag bugs.
  //
  // Deliberately NOT chasing each exact word order as its own alternative
  // (a real, found-live corpus-specific-pattern trap) — the one true
  // invariant across every real "enlarged room/area plan" title, any firm,
  // any discipline, is simply that a discipline word, "ENLARGED", and
  // "PLAN" all appear SOMEWHERE in the same short title span, in any order,
  // with any sub-drawing-type qualifier (DUCT/PIPE/POWER/…) between them.
  // Three independent lookaheads encode exactly that — general, not tied to
  // "ROOM"/"MECH RM"/"DUCT"/"PIPE" at all. Placed AFTER the base plan
  // signal (same 0.85 confidence) so a title the base signal already
  // matches is unaffected; this only ever adds a way to succeed for a real
  // enlarged-plan title the narrower, order-sensitive signal above misses.
  // A referencing sentence ("SEE THE MECHANICAL ENLARGED PLAN FOR...")
  // never reaches this signal at all — REFERENCE_RE already excludes it
  // before any ROLE_SIGNALS check runs. "PLANS?" (not bare "PLAN") because
  // the identical convention also prints its plural, sheet-category form
  // ("AIR OPS - MECHANICAL ENLARGED PLANS", this same navfac set's own
  // margin label) — the same real gap independently confirmed on a SECOND,
  // unrelated corpus set (federal-attachment4-mechanical.pdf#7's own real
  // "MECHANICAL ROOM ENLARGED DUCT PLAN"/"MECHANICAL ROOM ENLARGED PIPING
  // PLAN" — that set's own key already separately disclosed this exact
  // sheet's tags as affected), confirming this is a real, general AEC title
  // convention this file was missing, not a navfac-only pattern.
  { re: /^(?=.*\b(?:FINISH|FLOOR|FURNITURE|CEILING|DUCTWORK|PIPING|MECHANICAL|ELECTRICAL|LIGHTING|POWER|PLUMBING|SPRINKLER|HVAC|FRAMING|FOUNDATION|ROOF|SITE|EQUIPMENT)\b)(?=.*\bENLARGED\b)(?=.*\bPLANS?\b)/, role: "plan", conf: 0.85 },
  { re: SCHEDULE_TITLE_RE, role: "schedule", conf: 0.85 },
  { re: /SCHEDULE/, role: "schedule", conf: 0.5 },
  { re: /LEGEND/, role: "legend", conf: 0.5 },
  // A trailing "NUMBER" turns this into a reference-symbol legend ENTRY
  // ("ELEVATION NUMBER" — the callout label defining what an elevation
  // marker's number means, found live on tarrant-county-mechanical.pdf's own
  // sheet #1 legend box) rather than a real elevation-sheet title ("BUILDING
  // ELEVATIONS", "EXTERIOR ELEVATIONS - NORTH") — no real elevation sheet
  // title in the corpus was found drafted as "ELEVATION NUMBER" itself, so
  // this exclusion is narrow and additive, not a loosened match elsewhere.
  { re: /ELEVATIONS?\b(?!\s+NUMBER)/, role: "elevation", conf: 0.7 },
  { re: /DETAILS?\b|SECTIONS?\b/, role: "detail", conf: 0.6 },
];
// Running-text references are not titles: "SEE FINISH PLAN FOR ADDITIONAL
// INFORMATION" in a remark cell must never make a schedule sheet a plan.
//
// The bare "PER" lead-in needs its own, narrower trigger than SEE/REFER/
// NOTED/AS SHOWN: those four never start a legitimate short header
// fragment, but "PER" does — real, corpus-found (federal-attachment4-
// mechanical.pdf#14's own AIR HANDLING UNIT HYDRONIC COIL SCHEDULE header
// wraps "MAX FINS PER INCH" onto its own tier, leaving a bare "PER INCH"
// continuation cell) — "PER <UNIT>" (PER INCH/FOOT/HOUR/MINUTE/SF/UNIT…) is
// a standard 2-word engineering column-header fragment, not a cross-
// reference note. Every real "PER …" reference note actually measured in
// this project (PER SPEC SECTION 09, PER MANUFACTURER'S REQUIREMENTS) runs
// 3+ words — a real note names a document/party/section, never stops at
// one bare unit word — so the PER branch alone is widened to require 2+
// words after PER, leaving SEE/REFER/NOTED/AS SHOWN/"REFER TO" (each
// already safe at their original, shorter reach) unchanged.
const REFERENCE_RE = /^(SEE|REFER|NOTED|AS SHOWN)\b|REFER TO|^PER\b(?:\s+\S+){2,}/;

export function classifySheetRole(sheet: SheetSpans): { role: SheetRole; confidence: number; evidence: Evidence | null } {
  const hits: Array<{ role: SheetRole; conf: number; span: GraphSpan }> = [];
  for (const sp of sheet.spans) {
    const u = norm(sp.str);
    if (u.length < 4 || u.length > 60 || REFERENCE_RE.test(u)) continue;
    for (const sig of ROLE_SIGNALS) if (sig.re.test(u)) { hits.push({ role: sig.role, conf: sig.conf, span: sp }); break; }
  }
  if (!hits.length) {
    // sheet-number fallback: <discipline>-1xx is conventionally a plan — weak, stated as weak
    const n = norm(sheet.sheet_number || "");
    if (/^(A|M|E|P|S|FP)-?1\d\d/.test(n)) return { role: "plan", confidence: 0.4, evidence: null };
    return { role: "unknown", confidence: 0, evidence: null };
  }
  // strongest signal wins; disagreement between DISTINCT roles halves confidence
  hits.sort((a, b) => b.conf - a.conf);
  const best = hits[0];
  const dissent = hits.some((h) => h.role !== best.role && h.conf >= best.conf - 0.1);
  return {
    role: best.role,
    confidence: dissent ? best.conf / 2 : best.conf,
    evidence: { sheet: sheet.key, text: best.span.str.trim(), bbox: bboxOf(best.span) },
  };
}

// ── building context (#87 phase 2: the multi-building room key) ─────────────
// Multi-building sets reuse room numbers — room 134 in Building A is not room
// 134 in Building B, so the room key is (building, number), not the number
// alone. A building designator enters the vocabulary three ways: "BUILDING A"
// / "BLDG 2" text on a sheet or a table title, a qualified schedule row key
// ("A-134"), or a BLDG/BUILDING schedule column. Qualified PLAN tags are only
// accepted for designators the set actually names somewhere — otherwise every
// title-block sheet number ("A-601") would mint a phantom room.
const BUILDING_RE = /\b(?:BUILDING|BLDG\.?)\s+([A-Z]\d?|\d{1,2})\b/g;
const DESIGNATOR_RE = /^([A-Z]\d?|\d{1,2}|[A-Z]{2})$/;

function buildingMentions(text: string): string[] {
  const u = norm(text);
  if (u.length > 80 || REFERENCE_RE.test(u)) return [];
  return [...u.matchAll(BUILDING_RE)].map((m) => m[1]);
}

/** The sheet's own building context: set when the sheet names exactly ONE
 * building. A schedule sheet carrying two buildings' tables names two — no
 * sheet-level context; each table's own title decides. */
export function sheetBuilding(sheet: SheetSpans): { building: string; evidence: Evidence } | null {
  const seen = new Map<string, GraphSpan>();
  for (const sp of sheet.spans) {
    for (const b of buildingMentions(sp.str)) if (!seen.has(b)) seen.set(b, sp);
  }
  if (seen.size !== 1) return null;
  const [building, span] = [...seen.entries()][0];
  return { building, evidence: { sheet: sheet.key, text: span.str.trim(), bbox: bboxOf(span) } };
}

// ── revision markers (#87 phase 3) ──────────────────────────────────────────
// A delta triangle ("Δ2", "2▲") or a REV tag ("REV 2") is drafting's flag that
// the ink nearby CHANGED under a revision — the printed value is the current
// answer, but reading it without surfacing the delta is how a superseded
// number gets priced confidently. Two failure modes this section kills:
//   - a delta sitting left of a schedule row's key column used to strip to its
//     bare digit and MINT a room ("Δ2" → row key "2") — markers are excluded
//     from banding entirely;
//   - a revised row read as if nothing happened — the marker attaches to the
//     row (and to a plan tag it sits beside) and rides every resolution.
// The honest limit, named: a revision CLOUD is linework, not text — a clouded
// row with no delta/REV text is invisible to a spans-only pass. That gap is
// phase 4 (geometry), not something to fake here.
export interface RevisionMarker { rev: string; sheet: string; bbox: Bbox; drawn?: boolean }
export interface RowRevision { rev: string; source: Evidence; drawn?: boolean }
/** Per-sheet drawn-delta index: the bare-digit span → its triangle's bbox. */
export type DeltaIndex = Map<GraphSpan, Bbox>;
const DELTA_MARK_RE = /^[Δ∆△▲]\s*(\d{1,2}[A-Z]?)$|^(\d{1,2}[A-Z]?)\s*[Δ∆△▲]$/;
const REV_MARK_RE = /^REV(?:ISION)?\.?\s*#?\s*(\d{1,2}[A-Z]?)$/;

/** The revision a span IS a marker for, or null. Tight on purpose: a bare
 * number is never a marker, and running text never matches (whole-span only). */
export const revisionOf = (s: string): string | null => {
  const t = norm(s);
  if (!t || t.length > 12) return null;
  const d = t.match(DELTA_MARK_RE);
  if (d) return d[1] ?? d[2];
  const r = t.match(REV_MARK_RE);
  return r ? r[1] : null;
};

// ── drawn delta triangles ───────────────────────────────────────────────────
// Real CAD sets rarely EMIT "Δ2" as text: the convention is a drawn triangle
// (three linework segments) with a bare digit inside, and the text layer
// carries just "2" — which the text pass rightly refuses (a bare number can't
// be a marker, or every dimension becomes a revision). The geometry closes
// that gap: a 1–2 digit span becomes a marker exactly when three segments of
// digit scale close into a triangle around it. Guards, each killing a real
// false-positive class: side length is bounded to digit scale (a roof slope
// or a big triangular region never qualifies), the three sides must roughly
// agree (max/min ≤ 2.5 — drafting deltas are near-equilateral), the loop must
// CLOSE corner-to-corner (a circle's many short chords never form a 3-cycle,
// so grid bubbles and detail circles stay out), and a dense neighbourhood
// (hatch) refuses rather than guesses.
const BARE_DIGIT_RE = /^\d{1,2}$/;

/** segs: flat [x1,y1,x2,y2, ...] in the SAME px space as the spans (the
 * VectorGeometry.segs shape the engine already extracts). Returns each bare-
 * digit span that sits inside a digit-scale drawn triangle, with the
 * triangle's bbox. Pure; O(spans·nearby) with a coarse grid prefilter. */
export function drawnDeltaMarkers(spans: GraphSpan[], segs: ArrayLike<number>): Array<{ span: GraphSpan; tri: Bbox }> {
  const cands = spans.filter((s) => BARE_DIGIT_RE.test((s.str || "").trim()));
  if (!cands.length || !segs.length) return [];
  // coarse grid over segment midpoints, digit-scale segments only
  const CELL = 64;
  const grid = new Map<string, number[]>();
  const nSeg = Math.floor(segs.length / 4);
  for (let i = 0; i < nSeg; i++) {
    const dx = segs[i * 4 + 2] - segs[i * 4], dy = segs[i * 4 + 3] - segs[i * 4 + 1];
    const len = Math.hypot(dx, dy);
    if (len < 4 || len > 400) continue;                     // digit-scale window, generous
    const mx = (segs[i * 4] + segs[i * 4 + 2]) / 2, my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
    const k = `${Math.floor(mx / CELL)},${Math.floor(my / CELL)}`;
    let cell = grid.get(k);
    if (!cell) grid.set(k, (cell = []));
    cell.push(i);
  }
  const out: Array<{ span: GraphSpan; tri: Bbox }> = [];
  for (const sp of cands) {
    const h = Math.max(sp.h || 8, 6);
    const cx = sp.x + (sp.w || 0) / 2, cy = sp.y + h / 2;
    const R = h * 5;
    const near: number[] = [];
    for (let gx = Math.floor((cx - R) / CELL); gx <= Math.floor((cx + R) / CELL); gx++) {
      for (let gy = Math.floor((cy - R) / CELL); gy <= Math.floor((cy + R) / CELL); gy++) {
        for (const i of grid.get(`${gx},${gy}`) || []) {
          const mx = (segs[i * 4] + segs[i * 4 + 2]) / 2, my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
          const len = Math.hypot(segs[i * 4 + 2] - segs[i * 4], segs[i * 4 + 3] - segs[i * 4 + 1]);
          if (Math.hypot(mx - cx, my - cy) <= R && len >= h * 1.2 && len <= h * 8) near.push(i);
        }
      }
    }
    if (near.length < 3 || near.length > 60) continue;      // dense hatch → refuse, never guess
    const tol = Math.max(2, h * 0.35);
    const tol2 = tol * tol;
    let best: Bbox | null = null;
    let bestArea = Infinity;
    const P = (i: number, end: 0 | 1): [number, number] => [segs[i * 4 + end * 2], segs[i * 4 + 1 + end * 2]];
    const close = (a: [number, number], b: [number, number]) => {
      const dx = a[0] - b[0], dy = a[1] - b[1];
      return dx * dx + dy * dy <= tol2;
    };
    // A triangle requires every pair of its three segments to share a corner.
    // Precompute that sparse adjacency once: dense digit neighbourhoods used
    // to pay eight endpoint orientations for every O(n³) triple even though
    // almost all segment pairs were nowhere near one another.
    const adjacent: boolean[][] = Array.from({ length: near.length }, () => Array(near.length).fill(false));
    for (let a = 0; a < near.length; a++) {
      for (let b = a + 1; b < near.length; b++) {
        const a0 = P(near[a], 0), a1 = P(near[a], 1);
        const b0 = P(near[b], 0), b1 = P(near[b], 1);
        adjacent[a][b] = adjacent[b][a] = close(a0, b0) || close(a0, b1) || close(a1, b0) || close(a1, b1);
      }
    }
    for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) for (let c = b + 1; c < near.length; c++) {
      if (!adjacent[a][b] || !adjacent[b][c] || !adjacent[c][a]) continue;
      // a 3-cycle: each segment's ends pair corner-to-corner with the other two
      for (const fa of [0, 1] as const) for (const fb of [0, 1] as const) for (const fc of [0, 1] as const) {
        const [a0, a1] = [P(near[a], fa), P(near[a], (1 - fa) as 0 | 1)];
        const [b0, b1] = [P(near[b], fb), P(near[b], (1 - fb) as 0 | 1)];
        const [c0, c1] = [P(near[c], fc), P(near[c], (1 - fc) as 0 | 1)];
        if (!close(a1, b0) || !close(b1, c0) || !close(c1, a0)) continue;
        const v: Array<[number, number]> = [a0, b0, c0];
        const side = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
        const s01 = side(v[0], v[1]), s12 = side(v[1], v[2]), s20 = side(v[2], v[0]);
        const mx = Math.max(s01, s12, s20), mn = Math.min(s01, s12, s20);
        if (mn < h * 1.2 || mx > h * 8 || mx / mn > 2.5) continue;
        // the digit strictly inside (consistent cross-product sign)
        const cross = (p: [number, number], q: [number, number]) => (q[0] - p[0]) * (cy - p[1]) - (q[1] - p[1]) * (cx - p[0]);
        const d0 = cross(v[0], v[1]), d1 = cross(v[1], v[2]), d2 = cross(v[2], v[0]);
        if (!((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0))) continue;
        const area = Math.abs((v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1])) / 2;
        if (area < bestArea) {
          bestArea = area;
          best = [Math.min(v[0][0], v[1][0], v[2][0]), Math.min(v[0][1], v[1][1], v[2][1]), Math.max(v[0][0], v[1][0], v[2][0]), Math.max(v[0][1], v[1][1], v[2][1])];
        }
      }
    }
    if (best) out.push({ span: sp, tri: best });
  }
  return out;
}

// ── row clustering (the scheduleParse idiom, span-shaped) ───────────────────
function clusterRows(spans: GraphSpan[]): GraphSpan[][] {
  const toks = spans.filter((t) => t.str && t.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: GraphSpan[][] = [];
  let cur: GraphSpan[] = [];
  let cy = 0;
  for (const t of toks) {
    // TIGHTER than scheduleParse's marquee clustering (0.6·h): this runs over
    // WHOLE sheets where side-by-side regions (legend beside schedule)
    // interleave in y — at 0.6·h their rows glue into mega-rows and the
    // header hunt dies. 0.35·h separates a real sheet's interleaved bands
    // while same-row jitter (~1–2 px) stays well inside.
    const tol = Math.max((t.h || 8) * 0.35, 3);
    if (cur.length && Math.abs(t.y - cy) > tol) { rows.push(cur); cur = []; }
    cur.push(t);
    cy = cur.reduce((s, w) => s + w.y, 0) / cur.length;
  }
  if (cur.length) rows.push(cur);
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}
const rowY = (r: GraphSpan[]) => r.reduce((s, t) => s + t.y, 0) / r.length;

// ── schedule tables ─────────────────────────────────────────────────────────
// Generalized header-anchor extraction: a header row is a row where ≥ minHits
// tokens match the vocabulary; data cells band to the nearest anchor. Every
// cell keeps its evidence bbox. Two vocabularies ship: the room-finish
// schedule (rooms → finishes — THE resolution target) and the finish/material
// schedule (codes → products, scheduleParse's own gate re-stated).
// "reference" (this session's own full-coverage-standard work): a FOURTH
// kind for real schedule/reference/calculation tables whose header words are
// NOT in any fixed vocabulary — see the "structural (vocabulary-free)
// reference/calculation tables" section below, right after extractAllTables,
// for the full design rationale and the real bug-shaped edge cases that
// shaped it (bessemer M601's own DUCTWORK INSULATION SCHEDULE / DUCTWORK
// INSULATION TYPE SCHEDULE — real, keyed by SYSTEM TYPE / INSULATION TYPE,
// no per-instance drawn-symbol tag at all).
export type TableKind = "room-finish" | "finish" | "equipment" | "reference" | "unknown";
export interface TableCell { text: string; bbox: Bbox }
/** A schedule row. `sheet` is the sheet that CARRIES the row — under a
 * continuation it differs from the table's base sheet, and the row's evidence
 * must cite where the ink actually is. `building` is the row-level qualifier
 * (a qualified key's prefix, or the BLDG column) when one exists. */
export interface TableRow { key: string; sheet: string; building?: string; cells: Record<string, TableCell>; revision?: RowRevision }
export interface TablePart { sheet: string; title: string; rows: number; region: Bbox; rotated_headers?: boolean }
export interface ScheduleTable {
  kind: TableKind;
  sheet: string;
  title: Evidence | null;
  headers: string[];
  rows: TableRow[];
  region: Bbox;
  /** Building context the whole table answers for (its title's "BUILDING X",
   * else the sheet's), when one exists. Row-level qualifiers override it. */
  building?: string;
  /** True when the header row was read at a quarter-turn (rotated headers). */
  rotated_headers?: boolean;
  /** Present when the table continues across sheets: every fragment,
   * base first. rows[] above is already the union. */
  parts?: TablePart[];
  /** Header anchors (label + x), kept for continuation adoption. */
  anchors?: Anchor[];
}

/** Columns that ARE a surface in their own right — never renamed by a parent. */
const SURFACE_WORDS = new Set(["FLOOR", "BASE", "WALL", "WALLS", "CEILING", "NORTH", "SOUTH", "EAST", "WEST", "WAINSCOT"]);
const ROOM_HEADERS = ["ROOM", "NO", "NUMBER", "NAME", "MARK", "LOCATION", "FLOOR", "BASE", "WALL", "WALLS", "NORTH", "SOUTH", "EAST", "WEST", "CEILING", "WAINSCOT", "REMARKS", "CLG", "HT", "HEIGHT", "FINISH", "CASEWORK", "CABINET", "COUNTER", "COUNTERTOP", "BLDG", "BUILDING"];
// "ID" added alongside CODE/MARK/SYMBOL (#HVAC-1): every MEP equipment
// schedule checked against a real mechanical bid set (electric heater, fan,
// diffuser/grille/register, heat pump schedules) keys its rows under "ID",
// never CODE/MARK/SYMBOL — those are the flooring-schedule convention this
// vocabulary was originally built for. Still gated by minHits=3 total
// vocabulary hits, so this alone can't qualify a table — it just stops a
// real equipment schedule from being invisible to find_schedule/resolve_tag
// for the one reason that its key column says "ID" instead of "CODE".
//
// "MODEL" was tried here too (#HVAC-2, to surface the Electric Baseboard
// Heater Schedule / EBB-6) and reverted — proven live-unsafe before it ever
// reached the browser. `extractTable` finds at most ONE "finish" table per
// sheet (the first header row, in sheet order, whose hit count clears
// minHits); "MODEL" gave the sheet's EARLIER Electric Wall Heater Schedule a
// 3rd hit it didn't have before, so it started winning that single slot
// instead of the Diffuser/Grille/Register Schedule — a real regression on an
// already-working case, not a net gain. Worse, `bandDataRows`'s main data
// scan has no lower table-boundary either (only its column-START recovery
// was fixed for #87/HVAC-2's sibling bug): with the same column grid reused
// by every schedule on this sheet, Electric Wall Heater's row scan pulled in
// "QMARK" — a manufacturer name from the UNRELATED Electric Baseboard
// Heater Schedule two tables below — and read it as one of its own rows,
// because it happens to sit at the same x as Electric Wall Heater's own key
// column. Reproduced and confirmed in isolation (Node, not the browser)
// before touching anything live. Finding EBB-6-style rows needs a real
// multi-table-per-sheet extraction pass with an actual boundary between
// successive tables — not a vocabulary tweak — and is tracked as its own
// follow-up, not bundled into this fix.
// LOCATION/PRESSURE (itd-d1-lab's own SOUND ATTENUATOR SCHEDULE, SA-1): a
// real, deliberately finish-kind table (ground-truth-confirmed, not a
// misclassification — it carries no motor/electrical vocabulary and a prior
// session already tried and correctly rejected reclassifying it to
// equipment) whose own header row carries real, standalone leaf-column
// words this vocabulary had no entry for at all: LOCATION, and "MAXIMUM
// PRESSURE DROP" 's own PRESSURE. Both sit BARE on the table's own already-
// qualifying header row (same row as SYMBOL/MANUFACTURER/REMARKS) — a pure
// vocabulary gap, not a geometric one: no new anchor-recovery code needed,
// `headerHits` already finds them the moment the words exist here.
//
// TYPE, AREA, and WEIGHT were ALSO real, bare, standalone words on this same
// header row (TYPE for the DUCT SILENCER column, AREA for "FACE AREA (SQ
// FT)", WEIGHT for the "WEIGHT (LBS)" column one tier up) and were tried
// here too — each one individually REVERTED after a real, corpus-wide
// before/after sweep (extractAllTables() over every set: bessemer,
// itd-d1-lab, federal-mech, weld-county, baker-county-eoc, tarrant-county)
// caught real collateral damage on OTHER, already-correct tables elsewhere
// in the corpus. The mechanism, traced live: this file runs BOTH the
// finish-kind AND equipment-kind extraction passes over every sheet, and a
// title-based reclassification (isMepEquipmentSchedule) relabels a
// finish-vocabulary read of a real MEP-equipment-family table (PUMP/BOILER/
// HUMIDIFIER/…) as equipment-kind while keeping the ANCHORS that finish's
// own (cruder, non-tier-merged) reading found for it. The cross-kind
// richness collapse further down this file then picks whichever of the two
// independent reads (native equipment-kind vs. reclassified finish-kind) is
// richer — and breaks an EXACT tie toward whichever was pushed first, which
// is always the finish-kind read (finish is tried before equipment in the
// kind loop). Adding TYPE let finish's own read of itd-d1-lab's real PUMP
// SCHEDULE (sheet #12) reach the SAME header/cell count as its correct,
// native equipment-kind read — and WON the tie, replacing real columns
// (SUCTION DUTY, SUCTION WEIGHT) with wrong ones (TRIPLE DUTY, OPERATING
// WEIGHT) neither of which are what the sheet actually says. AREA did the
// same to the PRESSURE INDEPENDENT ROOM SUPPLY VALVE SCHEDULE (9 real
// columns collapsed to 4) and minted an outright garbage reference-kind
// table besides; WEIGHT alone reached the same PUMP SCHEDULE plus a
// spurious column on the LAB EXHAUST FAN SCHEDULE. LOCATION and PRESSURE do
// not: neither word appears anywhere in this corpus positioned to lift
// another table's finish-kind read up to its equipment-kind read's own
// richness, confirmed by the same real corpus-wide sweep showing zero
// change anywhere outside this one table. Any FUTURE word added here needs
// the same real before/after sweep — this collapse/tie-break interaction is
// a standing hazard for this vocabulary generally, not specific to any one
// word.
const FINISH_HEADERS = ["CODE", "MARK", "SYMBOL", "ID", "MATERIAL", "MANUFACTURER", "PRODUCT", "STYLE", "COLOR", "SIZE", "REMARKS", "DESCRIPTION", "PATTERN", "COMMENTS", "LOCATION", "PRESSURE"];
// A dedicated MEP equipment vocabulary (#HVAC-3/Phase 5) — not a FINISH_HEADERS
// patch. The comment block above this one is the reason why: "MODEL" alone,
// added to FINISH_HEADERS to surface the Electric Baseboard Heater Schedule,
// won a single-table-per-sheet slot away from a real table and let an
// unrelated table's row bleed into another's scan — a real regression,
// reverted before it ever shipped. Both root causes are gone now (Phase 0's
// multi-table extraction + real per-table boundaries), so the fix that was
// unsafe then is safe now — but it belongs in its OWN vocabulary, not
// flooring's, because that's what actually stops the next version of the
// same class of mistake: a word added here can never again make an
// UNRELATED finish/material table win or lose a slot it shouldn't.
//
// Tuned against this project's own real fixture (Bessemer M601, page 8) AND
// checked against real published MEP schedule conventions, not just the one
// PDF — searched rather than assumed, since a vocabulary this narrow is easy
// to accidentally over-fit to a single sample. Electrical rating columns
// (VOLTAGE/PHASE/AMPS/FLA/MCA/MOCP/KW) and mechanical capacity columns
// (CFM/GPM/HP/TONS/MBH), plus efficiency (EER/SEER) and coil-performance
// (EAT/LAT) and fan (RPM/ESP) columns, are all real, standard terms on real
// equipment schedules — MCA/MOCP/FLA specifically tie to NEC 440/UL 1995
// motor-circuit sizing, not this project's own invention. Confirmed the
// Fan Schedule's real header on this same sheet only carries one of these
// (CFM, see below) — everything else here is genuinely equipment-specific,
// not incidentally shared with a fan/diffuser/finish schedule's own vocabulary.
//
// This project's own fixture supplies the direct, previously-unreachable
// targets: ELECTRIC WALL HEATER SCHEDULE (ID/MANUFACTURER/MODEL/VOLTAGE/
// PHASE/WATTS) and ELECTRIC BASEBOARD HEATER SCHEDULE (ID/MANUFACTURER/
// MODEL/WATTS/LENGTH/VOLTAGE) — EWH-1, EBB-1..6. `required` is deliberately
// the ELECTRICAL/MECHANICAL rating columns a flooring or diffuser schedule
// never carries — not ID/MANUFACTURER/MODEL/DESCRIPTION, which are too
// generic (real finish/material AND equipment schedules both use them) and,
// on this same sheet, the Fan Schedule and Diffuser/Grille/Register Schedule
// already legitimately qualify as "finish" on exactly those generic columns.
// "CFM" is deliberately in the vocabulary but NOT in `required`: the Fan
// Schedule's header carries one incidental "(CFM)" token, and putting it in
// `required` would make Fan Schedule ALSO qualify as "equipment" — not a
// boundary bleed this time, but a straight-up DUPLICATE: the same real table
// read out twice, under two kinds, so resolve_tag/sweep_schedule_row would
// see its row keys defined twice and refuse everything as ambiguous. One
// incidental airflow-unit token is not a strong enough signal on its own; a
// real electrical/mechanical rating column is.
// "RPM" follows the exact same CFM precedent, found live on this same
// sheet's Fan Schedule header (ID/DESCRIPTION/MANUFACTURER/MODEL/RPM — 5
// hits, and a bare RPM alone would have made it qualify as "equipment" too,
// a real duplicate-extraction collision caught before shipping): RPM stays
// in the vocabulary (a real fan/AHU schedule reports it, and a genuine RPM
// column still needs to anchor and count toward `minHits`) but leaves
// `required` — one incidental fan-speed token is not, on its own, strong
// enough evidence that a table is an equipment schedule rather than a
// finish/diffuser one that happens to mention it once.
// "SYMBOL" and "TAG" (maturity plan Phase 2): real catalog-anchor words,
// found live on TWO independent real MEP bid sets neither Bessemer nor
// FINISH_HEADERS's own convention anticipated — Miller Stauffer/Musgrove's
// entire equipment-schedule family (AHU, boiler, humidifier, fan, coil,
// control valve, bypass valve — all of it, consistently) keys every row
// under a column literally headed "SYMBOL", never "ID"; SmithGroup's Eglin
// AFB set keys its AHU/chiller/boiler/pump/fan/VAV ("Volume Control Box")
// schedules under "TAG" instead. Neither firm is wrong — there is no single
// national convention here, exactly this project's own prior research on
// HVAC symbol standards already found. "SYMBOL" doubles as FINISH_HEADERS'
// own catalog word too (real finish/diffuser schedules key under it as
// well) — this does not raise cross-contamination risk beyond what CFM/RPM
// above already accepted: SYMBOL/TAG alone cannot push a table over
// `required`'s bar, which stays the rating columns only.
// "EWT"/"LWT" (Phase 2): entering/leaving WATER temperature, the hydronic-
// side sibling of EAT/LAT already here — real, found on every hydronic
// schedule this same corpus turned up (boiler, VAV reheat coil, AHU
// hydronic coil, control valve schedules), safely as generic as EAT/LAT
// already proved to be.
// "EQUIPMENT"/"VELOCITY"/"AIRFLOW"/"SIZE"/"FPM" (accuracy-hardening plan
// Phase 3, ledger items 6/7): real words seen live on the Canopy Hood
// Schedule's own header (`itd-d1-lab-mechanical.pdf#12` — "EXHAUST AIRFLOW
// (CFM)", "CAPTURE VELOCITY (FPM)", "EXHAUST OUTLET SIZE", "...ABOVE
// OPERATING EQUIPMENT"), confirmed by rendering the real sheet directly.
// "LENGTH" (ledger item 4): EBB-6's own VOLTAGE cell reads `"4'-0\" 240"`,
// not a clean `"240"` — LENGTH wasn't anchored to any column, so its data
// bled into the nearest anchored one. Vocab only, never `required` (a
// dimension word this generic, unguarded, would over-trigger equipment
// qualification on unrelated tables); no collision with ROOM_HEADERS'
// vocabulary (checked — it has no "LENGTH" token of its own).
// "TYPE"/"MOUNTING"/"CCT"/"CRI"/"DRIVER"/"DIMMING"/"LENS"/"FINISH"/"NOTES"/
// "LUMENS" (ledger item 63): a real LUMINAIRE SCHEDULE (baker-county-eoc-
// bidset.pdf#59 — TYPE/DESCRIPTION/MOUNTING/CCT-CRI/WATTS/DELIVERED LUMENS/
// DRIVER/DIMMING/VOLTAGE/LENS-RELECTOR-BEAM/FINISH/MANUFACTURER SERIES/
// NOTES, confirmed by direct render) had zero deterministic support: WATTS/
// VOLTAGE/DESCRIPTION/MANUFACTURER already cleared `required`+minHits, but
// every OTHER real column had no anchor of its own and would have bled into
// whichever anchored column sat nearest — exactly the cross-row corruption
// class this vocabulary exists to prevent (a live agent manually assembling
// this same table by hand already got one cell wrong this way: V1's own
// MANUFACTURER SERIES misread as X1's). CCT/CRI/DRIVER/DIMMING/LENS/LUMENS
// are lighting-specific terms with no plausible collision elsewhere in this
// vocabulary's domain (mechanical/electrical/plumbing equipment schedules
// never carry a light driver, a dimming protocol, or a lens). MOUNTING and
// FINISH are real, generic MEP terms (a diffuser's or a fixture's mounting
// type; a device's finish) — vocab only, not `required`, so neither can by
// itself tip an unrelated table into qualifying; FINISH already exists in
// ROOM_HEADERS with no cross-contamination (the SYMBOL precedent above).
// NOTES is `bandLimits`' own WIDE_LAST label already — this is the missing
// other half, giving a table with a literal "NOTES" header (rather than
// "REMARKS") its own anchored column instead of losing it to REMARKS'
// nearest-neighbor guess. "DELIVERED LUMENS" needs no separate "DELIVERED"
// entry: headerLabel takes the first vocabulary word found in the cell text
// in STRING order, and "LUMENS" alone is both sufficient (the cell still
// resolves to one anchor) and lower-risk than adding a generic English word.
//
// SERVED: a full-coverage audit of itd-d1-lab-mechanical.pdf's own already-
// PASSING equipment tables (direct render vs. extracted cells, not code
// inspection — HOT WATER REHEAT COIL SCHEDULE, CONTROL VALVE SCHEDULE (HOT
// WATER REHEAT COILS), EXHAUST FAN SCHEDULE, ELECTRIC HEATER SCHEDULE, sheet
// #12-14) found a single real column — "AREA SERVED" / "AREA / SUPPLY VALVE
// SERVED" — missing outright from EVERY one of them: the room/space a piece
// of equipment serves, arguably the single most requested field for a real
// takeoff. None of AREA_SERVED's own words were in ANY vocabulary here
// (EQUIPMENT_HEADERS nor FINISH_HEADERS nor ROOM_HEADERS), so the column
// never anchored at all and its data was silently dropped (not merged
// elsewhere — confirmed against the raw header spans: the real "AREA /
// SUPPLY VALVE SERVED" header token sits well clear of every other real
// column's own anchor). "SERVED" alone (not "AREA", which risks colliding
// with unrelated "FLOOR AREA"/"SQ FT" prose elsewhere in a real set) is a
// standard, cross-firm MEP schedule term ("AREA SERVED", "ROOM SERVED",
// "SPACE SERVED", "ZONE SERVED" all end in it) — same evidence bar as
// EQUIPMENT/NOTES/MOUNTING above, not this one document's own invented
// vocabulary. Deliberately NOT added to `required`: a table naming its rating
// columns already clears required's own bar, and SERVED alone should never
// tip an unrelated table into qualifying.
// PRESSURE: shared with FINISH_HEADERS (a glazing/storefront schedule's own
// wind-pressure rating column), but just as real and common on the
// equipment side — a diffuser/grille's MAX SOUND PRESSURE (dBA) column, a
// fan/AHU's STATIC PRESSURE, a pump/boiler's OPERATING PRESSURE. Without it
// here, a small equipment schedule whose only other recognized columns are
// the words this file's own comment already documents as shared across both
// vocabularies (MANUFACTURER/MODEL/DESCRIPTION/REMARKS/LOCATION) loses the
// eqHits>=finHits tie purely because FINISH_HEADERS had one more shared word
// than EQUIPMENT_HEADERS did — measured live: baker-county-eoc-bidset.pdf's
// own real DIFFUSER-GRILLE SCHEDULE (EQUIP NO/LOCATION/SERVICE/MANUFACTURER/
// MODEL/DESCRIPTION/MAX SOUND PRESSURE (dBA)/REMARKS) fell to "finish"-kind
// on this exact tie, invisible to buildPlanSetTakeoff's own equipment-only
// scope even after its rows extracted correctly. Restores the tie-break
// this file's own kind-classification comment already documents as the
// intended behavior ("ties favor the more specific vocab, equipment").
const EQUIPMENT_HEADERS = ["ID", "MARK", "SYMBOL", "TAG", "MODEL", "MANUFACTURER", "DESCRIPTION", "REMARKS", "VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "CFM", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "EWT", "LWT", "RPM", "ESP", "EQUIPMENT", "VELOCITY", "AIRFLOW", "SIZE", "FPM", "LENGTH", "TYPE", "MOUNTING", "CCT", "CRI", "DRIVER", "DIMMING", "LENS", "FINISH", "NOTES", "LUMENS", "SERVED", "PRESSURE"];
// Hoisted out of extractTableAt (module-level, not a local) so the
// structural "reference" pass (below extractAllTables) can check "would
// THIS candidate header already qualify under an EXISTING vocabulary" off
// the exact same single source of truth extractTableAt itself uses — a
// duplicated literal here would drift the day either changes, silently
// reopening the cross-kind-duplicate-extraction class of bug (commit
// 88344c9) for the new kind.
const ROOM_FINISH_REQUIRED = ["FLOOR", "BASE"];
const FINISH_REQUIRED = ["CODE", "MARK", "SYMBOL", "ID"];
// "EQUIPMENT" joined `required` itself (real, found live: itd-d1-lab-
// mechanical.pdf#14's own "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE" —
// AS-1/ET-1/FM-1/PF-1, real installed devices, real rows). This table's own
// real column HEADERS are SYMBOL/EQUIPMENT DESCRIPTION/SYSTEM SERVED/
// DESCRIPTION/MANUFACTURER AND MODEL — every real electrical/mechanical
// rating spec (the "80 GPM"/"1.0 FT-H2O"/"7.8 GALLON" numbers this vocabulary
// otherwise anchors on) sits inside the free-text DESCRIPTION cell's own
// paragraph, never heading its own column, so `required`'s existing rating-
// word bar (VOLTAGE/GPM/HP/…) can never fire — a structurally different,
// genuinely sparser real equipment-schedule shape than every other table
// this vocabulary was built against, not a shortcut around the bar.
// "EQUIPMENT" itself was already vocabulary (EQUIPMENT_HEADERS, added for
// the Canopy Hood Schedule's incidental "...ABOVE OPERATING EQUIPMENT"
// phrase) but never `required` — promoting it is safe on the SAME real-
// evidence standard CFM/RPM were deliberately kept OUT on: searched every
// real "SYMBOL/TAG/ID/MARK …-keyed" schedule header across this project's
// entire external corpus (bessemer, itd-d1-lab, federal-attachment4,
// baker-county-eoc, weld-county, tarrant-county — every real header row
// rendered/verified this session, not assumed) for a bare "EQUIPMENT"
// column word. It appears on exactly ONE other real header in the whole
// corpus (the Canopy Hood Schedule's own bare "EQUIPMENT" column, itd-d1-
// lab#12) — itself already independently equipment-kind via AIRFLOW/
// VELOCITY, so promoting EQUIPMENT changes nothing there. It appears on
// ZERO real finish-kind tables (Bessemer's Diffuser/Fan/Plumbing-Fixture
// schedules, D-1 Lab's own Diffuser/Grille/Sound-Attenuator/Penthouse/
// Louver schedules, Baker County's Luminaire schedule — none carry the
// word) — unlike CFM/RPM, which a real Fan Schedule DOES carry incidentally
// and which stay out of `required` for exactly that reason. A table
// literally naming its own row "EQUIPMENT" (as opposed to incidentally
// mentioning the word in running prose) is real, self-describing, cross-
// firm-generalizable evidence, the same class of signal CATALOG_ANCHOR_
// WORDS' own SYMBOL/TAG entries already rest on — not this one corpus's own
// invented vocabulary.
const EQUIPMENT_REQUIRED = ["VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "EWT", "LWT", "ESP", "AIRFLOW", "VELOCITY", "FPM", "EQUIPMENT"];
const ROOM_FINISH_MIN_HITS = 4;
const OTHER_KIND_MIN_HITS = 3;
// A header CELL is often a multi-word span ("FLOOR FINISH", "CEILING FINISH")
// — the vocabulary word inside it names the column.
/** A column anchor. `x` is the header's center. A two-tier SUB-column also
 * carries explicit bounds [x0, x1]: sub-columns under a merged parent are
 * equal-width by drafting convention, and bounds are the only honest way to
 * band them — nearest-center puts a left-aligned wall code in the BASE
 * column when BASE is narrow and the wall column is wide. */
type Anchor = { label: string; x: number; x0?: number; x1?: number };

const headerLabel = (s: string, vocab: string[]): string | null => headerLabels(s, vocab)[0] ?? null;
/** EVERY vocabulary word in a header cell, in order. A cell can name more than
 * one column's worth of vocabulary — "ROOM #" and "ROOM NAME" both lead with
 * ROOM — so the anchor builder falls through to the next word when the first
 * is already taken. Without that, the NAME column loses its anchor and the
 * room name merges into the finish column beside it. */
// A real drawn abbreviation dots every letter ("E.S.P", confirmed live on
// the federal-mech AHU Unit Schedule's own header) — splitting on every
// non-letter character shatters that into "E"/"S"/"P", never the vocabulary
// word "ESP" (accuracy-hardening plan Phase 3, ledger item 6). Strip ONLY a
// dot sitting strictly between two lone letters (an acronym contraction),
// never an ordinary trailing abbreviation period ("NO.") — the lookbehind/
// lookahead both require a word-boundary immediately outside the letter, so
// "NO." (O preceded by N, no boundary) is left alone while "E.S.P" (every
// letter isolated by dots) collapses to "ESP".
const ACRONYM_DOT_RE = /(?<=\b[A-Z])\.(?=[A-Z]\b)/g;
// A real drawn header carries its own drafting typo (found live: Baker
// County EOC's own real "ROOM FINISH SCHEDULE" prints "CEILIING FINISH",
// a doubled I) — the doubled letter defeats an exact vocabulary match
// entirely, so that column's own real anchor silently falls back to
// whatever the nearest OTHER already-used anchor happens to be (measured:
// its cells landed under a re-used "NORTH" label, not its own real
// "CEILING" one). Narrowly targeted at this ONE confirmed real typo — not
// a general fuzzy-match/typo-tolerance pass, which risks merging two
// genuinely different vocabulary words that happen to share letters.
const headerLabels = (s: string, vocab: string[]): string[] => {
  const out: string[] = [];
  const collapsed = norm(s).replace(ACRONYM_DOT_RE, "").replace(/\bCEILIING\b/g, "CEILING");
  for (const w of collapsed.split(/[^A-Z]+/)) if (w && vocab.includes(w) && !out.includes(w)) out.push(w);
  return out;
};

// A real, found-live false-positive: baker-county-eoc's own sheet #27 draws a
// free-text FINISH LEGEND (ACCESSORIES/BASE & TRIM/CEILING/FLOORING/WALLS —
// per-material spec prose, "STYLE: LVT", "COLLECTION: iD LATITUDE STONE &
// CONCRETE", "MANUFACTURER: ALTRO TEGULIS", "COLOR: ...", "SKU: ...") beside
// the sheet's own real ROOM FINISH SCHEDULE. That legend's field-label prose
// uses the SAME words FINISH_HEADERS needs to recognize a real schedule
// column (STYLE/COLOR/SIZE/MANUFACTURER/MATERIAL/PRODUCT/PATTERN/ID…) — an
// inherent vocabulary overlap a real material schedule and a real material
// LEGEND both have, unlike prior title/row bleed fixes. Row-clustering
// (clusterRows, y-coincidence, the same mechanism ledger item 5 already
// diagnosed for title-hunt) glommed several unrelated legend entries onto one
// row, and `qualifies()` (3+ distinct hits) fired on it as if it were a real
// header, extracting a 5-row garbage "finish" table with a blank title (no
// real title exists to find — this was never a table) whose cells bled real
// ROOM FINISH SCHEDULE text in from the adjacent, correctly-extracting table
// ("109 IDF RF-2 110 UTILITIES RF-2" measured live inside a bogus
// MANUFACTURER cell).
//
// The narrow, precise signal that separates the two, confirmed against every
// real header row measured this session (room-finish's own NUMBER/ROOM NAME/
// FLOOR FINISH/.../COUNTERTOPS; DIFFUSER-GRILLE's TYPE/DESCRIPTION/MOUNTING/
// .../MANUFACTURER SERIES; PLUMBING FIXTURE's MARK/DESCRIPTION/MAKE AND
// MODEL/REMARKS): a genuine header CELL is always just the column's own
// name — never a colon followed by that column's own VALUE fused into the
// same span. The legend's own field-label prose draws exactly that shape
// ("COLLECTION: iD LATITUDE STONE & CONCRETE", "MANUFACTURER: ALTRO
// TEGULIS") — a colon with real trailing content is field-label:value prose,
// not a column name. A bare trailing colon with nothing after it ("STYLE:",
// "REMARKS:" — the latter's own trailing-footnote convention is already
// handled elsewhere, item 29) is left alone; only "label: value" is rejected,
// keeping this scoped to the one real shape measured, not a blanket ban on
// any header cell that happens to carry a colon.
const LABEL_VALUE_COLON_RE = /:\s*\S/;

/** The vocabulary labels a row carries, in x order (duplicates kept — two
 * columns can both be headed FINISH, one under FLOOR and one under CEILING). */
function headerHits(row: GraphSpan[], vocab: string[]): Array<{ label: string; span: GraphSpan }> {
  const out: Array<{ label: string; span: GraphSpan }> = [];
  for (const t of row) {
    if (LABEL_VALUE_COLON_RE.test(t.str)) continue;
    const w = headerLabel(t.str, vocab);
    if (w) out.push({ label: w, span: t });
  }
  return out.sort((a, b) => a.span.x - b.span.x);
}
const qualifies = (hits: Array<{ label: string }>, required: string[], minHits: number) => {
  const seen = new Set(hits.map((h) => h.label));
  return seen.size >= minHits && required.some((r) => seen.has(r));
};

/** A real 3-tier header can wrap a merged parent's sub-labels onto their OWN
 * line below the header ("MODEL" / "NUMBER", "AIR FLOW" / "(CFM)", "DUCT" /
 * "CONNECTION" / "(IN)" — confirmed live on the Bessemer sample's Fan
 * Schedule). That line carries ZERO vocabulary hits — "NUMBER", "(CFM)",
 * "CONNECTION" name nothing in FINISH_HEADERS/ROOM_HEADERS — so the
 * tier-descent loop above never recognizes it as a header row, and treating
 * it as the first DATA row is just as wrong: its leading token ("NUMBER")
 * passes rowKeyOf's generic CODE_RE and mints a fake schedule row. CODE_RE
 * can't be tightened to require a digit as a shortcut fix — real MEP tags
 * without one exist ("CW" for cold water) and that would just trade this
 * false positive for a false negative on those.
 *
 * Recognize the wrapped line by SHAPE instead of vocabulary: it sits at a
 * tight, single-line-height gap below the row above it (a real data row
 * normally starts after more vertical breathing room than one wrapped label
 * needs from the next), and it carries no digit anywhere (a real schedule
 * row's data cells — quantities, model numbers, electrical specs — almost
 * always do; a fragment like "(CFM)" or "PHASE" never does). Bounded to a
 * couple of rows: a 3-tier header wraps at most that far.
 *
 * Phase 5 correction: a bare vocabulary hit on the next row is still treated
 * as "this is a real header, not a continuation" — but a hit that is only a
 * PARENTHESIZED unit fragment is not. Found live on the Bessemer sample's
 * "VARIABLE REFRIGERANT PACKAGED HEAT PUMP" table: its own 3rd tier reads
 * "(MBH) (MBH) (WATTS)" — under EQUIPMENT_HEADERS, "MBH" and "WATTS" ARE
 * real vocabulary words (they have to be, to recognize a genuine "WATTS"
 * column header elsewhere), so the original zero-hits assumption stops
 * holding the moment a kind's own vocabulary includes its own unit words.
 * The distinguishing shape is still there, just one layer down: a real
 * column header is a bare word ("VOLTAGE", "MODEL"); a wrapped unit is
 * parenthesized. Only a BARE hit stops the skip now.
 *
 * DISCLOSED, NOT FIXED (federal-mech CH-1, sheet #14's own CHILLER SCHEDULE
 * (ELECTRIC AIR-COOLED) — the real, precise reason table DISCOVERY reaching
 * this candidate, per the headerQualifies comment above extractTableAt,
 * still never recovers it): the "bounded to a couple of rows" assumption
 * this function's own header comment states outright is violated by this
 * ONE real table, measured directly against the live PDF. Its real header is
 * NINE physical lines below the title (clusterRows count, RENDER_SCALE=2
 * image-px), FIVE of them below the TAG-bearing anchor row this function
 * starts scanning from — not the "couple" this function is designed for —
 * and at least three of those five deep sub-tier rows carry a BARE (non-
 * parenthesized) leaf label that is ALSO a top-level EQUIPMENT_HEADERS word
 * on its own merits: "TONS" (leaf of "MINIMUM NET COOLING CAPACITY
 * (TONS)"), "GPM" (leaf of "DESIGN WATER FLOW"), "TYPE"/"VOLTAGE"/"PHASE"
 * (leaves of "STARTER TYPE"/"MAX KW AT VOLTAGE"/"PHASE"). Each one trips
 * this function's own bareHit stop on the FIRST sub-tier row it looks at,
 * so `dataFrom` lands 3-4 real header lines early, on a still-header row —
 * confirmed directly (runtime trace): every candidate anchor set this table
 * ever builds passes the equipment catalog-anchor gate (TAG is real and
 * present), so headerQualifies never rejects it, yet the row `dataFrom`
 * points at is never the real data row, so zero valid keyed rows are ever
 * read and the whole table is silently dropped as empty — invisible even to
 * the vocabulary-free "reference" fallback below (its own header block, at
 * 9 raw lines, exceeds MAX_GENERIC_HEADER_LINES=6 too). Separately,
 * harvestGeometricSubTiers (called after this function, from `idx + 1`,
 * MAX_ROWS=15) DOES walk deep enough to mine real anchors from those same
 * sub-tier rows — but `dataFrom` is computed HERE, earlier, and independent
 * of what that harvest actually consumes, so a fuller anchor set changes
 * nothing about where the data scan starts. A real fix needs `dataFrom` to
 * track how far the anchor harvest actually walked (monotonic-extend only,
 * never earlier than this function's own value, to avoid moving any
 * already-correct table's boundary backward) rather than being computed
 * independently and first. NOT attempted this session: this function and
 * harvestGeometricSubTiers are the shared spine of EVERY equipment-kind
 * table in the corpus, and this exact file already has a direct precedent
 * (harvestGeometricSubTiers' own comment, "orphan leaf column harvester")
 * of a locally-correct deep-tier extension being reverted after a full
 * corpus sweep caught it silently breaking a different real table elsewhere
 * — real, disclosed corpus-wide risk, not a narrow one-line change. */
function skipSubHeaderContinuation(rows: GraphSpan[][], vocab: string[], from: number): number {
  let i = from;
  for (let n = 0; n < 3 && i < rows.length - 1; n++) {
    const cur = rows[i], next = rows[i + 1];
    const bareHit = headerHits(next, vocab).some((h) => !/^\(.*\)$/.test(h.span.str.trim()));
    if (bareHit) break;
    if (next.some((t) => /\d/.test(t.str))) break;
    const h = cur.reduce((s, t) => s + (t.h || 8), 0) / cur.length;
    if (rowY(next) - rowY(cur) > h * 2) break;
    i++;
  }
  return i;
}

// ── backward co-equal-tier merge (maturity plan Phase 0 follow-up) ─────────
// An equipment table's key/catalog columns (ID, MANUFACTURER, MODEL…) and
// its rating columns (VOLTAGE, PHASE, AMPS…) sometimes sit on two SEPARATE
// header rows that are each too sparse to independently qualify under
// findHeaderRow's own required-list test — found live on the Bessemer
// sample's "VARIABLE REFRIGERANT PACKAGED HEAT PUMP" table (HP-1): a bare
// ID / "MANUFACTURER MODEL NUMBER" row sits directly above a bare CFM/ESP/
// VOLTAGE/PHASE/AMPS/MOCP row, and neither independently qualifies, so the
// tier-descent loop above (which only ever looks DOWN) anchors on the lower
// tier alone, with no usable key column.
//
// This is a DIFFERENT shape than the three-tier PARENT-over-CHILD descent
// above: there, the parent tier carries no usable key column and the child
// DOES; here, BOTH halves of the key/rating split sit on separate rows and
// NEITHER carries a usable key column alone. Reach upward only when the
// settled row has none of the generic catalog words itself, search the
// exact physical proximity budget parentLabelOver already uses (a genuine
// split header sits close; a coincidentally-nearby unrelated row does not),
// and only take a candidate row that could NOT independently qualify as its
// own header — otherwise this would eat a real, separate table's header.
// "TYPE" (a real, standard MEP row-key convention — see the bareLeadingType
// check in extractTableAt, ledger item 63) is deliberately NOT a member of
// this list: unlike ID/MARK/CODE/SYMBOL/TAG, "TYPE" is just as commonly a
// QUALIFIER inside some OTHER column's own compound header ("FAN TYPE",
// "VALVE TYPE") as it is a genuine key column on its own — adding it here
// widened "already has a key column" to those qualifiers too and lost a
// real table (federal-attachment4-mechanical.pdf#14's own "AIR HANDLING
// UNIT FAN SCHEDULE", keyed under TAG; its "FAN TYPE" column anchors as
// bare "TYPE" and tripped this exact gate). extractTableAt's own final gate
// recognizes a genuinely TYPE-keyed table (baker-county-eoc-bidset.pdf#59's
// LUMINAIRE SCHEDULE) a different, position-based way instead — see its
// bareLeadingType comment for the real reasoning.
const CATALOG_ANCHOR_WORDS = ["ID", "MARK", "CODE", "SYMBOL", "TAG", "DESIGNATION"];

/** ITEM NO. / EQUIP NO. — own-identity key columns on VA / federal CUP
 * schedules (Las Vegas CUP PUMP / COOLING TOWER). Kept OUT of
 * CATALOG_ANCHOR_WORDS so bare ITEM/EQUIP never trip mergeBackward /
 * finish vocab; matched only as the compound forms below. */
const ITEM_NO_HEADER_RE = /^(?:ITEM|EQUIP\.?|EQUIPMENT)\s*(?:NO\.?|NUMBER|#)$/i;
/** UNIT TAG / UNIT NO — own-identity on bulk school/courthouse schedules. */
const UNIT_TAG_HEADER_RE = /^UNIT\s*(?:TAG|NO\.?|NUMBER|#)$/i;

function isItemNoHeader(text: string | null | undefined): boolean {
  return ITEM_NO_HEADER_RE.test(norm(text || "").replace(/\s+/g, " ").trim());
}

function isUnitTagHeader(text: string | null | undefined): boolean {
  return UNIT_TAG_HEADER_RE.test(norm(text || "").replace(/\s+/g, " ").trim());
}

function isOwnIdentityEquipmentHeader(text: string | null | undefined): boolean {
  return isItemNoHeader(text) || isUnitTagHeader(text);
}

/** True when a header IS a bare catalog-anchor word (after `norm`) — the
 * row's OWN identity column, the same catalog-anchor bar every
 * equipment-kind table already keys off of. */
export function isBareAnchorHeader(header: string | null | undefined): boolean {
  if (CATALOG_ANCHOR_WORDS.includes(norm(header || ""))) return true;
  return isOwnIdentityEquipmentHeader(header);
}

/** True when a header carries a catalog-anchor word ALONGSIDE another word
 * ("UNIT MARK", "VALVE MARK") rather than standing alone — a QUALIFIED
 * anchor names a cross-reference to some OTHER row's own mark (whichever
 * unit the qualifying word points at), not this row's own identity. Same
 * real distinction extractTableAt's own bareLeadingType comment already
 * draws for "TYPE" vs "FAN TYPE"/"VALVE TYPE" (a qualifier is just as
 * often folded into someone else's compound header as it is a genuine key
 * column on its own) — generalized here for sweepScheduleRow's own
 * primary-row-vs-accessory-row question (a schedule row ABOUT this tag's
 * own device vs. a row ABOUT some other device that happens to serve it). */
export function isQualifiedAnchorHeader(header: string | null | undefined): boolean {
  const h = norm(header || "");
  if (!h || CATALOG_ANCHOR_WORDS.includes(h)) return false;
  // ITEM NO / EQUIP NO / UNIT TAG are own-identity, not UNIT MARK-style
  // cross-references.
  if (isOwnIdentityEquipmentHeader(h)) return false;
  const toks = h.split(/\s+/).filter(Boolean);
  return toks.length > 1 && toks.some((t) => CATALOG_ANCHOR_WORDS.includes(t));
}

/** Anchors for a backward-merged tier's own row — like headerHits, but a
 * span naming MORE than one vocabulary word ("MANUFACTURER MODEL NUMBER")
 * gets one anchor PER word, each placed at its own proportional offset
 * within the span rather than all stacked on the span's single center — a
 * genuinely merged catalog cell spans more than one column, and headerHits/
 * headerLabel only ever take the FIRST vocabulary word per span (by design
 * — see headerLabels' own comment), so a plain hit here would swallow every
 * later cell it names. Scoped to the backward-merge path only (this
 * function's one caller); every other header path keeps headerHits' one-
 * anchor-per-span behavior unperturbed. */
function splitMergedHeaderCells(row: GraphSpan[], vocab: string[]): Anchor[] {
  const out: Anchor[] = [];
  const used = new Set<string>();
  for (const t of row) {
    const words = headerLabels(t.str, vocab);
    if (words.length === 0) continue;
    if (words.length === 1) {
      if (used.has(words[0])) continue;
      used.add(words[0]);
      out.push({ label: words[0], x: t.x + (t.w || 0) / 2 });
      continue;
    }
    const text = norm(t.str);
    // "X AND Y" — a real connective-joined phrase ("MANUFACTURER AND MODEL",
    // itd-d1-lab-mechanical.pdf's own EXHAUST FAN/ELECTRIC HEATER SCHEDULEs)
    // — names ONE real column, not two: unlike this function's own
    // motivating case above ("MANUFACTURER MODEL NUMBER", Bessemer's real
    // HP-1 — no connective, two genuinely distinct real values, MANUFACTURER
    // "FRIEDRICH" next to MODEL "VRP24K75FRBLAA"), a bare "AND" sitting
    // between two vocabulary words is drafting shorthand for a single
    // combined field ("COOK MODEL GC-148" as one whole cell). Splitting it
    // the same way HP-1 needs mints a phantom second column with no data of
    // its own: the real data then needs an impossible second cluster to
    // complete a column map, and column-of's own nearest-anchor fallback
    // measures it against an anchor position dragged toward the (nonexistent)
    // second column — refusing it outright as an anomalously-wide gap from
    // unrelated columns nearby (see anchorRadii). Scoped to literally " AND "
    // sitting between the two words' own text positions, nothing looser.
    const groups: string[][] = [[words[0]]];
    let scanFrom = 0;
    for (let k = 1; k < words.length; k++) {
      const prevWord = words[k - 1];
      const prevAt = text.indexOf(prevWord, scanFrom);
      const wordAt = text.indexOf(words[k], prevAt + prevWord.length);
      const between = prevAt >= 0 && wordAt >= 0 ? text.slice(prevAt + prevWord.length, wordAt).trim() : "";
      if (between === "AND") groups[groups.length - 1].push(words[k]);
      else groups.push([words[k]]);
      scanFrom = prevAt >= 0 ? prevAt + prevWord.length : scanFrom;
    }
    for (const g of groups) {
      const label = g[0];
      if (used.has(label)) continue;
      used.add(label);
      const first = text.indexOf(g[0]);
      const last = text.indexOf(g[g.length - 1], first);
      const frac = first >= 0 && last >= 0
        ? (first + last + g[g.length - 1].length) / 2 / Math.max(text.length, 1)
        : 0.5;
      out.push({ label, x: t.x + frac * (t.w || 0) });
    }
  }
  return out;
}

function mergeBackwardCoEqualTier(
  rows: GraphSpan[][], vocab: string[], hdrIdx: number,
  hits: Array<{ label: string; span: GraphSpan }>, required: string[], minHits: number,
): { anchors: Anchor[]; topIdx: number } | null {
  if (hits.some((h) => CATALOG_ANCHOR_WORDS.includes(h.label))) return null;   // already has a key column
  const hs = rows[hdrIdx].map((t) => t.h || 8).sort((a, b) => a - b);
  const near = Math.max(24, (hs[hs.length >> 1] || 8) * 4);
  const hy = rowY(rows[hdrIdx]);
  const floor = Math.max(0, hdrIdx - 8);
  for (let j = hdrIdx - 1; j >= floor; j--) {
    if (hy - rowY(rows[j]) > near) break;
    const h = headerHits(rows[j], vocab);
    if (!h.some((x) => CATALOG_ANCHOR_WORDS.includes(x.label))) continue;
    if (qualifies(h, required, minHits)) continue;   // could stand as its own header — not ours to absorb
    return { anchors: splitMergedHeaderCells(rows[j], vocab), topIdx: j };
  }
  return null;
}

/** Forward co-equal-tier merge — the natural complement to
 * mergeBackwardCoEqualTier, for the OTHER real multi-tier shape found live
 * (AHU-1's own AIR HANDLING UNIT SCHEDULE, itd-d1-lab-mechanical.pdf#15): a
 * single, uncontested table whose real header wraps across MANY consecutive
 * physical tiers, each one independently qualifying on its own and each
 * naming a DIFFERENT slice of the real column set — SUPPLY FAN's own TYPE/
 * ESP/TSP/HP/RPM sits on one physical line, DX COOLING COIL's own CAPACITY/
 * EAT/LAT sits on the line just above it, MIN O.S.A./AHRI EER/OPERATING
 * WEIGHT sit on lines above THAT — rather than one tier being a strict
 * superset of the last. findHeaderRow's own descent loop above assumes the
 * OPPOSITE shape: a deeper tier REPLACES a shallower one. Real columns from
 * every tier must UNION, not replace — a genuinely different merge shape
 * than either the descent loop or the backward merge above.
 *
 * Bounded the same way every other tier-merge helper in this file already
 * reasons about "still the same header block": step-to-step proximity (a
 * tight, real single-line-height gap) and a hard stop the instant a row
 * carries a digit (skipSubHeaderContinuation's own established signal).
 *
 * Returns the last row index it actually ABSORBED as a real, independently-
 * qualifying tier — not merely the last row it looked at within the
 * proximity budget. This distinction is load-bearing: a row inside the
 * budget that does NOT independently qualify (a bare group-label row like
 * "SUPPLY FAN", or — real regression, caught live on bessemer's HP-1 table —
 * a wrapped parenthesized-unit continuation tier like "(MBH) (MBH) (WATTS)",
 * which skipSubHeaderContinuation/harvestSkippedTierAnchors below are the
 * established mechanism for reading) must be left exactly where it was for
 * that downstream mechanism to still find it. An earlier version returned
 * the last row merely WALKED PAST (qualifying or not) — findHeaderRow's own
 * skipEnd/harvestSkippedTierAnchors calls then resumed scanning ONE ROW TOO
 * LATE, silently skipping over the very row harvestSkippedTierAnchors exists
 * to read, and HP-1 lost its HEATING MBH/COOLING MBH columns outright. The
 * walk itself still advances through a non-qualifying row (so a real group-
 * label line between two genuine tiers doesn't stop the search early) — only
 * the RETURNED resume point is held back to the last genuinely-absorbed row.
 *
 * A row that carries its OWN catalog/key word (SYMBOL/MARK/ID/TAG/CODE — the
 * same CATALOG_ANCHOR_WORDS mergeBackwardCoEqualTier already gates on) is a
 * SEPARATE table's own header row, not a further tier of THIS one — this
 * table's own key column was already established back at the originally
 * settled row (or via the backward merge above), and a real continuation
 * tier never reintroduces it. A hard stop here, not a `continue`: once a
 * real neighboring table's own header is reached, nothing genuine for THIS
 * table lies beyond it either.
 *
 * NOT a defense, on its own, against two independently-drafted tables
 * sharing a Y-band on an unsplit 2-up sheet (their rows can interleave into
 * the SAME row-cluster with no separate foreign row, and no reintroduced
 * catalog word, to catch) — real, found live on itd-d1-lab-mechanical.
 * pdf#13. That shape is handled at the caller (findHeaderRow, via
 * ExtractOpts' own `noForwardTierMerge`), not here: this function's own
 * per-row signals (proximity, digit, catalog word) are real and worth
 * keeping for the single-table case they DO correctly bound, but a genuinely
 * MIXED row defeats all three at once (real, small, per-row hits; no digit;
 * tight gap) with no further local signal left to tell it apart — see
 * `noForwardTierMerge`'s own comment for why the real fix is scoping WHEN
 * this merge runs at all, not adding a fourth local heuristic here. */
function mergeForwardCoEqualTier(
  rows: GraphSpan[][], vocab: string[], topIdx: number, fromIdx: number,
  anchors: Anchor[], used: Set<string>, required: string[], minHits: number,
): number {
  let last = fromIdx;
  let consumed = fromIdx;
  for (let j = fromIdx + 1; j < rows.length; j++) {
    const h = rows[last].reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, rows[last].length);
    if (rowY(rows[j]) - rowY(rows[last]) > h * 2) break;
    if (rows[j].some((t) => /\d/.test(t.str))) break;
    const hits = headerHits(rows[j], vocab);
    if (hits.some((x) => CATALOG_ANCHOR_WORDS.includes(x.label))) break;
    if (qualifies(hits, required, minHits)) {
      for (const hh of hits) {
        let label = hh.label;
        if (used.has(label)) {
          // A duplicate LEAF label here (a second "CFM", "MBH", "TYPE") needs
          // its own equipment sub-system's GROUP name to disambiguate — see
          // nearestGroupLabelAbove's own comment for why parentLabelOver
          // (vocabulary-only) can't serve here. The candidate window is
          // capped at topIdx (never wanders into rows AT or below it): rows
          // from topIdx down are SIBLING leaf/qualifying tiers, not group
          // tiers — confirmed live, a wrong guess otherwise.
          const cx = hh.span.x + (hh.span.w || 0) / 2;
          const parent = nearestGroupLabelAbove(rows, vocab, topIdx, cx);
          if (parent) label = `${parent} ${hh.label}`;
        }
        if (used.has(label)) continue;
        used.add(label);
        anchors.push({ label, x: hh.span.x + (hh.span.w || 0) / 2 });
      }
      consumed = j;
    }
    last = j;
  }
  return consumed;
}

/** Nearest all-caps, NON-vocabulary text ABOVE `ceilIdx` that is itself
 * UNIQUE within a real PHYSICAL PROXIMITY budget — mergeForwardCoEqualTier's
 * own group-label disambiguator. The budget itself reuses
 * mergeBackwardCoEqualTier's own established "still the same header block"
 * distance, not a fresh guess — searching by ROW COUNT (or worse, from the
 * whole sheet's own row 0) risks wandering into a totally unrelated block: a
 * real, found-live false match on this exact fixture, where an unbounded
 * upward scan reached all the way past the group tier to the TABLE'S OWN
 * TITLE row and used that as a "parent" instead, simply because the title
 * text was closer in x than the real group label happened to be for one
 * specific duplicate. A repeated candidate ("CAPACITY", recurring under
 * several real sub-systems) cannot itself disambiguate anything, so only a
 * text that appears exactly once in the budget is eligible. Closest by
 * horizontal distance wins among the unique candidates — no x pitch cutoff,
 * because a real equipment GROUP title routinely spans much wider than the
 * single sub-column pitch its own leaf labels sit at (measured live: "GAS
 * HEATING COIL" spans ~600px over columns spaced ~80px apart) — an unrelated
 * candidate is already excluded by needing to be unique in the (now tight)
 * budget, not by an arbitrary x distance bound. */
function nearestGroupLabelAbove(rows: GraphSpan[][], vocab: string[], ceilIdx: number, cx: number): string | null {
  const hs = rows[ceilIdx].map((t) => t.h || 8).sort((a, b) => a - b);
  const near = Math.max(24, (hs[hs.length >> 1] || 8) * 4);
  const hy = rowY(rows[ceilIdx]);
  const floor = Math.max(0, ceilIdx - 8);
  const candCount = new Map<string, number>();
  const toks: Array<{ text: string; cx: number }> = [];
  for (let j = ceilIdx - 1; j >= floor; j--) {
    if (hy - rowY(rows[j]) > near) break;
    for (const t of rows[j]) {
      if (headerLabel(t.str, vocab)) continue;   // must be non-vocabulary
      const s = norm(t.str);
      if (s.length < 2 || !/^[A-Z][A-Z0-9 /&.'-]*$/.test(s)) continue;
      candCount.set(s, (candCount.get(s) || 0) + 1);
      toks.push({ text: s, cx: t.x + (t.w || 0) / 2 });
    }
  }
  let parent: string | null = null;
  let best = Infinity;
  for (const t of toks) {
    if ((candCount.get(t.text) || 0) > 1) continue;   // ambiguous itself — not a real disambiguator
    const d = Math.abs(t.cx - cx);
    if (d < best) { best = d; parent = t.text; }
  }
  return parent;
}

/** Vocabulary hits inside the header's own wrapped/parenthesized continuation
 * tiers name real columns too ("(MBH)", "(WATTS)") — skipSubHeaderContinuation
 * correctly recognizes these rows as part of the header block (not data), but
 * on its own leaves them un-anchored, so the data row below fills those
 * columns from whatever nearest anchor is left over — see
 * EQUIPMENT_HEADERS' and skipSubHeaderContinuation's own comments for the
 * real HP-1 case this was found on. A duplicate parenthesized label ("(MBH)"
 * appearing twice, for HEATING and COOLING) is disambiguated by the nearest
 * all-caps, non-vocabulary token above whose own text is UNIQUE within the
 * search window — a repeated generic sub-label ("CAPACITY", which recurs
 * under all three of HEATING/COOLING/COIL on the real fixture) cannot itself
 * disambiguate anything, so only a text that appears exactly once nearby is
 * eligible; "HEATING"/"COOLING" are exactly that on the real fixture,
 * verified against the real spans, not invented. No qualifying parent, no
 * anchor: an unexplained parenthesized fragment never mints a column. */
function harvestSkippedTierAnchors(rows: GraphSpan[][], vocab: string[], hdrIdx: number, skipEnd: number): Anchor[] {
  const hits: Array<{ label: string; span: GraphSpan; rowIdx: number }> = [];
  const counts = new Map<string, number>();
  for (let i = hdrIdx + 1; i <= skipEnd && i < rows.length; i++) {
    for (const t of rows[i]) {
      const w = headerLabel(t.str, vocab);
      if (!w) continue;
      hits.push({ label: w, span: t, rowIdx: i });
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  const out: Anchor[] = [];
  const used = new Set<string>();
  for (const h of hits) {
    let label = h.label;
    if ((counts.get(h.label) || 0) > 1) {
      const cx = h.span.x + (h.span.w || 0) / 2;
      const rowCx = rows[h.rowIdx].map((t) => t.x + (t.w || 0) / 2).sort((a, b) => a - b);
      const gaps = rowCx.slice(1).map((x, i) => x - rowCx[i]);
      // Genuine median, not always the upper-middle element — see bandLimits'
      // own comment for the full real-corpus regression this exact idiom
      // (`gaps.length >> 1`) causes for the most common even case, exactly 2
      // gaps: it always lands on the LARGER of the two, an outlier neighbor
      // gap masquerading as "typical pitch" and inflating this radius far
      // past any real disambiguation distance.
      const halfPitch = gaps.length ? gaps.sort((a, b) => a - b)[(gaps.length - 1) >> 1] / 2 : 150;
      const floor = Math.max(0, h.rowIdx - 4);
      const candCount = new Map<string, number>();
      const toks: Array<{ text: string; cx: number }> = [];
      for (let j = floor; j < h.rowIdx; j++) {
        for (const t of rows[j]) {
          if (headerLabel(t.str, vocab)) continue;   // must be non-vocabulary
          const s = norm(t.str);
          if (!/^[A-Z][A-Z ]*$/.test(s)) continue;    // an all-caps word/phrase
          candCount.set(s, (candCount.get(s) || 0) + 1);
          toks.push({ text: s, cx: t.x + (t.w || 0) / 2 });
        }
      }
      let parent: string | null = null;
      let best = Infinity;
      for (const t of toks) {
        if ((candCount.get(t.text) || 0) > 1) continue;   // ambiguous itself — not a real disambiguator
        const d = Math.abs(t.cx - cx);
        if (d <= halfPitch && d < best) { best = d; parent = t.text; }
      }
      if (!parent) continue;
      label = `${parent} ${h.label}`;
    }
    if (used.has(label)) continue;
    used.add(label);
    out.push({ label, x: h.span.x + (h.span.w || 0) / 2 });
  }
  return out;
}

/** A row can carry enough DISTINCT header vocabulary to read as a real
 * header line (SYMBOL/MANUFACTURER/REMARKS/…) while its own REQUIRED rating
 * word sits alone on a thin, parenthesized-unit tier just below it, never
 * co-occurring with any of the row's other header words. Real, corpus-found
 * (itd-d1-lab-mechanical.pdf#13's own "CONTROL VALVE SCHEDULE (HOT WATER
 * REHEAT COILS)": SYMBOL/AREA SERVED/VALVE TYPE/OPERATION/FLUID/MANUFACTURER
 * AND MODEL/REMARKS all sit on ONE line — 4 distinct EQUIPMENT_HEADERS hits,
 * clearing minHits — but GPM (the table's only EQUIPMENT_REQUIRED word)
 * never appears on that line, only two tiers down as bare "(GPM)" units
 * with nothing else in EQUIPMENT_HEADERS' vocabulary beside it. Under the
 * OLD single-row qualify() gate that table's equipment-kind header was
 * invisible outright — found only under FINISH_HEADERS (whose required list
 * is satisfied by the bare SYMBOL alone), then correctly discarded there by
 * isNonFinishSchedule ("COIL" in the title), losing the table completely.
 *
 * Deliberately reuses skipSubHeaderContinuation's OWN walk verbatim (same
 * three conditions: no BARE vocabulary hit on the next row, no digit
 * anywhere in it, gap no more than 2x the current row's own average cell
 * height) rather than a fresh distance heuristic — that walk is the file's
 * own already-proven test for "is the NEXT row still part of THIS header
 * block's own continuation, or something else" (it already gates
 * `dataFrom`). A first version of this fix used a standalone `near`-px
 * radius instead and reached into an unrelated NEIGHBORING table's own
 * header on a dense sheet — real regression, caught by this file's own
 * standing test suite (bessemer's "Fan Schedule does not double-extract...
 * via a bare RPM hit", Finding 1): Fan Schedule's bare ID/DESCRIPTION/
 * MANUFACTURER/MODEL/RPM row sits close enough, by raw px, to a genuine
 * EQUIPMENT_REQUIRED word on the Diffuser/Grille/Register table right next
 * to it that the loose radius credited it as "nearby" even though the two
 * are unrelated tables, not tiers of one header. The continuation walk does
 * not have this problem: a genuinely unrelated neighboring table's header
 * row is either a BARE vocabulary hit (a real header of its OWN, not a
 * wrapped unit line) or separated by more than a header-tier-scale gap, so
 * it stops the walk before ever reaching it. This only ever RELAXES the
 * `required` half of qualifies() — a row still needs minHits of its OWN
 * bare vocabulary before this is even consulted, so a random data row or
 * neighboring table can't manufacture a header out of nothing. */
function nearbyRequiredHit(rows: GraphSpan[][], vocab: string[], required: string[], from: number): boolean {
  let i = from;
  for (let n = 0; n < 3 && i < rows.length - 1; n++) {
    const cur = rows[i], next = rows[i + 1];
    const bareHit = headerHits(next, vocab).some((h) => !/^\(.*\)$/.test(h.span.str.trim()));
    if (bareHit) break;
    if (next.some((t) => /\d/.test(t.str))) break;
    const h = cur.reduce((s, t) => s + (t.h || 8), 0) / cur.length;
    if (rowY(next) - rowY(cur) > h * 2) break;
    if (headerHits(next, vocab).some((x) => required.includes(x.label))) return true;
    i++;
  }
  return false;
}

/** A wider fallback for the same question `nearbyRequiredHit` asks — real,
 * corpus-found gap: a genuinely DEEP multi-tier equipment header (itd-d1-
 * lab-mechanical.pdf#12's own "PRESSURE INDEPENDENT GENERAL EXHAUST VALVE
 * SCHEDULE"/GEV-1..7, "…SNORKEL EXHAUST VALVE SCHEDULE"/SEV-1..5, "SNORKEL
 * HOOD SCHEDULE"/SN-1..5) can carry its own REQUIRED rating word (AIRFLOW,
 * VELOCITY, FPM) several REAL tiers away from the row that anchors its
 * SYMBOL/TYPE/MANUFACTURER/REMARKS columns — sometimes ABOVE the anchor
 * (a parent-tier rating label), not only below — with genuinely OTHER
 * header-shaped tiers in between (MANUFACTURER, "AND MODEL" wrapping to its
 * own bare MODEL hit, VALVE, RANGE, …), not bare unit fragments.
 * `nearbyRequiredHit`'s own one-direction, 3-row window, built to stay
 * narrow specifically by breaking on ANY bare vocabulary hit (see its own
 * comment — the Fan/Diffuser regression that shape prevents), breaks on the
 * very first such real tier and never reaches the required word at all.
 *
 * This widens the reach — more rows, plus the catalog-word/title stops
 * below — but stays BACKWARD-ONLY, deliberately, not the symmetric both-
 * directions walk a first version of this fix tried. Real, corpus-found
 * live testing that version against this file's own standing regression
 * suite: a genuine multi-tier equipment header's REQUIRED word can sit
 * either above OR below its anchor row (GEV's own AIRFLOW sits above; the
 * real "LAB EXHAUST FAN SCHEDULE"'s own ESP sits below) — but Bessemer's
 * own real "FAN SCHEDULE" (a legitimate finish-kind diffuser/grille/
 * register table, not HVAC fan equipment — see isNonFinishSchedule's own
 * "FAN" comment) carries an EQUALLY real, EQUALLY-shaped electrical rating
 * tier (VOLTS/PHASE/WATTS) a few rows BELOW its own anchor too. Structurally
 * these are the SAME shape — a real multi-tier header, its required word a
 * genuine tier away, no catalog word or digit in between — so no per-row
 * signal this function can see distinguishes "GEV's own real AIRFLOW tier"
 * from "Fan Schedule's own real WATTS tier" in the forward direction; only
 * the DOMAIN FACT that Bessemer's Fan Schedule specifically must stay
 * finish-kind (a business rule, not a shape difference) tells them apart,
 * and that fact lives in the standing test, not in any header geometry.
 * Restricting to backward-only is what actually keeps that regression
 * fixed: Fan Schedule's own title sits directly ABOVE its anchor (blocked
 * by the SCHEDULE-word stop before the walk ever reaches anything), while
 * its own problem tier sits below — a forward walk reaches it, a backward
 * one never does. The real cost: a real table whose OWN required word sits
 * only forward of its anchor (LAB EXHAUST FAN SCHEDULE/LEF-1, confirmed
 * live) stays unrecovered by this function — a genuine, disclosed, named
 * gap, not an oversight; see LEF-1's own resolution note.
 *
 * The ONE signal that DOES still apply, kept from the first version: the
 * Fan Schedule row that originally broke a looser pixel-radius attempt
 * carried "ID", a CATALOG_ANCHOR_WORD, IN ITS OWN ROW — a real, DIFFERENT
 * table's header always (re)introduces its own key column, and a genuine
 * continuation tier of the SAME header never does (mergeForwardCoEqualTier
 * already leans on exactly this same signal, proven live, to walk a
 * multi-tier equipment header this far already — this reuses its identical
 * three bounds: tight gap ≤ 2x the walking row's own average cell height,
 * no digit anywhere in the row, hard stop on a bare CATALOG_ANCHOR_WORD).
 * Gated to equipment-kind tables only (the same `opts.equipmentTierMerge`
 * scope every other multi-tier equipment mechanism in this file already
 * uses) — room-finish/finish headers have no real corpus case needing this
 * reach, so widening their own qualification bar stays untested,
 * unwarranted generalization. Only ever consulted as a FALLBACK, after both
 * `ownQualifies` and `nearbyRequiredHit` have already failed — purely
 * additive, never narrows what already qualifies today.
 *
 * RE-INVESTIGATED, live, this session: whether POWERED_EQUIPMENT_REQUIRED
 * (added later than this function — the vocabulary that DOES safely tell a
 * genuinely powered device from a passive duct fitting, see
 * hasPoweredEquipmentColumns' own comment) could let a forward variant reach
 * LAB EXHAUST FAN SCHEDULE's ESP and PUMP SCHEDULE's own GPM/HP without
 * re-breaking the Bessemer Fan Schedule regression above. It cannot — this
 * was ACTUALLY BUILT and run against this file's own live regression suite,
 * not assumed. First re-confirmed, directly rendering both real tables off
 * their own real PDFs (not trusting either this comment or an prior task
 * description of them): Bessemer's own real "FAN SCHEDULE" row (EF-1, a
 * genuine powered "BATHROOM EXHAUST FAN W/ LIGHT") carries a real
 * ELECTRICAL/VOLTS/PHASE/WATTS tier a couple of real physical lines below
 * its own anchor row — this is NOT a hypothetical; the nameplate data is as
 * real and as genuinely powered as LAB EXHAUST FAN SCHEDULE's own ESP/HP or
 * PUMP SCHEDULE's own GPM/HP. Gating the forward walk to
 * POWERED_EQUIPMENT_REQUIRED only (excluding AIRFLOW/VELOCITY/FPM/EQUIPMENT)
 * still credits Bessemer's own real PHASE/WATTS hit, because PHASE and WATTS
 * are themselves powered-nameplate words — the SAME vocabulary a genuine
 * lab exhaust fan or pump legitimately carries. A distance/reach-based
 * narrowing fails the opposite way, also confirmed by actually running it:
 * Bessemer's own real PHASE hit sits CLOSER to its anchor (one real physical
 * line down) than either LAB EXHAUST FAN SCHEDULE's ESP or PUMP SCHEDULE's
 * own GPM/HP (several real lines down, past its own SONES/CFM/weight
 * sub-tiers) — capping the walk short enough to exclude Bessemer excludes
 * both real target tables first; there is no reach depth that includes one
 * and excludes the other. This is not a shape gap a sharper geometric or
 * vocabulary signal could still close: Bessemer's own EF-1 is factually a
 * real powered device with real nameplate data, structurally identical in
 * every measurable way to LAB EXHAUST FAN SCHEDULE's LEF-1 — the corpus's
 * own ground-truth key (bessemer.takeoff.csv's own header comment) settles
 * FAN SCHEDULE as finish-kind purely "under this project's own scheduleKind
 * convention," a declared classification choice, not a claim about the
 * physical device or its drafting. A convention carries no row geometry to
 * detect. LAB EXHAUST FAN SCHEDULE and PUMP SCHEDULE both already reach
 * equipment-kind today regardless — LEF-1 via hasPoweredEquipmentColumns'
 * own region-wide nameplate scan (not this row-adjacency function at all),
 * PUMP SCHEDULE via isMepEquipmentSchedule's own title match (bare "PUMP") —
 * so the real, still-open gap this function's own forward reach would have
 * closed is narrower than kind alone: PUMP/LAB EXHAUST FAN SCHEDULE's own
 * DEEPER header columns (CFM/ESP/HP/TYPE/SERVED, not just SYMBOL/
 * MANUFACTURER/REMARKS) stay unrecovered, the same disclosed gap this
 * function's own header names above — confirmed still real, still without a
 * safe fix, after this session's own genuine, repeated, empirically-tested
 * attempt, not a first guess left untried. */
function nearbyRequiredHitWide(rows: GraphSpan[][], vocab: string[], required: string[], from: number): boolean {
  for (const dir of [-1]) {
    let i = from;
    for (let n = 0; n < 6; n++) {
      const j = i + dir;
      if (j < 0 || j >= rows.length) break;
      const cur = rows[i], next = rows[j];
      const h = cur.reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, cur.length);
      if (Math.abs(rowY(next) - rowY(cur)) > h * 2) break;
      if (next.some((t) => /\d/.test(t.str))) break;
      // A real title ("…SCHEDULE") is this file's own, already-proven,
      // table-boundary signal (findTableBoundary/findGenericTableBoundary
      // both stop on it) — a DIFFERENT table's own title sitting one tier
      // away is a strong "this is not my own header block" tell even when
      // that title's text happens to also contain a bare vocabulary word
      // (real, corpus-found regression this guards, alongside the catalog-
      // word stop below: a synthetic "VOLTAGE PHASE SCHEDULE" title sitting
      // right under an unrelated Fan Schedule's own header reads "VOLTAGE"
      // as a bare EQUIPMENT_REQUIRED hit with no catalog word anywhere on
      // that same line — the catalog-word stop alone does not catch it).
      if (next.some((t) => /SCHEDULE/.test(norm(t.str)))) break;
      const hits = headerHits(next, vocab);
      if (hits.some((x) => CATALOG_ANCHOR_WORDS.includes(x.label))) break;
      if (hits.some((x) => required.includes(x.label))) return true;
      i = j;
    }
  }
  return false;
}

function findHeaderRow(rows: GraphSpan[][], vocab: string[], required: string[], minHits: number, fromIdx = 0, opts: {
  equipmentTierMerge?: boolean; forwardTierMerge?: boolean; numericSubHeaderHarvest?: boolean;
  /** Extra per-candidate gate (equipment's own catalog-anchor bar today —
   * see extractTableAt's own comment on CATALOG_ANCHOR_WORDS): when this
   * rejects a fully-built candidate, the OUTER loop keeps scanning forward
   * for the NEXT header-shaped row rather than stopping dead — unlike the
   * discarded "wrapper retries findHeaderRow again with a bumped fromIdx"
   * approach the code once tried and reverted (see extractTableAt's own
   * comment for exactly why that regressed), this reuses the SAME
   * validated tier-descent/anchor-construction pass already trusted for
   * every OTHER row in this loop — it never grabs a partial/unvalidated
   * read, it just doesn't stop looking the moment ONE candidate turns out
   * to be a real table this kind can't key (a bare-TYPE/no-catalog-anchor
   * schedule sitting BEFORE a real, well-anchored one on the same sheet —
   * measured live: federal-attachment4-mechanical.pdf#14's own untitled
   * AIR HANDLING UNIT HYDRONIC COIL SCHEDULE, keyed by bare "TYPE"
   * [CHWC/HWC], sits directly above a real, TAG-keyed CHILLER SCHEDULE and
   * AIR SEPARATOR SCHEDULE — both previously never reached at all, table
   * DISCOVERY silently stopping at the first unkeyable candidate). */
  headerQualifies?: (anchors: Anchor[], rowIndex: number) => boolean;
} = {}): { anchors: Anchor[]; rowIndex: number; dataFrom: number; mergedTopIdx?: number } | null {
  for (let i = fromIdx; i < rows.length; i++) {
    let hits = headerHits(rows[i], vocab);
    const seen = new Set(hits.map((h) => h.label));
    const ownQualifies = seen.size >= minHits && required.some((r) => seen.has(r));
    if (
      !ownQualifies
      && !(seen.size >= minHits && nearbyRequiredHit(rows, vocab, required, i))
      && !(opts.equipmentTierMerge && seen.size >= minHits && nearbyRequiredHitWide(rows, vocab, required, i))
    ) continue;
    // A three-tier header puts PARENTS on top (ROOM | FLOOR | WALLS | CEILING)
    // and the real columns underneath (MARK | LOCATION | FINISH | BASE |
    // NORTH | …). The parent row carries enough vocabulary to look like the
    // header, and taking it read every sub-header as data — BASE landed in
    // WALLS and the whole row shifted. Where consecutive rows BOTH qualify,
    // the LOWER one defines the columns; the rows above only name them.
    let idx = i;
    for (;;) {
      // Look a couple of rows down, not just one: a column that spans both
      // tiers (REMARKS, centred across them) lands on its own row between
      // them and would otherwise stop the descent dead.
      let next = -1;
      for (let j = idx + 1; j < Math.min(idx + 4, rows.length); j++) {
        const h = headerHits(rows[j], vocab);
        // A header row is almost ENTIRELY header words. A data row carries a
        // few by accident — a material schedule's "VINYL WALL BASE" hits WALL
        // and BASE — and descending into one shifts every column by a row.
        const ratio = h.length / Math.max(1, rows[j].length);
        // Real, found live (ledger item 6, VOLUME CONTROL BOX SCHEDULE, 53
        // real rows): a real leaf tier can independently qualify AND carry
        // the table's own catalog anchor (TAG), yet still fail the ratio
        // bar — its own row is legitimately dense with parenthesized unit
        // fragments ("(°F)"×4, "(GPM)", "(BTU/HR)") that dilute the hit
        // ratio well under 0.6 without making the row any less a real
        // header. `qualifies()` already carries the real weight of "is
        // this a header, not a data row" (both minHits AND a required
        // rating word); the ratio bar was always a SECOND, extra safety
        // net on top of that, not the only gate — so when the deeper row
        // both qualifies AND introduces the table's catalog anchor for the
        // first time, that is strictly stronger evidence than the ratio
        // itself, and the ratio requirement is waived for exactly that
        // case. A random data row accidentally containing a bare TAG/ID/
        // MARK/CODE/SYMBOL token (on top of already, separately,
        // satisfying the independent qualify() bar) is not a realistic
        // accidental collision this loosens meaningfully. NOTE: the real
        // VOLUME CONTROL BOX SCHEDULE this unblocks still bands several of
        // its own OTHER columns imperfectly (glob cells where a column's
        // header is entirely non-vocabulary text, e.g. "MIN INLET SP
        // I.W.G.") — a real, PRE-EXISTING class of limitation confirmed
        // (via git stash) already present on tables that extracted fine
        // before this session (e.g. itd-d1-lab's own EXHAUST FAN SCHEDULE,
        // whose LOCATION/AREA-SERVED columns glob identically) — not a
        // regression this fix introduces, and not attempted to be solved
        // here; a real per-column (not per-row) anchor model is the actual
        // fix, named as its own future item, not this one's job.
        const introducesAnchor = h.some((x) => CATALOG_ANCHOR_WORDS.includes(x.label) && !hits.some((y) => y.label === x.label));
        if (qualifies(h, required, minHits) && h.length > hits.length && (ratio >= 0.6 || introducesAnchor)) { next = j; break; }
      }
      if (next < 0) break;
      idx = next;
      hits = headerHits(rows[idx], vocab);
    }
    // A label repeated in the row (two FINISH columns) is ambiguous on its
    // own and takes its parent's name: FLOOR FINISH, CEILING FINISH. The
    // parent is the label above whose centre falls inside THIS column's own
    // interval — a parent's text is narrow and centred over a wide column, so
    // testing against the sub-header's own span finds nothing.
    const dup = new Set<string>();
    const once = new Set<string>();
    for (const h of hits) (once.has(h.label) ? dup : once).add(h.label);
    const anchors: Anchor[] = [];
    const used = new Set<string>();
    for (let j = 0; j < hits.length; j++) {
      const h = hits[j];
      let label = h.label;
      // An ambiguous label prefers a MORE SPECIFIC word from its own SAME
      // span first, before ever guessing at a parent — real, found live
      // (Baker County EOC's own Room Finish Schedule): every OTHER
      // direction column splits "FINISH -" and its own direction word into
      // two separate spans, but one (EAST) draws them as a single combined
      // run "FINISH - EAST". `headerHits`' own first-vocab-word-per-span
      // pick surfaces only "FINISH" for that span, so "EAST" — sitting
      // right there in the same run — would otherwise be invisible past
      // this point, sending the label down the parent-lookup path below
      // and landing on an unrelated, too-generic parent-tier word ("WALLS")
      // instead of the real, already-present, more specific one.
      if (dup.has(h.label) && !SURFACE_WORDS.has(h.label)) {
        const sameSpanWords = headerLabels(h.span.str, vocab);
        const specific = sameSpanWords.find((w) => w !== h.label && SURFACE_WORDS.has(w) && !used.has(w));
        if (specific) label = specific;
      }
      // An ambiguous label takes its parent's name next (two FINISH columns
      // become FLOOR FINISH and CEILING FINISH) …
      if (dup.has(h.label) && !SURFACE_WORDS.has(h.label) && label === h.label) {
        const hi = j + 1 < hits.length ? hits[j + 1].span.x : Infinity;
        const parent = parentLabelOver(rows, idx, i, h.span.x, hi, vocab);
        if (parent && parent !== h.label) label = `${parent} ${h.label}`;
      }
      // … and failing that, a cell naming more than one vocabulary word falls
      // through to its next one: "ROOM #" and "ROOM NAME" both lead with ROOM,
      // and the second must become NAME rather than lose its column.
      if (used.has(label)) {
        const alt = headerLabels(h.span.str, vocab).find((w) => !used.has(w));
        if (alt) label = alt;
      }
      if (used.has(label)) continue;
      used.add(label);
      anchors.push({ label, x: h.span.x + (h.span.w || 0) / 2 });
    }
    // Backward co-equal-tier merge (see mergeBackwardCoEqualTier's own
    // comment) — only for kinds that opt in (equipment, today). Injected
    // here, before the minHits check below, so a merged key column counts
    // toward it like any other anchor.
    let mergedTopIdx: number | undefined;
    if (opts.equipmentTierMerge) {
      const merged = mergeBackwardCoEqualTier(rows, vocab, idx, hits, required, minHits);
      if (merged) {
        for (const a of merged.anchors) {
          if (used.has(a.label)) continue;
          used.add(a.label);
          anchors.push(a);
        }
        mergedTopIdx = merged.topIdx;
      }
    }
    // Forward co-equal-tier merge (see mergeForwardCoEqualTier's own
    // comment) — a SEPARATE opt-in from the backward merge above
    // (`forwardTierMerge`, defaulting to on when equipmentTierMerge is on):
    // bandedSheets' own seam probing turns this one off specifically (see
    // ExtractOpts' own `noForwardTierMerge` comment) while leaving the
    // already-safe backward merge/harvest untouched. Runs after the backward
    // merge so a backward-merged key column is already present when later
    // tiers' duplicate labels look for it, and returns the last row it
    // actually ABSORBED, so the skip/continuation scan below resumes from
    // real header material it consumed rather than re-walking (or, worse,
    // skipping past) rows it left untouched.
    let mergedForwardIdx = idx;
    if (opts.equipmentTierMerge && opts.forwardTierMerge !== false) {
      mergedForwardIdx = mergeForwardCoEqualTier(rows, vocab, i, idx, anchors, used, required, minHits);
    }
    if (anchors.length < minHits) continue;
    // A column that exists ONLY at a parent tier (REMARKS spanning the whole
    // header block) is a real column: keep it when it sits outside every
    // descended anchor's reach, drop it when it is merely a parent naming
    // columns that are already anchored below it.
    //
    // "already anchored below it" used to mean "falls anywhere inside the
    // overall [lo,hi] envelope of the descended tier's own anchors" — real,
    // found live (ledger item 6, VOLUME CONTROL BOX SCHEDULE): that's too
    // coarse. A leaf tier can independently qualify (TAG/MANUFACTURER/
    // MODEL/REMARKS bare hits) while several of its OWN cells directly
    // below a parent-tier rating label are bare UNIT fragments ("(°F)",
    // matching no vocabulary word at all) — those columns sit well inside
    // the envelope but have NO anchor of their own at the descended tier,
    // and the coarse range check silently dropped the parent's own label
    // (EAT/LAT/EWT/LWT) for them, leaving the column nameless. Fixed by
    // checking real proximity to an ACTUAL anchor, rather than mere
    // envelope membership. Deliberately the TIGHTEST observed gap, not the
    // median (harvestSkippedTierAnchors' own disambiguation radius, which
    // solves a different problem — a duplicate label's PARENT, not "is
    // this a distinct column at all" — and stays untouched here): a real
    // leaf tier's own anchors (TAG/MANUFACTURER/…) are often sparse and
    // widely spaced, while the parent tier's own columns being recovered
    // (EAT/LAT/EWT/LWT) can sit much MORE tightly packed than that —
    // a half-of-median radius derived from the sparse tier would then
    // wrongly swallow the parent tier's own immediate neighbors into each
    // other. Half of the tightest real gap already observed is the more
    // conservative choice: still enough to catch a genuine duplicate, far
    // less likely to merge two real, adjacent, distinct columns.
    if (idx > i) {
      const sortedAx = anchors.map((a) => a.x).sort((a, b) => a - b);
      const gaps = sortedAx.slice(1).map((x, k) => x - sortedAx[k]);
      const halfPitch = gaps.length ? Math.min(...gaps) / 2 : 150;
      for (let j = i; j < idx; j++) {
        for (const h of headerHits(rows[j], vocab)) {
          const cx = h.span.x + (h.span.w || 0) / 2;
          if (anchors.some((a) => Math.abs(a.x - cx) <= halfPitch)) continue;
          if (used.has(h.label)) continue;
          used.add(h.label);
          anchors.push({ label: h.label, x: cx });
        }
      }
    }
    const skipEnd = skipSubHeaderContinuation(rows, vocab, mergedForwardIdx);
    // Parenthesized unit-fragment tiers ("(MBH)", "(WATTS)") name real
    // columns too — see harvestSkippedTierAnchors' own comment. Same gate as
    // the backward merge above: both are part of the same equipment-only
    // tier-topology handling this phase adds.
    if (opts.equipmentTierMerge) {
      for (const a of harvestSkippedTierAnchors(rows, vocab, mergedForwardIdx, skipEnd)) {
        if (used.has(a.label)) continue;
        used.add(a.label);
        anchors.push(a);
      }
    }
    let finalAnchors = subTierAnchors(rows, idx, anchors.sort((a, b) => a.x - b.x), vocab);
    let deepDataFrom = skipEnd + 1;
    // See harvestGeometricSubTiers' own comment: a deep, wide equipment
    // header's own sub-tier labels can sit many real rows below `idx`,
    // never on `idx` itself — additive only, same equipment-only gate every
    // other multi-tier mechanism in this file already uses.
    if (opts.equipmentTierMerge) {
      const deep = harvestGeometricSubTiers(rows, vocab, idx + 1, finalAnchors);
      finalAnchors = deep.anchors;
      deepDataFrom = Math.max(deepDataFrom, deep.dataFrom);
      finalAnchors = harvestBareVocabLeafTiers(rows, vocab, Math.max(0, idx - 20), idx + 1, finalAnchors);
      finalAnchors = harvestBareVocabAboveTiers(rows, vocab, idx, finalAnchors);
    }
    // See harvestNumericSubHeaders' own comment: a real, deliberately
    // finish-kind table (SOUND ATTENUATOR SCHEDULE, itd-d1-lab-mechanical.pdf
    // #14 — ground-truth-confirmed finish-kind, not a misclassification) can
    // carry a bare row of numeric-only sub-headers (OCTAVE BAND FREQUENCY's
    // own 63/125/…/8000) that reads, to every other heuristic in this file,
    // exactly like an ordinary data row. Geometry-only — adds no word to
    // FINISH_HEADERS/EQUIPMENT_HEADERS (that path was tried for this same
    // table's OTHER missing columns, TYPE/AREA/WEIGHT specifically, and
    // reverted after a real corpus-wide sweep caught it silently rewriting
    // an UNRELATED table's own read elsewhere — see FINISH_HEADERS' own
    // comment) — and additionally refused outright on any table that also
    // looks like real powered MEP-equipment (looksLikePoweredEquipmentBlock,
    // below), the same real signal hasPoweredEquipmentColumns already uses
    // for the identical SA-1-vs-LEF-1 discrimination problem: a passive duct
    // fitting carries no motor/electrical nameplate vocabulary at all, a
    // real powered MEP-equipment schedule always does. Equipment-kind is
    // excluded entirely (not merely discriminated) — it already has its own
    // established, separately-gated multi-tier machinery. Never room-finish
    // either, same reasoning. (A companion mechanism recovering this same
    // table's own LETTER-bearing missing columns — TYPE, AIRFLOW, MAXIMUM
    // FACE VELOCITY, LENGTH/WIDTH/HEIGHT, FACE AREA, WEIGHT — was built and
    // tried here too, and is NOT shipped: see harvestNumericSubHeaders' own
    // comment for the real corpus-wide damage it caused and why it was
    // pulled rather than narrowed further under time pressure.)
    if (opts.numericSubHeaderHarvest && !looksLikePoweredEquipmentBlock(rows, Math.max(0, idx - 8), skipEnd, finalAnchors)) {
      finalAnchors = harvestNumericSubHeaders(rows, vocab, idx, skipEnd, finalAnchors);
    }
    // A fully-built candidate that fails the caller's own gate (equipment's
    // catalog-anchor bar) is a REAL table this kind genuinely cannot key —
    // correctly refused, same as ever — but refusing it must not end the
    // whole scan: resume from the very next row rather than returning, so a
    // later, properly-anchored table on the same sheet still gets found. See
    // headerQualifies' own comment above for the real fixture this recovers.
    if (opts.headerQualifies && !opts.headerQualifies(finalAnchors, idx)) continue;
    return {
      anchors: finalAnchors,
      rowIndex: idx,
      dataFrom: deepDataFrom,
      mergedTopIdx,
    };
  }
  return null;
}

// ── two-tier headers (#87 phase 3b) ─────────────────────────────────────────
// A merged parent cell over sub-columns — WALLS (PLAN DIRECTION) spanning
// N | E | S | W — is standard on room-finish schedules. The sub-labels are
// not vocabulary words, so the anchor hunt above went blind to them and every
// wall column banded to whichever neighbour was nearest: N and E landed in
// BASE, S and W in CEILING. Field-found on a real gym set, where BASE read
// "VWB-1 - FRP-1, FRP-1A, PT" instead of "VWB-1" — a polluted base column is
// a wrong number in the bid, not a cosmetic smear.
// A run of ≥2 adjacent non-vocabulary tokens INSIDE the header's own span is
// a sub-tier. The parent is the nearest span above whose box actually covers
// the run, and each sub-anchor is labelled "<PARENT> <SUB>" ("WALLS N") so
// the column keeps both halves of its meaning. No parent above, no sub-tier:
// an unexplained token never mints a column.
//
// %, °, and the two real glyphs a firm draws for "phase" (∅ empty-set, Ø
// slashed-O — both seen in the real corpus for the same "V/∅" column)
// widen this past bare alphanumeric codes (accuracy-hardening plan, ledger
// item 29): a real leaf sub-label routinely carries a unit symbol ("RH%",
// "V/∅"), not just a bare code like "N"/"E"/"S"/"W".
const SUB_LABEL_RE = /^[A-Z0-9][A-Z0-9.\/%°∅Ø-]{0,5}$/;

function parentLabelOver(rows: GraphSpan[][], hdrIdx: number, topIdx: number, gx0: number, gx1: number, vocab: string[]): string | null {
  const width = Math.max(Math.min(gx1, gx0 + 4000) - gx0, 1);
  // Search UPWARD by distance, not by row count. Dotted leaders and a
  // neighbouring table's rows interleave between the tiers of one header
  // block, so "two rows up" can fall short of the parent that is physically
  // sitting right above the column.
  const hs = rows[hdrIdx].map((t) => t.h || 8).sort((a, b) => a - b);
  const near = Math.max(24, (hs[hs.length >> 1] || 8) * 4);
  const hy = rowY(rows[hdrIdx]);
  const floorIdx = Math.max(0, Math.min(topIdx, hdrIdx - 8));
  for (let j = hdrIdx - 1; j >= floorIdx; j--) {
    if (hy - rowY(rows[j]) > near) break;
    for (const t of rows[j]) {
      const cx = t.x + (t.w || 0) / 2;
      const inInterval = cx >= gx0 && cx < gx1;
      const overlaps = Math.min(t.x + (t.w || 0), gx1) - Math.max(t.x, gx0) > width * 0.3;
      if (!inInterval && !overlaps) continue;
      const lbl = headerLabel(t.str, vocab);
      if (lbl) return lbl;
    }
  }
  return null;
}

// Like parentLabelOver, but a real parent is not always a vocabulary word —
// "OUTSIDE AIR" / "ENTERING (AIR)" / "AIR STREAM SYSTEM" / "WATER SYSTEM"
// name nothing in EQUIPMENT_HEADERS' own vocabulary (accuracy-hardening
// plan, ledger item 29, real "HUMIDIFIER SCHEDULE" nested twin-column
// tiers). Vocabulary still wins first, exactly as parentLabelOver alone —
// a real recognized column word overhead is always the stronger signal —
// but where that comes up empty across the WHOLE scanned window, a real
// all-caps phrase whose box actually covers the interval is accepted
// instead, the same "a real title reads as one run of words" reasoning
// already used elsewhere in this file (findTableBoundary's own title
// check) applied one tier up. A SEPARATE function from parentLabelOver,
// deliberately: that one is also called from findHeaderRow's own
// ambiguous-duplicate-column path, and widening it there was never
// measured — kept exactly as it already was, tested, everywhere else.
const PHRASE_RE = /^[A-Z][A-Z0-9 .,'&()/-]{1,40}$/;
function parentPhraseOver(rows: GraphSpan[][], hdrIdx: number, floorIdx: number, gx0: number, gx1: number, vocab: string[]): string | null {
  const width = Math.max(Math.min(gx1, gx0 + 4000) - gx0, 1);
  const hs = rows[hdrIdx].map((t) => t.h || 8).sort((a, b) => a - b);
  const near = Math.max(24, (hs[hs.length >> 1] || 8) * 4);
  const hy = rowY(rows[hdrIdx]);
  const floor = Math.max(0, floorIdx);
  let phrase: { text: string; d: number } | null = null;
  for (let j = hdrIdx - 1; j >= floor; j--) {
    if (hy - rowY(rows[j]) > near) break;
    for (const t of rows[j]) {
      const cx = t.x + (t.w || 0) / 2;
      const inInterval = cx >= gx0 && cx < gx1;
      const overlaps = Math.min(t.x + (t.w || 0), gx1) - Math.max(t.x, gx0) > width * 0.3;
      if (!inInterval && !overlaps) continue;
      const lbl = headerLabel(t.str, vocab);
      if (lbl) return lbl;   // a recognized vocabulary parent always wins first
      const s = norm(t.str);
      if (!PHRASE_RE.test(s) || /^\(.*\)$/.test(s)) continue;   // a bare unit fragment names nothing
      const d = (hy - rowY(rows[j])) * 1000 + Math.abs(cx - (gx0 + gx1) / 2);
      if (!phrase || d < phrase.d) phrase = { text: s, d };
    }
  }
  return phrase?.text ?? null;
}

// A real parent for ONE specific token, found by genuine GEOMETRIC overlap
// between the candidate's own printed box and the token's own box (a small,
// fixed, kerning-scale tolerance for a near-touching pair) — never by mere
// distance-to-centre. parentLabelOver/parentPhraseOver's own windowed search
// is the established, tested signal everywhere a window can be sized off
// something trustworthy (a genuinely narrow column's own span, or a run's
// own internal gaps once median-based splitting has already bounded it) —
// but subTierAnchors' own degenerate two-token run (see its own comment)
// gives no trustworthy window at all, and a wide one there reaches straight
// past the true absence of a parent into an unrelated neighbour's own real
// column. Same vocabulary-first, phrase-second precedence as parentPhraseOver.
const GENUINE_OVERLAP_TOL = 20;
function genuineParentOver(rows: GraphSpan[][], hdrIdx: number, topIdx: number, t: GraphSpan, vocab: string[]): string | null {
  const boxGap = (a: GraphSpan, b: GraphSpan) => Math.max(0, a.x - (b.x + (b.w || 0)), b.x - (a.x + (a.w || 0)));
  const hs = rows[hdrIdx].map((x) => x.h || 8).sort((a, b) => a - b);
  const near = Math.max(24, (hs[hs.length >> 1] || 8) * 4);
  const hy = rowY(rows[hdrIdx]);
  const floorIdx = Math.max(0, Math.min(topIdx, hdrIdx - 8));
  let phrase: { text: string; d: number } | null = null;
  for (let j = hdrIdx - 1; j >= floorIdx; j--) {
    if (hy - rowY(rows[j]) > near) break;
    for (const cand of rows[j]) {
      const gap = boxGap(t, cand);
      if (gap > GENUINE_OVERLAP_TOL) continue;
      const lbl = headerLabel(cand.str, vocab);
      if (lbl) return lbl;   // a recognized vocabulary parent always wins first, nearest row first
      const s = norm(cand.str);
      if (!PHRASE_RE.test(s) || /^\(.*\)$/.test(s)) continue;
      const d = (hy - rowY(rows[j])) * 1000 + gap;
      if (!phrase || d < phrase.d) phrase = { text: s, d };
    }
  }
  return phrase?.text ?? null;
}

function mintSubAnchors(out: Anchor[], used: Set<string>, r: Array<{ t: GraphSpan; parent: string }>, mid: (t: GraphSpan) => number): void {
  const parent = r[0].parent;
  // sub-columns under a merged parent are equal-width: the pitch between
  // their labels IS the column width, so each one's bounds are its center
  // ± half a pitch. Those bounds are what keep a left-aligned wall code out
  // of the narrow BASE column next door. A lone, independently-parented
  // column (no real run to measure a pitch from) stays unbounded, exactly
  // like any other single-tier anchor.
  const pitch = r.length > 1
    ? r.slice(1).map((x, i) => mid(x.t) - mid(r[i].t)).sort((a, b) => a - b)[(r.length - 1) >> 1]
    : 0;
  for (const { t } of r) {
    const label = `${parent} ${norm(t.str)}`;
    if (used.has(label)) continue;
    used.add(label);
    const c = mid(t);
    out.push(pitch > 0 ? { label, x: c, x0: c - pitch / 2, x1: c + pitch / 2 } : { label, x: c });
  }
}

function subTierAnchors(rows: GraphSpan[][], hdrIdx: number, anchors: Anchor[], vocab: string[]): Anchor[] {
  const lo = anchors[0].x, hi = anchors[anchors.length - 1].x;
  const loose = rows[hdrIdx]
    .filter((t) => !headerLabel(t.str, vocab) && SUB_LABEL_RE.test(norm(t.str)))
    .filter((t) => t.x + (t.w || 0) / 2 > lo && t.x + (t.w || 0) / 2 < hi)
    .sort((a, b) => a.x - b.x);
  if (loose.length < 2) return anchors;
  const mid = (t: GraphSpan) => t.x + (t.w || 0) / 2;
  // Genuine median, not always the upper-middle element — see bandLimits'
  // own comment for the full real-corpus regression this exact idiom
  // (`gaps.length >> 1`) causes for the most common even case, exactly 2
  // gaps: it always lands on the LARGER of the two, an outlier neighbor gap
  // masquerading as "typical pitch". Real, corpus-found live on itd-d1-lab-
  // mechanical.pdf#15's own AIR HANDLING UNIT SCHEDULE: a lone unrelated
  // token (COIL, a DX/DEHUMIDIFICATION COOLING COIL fragment) sits ~1073px
  // from a genuine, tight, 160px-apart O.S.A./WEIGHT pair — the old idiom
  // "median'd" to 1073 (COIL's own outlier gap), 3x-ing to a 3219px run-
  // continuation radius that swallowed COIL into the SAME run as O.S.A./
  // WEIGHT, and separately inflated `halfPitch` (below) to 536.5px — wide
  // enough that parentPhraseOver's per-token search reached clean past
  // O.S.A./WEIGHT's own true, well-aligned parents (MIN./OPERATING, two
  // real tiers up) into an unrelated, poorly-aligned neighbor column's own
  // label (MANUFACTURER AND) one tier closer, which parentPhraseOver's
  // row-distance-first scoring then preferred over the far-better-aligned
  // real parent. Fixed the same way bandLimits was: the LOWER of the two
  // middle gaps for an even count.
  const gaps = loose.slice(1).map((t, i) => mid(t) - mid(loose[i])).sort((a, b) => a - b);
  const med = gaps[(gaps.length - 1) >> 1] || 1;
  const runs: GraphSpan[][] = [];
  let run: GraphSpan[] = [loose[0]];
  for (let i = 1; i < loose.length; i++) {
    if (mid(loose[i]) - mid(loose[i - 1]) > med * 3) { runs.push(run); run = []; }
    run.push(loose[i]);
  }
  runs.push(run);
  const out = anchors.slice();
  const used = new Set(anchors.map((a) => a.label));
  for (const r of runs) {
    if (r.length < 2) continue;
    const last = r[r.length - 1];
    // A recognized VOCABULARY parent over the run's own FULL combined span
    // is the established, tested signal (WALLS spanning N|E|S|W) — tried
    // first, exactly as before, and once found, the whole run keeps sharing
    // it exactly as before: this path is untouched, byte-for-byte the same
    // decision it always made, for every run of THREE OR MORE loose tokens
    // (the median-gap run-splitting above already gives those real outlier
    // protection: an unrelated token more than med*3 away never joins the
    // run in the first place).
    let vocabParent = parentLabelOver(rows, hdrIdx, hdrIdx - 2, r[0].x, last.x + (last.w || 0), vocab);
    // A run of EXACTLY two loose tokens gets NONE of that protection — one
    // gap has nothing "typical" to be an outlier relative to, so two utterly
    // unrelated tokens that happen to land on the same physical row (real,
    // found live, itd-d1-lab-mechanical.pdf#12's own SNORKEL HOOD SCHEDULE:
    // "DUCT" and "WEIGHT", each one line of its OWN separate, single-column
    // wrapped title — "MIN. EXHAUST DUCT VELOCITY (FPM)" and "OPERATING
    // WEIGHT (LBS)" — land ~700px apart with nothing between them) always
    // form one "run" by construction. parentLabelOver's own wide combined-
    // span window then happily accepts a real but narrow and genuinely
    // unrelated parent phrase sitting anywhere in that gap ("MOUNTING
    // PLATFORM", a real column of its own) purely because its centre falls
    // inside it, wrongly welding two independent single-value columns into
    // "MOUNTING DUCT"/"MOUNTING WEIGHT". Confirmed by direct render against
    // the real PDF (not assumed from code): MOUNTING PLATFORM genuinely
    // parents a real WALL|CEILING sub-pair elsewhere on this exact table
    // (recovered correctly, by a different function) — it parents nothing
    // near DUCT or WEIGHT.
    //
    // Guarded HERE, narrowly, rather than inside parentLabelOver itself:
    // that function is also called from findHeaderRow's own ambiguous-
    // duplicate-column path with a completely different interval shape (a
    // genuinely narrow column's own span, not a wide multi-token run), and
    // is the established, tested, corpus-wide signal every OTHER already-
    // correct run in the corpus relies on — untouched here, along with its
    // r.length>=3 use just above (real outlier protection already applies
    // there). The bar for a 2-token run instead: `genuineParentOver` (see
    // its own comment) — a real GEOMETRIC overlap between the candidate
    // parent's own printed box and EACH member's own box, not mere
    // proximity-by-distance (which cannot distinguish "this narrow label
    // really sits over both of us" from "this is just the nearest label to
    // each of us separately"). MOUNTING PLATFORM's own box (1535–1705)
    // truly contains WALL (1545–1587) and CEILING (1643–1704) — real
    // overlap — but sits 379px clear of DUCT and 46px clear of WEIGHT — no
    // overlap at all, correctly refused.
    if (vocabParent && r.length === 2) {
      const p0 = genuineParentOver(rows, hdrIdx, hdrIdx - 2, r[0], vocab);
      const p1 = genuineParentOver(rows, hdrIdx, hdrIdx - 2, r[1], vocab);
      if (p0 !== vocabParent || p1 !== vocabParent) vocabParent = null;
    }
    if (vocabParent) { mintSubAnchors(out, used, r.map((t) => ({ t, parent: vocabParent })), mid); continue; }
    // No vocabulary parent covers the whole run — do not guess one for it
    // (real, found live, ledger item 29: "TEMP." under "OUTSIDE AIR" and
    // "TEMP." under "ENTERING (AIR)" gap-cluster into one run exactly like
    // WALLS' N/E/S/W, but they are NOT sub-columns of one merged parent —
    // each is its own, independently-parented real column, distinguished
    // only by which real phrase sits directly above EACH token, not by
    // gap distance, which is identical either way). Re-parent PER TOKEN
    // instead, with a window sized to reach a real phrase sitting above it
    // without reaching its neighbour's, then re-group only tokens that
    // truly share the SAME immediate parent AND sit at normal sub-column
    // pitch — never activated for a run that already found a vocabulary
    // parent above, so WALLS' own N/E/S/W behavior is exactly unchanged.
    //
    // A run of exactly two, here too, gets the same real-overlap bar
    // instead of a distance window sized off its own (possibly huge, e.g.
    // DUCT/WEIGHT's own ~700px gap) internal spacing — see the identical
    // reasoning above. A run of three or more keeps the original distance-
    // windowed parentPhraseOver search unchanged (median-gap run-splitting
    // already bounds it).
    const withParent = r.length === 2
      ? r
        .map((t) => ({ t, parent: genuineParentOver(rows, hdrIdx, hdrIdx - 8, t, vocab) }))
        .filter((x): x is { t: GraphSpan; parent: string } => x.parent != null)
      : r
        .map((t) => ({ t, parent: parentPhraseOver(rows, hdrIdx, hdrIdx - 8, mid(t) - Math.max(24, med / 2), mid(t) + Math.max(24, med / 2), vocab) }))
        .filter((x): x is { t: GraphSpan; parent: string } => x.parent != null);
    // A run-of-two member with NO genuine parent ABOVE it is not always
    // "unexplained" the way a 3+ run's leftover is: a degenerate 2-token run
    // is, by construction (see the DUCT/WEIGHT comment above), sometimes just
    // two independent, un-related, standalone leaf columns that happen to
    // share one physical row — never a real family needing a parent at all
    // (itd-d1-lab-mechanical.pdf#14's own real PENTHOUSE SCHEDULE: "TYPE" and
    // "FINISH" gap-cluster into one run exactly like DUCT/WEIGHT, but neither
    // has any real parent anywhere on the sheet — FINISH's own nearest
    // candidate, MINIMUM FREE AREA (ft2)'s wrapped header, is a real,
    // independent, ADJACENT column, not a parent, and sits 100px clear of
    // it — confirmed by direct render, correctly refused by genuineParentOver
    // same as MOUNTING PLATFORM is for DUCT/WEIGHT). Such a member mints
    // itself, using its own printed text as the label — never a guess, never
    // a borrowed neighbour's parent — the same standalone treatment a lone
    // loose token with no partner at all already gets one tier up
    // (`loose.length < 2` returns early, unmerged).
    //
    // But genuineParentOver only ever searches UPWARD (a real parent always
    // sits above its child on every table this file already handles) — so a
    // member whose OWN real continuation instead wraps onto the row BELOW
    // hdrIdx (real, found live, m601's own DIFFUSER/GRILLE/REGISTER SCHEDULE:
    // "MODEL" with "NUMBER" directly beneath it, one real two-line header,
    // "MOUNTING"/"FRAME" and "NECK SIZE"/"(IN)" the same shape alongside it)
    // would wrongly mint itself standalone as the FIRST HALF of a real
    // compound header, worse than the silent drop this whole file already
    // gives that shape everywhere else (no code here reads a continuation
    // below hdrIdx at all — a real, separate, larger gap, same class as
    // AREA SERVED/NUMBER OF TIERS/THROAT SIZE going untouched above). Refuse
    // to promote a member with a genuine (real, tight) neighbour directly
    // below it — it stays exactly as silent as it already was, never worse.
    // Scoped to r.length===2 only: a 3+ run already has real outlier
    // protection from the median-gap split above, so a 3+ leftover with no
    // parent stays genuinely unexplained, as before — and none of this
    // touches table QUALIFICATION (minHits/vocab), only a column already
    // inside an already-qualified table, so it carries none of a vocabulary
    // change's corpus-wide collapse/tie-break risk (tried first, live, and
    // reverted after a real spurious table appeared elsewhere in the corpus).
    if (r.length === 2) {
      const resolved = new Set(withParent.map((x) => x.t));
      const below = rows[hdrIdx + 1] || [];
      const boxGap = (a: GraphSpan, b: GraphSpan) => Math.max(0, a.x - (b.x + (b.w || 0)), b.x - (a.x + (a.w || 0)));
      const hasContinuationBelow = (t: GraphSpan) => below.some((c) => boxGap(t, c) <= GENUINE_OVERLAP_TOL);
      for (const t of r) {
        if (resolved.has(t)) continue;
        if (hasContinuationBelow(t)) continue;
        const label = norm(t.str);
        if (used.has(label)) continue;
        used.add(label);
        out.push({ label, x: mid(t) });
      }
    }
    if (!withParent.length) continue;   // no parent anywhere — unexplained, no sub-tier, as always
    const subRuns: Array<typeof withParent> = [[withParent[0]]];
    for (let i = 1; i < withParent.length; i++) {
      const prev = withParent[i - 1], cur = withParent[i];
      const tail = subRuns[subRuns.length - 1];
      if (cur.parent === prev.parent && mid(cur.t) - mid(prev.t) <= med * 3) tail.push(cur);
      else subRuns.push([cur]);
    }
    for (const sr of subRuns) mergeOrMintSubAnchors(out, used, sr, mid);
  }
  return out.sort((a, b) => a.x - b.x);
}

// A per-token sub-tier candidate (above) can resolve to a position an
// EARLIER pass already anchored — real, corpus-found on THIS exact table:
// mergeForwardCoEqualTier already minted a bare "CFM" (a recognized
// EQUIPMENT_HEADERS word) from MIN. O.S.A.'s own real THIRD tier before
// subTierAnchors ever runs, since that tier independently carries enough
// vocabulary hits of its own to qualify as a co-equal tier in its own
// right. subTierAnchors then resolves the SAME token's real two-tier
// parent ("MIN." over "O.S.A.") from geometry alone, with no idea a bare
// anchor already sits almost exactly on top of it — mintSubAnchors (the
// plain version) would just push a second, near-duplicate anchor 2px away,
// which is silently WORSE than a plain miss: anchorRadii's own baseline
// (the smallest real gap between any two anchors on the table) reads that
// 2px gap as "the table's own tightest confirmed column pitch" and caps
// every other anchor's own reach to half of it — confirmed live, this
// exact near-duplicate alone collapsed nearly every other column's own
// binding radius to ~1px, silently dropping MANUFACTURER/MODEL's real data
// ("DAIKIN DPSA040") across the whole rest of the row. The real fix: when
// a candidate's own position already matches an EXISTING anchor (the same
// tight, fixed radius harvestGeometricSubTiers' own DUP_TOL already
// establishes as "same column, not a neighbour"), that existing anchor
// already has the real DATA bound to it (it was minted first, and data
// binding runs after every anchor pass completes) — renaming it in place
// to carry the fuller "MIN. O.S.A. CFM" label keeps that data AND the
// fuller name, instead of stranding the data under a bare "CFM" while an
// empty, dataless "MIN. O.S.A." duplicate sits uselessly beside it.
function mergeOrMintSubAnchors(out: Anchor[], used: Set<string>, r: Array<{ t: GraphSpan; parent: string }>, mid: (t: GraphSpan) => number): void {
  const DUP_TOL = 20;
  const remaining: typeof r = [];
  for (const x of r) {
    const cx = mid(x.t);
    const hit = out.find((a) => Math.abs(a.x - cx) <= DUP_TOL);
    if (!hit) { remaining.push(x); continue; }
    const fuller = `${x.parent} ${norm(x.t.str)} ${hit.label}`;
    if (hit.label === fuller || used.has(fuller)) continue;   // already named this way, or the fuller name collides
    used.delete(hit.label);
    used.add(fuller);
    hit.label = fuller;
  }
  if (remaining.length) mintSubAnchors(out, used, remaining, mid);
}

// ── deep multi-tier sub-columns, geometry-only (itd-d1-lab-mechanical.pdf#15's
// own AIR HANDLING UNIT SCHEDULE) ────────────────────────────────────────────
// subTierAnchors above recovers a sub-tier living on the SAME physical row as
// the header's own settled `idx` (WALLS' N/E/S/W). A real, wide, DEEPLY
// wrapped equipment header instead spreads its sub-tier labels onto a
// DIFFERENT physical row than `idx` entirely — several genuine tiers further
// down (AIRFLOW (CFM)'s own DESIGN/ACTUAL, CAPACITY (MBH)'s own SENSIBLE/
// TOTAL or INPUT/OUTPUT, E.A.T.(°F)/L.A.T.(°F)'s own D.B./W.B., PRE-FILTER/
// FINAL FILTER's own EFF./DEPTH — all real, confirmed live against the
// rendered sheet, none carrying a single vocabulary word of their own) —
// while `idx` itself stays correctly anchored on the row that names the
// table's own key columns (SYMBOL/TYPE/AREA SERVED/REMARKS). subTierAnchors
// never looks past `rows[idx]`, so every one of these real leaf columns is
// invisible outright: neither this file's vocabulary-hit machinery (the row
// carries none) nor subTierAnchors (wrong row) ever sees them, and the lone
// parent anchor left standing (AIRFLOW, CAPACITY→MBH, EAT, LAT, …) silently
// absorbs only ONE of its two-plus real children's values at the data row —
// the other simply vanishes from `resolve_tag`/takeoff, a wrong number in
// the bid, not a cosmetic gap.
//
// The fix is purely geometric and purely ADDITIVE: walk every row below
// `idx` that carries ZERO vocabulary hits of its own (a row the rest of this
// file's machinery already recognizes and handles is left completely alone —
// this only ever fills the one blind spot nothing else sees) and repeat
// subTierAnchors' own established run/parent logic on it, one row at a time.
//
// Deliberately NOT a call to subTierAnchors itself: subTierAnchors' first
// move — a single vocabulary parent covering the run's WHOLE combined
// span — is safe on a row with only ONE plausible vocabulary candidate
// nearby (WALLS), but this deep-header shape routinely places TWO DIFFERENT,
// each independently real, vocabulary anchors close enough together (EAT and
// LAT, ~130px apart) that their D.B./W.B. children's combined run spuriously
// "covers" both — the whole-run try would credit the WRONG one (whichever
// vocabulary word its scan reaches first) to every token in the run,
// silently dropping the other's real children as duplicate-label collisions.
// Per-token resolution (parentPhraseOver alone — it already tries a
// vocabulary parent first, phrase second, exactly subTierAnchors' own
// fallback) sidesteps this: each token's own tight window sees only the ONE
// real parent actually sitting above IT.
//
// Bounded three ways, all reused from established signals elsewhere in this
// file rather than invented fresh: `looksLikeDeepDataRow` (a real data row is
// overwhelmingly numeric-shaped; a wrapped header label tier never is) is a
// hard stop so this can never mis-read actual row data as more header text;
// a tight row-to-row Y proximity gate (skipSubHeaderContinuation's own
// established "still the same header block" scale) keeps the walk from
// wandering into an unrelated table below; and a row-count cap. A ROW that
// itself carries a vocabulary hit (SYMBOL/TAG/TYPE/…) is skipped, not a stop
// — real tables wrap a catalog-anchor-bearing sub-label (itd-d1-lab's own
// two-line "UNIT" / "TAG") between two genuine sub-tier rows, and stopping
// there would cut the walk off before ever reaching tiers still further down.
//
// A last guard: a candidate token within one column-pitch of an anchor that
// ALREADY exists (from this pass or any earlier one) never mints a new
// anchor — a bare unit-fragment or footnote annotation sitting geometrically
// near an already-real column (this table's own "REMARK 2"/"MERV 8" footnote
// markers, printed inside header cells) must never manufacture a phantom
// duplicate column instead of being silently, correctly ignored.
const DEEP_SUB_LABEL_RE = /^[A-Z0-9][A-Z0-9.\/%°∅Ø-]{0,10}$/;
const DATA_VALUE_RE = /^[\d][\d,.\/ "%-]*$/;
function looksLikeDeepDataRow(row: GraphSpan[]): boolean {
  const numeric = row.filter((t) => DATA_VALUE_RE.test(t.str.trim())).length;
  return numeric >= 2 || numeric >= Math.ceil(row.length * 0.3);
}
function harvestGeometricSubTiers(
  rows: GraphSpan[][],
  vocab: string[],
  startIdx: number,
  anchors: Anchor[],
): { anchors: Anchor[]; dataFrom: number } {
  let out = anchors.slice();
  let dataFrom = startIdx;
  const MAX_ROWS = 15;
  for (let ri = startIdx, n = 0; ri < rows.length && n < MAX_ROWS; ri++, n++) {
    if (looksLikeDeepDataRow(rows[ri])) break;
    const leading = [...rows[ri]].sort((a, b) => a.x - b.x)[0];
    const leadingKey = leading ? rowKeyOf(leading.str, "equipment") : null;
    // A real digit-bearing equipment key is a definitive data boundary even
    // when the rest of its sparse row contains too little numeric content
    // for looksLikeDeepDataRow (AS-1/E1/AHU-1 fixture shapes). Deep header
    // labels may be bare words, but they do not lead with a catalog tag.
    if (leadingKey && /\d/.test(leadingKey.key)) break;
    if (ri > startIdx) {
      const prev = rows[ri - 1];
      const h = prev.reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, prev.length);
      if (rowY(rows[ri]) - rowY(prev) > h * 3) break;
    }
    dataFrom = ri + 1;
    // A row carrying a bare CATALOG_ANCHOR_WORD (SYMBOL/TAG/ID/MARK) is
    // SKIPPED, not a stop — this exact table wraps a catalog-anchor-bearing
    // sub-label ("UNIT" / "TAG", itself a real fragment of "COIL AIR P.D." /
    // "UNIT TAG") BETWEEN two genuine sub-tier rows; stopping there (tried
    // first, a `break`) cuts the walk off before ever reaching the real
    // DESIGN/ACTUAL/SENSIBLE/TOTAL/D.B./W.B./EFF./DEPTH tier still further
    // down, silently un-splitting every one of THOSE already-correct sub-
    // columns back to their bare parents (a real regression, caught by this
    // file's own AHU-1 direct-render check) — `continue` only skips that one
    // row and keeps the walk going, which is all this ever needed.
    //
    // An ORDINARY vocabulary hit (ESP/HP/RPM/CFM/MCA…) does not even reach
    // this check: it is never a reason to skip the row at all. This exact
    // deep header packs already-claimed vocabulary words onto the SAME
    // physical row as genuinely un-recovered bare labels of its own — real,
    // corpus-found (itd-d1-lab-mechanical.pdf#15's own AIR HANDLING UNIT
    // SCHEDULE: "…MCA | MROPD | V/PH" sits on one row — MCA is already a
    // real anchor from this table's own vocabulary, MROPD and this table's
    // SECOND V/PH are not, and never will be if the whole row is refused the
    // moment MCA is seen). A whole-row skip on ANY vocab hit (the original
    // gate here) was tried narrowed to CATALOG_ANCHOR_WORDS alone once
    // before and reverted: without the per-TOKEN "already spoken for" test
    // below, narrowing the row gate alone also freed OTHER, already-correct
    // bare tokens on an unrelated row (PRE-FILTER/FINAL FILTER's own bare
    // group labels) to be re-grouped into WRONG runs by this function's own
    // generic run-splitting, breaking PRE-FILTER/FINAL FILTER's own already-
    // correct EFF./DEPTH sub-columns. The real fix is per-TOKEN, not row-
    // level: a bare candidate whose own x already falls inside an EXISTING
    // BOUNDED anchor's own resolved [x0,x1] span (PRE-FILTER EFF./PRE-FILTER
    // DEPTH already claim that whole interval, by construction, from an
    // earlier real 2-way split) is already spoken for and excluded below —
    // MROPD/V/PH/MODEL's own positions fall inside no existing anchor's
    // resolved span at all, so they stay eligible.
    if (headerHits(rows[ri], vocab).some((h) => CATALOG_ANCHOR_WORDS.includes(h.label))) continue;
    // `rows` clusters by a CHAINED running-mean y-tolerance (clusterRows):
    // several genuinely DIFFERENT physical printed lines, each individually
    // within tolerance of the one before it, can chain-merge into ONE
    // logical "row" here even though the first and last line in the chain
    // sit well apart. Real, corpus-found on THIS exact table: the physical
    // lines for "MAX FACE / AIR" (a PRE-FILTER/FINAL FILTER face-velocity
    // fragment), "PRE-FILTER" / "FINAL FILTER" (their own group-label row)
    // and "CFM | RATING | (LBS)" (MIN. O.S.A./AHRI EER/OPERATING WEIGHT's
    // own third tier) chain-merge into one row spanning ~13px — the row
    // this function's own row-to-row Y-gate (above) never catches, because
    // that gate only ever measures gaps BETWEEN two already-clustered rows,
    // not the internal spread WITHIN one. Once merged, "PRE-FILTER"/"FINAL
    // FILTER" are indistinguishable, by this function's own generic run-
    // splitting, from a genuine loose leaf tier — and because this row is
    // walked BEFORE the real DESIGN/ACTUAL/…/EFF./DEPTH tier two rows down,
    // minting from it first steals PRE-FILTER EFF./DEPTH's own x-position
    // before the real tier ever gets there, so the per-TOKEN "already
    // spoken for" test below (which only sees anchors that already exist)
    // never has anything to reject it with. A genuine single-tier row's own
    // internal y-spread is glyph-jitter only, a small fraction of its own
    // token height; a chain-merged row's is not — refusing to mint from a
    // row whose own spread already exceeds half its own median token height
    // costs nothing on a real single-tier row (every one measured on this
    // table sits under 5px against an ~19px token height) and keeps this
    // function out of a row it cannot safely read at all.
    const rowYs = rows[ri].map((t) => t.y);
    const rowHs = rows[ri].map((t) => t.h || 8).sort((a, b) => a - b);
    const rowMedH = rowHs[rowHs.length >> 1] || 8;
    if (Math.max(...rowYs) - Math.min(...rowYs) > rowMedH * 0.5) continue;
    // NOT out[0].x/out[out.length-1].x: `out` is appended to (mintSubAnchors,
    // below) without being re-sorted mid-walk, so once an earlier row in
    // THIS SAME walk mints anything, the newly-pushed anchor sits at the
    // array's END regardless of its own x — real, found live on THIS exact
    // table: once FINNED HEIGHT/WIDTH and FACE AREA/VEL. mint from an
    // earlier row, `out[out.length-1].x` becomes FACE VEL.'s own x (~3153)
    // instead of the table's true rightmost anchor (REMARKS, ~4432) — every
    // later row's own real tokens sitting further right (PRE-FILTER EFF./
    // DEPTH, FINAL FILTER EFF./DEPTH, ~3270–3557) then fail `mid(t) < hi`
    // and silently never enter `loose` at all. A genuine min/max over every
    // anchor's own x is order-independent and costs nothing when `out`
    // happens to already be sorted (the common case elsewhere in this file).
    const xs = out.map((a) => a.x);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const mid = (t: GraphSpan) => t.x + (t.w || 0) / 2;
    const alreadyClaimed = (t: GraphSpan): boolean =>
      out.some((a) => a.x0 != null && a.x1 != null && mid(t) >= a.x0 && mid(t) <= a.x1);
    const loose = rows[ri]
      // A bare digit (the "2" in a wrapped "(FT²)" superscript, split into
      // its own token by the tokenizer) matches the character class but
      // names no column of its own — a real sub-label always carries at
      // least one letter.
      .filter((t) => !headerLabel(t.str, vocab) && DEEP_SUB_LABEL_RE.test(norm(t.str)) && /[A-Z]/.test(t.str))
      .filter((t) => mid(t) > lo && mid(t) < hi)
      .filter((t) => !alreadyClaimed(t))
      .sort((a, b) => a.x - b.x);
    // A genuine deep sub-tier row is DENSE — many real 2-way (or more) splits
    // packed across the table's width (this table's own row: 16 tokens, 7
    // real pairs). A row with only a handful of loose tokens is far more
    // likely a couple of ordinary WRAPPED CONTINUATION WORDS from unrelated
    // neighboring multi-line labels ("UNIT" / "AIR" / "COIL", themselves
    // fragments of "UNIT TAG" and "COIL AIR P.D." two rows apart) than a
    // real sub-column tier — those have no reliable shape signal to
    // distinguish from the real thing, so density is the gate instead.
    if (loose.length < 4) continue;
    const gaps = loose.slice(1).map((t, i) => mid(t) - mid(loose[i])).sort((a, b) => a - b);
    // Genuine median, not always the upper-middle element — see bandLimits'
    // and subTierAnchors' own comments for the real regression this exact
    // idiom causes on an even gap count.
    const med = gaps[(gaps.length - 1) >> 1] || 1;
    const halfPitch = Math.min(Math.max(24, med / 2), 300);
    const used = new Set(out.map((a) => a.label));
    const withParent = loose
      .map((t) => ({ t, parent: parentPhraseOver(rows, ri, ri - 8, mid(t) - halfPitch, mid(t) + halfPitch, vocab) }))
      .filter((x): x is { t: GraphSpan; parent: string } => x.parent != null);
    if (!withParent.length) continue;
    const subRuns: Array<typeof withParent> = [[withParent[0]]];
    for (let i = 1; i < withParent.length; i++) {
      const prev = withParent[i - 1], cur = withParent[i];
      const tail = subRuns[subRuns.length - 1];
      if (cur.parent === prev.parent && mid(cur.t) - mid(prev.t) <= med * 3) tail.push(cur);
      else subRuns.push([cur]);
    }
    for (const sr of subRuns) {
      // A genuine sub-tier is a real GROUP — 2 or more siblings under the
      // SAME resolved parent. A lone token that resolved to a parent no
      // sibling shares is exactly the false-positive shape above (an
      // isolated fragment nearest, by bare distance, to some unrelated
      // phrase) — never mint a column for it.
      if (sr.length < 2) continue;
      // "Already covered" must stay MUCH tighter than the parent-search
      // window: a real 2-way split's own children sit, BY CONSTRUCTION, at
      // roughly ±halfPitch from their parent's own (centered) bare anchor —
      // using halfPitch here would reject exactly the real children this
      // function exists to recover (confirmed live: MBH/EAT/LAT's own
      // already-existing bare anchors sit almost exactly BETWEEN their real
      // SENSIBLE/TOTAL, D.B./W.B. children, well within one halfPitch of
      // both). A real duplicate — a footnote number sitting geometrically
      // inside an already-real column ("REMARK 2" under SUPPLY FAN TYPE,
      // "MERV 8" under an EFF. column) sits far tighter than that, close to
      // the anchor's own exact center — a small fixed radius (independent of
      // this row's own, possibly wide, local pitch) is the right test.
      const DUP_TOL = 20;
      const filtered = sr.filter((x) => !out.some((a) => Math.abs(a.x - mid(x.t)) <= DUP_TOL));
      if (filtered.length < 2) continue;
      mintSubAnchors(out, used, filtered, mid);
    }
  }
  return { anchors: out.sort((a, b) => a.x - b.x), dataFrom };
}

// ── numeric-only sub-header discrimination gate (itd-d1-lab-mechanical.pdf
// #14's own SOUND ATTENUATOR SCHEDULE) ──────────────────────────────────────
// Used to gate harvestNumericSubHeaders below (its own comment has the real
// motivating shape — OCTAVE BAND FREQUENCY's own bare 63/125/…/8000 numeric
// sub-columns). Same real signal `hasPoweredEquipmentColumns` already uses
// for the identical SA-1-vs-LEF-1 discrimination problem (see that
// function's own comment): a passive duct fitting carries no motor/
// electrical nameplate vocabulary at all, a real powered MEP-equipment
// schedule always does. Reimplemented directly against `rows` (rather than
// calling hasPoweredEquipmentColumns itself) because no ScheduleTable/region
// exists yet at this point in extraction — this runs during header/anchor
// discovery, before a table object is ever built. Scoped to THIS table's own
// X span (its own already-found anchors) for the same reason
// harvestNumericSubHeaders' own comment gives: `rows` clusters by Y alone,
// sheet-wide, so an unrelated real powered-equipment table sitting at a
// similar header height (confirmed live: this sheet's own Electric Heater
// Schedule overlaps SOUND ATTENUATOR SCHEDULE's own row range in Y) would
// otherwise leak its own real KW/AMPS/HP words in and wrongly refuse a
// genuinely passive table.
//
// A companion mechanism was also tried here — an "orphan leaf column"
// harvester recovering this table's own LETTER-bearing un-vocabularied
// columns (TYPE, AIRFLOW, MAXIMUM FACE VELOCITY, LENGTH/WIDTH/HEIGHT, FACE
// AREA, WEIGHT — every real column this table has besides the numeric
// octave bands) the same way this one recovers the numeric ones. It DID
// recover SOUND ATTENUATOR SCHEDULE's own columns correctly, several rounds
// of narrowing deep (X-scoping against cross-table Y-band bleed, a tight
// fixed same-column radius, a leaf-row symmetry-check bypass, this same
// powered-equipment refusal) — but the full corpus-wide mandatory sweep
// still caught it: it silently added wrong extra columns to a real,
// hand-verified DIFFUSER/GRILLE/REGISTER SCHEDULE fixture (bessemer) via the
// exact "same column grid, stacked schedules" cross-table bleed this file's
// own established machinery already guards against elsewhere, AND it
// dropped 21 real equipment tags from itd-d1-lab's own takeoff-eval
// (CH-1..4, HUM-1, SAV-1..9, SN-1..5, HC-8/9 — confirmed by isolating it:
// removing just this one harvester, keeping the numeric one below,
// restored itd-d1-lab to its real 100.0%). A letter-bearing token has no
// signature nearly as narrow as a monotonic-doubling numeric run — every
// attempt at a tighter geometric gate for it ran back into the same
// "genuine new column" vs. "neighboring table's own real header word"
// ambiguity. Left unattempted rather than shipped unsafe: SOUND ATTENUATOR
// SCHEDULE's own TYPE/AIRFLOW/VELOCITY/LENGTH/WIDTH/HEIGHT/FACE AREA/WEIGHT
// columns remain unrecovered (still folded into whichever named anchor
// nearest-anchor banding happens to pick), a real, honestly disclosed gap —
// not this project's silent one.
function looksLikePoweredEquipmentBlock(rows: GraphSpan[][], fromIdx: number, toIdx: number, anchors: Anchor[]): boolean {
  const ax = anchors.map((a) => a.x).sort((a, b) => a - b);
  const gaps0 = ax.slice(1).map((x, i) => x - ax[i]).filter((g) => g > 0);
  const baseline0 = gaps0.length ? Math.min(...gaps0) : 0;
  const x0 = ax.length ? ax[0] - baseline0 : -Infinity;
  const x1 = ax.length ? ax[ax.length - 1] + baseline0 : Infinity;
  const hits = new Set<string>();
  for (let ri = fromIdx; ri <= toIdx && ri < rows.length; ri++) {
    const scoped = rows[ri].filter((t) => centerX(t) >= x0 && centerX(t) <= x1);
    for (const h of headerHits(scoped, POWERED_EQUIPMENT_REQUIRED)) hits.add(h.label);
  }
  // A single hit is enough to refuse here — a LOWER bar than
  // hasPoweredEquipmentColumns' own >=2 (that function decides whether to
  // RECLASSIFY a whole table finish→equipment, where one stray word is a
  // realistic false positive worth guarding against). This function decides
  // something with a much lower failure cost the OTHER way: real, found
  // live (itd-d1-lab's own BYPASS CONTROL VALVE SCHEDULE, ledger item 57) —
  // a table whose finish-kind read already independently qualifies AND
  // whose equipment-kind read ALSO independently qualifies (both real,
  // legitimate reads of the same physical table) needs only ONE bare
  // EQUIPMENT_REQUIRED word (GPM alone) sitting on finish's own settled
  // header row to reach equipment's own richness and win their tie-break —
  // the exact FINISH_HEADERS-comment hazard, reproduced through a single
  // word. Refusing on any single hit costs nothing on a genuinely passive
  // table (confirmed live: SOUND ATTENUATOR SCHEDULE's own real header
  // carries zero POWERED_EQUIPMENT_REQUIRED words, not even one).
  return hits.size >= 1;
}
// ── numeric-only sub-header leaf columns, geometry-only (itd-d1-lab-
// mechanical.pdf#14's own SOUND ATTENUATOR SCHEDULE, OCTAVE BAND FREQUENCY
// (HZ) → 63/125/250/500/1000/2000/4000/8000) ────────────────────────────────
// A bare row of octave-band numbers reads, to every OTHER heuristic in this
// file, EXACTLY like an ordinary data row:
// looksLikeDeepDataRow's own numeric-shape test cannot tell "63 | 125 | 250 |
// 500 | 1000 | 2000 | 4000 | 8000" apart from a real row of measurements by
// shape alone. What DOES tell them apart, confirmed against this table's own
// real data row (SA-1: "13,000 | 2,500 | 84 | 58 | 22 | - | 0.22 | - | 11 |
// 18 | 28 | 30 | 36 | 26 | 22 | 14 | …"): real HVAC data values in this
// corpus are heterogeneous — commas, decimals, dashes, mixed magnitudes — a
// genuine octave-band header is a clean, monotonically DOUBLING sequence of
// bare small integers (each roughly 2x the one before, the actual acoustic
// octave-band convention: 63,125,250,500,1000,2000,4000,8000), a shape no
// real measurement row in this corpus's own data happens to share. Requires
// >=3 to rule out a coincidental 2-value pair, and refuses a row that also
// carries the table's own real key-shaped token (CODE_RE) — a genuine data
// row always does, a header row never does. Never guesses a label: only
// mints when parentPhraseOver resolves a REAL phrase or vocabulary word
// already sitting above the numbers (here, "OCTAVE BAND FREQUENCY", read
// off the sheet's own text, not hardcoded) — an unexplained numeric run
// never becomes a column.
const BARE_INT_RE = /^\d{1,5}$/;
function harvestNumericSubHeaders(rows: GraphSpan[][], vocab: string[], idx: number, endIdx: number, anchors: Anchor[]): Anchor[] {
  const out = anchors.slice();
  const used = new Set(anchors.map((a) => a.label));
  // `rows` clusters spans by Y ALONE, sheet-wide — a second, unrelated table
  // sitting side-by-side at nearly the same Y band could otherwise leak its
  // own tokens into this walk. Scoped to this table's own established X
  // span before ever looking for a doubling run.
  const ax = anchors.map((a) => a.x).sort((a, b) => a - b);
  const gaps0 = ax.slice(1).map((x, i) => x - ax[i]).filter((g) => g > 0);
  const baseline0 = gaps0.length ? Math.min(...gaps0) : 0;
  const x0Table = ax.length ? ax[0] - baseline0 : -Infinity;
  const x1Table = ax.length ? ax[ax.length - 1] + baseline0 : Infinity;
  // Deliberately NOT capped at `endIdx` — skipSubHeaderContinuation's own
  // pre-existing boundary (computed by logic this fix must never alter)
  // stops SHORT of exactly this row shape: a row mixing ONE real lettered
  // leaf ("WIDTH (IN)") with several bare numbers reads, to that boundary
  // logic, like the start of real data. This walk instead uses its own
  // independent bounds: a row-count cap and a stop at the table's own real
  // data row.
  const MAX_ROWS = 15;
  const keyX = ax[0];
  for (let ri = idx + 1, n = 0; ri < rows.length && n < MAX_ROWS; ri++, n++) {
    // The table's own real data row carries its real tag AT the key
    // column's own position — checked there specifically, not against every
    // token on the row: CODE_RE's own loose shape (1-4 letters, optional
    // -alnum suffix) matches plenty of ordinary header text by coincidence
    // ("WIDTH (IN)" strips to "WIDTHIN", a real match) that carries no key
    // meaning at all, sitting nowhere near the table's own key column.
    const hasKeyTag = rows[ri].some((t) => Math.abs(centerX(t) - keyX) <= 20 && CODE_RE.test(norm(t.str).replace(/[^A-Z0-9/-]/g, "")));
    if (hasKeyTag) break;
    const nums = rows[ri]
      .filter((t) => BARE_INT_RE.test(t.str.trim()))
      .filter((t) => centerX(t) >= x0Table && centerX(t) <= x1Table)
      .sort((a, b) => a.x - b.x);
    if (nums.length < 3) continue;
    const vals = nums.map((t) => parseInt(t.str.trim(), 10));
    let shapeOk = true;
    for (let k = 1; k < vals.length && shapeOk; k++) {
      const ratio = vals[k] / vals[k - 1];
      if (vals[k] <= vals[k - 1] || ratio < 1.6 || ratio > 2.5) shapeOk = false;
    }
    if (!shapeOk) continue;
    const last = nums[nums.length - 1];
    const parent = parentPhraseOver(rows, ri, idx, nums[0].x, last.x + (last.w || 0), vocab);
    if (!parent) continue;
    // Defensive: if some earlier anchor already carries this exact resolved
    // parent phrase as its own bare (dataless) label, it is superseded by
    // the real numbered children below and removed — never left standing as
    // a redundant, empty duplicate column that would only crowd the real
    // numbered children out during banding.
    for (let k = out.length - 1; k >= 0; k--) {
      if (out[k].label === parent || out[k].label.endsWith(` ${parent}`)) {
        used.delete(out[k].label);
        out.splice(k, 1);
      }
    }
    for (const t of nums) {
      const label = `${parent} ${t.str.trim()}`;
      if (used.has(label)) continue;
      used.add(label);
      out.push({ label, x: t.x + (t.w || 0) / 2 });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

/** A below-idx row whose OWN tokens are real vocabulary words (HP/RPM under
 * a "MOTOR" group; SIZE under a "VALVE OUTLET" group) is exactly the shape
 * harvestGeometricSubTiers' own comment assumes "the rest of this file
 * already handles" — untrue for a genuinely SMALL (2-3 column) leaf tier:
 * real, corpus-found live, itd-d1-lab-mechanical.pdf#12's own PUMP SCHEDULE
 * ("MOTOR" spanning HP/RPM/V/Ø, several real tiers below the settled
 * SYMBOL/AREA SERVED/TYPE row) and its own PRESSURE INDEPENDENT …VALVE
 * SCHEDULEs ("VALVE OUTLET" spanning QUANTITY/SIZE). Nothing else in this
 * file ever claims these: the main tier-descent only ever looks at ONE row
 * (`idx`); mergeForwardCoEqualTier requires the WHOLE row to independently
 * qualify (a real rating word + minHits — a bare 2-3-token leaf tier never
 * clears that bar on its own); harvestGeometricSubTiers is gated OFF
 * entirely by ANY bare vocabulary hit, by design, for a different real case
 * (a genuinely unrelated table's own header one tier below) — and its own
 * density floor (>= 4 loose tokens, calibrated for ambiguous NON-vocabulary
 * fragments) is the wrong bar for a 2-3-token tier where every token is
 * ALREADY independently real, recognized vocabulary, not a guess.
 *
 * Deliberately a separate, narrower pass rather than a relaxation of
 * harvestGeometricSubTiers itself: that function's existing behavior is
 * exercised by real, already-passing tables today, and loosening its own
 * density/vocab gates in place risks changing what it already does for
 * every one of them. This only ever ADDS a column nothing above already
 * covers, gated the same two ways real, established callers in this file
 * already use for the identical reason: a bare CATALOG_ANCHOR_WORD
 * (SYMBOL/TAG/ID/MARK) in the row is always a different table's own header,
 * a hard stop (mergeForwardCoEqualTier's own signal); and only >= 2 tokens
 * sharing the SAME real parent above ever mint anything (a lone token
 * resolving to a parent no sibling shares is the exact same false-positive
 * shape subTierAnchors/harvestGeometricSubTiers already guard against). */
/** Like parentPhraseOver, but walks row-by-row with a PER-STEP gap
 * tolerance (the same "still one header block" scale used throughout this
 * file — skipSubHeaderContinuation, harvestGeometricSubTiers' own downward
 * walk) instead of one fixed total-distance budget. parentPhraseOver's own
 * `near` bound is calibrated for reaching one or two tiers up and is too
 * tight to tunnel all the way through a genuinely DEEP header (5-7 tightly-
 * packed tiers in under 100px — real, corpus-found, itd-d1-lab-mechanical
 * .pdf#12's own PUMP SCHEDULE and PRESSURE INDEPENDENT …VALVE SCHEDULEs) —
 * a leaf tier several real rows below its own group parent would never
 * reach it through a single fixed-distance cap even though every
 * intervening row-to-row gap is individually perfectly ordinary. */
function chainedParentAbove(rows: GraphSpan[][], fromRi: number, topIdx: number, gx0: number, gx1: number, vocab: string[]): string | null {
  const width = Math.max(gx1 - gx0, 1);
  let cur = fromRi;
  let best: { text: string; d: number } | null = null;
  for (let steps = 0; steps < 10 && cur > topIdx; steps++) {
    const j = cur - 1;
    if (j < topIdx) break;
    const h = rows[cur].reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, rows[cur].length);
    if (rowY(rows[cur]) - rowY(rows[j]) > h * 3) break;
    for (const t of rows[j]) {
      const cx = t.x + (t.w || 0) / 2;
      const inInterval = cx >= gx0 && cx < gx1;
      const overlaps = Math.min(t.x + (t.w || 0), gx1) - Math.max(t.x, gx0) > width * 0.3;
      if (!inInterval && !overlaps) continue;
      const lbl = headerLabel(t.str, vocab);
      if (lbl) return lbl;
      const s = norm(t.str);
      if (!PHRASE_RE.test(s) || /^\(.*\)$/.test(s)) continue;
      const d = (rowY(rows[cur]) - rowY(rows[j])) * 1000 + Math.abs(cx - (gx0 + gx1) / 2);
      if (!best || d < best.d) best = { text: s, d };
    }
    cur = j;
  }
  return best?.text ?? null;
}

/** The envelope loop above (`if (idx > i) { … }`, inside findHeaderRow
 * proper) picks up a parent-tier row's own bare vocabulary hits (EWT/LWT
 * sitting one tier above SYMBOL/AREA SERVED — real, corpus-found: itd-d1-
 * lab-mechanical.pdf#13's own CONDENSING HOT WATER BOILER SCHEDULE) — but
 * ONLY across the `i..idx-1` window a real tier-descent actually walked
 * through. When the settled header row IS `i` itself — no descent, because
 * a bare required word was found via nearbyRequiredHitWide reaching
 * BACKWARD instead (precisely the real shape that mechanism exists for) —
 * that window is empty and the very column that let this table qualify as
 * equipment-kind at all never becomes an anchor. Chain-walks upward the
 * same bounded way harvestBareVocabLeafTiers walks downward — a real
 * column word a genuine few tight tiers above `idx`, not just one row up —
 * and mints each hit as its OWN bare anchor (no parent prefix): unlike
 * harvestBareVocabLeafTiers' own leaf children (HP/RPM under MOTOR), a real
 * vocabulary word here is already fully self-descriptive on its own. */
function harvestBareVocabAboveTiers(rows: GraphSpan[][], vocab: string[], idx: number, anchors: Anchor[]): Anchor[] {
  const out = anchors.slice();
  const used = new Set(out.map((a) => a.label));
  const lo = out[0].x, hi = out[out.length - 1].x;
  const mid = (t: GraphSpan) => t.x + (t.w || 0) / 2;
  const MAX_ROWS = 6;
  for (let ri = idx - 1, n = 0; ri >= 0 && n < MAX_ROWS; ri--, n++) {
    if (looksLikeDeepDataRow(rows[ri])) break;
    const below = rows[ri + 1];
    const h = below.reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, below.length);
    if (rowY(below) - rowY(rows[ri]) > h * 3) break;
    const hits = headerHits(rows[ri], vocab);
    if (hits.some((hh) => CATALOG_ANCHOR_WORDS.includes(hh.label))) break;
    for (const hh of hits) {
      if (/^\(.*\)$/.test(hh.span.str.trim())) continue;
      if (used.has(hh.label)) continue;
      const cx = mid(hh.span);
      if (cx <= lo || cx >= hi) continue;
      if (out.some((a) => Math.abs(a.x - cx) <= 20)) continue;
      used.add(hh.label);
      out.push({ label: hh.label, x: cx });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

function harvestBareVocabLeafTiers(rows: GraphSpan[][], vocab: string[], topIdx: number, startIdx: number, anchors: Anchor[]): Anchor[] {
  let out = anchors.slice();
  const MAX_ROWS = 6;
  for (let ri = startIdx, n = 0; ri < rows.length && n < MAX_ROWS; ri++, n++) {
    if (looksLikeDeepDataRow(rows[ri])) break;
    if (ri > startIdx) {
      const prev = rows[ri - 1];
      const h = prev.reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, prev.length);
      if (rowY(rows[ri]) - rowY(prev) > h * 3) break;
    }
    const hits = headerHits(rows[ri], vocab);
    if (hits.some((h) => CATALOG_ANCHOR_WORDS.includes(h.label))) break;
    // NOT out[0].x/out[out.length-1].x — see harvestGeometricSubTiers' own
    // identical fix for the real regression an unsorted `out` (appended to
    // mid-walk, never re-sorted until this function returns) causes here.
    const xs = out.map((a) => a.x);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const mid = (t: GraphSpan) => t.x + (t.w || 0) / 2;
    // A leaf tier's own real siblings are not always UNIFORMLY vocabulary
    // ("MOTOR" → HP/RPM, both vocab) or uniformly not ("VALVE OUTLET" →
    // QUANTITY, not vocab, next to SIZE, which is) — real, corpus-found:
    // the SAME "…VALVE SCHEDULE" family mixes both in the ONE row. Each
    // token's own label is its resolved vocabulary word when it has one,
    // else its own raw (short, all-caps-shaped) text — the identical
    // fallback headerHits/mintSubAnchors already use elsewhere in this
    // file, just applied per-token instead of gating the whole row on it.
    const candidates: Array<{ t: GraphSpan; label: string }> = [];
    for (const t of rows[ri]) {
      if (mid(t) <= lo || mid(t) >= hi) continue;
      const vocabLbl = headerLabel(t.str, vocab);
      if (vocabLbl) {
        if (!/^\(.*\)$/.test(t.str.trim())) candidates.push({ t, label: vocabLbl });
        continue;
      }
      if (DEEP_SUB_LABEL_RE.test(norm(t.str)) && /[A-Z]/.test(t.str)) candidates.push({ t, label: norm(t.str) });
    }
    candidates.sort((a, b) => mid(a.t) - mid(b.t));
    if (candidates.length < 2) continue;
    const gaps = candidates.slice(1).map((c, i) => mid(c.t) - mid(candidates[i].t)).sort((a, b) => a - b);
    // Genuine median, not always the upper-middle element — see bandLimits'
    // and subTierAnchors' own comment: `gaps.length >> 1` lands on the
    // LARGER of exactly two gaps (the common case, 3 candidates), an
    // outlier neighbor gap masquerading as "typical pitch" that inflates
    // this radius far past any real disambiguation distance.
    const med = gaps[(gaps.length - 1) >> 1] || 1;
    const halfPitch = Math.min(Math.max(24, med / 2), 300);
    const withParent = candidates
      .map((c) => ({ ...c, parent: chainedParentAbove(rows, ri, topIdx, mid(c.t) - halfPitch, mid(c.t) + halfPitch, vocab) }))
      .filter((x): x is { t: GraphSpan; label: string; parent: string } => x.parent != null);
    if (!withParent.length) continue;
    const byParent = new Map<string, typeof withParent>();
    for (const w of withParent) {
      if (!byParent.has(w.parent)) byParent.set(w.parent, []);
      byParent.get(w.parent)!.push(w);
    }
    const DUP_TOL = 20;
    const used = new Set(out.map((a) => a.label));
    for (const group of byParent.values()) {
      if (group.length < 2) continue;
      const filtered = group.filter((x) => !out.some((a) => Math.abs(a.x - mid(x.t)) <= DUP_TOL));
      if (filtered.length < 2) continue;
      for (const { t, label, parent } of filtered) {
        const full = `${parent} ${label}`;
        if (used.has(full)) continue;
        used.add(full);
        out.push({ label: full, x: mid(t) });
      }
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

// Rotated headers (#87 phase 2): column labels written at 90° stack each word
// in a tall, narrow box, so y-row clustering never assembles them into a
// header row — the anchor hunt above goes blind. Vertical spans get their own
// hunt: vocabulary matches whose y-extents overlap form the header BAND;
// each member's x-center is its column anchor; data rows band below the
// band's bottom edge exactly as they would under a horizontal header.
function findRotatedHeader(vert: GraphSpan[], vocab: string[], required: string[], minHits: number): { anchors: Anchor[]; top: number; bottom: number; spans: GraphSpan[] } | null {
  const cands = vert
    .map((sp) => ({ sp, label: headerLabel(sp.str, vocab) }))
    .filter((c): c is { sp: GraphSpan; label: string } => !!c.label)
    .sort((a, b) => a.sp.x - b.sp.x);
  let band: typeof cands = [];
  let y0 = 0, y1 = 0;
  const flush = (): ReturnType<typeof findRotatedHeader> => {
    const seen = new Set(band.map((c) => c.label));
    if (band.length < minHits || seen.size < minHits || !required.some((r) => seen.has(r))) return null;
    const anchors: Anchor[] = [];
    const used = new Set<string>();
    for (const c of band) if (!used.has(c.label)) { used.add(c.label); anchors.push({ label: c.label, x: c.sp.x + (c.sp.w || 0) / 2 }); }
    return { anchors: anchors.sort((a, b) => a.x - b.x), top: y0, bottom: y1, spans: band.map((c) => c.sp) };
  };
  for (const c of cands) {
    const cy0 = c.sp.y, cy1 = c.sp.y + (c.sp.h || 0);
    if (band.length && (cy0 > y1 || cy1 < y0)) {
      const done = flush();
      if (done) return done;
      band = [];
    }
    if (!band.length) { y0 = cy0; y1 = cy1; }
    else { y0 = Math.min(y0, cy0); y1 = Math.max(y1, cy1); }
    band.push(c);
  }
  return band.length ? flush() : null;
}

// A BOUNDED anchor claims only what falls inside it — that is the whole point
// of knowing a sub-column's edges. Everything else bands to the nearest
// UNBOUNDED header center, so a narrow BASE column keeps its own cell and
// never inherits the wall code drawn just past its rule line.
//
// Refuse-over-guess for the UNBOUNDED case too (accuracy-hardening plan,
// ledger item 57): when two adjacent anchors sit anomalously far apart
// relative to the table's OWN tightest confirmed column, real un-modeled
// columns are almost certainly hiding between them, and their real data has
// nowhere honest to land — nearest-anchor crammed it into whichever
// recognized anchor was closer regardless of how far, real, found live, on
// BYPASS CONTROL VALVE SCHEDULE (itd-d1-lab-mechanical.pdf#13): 5 of its 13
// real leaf columns (SERVES, VALVE TYPE, OPERATION, FLUID, FLOW RANGE
// (GPM)) have no representative in EQUIPMENT_HEADERS, and BCV-1's own GPM
// cell read "100% WATER 25 19-110 2.7 INDEPENDENT MODULATING" — six real
// values from five different real columns, only one of which (25) actually
// belongs there. A first attempt at this widened EQUIPMENT_HEADERS itself
// to name those columns and was reverted: it regressed table-BOUNDARY
// detection on this exact sheet (4 real tables found dropped to 2), because
// vocabulary feeds header-row QUALIFICATION, not just column banding. This
// fix touches neither vocabulary nor header-row detection — anchorRadii
// (below) only tightens how far an ALREADY-anchored column may reach once
// its own neighbour gap proves anomalous, so a normal, fully-vocabularied
// table (every gap close to the table's own baseline) is never touched.
const nearestAnchor = (x: number, anchors: Anchor[], radii?: Map<string, Radius>): string | null => {
  let inside: Anchor | null = null;
  for (const a of anchors) {
    if (a.x0 == null || a.x1 == null || x < a.x0 || x > a.x1) continue;
    if (!inside || Math.abs(a.x - x) < Math.abs(inside.x - x)) inside = a;
  }
  if (inside) return inside.label;
  let best: Anchor | null = null;
  let bestD = Infinity;
  for (const a of anchors) {
    if (a.x0 != null) continue;
    const d = Math.abs(a.x - x);
    if (d < bestD) { bestD = d; best = a; }
  }
  if (!best) return anchors[0].label;
  const r = radii?.get(best.label);
  // anomalously far — withheld, not guessed. Which SIDE of the anchor a
  // token sits on decides which cap applies — see anchorRadii's own comment
  // for why this has to be a per-side reach, not one symmetric radius.
  if (r != null && bestD > (x < best.x ? r.before : r.after)) return null;
  return best.label;
};

/** Per-anchor reach, in px, on each side of its own center: how far a token
 * may sit before it and still be credited to it. */
type Radius = { before: number; after: number };
// The reach, per side, per label: half the table's own SMALLEST unbounded-
// anchor gap, but only on a side whose OWN neighbour gap is well past that
// baseline (or has no neighbour at all — the table's own edge is not proof
// nothing real lies past it either). The smallest gap is never invented —
// every real table measured this session keeps at least one pair of
// adjacent anchors with nothing un-modeled between them (BCV's own
// MANUFACTURER→REMARKS, for instance), so it is a real, observed "one
// recognized column's normal span" for THIS table, not a guessed constant.
//
// PER SIDE, not one symmetric radius per anchor: real, found live — Fan
// Schedule's own MANUFACTURER anchor has a hugely inflated gap on its LEFT
// (DESCRIPTION, swallowing the real, un-modeled MODEL/AIR FLOW columns) but
// a perfectly normal gap on its RIGHT (nothing beyond it) — min(left,right)
// reads that as "not inflated" and the real MODEL NUMBER/CFM data kept
// bleeding in from the left. Symmetric on BCV's own GPM/SIZE only because
// both anchors there happen to sit between two other inflated gaps; Fan
// Schedule is the case that proves it has to be asymmetric in general.
//
// Needs at least 3 unbounded anchors (2 gaps) to mean anything; sub-tier
// BOUNDED anchors (x0/x1 already set — WALLS N/E/S/W) are excluded
// entirely, both from the baseline and from ever being capped — they
// already claim exactly their own width and this mechanism has nothing to
// add there.
const GAP_INFLATION_RATIO = 1.6;
const RADIUS_FACTOR = 0.5;
function anchorRadii(anchors: Anchor[]): Map<string, Radius> {
  const radii = new Map<string, Radius>();
  const unbounded = anchors.filter((a) => a.x0 == null).sort((a, b) => a.x - b.x);
  if (unbounded.length < 3) return radii;
  const gaps = unbounded.slice(1).map((a, i) => a.x - unbounded[i].x).filter((g) => g > 0);
  if (!gaps.length) return radii;
  const baseline = Math.min(...gaps);
  if (!(baseline > 0)) return radii;
  const cap = baseline * RADIUS_FACTOR;
  for (let i = 0; i < unbounded.length; i++) {
    // A deliberately wide gap is not always a hidden column: REMARKS /
    // DESCRIPTION / NOTES (WIDE_LAST, below) and a NAME key column both
    // EARN a wide margin by this file's own design (bandLimits' own
    // rightMargin/leftMargin) — a genuine wrapped remark or a long room-
    // type phrase, not un-modeled neighbours. Capping those here would
    // fight that existing, deliberate behavior (real regression, caught by
    // this file's own "wide REMARKS" test before this shipped).
    if (WIDE_LAST.has(unbounded[i].label) || unbounded[i].label === "NAME") continue;
    const left = i > 0 ? unbounded[i].x - unbounded[i - 1].x : Infinity;
    const right = i < unbounded.length - 1 ? unbounded[i + 1].x - unbounded[i].x : Infinity;
    // A wide MERGED column's own LEFT gap is exactly as "anomalous" by this
    // function's own baseline test as a genuine hidden neighbour's gap would
    // be — nothing here distinguishes "un-modeled column hiding in the gap"
    // (the real BCV/Fan-Schedule regression this function exists for) from
    // "this anchor's own header cell is simply wide, so its left-aligned
    // data legitimately starts well left of its centered header" (the exact
    // isWideMidAnchor shape, above). Only reachable for a MULTI-row table
    // whose real column-start recovery (columnMapFor) never runs — a
    // single/sparse-row table falls straight to this function's own
    // nearestAnchor fallback instead, with no other guard in between. Real,
    // found live on itd-d1-lab-mechanical.pdf#14's own DUCTLESS SPLIT HIGH
    // WALL COOLING UNIT SCHEDULE and SPLIT SYSTEM AIR CONDITIONING UNIT
    // SCHEDULE (each exactly one real data row: DFC-1, F-1): "MANUFACTURER
    // AND MODEL" sits between a tightly-packed numeric tier (SEER V/Ø, gap
    // ~72px) and REMARKS, its own gap-to-REMARKS scoring ~4.6x the table's
    // real median (isWideMidAnchor's own 3.5x bar, already proven safe by
    // the EH-1..9 fix) — the SAME real anchor shape columnMapFor's true-
    // nearest binding already exempts (isWideMidAnchor, above) when it DOES
    // run, just never consulted here. Every real row's own MANUFACTURER
    // value starts well left of its header center (e.g. "CARRIER FAN COIL
    // MODEL 40MHH24" at distance ~196px, more than 5x this table's own
    // ~36px cap) and was withheld outright, not merged or truncated —
    // confirmed by direct render. Scoped to the LEFT side only: a genuine
    // hidden column bleeding in from the RIGHT (this function's own real
    // motivating BCV/Fan-Schedule cases) is untouched, since neither of
    // those anchors' own gap-to-NEXT ever scores anywhere near 3.5x their
    // table's median (measured: ~1.0–1.05x) — isWideMidAnchor's own
    // right-side-only test cannot mistake one for the other.
    const wideMidLeft = isWideMidAnchor(anchors, unbounded[i]);
    const before = left > baseline * GAP_INFLATION_RATIO && !wideMidLeft ? cap : Infinity;
    const after = right > baseline * GAP_INFLATION_RATIO ? cap : Infinity;
    if (before < Infinity || after < Infinity) radii.set(unbounded[i].label, { before, after });
  }
  return radii;
}

// The ANCHORS bound the table, not the whole clustered row — on a dense sheet
// a neighbouring table's header can share the y-band, and its x-range must
// not leak in. Left margin is generous (data cells sit left of a centered
// header). The RIGHT edge depends on what the last column IS: a prose column
// (REMARKS / DESCRIPTION) earns three median gaps so a wide wrapped remark
// stays in; a code column (CEILING, WALL, COLOR) hugs its anchor — field-
// found on a real gym set: a finish legend sitting 300px right of a room
// schedule bled into every CEILING cell under the generous edge.
// "NOTES" is deliberately NOT in this set (ledger item 63), unlike REMARKS/
// DESCRIPTION: no vocabulary anywhere in this file could produce an anchor
// literally labeled "NOTES" before EQUIPMENT_HEADERS gained the word for the
// real LUMINAIRE SCHEDULE fix, so this omission changes no table that
// extracts correctly today — it is scoped purely to the table that motivated
// it. Found live on that exact table: baker-county-eoc-bidset.pdf#59's own
// "SHEET NOTES" side panel (a lettered A–J paragraph block, itself genuine
// prose, NOT this table's data) sits close enough right of the LUMINAIRE
// SCHEDULE's own NOTES column that the generous three-median-gap margin
// swept the whole panel into every row's NOTES cell — confirmed by direct
// render, and confirmed this omission alone is load-bearing: reinstating
// "NOTES" here (even with farFromCell, below, and anchorRadii's own distance
// cap both already active) reopens the same full bleed, because both of
// those guard a column ONCE something already occupies it — the initial
// token admitted into an empty NOTES cell is ungated by either. Combined
// with those two, real NOTES text now reads cleanly on every row that has
// any (P1, S1, V1, measured against the render) with no sheet-notes text
// bleeding in anywhere — this is no longer the partial residual it was
// before those two landed; a future genuinely WIDE wrapped NOTES column
// sitting close to unrelated prose is the remaining named edge, same class
// as item 57's SmithGroup precedent, not reachable by widening this set
// back (that reopens the exact bleed this avoids).
const WIDE_LAST = new Set(["REMARKS", "DESCRIPTION"]);
// Module-scope (not a bandDataRows-local closure) so bandGenericDataRows
// (the structural "reference" kind, below extractAllTables) can reuse it
// verbatim — a WIDE_LAST cell that already holds real text and is about to
// absorb a SECOND, far-off token is refused rather than merged; see
// bandDataRows' own historical comment (ledger item, two real mechanical
// sets) for the full real-bleed story this guards against.
const farFromCell = (label: string, t: GraphSpan, existing: TableCell | undefined): boolean =>
  !!existing && WIDE_LAST.has(label) && t.x - existing.bbox[2] > Math.max(80, (t.h || 8) * 8);
// A wide MERGED column can sit in the MIDDLE of a table, not only at its end
// (WIDE_LAST, above) — a real, generic drafting shape found live on itd-d1-
// lab-mechanical.pdf's ELECTRIC HEATER SCHEDULE: "MANUFACTURER AND MODEL"
// reserves a far wider span than its narrow numeric neighbors (KW, STEPS,
// V/Ø, AMPS — each ~90px apart), so its own real data ("MARKEL MODEL 3420
// SERIES") starts well left of its own centered header — closer to AMPS'
// anchor (distance ~75) than to its own (distance ~231). columnMapFor's
// true-nearest binding (above) mistakes that proximity for a genuine
// misalignment and reassigns the whole column to AMPS, where it is then
// silently discarded (AMPS' real numeric value already owns that cell) —
// every EH-1..EH-9 MANUFACTURER cell was dropped outright, not merged or
// truncated. Detected purely geometrically, from the anchors' own x-spacing
// on THIS table — never a label vocabulary — so it generalizes to any
// similarly wide merged column, not just this one sheet's own convention.
// Deliberately conservative (3.5x the table's own median inter-anchor gap):
// on this table MANUFACTURER's own gap-to-next scores ~4.4x median, clear of
// the threshold, while every ordinary column (including this same table's
// own TYPE anchor, which sits closer to its neighbor's true-nearest binding
// and must NOT be exempted — that binding is itself the fix for a distinct,
// already-shipped regression on itd-d1-lab's CONTROL VALVE SCHEDULE) scores
// under 2.2x. Anchors with too few neighbors to establish a meaningful
// "typical" spacing (fewer than 3 gaps) are left alone.
const WIDE_MID_RATIO = 3.5;
function isWideMidAnchor(anchors: Anchor[], anchor: Anchor): boolean {
  const idx = anchors.indexOf(anchor);
  if (idx < 0 || idx >= anchors.length - 1) return false; // last anchor: WIDE_LAST/bandLimits already own that case
  const gaps = anchors.slice(1).map((a, i) => a.x - anchors[i].x).filter((g) => g > 0);
  if (gaps.length < 3) return false;
  gaps.sort((a, b) => a - b);
  const median = gaps[(gaps.length - 1) >> 1];
  if (!(median > 0)) return false;
  const ownGap = anchors[idx + 1].x - anchor.x;
  return ownGap > median * WIDE_MID_RATIO;
}
// A NAME-keyed table's key column carries a room-TYPE phrase ("PATIENT
// TOILET ROOMS"), not a short numbered tag — a prose column exactly like
// REMARKS/DESCRIPTION/NOTES, just leading instead of trailing. The default
// left margin (half the inter-column gap) is sized for a short header word
// ("NUMBER") sitting close to short left-aligned data ("3", "134A"); a long
// phrase starts well to the left of its own centered "NAME" header — found
// live on this project's own sample: the header centers at x=459.8 but
// "PATIENT TOILET ROOMS" itself starts at x=342.2, outside the default
// margin, so its leading token never lands in the key column band at all
// and a later column's value gets read as the row's key instead.
function bandLimits(anchors: Anchor[]): { x0: number; x1: number; medGap: number } {
  const gaps = anchors.slice(1).map((a, i) => a.x - anchors[i].x).sort((a, b) => a - b);
  // A genuine median, not always the upper-middle element: `gaps.length >> 1`
  // is the correct middle index for an ODD gap count, but for an EVEN count
  // it always lands on the UPPER of the two middle gaps — for the most
  // common even case, exactly 2 gaps (a 3-anchor table), that means ALWAYS
  // the larger of the two, never an actual median. A `finish`-kind table
  // whose anchors skip many real, unrecognized columns hits this every
  // time — real, found live on itd-d1-lab-mechanical.pdf#14's SOUND
  // ATTENUATOR SCHEDULE (3 anchors: SYMBOL/MANUFACTURER/REMARKS, spanning
  // 21 real leaf columns): gaps [277.6, 1740.1] "medGap'd" to 1740.1 (the
  // larger), inflating leftMargin (`medGap / 2`) enough that a neighbouring
  // table's own unrelated REMARKS token ("1 , 3 , 5", the Electric Heater
  // Schedule's column, sitting at a coincidentally near-identical y) fell
  // inside this table's own x0 boundary — landing left of the real SA-1 tag
  // in x-order and becoming the row's leading token. Since that token isn't
  // key-shaped, the entire real data row read as an orphan and re-merged
  // under whatever garbage-keyed row sat nearest by y ("SILENCER", the
  // table's own wrapped 2nd line of a TYPE cell that independently passes
  // CODE_RE as a bogus row of its own) — SA-1 never became its own row, let
  // alone keyed correctly. Fixed: the LOWER of the two middle gaps for an
  // even count (`(gaps.length - 1) >> 1`) — identical index, and so
  // identical behavior, for an odd count (the two formulas coincide there),
  // and always a REAL gap the table's own anchors actually contain, never
  // an averaged/synthetic value that isn't. Real, measured fix: leftMargin
  // drops to 138.8 (half the real, smaller SYMBOL-adjacent gap), moving x0
  // from 1797.5 to 2528.7 — past the stray token's x=2468.2, so it never
  // enters this table's row band at all, and SA-1's own row now keys and
  // bands correctly (see sheetgraph.test.ts).
  const medGap = gaps.length ? gaps[(gaps.length - 1) >> 1] : 150;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const leftMargin = first.label === "NAME" ? Math.max(300, medGap * 3) : Math.max(80, medGap / 2);
  const rightMargin = WIDE_LAST.has(last.label) ? Math.max(300, medGap * 3) : Math.max(120, medGap);
  return { x0: first.x - leftMargin, x1: last.x + rightMargin, medGap };
}

// A finish code: scheduleParse's pattern. A schedule ROW key is looser than a
// plan bubble (detectRooms' 2–3 digits): real room-finish schedules carry
// "3", "3A", "139A" — one to three digits plus up to two letters. A
// building-QUALIFIED key ("A-134") is accepted only for a designator the set
// names (opts.buildings) — otherwise a stray finish code ("P-2") banding to
// the key column would mint a phantom building.
//
// Two real shapes, kept as separate alternatives rather than one loosened
// pattern (real, measured, navfac-cherry-point-atc-mechanical.pdf's own
// mechanical PUMP/AIR SEPARATOR/CONTROL VALVE schedules): a bare tag glues
// its trailing mark straight onto the prefix with no hyphen at all ("E1",
// "P1" — a single letter plus a digit, the ORIGINAL shape this branch alone
// used to cover, kept byte-for-byte as its own alternative so it can't
// regress), OR a real multi-segment hyphenated tag chains MULTIPLE
// hyphen-delimited segments, not just one: "PCHWP-A1" (a 5-letter prefix —
// PRIMARY CHILLED WATER PUMP — already past the old 4-letter cap on its
// own), "HHWP-DOAH-A1" (three real segments: circulator/served-unit/area),
// "CV-HHW-BP-A" (four: valve/system/BYPASS/area). Every one of these is a
// real row key read directly off that schedule's own rendered page, not a
// hypothesis — confirmed corpus-wide (every existing key tag across every
// set in this project, 384 total, matched byte-for-byte against both the
// old and new pattern) this widening drops NOTHING that used to match; it
// only recognizes the longer real prefixes and the extra hyphen segments
// mechanical pump/valve nomenclature routinely carries. The bare (no-
// hyphen) alternative deliberately keeps its OWN short original cap (not
// widened) rather than folding into the hyphenated alternative's wider
// per-segment cap — a bare, undelimited run has no structural signal at all
// telling a real short tag apart from an ordinary long word (REMARKS,
// MANUFACTURER, EQUIPMENT, …), so only the shape that already existed is
// kept for that case; the hyphenated alternative's own extra segments are
// what any wider match at all needs.
//
// Each hyphenated segment itself is NOT a blanket "1-6 alnum" run — real,
// measured regression caught corpus-wide (itd-d1-lab-mechanical.pdf#14's own
// DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE and SPLIT SYSTEM AIR
// CONDITIONING UNIT SCHEDULE): a comma-compound cell ("DFC-1 , DCU-1", one
// physical unit scheduled under two matched-set marks — a wall unit plus its
// own condensing unit) reads, once this file's own punctuation strip throws
// the comma away like any other separator it doesn't yet special-case, as
// one glued run — "DFC-1DCU-1". A blanket "1-6 alnum" per-segment pattern
// happily accepts that glued run too (prefix "DFC" + segment "1DCU", 4
// chars, well inside a 6-char cap) — same length class as a genuine segment
// ("DOAH" is also 4 chars — length alone cannot tell the two apart) — and
// mints ONE wrong key neither real mark ever answers to, burying both.
// What DOES tell them apart, structurally, every time: a real segment
// (DOAH/CHW/BP/A1/MT1/A/1, every one confirmed across this corpus) either
// starts with a letter or is pure digits — never a digit immediately
// followed by a letter. "1DCU" is exactly that impossible shape (a second
// real mark's own leading digit walked straight into a THIRD mark's own
// leading letter, an artifact of the comma vanishing, not a drafting
// convention). Requiring each segment to start with a letter (then up to 5
// more alnum) OR be pure digits (up to 5) costs nothing against the real
// corpus (same 384/52/139-tag, zero-regression corpus-wide check below) and
// correctly refuses the glued shape again — same refusal the old, narrower
// CODE_RE produced for it, restoring itd-d1-lab's own real 98.3% baseline
// (this specific row already resolves correctly via a separate, working
// mechanism this file does not touch) rather than silently taking it down
// while chasing a different set's own real gap.
const CODE_RE = /^(?:[A-Z]{1,4}[A-Z0-9]{0,4}|[A-Z]{1,6}(?:-(?:[A-Z][A-Z0-9]{0,5}|[0-9]{1,5})){1,4})$/;
// Every recognized column-header word, across all three vocabularies —
// a real device/finish tag is never itself the bare name of some table's
// column (the same axiom bandDataRows' own keyIsOwnColumn check already
// leans on — see its comment below — generalized here to run BEFORE a
// phantom row is ever minted, and across EVERY vocabulary, not just the
// current table's own kind: a stray fragment of an unconsumed deeper header
// tier just as often carries a DIFFERENT kind's vocabulary word ("CFM" is
// EQUIPMENT_HEADERS-only, yet bled into a real `finish`-kind DIFFUSER
// SCHEDULE's own row-key column below).
const ALL_HEADER_WORDS = new Set<string>([...ROOM_HEADERS, ...FINISH_HEADERS, ...EQUIPMENT_HEADERS]);
const ROW_KEY_RE = /^\d{1,3}[A-Z]{0,2}$/;
const QUALIFIED_KEY_RE = /^([A-Z]{1,2})-(\d{1,3}[A-Z]{0,2})$/;
// A NAME-keyed room-finish sub-table: a real, distinct drafting convention
// (confirmed live on this project's own sample-finish-plan.pdf, sheet 2's
// "ROOM FINISH SCHEDULE - PATIENT ROOMS (TYPICAL)") where the table carries
// NO numbered-room column at all — its key column is headed "NAME" outright
// and its rows are keyed directly by a room-TYPE phrase ("PATIENT ROOMS",
// "PATIENT TOILET ROOMS"), not a digit tag. `rowKeyOf` is told this by its
// caller (bandDataRows, which already knows the table's own anchors) rather
// than guessing from the string alone — a bare word can't tell a real room
// name from sheet debris, but "this table's key column IS its NAME column"
// is a fact about the TABLE, known before any row is read.
// Letters, digits, spaces and the narrow punctuation a real room-type phrase
// carries (parenthetical qualifier, ampersand, slash, hyphen) — long enough
// to read as a phrase, but this alone does not stop unrelated sheet text
// that happens to land in the column band from qualifying too (a table
// title fragment, a legend word); see findTableBoundary's own defense
// against exactly that, on the far side of a wide fallback scan.
const NAME_KEY_RE = /^[A-Z][A-Z0-9 '&()/-]{2,48}[A-Z0-9)]$/;

/** `noForwardTierMerge`: internal-only — set by bandedSheets' own seam
 * probing (below), never by a real, final extraction pass. mergeForwardCo-
 * EqualTier (see its own comment) unions labels across many physical tiers
 * deliberately tolerantly — exactly right for a real, single, uncontested
 * table, but on an unsplit 2-up sheet it can also union in hits from a
 * neighboring, independently-drafted table whose own row happens to
 * interleave into the same row-cluster (real, found live on itd-d1-lab-
 * mechanical.pdf#13: the coil schedule's own row shared physical space with
 * the neighboring fan schedule's own RPM/SIZE), inflating that table's own
 * header COUNT past what a correctly-split read achieves. extractedKeys
 * (below) uses header count as its own proxy for "did a candidate split
 * sever this table's real columns" — real and well-justified for the shape
 * it was built for, but an inflated, contaminated unsplit count reverses its
 * meaning: the "split lost columns" check fires on a table that gained
 * nothing but contamination, and a real, necessary split gets rejected
 * outright (losing CONTROL VALVE SCHEDULE and HC-8/HC-9 entirely, confirmed
 * live). The contamination itself is NOT something forward merge invents —
 * traced live, the same row-level mixing already exists in the settled
 * header row's own construction with forward merge turned off entirely —
 * but forward merge is what pushes an already-contaminated candidate across
 * the "titled, real-looking table" line where it previously fell short
 * (stayed untitled, so extractedKeys never counted it and the correct split
 * won by default); no local, per-row signal inside mergeForwardCoEqualTier
 * can tell that shape apart from AHU-1's own genuine multi-tier table
 * without reaching for whole-sheet column-density statistics that in turn
 * false-positive on AHU-1's own sparse, wide, single real table (tried,
 * confirmed live) — so the fix is scoping WHEN the merge runs, not adding a
 * fourth per-row heuristic to it.
 *
 * Scoped OFF for bandedSheets' own internal probing only (both the unsplit
 * baseline and every candidate split side, so the comparison stays apples-
 * to-apples) — the real, final extraction pass (buildSheetGraph's own calls)
 * never sets it, so AHU-1's own real 25-column table is delivered in full.
 * AHU-1's OWN protection during probing no longer depends on forward merge
 * at all: sideHasRealTable's fix (see its own comment) closes that gap
 * directly, by refusing to let a vocabulary-free "reference" read alone
 * count as proof a candidate seam's own side holds a real table. */
export interface ExtractOpts { buildings?: Set<string>; deltas?: DeltaIndex; noForwardTierMerge?: boolean }

// Schedule families that are NOT finish/material schedules but share the
// MARK/DESCRIPTION column shape. A title naming one of these is refused as a
// finish table — unless it ALSO says FINISH or MATERIAL, in which case the
// safe reading is to keep it and let the caller look.
//
// BOILER/HUMIDIFIER/COIL/CHILLER/PUMP/AHU/VAV (accuracy-hardening plan
// Phase 3, ledger item 28): real, found live on itd-d1-lab's own
// "CONDENSING HOT WATER BOILER SCHEDULE" — a genuine MEP equipment table
// whose header (SYMBOL/MANUFACTURER/REMARKS) ALSO independently clears
// FINISH_HEADERS' own vocabulary, so it was captured under `finish` only
// and never reached `equipment` at all. This guard was written for
// architectural families (doors/windows/casework) and had zero MEP-
// equipment words in it, so every MEP equipment table sharing that same
// generic ID/SYMBOL/MANUFACTURER/REMARKS shape sailed through unchecked.
// "FAN" deliberately NOT added here — real regression, caught by this
// project's own committed test suite: the real Bessemer sample's own "FAN
// SCHEDULE" is a legitimate finish-kind table (diffuser/grille/register),
// not an HVAC fan-equipment one, and "FAN" alone is too generic a word to
// tell the two apart by title text alone.
const OTHER_FAMILY_RE = /\b(DOOR|WINDOW|PARTITION|EQUIPMENT|HARDWARE|LOUVER|SIGNAGE|LIGHTING|LUMINAIRE|PLUMBING|MECHANICAL|ELECTRICAL|STOREFRONT|GLAZING|CASEWORK|MILLWORK|APPLIANCE|BOILER|HUMIDIFIER|COIL|CHILLER|PUMP|AHU|VAV)S?\b/;

/** A tank schedule is an MEP equipment schedule even when a PDF extractor
 * collapses its title into one token. `TANKSCHEDULE` is the stable structural
 * signal; relying on the words before it would make ordinary extraction
 * damage in "EXPANSION AND COMPRESSION" unnecessarily fatal. */
function isTankScheduleTitle(title: string): boolean {
  const u = norm(title);
  if (/\bTANKS?\b/.test(u) && /\b(SCHEDULE|EXPANSION|COMPRESSION)\b/.test(u)) return true;
  return /TANKS?SCHEDULE/.test(u.replace(/[^A-Z0-9]+/g, ""));
}

export const isNonFinishSchedule = (title: string): boolean => {
  const u = norm(title);
  return (OTHER_FAMILY_RE.test(u) || isTankScheduleTitle(title)) && !/\b(FINISH|MATERIAL)S?\b/.test(u);
};

// Lookup tables that share a MARK/CODE column with finish/room-finish
// schedules — a CROSS-REFERENCE, SPECIFICATION INDEX, or POINTS LIST.
// extractTable still reads the shape; buildSheetGraph must not index the
// rows as takeoff instances. Running-text "REFER TO SPEC" is not a title
// (REFERENCE_RE). A title that ALSO names FINISH or MATERIAL is a product
// table, kept — when in doubt, keep and let the caller look.
const REF_SPEC_FAMILY_RE = /\b(?:CROSS[-\s]*REF(?:ERENCE)?S?|X-?REFS?|(?:EQUIPMENT|DRAWING|SHEET|DETAIL)\s+INDEX|SPECIFICATION(?:S)?(?:\s+(?:INDEX|TABLE|SCHEDULE))?|SPEC\s+(?:INDEX|TABLE|SCHEDULE|SECTIONS?)|POINTS?\s+(?:LIST|SCHEDULE)|(?:DDC|BAS)\s+POINTS?|REFERENCE(?:S)?\s+(?:TABLE|SCHEDULE|LIST|INDEX))\b/;
export const isReferenceOrSpecTable = (title: string): boolean => {
  const u = norm(title);
  if (REFERENCE_RE.test(u)) return false;
  if (!REF_SPEC_FAMILY_RE.test(u)) return false;
  if (/\b(FINISH|MATERIAL)S?\b/.test(u) && !/\b(?:CROSS[-\s]*REF|X-?REF)\b/.test(u)) return false;
  return true;
};


// The NARROW subset of OTHER_FAMILY_RE that names a real MEP mechanical-
// equipment family, not an architectural one — real, found live (itd-d1-lab-
// mechanical.pdf#12's own "PUMP SCHEDULE": BP-1/BP-2/HWP-1/HWP-2, real
// pumps with real GPM/HP/RPM data). isNonFinishSchedule's own DOOR SCHEDULE
// test requires an architectural family (DOOR/WINDOW/PARTITION/HARDWARE/
// LOUVER/SIGNAGE/STOREFRONT/GLAZING/CASEWORK/MILLWORK) to vanish from the
// graph ENTIRELY — those are genuinely out of this pipeline's own MEP scope,
// and isNonFinishSchedule's drop-and-note is exactly correct for them. But a
// real mechanical/plumbing EQUIPMENT family (PUMP/BOILER/HUMIDIFIER/
// DEHUMIDIFIER/COIL/CHILLER/AHU/VAV/APPLIANCE) is squarely IN scope —
// dropping it outright loses real device data whenever its own header is too
// fragmented to independently clear EQUIPMENT_HEADERS' own vocabulary bar
// (see the PUMP SCHEDULE case: GPM/HP land bare, each alone on its own tier,
// never co-occurring with SYMBOL the way CONTROL VALVE SCHEDULE's own bare
// "(GPM)" unit fragment did). PLUMBING/MECHANICAL/ELECTRICAL/LIGHTING/
// LUMINAIRE are deliberately left OUT of this narrower list — those words
// are broad enough to title a real non-tag-schedule (a panel schedule, a
// general note block) that isn't safe to blanket-reclassify as a device-tag
// equipment table on title text alone; a genuine luminaire/lighting schedule
// already qualifies as equipment-kind directly on its own real merits (see
// the TYPE-keyed LUMINAIRE SCHEDULE test) without needing this fallback at
// all. DEHUMIDIFIER is its own alternative, not covered by HUMIDIFIER's
// \b...\b word-boundary match: "DEHUMIDIFIER" is one unbroken token, so
// \bHUMIDIFIER\b never matches inside it (real, found live — see
// scheduleTableFromODL's own DEHUMIDIFIER SCHEDULE comment below, where this
// exact gap left navfac-cherry-point-atc-mechanical.pdf#44's own real
// DH-A1..DH-A6 dehumidifiers undiscovered by the whole pipeline).
const MEP_EQUIPMENT_FAMILY_RE = /\b(PUMP|BOILER|HUMIDIFIER|DEHUMIDIFIER|COIL|CHILLER|AHU|VAV|EQUIPMENT|APPLIANCE)S?\b/;
export const isMepEquipmentSchedule = (title: string): boolean =>
  MEP_EQUIPMENT_FAMILY_RE.test(norm(title)) || isTankScheduleTitle(title);

// A real, standard cross-firm MEP title — "…CONNECTION SCHEDULE", "…
// CALCULATION…", or "…ISOLATION SCHEDULE" — names a table that cross-
// REFERENCES equipment tags a DEDICATED per-category schedule already
// defines elsewhere (a pump schedule, an AHU schedule, …), carrying only
// installation/spec data about equipment defined elsewhere (hookup info,
// a derived load number, a vibration-isolator selection), never a catalog
// identity column of its own — structurally the vocabulary-free "reference"
// kind, not a second, competing definition of the same equipment. Left
// classified "equipment" (its own bare MARK/TAG/SYMBOL key column and a
// few EQUIPMENT_HEADERS-vocabulary hits are entirely enough to qualify it
// on both bars sweepScheduleRow's own accessory-narrowing checks), every
// tag it cross-references becomes a real SECOND schedule row for that same
// key — real, corpus-found: navfac-cherry-point-atc-mechanical.pdf's own
// VIBRATION ISOLATION SCHEDULE (MARK/BASE TYPE/ISOLATOR TYPE/MINIMUM
// DEFLECTION) keys a bare "MARK" = "AHU-M1", a SECOND bare-anchor candidate
// alongside the real AIR HANDLING UNIT SCHEDULE's own AHU-M1 row — with TWO
// bare-anchor rows now competing, sweepScheduleRow's own accessory-
// narrowing (which requires EXACTLY one bare-anchor survivor) correctly
// declines to fire, and a real, resolvable 3-way collision (this table, the
// CHW CONTROL VALVE SCHEDULE's qualified "UNIT MARK" row, and the FAN SOUND
// POWER LEVEL SCHEDULE's reference-kind row) stands as an unresolved 4-way
// "ambiguous" refusal. MODEL/MANUFACTURER absence is the same discriminator
// mcp/src/session.ts's OWN scheduleTableFromODL CONNECTION/CALCULATION
// check already established (see that function's own comment): a genuine
// per-item catalog schedule always states what a real purchasable product
// is; a pure spec/cross-reference row about equipment defined elsewhere
// never does, regardless of how much real rating data its other columns
// carry — so a genuine "ISOLATION VALVE SCHEDULE" naming real purchasable
// valves (MODEL/MANUFACTURER present) is never caught by this.
// OUTSIDE AIR joins CONNECTION/CALCULATION/ISOLATION: a "REQUIRED
// OUTSIDE AIR FLOW RATE" (or IMC ventilation-rate) table is a DERIVED
// calc that cross-references equipment tags a dedicated catalog
// schedule already defines, carrying only CFM/occupancy arithmetic,
// never MODEL/MANUFACTURER. Left "equipment", its leading-zero keys
// (RTU-01 vs the catalog's RTU-1) and its ERV-01 row compete as a
// second definition of the same units. A genuine outdoor-air UNIT
// catalog ("OUTSIDE AIR UNIT SCHEDULE") always states MODEL/
// MANUFACTURER and is not caught.
const REFERENCE_CROSS_TABLE_RE = /\b(CONNECTION|CALCULATION|ISOLATION|OUTSIDE AIR)\b/;
export const isReferenceCrossTable = (title: string, headers: string[]): boolean =>
  REFERENCE_CROSS_TABLE_RE.test(norm(title)) && !headers.some((h) => headerLabel(h, ["MODEL", "MANUFACTURER"]));

// A real MEP-equipment family can hide behind a title that names NO
// recognizable family at all, so isMepEquipmentSchedule's own title check
// never gets a chance to run — real, found live (itd-d1-lab-mechanical.pdf's
// own "LAB EXHAUST FAN SCHEDULE", LEF-1: a real powered lab exhaust fan,
// CFM/ESP/RPM/HP/ELECTRICAL V/Ø/# OF FANS/SONES, none of which is DOOR/
// WINDOW/PARTITION/…/PUMP/BOILER/…/APPLIANCE, so isNonFinishSchedule(title)
// is false and this table never even reaches the reclassify-or-drop branch
// below — it just stays finish-kind with SYMBOL/MANUFACTURER/REMARKS as its
// only recognized columns). The real header data IS present on the sheet —
// six fragmented sub-tiers packed into ~110px, the same "2-column gap"
// header-tiering corruption also seen on this corpus's PUMP/COIL schedules
// — just never merged into t.headers by the tier-walk above.
//
// Deepening that walk to reach it was tried and rejected: the SAME wider
// reach also exposes "SOUND ATTENUATOR SCHEDULE"'s (SA-1) own AIRFLOW/
// VELOCITY/FPM columns one tier further up — and SA-1 is a real,
// deliberately finish-kind table per this corpus's own hand-verified key
// (keys/itd-d1-lab.takeoff.csv's own header comment lists it explicitly,
// alongside diffuser/grille/penthouse/louver, as real but finish-kind under
// this project's own scheduleKind convention, same as bessemer's diffuser/
// grille/fan schedules). Rendering and reading both real tables directly
// (never trusting the pipeline's own extraction as its own ground truth)
// confirms SA-1's header is structurally near-identical to LEF-1's/SN-1..5's
// in airflow/velocity/pressure-drop vocabulary alone — AIRFLOW, VELOCITY,
// FPM, and pressure-drop-in-inches-W.C. all appear on BOTH a real sound
// attenuator schedule and a real fan/snorkel-hood schedule, because both are
// duct-mounted devices something moves air through. That vocabulary cannot
// discriminate them safely at any reach depth.
//
// What DOES discriminate them, confirmed the same way: real motor/
// electrical NAMEPLATE data — VOLTAGE/PHASE/WATTS/KW/AMPS/FLA/MCA/MOCP/GPM/
// HP/TONS/MBH/EER/SEER/EAT/LAT/EWT/LWT/ESP (EQUIPMENT_REQUIRED's own list,
// minus AIRFLOW/VELOCITY/FPM/EQUIPMENT — the four words a passive duct
// fitting can also legitimately carry). A silencer, diffuser, grille, or
// louver has no motor, no shaft speed, no voltage/phase, no electrical draw
// at all — this vocabulary describes power a device CONSUMES or PRODUCES,
// not air it merely passes through. Confirmed live: SA-1's own real header
// (rendered off itd-d1-lab-mechanical.pdf#14) carries none of it; bessemer's
// own real, legitimately finish-kind "FAN SCHEDULE" (a bathroom exhaust fan,
// ID/DESCRIPTION/MANUFACTURER/MODEL NUMBER only, no nameplate data at all)
// carries none either. SN-1..5's own "SNORKEL HOOD SCHEDULE" is a real,
// confirmed miss THIS fix does NOT reach — a snorkel hood is itself passive
// (an extraction arm and duct, no motor of its own), so its real header
// carries no nameplate vocabulary either, and no safe generic signal
// distinguishing it from SA-1 was found; forcing one would mean keying off
// corpus-specific proper nouns ("SNORKEL", "EXTRACTION ARM"), exactly the
// hardcoding this project's own standing rules forbid.
//
// Scoped to the table's OWN region (the band's own spans, not the whole
// sheet) so a dense sheet's unrelated neighboring table can't bleed a stray
// nameplate word in — the exact failure mode nearbyRequiredHit's own
// Finding-1 comment names for a looser radius. Requires >=2 distinct hits,
// not one, for the same reason: a single stray word surviving inside one
// table's own region by accident is a realistic risk on a dense sheet; two
// independent nameplate words landing there together is not.
const POWERED_EQUIPMENT_REQUIRED = EQUIPMENT_REQUIRED.filter((w) => !["AIRFLOW", "VELOCITY", "FPM", "EQUIPMENT"].includes(w));
export function hasPoweredEquipmentColumns(spans: GraphSpan[], table: ScheduleTable): boolean {
  const [x0, y0, x1, y1] = table.region;
  const hits = new Set<string>();
  for (const sp of spans) {
    const cx = sp.x + (sp.w || 0) / 2;
    const cy = sp.y + (sp.h || 0) / 2;
    if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
    for (const w of headerLabels(sp.str, POWERED_EQUIPMENT_REQUIRED)) hits.add(w);
  }
  return hits.size >= 2;
}

function rowKeyOf(raw: string, kind: "room-finish" | "finish" | "equipment", buildings?: Set<string>, nameKeyed = false): { key: string; building?: string } | null {
  // A NAME-keyed table's key column IS its NAME column — the only sensible
  // reading of a leading token there is a room-type phrase, not a digit tag
  // this table has no column for. Spaces are the whole point of a phrase
  // ("PATIENT ROOMS" vs "PATIENTROOMS"), so this path skips the space-
  // stripped `kept`/`key` below entirely rather than feeding it through.
  if (nameKeyed) {
    const phrase = norm(raw).replace(/\s+/g, " ").trim();
    return NAME_KEY_RE.test(phrase) ? { key: phrase } : null;
  }
  // Comma-grouped equipment marks in one ITEM NO cell — "CWP - 1,2,3,4,5"
  // or "CT-1,2,3,4" (VA Las Vegas CUP pump / cooling-tower schedules). Mint
  // slash-compound keys so one schedule row answers for every listed mark;
  // trailing service prose glued into the same span ("… 5 CO") is dropped.
  if (kind === "equipment") {
    const grouped = norm(raw).replace(/\s+/g, " ").trim()
      .match(/^([A-Z]{1,6})\s*[-–]\s*(\d+(?:\s*,\s*\d+)+)\b/);
    if (grouped) {
      const prefix = grouped[1];
      const marks = grouped[2].split(/\s*,\s*/).map((n) => `${prefix}-${n}`);
      if (marks.every((m) => CODE_RE.test(m))) return { key: marks.join("/") };
    }
  }
  const kept = norm(raw).replace(/[^A-Z0-9/-]/g, "");
  const key = kept.replace(/\//g, "");
  if (kind === "finish" || kind === "equipment") {
    // equipment tags (EWH-1, EBB-6, EF-1) are CODE_RE-shaped exactly like a
    // finish code (CPT-1) — same catalog-tag convention, same row-key logic,
    // compound-key slash support included ("R1/E1" one device, two services).
    // a compound cell keys one row for several marks — "R1 / E1" is the same
    // device scheduled for two services; keep the slash so the row can answer
    // for each mark on its own (checked first: slash-stripped "R1E1" would
    // otherwise pass CODE_RE and bury the compound)
    const parts = kept.split("/").filter(Boolean);
    if (parts.length > 1 && parts.every((p) => CODE_RE.test(p))) return { key: parts.join("/") };
    return CODE_RE.test(key) ? { key } : null;
  }
  if (ROW_KEY_RE.test(key)) return { key };
  const q = key.match(QUALIFIED_KEY_RE);
  if (q && buildings?.has(q[1])) return { key, building: q[1] };
  return null;
}

/** Does a schedule-row key answer for a mark? Exact, or one of a compound
 * key's slash-separated parts ("R1/E1" answers for "R1" and for "E1"). */
export const rowKeyAnswersFor = (key: string, want: string): boolean => {
  const c = norm(key).replace(/\s+/g, "");
  const w = norm(want).replace(/\s+/g, "");
  return c === w || c.split("/").filter(Boolean).includes(w);
};

/** The number part of a row key — "A-134" and "134" both answer for 134. */
const numOf = (key: string): string => key.match(QUALIFIED_KEY_RE)?.[2] ?? key;

const centerX = (t: GraphSpan) => t.x + (t.w || 0) / 2;

// columnMapFor's true-nearest collision rule (below) has one job: bind a
// recovered data-cluster to the anchor whose header it actually belongs
// under, even when that cluster's own centered header sits a fair distance
// away (ROOM/NUMBER's real shape, ledger item — a long room name pulls
// ROOM's own data left, past NUMBER's header). But distance alone cannot
// tell that real collision apart from a SECOND, entirely different real
// shape: a genuine, un-vocabularied LEAF sub-column (no EQUIPMENT_HEADERS
// word of its own — e.g. a bare "AMPS"/"STAGES"/duct-connection-size tier
// that never independently qualified as its own anchor) whose own real data
// simply happens to sit nearer some OTHER, already-named anchor by raw
// distance than that anchor's own true column is wide. Real, found live on
// itd-d1-lab-mechanical.pdf's EXHAUST FAN SCHEDULE: an unrecognized AMPS-like
// leaf column's own value ("2.5") sits nearest MANUFACTURER's header purely
// by proximity, and true-nearest happily reassigns MANUFACTURER's own slot
// to it — the real manufacturer name is then dropped outright (falls outside
// MANUFACTURER's own capped reach once anchorRadii's cap is checked), not
// merged or truncated. Same root cause via the RESCUE path too (below): a
// leaf cluster that loses its own (wrong) true-nearest pick can still get
// rescued into an unclaimed anchor label it merely sits closer to.
//
// The two real shapes are told apart by what sits ABOVE the losing cluster,
// not by how far away it reaches: ROOM's own header cell IS one of this
// table's real anchors (just not the one true-nearest happened to pick);
// a genuine leaf sub-column's own header is NOT any anchor at all — it is a
// real, drawn header cell with no vocabulary word in EQUIPMENT_HEADERS/
// FINISH_HEADERS/ROOM_HEADERS to name it, sitting in the "no-man's-land"
// between two real anchors' own header centers. So: a raw header-row token
// whose own center sits farther than half this table's own tightest
// inter-anchor pitch from EVERY real anchor is a genuine orphan — proof this
// table draws a real, distinct column here that vocabulary never named.
// A cluster whose OWN nearest header (orphan or anchor) is an orphan closer
// than the anchor collision picked is that orphan column's own data, and
// must never be allowed to steal (or be rescued into) a NAMED anchor's slot
// — its data simply has nowhere labeled to go, same as any other column this
// project's vocabulary has not yet learned (withheld, not guessed, the same
// discipline nearestAnchor's own radius cap already applies elsewhere).
// Geometric only (never a word list), so it generalizes to any table shape,
// not just the one sheet that first exposed it. Purely additive: a table
// with no headerSpans (adoptContinuationRows' headerless-continuation path)
// or no orphan tokens at all gets an empty list and this never fires,
// identical to the pre-fix behavior.
// A genuine leaf orphan is not the only real header token that can sit
// farther than `tol` from every anchor: a real PARENT/GROUP-tier label
// (found live: baker-county-eoc-bidset.pdf#27's own ROOM FINISH SCHEDULE —
// "FLOOR", the tier-1 parent over both "FLOOR FINISH" and "BASE FINISH")
// sits almost exactly MIDWAY between the two already-recognized anchors it
// groups, purely by drafting convention (a spanning label centers itself
// over its own children). Treating that midpoint token as its own orphan
// leaf let it "claim" BASE's own real data cluster ("WB-1", the nearest
// real cluster to that midpoint) purely by coincidental proximity — the
// EXACT theft this file exists to stop, just aimed at a real anchor's own
// rightful data instead of a genuine leaf's.
//
// Flanking-midpoint symmetry alone over-corrects, though: itd-d1-lab-
// mechanical.pdf's own CONDENSING HOT WATER BOILER SCHEDULE has a REAL
// "CAPACITY" tier-1 parent (over "CAPACITY INPUT MBH"/"CAPACITY OUTPUT
// MBH", both of which — unlike FLOOR's own two children — never
// independently recovered anchors of their own) that ALSO scores as
// near-midpoint (0.81) yet is exactly what has to keep claiming "265"/"285"
// to stop them stealing MANUFACTURER. The real tell is the width of the gap
// it sits inside: FLOOR's own flanking pair (FLOOR, BASE) sit at this
// table's ordinary column pitch (1.08x the baseline gap) — an unremarkable
// pair with nothing hiding between them, so a token centered between them
// really is just their shared parent label. CAPACITY's own flanking pair
// (GPM, MANUFACTURER) sit at 4.2x baseline — anomalously wide, this file's
// own established signal (GAP_INFLATION_RATIO, anchorRadii's own comment)
// that real, un-modeled columns are hiding in the gap — so a token there
// failing the symmetry test is NOT proof it is a mere parent label; there
// is real room for it to be a genuine leaf of its own. The symmetry check
// only ever REJECTS a candidate, so it is scoped to ordinary-width flanking
// pairs, where a near-midpoint reading is unambiguous.
const ORPHAN_ASYMMETRY_RATIO = 0.7;
function orphanHeaderXs(headerSpans: GraphSpan[] | undefined, anchors: Anchor[]): number[] {
  if (!headerSpans?.length || anchors.length < 2) return [];
  const gaps = anchors.slice(1).map((a, i) => a.x - anchors[i].x).filter((g) => g > 0);
  if (!gaps.length) return [];
  const baseline = Math.min(...gaps);
  const tol = baseline / 2;
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  const out: number[] = [];
  for (const t of headerSpans) {
    if (t.str.replace(/[^A-Za-z]/g, "").length < 2) continue; // punctuation/digit-only: not a real header word
    const cx = centerX(t);
    if (anchors.some((a) => Math.abs(a.x - cx) <= tol)) continue;
    let left: Anchor | null = null, right: Anchor | null = null;
    for (const a of sorted) { if (a.x <= cx) left = a; else { right = a; break; } }
    if (left && right && right.x - left.x <= baseline * GAP_INFLATION_RATIO) {
      const dL = cx - left.x, dR = right.x - cx;
      if (Math.min(dL, dR) / Math.max(dL, dR) >= ORPHAN_ASYMMETRY_RATIO) continue; // an ordinary-width flanking pair, sitting near their shared midpoint: a parent/group label, not its own leaf column
    }
    out.push(cx);
  }
  return out;
}

/** Column starts read off the DATA, plus WHICH edge of a token to band by.
 * Some schedules left-align their cells and some centre them; the alignment
 * is a property of the sheet, not something to assume. Both are tried and the
 * one that actually explains the data — the tighter clustering — wins. A map
 * is returned only when every anchor ends up owning a column, in the anchors'
 * own order; otherwise banding falls back to nearest-anchor, so a table this
 * does not fit is never mangled by a half-built column map. */
type ColumnMap = { coord: "left" | "center"; cols: Array<{ start: number; label: string }>; score: number };

function columnMapFor(
  rows: GraphSpan[][],
  anchors: Anchor[],
  cfg: { fromIdx: number; toIdx?: number; belowY: number },
  x0: number,
  x1: number,
  coord: "left" | "center",
  isKeyedRow: (row: GraphSpan[]) => boolean,
  orphanXs: number[] = [],
): ColumnMap | null {
  const at = (t: GraphSpan) => (coord === "left" ? t.x : t.x + (t.w || 0) / 2);
  const xs: number[] = [];
  const hs: number[] = [];
  const toIdx = cfg.toIdx ?? rows.length;
  for (let i = Math.max(cfg.fromIdx, 0); i < toIdx; i++) {
    if (rowY(rows[i]) <= cfg.belowY) continue;
    // Only rows that already read as a real row of THIS table license their
    // tokens into the column-start recovery. Rows are clustered across the
    // WHOLE sheet with no notion of where this table ends, so on a dense
    // sheet that reuses the same column grid for several stacked schedules
    // (a common drafting convention), a LATER table's header fragments fall
    // in this table's x-band too — and with no gate here they vote on where
    // column 0 "really" starts. Found live on a real mechanical schedule
    // sheet: a VRF Heat Pump table two schedules below shifted the recovered
    // start ~90px off the Diffuser table's own column, and every one of its
    // real SR-1..TG-2 rows was then rejected as misaligned. Gating on
    // "does this row's own key column look like a real key" (the same test
    // the main loop below uses to accept a row at all) costs nothing on a
    // normal single-table sheet and can't itself invent a table that isn't
    // there — it only excludes rows that were never going to be accepted.
    if (!isKeyedRow(rows[i])) continue;
    for (const t of rows[i]) {
      if (t.x < x0 || t.x > x1 || revisionOf(t.str) != null) continue;
      xs.push(at(t));
      hs.push(t.h || 8);
    }
  }
  if (xs.length < anchors.length * 2) return null;
  hs.sort((a, b) => a - b);
  const tol = Math.max(4, hs[hs.length >> 1] * 0.5);
  xs.sort((a, b) => a - b);
  const clusters: Array<{ start: number; n: number }> = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.start <= tol) { last.n++; continue; }
    clusters.push({ start: x, n: 1 });
  }
  const maxN = Math.max(...clusters.map((c) => c.n));
  const kept = clusters.filter((c) => c.n >= Math.max(2, maxN * 0.25));
  if (kept.length < anchors.length) return null;
  // Which of THESE clusters is a genuine orphan leaf column's own real data
  // — see orphanHeaderXs' own comment for the two real shapes this tells
  // apart. Deliberately NOT "any cluster nearer an orphan than its own
  // anchor pick": an anchor's rightful data routinely sits far from its own
  // centered header by this file's own design (WIDE_LAST/isWideMidAnchor,
  // above) — comparing raw distance against EVERY orphan on the sheet
  // falsely disqualified a real MANUFACTURER cluster merely because some
  // OTHER, unrelated orphan (OPERATING WEIGHT) happened to sit closer to it
  // than MANUFACTURER's own far-off header did (real, found live: itd-d1-
  // lab-mechanical.pdf's EXHAUST FAN SCHEDULE — "COOK MODEL GC-148" is
  // EF-1's real manufacturer name, correctly nearer MANUFACTURER than any
  // other ANCHOR, but nearer OPERATING WEIGHT's own orphan header than
  // MANUFACTURER's). Each orphan claims only the ONE cluster that is its
  // OWN true-nearest match — WEIGHT's own real data ("15") wins that
  // pairing outright (distance ~0.1 vs "COOK MODEL"'s ~161), so WEIGHT
  // never disqualifies the real manufacturer cluster at all; SONES'
  // own real data ("2.5") is an equally exact match (~10.5), so SONES DOES
  // correctly claim it, keeping it out of MANUFACTURER's reach.
  const orphanClaimed = new Set<number>();
  for (const ox of orphanXs) {
    let best: { start: number; n: number } | null = null;
    let bestD = Infinity;
    for (const c of kept) { const d = Math.abs(c.start - ox); if (d < bestD) { bestD = d; best = c; } }
    if (best) orphanClaimed.add(best.start);
  }
  const byLabel = new Map<string, { start: number; n: number }>();
  for (const c of kept) {
    // The anchor whose header CENTER sits TRUE NEAREST this recovered
    // column's own start — not merely the first one at or right of it. A
    // column's real data-start commonly sits a little LEFT of its own
    // header center (a real drafting-tolerance / wrapping-offset case: a
    // secondary token inside a wide cell clusters at its own consistent x,
    // short of the NEXT column's anchor but past this column's own). "At or
    // right" alone skips straight past this column's true anchor to the
    // next, further-right one, binding the column to the WRONG header and
    // cascading the mislabel into every column after it — real, found live
    // on itd-d1-lab-mechanical.pdf's CONTROL VALVE SCHEDULE (AREA SERVED's
    // own wrapped "SAV-1" sub-token pulled into VALVE TYPE).
    //
    // EXCEPT when the plain "at or right" pick is itself a WIDE_LAST/NAME
    // anchor (REMARKS, DESCRIPTION, a NAME key column) — those EARN a wide
    // left margin by this file's own design (bandLimits' own rightMargin/
    // leftMargin, anchorRadii's own matching exemption): a real value in
    // one of THOSE columns routinely starts far left of its own centered
    // header, which is exactly what true-nearest cannot tell apart from a
    // genuinely different, ordinary anchor sitting closer by coincidence.
    // Real, found live (regression caught by this file's own "WIDE_LAST
    // title-block bleed" test): a REMARKS anchor centered well right of a
    // short real value ("SDV") is FARTHER from it than the ordinary WALL
    // anchor one column over — true-nearest alone reassigned "SDV" to WALL
    // and REMARKS lost its column outright. Kept to plain "at or right" for
    // exactly this anchor shape; every ordinary, normal-width anchor still
    // gets the true-nearest fix above. A wide anchor in the MIDDLE of a
    // table (isWideMidAnchor, above) earns the identical exemption for the
    // identical reason — same shape, just not confined to the last column.
    // The same +1 boundary fudge columnOf itself uses (`at + 1 >= ...`,
    // below) against sub-pixel rounding noise between a cluster's own
    // measured start and its true anchor's x. Without it, a real, found-live
    // case (itd-d1-lab-mechanical.pdf#14's own ELECTRIC HEATER SCHEDULE,
    // CENTER-coordinate pass): ELECTRICAL V/Ø's own data-center cluster
    // (1585.20) sits a mere 0.1px right of its own anchor (1585.1) — an inch
    // of rounding, not a real gap — so the strict `>=` skips straight past
    // ELECTRICAL V/Ø to AMPS as "at or right". Ordinarily the true-nearest
    // loop just below self-corrects that (V/Ø sits 0.1px away vs AMPS' own
    // 90px), but AMPS happens to ALSO test true under isWideMidAnchor here —
    // not because AMPS' own data is wide, but because AMPS' own gap to ITS
    // next neighbor (MANUFACTURER, a genuinely wide column) is inflated by
    // MANUFACTURER's OWN width, a borrowed property with nothing to do with
    // AMPS itself. That flips the exemption on and skips true-nearest
    // entirely, so the whole ELECTRICAL V/Ø cluster is wrongly folded into
    // AMPS — collapsing two real columns into one, which fails this
    // function's own byLabel.size === anchors.length check outright and
    // discards the ENTIRE center-mode column map (a perfect, every-row-
    // center-justified fit for this table) in favor of the LEFT-mode
    // fallback, which reads this table's real center-justified SERVED/TYPE
    // data as fragmented, unrepresentative left-start clusters — the real
    // cause of EH-1/EH-2/EH-3/EH-5's own missing SERVED cells and EH-5's own
    // missing TYPE cell. The 1px fudge alone routes the 1585.20 cluster to
    // its own true anchor (ELECTRICAL V/Ø, x=1585.1) exactly as intended, so
    // the downstream isWideMidAnchor cascade is never even reached.
    let atOrRight: Anchor | null = null;
    for (const a of anchors) { if (a.x + 1 >= c.start) { atOrRight = a; break; } }
    let own: Anchor | null = atOrRight;
    if (!atOrRight || !(WIDE_LAST.has(atOrRight.label) || atOrRight.label === "NAME" || isWideMidAnchor(anchors, atOrRight))) {
      let bestD = atOrRight ? Math.abs(atOrRight.x - c.start) : Infinity;
      for (const a of anchors) {
        const d = Math.abs(a.x - c.start);
        if (d < bestD || (d === bestD && a.x >= c.start)) { bestD = d; own = a; }
      }
    }
    if (!own) continue;
    // This cluster IS a genuine, un-vocabularied leaf column's own real data
    // (orphanClaimed, above) — not a misaligned reach of `own`'s. Refuse it
    // a place in ANY named anchor's slot (neither the direct claim below nor
    // the rescue fallback further down): both paths exist to recover a real
    // anchor's OWN data from a genuine collision (ROOM/NUMBER, atOrRight
    // rescue, below) — this is a different real shape, an entirely
    // different column's data that happens to sit nearest a named anchor by
    // coincidence, and crediting it anywhere here is exactly the theft this
    // guards against (real, found live: itd-d1-lab-mechanical.pdf's EXHAUST
    // FAN SCHEDULE — an un-vocabularied SONES leaf column's own "2.5" reads
    // into MANUFACTURER, and the real manufacturer name is dropped).
    if (orphanClaimed.has(c.start)) continue;
    const cur = byLabel.get(own.label);
    if (cur == null || c.start < cur.start) { byLabel.set(own.label, { start: c.start, n: c.n }); continue; }
    // This cluster LOST the true-nearest collision to an anchor some
    // earlier (further-left) cluster already claimed — real, found live
    // (baker-county-eoc-bidset.pdf#27's own ROOM FINISH SCHEDULE): ROOM's
    // real data-start sits nearer NUMBER's own header than ROOM's own
    // header is, purely because ROOM's centered header sits unusually far
    // right of ROOM's own left-aligned data (long room-name values —
    // the exact same real shape this function's own NAME-keyed exemption
    // above already exists for, just not spelled "NAME" here). Losing that
    // fight to NUMBER should not cost ROOM its column outright: falling
    // back to this cluster's own plain "at or right" pick (the rule this
    // file used for every anchor before the true-nearest fix) recovers it —
    // but ONLY when this cluster carries FULL, near-every-row support
    // (close to `maxN`, the table's own dominant per-column row count),
    // not merely a coincidental handful of stray points. Real regression
    // this guard exists for (caught by this file's own LUMINAIRE SCHEDULE
    // test): under CENTER alignment, ten rows' own varying-length
    // MANUFACTURER SERIES values split into three EQUAL-sized (n=3 each)
    // sub-clusters purely by coincidental text-length similarity — losing
    // a collision to a same-size sibling is meaningless evidence, and
    // rescuing one to the entirely dataless NOTES anchor fabricates a
    // column that was never really there. The real ROOM case carries n
    // equal to `maxN` itself (every one of the table's own rows), a
    // completely different order of evidence — requiring near-maxN
    // support (matching the `kept` filter's own maxN-relative philosophy
    // above, just a stricter bar since a rescue is a riskier move than
    // mere inclusion) keeps ROOM while refusing every equal-strength
    // fragment. Every anchor that does NOT lose a collision (the true-
    // nearest fix's own real motivating case, AREA SERVED/SAV-1) is
    // untouched either way.
    if (atOrRight && atOrRight.label !== own.label && !byLabel.has(atOrRight.label) && c.n >= maxN * 0.75) {
      byLabel.set(atOrRight.label, { start: c.start, n: c.n });
    }
  }
  if (byLabel.size !== anchors.length) return null;
  const cols = [...byLabel.entries()].map(([label, v]) => ({ label, start: v.start })).sort((a, b) => a.start - b.start);
  if (cols.map((c) => c.label).join("|") !== anchors.map((a) => a.label).join("|")) return null;
  // how well this alignment explains the data: the share of tokens sitting on
  // a column start rather than scattered between them
  const starts = kept.map((c) => c.start);
  let on = 0;
  for (const x of xs) if (starts.some((st) => Math.abs(x - st) <= tol)) on++;
  return { coord, cols, score: on / xs.length };
}

function columnStarts(
  rows: GraphSpan[][],
  anchors: Anchor[],
  cfg: { fromIdx: number; toIdx?: number; belowY: number },
  x0: number,
  x1: number,
  isKeyedRow: (row: GraphSpan[]) => boolean,
  orphanXs: number[] = [],
): ColumnMap | null {
  // A map has to FIT before it is trusted. A mediocre fit is worse than none:
  // it looks authoritative and quietly merges a column into its neighbour,
  // where falling back to nearest-anchor reads the table correctly. Measured
  // on real sets, a true alignment scores ~0.82–0.90 and a wrong one ~0.54.
  const FIT_FLOOR = 0.7;
  const fits = (m: ColumnMap | null) => (m && m.score >= FIT_FLOOR ? m : null);
  const left = fits(columnMapFor(rows, anchors, cfg, x0, x1, "left", isKeyedRow, orphanXs));
  const center = fits(columnMapFor(rows, anchors, cfg, x0, x1, "center", isKeyedRow, orphanXs));
  if (!left) return center;
  if (!center) return left;
  // Left alignment is the common case; centring has to EARN the switch. On a
  // near tie both modes score well and picking the wrong one merges a column
  // into its neighbour, so only a clearly better centred fit wins.
  return center.score > left.score + 0.05 ? center : left;
}

/**
 * Repair a common deep-header extraction shape: an engineering unit printed
 * on the lowest header tier is vertically clustered into the first data row
 * while later rows contain only the numeric value. Promote that unit into the
 * column label and remove it from the affected value.
 *
 * The promotion requires both forms in the same column (one unit-prefixed
 * numeric value and another plain numeric value), so prose values and tables
 * that intentionally repeat units in every row remain unchanged.
 */
export function promoteLeadingEngineeringUnits(headers: string[], rows: TableRow[]): string[] {
  const out = [...headers];
  const unitValue = /^(FT\.?\s*H2O|I\.?\s*W\.?G\.?)\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+))$/i;
  const plainNumber = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  for (let i = 0; i < out.length; i++) {
    const label = out[i];
    const populated = rows.map((row) => row.cells[label]?.text.trim()).filter((v): v is string => !!v);
    const prefixed = populated.map((value) => ({ value, match: value.match(unitValue) })).find((entry) => entry.match);
    if (!prefixed?.match || !populated.some((value) => plainNumber.test(value))) continue;
    const unit = prefixed.match[1].toUpperCase().replace(/\s+/g, " ");
    const promoted = `${label} ${unit}`;
    if (out.includes(promoted)) continue;
    out[i] = promoted;
    for (const row of rows) {
      const cell = row.cells[label];
      if (!cell) continue;
      const match = cell.text.trim().match(unitValue);
      row.cells[promoted] = { ...cell, text: match ? match[2] : cell.text };
      delete row.cells[label];
    }
  }
  return out;
}

function bandDataRows(
  rows: GraphSpan[][],
  anchors: Anchor[],
  kind: "room-finish" | "finish" | "equipment",
  sheetKey: string,
  buildings: Set<string> | undefined,
  cfg: { fromIdx: number; toIdx?: number; belowY: number; keyAlign?: { x: number; tol: number }; deltas?: DeltaIndex; headerSpans?: GraphSpan[] },
): { out: TableRow[]; region: Bbox | null } {
  const { x0, x1, medGap } = bandLimits(anchors);
  const toIdx = cfg.toIdx ?? rows.length;
  const orphanXs = orphanHeaderXs(cfg.headerSpans, anchors);
  // A room-finish table whose key column is itself labeled NAME (anchors are
  // sorted by x, so index 0 is the key column) has no numbered-room column at
  // all — see NAME_KEY_RE's comment. Decided once per table, from the
  // table's own header, not guessed per row.
  const nameKeyed = kind === "room-finish" && anchors[0]?.label === "NAME";
  // Columns are defined by where the DATA starts, not by where the header
  // sits. Headers are centered over their column; cells are left-aligned in
  // it — so a short cell and a long cell in the same column share a left edge
  // but have wildly different centers. Measured on a real gym schedule:
  // "PT-1" and "SEE INT. ELEVATIONS" both start at x=2342, and center-banding
  // put the short one in BASE and the long one in WALL. Clustering the left
  // edges recovers the true column starts; the headers only NAME them.
  // Only rows that already look like a real row of THIS table (their own
  // leading in-band token reads as a key, same test the main loop below
  // uses to accept a row) get a vote in that recovery — see columnMapFor.
  const isKeyedRow = (row: GraphSpan[]): boolean => {
    const first = row.find((t) => t.x >= x0 && t.x <= x1 && revisionOf(t.str) == null);
    return !!first && !!rowKeyOf(first.str, kind, buildings, nameKeyed);
  };
  const cols = columnStarts(rows, anchors, cfg, x0, x1, isKeyedRow, orphanXs);
  // A key belongs to the key column when it sits nearer that column's start
  // than the next column's — sized from the table's own pitch, not from text
  // height, so a wider key ("139A") or a hair of indent still counts.
  const keyTol = cols && cols.cols.length > 1 ? Math.max(8, (cols.cols[1].start - cols.cols[0].start) * 0.5) : 40;
  // Anomalously-wide anchor gaps mean real, un-modeled columns are hiding —
  // see nearestAnchor/anchorRadii's own comments. Computed once per table,
  // reused by BOTH binning paths below so a big table (real column starts
  // recovered from its own data) and a sparse one (falling back to the
  // header's own anchor centers) refuse the same way.
  const radii = anchorRadii(anchors);
  const out: TableRow[] = [];
  const outY: number[] = [];
  let region: Bbox | null = null;
  /** Which column a token belongs to: its LEFT edge against the data-derived
   * column starts when those were recoverable, else the old nearest-anchor
   * reading of its center. Null: the token sits far enough past an
   * anomalously-wide column's own baseline width that crediting it here
   * would corrupt a real neighbour's cell with a real, different column's
   * data — withheld rather than guessed (ledger item 57). */
  const columnOf = (t: GraphSpan): string | null => {
    if (!cols) return nearestAnchor(centerX(t), anchors, radii);
    const at = cols.coord === "left" ? t.x : centerX(t);
    let idx = 0;
    for (let i = 0; i < cols.cols.length; i++) { if (at + 1 >= cols.cols[i].start) idx = i; else break; }
    const r = radii.get(cols.cols[idx].label);
    if (r != null && at - cols.cols[idx].start > r.after) return null;
    return cols.cols[idx].label;
  };
  // The x where the NEXT real column (after `label`, in the table's own
  // left-to-right column order) starts — from the data-derived column map
  // when one was recovered, else the header's own anchor order. Null past
  // the table's own last column (nothing to bleed into).
  const nextColumnAfter = (label: string): { label: string; x: number } | null => {
    const ordered = cols ? cols.cols.map((c) => ({ label: c.label, x: c.start })) : [...anchors].sort((a, b) => a.x - b.x);
    const idx = ordered.findIndex((c) => c.label === label);
    return idx >= 0 && idx + 1 < ordered.length ? ordered[idx + 1] : null;
  };
  // A single DATA token whose own right edge runs well past the NEXT real
  // column's own start is not one wide value in `label`'s column — it is
  // TWO (or more) real columns' worth of text sharing one PDF text run.
  // Real, found live on baker-county-eoc-bidset.pdf#27's own ROOM FINISH
  // SCHEDULE: room 100's SOUTH and WEST finish codes, "STOREFRONT" and
  // "P-1", are ONE text object in the source PDF — "STOREFRONT" (a real
  // glazing/wall-type name, unusually long against this column's own
  // ~30px baseline width on every OTHER row) runs right through WEST's own
  // column before the row's next genuine value even starts, so WEST's cell
  // comes up entirely empty and SOUTH reads "STOREFRONT P-1". Split on
  // whitespace and place each word at its own proportional x offset within
  // the token's bbox — the same character-fraction technique
  // splitMergedHeaderCells already uses for a merged HEADER cell, applied
  // here to a merged DATA cell instead — then let each word re-enter
  // `columnOf` on its own. A genuine single wrapped value ("SEE INT.
  // ELEVATIONS") never actually reaches past a real neighbour column's own
  // start this way (checked below, before ever splitting) and bands as one
  // cell, unperturbed; WIDE_LAST/NAME columns are exempted outright — those
  // EARN a wide reach by this file's own design (bandLimits' own
  // rightMargin/leftMargin) and a long value there is never overflow.
  const splitOverflowWords = (t: GraphSpan): GraphSpan[] => {
    const text = t.str;
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return [t];
    const w = t.w || 0;
    const out: GraphSpan[] = [];
    let charPos = 0;
    for (const word of words) {
      const ci = text.indexOf(word, charPos);
      const start = ci >= 0 ? ci : charPos;
      charPos = start + word.length;
      const frac0 = start / Math.max(text.length, 1);
      const frac1 = (start + word.length) / Math.max(text.length, 1);
      out.push({ str: word, x: t.x + frac0 * w, y: t.y, w: (frac1 - frac0) * w, h: t.h });
    }
    return out;
  };
  // The SAME lookup as columnOf, but WITHOUT anchorRadii's anomalous-gap cap
  // — the column a token would map to if only its position against the
  // recovered column starts mattered. Used below to recognize a genuine
  // same-row CONTINUATION of a cell this row's own already-accepted text
  // already occupies, which anchorRadii's cap was never meant to catch (its
  // own job is refusing a token that drifted far from the COLUMN's start —
  // ledger item 57 — not a token sitting right next to text this exact cell
  // already holds).
  const rawColumnOf = (t: GraphSpan): string | null => {
    if (!cols) return nearestAnchor(centerX(t), anchors);
    const at = cols.coord === "left" ? t.x : centerX(t);
    let idx = 0;
    for (let i = 0; i < cols.cols.length; i++) { if (at + 1 >= cols.cols[i].start) idx = i; else break; }
    return cols.cols[idx].label;
  };
  // Ordinary word-spacing ONLY — real, measured on itd-d1-lab-mechanical.
  // pdf's own CONTROL VALVE SCHEDULE: AREA SERVED's real trailing cross-
  // reference ("SAV-1") sits 9.5px past the room name's own end, at a real
  // text height of 18.9. Deliberately tight, tighter than farFromCell's own
  // FAR threshold (`max(80, h*8)`) and tighter than a first attempt at this
  // fix (`max(30, h*3)`) — real regression, caught by this file's own
  // "Diffuser/Grille/Register" multi-table test (a real Bessemer fixture):
  // at that same text height, a genuinely DIFFERENT column's own value
  // ("631", a SIZE cell two columns over with no anchor of its own) sits
  // 32.5px past a real MANUFACTURER value's end — comfortably inside the
  // first attempt's h*3=56.7px budget, wrongly admitted as if it were a
  // continuation of the MANUFACTURER cell it merely raw-maps nearest to.
  // Tightened so the true 9.5px case still clears (h*1 = 18.9) while the
  // false 32.5px one does not, with real margin on both sides.
  const CONTINUATION_GAP_MAX = (h: number) => Math.max(12, h);
  // A WIDE_LAST cell that already holds real text and is about to absorb a
  // SECOND, far-off token: field-found on two real mechanical sets
  // (federal-attachment4-mechanical.pdf#16, itd-d1-lab-mechanical.pdf#12) — a
  // sheet-corner title block sits well to the right of the table's own ruled
  // border, and on the ~12 rows whose y happens to land near one of the title
  // block's own text lines, its firm-name/address/phone text gets banded in
  // right alongside the row's genuine REMARKS value ("SDV" → "SDV EGLIN AIR
  // FORCE BASE"). The generous rightMargin above exists so a WIDE column's
  // own long value still bands (that margin stays untouched — every anchor's
  // reach is unaffected); this gate instead looks at what actually lands IN a
  // cell: two tokens of the SAME real remark sit word-spacing apart (single-
  // digit to low-tens of px), but the measured bleed gap on both real sheets
  // was 293px and 617px — 15–33× the row's own text height. A gap that wide
  // is never a second word of the same value; it is refused, not merged, so
  // the cell keeps only the token nearest its own real column start.
  // A multi-line wrapped cell's constituent lines don't always arrive in
  // top-to-bottom order. The row's own KEYED line (the one carrying the
  // schedule tag, e.g. "CV-1") is whichever PHYSICAL line the tag happens to
  // sit on — often the MIDDLE line of a 3-line wrap, not the top one — and
  // it is always `add`ed FIRST (during the main loop, below). Every OTHER
  // line of that same wrapped cell is an unkeyed "orphan" row, folded in
  // afterward by the separate orphans pass (further below) in whatever order
  // it appears across the WHOLE table, not "lines above the keyed row first,
  // in the right position" — so a fragment ABOVE the keyed line can land
  // AFTER it in the joined text. Real, found live on itd-d1-lab-mechanical.
  // pdf's CONTROL VALVE SCHEDULE: VALVE TYPE's real 3-line value reads
  // "PRESSURE INDEPENDENT / FIELD ADJUSTABLE CONTROL / VALVE W/ 100%
  // AUTHORITY" top to bottom, but the middle line carries the row's own key
  // and is added first — the joined cell read "FIELD ADJUSTABLE CONTROL
  // PRESSURE INDEPENDENT VALVE W/ 100% AUTHORITY" instead. Fixed by tracking
  // every contributing token's own position and re-deriving each multi-
  // fragment cell's text in true (y, then x) order once all fragments — the
  // keyed line's own and every orphan's — are in, rather than trusting
  // whatever order they happened to arrive in.
  type Frag = { text: string; y: number; x0: number; x1: number };
  const fragmentsByRow = new Map<TableRow, Map<string, Frag[]>>();
  // Same physical printed LINE, by this table's own row pitch — deliberately
  // tighter than CONTINUATION_GAP_MAX's own x-gap budget below: this only
  // asks "is there already-accepted text from THIS SAME line", never "is
  // there accepted text somewhere in this cell's multi-line span" (a wide,
  // multi-line-already-merged cell's OWN accumulated bbox can span hundreds
  // of px vertically and horizontally across totally different physical
  // lines — comparing a new token against that whole union, tried first,
  // wrongly re-admitted a genuinely DIFFERENT, un-modeled column's data:
  // OPERATION's own "MODULATING"/"2-WAY" values, which have no anchor of
  // their own and so raw-map to the neighboring VALVE TYPE column, sat close
  // enough to VALVE TYPE's own wide 3-line-merged bbox to pass a bbox-based
  // check even though they share no line with any of VALVE TYPE's real
  // fragments).
  const addOne = (row: TableRow, t: GraphSpan, label: string) => {
    const existing = row.cells[label];
    if (farFromCell(label, t, existing)) return;
    const text = t.str.trim();
    if (!existing) row.cells[label] = { text, bbox: bboxOf(t) };
    else row.cells[label] = { text: `${existing.text} ${text}`, bbox: merge(existing.bbox, bboxOf(t)) };
    region = region ? merge(region, bboxOf(t)) : bboxOf(t);
    let byLabel = fragmentsByRow.get(row);
    if (!byLabel) fragmentsByRow.set(row, (byLabel = new Map()));
    let frags = byLabel.get(label);
    if (!frags) byLabel.set(label, (frags = []));
    frags.push({ text, y: t.y, x0: t.x, x1: t.x + (t.w || 0) });
  };
  const add = (row: TableRow, toks: GraphSpan[]) => {
    for (const t of toks) {
      let label = columnOf(t);
      if (label == null) {
        // Refused by anchorRadii's own anomalous-gap cap. Before giving up,
        // check the ONE case that cap was never meant to catch: this exact
        // token sits ordinary word-spacing distance past ALREADY-ACCEPTED
        // text from the SAME physical line, in a cell rawColumnOf agrees it
        // belongs to — a genuine continuation of a value already accepted on
        // that line, not a foreign token that merely lands nearest this
        // column's recovered start. Real, found live on itd-d1-lab-
        // mechanical.pdf's own AREA/SUPPLY VALVE SERVED columns (CONTROL
        // VALVE / HOT WATER REHEAT COIL SCHEDULEs): a trailing diffuser
        // cross-reference ("SAV-1") sits ~9px past the room name's own end
        // — plain word-spacing, same line — but far past the SERVED
        // column's own recovered start (that column legitimately needs room
        // for a full room name, dragging its anchorRadii cap tight relative
        // to this table's own much narrower numeric columns) — every SERVED
        // cell silently lost its own trailing cross-reference tag.
        const raw = rawColumnOf(t);
        const rawFrags = raw ? fragmentsByRow.get(row)?.get(raw) : undefined;
        const lineTol = Math.max(3, (t.h || 8) * 0.5);
        const sameLine = rawFrags?.filter((f) => Math.abs(f.y - t.y) <= lineTol) ?? [];
        const rightMost = sameLine.length ? Math.max(...sameLine.map((f) => f.x1)) : null;
        if (raw && rightMost != null && t.x - rightMost <= CONTINUATION_GAP_MAX(t.h || 8)) label = raw;
        else continue;
      }
      if (!WIDE_LAST.has(label) && label !== "NAME") {
        const next = nextColumnAfter(label);
        if (next != null && t.x + (t.w || 0) > next.x) {
          const words = splitOverflowWords(t);
          // Only actually split when a trailing word's own estimated
          // position really lands at (or close to) the next column's start
          // — an ordinary wide single value whose bbox merely runs a little
          // long (measurement slack, not a second column's worth of text)
          // never clears this, and is left to band as one cell below. The
          // small tolerance (a fraction of the table's own column pitch)
          // absorbs per-character width estimation error — splitOverflowWords
          // assumes each character claims an equal share of the token's own
          // bbox width, which is only ever approximate against a real
          // proportional font (measured live: "STOREFRONT P-1" — 10 wide
          // capital letters vs. a narrow "P-1" — placed the trailing word's
          // estimate 6.9px short of its real column start). Once a split is
          // confirmed, each word is placed by the SAME tolerance-adjusted
          // boundary, not re-derived through columnOf — that function's own
          // idx search has no such tolerance, and the very estimation error
          // splitTol exists to absorb would otherwise strand the trailing
          // word back on `label` a second time.
          const splitTol = Math.max(10, medGap * 0.2);
          if (words.length > 1 && words[words.length - 1].x >= next.x - splitTol) {
            for (const word of words) addOne(row, word, word.x >= next.x - splitTol ? next.label : label);
            continue;
          }
        }
      }
      addOne(row, t, label);
    }
  };
  const orphans: Array<{ toks: GraphSpan[]; y: number }> = [];
  const markers: Array<{ rev: string; span: GraphSpan; drawn?: boolean; tri?: Bbox }> = [];
  for (let i = Math.max(cfg.fromIdx, 0); i < toIdx; i++) {
    if (rowY(rows[i]) <= cfg.belowY) continue;
    const banded: GraphSpan[] = [];
    for (const t of rows[i]) {
      const tri = cfg.deltas?.get(t);
      const rev = tri ? norm(t.str) : revisionOf(t.str);
      // a delta usually sits in the MARGIN beside its row — outside the data
      // band — so the marker gate is wider than the cell gate
      if (rev != null) {
        if (centerX(t) >= x0 - 2.5 * medGap && centerX(t) <= x1 + medGap) markers.push({ rev, span: t, ...(tri ? { drawn: true, tri } : {}) });
        continue;
      }
      if (t.x >= x0 && t.x <= x1) banded.push(t);
    }
    if (!banded.length) continue;
    const keyed = rowKeyOf(banded[0].str, kind, buildings, nameKeyed);
    if (!keyed) { orphans.push({ toks: banded, y: rowY(rows[i]) }); continue; }
    // CODE_RE's digit-free branch (letters only, optionally hyphenated, ≤8
    // chars total) is shaped exactly like an ordinary short English phrase —
    // "CFM", "MAXIMUM", "SILENCER" all pass it just as easily as a real bare
    // abbreviation ("CW", cold water) would; its digit-bearing branch is
    // fooled the same way when a plain word is immediately followed by a
    // number with no delimiter ("ROOM130" from a wrapped "…/ ROOM 130"
    // room-name continuation, itd-d1-lab-mechanical.pdf#12's own SNORKEL
    // HOOD/valve schedules). This file's OWN standing axiom, stated
    // repeatedly elsewhere (rowKeyOf's own CODE_RE comment; extractedKeys'
    // "a real device tag or finish/room code always carries at least one
    // digit"): a genuine catalog tag in this corpus is never bare letters
    // alone. Every digit-free CODE_RE match that isn't this table's own
    // established header/anchor name is therefore treated the same way —
    // folded into an ORPHAN instead of minting its own phantom row — rather
    // than dropped outright the way the post-hoc keyIsOwnColumn/minCells
    // filters below do, which heads off the STEALING failure mode those can
    // only clean up after the fact. Two real, corpus-found shapes this
    // catches:
    //   - a stray header-vocabulary fragment ("CFM" bled from EQUIPMENT_
    //     HEADERS into a `finish`-kind DIFFUSER SCHEDULE's own D-1 row,
    //     which wraps "CFM 6"Ø" onto a 2nd line — unguarded, "CFM" mints its
    //     own row and carries off D-1's real SIZE/REMARKS with it);
    //   - a wrapped MANUFACTURER name that happens to be hyphenated
    //     (itd-d1-lab-mechanical.pdf#12's own CANOPY HOOD SCHEDULE: CH-1's
    //     own "CAR-MON CUSTOM MODEL" manufacturer cell wraps "CAR-MON" onto
    //     its own line, digit-free and CODE_RE-hyphen-shaped exactly like a
    //     real tag; unguarded, it mints a phantom "CAR-MON" row that then
    //     WINS the orphan-fold race for CH-1's own preceding wrapped
    //     "(2) NCAT OVENS…" SERVES line — sitting closer to it than CH-1's
    //     own real key row does — stealing that line from CH-1 for good).
    // Deliberately excludes a word that IS one of THIS table's own anchors
    // (keyIsOwnColumn's exact shape): that case already has a real row of
    // its own to compare against there, cell-for-cell, downstream — turning
    // it into an orphan here instead risks it grafting onto some OTHER nearby
    // row by y-proximity alone before that comparison ever runs (real
    // regression, caught live: a fixture's own digit-free "SYMBOL"/"TOTAL"
    // noise rows, meant to vanish independently, instead padded each
    // other's cell counts past the survival floor once routed through the
    // orphan-fold radius).
    //
    // The digit-BEARING branch stays narrower (vocabulary-word PREFIX only,
    // via ALL_HEADER_WORDS) rather than this same blanket rule — a real tag
    // routinely IS bare letters-plus-digits with no delimiter (EF1-shaped,
    // even if this corpus's own convention favors a hyphen), so treating
    // every digit-bearing match as suspect would misfire on real tags; only
    // the specific "ordinary word directly fused to a number" shape
    // (ROOM130) is a safe, narrow catch there.
    if ((kind === "finish" || kind === "equipment") && !anchors.some((a) => a.label === keyed.key)) {
      const hasDigit = /\d/.test(keyed.key);
      let isHeaderFragment = false;
      if (!hasDigit) {
        isHeaderFragment = true;
      } else if (!keyed.key.includes("-")) {
        const prefix = keyed.key.match(/^[A-Z]+/)?.[0] ?? "";
        isHeaderFragment = prefix.length >= 3 && ALL_HEADER_WORDS.has(prefix);
      }
      if (isHeaderFragment) {
        // For the DIGIT-FREE branch specifically, orphan-folding is only
        // ever a RECOVERY — it exists to rescue real sibling data this same
        // physical line also carries (CFM's own line also carries "6X6"/a
        // real REMARKS value, real data that belongs to the row above),
        // never to give the fragment itself somewhere to land. A fragment
        // with no such sibling — alone on its own line, or accompanied only
        // by other header-fragment words with no digit anywhere — has
        // nothing worth recovering, and orphan-folding it anyway just
        // trades one failure mode for another: real, corpus-found
        // (itd-d1-lab-mechanical.pdf#14's own SOUND ATTENUATOR SCHEDULE) —
        // "DUCT" (SA-1's own wrapped TYPE-cell continuation, alone on its
        // own line, no recognized TYPE anchor to receive it) sits close
        // enough to SYMBOL's own column that orphan-folding merged it
        // straight into SA-1's real tag, "DUCT SA-1" — while itd-d1-lab-
        // mechanical.pdf#12's own CANOPY HOOD SCHEDULE's "CAR-MON" (CH-1's
        // own wrapped MANUFACTURER-cell continuation, likewise alone) needs
        // no orphan slot of its own at all — the actual fix there is only
        // ever keeping it from minting its OWN phantom row and hijacking
        // the orphan-fold TARGET the real "(2) NCAT OVENS…" line above it
        // needs. Digit-bearing siblings are the honest signal: real data
        // (a size, a quantity, a remark number) almost always carries one;
        // another bare header-fragment word never does.
        //
        // The digit-BEARING branch (ROOM130-shaped) skips this extra gate —
        // its own key already carries a digit (the real room number itself,
        // ledger evidence enough on its own), and a real wrapped
        // continuation there can legitimately be an all-letters phrase with
        // no digit of its own at all (real, corpus-found: itd-d1-lab-
        // mechanical.pdf#12's own SEV table wraps "ROOM 130" onto "ELECTRONIC
        // EXHAUST VALVE", its own TYPE cell's real continuation, digit-free).
        const hasSalvageableSibling = !hasDigit ? banded.some((t) => t !== banded[0] && /\d/.test(t.str)) : true;
        if (hasSalvageableSibling) orphans.push({ toks: banded, y: rowY(rows[i]) });
        continue;
      }
    }
    // Every row of THIS table starts its key at the key column. Rows are
    // clustered across the whole sheet, so a keyed-looking row belonging to
    // something else — a legend, a room tag drawn beside the schedule —
    // otherwise joins the table and shows up as a duplicate key.
    if (cols && Math.abs((cols.coord === "left" ? banded[0].x : centerX(banded[0])) - cols.cols[0].start) > keyTol) continue;
    // continuation adoption: a keyed row whose key column does not line up
    // with the base's belongs to some OTHER structure — skipped, never merged
    if (cfg.keyAlign && Math.abs(centerX(banded[0]) - cfg.keyAlign.x) > cfg.keyAlign.tol) continue;
    const row: TableRow = { key: keyed.key, sheet: sheetKey, cells: {} };
    if (keyed.building) row.building = keyed.building;
    add(row, banded);
    out.push(row);
    outY.push(rowY(rows[i]));
  }
  // A table ends where its rows stop. Rows are clustered across the WHOLE
  // sheet, so a keyed-looking row far below — a legend, a note block, a room
  // tag on the plan drawn beside the schedule — otherwise joins the table and
  // shows up as a duplicate key ("ambiguous: 3 schedule rows match 100").
  // Keep the run that starts at the first row and break at the first gap
  // wider than eight times the table's own row pitch — a real schedule
  // can carry section breaks and blank bands, so the bar has to be high.
  // Key-column alignment above bounds the table sideways; a gap eight row
  // pitches deep bounds it downwards, for the case where something keyed the
  // same way sits far below.
  if (out.length > 2) {
    const d = outY.slice(1).map((y, i) => y - outY[i]).filter((g) => g > 0).sort((a, b) => a - b);
    const pitch0 = d.length ? d[d.length >> 1] : 0;
    if (pitch0 > 0) {
      let end = out.length;
      for (let i = 1; i < outY.length; i++) if (outY[i] - outY[i - 1] > pitch0 * 8) { end = i; break; }
      if (end < out.length) { out.length = end; outY.length = end; }
    }
  }
  // the repair radius: median gap between consecutive keyed rows; a lone-row
  // table falls back to a couple of text heights
  const gaps = outY.slice(1).map((y, i) => y - outY[i]).filter((d) => d > 0).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[gaps.length >> 1] : 0;
  const nearest = (y: number): { i: number; d: number } => {
    let bi = -1, bd = Infinity;
    outY.forEach((ry, i) => { const d = Math.abs(y - ry); if (d < bd) { bd = d; bi = i; } });
    return { i: bi, d: bd };
  };
  const radius = (h: number) => (pitch ? pitch * 0.6 : Math.max(h, 8) * 1.6);
  for (const o of orphans) {
    const { i, d } = nearest(o.y);
    if (i < 0 || d > radius(Math.max(...o.toks.map((t) => t.h || 8)))) continue;
    add(out[i], o.toks);
  }
  for (const m of markers) {
    const { i, d } = nearest(m.span.y);
    if (i < 0 || d > radius(m.span.h || 8) || out[i].revision) continue;
    // a drawn delta's evidence bbox spans digit AND triangle — view_sheet
    // shows the symbol, not just the bare digit
    const ebox = m.tri ? merge(bboxOf(m.span), m.tri) : bboxOf(m.span);
    out[i].revision = { rev: m.rev, source: { sheet: sheetKey, text: m.span.str.trim(), bbox: ebox }, ...(m.drawn ? { drawn: true } : {}) };
  }
  // A candidate row with only a MINORITY of its own table's real columns
  // populated, on a genuinely multi-column `equipment` table, is USUALLY
  // noise, not a real row — ledger item 29 (accuracy-hardening plan): a
  // stray sub-header word that isn't in EQUIPMENT_HEADERS' own vocabulary
  // ("RPM", a second header line under "ESP" naming the same physical
  // column), a title-block/revision-log fragment interleaved mid-table
  // ("No. Description Date"), and a schedule's own trailing "REMARKS:"
  // footnote-legend label all measured, on the real itd-d1-lab corpus, as
  // their OWN one-cell garbage row. BUT: a real tag from a DIFFERENT,
  // unrecognized schedule table can also bleed in as a lone, badly-mis-
  // columned orphan row (found live: a real "PH-1 EQUIPMENT T01 TIERED" —
  // a genuine tag from some OTHER portable-heater schedule this pass never
  // found its own header for — landed as a 1-cell row inside the Electric
  // Heater Schedule's own REMARKS column). Cell count alone can't tell
  // these apart; every garbage example measured has a DIGIT-FREE key
  // (RPM/NO/REMARKS/WATER/CITY-SOFTENED/FAN/GPM/PRESSURE/SYMBOL/IN/DUCT/
  // SILENCER/HIGHWALL/SUPPORT/SCROLL/TOTAL/CFM), while every real tag
  // measured, in this table or bled in from another, carries one (EF-1,
  // PH-1, CH-1, AC-1, …) — the same real-MEP-tag shape
  // CATALOG_ANCHOR_WORDS/rowKeyOf already lean on elsewhere. So: only a
  // digit-free-keyed row is ever dropped — a real, sparsely-extracted
  // tagged row (even one that landed here by mistake) is never silently
  // discarded, only the digit-free noise is.
  //
  // The cell-count bar was originally a HARD 1-cell floor (a candidate
  // needed 2+ populated cells to survive at all) — too narrow: found live,
  // real, on the same corpus's own real "AIR COMPRESSOR SCHEDULE"
  // (itd-d1-lab-mechanical.pdf#28), where a completely unrelated content
  // block on the same sheet (a plumbing-calculations summary, a gas-sizing
  // chart) bled in as its OWN 2-4-cell garbage rows keyed "REMARKS",
  // "SYMBOL", "TOTAL" — digit-free exactly as already measured above, but
  // populating MORE than one cell, so the hard 1-cell floor let them
  // through while the real AC-1 row (8 of this table's 9 real columns
  // populated) sailed past easily. Made RELATIVE to the table's own real
  // column count instead of a fixed number: a digit-free-keyed row
  // populating under HALF of `anchors.length` is noise; a real row, bled
  // in or not, reliably fills a strong majority of a genuinely-anchored
  // table's own columns. Scoped narrowly to the exact shape this was
  // found on (`equipment` kind, >=4 real columns, evaluated AFTER orphan-
  // folding so a row that only looked sparse before its own continuation
  // text merged in is never caught) — a sparse room-finish row (FLOOR
  // filled, BASE/WALL legitimately blank) is a real, different, unrelated
  // case this must never touch, and a `finish`-kind schedule can
  // legitimately have very few columns at all.
  // "TYPE" (ledger item 63) widened this exact garbage class it wasn't sized
  // for: the same real "SYMBOL"/"REMARKS"/"TOTAL"-keyed noise this comment
  // already names picked up ITS OWN "TYPE" cell too (the unrelated content
  // block's own stray "AIR HANDLING UNIT ( AHU-1…" text partially column-
  // maps into TYPE), pushing a 4-cell noise row that used to clear the
  // relative floor's OWN safe side up to 5 — exactly `minCells` at
  // anchors.length=10, no longer under it. The key itself is the honest,
  // narrower signal the relative-count heuristic was always standing in
  // for: a row whose OWN key is literally a vocabulary word (SYMBOL, TYPE,
  // REMARKS, …) is a legend/label fragment, never a real device tag — no
  // real schedule anywhere in this corpus keys a row under the bare name of
  // one of its own columns. Checked first, then the existing relative-count
  // floor for every OTHER digit-free noise shape.
  // `keyIsOwnColumn` on its own — "no real schedule anywhere in this corpus
  // keys a row under the bare name of one of its own columns" (this
  // function's own comment above, right where this check was first added)
  // — is a kind-agnostic truth, not something specific to the equipment-kind
  // shape the surrounding `minCells` relative-count floor was tuned and
  // tested against. Real, corpus-found live on THIS exact table under
  // `finish` kind (itd-d1-lab-mechanical.pdf#12's own SNORKEL HOOD
  // SCHEDULE): a trailing "REMARKS:" footnote-legend label bled in as its
  // own digit-free, self-titled row (key "REMARKS", one of the table's own
  // 5 real header labels) — finish kind never ran the check above at all,
  // so that garbage row survived, inflated the finish-kind fragment's own
  // cross-kind "richness" score by exactly one populated cell, and won the
  // cross-kind duplicate-collapse tie-break (buildSheetGraph, below) against
  // the correctly-read, richer equipment-kind extraction of the SAME real
  // table by that single point. Applied to every kind, unconditionally — the
  // `minCells` floor right after stays scoped exactly as before (equipment
  // only, >=4 anchors), untouched, so nothing tuned for that narrower shape
  // changes for any kind that already passes today.
  for (let i = out.length - 1; i >= 0; i--) {
    const keyIsOwnColumn = anchors.some((a) => a.label === norm(out[i].key));
    if (keyIsOwnColumn && !/\d/.test(out[i].key)) { out.splice(i, 1); outY.splice(i, 1); }
  }
  // Widened from `kind === "equipment" && anchors.length >= 4` (real,
  // corpus-found: itd-d1-lab-mechanical.pdf#13's own LAB EXHAUST FAN
  // SCHEDULE and #14's own SOUND ATTENUATOR/PENTHOUSE SCHEDULEs). Both gaps
  // in the old scoping let real noise through:
  //   - anchors.length >= 4 assumed a real deep multi-tier header always
  //     recovers at least 4 anchors: LAB EXHAUST FAN SCHEDULE's real header
  //     is FOUR tiers deep (SYMBOL/AREA SERVED/UNIT TYPE/…/MANUFACTURER AND
  //     MODEL/REMARKS over BLOWER→CFM→DESIGN|ACTUAL, MAXIMUM RPM, #OF FANS,
  //     ELECTRICAL→HP PER FAN, V/Ø…) but only 3 of its real columns
  //     (SYMBOL/MANUFACTURER/REMARKS) are in today's vocabulary — every
  //     unconsumed deeper tier word (RPM/DESIGN/FAN/ACTUAL…) fell through
  //     as its own digit-free 0-cell phantom row, ungoverned.
  //   - `kind === "equipment"` excluded `finish` entirely: SOUND ATTENUATOR
  //     SCHEDULE (3 anchors of 21 real leaf columns) and PENTHOUSE SCHEDULE
  //     both bled the same shape of digit-free, near-empty header-fragment
  //     rows (FPM/LENGTH/WIDTH IN/DUCT/SILENCER; "AREA (ft²)" split into its
  //     own row) with no filter running on them at all.
  // Safe to widen both ways: the digit-free guard already stands — and a
  // real `room-finish` row is NEVER digit-free (its key is a room NUMBER),
  // so the sparse-FLOOR-row case this floor was originally kept narrow to
  // protect is untouched regardless of kind or anchor count. Lowered to
  // >=3 rather than removed outright: a genuinely 1-2-anchor table is too
  // sparse for "under half the real columns populated" to mean anything.
  if (anchors.length >= 3) {
    const minCells = Math.max(2, anchors.length / 2);
    for (let i = out.length - 1; i >= 0; i--) {
      if (Object.keys(out[i].cells).length < minCells && !/\d/.test(out[i].key)) { out.splice(i, 1); outY.splice(i, 1); }
    }
  }
  // row-level building off the BLDG/BUILDING column, where the key itself
  // did not carry one
  for (const row of out) {
    if (row.building) continue;
    const cellB = norm(row.cells.BLDG?.text || row.cells.BUILDING?.text || "");
    if (DESIGNATOR_RE.test(cellB)) row.building = cellB;
  }
  // Re-derive every multi-fragment cell's text in true (y, then x) order —
  // see `add`'s own comment on `fragmentsByRow` above. Only touches cells
  // that actually received 2+ fragments; an ordinary single-token cell's
  // text is already correct and untouched.
  for (const row of out) {
    const byLabel = fragmentsByRow.get(row);
    if (!byLabel) continue;
    for (const [label, frags] of byLabel) {
      if (frags.length < 2) continue;
      const cell = row.cells[label];
      if (!cell) continue;
      const sorted = [...frags].sort((a, b) => a.y - b.y || a.x0 - b.x0);
      const joined = sorted.map((f) => f.text).join(" ");
      if (joined !== cell.text) row.cells[label] = { text: joined, bbox: cell.bbox };
    }
  }
  return { out, region };
}

// A row that would itself qualify as SOME table's header — checked against
// BOTH vocabularies, not just the kind currently being extracted, because a
// real sheet mixes room-finish and finish/equipment tables (#HVAC-boundary).
//
// Banded to [x0, x1] — the table's OWN column band, the same restriction the
// title check right below already applies. clusterRows groups purely by Y,
// with no notion of column: two schedules drafted SIDE BY SIDE (this
// project's own sample: a room-finish schedule at x~340-2100 and a material
// schedule at x~2980-4500, both running down the same Y range) routinely
// merge into ONE row cluster wherever their rows happen to land at the same
// height. Scanning the row unbanded reads the material schedule's own header
// ("CODE / MATERIAL / MANUFACTURER…", which clears FINISH_HEADERS easily) as
// a false boundary sitting inside the room-finish table's FIRST data row —
// not a later, plausible-looking row, but the very first one, since the two
// headers happen to land at the same Y. That zeroes the table's data before
// bandDataRows ever runs, which cascades: extractTableAt returns null, and
// extractAllTables's loop reads null as "no more tables of this kind here"
// and stops — losing every OTHER instance of this kind on the sheet too, not
// just the one that collided. Caught by the real sample-finish-plan.pdf
// fixture (three room-finish schedules stacked over one shared column grid,
// beside one material schedule) failing detect_rooms's assign_from_schedule
// path entirely — the exact kind of regression this function exists to
// prevent, reintroduced by this function itself before it was banded.
function looksLikeNewHeader(row: GraphSpan[], x0: number, x1: number): boolean {
  const banded = row.filter((t) => centerX(t) >= x0 && centerX(t) <= x1);
  if (qualifies(headerHits(banded, ROOM_HEADERS), ["FLOOR", "BASE"], 4)) return true;
  if (qualifies(headerHits(banded, FINISH_HEADERS), ["CODE", "MARK", "SYMBOL", "ID"], 3)) return true;
  if (qualifies(headerHits(banded, EQUIPMENT_HEADERS), ["VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "RPM", "ESP"], 3)) return true;
  return false;
}
// A generous but real cap — never "the rest of the sheet". See the comment
// on findTableBoundary for why the cap has to exist independently of the
// header-candidate/title checks, not just as a backstop that never fires.
const MAX_TABLE_SCAN_ROWS = 60;
// A vocab-kind table's own forward scan (findTableBoundary, below) gets a
// MUCH bigger budget than MAX_TABLE_SCAN_ROWS's plain row-cluster count —
// see vocabScanCapIdx's own comment for why counting row-CLUSTERS at all is
// the wrong unit for a verbose real schedule, and why 60 of them, even
// converted to Y-distance, is still too tight for a real, long one. This
// constant is deliberately its OWN number, not a multiple of
// MAX_TABLE_SCAN_ROWS applied in code — findGenericTableBoundary (the
// "reference"-kind path) and the rotated-header title hunt's own `maxY`
// keep using the original 60-row-cluster budget entirely unchanged; only
// the vocab-kind (room-finish/finish/equipment) scan below is widened.
const VOCAB_TABLE_SCAN_LINES = 200;
/** Row-index cap for a vocab-kind table's forward scan (findTableBoundary /
 * findSparseKeyedBoundary), expressed as a Y-DISTANCE budget
 * (VOCAB_TABLE_SCAN_LINES real line-heights) rather than a fixed row-
 * CLUSTER count. clusterRows breaks every wrapped text LINE into its own
 * row-cluster, not every schedule ROW — a compact one-line-per-row schedule
 * and a verbose one wrapping 3-5 lines per row both look like "N rows" in
 * cluster-count terms, but the verbose one covers only a fraction of the
 * real table in that same row-count budget. Real, corpus-found: itd-d1-lab-
 * mechanical.pdf#28's own "PLUMBING FIXTURE SCHEDULE" wraps most of its ~30
 * real rows across 3-5 lines each (long FIXTURE DESCRIPTION/MANUFACTURER
 * prose) — a 60-row-CLUSTER cap reached row 13 (FS-3) and stopped there,
 * with the remaining ~17 real rows (LS-1, RD-1, …) left with no table of
 * their own to belong to, bleeding out as their own spurious "reference"-
 * kind fragments once nothing else claimed that ink (droppedNamedTables'
 * own containment check — see its comment — only suppresses a reference
 * fragment sitting INSIDE the real table's own extracted region, and a
 * region truncated at row 13 doesn't reach rows 14+ at all). Measuring the
 * budget in Y instead of row-clusters — the exact technique this file's own
 * rotated-header title hunt already uses, see its `maxY` comment — costs a
 * compact, single-line-per-row schedule nothing (N lines of Y ≈ N row-
 * clusters there, the two are numerically the same) while letting a verbose
 * one reach its own real last row before the cap does, not before the
 * first few rows are even done wrapping. `lineHeight` is the table's own
 * header line height (the same real proxy for "one wrapped line" the
 * rotated-header path already uses) — never text height in the abstract,
 * always THIS table's own drawn scale. */
function vocabScanCapIdx(rows: GraphSpan[][], fromIdx: number, belowY: number, lineHeight: number): number {
  const from = Math.max(fromIdx, 0);
  let startY: number | null = null;
  for (let i = from; i < rows.length; i++) {
    if (rowY(rows[i]) <= belowY) continue;
    startY = rowY(rows[i]);
    break;
  }
  if (startY == null) return rows.length;
  const maxY = startY + VOCAB_TABLE_SCAN_LINES * Math.max(lineHeight * 1.5, 12);
  for (let i = from; i < rows.length; i++) {
    if (rowY(rows[i]) <= belowY) continue;
    if (rowY(rows[i]) > maxY) return i;
  }
  return rows.length;
}
/** Where does the table whose data starts at `dataFrom` END — i.e. the first
 * row index that belongs to a DIFFERENT table, so bandDataRows's scan (and
 * columnMapFor's column-start recovery, which shares this bound) stops
 * before it. On a dense sheet, several schedules routinely share the same
 * column grid (a real, common MEP drafting convention — this project's own
 * sample sheet stacks seven), so without a bound a later table's rows read
 * as more of this one. Two signals, whichever comes first: a row that reads
 * as a header candidate under EITHER vocabulary (`looksLikeNewHeader` —
 * checking only the current kind would miss a later table of the OTHER
 * kind), or a "…SCHEDULE"-style title landing inside this table's own
 * x-band (the same test `extractTableAt` already uses to find ITS OWN
 * title, applied forward instead of backward).
 *
 * Known, accepted blind spot: a real MEP schedule whose header doesn't clear
 * either vocabulary's minHits at all (a Fan or VRF Heat Pump schedule, whose
 * columns are CFM/VOLTAGE/PHASE/WATTS-shaped, not yet in either vocabulary
 * pre-#HVAC-equipment-kind) and whose title doesn't say "SCHEDULE" either
 * (confirmed on this project's own real sample: "VARIABLE REFRIGERANT
 * PACKAGED HEAT PUMP" contains neither word) is invisible to BOTH signals.
 * That table is simply not found as a table of its own today — expected,
 * not a bug this function is responsible for — but it must never cause an
 * EARLIER, already-found table's scan to run unbounded through it. That's
 * what MAX_TABLE_SCAN_ROWS is for: the cap applies regardless of whether
 * either signal ever fires, so a vocabulary gap can't silently reopen the
 * original bug through this exact path.
 *
 * `belowY` (rotated headers only — `-Infinity` otherwise): the rotated path
 * always passes `dataFrom = 0`, an index into the WHOLE sheet's horizontal
 * rows, not "right after the header" the way the flat path's `dataFrom`
 * already is — row 0 there is this table's OWN title line, sitting above
 * the (vertical, not in this row list) header band. Without skipping rows
 * at or above the band, that title can — and did, caught by the rotated-
 * header test — read as a false "next table" boundary against itself,
 * since a table's own title routinely contains "SCHEDULE" and sits inside
 * its own x-band. Skip anything not actually below the header, same filter
 * bandDataRows' main scan already applies. */
function findTableBoundary(rows: GraphSpan[][], dataFrom: number, x0: number, x1: number, belowY = -Infinity, lineHeight = 12): number {
  const cap = vocabScanCapIdx(rows, dataFrom, belowY, lineHeight);
  for (let i = dataFrom; i < cap; i++) {
    if (rowY(rows[i]) <= belowY) continue;
    if (looksLikeNewHeader(rows[i], x0, x1)) return i;
    if (rows[i].some((t) => /SCHEDULE/.test(norm(t.str)) && centerX(t) >= x0 && centerX(t) <= x1)) return i;
  }
  return cap;
}

/** Recovery for `findTableBoundary`'s own documented blind spot: a scan that
 * never hit a real stop signal and ran all the way to the cap. That alone
 * does not mean the table is wrong — a real schedule can legitimately run
 * long — but it DOES mean the cap, not evidence, decided where the table
 * ends, so before trusting it this re-walks the same range and asks what the
 * rows whose leading in-band token actually reads as a key of THIS table
 * (`rowKeyOf`, the identical test `bandDataRows` uses to accept a row at
 * all) look like on their own: gaps between successive ones, median, first
 * gap more than 8× that median — the same generous multiple `bandDataRows`'
 * own post-hoc trim already uses once IT has rows to compare — ends the
 * table right there. Confirmed live on this project's own
 * sample-finish-plan.pdf: a NAME-keyed table (see NAME_KEY_RE) whose two
 * real rows sit tight against its header (a 26px pitch) has nothing else
 * that reads as a name-shaped key in its column band until a revision-log
 * fragment — "REVISION SET 1…", "Description" — 2500+px further down; three
 * candidates in, the gap to that fragment is ~95× the real pitch, so this
 * ends the table right after the two real rows, before column recovery ever
 * sees the revision log and starts folding it into the key column — which is
 * exactly what happened before this existed: with the revision-log rows
 * still in scan range, they out-voted the two real rows for where the key
 * column starts, and the real rows were the ones excluded as misaligned.
 *
 * The pace is a RUNNING median of gaps accepted so far, not one fixed number
 * up front: a single early gap could as easily be a real (if tight or
 * generous) row pitch as a fluke, and a global median over the whole range
 * has the opposite problem — one more piece of debris further down (found
 * live: a title-block "CONSULTANT" label, alone in the column band, ~2200px
 * past the two real rows) drags the median up enough that the very gap this
 * function exists to catch slips under its own threshold. Updating the pace
 * only from gaps already accepted means later debris can never reach back
 * and change where an earlier one got cut.
 *
 * Needs at least 2 keyed candidates to bootstrap a pace at all; with 0 or 1
 * there is nothing to compare a gap against, so this returns `cap` unchanged
 * and leaves the decision to bandDataRows' own row-count and column-fit
 * checks. */
function findSparseKeyedBoundary(
  rows: GraphSpan[][],
  dataFrom: number,
  cap: number,
  x0: number,
  x1: number,
  belowY: number,
  kind: "room-finish" | "finish" | "equipment",
  buildings: Set<string> | undefined,
  nameKeyed: boolean,
): number {
  const candidates: Array<{ i: number; y: number }> = [];
  for (let i = dataFrom; i < cap; i++) {
    if (rowY(rows[i]) <= belowY) continue;
    const first = rows[i].find((t) => t.x >= x0 && t.x <= x1 && revisionOf(t.str) == null);
    if (!first || !rowKeyOf(first.str, kind, buildings, nameKeyed)) continue;
    candidates.push({ i, y: rowY(rows[i]) });
  }
  if (candidates.length < 2) return cap;
  const acceptedGaps = [candidates[1].y - candidates[0].y];
  let pitch = acceptedGaps[0];
  for (let k = 2; k < candidates.length; k++) {
    const gap = candidates[k].y - candidates[k - 1].y;
    if (pitch > 0 && gap > pitch * 8) return candidates[k].i;
    acceptedGaps.push(gap);
    acceptedGaps.sort((a, b) => a - b);
    pitch = acceptedGaps[acceptedGaps.length >> 1];
  }
  return cap;
}

/** The real per-call primitive: find ONE table of `kind`, searching from row
 * index `fromIdx` onward, and report where it ends (`nextIdx`) so a caller
 * can resume past it. `extractTable` (below) is the fromIdx=0 single-table
 * convenience wrapper every existing caller already uses; `extractAllTables`
 * is the new multi-table loop `buildSheetGraph` uses. Kept as one function
 * so the two never drift on what "one table" actually means. */
function extractTableAt(sheet: SheetSpans, kind: "room-finish" | "finish" | "equipment", opts: ExtractOpts, fromIdx: number): { table: ScheduleTable | null; nextIdx: number } | null {
  const horiz = sheet.spans.filter((s) => !isVertical(s));
  const vert = sheet.spans.filter(isVertical);
  const rows = clusterRows(horiz);
  const vocab = kind === "room-finish" ? ROOM_HEADERS : kind === "equipment" ? EQUIPMENT_HEADERS : FINISH_HEADERS;
  // AIRFLOW/VELOCITY/FPM (Phase 3, ledger items 6/7): real, HVAC-specific
  // rating words seen live on the Canopy Hood Schedule's own header
  // ("EXHAUST AIRFLOW (CFM)", "CAPTURE VELOCITY (FPM)") — unlike CFM (kept
  // OUT of `required` on purpose, too generic across unrelated tables),
  // these three don't show up outside a real air-moving-equipment schedule,
  // so they're safe additions to the RATING bar itself, not just the
  // vocabulary. EWT/LWT added alongside EAT/LAT (their hydronic sibling,
  // already required) — an oversight when EWT/LWT joined the vocabulary,
  // caught while touching this list for the same real reason.
  const required = kind === "room-finish" ? ROOM_FINISH_REQUIRED
    : kind === "equipment" ? EQUIPMENT_REQUIRED
    : FINISH_REQUIRED;
  const minHits = kind === "room-finish" ? ROOM_FINISH_MIN_HITS : OTHER_KIND_MIN_HITS;

  let anchors: Anchor[];
  let headerSpans: GraphSpan[];
  let dataFrom: number;           // first row index eligible as data
  let dataBelowY = -Infinity;     // rotated: data rows must sit below the band
  let titleFrom: number;          // title hunt walks upward from here
  let rotated = false;

  // Equipment tables can split across two independently-non-qualifying tiers
  // (a bare ID/MANUFACTURER/MODEL row above a bare VOLTAGE/PHASE/AMPS/MOCP
  // row, neither tier alone carrying a required-list hit) — real, found live
  // on the Bessemer sample's "VARIABLE REFRIGERANT PACKAGED HEAT PUMP" table
  // (HP-1). findHeaderRow's own downward tier-descent never merges these —
  // it only ever looks down, and neither tier here independently qualifies —
  // so findHeaderRow's `equipmentTierMerge` option reaches BACKWARD instead,
  // once the lower tier settles, when it has no usable key column of its own
  // (see mergeBackwardCoEqualTier's comment for the exact conditions). Kept
  // equipment-only (not extended to room-finish/finish) deliberately: no
  // real fixture in this project has a split co-equal header on those kinds
  // yet, so enabling it there would be untested generalization — exactly the
  // class of change that caused the MODEL regression the comment above this
  // one used to describe. A one-line change (`kind === "equipment"` below)
  // the day a real split-header finish/room-finish table shows up.
  // The merge below only ever ADDS a key column when one exists nearby on
  // the sheet — it never invents one. A candidate that still has no catalog
  // anchor after the attempt genuinely has no usable key column (the
  // anchored key would be whatever sits leftmost of the found tier — a bare
  // CFM/VOLTAGE number, which correctly fails rowKeyOf's CODE_RE and drops
  // every row), so it is refused outright rather than accepted as a table
  // that can never be looked up by tag. Checked against CATALOG_ANCHOR_WORDS
  // (ID/MARK/CODE/SYMBOL/TAG), not just literal "ID" — real equipment
  // schedules key under any of these depending on the firm (see
  // EQUIPMENT_HEADERS' own SYMBOL/TAG comment).
  //
  // Refusing a candidate must not end the WHOLE scan, though — a real,
  // unkeyable equipment-shaped table (this sheet's own untitled AIR
  // HANDLING UNIT HYDRONIC COIL SCHEDULE, keyed by bare "TYPE" —
  // CHWC/HWC — with no TAG/MARK/ID/SYMBOL/CODE column at all) can sit
  // directly BEFORE a real, properly TAG-keyed one later on the same sheet
  // (federal-attachment4-mechanical.pdf#14's own CHILLER SCHEDULE and AIR
  // SEPARATOR SCHEDULE, found live: table DISCOVERY itself — not kind
  // classification — was silently stopping at the first unkeyable
  // candidate and never reaching either). Passed into findHeaderRow as
  // `headerQualifies` so a rejection resumes its OWN internal forward scan
  // (the same validated tier-descent/anchor pass every other row already
  // goes through) rather than being a separate, cruder wrapper that retries
  // with a manually bumped fromIdx: an earlier attempt at exactly that
  // shape — call findHeaderRow again from scratch a few rows further on —
  // is what searched past a real candidate into a LATER table's own
  // header and re-extracted a table that already correctly exists under
  // another kind, a duplicate-row-key collision worse than the one this
  // whole design exists to prevent. Reusing findHeaderRow's own loop avoids
  // that: every candidate, first or tenth, is built and validated by the
  // exact same code path, so a genuinely bad partial read is rejected by
  // the SAME bar regardless of how many prior candidates were skipped.
  // "TYPE" (ledger item 63) is deliberately NOT a member of CATALOG_ANCHOR_
  // WORDS itself — real, found live: federal-attachment4-mechanical.pdf#14's
  // own "AIR HANDLING UNIT FAN SCHEDULE" carries a real "FAN TYPE" column
  // (a QUALIFIER, TAG is its real key column) that anchors as bare "TYPE"
  // (headerLabel only keeps the vocabulary word, dropping "FAN"), and a
  // first attempt putting "TYPE" in CATALOG_ANCHOR_WORDS made
  // mergeBackwardCoEqualTier wrongly read that qualifier as "this row
  // already has its own key column," losing the table entirely — confirmed
  // by direct extraction, reverted. The real, standalone convention (a
  // LUMINAIRE SCHEDULE keying E1/R1-R3/S1/S3/V1/X1 under a column literally
  // headed "TYPE", found live on baker-county-eoc-bidset.pdf#59) is
  // distinguished the same way ID/MARK/CODE/SYMBOL/TAG always are on a real
  // schedule: it is the row's OWN LEFTMOST anchor — a qualifier like "FAN
  // TYPE"/"VALVE TYPE" never leads a real schedule's column order, its own
  // real key column (TAG, MARK, …) does. Checked against the anchors array
  // (already sorted by x), not the vocabulary list, so this never widens
  // what mergeBackwardCoEqualTier/introducesAnchor treat as "already has a
  // key column" elsewhere — those keep reading exactly CATALOG_ANCHOR_WORDS,
  // unchanged, so fed14's own qualifier "TYPE" still cannot suppress a real
  // backward merge on some OTHER table the way it did before this fix.
  // Leftmost alone still isn't enough on a genuinely broken read:
  // federal-attachment4-mechanical.pdf#15's own "GRILLE, REGISTER, AND
  // DIFFUSER SCHEDULE" (a real, deep 4-tier merged header this project has
  // never successfully parsed — MARK is its real key column, not in
  // EQUIPMENT_HEADERS' own vocabulary at all) also settles on a row with a
  // stray bare "TYPE" leftmost, at a 0.75 hit ratio, once the real tier-
  // descent gets defeated by the merge's own depth — found live, extracting
  // two garbage rows keyed "CFM"/"FLORIDA", neither a real mark. Ratio alone
  // (findHeaderRow's own "almost ENTIRELY header words" >= 0.6 test,
  // restated here since this check runs after it has already returned)
  // doesn't separate them either — 0.75 clears 0.6 comfortably. Anchor
  // COUNT is what actually does: a real bare-TYPE header recovers MANY real
  // columns (the luminaire schedule: 13, measured); this bad settle
  // recovers 4. The threshold sits well below the real luminaire schedule's
  // own 13 and well above this bad settle's 4, leaving real margin either
  // way — a genuinely rich real schedule header vs. a shallow partial read
  // of a table this vocabulary was never going to fully parse.
  const equipmentHeaderQualifies = (candAnchors: Anchor[], rowIndex: number): boolean => {
    if (candAnchors.some((a) => CATALOG_ANCHOR_WORDS.includes(a.label))) return true;
    // VA / federal CUP: ITEM NO. / EQUIP NO. as the row's own identity
    // column (Las Vegas CUP PUMP SCHEDULE) — compound forms only.
    if ((rows[rowIndex] || []).some((t) => isOwnIdentityEquipmentHeader(t.str))) return true;
    const bareLeadingType = candAnchors[0]?.label === "TYPE" && candAnchors.length >= 8
      && headerHits(rows[rowIndex], vocab).length / Math.max(1, rows[rowIndex].length) >= 0.6;
    return bareLeadingType;
  };
  let flat = findHeaderRow(rows, vocab, required, minHits, fromIdx, {
    equipmentTierMerge: kind === "equipment", forwardTierMerge: !opts.noForwardTierMerge, numericSubHeaderHarvest: kind === "finish",
    headerQualifies: kind === "equipment" ? equipmentHeaderQualifies : undefined,
  });
  if (flat) {
    anchors = flat.anchors;
    headerSpans = rows[flat.rowIndex];
    dataFrom = flat.dataFrom;
    // A backward merge moves the real header block's TOP up to the merged
    // tier (mergedTopIdx) — the title hunt below must walk up from there,
    // not from the lower (rowIndex) tier alone, or it never looks far enough
    // up to find the real title.
    titleFrom = (flat.mergedTopIdx ?? flat.rowIndex) - 1;
  } else {
    // Rotated (quarter-turn) headers are only ever hunted on the FIRST
    // search of a sheet (fromIdx === 0) — `findRotatedHeader` scans `vert`
    // as one flat list with no row-index concept to resume from, and a
    // second rotated table stacked under a first hasn't been seen on any
    // real sheet yet. A narrow, named scope limit, not an oversight.
    if (fromIdx > 0) return null;
    const rot = findRotatedHeader(vert, vocab, required, minHits);
    if (!rot) return null;
    rotated = true;
    anchors = rot.anchors;
    headerSpans = rot.spans;
    dataBelowY = rot.bottom - 2;
    dataFrom = 0;
    titleFrom = rows.findIndex((r) => rowY(r) >= rot.top) - 1;
    if (titleFrom < -1) titleFrom = rows.length - 1;
  }

  // ITEM NO / EQUIP NO is not in EQUIPMENT_HEADERS (keeps bare ITEM/EQUIP out
  // of vocabulary hits) but must still anchor the key column when it is the
  // schedule's own identity header — inject after the vocab pass.
  if (kind === "equipment") {
    const itemSpans: GraphSpan[] = [];
    for (const t of headerSpans) if (isOwnIdentityEquipmentHeader(t.str)) itemSpans.push(t);
    // Parent / co-equal tiers above the deepest qualifying row.
    if (flat) {
      const top = flat.mergedTopIdx ?? flat.rowIndex;
      for (let ri = top; ri <= flat.rowIndex; ri++) {
        for (const t of rows[ri] || []) if (isOwnIdentityEquipmentHeader(t.str)) itemSpans.push(t);
      }
    }
    for (const t of itemSpans) {
      const x = centerX(t);
      const label = isUnitTagHeader(t.str) ? "TAG" : "ITEM";
      if (anchors.some((a) => a.label === label || Math.abs(a.x - x) <= 8)) continue;
      anchors = [...anchors, { label, x }].sort((a, b) => a.x - b.x);
    }
  }

  // The region is what an agent is told to LOOK at, so it must bound THIS
  // table and no other. A clustered header row on a dense sheet sweeps in the
  // neighbouring table's tokens, and merging all of them advertised a region
  // five times the table's width — two tables in one crop. Only header spans
  // inside the anchors' own band count.
  const hdrBand = bandLimits(anchors);
  let region: Bbox | null = null;
  for (const t of headerSpans) {
    if (centerX(t) < hdrBand.x0 || centerX(t) > hdrBand.x1) continue;
    region = region ? merge(region, bboxOf(t)) : bboxOf(t);
  }
  // Deep multi-tier headers (a real, found-live shape: BLOWER/ELECTRICAL/
  // MAXIMUM/SONES/OPERATING WEIGHT tiers on itd-d1-lab-mechanical.pdf's own
  // EXHAUST FAN SCHEDULE, or EWT/LWT/CAPACITY-INPUT-MBH/CAPACITY-OUTPUT-MBH
  // on its own CONDENSING HOT WATER BOILER SCHEDULE) don't all live in
  // `headerSpans` alone — tier-descent (findHeaderRow, above) keeps only the
  // DEEPEST qualifying row as `rowIndex`, and its own "parent tier" harvest
  // loop only reaches rows already known to sit between two established
  // indices, missing whatever tiers a co-equal-tier merge or sub-tier
  // harvest separately reached without ever assembling one combined span
  // list. orphanHeaderXs (above) needs the FULL raw header block — every
  // real, un-vocabularied leaf column's own header cell included, not just
  // the one row that happened to independently qualify — so walk UPWARD
  // from the row that qualified while the y-gap between consecutive rows
  // stays tier-tight (the identical shape test skipSubHeaderContinuation
  // already uses walking DOWNWARD, mirrored: real tiers on both tables
  // measured sit 0–25px apart, while the real TITLE sits 80+px above the
  // header block — comfortably past the h*2 stop, so a title's own prose
  // never joins this scan and can never masquerade as an orphan leaf
  // column). Bounded additionally by this table's own x-band (the same
  // hdrBand the region above already trusts) so a crowded sheet's
  // neighboring content (a stacked table's remarks) never bleeds in either.
  // Rotated headers are a separate, narrower path (`headerSpans` is already
  // its own full flat span list there) and are left untouched.
  const fullHeaderSpans: GraphSpan[] = flat
    ? (() => {
        const out: GraphSpan[] = [];
        let top = flat.rowIndex;
        for (let n = 0; n < 15 && top > 0; n++) {
          const cur = rows[top], prev = rows[top - 1];
          const h = cur.reduce((s, t) => s + (t.h || 8), 0) / Math.max(1, cur.length);
          if (rowY(cur) - rowY(prev) > h * 2) break;
          top--;
        }
        top = Math.min(top, flat.mergedTopIdx ?? flat.rowIndex);
        for (let ri = top; ri < dataFrom && ri < rows.length; ri++) {
          for (const t of rows[ri]) { if (centerX(t) >= hdrBand.x0 && centerX(t) <= hdrBand.x1) out.push(t); }
        }
        return out;
      })()
    : headerSpans;
  // The table's own real line height — the same drawn-scale proxy the
  // rotated-header title hunt already uses for its own Y-distance budget —
  // not an abstract text-height constant. Drives vocabScanCapIdx below so a
  // table whose real rows wrap across several lines each gets a scan budget
  // that actually reaches its own last row (see vocabScanCapIdx's comment).
  const hdrLineHeights = headerSpans.map((t) => t.h || 8).sort((a, b) => a - b);
  const hdrLineH = hdrLineHeights[hdrLineHeights.length >> 1] || 8;
  const cap = vocabScanCapIdx(rows, dataFrom, dataBelowY, hdrLineH);
  let toIdx = findTableBoundary(rows, dataFrom, hdrBand.x0, hdrBand.x1, dataBelowY, hdrLineH);
  let banded = bandDataRows(rows, anchors, kind, sheet.key, opts.buildings, { fromIdx: dataFrom, toIdx, belowY: dataBelowY, deltas: opts.deltas, headerSpans: fullHeaderSpans });
  // The wide scan maxed out without ever finding a real stop signal — see
  // findSparseKeyedBoundary's comment for why that alone (regardless of how
  // many rows the wide pass came back with — a wrong scan can find rows just
  // as easily as an empty one, exactly what happened here before this
  // existed) is reason enough to re-check with a boundary based on the
  // candidates' OWN pace rather than the cap. Only ever narrows: a tighter
  // boundary that turns up nothing is discarded in favor of the wide result.
  if (toIdx >= cap) {
    const nameKeyed = kind === "room-finish" && anchors[0]?.label === "NAME";
    const tightIdx = findSparseKeyedBoundary(rows, dataFrom, cap, hdrBand.x0, hdrBand.x1, dataBelowY, kind, opts.buildings, nameKeyed);
    if (tightIdx < toIdx) {
      const tightBanded = bandDataRows(rows, anchors, kind, sheet.key, opts.buildings, { fromIdx: dataFrom, toIdx: tightIdx, belowY: dataBelowY, deltas: opts.deltas, headerSpans: fullHeaderSpans });
      if (tightBanded.out.length > 0) { toIdx = tightIdx; banded = tightBanded; }
    }
  }
  const out = banded.out;
  const promotedHeaders = promoteLeadingEngineeringUnits(anchors.map((a) => a.label), out);
  anchors = anchors.map((anchor, i) => ({ ...anchor, label: promotedHeaders[i] }));
  if (banded.region) region = region ? merge(region, banded.region) : banded.region;
  // A real header WAS found and a real boundary WAS computed — but every
  // candidate row inside it turned out to be garbage once filtered (real,
  // found live: itd-d1-lab-mechanical.pdf#13's own "LAB EXHAUST FAN
  // SCHEDULE" candidate — a genuinely mis-bounded, non-real table whose
  // only two "rows", keyed "FAN"/"REMARKS", are both digit-free noise; the
  // relative garbage-row filter above correctly empties it). This is NOT
  // the same as "no header exists here at all" (findHeaderRow's own null,
  // still returned above) — returning a bare `null` here made
  // extractAllTables' own loop (which treats `!found` as "end of sheet")
  // stop scanning the ENTIRE REST of the sheet, silently dropping a real
  // table (the real "BYPASS CONTROL VALVE SCHEDULE") that sat right after
  // this empty one. `table: null` with a real `nextIdx` tells the caller
  // to skip this one candidate and keep scanning, not stop.
  if (!out.length) return { table: null, nextIdx: toIdx };
  const { x0, x1 } = bandLimits(anchors);
  // the table's title: the nearest "… SCHEDULE" span above the header WITHIN
  // the table's own x-band — on a dense sheet the neighbouring table's title
  // shares the y-band and must not label this one
  //
  // The lookback budget is spent only on rows that actually have a span in
  // THIS table's own x-band (ledger item 5, real bug found on itd-d1-lab-
  // mechanical.pdf#13's real "HUMIDIFIER SCHEDULE"): `rows` is built sheet-
  // WIDE, so on a dense sheet with a second table sitting to the LEFT (here,
  // the real "CONDENSING HOT WATER BOILER SCHEDULE" on the same sheet), that
  // other table's own sub-header/data rows interleave into the SAME row
  // indices between this table's real title and its header, purely by
  // y-coincidence, unrelated to this table's own x-band entirely. A raw
  // row-INDEX cap burns its whole budget on THOSE unrelated rows and never
  // reaches the real title 3 rows further up in x — confirmed exactly this
  // way, real numbers, not guessed: the real title sits 5 rows above the
  // header counting only rows with content in this table's own x-band, but
  // 8+ rows above it counting the sheet's full row list. Skipping (not
  // charging budget for) any row with nothing in [x0,x1] fixes this without
  // loosening the cap itself — a genuinely unrelated title still can't drift
  // in from this many REAL rows away within this table's own column band.
  //
  // Widened from 5 to 20 (real, corpus-found: itd-d1-lab-mechanical.pdf#12's
  // own "PRESSURE INDEPENDENT ROOM SUPPLY VALVE SCHEDULE", "…GENERAL EXHAUST
  // VALVE SCHEDULE" and "…SNORKEL EXHAUST VALVE SCHEDULE" tables). Each is a
  // genuinely deep multi-tier header — VALVE INLET→QUANTITY|SIZE, MINIMUM
  // DUCT VELOCITY (FPM), VALVE AIRFLOWS→MIN|MAX, VALVE AIRFLOW RANGE→MIN|MAX,
  // PRESSURE DROP (IN. W.C.)→MIN|MAX, INSTALLED POSITION, MANUFACTURER AND
  // MODEL — that findHeaderRow's own tier-descent settles on only the bottom
  // (SYMBOL/AREA SERVED/TYPE/REMARKS) tier for, well below where its own real
  // vocabulary anchors: none of VALVE/QUANTITY/SIZE/DUCT/PRESSURE/INSTALLED/
  // POSITION are in EQUIPMENT_HEADERS, so every one of those tiers' physical
  // sub-rows counts as its own in-band, non-title row against the budget —
  // measured directly against the real sheet, 9 real in-band rows separate
  // the settled anchor row from the real title, comfortably clearing the old
  // budget of 5. Still nowhere near "a genuinely unrelated title 20 real rows
  // away" territory the original design meant to guard against; the primary
  // pass below only ever takes a "…SCHEDULE" hit, and the FIRST (nearest)
  // one at that, so a second real schedule's own title sitting somewhere in
  // this wider window would only ever be reached if it were closer than this
  // table's own — never a wrong, distant grab.
  // Widened lookback, STAGE 1 (real, corpus-found: itd-d1-lab-mechanical.
  // pdf#12's own "PRESSURE INDEPENDENT ROOM SUPPLY VALVE SCHEDULE",
  // "…GENERAL EXHAUST VALVE SCHEDULE" and "…SNORKEL EXHAUST VALVE SCHEDULE"
  // tables, #13's own "DIFFUSER SCHEDULE"). Each is a genuinely deep multi-
  // tier header — VALVE INLET→QUANTITY|SIZE, MINIMUM DUCT VELOCITY (FPM),
  // VALVE AIRFLOWS→MIN|MAX, PRESSURE DROP (IN. W.C.)→MIN|MAX, NECK/RUNOUT,
  // INSTALLED POSITION, MANUFACTURER AND MODEL — that findHeaderRow's own
  // tier-descent settles on only the bottom tier for, well below where its
  // own real vocabulary anchors: none of VALVE/QUANTITY/SIZE/DUCT/PRESSURE/
  // NECK/RUNOUT/INSTALLED/POSITION are in EQUIPMENT_HEADERS, so every one of
  // those tiers' physical sub-rows counts as its own in-band, non-title row
  // against the ORIGINAL budget of 5 — measured directly against the real
  // sheet, 9 real in-band rows separate the settled anchor row from the
  // real title.
  //
  // The plain "nearest single-span/‘…SCHEDULE' row wins" rule this widened
  // reach would naturally want is NOT safe on its own here: real, corpus-
  // found regressions caught by this file's own test suite, both directions.
  //   - bessemer-mechanical-bidset.pdf#8's own "VARIABLE REFRIGERANT
  //     PACKAGED HEAT PUMP" table: its real title carries no "SCHEDULE"
  //     word, so a widened "…SCHEDULE"-only search walks straight past it
  //     (silently skipping every non-matching row) to a wholly UNRELATED,
  //     much farther table's own "DIFFUSER, GRILLE, REGISTER SCHEDULE" and
  //     wrongly takes that instead.
  //   - itd-d1-lab-mechanical.pdf#13's own "DIFFUSER SCHEDULE"/"RETURN &
  //     EXHAUST GRILLE SCHEDULE": a widened "nearest ANY single-span shape
  //     wins" search instead grabs "NECK / RUNOUT" — a real wrapped sub-
  //     header fragment shared by both tables, sitting BETWEEN each one's
  //     own real title and its settled anchor row, that happens to pass the
  //     fallback shape test (3 "words" once split on the slash) — before
  //     the walk ever reaches either table's own real, but farther, title.
  // The real discriminator, measured against every genuine caption in this
  // corpus: font size. A real title/caption consistently renders at ~2x a
  // header row's own token height (same signal the structural "reference"
  // kind's own title hunt already leans on, below); an ordinary sub-header
  // fragment, however title-shaped it happens to look, never does. So the
  // widened reach ONLY ever takes a match at BIG font — nearest first, either
  // signal — falling through to the ORIGINAL, unwidened (budget 5, "…
  // SCHEDULE" first, then fallback shape) two-pass search when nothing big
  // qualifies, exactly the proven-safe prior behavior for a table whose own
  // real title is normal-sized (VARIABLE REFRIGERANT PACKAGED HEAT PUMP)
  // or close enough to be found within 5 anyway.
  const TITLE_LOOKBACK_BUDGET = 20;
  const hdrHeights2 = headerSpans.map((t) => t.h || 8).sort((a, b) => a - b);
  const hdrH2 = hdrHeights2[hdrHeights2.length >> 1] || 8;
  const BIG_FONT_RATIO2 = 1.6;
  let title: Evidence | null = null;
  for (let i = titleFrom, budget = TITLE_LOOKBACK_BUDGET; i >= 0 && budget > 0 && !title; i--) {
    const inBand = rows[i].filter((t) => t.x >= x0 && t.x <= x1);
    if (!inBand.length) continue;
    budget--;
    const hit = inBand.find((t) => (/SCHEDULE/.test(norm(t.str)) || isReferenceOrSpecTable(t.str)) && (t.h || 8) >= hdrH2 * BIG_FONT_RATIO2);
    if (hit) { title = { sheet: sheet.key, text: hit.str.trim(), bbox: bboxOf(hit) }; break; }
    if (inBand.length !== 1) continue;
    const t = inBand[0];
    if ((t.h || 8) < hdrH2 * BIG_FONT_RATIO2) continue;
    const s = norm(t.str);
    if (!s || /\d/.test(s) || !/^[A-Z][A-Z .,'’&()/-]*$/.test(s)) continue;
    if (s.split(/\s+/).filter(Boolean).length < 3) continue;
    title = { sheet: sheet.key, text: t.str.trim(), bbox: bboxOf(t) };
  }
  // STAGE 2 — the original, unwidened search, untouched: exactly the prior
  // proven-safe behavior for a table whose own real title is normal-sized.
  if (!title) {
    for (let i = titleFrom, budget = 5; i >= 0 && budget > 0 && !title; i--) {
      const inBand = rows[i].filter((t) => t.x >= x0 && t.x <= x1);
      if (!inBand.length) continue;
      budget--;
      const hit = inBand.find((t) => /SCHEDULE/.test(norm(t.str)) || isReferenceOrSpecTable(t.str));
      if (hit) title = { sheet: sheet.key, text: hit.str.trim(), bbox: bboxOf(hit) };
    }
  }
  if (!title) {
    for (let i = titleFrom, budget = 5; i >= 0 && budget > 0 && !title; i--) {
      const inBand = rows[i].filter((t) => t.x >= x0 && t.x <= x1);
      if (!inBand.length) continue;
      budget--;
      if (inBand.length !== 1) continue;
      const t = inBand[0];
      const s = norm(t.str);
      if (!s || /\d/.test(s) || !/^[A-Z][A-Z .,'’&()/-]*$/.test(s)) continue;
      if (s.split(/\s+/).filter(Boolean).length < 3) continue;
      title = { sheet: sheet.key, text: t.str.trim(), bbox: bboxOf(t) };
    }
  }
  const table: ScheduleTable = { kind, sheet: sheet.key, title, headers: anchors.map((a) => a.label), rows: out, region: region!, anchors };
  if (rotated) table.rotated_headers = true;
  return { table, nextIdx: toIdx };
}

/** Extract one kind of table from a sheet's spans. Returns null when the
 * header structure isn't there — never invented rows. Horizontal header rows
 * are tried first; a sheet without one is re-tried against a rotated
 * (quarter-turn) header band. Finds only the FIRST table of `kind` on the
 * sheet — see `extractAllTables` for every table of a kind. */
export function extractTable(sheet: SheetSpans, kind: "room-finish" | "finish" | "equipment", opts: ExtractOpts = {}): ScheduleTable | null {
  return extractTableAt(sheet, kind, opts, 0)?.table ?? null;
}

const MAX_TABLES_PER_SHEET = 20;
const MAX_SIDE_TABLES_PER_WINDOW = 4;
/** A second (or third…) real table can sit SIDE BY SIDE with one just found
 * here, sharing the EXACT row-index window it consumed — real, corpus-found
 * on itd-d1-lab-mechanical.pdf: sheet M5.0's own "PRESSURE INDEPENDENT
 * SNORKEL EXHAUST VALVE SCHEDULE" (key SEV-1..5) sits beside that same
 * sheet's "EXHAUST FAN SCHEDULE" (key EF-1..6), and separately its
 * "PRESSURE INDEPENDENT GENERAL EXHAUST VALVE SCHEDULE" (GEV-1..7) shares a
 * header row with unrelated content further up the same column; sheet
 * M5.2's split-system furnace/condensing-unit table (key F-1) sits beside
 * that sheet's own ductless-split table (DFC-1/DCU-1), their header TIERS
 * genuinely interleaved row-by-row at the same y (confirmed directly:
 * "TOTAL"/"SENSIBLE"/"INPUT"/"OUTPUT", the furnace table's own header tier,
 * and the ductless table's own DFC-1 DATA row, land at the same clustered
 * row). `extractAllTables`'s own `fromIdx` is a plain row-index cursor with
 * no x-range concept — once a table is found, EVERY row index inside the
 * window it consumed is gone for good, even a row whose only real content
 * sits at a completely different x position the found table never actually
 * used. `bandedSheets`' own whole-sheet gap detection can't rescue this
 * either: the seam between two such schedules is LOCAL to one y-range, not
 * valid page-wide (the same x-range routinely carries other, wide tables
 * elsewhere on the sheet).
 *
 * This is the recovery pass, run once per table `extractAllTables` finds:
 * with that table's own x-band (`bandLimits` over its anchors — the exact
 * band its header/data extraction already treated as "mine") masked out of
 * the sheet's spans, retry the SAME window. Anything the mask left behind
 * is, by construction, content the found table never touched — so a header
 * hiding at the same row indices but a disjoint x-range can now be reached.
 *
 * `fromY`, not `fromIdx`: removing a whole x-band's worth of spans SHEET-
 * WIDE (not just within the found table's own row window — a column this
 * wide routinely carries other, unrelated rows far up or down the sheet)
 * changes how many rows `clusterRows` produces overall, so the ORIGINAL
 * row-index this table's own search resumed from no longer names the same
 * row (or any row at all) once the mask has run — real, corpus-found
 * live: itd-d1-lab-mechanical.pdf#14's own furnace/condensing-unit table
 * (key F-1) sits at a y that the unmasked sheet reaches around row-index
 * 111, but masking out the ductless-split table's own wide column collapses
 * enough unrelated rows sheet-wide that row-index 60 (where the search
 * should logically resume) no longer exists in the masked row list at
 * all — silently finding nothing, not because F-1 wasn't there, but
 * because the index pointing at it was never valid in the masked space to
 * begin with. Re-deriving the masked list's own starting row from a real Y
 * position (the first masked row at or after `fromY`) is index-count-
 * agnostic and always lands on the right row regardless of how much the
 * mask removed elsewhere on the sheet.
 *
 * Purely additive, never a source of duplicate tables: the retry only
 * accepts a candidate whose own header row sits STRICTLY BEFORE
 * `boundaryY` — the y-position `extractAllTables`' own next iteration will
 * resume scanning from on the UNMASKED sheet. A header at or past that line
 * is already reachable by the ordinary forward scan on its own next
 * iteration; taking it here too would duplicate it. Recurses (bounded by
 * MAX_SIDE_TABLES_PER_WINDOW) so a third table sharing the same window is
 * also reachable, masking every x-band already recovered so far. */
function extractSideTables(
  sheet: SheetSpans,
  kind: "room-finish" | "finish" | "equipment",
  opts: ExtractOpts,
  fromY: number,
  boundaryY: number,
  excludeBands: Array<{ x0: number; x1: number }>,
): ScheduleTable[] {
  if (excludeBands.length > MAX_SIDE_TABLES_PER_WINDOW) return [];
  const masked: SheetSpans = {
    ...sheet,
    spans: sheet.spans.filter((t) => {
      if (isVertical(t)) return true; // rotated headers: untouched, out of scope here
      const cx = centerX(t);
      return !excludeBands.some((b) => cx >= b.x0 && cx <= b.x1);
    }),
  };
  const maskedRows = clusterRows(masked.spans.filter((t) => !isVertical(t)));
  const maskedFromIdx = maskedRows.findIndex((r) => rowY(r) >= fromY - 0.5);
  if (maskedFromIdx < 0) return [];
  const found = extractTableAt(masked, kind, opts, maskedFromIdx);
  if (!found || !found.table || !found.table.anchors) return [];
  // The candidate's own header must have actually sat inside the window the
  // already-found table just consumed — not somewhere further down the
  // sheet the ordinary forward scan will reach on its own, later, unmasked.
  if (found.table.region[1] >= boundaryY) return [];
  const band = bandLimits(found.table.anchors);
  const rest = extractSideTables(sheet, kind, opts, fromY, boundaryY, [...excludeBands, { x0: band.x0, x1: band.x1 }]);
  return [found.table, ...rest];
}

/** Every table of `kind` on a sheet, not just the first — a dense MEP sheet
 * routinely stacks several schedules in the same column grid (this
 * project's own sample: seven, on one sheet). Repeatedly finds the next
 * table past where the previous one's boundary (`findTableBoundary`) said
 * it ended, capped at MAX_TABLES_PER_SHEET as a sanity backstop, not a
 * realistic limit. */
export function extractAllTables(sheet: SheetSpans, kind: "room-finish" | "finish" | "equipment", opts: ExtractOpts = {}): ScheduleTable[] {
  const out: ScheduleTable[] = [];
  let fromIdx = 0;
  for (let n = 0; n < MAX_TABLES_PER_SHEET; n++) {
    const found = extractTableAt(sheet, kind, opts, fromIdx);
    if (!found) break;
    // A real header/boundary was found but every row inside it was
    // filtered as garbage (extractTableAt's own `table: null` case, see its
    // comment) — skip this one candidate and keep scanning the rest of the
    // sheet, rather than stopping as if nothing more were there.
    if (found.table) {
      out.push(found.table);
      // See extractSideTables' own comment: a second table can hide in the
      // exact row-index window this one just consumed, at a disjoint
      // x-range. `boundaryY` is where the ordinary forward scan resumes on
      // the UNMASKED sheet — the retry may only recover a table whose own
      // header sits strictly before it.
      if (found.table.anchors) {
        const rows = clusterRows(sheet.spans.filter((t) => !isVertical(t)));
        const fromY = fromIdx < rows.length ? rowY(rows[fromIdx]) : Infinity;
        const boundaryY = found.nextIdx < rows.length ? rowY(rows[found.nextIdx]) : Infinity;
        const band = bandLimits(found.table.anchors);
        out.push(...extractSideTables(sheet, kind, opts, fromY, boundaryY, [{ x0: band.x0, x1: band.x1 }]));
      }
    }
    if (found.nextIdx <= fromIdx) break; // never loop without forward progress
    fromIdx = found.nextIdx;
  }
  return out;
}

/** Extract equipment schedules drawn as an entire quarter-turned table.
 * Rotating only vertical text into a temporary coordinate space lets the
 * normal multi-table extractor retain all of its header, boundary, and
 * refusal rules. Evidence boxes are mapped back to the source sheet. */
export function extractAllQuarterTurnedTables(
  sheet: SheetSpans,
  opts: ExtractOpts = {},
): ScheduleTable[] {
  const vertical = sheet.spans.filter(isVertical);
  if (vertical.length < 8) return [];
  const pivot = Math.max(...vertical.map((span) => span.x + (span.w || 0)));
  const turned: SheetSpans = {
    key: sheet.key,
    sheet_number: sheet.sheet_number,
    spans: vertical.map((span) => ({
      str: span.str,
      x: span.y,
      y: pivot - span.x - (span.w || 0),
      w: span.h || 0,
      h: span.w || 0,
      rot: 0,
    })),
  };
  const restore = ([x0, y0, x1, y1]: Bbox): Bbox =>
    [pivot - y1, x0, pivot - y0, x1];
  return extractAllTables(turned, "equipment", opts).map((table) => ({
    ...table,
    rotated_headers: true,
    anchors: undefined,
    region: restore(table.region),
    title: table.title ? { ...table.title, bbox: restore(table.title.bbox) } : null,
    rows: table.rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(Object.entries(row.cells).map(([label, cell]) =>
        [label, { ...cell, bbox: restore(cell.bbox) }])),
    })),
  }));
}

// ── structural (vocabulary-free) reference/calculation tables ──────────────
// The three kinds above all gate a header row on a FIXED vocabulary of
// expected column words. Real, found live (full-coverage-standard work, this
// session): bessemer M601's own DUCTWORK INSULATION SCHEDULE (SYSTEM TYPE /
// INSULATION TYPE / INSULATION OR LINER THICKNESS) and DUCTWORK INSULATION
// TYPE SCHEDULE (INSULATION TYPE / DESCRIPTION) name NONE of ROOM_HEADERS'/
// FINISH_HEADERS'/EQUIPMENT_HEADERS' words and have no per-instance drawn-
// symbol tag at all — real reference/calculation tables, keyed by SYSTEM
// TYPE or INSULATION TYPE rather than a tag a symbol_sweep could ever chase.
// The user's own stated goal — "pull ANY INFORMATION out of these sets" —
// means a fixed word list will always miss the next firm's own vocabulary,
// so this kind is detected STRUCTURALLY: a real ruled/bordered header row of
// short, ALL-CAPS, digit-free cells, sitting close to real data rows that
// band to the same columns, is a table regardless of what words its headers
// use. Named "reference" (not "unknown") — these tables are real, their data
// is real and captured, they just answer a different question than a
// per-instance-tagged equipment schedule does.
//
// A hard, real design question, not hand-waved: how does a vocabulary-free
// "is this a header row" test avoid false-positiving on ordinary prose, a
// keynote/note-block list, or a title block — the exact failure modes
// isNonFinishSchedule/the garbage-row filtering above were built to prevent
// for the OTHER three kinds, none of which had to solve this without a word
// list to lean on? Three structural signals, all measured against this real
// corpus (sheetgraph.test.ts's own negative-control fixtures + the corpus-
// wide sweep — see the comment on `hasNearbyRuledLine`):
//   1. Shape — a real header row is SEVERAL short (<=60 char), ALL-CAPS,
//      digit-free, non-prose cells on one line (headerToken/headerRow below)
//      — never a single continuous sentence (real running prose in this
//      project's own text-extraction pipeline coalesces into ONE span per
//      line; REFERENCE_RE's lead-in words and LABEL_VALUE_COLON_RE's
//      "label: value" field-prose shape, both already proven live for the
//      OTHER three kinds' own false-positive defenses, are reused as-is).
//   2. A real ruled border nearby — this sheet's own vector segments
//      (SheetSpans.segs), when supplied: every real table this pass targets
//      in the corpus is drawn boxed (confirmed by direct render); an
//      ordinary note/keynote list carries no such rule. See
//      `hasNearbyRuledLine`.
//   3. Repeated column alignment — the header's own columns must actually
//      explain 1+ real DATA rows below (bandGenericDataRows) with a genuine
//      minimum-population floor; a header-shaped row with nothing real
//      below it is refused, exactly like extractTableAt's own
//      `table: null, nextIdx` convention for the other three kinds.
// Scoped to schedule-ROLE sheets only (buildSheetGraph's own existing
// per-sheet role classification) — every real instance found in this corpus
// lives on a schedule sheet, and a plan sheet (dense with title-block text,
// dimension strings, general-notes lists) is exactly where this heuristic's
// false-positive risk concentrates. A reference table drawn on a plan sheet
// is a real, disclosed scope limit this pass will not find — not assumed to
// not exist, just not chased without real corpus evidence it happens.
//
// A THIRD real bessemer M601 table this session's own standing mandate named
// — "VENTILATION CALCULATION SCHEDULE" — is a genuinely DIFFERENT, real
// blocker, confirmed by direct investigation (not assumed): the whole 8-page
// document's own pdf.js text content carries ZERO spans anywhere in that
// table's region, and a tight render-region zoom (10x native page
// resolution) shows crisp, non-pixelated glyph edges — its text was
// authored as vector glyph OUTLINES (filled paths), not encoded characters,
// so pdf.js's text layer has nothing there at all. No amount of header-
// detection logic — vocabulary-gated or the structural pass below — can see
// a table with zero text spans; this is a real OCR/vision-only gap (closer
// to session.ts's own existing raster-schedule disclosure, rasterScheduleNotes,
// than to anything this file's span-based machinery can close) and is
// deliberately left named rather than forced. See mcp/test or the session
// report for how this was confirmed.
const MAX_GENERIC_HEADER_LINES = 6;
const GENERIC_MAX_TOKEN_LEN = 60;

/** A single header CELL, vocabulary-free: short, real letters, drafting
 * CAPS (this project's own convention — real running prose in this
 * extraction pipeline is lower/mixed-case or coalesces to one long span),
 * not a "SEE ALSO…"-style reference lead-in, not "label: value" field prose
 * (both already proven real false-positive defenses for the other three
 * kinds, reused verbatim). Digit-freeness is checked by the row test below,
 * not here — harvestSkippedTierAnchors' own real precedent (a table's
 * columns can legitimately be walked with parenthesized DIGIT-bearing unit
 * fragments) means a single token containing a digit is not on its own
 * disqualifying; a header ROW's own digit-freeness (checked once, together)
 * is the real, corpus-measured signal — see isGenericHeaderRow. */
function isGenericHeaderToken(raw: string): boolean {
  const s = (raw || "").trim();
  if (!s || s.length > GENERIC_MAX_TOKEN_LEN) return false;
  if (/[a-z]/.test(s)) return false;
  if (!/[A-Z]/.test(s)) return false;
  if (REFERENCE_RE.test(norm(s))) return false;
  if (LABEL_VALUE_COLON_RE.test(s)) return false;
  return true;
}
/** A header-shaped ROW: 2+ real cells (a lone single-span line is a title or
 * a note, never a header on its own — every real header measured in this
 * corpus has 2+ columns), every one shape-qualified AND digit-free. Real
 * header labels in this corpus never carry a digit; real DATA rows
 * routinely do (a tag, an ASTM spec number, a dimension) — checked once per
 * row (not per token) so a row that mixes a clean label with a digit-
 * bearing value (the exact shape of this table's own real data rows) is
 * never mistaken for more header. */
function isGenericHeaderRow(row: GraphSpan[]): boolean {
  const toks = row.filter((t) => t.str && t.str.trim() && revisionOf(t.str) == null);
  if (toks.length < 2) return false;
  return toks.every((t) => isGenericHeaderToken(t.str) && !/\d/.test(t.str));
}

interface GenericHeaderBlock { top: number; bottom: number; tokens: GraphSpan[] }

/** A real header is routinely wrapped over several physical lines (bessemer's
 * own DUCTWORK INSULATION SCHEDULE: 5 lines — "INSULATION OR" / "INSULATION"
 * / "SYSTEM TYPE" + "LINER" / "TYPE" / "THICKNESS"), and the tier that first
 * clears the 2-cell bar (isGenericHeaderRow) is not always the block's own
 * TOP tier — real, measured: "SYSTEM TYPE"+"LINER" both sit on the SAME
 * physical line, one row below "INSULATION"/"INSULATION OR" (its column's
 * own parent words). Expands BOTH directions from that anchor row, one
 * physical line at a time, while each candidate line: is itself shape-
 * qualified + digit-free (a lone wrapped word, "TYPE", is a valid single-
 * token continuation — isGenericHeaderRow's own 2-cell floor does not apply
 * here, only the per-token shape+digit tests do), sits within 2x the
 * anchor row's own median cell height of the block's current edge (a title
 * sitting one line above a real header can measure a smaller physical gap
 * than that — real, measured live: 34.8px vs this table's own header-
 * internal gaps of 10.9-22.6px — so this alone is not the whole guard), and
 * — the real title-vs-header-tier discriminator — is NOT a single token
 * wider than 2x the anchor row's own median cell width (a real column's own
 * wrapped tier is a short 1-2-word fragment; a real title is one long
 * multi-word run spanning close to the whole table's width — measured live,
 * 342px vs this table's own 57-148px continuation tiers). */
function expandGenericHeaderBlock(rows: GraphSpan[][], anchorIdx: number): GenericHeaderBlock {
  const anchorToks = rows[anchorIdx].filter((t) => t.str && t.str.trim() && revisionOf(t.str) == null);
  const widths = anchorToks.map((t) => t.w || 8).sort((a, b) => a - b);
  const medW = widths[widths.length >> 1] || 8;
  const heights = anchorToks.map((t) => t.h || 8).sort((a, b) => a - b);
  const medH = heights[heights.length >> 1] || 8;
  const widthCap = Math.max(160, medW * 2);
  const rowOk = (r: GraphSpan[]): boolean => {
    const toks = r.filter((t) => t.str && t.str.trim() && revisionOf(t.str) == null);
    if (!toks.length) return false;
    if (!toks.every((t) => isGenericHeaderToken(t.str) && !/\d/.test(t.str))) return false;
    if (toks.length === 1 && (toks[0].w || 0) > widthCap) return false;
    return true;
  };
  let top = anchorIdx, bottom = anchorIdx;
  for (let n = 0; n < MAX_GENERIC_HEADER_LINES && top > 0; n++) {
    const cand = rows[top - 1];
    if (!rowOk(cand)) break;
    if (rowY(rows[top]) - rowY(cand) > medH * 2) break;
    top--;
  }
  for (let n = 0; n < MAX_GENERIC_HEADER_LINES && bottom < rows.length - 1; n++) {
    const cand = rows[bottom + 1];
    if (!rowOk(cand)) break;
    if (rowY(cand) - rowY(rows[bottom]) > medH * 2) break;
    bottom++;
  }
  const tokens = rows.slice(top, bottom + 1).flat().filter((t) => t.str && t.str.trim() && revisionOf(t.str) == null);
  return { top, bottom, tokens };
}

const GENERIC_COLUMN_GAP_FACTOR = 5;
// A real wrapped column header accumulates a HANDFUL of its own fragments
// (this corpus's deepest real example, INSULATION OR LINER THICKNESS: 3) —
// a cluster with many more tokens than that is not a wrapped label at all,
// it is the SAME x-position repeating across many INDEPENDENT physical
// rows, the real shape of a legend/abbreviations list ("AFF" / "CFM" / …,
// one per line, each row its own complete code+definition pair) rather
// than one header wrapping. Caught live, adversarially, before this
// shipped: expandGenericHeaderBlock's own multi-token-row absorption (no
// width cap — only single-token continuation lines are width-capped) has
// no bound on how many INDEPENDENT rows of a genuine 2-column list it will
// swallow as "more header tiers" before its own MAX_GENERIC_HEADER_LINES
// cap kicks in — past that cap, the list's own REMAINING rows read as
// ordinary data rows (multi-token, so bandGenericDataRows' own new-row gap
// floor never even applies) and the whole list extracts as a fake table.
// This is the real, decisive structural signal that separates the two
// shapes — checked here, once, rather than trying to patch every
// downstream consumer of a bad column set.
const MAX_GENERIC_COLUMN_DEPTH = 4;
/** Column anchors from a header BLOCK's own tokens, vocabulary-free: single-
 * linkage x-proximity clustering (sort by center-x, start a new cluster when
 * the gap exceeds tol) over the WHOLE block's tokens at once — deliberately
 * NOT an incremental "does this new line attach to what's collected so far"
 * walk (tried first, reverted): a column's own wrapped tiers can straddle
 * the anchor row on EITHER side ("INSULATION" above, "TYPE" below, both
 * belonging to the same "INSULATION TYPE" column split by the anchor row
 * sitting between them) and an incremental, order-dependent walk misses the
 * transitive link. A one-shot clustering pass has no such ordering
 * dependency. `tol` is derived from the block's own median cell height (the
 * same h-scaled-constant idiom this file already uses throughout, e.g.
 * anchorRadii/parentLabelOver's own `near`) — real intra-column gaps
 * measured on this corpus (26-46px) sit well under it, real inter-column
 * gaps (163-512px) well over. Each cluster's label is its own tokens' text,
 * ordered top-to-bottom then left-to-right and space-joined — "INSULATION"
 * + "TYPE" becomes "INSULATION TYPE", matching the real printed header.
 * Returns [] (never a partial/wrong read) when any cluster is too deep —
 * see MAX_GENERIC_COLUMN_DEPTH's own comment; the caller reads an empty
 * result the same way it reads "fewer than 2 columns", refusing the whole
 * candidate. */
function clusterGenericColumnsOnce(tokens: GraphSpan[]): Anchor[] | null {
  if (!tokens.length) return [];
  const heights = tokens.map((t) => t.h || 8).sort((a, b) => a - b);
  const h = heights[heights.length >> 1] || 8;
  const tol = Math.max(60, h * GENERIC_COLUMN_GAP_FACTOR);
  const sorted = tokens.slice().sort((a, b) => centerX(a) - centerX(b));
  const clusters: GraphSpan[][] = [];
  for (const t of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && centerX(t) - centerX(last[last.length - 1]) <= tol) last.push(t);
    else clusters.push([t]);
  }
  if (clusters.some((c) => c.length > MAX_GENERIC_COLUMN_DEPTH)) return null;
  const out: Anchor[] = [];
  const used = new Set<string>();
  for (const c of clusters) {
    const ordered = c.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const label = ordered.map((t) => norm(t.str)).join(" ").replace(/\s+/g, " ").trim();
    if (!label) continue;
    let final = label, i = 2;
    while (used.has(final)) final = `${label} (${i++})`;
    used.add(final);
    const cx = c.reduce((s, t) => s + centerX(t), 0) / c.length;
    out.push({ label: final, x: cx });
  }
  return out.sort((a, b) => a.x - b.x);
}

// A group-spanning header cell (real, common MEP-schedule convention: "COIL
// SIZE DATA" over LENGTH/HEIGHT, "WATERSIDE DATA" over EWT/LWT/FLOW/WATER
// MAX PD, all corpus-found on federal-attachment4-mechanical.pdf#14's own
// AIR HANDLING UNIT HYDRONIC COIL SCHEDULE) sits, by drafting convention,
// on its OWN tier ABOVE the several narrower leaf columns it names, roughly
// CENTERED over them. Left in the same single-linkage pass as its own leaf
// children, its centerX lands near the MIDPOINT between two adjacent leaf
// columns — close enough to bridge clusters that the leaf columns' own
// pitch alone would have kept correctly separate (measured live: a real
// per-column pitch of 144 units against this table's own tol of ~126 keeps
// every ordinary adjacent pair apart, but a spanning label's own half-gap
// to each neighboring cluster is roughly HALF that pitch — well under tol
// on both sides at once). A 4-column-wide spanning label centers between
// its own 2nd and 3rd columns and can bridge THOSE into one over-deep
// chain (real, measured: WATERSIDE DATA bridged [LWT,°F] to [FLOW,GPM],
// tripping MAX_GENERIC_COLUMN_DEPTH and discarding the whole header).
const GENERIC_SPAN_WIDTH_RATIO = 1.6;
function clusterGenericColumns(tokens: GraphSpan[]): Anchor[] {
  const primary = clusterGenericColumnsOnce(tokens);
  if (primary) return primary;
  // Retried ONLY when the plain pass already hit the depth cap — every
  // block that clustered cleanly before is completely unaffected (same
  // tokens, same clusters, same output). A genuine legend/abbreviations
  // list (the depth cap's own original target) has no wide top-tier
  // spanning label to drop, so the retry changes nothing there either and
  // correctly still returns [] below.
  if (!tokens.length) return [];
  const minY = Math.min(...tokens.map((t) => t.y));
  const heights = tokens.map((t) => t.h || 8).sort((a, b) => a - b);
  const h = heights[heights.length >> 1] || 8;
  const widths = tokens.map((t) => t.w || 8).sort((a, b) => a - b);
  const medW = widths[widths.length >> 1] || 8;
  // "Topmost tier" (within one line-height of the block's own minimum Y) —
  // every real spanning label measured in this corpus sits on the block's
  // own top tier, never sharing a physical line with the leaf columns it
  // would otherwise bridge. A standalone wide LEAF column (a real, if
  // unusual, single long header word with no group affiliation) normally
  // sits on the SAME tier as its own short siblings, so it is untouched by
  // this check; only a token BOTH unusually wide AND isolated on the
  // topmost tier is treated as a spanning label to drop from the retry.
  const isSpanning = (t: GraphSpan) => t.y - minY <= h * 0.6 && (t.w || 0) > medW * GENERIC_SPAN_WIDTH_RATIO;
  const leaves = tokens.filter((t) => !isSpanning(t));
  if (leaves.length === tokens.length) return [];   // nothing to drop — same failure either way
  return clusterGenericColumnsOnce(leaves) ?? [];
}

/** A horizontal rule spanning most of the header block's own width, sitting
 * close to it (real design signal #2, the mandate's own suggestion) — the
 * structural "this is a genuinely ruled/boxed table, not a note block"
 * check: every real table this pass targets in the corpus is drawn boxed
 * (direct render, bessemer M601), while an ordinary GENERAL NOTES/KEYNOTES
 * list on a real plan sheet is not (measured live: raw nearby-segment COUNT
 * is a noisy, unreliable signal on a dense plan sheet — incidental drawing
 * linework routinely sits near a notes block purely by proximity — but a
 * genuinely WIDE horizontal rule spanning the block's own column width is
 * not incidental clutter). `segs` absent (a text-only caller) skips this
 * gate entirely rather than refuse — the same graceful-degradation posture
 * this file already takes elsewhere; the shape + repeated-column-alignment
 * signals still apply on their own. */
function hasNearbyRuledLine(segs: ArrayLike<number> | undefined, x0: number, x1: number, y0: number, y1: number): boolean {
  if (!segs || !segs.length) return true;
  const width = x1 - x0;
  if (!(width > 0)) return false;
  const pad = Math.max(20, y1 - y0);
  const nSeg = Math.floor(segs.length / 4);
  for (let i = 0; i < nSeg; i++) {
    const sx0 = segs[i * 4], sy0 = segs[i * 4 + 1], sx1 = segs[i * 4 + 2], sy1 = segs[i * 4 + 3];
    if (Math.abs(sy1 - sy0) > 2) continue;
    const my = (sy0 + sy1) / 2;
    if (my < y0 - pad || my > y1 + pad) continue;
    const overlap = Math.min(sx1, x1) - Math.max(sx0, x0);
    if (overlap >= width * 0.6) return true;
  }
  return false;
}

/** Does `row`, banded to [x0,x1], look like the START of some OTHER table —
 * the generic analog of looksLikeNewHeader, reused as this pass's own table-
 * boundary stop signal so an earlier reference table's data scan can never
 * run into a LATER table's own header (real, measured: bessemer M601 stacks
 * DUCTWORK INSULATION SCHEDULE directly above the ELECTRIC WALL HEATER
 * SCHEDULE in an overlapping x-band). */
// Tested on the row's OWN full token set, not pre-banded to [x0,x1] — real,
// corpus-found bug: a LATER stacked table's own header can have HALF its
// columns sit outside an EARLIER table's (narrower) x-band (real, measured:
// DUCTWORK INSULATION TYPE SCHEDULE's own "INSULATION"/"DESCRIPTION" header,
// banded to DUCTWORK INSULATION SCHEDULE's own x-band, loses "INSULATION"
// entirely and the lone surviving "DESCRIPTION" token fails the 2+-cell
// header-row bar) — so a pre-banded test misses it, and the earlier table's
// own data scan runs straight into the later table's real rows, merging two
// distinct tables into one. Testing the FULL row for header-shape first,
// then requiring only that SOME token of it lands inside this table's own
// x-band, catches this — a real DATA row of the table being scanned never
// trips it (every one measured contains a digit somewhere and fails
// isGenericHeaderRow's own digit-free requirement, or is a lone single-
// token wrapped continuation line and fails its 2+-cell floor).
function looksLikeGenericNewHeader(row: GraphSpan[], x0: number, x1: number): boolean {
  if (!isGenericHeaderRow(row)) return false;
  return row.some((t) => t.str && t.str.trim() && revisionOf(t.str) == null && centerX(t) >= x0 && centerX(t) <= x1);
}

/** The KEY column's own x-position and tolerance, derived once from the
 * anchor set — the same formula bandGenericDataRows already used inline,
 * hoisted so findGenericTableBoundary's own boundary check (below) can test
 * the identical key-column band rather than drifting out of sync with it. */
function keyColumnBand(anchors: Anchor[]): { x: number; tol: number } {
  const x = anchors[0].x;
  const tol = anchors.length > 1 ? Math.max(40, (anchors[1].x - anchors[0].x) / 2) : 60;
  return { x, tol };
}

// A bare numbered/lettered OUTLINE marker — "1.", "2.1.", "2.1.1.", "a.",
// "A.", "1)" — the leading glyph run of an ENUMERATED PROSE list (a real,
// corpus-found drafting convention: a "SEQUENCE OF OPERATION" or "REMARKS"
// specification block, its numbering column visually left-aligned the exact
// same way a real table's key column is), never a real reference-table row
// key in this corpus. Every real key measured here is drawn from a firm's
// own tag/code vocabulary (D-1, S-1, RP-2 — always letter(s)+HYPHEN+digit,
// never bare digits) or a short noun phrase (SUPPLY DUCTS (EXTERNALLY
// INSULATED), ASPHALT LAB 117) — never a bare counting token with no hyphen
// and no other word. Real, corpus-found false positive this catches:
// itd-d1-lab-mechanical.pdf's own dense, columned SEQUENCE OF OPERATION
// prose (sheets #20/#21) is laid out as a numbered/lettered outline, one
// physical PDF text span per marker ("1." as its own separate run from the
// sentence that follows it) — genericRowKeyOf's own shape regex (built to
// admit a real key's parens/digits/hyphens) happily accepted a bare "1." or
// "a." as a "key", and the row's own long sentence-fragment text banded into
// the nearest data column exactly like a real row would, mining dozens of
// fake "table rows" (and, worse, fake whole TABLES with every row so keyed)
// out of running prose. Checked ONLY at the row's own KEY-COLUMN position
// (keyColumnBand — the same band bandGenericDataRows itself keys new rows
// against) — a real data CELL mid-sentence that happens to reference "1)"
// as an option number, sitting in some OTHER column, must never trip this.
const GENERIC_OUTLINE_MARKER_RE = /^(\d{1,2}(\.\d{1,2}){0,3}\.?|[A-Za-z]\.|\d{1,2}\))$/;

function isGenericOutlineMarkerRow(row: GraphSpan[], keyColX: number, keyTol: number): boolean {
  const toks = row.filter((t) => t.str && t.str.trim() && revisionOf(t.str) == null);
  if (!toks.length) return false;
  const first = toks[0];
  if (Math.abs(centerX(first) - keyColX) > keyTol) return false;
  return GENERIC_OUTLINE_MARKER_RE.test(norm(first.str));
}

function findGenericTableBoundary(rows: GraphSpan[][], dataFrom: number, x0: number, x1: number, anchors: Anchor[]): number {
  const cap = Math.min(rows.length, dataFrom + MAX_TABLE_SCAN_ROWS);
  const { x: keyColX, tol: keyTol } = keyColumnBand(anchors);
  for (let i = dataFrom; i < cap; i++) {
    if (looksLikeGenericNewHeader(rows[i], x0, x1)) return i;
    // An outline-marker row (see GENERIC_OUTLINE_MARKER_RE) is not merely
    // skipped/orphan-folded like an ordinary shape-rejected key — it is
    // treated as the real end of THIS table, the same way a later table's
    // own header is: real Sequence-of-Operation/Remarks prose runs for many
    // physical lines after its first marker, and letting the scan continue
    // past it (as a plain reject-and-continue) leaves every later prose line
    // free to still orphan-fold into the last real accepted row, or to
    // re-qualify as its own new row if it happens to re-align — corpus-found
    // live on itd-d1-lab-mechanical.pdf#20's own real small valve table,
    // whose data scan ran straight into the sheet's own prose block below it
    // before this check existed.
    if (isGenericOutlineMarkerRow(rows[i], keyColX, keyTol)) return i;
  }
  return cap;
}

// A generous, vocabulary-free row-key shape: any real short phrase or code
// (letters/digits/space and the narrow punctuation a real SYSTEM TYPE/
// INSULATION TYPE key column carries in this corpus — parens, comma, slash,
// hyphen, quote-mark for inch-marks). Not CODE_RE/NAME_KEY_RE (both typed
// to the other three kinds' own real conventions) — a reference table's key
// column has no single known shape across firms (a short code, "D-1", or a
// long phrase, "SUPPLY DUCTS (EXTERNALLY INSULATED)", both real, same
// corpus, same session).
//
// "$" and "#" are both admitted (first-char and body) alongside the rest —
// real, corpus-found (baker-county-eoc's own LIGHTING CONTROL STATIONS
// table, sheet E6.01): a lighting-control zone/override designation is
// routinely tag-prefixed "$OS"/"$OSD"/"$LVA"/"$LVB"/"$LVC" or suffixed
// "$LV#", a real firm convention, not this corpus's own invention. Before
// this, EVERY one of those 6 real row keys failed this shape (the bare
// "$"/"#" glyph sat outside the allowed class entirely), so the row-key
// column read as blank on every physical line of that table — the scan
// then fell back to whatever OTHER column's own short value happened to
// key-shape-match and column-align instead ("ALL"/"a"/"b", the ZONES
// CONTROLLED column's own values), corrupting the table's real row
// identity into duplicate, non-designation keys. Purely additive — a
// string that already matched still matches identically.
const GENERIC_KEY_RE = /^[A-Z0-9$#][A-Z0-9 .,'"&()/%°∅Ø:+$#-]{0,99}$/;

function genericRowKeyOf(raw: string, headerLabels: Set<string>): string | null {
  const s = (raw || "").trim();
  if (!s || s.length > 100) return null;
  const u = norm(s).replace(/\s+/g, " ");
  if (REFERENCE_RE.test(u)) return null;
  if (headerLabels.has(u)) return null;
  // The SAME real false-positive shape headerHits already guards against
  // for the finish kind (LABEL_VALUE_COLON_RE's own comment: a real
  // free-text FINISH LEGEND's field-label prose, "MANUFACTURER: ALTRO
  // TEGULIS", "COLOR: MOON ROCK 29") — corpus-found live on this exact
  // pass too (baker-county-eoc-bidset.pdf#27's own real FINISH LEGEND,
  // sitting beside the real ROOM FINISH SCHEDULE that vocabulary guard was
  // built for): a genuine reference-table row key is never a "label:
  // value" fragment. GENERIC_KEY_RE's own colon allowance exists for a
  // genuine WITHIN-CELL value shape ("1'-6\":", a real dimension) — this
  // is checked separately, on the KEY specifically, so that allowance
  // stays intact for non-key cells.
  if (LABEL_VALUE_COLON_RE.test(s)) return null;
  if (!GENERIC_KEY_RE.test(u)) return null;
  return s;
}

/** Data-row banding for the structural "reference" kind — reuses this
 * file's own generic column-banding primitives (bandLimits/nearestAnchor/
 * anchorRadii/farFromCell's shape, all already Anchor[]-typed with zero
 * vocabulary coupling) rather than duplicating them, but keeps its OWN row-
 * acceptance/orphan-fold logic: the other three kinds' key values never wrap
 * across physical lines, so bandDataRows never had to solve "a candidate
 * key-column-aligned LINE might be a genuine new row, or it might be the
 * SAME row's own key cell wrapping back to the column's left edge on its
 * 2nd physical line" — real, measured live on DUCTWORK INSULATION SCHEDULE's
 * own EXHAUST DUCTS row: "EXHAUST DUCTS WITHIN 10 FEET OF EXTERIOR" wraps to
 * a 2nd line, "OPENINGS", which lands back at the SAME key-column x as any
 * genuine new row's own leading token would.
 *
 * The real, corpus-measured discriminator (not a hand-picked constant): the
 * table's OWN median physical-line-to-line gap, computed once from EVERY
 * consecutive row-cluster in the scanned range (not just keyed ones) — a
 * wrapped cell's own internal line pitch (10-11px, measured) is reliably
 * tighter than a genuine row-to-row gap (25.7px, measured) on the SAME real
 * table, even though the table has only 2-3 real rows total (too few to
 * trust a `findSparseKeyedBoundary`-style running pace over KEYED rows
 * alone). A single-token candidate line is accepted as a genuine new row
 * only when its own gap since the previous accepted row is at least 2x that
 * median-line-gap baseline (or when it carries 2+ cells of its own, or is
 * the table's first row) — a real new row's own leading line, in both real
 * target tables measured, clears this; a wrapped continuation line does
 * not. A candidate that fails this check is not dropped — it is queued as
 * an ORPHAN and folds into the nearest already-accepted row exactly like
 * any other orphan below, so its text still lands in the right cell. */
function bandGenericDataRows(
  rows: GraphSpan[][], anchors: Anchor[], sheetKey: string,
  cfg: { fromIdx: number; toIdx: number },
): { out: TableRow[]; region: Bbox | null } {
  const { x0, x1 } = bandLimits(anchors);
  const headerLabelSet = new Set(anchors.map((a) => norm(a.label)));
  // No anchorRadii here, deliberately — that mechanism (built for the other
  // three kinds) assumes a column's real data sits close to its own
  // HEADER's x-position, with only WIDE_LAST/NAME columns earning a wide
  // reach. A reference table's own KEY column routinely holds a long phrase
  // (real, measured: SYSTEM TYPE's "SUPPLY DUCTS (EXTERNALLY INSULATED)"
  // sits 130px from its own short "SYSTEM TYPE" header word's center,
  // farther than anchorRadii's own inflation cap allows) — capping it wrongly
  // dropped the key column's own text entirely, a real, corpus-found bug.
  // Every OTHER real defense here (keyColX alignment, the min-population
  // floor) already guards against a genuinely un-modeled column's data
  // bleeding into an unrelated cell, so this pass does not need radii's own
  // narrower protection on top.
  const { x: keyColX, tol: keyTol } = keyColumnBand(anchors);

  // The table's own median PHYSICAL line-to-line gap — restricted to rows
  // that actually carry a token in this table's own [x0,x1] band (real,
  // corpus-found bug: the unrestricted whole-sheet gap set is badly diluted
  // by unrelated debris between this table's real data and the next real
  // stop signal — bessemer's own DUCTWORK INSULATION SCHEDULE scans past a
  // revision-triangle row, a different table's title, and its header before
  // reaching the real ELECTRIC WALL HEATER SCHEDULE stop, none of them
  // relevant to THIS table's own real line pitch). In-band-only keeps the
  // baseline a real measure of this table's own content density.
  const inBandY: number[] = [];
  for (let i = cfg.fromIdx; i < cfg.toIdx; i++) {
    if (rows[i].some((t) => centerX(t) >= x0 && centerX(t) <= x1)) inBandY.push(rowY(rows[i]));
  }
  const lineGaps: number[] = [];
  for (let i = 1; i < inBandY.length; i++) {
    const g = inBandY[i] - inBandY[i - 1];
    if (g > 0) lineGaps.push(g);
  }
  lineGaps.sort((a, b) => a - b);
  const medianLineGap = lineGaps.length ? lineGaps[(lineGaps.length - 1) >> 1] : 0;
  const newRowGapFloor = medianLineGap > 0 ? medianLineGap * 2 : 0;

  const out: TableRow[] = [];
  const outY: number[] = [];
  let region: Bbox | null = null;
  // Raw contributing tokens per (row, label) — kept separate from
  // `row.cells` until every add() (both the row's own initial banding AND
  // every later orphan-fold) has run, then joined in real (y, x) reading
  // order. Real, corpus-found bug this fixes: a reference table's KEY
  // column can wrap with the row's own key line sitting in the MIDDLE of a
  // multi-line cell (DUCTWORK INSULATION TYPE SCHEDULE's own D-1: its
  // DESCRIPTION cell's 1st physical line sits ABOVE the row's own D-1 key
  // line, its 3rd BELOW) — orphan-folding runs as a whole separate pass
  // AFTER the main scan, so simple append-as-you-go concatenation (the
  // other three kinds' own bandDataRows convention, safe there because
  // their key values never wrap) put the row's own initial fragment first
  // and every folded orphan after it regardless of which physically came
  // first on the sheet, scrambling real spec-description text.
  const cellToks = new Map<TableRow, Map<string, GraphSpan[]>>();
  const add = (row: TableRow, toks: GraphSpan[]) => {
    let byLabel = cellToks.get(row);
    if (!byLabel) cellToks.set(row, (byLabel = new Map()));
    const buttonAnchor = anchors.find((a) => /\bBUTTON\s+(?:NUMBER|NO\.?|#)\b/.test(a.label));
    const functionAnchor = anchors.find((a) => /\bFUNCTION\b/.test(a.label));
    const buttonNumber = buttonAnchor && toks.find((t) =>
      /^\d+$/.test(t.str.trim()) && nearestAnchor(centerX(t), anchors) === buttonAnchor.label);
    for (const t of toks) {
      let label = nearestAnchor(centerX(t), anchors);
      // Wide, left-aligned FUNCTION cells can begin close enough to a
      // narrow preceding BUTTON NUMBER header that center-based banding
      // assigns the phrase to the number column. The row's own standalone
      // button integer proves the narrow column; a later letter-bearing
      // token belongs to the explicitly-present FUNCTION column.
      if (buttonAnchor && functionAnchor && buttonNumber
        && label === buttonAnchor.label && /[A-Z]/i.test(t.str)
        && t.x >= buttonNumber.x + buttonNumber.w) {
        label = functionAnchor.label;
      }
      if (label == null) continue;
      const existing = byLabel.get(label);
      const lastBbox = existing?.length ? bboxOf(existing[existing.length - 1]) : undefined;
      if (farFromCell(label, t, lastBbox ? { text: "", bbox: lastBbox } : undefined)) continue;
      if (existing) existing.push(t); else byLabel.set(label, [t]);
      region = region ? merge(region, bboxOf(t)) : bboxOf(t);
    }
  };
  const orphans: Array<{ toks: GraphSpan[]; y: number }> = [];
  for (let i = cfg.fromIdx; i < cfg.toIdx; i++) {
    const banded = rows[i].filter((t) => t.str && t.str.trim() && revisionOf(t.str) == null && t.x >= x0 && t.x <= x1);
    if (!banded.length) continue;
    if (Math.abs(centerX(banded[0]) - keyColX) > keyTol) { orphans.push({ toks: banded, y: rowY(rows[i]) }); continue; }
    const key = genericRowKeyOf(banded[0].str, headerLabelSet);
    if (!key) { orphans.push({ toks: banded, y: rowY(rows[i]) }); continue; }
    const gapOk = !out.length || banded.length >= 2 || !newRowGapFloor || (rowY(rows[i]) - outY[outY.length - 1]) >= newRowGapFloor;
    if (!gapOk) { orphans.push({ toks: banded, y: rowY(rows[i]) }); continue; }
    const row: TableRow = { key, sheet: sheetKey, cells: {} };
    add(row, banded);
    out.push(row);
    outY.push(rowY(rows[i]));
  }

  // Orphan fold: a reference table's cells routinely wrap 2-3 physical lines
  // deep (real ASTM spec prose) — a wider radius than the other three
  // kinds' own typically-short cell values need, based on the scanned
  // range's own median cell height rather than a (often thin, 2-3-row)
  // sample's row pitch, which the other three kinds' bandDataRows leans on
  // instead. Real, measured live: DUCTWORK INSULATION TYPE SCHEDULE's own
  // D-6 row folds a continuation line 59.3px away — comfortably inside this
  // radius, comfortably outside anything that would reach an unrelated
  // table's own content.
  const allH = rows.slice(cfg.fromIdx, cfg.toIdx).flat().map((t) => t.h || 8).sort((a, b) => a - b);
  const h = allH.length ? allH[allH.length >> 1] : 8;
  const gaps = outY.slice(1).map((y, idx) => y - outY[idx]).filter((d) => d > 0).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[(gaps.length - 1) >> 1] : 0;
  const radius = Math.max(pitch * 0.6, h * 4);
  const nearest = (y: number): { i: number; d: number } => {
    let bi = -1, bd = Infinity;
    outY.forEach((ry, idx) => { const d = Math.abs(y - ry); if (d < bd) { bd = d; bi = idx; } });
    return { i: bi, d: bd };
  };
  // A lone ALL-CAPS phrase ending in a bare colon ("OPERATING MODE:",
  // "COOLING MODE OF OPERATION:") is a SECTION heading, not a wrapped
  // continuation of the row above's own key value — real, corpus-found:
  // itd-d1-lab-mechanical.pdf#20's own real 4-row table narrowly (44.6px
  // vs a 45.6px new-row-gap floor) fails to seat "OPERATING MODE:" as its
  // own row, making it an orphan instead, and its 45.1px distance to the
  // table's own last real row sits comfortably inside `radius` — silently
  // appending "OPERATING MODE:" onto that row's real key text ("RESIDENCY
  // LAB 131" becomes "RESIDENCY LAB 131 OPERATING MODE:"). A real wrapped
  // continuation (the D-6 case this radius exists for) reads as ordinary
  // running text; a bare "LABEL:" fragment with nothing after the colon
  // never is — excluding that one shape leaves every real continuation
  // fold untouched.
  const isSectionHeading = (toks: GraphSpan[]): boolean =>
    toks.length === 1 && /^[A-Z][A-Z0-9 .,'"&()/%°∅Ø-]*:$/.test(norm(toks[0].str));
  const isUnkeyedButtonSubrow = (toks: GraphSpan[]): boolean => {
    const button = anchors.find((a) => /\bBUTTON\s+(?:NUMBER|NO\.?|#)\b/.test(a.label));
    if (!button) return false;
    return toks.some((t) => /^\d+$/.test(t.str.trim()) && nearestAnchor(centerX(t), anchors) === button.label)
      && toks.filter((t) => nearestAnchor(centerX(t), anchors) !== anchors[0].label).length >= 2;
  };
  for (const o of orphans) {
    if (isSectionHeading(o.toks) || isUnkeyedButtonSubrow(o.toks)) continue;
    const { i, d } = nearest(o.y);
    if (i < 0 || d > radius) continue;
    add(out[i], o.toks);
  }

  // Finalize: every cell's tokens (main scan + every folded orphan) are now
  // collected — join each cell in real reading order (top-to-bottom, then
  // left-to-right within a line), not fold order. See cellToks' own comment.
  for (const row of out) {
    const byLabel = cellToks.get(row);
    if (!byLabel) continue;
    for (const [label, toks] of byLabel) {
      const ordered = toks.slice().sort((a, b) => a.y - b.y || a.x - b.x);
      let bbox = bboxOf(ordered[0]);
      for (const t of ordered.slice(1)) bbox = merge(bbox, bboxOf(t));
      row.cells[label] = { text: ordered.map((t) => t.str.trim()).join(" "), bbox };
    }
  }

  // Minimum-population floor: the vocabulary-free version of the SAME real
  // signal equipment-kind tables already use (bandDataRows' own comment,
  // ledger item 29) — a real reference-table row populates a strong
  // majority of the table's own real columns (both real target tables:
  // full population); a stray title/note/other-table fragment that happens
  // to key-shape-match and key-column-align populates only its own one
  // cell. The real final backstop that keeps this whole pass safe even when
  // an earlier gate (keyColX alignment, the new-row gap floor) admits a
  // candidate it should not have — see this file's own corpus-wide sweep
  // for the real adversarial case this caught (a stacked LATER table's own
  // title/header text landing inside an EARLIER reference table's x-band).
  const minCells = Math.max(2, Math.ceil(anchors.length / 2));
  for (let i = out.length - 1; i >= 0; i--) {
    if (Object.keys(out[i].cells).length < minCells) { out.splice(i, 1); outY.splice(i, 1); }
  }
  return { out, region };
}

/** The structural "reference" kind's own per-call primitive — mirrors
 * extractTableAt's shape (find ONE table from `fromIdx`, report `nextIdx` so
 * a caller can resume past it) but with zero vocabulary threading: no
 * `kind`/`vocab`/`required` parameters, since there is nothing to gate a
 * header on besides the structural signals above. */
function extractReferenceTableAt(sheet: SheetSpans, fromIdx: number, fullSheet?: SheetSpans): { table: ScheduleTable | null; nextIdx: number } | null {
  const horiz = sheet.spans.filter((s) => !isVertical(s));
  const rows = clusterRows(horiz);
  // Lazy — only built the one time a candidate's own upward title-hunt
  // comes up empty and a downward big-font search is actually attempted.
  let fullRows: GraphSpan[][] | null = null;
  for (let i = fromIdx; i < rows.length; i++) {
    if (!isGenericHeaderRow(rows[i])) continue;
    const block = expandGenericHeaderBlock(rows, i);
    // Skip a block that ALREADY qualifies under an existing vocabulary — a
    // real, corpus-found bug this guards against: bessemer's own ELECTRIC
    // WALL HEATER SCHEDULE (ID/MANUFACTURER/MODEL/VOLTAGE/PHASE/WATTS/AMPS)
    // is genuinely SHORT/CAPS/columnar too, so this pass's own structural
    // signals alone happily re-find it — and the cross-kind dedup pass in
    // buildSheetGraph, built for exactly this shape of collision, picks
    // whichever fragment is RICHER by raw cell count, a coin-flip that let
    // this pass's own (buggy, at the time) extraction win and silently
    // replace the equipment-kind table `buildPlanSetTakeoff`'s whole
    // pipeline scopes on — a real regression risk to every already-working
    // tag. Checked against the SAME required-words+minHits bar
    // extractTableAt itself uses for each of the other three kinds (the
    // hoisted ROOM_FINISH_REQUIRED/FINISH_REQUIRED/EQUIPMENT_REQUIRED
    // consts, single source of truth) — a table a vocabulary already
    // explains is that vocabulary's table, never re-extracted here.
    // Equipment vocabulary alone is not proof the equipment-kind pass will
    // actually claim this block — extractTableAt refuses ANY candidate that
    // has no catalog-anchor column (ID/MARK/CODE/SYMBOL/TAG: see its own
    // comment on CATALOG_ANCHOR_WORDS) even when the rating tier alone
    // clears EQUIPMENT_REQUIRED's bar, because an unkeyable table can never
    // be looked up by tag. EAT/LAT/EWT/LWT/GPM/CFM/MBH are common, genuinely
    // cross-schedule HVAC rating words (real, corpus-found: a bare
    // TYPE-keyed coil-bank rating tier with no TAG/MFR/MODEL row of its own
    // anywhere on the sheet) — qualifying under EQUIPMENT_REQUIRED on rating
    // vocabulary alone is not, on its own, evidence a catalog-anchor column
    // exists anywhere in this block. Without this check, alreadyVocab was
    // skipping the reference-kind pass's own extraction on the strength of a
    // vocabulary match the equipment-kind pass was simultaneously refusing
    // for lack of a key column — the table landed in neither pass's output.
    // Finish-kind is unaffected: FINISH_REQUIRED (CODE/MARK/SYMBOL/ID) IS
    // itself exactly CATALOG_ANCHOR_WORDS minus TAG, so a finish-vocabulary
    // qualification is already, by construction, a catalog-anchor hit.
    const equipmentQualifies = rows.slice(block.top, block.bottom + 1)
      .some((r) => qualifies(headerHits(r, EQUIPMENT_HEADERS), EQUIPMENT_REQUIRED, OTHER_KIND_MIN_HITS));
    const blockHasCatalogAnchor = equipmentQualifies
      && headerHits(block.tokens, EQUIPMENT_HEADERS).some((h) => CATALOG_ANCHOR_WORDS.includes(h.label));
    const alreadyVocab = rows.slice(block.top, block.bottom + 1).some((r) =>
      qualifies(headerHits(r, ROOM_HEADERS), ROOM_FINISH_REQUIRED, ROOM_FINISH_MIN_HITS)
      || qualifies(headerHits(r, FINISH_HEADERS), FINISH_REQUIRED, OTHER_KIND_MIN_HITS))
      || blockHasCatalogAnchor;
    if (alreadyVocab) continue;
    const anchors = clusterGenericColumns(block.tokens);
    if (anchors.length < 2) continue;
    const { x0, x1 } = bandLimits(anchors);
    const hdrY0 = Math.min(...block.tokens.map((t) => t.y));
    const hdrY1 = Math.max(...block.tokens.map((t) => t.y + (t.h || 0)));
    if (!hasNearbyRuledLine(sheet.segs, x0, x1, hdrY0, hdrY1)) continue;
    const dataFrom = block.bottom + 1;
    const toIdx = findGenericTableBoundary(rows, dataFrom, x0, x1, anchors);
    const banded = bandGenericDataRows(rows, anchors, sheet.key, { fromIdx: dataFrom, toIdx });
    // A real table's own grid REPEATS — that is the one structural claim
    // none of the signals above (shape, nearby rule, population floor) ever
    // actually tests. A control-schematic's scattered instrument/point
    // callouts (DI/AI/TT bubbles, valve tags, "TO BUILDING AUTOMATION
    // SYSTEM" leader labels) routinely satisfy every earlier gate BY
    // COINCIDENCE for exactly one line: 2+ short ALL-CAPS diagram labels
    // happen to sit at the same clustered row-y (isGenericHeaderRow), the
    // diagram's own duct/pipe/box linework happens to span 60%+ of that
    // local x-band nearby (hasNearbyRuledLine — schematics are DENSE with
    // ruled lines, unlike the notes/keynote prose that signal was built to
    // reject), and the single line of bubble/box labels below it happens to
    // populate a majority of the "columns" (bandGenericDataRows' minCells
    // floor) — corpus-found live on itd-d1-lab-mechanical.pdf#21's own
    // ELECTRIC UNIT HEATER CONTROL SCHEMATIC (confirmed by direct render:
    // "TT H"/"SUPPLY AIR VALVE"/"DI"/"AI" are scattered callout labels
    // beside a piping schematic, not table headers) and its neighboring
    // NOTES box (whose trailing prose line, "…TRANSFORMERS FOR THE
    // LABORATORY HOOD CONTROL SYSTEM.", read as a fake title over more
    // scattered schematic tags — HWR/HWS/CSR/sensor labels). Neither
    // produces a SECOND real data row, because there is no real row/column
    // grid underneath to produce one — it is one-off coincidental
    // x-alignment, not a repeating structure. Every real reference table
    // measured in this corpus (bessemer's own DUCTWORK INSULATION SCHEDULE:
    // 2 rows; DUCTWORK INSULATION TYPE SCHEDULE: 3 rows; itd-d1-lab's own
    // real ROOF DRAIN/LAVATORY SHIELD/ELECTRONIC EXHAUST VALVE tables: 4-13
    // rows) clears this trivially — a genuine table proves its own grid by
    // repeating at least once; this is the generic, vocabulary-free
    // discriminator the mandate above asked for, not a corpus-specific
    // title/tag hack.
    if (banded.out.length < 2) return { table: null, nextIdx: toIdx };
    const promotedHeaders = promoteLeadingEngineeringUnits(anchors.map((a) => a.label), banded.out);
    for (let i = 0; i < anchors.length; i++) anchors[i].label = promotedHeaders[i];

    // Title hunt.
    //
    // No "…SCHEDULE"-style vocabulary anchor exists for a structural
    // reference table, so this starts from the same "nearest single-span,
    // all-caps, digit-free, 2+-word run, in the header's own x-band"
    // fallback signal extractTableAt's own title hunt uses as its LAST
    // resort. That signal alone is not enough on a sheet whose body text is
    // itself typed in dense all-caps prose (a real drafting convention —
    // "SEQUENCE OF OPERATION" specs, corpus-found on
    // itd-d1-lab-mechanical.pdf#20): every wrapped prose LINE above the
    // table is ALSO a single-span, digit-free, multi-word, all-caps run, so
    // the plain shape test can't tell a genuine caption from an ordinary
    // sentence fragment — it grabbed "PERIOD UPON A SIGNAL FROM AN OVERRIDE
    // BUTTON LOCATED ON THE SPACE TEMPERATURE SENSOR." (real, live) instead
    // of the table's own real caption, "LAB VENTILATION WITH MULTIPLE HOODS
    // SYSTEM SEQUENCE OF OPERATION" — which, on this drafting convention,
    // doesn't even sit above the header: it sits BELOW the whole
    // prose+table+"OPERATING MODE:" block, immediately before the
    // schematic diagram it introduces.
    //
    // The one signal that reliably tells a genuine caption from ordinary
    // body prose in EITHER position: font size. Every real caption measured
    // in this corpus renders at ~2.5x the header row's own token height
    // (the sheet's own body-text height, since a genuine header is body-
    // sized); an ordinary prose sentence, even a lone all-caps run with no
    // digits, never is. Checked first, nearer side first (upward, matching
    // every other kind's own title-above-header convention) — downward is
    // only tried once upward comes up empty, starting past this table's own
    // data (`toIdx`) and bounded to the same scan budget the data search
    // itself uses, so it can reach a caption sitting past a long
    // "OPERATING MODE:" prose tail without wandering past a LATER table's
    // own header into unrelated territory. Only once both big-font passes
    // fail does this drop to the plain shape-only signal, upward only,
    // exactly as before — a sheet where that heuristic already finds the
    // right title (no big-font caption to prefer) is unaffected.
    const hdrHeights = block.tokens.map((t) => t.h || 8).sort((a, b) => a - b);
    const hdrH = hdrHeights[hdrHeights.length >> 1] || 8;
    const BIG_FONT_RATIO = 1.6;
    const isTitleShaped = (t: GraphSpan): boolean => {
      const s = norm(t.str);
      if (!s || /\d/.test(s) || !/^[A-Z][A-Z .,'’&()/-]*$/.test(s)) return false;
      return s.split(/\s+/).filter(Boolean).length >= 2;
    };
    // A genuine big-font caption routinely reads WIDER than the table it
    // captions (real, measured: "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM
    // SEQUENCE OF OPERATION" spans x 578-2154, well past this table's own
    // ~360-1160 column band) — a centerX-containment test (the existing
    // fallback's own, kept as-is below) would miss it entirely. Interval
    // OVERLAP with the table's own x-band is the right test here: still
    // anchored to this table's own columns (an unrelated caption sitting
    // entirely outside [x0,x1] still can't drift in), but tolerant of a
    // caption that starts in-band and simply runs on past the table's own
    // right edge.
    const overlapsBand = (t: GraphSpan): boolean => t.x <= x1 && t.x + (t.w || 0) >= x0;
    let title: Evidence | null = null;
    for (let k = block.top - 1, budget = 5; k >= 0 && budget > 0 && !title; k--) {
      const inBand = rows[k].filter(overlapsBand);
      if (!inBand.length) continue;
      budget--;
      if (inBand.length !== 1 || !isTitleShaped(inBand[0]) || (inBand[0].h || 8) < hdrH * BIG_FONT_RATIO) continue;
      title = { sheet: sheet.key, text: inBand[0].str.trim(), bbox: bboxOf(inBand[0]) };
    }
    // The downward pass reads the ORIGINAL, un-banded sheet (`fullSheet`,
    // when the caller has it — buildSheetGraph's real extraction call always
    // does; only the internal band-vs-split probes in bandedSheets itself
    // don't, and neither pass matters there since its own candidates get
    // discarded) rather than this call's own (possibly column-banded)
    // `rows`. Real, corpus-found reason: a caption wide enough to run on
    // past its own table's right edge (see `overlapsBand`'s own comment)
    // routinely has its CENTER sitting in the seam bandedSheets cuts
    // between two side-by-side tables — bandedSheets' own band-membership
    // test is centerX-only, so that caption's span is dropped from BOTH
    // resulting bands entirely, even though it starts well inside this
    // table's own column. Re-reading the unsplit sheet for this one lookup
    // (bounded, below, to a short window past this table's own data — never
    // a wholesale return to unbanded extraction) recovers it without
    // reopening the banding decision itself. Y-bounded rather than row-
    // index-bounded, since `fullRows`' own indices don't correspond to
    // `rows`' (a different, wider span set clusters into a different row
    // count) — `toIdx`'s row-granularity budget carries over as a Y
    // distance via the header's own row pitch instead.
    if (!title && fullSheet) {
      const dataY1 = banded.region ? banded.region[3] : hdrY1;
      const maxY = dataY1 + MAX_TABLE_SCAN_ROWS * Math.max(hdrH * 1.5, 12);
      if (!fullRows) fullRows = clusterRows(fullSheet.spans.filter((s) => !isVertical(s)));
      for (const r of fullRows) {
        if (rowY(r) <= dataY1) continue;
        if (rowY(r) > maxY) break;
        const inBand = r.filter(overlapsBand);
        if (!inBand.length) continue;
        // "New header" stop-signal, tested on the in-band tokens ALONE, not
        // `r`'s full (unbanded) token set the way looksLikeGenericNewHeader
        // itself tests it: `r` here comes from the deliberately un-banded
        // `fullRows`, so it routinely fuses this table's own content with
        // whatever sits at a similar Y on the OTHER side of the page (real,
        // corpus-found: both this sheet's own "OPERATING MODE:" labels, one
        // per table half, sit close enough in Y to cluster into ONE row —
        // testing that fused row's full, cross-page token set would stop
        // the scan on this table's OWN content before it ever reaches the
        // real caption).
        if (inBand.length >= 2 && isGenericHeaderRow(inBand)) break;
        if (inBand.length !== 1 || !isTitleShaped(inBand[0]) || (inBand[0].h || 8) < hdrH * BIG_FONT_RATIO) continue;
        title = { sheet: sheet.key, text: inBand[0].str.trim(), bbox: bboxOf(inBand[0]) };
        break;
      }
    }
    if (!title) {
      for (let k = block.top - 1, budget = 5; k >= 0 && budget > 0 && !title; k--) {
        const inBand = rows[k].filter((t) => centerX(t) >= x0 && centerX(t) <= x1);
        if (!inBand.length) continue;
        budget--;
        if (inBand.length !== 1 || !isTitleShaped(inBand[0])) continue;
        title = { sheet: sheet.key, text: inBand[0].str.trim(), bbox: bboxOf(inBand[0]) };
      }
    }

    let region: Bbox | null = banded.region;
    for (const t of block.tokens) region = region ? merge(region, bboxOf(t)) : bboxOf(t);
    const table: ScheduleTable = {
      kind: "reference", sheet: sheet.key, title,
      headers: anchors.map((a) => a.label), rows: banded.out, region: region!, anchors,
    };
    return { table, nextIdx: toIdx };
  }
  return null;
}

/** Every structural "reference" table on a sheet — mirrors extractAllTables'
 * own repeat-from-nextIdx loop. `fullSheet`, when given, is the pre-banding
 * whole sheet `sheet` was cut from — see extractReferenceTableAt's own
 * title-hunt comment for why the title search alone still wants it. */
export function extractAllReferenceTables(sheet: SheetSpans, fullSheet?: SheetSpans): ScheduleTable[] {
  const out: ScheduleTable[] = [];
  let fromIdx = 0;
  for (let n = 0; n < MAX_TABLES_PER_SHEET; n++) {
    const found = extractReferenceTableAt(sheet, fromIdx, fullSheet);
    if (!found) break;
    if (found.table) out.push(found.table);
    if (found.nextIdx <= fromIdx) break;
    fromIdx = found.nextIdx;
  }
  return out;
}

// ── continuation sheets (#87 phase 2) ───────────────────────────────────────
// "ROOM FINISH SCHEDULE — CONT'D" is not a second schedule: it is the SAME
// table whose rows ran off the sheet. Fragments merge into one logical table
// — rows keep the sheet that carries them, so every citation still points at
// real ink — and resolution, ambiguity checks, and find_schedule all see ONE
// table. Two shapes ship: a continuation that repeats its header row (the
// common convention) merges by title; one that repeats only the TITLE adopts
// the base fragment's column anchors, gated on the key column actually
// aligning — misaligned columns refuse and the gap is NAMED in graph.notes,
// never silently dropped.
const CONT_TAIL_RE = /[\s\-–—:.,(]*(?:CONTINUATION|CONTINUED|CONT['’]?D?)[\s.)]*$/;
const isContinuationTitle = (text: string): boolean => {
  const u = norm(text);
  return /SCHEDULE/.test(u) && CONT_TAIL_RE.test(u);
};
const baseTitleOf = (text: string): string =>
  norm(text).replace(CONT_TAIL_RE, "").replace(/[\s\-–—:.,()]+$/, "").trim();

function findContinuationBase(logical: ScheduleTable[], frag: ScheduleTable): ScheduleTable | null {
  const sameKind = logical.filter((t) => t.kind === frag.kind
    && (frag.building == null || t.building == null || t.building === frag.building));
  if (!sameKind.length) return null;
  const fragBase = baseTitleOf(frag.title!.text);
  const titled = sameKind.filter((t) => t.title && baseTitleOf(t.title.text) === fragBase);
  const pool = titled.length ? titled : sameKind;
  return pool[pool.length - 1]; // the most recent fragment in sheet order
}

function mergeContinuation(base: ScheduleTable, frag: ScheduleTable): void {
  if (!base.parts) {
    base.parts = [{ sheet: base.sheet, title: base.title?.text || "", rows: base.rows.length, region: base.region, ...(base.rotated_headers ? { rotated_headers: true } : {}) }];
  }
  for (const r of frag.rows) if (r.building == null && frag.building != null) r.building = frag.building;
  base.parts.push({ sheet: frag.sheet, title: frag.title?.text || "", rows: frag.rows.length, region: frag.region, ...(frag.rotated_headers ? { rotated_headers: true } : {}) });
  base.rows.push(...frag.rows);
}

/** A header-less continuation: the sheet repeats the TITLE but not the header
 * row, so extraction found nothing there. Adopt the base table's anchors and
 * band the rows below the title — but only where the key column actually
 * lines up; adopting misaligned columns would caption cells with the wrong
 * headers, which is worse than refusing. */
function adoptContinuationRows(sheet: SheetSpans, titleSpan: GraphSpan, base: ScheduleTable, buildings: Set<string>, deltas?: DeltaIndex): ScheduleTable | null {
  // "reference" (the structural kind, above extractAllTables) has its own,
  // separate row-acceptance/orphan-fold logic (bandGenericDataRows) — not
  // wired into this header-less-continuation path; a header-less
  // continuation of a reference table is real, disclosed, out of THIS
  // task's scope (no real corpus example found), same refusal as "unknown".
  if (!base.anchors?.length || base.kind === "unknown" || base.kind === "reference") return null;
  const rows = clusterRows(sheet.spans.filter((s) => !isVertical(s)));
  const { medGap } = bandLimits(base.anchors);
  const keyTol = Math.max(40, medGap / 2);
  const banded = bandDataRows(rows, base.anchors, base.kind, sheet.key, buildings, {
    fromIdx: 0, belowY: titleSpan.y, keyAlign: { x: base.anchors[0].x, tol: keyTol }, deltas,
  });
  if (!banded.out.length) return null;
  const region = banded.region ? merge(bboxOf(titleSpan), banded.region) : bboxOf(titleSpan);
  return {
    kind: base.kind, sheet: sheet.key,
    title: { sheet: sheet.key, text: titleSpan.str.trim(), bbox: bboxOf(titleSpan) },
    headers: base.headers, rows: banded.out, region,
  };
}

// ── room tags on plans ──────────────────────────────────────────────────────
export interface RoomTag { tag: string; name: string; sheet: string; bbox: Bbox; building?: string; revision?: RowRevision;
  /** WHY this number is believed to be a room: a name drawn with it, a
   * room-finish row answering for it, or both. Uncorroborated numbers are not
   * rooms — they are listed in SheetGraph.unmatched_tags with a reason. */
  corroboration?: "name" | "schedule" | "name+schedule" }
/** A numbered tag on a plan sheet that is NOT counted as a room, and why.
 * Listed rather than dropped: a room the schedule genuinely forgot shows up
 * here, and so does every keynote hexagon — the reason separates them. */
export interface UnmatchedTag { tag: string; sheet: string; bbox: Bbox; building?: string; name?: string; reason: string }
const QUALIFIED_TAG_RE = /^([A-Z]{1,2})-(\d{2,3}[A-Z]?)$/;
/** Words that sit next to a number in a TABLE, never over a room bubble. */
const NON_ROOM_NAME = new Set(["NUMBER", "NO", "NAME", "MARK", "SYMBOL", "CODE", "TYPE", "QTY", "SIZE", "TOTAL", "SHEET", "DATE", "SCALE", "REV", "REVISION", "DESCRIPTION", "REMARKS", "COMMENTS", "DETAIL", "ROOM"]);

export interface RoomTagOpts {
  /** Building designators the set names — a qualified plan tag ("A-134") is
   * only a room where its prefix is one of these. */
  buildings?: Set<string>;
  /** Normalized tags that are actually sheet numbers in the set ("A-601",
   * "A601") — a title block's own number must never mint a room. */
  exclude?: Set<string>;
  /** Drawn delta triangles on this sheet — a bare digit inside one is a
   * revision marker, never a room, and attaches to the bubble it sits by. */
  deltas?: DeltaIndex;
}

/** Room-number tags on a sheet, with the name span sitting just above the
 * number (the "WORKROOM ⏎ 109" bubble stack) when one exists. */
export function roomTags(sheet: SheetSpans, opts: RoomTagOpts = {}): RoomTag[] {
  const out: RoomTag[] = [];
  const spans = sheet.spans;
  const accept = (t: string): { ok: boolean; building?: string } => {
    if (ROOM_LABEL_RE.test(t)) return { ok: true };
    const q = norm(t).match(QUALIFIED_TAG_RE);
    if (q && opts.buildings?.has(q[1]) && !opts.exclude?.has(norm(t).replace(/[^A-Z0-9]/g, ""))) return { ok: true, building: q[1] };
    return { ok: false };
  };
  for (const sp of spans) {
    if (opts.deltas?.has(sp)) continue; // a digit inside a drawn delta is a marker, never a room
    const t = sp.str.trim();
    const a = accept(t);
    if (!a.ok) continue;
    const b = bboxOf(sp);
    const hgt = Math.max(sp.h || 8, 6);
    // the label above: horizontally overlapping, within ~2 text heights up,
    // and NOT itself a number (two stacked room numbers are two rooms)
    let name = "";
    let best = Infinity;
    for (const cand of spans) {
      if (cand === sp || accept(cand.str.trim()).ok) continue;
      const cb = bboxOf(cand);
      const dy = b[1] - cb[3];
      if (dy < -hgt * 0.2 || dy > hgt * 2.2) continue;
      if (cb[2] < b[0] - hgt || cb[0] > b[2] + hgt) continue;
      const raw = cand.str.trim();
      // A room name is drafted in CAPS ("MEN'S SAUNA", "IT"). Mixed-case
      // prose is title-block or note text — "Fax", "Story" — and pairing it
      // with a nearby number invents a room out of a fax number.
      if (/[a-z]/.test(raw)) continue;
      if (!/^[A-Z][A-Z .'’\/&-]{1,}$/.test(norm(raw))) continue;
      if (NON_ROOM_NAME.has(norm(raw))) continue;
      if (dy < best) { best = dy; name = cand.str.trim(); }
    }
    const tag: RoomTag = { tag: t, name, sheet: sheet.key, bbox: b };
    if (a.building) tag.building = a.building;
    out.push(tag);
  }
  // a delta beside the bubble flags the ROOM as revised — the finish stated
  // for it changed under that revision; nearest marker within ~2.5 tag
  // heights of the bubble's edge attaches, farther ones are someone else's
  const markers: Array<{ rev: string; span: GraphSpan; box: Bbox; drawn?: boolean }> = [];
  for (const c of spans) {
    const tri = opts.deltas?.get(c);
    if (tri) markers.push({ rev: norm(c.str), span: c, box: merge(bboxOf(c), tri), drawn: true });
    else {
      const rev = revisionOf(c.str);
      if (rev != null) markers.push({ rev, span: c, box: bboxOf(c) });
    }
  }
  for (const tag of out) {
    const hgt = Math.max(tag.bbox[3] - tag.bbox[1], 6);
    let bestM: (typeof markers)[number] | null = null;
    let bd = Infinity;
    for (const m of markers) {
      const dx = Math.max(tag.bbox[0] - m.box[2], m.box[0] - tag.bbox[2], 0);
      const dy = Math.max(tag.bbox[1] - m.box[3], m.box[1] - tag.bbox[3], 0);
      const d = Math.hypot(dx, dy);
      if (d <= hgt * 2.5 && d < bd) { bd = d; bestM = m; }
    }
    if (bestM) tag.revision = { rev: bestM.rev, source: { sheet: sheet.key, text: bestM.span.str.trim(), bbox: bestM.box }, ...(bestM.drawn ? { drawn: true } : {}) };
  }
  return out;
}

// ── detail callouts ─────────────────────────────────────────────────────────
export interface DetailCallout { detail: string; target_sheet: string; sheet: string; bbox: Bbox }
const CALLOUT_RE = /^(\d{1,2})\s*\/\s*([A-Z]{1,2}-?\d{1,3}(?:\.\d+)?)$/;

export function detailCallouts(sheet: SheetSpans): DetailCallout[] {
  const out: DetailCallout[] = [];
  for (const sp of sheet.spans) {
    const m = sp.str.trim().match(CALLOUT_RE);
    if (m) out.push({ detail: m[1], target_sheet: m[2], sheet: sheet.key, bbox: bboxOf(sp) });
  }
  return out;
}

// ── column bands (2-column/side-by-side sheet layout) ───────────────────────
// clusterRows (and everything downstream of it) is Y-only: it has no idea a
// sheet can be drafted as two physically SEPARATE strips of tables side by
// side (a real, common convention on a dense schedule sheet — itd-d1-lab's
// own sheets #12/#13/#14 each carry a LEFT stack of tables and a RIGHT stack,
// each with its own titles/headers/data, at completely different x-ranges).
// When two such tables' ROWS happen to land within a few px of each other in
// y — measured live: GEV-7's data row and BP-1's data row 2px apart — they
// glue into ONE clusterRows row spanning both tables' x-ranges, and that
// single row is what findHeaderRow reads when hunting for a header: the
// unrelated content inflates a header candidate's own token count enough to
// defeat the "almost entirely header words" ratio gate a real multi-tier
// header's tier-descent depends on, so tables that should extract cleanly
// come back garbled, misclassified under the wrong kind, or missing rows.
//
// The fix does NOT touch clusterRows itself — every existing row/orphan/
// marker/title/boundary heuristic downstream of it keeps working exactly as
// designed, just fed a narrower span list. Instead, a sheet's spans are
// PRE-PARTITIONED by x into column bands, each run through the existing,
// unmodified extraction pipeline independently, before clusterRows ever
// merges anything across them.
//
// The hard part (named directly in the accuracy-hardening plan): telling a
// real seam between two SEPARATE tables apart from an ordinary gap INSIDE
// one table's own column layout — a wide gap between a room-finish table's
// NAME column and its FLOOR FINISH column is real and must never split that
// table in two (confirmed live: doing so naively collapses
// demo/sample-finish-plan.pdf's own real ROOM FINISH SCHEDULE — the NUMBER/
// NAME half loses its FLOOR/BASE vocabulary and no longer qualifies as a
// header at all, while the FLOOR-FINISH/BASE-FINISH half qualifies
// vocabulary-wise but its own leftmost column is finish-code DATA, not a
// digit-shaped room key, so bandDataRows correctly keys zero rows there
// either — the table is just gone). The distinguishing signal used here is
// exactly that data point: a genuine second table's own key column, read
// alone, still resolves through the SAME required-vocabulary+minHits header
// gate AND the SAME rowKeyOf-gated data banding every kind already uses — a
// column-fragment of ONE table never does, because half a table's columns
// were never a complete, independently keyable table to begin with. So a
// candidate geometric gap is only ever treated as a real seam once each side
// is PROVEN, by literally running the unmodified extraction pipeline against
// it alone, to produce a real table on its own — never assumed from
// geometry.
type Seam = { x0: number; x1: number };

/** Candidate seams: x-corridors that sit empty (no span box, padded a few px)
 * across almost every y-band that carries any content at all. A real page
 * seam between two independently-drafted column strips is empty EVERYWHERE
 * (nothing is ever drawn in a firm's own inter-table margin); an ordinary
 * gap between two columns of ONE table is only empty for the rows THAT table
 * occupies, a small fraction of a dense sheet's full height, and gets
 * crossed by data spilling wide on at least a few of them. Geometry alone
 * cannot fully tell these apart (both can locally look "mostly empty") — that
 * is exactly why every candidate this returns is still proven, not trusted,
 * by validateSeam below before it is ever used to split anything. */
function columnBandCandidates(spans: GraphSpan[]): Seam[] {
  const XBUCKET = 10;    // x-bucket width (px)
  const PAD = 4;         // padding around each span's own box (antialiasing/kerning slack)
  const EMPTY_FRAC = 0.9; // an x-bucket must be occupied in <= 10% of content ROWS to count as "empty"
  const MIN_GAP = 100;    // minimum contiguous empty width to name a seam at all
  // A real 2-up drafted sheet stacks DOZENS of rows across its column strips;
  // a small table (real or a unit-test fixture) can look "sparse" purely for
  // having few rows to sample, where almost any gap reads as "always empty"
  // by having no counter-evidence — measured live, a real single small table
  // (a handful of rows) produced a false seam right through its own un-
  // modeled middle columns this way. Below this floor, there simply isn't
  // enough row evidence for the emptiness statistic to mean anything, so no
  // candidate is proposed at all — the whole-sheet path runs unchanged.
  const MIN_ROWS = 10;

  const toks = spans.filter((t) => t.str && t.str.trim());
  if (toks.length < 4) return [];
  const minX = Math.min(...toks.map((t) => t.x));
  const maxX = Math.max(...toks.map((t) => t.x + (t.w || 0)));
  if (maxX - minX < MIN_GAP * 3) return []; // too narrow a sheet region for a real 2-up split

  // Real rows, the same shape clusterRows itself produces (Y-only, exactly
  // as broken/contaminated as the bug this exists to fix on a genuine 2-up
  // sheet) — good enough here: this is only a DENSITY measurement (how many
  // independent y-bands carry content), not a structural read, and the
  // contamination this whole mechanism exists to prevent doesn't change how
  // many rows there are, only what ends up in them.
  const rows = clusterRows(toks);
  if (rows.length < MIN_ROWS) return [];

  const nXB = Math.max(1, Math.ceil((maxX - minX) / XBUCKET));
  const occCount = new Array(nXB).fill(0);
  const contentBins = rows.length;
  for (const list of rows) {
    const occ = new Array(nXB).fill(false);
    for (const t of list) {
      const b0 = Math.max(0, Math.floor((t.x - PAD - minX) / XBUCKET));
      const b1 = Math.min(nXB - 1, Math.floor((t.x + (t.w || 0) + PAD - minX) / XBUCKET));
      for (let b = b0; b <= b1; b++) occ[b] = true;
    }
    for (let b = 0; b < nXB; b++) if (occ[b]) occCount[b]++;
  }

  const emptyThresh = contentBins * (1 - EMPTY_FRAC);
  const seams: Seam[] = [];
  let runStart = -1;
  for (let b = 0; b < nXB; b++) {
    const isEmpty = occCount[b] <= emptyThresh;
    if (isEmpty && runStart < 0) runStart = b;
    if (!isEmpty && runStart >= 0) {
      const x0 = minX + runStart * XBUCKET, x1 = minX + b * XBUCKET;
      if (x1 - x0 >= MIN_GAP) seams.push({ x0, x1 });
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const x0 = minX + runStart * XBUCKET, x1 = minX + nXB * XBUCKET;
    if (x1 - x0 >= MIN_GAP && x1 < maxX - 1) seams.push({ x0, x1 });
  }
  // interior only — a "seam" touching the sheet's own leading/trailing edge
  // is just margin, not a divide between two content regions
  return seams.filter((s) => s.x0 > minX + 1 && s.x1 < maxX - 1);
}

/** Does this span list, alone, produce at least one real extracted table
 * (any of the three vocabulary kinds, or the structural "reference" kind)?
 * The proof a seam's own side is a genuine, independent table — not a
 * column-fragment of one that spans across the seam.
 *
 * A "reference" match (vocabulary-free by design) is real, corroborating
 * evidence ONLY when it is substantial: a genuine TITLE of its own, and more
 * than a single row — the same two signals a human would use to tell "a
 * real, separate list" from "a stray fragment of contamination." Both are
 * needed; a legitimate, small reference table (LAB EQUIPMENT LIST, this
 * file's own test fixture) clears both easily, while a false seam's own
 * severed leftovers (real, found live on itd-d1-lab-mechanical.pdf#13's own
 * AIR HANDLING UNIT SCHEDULE sheet — a false seam sliced straight through
 * that ONE real, wide table's own middle, severing its title/leading
 * columns from the rest) read either as an untitled 1-3-row scrap, or a
 * real-looking title with only a single stray row — never both a title AND
 * real row count together. Without this, that untitled/thin fragment alone
 * was enough to let an obviously-bad seam through this gate; a real
 * reference-only split still gets caught downstream anyway: extractedKeys
 * never credits a reference-kind key, so `lostAny` sees nothing to protect
 * on that seam either way — this only narrows what counts as evidence HERE. */
function sideHasRealTable(spans: GraphSpan[], sheetKey: string, opts: ExtractOpts): boolean {
  if (spans.length < 4) return false;
  const probe: SheetSpans = { key: sheetKey, spans };
  for (const kind of ["room-finish", "finish", "equipment"] as const) {
    if (extractTable(probe, kind, opts)) return true;
  }
  return extractAllReferenceTables(probe).some((t) => !!t.title?.text.trim() && t.rows.length > 1);
}

/** Every real row KEY a TITLED table extracts today — the ground truth a
 * candidate seam is judged against. A dense multi-table sheet's title/
 * vocabulary content is far too abundant to use "does each side have SOME
 * title/header of its own" as the bar: measured live, a genuine single
 * table's title (HUMIDIFIER SCHEDULE) sits entirely on ONE side of a false
 * candidate seam through its own middle, but the SHEET as a whole carries so
 * many OTHER real tables that both sides still had a title and a real
 * extractable table of their OWN regardless — the false seam passed anyway.
 * Row keys close that gap: they are the actual, per-table proof of what a
 * real table resolves to, so comparing the WHOLE sheet's own key set against
 * the split's is a direct measure of whether the split lost something real.
 *
 * Restricted to TITLED tables of the three vocabulary kinds — deliberately
 * excluding both a titleless fragment (an equipment/finish read with no
 * title at all is already, on the unsplit sheet, exactly the kind of
 * contamination-shaped partial read this whole mechanism exists to clean
 * up, not a real table worth protecting) and the structural "reference"
 * kind entirely (vocabulary-free by design, so it is the read MOST prone to
 * inventing a plausible-looking "key" — "MIN.", "12"", a stray fragment —
 * out of exactly the cross-table contamination a real seam is supposed to
 * remove; measured live, comparing reference-kind keys made every real seam
 * candidate look "lossy" against garbage the fix was correctly discarding).
 *
 * Further restricted to keys carrying a digit. Even a titled equipment/
 * finish table's own row-banding is not perfect on today's un-fixed engine —
 * a stray un-modeled column word (REMARKS, CFM, FAN, NO, PRESSURE, E) can
 * itself key a garbage row on the WHOLE, unsplit sheet — and comparing
 * against those non-digit artifacts made every real candidate look lossy
 * against noise the split had no way to reproduce (it was never a real key
 * to begin with). A real device tag or finish/room code always carries at
 * least one digit (SAV-1, HUM-1, VCT-1, 134, 3A); this is the same shape
 * rowKeyOf itself already requires (ROW_KEY_RE/CODE_RE), applied here as a
 * coarse noise filter before two extractions are ever compared.
 *
 * Value: the row's own populated CELL COUNT, not just its bare existence.
 * A seam landing inside one real table's OWN header (not between two
 * tables at all — real, measured live on a synthetic 2-tier equipment
 * fixture: a seam opened in the gap between a narrow upper tier and the
 * fuller lower tier's own trailing columns) can strip real columns off
 * every row while leaving every row's KEY untouched, since the key sits to
 * the LEFT of the sheared columns and the row-existence check alone never
 * notices the loss. Comparing cell counts catches exactly this — a row
 * that still exists but reads back thinner than it did on the unsplit
 * sheet is real data loss, the same class of harm as losing the row
 * outright. */
function extractedKeys(sheet: SheetSpans, opts: ExtractOpts, seam?: Seam): Map<string, number> {
  const out = new Map<string, number>();
  for (const kind of ["room-finish", "finish", "equipment"] as const) {
    for (const t of extractAllTables(sheet, kind, opts)) {
      if (!t.title?.text.trim()) continue;
      // A title drawn a SECOND time elsewhere on this same sheet, at the
      // same header height but on the OTHER side of the very seam under
      // test, is not decoration — it is the sheet's own proof that THIS
      // candidate seam runs between two genuine, independent instances of a
      // dual-column-strip layout (corpus-found: itd-d1-lab-mechanical.pdf
      // #28's "PLUMBING FIXTURE SCHEDULE", drawn once above each of two
      // physically separate column groups that continue ONE schedule's row
      // sequence, D-1..WCO on the left strip, WH-1..WS-1 on the right).
      // Read unsplit, both header rows sit at the same Y and get merged
      // into ONE row by the same Y-only clustering every kind already uses,
      // so this table's OWN headers.length is inflated by exactly the
      // cross-strip contamination that seam is supposed to remove — not a
      // genuine measure of either strip's real column count (measured
      // live: the unsplit read reads 5 columns off the merged row; the
      // correct LEFT-alone split reads only 3, its own honest count).
      // Crediting the inflated count made the correct split look "lossy"
      // against a bar neither strip, read alone, ever actually cleared, so
      // `!lostAny` failed for every candidate seam and the sheet stayed
      // unsplit — the same two real rows (LS-1 "LAVATORY SHIELD", RD-1
      // "ROOF DRAIN") kept bleeding out as their own spurious "reference"-
      // kind fragments instead of being read as the ordinary rows of the
      // real schedule they are.
      //   Gating this on the SEAM under test (not a blanket exclusion of
      // every duplicate-titled table from every candidate) matters: this
      // same sheet also carries a false candidate seam through the LEFT
      // strip's own middle (between its FIXTURE DESCRIPTION and CONNECTION
      // SIZE columns) — a blanket exclusion would strip this table's real
      // protection there too and let that false seam sever its own columns
      // unchallenged. Requiring the duplicate to sit strictly on the far
      // side of THIS seam (one occurrence left of x0, the other right of
      // x1) means only the one seam actually responsible for the merge
      // loses this table's credit; every other candidate still measures
      // against its full, real bar.
      const titleText = norm(t.title.text);
      const titleX = t.title.bbox[0], titleY = t.title.bbox[1];
      const hasDuplicateAcrossSeam = !!seam && sheet.spans.some((sp) => {
        if (norm(sp.str) !== titleText) return false;
        if (Math.abs(sp.y - titleY) >= 50) return false;
        return (titleX < seam.x0 && sp.x > seam.x1) || (titleX > seam.x1 && sp.x < seam.x0);
      });
      if (hasDuplicateAcrossSeam) continue;
      // The table's own COLUMN count (headers.length), not each row's own
      // populated-cell count. A real row's populated-cell count varies row
      // to row even in a perfectly correct table (a column legitimately
      // blank for one row is not "lost"), and comparing it directly flagged
      // the REAL good seam on itd-d1-lab-mechanical.pdf#13 as "lossy" —
      // BCV-1/D-4 each read one fewer populated cell after the split, not
      // because a column was severed, but because the UNSPLIT baseline's
      // own row had picked up one spurious cell from cross-table
      // contamination in the first place (the exact thing a real seam is
      // supposed to remove). The table's own header/column COUNT is stable
      // against that noise while still catching the real harm (a seam that
      // severs a table's own columns changes ITS header count, not any one
      // row's populated-cell tally) — this is exactly what caught the
      // synthetic 2-tier fixture case a per-row cell count could not:
      // there, headers.length itself dropped (5 → 3) when the seam cut
      // through the header.
      const n = t.headers.length;
      // A row whose own tag-prefix doesn't match this SAME table's own
      // majority tag family is not a real row of this table at all — it is
      // exactly the cross-column contamination this whole seam-scoring
      // mechanism exists to detect (real, corpus-found: itd-d1-lab-
      // mechanical.pdf#12's own unsplit-sheet "CANOPY HOOD SCHEDULE" read —
      // CH-1..CH-4 are its real rows, but its own boundary detection also
      // swept in "SAV-3"/"SAV-5" from the neighbouring, disjoint
      // "…SUPPLY VALVE SCHEDULE" table two columns over). Before this table
      // gained a real title, extractedKeys' own title gate above silently
      // excluded it from baselineKeys entirely, so this contamination never
      // reached the comparison; once title-hunt got deep enough to find it,
      // the bled-in "SAV-3"/"SAV-5" keys started outscoring (dominant
      // header count "SAV-3"=7 from the polluted read) every GOOD split's
      // own honest read of the real SAV table two columns over, so
      // `!lostAny` failed for EVERY candidate seam and the correct split was
      // never taken at all — SAV never separately extracted again. Majority-
      // prefix (the tag letters before the first digit) is the same real,
      // structural signal a genuine schedule already guarantees on its own
      // (every row of ONE real table shares ONE tag family — CH-1..CH-4,
      // never CH-1/SAV-3 mixed) — a minority prefix, by construction, can
      // only be contamination bled in from elsewhere, never this table's own
      // real data.
      const prefixOf = (k: string): string => k.match(/^[A-Z]+/)?.[0] ?? "";
      const prefixCounts = new Map<string, number>();
      for (const r of t.rows) {
        if (!/\d/.test(r.key)) continue;
        const p = prefixOf(r.key);
        prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
      }
      let majorityPrefix = "", majorityCount = 0;
      for (const [p, c] of prefixCounts) if (c > majorityCount) { majorityPrefix = p; majorityCount = c; }
      for (const r of t.rows) {
        if (!/\d/.test(r.key)) continue;
        if (prefixOf(r.key) !== majorityPrefix) continue;
        const cur = out.get(r.key);
        if (cur == null || n > cur) out.set(r.key, n);
      }
    }
  }
  return out;
}

const MAX_COLUMN_BANDS = 6;

/** The sheet's spans, split into independently-processed column bands when a
 * real 2-(or more-)up layout is proven present — else `[sheet]` unchanged,
 * the identical object, so a sheet with no such layout runs through the
 * exact same single whole-sheet path as before this existed. Each candidate
 * geometric seam is proven independently, two ways, both required:
 *   1. splitting the FULL sheet at that seam alone must not LOSE any row key
 *      the UNSPLIT sheet already extracts today (extractedKeys) — a real
 *      seam only ever ADDS tables the contaminated whole-sheet read could
 *      not see (SAV/GEV never appear in the unsplit key set at all — the
 *      contamination this whole mechanism targets keeps them out), while a
 *      false seam through one real table's own middle (HUMIDIFIER SCHEDULE)
 *      loses that table's own key the moment its columns are severed. This
 *      is checked against real extraction output, not geometry or title
 *      text, specifically because a contaminated whole-sheet table can
 *      carry a real title while its own anchors/cells already sweep in
 *      tokens from both sides of a real seam — proving nothing on its own;
 *   2. splitting the FULL sheet at that seam alone must leave BOTH sides
 *      still producing a real table on their own (sideHasRealTable) — a
 *      genuine second table on each side, not empty space.
 * An unproven seam is simply dropped — the region it would have carved out
 * just stays merged with its neighbour, exactly as if this pass did not
 * exist for it, so a false candidate never has a chance to corrupt
 * anything. */
export function bandedSheets(sheet: SheetSpans, opts: ExtractOpts): SheetSpans[] {
  const horiz = sheet.spans.filter((s) => !isVertical(s));
  const candidates = columnBandCandidates(horiz).slice(0, MAX_COLUMN_BANDS + 2);
  if (!candidates.length) return [sheet];

  // Forward tier-merge stays OFF for every probe in this function (see
  // ExtractOpts' own `noForwardTierMerge` comment) — both the unsplit
  // baseline and every candidate split side get it, so the header-count
  // comparison below stays apples-to-apples; the real, final extraction
  // pass (buildSheetGraph's own calls) never sets it.
  const probeOpts: ExtractOpts = { ...opts, noForwardTierMerge: true };
  const kept: Seam[] = [];
  for (const seam of candidates) {
    // baselineKeys is recomputed PER SEAM (not once for the whole sheet)
    // specifically so the duplicate-title exclusion inside extractedKeys can
    // be gated to this one seam — see its own comment for why a blanket,
    // seam-independent exclusion is unsafe on a sheet that carries both a
    // real dual-strip title (this seam) and a false candidate through one
    // strip's own middle (a different seam, still needing this table's real
    // protection).
    const baselineKeys = extractedKeys(sheet, probeOpts, seam);
    const left = sheet.spans.filter((s) => centerX(s) < seam.x0);
    const right = sheet.spans.filter((s) => centerX(s) > seam.x1);
    if (!sideHasRealTable(left, sheet.key, probeOpts) || !sideHasRealTable(right, sheet.key, probeOpts)) continue;
    const leftSheet: SheetSpans = { key: sheet.key, sheet_number: sheet.sheet_number, spans: left, ...(sheet.segs ? { segs: sheet.segs } : {}) };
    const rightSheet: SheetSpans = { key: sheet.key, sheet_number: sheet.sheet_number, spans: right, ...(sheet.segs ? { segs: sheet.segs } : {}) };
    const splitLeft = extractedKeys(leftSheet, probeOpts);
    const splitRight = extractedKeys(rightSheet, probeOpts);
    const splitCount = (k: string) => Math.max(splitLeft.get(k) ?? 0, splitRight.get(k) ?? 0);
    let lostAny = false;
    for (const [k, n] of baselineKeys) if (splitCount(k) < n) { lostAny = true; break; }
    if (!lostAny) kept.push(seam);
  }
  if (!kept.length) return [sheet];
  kept.sort((a, b) => a.x0 - b.x0);

  const bounds = [-Infinity, ...kept.flatMap((s) => [s.x0, s.x1]).sort((a, b) => a - b), Infinity];
  // bounds pairs up as (-Inf, s1.x0), (s1.x0, s1.x1) [the seam gap itself,
  // always empty by construction — contributes nothing], (s1.x1, s2.x0), …
  const bands: SheetSpans[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 2) {
    const [x0, x1] = [bounds[i], bounds[i + 1]];
    const bandSpans = sheet.spans.filter((s) => { const cx = centerX(s); return cx >= x0 && cx < x1; });
    if (bandSpans.length) bands.push({ key: sheet.key, sheet_number: sheet.sheet_number, spans: bandSpans, ...(sheet.segs ? { segs: sheet.segs } : {}) });
  }
  return bands.length > 1 ? bands.slice(0, MAX_COLUMN_BANDS) : [sheet];
}

// ── the graph ───────────────────────────────────────────────────────────────
export interface SheetGraphSchedule { kind: TableKind; title: string; rows: number; region: Bbox; continues?: string; rotated_headers?: boolean }
export interface SheetGraphSheet { key: string; role: SheetRole; confidence: number; evidence: Evidence | null; building?: string; schedules: SheetGraphSchedule[] }
export interface SheetGraph {
  available: boolean;                 // false = no text layer anywhere (a scanned set) — nothing half-populates
  sheets: SheetGraphSheet[];
  rooms: RoomTag[];                   // numbers CORROBORATED as rooms
  unmatched_tags: UnmatchedTag[];     // numbers that are not, each with its reason — listed, never dropped
  tables: ScheduleTable[];            // LOGICAL tables — a continued schedule is one entry
  callouts: DetailCallout[];
  buildings: string[];                // every building designator the set names, sorted
  revisions: RevisionMarker[];        // every delta/REV marker the set carries — the sheet is under revision where these sit
  notes: string[];                    // named gaps found while building — never silent drops
}

export function buildSheetGraph(sheets: SheetSpans[]): SheetGraph {
  const withText = sheets.filter((s) => s.spans.length > 0);
  if (!withText.length) return { available: false, sheets: [], rooms: [], unmatched_tags: [], tables: [], callouts: [], buildings: [], revisions: [], notes: [] };
  const notes: string[] = [];

  // revision markers, set-wide — where these sit, the current answer is the
  // POST-revision answer and the consumer should know the ink changed. Two
  // detectors: text markers ("Δ2", "REV 2"), and DRAWN deltas — a bare digit
  // inside a digit-scale triangle of linework — on sheets that supplied segs.
  const deltasBySheet = new Map<string, DeltaIndex>();
  const revisions: RevisionMarker[] = [];
  for (const s of withText) {
    const deltas: DeltaIndex = new Map();
    if (s.segs?.length) for (const d of drawnDeltaMarkers(s.spans, s.segs)) deltas.set(d.span, d.tri);
    if (deltas.size) deltasBySheet.set(s.key, deltas);
    for (const sp of s.spans) {
      const tri = deltas.get(sp);
      if (tri) revisions.push({ rev: norm(sp.str), sheet: s.key, bbox: merge(bboxOf(sp), tri), drawn: true });
      else {
        const rev = revisionOf(sp.str);
        if (rev != null) revisions.push({ rev, sheet: s.key, bbox: bboxOf(sp) });
      }
    }
  }

  // pass 0 — building vocabulary from TEXT (sheet titles, table titles): the
  // gate for qualified row keys, known before any extraction
  const ctxBySheet = new Map<string, string>();
  const buildings = new Set<string>();
  for (const s of withText) {
    for (const sp of s.spans) for (const b of buildingMentions(sp.str)) buildings.add(b);
    const ctx = sheetBuilding(s);
    if (ctx) ctxBySheet.set(s.key, ctx.building);
  }

  // pass 1 — roles + per-sheet table fragments
  const roles = new Map<string, ReturnType<typeof classifySheetRole>>();
  const fragments: ScheduleTable[] = [];
  const fragmentKinds = new Map<string, Set<TableKind>>(); // sheet key → kinds extracted there
  // A real, TITLED schedule dropped outright by isNonFinishSchedule below
  // (an architectural/out-of-scope family, or an in-scope family whose own
  // header never independently cleared EQUIPMENT_HEADERS' bar) is still a
  // real table occupying real ink on the sheet — just not one this pipeline
  // indexes anywhere. Tracked here (region/title only, never pushed to
  // `fragments`, so it changes NOTHING about finish/equipment/tag-sweep
  // output) purely so pass 1c below can use its real region as a "reference"-
  // kind claimer too: a structural, vocabulary-free "reference" read that
  // lands (almost entirely) inside a real, named, but deliberately-dropped
  // schedule's own region is that dropped schedule's own ink bleeding through
  // as garbage — a bogus title/columns lifted from data prose deep inside it
  // (real, found live: itd-d1-lab-mechanical.pdf#28's own real "PLUMBING
  // FIXTURE SCHEDULE" — dropped here since "PLUMBING" alone is deliberately
  // not safe to blanket-reclassify as equipment, see isMepEquipmentSchedule's
  // own comment — otherwise left 3 garbled "reference" fragments with titles
  // ripped from its own row prose, "LAVATORY SHIELD"/"ROOF DRAIN", never a
  // second real table), never a genuine second, independent table.
  const droppedNamedTables: ScheduleTable[] = [];
  // Tables reclassified finish→equipment (isMepEquipmentSchedule, below) —
  // tracked by identity so the cross-kind dedup pass still treats one as
  // competing against a genuine, independently-found equipment-kind
  // extraction of the SAME physical table, even though both now report
  // kind "equipment": that dedup only fires when a group spans >= 2 DISTINCT
  // kinds, and two reclassified-to-equipment fragments no longer look
  // distinct without this.
  const reclassified = new Set<ScheduleTable>();
  for (const s of withText) {
    const role = classifySheetRole(s);
    roles.set(s.key, role);
    // A real 2-(or more-)up sheet layout is split into independently-
    // processed column bands here — see bandedSheets' own comment. A sheet
    // with no proven such layout gets back `[s]`, the same object, so every
    // extraction call below runs on the exact same whole-sheet span list as
    // before this existed.
    const bands = bandedSheets(s, { buildings, deltas: deltasBySheet.get(s.key) });
    // Structural "reference" tables (see the section above extractAllTables)
    // — scoped to schedule-role sheets only, a real, disclosed scope limit
    // named in that section's own comment, not an oversight.
    if (role.role === "schedule") {
      // Wide single schedules (VAV TERMINAL BOX with DESIGNATION + performance
      // sub-tiers spanning a column-band seam) must be read from the whole
      // sheet: per-band reference extraction sees only a sub-tier fragment
      // (decimal performance keys) while the title sits in the other band —
      // real, measured on Orange County Public Safety bulk set #50.
      const refSheets = bands.length > 1 ? [s] : bands;
      for (const bs of refSheets) for (const t of extractAllReferenceTables(bs, s)) {
        // A structural "reference" read can be the ONLY successful
        // extraction of a genuine MEP-equipment schedule whose own required
        // rating word (GPM/EWT/LWT/…) never independently co-occurs with its
        // own TAG/MANUFACTURER/MODEL anchor row — real, corpus-found
        // (federal-attachment4-mechanical.pdf's own "HOT WATER CONDENSING
        // BOILER SCHEDULE": its real EWT/LWT rating tier sits two rows below
        // its own TAG/LOCATION/TYPE/MANUFACTURER/MODEL/REMARKS anchor row, a
        // shape nearbyRequiredHit's own bare-hit early break and
        // nearbyRequiredHitWide's backward-only reach both correctly refuse
        // — see their own comments — so the row-based hunt never
        // independently qualifies this table under EITHER finish or
        // equipment vocabulary; it only reaches the graph at all via this
        // vocabulary-free structural reader, landing as reference-kind and
        // staying invisible to the equipment-kind-only takeoff pipeline).
        // Same title-family gate as the finish→equipment reclassification
        // below (isMepEquipmentSchedule), reached from the OTHER direction —
        // a table that never independently qualified under ANY kind's row-
        // vocabulary at all, rather than one that qualified under the wrong
        // one — plus the same real-catalog-anchor requirement every other
        // equipment-kind path in this file already enforces (a table with no
        // TAG/MARK/CODE/SYMBOL/ID column has no real key column an estimator
        // or symbol_sweep can chase, so a title match alone is not enough).
        if (t.title && isMepEquipmentSchedule(t.title.text) && t.headers.some((h) => isBareAnchorHeader(h))) {
          notes.push(`${s.key}: "${t.title.text}" names a real MEP-equipment family but never independently cleared any kind's own row-vocabulary bar (its required rating word never co-occurs with its own anchor row) — reclassified from a structural reference read to equipment-kind.`);
          t.kind = "equipment";
          reclassified.add(t);
        }
        const titleB = t.title ? buildingMentions(t.title.text) : [];
        const b = titleB.length === 1 ? titleB[0] : ctxBySheet.get(s.key);
        if (b) t.building = b;
        fragments.push(t);
        if (!fragmentKinds.has(s.key)) fragmentKinds.set(s.key, new Set());
        fragmentKinds.get(s.key)!.add(t.kind);
      }
    }
    for (const kind of ["room-finish", "finish", "equipment"] as const) {
      // Every table of this kind on the sheet, not just the first — a dense
      // MEP sheet routinely stacks several (#HVAC-boundary), now per band too.
      for (const bs of bands) {
        const extractOpts = { buildings, deltas: deltasBySheet.get(s.key) };
        const found = extractAllTables(bs, kind, extractOpts);
        if (kind === "equipment") found.push(...extractAllQuarterTurnedTables(bs, extractOpts));
        for (const t of found) {
          if (t.title && isReferenceOrSpecTable(t.title.text)) {
            notes.push(`${s.key}: "${t.title.text}" is a reference/cross-reference/specification table, not an instance schedule — its ${t.rows.length} rows are NOT indexed as takeoff instance tags`);
            droppedNamedTables.push(t);
            continue;
          }
        // A DOOR / WINDOW / PARTITION schedule carries a MARK column, so the
        // finish-table hunt happily reads one as a finish/material schedule —
        // and then a finish code that collides with a door mark chains to a
        // door, which is a confidently wrong product in the bid. Field-found on
        // a real grocery set whose DOOR SCHEDULE extracted as 54 "finish" rows.
        // Refuse by TITLE, and only when the title does not also say finish or
        // material: when in doubt the table is kept, and the drop is NAMED.
        if (kind === "finish" && t.title && isNonFinishSchedule(t.title.text)) {
          // A real MEP-equipment family (PUMP/BOILER/HUMIDIFIER/COIL/
          // CHILLER/AHU/VAV/APPLIANCE) is reclassified, not dropped — see
          // isMepEquipmentSchedule's own comment. An architectural family
          // (DOOR/WINDOW/…) still vanishes entirely, exactly as before.
          if (isMepEquipmentSchedule(t.title.text)) {
            notes.push(`${s.key}: "${t.title.text}" names a real MEP-equipment family, not a finish/material schedule — reclassified as equipment-kind rather than dropped (its own header never independently cleared EQUIPMENT_HEADERS' vocabulary bar).`);
            t.kind = "equipment";
            reclassified.add(t);
          } else {
            notes.push(`${s.key}: "${t.title.text}" names another schedule family, not a finish/material schedule — its ${t.rows.length} rows are NOT indexed as finish definitions`);
            droppedNamedTables.push(t);
            continue;
          }
        } else if (kind === "finish" && t.title && hasPoweredEquipmentColumns(bs.spans, t)) {
          // isNonFinishSchedule's own title check never triggered above (this
          // table's title names no recognizable OTHER_FAMILY_RE family at
          // all), but its own region carries real motor/electrical nameplate
          // vocabulary regardless of what its title says — see
          // hasPoweredEquipmentColumns' own comment for why that vocabulary,
          // not title text, is the safe discriminator here.
          notes.push(`${s.key}: "${t.title.text}" carries real motor/electrical nameplate data (VOLTAGE/PHASE/AMPS/HP/ESP/…) inside its own header region, not just a finish/material schedule's own vocabulary — reclassified as equipment-kind (its title alone named no recognizable equipment family, so isMepEquipmentSchedule's own title check never applied).`);
          t.kind = "equipment";
          reclassified.add(t);
        } else if (kind === "equipment" && t.title && isReferenceCrossTable(t.title.text, t.headers)) {
          // A cross-reference/spec table about equipment defined elsewhere
          // (VIBRATION ISOLATION SCHEDULE, a CONNECTION or CALCULATION
          // table) qualified equipment-kind on real EQUIPMENT_HEADERS hits
          // plus a bare MARK/TAG/SYMBOL key column — same shape as a genuine
          // per-item catalog schedule, but it names no catalog identity of
          // its own (no MODEL/MANUFACTURER). Left equipment-kind, its bare-
          // anchor row becomes a second real candidate definition for a tag
          // a dedicated schedule already defines, defeating sweepScheduleRow's
          // own accessory-narrowing (which only fires with EXACTLY one
          // bare-anchor survivor) — see isReferenceCrossTable's own comment.
          notes.push(`${s.key}: "${t.title.text}" names a cross-reference/spec table about equipment defined elsewhere (no MODEL/MANUFACTURER column of its own) — reclassified as reference-kind so its own bare key column never competes as a second device definition.`);
          t.kind = "reference";
        }
        // table-level building: its own title first, the sheet's context second
        const titleB = t.title ? buildingMentions(t.title.text) : [];
        const b = titleB.length === 1 ? titleB[0] : ctxBySheet.get(s.key);
        if (b) t.building = b;
        for (const r of t.rows) if (r.building) buildings.add(r.building);
        fragments.push(t);
        if (!fragmentKinds.has(s.key)) fragmentKinds.set(s.key, new Set());
        fragmentKinds.get(s.key)!.add(t.kind);
      }
      }
    }
  }

  // cross-kind duplicate collapse (project-level takeoff pipeline, this
  // session): the SAME physical table can independently qualify under MORE
  // THAN ONE kind's own vocabulary — real, found live running the new
  // takeoff pipeline against itd-d1-lab-mechanical.pdf#13's own real
  // "BYPASS CONTROL VALVE SCHEDULE": its real headers (SYMBOL/SIZE/
  // MANUFACTURER/REMARKS) clear FINISH_HEADERS' own bar, while its FULL
  // real headers (those plus GPM/TYPE) separately clear EQUIPMENT_HEADERS'
  // — so pass 1's own per-kind loop above extracts the IDENTICAL drawn
  // table TWICE, once under each kind, both with the same real BCV-1 row at
  // the same real bbox. Nothing downstream ever expected two fragments for
  // one physical table: sweep_schedule_row's own row-key lookup throws a
  // genuine "ambiguous: 2 rows carry this key" for a table that only has
  // ONE real row. Collapse same-sheet, same-title, overlapping-region
  // fragments from DIFFERENT kinds down to the richer extraction (more
  // headers recognized, more cells actually populated) — never a guess,
  // since a fuller read of the same real cells strictly dominates a partial
  // one drawn from those same cells. Two fragments of the SAME kind on one
  // sheet are a different, real, legitimate shape (a dense sheet genuinely
  // stacking two distinct schedules of one kind) and are left untouched.
  {
    const byTitleSheet = new Map<string, ScheduleTable[]>();
    for (const f of fragments) {
      if (!f.title) continue;
      const k = `${f.sheet}::${norm(f.title.text)}`;
      if (!byTitleSheet.has(k)) byTitleSheet.set(k, []);
      byTitleSheet.get(k)!.push(f);
    }
    const overlaps = (a: ScheduleTable, b: ScheduleTable) =>
      a.region[0] < b.region[2] && b.region[0] < a.region[2] && a.region[1] < b.region[3] && b.region[1] < a.region[3];
    const richness = (t: ScheduleTable) => t.headers.length * 1000 + t.rows.reduce((n, r) => n + Object.keys(r.cells).length, 0);
    // A reclassified (finish→equipment) fragment must still register as
    // DISTINCT from a genuine equipment-kind extraction of the same table
    // for the purposes of this grouping check — both now carry the same
    // real `.kind`, but they came from different vocabularies and one is
    // typically the poorer read (see MEP_EQUIPMENT_FAMILY_RE's own comment).
    const dedupKind = (t: ScheduleTable) => (reclassified.has(t) ? "finish" : t.kind);
    const drop = new Set<ScheduleTable>();
    for (const group of byTitleSheet.values()) {
      if (group.length < 2 || new Set(group.map(dedupKind)).size < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (drop.has(group[i]) || drop.has(group[j]) || !overlaps(group[i], group[j])) continue;
          // "reference" (the structural, vocabulary-free kind, this
          // session) NEVER wins this tie-break against one of the other
          // three — real, corpus-found regression this guards against
          // (itd-d1-lab-mechanical.pdf#12's own real, already-correctly-
          // extracting "ELECTRONIC EXHAUST VALVE" finish-kind table, 6 real
          // SN-1..SN-5/REMARKS rows): a dense, real MEP sheet's own header
          // can be tiered/scattered enough that NO single physical row
          // independently clears an existing vocabulary's own bar (the
          // "already qualifies" skip above extractReferenceTableAt never
          // fires), so this pass's own structural signals alone can still
          // re-find the SAME real table — but read it far more poorly (a
          // 1-row, garbled-header fragment measured live) than the
          // vocabulary-anchored extraction already did. Raw richness alone
          // let that poorer read win purely by coincidentally counting more
          // header words, silently deleting a real, working table. The
          // other three kinds are mutually battle-tested against each
          // other (this file's own existing corpus-wide sweep, this
          // session and prior); "reference" is new and unproven relative to
          // them, so it only ever LOSES a collision against an established
          // kind, never wins one — richness still decides between two
          // fragments of the SAME kind (both "reference", or the existing
          // three-way case), exactly as before.
          const iRef = group[i].kind === "reference", jRef = group[j].kind === "reference";
          if (iRef !== jRef) { drop.add(iRef ? group[i] : group[j]); continue; }
          const ri = richness(group[i]), rj = richness(group[j]);
          // A GENUINE tie (not just "no clear winner" — the exact same
          // header count AND cell count) between a `finish` and an
          // `equipment` read of the SAME physical table is real, corpus-
          // found live (itd-d1-lab-mechanical.pdf#12's own SNORKEL HOOD
          // SCHEDULE, both reads 5 headers / 25 cells once the garbage-row
          // fix above stopped inflating the finish-kind read by one stray
          // cell): the OLD `>=` comparison always kept group[i] on a tie,
          // silently deciding by kind-loop ORDER (`["room-finish", "finish",
          // "equipment"]` — finish is tried, and so pushed into `fragments`,
          // before equipment ever runs) rather than by which kind actually
          // fits the real table better. An equipment-kind read that ties
          // richness with a finish-kind read of the same table did not get
          // there by accident — it independently cleared EQUIPMENT_HEADERS'
          // own required-rating vocabulary bar (VOLTAGE/AMPS/GPM/AIRFLOW/…),
          // real evidence this is a genuine MEP device schedule, the same
          // real signal isMepEquipmentSchedule's own title-based finish→
          // equipment reclassification above already acts on — so on an
          // exact tie specifically, equipment wins over finish/room-finish,
          // never the reverse. A non-tied richness gap still decides
          // exactly as before either direction; this only ever resolves the
          // otherwise-arbitrary equal case.
          if (ri === rj) {
            const iEq = group[i].kind === "equipment", jEq = group[j].kind === "equipment";
            if (iEq !== jEq) { drop.add(iEq ? group[j] : group[i]); continue; }
          }
          drop.add(ri >= rj ? group[j] : group[i]);
        }
      }
    }
    if (drop.size) {
      notes.push(`${[...drop].map((t) => `${t.sheet}: "${t.title!.text}" (${t.kind}, ${t.rows.length} rows)`).join("; ")} — collapsed as a duplicate cross-kind extraction of a richer table already kept under a different kind.`);
      for (let i = fragments.length - 1; i >= 0; i--) if (drop.has(fragments[i])) fragments.splice(i, 1);
    }
  }

  // pass 1c — region-containment collapse for "reference" fragments whose
  // own bogus title defeats the title-matched dedup just above: real,
  // corpus-found (itd-d1-lab-mechanical.pdf#12's own SNORKEL HOOD SCHEDULE,
  // a finish-kind table extractAllTables already extracts correctly under
  // its real title). extractReferenceTableAt's own structural header-shape
  // detector (isGenericHeaderRow/expandGenericHeaderBlock, above) can mistake
  // a repeated, short, all-caps DATA cell deep inside that table's own body
  // (SNORKEL HOOD SCHEDULE's EXHAUST VALVE column wraps "DUST / HEAT" the
  // same way in every row) for a header row of a SEPARATE table — and its
  // own alreadyVocab guard (see that function's header comment) only re-
  // checks THAT narrow local candidate block against the three vocabularies,
  // never the real header row several rows above, so it does not fire. The
  // fallback title hunt then latches onto the nearest unrelated single-span
  // caption ("DUST /"), which never matches the real table's title
  // ("SNORKEL HOOD SCHEDULE") — so the title-matched dedup above never even
  // groups the two fragments together to compare them. This pass is
  // title-independent and purely geometric: a "reference" fragment whose own
  // region sits (almost) entirely inside a non-reference fragment's region
  // on the SAME sheet is that already-extracted table's own ink, never a
  // second real table — same "reference never wins" principle the
  // title-matched pass above already applies, keyed on containment instead
  // of title equality so a garbled title can no longer hide the collision.
  // Deliberately NOT a general overlap test: two real, independent tables
  // that happen to sit close together on a dense sheet must not collide here
  // — only near-total containment (>= 98% of the reference fragment's own
  // area) counts, which a legitimate standalone table essentially never is.
  {
    const contains = (outer: Bbox, inner: Bbox, tol = 0.02): boolean => {
      const areaInner = Math.max(0, inner[2] - inner[0]) * Math.max(0, inner[3] - inner[1]);
      if (areaInner <= 0) return false;
      const ix0 = Math.max(outer[0], inner[0]), iy0 = Math.max(outer[1], inner[1]);
      const ix1 = Math.min(outer[2], inner[2]), iy1 = Math.min(outer[3], inner[3]);
      const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
      return (iw * ih) / areaInner >= 1 - tol;
    };
    const bySheet = new Map<string, ScheduleTable[]>();
    for (const f of fragments) {
      if (!bySheet.has(f.sheet)) bySheet.set(f.sheet, []);
      bySheet.get(f.sheet)!.push(f);
    }
    // droppedNamedTables' own region counts as a claimer too (see its own
    // comment above) — grouped by sheet the same way, kept OUT of `bySheet`
    // itself so it can never be iterated as a droppable/reclassifiable
    // member (it is not, and never was, in `fragments`), only consulted as
    // extra evidence for what a "reference" fragment's own region collides
    // with.
    const droppedBySheet = new Map<string, ScheduleTable[]>();
    for (const d of droppedNamedTables) {
      if (!droppedBySheet.has(d.sheet)) droppedBySheet.set(d.sheet, []);
      droppedBySheet.get(d.sheet)!.push(d);
    }
    const drop = new Set<ScheduleTable>();
    for (const [sheetKey, group] of bySheet) {
      const realClaimers = group.filter((t) => t.kind !== "reference");
      const dropped = droppedBySheet.get(sheetKey) ?? [];
      if (!realClaimers.length && !dropped.length) continue;
      for (const t of group) {
        if (t.kind !== "reference" || drop.has(t)) continue;
        if (realClaimers.some((c) => contains(c.region, t.region))) { drop.add(t); continue; }
        // A DROPPED named table's own region is held to a looser bar here
        // (10%, not 2%) than an already-extracted, kept table's region —
        // real, measured live: itd-d1-lab-mechanical.pdf#28's own dropped
        // "PLUMBING FIXTURE SCHEDULE" (real, but named-and-dropped by
        // isNonFinishSchedule — see droppedNamedTables' own comment) reads
        // its rightmost MANUFACTURER/MODEL/DESCRIPTION column's own true
        // width conservatively — that column's own recovered data-column
        // edge sits at whatever the SHORTEST wrapped cell text in that
        // vocab-kind read happened to reach, not the widest — while its two
        // real, spurious "reference"-kind leaks of the SAME table's own
        // rows ("LAVATORY SHIELD"/4 rows, "ROOF DRAIN"/13 rows, both real
        // rows of that same table, never a second one) are read by a
        // DIFFERENT extractor pass with no such column model, so their own
        // bbox runs a bit further right, out to that column's real drawn
        // width — measured live, 93.2%/93.5% contained, both short of the
        // 98% bar a genuinely separate table essentially never reaches. A
        // dropped table was never trusted to have a clean column model to
        // begin with (that's WHY it was dropped — its own header never
        // independently cleared a real kind's vocabulary bar), so a modest
        // extra margin here costs nothing a real, independent table would
        // ever need to clear (an unrelated table sitting merely NEAR a
        // dropped one's edge is nowhere close to 90% contained in it).
        if (dropped.some((c) => contains(c.region, t.region, 0.1))) drop.add(t);
      }
    }
    if (drop.size) {
      notes.push(`${[...drop].map((t) => `${t.sheet}: "${t.title?.text ?? "(untitled)"}" (reference, ${t.rows.length} rows)`).join("; ")} — collapsed: region lies inside an already-extracted finish/equipment/room-finish table on the same sheet.`);
      for (let i = fragments.length - 1; i >= 0; i--) if (drop.has(fragments[i])) fragments.splice(i, 1);
    }
  }

  // pass 2 — merge continuations (header repeated), in sheet order
  const tables: ScheduleTable[] = [];
  for (const f of fragments) {
    const base = f.title && isContinuationTitle(f.title.text) ? findContinuationBase(tables, f) : null;
    if (base) mergeContinuation(base, f);
    else {
      if (f.title && isContinuationTitle(f.title.text)) {
        notes.push(`${f.sheet}: "${f.title.text}" reads as a continuation but no earlier ${f.kind} table matches — kept as a standalone table`);
      }
      tables.push(f);
    }
  }

  // pass 2b — header-less continuations: a "… SCHEDULE … CONT'D" TITLE on a
  // sheet that yielded no table of that kind adopts the base's anchors
  for (const s of withText) {
    for (const sp of s.spans) {
      const text = sp.str.trim();
      if (!isContinuationTitle(text)) continue;
      const fragBase = baseTitleOf(text);
      const base = [...tables].reverse().find((t) => t.kind !== "unknown" && t.title && baseTitleOf(t.title.text) === fragBase
        && t.sheet !== s.key && !t.parts?.some((p) => p.sheet === s.key));
      if (!base || fragmentKinds.get(s.key)?.has(base.kind)) continue;
      const adopted = adoptContinuationRows(s, sp, base, buildings, deltasBySheet.get(s.key));
      if (adopted) {
        if (adopted.building == null && ctxBySheet.get(s.key)) adopted.building = ctxBySheet.get(s.key);
        mergeContinuation(base, adopted);
        for (const r of adopted.rows) if (r.building) buildings.add(r.building);
      } else {
        notes.push(`${s.key}: "${text}" reads as a continuation of ${base.sheet} but no rows aligned to that table's columns — rows there are NOT indexed`);
      }
    }
  }

  // pass 2c — a "reference"-kind row that collides, by real row key, with an
  // established finish/equipment/room-finish row ANYWHERE else in the graph
  // is dropped as noise, not kept as a genuine second row. Real, found live
  // (project-level takeoff pipeline, itd-d1-lab-mechanical.pdf): the
  // structural "reference" heuristic (already disclosed as noisy outside
  // bessemer — see extractAllReferenceTables' own header) picked up a
  // garbled data blob on an UNRELATED sheet (#15, a genuinely different
  // AHU-1 spec table) whose own cell text happened to start with "HUM-1" —
  // a real, correctly-keyed HUMIDIFIER SCHEDULE row that already exists,
  // cleanly, on sheet #13. `rowKeyAnswersFor` matches across every table in
  // the graph regardless of kind, so this collision surfaced downstream as a
  // real "2 schedule rows carry this key" ambiguity for a tag that only has
  // ONE real row. The vocabulary-anchored kinds (finish/equipment/room-
  // finish) are the more reliable source for any key they've already
  // established — "reference" never gets to introduce a duplicate of it.
  {
    const nonReferenceKeys = new Set<string>();
    for (const t of tables) if (t.kind !== "reference") for (const r of t.rows) nonReferenceKeys.add(norm(r.key));
    for (const t of tables) {
      if (t.kind !== "reference") continue;
      const dropped = t.rows.filter((r) => nonReferenceKeys.has(norm(r.key)));
      if (dropped.length) {
        t.rows = t.rows.filter((r) => !nonReferenceKeys.has(norm(r.key)));
        notes.push(`${t.sheet}: "reference" table's own row key(s) ${dropped.map((r) => r.key).join(", ")} collide with an already-established finish/equipment/room-finish row elsewhere in the set — dropped as noise, not kept as a duplicate.`);
      }
    }
  }

  // pass 2d — self-referential orphan-bleed collapse: bandDataRows's own
  // "never drop a digit-keyed orphan row" rule (see its header comment,
  // ledger item 29) exists so a real tag with NO other home is never
  // silently lost — a genuine, if badly-columned, sighting beats none at
  // all. That defense stops being the right call once the same tag turns
  // out to have a REAL home elsewhere: real, found live on
  // itd-d1-lab-mechanical.pdf#14, AFTER this session's own header-detection
  // work let its real "PENTHOUSE SCHEDULE" (SYMBOL/SIZE/MINIMUM FREE
  // FINISH/REMARKS, 4 real columns) qualify on its own — the same sheet's
  // unrelated "ELECTRIC HEATER SCHEDULE" still carries the stray 1-cell
  // "REMARKS: PH-1" row bandDataRows's orphan-fold grabbed from the
  // Penthouse table's own SYMBOL cell (identical bbox) back when Penthouse
  // had no header of its own to claim it. Two real rows for one real tag,
  // downstream (sweep_schedule_row) reads as a false "2 rows carry this
  // key" ambiguity. The orphan's tell is narrow and specific, not just
  // "thin": its ENTIRE cell content, normalized, restates nothing but its
  // own key — no independent column value survived the bleed at all — and
  // a genuinely richer (2+ populated cells) same-keyed row exists
  // elsewhere in the graph. A real sparse row (a legitimately blank BASE/
  // WALL, a room reused across buildings) always carries at least one cell
  // whose text is NOT simply its own key restated, so this never touches
  // that case; and a tag whose only sightings are ALL this same bare-key
  // shape is left alone too — dropping every copy would recreate the exact
  // silent loss the orphan-keep rule exists to prevent.
  {
    const byKey = new Map<string, { t: ScheduleTable; r: TableRow }[]>();
    for (const t of tables) for (const r of t.rows) {
      const k = norm(r.key);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push({ t, r });
    }
    for (const [key, entries] of byKey) {
      if (entries.length < 2) continue;
      const isBareEcho = (r: TableRow) => {
        const vals = Object.values(r.cells);
        return vals.length > 0 && vals.every((c) => norm(c.text) === key);
      };
      const hasRicherTwin = entries.some((e) => Object.keys(e.r.cells).length >= 2);
      if (!hasRicherTwin) continue;
      for (const e of entries) {
        if (!isBareEcho(e.r)) continue;
        e.t.rows = e.t.rows.filter((r) => r !== e.r);
        notes.push(`${e.t.sheet}: "${e.t.title?.text || e.t.kind}" row "${e.r.key}" collapsed as a self-referential orphan bleed of a richer same-keyed row already established elsewhere in the set.`);
      }
    }
  }

  // pass 3 — room tags (full building vocabulary known) + callouts. Room tags
  // read off PLAN-role sheets AND unknowns — a schedule sheet's room-number
  // column must not mint phantom rooms, so schedule/legend sheets contribute
  // rows, not tags.
  const sheetNumbers = new Set<string>();
  for (const s of sheets) {
    const n = norm(s.sheet_number || "").replace(/[^A-Z0-9]/g, "");
    if (n) sheetNumbers.add(n);
  }
  const found: RoomTag[] = [];
  const callouts: DetailCallout[] = [];
  for (const s of withText) {
    const role = roles.get(s.key)!;
    // Read tags unless the sheet is CONFIDENTLY something that carries room
    // numbers as table content rather than as drawing tags. A weak guess must
    // not suppress the reading: a real finish plan whose title block the role
    // hunt could not parse came back "detail" at 0.3 confidence, and that
    // single soft signal silently hid every room on the sheet.
    const suppresses = (role.role === "schedule" || role.role === "legend" || role.role === "elevation" || role.role === "detail") && role.confidence >= 0.6;
    if (!suppresses) {
      const ctxB = ctxBySheet.get(s.key);
      const banned = droppedNamedTables.filter((d) => d.sheet === s.key).map((d) => d.region);
      for (const r of roomTags(s, { buildings, exclude: sheetNumbers, deltas: deltasBySheet.get(s.key) })) {
        const cx = (r.bbox[0] + r.bbox[2]) / 2, cy = (r.bbox[1] + r.bbox[3]) / 2;
        if (banned.some((b) => cx >= b[0] && cy >= b[1] && cx <= b[2] && cy <= b[3])) continue;
        if (r.building == null && ctxB) r.building = ctxB;
        found.push(r);
      }
    }
    callouts.push(...detailCallouts(s));
  }

  // ── pass 3b: is that number actually a ROOM? (#87 phase 4) ────────────────
  // A finish plan is covered in 2–3 digit numbers that are not rooms: keynote
  // hexagons, detail markers, dimension fragments. Measured across five real
  // sets, they were a third of everything the tag reader returned — and every
  // one came back "no schedule row", which reads like a room missing from the
  // schedule (the lost-bid case) when it is nothing of the kind. Two honest
  // signals CORROBORATE a number as a room:
  //   name     — a room name sits stacked with it, the drafting convention;
  //   schedule — a room-finish row answers for that number.
  // A number with neither is not called a room and is not dropped either: it
  // goes to unmatched_tags WITH its reason, so a real room the schedule
  // forgot is still visible — just not counted as an answered room.
  const roomRows = tables.filter((t) => t.kind === "room-finish");
  const scheduleNums = new Set<string>();
  for (const t of roomRows) for (const r of t.rows) scheduleNums.add(numOf(norm(r.key)));
  const rooms: RoomTag[] = [];
  const unmatched: UnmatchedTag[] = [];
  for (const r of found) {
    const num = numOf(norm(r.tag).replace(/\s+/g, ""));
    const byName = !!r.name.trim();
    const bySchedule = scheduleNums.has(num);
    // Where the set HAS a room-finish schedule, that schedule is the
    // authority on which numbers are rooms. A drawn name is not enough on its
    // own: a keynote legend ("10  LOCKER ROOM ACCESSORY", "13  MIRROR") pairs
    // a number with a description exactly the way a room bubble pairs one
    // with a name, and measured across real sets the name-only signal fired
    // on legend rows and never on a genuine room the schedule had missed.
    // So a named number the schedule does not list is still surfaced — under
    // its OWN reason, which is the one an estimator needs to read.
    if (bySchedule || (byName && !roomRows.length)) {
      r.corroboration = bySchedule ? (byName ? "name+schedule" : "schedule") : "name";
      rooms.push(r);
    } else {
      unmatched.push({
        tag: r.tag, sheet: r.sheet, bbox: r.bbox, ...(r.building ? { building: r.building } : {}),
        ...(byName ? { name: r.name } : {}),
        reason: !roomRows.length
          ? "no room name drawn with it, and the set carries no room-finish schedule to check it against"
          : byName
            ? `"${r.name}" is drawn with it but no room-finish row answers for it — either a room the schedule omits, or a keynote/legend row; LOOK before pricing it`
            : "no room name drawn with it and no room-finish row answers for it — reads as a keynote, detail marker or dimension fragment rather than a room",
      });
    }
  }
  if (unmatched.length) {
    notes.push(`${unmatched.length} numbered tag(s) on plan sheets are NOT counted as rooms — no name drawn with them and no schedule row answers for them; see unmatched_tags (they are listed, never dropped)`);
  }

  // compose the per-sheet view from the LOGICAL tables' parts
  const outSheets: SheetGraphSheet[] = withText.map((s) => {
    const role = roles.get(s.key)!;
    const schedules: SheetGraphSchedule[] = [];
    for (const t of tables) {
      const parts: TablePart[] = t.parts ?? [{ sheet: t.sheet, title: t.title?.text || "", rows: t.rows.length, region: t.region, ...(t.rotated_headers ? { rotated_headers: true } : {}) }];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.sheet !== s.key) continue;
        schedules.push({
          kind: t.kind, title: p.title || t.title?.text || "", rows: p.rows, region: p.region,
          ...(i > 0 ? { continues: t.sheet } : {}),
          ...(p.rotated_headers ? { rotated_headers: true } : {}),
        });
      }
    }
    const entry: SheetGraphSheet = { key: s.key, role: role.role, confidence: role.confidence, evidence: role.evidence, schedules };
    const b = ctxBySheet.get(s.key);
    if (b) entry.building = b;
    return entry;
  });

  return { available: true, sheets: outSheets, rooms, unmatched_tags: unmatched, tables, callouts, buildings: [...buildings].sort(), revisions, notes };
}

// ── resolution ──────────────────────────────────────────────────────────────
// resolve a room tag: plan tag → room-finish row → finish definitions.
// Finish cells are the room-finish row's FLOOR/BASE/WALL-ish columns; each
// resolved code chains to the finish table's definition when one exists.
// Phase 2: the tag may be building-qualified ("A-134"); an UNQUALIFIED tag
// that matches rows in more than one building refuses and LISTS the
// candidates — the first match is exactly the wrong answer in a multi-
// building set.
export interface ResolvedFinish { surface: string; code: string; source: Evidence; definition?: { cells: Record<string, string>; source: Evidence } }
export interface ResolveCandidate { key: string; building?: string; sheet: string; table: string }
export type ResolveResult =
  | { status: "resolved"; tag: string; room: RoomTag | null; building?: string; finishes: ResolvedFinish[]; sources: Evidence[]; revisions?: RowRevision[] }
  | { status: "unresolved"; tag: string; room: RoomTag | null; reason: string; candidates?: ResolveCandidate[] };

const SURFACE_HEADERS = ["FLOOR", "BASE", "WALL", "WALLS", "NORTH", "SOUTH", "EAST", "WEST", "CEILING", "WAINSCOT"];
/** A surface column, including a two-tier sub-column ("WALLS N"): the LEADING
 * word names the surface, the rest qualifies it. Ranked so a row's finishes
 * always come back FLOOR-first regardless of the sheet's column order. */
const surfaceRank = (label: string): number => SURFACE_HEADERS.indexOf(label.split(" ")[0]);

export function resolveTag(graph: SheetGraph, tag: string): ResolveResult {
  const t = norm(tag).replace(/\s+/g, "");
  const q = t.match(QUALIFIED_KEY_RE);
  const wantB = q ? q[1] : null;
  const num = q ? q[2] : t;

  // Citation draws on the UNCORROBORATED tags too. A number the schedule
  // never lists is not counted as a room, but when someone asks about it the
  // refusal must still point at the ink on the plan — that plan bubble is the
  // whole evidence that a room may have been left out of the schedule, and
  // dropping it is how the bid loses the room.
  const asRoom = (u: UnmatchedTag): RoomTag => ({ tag: u.tag, name: u.name ?? "", sheet: u.sheet, bbox: u.bbox, ...(u.building ? { building: u.building } : {}) });
  const candidates: RoomTag[] = [...graph.rooms, ...graph.unmatched_tags.map(asRoom)];
  const rooms = candidates.filter((r) => {
    const rt = norm(r.tag).replace(/\s+/g, "");
    return rt === t || numOf(rt) === num;
  });
  const pickRoom = (b: string | null): RoomTag | null => {
    if (b) return rooms.find((r) => r.building === b) ?? rooms.find((r) => !r.building) ?? null;
    const distinct = new Set(rooms.map((r) => r.building || ""));
    return distinct.size > 1 ? null : rooms[0] ?? null; // citing ONE of two buildings' tags would be quietly wrong
  };

  const roomTables = graph.tables.filter((x) => x.kind === "room-finish");
  if (!roomTables.length) return { status: "unresolved", tag: t, room: pickRoom(wantB), reason: "no room-finish schedule found in the set" };

  interface Cand { tab: ScheduleTable; r: TableRow; building?: string }
  const cands: Cand[] = [];
  for (const tab of roomTables) {
    for (const r of tab.rows) {
      if (numOf(norm(r.key)) !== num) continue;
      const b = r.building ?? tab.building;
      cands.push({ tab, r, ...(b ? { building: b } : {}) });
    }
  }
  const describe = (c: Cand) => `${c.building ? `building ${c.building}` : "no building"} (${c.r.sheet})`;
  const wire = (c: Cand): ResolveCandidate => ({ key: c.r.key, ...(c.building ? { building: c.building } : {}), sheet: c.r.sheet, table: c.tab.title?.text || `${c.tab.kind} schedule` });

  let chosen: Cand;
  if (wantB) {
    const filtered = cands.filter((c) => c.building === wantB);
    if (!filtered.length) {
      if (!graph.buildings.length) {
        return { status: "unresolved", tag: t, room: pickRoom(wantB), reason: `the set names no buildings — no BUILDING/BLDG text or qualified schedule keys anywhere; try resolve_tag "${num}"`, ...(cands.length ? { candidates: cands.map(wire) } : {}) };
      }
      if (!graph.buildings.includes(wantB)) {
        return { status: "unresolved", tag: t, room: pickRoom(wantB), reason: `the set names no building "${wantB}" (buildings found: ${graph.buildings.join(", ")})`, ...(cands.length ? { candidates: cands.map(wire) } : {}) };
      }
      if (cands.length) {
        return { status: "unresolved", tag: t, room: pickRoom(wantB), reason: `no building-${wantB} schedule row for ${num} — ${num} is listed under ${cands.map(describe).join(", ")}`, candidates: cands.map(wire) };
      }
      return { status: "unresolved", tag: t, room: pickRoom(wantB), reason: `no schedule row for ${t} — the plan shows the room but no room-finish table lists it` };
    }
    if (filtered.length > 1) {
      return { status: "unresolved", tag: t, room: pickRoom(wantB), reason: `ambiguous: ${filtered.length} schedule rows match ${t} (${filtered.map((c) => c.r.sheet).join(", ")})`, candidates: filtered.map(wire) };
    }
    chosen = filtered[0];
  } else {
    if (!cands.length) return { status: "unresolved", tag: t, room: pickRoom(null), reason: `no schedule row for ${t} — the plan shows the room but no room-finish table lists it` };
    if (cands.length > 1) {
      const distinctB = [...new Set(cands.filter((c) => c.building).map((c) => c.building!))];
      if (distinctB.length > 1) {
        return {
          status: "unresolved", tag: t, room: null,
          reason: `ambiguous: room ${num} appears in ${distinctB.length} buildings — ${cands.map(describe).join(", ")} — qualify the tag, e.g. "${distinctB[0]}-${num}"`,
          candidates: cands.map(wire),
        };
      }
      return { status: "unresolved", tag: t, room: pickRoom(null), reason: `ambiguous: ${cands.length} schedule rows match ${t} (room numbers reused across the set?)`, candidates: cands.map(wire) };
    }
    chosen = cands[0];
  }

  const { tab, r } = chosen;
  const room = pickRoom(chosen.building ?? null);
  const finTables = graph.tables.filter((x) => x.kind === "finish");
  const finishes: ResolvedFinish[] = [];
  const sources: Evidence[] = [{ sheet: r.sheet, text: `${tab.title?.text || "room-finish schedule"} row ${r.key}`, bbox: r.cells[Object.keys(r.cells)[0]]?.bbox || tab.region }];
  if (room) sources.unshift({ sheet: room.sheet, text: `${room.name ? room.name + " " : ""}${room.tag}`.trim(), bbox: room.bbox });
  const surfaces = Object.keys(r.cells)
    .filter((k) => surfaceRank(k) >= 0)
    .sort((a, b) => surfaceRank(a) - surfaceRank(b) || a.localeCompare(b));
  for (const surface of surfaces) {
    const cell = r.cells[surface];
    if (!cell || !cell.text.trim()) continue;
    const code = norm(cell.text).replace(/[^A-Z0-9-]/g, "");
    const fin: ResolvedFinish = { surface, code: cell.text.trim(), source: { sheet: r.sheet, text: cell.text.trim(), bbox: cell.bbox } };
    for (const ft of finTables) {
      const def = ft.rows.find((fr) => rowKeyAnswersFor(fr.key, code));
      if (def) {
        const cells: Record<string, string> = {};
        for (const [k, v] of Object.entries(def.cells)) cells[k] = v.text;
        fin.definition = { cells, source: { sheet: def.sheet, text: `${ft.title?.text || "finish schedule"} row ${def.key}`, bbox: def.cells[Object.keys(def.cells)[0]]?.bbox || ft.region } };
        break;
      }
    }
    finishes.push(fin);
  }
  if (!finishes.length) return { status: "unresolved", tag: t, room, reason: `schedule row ${t} exists but carries no finish cells the extractor could band` };
  // revision markers on the answering row or the plan bubble ride the result:
  // the codes above are the POST-revision answer, but the consumer must know
  // the ink changed — a delta read silently is a superseded number priced
  // confidently
  const revs: RowRevision[] = [];
  if (r.revision) revs.push(r.revision);
  if (room?.revision && !revs.some((v) => v.rev === room.revision!.rev)) revs.push(room.revision);
  return { status: "resolved", tag: t, room, ...(chosen.building ? { building: chosen.building } : {}), finishes, sources, ...(revs.length ? { revisions: revs } : {}) };
}

// ═══════════════════════════════════════════════════════════════════════
// OpenDataLoader-PDF grid adapter (2026-08-28)
// ═══════════════════════════════════════════════════════════════════════
// OpenDataLoader-PDF (github.com/opendataloader-project/opendataloader-pdf,
// Apache-2.0) is a deterministic, rule-based table-structure detector that
// reads a PDF's own embedded vector text/geometry directly (no OCR, no
// rasterization) and returns real row/column/rowspan/colspan structure.
// Brought in after this file's own hand-rolled geometric header-tier-merging
// heuristics (mergeOrMintSubAnchors/genuineParentOver/subTierAnchors/etc.
// above) hit real, disclosed diminishing returns on the corpus's hardest
// tables — most concretely, itd-d1-lab-mechanical.pdf#15's own 47-column,
// 3-header-tier AIR HANDLING UNIT SCHEDULE, where ODL correctly binds every
// column (including MANUFACTURER AND MODEL = "DAIKIN DPSA040") that an
// entire night's worth of iterative geometric fixes still could not reach.
//
// This adapter takes ODL's own already-correct grid (real row/col spans) and
// maps it onto this project's OWN ScheduleTable/TableRow/Anchor types and
// OWN domain logic (kind classification via ROOM_HEADERS/FINISH_HEADERS/
// EQUIPMENT_HEADERS, rowKeyOf) — it does NOT reimplement or replace any of
// that domain logic, only the structural header/column-boundary-detection
// layer above, which was always the weakest, most corpus-fragile part of
// this file. mcp/src/opendataloader.ts owns actually RUNNING the ODL CLI and
// handing this pure function its parsed JSON; nothing here touches a
// filesystem or a child process, so it stays usable from the browser too if
// a caller ever gets ODL's JSON output some other way.

export interface ODLParagraph { type: string; content?: string; kids?: ODLParagraph[] }
export interface ODLTableCell {
  type: "table cell";
  id: number;
  "page number": number;
  "bounding box": number[];
  "row number": number;
  "column number": number;
  "row span": number;
  "column span": number;
  kids: ODLParagraph[];
}
export interface ODLTableRow { type: "table row"; "row number": number; id: number; cells: ODLTableCell[] }
export interface ODLTable {
  type: "table";
  id: number;
  "page number": number;
  "bounding box": number[];
  "number of rows": number;
  "number of columns": number;
  rows: ODLTableRow[];
}

function odlCellText(cell: ODLTableCell): string {
  const parts: string[] = [];
  const walk = (n: ODLParagraph) => {
    if (n.content) parts.push(n.content.trim());
    for (const k of n.kids || []) walk(k);
  };
  for (const k of cell.kids || []) walk(k);
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Recover the text that is actually visible when a PDF paints two different
 * strings at effectively the same coordinates. Some CAD exports retain a
 * superseded value in the text layer, then paint the revised value directly
 * over it. ODL concatenates both into one cell even though the rendered sheet
 * shows only the later-painted string. Only act when the ODL cell contains
 * every conflicting source token and their boxes overlap by at least 80%;
 * ordinary multi-token cells are left unchanged. */
/** Compact alphanumeric form for matching ODL cell text to pdf.js spans. */
function compactSpanText(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, "");
}

function spanCenterInBbox(span: GraphSpan, bbox: Bbox, pad = 2): boolean {
  const cx = span.x + span.w / 2;
  const cy = span.y + span.h / 2;
  return cx >= bbox[0] - pad && cx <= bbox[2] + pad && cy >= bbox[1] - pad && cy <= bbox[3] + pad;
}

/**
 * When ODL recovers correct cell TEXT but its grid bbox misses the painted
 * pdf.js glyph (common on quarter-turned / sideways schedule detections whose
 * native boxes land on header strips), snap each cell bbox to an exact
 * sourceSpan whose text matches. Unique sheet-wide values establish the row
 * band first; ambiguous values (shared labels like "CARRIER" or "5") then
 * snap onto that band. No unique match → leave the ODL bbox unchanged.
 */
export function snapCellBboxesToSourceSpans(table: ScheduleTable, sourceSpans: GraphSpan[]): ScheduleTable {
  if (!sourceSpans?.length || !table.rows?.length) return table;
  const ROW_Y_TOL = 28;
  const COL_X_TOL = 28;
  const isHorizontal = (span: GraphSpan) => (span.w || 0) >= (span.h || 0) * 0.9;
  const isVerticalBox = (bbox: Bbox) => (bbox[3] - bbox[1]) > (bbox[2] - bbox[0]) * 1.1;
  const exactSpans = (want: string): GraphSpan[] => {
    const needle = compactSpanText(want);
    if (!needle) return [];
    return sourceSpans.filter((span) => compactSpanText(span.str) === needle);
  };
  const pickNearAxis = (
    candidates: GraphSpan[],
    axis: "y" | "x",
    center: number | null,
    tol: number,
  ): GraphSpan | null => {
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    let pool = candidates;
    if (center != null) {
      const band = candidates.filter((span) => {
        const mid = axis === "y" ? span.y + span.h / 2 : span.x + span.w / 2;
        return Math.abs(mid - center) <= tol;
      });
      if (!band.length) return null;
      pool = band;
    } else {
      return null; // ambiguous with no band — do not guess
    }
    if (pool.length === 1) return pool[0];
    // Prefer orientation matching the schedule axis: horizontal rows vs
    // quarter-turned columns (tall/thin glyph stacks).
    const preferVert = axis === "x";
    const oriented = pool.filter((span) => preferVert ? !isHorizontal(span) : isHorizontal(span));
    if (oriented.length) pool = oriented;
    return pool.slice().sort((a, b) => {
      const aMid = axis === "y" ? a.y + a.h / 2 : a.x + a.w / 2;
      const bMid = axis === "y" ? b.y + b.h / 2 : b.x + b.w / 2;
      const d = Math.abs(aMid - center!) - Math.abs(bMid - center!);
      if (d) return d;
      return a.x - b.x || a.y - b.y;
    })[0];
  };

  const rows = table.rows.map((row) => {
    const cells = { ...row.cells };
    // Clone cell objects so we don't mutate shared graph state unexpectedly.
    for (const [header, cell] of Object.entries(cells)) {
      cells[header] = { ...cell, bbox: [...cell.bbox] as Bbox };
    }

    const alreadyGrounded = (cell: { text: string; bbox: Bbox }) =>
      exactSpans(cell.text).some((span) => spanCenterInBbox(span, cell.bbox));

    // Prefer the row-key / MARK cell as the axis seed when it is already a
    // tall thin (quarter-turned) or wide (normal) glyph span.
    const keyHeader = Object.keys(cells).find((header) => {
      const cell = cells[header];
      return cell && compactSpanText(cell.text) === compactSpanText(row.key);
    });
    const keyCell = keyHeader ? cells[keyHeader] : null;
    const columnMode = !!(keyCell && alreadyGrounded(keyCell) && isVerticalBox(keyCell.bbox));

    // Pass 1: snap uniquely-occurring values (and keep already-grounded ones).
    const axisCenters: number[] = [];
    for (const cell of Object.values(cells)) {
      const hits = exactSpans(cell.text);
      if (alreadyGrounded(cell)) {
        const hit = hits.find((span) => spanCenterInBbox(span, cell.bbox));
        if (hit) {
          axisCenters.push(columnMode ? hit.x + hit.w / 2 : hit.y + hit.h / 2);
        }
        continue;
      }
      if (hits.length === 1) {
        cell.bbox = bboxOf(hits[0]);
        axisCenters.push(columnMode ? hits[0].x + hits[0].w / 2 : hits[0].y + hits[0].h / 2);
      }
    }
    const axisCenter = axisCenters.length
      ? axisCenters.slice().sort((a, b) => a - b)[Math.floor(axisCenters.length / 2)]
      : (keyCell && columnMode
        ? (keyCell.bbox[0] + keyCell.bbox[2]) / 2
        : null);

    // Pass 2: snap remaining cells onto the consensus row-Y or column-X band.
    if (axisCenter != null) {
      const axis = columnMode ? "x" : "y";
      const tol = columnMode ? COL_X_TOL : ROW_Y_TOL;
      for (const cell of Object.values(cells)) {
        if (alreadyGrounded(cell)) continue;
        const picked = pickNearAxis(exactSpans(cell.text), axis, axisCenter, tol);
        if (picked) cell.bbox = bboxOf(picked);
      }
    }

    return { ...row, cells };
  });

  let title = table.title;
  if (title?.text && sourceSpans.length) {
    const titleHits = exactSpans(title.text);
    const already = titleHits.some((span) => spanCenterInBbox(span, title!.bbox));
    if (!already) {
      const horiz = titleHits.filter(isHorizontal);
      const pool = horiz.length ? horiz : titleHits;
      if (pool.length === 1) title = { ...title, bbox: bboxOf(pool[0]) };
    }
  }

  return { ...table, title, rows };
}

export function preferLastOverprintedText(cellText: string, bbox: Bbox, sourceSpans: GraphSpan[]): string {
  const inCell = sourceSpans
    .map((span, sourceIndex) => ({ span, sourceIndex }))
    .filter(({ span }) => {
      const cx = span.x + span.w / 2;
      const cy = span.y + span.h / 2;
      return cx >= bbox[0] - 2 && cx <= bbox[2] + 2 && cy >= bbox[1] - 2 && cy <= bbox[3] + 2;
    });
  if (inCell.length < 2) return cellText;
  const area = (span: GraphSpan) => Math.max(1, span.w * span.h);
  const overlap = (a: GraphSpan, b: GraphSpan) => {
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    return Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / Math.min(area(a), area(b));
  };
  const compactText = (value: string) => norm(value).replace(/[^A-Z0-9.]/g, "");
  const cellCompact = compactText(cellText);
  const drop = new Set<number>();
  let conflict = false;
  for (let i = 0; i < inCell.length; i++) {
    for (let j = i + 1; j < inCell.length; j++) {
      const a = inCell[i], b = inCell[j];
      if ((a.span.rot ?? 0) !== (b.span.rot ?? 0) || overlap(a.span, b.span) < 0.8) continue;
      const at = compactText(a.span.str), bt = compactText(b.span.str);
      if (!at || !bt || at === bt || !cellCompact.includes(at) || !cellCompact.includes(bt)) continue;
      conflict = true;
      drop.add(a.sourceIndex < b.sourceIndex ? a.sourceIndex : b.sourceIndex);
    }
  }
  if (!conflict) return cellText;
  const visible = inCell
    .filter(({ sourceIndex }) => !drop.has(sourceIndex))
    .sort((a, b) => a.span.y - b.span.y || a.span.x - b.span.x)
    .map(({ span }) => span.str.trim())
    .filter(Boolean)
    .join(" ");
  return visible || cellText;
}

/** ODL reports every bounding box in the PDF's own native user-space points
 * (x right, y UP from the page's bottom-left) — confirmed by direct
 * measurement against this project's own `textSpans()` output for the same
 * title span on the same real page (itd-d1-lab-mechanical.pdf#15: x matched
 * to within 0.05px, y within ~8px of a ~40px-tall glyph box — the residual
 * is font-metric convention, not a coordinate-system mismatch). This
 * project's own GraphSpan/Bbox space is pdf.js's own viewport-transformed
 * image-px (RENDER_SCALE=2, origin top-left, y DOWN) — the exact 6-element
 * affine `pageViewportTransform` (pdf.js's `viewport.transform`, the SAME
 * matrix `textSpans()` itself composes against `it.transform`) converts one
 * space to the other correctly regardless of page rotation, unlike a fixed
 * "(pageHeightPt - y) * 2" shortcut which only holds at rotate=0. */
function odlBboxToProjectSpace(b: number[], pageViewportTransform: number[]): Bbox {
  const [a, bb, c, d, e, f] = pageViewportTransform;
  const pt = (x: number, y: number): [number, number] => [a * x + c * y + e, bb * x + d * y + f];
  const corners = [pt(b[0], b[1]), pt(b[2], b[1]), pt(b[0], b[3]), pt(b[2], b[3])];
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const ALL_HEADER_WORDS_ARR = [...ALL_HEADER_WORDS];

/** ODL reports its row/column grid in the PDF's own native (page-rotation-
 * oblivious) content-stream order. `odlBboxToProjectSpace` (above) already
 * corrects every cell's own GEOMETRY for the page's `/Rotate`, but a real
 * schedule table that is ALSO drawn fully sideways in that native space —
 * every one of its own cells, header labels AND data alike, not merely a
 * header tier (this file's already-handled `rotated_headers` case, which
 * only ever rotates the LABEL text over otherwise-horizontal data) — comes
 * back from ODL with its per-item axis and per-attribute axis genuinely
 * swapped relative to what the rest of this function assumes (row = one
 * item, column = one attribute, title = row 1's own lone cell spanning
 * nearly every column). Real, confirmed shape (bldg5406-hvac-demo's own
 * M-601 AIR TERMINAL BOX SCHEDULE, VAV-1..9, TRANE/VCEF): ODL reports the
 * title as ONE cell at row 1, its own column, with ROW SPAN ≈ the table's
 * full row count — column span 1 — the exact transpose of the ordinary
 * "row 1, one cell, column span ≈ full column count" shape. Rotating the
 * whole grid 90° (not a plain mirror-transpose — the title must land back
 * at new row 1, not the far row, so the row axis is reversed while the
 * column axis is not) lets the rest of this function's already-proven
 * header/data logic run completely unchanged against it. Cell BOUNDING
 * BOXES are left untouched (`odlBboxToProjectSpace` maps them by geometry
 * alone, never by row/column label), so no other output is affected. */
function rotateODLTable90(t: ODLTable): ODLTable {
  const oldC = t["number of columns"];
  const byRow = new Map<number, ODLTableCell[]>();
  for (const row of t.rows) {
    for (const cell of row.cells) {
      const rs = cell["row span"] || 1, cs = cell["column span"] || 1;
      const newRowNumber = oldC - cell["column number"] - cs + 2;
      const rotated: ODLTableCell = {
        ...cell,
        "row number": newRowNumber,
        "column number": cell["row number"],
        "row span": cs,
        "column span": rs,
      };
      const list = byRow.get(newRowNumber);
      if (list) list.push(rotated); else byRow.set(newRowNumber, [rotated]);
    }
  }
  const rows: ODLTableRow[] = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowNumber, cells]) => ({
      type: "table row" as const,
      "row number": rowNumber,
      id: -1,
      cells: cells.sort((a, b) => a["column number"] - b["column number"]),
    }));
  return { ...t, "number of rows": oldC, "number of columns": t["number of rows"], rows };
}

/** True when row 1 carries a single cell (almost) spanning every ROW instead
 * of every column — see `rotateODLTable90`'s own comment for the real shape
 * this catches. Requires at least one OTHER row-1 cell with an ordinary
 * (<=1) row span, so a real single-tier header row (every cell rowSpan 1,
 * nothing to compare against) or a normal multi-row title check (row 1 has
 * only the one cell — handled by the existing colSpan check below) never
 * matches here; the two checks are mutually exclusive by construction. The
 * >= 4 row floor keeps this off small tables where an ordinary multi-tier
 * header cell's own rowSpan could coincidentally reach "almost every row." */
function hasRowOrientedTitle(t: ODLTable, numRows: number): boolean {
  if (numRows < 4) return false;
  const row1 = t.rows.find((r) => r["row number"] === 1);
  if (!row1 || row1.cells.length < 2) return false;
  const longSpan = row1.cells.filter((c) => (c["row span"] || 1) >= numRows - 1 && (c["column span"] || 1) === 1);
  const shortSpan = row1.cells.filter((c) => (c["row span"] || 1) <= 1);
  return longSpan.length === 1 && shortSpan.length >= 1;
}

/** Build one ScheduleTable straight from ODL's own detected grid. Returns
 * null when the table doesn't look like a recognized schedule shape at all
 * (kind classification fails to qualify) or carries no real keyed data rows
 * — never a guess, the same refusal discipline as the rest of this file. */
export function scheduleTableFromODL(
  t: ODLTable,
  sheetKey: string,
  pageViewportTransform: number[],
  opts: { buildings?: Set<string>; sourceSpans?: GraphSpan[] } = {},
): ScheduleTable | null {
  if (t["number of rows"] < 2 || t["number of columns"] < 2) return null;
  if (hasRowOrientedTitle(t, t["number of rows"])) t = rotateODLTable90(t);
  const R = t["number of rows"], C = t["number of columns"];

  // Expand rowspan/colspan into a full grid of cell references so a later
  // pass can walk "the cell occupying (row,col)" without re-deriving spans.
  const grid: (ODLTableCell | null)[][] = Array.from({ length: R }, () => new Array(C).fill(null));
  for (const row of t.rows) {
    for (const cell of row.cells) {
      const r0 = cell["row number"] - 1, c0 = cell["column number"] - 1;
      const rs = Math.max(1, cell["row span"] || 1), cs = Math.max(1, cell["column span"] || 1);
      for (let r = r0; r < Math.min(R, r0 + rs); r++)
        for (let c = c0; c < Math.min(C, c0 + cs); c++)
          if (r >= 0 && c >= 0) grid[r][c] = cell;
    }
  }

  // A lone cell spanning (almost) every column on the very first row is the
  // table's own printed TITLE, not a header tier — confirmed the real shape
  // ODL itself produces (AHU-1's own row 1: one cell, colspan 47/47).
  let titleCell: ODLTableCell | null = null;
  let bodyStart = 0;
  const row0 = t.rows[0];
  if (row0 && row0.cells.length === 1 && (row0.cells[0]["column span"] || 1) >= C - 1) {
    titleCell = row0.cells[0];
    bodyStart = 1;
  }

  // Header block: consecutive rows whose OWN cells (excluding ones only
  // present via a rowspan continuation from above) are either a genuine
  // multi-column/row GROUP (span>1 on either axis — can never occur in a
  // real per-item data row, where every column is its own independent
  // value), OR simply don't yet cover every column with a fresh cell of
  // their own — a still-partial tier (AHU-1's own real 3rd tier:
  // "DESIGN"/"ACTUAL"/"SENSIBLE"/"TOTAL"/… only supplies 16 of 47 columns,
  // the rest still inherited via rowspan from the tier above) is
  // STRUCTURALLY IMPOSSIBLE for a genuine per-item data row, which always
  // states its own value in every column — a much more general and more
  // reliable signal than trying to vocabulary-match short, corpus-specific
  // sub-tier words like "DESIGN"/"ACTUAL"/"D.B."/"W.B." that name nothing
  // in ROOM/FINISH/EQUIPMENT_HEADERS at all (measured live: an earlier
  // vocabulary-only version of this check wrongly treated AHU-1's own real
  // 3rd header tier as its first data row, producing a phantom "SYMBOL"-
  // keyed row and silently losing every 3rd-tier column's own sub-label).
  // Vocabulary is used ONLY where structure is genuinely ambiguous — a
  // FULL-COVERAGE, ungrouped row at the FIRST header-candidate position
  // reached, which looks identical (by coverage alone) to a real single-
  // tier header with no sub-columns and to a real data row alike. "First
  // candidate reached" is NOT the same as "row bodyStart": a wide caption/
  // notes row (single cell, colspan across nearly every column — same real
  // shape as the title row, see the column-labeling loop below) can sit
  // between the title and the real header row, correctly extending
  // headerEnd via the grouped branch below without itself ever being a
  // header candidate — but that left the genuine single-tier header row
  // that follows it landing at r > bodyStart, where the old `r ===
  // bodyStart` gate never re-fired, so it fell straight through to `break`
  // and was misread as the first DATA row instead: headers came back as
  // bare "COL1"/"COL2"/… placeholders, `kind` classification saw zero
  // vocabulary hits, and the whole table was dropped. Real, measured shape
  // on baker-county-eoc-bidset.pdf#41: DIFFUSER-GRILLE SCHEDULE and SPLIT
  // SYSTEM CONDENSING UNIT SCHEDULE both carry exactly this "title, then a
  // wide REMARKS/notes caption, then the real header row" layout, and both
  // were silently dropped whole (never appearing in `g.tables` at all)
  // until this fix restored their real header row to view. DIFFUSER-GRILLE
  // SCHEDULE now correctly extracts and classifies (equipment-kind, CD-1/
  // RG-1/EG-1 rows). SPLIT SYSTEM CONDENSING UNIT SCHEDULE's header row now
  // correctly extends headerEnd too, but stays undiscovered for a SEPARATE,
  // deeper reason this fix does not touch: ODL's own text layer returns
  // literally zero characters (`kids: []`) for that table's entire real 2nd
  // header tier (columns 6-17, confirmed against the raw ODL JSON) — a
  // genuine upstream extraction loss, not a labeling-order bug, so its
  // surviving 5 real column labels (EQUIP NO/LOCATION/SERVICE/MANUFACTURER/
  // MODEL) alone never clear any kind's vocabulary bar. `headerCandidateChecked`
  // tracks "have we already reached the first non-blank, non-grouped,
  // full-coverage row" regardless of its own row index, so the same
  // one-shot vocab tie-break applies wherever that row actually lands.
  let headerEnd = bodyStart;
  let headerCandidateChecked = false;
  for (let r = bodyStart; r < R; r++) {
    const ownCells = new Set<ODLTableCell>();
    for (let c = 0; c < C; c++) {
      const cell = grid[r][c];
      if (cell && cell["row number"] - 1 === r) ownCells.add(cell);
    }
    if (!ownCells.size) { headerEnd = r + 1; continue; } // fully blank spacer row
    const grouped = [...ownCells].some((cl) => (cl["column span"] || 1) > 1 || (cl["row span"] || 1) > 1);
    const fullCoverage = ownCells.size >= C;
    if (grouped || !fullCoverage) { headerEnd = r + 1; continue; }
    if (!headerCandidateChecked) {
      headerCandidateChecked = true;
      const texts = [...ownCells].map(odlCellText).filter(Boolean);
      const vocabHits = texts.filter((s) => headerLabels(s, ALL_HEADER_WORDS_ARR).length > 0).length;
      if (texts.length && vocabHits / texts.length >= 0.4) { headerEnd = r + 1; continue; }
    }
    break; // first real data row
  }
  if (headerEnd <= bodyStart) return null;

  // Compound per-column header label: concatenate each header row's OWN
  // cell text for that column top-to-bottom, deduping a cell that continues
  // purely via rowspan (same cell reference re-seen at the row below) so a
  // 3-row-tall "SYMBOL" cell contributes its text exactly once.
  //
  // A row inside the header block can ALSO be a second wide caption/notes
  // row — not just row `bodyStart` (the ONLY position the title check
  // above looks at) — a real, general CAD convention: a numbered REMARKS
  // note or a code-citation caption ("MINIMUM VENTILATION RATES FROM TABLE
  // 403.3.1.1, 2022 OREGON MECHANICAL SPECIALTY CODE…") sitting between
  // the real title and the real column headers, or directly above them.
  // Structurally it's the exact same shape as the title row (one cell,
  // colspan across nearly every column) — measured live on
  // baker-county-eoc-bidset.pdf#41/#48: without this check, that ONE
  // sentence gets prepended to EVERY real column's own label ("…REMARKS:
  // EQUIP NO", "…REMARKS: LOCATION", …), making every header useless for
  // lookup. Skip such a row's text from column-labeling — it already
  // counted toward headerEnd above (correctly: it is not a real data row
  // either), it simply contributes no per-column label.
  const colLabel: string[] = new Array(C).fill("");
  const lastSeen: (ODLTableCell | null)[] = new Array(C).fill(null);
  for (let r = bodyStart; r < headerEnd; r++) {
    const ownCellsHere = new Set<ODLTableCell>();
    for (let c = 0; c < C; c++) {
      const cell = grid[r][c];
      if (cell && cell["row number"] - 1 === r) ownCellsHere.add(cell);
    }
    if (ownCellsHere.size === 1 && [...ownCellsHere][0]["column span"] >= C - 1) continue;
    for (let c = 0; c < C; c++) {
      const cell = grid[r][c];
      if (!cell || cell === lastSeen[c]) continue;
      lastSeen[c] = cell;
      const txt = odlCellText(cell);
      if (txt) colLabel[c] = colLabel[c] ? `${colLabel[c]} ${txt}` : txt;
    }
  }
  // Uppercased, matching this file's own convention everywhere else (every
  // vocab constant, norm(), every geometrically-built header) — ODL's own
  // paragraph text preserves the PDF's original mixed case ("Number").
  const headers = colLabel.map((l, i) => (l || `COL${i + 1}`).toUpperCase());

  // Kind classification — the SAME vocabulary bar the rest of this file
  // uses (headerLabel/EQUIPMENT_HEADERS/FINISH_HEADERS/ROOM_HEADERS),
  // applied to ODL's own flattened compound labels instead of a geometric
  // band. Ties favor the more specific vocab (equipment, then room, then
  // finish) since a real equipment schedule's words are a proper superset
  // risk onto FINISH_HEADERS (MODEL/MANUFACTURER/REMARKS overlap both).
  const hitCount = (vocab: string[]) => headers.filter((h) => headerLabel(h, vocab)).length;
  const eqHits = hitCount(EQUIPMENT_HEADERS), rmHits = hitCount(ROOM_HEADERS), finHits = hitCount(FINISH_HEADERS);
  // room-finish needs real SURFACE columns, not just ROOM_HEADERS' own
  // generic words — a real DOOR SCHEDULE ("…FROM ROOM"/"…TO ROOM"/"DOOR
  // IDENTITY FINISH"/"FRAME IDENTITY FINISH"/"HT"/"REMARKS") clears
  // rmHits>=3 on incidental vocabulary alone with zero real surface columns
  // of its own, and — critically — often carries the SAME numeric key
  // ("101") as a real room, so misclassifying it doesn't just add a junk
  // table, it collides with the real room-finish row and corrupts it
  // (measured live: baker-county-eoc-bidset.pdf's own real "ROOM 101"
  // FLOOR cell silently went from "RF-1" to unresolved this exact way). A
  // real room-finish table always has multiple actual surface columns
  // (FLOOR/BASE/WALL/CEILING/compass directions) by construction; a door
  // schedule's own FINISH columns never carry one.
  const surfaceHits = headers.filter((h) => h.split(/\s+/).some((w) => SURFACE_WORDS.has(w))).length;
  // A real per-item catalog schedule (MANUFACTURER + MODEL together — the
  // SAME decisive pair this function's own CONNECTION/CALCULATION reference-
  // demotion below already trusts to mean "an actual purchasable product")
  // can legitimately clear only 2 EQUIPMENT_HEADERS hits when its OTHER real
  // columns are a multi-row ODL header the compound-label flattener above
  // couldn't resolve to named text (falling back to "COL6"/"COL7"/…, so
  // their real vocabulary never reaches hitCount at all) — measured live:
  // baker-county-eoc-bidset.pdf#41's own SPLIT SYSTEM CONDENSING UNIT
  // SCHEDULE and ELECTRIC WATER HEATER SCHEDULE (EQUIP NO/LOCATION/SERVICE/
  // MANUFACTURER/MODEL + a dozen unlabeled capacity columns) both fell one
  // hit short of the generic eqHits>=3 bar and silently landed "reference"
  // instead of "equipment" — invisible to buildPlanSetTakeoff's own
  // equipment loop entirely (CU-1/CU-2/WH-1 never attempted). Narrow and
  // local to this ODL classification only — never widens EQUIPMENT_HEADERS
  // itself, so the geometric extractor's own unrelated gates are untouched.
  // SERIES is the HVAC "basis of design" equivalent of MODEL — a real
  // catalog schedule names the purchasable product as MANUFACTURER +
  // SERIES when it has no separate MODEL column ("BASIS OF DESIGN
  // MANUFACTURER" / "BASIS OF DESIGN SERIES"). Never added to
  // EQUIPMENT_HEADERS itself (that vocabulary's own standing hazard —
  // see the TYPE/AREA/WEIGHT revert comment): this is local to the ODL
  // catalog-identity pair, the same place MODEL is already trusted.
  const hasCatalogIdentity = headers.some((h) => headerLabel(h, EQUIPMENT_HEADERS) === "MANUFACTURER")
    && (headers.some((h) => headerLabel(h, EQUIPMENT_HEADERS) === "MODEL")
      || headers.some((h) => /\bSERIES\b/.test(norm(h))));
  let kind: TableKind = "unknown";
  if ((eqHits >= 3 || (hasCatalogIdentity && eqHits >= 2)) && eqHits >= rmHits && eqHits >= finHits) kind = "equipment";
  else if (rmHits >= 3 && rmHits > finHits && surfaceHits >= 2) kind = "room-finish";
  else if (finHits >= 3) kind = "finish";
  const titleText = titleCell ? odlCellText(titleCell) : "";
  // Unlike the geometric extractor (which has its own vocabulary-free
  // structural "reference" pass, above extractAllTables), this function had
  // no equivalent fallback: a real ODL-detected table whose header words
  // simply don't name equipment/room/finish (a DEHUMIDIFIER SCHEDULE's own
  // "% RH"/"CAPACITY PINTS/HR", a FAN SOUND POWER LEVEL SCHEDULE's own
  // octave-band columns "62.5"/"125"/"250"…) cleared none of the three
  // vocab bars and was silently discarded whole — even with a real printed
  // title and a real structural header row already confirmed by the
  // headerEnd logic above. Measured live: navfac-cherry-point-atc-
  // mechanical.pdf#44 carries exactly these two real schedules; ODL
  // segments and titles both correctly (confirmed against its own raw
  // JSON), but they never reached `g.tables` at all. Falling back to the
  // same "reference" kind the geometric pass already trusts elsewhere —
  // gated on a REAL title (never promote an anonymous/untitled ODL blob,
  // which is far likelier to be a misdetected border or a merge artifact
  // than a genuine schedule) — recovers them the same general way, with no
  // new vocabulary or corpus-specific carve-out.
  if (kind === "unknown") {
    if (!titleText.trim()) return null;
    // Same title-family gate as the geometric extractor's own finish→
    // equipment reclassification (isMepEquipmentSchedule, above extractAllTables),
    // reached from the OTHER direction — a table that never independently
    // qualified under ANY kind's row-vocabulary at all, rather than one that
    // qualified under the wrong one — plus the same real-catalog-anchor
    // requirement every other equipment-kind path in this file already
    // enforces (a table with no TAG/MARK/CODE/SYMBOL/ID column has no real
    // key column an estimator or symbol_sweep can chase, so a title match
    // alone is not enough). Without this, a genuine per-instance MEP device
    // schedule whose title plainly names a recognized equipment family (a
    // DEHUMIDIFIER SCHEDULE's own real DH-A1..DH-A6 tags) fell into the
    // generic, vocabulary-free "reference" kind below and stayed invisible
    // to buildPlanSetTakeoff's own equipment-kind-only takeoff loop — real,
    // measured live: navfac-cherry-point-atc-mechanical.pdf#44's own
    // DEHUMIDIFIER SCHEDULE (MARK/°F DB/% RH/CAPACITY PINTS/HR/FLA/V/PH/HZ —
    // none of which clears EQUIPMENT_HEADERS' own vocabulary bar) was
    // exactly this case, while this same corpus's own two OTHER real
    // DEHUMIDIFIER SCHEDULE tables (sheets #47/#49, DH-M*/DH-T*) already
    // carry one extra recognized column (TYPE MARK / SENSIBLE MBH) that
    // clears the bar on its own — this promotion only ever fires for the
    // narrower case those two already skip.
    kind = (isMepEquipmentSchedule(titleText) && headers.some((h) => isBareAnchorHeader(h)))
      ? "equipment"
      : "reference";
  }
  if (kind === "finish" && titleText && isNonFinishSchedule(titleText)) {
    // Match the geometric extractor's finish→equipment recovery above.
    // Sparse catalog schedules can clear the generic finish header bar while
    // missing the equipment rating-word bar; dropping them here makes the ODL
    // path less capable than the same table's geometric path.
    if (isMepEquipmentSchedule(titleText)) kind = "equipment";
    else return null;
  }

  // A real, standard cross-firm MEP title — "…CONNECTION SCHEDULE" (electrical
  // OR mechanical) — names a table that cross-REFERENCES equipment tags a
  // DEDICATED per-category schedule already defines elsewhere (a diffuser
  // schedule, a condensing-unit schedule, …), carrying only hookup data
  // (LOCATION/VOLTAGE/VA/MCA/MOCP/CIRCUIT NUMBER), never a catalog identity
  // column of its own — structurally this file's own vocabulary-free
  // "reference" kind (sheetgraph.ts's fourth table kind), not a second,
  // competing definition of the same equipment. Left classified "equipment",
  // every tag it cross-references becomes a real SECOND schedule row for
  // that same key — measured live, this exact regression, on baker-county-
  // eoc-bidset.pdf#60's own real MECHANICAL EQUIPMENT CONNECTION SCHEDULE:
  // once its header row started clearing the vocabulary bar (the headerEnd
  // fix above), RTU-1/RTU-2/ERV-01/FCU-1/FCU-2/EWH-1/EWH-2 — every one of
  // them already uniquely, correctly resolved via their own dedicated
  // schedule — started throwing a real "N schedule rows carry the key"
  // ambiguity against themselves. MODEL/MANUFACTURER absence is the
  // discriminator, deliberately narrower than "no DESCRIPTION-ish word
  // anywhere" — a real cross-reference row routinely carries its own plain-
  // language "EQUIPMENT DESCRIPTION" column (this exact table's own real
  // header) naming WHICH equipment it hooks up, without that making it a
  // catalog definition. MODEL and MANUFACTURER specifically are what a
  // genuine per-item catalog schedule always states for its own row to mean
  // anything (an actual purchasable product); a pure connection cross-
  // reference never does, regardless of how descriptive its other prose
  // columns read.
  //
  // CALCULATION joins CONNECTION on the same real MODEL/MANUFACTURER-absence
  // gate — a "…CALCULATION…" title (load calc, gas-demand calc, …) names a
  // DERIVED/computed table, not a catalog: measured live, baker-county-eoc-
  // bidset.pdf#41's own NATURAL GAS CALCULATION table (TAG/DESCRIPTION/BTU
  // PER FIXTURE/TOTAL MBH — TAG+DESCRIPTION+MBH alone clear eqHits>=3, no
  // MODEL/MANUFACTURER anywhere) cross-references RTU-1/RTU-2 by their real
  // tag and, left "equipment", throws the exact same self-ambiguity this
  // CONNECTION check already exists to prevent.
  // ISOLATION joins CONNECTION/CALCULATION on the exact same MODEL/
  // MANUFACTURER-absence gate via the shared isReferenceCrossTable helper
  // (see its own comment) — a "…ISOLATION SCHEDULE" title (a vibration-
  // isolator selection table) is the same cross-reference/spec shape,
  // real, corpus-found: navfac-cherry-point-atc-mechanical.pdf's own
  // VIBRATION ISOLATION SCHEDULE, recovered via this ODL adapter path,
  // keys a bare MARK = "AHU-M1" and, left "equipment", competed as a
  // second bare-anchor candidate against the real AIR HANDLING UNIT
  // SCHEDULE row, defeating sweepScheduleRow's own accessory-narrowing
  // (which only fires with EXACTLY one bare-anchor survivor).
  if (kind === "equipment" && isReferenceCrossTable(titleText, headers)) {
    kind = "reference";
  }

  // room-finish only: resolveTag/floorTagFor look up a row's surface cells
  // by EXACT canonical word ("FLOOR", "NORTH"…, surfaceRank/SURFACE_WORDS)
  // — a real column whose compound label reads "FLOOR FINISH" or "WALL
  // FINISH NORTH" carries the real value under the wrong key otherwise
  // (measured live: sample-finish-plan.pdf's own real FLOOR FINISH column
  // silently stopped resolving any room until this normalization existed).
  // The LAST surface word in the phrase wins when more than one appears —
  // "WALL FINISH NORTH" must collapse to "NORTH" (the actually
  // distinguishing word across 4 sibling columns), not the shared parent
  // "WALL", exactly matching this file's own geometric extractor's
  // established bare-word convention for the same real column shape.
  if (kind === "room-finish") {
    for (let c = 0; c < headers.length; c++) {
      const words = headers[c].split(/\s+/);
      for (let w = words.length - 1; w >= 0; w--) {
        if (SURFACE_WORDS.has(words[w])) { headers[c] = words[w]; break; }
      }
    }
  }

  const keyColIdx = headers.findIndex((h) => /^(SYMBOL|TAG|ID|MARK|CODE|UNIT TAG|UNIT NO|DESIGNATION)$/.test(norm(h)));
  const rows: TableRow[] = [];
  for (let r = headerEnd; r < R; r++) {
    const seen = new Set<ODLTableCell>();
    const rowCellRef: (ODLTableCell | null)[] = new Array(C).fill(null);
    for (let c = 0; c < C; c++) {
      const cell = grid[r][c];
      if (!cell || seen.has(cell)) continue;
      seen.add(cell);
      rowCellRef[c] = cell;
    }
    const texts = new Array(C).fill("");
    for (let c = 0; c < C; c++) {
      const sourceCell = grid[r][c];
      if (!sourceCell) continue;
      const text = odlCellText(sourceCell);
      const bbox = odlBboxToProjectSpace(sourceCell["bounding box"], pageViewportTransform);
      texts[c] = opts.sourceSpans ? preferLastOverprintedText(text, bbox, opts.sourceSpans) : text;
    }
    if (texts.every((s: string) => !s.trim())) continue; // blank spacer row
    const rawKey = texts[keyColIdx >= 0 ? keyColIdx : 0] || "";
    const keyRes = rowKeyOf(rawKey, kind === "room-finish" ? "room-finish" : kind === "equipment" ? "equipment" : "finish", opts.buildings);
    if (!keyRes) continue; // no recognizable row key — refuse rather than mint a fake row
    const cells: Record<string, TableCell> = {};
    for (let c = 0; c < C; c++) {
      if (!texts[c]) continue;
      const srcCell = grid[r][c];
      const bbox = srcCell ? odlBboxToProjectSpace(srcCell["bounding box"], pageViewportTransform) : odlBboxToProjectSpace(t["bounding box"], pageViewportTransform);
      cells[headers[c]] = { text: texts[c], bbox };
    }
    rows.push({ key: keyRes.key, sheet: sheetKey, ...(keyRes.building ? { building: keyRes.building } : {}), cells });
  }
  if (!rows.length) return null;
  const promotedHeaders = promoteLeadingEngineeringUnits(headers, rows);
  headers.splice(0, headers.length, ...promotedHeaders);

  const region = odlBboxToProjectSpace(t["bounding box"], pageViewportTransform);
  const built: ScheduleTable = {
    kind,
    sheet: sheetKey,
    title: titleCell ? { sheet: sheetKey, text: titleText, bbox: odlBboxToProjectSpace(titleCell["bounding box"], pageViewportTransform) } : null,
    headers,
    rows,
    region,
  };
  // ODL sometimes recovers the right cell strings with grid boxes that miss
  // the painted glyphs (sideways / quarter-turned detections). Snap to exact
  // pdf.js spans when unique so query_table citations OCR-ground and paint.
  return opts.sourceSpans ? snapCellBboxesToSourceSpans(built, opts.sourceSpans) : built;
}

/** Total non-empty cells across a table's rows — the plainest, most
 * source-neutral "how much did this extraction actually recover" signal.
 * Used together with headers.length so a caller (mcp/src/session.ts's ODL
 * enhancement pass) can pick whichever of two candidate extractions of the
 * SAME real table is more complete, WITHOUT favoring either source by
 * construction — pure evidence, same bar either extraction must clear. */
export function tableCompleteness(t: ScheduleTable): { headers: number; cells: number } {
  let cells = 0;
  for (const r of t.rows) for (const c of Object.values(r.cells)) if (c.text.trim()) cells++;
  return { headers: t.headers.length, cells };
}

/** Rebuilds `g.sheets[i].schedules` for the given sheet keys from the
 * CURRENT `g.tables` — the exact projection `buildSheetGraph` itself uses
 * at graph-build time, exposed so a caller that mutates `g.tables` after
 * the fact (an ODL-enhancement pass, run post-hoc since it's async and
 * `buildSheetGraph` itself is not) can keep the per-sheet summary honest
 * without duplicating this derivation. */
export function syncSheetSchedules(g: SheetGraph, sheetKeys: Iterable<string>): void {
  const want = new Set(sheetKeys);
  for (const s of g.sheets) {
    if (!want.has(s.key)) continue;
    const schedules: SheetGraphSchedule[] = [];
    for (const t of g.tables) {
      const parts: TablePart[] = t.parts ?? [{ sheet: t.sheet, title: t.title?.text || "", rows: t.rows.length, region: t.region, ...(t.rotated_headers ? { rotated_headers: true } : {}) }];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.sheet !== s.key) continue;
        schedules.push({
          kind: t.kind, title: p.title || t.title?.text || "", rows: p.rows, region: p.region,
          ...(i > 0 ? { continues: t.sheet } : {}),
          ...(p.rotated_headers ? { rotated_headers: true } : {}),
        });
      }
    }
    s.schedules = schedules;
  }
}
