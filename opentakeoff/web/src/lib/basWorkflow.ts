/** Shared BAS evidence persistence. No extraction, installed counts or approvals. */
import { z } from 'zod';
import { basPointListsSchema, type BasPointLists } from './basPointLists.ts';
import { sha256Hex } from './graphKeys.js';
import type { BasSourceDocument } from './basSources.ts';
import { basSourceContextSchema, type BasSourceContext } from './basSources.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { BAS_SEQUENCE_RULE, reconcileBasSequencePoints } from './basSequenceReconciliation.ts';
import { basReviewEventSchema } from './basReviewContract.ts';
import { basEquipmentEvidenceSchema, equipmentIdentityPayload, type BasEquipmentEvidence } from './basEquipmentEvidence.ts';
import { basEquipmentReviewEventSchema, validateBasEquipmentRegister, type BasEquipmentReviewEvent } from './basEquipmentRegister.ts';
export { canonicalBasJson } from './basCanonical.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.object({
  source_id: z.string().regex(/^sha256:[a-f0-9]{64}$/), sha256: sha,
  byte_length: z.number().int().positive().safe(), page_count: z.number().int().positive().safe(),
  names: z.array(z.string().min(1).max(4096)).min(1).max(1024),
}).strict().refine(s => s.source_id === `sha256:${s.sha256}`, 'Source digest disagrees with identity');
const capture = z.object({
  capture_id: sha, sources: z.array(source).min(1).max(10000), points: basPointListsSchema,
  narrative_sources: basSourceContextSchema.optional(),
  narrative_rule_version: z.literal(BAS_SEQUENCE_RULE).optional(),
  equipment_sources: basEquipmentEvidenceSchema.optional(),
}).strict().superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const docs = new Map(c.sources.map(s => [s.source_id, s]));
  if (docs.size !== c.sources.length) fail('Duplicate capture source');
  if (!!c.narrative_sources !== !!c.narrative_rule_version) fail('Narrative sources and rule version must be retained together');
  if (c.equipment_sources && !c.narrative_sources) fail('Equipment evidence requires its source context');
  if (c.narrative_sources) {
    const manifest = (sources: BasSourceDocument[]) => sources.map(({ names: _names, ...s }) => s).sort((a, b) => a.source_id.localeCompare(b.source_id));
    if (canonicalBasJson(manifest(c.narrative_sources.documents)) !== canonicalBasJson(manifest(c.sources))) fail('Narrative sources disagree with capture document manifest');
  }
  for (const matrix of c.points.matrices) {
    const doc = matrix.source_id ? docs.get(matrix.source_id) : undefined;
    const page = matrix.page_id?.match(/:p([1-9]\d*)$/)?.[1];
    if (!doc || !page || matrix.page_id !== `${doc.source_id}:p${page}` || Number(page) > doc.page_count) {
      fail('Point matrix is not owned by a retained source page');
    }
  }
});
export const basWorkflowSchema = z.object({
  schema_version: z.literal('bas_workflow_v1'), revision: z.enum(['point_captures_1', 'bas_evidence_2', 'bas_equipment_3']),
  captures: z.array(capture).max(1000), current_capture_id: sha.nullable(),
  review_events: z.array(basReviewEventSchema).max(10000).optional(),
  equipment_events: z.array(basEquipmentReviewEventSchema).max(10000).optional(),
}).strict().superRefine((w, ctx) => {
  const ids = new Set(w.captures.map(c => c.capture_id));
  if (ids.size !== w.captures.length || (w.current_capture_id !== null && !ids.has(w.current_capture_id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid BAS capture references' });
  }
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (w.revision === 'point_captures_1' && (w.captures.some(c => c.narrative_sources) || w.review_events)) fail('Narrative/review data requires the new workflow revision');
  if (w.revision !== 'bas_equipment_3' && w.captures.some(c => c.equipment_sources)) fail('Equipment evidence requires the equipment workflow revision');
  if (w.equipment_events && w.revision !== 'bas_equipment_3') fail('Equipment review requires the equipment workflow revision');
  const heads = new Map<string, string>(), operations = new Set<string>(), eventIds = new Set<string>();
  for (const event of w.review_events ?? []) {
    if (!ids.has(event.capture_id) || !w.captures.find(c => c.capture_id === event.capture_id)?.narrative_sources) fail('Review event has no retained narrative capture');
    if (event.expected_head !== (heads.get(event.capture_id) ?? null)) fail('Divergent or incomplete BAS review history');
    if (operations.has(event.operation_id) || eventIds.has(event.event_id)) fail('Duplicate BAS review operation/event');
    heads.set(event.capture_id, event.event_id); operations.add(event.operation_id); eventIds.add(event.event_id);
  }
  const equipmentHeads = new Map<string, string>();
  for (const event of w.equipment_events ?? []) {
    if (!w.captures.find(c => c.capture_id === event.capture_id)?.equipment_sources) fail('Equipment review has no retained equipment capture');
    if (event.expected_head !== (equipmentHeads.get(event.capture_id) ?? null)) fail('Divergent or incomplete equipment review history');
    if (operations.has(event.operation_id) || eventIds.has(event.event_id)) fail('Duplicate BAS review operation/event');
    equipmentHeads.set(event.capture_id, event.event_id); operations.add(event.operation_id); eventIds.add(event.event_id);
  }
});
export type BasWorkflow = z.infer<typeof basWorkflowSchema>;
export type BasCapture = BasWorkflow['captures'][number];

/** Replace ONLY navigation aliases, never raw source strings or local row keys. */
function identityPayload(c: Omit<BasCapture, 'capture_id'>) {
  const points = structuredClone(c.points);
  for (const m of points.matrices) {
    m.raw.sheet = m.page_id!;
    const remap = (s: { sheet_key: string; page_id: string | null }) => { s.sheet_key = s.page_id!; };
    m.header_sources.forEach(remap);
    m.notes.forEach(n => remap(n.source));
    m.rows.forEach(r => { r.observations.forEach(o => remap(o.source)); r.qualifiers.forEach(n => remap(n.source)); });
  }
  const narratives = c.narrative_sources ? {
    narrative_rule_version: c.narrative_rule_version,
    narrative_sources: { ...c.narrative_sources,
      documents: c.narrative_sources.documents.map(({ names: _names, ...s }) => s),
      pages: c.narrative_sources.pages.map(p => ({ ...p, sheet_keys: [p.page_id] })),
    },
  } : {};
  return { sources: c.sources.map(({ names: _names, ...s }) => s).sort((a, b) => a.source_id < b.source_id ? -1 : 1), points, ...narratives,
    ...(c.equipment_sources ? { equipment_sources: equipmentIdentityPayload(c.equipment_sources, c.narrative_sources!) } : {}) };
}
const fingerprint = (c: Omit<BasCapture, 'capture_id'>) => sha256Hex(new TextEncoder().encode(canonicalBasJson(identityPayload(c))));

export async function captureBasPoints(sources: BasSourceDocument[], points: BasPointLists): Promise<BasWorkflow> {
  const checked = capture.parse({ capture_id: '0'.repeat(64), sources, points });
  checked.capture_id = await fingerprint(checked);
  return { schema_version: 'bas_workflow_v1', revision: 'point_captures_1', captures: [checked], current_capture_id: checked.capture_id };
}

export async function captureBasEvidence(sources: BasSourceContext, points: BasPointLists, equipment?: BasEquipmentEvidence): Promise<BasWorkflow> {
  const checked = capture.parse({ capture_id: '0'.repeat(64), sources: sources.documents, points,
    narrative_sources: sources, narrative_rule_version: BAS_SEQUENCE_RULE,
    ...(equipment ? { equipment_sources: equipment } : {}) });
  checked.capture_id = await fingerprint(checked);
  return { schema_version: 'bas_workflow_v1', revision: equipment ? 'bas_equipment_3' : 'bas_evidence_2', captures: [checked], current_capture_id: checked.capture_id };
}

export const basEventFingerprint = (event: Omit<z.infer<typeof basReviewEventSchema>, 'event_id'> | Omit<BasEquipmentReviewEvent, 'event_id'>) =>
  sha256Hex(new TextEncoder().encode(canonicalBasJson(event)));

export async function verifyBasWorkflow(raw: unknown): Promise<BasWorkflow> {
  const result = basWorkflowSchema.parse(raw);
  for (const c of result.captures) if (await fingerprint(c) !== c.capture_id) throw new Error('BAS capture fingerprint mismatch; saved evidence was changed');
  const pairs = new Map<string, Set<string>>();
  for (const event of result.review_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS review event fingerprint mismatch');
    const c = result.captures.find(c => c.capture_id === event.capture_id)!;
    const linked = pairs.get(event.capture_id) ?? new Set<string>();
    const a = event.action;
    const pair = JSON.stringify(a.kind === 'upsert' ? [a.association.region_id, a.association.matrix_id] : [a.region_id, a.matrix_id]);
    if (a.kind === 'upsert') {
      await reconcileBasSequencePoints(c.narrative_sources!, c.points, [{ ...a.association, review_origin: event.origin }]);
      linked.add(pair);
    } else if (!linked.delete(pair)) throw new Error('BAS review removes an association that does not exist');
    pairs.set(event.capture_id, linked);
  }
  for (const event of result.equipment_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS equipment event fingerprint mismatch');
    const c = result.captures.find(c => c.capture_id === event.capture_id)!;
    await validateBasEquipmentRegister(c.narrative_sources!, c.equipment_sources!, c.points, event.register);
  }
  return result;
}

/** Synchronous structure/merge gate; callers verify fingerprints before use. */
export function mergeBasWorkflows(current: unknown, incoming: unknown, activateIncoming = false): BasWorkflow | null {
  const left = current == null ? null : basWorkflowSchema.parse(current);
  const right = incoming == null ? null : basWorkflowSchema.parse(incoming);
  if (!left) return right;
  if (!right) return left;
  const merged = new Map(left.captures.map(c => [c.capture_id, c]));
  for (const c of right.captures) {
    const old = merged.get(c.capture_id);
    if (old && canonicalBasJson(identityPayload(old)) !== canonicalBasJson(identityPayload(c))) throw new Error('Conflicting BAS evidence for one capture identity');
    if (!old) merged.set(c.capture_id, c);
  }
  const events = new Map((left.review_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.review_events ?? []) {
    const previous = events.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting BAS review event identity');
    events.set(event.event_id, event);
  }
  const equipmentEvents = new Map((left.equipment_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.equipment_events ?? []) {
    const previous = equipmentEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting equipment event identity');
    equipmentEvents.set(event.event_id, event);
  }
  return basWorkflowSchema.parse({ ...left, captures: [...merged.values()],
    revision: left.revision === 'bas_equipment_3' || right.revision === 'bas_equipment_3' ? 'bas_equipment_3'
      : left.revision === 'bas_evidence_2' || right.revision === 'bas_evidence_2' ? 'bas_evidence_2' : 'point_captures_1',
    ...(events.size || left.review_events || right.review_events ? { review_events: [...events.values()] } : {}),
    ...(equipmentEvents.size || left.equipment_events || right.equipment_events ? { equipment_events: [...equipmentEvents.values()] } : {}),
    current_capture_id: activateIncoming ? right.current_capture_id : left.current_capture_id ?? right.current_capture_id });
}

export function activeBasCapture(workflow: BasWorkflow | null | undefined) {
  return workflow?.captures.find(c => c.capture_id === workflow.current_capture_id) ?? null;
}

/** Byte-bound source navigation shared by browser and headless consumers.
 * Inputs must describe actual loaded bytes, not filename metadata supplied by an import. */
export function resolveBasPage(pageId: string, loaded: Array<{ name: string; sha256: string }>): string | null {
  const match = /^sha256:([a-f0-9]{64}):p([1-9]\d*)$/.exec(pageId);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  const names = loaded.filter(d => d.sha256 === match[1]).map(d => d.name).sort();
  return names.length ? `${names[0]}${match[2] === '1' ? '' : `#${match[2]}`}` : null;
}
