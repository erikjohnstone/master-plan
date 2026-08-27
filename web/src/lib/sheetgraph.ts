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
  { re: /(?:FINISH|FLOOR|FURNITURE|CEILING|DUCTWORK|PIPING|MECHANICAL|ELECTRICAL|LIGHTING|POWER|PLUMBING|SPRINKLER|HVAC|FRAMING|FOUNDATION|ROOF|SITE|EQUIPMENT)\s+PLAN\b|(?:FINISH|FLOOR|FURNITURE|CEILING|DUCTWORK|PIPING|MECHANICAL|ELECTRICAL|LIGHTING|POWER|PLUMBING|SPRINKLER|HVAC|FRAMING|FOUNDATION|ROOF|SITE|EQUIPMENT)\s*-\s*LEVEL\s+\d+\s+PLAN\b/, role: "plan", conf: 0.85 },
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
const REFERENCE_RE = /^(SEE|REFER|PER|NOTED|AS SHOWN)\b|REFER TO/;

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
    let best: Bbox | null = null;
    let bestArea = Infinity;
    const P = (i: number, end: 0 | 1): [number, number] => [segs[i * 4 + end * 2], segs[i * 4 + 1 + end * 2]];
    const close = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
    for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) for (let c = b + 1; c < near.length; c++) {
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
const FINISH_HEADERS = ["CODE", "MARK", "SYMBOL", "ID", "MATERIAL", "MANUFACTURER", "PRODUCT", "STYLE", "COLOR", "SIZE", "REMARKS", "DESCRIPTION", "PATTERN", "COMMENTS"];
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
const EQUIPMENT_HEADERS = ["ID", "SYMBOL", "TAG", "MODEL", "MANUFACTURER", "DESCRIPTION", "REMARKS", "VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "CFM", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "EWT", "LWT", "RPM", "ESP", "EQUIPMENT", "VELOCITY", "AIRFLOW", "SIZE", "FPM", "LENGTH", "TYPE", "MOUNTING", "CCT", "CRI", "DRIVER", "DIMMING", "LENS", "FINISH", "NOTES", "LUMENS"];
// Hoisted out of extractTableAt (module-level, not a local) so the
// structural "reference" pass (below extractAllTables) can check "would
// THIS candidate header already qualify under an EXISTING vocabulary" off
// the exact same single source of truth extractTableAt itself uses — a
// duplicated literal here would drift the day either changes, silently
// reopening the cross-kind-duplicate-extraction class of bug (commit
// 88344c9) for the new kind.
const ROOM_FINISH_REQUIRED = ["FLOOR", "BASE"];
const FINISH_REQUIRED = ["CODE", "MARK", "SYMBOL", "ID"];
const EQUIPMENT_REQUIRED = ["VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "EWT", "LWT", "ESP", "AIRFLOW", "VELOCITY", "FPM"];
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
 * parenthesized. Only a BARE hit stops the skip now. */
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
const CATALOG_ANCHOR_WORDS = ["ID", "MARK", "CODE", "SYMBOL", "TAG"];

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
    for (const w of words) {
      if (used.has(w)) continue;
      used.add(w);
      const ci = text.indexOf(w);
      const frac = ci >= 0 ? (ci + w.length / 2) / Math.max(text.length, 1) : 0.5;
      out.push({ label: w, x: t.x + frac * (t.w || 0) });
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
      const halfPitch = gaps.length ? gaps.sort((a, b) => a - b)[gaps.length >> 1] / 2 : 150;
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

function findHeaderRow(rows: GraphSpan[][], vocab: string[], required: string[], minHits: number, fromIdx = 0, opts: { equipmentTierMerge?: boolean } = {}): { anchors: Anchor[]; rowIndex: number; dataFrom: number; mergedTopIdx?: number } | null {
  for (let i = fromIdx; i < rows.length; i++) {
    let hits = headerHits(rows[i], vocab);
    if (!qualifies(hits, required, minHits)) continue;
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
    const skipEnd = skipSubHeaderContinuation(rows, vocab, idx);
    // Parenthesized unit-fragment tiers ("(MBH)", "(WATTS)") name real
    // columns too — see harvestSkippedTierAnchors' own comment. Same gate as
    // the backward merge above: both are part of the same equipment-only
    // tier-topology handling this phase adds.
    if (opts.equipmentTierMerge) {
      for (const a of harvestSkippedTierAnchors(rows, vocab, idx, skipEnd)) {
        if (used.has(a.label)) continue;
        used.add(a.label);
        anchors.push(a);
      }
    }
    return {
      anchors: subTierAnchors(rows, idx, anchors.sort((a, b) => a.x - b.x), vocab),
      rowIndex: idx,
      dataFrom: skipEnd + 1,
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
  const gaps = loose.slice(1).map((t, i) => mid(t) - mid(loose[i])).sort((a, b) => a - b);
  const med = gaps[gaps.length >> 1] || 1;
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
    // decision it always made.
    const vocabParent = parentLabelOver(rows, hdrIdx, hdrIdx - 2, r[0].x, last.x + (last.w || 0), vocab);
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
    const halfPitch = Math.max(24, med / 2);
    const withParent = r
      .map((t) => ({ t, parent: parentPhraseOver(rows, hdrIdx, hdrIdx - 8, mid(t) - halfPitch, mid(t) + halfPitch, vocab) }))
      .filter((x): x is { t: GraphSpan; parent: string } => x.parent != null);
    if (!withParent.length) continue;   // no parent anywhere — unexplained, no sub-tier, as always
    const subRuns: Array<typeof withParent> = [[withParent[0]]];
    for (let i = 1; i < withParent.length; i++) {
      const prev = withParent[i - 1], cur = withParent[i];
      const tail = subRuns[subRuns.length - 1];
      if (cur.parent === prev.parent && mid(cur.t) - mid(prev.t) <= med * 3) tail.push(cur);
      else subRuns.push([cur]);
    }
    for (const sr of subRuns) mintSubAnchors(out, used, sr, mid);
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
    const before = left > baseline * GAP_INFLATION_RATIO ? cap : Infinity;
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
const CODE_RE = /^[A-Z]{1,4}(-?[A-Z0-9]{1,4})?$/;
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

export interface ExtractOpts { buildings?: Set<string>; deltas?: DeltaIndex }

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
export const isNonFinishSchedule = (title: string): boolean => {
  const u = norm(title);
  return OTHER_FAMILY_RE.test(u) && !/\b(FINISH|MATERIAL)S?\b/.test(u);
};

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
  const byLabel = new Map<string, number>();
  for (const c of kept) {
    const own = anchors.find((a) => a.x >= c.start);
    if (!own) continue;
    const cur = byLabel.get(own.label);
    if (cur == null || c.start < cur) byLabel.set(own.label, c.start);
  }
  if (byLabel.size !== anchors.length) return null;
  const cols = [...byLabel.entries()].map(([label, start]) => ({ label, start })).sort((a, b) => a.start - b.start);
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
): ColumnMap | null {
  // A map has to FIT before it is trusted. A mediocre fit is worse than none:
  // it looks authoritative and quietly merges a column into its neighbour,
  // where falling back to nearest-anchor reads the table correctly. Measured
  // on real sets, a true alignment scores ~0.82–0.90 and a wrong one ~0.54.
  const FIT_FLOOR = 0.7;
  const fits = (m: ColumnMap | null) => (m && m.score >= FIT_FLOOR ? m : null);
  const left = fits(columnMapFor(rows, anchors, cfg, x0, x1, "left", isKeyedRow));
  const center = fits(columnMapFor(rows, anchors, cfg, x0, x1, "center", isKeyedRow));
  if (!left) return center;
  if (!center) return left;
  // Left alignment is the common case; centring has to EARN the switch. On a
  // near tie both modes score well and picking the wrong one merges a column
  // into its neighbour, so only a clearly better centred fit wins.
  return center.score > left.score + 0.05 ? center : left;
}

function bandDataRows(
  rows: GraphSpan[][],
  anchors: Anchor[],
  kind: "room-finish" | "finish" | "equipment",
  sheetKey: string,
  buildings: Set<string> | undefined,
  cfg: { fromIdx: number; toIdx?: number; belowY: number; keyAlign?: { x: number; tol: number }; deltas?: DeltaIndex },
): { out: TableRow[]; region: Bbox | null } {
  const { x0, x1, medGap } = bandLimits(anchors);
  const toIdx = cfg.toIdx ?? rows.length;
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
  const cols = columnStarts(rows, anchors, cfg, x0, x1, isKeyedRow);
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
  const add = (row: TableRow, toks: GraphSpan[]) => {
    for (const t of toks) {
      const label = columnOf(t);
      if (label == null) continue;
      const existing = row.cells[label];
      if (farFromCell(label, t, existing)) continue;
      const text = t.str.trim();
      if (!existing) row.cells[label] = { text, bbox: bboxOf(t) };
      else row.cells[label] = { text: `${existing.text} ${text}`, bbox: merge(existing.bbox, bboxOf(t)) };
      region = region ? merge(region, bboxOf(t)) : bboxOf(t);
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
  if (kind === "equipment" && anchors.length >= 4) {
    const minCells = Math.max(2, anchors.length / 2);
    const anchorLabels = new Set(anchors.map((a) => a.label));
    for (let i = out.length - 1; i >= 0; i--) {
      const keyIsOwnColumn = anchorLabels.has(norm(out[i].key));
      if ((keyIsOwnColumn || Object.keys(out[i].cells).length < minCells) && !/\d/.test(out[i].key)) { out.splice(i, 1); outY.splice(i, 1); }
    }
  }
  // row-level building off the BLDG/BUILDING column, where the key itself
  // did not carry one
  for (const row of out) {
    if (row.building) continue;
    const cellB = norm(row.cells.BLDG?.text || row.cells.BUILDING?.text || "");
    if (DESIGNATOR_RE.test(cellB)) row.building = cellB;
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
function findTableBoundary(rows: GraphSpan[][], dataFrom: number, x0: number, x1: number, belowY = -Infinity): number {
  const cap = Math.min(rows.length, dataFrom + MAX_TABLE_SCAN_ROWS);
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
  let flat = findHeaderRow(rows, vocab, required, minHits, fromIdx, { equipmentTierMerge: kind === "equipment" });
  // The merge above only ever ADDS a key column when one exists nearby on
  // the sheet — it never invents one. A candidate that still has no catalog
  // anchor after the attempt genuinely has no usable key column (the
  // anchored key would be whatever sits leftmost of the found tier — a bare
  // CFM/VOLTAGE number, which correctly fails rowKeyOf's CODE_RE and drops
  // every row), so it is refused outright rather than accepted as a table
  // that can never be looked up by tag. Checked against CATALOG_ANCHOR_WORDS
  // (ID/MARK/CODE/SYMBOL/TAG), not just literal "ID" — real equipment
  // schedules key under any of these depending on the firm (see
  // EQUIPMENT_HEADERS' own SYMBOL/TAG comment). Deliberately NOT a
  // retry-forward-and-keep-looking: tried that first and it searched past a
  // real candidate into a LATER table's own header, re-extracting a table
  // that already correctly exists under another kind — a duplicate-row-key
  // collision worse than the one this whole design exists to prevent.
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
  const bareLeadingType = flat && flat.anchors[0]?.label === "TYPE" && flat.anchors.length >= 8
    && headerHits(rows[flat.rowIndex], vocab).length / Math.max(1, rows[flat.rowIndex].length) >= 0.6;
  if (kind === "equipment" && flat && !flat.anchors.some((a) => CATALOG_ANCHOR_WORDS.includes(a.label)) && !bareLeadingType) flat = null;
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
  const cap = Math.min(rows.length, dataFrom + MAX_TABLE_SCAN_ROWS);
  let toIdx = findTableBoundary(rows, dataFrom, hdrBand.x0, hdrBand.x1, dataBelowY);
  let banded = bandDataRows(rows, anchors, kind, sheet.key, opts.buildings, { fromIdx: dataFrom, toIdx, belowY: dataBelowY, deltas: opts.deltas });
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
      const tightBanded = bandDataRows(rows, anchors, kind, sheet.key, opts.buildings, { fromIdx: dataFrom, toIdx: tightIdx, belowY: dataBelowY, deltas: opts.deltas });
      if (tightBanded.out.length > 0) { toIdx = tightIdx; banded = tightBanded; }
    }
  }
  const out = banded.out;
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
  // The lookback budget (5) is spent only on rows that actually have a span
  // in THIS table's own x-band (ledger item 5, real bug found on
  // itd-d1-lab-mechanical.pdf#13's real "HUMIDIFIER SCHEDULE"): `rows` is
  // built sheet-WIDE, so on a dense sheet with a second table sitting to the
  // LEFT (here, the real "CONDENSING HOT WATER BOILER SCHEDULE" on the same
  // sheet), that other table's own sub-header/data rows interleave into the
  // SAME row indices between this table's real title and its header, purely
  // by y-coincidence, unrelated to this table's own x-band entirely. A raw
  // row-INDEX cap burns its whole budget on THOSE unrelated rows and never
  // reaches the real title 3 rows further up in x — confirmed exactly this
  // way, real numbers, not guessed: the real title sits 5 rows above the
  // header counting only rows with content in this table's own x-band, but
  // 8+ rows above it counting the sheet's full row list. Skipping (not
  // charging budget for) any row with nothing in [x0,x1] fixes this without
  // loosening the cap itself — a genuinely unrelated title still can't drift
  // in from 5+ REAL rows away within this table's own column band.
  let title: Evidence | null = null;
  for (let i = titleFrom, budget = 5; i >= 0 && budget > 0 && !title; i--) {
    const inBand = rows[i].filter((t) => t.x >= x0 && t.x <= x1);
    if (!inBand.length) continue;
    budget--;
    const hit = inBand.find((t) => /SCHEDULE/.test(norm(t.str)));
    if (hit) title = { sheet: sheet.key, text: hit.str.trim(), bbox: bboxOf(hit) };
  }
  // Fallback: the "…SCHEDULE" pass above found nothing — a table can
  // genuinely be titled without that word ("VARIABLE REFRIGERANT PACKAGED
  // HEAT PUMP", found live on the Bessemer sample; only reachable at all
  // once the backward merge above lets this table extract). Only ever ADDS
  // a title where one is null today — never second-guesses a real
  // "…SCHEDULE" match above. A single-span, all-caps, ≥3-word, digit-free
  // row in the same search window, inside the table's own x-band, is the
  // honest signal: a real title reads as one run of words with no numbers
  // in it, unlike a data row or a wrapped unit fragment. Same content-aware
  // budget as the primary pass above, for the same real reason.
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
    if (found.table) out.push(found.table);
    if (found.nextIdx <= fromIdx) break; // never loop without forward progress
    fromIdx = found.nextIdx;
  }
  return out;
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
function clusterGenericColumns(tokens: GraphSpan[]): Anchor[] {
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
  if (clusters.some((c) => c.length > MAX_GENERIC_COLUMN_DEPTH)) return [];
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

function findGenericTableBoundary(rows: GraphSpan[][], dataFrom: number, x0: number, x1: number): number {
  const cap = Math.min(rows.length, dataFrom + MAX_TABLE_SCAN_ROWS);
  for (let i = dataFrom; i < cap; i++) {
    if (looksLikeGenericNewHeader(rows[i], x0, x1)) return i;
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
const GENERIC_KEY_RE = /^[A-Z0-9][A-Z0-9 .,'"&()/%°∅Ø:+-]{0,99}$/;

function genericRowKeyOf(raw: string, headerLabels: Set<string>): string | null {
  const s = (raw || "").trim();
  if (!s || s.length > 100) return null;
  const u = norm(s).replace(/\s+/g, " ");
  if (REFERENCE_RE.test(u)) return null;
  if (headerLabels.has(u)) return null;
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
  const keyColX = anchors[0].x;
  const keyTol = anchors.length > 1 ? Math.max(40, (anchors[1].x - anchors[0].x) / 2) : 60;

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
    for (const t of toks) {
      const label = nearestAnchor(centerX(t), anchors);
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
  for (const o of orphans) {
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
function extractReferenceTableAt(sheet: SheetSpans, fromIdx: number): { table: ScheduleTable | null; nextIdx: number } | null {
  const horiz = sheet.spans.filter((s) => !isVertical(s));
  const rows = clusterRows(horiz);
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
    const alreadyVocab = rows.slice(block.top, block.bottom + 1).some((r) =>
      qualifies(headerHits(r, ROOM_HEADERS), ROOM_FINISH_REQUIRED, ROOM_FINISH_MIN_HITS)
      || qualifies(headerHits(r, FINISH_HEADERS), FINISH_REQUIRED, OTHER_KIND_MIN_HITS)
      || qualifies(headerHits(r, EQUIPMENT_HEADERS), EQUIPMENT_REQUIRED, OTHER_KIND_MIN_HITS));
    if (alreadyVocab) continue;
    const anchors = clusterGenericColumns(block.tokens);
    if (anchors.length < 2) continue;
    const { x0, x1 } = bandLimits(anchors);
    const hdrY0 = Math.min(...block.tokens.map((t) => t.y));
    const hdrY1 = Math.max(...block.tokens.map((t) => t.y + (t.h || 0)));
    if (!hasNearbyRuledLine(sheet.segs, x0, x1, hdrY0, hdrY1)) continue;
    const dataFrom = block.bottom + 1;
    const toIdx = findGenericTableBoundary(rows, dataFrom, x0, x1);
    const banded = bandGenericDataRows(rows, anchors, sheet.key, { fromIdx: dataFrom, toIdx });
    if (!banded.out.length) return { table: null, nextIdx: toIdx };

    // Title hunt: the same "nearest single-span, all-caps, digit-free,
    // 2+-word run above the header, in its own x-band" fallback signal
    // extractTableAt's own title hunt already uses (there, only reached
    // once no "…SCHEDULE" title is found — reused directly here since a
    // structural table has no vocabulary-anchored title search of its own
    // to try first).
    let title: Evidence | null = null;
    for (let k = block.top - 1, budget = 5; k >= 0 && budget > 0 && !title; k--) {
      const inBand = rows[k].filter((t) => centerX(t) >= x0 && centerX(t) <= x1);
      if (!inBand.length) continue;
      budget--;
      if (inBand.length !== 1) continue;
      const t = inBand[0];
      const s = norm(t.str);
      if (!s || /\d/.test(s) || !/^[A-Z][A-Z .,'’&()/-]*$/.test(s)) continue;
      if (s.split(/\s+/).filter(Boolean).length < 2) continue;
      title = { sheet: sheet.key, text: t.str.trim(), bbox: bboxOf(t) };
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
 * own repeat-from-nextIdx loop. */
export function extractAllReferenceTables(sheet: SheetSpans): ScheduleTable[] {
  const out: ScheduleTable[] = [];
  let fromIdx = 0;
  for (let n = 0; n < MAX_TABLES_PER_SHEET; n++) {
    const found = extractReferenceTableAt(sheet, fromIdx);
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
  for (const s of withText) {
    const role = classifySheetRole(s);
    roles.set(s.key, role);
    // Structural "reference" tables (see the section above extractAllTables)
    // — scoped to schedule-role sheets only, a real, disclosed scope limit
    // named in that section's own comment, not an oversight.
    if (role.role === "schedule") {
      for (const t of extractAllReferenceTables(s)) {
        const titleB = t.title ? buildingMentions(t.title.text) : [];
        const b = titleB.length === 1 ? titleB[0] : ctxBySheet.get(s.key);
        if (b) t.building = b;
        fragments.push(t);
        if (!fragmentKinds.has(s.key)) fragmentKinds.set(s.key, new Set());
        fragmentKinds.get(s.key)!.add("reference");
      }
    }
    for (const kind of ["room-finish", "finish", "equipment"] as const) {
      // Every table of this kind on the sheet, not just the first — a dense
      // MEP sheet routinely stacks several (#HVAC-boundary).
      for (const t of extractAllTables(s, kind, { buildings, deltas: deltasBySheet.get(s.key) })) {
        // A DOOR / WINDOW / PARTITION schedule carries a MARK column, so the
        // finish-table hunt happily reads one as a finish/material schedule —
        // and then a finish code that collides with a door mark chains to a
        // door, which is a confidently wrong product in the bid. Field-found on
        // a real grocery set whose DOOR SCHEDULE extracted as 54 "finish" rows.
        // Refuse by TITLE, and only when the title does not also say finish or
        // material: when in doubt the table is kept, and the drop is NAMED.
        if (kind === "finish" && t.title && isNonFinishSchedule(t.title.text)) {
          notes.push(`${s.key}: "${t.title.text}" names another schedule family, not a finish/material schedule — its ${t.rows.length} rows are NOT indexed as finish definitions`);
          continue;
        }
        // table-level building: its own title first, the sheet's context second
        const titleB = t.title ? buildingMentions(t.title.text) : [];
        const b = titleB.length === 1 ? titleB[0] : ctxBySheet.get(s.key);
        if (b) t.building = b;
        for (const r of t.rows) if (r.building) buildings.add(r.building);
        fragments.push(t);
        if (!fragmentKinds.has(s.key)) fragmentKinds.set(s.key, new Set());
        fragmentKinds.get(s.key)!.add(kind);
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
    const drop = new Set<ScheduleTable>();
    for (const group of byTitleSheet.values()) {
      if (group.length < 2 || new Set(group.map((g) => g.kind)).size < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (drop.has(group[i]) || drop.has(group[j]) || !overlaps(group[i], group[j])) continue;
          drop.add(richness(group[i]) >= richness(group[j]) ? group[j] : group[i]);
        }
      }
    }
    if (drop.size) {
      notes.push(`${[...drop].map((t) => `${t.sheet}: "${t.title!.text}" (${t.kind}, ${t.rows.length} rows)`).join("; ")} — collapsed as a duplicate cross-kind extraction of a richer table already kept under a different kind.`);
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
      for (const r of roomTags(s, { buildings, exclude: sheetNumbers, deltas: deltasBySheet.get(s.key) })) {
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
