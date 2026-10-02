import test from "node:test";
import assert from "node:assert/strict";

import { planLocationFromMatch } from "../src/lib/planLocation.mjs";

const tagAt = { x0: 100, y0: 200, x1: 140, y1: 214 };
const body = { x0: 300, y0: 400, x1: 330, y1: 440 };
const match = { at: [315, 420], score: 1, tag_at: tagAt, geometry_bbox: body, attachment_via: "leader", attachment_distance_px: 182.4 };

test("a tag-grounded match cites the printed tag; the attached body is only a hint", () => {
  const loc = planLocationFromMatch("a.pdf#3", match, "tag_attached_vector");
  assert.deepEqual(loc.bbox, tagAt);
  assert.deepEqual(loc.tag_bbox, tagAt);
  assert.deepEqual(loc.attached_geometry_bbox, body);
  // The count-bearing center is unchanged, so cross-view registration is too.
  assert.deepEqual(loc.at, [315, 420]);
  assert.equal(loc.attachment_via, "leader");
  assert.equal(loc.attachment_distance_px, 182.4);
});

test("a template-matched symbol keeps its matched geometry as the cite", () => {
  const loc = planLocationFromMatch("a.pdf#3", match, "symbol_fingerprint");
  assert.deepEqual(loc.bbox, body);
  assert.deepEqual(loc.tag_bbox, tagAt);
  assert.equal("attached_geometry_bbox" in loc, false);
});

test("a tag-grounded match with no tag box falls back to its geometry", () => {
  const { tag_at: _drop, ...noTag } = match;
  const loc = planLocationFromMatch("a.pdf#3", noTag, "tag_attached_vector");
  assert.deepEqual(loc.bbox, body);
  assert.equal("attached_geometry_bbox" in loc, false);
  assert.equal("tag_bbox" in loc, false);
});

test("explicit-label counts and missing optional fields pass through unchanged", () => {
  const loc = planLocationFromMatch("a.pdf", { at: [1, 2], tag_at: tagAt, counted_from: "explicit_label" }, "exact_plan_tag");
  assert.deepEqual(loc, { sheet: "a.pdf", at: [1, 2], bbox: tagAt, tag_bbox: tagAt, counted_from: "explicit_label" });
});

test("a schedule row's box is the union of its cells, on the sheet carrying the row", async () => {
  const { scheduleRowLocation } = await import("../src/lib/planLocation.mjs");
  const row = { sheet: "m.pdf#15", cells: { MARK: { text: "VAV-1", bbox: [100, 500, 160, 520] }, CFM: { text: "800", bbox: [400, 502, 450, 518] }, NOTE: { text: "" } } };
  assert.deepEqual(scheduleRowLocation(row, "m.pdf#14"), { row_sheet: "m.pdf#15", row_bbox: { x0: 100, y0: 500, x1: 450, y1: 520 } });
  assert.deepEqual(scheduleRowLocation({ cells: { A: { text: "x" } } }, "m.pdf#14"), {});
  assert.equal(scheduleRowLocation({ cells: { A: { bbox: [1, 2, 3, 4] } } }, "m.pdf#14").row_sheet, "m.pdf#14");
});
