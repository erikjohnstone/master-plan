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
  const reconcileScheduleOnly = number(source.reconcile_schedule_only);
  const reconcilePlanOnly = number(source.reconcile_plan_only);
  const reconcileAmbiguous = number(source.reconcile_ambiguous);
  const reconcileRefused = number(source.reconcile_refused);
  const classifiedExceptions = reconcileScheduleOnly + reconcilePlanOnly + reconcileAmbiguous + reconcileRefused;
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
    reconcileScheduleOnly,
    reconcilePlanOnly,
    reconcileAmbiguous,
    reconcileRefused,
    reconcileExceptions: classifiedExceptions || Math.max(0, reconcileRows - reconcileMatches),
  };
}

const ioChannels = ['AI', 'AO', 'DI', 'DO'];

/**
 * Estimator-facing, presentation-only projection of an existing consolidated
 * BAS run. This deliberately keeps unlike cardinalities separate: schedule
 * records, listed BAS requirements, SOO sections and plan matches must never
 * be rolled into one plausible-looking quantity.
 * @param {{ coverage?: Record<string, unknown>, bas_math?: Record<string, unknown> } | null | undefined} corpusMeta
 */
export function completeBasEstimatorOverview(corpusMeta) {
  const coverage = completeBasHeaderCoverage(corpusMeta?.coverage);
  const math = corpusMeta?.bas_math && typeof corpusMeta.bas_math === 'object' ? corpusMeta.bas_math : null;
  const physical = Object.fromEntries(ioChannels.map(channel => {
    const value = Number(math?.physical_total?.[channel]);
    return [channel, Number.isFinite(value) ? Math.max(0, value) : 0];
  }));
  const typedPointTotal = ioChannels.reduce((sum, channel) => sum + physical[channel], 0);
  const planCoveragePercent = coverage.reconcileRows > 0
    ? Math.round((coverage.reconcileMatches / coverage.reconcileRows) * 100)
    : null;
  const reviewTasks = [];
  if (coverage.reconcileExceptions > 0) reviewTasks.push({
    id: 'grounding', count: coverage.reconcileExceptions, noun: 'schedule items',
    title: 'Resolve schedule-to-plan exceptions',
    detail: `${coverage.reconcileScheduleOnly} schedule-only · ${coverage.reconcilePlanOnly} plan-only · ${coverage.reconcileAmbiguous} ambiguous · ${coverage.reconcileRefused} refused`,
    action: 'details', actionLabel: 'Review grounding', severity: 'blocker',
  });
  if (coverage.coilGaps > 0) reviewTasks.push({
    id: 'coil-gaps', count: coverage.coilGaps, noun: 'coil gaps',
    title: 'Complete embedded coil scope',
    detail: 'Coil evidence exists, but related valve or control scope is incomplete.',
    action: 'details', actionLabel: 'Review equipment rows', severity: 'blocker',
  });
  if (coverage.pointTypeReviewRows > 0) reviewTasks.push({
    id: 'point-types', count: coverage.pointTypeReviewRows, noun: 'point rows',
    title: 'Confirm missing I/O types',
    detail: 'The source lists the requirement but does not provide a safe automatic I/O classification.',
    action: 'points', actionLabel: 'Review BAS points', severity: 'review',
  });
  if (coverage.sooPointCandidates > 0) reviewTasks.push({
    id: 'soo-candidates', count: coverage.sooPointCandidates, noun: 'SOO candidates',
    title: 'Accept or reject sequence-derived points',
    detail: 'These are cited review proposals, not installed points or approved scope.',
    action: 'sequences', actionLabel: 'Review sequences', severity: 'review',
  });
  if (coverage.schematics > 0 || coverage.risers > 0) reviewTasks.push({
    id: 'diagrams', count: coverage.schematics + coverage.risers, noun: 'diagram sources',
    title: 'Verify schematic and riser scope',
    detail: `${coverage.schematics} control schematics · ${coverage.risers} riser/flow diagrams`,
    action: 'review', actionLabel: 'Open review queue', severity: 'review',
  });
  return {
    coverage,
    physical,
    typedPointTotal,
    planCoveragePercent,
    mathStatus: String(math?.status || 'not_available'),
    mathSourceCoverage: String(math?.source_coverage || 'not_available'),
    mathIssueCount: Array.isArray(math?.diagnostics) ? math.diagnostics.length : 0,
    reviewTasks,
    primaryMessage: coverage.reconcileRows > 0
      ? `${coverage.reconcileMatches} of ${coverage.reconcileRows} scheduled items have a grounded plan match.`
      : 'Schedule and controls scope was compiled, but plan grounding was not established.',
  };
}

/**
 * Presentation-only stages for the BAS estimator journey. Availability and
 * attention states describe retained evidence; only a verified snapshot may
 * produce the final `verified` state. Nothing here approves or filters source
 * truth.
 * @param {{ coverage?: Record<string, unknown>, bas_math?: Record<string, unknown> } | null | undefined} corpusMeta
 * @param {{ approved?: boolean }} options
 */
export function completeBasJourneyStages(corpusMeta, { approved = false } = {}) {
  const summary = completeBasEstimatorOverview(corpusMeta);
  const c = summary.coverage;
  const hasExtractedScope = Boolean(c.equipmentRecords || c.valveRecords || c.pointLists || c.sequences || c.schematics || c.risers);
  const controls = c.sequences + c.schematics + c.risers;
  return [
    {
      id: 'scope', label: 'Confirm scope',
      detail: hasExtractedScope
        ? `${c.equipmentRecords} equipment · ${c.pointLists} point lists · ${c.sequences} sequences`
        : 'No BAS scope retained',
      state: hasExtractedScope ? 'available' : 'blocked',
      instruction: 'Choose what belongs in this takeoff. Keep the original evidence and give a reason for anything you exclude.',
      doneWhen: 'The included work and every exclusion are saved as a reviewed scope.',
    },
    {
      id: 'equipment', label: 'Review equipment',
      detail: c.equipmentRecords || c.valveRecords
        ? `${c.equipmentRecords} equipment · ${c.valveRecords} valves`
        : 'No schedule records retained',
      state: c.equipmentRecords || c.valveRecords ? 'available' : 'blocked',
      instruction: 'Confirm the equipment and valve rows copied from the drawings before relying on quantities or attributes.',
      doneWhen: 'The schedule records that belong in the takeoff are understood and any missing scope is identified.',
    },
    {
      id: 'grounding', label: 'Verify on plans',
      detail: c.reconcileRows
        ? `${c.reconcileMatches} verified · ${c.reconcileExceptions} to review`
        : 'No safe comparison retained',
      state: !c.reconcileRows ? 'blocked' : c.reconcileExceptions ? 'attention' : 'available',
      instruction: 'Compare each schedule row with the printed tag and nearby drawing symbol. A tag by itself is not an installed match.',
      doneWhen: 'Verified symbol matches are accepted and uncertain, missing, or conflicting matches are left for review.',
    },
    {
      id: 'points', label: 'Confirm BAS points',
      detail: c.pointLists ? `${c.pointLists} lists · ${c.pointRows} rows` : 'No point list retained',
      state: !c.pointLists ? 'blocked' : c.pointTypeReviewRows ? 'attention' : 'available',
      instruction: 'Review the original point-list rows and confirm any I/O type or equipment link the drawings did not state clearly.',
      doneWhen: 'Every included point requirement is source-backed and unresolved point types remain clearly flagged.',
    },
    {
      id: 'controls', label: 'Read controls',
      detail: controls
        ? `${c.sequences} sequences · ${c.schematics + c.risers} diagrams`
        : 'No SOO or diagram evidence retained',
      state: !controls ? 'blocked' : c.sooPointCandidates ? 'attention' : 'available',
      instruction: 'Read the sequence, schematic, and riser evidence together. Accept or reject interpretations against the original drawing.',
      doneWhen: 'Applicable control requirements are linked to evidence and unsupported interpretations are not included.',
    },
    {
      id: 'exceptions', label: 'Resolve issues',
      detail: summary.reviewTasks.length ? `${summary.reviewTasks.length} review categories open` : 'No automated exceptions reported',
      state: summary.reviewTasks.length ? 'attention' : 'available',
      instruction: 'Work the short list of findings that can change scope, quantities, point counts, or responsibility.',
      doneWhen: 'Material blockers are corrected, explicitly excluded, or left visibly unresolved for the bid decision.',
    },
    {
      id: 'release', label: 'Approve & export',
      detail: approved ? 'Current scoped snapshot verified' : 'Explicit estimator approval required',
      state: approved ? 'verified' : 'blocked',
      instruction: 'Run the final readiness check, review the included scope and exclusions, then approve and export the evidence package.',
      doneWhen: 'A current scoped snapshot is explicitly approved and saved with its exact source evidence.',
    },
  ];
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
