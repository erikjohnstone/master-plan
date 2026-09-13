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
      .filter(([stage]) => !Object.hasOwn(inspections, stage)
        && stage !== "open_review_workspace" && stage !== "open_result_workspace"
        && stage !== "present_complete_bas_takeoff")
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
    result_workspace_opened: !payload.workspace?.error,
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

/**
 * Deterministic, presentation-only answer for the complete BAS macro. All
 * facts are copied from the canonical receipt; no quantity, classification,
 * readiness, or engineering inference is performed here.
 */
export function completeBasAnswerMarkdown(payload) {
  const coverage = payload?.presentation?.coverage || {};
  const n = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const equipment = n(coverage.equipment_items);
  const pointLists = n(coverage.point_lists);
  const pointRows = n(coverage.point_rows);
  const pointTypeReviews = n(coverage.point_type_review_rows);
  const sequences = n(coverage.sequences);
  const sequenceSections = n(coverage.sequence_sections);
  const sooCandidates = n(coverage.soo_point_candidates);
  const valves = n(coverage.control_valve_items);
  const coilGaps = n(coverage.embedded_coil_gaps);
  const schematics = n(coverage.control_schematics);
  const risers = n(coverage.riser_diagrams);
  const explicitTokens = n(payload?.control_schematics?.totals?.explicit_points);
  const reconcile = payload?.reconcile?.summary || {};
  const reconcileTotal = n(reconcile.total ?? coverage.reconcile_rows);
  const match = n(reconcile.match ?? coverage.reconcile_match);
  const scheduleOnly = n(reconcile.schedule_only ?? coverage.reconcile_schedule_only);
  const planOnly = n(reconcile.plan_only ?? coverage.reconcile_plan_only);
  const ambiguous = n(reconcile.ambiguous ?? coverage.reconcile_ambiguous);
  const refused = n(reconcile.refused_no_scale) + n(reconcile.refused_no_text);
  const lines = [
    "## BAS takeoff ready for estimator review",
    "",
    "### Extracted source coverage",
    "",
    `- Scheduled equipment records: **${equipment}**.`,
  ];
  if (pointLists > 0 || pointRows > 0) {
    lines.push(`- Point-list evidence: **${pointLists} matrices / ${pointRows} rows**.`);
  } else {
    lines.push("- Point-list evidence: **no extractable point-list matrix or rows in the loaded source**.");
  }
  if (pointTypeReviews > 0) {
    lines.push(`- **${pointTypeReviews}** listed point row${pointTypeReviews === 1 ? "" : "s"} require${pointTypeReviews === 1 ? "s" : ""} I/O-type review; they are not promoted to typed physical points.`);
  }
  lines.push(`- Sequence evidence: **${sequences} sequences / ${sequenceSections} sections**.`);
  if (sooCandidates > 0) {
    lines.push(`- **${sooCandidates}** explicit labeled SOO point candidate${sooCandidates === 1 ? "" : "s"} require${sooCandidates === 1 ? "s" : ""} estimator review; ${sooCandidates === 1 ? "it is" : "they are"} not typed I/O, field wiring, equipment applicability, or installed quantity.`);
  }
  lines.push(
    `- Control-valve schedule records: **${valves}**; embedded-coil review gaps: **${coilGaps}**.`,
    `- Diagram evidence: **${schematics} control schematics / ${risers} riser or flow diagrams / ${explicitTokens} explicit printed I/O tokens**.`,
    "",
    "### Schedule-to-plan reconciliation",
    "",
  );
  if (reconcileTotal > 0) {
    lines.push(
      `- Reviewed rows: **${reconcileTotal}** — **${match} MATCH**, **${scheduleOnly} SCHEDULE_ONLY**, **${planOnly} PLAN_ONLY**, **${ambiguous} AMBIGUOUS**, **${refused} REFUSED**.`,
    );
  } else {
    lines.push("- No quantity-bearing schedule rows were available for plan reconciliation in this source.");
  }

  const readiness = payload?.diagram_engineering_readiness
    || payload?.control_schematics?.engineering_readiness || {};
  const blockers = (readiness.blockers || []).filter((item) => n(item?.count) > 0);
  if (blockers.length > 0) {
    lines.push("", "### Diagram review blockers", "");
    for (const blocker of blockers) {
      lines.push(`- **${String(blocker.code || "REVIEW_REQUIRED")} · ${n(blocker.count)}** — ${String(blocker.explanation || "Review cited diagram evidence.")}`);
    }
  }

  const workflowLabels = {
    point_soo: "Point lists / SOO",
    equipment_templates: "Equipment / templates",
    assemblies_responsibility: "Assemblies / responsibility",
    engineering_compatibility: "Engineering compatibility",
    review_revisions_release: "Review / revisions / release",
  };
  const inspections = payload?.inspections || {};
  const workflowRows = Object.entries(workflowLabels)
    .map(([key, label]) => ({ key, label, value: inspections[key] }))
    .filter(({ value }) => value);
  if (workflowRows.length > 0) {
    lines.push("", "### Workflow status", "");
    for (const { label, value } of workflowRows) {
      lines.push(`- ${label}: **${String(value?.status || "unavailable")}**${n(value?.blocker_count) > 0 ? ` · ${n(value.blocker_count)} blockers` : ""}.`);
    }
  }

  const pointSooNext = String(inspections?.point_soo?.next_step || "");
  const missingPointList = /No point-list matrix was found/i.test(pointSooNext);
  if (missingPointList) {
    lines.push(
      "",
      "### Source-coverage boundary",
      "",
      "No extractable point-list matrix was found in the loaded set. This does not prove the project has no points. The estimator must supply the applicable controls point-list or specification source before SOO-to-point linking.",
    );
  }
  const nextInspection = workflowRows.find(({ value }) => value?.status !== "complete" && value?.next_step);
  const nextEstimatorAction = (() => {
    if (sequences === 0 && pointLists === 0) {
      return "Confirm whether the issued controls specifications, point-list matrices, and sequence-of-operations pages are included. None were extracted from this loaded set; supply missing controls sources or review the cited discovery exceptions before assigning BAS points.";
    }
    if (sequences === 0) {
      return "Confirm whether sequence-of-operations pages are included in the issued set. No sequence was extracted; supply the missing controls source or review the cited discovery exceptions before SOO reconciliation.";
    }
    if (pointLists === 0) {
      return "Supply or identify the applicable controls point-list/specification source, then review the extracted sequences against it. No listed point row has been inferred from sequence prose.";
    }
    return String(nextInspection?.value?.next_step || "Review cited exceptions and source coverage in the BAS project workspace.");
  })();
  lines.push(
    "",
    "### Next estimator action",
    "",
    nextEstimatorAction,
    "",
    `**Release status: ${String(payload?.release_status || "human_review_required")}**. A human estimator remains the release authority; this result is not an approved takeoff.`,
  );
  return lines.join("\n");
}
