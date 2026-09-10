/** SHOULD THIS BE ON THE SHARED PATH? Yes. Exact claim/dependency selection is
 * shared truth. This compiler neither changes quantities nor grants approval. */
import { verifyBasWorkflow } from './basWorkflow.ts';
import { inventoryForVerifiedBasRevision } from './basRevisionInventory.ts';
import type { BasRevisionItem } from './basRevisionInventoryContract.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { BAS_DELIVERABLE_SCOPE_RULE, assertBasScopeSize, basDeliverableScopeSpecSchema,
  basDeliverableScopeSchema, basDeliverableTargetKey, type BasDeliverableScope, type BasDeliverableTarget } from './basDeliverableScopeContract.ts';
export * from './basDeliverableScopeContract.ts';

const rootKinds: Record<BasDeliverableTarget['claim'], BasRevisionItem['kind']> = {
  scheduled_equipment: 'equipment', assigned_points: 'assignment', assembly_components: 'assembly_component',
  responsibilities: 'assembly_component', engineering_compatibility: 'engineering_check',
};
const key = (capture: string, kind: string, subject: string) => canonicalBasJson([capture, kind, subject]);
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sortTargets = (a: BasDeliverableTarget, b: BasDeliverableTarget) => lexical(basDeliverableTargetKey(a), basDeliverableTargetKey(b));
type Diagnostic = BasDeliverableScope['claims'][number]['diagnostics'][number];

/** Own both request and workflow before any asynchronous work. Input item arrays,
 * hashes, computed numbers, statuses or source quotes are never authoritative. */
export async function buildBasDeliverableScope(raw: unknown, rawSpecification: unknown, signal?: AbortSignal): Promise<BasDeliverableScope> {
  const specification = basDeliverableScopeSpecSchema.parse(rawSpecification);
  specification.included.sort(sortTargets);
  specification.excluded.sort((a, b) => sortTargets(a.target, b.target));
  specification.excluded.forEach(e => e.evidence.sort((a, b) => lexical(canonicalBasJson(a), canonicalBasJson(b))));
  signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); signal?.throwIfAborted();
  const inventory = await inventoryForVerifiedBasRevision(workflow, specification.basis, signal);
  const items = new Map(inventory.items.map(i => [i.item_id, i]));
  const lookup = new Map(inventory.items.map(i => [key(i.capture_id, i.kind, i.subject_id), i]));
  const resolve = (t: BasDeliverableTarget) => {
    const item = lookup.get(key(t.capture_id, rootKinds[t.claim], t.subject_id));
    if (!item) throw new Error('Deliverable target is not owned by the selected capture/basis');
    return item;
  };
  specification.included.forEach(resolve); specification.excluded.forEach(e => resolve(e.target));
  const forward = new Map<string, Set<string>>(), children = new Map<string, Set<string>>();
  const sharedChecks = new Map<string, Set<string>>(), problems = new Map<string, Diagnostic[]>();
  let edges = 0, memberships = 0;
  const connect = (map: Map<string, Set<string>>, a: string, b: string) => {
    const set = map.get(a) ?? new Set<string>();
    if (!set.has(b)) { assertBasScopeSize(++edges, memberships, 0); set.add(b); map.set(a, set); }
  };
  const problem = (item_id: string, code: Diagnostic['code']) => {
    const list = problems.get(item_id) ?? [];
    if (!list.some(p => p.code === code)) list.push({ item_id, code });
    problems.set(item_id, list);
  };
  for (const i of inventory.items) {
    signal?.throwIfAborted();
    for (const r of i.references) {
      const target = lookup.get(key(i.capture_id, r.kind, r.subject_id));
      if (!target) { problem(i.item_id, 'pinned_dependency_unavailable'); continue; }
      if (target.source_event_id !== r.source_event_id) problem(i.item_id, 'pinned_dependency_changed');
      // A selected record is retained alongside the item's original pinned
      // evidence. A changed head is a diagnostic, never a claim of substitution.
      connect(forward, i.item_id, target.item_id);
      if ((i.kind === 'point_row' && r.relation === 'matrix')
        || (i.kind === 'sequence_clause' && r.relation === 'region')
        || (i.kind === 'sequence_requirement' && r.relation === 'clause')
        || (i.kind === 'assigned_observation' && r.relation === 'assignment')
        || (i.kind === 'assembly_quantity' && r.relation === 'component')
        || (i.kind === 'responsibility_claim' && r.relation === 'component')
        || (i.kind === 'responsibility_resolution' && r.relation === 'component')
        || (i.kind === 'sequence_link' && (r.relation === 'matrix' || r.relation === 'region'))) connect(children, target.item_id, i.item_id);
      if (i.kind === 'engineering_check' && r.kind === 'engineering_resource' && r.relation === 'resource') connect(sharedChecks, target.item_id, i.item_id);
    }
    if (i.source_scope === 'outside' || i.source_scope === 'crosses_boundary') problem(i.item_id, 'source_outside_scope');
    if (i.source_scope === 'unlocated') problem(i.item_id, 'source_unlocated');
    if (i.dependency_status === 'pinned_dependencies_differ') problem(i.item_id, 'saved_dependencies_stale');
    if (i.kind === 'engineering_check' || i.quantities.some(q => q.status === 'saved_result_requires_python_replay')) problem(i.item_id, 'python_replay_required');
  }
  const capturePages = new Map(workflow.captures.map(c => [c.capture_id, new Map(c.narrative_sources?.pages.map(p => [p.page_id, p]))]));
  const exclusions: BasDeliverableScope['exclusions'] = specification.excluded.map(e => ({ ...e,
    root_item_id: resolve(e.target).item_id, source_refs: e.evidence.map(c => {
      const pageItem = lookup.get(key(c.capture_id, 'drawing_page', c.page_id));
      if (!pageItem) throw new Error('Exclusion citation is not owned by the selected capture/basis');
      if (c.span_id === null) return { capture_id: c.capture_id, ...pageItem.source_refs[0] };
      const span = capturePages.get(c.capture_id)?.get(c.page_id)?.spans.find(s => s.span_id === c.span_id);
      if (!span) throw new Error('Exclusion citation is not owned by its exact page');
      return { capture_id: c.capture_id, page_id: c.page_id, span_id: span.span_id, text: span.text, bbox_px: [...span.bbox_px] as typeof span.bbox_px };
    }), dependency_of: [], effect: 'claim_omitted_prerequisites_retained',
  }));
  const allSelected = new Set<string>(), claims: BasDeliverableScope['claims'] = [];
  for (const target of specification.included) {
    signal?.throwIfAborted();
    const root = resolve(target), seen = new Set<string>(), queued = new Set([root.item_id]), queue = [root.item_id];
    const enqueue = (id: string) => { if (!queued.has(id)) { queued.add(id); queue.push(id); } };
    for (let n = 0; n < queue.length; n++) {
      signal?.throwIfAborted();
      const id = queue[n]; if (seen.has(id)) continue;
      assertBasScopeSize(edges, ++memberships, 0); seen.add(id); allSelected.add(id);
      const item = items.get(id)!;
      for (const to of forward.get(id) ?? []) enqueue(to);
      for (const to of children.get(id) ?? []) {
        const child = items.get(to)!;
        if ((item.kind === 'point_matrix' && child.kind === 'point_row')
          || (item.kind === 'sequence_region' && child.kind === 'sequence_clause')
          || (item.kind === 'sequence_clause' && child.kind === 'sequence_requirement')
          || (target.claim === 'assigned_points' && ['sequence_link', 'assigned_observation'].includes(child.kind))
          || (target.claim === 'assembly_components' && child.kind === 'assembly_quantity')
          || (target.claim === 'responsibilities' && ['responsibility_claim', 'responsibility_resolution'].includes(child.kind))) {
          enqueue(to);
        }
      }
      if (target.claim === 'engineering_compatibility' && item.kind === 'engineering_resource') {
        for (const to of sharedChecks.get(id) ?? []) enqueue(to);
      }
    }
    const dependency_item_ids = [...seen].sort(lexical);
    const diagnostics = dependency_item_ids.flatMap(id => problems.get(id) ?? []);
    if ((target.claim === 'assigned_points' || target.claim === 'assembly_components')
      && ![...(children.get(root.item_id) ?? [])].some(id => items.get(id)!.kind === (target.claim === 'assigned_points' ? 'assigned_observation' : 'assembly_quantity'))) {
      const heads = specification.basis.captures.find(c => c.capture_id === target.capture_id)!;
      const savedAssignment = target.claim === 'assigned_points' && workflow.assignment_calculations
        ?.find(c => c.calculation_id === heads.assignment_calculation_id)?.result.assignments
        .some(a => a.assignment.assignment_id === target.subject_id);
      diagnostics.push({ code: savedAssignment ? 'empty_saved_quantity' : 'missing_saved_quantity', item_id: root.item_id });
    }
    const relevantExclusions = exclusions.filter(e => seen.has(e.root_item_id));
    for (const e of relevantExclusions) e.dependency_of.push(target);
    const dependency_fingerprint = await sha256Hex(new TextEncoder().encode(canonicalBasJson({
      rule: BAS_DELIVERABLE_SCOPE_RULE, inventory_rule: inventory.rule_version, target,
      items: dependency_item_ids.map(id => { const i = items.get(id)!; return [id, i.content_fingerprint, i.source_scope]; }),
      exclusions: relevantExclusions.map(({ dependency_of: _consumers, ...e }) => e),
    })));
    claims.push({ target, root_item_id: root.item_id, dependency_item_ids, dependency_fingerprint,
      diagnostics: diagnostics.sort((a, b) => lexical(canonicalBasJson(a), canonicalBasJson(b))) });
  }
  const projection = { schema_version: 'bas_deliverable_scope_v1' as const, rule_version: BAS_DELIVERABLE_SCOPE_RULE,
    specification, claims, exclusions, unselected_item_ids: inventory.items.map(i => i.item_id).filter(id => !allSelected.has(id)).sort(lexical),
    status: 'preview_only' as const, coverage_verification: 'not_reviewed' as const, issue_verification: 'not_evaluated' as const,
    source_bytes: 'not_verified' as const, calculation_verification: 'saved_results_not_python_replayed' as const,
    approved: false as const, project_complete: false as const, installed_quantity: null,
  };
  signal?.throwIfAborted();
  assertBasScopeSize(edges, memberships, new TextEncoder().encode(canonicalBasJson(projection)).byteLength);
  return basDeliverableScopeSchema.parse({ ...projection, inventory });
}
