/** Shared immutable selection for revision comparison. No floating "latest",
 * source rebinding, calculation, extraction or approval. */
import { z } from 'zod';
import { verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { replayBasDrawingHistory, type BasDrawingSourceSet } from './basDrawingRevision.ts';

export const BAS_REVISION_INVENTORY_RULE = 'bas_revision_inventory_1' as const;
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

function sourceSet(workflow: BasWorkflow, id: string): BasDrawingSourceSet {
  const set = replayBasDrawingHistory(workflow.captures, workflow.drawing_events).source_sets.get(id);
  if (!set) throw new Error('Revision comparison requires a retained complete source set');
  return set;
}

/** Caller must first verify workflow integrity. Output is resolved IDs, never
 * an instruction to choose newer records when the comparison is reopened. */
export function defaultBasRevisionBasis(workflow: BasWorkflow, sourceSetId: string): BasRevisionBasis {
  const set = sourceSet(workflow, sourceSetId);
  return basRevisionBasisSchema.parse({ schema_version: 'bas_revision_basis_v1', source_set_id: sourceSetId,
    captures: [...new Set(set.pages.map(p => p.capture_id))].map(capture_id => {
      const last = <T extends { capture_id: string; event_id: string }>(events: T[] | undefined) =>
        events?.filter(e => e.capture_id === capture_id).at(-1)?.event_id ?? null;
      const sequence_head = last(workflow.review_events), equipment_head = last(workflow.equipment_events);
      const assembly_head = last(workflow.assembly_events), engineering_head = last(workflow.engineering_events);
      const assigned = workflow.assignment_calculations?.filter(c => c.result.capture_id === capture_id) ?? [];
      const assembled = workflow.assembly_calculations?.filter(c => c.result.capture_id === capture_id) ?? [];
      return { capture_id, sequence_head, equipment_head, assembly_head, engineering_head,
        assignment_calculation_id: (assigned.filter(c => c.result.equipment_head === equipment_head).at(-1) ?? assigned.at(-1))?.calculation_id ?? null,
        assembly_calculation_id: (assembled.filter(c => c.result.equipment_head === equipment_head && c.result.assembly_head === assembly_head).at(-1)
          ?? assembled.at(-1))?.calculation_id ?? null };
    }) });
}

export async function prepareBasRevisionBasis(raw: unknown, sourceSetId: string): Promise<BasRevisionBasis> {
  const id = sha.parse(sourceSetId), workflow = await verifyBasWorkflow(raw);
  return defaultBasRevisionBasis(workflow, id);
}

/** Retained event ownership, not approval/freshness or Python replay. A mixed
 * selection remains inspectable but its stale dependencies are explicit. */
export function selectBasRevisionState(workflow: BasWorkflow, rawBasis: unknown) {
  const basis = basRevisionBasisSchema.parse(rawBasis), set = sourceSet(workflow, basis.source_set_id);
  const ids = new Set(set.pages.map(p => p.capture_id));
  if (basis.captures.length !== ids.size || basis.captures.some(c => !ids.has(c.capture_id))) {
    throw new Error('Revision basis must select exactly the captures used by its source set');
  }
  const defaults = defaultBasRevisionBasis(workflow, set.source_set_id);
  const states = basis.captures.map(heads => {
    const capture = workflow.captures.find(c => c.capture_id === heads.capture_id)!;
    const event = <T extends { capture_id: string; event_id: string }>(events: T[] | undefined, id: string | null) => {
      if (id === null) return null;
      const found = events?.find(e => e.event_id === id && e.capture_id === capture.capture_id);
      if (!found) throw new Error('Revision basis selects an unowned review event');
      return found;
    };
    const calculation = <T extends { calculation_id: string; result: { capture_id: string } }>(records: T[] | undefined, id: string | null) => {
      if (id === null) return null;
      const found = records?.find(c => c.calculation_id === id && c.result.capture_id === capture.capture_id);
      if (!found) throw new Error('Revision basis selects an unowned calculation record');
      return found;
    };
    const sequence = event(workflow.review_events, heads.sequence_head);
    const equipment = event(workflow.equipment_events, heads.equipment_head);
    const assembly = event(workflow.assembly_events, heads.assembly_head);
    const engineering = event(workflow.engineering_events, heads.engineering_head);
    const assigned = calculation(workflow.assignment_calculations, heads.assignment_calculation_id);
    const assembled = calculation(workflow.assembly_calculations, heads.assembly_calculation_id);
    const sequenceHistory = [];
    if (sequence) for (const e of workflow.review_events ?? []) {
      if (e.capture_id !== capture.capture_id) continue;
      sequenceHistory.push(e); if (e.event_id === sequence.event_id) break;
    }
    const status = (exists: unknown, matches: boolean) => !exists ? 'not_selected' as const
      : matches ? 'pinned_dependencies_match' as const : 'pinned_dependencies_differ' as const;
    return { heads, capture, sequenceHistory, equipment, assembly, engineering, assigned, assembled,
      selection_status: canonicalBasJson(heads) === canonicalBasJson(defaults.captures.find(c => c.capture_id === heads.capture_id))
        ? 'current_selection' as const : 'historical_selection' as const,
      dependency_status: {
        assembly: status(assembly, assembly?.expected_equipment_head === heads.equipment_head),
        engineering: status(engineering, engineering?.expected_equipment_head === heads.equipment_head
          && engineering?.expected_assembly_head === heads.assembly_head && engineering?.expected_sequence_head === heads.sequence_head),
        assigned: status(assigned, assigned?.result.equipment_head === heads.equipment_head),
        assembled: status(assembled, assembled?.result.equipment_head === heads.equipment_head && assembled?.result.assembly_head === heads.assembly_head),
      } };
  });
  return { basis, source_set: set, states };
}

export async function readBasRevisionState(raw: unknown, rawBasis: unknown) {
  const basis = basRevisionBasisSchema.parse(rawBasis), workflow = await verifyBasWorkflow(raw);
  return selectBasRevisionState(workflow, basis);
}
