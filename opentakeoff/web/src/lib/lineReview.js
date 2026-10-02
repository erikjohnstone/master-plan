// Estimator review of finished takeoff lines — the human-in-the-loop record.
//
// A takeoff line is machine-read evidence (a schedule row, a plan tag, a
// count). The estimator's job is to look at that evidence and either confirm
// the line or flag it. This module keeps those decisions:
//
// - keyed by the line's own identity (tag + schedule), so a decision survives
//   a recompile that produces the same line again;
// - bound to a signature of the evidence the reviewer actually looked at (the
//   quantities, status and the exact cited boxes), so a decision made on one
//   reading never silently vouches for a different one: if the evidence
//   changes, the decision reads "stale" until someone looks again;
// - never changing the machine's quantity. A flag is a note for the estimate.
//   A correction is the estimator's own count with a required reason: it
//   stands beside the machine count (both export), and it lapses to "stale"
//   like any decision when the line's evidence changes.
// - A line whose printed plan tags are its only plan evidence (no unit
//   geometry verified) carries no installed count. The estimator can check
//   each tag and count them: "counted" records how many of the line's tags
//   they kept (the ones they excluded, by box), as their count.
// - A line whose units are drawn without tags can be counted on the plans
//   instead: the estimator counts its symbols on the canvas (Symbol tool or
//   Count clicks) under a condition tied to the line. That "counted" record
//   names the condition (condition_id) and its count follows the condition's
//   count marks live (syncCanvasCounts): deleting a mark lowers it, removing
//   the condition removes the count.
//
// Pure and dependency-free so the canvas, exports and tests share one rule.

export const LINE_REVIEW_SCHEMA = "opentakeoff.line_review.v1";
export const REVIEW_DECISIONS = Object.freeze(["confirmed", "flagged", "corrected", "counted"]);

const validQty = (q) => Number.isInteger(q) && q >= 0 && q <= 100000;

const norm = (v) => String(v ?? "").trim().toUpperCase();

/**
 * A line's identity: tag + schedule title (the takeoff's own grouping key).
 * @param {any} line
 * @returns {string | null}
 */
export function lineReviewKey(line) {
  const tag = norm(line?.tag);
  const title = norm(typeof line?.table_title === "object" && line?.table_title ? line.table_title.text : line?.table_title);
  if (!tag && !title) return null;
  return `tag:${tag}|sched:${title}`;
}

function boxText(b) {
  if (!b) return "";
  const v = Array.isArray(b) ? b : [b.x0, b.y0, b.x1, b.y1];
  return v.map((n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : "")).join(",");
}

// FNV-1a 32-bit — short, stable, no crypto dependency (this is an identity
// check on our own record, not a security boundary).
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** One printed tag's identity on a line: its sheet and its box. */
export function tagOccurrenceKey(occurrence) {
  return `${occurrence?.sheet_id ?? ""}|${boxText(occurrence?.bbox_px)}`;
}

/** Signature of the evidence a reviewer sees for a line. */
export function lineEvidenceSignature(line) {
  if (!line) return "";
  const parts = [
    line.qty ?? "", line.unit ?? "", line.scheduled_qty ?? "", line.installed_qty ?? "",
    line.tagged_plan_qty ?? "", norm(line.status),
    line.schedule_sheet_id ?? "", boxText(line.row_bbox_px),
    line.plan_sheet_id ?? "", boxText(line.plan_bbox_px),
    line.plan_tag_sheet_id ?? "", boxText(line.plan_tag_bbox_px),
  ];
  // Every tag the estimator can check, when the line carries them (a line
  // without them signs exactly as before).
  if (line.plan_tag_occurrences?.length) parts.push(line.plan_tag_occurrences.map(tagOccurrenceKey).join(";"));
  return fnv1a(parts.join("\u001f"));
}

export function emptyLineReviews() {
  return { schema: LINE_REVIEW_SCHEMA, records: {} };
}

/** Load gate: keep only well-formed records; anything else is dropped. */
export function sanitizeLineReviews(raw) {
  const out = emptyLineReviews();
  const records = raw && typeof raw === "object" && raw.records && typeof raw.records === "object" ? raw.records : {};
  for (const [key, rec] of Object.entries(records)) {
    if (typeof key !== "string" || !key.startsWith("tag:")) continue;
    if (!rec || !REVIEW_DECISIONS.includes(rec.decision) || typeof rec.sig !== "string" || !rec.sig) continue;
    // A correction is only a correction with its count and its reason.
    if (rec.decision === "corrected" && (!validQty(rec.qty) || typeof rec.note !== "string" || !rec.note.trim())) continue;
    // A tag count is only a count with its number and the tags it left out.
    // A plan count is only a count with its number and the canvas condition it follows.
    const canvas = typeof rec.condition_id === "string" && rec.condition_id !== "";
    if (rec.decision === "counted" && (!validQty(rec.qty) || (!canvas && (!Array.isArray(rec.excluded) || !rec.excluded.every((k) => typeof k === "string"))))) continue;
    out.records[key] = {
      decision: rec.decision,
      sig: rec.sig,
      ...(rec.decision === "corrected" || rec.decision === "counted" ? { qty: rec.qty } : {}),
      ...(rec.decision === "counted" && canvas ? { condition_id: rec.condition_id } : {}),
      ...(rec.decision === "counted" && !canvas ? { excluded: rec.excluded.slice(0, 100000) } : {}),
      ...(typeof rec.note === "string" && rec.note.trim() ? { note: rec.note.trim().slice(0, 2000) } : {}),
      ...(typeof rec.at === "string" ? { at: rec.at } : {}),
      ...(typeof rec.tag === "string" ? { tag: rec.tag } : {}),
    };
  }
  return out;
}

/**
 * The review state of one line: "confirmed" | "flagged" | "corrected" |
 * "counted" | "stale" | "unreviewed". "stale" means a decision exists but the line's evidence has
 * changed since; it vouches for nothing until reviewed again.
 */
export function lineReviewState(line, reviews) {
  const key = lineReviewKey(line);
  const rec = key ? reviews?.records?.[key] : null;
  if (!rec) return { state: "unreviewed", record: null };
  if (rec.sig !== lineEvidenceSignature(line)) return { state: "stale", record: rec };
  return { state: rec.decision, record: rec };
}

/**
 * Record a decision for each line (immutable update). A "corrected" decision
 * carries the estimator's count (`qty`, a whole number ≥ 0) and a reason.
 * A "counted" decision takes the tags of each line it records (its
 * `plan_tag_occurrences`) less the `excluded` ones (tagOccurrenceKey), and
 * records that number as the count; a line with no tags to count refuses.
 * @param {any} reviews
 * @param {any[]} lines
 * @param {{ decision: string, note?: string, at?: string, qty?: number, excluded?: string[] }} opts
 */
export function recordLineReviews(reviews, lines, { decision, note = "", at = new Date().toISOString(), qty, excluded = [] }) {
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error(`Unknown review decision: ${decision}`);
  if (decision === "corrected") {
    if (!validQty(qty)) throw new Error("A correction needs a whole-number count of 0 or more.");
    if (!String(note || "").trim()) throw new Error("A correction needs a reason.");
  }
  if (decision === "counted") {
    for (const line of lines || []) {
      if (!countableTags(line).length) throw new Error(`${line?.tag || "This line"} has no plan tags to count.`);
    }
  }
  const next = { schema: LINE_REVIEW_SCHEMA, records: { ...(reviews?.records || {}) } };
  for (const line of lines || []) {
    const key = lineReviewKey(line);
    if (!key) continue;
    const counted = decision === "counted" ? tagCount(line, excluded) : null;
    next.records[key] = {
      decision,
      sig: lineEvidenceSignature(line),
      ...(decision === "corrected" ? { qty } : {}),
      ...(counted ? { qty: counted.qty, excluded: counted.excluded } : {}),
      ...(note && String(note).trim() ? { note: String(note).trim().slice(0, 2000) } : {}),
      at,
      ...(line.tag ? { tag: String(line.tag) } : {}),
    };
  }
  return next;
}

/** The printed tags a line offers to count (its checked-one-by-one list). */
export function countableTags(line) {
  return Array.isArray(line?.plan_tag_occurrences) ? line.plan_tag_occurrences : [];
}

/** How many of a line's tags remain once `excluded` (tagOccurrenceKey) are
 * left out; only keys naming one of the line's own tags are kept. */
export function tagCount(line, excluded = []) {
  const tags = countableTags(line);
  const own = new Set(tags.map(tagOccurrenceKey));
  const out = [...new Set((excluded || []).filter((k) => own.has(k)))];
  return { qty: tags.length - out.length, excluded: out };
}

/** True when a record is a count made on the plans (it follows a canvas condition). */
export function countedOnPlans(record) {
  return record?.decision === "counted" && typeof record.condition_id === "string" && record.condition_id !== "";
}

/**
 * Record a count made on the plans for one line (immutable update): the
 * line's units counted on the canvas under `condition_id`, `qty` marks so far.
 * `link` is what the canvas kept when counting began: the line's key, the
 * evidence signature it was shown on, and its tag. The decision is bound to
 * that signature, so a line whose evidence has since changed reads stale.
 * @param {any} reviews
 * @param {{ key: string | null, sig: string, tag?: string }} link
 * @param {string} condition_id @param {number} qty
 */
export function recordCanvasCount(reviews, link, condition_id, qty, { at = new Date().toISOString() } = {}) {
  if (!link?.key || !String(link.key).startsWith("tag:") || typeof link.sig !== "string" || !link.sig) throw new Error("This count is not tied to a takeoff line.");
  if (typeof condition_id !== "string" || !condition_id) throw new Error("A plan count needs its condition.");
  if (!validQty(qty)) throw new Error("A plan count is a whole number of 0 or more.");
  return { schema: LINE_REVIEW_SCHEMA, records: { ...(reviews?.records || {}),
    [link.key]: { decision: "counted", sig: link.sig, qty, condition_id, at, ...(link.tag ? { tag: String(link.tag) } : {}) } } };
}

/**
 * Keep every plan count equal to its condition's live count marks.
 * `counts` maps each existing condition id to its count; a record whose
 * condition no longer exists is removed (its count is gone). Returns the same
 * object when nothing changed, so it is safe to run on every shape change.
 * @param {any} reviews @param {Record<string, number>} counts
 */
export function syncCanvasCounts(reviews, counts) {
  if (!reviews?.records) return reviews;
  let next = null;
  for (const [key, rec] of Object.entries(reviews.records)) {
    if (!countedOnPlans(rec)) continue;
    const has = Object.prototype.hasOwnProperty.call(counts || {}, rec.condition_id);
    const live = has ? counts[rec.condition_id] : null;
    if (has && live === rec.qty) continue;
    next ??= { schema: LINE_REVIEW_SCHEMA, records: { ...reviews.records } };
    if (!has || !validQty(live)) delete next.records[key];
    else next.records[key] = { ...rec, qty: live };
  }
  return next || reviews;
}

/** Remove the decision for each line (immutable update). */
export function clearLineReviews(reviews, lines) {
  const next = { schema: LINE_REVIEW_SCHEMA, records: { ...(reviews?.records || {}) } };
  for (const line of lines || []) {
    const key = lineReviewKey(line);
    if (key) delete next.records[key];
  }
  return next;
}

/** Counts by state over the given lines. */
export function summarizeLineReviews(lines, reviews) {
  const out = { total: 0, confirmed: 0, flagged: 0, corrected: 0, counted: 0, stale: 0, unreviewed: 0 };
  for (const line of lines || []) {
    out.total++;
    out[lineReviewState(line, reviews).state]++;
  }
  return out;
}

const STATE_LABEL = { confirmed: "Confirmed", flagged: "Flagged", corrected: "Corrected", counted: "Counted from tags", stale: "Changed since review", unreviewed: "Not reviewed" };
const stateLabel = (state, record) => (state === "counted" && countedOnPlans(record) ? "Counted on plans" : STATE_LABEL[state]);

/**
 * The quantity the estimate carries for a line: the estimator's correction or
 * tag count when one stands on the current evidence, else the machine's.
 * @param {any} line @param {any} reviews @returns {number|null}
 */
export function effectiveLineQty(line, reviews) {
  const { state, record } = lineReviewState(line, reviews);
  if (state === "corrected" || state === "counted") return record.qty;
  return typeof line?.qty === "number" ? line.qty : null;
}

/** Lines with their review state attached, for exports. */
export function withReviewColumns(lines, reviews) {
  return (lines || []).map((line) => {
    const { state, record } = lineReviewState(line, reviews);
    return {
      ...line,
      review_state: stateLabel(state, record),
      review_qty: state === "corrected" || state === "counted" ? record.qty : "",
      review_note: record?.note || "",
      review_at: record && state !== "stale" ? record.at || "" : "",
    };
  });
}
