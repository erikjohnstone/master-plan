// The set-wide drawn-tag census (plans/03-drawing-tag-recognition-audit.md
// §3.3 WP2). Synthetic spans only — the rule is the shape of recognition,
// identity, and table exclusion, never a corpus filename.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTagIndex, tagIndexFor, planTags, referenceTags } from "../src/lib/tagIndex.ts";
import type { GraphSpan, ScheduleTable, SheetSpans } from "../src/lib/sheetgraph.ts";

const sp = (str: string, x: number, y: number, w?: number, h = 8, rot?: number): GraphSpan => ({
  str, x, y, w: w ?? str.length * 6, h, ...(rot ? { rot } : {}),
});

const sheet = (key: string, spans: GraphSpan[], sheet_number: string | null = null): SheetSpans => ({
  key, sheet_number, spans,
});

test("tagIndex: a CAD glyph-split run rejoins into one drawn tag", () => {
  // "PCHWP-MT1" arrives as three adjacent same-row runs, the shape
  // equiptags.ts's own joinHyphenatedTags exists for.
  const s = sheet("plan.pdf#1", [
    sp("PCHWP", 100, 700, 30),
    sp("-", 130, 700, 6),
    sp("MT1", 136, 700, 20),
  ], "M-101");
  const tags = buildTagIndex([s], [], []);
  const found = tags.filter((t) => t.key === "PCHWPMT1");
  assert.equal(found.length, 1, "the three glyph-split runs must collapse to one drawn tag");
  assert.equal(found[0].text, "PCHWP-MT1");
});

test("tagIndex: a stacked prefix-over-number bubble (demonstrated family) becomes one drawn tag", () => {
  // labelTokens' own stackedEquipmentTagTokens requires the family
  // demonstrated twice (or an explicit hyphenated sibling) before it trusts
  // a 2-letter stacked pair — two real stacked HWP bubbles on the same
  // sheet satisfy that quorum.
  const s = sheet("plan.pdf#1", [
    sp("HWP", 100, 700, 20), sp("1", 106, 712, 8),
    sp("HWP", 300, 700, 20), sp("2", 306, 712, 8),
  ], "M-101");
  const tags = buildTagIndex([s], [], []);
  const hwp1 = tags.filter((t) => t.key === "HWP1");
  const hwp2 = tags.filter((t) => t.key === "HWP2");
  assert.equal(hwp1.length, 1, "the stacked HWP/1 bubble must become one drawn tag");
  assert.equal(hwp1[0].text, "HWP-1");
  assert.equal(hwp2.length, 1, "the second stacked HWP/2 bubble must also become one drawn tag");
});

test("tagIndex: a tag inside a table's own region is excluded from plan/reference tags but stays in the raw index", () => {
  const s = sheet("plan.pdf#2", [
    sp("FCU-1", 100, 100), // inside the table region — a schedule row label
    sp("FCU-2", 500, 500), // outside — a genuinely drawn field tag
  ], "M-102");
  const table: ScheduleTable = {
    kind: "equipment", sheet: "plan.pdf#2", title: { sheet: "plan.pdf#2", text: "FCU SCHEDULE", bbox: [0, 0, 10, 10] },
    headers: ["MARK"], rows: [], region: [0, 0, 200, 200],
  };
  const tags = buildTagIndex([s], [table], []);
  const inside = tags.find((t) => t.key === "FCU1");
  const outside = tags.find((t) => t.key === "FCU2");
  assert.ok(inside, "the in-region tag is still in the raw index");
  assert.deepEqual(inside!.in_table, { sheet: "plan.pdf#2", title: "FCU SCHEDULE" });
  assert.equal(outside!.in_table, null, "the out-of-region tag carries no in_table");

  // Both sheets classify plan (no title text at all → the bare sheet-number
  // fallback), so planTags must drop the in-table row label and keep the
  // genuinely drawn field tag.
  const graph = { tags };
  const plan = planTags(graph);
  assert.ok(!plan.some((t) => t.key === "FCU1"), "a table-region tag must never reach planTags");
  assert.ok(plan.some((t) => t.key === "FCU2"), "a genuinely drawn field tag must reach planTags");
});

test("tagIndex: a schedule-role sheet's own text outside every extracted table region still counts as table content, not a drawn tag", () => {
  // Real, general shape (plan §3.3): table-region coverage is incomplete on
  // real sets — a schedule-role sheet's own row/column text sitting outside
  // every extracted region is still schedule content, never a drawn field
  // instance, and must carry a synthetic in_table entry (title: null).
  const s = sheet("sched.pdf#1", [
    sp("AIR HANDLING UNIT SCHEDULE", 50, 50, 250),
    sp("AHU-9", 900, 900), // far outside any extracted region on this sheet
  ], "M-601");
  const tags = buildTagIndex([s], [], []);
  const ahu9 = tags.find((t) => t.key === "AHU9");
  assert.ok(ahu9, "the tag is still in the raw index");
  assert.deepEqual(ahu9!.in_table, { sheet: "sched.pdf#1", title: null });
  const graph = { tags };
  assert.ok(!referenceTags(graph).some((t) => t.key === "AHU9"), "schedule-role table content must never reach referenceTags either");
});

test("tagIndex: sheet_callout flags a drawn run that is really a sheet-number cross-reference", () => {
  const s = sheet("plan.pdf#3", [
    sp("SEE M-501 FOR DETAIL", 100, 100), // a real cross-reference note — excluded from role voting, but a callout can also be its OWN bare run
    sp("M-501", 400, 400), // a bare sheet-number callout run
    sp("FCU-3", 700, 700), // a genuine device tag, not a sheet number
  ], "M-101");
  const tags = buildTagIndex([s], [], ["M-501", "M-101"]);
  const callout = tags.find((t) => t.text === "M-501");
  const device = tags.find((t) => t.key === "FCU3");
  assert.ok(callout?.sheet_callout, "a bare sheet-number run must carry sheet_callout: true");
  assert.equal(device!.sheet_callout, false, "a genuine device tag must never carry sheet_callout");
});

test("tagIndex: hyphen twins are two distinct drawn occurrences that share one identity key", () => {
  // "P-1" and "P1" (hyphen present or omitted) are real drafting variation,
  // not identity — markKey already treats them as one key. A run with an
  // actual rendered SPACE glyph ("P 1") is a different, ambiguous shape
  // (indistinguishable from two-word prose) that none of the recognisers
  // admit at all, correctly — this test is about the hyphen twin only.
  const s = sheet("plan.pdf#4", [
    sp("P-1", 100, 100),
    sp("P1", 900, 900), // a distant, distinct physical device — not the same drawn run
  ], "M-101");
  const tags = buildTagIndex([s], [], []);
  const matches = tagIndexFor(tags, "P1");
  assert.equal(matches.length, 2, "two distant twin spellings are two real occurrences");
  assert.ok(matches.every((t) => t.key === "P1"), "both share the same markKey identity");
  assert.deepEqual(new Set(matches.map((t) => t.text)), new Set(["P-1", "P1"]), "each keeps its own drawn spelling");
});

test("tagIndex: a key-free compound run ('R1 /C-11') recovers the leading mark with no known target key", () => {
  const s = sheet("plan.pdf#5", [
    sp("R1 /C-11", 100, 100),
    sp("P1.01", 400, 400), // a dotted numeric sheet-number suffix — never a compound instance
  ], "M-101");
  const tags = buildTagIndex([s], [], []);
  const r1 = tags.find((t) => t.key === "R1" && t.source === "compound");
  assert.ok(r1, "the compound run's lead mark must be recovered with source \"compound\"");
  assert.ok(!tags.some((t) => t.key === "P101" || t.key === "P1"), "a dotted sheet-number run must never be read as a compound instance");
});
