// Mixed-scale honesty (#153) — the pure comparison plus the live wiring: an
// enlarged plan's own scale note inside a measured region must surface a
// warning; agreement, absence, and the unscaled path must stay silent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mixedScaleWarning, expandForScaleNotes, UPP_TOLERANCE } from "../src/scalewarn.ts";
import { Session } from "../src/session.ts";

const PLAN = fileURLToPath(new URL("../../demo/sample-plan.pdf", import.meta.url));
const KEY = "sample-plan.pdf";

// identity-scale viewport: item transform [1,0,0,1,x,y] → position (x, y)
const VP = { width: 2000, height: 1500, transform: [1, 0, 0, 1, 0, 0] };
const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y], width: str.length * 5, height: 10 });
// upp at render scale 2.0: 1/8" = 1'-0" → 18 px/ft; 1/2" → 72 px/ft
const UPP_EIGHTH = 1 / 18;

test("mixedScaleWarning: a disagreeing note warns; agreement, absence, and no-scale stay silent", () => {
  const disagree = { items: [item('SCALE: 1/2" = 1\'-0"', 300, 400)] };
  const w = mixedScaleWarning(disagree, VP, UPP_EIGHTH, '1/8" = 1\'-0"');
  assert.ok(w, "a 1/2\" note against a 1/8\" sheet warns");
  assert.match(w!, /1\/2/);
  assert.match(w!, /enlarged plan/);

  const agree = { items: [item('SCALE: 1/8" = 1\'-0"', 300, 400)] };
  assert.equal(mixedScaleWarning(agree, VP, UPP_EIGHTH, '1/8" = 1\'-0"'), undefined, "the sheet's own note is not a mixed scale");

  assert.equal(mixedScaleWarning({ items: [] }, VP, UPP_EIGHTH, undefined), undefined, "no note, no warning");
  assert.equal(mixedScaleWarning(disagree, VP, null, undefined), undefined, "the unscaled path has its own warning");

  // within tolerance = label-formatting noise, not a mixed scale
  const near = mixedScaleWarning(agree, VP, UPP_EIGHTH * (1 + UPP_TOLERANCE * 0.9), undefined);
  assert.equal(near, undefined);
});

test("expandForScaleNotes: reaches further BELOW the bbox than out (notes sit under their viewport)", () => {
  const r = expandForScaleNotes({ x0: 100, y0: 100, x1: 300, y1: 200 });
  assert.ok(r.x0 < 100 && r.x1 > 300 && r.y0 < 100, "expands on every side");
  assert.ok(r.y1 - 200 > r.x1 - 300, "below-reach beats side-reach");
  assert.ok(r.y1 - 200 > 100 - r.y0, "reaches further below than above");
});

test("live wiring: a normal room on the single-scale sample plan carries no mixed-scale warning", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  s.setScale(KEY, { use_detected: true });
  const r: any = await s.oneClick(KEY, 600, 1084, { condition: "CPT-1", role: "floor_area", returnVerts: false });
  assert.ok(r.area_sf > 0);
  assert.equal(r.warning, undefined, "single-scale sheet, room region — silent");
  const m: any = s.measurePolygon(KEY, [[100, 100], [200, 100], [200, 200], [100, 200]], { role: "floor_area" });
  assert.equal(m.warning, undefined);
});

test("live wiring: measure_line and measure_surface now carry the SAME mixed-scale check measure_polygon already had (B-L2)", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  // The bundled demo plan's own title block reads "SCALE: 1/4\" = 1'-0\"" with
  // its text-item baseline start at real image-px (1730,1348) — probed
  // directly off the PDF text layer (positionedText), the same point
  // textItemsInRegion hit-tests against. Adopt a DIFFERENT scale deliberately
  // (1/8\" instead of the sheet's own 1/4\"), so a region touching that point
  // is a real, live disagreement — not a synthetic mixedScaleWarning() call.
  s.setScale(KEY, { label: '1/8" = 1\'-0"' });

  // A 4-point rectangle straddling the note's baseline point — non-degenerate
  // in both axes, so expandForScaleNotes's own reach (proportional to the
  // measured region's size) has room to grow toward it in y.
  const rect: [number, number][] = [[1725, 1343], [1740, 1343], [1740, 1353], [1725, 1353]];
  const poly: any = s.measurePolygon(KEY, rect, { role: "floor_area" });
  assert.ok(poly.warning, "measure_polygon still warns on a real disagreeing note");
  assert.match(poly.warning, /1\/4/);

  // An open 2-point run must also have SOME extent in both axes for
  // expandForScaleNotes to reach downward at all (a perfectly horizontal or
  // vertical 2-point bbox is degenerate in one axis and never expands there
  // — expandForScaleNotes itself, unmodified here, still applies identically
  // through measure_line/measure_surface now that they call it).
  const diag: [number, number][] = [[1725, 1343], [1740, 1348]];

  // B-L2 fix: measure_line was silent here before this commit
  const line: any = s.measureLine(KEY, diag, { condition: "SCALEWARN-LINE" });
  assert.ok(line.warning, "measure_line now warns on the same disagreeing note (B-L2)");
  assert.match(line.warning, /1\/4/);

  // B-L2 fix: measure_surface was silent here before this commit
  const surf: any = s.measureSurface(KEY, diag, { condition: "SCALEWARN-SURFACE", height_ft: 8 });
  assert.ok(surf.warning, "measure_surface now warns on the same disagreeing note (B-L2)");
  assert.match(surf.warning, /1\/4/);
});
