// The schedule<->plan reconcile's scorer, both directions, against the
// reconcile keys (keys/<set>.plansheets.csv and keys/<set>.plantags.csv,
// authored from renders and the text layer, never pipeline output). A dumb,
// stable ruler: do not "improve" it to make a run look better; register a new
// key row instead (AGENTS.md rule 7).
//
// SHOULD THIS BE ON THE SHARED PATH? No: eval scoring. What it scores is the
// shared reconcile (reconcileSchedulePlan, the one every surface calls).
//
// The key, per examined plan sheet:
//   plansheets.csv  sheet,title,discipline,kind,examined,note
//   plantags.csv    sheet,drawn,unit,placements,counts,view,note
// unit is "<schedule sheet>|<tag>" (the attribute key's instance), or
// "unscheduled", or "ambiguous"; counts=yes marks a placement where a unit
// stands in the finished work (a demolition plan or a repeat view is no).
//
// What it scores (sheets the key did not examine are left out of every count):
//   ROW -> PLAN, per keyed unit matched to a reconcile row:
//     · drawn:  the key draws it (Σ counted placements > 0) or not, against the
//               row citing it on an examined sheet or not;
//     · count:  counted placements against the row's plan_cites on examined
//               sheets, per sheet (hit = min of the two) and per unit (exact);
//     · located: the row's plan_cites on any sheet the key draws the unit on
//               (its counted view or a repeat view: an enlarged plan, another
//               discipline's plan, a piping plan beside the duct plan), up to
//               the unit's counted placements. Which of two equal views a key
//               counts is the keyer's choice; a placement on the other one is
//               still on the unit (count exact says whether it was counted twice).
//     · by its tag: the same, reading the row's unverified tag text too
//               (plan_tag_cites: an AMBIGUOUS row whose exact tag is drawn but
//               owns no verified marker geometry) — the reconcile's link from
//               row to drawn tag, apart from the installed count it verifies.
//   PLAN -> ROW, per keyed drawn tag on an examined sheet:
//     · a scheduled unit's tag: the unit's row cites that sheet (plan_cites,
//       plan_tag_cites, plan_candidate_cites or plan_other_cites: the same
//       unit on a view it is not counted on) — the drawn tag is linked;
//     · an unscheduled tag: the review list unscheduled_tags names it on that
//       sheet (markKey identity: separators and case ignored).
//   THE REVIEW LIST, per entry on an examined sheet: a keyed unscheduled unit
//   tag drawn there, a keyed scheduled unit's tag (listed as unscheduled
//   though a row answers for it), or no keyed unit tag at all (a room number,
//   a sheet reference, a circuit: noise for the reviewer). The key records
//   every HVAC unit tag drawn on an examined sheet, so the last is exact.
//   Keyed units no reconcile row carries are reported apart, never scored as
//   a count of 0.
import { readFileSync, existsSync } from "node:fs";
import { expandEquipMarkRange, expandMarkList, splitRowMarks } from "../../web/src/lib/corpusTakeoff.mjs";

function splitCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text, columns) {
  const data = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!data.length) return [];
  const head = splitCsvLine(data[0]).map((h) => h.trim());
  for (const c of columns) if (!head.includes(c)) throw new Error(`key is missing column ${c}`);
  return data.slice(1).map((l) => { const c = splitCsvLine(l); return Object.fromEntries(head.map((h, i) => [h, (c[i] ?? "").trim()])); });
}

export const PLANSHEET_COLUMNS = ["sheet", "title", "discipline", "kind", "examined", "note"];
export const PLANTAG_COLUMNS = ["sheet", "drawn", "unit", "placements", "counts", "view", "note"];

export function readReconcileKey(corpus, setId) {
  const ps = `${corpus}/keys/${setId}.plansheets.csv`, pt = `${corpus}/keys/${setId}.plantags.csv`;
  if (!existsSync(ps) || !existsSync(pt)) return null;
  return {
    sheets: parseCsv(readFileSync(ps, "utf8"), PLANSHEET_COLUMNS),
    tags: parseCsv(readFileSync(pt, "utf8"), PLANTAG_COLUMNS),
  };
}

/** Case and whitespace only: the key types a tag as printed. */
export const canonTag = (t) => String(t ?? "").toUpperCase().replace(/\s+/g, " ").trim();
/** Separators and case ignored (the review list's own identity). */
const markish = (t) => String(t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** A sheet id as "<file>#<page>". */
const sheetId = (s) => String(s ?? "").trim();

/** Which reconcile row a keyed unit is: the row whose schedule sheet is the
 * unit's and whose tag reads the same (case and spacing aside). A unit the
 * key names by a schedule row that names several units by a range or a list
 * ("SF-P1-4 THRU 11", "EF-P1-1 & 2"), or by a pair the takeoff splits
 * ("SS-1/SSCU-1", splitRowMarks), where no row reads as that whole name, is
 * the rows of the marks it names on that sheet together: a reconcile that
 * holds one row per unit (AS-98, AS-99). The key is unchanged; a run holding
 * one row for the whole name matches it exactly, as before. */
export function matchRows(units, rows) {
  const out = new Map();
  for (const u of units) {
    const [sheet, ...rest] = u.split("|"); const raw = rest.join("|"); const tag = canonTag(raw);
    let hits = rows.filter((r) => sheetId(r.schedule_cite?.sheet) === sheet && canonTag(r.tag) === tag);
    if (!hits.length) {
      const marks = (expandEquipMarkRange(raw) ?? expandMarkList(raw) ?? splitRowMarks(raw, false)).map(canonTag);
      const parts = marks.length > 1 ? rows.filter((r) => sheetId(r.schedule_cite?.sheet) === sheet && marks.includes(canonTag(r.tag))) : [];
      if (parts.length) hits = [mergeRows(parts)];
    }
    out.set(u, hits);
  }
  return out;
}

/** The rows of a row's several units read as the one unit the key names. */
function mergeRows(parts) {
  const cat = (field) => parts.flatMap((r) => r[field] ?? []);
  const qty = parts.map((r) => r.installed_qty);
  return {
    ...parts[0],
    tag: parts.map((r) => r.tag).join(" + "),
    status: parts.every((r) => r.status === parts[0].status) ? parts[0].status : "MIXED",
    installed_qty: qty.every((q) => Number.isFinite(q)) ? qty.reduce((a, b) => a + b, 0) : null,
    plan_cites: cat("plan_cites"), plan_tag_cites: cat("plan_tag_cites"),
    plan_candidate_cites: cat("plan_candidate_cites"), plan_other_cites: cat("plan_other_cites"),
    merged_rows: parts.length,
  };
}

export function scoreReconcileSet(key, output) {
  const examined = new Set(key.sheets.filter((s) => /^y/i.test(s.examined)).map((s) => sheetId(s.sheet)));
  const rows = output?.rows ?? [];
  const units = [...new Set(key.tags.map((t) => t.unit).filter((u) => u && u !== "unscheduled" && u !== "ambiguous"))];
  const byUnit = matchRows(units, rows);
  const counted = (u, sheet) => key.tags.filter((t) => t.unit === u && sheetId(t.sheet) === sheet && /^y/i.test(t.counts))
    .reduce((s, t) => s + (Number(t.placements) || 0), 0);
  const cites = (row, field) => (row?.[field] ?? []).filter((c) => examined.has(sheetId(c.sheet)));
  const per = [];
  const sum = { units: units.length, unmatched: 0, duplicate_rows: 0, drawn_tp: 0, drawn_fn: 0, drawn_fp: 0, drawn_tn: 0,
    count_exact: 0, count_over: 0, count_under: 0, key_placements: 0, pipeline_placements: 0, placement_hits: 0, placement_located: 0,
    tag_drawn_tp: 0, tag_drawn_fn: 0, tag_observations: 0, tag_located: 0,
    links: 0, linked: 0, unscheduled: 0, unscheduled_listed: 0, unscheduled_linked_to_a_row: 0,
    review_listed: 0, review_unscheduled: 0, review_scheduled: 0, review_not_a_unit: 0,
    units_listed: 0, units_unscheduled: 0, units_scheduled: 0, units_not_a_unit: 0, unscheduled_units_listed: 0 };
  for (const u of units) {
    const hits = byUnit.get(u);
    if (!hits.length) { sum.unmatched++; per.push({ unit: u, matched: false }); continue; }
    if (hits.length > 1) sum.duplicate_rows++;
    const row = hits[0];
    const sheets = new Set([...key.tags.filter((t) => t.unit === u).map((t) => sheetId(t.sheet)).filter((s) => examined.has(s)), ...cites(row, "plan_cites").map((c) => sheetId(c.sheet))]);
    let K = 0, P = 0, hit = 0;
    const perSheet = [];
    for (const s of sheets) {
      const k = counted(u, s), p = cites(row, "plan_cites").filter((c) => sheetId(c.sheet) === s).length;
      K += k; P += p; hit += Math.min(k, p);
      if (k || p) perSheet.push({ sheet: s, key: k, pipeline: p });
    }
    sum.key_placements += K; sum.pipeline_placements += P; sum.placement_hits += hit;
    const drawnOn = new Set(key.tags.filter((t) => t.unit === u && Number(t.placements) > 0).map((t) => sheetId(t.sheet)).filter((s) => examined.has(s)));
    const located = Math.min(K, cites(row, "plan_cites").filter((c) => drawnOn.has(sheetId(c.sheet))).length);
    sum.placement_located += located;
    if (K > 0 && P > 0) sum.drawn_tp++; else if (K > 0) sum.drawn_fn++; else if (P > 0) sum.drawn_fp++; else sum.drawn_tn++;
    // by its tag: verified placements and unverified tag text alike
    const observed = [...cites(row, "plan_cites"), ...cites(row, "plan_tag_cites")];
    sum.tag_observations += observed.length;
    sum.tag_located += Math.min(K, observed.filter((c) => drawnOn.has(sheetId(c.sheet))).length);
    if (K > 0 && observed.length) sum.tag_drawn_tp++; else if (K > 0) sum.tag_drawn_fn++;
    if (K === P) sum.count_exact++; else if (P > K) sum.count_over++; else sum.count_under++;
    per.push({ unit: u, matched: true, row_tag: row.tag, status: row.status, installed_qty: row.installed_qty ?? null, key: K, pipeline: P, located, sheets: perSheet });
  }
  // PLAN -> ROW
  const links = [];
  for (const t of key.tags) {
    const s = sheetId(t.sheet);
    if (!s || !examined.has(s) || !(Number(t.placements) > 0)) continue;
    if (t.unit === "unscheduled") {
      sum.unscheduled++;
      const listed = (output?.unscheduled_tags ?? []).some((d) => sheetId(d.sheet) === s && markish(d.text) === markish(t.drawn));
      if (listed) sum.unscheduled_listed++;
      const linked = rows.some((r) => ["plan_cites", "plan_tag_cites"].some((f) => (r[f] ?? []).some((c) => sheetId(c.sheet) === s)) && markish(r.tag) === markish(t.drawn));
      if (linked) sum.unscheduled_linked_to_a_row++;
      links.push({ sheet: s, drawn: t.drawn, unit: "unscheduled", listed, linked_to_a_row: linked });
      continue;
    }
    if (t.unit === "ambiguous") continue;
    sum.links++;
    const row = byUnit.get(t.unit)?.[0];
    const linked = Boolean(row) && ["plan_cites", "plan_tag_cites", "plan_candidate_cites", "plan_other_cites"].some((f) => (row[f] ?? []).some((c) => sheetId(c.sheet) === s));
    if (linked) sum.linked++;
    links.push({ sheet: s, drawn: t.drawn, unit: t.unit, view: t.view, counts: t.counts, linked, row: Boolean(row) });
  }
  // THE REVIEW LISTS: every unscheduled mark, and the likely units among them
  const review = [];
  for (const [list, prefix] of [["unscheduled_tags", "review"], ["unscheduled_units", "units"]]) {
    for (const d of output?.[list] ?? []) {
      const s = sheetId(d.sheet);
      if (!examined.has(s)) continue;
      sum[`${prefix}_listed`] = (sum[`${prefix}_listed`] ?? 0) + 1;
      const keyed = key.tags.filter((t) => sheetId(t.sheet) === s && Number(t.placements) > 0 && markish(t.drawn) === markish(d.text));
      const kind = !keyed.length ? "not_a_unit" : keyed.some((t) => t.unit === "unscheduled") ? "unscheduled" : "scheduled";
      sum[`${prefix}_${kind}`] = (sum[`${prefix}_${kind}`] ?? 0) + 1;
      if (prefix === "review") review.push({ sheet: s, text: d.text, kind });
    }
  }
  // keyed unscheduled tags the likely-units list names on their sheet
  for (const l of links) if (l.unit === "unscheduled" && (output?.unscheduled_units ?? []).some((d) => sheetId(d.sheet) === l.sheet && markish(d.text) === markish(l.drawn))) sum.unscheduled_units_listed++;
  return { summary: sum, units: per, links, review, examined: [...examined] };
}

export function totals(results) {
  const t = {};
  for (const r of results) for (const [k, v] of Object.entries(r.summary)) t[k] = (t[k] ?? 0) + v;
  return t;
}

export const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
