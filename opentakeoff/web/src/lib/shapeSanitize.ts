// Load-time shape sanitizer (#linear-takeoff B-L4) — the one gate the hydrate
// path never had. `sanitizeShapeLabelsOnShapes` (shapeLabels.js) is
// identity-preserving and only ever touches `.label`; nothing anywhere
// validated the fields every downstream reader assumes are already sound —
// `measure_role` one of the five real roles, `verts_norm` a finite array of
// real [x,y] pairs in [0,1], `computed` at least an object. A malformed
// value here (a hand-edited save, a corrupted autosave record, a future
// import path that isn't as careful as importTakeoff.js) used to reach
// `totals.js`'s role switch, `shapeMetrics.js`'s pricer, the renderer, and
// every export unguarded — this is where it gets caught instead, the same
// place `sanitizeConditionAttrs`/`sanitizeConditionColumns`/`sanitizeApprovals`
// already catch their own domain's malformed load-time data.
//
// Deliberately narrow: this REJECTS shapes that cannot be priced or rendered
// at all; it never reinterprets `origin`, never touches `label` (that's
// `sanitizeShapeLabelsOnShapes`'s job), and never invents geometry — a shape
// that fails validation is dropped, not repaired into a guess.

/** The only five real values `measure_role` takes on the wire (same set as
 *  the MCP server's own zod enum, `mcp/src/outputs.ts` — kept as a literal
 *  here rather than imported, since this module is browser-side and that one
 *  is server-side; both must be updated together if a role is ever added,
 *  same as `ROLE_TIER`'s keys in TakeoffCanvas.jsx already are). */
export const VALID_MEASURE_ROLES = ["floor_area", "deduct", "linear", "surface_area", "count"];

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A vertex is a real [x,y] pair; NaN/Infinity/wrong-shape is unrecoverable
 *  (drop the shape), but a tiny float overshoot past [0,1] — the ordinary
 *  cost of round-tripping through JSON — is healed by clamping rather than
 *  discarding an otherwise-good shape. */
function healVert(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v;
  if (!isFiniteNum(x) || !isFiniteNum(y)) return null;
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}

/**
 * Validate + heal one shape record from an untrusted load. Returns the
 * healed shape, or `null` when it cannot be recovered (wrong id/role type,
 * too few vertices for its role, or any vertex that isn't a real number
 * pair) — the caller drops nulls, exactly like importTakeoff.js already
 * drops shapes failing its own `id`/`sheet_id` type check.
 */
export function sanitizeShape(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, any>;
  if (typeof s.id !== "string" || !s.id) return null;
  if (typeof s.sheet_id !== "string" || !s.sheet_id) return null;
  if (typeof s.condition_id !== "string" || !s.condition_id) return null;
  if (!VALID_MEASURE_ROLES.includes(s.measure_role)) return null;

  if (!Array.isArray(s.verts_norm)) return null;
  const healedVerts: [number, number][] = [];
  for (const v of s.verts_norm) {
    const h = healVert(v);
    if (!h) return null;   // one bad vertex, not a healable shape — drop it whole
    healedVerts.push(h);
  }
  const minPts = s.measure_role === "count" ? 1 : 2;   // a count marker is its own single anchor point
  if (healedVerts.length < minPts) return null;

  return {
    ...s,
    verts_norm: healedVerts,
    // `computed` is healed to a real object here so nothing downstream reads
    // `.area_sf` off `undefined` before shapeMetrics.js's own `needsMetrics`
    // pass (which recomputes real values) gets a chance to run.
    computed: s.computed && typeof s.computed === "object" && !Array.isArray(s.computed) ? s.computed : {},
  };
}

/** Filter + heal a whole loaded shape array. Order-preserving; drops what
 *  `sanitizeShape` cannot recover. */
export function sanitizeShapesOnLoad(shapes: unknown): Record<string, any>[] {
  if (!Array.isArray(shapes)) return [];
  const out: Record<string, any>[] = [];
  for (const s of shapes) {
    const healed = sanitizeShape(s);
    if (healed) out.push(healed);
  }
  return out;
}
