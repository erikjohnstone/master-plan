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
  { re: /ELEVATIONS?\b/, role: "elevation", conf: 0.7 },
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
export type TableKind = "room-finish" | "finish" | "equipment" | "unknown";
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
const EQUIPMENT_HEADERS = ["ID", "SYMBOL", "TAG", "MODEL", "MANUFACTURER", "DESCRIPTION", "REMARKS", "VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "CFM", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "EWT", "LWT", "RPM", "ESP", "EQUIPMENT", "VELOCITY", "AIRFLOW", "SIZE", "FPM", "LENGTH"];
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

/** The vocabulary labels a row carries, in x order (duplicates kept — two
 * columns can both be headed FINISH, one under FLOOR and one under CEILING). */
function headerHits(row: GraphSpan[], vocab: string[]): Array<{ label: string; span: GraphSpan }> {
  const out: Array<{ label: string; span: GraphSpan }> = [];
  for (const t of row) {
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
const SUB_LABEL_RE = /^[A-Z0-9][A-Z0-9.\/-]{0,5}$/;

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
    const parent = parentLabelOver(rows, hdrIdx, hdrIdx - 2, r[0].x, last.x + (last.w || 0), vocab);
    if (!parent) continue;
    // sub-columns under a merged parent are equal-width: the pitch between
    // their labels IS the column width, so each one's bounds are its center
    // ± half a pitch. Those bounds are what keep a left-aligned wall code out
    // of the narrow BASE column next door.
    const pitch = r.length > 1
      ? r.slice(1).map((t, i) => mid(t) - mid(r[i])).sort((a, b) => a - b)[(r.length - 1) >> 1]
      : 0;
    for (const t of r) {
      const label = `${parent} ${norm(t.str)}`;
      if (used.has(label)) continue;
      used.add(label);
      const c = mid(t);
      out.push(pitch > 0 ? { label, x: c, x0: c - pitch / 2, x1: c + pitch / 2 } : { label, x: c });
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
const nearestAnchor = (x: number, anchors: Anchor[]) => {
  let inside: Anchor | null = null;
  for (const a of anchors) {
    if (a.x0 == null || a.x1 == null || x < a.x0 || x > a.x1) continue;
    if (!inside || Math.abs(a.x - x) < Math.abs(inside.x - x)) inside = a;
  }
  if (inside) return inside.label;
  let best: Anchor | null = null;
  for (const a of anchors) {
    if (a.x0 != null) continue;
    if (!best || Math.abs(a.x - x) < Math.abs(best.x - x)) best = a;
  }
  return (best ?? anchors[0]).label;
};

// The ANCHORS bound the table, not the whole clustered row — on a dense sheet
// a neighbouring table's header can share the y-band, and its x-range must
// not leak in. Left margin is generous (data cells sit left of a centered
// header). The RIGHT edge depends on what the last column IS: a prose column
// (REMARKS / DESCRIPTION / NOTES) earns three median gaps so a wide wrapped
// remark stays in; a code column (CEILING, WALL, COLOR) hugs its anchor —
// field-found on a real gym set: a finish legend sitting 300px right of a
// room schedule bled into every CEILING cell under the generous edge.
const WIDE_LAST = new Set(["REMARKS", "DESCRIPTION", "NOTES"]);
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
  const medGap = gaps.length ? gaps[gaps.length >> 1] : 150;
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
  const out: TableRow[] = [];
  const outY: number[] = [];
  let region: Bbox | null = null;
  /** Which column a token belongs to: its LEFT edge against the data-derived
   * column starts when those were recoverable, else the old nearest-anchor
   * reading of its center. */
  const columnOf = (t: GraphSpan): string => {
    if (!cols) return nearestAnchor(centerX(t), anchors);
    const at = cols.coord === "left" ? t.x : centerX(t);
    let label = cols.cols[0].label;
    for (const c of cols.cols) { if (at + 1 >= c.start) label = c.label; else break; }
    return label;
  };
  const add = (row: TableRow, toks: GraphSpan[]) => {
    for (const t of toks) {
      const label = columnOf(t);
      const text = t.str.trim();
      if (!row.cells[label]) row.cells[label] = { text, bbox: bboxOf(t) };
      else row.cells[label] = { text: `${row.cells[label].text} ${text}`, bbox: merge(row.cells[label].bbox, bboxOf(t)) };
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
  // A candidate row with only ONE populated column, on a genuinely
  // multi-column `equipment` table, is USUALLY noise, not a real row —
  // ledger item 29 (accuracy-hardening plan): a stray sub-header word that
  // isn't in EQUIPMENT_HEADERS' own vocabulary ("RPM", a second header line
  // under "ESP" naming the same physical column), a title-block/revision-
  // log fragment interleaved mid-table ("No. Description Date"), and a
  // schedule's own trailing "REMARKS:" footnote-legend label all measured,
  // on the real itd-d1-lab corpus, as their OWN one-cell garbage row.
  // BUT: a real tag from a DIFFERENT, unrecognized schedule table can also
  // bleed in as a lone, badly-mis-columned orphan row (found live: a real
  // "PH-1 EQUIPMENT T01 TIERED" — a genuine tag from some OTHER portable-
  // heater schedule this pass never found its own header for — landed as a
  // 1-cell row inside the Electric Heater Schedule's own REMARKS column).
  // Cell count alone can't tell these apart; every garbage example measured
  // has a DIGIT-FREE key (RPM/NO/REMARKS/WATER/CITY-SOFTENED/FAN/GPM/
  // PRESSURE/SYMBOL/IN/DUCT/SILENCER/HIGHWALL/SUPPORT/SCROLL/TOTAL/CFM),
  // while every real tag measured, in this table or bled in from another,
  // carries one (EF-1, PH-1, CH-1, …) — the same real-MEP-tag shape
  // CATALOG_ANCHOR_WORDS/rowKeyOf already lean on elsewhere. So: only a
  // 1-cell row whose key ALSO carries no digit is dropped — a real,
  // sparsely-extracted tagged row (even one that landed here by mistake)
  // is never silently discarded, only the digit-free noise is. Scoped
  // narrowly to the exact shape this was found on (`equipment` kind, >=4
  // real columns, evaluated AFTER orphan-folding so a row that only looked
  // sparse before its own continuation text merged in is never caught) — a
  // sparse room-finish row (FLOOR filled, BASE/WALL legitimately blank) is
  // a real, different, unrelated case this must never touch, and a
  // `finish`-kind schedule can legitimately have very few columns at all.
  if (kind === "equipment" && anchors.length >= 4) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (Object.keys(out[i].cells).length < 2 && !/\d/.test(out[i].key)) { out.splice(i, 1); outY.splice(i, 1); }
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
function extractTableAt(sheet: SheetSpans, kind: "room-finish" | "finish" | "equipment", opts: ExtractOpts, fromIdx: number): { table: ScheduleTable; nextIdx: number } | null {
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
  const required = kind === "room-finish" ? ["FLOOR", "BASE"]
    : kind === "equipment" ? ["VOLTAGE", "PHASE", "WATTS", "KW", "AMPS", "FLA", "MCA", "MOCP", "GPM", "HP", "TONS", "MBH", "EER", "SEER", "EAT", "LAT", "EWT", "LWT", "ESP", "AIRFLOW", "VELOCITY", "FPM"]
    : ["CODE", "MARK", "SYMBOL", "ID"];
  const minHits = kind === "room-finish" ? 4 : 3;

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
  if (kind === "equipment" && flat && !flat.anchors.some((a) => CATALOG_ANCHOR_WORDS.includes(a.label))) flat = null;
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
  if (!out.length) return null;
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
    out.push(found.table);
    if (found.nextIdx <= fromIdx) break; // never loop without forward progress
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
  if (!base.anchors?.length || base.kind === "unknown") return null;
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
    roles.set(s.key, classifySheetRole(s));
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
