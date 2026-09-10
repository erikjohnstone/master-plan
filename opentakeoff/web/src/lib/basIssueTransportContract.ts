/** Shared wire contract; decisions remain in basIssueReview, not transport. */
import { z } from 'zod';
import { basIssueBasisSchema, basIssueReviewRequestSchema } from './basIssueReviewContract.ts';
import { basRevisionViewQuerySchema, basRevisionViewPageSchema } from './basRevisionTransportContract.ts';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basIssueCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect'), capture_id: sha.optional(), query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('record'), request: basIssueReviewRequestSchema, query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('replay'), event_id: sha, query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('read'), view_id: z.string().uuid(), query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('export'), view_id: z.string().uuid(), path: z.string().min(1), overwrite: z.boolean().optional() }).strict(),
]);
export const basIssueTransportResultSchema = z.object({
  action: z.enum(['inspect', 'record', 'replay', 'read', 'export']), operation: z.enum(['inspect', 'record', 'replay']),
  view_id: z.string().uuid(), result_fingerprint: sha, encoded_bytes: z.number().int().nonnegative().safe(),
  expires_at: z.string().datetime(), capture_id: sha, head: sha.nullable(), basis: basIssueBasisSchema,
  event_id: sha.nullable(), verification: z.enum(['current_findings_history_lineage_only', 'shared_action_validated', 'shared_projection_replayed']),
  page: basRevisionViewPageSchema.nullable(), exported_path: z.string().nullable(),
  approved: z.literal(false), project_complete: z.literal(false), persistence: z.literal('session_only_until_export'),
  read_semantics: z.literal('cached_completed_operation_not_a_new_replay'),
}).strict();
