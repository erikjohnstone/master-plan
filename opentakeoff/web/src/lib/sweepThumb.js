// sweepThumb — the linework under each sweep match, so review is looking
// rather than reading.
//
// Symbol review showed `84% · EBB-1` in a 150px-tall text list. The settled
// industry pattern (Bluebeam, Procore, eTakeoff) is marquee one symbol → see
// every match as a picture → deselect the wrong ones → apply. You cannot judge
// "is this the same device?" from a percentage.
//
// The pixels are not needed and would be expensive: pdf.js replays the whole
// page operator list per render regardless of crop size, so N crops is N full
// page renders. The SHEET'S OWN VECTOR SEGMENTS are already resident, in the
// exact frame the matches use (sheet image px at RENDER_SCALE), so a thumbnail
// is a filtered draw — synchronous, no worker, no raster. On a scanned sheet
// there are no segments and the sweep already refuses before we get here.
//
// Sizing, from the frozen 47-case symbol-sweep corpus: a real HVAC device
// marquee is 40–570 px per side, median ~100. Match counts there run median 3,
// max 35; the recorded extreme elsewhere is 62 receptacles on one electrical
// sheet. Sheets run to 155k segments. So the index below exists to keep the
// worst realistic case (62 × 155k) off the main thread's critical path, not
// because the typical case needs it.

/** Corners in any order → a rect with x0<x1, y0<y1. The marquee hands back
 *  whatever order the drag happened in. */
export function normRect(rect) {
  // IDEMPOTENT ON PURPOSE. The sweep stores its seed already normalized, and
  // matchBox normalizes again — an object arriving at a corner-pair parser
  // returned null, and every thumbnail silently vanished while the panel
  // rendered perfectly well around the hole.
  if (rect && !Array.isArray(rect) && Number.isFinite(rect.x0)) {
    const { x0, y0, x1, y1 } = rect;
    return [x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0
      ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
  }
  if (!Array.isArray(rect) || rect.length !== 2) return null;
  const [a, b] = rect;
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** The box a match occupies: the seed's own footprint, centred on the placement.
 *  A rotated placement is squared off to the larger side so a 90° instance is
 *  not clipped. `pad` gives the glyph a little air in the tile. */
export function matchBox(at, seedRect, pad = 0.15) {
  const r = normRect(seedRect);
  if (!r || !Array.isArray(at) || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  const side = Math.max(r.w, r.h) * (1 + pad * 2);
  const half = side / 2;
  return { x0: at[0] - half, y0: at[1] - half, x1: at[0] + half, y1: at[1] + half, w: side, h: side };
}

const KEY = (gx, gy) => `${gx},${gy}`;

/** Bucket the sheet's segments once per sweep so each thumbnail is a lookup.
 *
 *  A segment is filed under every cell its bounding box touches — except one
 *  that spans an absurd number of cells (a full-width wall run, a border), which
 *  goes to `wide` and is tested against every query. Without that escape a
 *  single sheet-long line would be filed into thousands of buckets.
 */
export function buildSegIndex(segs, cell) {
  const size = Number.isFinite(cell) && cell > 0 ? cell : 64;
  const buckets = new Map();
  const wide = [];
  const n = Array.isArray(segs) || ArrayBuffer.isView(segs) ? segs.length >> 2 : 0;
  const MAX_CELLS = 64;
  for (let i = 0; i < n; i++) {
    const ax = segs[i * 4], ay = segs[i * 4 + 1], bx = segs[i * 4 + 2], by = segs[i * 4 + 3];
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;
    const gx0 = Math.floor(Math.min(ax, bx) / size), gx1 = Math.floor(Math.max(ax, bx) / size);
    const gy0 = Math.floor(Math.min(ay, by) / size), gy1 = Math.floor(Math.max(ay, by) / size);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > MAX_CELLS) { wide.push(i); continue; }
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const k = KEY(gx, gy);
        const arr = buckets.get(k);
        if (arr) arr.push(i); else buckets.set(k, [i]);
      }
    }
  }
  return { size, buckets, wide, count: n };
}

/** Segment indices whose bounding box overlaps the query box.
 *
 *  Bounding-box overlap, not true intersection: over-inclusion costs one extra
 *  <line> that the tile's viewBox clips anyway, while a false negative would
 *  silently drop ink from the picture someone is deciding on.
 */
export function segmentsInBox(segs, index, box) {
  if (!index || !box) return [];
  const { size, buckets, wide } = index;
  const out = new Set();
  const gx0 = Math.floor(box.x0 / size), gx1 = Math.floor(box.x1 / size);
  const gy0 = Math.floor(box.y0 / size), gy1 = Math.floor(box.y1 / size);
  const hit = (i) => {
    const ax = segs[i * 4], ay = segs[i * 4 + 1], bx = segs[i * 4 + 2], by = segs[i * 4 + 3];
    return Math.min(ax, bx) <= box.x1 && Math.max(ax, bx) >= box.x0
      && Math.min(ay, by) <= box.y1 && Math.max(ay, by) >= box.y0;
  };
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const arr = buckets.get(KEY(gx, gy));
      if (!arr) continue;
      for (const i of arr) if (hit(i)) out.add(i);
    }
  }
  for (const i of wide) if (hit(i)) out.add(i);
  return [...out];
}

/** The tile's drawable lines, in the box's own coordinates (0..w, 0..h), ready
 *  for an SVG viewBox of `0 0 w h`. */
export function tileLines(segs, indices, box, limit = 400) {
  const out = [];
  for (const i of indices) {
    if (out.length >= limit) break;
    out.push([
      segs[i * 4] - box.x0, segs[i * 4 + 1] - box.y0,
      segs[i * 4 + 2] - box.x0, segs[i * 4 + 3] - box.y0,
    ]);
  }
  return out;
}
