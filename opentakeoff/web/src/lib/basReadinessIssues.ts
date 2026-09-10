/** Shared exact-subject readiness effects. Never change an original finding,
 * infer from a tag/bbox, or use acknowledgement as a waiver. */
import type { BasProjectReview } from './basProjectReview.ts';
import type { BasDeliverableScope, BasDeliverableTarget } from './basDeliverableScopeContract.ts';
import type { BasRevisionItem } from './basRevisionInventoryContract.ts';
import type { BasReadinessPage } from './basReadinessCoverage.ts';
import { basDeliverableTargetKey } from './basDeliverableScopeContract.ts';

type Issue = BasProjectReview['issues'][number];
export type BasReadinessIssue = { capture_id: string; issue: Issue;
  effects: { target: BasDeliverableTarget; effect: 'blocking' | 'informational' | 'verified_original_bytes' | 'verified_python_replay' | 'reviewed_source_applicability' }[];
  scope: 'affects_included_claims' | 'outside_included_claims' };
const sourceAccounting = new Set(['discovery_incomplete', 'page_no_text', 'heading_only', 'segmentation_conflict',
  'unassigned_horizontal_spans', 'unsupported_spans', 'ambiguous_spans', 'uninterpreted_clause', 'partially_interpreted_clause']);
const key = (kind: string, id: string) => JSON.stringify([kind, id]);

export function evaluateBasReadinessIssues(view: BasDeliverableScope, reviews: BasProjectReview[], pages: BasReadinessPage[],
  sourcesVerified: boolean, calculationsVerified: boolean, signal?: AbortSignal): BasReadinessIssue[] {
  const items = new Map(view.inventory.items.map(i => [i.item_id, i]));
  const claims = view.claims.map(c => {
    const dependencies = c.dependency_item_ids.map(id => items.get(id)!);
    return { ...c, kinds: new Set(dependencies.map(i => i.kind)),
      subjects: new Set(dependencies.map(i => key(i.kind, i.subject_id))) };
  });
  const accounted = new Map<string, boolean>();
  for (const p of pages) {
    const id = basDeliverableTargetKey(p.target);
    accounted.set(id, (accounted.get(id) ?? true) && p.status === 'accounted');
  }
  const output: BasReadinessIssue[] = [];
  let work = 0;
  for (const review of reviews) for (const issue of review.issues) {
    signal?.throwIfAborted();
    const finding = JSON.parse(issue.original_finding_json);
    const effects: BasReadinessIssue['effects'] = [];
    for (const claim of claims) {
      signal?.throwIfAborted();
      if (++work > 250000) throw new Error('Readiness issues exceed the 250,000 claim/finding relationship limit');
      if (claim.target.capture_id !== review.capture_id) continue;
      const has = (kind: BasRevisionItem['kind'], id: unknown) => typeof id === 'string' && claim.subjects.has(key(kind, id));
      const domainApplies = issue.domain === 'sources' || issue.domain === 'sequences'
        || (issue.domain === 'points' && claim.kinds.has('point_matrix'))
        || (issue.domain === 'equipment' && claim.kinds.has('equipment'))
        || (issue.domain === 'assemblies' && claim.kinds.has('assembly_component'))
        || (issue.domain === 'engineering' && claim.kinds.has('engineering_check'));
      let relevant = false;
      if (!issue.known_code) relevant = true; // Never silently scope away a new code.
      else if (issue.domain === 'sources') relevant = true;
      else if ((issue.domain === 'sequences' && sourceAccounting.has(issue.code))
        || (issue.domain === 'points' && issue.code === 'SOURCE_DISCOVERY_COVERAGE_UNVERIFIED')) relevant = true;
      else if (issue.subject.kind === 'capture') {
        relevant = domainApplies;
        if (issue.domain === 'equipment' && ['assignment_not_calculated', 'assignment_stale_dependencies'].includes(issue.code))
          relevant = claim.kinds.has('assignment');
        if (issue.domain === 'assemblies' && ['assembly_not_calculated', 'assembly_calculation_stale_dependencies'].includes(issue.code))
          relevant = claim.target.claim === 'assembly_components' || claim.kinds.has('assembly_quantity');
      } else if (domainApplies) {
        const s = issue.subject;
        const simple: Partial<Record<typeof s.kind, BasRevisionItem['kind']>> = { matrix: 'point_matrix', point_row: 'point_row',
          occurrence: 'equipment_row', equipment: 'equipment', scope: 'scope', assignment: 'assignment', resource: 'engineering_resource', check: 'engineering_check' };
        if (simple[s.kind]) relevant = has(simple[s.kind]!, s.id);
        else if (s.kind === 'component') relevant = has('assembly_component', finding.issue?.component_id ?? s.id);
        else if (s.kind === 'constraint') relevant = has('engineering_check', finding.check_id);
        else if (s.kind === 'comparison') relevant = has('assignment', finding.assignment_id)
          || has('sequence_requirement', finding.requirement?.requirement_id) || has('point_matrix', finding.matrix_id);
        else if (s.kind === 'clause') relevant = has('sequence_clause', s.id) || has('sequence_region', s.id);
        else if (s.kind === 'page') relevant = pages.some(p => p.page_id === s.id && basDeliverableTargetKey(p.target) === basDeliverableTargetKey(claim.target));
        else relevant = true; // Unclassified relationship fails closed.
        if (s.kind === 'point_row' && typeof finding.assignment_id === 'string') relevant ||= has('assignment', finding.assignment_id);
      }
      if (issue.known_code && issue.domain === 'assemblies' && ['responsibility_unknown', 'responsibility_conflict'].includes(issue.code))
        relevant &&= claim.target.claim === 'responsibilities' || claim.kinds.has('responsibility_claim') || claim.kinds.has('responsibility_resolution');
      if (!relevant) continue;
      let effect: BasReadinessIssue['effects'][number]['effect'] = issue.severity === 'blocker' ? 'blocking' : 'informational';
      if (!issue.known_code) effect = 'blocking';
      else if (issue.domain === 'sources' && issue.code === 'source_inventory_not_byte_verified' && sourcesVerified) effect = 'verified_original_bytes';
      else if (issue.domain === 'engineering' && issue.code === 'engineering_requires_python_replay' && calculationsVerified) effect = 'verified_python_replay';
      else if (((issue.domain === 'sequences' && sourceAccounting.has(issue.code))
        || (issue.domain === 'points' && issue.code === 'SOURCE_DISCOVERY_COVERAGE_UNVERIFIED'))
        && accounted.get(basDeliverableTargetKey(claim.target)) === true) effect = 'reviewed_source_applicability';
      effects.push({ target: claim.target, effect });
    }
    output.push({ capture_id: review.capture_id, issue, effects, scope: effects.length ? 'affects_included_claims' : 'outside_included_claims' });
  }
  return output;
}
