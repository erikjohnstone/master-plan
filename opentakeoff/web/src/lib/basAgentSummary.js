// Chat formatting only. Never replace the canonical Takeoff/export result.
function completeBasReply(payload) {
  const compiles = Object.fromEntries(Object.entries(payload.compiles || {}).map(([kind, value]) => [kind, {
    takeoff_id: value?.takeoff_id || null,
    kind: value?.kind || kind,
    category_count: value?.category_count ?? null,
    totals: value?.totals || null,
    estimator_status: value?.estimator_status || null,
  }]));
  const controls = payload.control_schematics || {};
  const reconcile = payload.reconcile || null;
  const inspections = Object.fromEntries(Object.entries(payload.inspections || {}).map(([domain, value]) => [domain, {
    workflow_status: value?.status || "unavailable",
    stage_status: payload.stages?.[domain]?.status || (value?.error ? "failed" : "partial"),
    blocker_count: value?.blocker_count ?? null,
    issue_count: value?.issue_count ?? null,
    next_step: value?.next_step || null,
    error: value?.error || null,
  }]));
  const reviewIssues = payload.inspections?.review_revisions_release?.issue_summary || [];
  const pointMetrics = Object.fromEntries((payload.inspections?.point_soo?.metrics || [])
    .map((metric) => [metric.key, metric.value]));
  return {
    workflow: payload.workflow,
    execution_status: payload.execution_status,
    release_status: payload.release_status,
    human_review_required: payload.human_review_required,
    extraction_stages: Object.fromEntries(Object.entries(payload.stages || {})
      .filter(([stage]) => !Object.hasOwn(inspections, stage) && stage !== "open_review_workspace")
      .map(([stage, value]) => [stage, {
      status: value?.status || "unknown",
      error: value?.error || null,
    }])),
    extracted_scope: compiles,
    point_list_evidence: {
      matrix_fragments: pointMetrics.point_matrix_fragments ?? null,
      retained_source_rows: pointMetrics.point_source_rows ?? null,
      listed_point_rows: pointMetrics.listed_point_rows ?? null,
      source_typed_physical_io_rows: pointMetrics.typed_point_rows ?? null,
      point_type_review_rows: pointMetrics.point_type_review_rows ?? null,
    },
    diagram_analysis: {
      schema_version: controls.schema_version,
      totals: controls.totals || null,
      engineering_status: controls.engineering_readiness?.status || "unavailable",
      blockers: controls.engineering_readiness?.blockers || [],
      diagram_conflict_count: controls.diagram_conflicts?.length || 0,
    },
    schedule_plan_reconciliation: reconcile ? {
      family_filter: reconcile.family_filter ?? null,
      summary: reconcile.summary || null,
      takeoff_stats: reconcile.takeoff_stats || null,
      row_count: reconcile.row_count ?? reconcile.rows?.length ?? 0,
    } : null,
    workflow_reviews: inspections,
    top_open_findings: reviewIssues.slice(0, 8),
    review_workspace_opened: !payload.workspace?.error,
    failures: payload.failures || [],
    bas_math_policy: payload.bas_math_policy,
    answer_contract: [
      "Lead with the five extracted-scope totals and the schedule-plan MATCH / exception counts.",
      "For BAS points, distinguish listed rows from source-typed physical I/O rows and explicitly report nonzero point-type review rows.",
      "Call a workflow finished only when workflow_status says so. not_started means available but awaiting estimator decisions, never complete.",
      "Do not invent hypothetical exception causes. Report only nonzero status counts and exact diagram blocker counts present here.",
      "Keep chat concise: outcome, scope, exceptions, next review action. Do not repeat technical steps or dump raw rows.",
    ],
    note: "Chat summary only. Full cited rows, bboxes, topology, reconciliation, review state, and export data remain in Takeoff and the canonical Agent receipt.",
  };
}

export function basReplyForAgent(payload) {
  if (payload?.workflow === "complete_bas_takeoff") return completeBasReply(payload);
  const math = payload?.bas_math;
  if (!math || math.status === "unavailable") return payload;
  const fields = (row, names) => Object.fromEntries(names.map((name) => [name, row[name]]));
  const lists = {
    hardware: (math.hardware || []).map((h) => fields(h, ["group_id", "profile_id", "pool_count", "blocks_per_pool", "blocks_total", "status"])),
    licenses: (math.licenses || []).map((l) => fields(l, ["pool", "variables", "weighted_points", "entitlement", "packs", "headroom", "status"])),
    serial: (math.serial || []).map((r) => fields(r, ["route_id", "status"])),
    ip: (math.ip || []).map((r) => fields(r, ["closet_id", "status", "switches", "endpoint_count"])),
    diagnostic_codes: [...new Set((math.diagnostics || []).map((d) => d.code))],
  };
  const summary = {
    ...fields(math, ["engine", "schema_version", "status", "project_complete", "source_coverage", "physical_total"]),
    point_rows_in_workspace: math.points?.length || 0,
    ...Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.slice(0, key === "diagnostic_codes" ? 16 : 4)])),
    omitted: {},
    detail: "Chat summary only. Full point rows, source citations, assignments, network partitions and diagnostics remain in Takeoff and Export BAS JSON. Read review_required literally; neither this summary nor a capacity envelope certifies a complete project.",
  };
  const updateOmissions = () => {
    summary.omitted = Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.length-summary[key].length]));
  };
  updateOmissions();
  // Leave room for the existing compile metadata inside Agent's 5,000-char cap.
  // Drop whole summary entries with explicit omissions, never truncate IDs or
  // recalculate a quantity. Core totals and readiness always survive.
  while (JSON.stringify(summary).length > 2500) {
    const candidates = Object.keys(lists).filter((key) => summary[key].length);
    if (!candidates.length) break;
    const largest = candidates.sort((a, b) => JSON.stringify(summary[b]).length-JSON.stringify(summary[a]).length)[0];
    summary[largest].pop();
    updateOmissions();
  }
  const { bas_math: _canonical, ...legacy } = payload;
  return { ...legacy, bas_math: summary };
}
