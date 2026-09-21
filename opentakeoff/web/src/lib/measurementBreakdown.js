// Readout-card tally: every linear run and wall of ONE condition, in draw
// order, so an estimator checks a total the way they build one — line by
// line — without opening the panel. Pure: reads committed shapes (their
// stored `computed` metrics), never re-measures.
//
// Height rule matches the readout's own selected-shape reading: an explicit
// per-wall override wins, then the shape's own height, then the condition's.

export function wallHeightFt(shape, cond) {
  if (shape?.height_override === true) return Number(shape.height_ft) || 0;
  return Number(shape?.height_ft) || Number(cond?.height_ft) || 0;
}

/** @returns {{n:number, id:string, role:"linear"|"wall", lf:number, h:number, sf:number, segments?:Array<{i:number, lf:number, size?:object, size_src:string}>}[]} */
export function measurementBreakdown(shapes, conditionId, cond) {
  const rows = [];
  for (const s of shapes || []) {
    if (!s || s.condition_id !== conditionId) continue;
    const c = s.computed || {};
    if (s.measure_role === "linear") {
      // #linear-takeoff (WP1.3): per-segment size rows, additive — a plain
      // Linear trace with no `run` (every shape before this existed, and
      // every non-routed trace today) carries no `segments` key at all, byte-
      // identical to before. Raw segments (not a display string) so the
      // render layer picks the label format/units.
      rows.push({ n: rows.length + 1, id: s.id, role: "linear", lf: c.perimeter_lf || 0, h: 0, sf: 0,
        ...(c.run?.segments?.length ? { segments: c.run.segments } : {}) });
    } else if (s.measure_role === "surface_area") {
      const lf = c.perimeter_lf || 0, h = wallHeightFt(s, cond);
      rows.push({ n: rows.length + 1, id: s.id, role: "wall", lf, h, sf: c.area_sf ?? lf * h });
    }
  }
  return rows;
}
