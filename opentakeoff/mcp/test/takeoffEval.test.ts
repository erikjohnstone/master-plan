// Regression coverage for takeoff-eval.mjs's own comparison logic
// (src/takeoffEval.ts) — a small synthetic key + synthetic buildPlanSetTakeoff
// output, asserting the delta/missing/falsely-added/failure-breakdown math is
// right. Nothing here touches a real PDF or a Session: this is pure data in,
// pure data out, the same discipline scalewarn.test.ts already applies to its
// own pure comparison function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTakeoffKeyCsv, scoreTakeoff, canonTag, type TakeoffKeyRow } from "../src/takeoffEval.ts";
import type { PlanSetTakeoff, TakeoffItem, TakeoffFailure } from "../src/takeoff.ts";

// ── fixtures ────────────────────────────────────────────────────────────────
const item = (over: Partial<TakeoffItem>): TakeoffItem => ({
  tag: "T-1",
  equipment_type: "Widget",
  category: "valve",
  schedule: { sheet: "s#1", kind: "equipment", title: "WIDGET SCHEDULE" },
  schedule_row: {},
  quantity: 0,
  drawing_locations: [],
  siblings_excluded: [],
  corroborated: false,
  status: "resolved",
  source: "schedule_row",
  ...over,
});

const takeoffOf = (items: TakeoffItem[], failures: TakeoffFailure[] = []): Pick<PlanSetTakeoff, "items" | "failures"> => ({ items, failures });

const keyRow = (over: Partial<TakeoffKeyRow>): TakeoffKeyRow => ({
  tag: "T-1", equipment_type: "Widget", expected_quantity: 1, sheets: ["s#1"], notes: "", ...over,
});

// ── canonTag ────────────────────────────────────────────────────────────────
test("canonTag: normalizes whitespace and case the same way takeoff.ts itself does", () => {
  assert.equal(canonTag(" ebb-1 "), "EBB-1");
  assert.equal(canonTag("EBB 1"), "EBB1");
  assert.equal(canonTag(""), "");
});

// ── parseTakeoffKeyCsv ──────────────────────────────────────────────────────
test("parseTakeoffKeyCsv: skips '#' comment lines and blank lines, keeps data rows", () => {
  const csv = [
    "# a header comment block",
    "# spanning several lines",
    "",
    "tag,equipment_type,expected_quantity,sheets,notes",
    'EWH-1,Electric wall heater,1,plan.pdf#6,"has, a comma"',
    "EBB-1,Electric baseboard heater,2,plan.pdf#6;plan.pdf#7,plain note",
  ].join("\n");
  const rows = parseTakeoffKeyCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { tag: "EWH-1", equipment_type: "Electric wall heater", expected_quantity: 1, sheets: ["plan.pdf#6"], notes: "has, a comma", expected_status: "resolved" });
  assert.deepEqual(rows[1].sheets, ["plan.pdf#6", "plan.pdf#7"]);
  assert.equal(rows[1].expected_quantity, 2);
});

test("parseTakeoffKeyCsv: a header-only or empty file yields no rows, not a crash", () => {
  assert.deepEqual(parseTakeoffKeyCsv(""), []);
  assert.deepEqual(parseTakeoffKeyCsv("tag,equipment_type,expected_quantity,sheets,notes"), []);
});

// ── scoreTakeoff: quantity delta ───────────────────────────────────────────
test("scoreTakeoff: exact match scores delta=0, exact=true", () => {
  const takeoff = takeoffOf([item({ tag: "T-1", quantity: 3, status: "resolved" })]);
  const key = [keyRow({ tag: "T-1", expected_quantity: 3 })];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.per_tag.length, 1);
  assert.deepEqual(score.per_tag[0], { tag: "T-1", expected: 3, actual: 3, delta: 0, exact: true, status: "resolved", expected_status: "resolved" });
  assert.equal(score.summary.exact_matches, 1);
  assert.equal(score.summary.exact_match_pct, 1);
  assert.equal(score.summary.total_quantity_delta, 0);
});

test("scoreTakeoff: an over-count (the real EWH-1/EBB-8 bug shape) scores a positive delta, not silently rounded away", () => {
  const takeoff = takeoffOf([item({ tag: "EWH-1", quantity: 2, status: "resolved" })]);
  const key = [keyRow({ tag: "EWH-1", expected_quantity: 1 })];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.per_tag[0].delta, 1);
  assert.equal(score.per_tag[0].exact, false);
  assert.equal(score.summary.exact_matches, 0);
  assert.equal(score.summary.total_quantity_delta, 1);
});

test("scoreTakeoff: an under-count scores a negative delta", () => {
  const takeoff = takeoffOf([item({ tag: "T-1", quantity: 1, status: "resolved" })]);
  const key = [keyRow({ tag: "T-1", expected_quantity: 4 })];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.per_tag[0].delta, -3);
  assert.equal(score.summary.total_quantity_delta, 3);
});

test("scoreTakeoff: a refused/errored item counts as actual=0, not skipped", () => {
  const takeoff = takeoffOf([item({ tag: "T-1", quantity: 0, status: "refused", reason: "cannot be geometrically anchored" })]);
  const key = [keyRow({ tag: "T-1", expected_quantity: 2 })];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.per_tag[0].actual, 0);
  assert.equal(score.per_tag[0].delta, -2);
  assert.equal(score.per_tag[0].status, "refused");
});

test("scoreTakeoff: an expected honest refusal scores exact but is excluded from applicable quantity", () => {
  const takeoff = takeoffOf([item({ tag: "T-1", quantity: 0, status: "refused" })]);
  const score = scoreTakeoff(takeoff, [keyRow({ expected_quantity: 1, expected_status: "refused" })]);
  assert.equal(score.per_tag[0].exact, true);
  assert.equal(score.per_tag[0].delta, 0);
  assert.equal(score.summary.applicable_tags, 0);
  assert.equal(score.summary.correct_refusals, 1);
});

test("scoreTakeoff: an expected structurally unavailable row scores only when absent", () => {
  const score = scoreTakeoff(takeoffOf([]), [keyRow({ expected_status: "not_in_output" })]);
  assert.equal(score.per_tag[0].exact, true);
  assert.deepEqual(score.missing, []);
  assert.equal(score.summary.exact_matches, 1);
});

// ── scoreTakeoff: missing ──────────────────────────────────────────────────
test("scoreTakeoff: a key tag with no item at all in the pipeline output is MISSING, not a quantity delta of -expected only", () => {
  const takeoff = takeoffOf([item({ tag: "T-1", quantity: 1 })]);
  const key = [keyRow({ tag: "T-1", expected_quantity: 1 }), keyRow({ tag: "T-2", expected_quantity: 5 })];
  const score = scoreTakeoff(takeoff, key);
  assert.deepEqual(score.missing, ["T-2"]);
  // still shows up in per_tag with the right delta/status, for the printed detail
  const t2 = score.per_tag.find((t) => t.tag === "T-2")!;
  assert.equal(t2.status, "not_in_output");
  assert.equal(t2.actual, 0);
  assert.equal(t2.delta, -5);
});

// ── scoreTakeoff: falsely added ─────────────────────────────────────────────
test("scoreTakeoff: a resolved pipeline item the key never mentions is FALSELY ADDED", () => {
  const takeoff = takeoffOf([
    item({ tag: "T-1", quantity: 1 }),
    item({ tag: "T-9", quantity: 2, equipment_type: "Surprise" }),
  ]);
  const key = [keyRow({ tag: "T-1", expected_quantity: 1 })];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.falsely_added.length, 1);
  assert.deepEqual(score.falsely_added[0], { tag: "T-9", equipment_type: "Surprise", quantity: 2 });
});

test("scoreTakeoff: a resolved item with quantity=0 is never falsely-added (nothing was actually claimed as installed)", () => {
  const takeoff = takeoffOf([item({ tag: "T-9", quantity: 0, status: "resolved" })]);
  const score = scoreTakeoff(takeoff, []);
  assert.equal(score.falsely_added.length, 0);
});

test("scoreTakeoff: tag comparison is canonicalized (case/whitespace) both directions", () => {
  const takeoff = takeoffOf([item({ tag: "ebb-1", quantity: 1 })]);
  const key = [keyRow({ tag: "EBB-1", expected_quantity: 1 })];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.missing.length, 0);
  assert.equal(score.falsely_added.length, 0);
  assert.equal(score.per_tag[0].exact, true);
});

// ── scoreTakeoff: failure breakdown ────────────────────────────────────────
test("scoreTakeoff: failure_breakdown tallies TakeoffFailure[] by type, untouched by per-tag scoring", () => {
  const failures: TakeoffFailure[] = [
    { type: "SYMBOL_FALSE_NEGATIVE", tag: "A-1", detail: "x" },
    { type: "SYMBOL_FALSE_NEGATIVE", tag: "A-2", detail: "y" },
    { type: "AMBIGUOUS_ROW_KEY", tag: "A-3", detail: "z" },
  ];
  const takeoff = takeoffOf([item({ tag: "T-1", quantity: 1 })], failures);
  const score = scoreTakeoff(takeoff, [keyRow({ tag: "T-1", expected_quantity: 1 })]);
  assert.deepEqual(score.failure_breakdown, { SYMBOL_FALSE_NEGATIVE: 2, AMBIGUOUS_ROW_KEY: 1 });
});

// ── scoreTakeoff: aggregate summary, whole-corpus shape ────────────────────
test("scoreTakeoff: summary reflects a mix of exact, over, under and missing tags honestly", () => {
  const takeoff = takeoffOf([
    item({ tag: "A", quantity: 1, status: "resolved" }),   // exact
    item({ tag: "B", quantity: 3, status: "resolved" }),   // over by 1
    item({ tag: "C", quantity: 0, status: "refused" }),    // under by 2 (missing entirely from drawing per key)
  ]);
  const key = [
    keyRow({ tag: "A", expected_quantity: 1 }),
    keyRow({ tag: "B", expected_quantity: 2 }),
    keyRow({ tag: "C", expected_quantity: 2 }),
    keyRow({ tag: "D", expected_quantity: 1 }), // not in output at all
  ];
  const score = scoreTakeoff(takeoff, key);
  assert.equal(score.summary.total_tags, 4);
  assert.equal(score.summary.exact_matches, 1);
  assert.equal(score.summary.exact_match_pct, 0.25);
  assert.equal(score.summary.total_quantity_delta, 1 + 2 + 1); // B over by 1, C under by 2, D under by 1
  assert.deepEqual(score.missing, ["D"]);
});

test("scoreTakeoff: an empty key scores an empty, non-crashing summary", () => {
  const score = scoreTakeoff(takeoffOf([]), []);
  assert.equal(score.summary.total_tags, 0);
  assert.equal(score.summary.exact_match_pct, 0);
  assert.equal(score.summary.total_quantity_delta, 0);
  assert.deepEqual(score.missing, []);
  assert.deepEqual(score.falsely_added, []);
});
