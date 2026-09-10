/** One shared correspondence/declared-field/quantity-comparability authority.
 * No extraction, numeric deltas, approvals or workflow writes occur here. */
import { z } from 'zod';
import { verifyBasWorkflow } from './basWorkflow.ts';
import { basRevisionBasisSchema } from './basRevisionBasis.ts';
import { basRevisionItemSchema, inventoryForVerifiedBasRevision, type BasRevisionItem, type BasRevisionInventory } from './basRevisionInventory.ts';
import { revisionDeclaredFields, revisionQuantityContext, type RevisionIdentity, type RevisionLookup } from './basRevisionFields.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { basPointListsSchema } from './basPointLists.ts';

export const BAS_REVISION_COMPARISON_RULE = 'bas_revision_comparison_1' as const;
export const BAS_REVISION_REPORT_BYTES = 64 * 1024 * 1024;
const sha = z.string().regex(/^[a-f0-9]{64}$/), reason = z.string().trim().min(1).max(4096), id = z.string().min(1).max(4096);
const decision = z.object({ item_id: sha, reason }).strict();
export const basRevisionComparisonRequestSchema = z.object({ before: basRevisionBasisSchema, after: basRevisionBasisSchema,
  matches: z.array(z.object({ before_item_id: sha, after_item_id: sha, reason }).strict()).max(100000),
  removed: z.array(decision).max(100000), added: z.array(decision).max(100000),
  membership_reviews: z.array(z.object({ before_item_id: sha, after_item_id: sha, metric_key: id, reason }).strict()).max(100000),
}).strict();
export type BasRevisionComparisonRequest = z.infer<typeof basRevisionComparisonRequestSchema>;
const count = z.number().int().nonnegative().safe();
export const basRevisionQuantityPairSchema = z.object({ row_id: sha, metric_key: id, dimension: id, basis: id, before: count, after: count }).strict();
export type BasRevisionQuantityPair = z.infer<typeof basRevisionQuantityPairSchema>;
export const basRevisionQuantityRequestSchema = z.object({ pairs: z.array(basRevisionQuantityPairSchema).max(1000),
  point_matrices: z.array(z.object({ capture_id: sha, matrix: basPointListsSchema.innerType().shape.matrices.element }).strict()).max(1000) }).strict();
export const basRevisionQuantityResultSchema = z.object({ schema_version: z.literal('bas_revision_quantities_v1'),
  rule_version: z.literal('comparable_declared_count_deltas_1'), engine: z.literal('bas_math_v1'),
  pairs: z.array(basRevisionQuantityPairSchema.extend({ delta: z.number().int().safe() }).strict()).max(1000),
  checked_point_matrices: z.array(z.object({ capture_id: sha, matrix_id: id }).strict()).max(1000),
  installed_quantity: z.null(), approved: z.literal(false), project_complete: z.literal(false),
}).strict();
/** Wire ownership only, never a second calculator or arithmetic verification. */
export function verifyBasRevisionQuantityResult(rawInput: unknown, rawOutput: unknown) {
  const input = basRevisionQuantityRequestSchema.parse(rawInput), output = basRevisionQuantityResultSchema.parse(rawOutput);
  const originals = output.pairs.map(({ delta: _delta, ...pair }) => pair);
  if (canonicalBasJson(originals) !== canonicalBasJson(input.pairs)
    || canonicalBasJson(output.checked_point_matrices) !== canonicalBasJson(input.point_matrices.map(p => ({ capture_id: p.capture_id, matrix_id: p.matrix.matrix_id })))) {
    throw new Error('Revision quantity response omitted or changed original pairs or point matrices');
  }
  return output;
}
const quantity = basRevisionItemSchema.shape.quantities.element;
const quantityStatus = z.enum(['not_a_quantity', 'unpaired', 'unknown_value', 'source_scope_unresolved', 'stale_dependency',
  'different_measure', 'different_rules', 'membership_review_required', 'ready_for_python', 'calculated']);
const value = z.object({ present: z.boolean(), json: z.string().nullable() }).strict();
export const basRevisionComparisonRowSchema = z.object({ row_id: sha,
  before: basRevisionItemSchema.nullable(), after: basRevisionItemSchema.nullable(),
  disposition: z.enum(['matched', 'added', 'removed', 'unresolved_before', 'unresolved_after', 'outside_before', 'outside_after']),
  correspondence: z.enum(['exact_bound_identity', 'explicit_decision', 'unresolved', 'outside_scope']), reason: reason.nullable(),
  source_identity: z.enum(['same_original_references', 'different_original_references', 'unavailable', 'unpaired']),
  retained_evidence: z.enum(['equal', 'changed', 'unavailable', 'unpaired']),
  declared_fields_equal: z.boolean().nullable(), rules_equal: z.boolean().nullable(),
  saved_output_equal: z.boolean().nullable(),
  field_changes: z.array(z.object({ field: id, before: value, after: value }).strict()),
  issues: z.array(id), quantities: z.array(z.object({ metric_key: id, before: quantity.nullable(), after: quantity.nullable(),
    status: quantityStatus, delta: z.number().int().safe().nullable(), membership_review_reason: reason.nullable() }).strict()),
}).strict();
export type BasRevisionComparisonRow = z.infer<typeof basRevisionComparisonRowSchema>;
export const basRevisionComparisonSchema = z.object({ schema_version: z.literal('bas_revision_comparison_v1'),
  rule_version: z.literal(BAS_REVISION_COMPARISON_RULE), request_fingerprint: sha,
  before: basRevisionBasisSchema, after: basRevisionBasisSchema,
  rows: z.array(basRevisionComparisonRowSchema).max(200000),
  interpretation_scope: z.literal('retained_sources_and_supported_declared_fields_only'),
  discovery_complete: z.literal(false), source_bytes: z.literal('not_verified'),
  calculation_verification: z.enum(['not_replayed', 'no_selected_saved_calculations', 'selected_records_python_replayed']),
  checked_saved_records: z.array(z.object({ kind: z.enum(['assignment', 'assembly', 'engineering']), record_id: sha }).strict()).max(30000),
  checked_point_matrices: z.array(z.object({ capture_id: sha, matrix_id: id }).strict()),
  arithmetic: z.enum(['not_run', 'completed']), approved: z.literal(false), installed_quantity: z.null(),
}).strict();
export type BasRevisionComparison = z.infer<typeof basRevisionComparisonSchema>;
const same = (a: unknown, b: unknown) => canonicalBasJson(a) === canonicalBasJson(b);
const digest = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));
const key = (capture: string, kind: BasRevisionItem['kind'], subject: string) => canonicalBasJson([capture, kind, subject]);
const metricReviewKey = (before: string, after: string, metric: string) => canonicalBasJson([before, after, metric]);

export async function prepareBasRevisionComparison(raw: unknown, rawRequest: unknown, signal?: AbortSignal) {
  const request = basRevisionComparisonRequestSchema.parse(rawRequest); signal?.throwIfAborted();
  const workflow = await verifyBasWorkflow(raw); signal?.throwIfAborted();
  const before = await inventoryForVerifiedBasRevision(workflow, request.before, signal);
  const after = await inventoryForVerifiedBasRevision(workflow, request.after, signal);
  const old = new Map(before.items.map(i => [i.item_id, i])), next = new Map(after.items.map(i => [i.item_id, i]));
  type Pair = { before: BasRevisionItem | null; after: BasRevisionItem | null; disposition: BasRevisionComparisonRow['disposition'];
    correspondence: BasRevisionComparisonRow['correspondence']; reason: string | null };
  const accountedBefore = new Set<string>(), accountedAfter = new Set<string>(), pairs: Pair[] = [];
  const own = (side: 'before' | 'after', itemId: string) => {
    const inventory = side === 'before' ? old : next, accounted = side === 'before' ? accountedBefore : accountedAfter;
    const item = inventory.get(itemId);
    if (!item) throw new Error('Revision correspondence selects a foreign item');
    if (accounted.has(itemId)) throw new Error('Revision correspondence must account for each item at most once');
    if (item.source_scope === 'outside') throw new Error('Outside-set evidence cannot be included by item correspondence; select its actual source pages');
    accounted.add(itemId); return item;
  };
  for (const m of request.matches) {
    const a = own('before', m.before_item_id), b = own('after', m.after_item_id);
    if (a.kind !== b.kind) throw new Error('Revision correspondence cannot merge different item kinds');
    pairs.push({ before: a, after: b, disposition: 'matched', correspondence: 'explicit_decision', reason: m.reason });
  }
  for (const d of request.removed) pairs.push({ before: own('before', d.item_id), after: null, disposition: 'removed', correspondence: 'explicit_decision', reason: d.reason });
  for (const d of request.added) pairs.push({ before: null, after: own('after', d.item_id), disposition: 'added', correspondence: 'explicit_decision', reason: d.reason });
  for (const a of before.items) if (!accountedBefore.has(a.item_id)) {
    const b = next.get(a.item_id);
    if (b && !accountedAfter.has(b.item_id) && a.source_scope !== 'outside' && b.source_scope !== 'outside') {
      accountedBefore.add(a.item_id); accountedAfter.add(b.item_id);
      pairs.push({ before: a, after: b, disposition: 'matched', correspondence: 'exact_bound_identity', reason: null });
    }
  }
  for (const a of before.items) if (!accountedBefore.has(a.item_id)) pairs.push({ before: a, after: null,
    disposition: a.source_scope === 'outside' ? 'outside_before' : 'unresolved_before', correspondence: a.source_scope === 'outside' ? 'outside_scope' : 'unresolved', reason: null });
  for (const b of after.items) if (!accountedAfter.has(b.item_id)) pairs.push({ before: null, after: b,
    disposition: b.source_scope === 'outside' ? 'outside_after' : 'unresolved_after', correspondence: b.source_scope === 'outside' ? 'outside_scope' : 'unresolved', reason: null });
  if (pairs.length > 200000) throw new Error('Revision comparison exceeds 200,000 accounted rows');
  const mapping = { before: new Map<string, string>(), after: new Map<string, string>() };
  for (const p of pairs) if (p.before && p.after) {
    const token = `matched:${p.before.item_id}`;
    mapping.before.set(key(p.before.capture_id, p.before.kind, p.before.subject_id), token);
    mapping.after.set(key(p.after.capture_id, p.after.kind, p.after.subject_id), token);
  }
  const identity = (side: 'before' | 'after', item: BasRevisionItem): RevisionIdentity => (kind, subject) =>
    mapping[side].get(key(item.capture_id, kind, subject)) ?? `${side}:${key(item.capture_id, kind, subject)}`;
  const byReference = { before: new Map(before.items.map(i => [key(i.capture_id, i.kind, i.subject_id), i])),
    after: new Map(after.items.map(i => [key(i.capture_id, i.kind, i.subject_id), i])) };
  const lookup = (side: 'before' | 'after', item: BasRevisionItem | null): RevisionLookup => (kind, subject) =>
    item ? byReference[side].get(key(item.capture_id, kind, subject)) ?? null : null;
  const unresolved = (inventory: BasRevisionInventory) => new Set(inventory.unresolved_references.map(r => r.item_id));
  const unresolvedBefore = unresolved(before), unresolvedAfter = unresolved(after);
  const reviews = new Map<string, string>(), usedReviews = new Set<string>();
  for (const r of request.membership_reviews) {
    const k = metricReviewKey(r.before_item_id, r.after_item_id, r.metric_key);
    if (reviews.has(k)) throw new Error('Duplicate quantity membership comparison review'); reviews.set(k, r.reason);
  }
  const rows: BasRevisionComparisonRow[] = [], numericPairs: BasRevisionQuantityPair[] = [];
  for (const p of pairs) {
    signal?.throwIfAborted();
    const a = p.before, b = p.after;
    const row_id = await digest([a?.item_id ?? null, b?.item_id ?? null, p.disposition]);
    const aId = a ? identity('before', a) : null, bId = b ? identity('after', b) : null;
    const aLookup = lookup('before', a), bLookup = lookup('after', b);
    const aFields = a ? revisionDeclaredFields(a, aId!, aLookup) : {}, bFields = b ? revisionDeclaredFields(b, bId!, bLookup) : {};
    const fields = [...new Set([...Object.keys(aFields), ...Object.keys(bFields)])].sort();
    const fieldValue = (o: Record<string, unknown>, field: string) => ({ present: Object.prototype.hasOwnProperty.call(o, field),
      json: Object.prototype.hasOwnProperty.call(o, field) ? canonicalBasJson(o[field]) : null });
    const field_changes = a && b ? fields.filter(f => !same(fieldValue(aFields, f), fieldValue(bFields, f)))
      .map(field => ({ field, before: fieldValue(aFields, field), after: fieldValue(bFields, field) })) : [];
    const rules_equal = a && b ? same(a.interpretation_rules, b.interpretation_rules) : null;
    const issues: string[] = [];
    if (a && a.source_scope !== 'inside') issues.push(`before_source_scope_${a.source_scope}`);
    if (b && b.source_scope !== 'inside') issues.push(`after_source_scope_${b.source_scope}`);
    const stale = !!((a && (a.dependency_status === 'pinned_dependencies_differ' || unresolvedBefore.has(a.item_id)))
      || (b && (b.dependency_status === 'pinned_dependencies_differ' || unresolvedAfter.has(b.item_id))));
    if (stale) issues.push('selected_dependency_mismatch');
    if (rules_equal === false) issues.push('interpretation_rule_changed');
    const quantities = (item: BasRevisionItem | null, identify: RevisionIdentity | null, lookup: RevisionLookup) => {
      const result = new Map<string, { q: BasRevisionItem['quantities'][number]; context: ReturnType<typeof revisionQuantityContext> }>();
      for (const q of item?.quantities ?? []) {
        const context = revisionQuantityContext(item!, q, identify!, lookup);
        if (result.has(context.metric)) throw new Error('Ambiguous repeated quantity metric in one revision item');
        result.set(context.metric, { q, context });
      }
      return result;
    };
    const aQ = quantities(a, aId, aLookup), bQ = quantities(b, bId, bLookup), qs: BasRevisionComparisonRow['quantities'] = [];
    for (const metric_key of [...new Set([...aQ.keys(), ...bQ.keys()])].sort()) {
      const x = aQ.get(metric_key), y = bQ.get(metric_key), aq = x?.q ?? null, bq = y?.q ?? null;
      let status: z.infer<typeof quantityStatus>, membership_review_reason: string | null = null;
      if (aq?.status === 'not_a_quantity' || bq?.status === 'not_a_quantity') status = 'not_a_quantity';
      else if (!a || !b || !aq || !bq) status = 'unpaired';
      else if (aq.value === null || bq.value === null) status = 'unknown_value';
      else if (a.source_scope !== 'inside' || b.source_scope !== 'inside') status = 'source_scope_unresolved';
      else if (stale) status = 'stale_dependency';
      else if (!rules_equal) status = 'different_rules';
      else if (!same(x!.context.hard, y!.context.hard)) status = 'different_measure';
      else if (!same(x!.context.membership, y!.context.membership)) {
        const k = metricReviewKey(a.item_id, b.item_id, metric_key); membership_review_reason = reviews.get(k) ?? null;
        status = membership_review_reason ? 'ready_for_python' : 'membership_review_required';
        if (membership_review_reason) usedReviews.add(k);
      } else status = 'ready_for_python';
      if (status === 'ready_for_python') numericPairs.push({ row_id, metric_key, dimension: aq!.dimension, basis: aq!.basis, before: aq!.value!, after: bq!.value! });
      qs.push({ metric_key, before: aq, after: bq, status, delta: null, membership_review_reason });
    }
    const sourceIdentity = (item: BasRevisionItem) => item.source_refs.map(s => ({ page_id: s.page_id, span_id: s.span_id })).sort((x, y) => canonicalBasJson(x).localeCompare(canonicalBasJson(y)));
    const evidence = (item: BasRevisionItem, identify: RevisionIdentity) => item.source_refs.map(s => ({ text: s.text,
      bbox_px: s.bbox_px, page: identify('drawing_page', s.page_id) })).sort((x, y) => canonicalBasJson(x).localeCompare(canonicalBasJson(y)));
    rows.push(basRevisionComparisonRowSchema.parse({ ...p, row_id, issues, quantities: qs, field_changes, rules_equal,
      saved_output_equal: a?.kind === 'engineering_check' && b?.kind === 'engineering_check'
        ? same(JSON.parse(a.original_json).saved_result, JSON.parse(b.original_json).saved_result) : null,
      declared_fields_equal: a && b ? field_changes.length === 0 : null,
      source_identity: !a || !b ? 'unpaired' : !a.source_refs.length || !b.source_refs.length ? 'unavailable'
        : same(sourceIdentity(a), sourceIdentity(b)) ? 'same_original_references' : 'different_original_references',
      retained_evidence: !a || !b ? 'unpaired' : !a.source_refs.length || !b.source_refs.length ? 'unavailable'
        : same(evidence(a, aId!), evidence(b, bId!)) ? 'equal' : 'changed' }));
  }
  if ([...reviews.keys()].some(k => !usedReviews.has(k))) throw new Error('Membership review does not target a currently comparable membership change');
  rows.sort((a, b) => a.row_id.localeCompare(b.row_id));
  const normalizedRequest = { ...request, matches: [...request.matches].sort((a, b) => a.before_item_id.localeCompare(b.before_item_id)),
    removed: [...request.removed].sort((a, b) => a.item_id.localeCompare(b.item_id)), added: [...request.added].sort((a, b) => a.item_id.localeCompare(b.item_id)),
    membership_reviews: [...request.membership_reviews].sort((a, b) => canonicalBasJson(a).localeCompare(canonicalBasJson(b))) };
  const report = basRevisionComparisonSchema.parse({ schema_version: 'bas_revision_comparison_v1', rule_version: BAS_REVISION_COMPARISON_RULE,
    request_fingerprint: await digest(normalizedRequest), before: request.before, after: request.after, rows,
    interpretation_scope: 'retained_sources_and_supported_declared_fields_only', discovery_complete: false, source_bytes: 'not_verified',
    calculation_verification: 'not_replayed', checked_saved_records: [], checked_point_matrices: [], arithmetic: 'not_run', approved: false, installed_quantity: null });
  if (new TextEncoder().encode(canonicalBasJson(report)).byteLength > BAS_REVISION_REPORT_BYTES) throw new Error('Revision comparison exceeds the 64 MiB encoded report limit');
  signal?.throwIfAborted();
  return { workflow, request: normalizedRequest, report, numericPairs, before_inventory: before, after_inventory: after };
}
