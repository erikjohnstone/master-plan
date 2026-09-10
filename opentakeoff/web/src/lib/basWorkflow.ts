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
import { basAssignmentCalculationSchema, basAssignmentCalculationFingerprint, basAssignmentInputFingerprint,
  buildBasAssignmentDemandInput, verifyBasAssignmentDemandResult } from './basAssignmentDemandContract.ts';
import { BAS_WORKFLOW_REVISIONS, atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { basAssemblyReviewEventSchema, basAssemblyInterpretationFingerprint, validateBasAssemblyRegister,
  type BasAssemblyReviewEvent } from './basAssemblyRegister.ts';
import { basAssemblyCalculationSchema, basAssemblyCalculationFingerprint, buildBasAssemblyQuantityInput,
  basAssemblyQuantityInputFingerprint, verifyBasAssemblyQuantityResult } from './basAssemblyQuantityContract.ts';
import { basEngineeringReviewEventSchema, prepareBasEngineeringRegisterValidator, type BasEngineeringReviewEvent } from './basEngineeringRegister.ts';
import { verifyBasEngineeringResult } from './basEngineeringContract.ts';
import { basDrawingEventSchema, type BasDrawingEvent } from './basDrawingContract.ts';
import { replayBasDrawingHistory, basDrawingDependencyFingerprint } from './basDrawingRevision.ts';
import { basRevisionJournalSchema, type BasRevisionReviewEvent } from './basRevisionReviewContract.ts';
import { validateBasRevisionJournal } from './basRevisionReviewHistory.ts';
import { basIssueJournalSchema, type BasIssueReviewEvent } from './basIssueReviewContract.ts';
import { validateBasIssueJournal } from './basIssueReviewHistory.ts';
import { basScopeJournalSchema, type BasScopeReviewEvent } from './basScopeReviewContract.ts';
import { validateBasScopeJournal } from './basScopeReviewHistory.ts';
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
const basWorkflowFields = z.object({
  schema_version: z.literal('bas_workflow_v1'), revision: z.enum(BAS_WORKFLOW_REVISIONS),
  captures: z.array(capture).max(1000), current_capture_id: sha.nullable(),
  review_events: z.array(basReviewEventSchema).max(10000).optional(),
  equipment_events: z.array(basEquipmentReviewEventSchema).max(10000).optional(),
  assignment_calculations: z.array(basAssignmentCalculationSchema).max(10000).optional(),
  assembly_events: z.array(basAssemblyReviewEventSchema).max(10000).optional(),
  assembly_calculations: z.array(basAssemblyCalculationSchema).max(10000).optional(),
  engineering_events: z.array(basEngineeringReviewEventSchema).max(10000).optional(),
  drawing_events: z.array(basDrawingEventSchema).max(10000).optional(),
  revision_events: basRevisionJournalSchema.optional(),
  issue_events: basIssueJournalSchema.optional(),
  scope_events: basScopeJournalSchema.optional(),
}).strict();
export const basWorkflowSchema = basWorkflowFields.superRefine(refineBasWorkflowReferences);
function refineBasWorkflowReferences(w: z.infer<typeof basWorkflowFields>, ctx: z.RefinementCtx) {
  const ids = new Set(w.captures.map(c => c.capture_id));
  if (ids.size !== w.captures.length || (w.current_capture_id !== null && !ids.has(w.current_capture_id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid BAS capture references' });
  }
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (w.revision === 'point_captures_1' && (w.captures.some(c => c.narrative_sources) || w.review_events)) fail('Narrative/review data requires the new workflow revision');
  const supports = (required: typeof BAS_WORKFLOW_REVISIONS[number]) => atLeastBasWorkflowRevision(w.revision, required) === w.revision;
  const hasEquipment = supports('bas_equipment_3');
  if (!hasEquipment && w.captures.some(c => c.equipment_sources)) fail('Equipment evidence requires the equipment workflow revision');
  if (w.equipment_events && !hasEquipment) fail('Equipment review requires the equipment workflow revision');
  if (w.assignment_calculations && !supports('bas_assignment_4')) fail('Assignment calculations require the new workflow revision');
  if (w.assembly_events && !supports('bas_assembly_5')) fail('Assembly review requires the assembly workflow revision');
  if (w.assembly_calculations && !supports('bas_assembly_5')) fail('Assembly calculations require the assembly workflow revision');
  if (w.engineering_events && !supports('bas_engineering_6')) fail('Engineering review requires the engineering workflow revision');
  if (w.drawing_events && !supports('bas_review_7')) fail('Drawing review requires the review workflow revision');
  if (w.revision_events && !supports('bas_revision_8')) fail('Comparison review requires the comparison workflow revision');
  if (w.issue_events && !supports('bas_issues_9')) fail('Issue decisions require the issue workflow revision');
  if (w.scope_events && !supports('bas_scope_10')) fail('Scope decisions require the scope workflow revision');
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
  const assemblyHeads = new Map<string, string>();
  for (const event of w.assembly_events ?? []) {
    if (!w.equipment_events?.some(e => e.event_id === event.expected_equipment_head && e.capture_id === event.capture_id)) fail('Assembly review has no retained equipment decision');
    if (event.expected_head !== (assemblyHeads.get(event.capture_id) ?? null)) fail('Divergent or incomplete assembly review history');
    if (operations.has(event.operation_id) || eventIds.has(event.event_id)) fail('Duplicate BAS review operation/event');
    assemblyHeads.set(event.capture_id, event.event_id); operations.add(event.operation_id); eventIds.add(event.event_id);
  }
  const calculationIds = new Set<string>();
  const engineeringHeads = new Map<string, string>();
  for (const event of w.engineering_events ?? []) {
    if (!w.equipment_events?.some(e => e.event_id === event.expected_equipment_head && e.capture_id === event.capture_id)) fail('Engineering review has no retained equipment decision');
    if (event.expected_assembly_head !== null && !w.assembly_events?.some(e => e.event_id === event.expected_assembly_head
      && e.capture_id === event.capture_id && e.expected_equipment_head === event.expected_equipment_head)) fail('Engineering review has no matching assembly decision');
    if (event.expected_sequence_head !== null && !w.review_events?.some(e => e.event_id === event.expected_sequence_head && e.capture_id === event.capture_id)) fail('Engineering review has no matching SOO review');
    if (event.expected_head !== (engineeringHeads.get(event.capture_id) ?? null)) fail('Divergent or incomplete engineering review history');
    if (operations.has(event.operation_id) || eventIds.has(event.event_id)) fail('Duplicate BAS review operation/event');
    engineeringHeads.set(event.capture_id, event.event_id); operations.add(event.operation_id); eventIds.add(event.event_id);
  }
  for (const event of [...(w.drawing_events ?? []), ...(w.revision_events ?? []), ...(w.issue_events ?? []), ...(w.scope_events ?? [])]) {
    if (operations.has(event.operation_id) || eventIds.has(event.event_id)) fail('Duplicate BAS review operation/event');
    operations.add(event.operation_id); eventIds.add(event.event_id);
  }
  try {
    const drawings = replayBasDrawingHistory(w.captures, w.drawing_events);
    validateBasRevisionJournal(w, drawings.source_sets);
    validateBasIssueJournal(w);
    validateBasScopeJournal(w, drawings.source_sets);
  }
  catch (error) { fail(error instanceof Error ? error.message : 'Invalid drawing review history'); }
  for (const calculation of w.assignment_calculations ?? []) {
    if (calculationIds.has(calculation.calculation_id)) fail('Duplicate assignment calculation identity');
    calculationIds.add(calculation.calculation_id);
    if (!w.equipment_events?.some(e => e.event_id === calculation.result.equipment_head && e.capture_id === calculation.result.capture_id)) {
      fail('Assignment calculation has no retained equipment decision');
    }
  }
  for (const calculation of w.assembly_calculations ?? []) {
    if (calculationIds.has(calculation.calculation_id)) fail('Duplicate assembly calculation identity');
    calculationIds.add(calculation.calculation_id);
    if (!w.assembly_events?.some(e => e.event_id === calculation.result.assembly_head && e.capture_id === calculation.result.capture_id
      && e.expected_equipment_head === calculation.result.equipment_head)) fail('Assembly calculation has no matching retained decisions');
  }
}
export type BasWorkflow = z.infer<typeof basWorkflowSchema>;
export type BasCapture = BasWorkflow['captures'][number];

/** Internal only: selecting prefixes from an already verified owner cannot
 * alter field/hash validity, but can break cross-domain ancestry. Reuse every
 * schema reference check without deep-copying the retained PDF evidence again.
 * Public/unowned input still requires verifyBasWorkflow, not this function. */
export function assertVerifiedBasWorkflowReferences(workflow: BasWorkflow): void {
  refineBasWorkflowReferences(workflow, { path: [], addIssue(issue) {
    throw new Error(issue.message ?? 'Invalid BAS workflow references');
  } });
}

/** Replace ONLY navigation aliases, never raw source strings or local row keys. */
export function basCaptureIdentityPayload(c: Omit<BasCapture, 'capture_id'>) {
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
const fingerprint = (c: Omit<BasCapture, 'capture_id'>) => sha256Hex(new TextEncoder().encode(canonicalBasJson(basCaptureIdentityPayload(c))));

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

export const basEventFingerprint = (event: Omit<z.infer<typeof basReviewEventSchema>, 'event_id'> | Omit<BasEquipmentReviewEvent, 'event_id'> | Omit<BasAssemblyReviewEvent, 'event_id'> | Omit<BasEngineeringReviewEvent, 'event_id'> | Omit<BasDrawingEvent, 'event_id'> | Omit<BasRevisionReviewEvent, 'event_id'> | Omit<BasIssueReviewEvent, 'event_id'> | Omit<BasScopeReviewEvent, 'event_id'>) =>
  sha256Hex(new TextEncoder().encode(canonicalBasJson(event)));

export async function verifyBasWorkflow(raw: unknown): Promise<BasWorkflow> {
  // Passthrough metadata is source evidence too. Zod alone does not own nested
  // unknown objects; take the complete snapshot before any asynchronous check.
  const result = basWorkflowSchema.parse(structuredClone(raw));
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
  for (const event of result.assembly_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS assembly event fingerprint mismatch');
    const c = result.captures.find(c => c.capture_id === event.capture_id)!;
    const equipment = result.equipment_events!.find(e => e.event_id === event.expected_equipment_head)!;
    if (await basAssemblyInterpretationFingerprint(c.narrative_sources!, event.register.source_rule_version) !== event.source_interpretation_fingerprint) {
      throw new Error('BAS assembly source interpretation changed within its retained rule version');
    }
    await validateBasAssemblyRegister(c.narrative_sources!, c.equipment_sources!, c.points, equipment.register, event.register);
  }
  for (const calculation of result.assignment_calculations ?? []) {
    const { calculation_id, ...payload } = calculation;
    if (await basAssignmentCalculationFingerprint(payload) !== calculation_id) throw new Error('BAS assignment calculation fingerprint mismatch');
    const event = result.equipment_events!.find(e => e.event_id === calculation.result.equipment_head)!;
    const c = result.captures.find(c => c.capture_id === event.capture_id)!;
    const input = await buildBasAssignmentDemandInput(c, event.register, event.event_id);
    if (await basAssignmentInputFingerprint(input) !== calculation.input_fingerprint) throw new Error('BAS assignment calculation inputs changed');
    verifyBasAssignmentDemandResult(input, calculation.result);
  }
  for (const calculation of result.assembly_calculations ?? []) {
    const { calculation_id, ...payload } = calculation;
    if (await basAssemblyCalculationFingerprint(payload) !== calculation_id) throw new Error('BAS assembly calculation fingerprint mismatch');
    const event = result.assembly_events!.find(e => e.event_id === calculation.result.assembly_head)!;
    const equipment = result.equipment_events!.find(e => e.event_id === event.expected_equipment_head)!;
    const c = result.captures.find(c => c.capture_id === event.capture_id)!;
    const input = await buildBasAssemblyQuantityInput(c, equipment.register, equipment.event_id, event.register, event.event_id);
    if (await basAssemblyQuantityInputFingerprint(input) !== calculation.input_fingerprint) throw new Error('BAS assembly calculation inputs changed');
    verifyBasAssemblyQuantityResult(input, calculation.result);
  }
  // This browser-safe verifier establishes lineage, not arithmetic authenticity.
  // Engineering results require shared Python replay before being used as current.
  // One-entry cache, scoped to this invocation and keyed by immutable owned
  // identities. Different heads/captures replace it; nothing survives a call.
  const engineeringValidators = new Map<string, Awaited<ReturnType<typeof prepareBasEngineeringRegisterValidator>>>();
  for (const event of result.engineering_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS engineering event fingerprint mismatch');
    const c = result.captures.find(c => c.capture_id === event.capture_id)!;
    const equipment = result.equipment_events!.find(e => e.event_id === event.expected_equipment_head)!;
    const assembly = result.assembly_events?.find(e => e.event_id === event.expected_assembly_head)?.register ?? null;
    const key = canonicalBasJson([event.capture_id, event.expected_equipment_head, event.expected_assembly_head]);
    let validate = engineeringValidators.get(key);
    if (!validate) {
      engineeringValidators.clear();
      validate = await prepareBasEngineeringRegisterValidator(c, equipment.register, assembly);
      engineeringValidators.set(key, validate);
    }
    validate(event.register);
    verifyBasEngineeringResult(event.register.input, event.result);
  }
  for (const event of result.drawing_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS drawing event fingerprint mismatch');
    if (await basDrawingDependencyFingerprint(event.action) !== event.expected_dependencies) throw new Error('BAS drawing dependency fingerprint mismatch');
  }
  // Decision lineage only. The selected report must be independently replayed
  // by the shared Python-backed comparison service before differences are used.
  for (const event of result.revision_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS comparison event fingerprint mismatch');
  }
  // Lineage only: reading an issue decision independently replays its pinned
  // finding/absence through the shared projection before presenting that proof.
  for (const event of result.issue_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS issue event fingerprint mismatch');
  }
  // Lineage/hash only. Scope/coverage readers must replay their own saved
  // selectors and exact source/dependency fingerprint before using the decision.
  for (const event of result.scope_events ?? []) {
    const { event_id, ...payload } = event;
    if (await basEventFingerprint(payload) !== event_id) throw new Error('BAS scope event fingerprint mismatch');
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
    if (old && canonicalBasJson(basCaptureIdentityPayload(old)) !== canonicalBasJson(basCaptureIdentityPayload(c))) throw new Error('Conflicting BAS evidence for one capture identity');
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
  const calculations = new Map((left.assignment_calculations ?? []).map(c => [c.calculation_id, c]));
  for (const calculation of right.assignment_calculations ?? []) {
    const previous = calculations.get(calculation.calculation_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(calculation)) throw new Error('Conflicting assignment calculation identity');
    calculations.set(calculation.calculation_id, calculation);
  }
  const assemblyEvents = new Map((left.assembly_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.assembly_events ?? []) {
    const previous = assemblyEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting assembly event identity');
    assemblyEvents.set(event.event_id, event);
  }
  const assemblyCalculations = new Map((left.assembly_calculations ?? []).map(c => [c.calculation_id, c]));
  for (const calculation of right.assembly_calculations ?? []) {
    const previous = assemblyCalculations.get(calculation.calculation_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(calculation)) throw new Error('Conflicting assembly calculation identity');
    assemblyCalculations.set(calculation.calculation_id, calculation);
  }
  const engineeringEvents = new Map((left.engineering_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.engineering_events ?? []) {
    const previous = engineeringEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting engineering event identity');
    engineeringEvents.set(event.event_id, event);
  }
  const drawingEvents = new Map((left.drawing_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.drawing_events ?? []) {
    const previous = drawingEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting drawing event identity');
    drawingEvents.set(event.event_id, event);
  }
  const revisionEvents = new Map((left.revision_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.revision_events ?? []) {
    const previous = revisionEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting comparison event identity');
    revisionEvents.set(event.event_id, event);
  }
  const issueEvents = new Map((left.issue_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.issue_events ?? []) {
    const previous = issueEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting issue event identity');
    issueEvents.set(event.event_id, event);
  }
  const scopeEvents = new Map((left.scope_events ?? []).map(e => [e.event_id, e]));
  for (const event of right.scope_events ?? []) {
    const previous = scopeEvents.get(event.event_id);
    if (previous && canonicalBasJson(previous) !== canonicalBasJson(event)) throw new Error('Conflicting scope event identity');
    scopeEvents.set(event.event_id, event);
  }
  return basWorkflowSchema.parse({ ...left, captures: [...merged.values()],
    revision: atLeastBasWorkflowRevision(left.revision, right.revision),
    ...(events.size || left.review_events || right.review_events ? { review_events: [...events.values()] } : {}),
    ...(equipmentEvents.size || left.equipment_events || right.equipment_events ? { equipment_events: [...equipmentEvents.values()] } : {}),
    ...(calculations.size || left.assignment_calculations || right.assignment_calculations ? { assignment_calculations: [...calculations.values()] } : {}),
    ...(assemblyEvents.size || left.assembly_events || right.assembly_events ? { assembly_events: [...assemblyEvents.values()] } : {}),
    ...(assemblyCalculations.size || left.assembly_calculations || right.assembly_calculations ? { assembly_calculations: [...assemblyCalculations.values()] } : {}),
    ...(engineeringEvents.size || left.engineering_events || right.engineering_events ? { engineering_events: [...engineeringEvents.values()] } : {}),
    ...(drawingEvents.size || left.drawing_events || right.drawing_events ? { drawing_events: [...drawingEvents.values()] } : {}),
    ...(revisionEvents.size || left.revision_events || right.revision_events ? { revision_events: [...revisionEvents.values()] } : {}),
    ...(issueEvents.size || left.issue_events || right.issue_events ? { issue_events: [...issueEvents.values()] } : {}),
    ...(scopeEvents.size || left.scope_events || right.scope_events ? { scope_events: [...scopeEvents.values()] } : {}),
    current_capture_id: activateIncoming ? right.current_capture_id : left.current_capture_id ?? right.current_capture_id });
}

/** Retain append-only evidence from all known versions during reconciliation.
 * A missing/older snapshot is not an instruction to delete BAS history. The
 * caller's selected version supplies navigation only, not a winning review
 * branch. Conflicting event chains still fail the existing shared merge gate.
 * Synchronous structure gate; verifyBasWorkflow must precede adoption/use. */
export function retainBasWorkflowHistory(selected: unknown, ...versions: unknown[]): BasWorkflow | null {
  let merged = mergeBasWorkflows(selected, null);
  const selection = merged?.current_capture_id;
  for (const version of versions) merged = mergeBasWorkflows(merged, version);
  if (merged && selection !== undefined) merged.current_capture_id = selection;
  return merged;
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
