// Linking answer prose to painted evidence. The interesting cases are all
// about RESTRAINT: what must never become a link, because a wrong link is
// worse than no link — it points an estimator at the wrong ink.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, buildCiteIndex, linkMarks, citeTitle } from "../src/lib/citeMatch.js";

const cite = (row_key: string, extra: any = {}) => ({
  id: `mk-${row_key}`, markupId: `mk-${row_key}`,
  sheet: "a.pdf#3", bbox_px: [10, 20, 60, 34], row_key, ...extra,
});

test("canon: the drawing's punctuation and case are noise", () => {
  assert.equal(canon("VAV-1"), "VAV1");
  assert.equal(canon("vav 1"), "VAV1");
  assert.equal(canon("VAV‑1"), "VAV1", "a non-ASCII hyphen is still a hyphen");
  assert.equal(canon(null as any), "");
});

test("buildCiteIndex keeps the RICHEST citation for a mark cited many times", () => {
  const idx = buildCiteIndex([
    cite("VAV-1"),
    cite("VAV-1", { column: "CFM", value: "350" }),
    cite("VAV-1", { value: "350" }),
  ]);
  assert.equal(idx.size, 1);
  assert.equal(idx.get("VAV1")?.column, "CFM");
});

test("buildCiteIndex drops citations that could not be jumped to", () => {
  const idx = buildCiteIndex([
    { ...cite("A-1"), bbox_px: undefined },
    { ...cite("B-2"), bbox_px: [1, 2, 3] },       // wrong length
    { ...cite("C-3"), sheet: undefined },
    cite(""),                                      // no mark
    cite("D-4"),
  ] as any);
  assert.deepEqual([...idx.keys()], ["D4"]);
});

test("buildCiteIndex accepts sheet_id as well as sheet", () => {
  const idx = buildCiteIndex([{ row_key: "EF-2", bbox_px: [0, 0, 1, 1], sheet_id: "b.pdf#1" }] as any);
  assert.equal(idx.size, 1);
});

test("linkMarks links a cited mark and leaves the rest of the sentence intact", () => {
  const idx = buildCiteIndex([cite("VAV-1", { column: "CFM", value: "350" })]);
  const segs = linkMarks("VAV-1 is scheduled for 350 CFM.", idx);
  assert.deepEqual(segs.map((s) => s.text), ["VAV-1", " is scheduled for 350 CFM."]);
  assert.ok(segs[0].citation, "the mark carries its citation");
  assert.equal(segs[1].citation, undefined);
  assert.equal(segs.map((s) => s.text).join(""), "VAV-1 is scheduled for 350 CFM.", "reassembles exactly");
});

test("A BARE VALUE IS NEVER A LINK — 350 appears in every column of every schedule", () => {
  const idx = buildCiteIndex([cite("VAV-1", { column: "CFM", value: "350" })]);
  const segs = linkMarks("The total is 350 across the floor.", idx);
  assert.deepEqual(segs, [{ text: "The total is 350 across the floor." }]);
});

test("a mark we hold NO evidence for is left as prose, not linked to a neighbour", () => {
  const idx = buildCiteIndex([cite("VAV-1")]);
  const segs = linkMarks("VAV-1 and VAV-2 share a trunk.", idx);
  assert.deepEqual(segs.map((s) => [s.text, !!s.citation]),
    [["VAV-1", true], [" and VAV-2 share a trunk.", false]]);
});

test("words that look like marks but carry no digit are prose", () => {
  const idx = buildCiteIndex([cite("AHU-1")]);
  // "AIR-COOLED" and "HVAC" must not read as equipment
  const segs = linkMarks("The AIR-COOLED HVAC unit AHU-1 serves it.", idx);
  assert.equal(segs.filter((s) => s.citation).length, 1);
  assert.equal(segs.find((s) => s.citation)?.text, "AHU-1");
});

test("BACnet point names (AI1, BO2) are marks when cited", () => {
  const idx = buildCiteIndex([cite("AI1"), cite("BO2")]);
  const segs = linkMarks("Points AI1 and BO2 are mapped.", idx);
  assert.deepEqual(segs.filter((s) => s.citation).map((s) => s.text), ["AI1", "BO2"]);
});

test("the same mark twice in one sentence links twice", () => {
  const idx = buildCiteIndex([cite("EF-2")]);
  const segs = linkMarks("EF-2 runs; EF-2 is redundant.", idx);
  assert.equal(segs.filter((s) => s.citation).length, 2);
  assert.equal(segs.map((s) => s.text).join(""), "EF-2 runs; EF-2 is redundant.");
});

test("an empty index, empty text and repeated calls are all safe", () => {
  assert.deepEqual(linkMarks("VAV-1", new Map()), [{ text: "VAV-1" }]);
  assert.deepEqual(linkMarks("", buildCiteIndex([cite("VAV-1")])), [{ text: "" }]);
  // MARK_RE is module-level and /g — a stale lastIndex would make the SECOND
  // call skip the leading match. Run it twice on purpose.
  const idx = buildCiteIndex([cite("VAV-1")]);
  const a = linkMarks("VAV-1 here", idx);
  const b = linkMarks("VAV-1 here", idx);
  assert.deepEqual(a.map((s) => s.text), b.map((s) => s.text));
});

test("citeTitle says the most specific true thing it can", () => {
  assert.match(citeTitle({ table_title: "VAV SCHEDULE", column: "CFM", value: "350", sheetLabel: "M501" } as any),
    /VAV SCHEDULE · CFM = 350 · M501/);
  assert.match(citeTitle({ value: "350" } as any), /^350 —/);
  assert.equal(citeTitle(null as any), "");
  assert.match(citeTitle({} as any), /Click to show/);
});
