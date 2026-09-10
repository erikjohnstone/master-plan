/** Bounded delivery only; the shared revision service remains the authority. */
import { z } from 'zod';
import { basRevisionOperationSchema } from './basRevisionOperations.ts';
const count = z.number().int().nonnegative().safe(), sha = z.string().regex(/^[a-f0-9]{64}$/);
const scalar = z.union([z.string().max(256), z.number().finite(), z.boolean(), z.null()]);
export const basRevisionViewQuerySchema = z.object({
  path: z.array(z.union([z.string().max(4096), count])).max(32).default([]),
  offset: count.default(0), limit: z.number().int().min(1).max(50).default(25),
  string_offset: count.default(0), string_limit: z.number().int().min(1).max(16384).default(4096),
}).strict();
export const basRevisionTransportCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect'), source_set_id: sha.optional(), query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('run'), operation: basRevisionOperationSchema, query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('read'), view_id: z.string().uuid(), query: basRevisionViewQuerySchema.optional() }).strict(),
  z.object({ action: z.literal('export'), view_id: z.string().uuid(), path: z.string().min(1), overwrite: z.boolean().optional() }).strict(),
]);
const nodeType = z.enum(['object', 'array', 'string', 'number', 'boolean', 'null']);
export const basRevisionViewPageSchema = z.object({ path: basRevisionViewQuerySchema.shape.path, type: nodeType,
  total: count, offset: count, limit: count, string_offset: count, string_length: count, string_fragment: z.string().max(16384).nullable(),
  scalar: scalar.nullable(), entries: z.array(z.object({ key: z.union([z.string(), count]), type: nodeType,
    size: count, scalar_preview: scalar, preview_truncated: z.boolean(), summary: z.record(scalar) }).strict()).max(50),
  paging_units: z.literal('container_entries_or_utf16_string_units'),
}).strict();
export const basRevisionTransportResultSchema = z.object({ action: z.enum(['inspect', 'run', 'read', 'export']),
  view_id: z.string().uuid(), result_fingerprint: sha, encoded_bytes: count, expires_at: z.string().datetime(),
  operation: z.enum(['inspect', 'inventory', 'compare', 'record', 'read']),
  event_id: sha.nullable(), expected_head: sha.nullable(), expected_report_fingerprint: sha.nullable(),
  report_verification: z.enum(['inspection_only', 'not_replayed_inventory', 'completed_preview', 'matches_saved_report', 'different_from_saved_report']),
  page: basRevisionViewPageSchema.nullable(), exported_path: z.string().nullable(),
  approved: z.literal(false), persistence: z.literal('session_only_until_export'),
  read_semantics: z.literal('cached_completed_operation_not_a_new_replay'),
}).strict();
