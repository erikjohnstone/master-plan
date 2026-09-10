/** SHOULD THIS BE ON THE SHARED PATH? Yes. One source-linked saved-finding view
 * for UI/MCP. No extraction, math, dismissal, source-byte verification or approval. */
import { z } from 'zod';
import { verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { basEquipmentView, basAssignmentCalculationState } from './basEquipmentReview.ts';
import { basAssemblyView, basAssemblyCalculationState } from './basAssemblyReview.ts';
import { basEngineeringView } from './basEngineeringReview.ts';
import { basSequenceView } from './basReview.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { BAS_PROJECT_ISSUE_RULE, basProjectIssuePolicy, type BasIssueDomain } from './basProjectIssueCatalog.ts';

const id = z.string().min(1).max(1024), sha = z.string().regex(/^[a-f0-9]{64}$/);
const box = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(b => b[2] >= b[0] && b[3] >= b[1]);
const evidenceSchema = z.object({ page_id: id, span_id: id.nullable(), bbox_px: box.nullable(), text: z.string() }).strict();
const subjectSchema = z.object({ kind: z.enum(['capture', 'page', 'matrix', 'point_row', 'clause', 'comparison', 'occurrence',
  'equipment', 'scope', 'assignment', 'component', 'resource', 'check', 'constraint']), id, label: z.string() }).strict();
export const basProjectReviewRequestSchema = z.object({ capture_id: sha }).strict();
export const basProjectReviewSchema = z.object({ schema_version: z.literal('bas_project_review_v1'),
  rule_version: z.literal(BAS_PROJECT_ISSUE_RULE), capture_id: sha, source_status: z.enum(['active_capture', 'historical_capture']),
  source_availability: z.literal('not_byte_verified'), calculation_verification: z.literal('saved_results_not_python_replayed'),
  readiness: z.literal('not_evaluated'), project_complete: z.literal(false),
  issues: z.array(z.object({ issue_key: sha, occurrence_id: sha, domain: z.enum(['sources', 'points', 'sequences', 'equipment', 'assemblies', 'engineering']),
    code: id, known_code: z.boolean(), severity: z.enum(['blocker', 'warning', 'information']), title: z.string(), next_step: z.string(),
    subject: subjectSchema, equipment_ids: z.array(id), evidence: z.array(evidenceSchema),
    original_finding_json: z.string(), dependency_status: z.enum(['current_dependencies', 'stale_dependencies', 'not_reviewed']),
    source_event_id: sha.nullable(), disposition: z.enum(['included', 'excluded', 'not_established']),
  }).strict()).max(100000),
}).strict();
export type BasProjectReview = z.infer<typeof basProjectReviewSchema>;
type Issue = BasProjectReview['issues'][number];
type Evidence = z.infer<typeof evidenceSchema>;
type Subject = z.infer<typeof subjectSchema>;
const digest = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
const unique = <T>(values: T[]) => [...new Map(values.map(v => [canonicalBasJson(v), v])).values()];
const subject = (kind: Subject['kind'], id: string, label = id): Subject => ({ kind, id, label });

/** Input is a durable workflow, not caller-supplied issue arrays or outcomes.
 * Invalid history fails explicitly. Older captures expose missing capabilities. */
export async function basProjectReview(raw: unknown, captureId: string): Promise<BasProjectReview> {
  const workflow = await verifyBasWorkflow(raw);
  return projectReviewForVerifiedBasWorkflow(workflow, captureId);
}

/** Internal shared seam: callers own and verify the workflow before selecting
 * retained history. Public requests cannot supply findings or skip verification. */
export async function projectReviewForVerifiedBasWorkflow(workflow: BasWorkflow, captureId: string): Promise<BasProjectReview> {
  const capture = workflow.captures.find(c => c.capture_id === captureId);
  if (!capture) throw new Error('Project review requires a retained BAS capture');
  const pending: Omit<Issue, 'issue_key' | 'occurrence_id'>[] = [];
  const pageMap = new Map(capture.narrative_sources?.pages.map(p => [p.page_id, p]) ?? []);
  const spans = new Map(capture.narrative_sources?.pages.flatMap(p => p.spans.map(s => [s.span_id,
    { page_id: p.page_id, span_id: s.span_id, bbox_px: s.bbox_px, text: s.text }] as const)) ?? []);
  const fromSpans = (ids: string[]) => ids.map(id => { const s = spans.get(id); if (!s) throw new Error('Project finding has a foreign source span'); return s; });
  const fromCell = (page_id: string | null, cell: { text: string; bbox: number[] | null } | null | undefined): Evidence[] =>
    page_id && cell ? [{ page_id, span_id: null, text: cell.text, bbox_px: cell.bbox as Evidence['bbox_px'] }] : [];
  // Shared finding identity must survive canonical backup. The header array is
  // explicit source order; dictionary insertion order is not. Retain orphan
  // cells too, deterministically, without reordering narrative source spans.
  const fromRow = (pageId: string | null, headers: string[], cells: Record<string, { text: string; bbox: number[] | null }>) => {
    const keys = new Set(headers);
    return [...keys, ...Object.keys(cells).filter(k => !keys.has(k)).sort()]
      .filter(k => Object.prototype.hasOwnProperty.call(cells, k)).flatMap(k => fromCell(pageId, cells[k]));
  };
  const push = (domain: BasIssueDomain, code: string, owner: Subject, finding: unknown, evidence: Evidence[] = [], equipment_ids: string[] = [],
    dependency_status: Issue['dependency_status'] = 'current_dependencies', source_event_id: string | null = null,
    disposition: Issue['disposition'] = 'not_established') => {
    pending.push({ domain, code, subject: owner, original_finding_json: canonicalBasJson(finding),
      evidence: unique(evidence), equipment_ids: [...new Set(equipment_ids)].sort(), dependency_status, source_event_id, disposition,
      ...basProjectIssuePolicy(domain, code) });
  };
  const whole = subject('capture', captureId, 'Drawing-set evidence');
  push('sources', 'source_inventory_not_byte_verified', whole, { sources: capture.sources.map(s => s.source_id) });
  for (const code of capture.points.issues) push('points', code, whole, { code });
  for (const matrix of capture.points.matrices) {
    const owner = subject('matrix', matrix.matrix_id, matrix.raw.title?.text || 'Untitled point list');
    const evidence = fromCell(matrix.page_id, matrix.raw.title ?? { text: owner.label, bbox: matrix.raw.region });
    for (const code of matrix.issues) push('points', code, owner, { code }, evidence);
    for (const row of matrix.rows) {
      const cells = fromRow(matrix.page_id, matrix.raw.headers, row.raw.cells);
      const rowOwner = subject('point_row', row.row_id, row.name || row.local_key || 'Unnamed point row');
      for (const code of row.issues) push('points', code, rowOwner, { code, status: row.status }, cells);
      if (row.unobserved_columns.length) push('points', 'point_columns_unobserved', rowOwner, { columns: row.unobserved_columns }, cells);
      if (row.uninterpreted_columns.length) push('points', 'point_columns_uninterpreted', rowOwner, { columns: row.uninterpreted_columns }, cells);
      const ambiguous = row.observations.filter(o => o.status === 'ambiguous');
      if (ambiguous.length) push('points', 'point_observation_ambiguous', rowOwner, { observations: ambiguous }, cells);
    }
  }
  if (!capture.narrative_sources) push('sources', 'narrative_capture_unavailable', whole, { capture_id: captureId });
  else {
    const view = await basSequenceView(workflow, captureId), sequence = view.sequences;
    push('sequences', 'discovery_incomplete', whole, { discovery_complete: sequence.discovery_complete, interpretation_complete: sequence.interpretation_complete });
    for (const page of sequence.discovery.pages) {
      const owner = subject('page', page.page_id, `PDF page ${pageMap.get(page.page_id)?.page_number}`);
      if (page.text_status === 'no_text') push('sequences', 'page_no_text', owner, { text_status: page.text_status }, [{ page_id: page.page_id, span_id: null, bbox_px: null, text: 'Page has no available extracted text' }]);
      for (const [key, code] of [['unassigned_horizontal_span_ids', 'unassigned_horizontal_spans'], ['unsupported_span_ids', 'unsupported_spans'], ['ambiguous_span_ids', 'ambiguous_spans']] as const) {
        if (page.accounting[key].length) push('sequences', code, owner, { span_count: page.accounting[key].length }, fromSpans(page.accounting[key]));
      }
    }
    for (const region of sequence.regions) {
      if (region.raw.status !== 'body_detected') push('sequences', region.raw.status, subject('clause', region.region_id, region.title),
        { status: region.raw.status, boundary: region.raw.boundary }, fromSpans(region.raw.heading.span_ids));
      for (const clause of region.clauses) push('sequences', `${clause.status}_clause`, subject('clause', clause.clause_id, region.title),
        { status: clause.status, uninterpreted_text: clause.uninterpreted_text }, fromSpans(clause.source_spans.map(s => s.span_id)));
    }
    for (const comparison of view.comparisons) {
      const owner = subject('comparison', canonicalBasJson([comparison.association.region_id, comparison.association.matrix_id]), 'SOO / point-list comparison');
      for (const requirement of comparison.requirements) if (requirement.status !== 'listed') push('sequences', requirement.status,
        subject('comparison', `${owner.id}:${requirement.requirement.requirement_id}`, requirement.requirement.variable),
        { status: requirement.status, matrix_id: comparison.association.matrix_id, requirement: requirement.requirement }, fromSpans(requirement.source_spans.map(s => s.span_id)));
      if (comparison.unpaired_point_row_ids.length) push('sequences', 'unpaired_point_rows', owner,
        { row_ids: comparison.unpaired_point_row_ids, matrix_id: comparison.association.matrix_id });
    }
  }
  if (!capture.equipment_sources) push('sources', 'equipment_capture_unavailable', whole, { capture_id: captureId });
  else {
    const equipment = await basEquipmentView(workflow, captureId), register = equipment.register;
    const equipmentHead = workflow.equipment_events?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null;
    const equipmentMap = new Map(register.equipment.map(e => [e.equipment_id, e]));
    const occurrences = new Map(equipment.candidates.tables.flatMap(t => t.rows.map(r => [r.occurrence_id, { r, t }] as const)));
    const rowEvidence = (occurrenceId: string) => {
      const found = occurrences.get(occurrenceId);
      return found ? fromRow(found.r.page_id, found.t.raw.headers, found.t.raw.rows[found.r.row_index].cells) : [];
    };
    const equipmentEvidence = (ids: string[]) => unique(ids.flatMap(id => equipmentMap.get(id)?.bindings.flatMap(b => rowEvidence(b.occurrence_id)) ?? []));
    for (const { r, t } of occurrences.values()) for (const code of r.issues) push('equipment', code,
      subject('occurrence', r.occurrence_id, r.membership?.raw || t.raw.title?.text || 'Equipment source row'), { code }, rowEvidence(r.occurrence_id),
      register.equipment.filter(e => e.bindings.some(b => b.occurrence_id === r.occurrence_id)).map(e => e.equipment_id));
    for (const issue of equipment.issues) {
      const a = register.assignments.find(a => a.assignment_id === issue.assignment_id), e = equipmentMap.get(issue.equipment_id || '');
      // Source-occurrence findings already have their exact row and consumers.
      if (e?.bindings.some(b => occurrences.get(b.occurrence_id)?.r.issues.includes(issue.code))) continue;
      const ids = e ? [e.equipment_id] : a ? a.equipment_ids : register.equipment.filter(e => e.scope_id === issue.scope_id).map(e => e.equipment_id);
      const owner = e ? subject('equipment', e.equipment_id, e.tag) : a ? subject('assignment', a.assignment_id, 'Template assignment')
        : subject('scope', issue.scope_id!, 'Equipment scope');
      push('equipment', issue.code, owner, { issue, decision: e ?? a ?? register.scopes.find(s => s.scope_id === issue.scope_id) }, equipmentEvidence(ids), ids, 'current_dependencies', equipmentHead);
    }
    for (const assignment of equipment.assignments) for (const comparison of assignment.sequence_comparisons) {
      const owner = subject('assignment', assignment.assignment_id, 'Assigned SOO / point-list comparison');
      for (const requirement of comparison.requirements) if (requirement.status !== 'listed') push('sequences', requirement.status,
        subject('comparison', `${owner.id}:${requirement.requirement.requirement_id}`, requirement.requirement.variable),
        { assignment_id: owner.id, status: requirement.status, matrix_id: assignment.matrix_id, requirement: requirement.requirement },
        fromSpans(requirement.source_spans.map(s => s.span_id)), assignment.included_equipment_ids, 'current_dependencies', equipmentHead);
      if (comparison.unpaired_point_row_ids.length) push('sequences', 'unpaired_point_rows', owner,
        { row_ids: comparison.unpaired_point_row_ids, matrix_id: assignment.matrix_id }, [], assignment.included_equipment_ids, 'current_dependencies', equipmentHead);
    }
    const demand = basAssignmentCalculationState(workflow, captureId);
    const demandStatus = demand.status === 'not_calculated' ? 'not_reviewed' : demand.status;
    if (register.assignments.length && demand.status !== 'current_dependencies') push('equipment', `assignment_${demand.status}`, whole,
      { status: demand.status }, [], [], demandStatus, demand.latest?.calculation_id ?? null);
    if (demand.latest) {
      // Python repeats capture-wide source limitations in its summary. The
      // original capture already owns that exact code/subject; do not duplicate
      // it because a calculation also reports it. Calculation-specific findings
      // retain their own dependency status and calculation reference below.
      for (const code of demand.latest.result.issues) if (!capture.points.issues.includes(code)) push('points', code, subject('capture', captureId, 'Saved assigned-value calculation'), { code }, [], [], demandStatus, demand.latest.calculation_id);
      for (const assignment of demand.latest.result.assignments) {
        const owner = subject('assignment', assignment.assignment.assignment_id, 'Saved assigned values');
        for (const code of assignment.issues) push('equipment', code, owner, { code, assignment: assignment.assignment }, equipmentEvidence(assignment.included_equipment_ids), assignment.included_equipment_ids, demandStatus, demand.latest.calculation_id);
        for (const row of assignment.rows) for (const code of row.issues) push('points', code,
          subject('point_row', `${owner.id}:${row.row_id}`, row.name), { code, assignment_id: owner.id },
          row.observations.flatMap(o => o.original.source.page_id ? [{ page_id: o.original.source.page_id, span_id: o.original.source.span_id, bbox_px: o.original.source.bbox_px, text: o.original.source.text }] : []),
          assignment.included_equipment_ids, demandStatus, demand.latest.calculation_id);
      }
    }
    const assembly = await basAssemblyView(workflow, captureId);
    if (assembly.dependency_status === 'stale_dependencies') push('assemblies', 'assembly_stale_dependencies', whole,
      { current_equipment_head: assembly.current_equipment_head, reviewed_equipment_head: assembly.equipment_head }, [], [], 'stale_dependencies', assembly.review_head);
    const components = new Map(assembly.components.map(c => [c.record.component_id, c]));
    for (const issue of assembly.issues) {
      const c = components.get(issue.component_id)!;
      push('assemblies', issue.code, subject('component', `${issue.component_id}${issue.activity ? `:${issue.activity}` : ''}`, `${c.record.label}${issue.activity ? ` · ${issue.activity}` : ''}`),
        { issue, record: c.record, responsibilities: c.responsibilities }, fromSpans([...new Set([...c.record.source_span_ids,
          ...c.declarations.flatMap(d => d.clause.source_spans.map(s => s.span_id)),
          ...c.responsibilities.flatMap(r => r.claims.flatMap(claim => claim.source_span_ids))])]),
        c.record.equipment_ids, assembly.dependency_status, assembly.review_head, c.record.disposition);
    }
    for (const c of assembly.components) if (c.record.disposition === 'excluded' || c.record.condition.status === 'not_satisfied') push('assemblies',
      c.record.disposition === 'excluded' ? 'component_explicitly_excluded' : 'component_condition_not_satisfied', subject('component', c.record.component_id, c.record.label),
      { exclusion_reason: c.record.exclusion_reason, condition: c.record.condition }, fromSpans(c.record.source_span_ids), c.record.equipment_ids, assembly.dependency_status, assembly.review_head, 'excluded');
    const quantity = basAssemblyCalculationState(workflow, captureId);
    if (assembly.components.length && quantity.status !== 'current_dependencies') push('assemblies', quantity.status === 'not_calculated' ? 'assembly_not_calculated' : 'assembly_calculation_stale_dependencies', whole,
      { status: quantity.status }, [], [], quantity.status === 'not_calculated' ? 'not_reviewed' : quantity.status, quantity.latest?.calculation_id ?? null);
    if (quantity.latest) for (const c of quantity.latest.result.components) for (const code of c.issues) push('assemblies', code,
      subject('component', c.original.component_id, c.original.label), { code, status: c.status }, fromSpans(c.original.source_span_ids), c.original.equipment_ids,
      quantity.status === 'not_calculated' ? 'not_reviewed' : quantity.status, quantity.latest.calculation_id, c.original.disposition);
    const engineering = await basEngineeringView(workflow, captureId);
    if (engineering.event) {
      push('engineering', 'engineering_requires_python_replay', whole, { event_id: engineering.event.event_id }, [], [], engineering.dependency_status, engineering.event.event_id);
      if (engineering.dependency_status === 'stale_dependencies') push('engineering', 'engineering_stale_dependencies', whole, engineering.current_heads, [], [], engineering.dependency_status, engineering.event.event_id);
    }
    for (const issue of engineering.issues) {
      const resource = engineering.register.resources.find(r => r.resource_id === issue.resource_id);
      const check = engineering.register.input.checks.find(c => c.check_id === issue.check_id);
      const target = engineering.register.targets.find(t => t.check_id === issue.check_id);
      push('engineering', issue.code, resource ? subject('resource', resource.resource_id, resource.label) : subject('check', check!.check_id, check!.kind),
        { issue, resource: resource ?? null, check: check ?? null, target: target ?? null }, fromSpans(resource?.source_span_ids ?? target?.source_span_ids ?? []),
        resource ? [resource.equipment_id] : check?.equipment_ids ?? [], engineering.dependency_status, engineering.event?.event_id ?? null, target?.disposition ?? 'not_established');
    }
    for (const check of engineering.event?.result.checks ?? []) for (const constraint of check.constraints) if (constraint.status !== 'pass') {
      const original = engineering.register.input.checks.find(c => c.check_id === check.check_id)!;
      const target = engineering.register.targets.find(t => t.check_id === check.check_id)!;
      push('engineering', `constraint_${constraint.status}`, subject('constraint', `${check.check_id}:${constraint.rule_id}`, constraint.rule_id),
        { check_id: check.check_id, constraint, original_check: original, target },
        fromSpans([...new Set([...target.source_span_ids, ...engineering.rating_sources.filter(r => r.check_id === check.check_id).flatMap(r => r.source_spans.map(s => s.span_id))])]),
        original.equipment_ids, engineering.dependency_status, engineering.event!.event_id, target.disposition);
    }
  }
  const issues = [];
  for (const item of unique(pending)) {
    const issue_key = await digest({ rule: BAS_PROJECT_ISSUE_RULE, capture_id: captureId, domain: item.domain, code: item.code, subject: { kind: item.subject.kind, id: item.subject.id } });
    issues.push({ ...item, issue_key, occurrence_id: await digest({ issue_key, finding: item.original_finding_json, evidence: item.evidence,
      equipment_ids: item.equipment_ids, dependency_status: item.dependency_status, disposition: item.disposition }) });
  }
  issues.sort((a, b) => a.issue_key < b.issue_key ? -1 : a.issue_key > b.issue_key ? 1 : 0);
  return basProjectReviewSchema.parse({ schema_version: 'bas_project_review_v1', rule_version: BAS_PROJECT_ISSUE_RULE, capture_id: captureId,
    source_status: workflow.current_capture_id === captureId ? 'active_capture' : 'historical_capture', source_availability: 'not_byte_verified',
    calculation_verification: 'saved_results_not_python_replayed', readiness: 'not_evaluated', project_complete: false, issues });
}
