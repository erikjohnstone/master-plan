/**
 * One plan location from a schedule-row sweep match — shared by the takeoff
 * compile (mcp/src/takeoff.ts) and the schedule↔plan reconcile
 * (schedulePlanReconcile.mjs), so the UI, the MCP reply and the agent cite the
 * same box.
 *
 * What the `bbox` cites depends on how the match was grounded:
 *
 * - `symbol_fingerprint`: a repeated template matched the drawn linework, so
 *   `geometry_bbox` IS the matched symbol and stays the cite.
 * - `tag_attached_vector`: the count comes from the exact printed tag; the
 *   vector body attached beside it (by leader or adjacency) is a position hint
 *   whose outline is not verified. Measured against hand keys, that body was
 *   off the drawn unit on 72 of 102 federal-mech tags and fit it on 2, and spot
 *   checks on itd-d1-lab and 011_IL showed the same (leader arrowheads, the
 *   tag's own hexagon or diamond frame, door swings). The cite is therefore the
 *   tag; the attached body is retained as `attached_geometry_bbox`, never
 *   presented as the device.
 *
 * Counts are unchanged: this decides which box a citation opens, not what is
 * counted. `at` stays the match center so cross-view registration is
 * unaffected.
 */
export function planLocationFromMatch(sheet, m, basis) {
  const tagCited = basis === "tag_attached_vector" && m.tag_at;
  const bbox = tagCited ? m.tag_at : (m.geometry_bbox || m.tag_at);
  return {
    sheet,
    at: m.at,
    ...(bbox ? { bbox } : {}),
    ...(m.tag_at ? { tag_bbox: m.tag_at } : {}),
    ...(tagCited && m.geometry_bbox ? { attached_geometry_bbox: m.geometry_bbox } : {}),
    ...(Number.isFinite(m.score) ? { score: m.score } : {}),
    ...(m.attachment_via ? { attachment_via: m.attachment_via } : {}),
    ...(Number.isFinite(m.attachment_distance_px) ? { attachment_distance_px: m.attachment_distance_px } : {}),
    ...(m.counted_from === "explicit_label" ? { counted_from: "explicit_label" } : {}),
  };
}

/**
 * A schedule row's own box: the union of its cells, on the sheet that carries
 * the row (a continued schedule's row can sit on a later sheet than its
 * table). Shared by the takeoff compile and the reconcile so a line cites the
 * row itself, not just its sheet. Returns {} when the row holds no boxed cell.
 * @param {{ sheet?: string, cells?: Record<string, { text?: string, bbox?: number[] }> }} row
 * @param {string} tableSheet
 */
export function scheduleRowLocation(row, tableSheet) {
  const boxes = Object.values(row?.cells || {}).map((c) => c?.bbox).filter((b) =>
    Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1]);
  if (!boxes.length) return {};
  return {
    row_sheet: row.sheet || tableSheet,
    row_bbox: {
      x0: Math.min(...boxes.map((b) => b[0])), y0: Math.min(...boxes.map((b) => b[1])),
      x1: Math.max(...boxes.map((b) => b[2])), y1: Math.max(...boxes.map((b) => b[3])),
    },
  };
}
