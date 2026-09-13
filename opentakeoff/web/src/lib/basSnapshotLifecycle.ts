/** SHOULD THIS BE ON THE SHARED PATH? Yes. Revocation, supersession and
 * current-scope applicability are release truth consumed by UI and MCP.
 * Storage remains surface-specific. This never changes the immutable snapshot
 * or its approval seal, and it never creates an approval. */
import { z } from 'zod';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { readBasSnapshotPlan, verifyBasSnapshotRecordIdentity, type BasSnapshotPlan } from './basSnapshot.ts';
import { buildBasReadiness, type BasReadinessIO } from './basReadiness.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/), text = (max: number) => z.string().trim().min(1).max(max);
const declarationSchema = z.object({ reviewer: text(512), reason: text(8192), declared_at: z.string().datetime(),
  origin: z.literal('operator_input'), reviewer_identity: z.literal('self_declared'), timestamp_authority: z.literal('local_untrusted') }).strict();
export const basSnapshotLifecycleRequestSchema = z.object({
  operation_id: z.string().uuid(), expected_head: sha, reviewer: text(512), reason: text(8192), declared_at: z.string().datetime(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('revoke') }).strict(),
    z.object({ kind: z.literal('supersede'), successor_snapshot_id: sha }).strict(),
  ]),
}).strict();
const lifecyclePayloadSchema = z.object({ schema_version: z.literal('bas_snapshot_lifecycle_event_v1'),
  rule_version: z.literal('bas_snapshot_lifecycle_1'), snapshot_id: sha, operation_id: z.string().uuid(),
  previous_event_id: sha, action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('revoke') }).strict(),
    z.object({ kind: z.literal('supersede'), successor_snapshot_id: sha }).strict(),
  ]), declaration: declarationSchema,
}).strict();
export const basSnapshotLifecycleEventSchema = lifecyclePayloadSchema.extend({ event_id: sha }).strict();
export type BasSnapshotLifecycleEvent = z.infer<typeof basSnapshotLifecycleEventSchema>;
export const basSnapshotLifecycleStateSchema = z.object({
  schema_version: z.literal('bas_snapshot_lifecycle_state_v1'), snapshot_id: sha,
  status: z.enum(['approved', 'revoked', 'superseded']), head: sha,
  event_count: z.number().int().nonnegative(), successor_snapshot_id: sha.nullable(),
  terminal_event: basSnapshotLifecycleEventSchema.nullable(),
}).strict();
export type BasSnapshotLifecycleState = z.infer<typeof basSnapshotLifecycleStateSchema>;

const hash = (value: unknown) => sha256Hex(new TextEncoder().encode(canonicalBasJson(value)));

export async function evaluateBasSnapshotLifecycle(rawRecord: unknown, rawEvents: unknown[]) {
  const record = await verifyBasSnapshotRecordIdentity(rawRecord);
  const events = rawEvents.map(event => basSnapshotLifecycleEventSchema.parse(structuredClone(event)));
  let head = record.seal.event_id;
  const operations = new Set<string>(), eventIds = new Set<string>();
  for (const event of events) {
    const { event_id, ...payload } = event;
    if (event.snapshot_id !== record.snapshot_id) throw new Error('Snapshot lifecycle event belongs to another snapshot');
    if (event.previous_event_id !== head) throw new Error('Snapshot lifecycle chain is incomplete or out of order');
    if (operations.has(event.operation_id) || eventIds.has(event.event_id)) throw new Error('Duplicate snapshot lifecycle identity');
    if (event.action.kind === 'supersede' && event.action.successor_snapshot_id === record.snapshot_id)
      throw new Error('A snapshot cannot supersede itself');
    if (await hash(payload) !== event_id) throw new Error('Snapshot lifecycle event identity mismatch');
    operations.add(event.operation_id); eventIds.add(event.event_id); head = event.event_id;
  }
  if (events.length > 1) throw new Error('A revoked or superseded snapshot has a terminal lifecycle');
  const terminal = events.at(-1) ?? null;
  return basSnapshotLifecycleStateSchema.parse({ schema_version: 'bas_snapshot_lifecycle_state_v1',
    snapshot_id: record.snapshot_id, status: terminal?.action.kind === 'revoke' ? 'revoked'
      : terminal?.action.kind === 'supersede' ? 'superseded' : 'approved', head,
    event_count: events.length, successor_snapshot_id: terminal?.action.kind === 'supersede' ? terminal.action.successor_snapshot_id : null,
    terminal_event: terminal });
}

/** Explicit operator-only append. The expected head makes simultaneous browser
 * edits fail instead of silently choosing a winner. Exact retries are stable. */
export async function prepareBasSnapshotLifecycleEvent(rawRecord: unknown, rawEvents: unknown[], rawRequest: unknown,
  origin: 'operator_input' | 'agent_proposal'): Promise<BasSnapshotLifecycleEvent> {
  if (origin !== 'operator_input') throw new Error('Snapshot revocation or supersession requires an explicit operator action');
  const record = await verifyBasSnapshotRecordIdentity(rawRecord), events = rawEvents.map(e => basSnapshotLifecycleEventSchema.parse(structuredClone(e)));
  const state = await evaluateBasSnapshotLifecycle(record, events), request = basSnapshotLifecycleRequestSchema.parse(structuredClone(rawRequest));
  const prior = events.find(event => event.operation_id === request.operation_id);
  if (prior) {
    const { event_id: _event, schema_version: _schema, rule_version: _rule, snapshot_id: _snapshot,
      previous_event_id: _previous, declaration, action } = prior;
    const expected = { reviewer: declaration.reviewer, reason: declaration.reason, declared_at: declaration.declared_at, action };
    const supplied = { reviewer: request.reviewer, reason: request.reason, declared_at: request.declared_at, action: request.action };
    if (canonicalBasJson(expected) !== canonicalBasJson(supplied)) throw new Error('Snapshot lifecycle operation ID was reused for a different action');
    return prior;
  }
  if (state.status !== 'approved') throw new Error(`Snapshot is already ${state.status}; its lifecycle is terminal`);
  if (request.expected_head !== state.head) throw new Error('Snapshot lifecycle changed. Reopen it before recording a release decision.');
  const payload = lifecyclePayloadSchema.parse({ schema_version: 'bas_snapshot_lifecycle_event_v1', rule_version: 'bas_snapshot_lifecycle_1',
    snapshot_id: record.snapshot_id, operation_id: request.operation_id, previous_event_id: state.head, action: request.action,
    declaration: { reviewer: request.reviewer, reason: request.reason, declared_at: request.declared_at,
      origin, reviewer_identity: 'self_declared', timestamp_authority: 'local_untrusted' } });
  return basSnapshotLifecycleEventSchema.parse({ ...payload, event_id: await hash(payload) });
}

export const basSnapshotCurrentnessSchema = z.object({
  schema_version: z.literal('bas_snapshot_currentness_v1'), snapshot_id: sha,
  lifecycle: basSnapshotLifecycleStateSchema,
  status: z.enum(['current_for_reviewed_scope', 'not_current_lifecycle', 'not_current_working_scope']),
  readiness_status: z.enum(['ready_for_explicit_approval', 'blocked', 'not_run']),
  blocker_codes: z.array(z.string()), scope_event_id: sha, source_set_id: sha,
  guarantee: z.literal('reviewed_scope_only_not_project_or_installed_quantity'),
  project_complete: z.literal(false), installed_quantity: z.null(),
}).strict();
export const basSnapshotLifecycleExportSchema = z.object({
  schema_version: z.literal('bas_snapshot_lifecycle_export_v1'), snapshot_id: sha,
  lifecycle: z.object({ events: z.array(basSnapshotLifecycleEventSchema).max(1), state: basSnapshotLifecycleStateSchema }).strict(),
  currentness: z.union([basSnapshotCurrentnessSchema, z.object({ status: z.literal('not_evaluated') }).strict()]),
  export_semantics: z.literal('snapshot_lifecycle_sidecar_not_part_of_immutable_approval_archive'),
  project_complete: z.literal(false), installed_quantity: z.null(),
}).strict();

export function basSnapshotLifecycleExport(snapshotId: string, lifecycle: unknown, currentness: unknown = { status: 'not_evaluated' }) {
  return basSnapshotLifecycleExportSchema.parse({ schema_version: 'bas_snapshot_lifecycle_export_v1', snapshot_id: snapshotId,
    lifecycle, currentness, export_semantics: 'snapshot_lifecycle_sidecar_not_part_of_immutable_approval_archive',
    project_complete: false, installed_quantity: null });
}

/** Requires an already source/Python-verified snapshot plan. Currentness then
 * re-runs readiness on today's retained workflow using selective dependency
 * fingerprints: unrelated edits may remain current; relevant changes block. */
export async function assessBasSnapshotCurrentness(plan: BasSnapshotPlan, rawCurrentWorkflow: unknown,
  rawEvents: unknown[], io: BasReadinessIO = {}, signal?: AbortSignal) {
  const { record } = readBasSnapshotPlan(plan), lifecycle = await evaluateBasSnapshotLifecycle(record, rawEvents);
  const scopeEventId = record.snapshot.declaration.scope_event_id;
  const historical = JSON.parse(record.snapshot.readiness_json);
  if (lifecycle.status !== 'approved') return basSnapshotCurrentnessSchema.parse({ schema_version: 'bas_snapshot_currentness_v1',
    snapshot_id: record.snapshot_id, lifecycle, status: 'not_current_lifecycle', readiness_status: 'not_run', blocker_codes: [],
    scope_event_id: scopeEventId, source_set_id: historical.source_set_id,
    guarantee: 'reviewed_scope_only_not_project_or_installed_quantity', project_complete: false, installed_quantity: null });
  let readiness;
  try { readiness = await buildBasReadiness(rawCurrentWorkflow, scopeEventId, io, signal); }
  catch { return basSnapshotCurrentnessSchema.parse({ schema_version: 'bas_snapshot_currentness_v1', snapshot_id: record.snapshot_id,
    lifecycle, status: 'not_current_working_scope', readiness_status: 'not_run', blocker_codes: ['scope_event_not_retained_current_workspace'],
    scope_event_id: scopeEventId, source_set_id: historical.source_set_id,
    guarantee: 'reviewed_scope_only_not_project_or_installed_quantity', project_complete: false, installed_quantity: null }); }
  return basSnapshotCurrentnessSchema.parse({ schema_version: 'bas_snapshot_currentness_v1', snapshot_id: record.snapshot_id,
    lifecycle, status: readiness.status === 'ready_for_explicit_approval' ? 'current_for_reviewed_scope' : 'not_current_working_scope',
    readiness_status: readiness.status, blocker_codes: [...new Set(readiness.blockers.map(blocker => blocker.code))],
    scope_event_id: scopeEventId, source_set_id: readiness.source_set_id,
    guarantee: 'reviewed_scope_only_not_project_or_installed_quantity', project_complete: false, installed_quantity: null });
}
