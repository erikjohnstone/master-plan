/** Presentation-only normalization for the consolidated BAS workspace header.
 * Every value is copied from shared compiler/reconcile totals. The projection
 * deliberately has no aggregate EA field because equipment records, point
 * rows, SOO clauses and reconciliation rows are different cardinalities.
 * @param {Record<string, unknown> | null | undefined} coverage
 */
export function completeBasHeaderCoverage(coverage = {}) {
  const source = /** @type {Record<string, unknown>} */ (
    coverage && typeof coverage === "object" ? coverage : {}
  );
  const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const reconcileRows = number(source.reconcile_rows);
  const reconcileMatches = number(source.reconcile_match);
  return {
    equipmentRecords: number(source.equipment_items),
    pointLists: number(source.point_lists),
    pointRows: number(source.point_rows),
    pointTypeReviewRows: number(source.point_type_review_rows),
    sequences: number(source.sequences),
    sequenceSections: number(source.sequence_sections),
    sooPointCandidates: number(source.soo_point_candidates),
    valveRecords: number(source.control_valve_items),
    coilGaps: number(source.embedded_coil_gaps),
    schematics: number(source.control_schematics),
    risers: number(source.riser_diagrams),
    reconcileRows,
    reconcileMatches,
    reconcileExceptions: Math.max(0, reconcileRows - reconcileMatches),
  };
}

/**
 * Surface-only navigation label. A complete BAS run combines several unlike
 * record types, so its compiled-row count must never be presented as one
 * installed quantity. Ordinary single-domain takeoffs retain their useful
 * line count.
 * @param {{ kind?: string } | null | undefined} corpusMeta
 * @param {number} finishedLineCount
 * @param {boolean} hasRows
 */
export function takeoffNavigationBadge(corpusMeta, finishedLineCount, hasRows) {
  if (!hasRows && Number(finishedLineCount) <= 0) return null;
  if (corpusMeta?.kind === "complete_bas_takeoff") return "ready";
  return Number(finishedLineCount) > 0 ? String(finishedLineCount) : "data";
}

/** A complete BAS workspace can contain SOO/diagram evidence without any
 * quantity-bearing rows. Its explicit readiness label is sufficient to keep
 * Takeoff access visible in Agent; ordinary runs still require rows.
 * @param {number} finishedLineCount
 * @param {string | null | undefined} badgeLabel
 */
export function takeoffAccessAvailable(finishedLineCount, badgeLabel = null) {
  return Boolean(String(badgeLabel || "").trim()) || Number(finishedLineCount) > 0;
}
