/** Shared retained-fact catalog and source-reference mapping candidates.
 * No new requirements, quantities, applicability or approval are inferred. */
import { z } from 'zod';
import { verifyBasWorkflow } from './basWorkflow.ts';
import { replayBasDrawingHistory } from './basDrawingRevision.ts';
import { defaultBasRevisionBasis } from './basRevisionBasis.ts';
import { inventoryForVerifiedBasRevision } from './basRevisionInventory.ts';
import { deliverableScopeForVerifiedWorkflow, basDeliverableScopeSpecSchema, basDeliverableTargetKey,
  type BasDeliverableTarget } from './basDeliverableScope.ts';
import { basDeliverableTargetSchema } from './basDeliverableScopeContract.ts';
import { validateBasScopeJournal } from './basScopeReviewHistory.ts';
import { basCoverageUnitSchema } from './basScopeReviewContract.ts';
import { sourceForBasScopeCoverage } from './basScopeSource.ts';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basScopeCatalogOptionsSchema = z.object({ source_set_id: sha.optional() }).strict();

export async function catalogBasScope(raw: unknown, rawOptions: unknown = {}, signal?: AbortSignal) {
  const options = basScopeCatalogOptionsSchema.parse(rawOptions); signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); signal?.throwIfAborted();
  const drawings = replayBasDrawingHistory(workflow.captures, workflow.drawing_events), journal = validateBasScopeJournal(workflow, drawings.source_sets);
  const set = options.source_set_id ? drawings.source_sets.get(options.source_set_id) : null;
  if (options.source_set_id && !set) throw new Error('Scope catalog requires an owned complete source set');
  const basis = set ? defaultBasRevisionBasis(workflow, set.source_set_id) : null;
  const inventory = basis ? await inventoryForVerifiedBasRevision(workflow, basis, signal) : null;
  const captures = new Map(workflow.captures.map(c => [c.capture_id, c]));
  const claims: Partial<Record<NonNullable<typeof inventory>['items'][number]['kind'], BasDeliverableTarget['claim'][]>> = {
    equipment: ['scheduled_equipment'], assignment: ['assigned_points'], assembly_component: ['assembly_components', 'responsibilities'],
    engineering_check: ['engineering_compatibility'],
  };
  const targets = (inventory?.items ?? []).flatMap(item => (claims[item.kind] ?? []).map(claim => ({
    target: { claim, capture_id: item.capture_id, subject_id: item.subject_id }, item_id: item.item_id, label: item.label,
    source_scope: item.source_scope, dependency_status: item.dependency_status, origin: item.origin, source_refs: item.source_refs,
    capture_label: captures.get(item.capture_id)!.sources.map(s => s.names[0]).join(' · '),
  })));
  const pages = (set?.pages ?? []).map(ref => {
    const capture = captures.get(ref.capture_id)!, page = capture.narrative_sources?.pages.find(p => p.page_id === ref.page_id);
    const document = capture.sources.find(s => ref.page_id.startsWith(`${s.source_id}:p`))!;
    return { ...ref, document_name: document.names[0], source_id: document.source_id, source_sha256: document.sha256,
      label: `Original page ${page?.page_number ?? ref.page_id.split(':p').at(-1)}`,
      text_status: page?.text_status ?? 'unavailable_legacy_capture', retained_span_count: page?.spans.length ?? 0 };
  });
  signal?.throwIfAborted();
  return { schema_version: 'bas_scope_catalog_v1' as const, head: journal.head, basis,
    source_sets: [...drawings.source_sets.values()].map(s => ({ source_set_id: s.source_set_id, name: s.name, page_count: s.pages.length, origin: s.origin })),
    scopes: [...journal.scopes.values()], history: workflow.scope_events ?? [], targets, pages,
    catalog_semantics: 'retained_inventory_roots_not_discovery_or_coverage_proof' as const,
    history_verification: 'lineage_only' as const, source_bytes: 'not_verified' as const, approved: false as const };
}
export type BasScopeCatalog = Awaited<ReturnType<typeof catalogBasScope>>;

export const basScopeCoveragePreparationSchema = z.object({ specification: basDeliverableScopeSpecSchema,
  claim: basDeliverableTargetSchema, unit: basCoverageUnitSchema,
}).strict().superRefine((r, ctx) => {
  if (r.claim.capture_id !== r.unit.capture_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Coverage claim and source unit must share their retained capture' });
});
export async function prepareBasScopeCoverage(raw: unknown, rawRequest: unknown, signal?: AbortSignal) {
  const request = basScopeCoveragePreparationSchema.parse(rawRequest); signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); signal?.throwIfAborted();
  const view = await deliverableScopeForVerifiedWorkflow(workflow, request.specification, signal);
  const claim = view.claims.find(c => basDeliverableTargetKey(c.target) === basDeliverableTargetKey(request.claim));
  if (!claim) throw new Error('Coverage preparation requires an included scope claim');
  const set = replayBasDrawingHistory(workflow.captures, workflow.drawing_events).source_sets.get(view.specification.basis.source_set_id)!;
  if (!set.pages.some(p => p.page_id === request.unit.page_id && p.capture_id === request.unit.capture_id)) throw new Error('Coverage page is outside the selected source set');
  const source = sourceForBasScopeCoverage(workflow, request.unit), wanted = new Set(claim.dependency_item_ids);
  const ids = source.unit.span_ids ? new Set(source.unit.span_ids) : null;
  const mappings = view.inventory.items.filter(i => wanted.has(i.item_id)).map(i => ({ item_id: i.item_id, label: i.label,
    kind: i.kind, source_refs: i.source_refs, origin: i.origin, content_fingerprint: i.content_fingerprint,
    suggestion: i.source_refs.some(r => r.page_id === source.unit.page_id && (!ids || (r.span_id !== null && ids.has(r.span_id))))
      ? ids ? 'same_original_span' as const : 'same_original_page' as const : null,
  }));
  signal?.throwIfAborted();
  return { schema_version: 'bas_scope_coverage_preparation_v1' as const, specification: view.specification, source, claim, mappings,
    suggestion_semantics: 'retained_source_reference_intersection_only' as const,
    assessment: null, inspected_source: false as const, approved: false as const, project_complete: false as const,
    source_bytes: 'not_verified' as const, calculation_verification: 'saved_results_not_python_replayed' as const };
}
export type BasScopeCoveragePreparation = Awaited<ReturnType<typeof prepareBasScopeCoverage>>;
