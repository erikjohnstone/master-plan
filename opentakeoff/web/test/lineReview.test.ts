import test from "node:test";
import assert from "node:assert/strict";

import {
  lineReviewKey, lineEvidenceSignature, emptyLineReviews, sanitizeLineReviews, lineReviewState,
  recordLineReviews, clearLineReviews, summarizeLineReviews, withReviewColumns,
} from "../src/lib/lineReview.js";

const vav1 = { tag: "VAV-1", table_title: "VAV Box Schedule", qty: 1, unit: "EA", status: "MATCH", scheduled_qty: 1, installed_qty: 1,
  schedule_sheet_id: "m.pdf#14", row_bbox_px: [10, 20, 900, 40], plan_sheet_id: "m.pdf#6", plan_bbox_px: [100, 200, 140, 214] };
const vav2 = { ...vav1, tag: "VAV-2", plan_bbox_px: [300, 400, 340, 414] };

test("a line's key is its tag and schedule, case-insensitive", () => {
  assert.equal(lineReviewKey(vav1), "tag:VAV-1|sched:VAV BOX SCHEDULE");
  assert.equal(lineReviewKey({ ...vav1, tag: " vav-1 ", table_title: "vav box schedule" }), lineReviewKey(vav1));
  assert.equal(lineReviewKey({}), null);
});

test("a confirmation holds for the same evidence and goes stale when it changes", () => {
  const reviews = recordLineReviews(emptyLineReviews(), [vav1], { decision: "confirmed", at: "2026-10-02T00:00:00Z" });
  assert.equal(lineReviewState(vav1, reviews).state, "confirmed");
  // A recompile that reproduces the same line keeps the decision.
  assert.equal(lineReviewState({ ...vav1, notes: "recompiled" }, reviews).state, "confirmed");
  // Different count, status or cited box: the decision no longer vouches for it.
  assert.equal(lineReviewState({ ...vav1, installed_qty: 2 }, reviews).state, "stale");
  assert.equal(lineReviewState({ ...vav1, status: "AMBIGUOUS" }, reviews).state, "stale");
  assert.equal(lineReviewState({ ...vav1, plan_bbox_px: [101, 200, 141, 214] }, reviews).state, "stale");
  assert.equal(lineReviewState(vav2, reviews).state, "unreviewed");
});

test("flags keep their note; clearing removes only the named lines", () => {
  let reviews = recordLineReviews(emptyLineReviews(), [vav1, vav2], { decision: "confirmed", at: "t1" });
  reviews = recordLineReviews(reviews, [vav2], { decision: "flagged", note: "  tag is on the existing-work plan  ", at: "t2" });
  assert.equal(lineReviewState(vav2, reviews).state, "flagged");
  assert.equal(lineReviewState(vav2, reviews).record.note, "tag is on the existing-work plan");
  const cleared = clearLineReviews(reviews, [vav2]);
  assert.equal(lineReviewState(vav2, cleared).state, "unreviewed");
  assert.equal(lineReviewState(vav1, cleared).state, "confirmed");
  // Immutable: the earlier object is unchanged.
  assert.equal(lineReviewState(vav2, reviews).state, "flagged");
});

test("unknown decisions are refused", () => {
  assert.throws(() => recordLineReviews(emptyLineReviews(), [vav1], { decision: "approved" }), /Unknown review decision/);
});

test("summary counts every state", () => {
  let reviews = recordLineReviews(emptyLineReviews(), [vav1], { decision: "confirmed" });
  reviews = recordLineReviews(reviews, [vav2], { decision: "flagged" });
  const vav3 = { ...vav1, tag: "VAV-3" };
  assert.deepEqual(summarizeLineReviews([vav1, { ...vav2, installed_qty: 3 }, vav3], reviews),
    { total: 3, confirmed: 1, flagged: 0, corrected: 0, stale: 1, unreviewed: 1 });
});

test("the load gate keeps well-formed records only", () => {
  const sig = lineEvidenceSignature(vav1);
  const clean = sanitizeLineReviews({ records: {
    [lineReviewKey(vav1) ?? ""]: { decision: "confirmed", sig, at: "t", note: "ok" },
    "tag:X|sched:Y": { decision: "approved", sig },
    "tag:Z|sched:Y": { decision: "flagged" },
    "bogus": { decision: "confirmed", sig },
  } });
  assert.deepEqual(Object.keys(clean.records), [lineReviewKey(vav1)]);
  assert.equal(lineReviewState(vav1, clean).state, "confirmed");
  assert.deepEqual(sanitizeLineReviews(null).records, {});
});

test("export columns name the state in words; a stale decision exports no date", () => {
  const reviews = recordLineReviews(emptyLineReviews(), [vav1], { decision: "flagged", note: "check", at: "2026-10-02" });
  const [a, b] = withReviewColumns([vav1, { ...vav1, installed_qty: 4 }], reviews);
  assert.equal(a.review_state, "Flagged");
  assert.equal(a.review_note, "check");
  assert.equal(a.review_at, "2026-10-02");
  assert.equal(b.review_state, "Changed since review");
  assert.equal(b.review_at, "");
});

test("a correction carries the estimator's count and reason, beside the machine's", async () => {
  const { effectiveLineQty } = await import("../src/lib/lineReview.js");
  assert.throws(() => recordLineReviews(emptyLineReviews(), [vav1], { decision: "corrected", qty: 2 }), /needs a reason/);
  assert.throws(() => recordLineReviews(emptyLineReviews(), [vav1], { decision: "corrected", qty: -1, note: "x" }), /whole-number/);
  assert.throws(() => recordLineReviews(emptyLineReviews(), [vav1], { decision: "corrected", qty: 1.5, note: "x" }), /whole-number/);
  const reviews = recordLineReviews(emptyLineReviews(), [vav1], { decision: "corrected", qty: 2, note: "second box drawn untagged in 312", at: "t" });
  assert.equal(lineReviewState(vav1, reviews).state, "corrected");
  assert.equal(effectiveLineQty(vav1, reviews), 2);
  assert.equal(effectiveLineQty(vav2, reviews), 1);
  // A changed reading voids the correction until someone looks again.
  assert.equal(effectiveLineQty({ ...vav1, installed_qty: 3 }, reviews), 1);
  const [row] = withReviewColumns([vav1], reviews);
  assert.equal(row.review_state, "Corrected");
  assert.equal(row.review_qty, 2);
  assert.equal(row.qty, 1, "the machine's count stays as read");
  assert.equal(summarizeLineReviews([vav1, vav2], reviews).corrected, 1);
  // The load gate keeps a correction only with its count and reason.
  const key = lineReviewKey(vav1) ?? "";
  const sig = lineEvidenceSignature(vav1);
  assert.equal(Object.keys(sanitizeLineReviews({ records: { [key]: { decision: "corrected", sig, qty: 2 } } }).records).length, 0);
  assert.equal((sanitizeLineReviews({ records: { [key]: { decision: "corrected", sig, qty: 2, note: "why" } } }).records as Record<string, any>)[key].qty, 2);
});
