/** Shared public wire schema; interpretation and decisions stay in shared services. */
import { z } from 'zod';
import { basDeliverableScopeSpecSchema } from './basDeliverableScopeContract.ts';
import { basScopeCoveragePreparationSchema } from './basScopeCatalog.ts';
import { basScopeReviewRequestSchema } from './basScopeReviewContract.ts';
import { basRevisionViewQuerySchema, basRevisionViewPageSchema } from './basRevisionTransportContract.ts';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const query = basRevisionViewQuerySchema.optional();
export const basScopeCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('catalog'), source_set_id: sha.optional(), query }).strict(),
  z.object({ action: z.literal('preview'), specification: basDeliverableScopeSpecSchema, query }).strict(),
  z.object({ action: z.literal('prepare_coverage'), request: basScopeCoveragePreparationSchema, query }).strict(),
  z.object({ action: z.literal('record'), request: basScopeReviewRequestSchema, query }).strict(),
  z.object({ action: z.literal('replay'), event_id: sha, query }).strict(),
  z.object({ action: z.literal('read'), view_id: z.string().uuid(), query }).strict(),
  z.object({ action: z.literal('export'), view_id: z.string().uuid(), path: z.string().min(1), overwrite: z.boolean().optional() }).strict(),
]);
export const basScopeTransportResultSchema = z.object({
  action: z.enum(['catalog', 'preview', 'prepare_coverage', 'record', 'replay', 'read', 'export']),
  operation: z.enum(['catalog', 'preview', 'prepare_coverage', 'record', 'replay']),
  view_id: z.string().uuid(), result_fingerprint: sha, encoded_bytes: z.number().int().nonnegative().safe(),
  expires_at: z.string().datetime(), head: sha.nullable(), event_id: sha.nullable(),
  verification: z.enum(['retained_inventory_history_lineage_only', 'shared_scope_preview', 'source_reference_candidates_only',
    'shared_action_validated', 'shared_projection_replayed']),
  page: basRevisionViewPageSchema.nullable(), exported_path: z.string().nullable(),
  approved: z.literal(false), project_complete: z.literal(false), persistence: z.literal('session_only_until_export'),
  read_semantics: z.literal('cached_completed_operation_not_a_new_replay'),
}).strict();
