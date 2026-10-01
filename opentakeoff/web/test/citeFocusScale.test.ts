// A user-opened cite zooms until the cited box reads (#259): at fit zoom a
// schedule row's box was a speck at 10-17%.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citeFocusScale, CITE_FOCUS_MAX, CITE_READ_PX } from "../src/lib/canvasUtil.js";
import { MAX_SCALE, MIN_SCALE } from "../src/lib/canvasConstants.js";

test("citeFocusScale: a square-ish box at fit zoom is zoomed in to span the viewport", () => {
  // 1,200 x 400 raster px table in a 1,280 x 720 view at 12%: width-limited → 0.64
  assert.equal(citeFocusScale(0.12, 1200, 400, 1280, 720), (0.6 * 1280) / 1200);
});

test("citeFocusScale: a long thin row is zoomed until it reads, not until it fits the width", () => {
  // 2,400 x 40 raster px schedule row: width fit (0.32) leaves it 13 px tall; it lands CITE_READ_PX tall
  assert.equal(citeFocusScale(0.12, 2400, 40, 1280, 720), CITE_READ_PX / 40);
});

test("citeFocusScale: a one-cell box stops at the readable ceiling, not deep zoom", () => {
  assert.equal(citeFocusScale(0.12, 80, 14, 1280, 720), CITE_FOCUS_MAX);
});

test("citeFocusScale: never zooms out from where the user already is", () => {
  assert.equal(citeFocusScale(4, 2400, 40, 1280, 720), 4);
});

test("citeFocusScale: a tall box is limited by the view's height", () => {
  assert.equal(citeFocusScale(0.05, 300, 3600, 1280, 720), (0.5 * 720) / 3600);
});

test("citeFocusScale: a degenerate box or view keeps the clamped current scale", () => {
  assert.equal(citeFocusScale(0.2, 0, 10, 1280, 720), 0.2);
  assert.equal(citeFocusScale(0.2, 10, 10, 0, 720), 0.2);
  assert.equal(citeFocusScale(99, 0, 0, 0, 0), MAX_SCALE);
  assert.equal(citeFocusScale(0, 1e9, 1e9, 1280, 720), MIN_SCALE);
});
