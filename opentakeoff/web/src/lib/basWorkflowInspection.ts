/** SHOULD THIS BE ON THE SHARED PATH? Yes. This is the bounded, read-only
 * workflow status projection consumed by browser Agent and MCP. It validates
 * retained history and reuses the same point/SOO, equipment, assembly,
 * engineering and issue services as the human workspaces. It never approves,
 * edits, infers installed quantity or replaces fresh Python/source replay. */
import { z } from 'zod';
import { verifyBasWorkflow } from './basWorkflow.ts';
import { basSequenceView, basActiveAssociations } from './basReview.ts';
import { basEquipmentView, basAssignmentCalculationState } from './basEquipmentReview.ts';
import { basAssemblyView, basAssemblyCalculationState } from './basAssemblyReview.ts';
import { basEngineeringView } from './basEngineeringReview.ts';
import { projectReviewForVerifiedBasWorkflow } from './basProjectReview.ts';
import { catalogBasScope } from './basScopeCatalog.ts';

export const basWorkflowInspectionDomainSchema = z.enum([
  'point_soo', 'equipment_templates', 'assemblies_responsibility',
  'engineering_compatibility', 'review_revisions_release',
]);
export type BasWorkflowInspectionDomain = z.infer<typeof basWorkflowInspectionDomainSchema>;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const metricSchema = z.object({ key: z.string(), label: z.string(), value: z.union([z.number(), z.string(), z.null()]) }).strict();
const issueSchema = z.object({ domain: z.string(), code: z.string(), severity: z.enum(['blocker', 'warning', 'information']), count: z.number().int().positive() }).strict();
export const basWorkflowInspectionSchema = z.object({
  schema_version: z.literal('bas_workflow_inspection_v1'),
  domain: basWorkflowInspectionDomainSchema,
  capture_id: sha,
  capture_status: z.enum(['active_capture', 'historical_capture']),
  status: z.enum(['unavailable', 'not_started', 'in_progress', 'stale_dependencies', 'current_with_open_findings']),
  metrics: z.array(metricSchema),
  issue_count: z.number().int().nonnegative(),
  blocker_count: z.number().int().nonnegative(),
  issue_summary: z.array(issueSchema).max(16),
  next_step: z.string(),
  workspace_destination: z.enum(['point_soo', 'equipment_templates', 'assemblies_responsibility', 'engineering_compatibility', 'review_revisions_release']),
  authority: z.literal('validated_shared_workflow'),
  source_bytes: z.literal('not_verified_by_inspection'),
  calculation_verification: z.literal('saved_state_only'),
  approval: z.literal('not_evaluated'),
  project_complete: z.literal(false),
  installed_quantity: z.null(),
}).strict();
export type BasWorkflowInspection = z.infer<typeof basWorkflowInspectionSchema>;

const metric = (key: string, label: string, value: number | string | null) => ({ key, label, value });

/** This deliberately returns only bounded counts and issue codes. Exact source
 * evidence remains in the workspaces/project review and is never truncated into
 * an Agent-owned parallel record. */
export async function inspectBasWorkflow(raw: unknown, rawDomain: unknown, rawCaptureId?: unknown): Promise<BasWorkflowInspection> {
  const domain = basWorkflowInspectionDomainSchema.parse(rawDomain);
  const workflow = await verifyBasWorkflow(raw);
  const captureId = rawCaptureId === undefined || rawCaptureId === null
    ? workflow.current_capture_id
    : sha.parse(rawCaptureId);
  if (!captureId || !workflow.captures.some(c => c.capture_id === captureId))
    throw new Error('BAS workflow inspection requires a retained capture');
  const capture = workflow.captures.find(c => c.capture_id === captureId)!;
  const project = await projectReviewForVerifiedBasWorkflow(workflow, captureId);
  const includedDomains = domain === 'point_soo' ? new Set(['sources', 'points', 'sequences'])
    : domain === 'equipment_templates' ? new Set(['equipment', 'points', 'sequences'])
      : domain === 'assemblies_responsibility' ? new Set(['assemblies'])
        : domain === 'engineering_compatibility' ? new Set(['engineering'])
          : new Set(['sources', 'points', 'sequences', 'equipment', 'assemblies', 'engineering']);
  const relevant = project.issues.filter(issue => includedDomains.has(issue.domain));
  const grouped = new Map<string, { domain: string; code: string; severity: 'blocker' | 'warning' | 'information'; count: number }>();
  const severityRank = { blocker: 0, warning: 1, information: 2 } as const;
  for (const issue of relevant) {
    const key = `${issue.domain}\u0000${issue.code}\u0000${issue.severity}`;
    const found = grouped.get(key);
    if (found) found.count++;
    else grouped.set(key, { domain: issue.domain, code: issue.code, severity: issue.severity, count: 1 });
  }
  const issue_summary = [...grouped.values()]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 16);
  const blockers = relevant.filter(issue => issue.severity === 'blocker');
  const base = {
    schema_version: 'bas_workflow_inspection_v1' as const, domain, capture_id: captureId,
    capture_status: workflow.current_capture_id === captureId ? 'active_capture' as const : 'historical_capture' as const,
    issue_count: relevant.length, blocker_count: blockers.length, issue_summary,
    workspace_destination: domain, authority: 'validated_shared_workflow' as const,
    source_bytes: 'not_verified_by_inspection' as const, calculation_verification: 'saved_state_only' as const,
    approval: 'not_evaluated' as const, project_complete: false as const, installed_quantity: null,
  };
  let status: BasWorkflowInspection['status'] = relevant.length ? 'current_with_open_findings' : 'in_progress';
  let metrics: BasWorkflowInspection['metrics'] = [];
  let next_step = relevant[0]?.next_step || 'Open the workspace and review the retained source-backed records.';

  if (domain === 'point_soo') {
    const rows = capture.points.matrices.flatMap(matrix => matrix.rows);
    if (!capture.narrative_sources) {
      status = 'unavailable';
      metrics = [metric('point_matrices', 'Point-list matrices', capture.points.matrices.length), metric('point_rows', 'Point-list rows', rows.length),
        metric('sequence_regions', 'SOO regions', 0), metric('reviewed_links', 'Reviewed SOO ↔ point-list links', 0)];
      next_step = 'Recompile the original PDFs to retain narrative SOO source text; existing point-list evidence remains available.';
    } else {
      const view = await basSequenceView(workflow, captureId);
      const clauses = view.sequences.regions.flatMap(region => region.clauses);
      const comparisons = view.comparisons.flatMap(comparison => comparison.requirements);
      const links = basActiveAssociations(workflow, captureId);
      metrics = [metric('point_matrices', 'Point-list matrices', capture.points.matrices.length), metric('point_rows', 'Point-list rows', rows.length),
        metric('read_observations', 'Deterministically read point observations', rows.reduce((n, row) => n + row.observations.filter(o => o.status === 'read').length, 0)),
        metric('sequence_regions', 'SOO regions', view.sequences.regions.length), metric('sequence_clauses', 'SOO clauses', clauses.length),
        metric('reviewed_links', 'Reviewed SOO ↔ point-list links', links.length),
        metric('requirements_listed', 'SOO requirements found in selected point lists', comparisons.filter(r => r.status === 'listed').length),
        metric('requirements_unresolved', 'SOO requirements not established in selected lists', comparisons.filter(r => r.status !== 'listed').length)];
      if (!links.length && view.sequences.regions.length) { status = 'not_started'; next_step = 'Open Point lists → Sequences & links and review which SOO regions apply to which point-list matrices.'; }
    }
  } else if (domain === 'equipment_templates') {
    if (!capture.equipment_sources || !capture.narrative_sources) {
      status = 'unavailable'; metrics = [];
      next_step = 'Recompile the original PDFs to retain equipment and narrative evidence.';
    } else {
      const view = await basEquipmentView(workflow, captureId), calculation = basAssignmentCalculationState(workflow, captureId);
      const occurrences = view.candidates.tables.reduce((n, table) => n + table.rows.length, 0);
      const unique = calculation.latest?.result.unique_requirement_total;
      metrics = [metric('source_occurrences', 'Source equipment occurrences', occurrences), metric('equipment', 'Reviewed equipment identities', view.register.equipment.length),
        metric('templates', 'Assigned point-list templates', new Set(view.register.assignments.map(a => a.matrix_id)).size), metric('assignments', 'Template assignments', view.register.assignments.length),
        metric('assigned_equipment', 'Assigned included equipment', new Set(view.register.assignments.flatMap(a => a.equipment_ids)).size),
        metric('assignment_calculation', 'Assigned-point calculation', calculation.status),
        metric('bounded_unique_physical_io', 'Bounded unique listed physical I/O', unique
          ? unique.physical_io.AI + unique.physical_io.AO + unique.physical_io.DI + unique.physical_io.DO : null)];
      if (calculation.status === 'stale_dependencies') { status = 'stale_dependencies'; next_step = 'Equipment decisions changed. Recalculate assigned points against the current assignment head.'; }
      else if (!view.register.assignments.length) { status = 'not_started'; next_step = 'Open Equipment and create explicit, source-reviewed template assignments to actual equipment.'; }
      else if (calculation.status === 'not_calculated') { status = 'in_progress'; next_step = 'Calculate assigned points from the reviewed assignments; this does not establish installed field quantity.'; }
    }
  } else if (domain === 'assemblies_responsibility') {
    if (!capture.equipment_sources || !capture.narrative_sources) {
      status = 'unavailable'; metrics = [];
      next_step = 'Recompile the original PDFs to retain equipment and assembly requirement evidence.';
    } else {
      const view = await basAssemblyView(workflow, captureId), calculation = basAssemblyCalculationState(workflow, captureId);
      const knownResponsibilities = view.components.reduce((n, component) => n + component.responsibilities.filter(r => r.assignment !== 'unknown').length, 0);
      const unknownResponsibilities = view.components.reduce((n, component) => n + component.responsibilities.filter(r => r.assignment === 'unknown').length, 0);
      metrics = [metric('components', 'Reviewed assembly components', view.components.length),
        metric('included_components', 'Included components', view.components.filter(c => c.record.disposition === 'included').length),
        metric('known_responsibilities', 'Declared furnish/install/wire/program/test responsibilities', knownResponsibilities),
        metric('unknown_responsibilities', 'Unknown responsibilities', unknownResponsibilities),
        metric('quantity_calculation', 'Assembly quantity calculation', calculation.status)];
      if (view.dependency_status === 'stale_dependencies' || calculation.status === 'stale_dependencies') {
        status = 'stale_dependencies'; next_step = 'Equipment or assembly decisions changed. Re-review applicability and recalculate component quantities.';
      } else if (!view.review_head) { status = 'not_started'; next_step = 'Open Equipment → Assemblies and review source-derived component applicability and all five responsibilities.'; }
      else if (calculation.status === 'not_calculated') { status = 'in_progress'; next_step = 'Calculate assembly quantities from the current reviewed equipment and component register.'; }
    }
  } else if (domain === 'engineering_compatibility') {
    if (!capture.equipment_sources || !capture.narrative_sources) {
      status = 'unavailable'; metrics = [];
      next_step = 'Recompile the original PDFs to retain engineering source evidence.';
    } else {
      const view = await basEngineeringView(workflow, captureId);
      const constraints = view.event?.result.checks.flatMap(check => check.constraints) ?? [];
      metrics = [metric('resources', 'Declared engineering resources', view.register.resources.length), metric('checks', 'Configured compatibility checks', view.register.input.checks.length),
        metric('passing_constraints', 'Passing constraints', constraints.filter(c => c.status === 'pass').length),
        metric('failing_constraints', 'Failing constraints', constraints.filter(c => c.status === 'fail').length),
        metric('not_evaluable_constraints', 'Not-evaluable constraints', constraints.filter(c => c.status === 'not_evaluable').length),
        metric('dependency_status', 'Engineering dependency status', view.dependency_status),
        metric('calculation_state', 'Engineering calculation state', view.calculation_verification)];
      if (view.dependency_status === 'stale_dependencies') { status = 'stale_dependencies'; next_step = 'Upstream equipment, assembly or SOO decisions changed. Re-run engineering review with current declared inputs.'; }
      else if (!view.event) { status = 'not_started'; next_step = 'Open Equipment → Engineering, enter only evidenced or operator-declared ratings, and run the shared compatibility checks.'; }
    }
  } else {
    const catalog = await catalogBasScope(workflow);
    const savedScopes = catalog.scopes.filter(event => event.action.kind === 'save_scope');
    metrics = [metric('source_versions', 'Retained source versions', capture.sources.length), metric('drawing_events', 'Drawing review events', workflow.drawing_events?.length ?? 0),
      metric('revision_events', 'Revision comparison events', workflow.revision_events?.length ?? 0), metric('issue_decisions', 'Issue decision events', workflow.issue_events?.length ?? 0),
      metric('saved_scopes', 'Saved reviewed scopes', savedScopes.length), metric('open_findings', 'Current source-linked findings', project.issues.length),
      metric('blocking_findings', 'Current blocking findings', project.issues.filter(issue => issue.severity === 'blocker').length),
      metric('approved_snapshots', 'Approved snapshots', 'browser or MCP storage; inspect separately')];
    if (!savedScopes.length) { status = 'not_started'; next_step = 'Open Review & changes, resolve or record findings, review drawing correspondence, then save an explicit deliverable scope.'; }
    else { status = project.issues.length ? 'current_with_open_findings' : 'in_progress'; next_step = 'Open Review & changes → Snapshots, verify exact original bytes and Python calculations, then a human may explicitly approve the selected scope.'; }
  }
  return basWorkflowInspectionSchema.parse({ ...base, status, metrics, next_step });
}
