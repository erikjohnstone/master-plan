/** Shared wire contracts for a scope preview, not approval or quantity math. */
import { z } from 'zod';
import { basRevisionBasisSchema } from './basRevisionBasisContract.ts';
import { basRevisionInventorySchema, basRevisionItemSchema } from './basRevisionInventoryContract.ts';

export const BAS_DELIVERABLE_SCOPE_RULE = 'bas_deliverable_scope_1' as const;
export const BAS_SCOPE_TARGET_LIMIT = 2000;
export const BAS_SCOPE_EDGE_LIMIT = 500000;
export const BAS_SCOPE_MEMBERSHIP_LIMIT = 250000;
export const BAS_SCOPE_PROJECTION_BYTES = 16 * 1024 * 1024;
export function assertBasScopeSize(edges: number, memberships: number, bytes: number) {
  if (![edges, memberships, bytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid deliverable scope size');
  if (edges > BAS_SCOPE_EDGE_LIMIT) throw new Error('Deliverable scope exceeds the 500,000-relationship limit');
  if (memberships > BAS_SCOPE_MEMBERSHIP_LIMIT) throw new Error('Deliverable scope exceeds the 250,000-membership limit');
  if (bytes > BAS_SCOPE_PROJECTION_BYTES) throw new Error('Deliverable scope exceeds the 16 MiB projection limit');
}
const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(4096).regex(/\S/);
const reason = z.string().min(1).max(4096).regex(/\S/);
export const BAS_DELIVERABLE_CLAIMS = ['scheduled_equipment', 'assigned_points', 'assembly_components',
  'responsibilities', 'engineering_compatibility'] as const;
export const basDeliverableTargetSchema = z.object({ claim: z.enum(BAS_DELIVERABLE_CLAIMS), capture_id: sha, subject_id: id }).strict();
export type BasDeliverableTarget = z.infer<typeof basDeliverableTargetSchema>;
export const basDeliverableTargetKey = (t: BasDeliverableTarget) => JSON.stringify([t.capture_id, t.claim, t.subject_id]);
const citation = z.object({ capture_id: sha, page_id: id, span_id: id.nullable() }).strict();
const exclusion = z.object({ target: basDeliverableTargetSchema, reason, consequence: reason,
  evidence: z.array(citation).min(1).max(200) }).strict();
export const basDeliverableScopeSpecSchema = z.object({ schema_version: z.literal('bas_deliverable_scope_spec_v1'),
  scope_id: z.string().uuid(), name: z.string().min(1).max(256).regex(/\S/), reason,
  basis: basRevisionBasisSchema, included: z.array(basDeliverableTargetSchema).min(1).max(BAS_SCOPE_TARGET_LIMIT),
  excluded: z.array(exclusion).max(BAS_SCOPE_TARGET_LIMIT),
}).strict().superRefine((s, ctx) => {
  const targets = [...s.included, ...s.excluded.map(e => e.target)].map(basDeliverableTargetKey);
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (targets.length > BAS_SCOPE_TARGET_LIMIT) fail('Deliverable scope exceeds the 2,000-target limit');
  if (new Set(targets).size !== targets.length) fail('Duplicate or both included and excluded deliverable target');
  for (const e of s.excluded) if (new Set(e.evidence.map(c => JSON.stringify(c))).size !== e.evidence.length) fail('Duplicate exclusion citation');
});
export type BasDeliverableScopeSpec = z.infer<typeof basDeliverableScopeSpecSchema>;
const diagnostic = z.object({ code: z.enum(['source_outside_scope', 'source_unlocated', 'pinned_dependency_unavailable',
  'pinned_dependency_changed', 'saved_dependencies_stale', 'missing_saved_quantity', 'empty_saved_quantity', 'python_replay_required']),
  item_id: sha }).strict();
const scopeProjectionFields = z.object({ schema_version: z.literal('bas_deliverable_scope_v1'),
  rule_version: z.literal(BAS_DELIVERABLE_SCOPE_RULE), specification: basDeliverableScopeSpecSchema,
  claims: z.array(z.object({ target: basDeliverableTargetSchema, root_item_id: sha,
    dependency_item_ids: z.array(sha).max(BAS_SCOPE_MEMBERSHIP_LIMIT), dependency_fingerprint: sha,
    diagnostics: z.array(diagnostic).max(BAS_SCOPE_MEMBERSHIP_LIMIT) }).strict()).max(BAS_SCOPE_TARGET_LIMIT),
  exclusions: z.array(exclusion.extend({ root_item_id: sha,
    source_refs: z.array(basRevisionItemSchema.shape.source_refs.element.extend({ capture_id: sha }).strict()).max(200),
    dependency_of: z.array(basDeliverableTargetSchema).max(BAS_SCOPE_TARGET_LIMIT),
    effect: z.literal('claim_omitted_prerequisites_retained'),
  }).strict()).max(BAS_SCOPE_TARGET_LIMIT),
  unselected_item_ids: z.array(sha).max(100000),
  status: z.literal('preview_only'), coverage_verification: z.literal('not_reviewed'),
  issue_verification: z.literal('not_evaluated'), source_bytes: z.literal('not_verified'),
  calculation_verification: z.literal('saved_results_not_python_replayed'),
  approved: z.literal(false), project_complete: z.literal(false), installed_quantity: z.null(),
}).strict();
export const basDeliverableScopeProjectionSchema = scopeProjectionFields;
export const basDeliverableScopeSchema = scopeProjectionFields.extend({ inventory: basRevisionInventorySchema }).strict();
export type BasDeliverableScope = z.infer<typeof basDeliverableScopeSchema>;
