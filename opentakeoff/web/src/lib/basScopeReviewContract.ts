/** Shared scope/coverage decisions. No automatic interpretation or approval. */
import { z } from 'zod';
import { basDeliverableScopeSpecSchema, basDeliverableTargetSchema, basDeliverableTargetKey } from './basDeliverableScopeContract.ts';
import { basRevisionBasisSchema } from './basRevisionBasisContract.ts';
import { canonicalBasJson } from './basCanonical.ts';
export const BAS_SCOPE_REVIEW_RULE = 'bas_scope_review_1' as const;
export const BAS_SCOPE_JOURNAL_LIMITS = { events: 10000, bytes: 32 * 1024 * 1024 } as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(4096).regex(/\S/);
export const basCoverageUnitSchema = z.object({ capture_id: sha, page_id: id,
  span_ids: z.array(id).min(1).max(200000).nullable(),
}).strict().superRefine((u, ctx) => {
  if (u.span_ids && new Set(u.span_ids).size !== u.span_ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate coverage span' });
}).transform(u => ({ ...u, span_ids: u.span_ids ? [...u.span_ids].sort() : null }));
const coverage = z.object({ kind: z.literal('record_coverage'), scope_event_id: sha, basis: basRevisionBasisSchema,
  claim: basDeliverableTargetSchema, unit: basCoverageUnitSchema,
  assessment: z.enum(['applicable_mapped', 'not_applicable', 'unresolved']),
  mapped_item_ids: z.array(sha).max(2000), inspected_source: z.literal(true),
}).strict();
export const basScopeReviewActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save_scope'), specification: basDeliverableScopeSpecSchema, previous_scope_event_id: sha.nullable() }).strict(),
  z.object({ kind: z.literal('withdraw_scope'), scope_event_id: sha }).strict(), coverage,
  z.object({ kind: z.literal('withdraw_coverage'), coverage_event_id: sha }).strict(),
]).superRefine((a, ctx) => {
  if (a.kind !== 'record_coverage') return;
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (a.unit.capture_id !== a.claim.capture_id) fail('Coverage unit and claim must share their retained capture');
  if ((a.assessment === 'applicable_mapped') !== (a.mapped_item_ids.length > 0)) fail('Only applicable coverage requires owned item mappings');
  if (new Set(a.mapped_item_ids).size !== a.mapped_item_ids.length) fail('Duplicate coverage mapping');
}).transform(a => a.kind === 'record_coverage' ? { ...a, mapped_item_ids: [...a.mapped_item_ids].sort() } : a);
export const basScopeReviewRequestSchema = z.object({ operation_id: z.string().uuid(), expected_head: sha.nullable(),
  reviewer: z.string().trim().min(1).max(256), reason: z.string().trim().min(1).max(4096), action: basScopeReviewActionSchema,
}).strict();
export const basScopeReviewEventSchema = basScopeReviewRequestSchema.extend({ event_id: sha, scope_id: z.string().uuid(),
  rule_version: z.literal(BAS_SCOPE_REVIEW_RULE), origin: z.enum(['operator_input', 'agent_proposal']), created_at: z.string().datetime(),
  reviewer_identity: z.literal('self_declared'), approved: z.literal(false), result_fingerprint: sha.nullable(),
}).superRefine((e, ctx) => {
  if ((e.action.kind === 'save_scope' || e.action.kind === 'record_coverage') !== (e.result_fingerprint !== null))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Saved scope/coverage requires its replay fingerprint; withdrawals cannot assert one' });
});
export type BasScopeReviewEvent = z.infer<typeof basScopeReviewEventSchema>;
export type BasScopeReviewRequest = z.infer<typeof basScopeReviewRequestSchema>;
export type BasCoverageAction = Extract<BasScopeReviewRequest['action'], { kind: 'record_coverage' }>;
export type BasCoverageUnit = z.infer<typeof basCoverageUnitSchema>;
export const basScopeJournalSchema = z.array(basScopeReviewEventSchema).max(BAS_SCOPE_JOURNAL_LIMITS.events);
export const basCoverageSlotKey = (scopeId: string, a: BasCoverageAction) => canonicalBasJson([scopeId, basDeliverableTargetKey(a.claim), a.unit]);
export function assertBasScopeJournalBytes(n: number) {
  if (!Number.isSafeInteger(n) || n < 0 || n > BAS_SCOPE_JOURNAL_LIMITS.bytes) throw new Error('BAS scope journal exceeds its 32 MiB encoded limit');
}
