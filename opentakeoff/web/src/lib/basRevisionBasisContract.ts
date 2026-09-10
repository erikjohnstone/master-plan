/** Shared wire-only pinned revision selectors; no Workflow imports. */
import { z } from 'zod';

export const BAS_REVISION_INVENTORY_RULE = 'bas_revision_inventory_2' as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basRevisionHeadsSchema = z.object({ capture_id: sha,
  sequence_head: sha.nullable(), equipment_head: sha.nullable(), assembly_head: sha.nullable(),
  engineering_head: sha.nullable(), assignment_calculation_id: sha.nullable(), assembly_calculation_id: sha.nullable(),
}).strict();
export const basRevisionBasisSchema = z.object({ schema_version: z.literal('bas_revision_basis_v1'),
  source_set_id: sha, captures: z.array(basRevisionHeadsSchema).max(10000),
}).strict().superRefine((b, ctx) => {
  if (new Set(b.captures.map(c => c.capture_id)).size !== b.captures.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate revision capture selection' });
  }
}).transform(b => ({ ...b, captures: [...b.captures].sort((a, c) => a.capture_id.localeCompare(c.capture_id)) }));
export type BasRevisionBasis = z.infer<typeof basRevisionBasisSchema>;
