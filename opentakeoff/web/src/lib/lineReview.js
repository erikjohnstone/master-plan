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
//
// Pure and dependency-free so the canvas, exports and tests share one rule.

export const LINE_REVIEW_SCHEMA = "opentakeoff.line_review.v1";
export const REVIEW_DECISIONS = Object.freeze(["confirmed", "flagged", "corrected"]);

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
    out.records[key] = {
      decision: rec.decision,
      sig: rec.sig,
      ...(rec.decision === "corrected" ? { qty: rec.qty } : {}),
      ...(typeof rec.note === "string" && rec.note.trim() ? { note: rec.note.trim().slice(0, 2000) } : {}),
      ...(typeof rec.at === "string" ? { at: rec.at } : {}),
      ...(typeof rec.tag === "string" ? { tag: rec.tag } : {}),
    };
  }
  return out;
}

/**
 * The review state of one line: "confirmed" | "flagged" | "corrected" |
 * "stale" | "unreviewed". "stale" means a decision exists but the line's evidence has
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
 * @param {any} reviews
 * @param {any[]} lines
 * @param {{ decision: string, note?: string, at?: string, qty?: number }} opts
 */
export function recordLineReviews(reviews, lines, { decision, note = "", at = new Date().toISOString(), qty }) {
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error(`Unknown review decision: ${decision}`);
  if (decision === "corrected") {
    if (!validQty(qty)) throw new Error("A correction needs a whole-number count of 0 or more.");
    if (!String(note || "").trim()) throw new Error("A correction needs a reason.");
  }
  const next = { schema: LINE_REVIEW_SCHEMA, records: { ...(reviews?.records || {}) } };
  for (const line of lines || []) {
    const key = lineReviewKey(line);
    if (!key) continue;
    next.records[key] = {
      decision,
      sig: lineEvidenceSignature(line),
      ...(decision === "corrected" ? { qty } : {}),
      ...(note && String(note).trim() ? { note: String(note).trim().slice(0, 2000) } : {}),
      at,
      ...(line.tag ? { tag: String(line.tag) } : {}),
    };
  }
  return next;
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
  const out = { total: 0, confirmed: 0, flagged: 0, corrected: 0, stale: 0, unreviewed: 0 };
  for (const line of lines || []) {
    out.total++;
    out[lineReviewState(line, reviews).state]++;
  }
  return out;
}

const STATE_LABEL = { confirmed: "Confirmed", flagged: "Flagged", corrected: "Corrected", stale: "Changed since review", unreviewed: "Not reviewed" };

/**
 * The quantity the estimate carries for a line: the estimator's correction
 * when one stands on the current evidence, else the machine's.
 * @param {any} line @param {any} reviews @returns {number|null}
 */
export function effectiveLineQty(line, reviews) {
  const { state, record } = lineReviewState(line, reviews);
  if (state === "corrected") return record.qty;
  return typeof line?.qty === "number" ? line.qty : null;
}

/** Lines with their review state attached, for exports. */
export function withReviewColumns(lines, reviews) {
  return (lines || []).map((line) => {
    const { state, record } = lineReviewState(line, reviews);
    return {
      ...line,
      review_state: STATE_LABEL[state],
      review_qty: state === "corrected" ? record.qty : "",
      review_note: record?.note || "",
      review_at: record && state !== "stale" ? record.at || "" : "",
    };
  });
}
