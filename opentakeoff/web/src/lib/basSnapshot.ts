/** SHOULD THIS BE ON THE SHARED PATH? Yes. Exact scoped snapshot authority for
 * browser/MCP, independent of storage, extraction and the mutable workflow.
 * A prepared plan is not a committed approval. Local declarations are unsigned. */
import { z } from 'zod';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import { parseTakeoffImport } from './importTakeoff.js';
import { ANN_SCHEMA } from './store.js';
import { buildBasReadinessForVerifiedWorkflow, BAS_READINESS_RULE, type BasReadinessIO } from './basReadiness.ts';
import { inspectBasSourceHistory, type BasSourceInventoryItem } from './basSourceRetention.ts';
import { verifyBasWorkflow, type BasWorkflow } from './basWorkflow.ts';

export const BAS_SNAPSHOT_RULE = 'bas_scoped_snapshot_1' as const;
export const BAS_SNAPSHOT_JSON_LIMIT = 256 * 1024 ** 2;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const text = (max: number) => z.string().min(1).max(max).refine(s => s.trim().length > 0, 'Blank declaration');
export const basSnapshotApprovalRequestSchema = z.object({
  operation_id: z.string().uuid(), scope_event_id: sha, reviewer: text(512), reason: text(8192),
  declared_at: z.string().datetime(),
}).strict();
const declarationSchema = basSnapshotApprovalRequestSchema.extend({
  origin: z.literal('operator_input'), reviewer_identity: z.literal('self_declared'),
  timestamp_authority: z.literal('local_untrusted'),
}).strict();
const snapshotPayloadSchema = z.object({
  schema_version: z.literal('bas_snapshot_payload_v1'), rule_version: z.literal(BAS_SNAPSHOT_RULE),
  takeoff: z.object({ sha256: sha, byte_length: z.number().int().positive().max(BAS_SNAPSHOT_JSON_LIMIT) }).strict(),
  workflow_sha256: sha, readiness_rule: z.literal(BAS_READINESS_RULE),
  readiness_json: z.string().min(1).max(BAS_SNAPSHOT_JSON_LIMIT), declaration: declarationSchema,
  project_complete: z.literal(false), installed_quantity: z.null(),
}).strict();
const sealPayloadSchema = z.object({
  schema_version: z.literal('bas_snapshot_seal_v1'), rule_version: z.literal(BAS_SNAPSHOT_RULE),
  action: z.literal('approve_scope'), snapshot_id: sha, operation_id: z.string().uuid(),
  previous_event_id: z.null(), declaration: declarationSchema,
}).strict();
export const basSnapshotRecordSchema = z.object({
  schema_version: z.literal('bas_snapshot_record_v1'), snapshot_id: sha, snapshot: snapshotPayloadSchema,
  seal: sealPayloadSchema.extend({ event_id: sha }).strict(),
}).strict();
export type BasSnapshotRecord = z.infer<typeof basSnapshotRecordSchema>;
export type BasSnapshotPlan = { readonly kind: 'bas_snapshot_plan'; readonly snapshot_id: string };
type OwnedPlan = { payload_json: string; record: BasSnapshotRecord; signal?: AbortSignal; mode: 'create' | 'reopen' };
const plans = new WeakMap<BasSnapshotPlan, OwnedPlan>();
/** Private handoff from the archive parser to snapshot replay. The archive
 * parser owns this object and never exposes its mutable payload to a caller.
 * This avoids cloning/canonicalizing/parsing the same large takeoff twice. */
export type BasSnapshotArchiveInput = { readonly kind: 'bas_snapshot_archive_input'; readonly takeoff_sha256: string };
type OwnedTakeoff = { json: string; bytes: Uint8Array; payload: ReturnType<typeof parseTakeoffImport> };
type OwnedArchiveInput = OwnedTakeoff & { verified_workflow: BasWorkflow };
const archiveInputs = new WeakMap<BasSnapshotArchiveInput, OwnedArchiveInput>();
const encode = (v: unknown) => new TextEncoder().encode(canonicalBasJson(v));
const hash = (v: unknown) => sha256Hex(encode(v));

function ownTakeoff(raw: unknown): OwnedTakeoff {
  // Own the complete envelope before any await. Full BAS schema, reference and
  // fingerprint validation follows in buildBasReadiness; repeating the same
  // whole-history Zod parse here would retain a second large object for no
  // additional trust decision.
  const payload = structuredClone(raw) as ReturnType<typeof parseTakeoffImport>;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema !== ANN_SCHEMA)
    throw new Error(`Couldn't import takeoff: not a takeoff export (expected schema "${ANN_SCHEMA}" — the file export_takeoff or the app writes).`);
  const json = canonicalBasJson(payload), bytes = new TextEncoder().encode(json);
  if (bytes.length > BAS_SNAPSHOT_JSON_LIMIT) throw new Error('BAS snapshot takeoff exceeds the supported size limit');
  if (!payload.bas_workflow) throw new Error('BAS snapshot requires saved workflow evidence');
  return { json, bytes, payload };
}

/** Parse one canonical archive entry into opaque, privately owned state.
 * Canonical bytes, schema and full workflow history are all checked here.
 * Returned inventory is an independent value; mutating it cannot affect replay. */
export async function prepareBasSnapshotArchiveInput(rawJson: unknown, signal?: AbortSignal): Promise<{
  input: BasSnapshotArchiveInput; inventory: BasSourceInventoryItem[];
}> {
  signal?.throwIfAborted();
  if (typeof rawJson !== 'string') throw new Error('BAS snapshot archive takeoff must be canonical JSON');
  const bytes = new TextEncoder().encode(rawJson);
  if (bytes.length > BAS_SNAPSHOT_JSON_LIMIT) throw new Error('BAS snapshot takeoff exceeds the supported size limit');
  const payload = parseTakeoffImport(rawJson);
  if (!payload.bas_workflow) throw new Error('BAS snapshot requires saved workflow evidence');
  if (canonicalBasJson(payload) !== rawJson) throw new Error('Noncanonical BAS archive takeoff JSON');
  const verified = await inspectBasSourceHistory(payload.bas_workflow); signal?.throwIfAborted();
  // The parsed payload is private. Retain the audited equivalent instead of
  // keeping both full workflow object graphs alive through readiness replay.
  payload.bas_workflow = verified.workflow;
  const input: BasSnapshotArchiveInput = Object.freeze({ kind: 'bas_snapshot_archive_input',
    takeoff_sha256: await sha256Hex(bytes) });
  archiveInputs.set(input, { json: rawJson, bytes, payload, verified_workflow: verified.workflow });
  return { input, inventory: structuredClone(verified.inventory) };
}
function ownPlan(payload_json: string, record: BasSnapshotRecord, mode: OwnedPlan['mode'], signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (encode(record).length > BAS_SNAPSHOT_JSON_LIMIT) throw new Error('BAS snapshot record exceeds the supported size limit');
  const plan: BasSnapshotPlan = Object.freeze({ kind: 'bas_snapshot_plan', snapshot_id: record.snapshot_id });
  // Every caller above supplies a schema-parsed record it privately owns.
  // Keep that object private; readBasSnapshotPlan remains the copy boundary.
  plans.set(plan, { payload_json, record, mode, signal });
  return plan;
}
/** Only a plan produced by fresh shared verification can cross a commit/export
 * boundary. Return owned copies; never give a caller the WeakMap's authority. */
export function readBasSnapshotPlan(plan: BasSnapshotPlan) {
  assertBasSnapshotPlan(plan);
  const owned = plans.get(plan);
  return { payload_json: owned!.payload_json, record: structuredClone(owned!.record), mode: owned!.mode,
    committed: false as const, current_working_state: 'not_evaluated' as const };
}
/** O(1) lifetime guard for streaming chunks; do not clone the snapshot per chunk. */
export function assertBasSnapshotPlan(plan: BasSnapshotPlan) {
  const owned = plans.get(plan);
  if (!owned) throw new Error('BAS snapshot requires an owned, freshly verified plan');
  owned.signal?.throwIfAborted();
}

/** Structural identity is reusable by lifecycle/currentness services. This is
 * not source-byte or calculation verification; only verifyBasSnapshot grants
 * an owned reopened plan after those expensive checks. */
export async function verifyBasSnapshotRecordIdentity(rawRecord: unknown): Promise<BasSnapshotRecord> {
  if (encode(rawRecord).length > BAS_SNAPSHOT_JSON_LIMIT) throw new Error('BAS snapshot record exceeds the supported size limit');
  const record = basSnapshotRecordSchema.parse(structuredClone(rawRecord)), { snapshot, seal } = record;
  const { event_id, ...sealPayload } = seal;
  if (await hash(snapshot) !== record.snapshot_id || seal.snapshot_id !== record.snapshot_id
    || await hash(sealPayload) !== event_id || canonicalBasJson(snapshot.declaration) !== canonicalBasJson(seal.declaration)
    || seal.operation_id !== snapshot.declaration.operation_id) throw new Error('BAS snapshot/seal identity mismatch');
  return record;
}

/** origin is trusted application wiring, never a public Agent request field.
 * The Agent must not be given an approval verb. Reopen is a separate operation. */
export async function prepareBasSnapshotApproval(rawPayload: unknown, rawRequest: unknown,
  origin: 'operator_input' | 'agent_proposal', io: BasReadinessIO = {}, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (origin !== 'operator_input') throw new Error('BAS snapshot approval requires an explicit operator action');
  const request = basSnapshotApprovalRequestSchema.parse(structuredClone(rawRequest));
  const input = ownTakeoff(rawPayload);
  const verifiedWorkflow = await verifyBasWorkflow(input.payload.bas_workflow); signal?.throwIfAborted();
  input.payload.bas_workflow = verifiedWorkflow;
  const readiness = await buildBasReadinessForVerifiedWorkflow(verifiedWorkflow, request.scope_event_id, io, signal);
  if (readiness.status !== 'ready_for_explicit_approval')
    throw new Error(`BAS snapshot is blocked: ${[...new Set(readiness.blockers.map(b => b.code))].slice(0, 12).join(', ')}`);
  const declaration = declarationSchema.parse({ ...request, origin, reviewer_identity: 'self_declared', timestamp_authority: 'local_untrusted' });
  const snapshot = snapshotPayloadSchema.parse({ schema_version: 'bas_snapshot_payload_v1', rule_version: BAS_SNAPSHOT_RULE,
    takeoff: { sha256: await sha256Hex(input.bytes), byte_length: input.bytes.length },
    workflow_sha256: readiness.workflow_sha256, readiness_rule: BAS_READINESS_RULE,
    readiness_json: canonicalBasJson(readiness), declaration, project_complete: false, installed_quantity: null });
  const snapshot_id = await hash(snapshot);
  const seal = sealPayloadSchema.parse({ schema_version: 'bas_snapshot_seal_v1', rule_version: BAS_SNAPSHOT_RULE,
    action: 'approve_scope', snapshot_id, operation_id: request.operation_id, previous_event_id: null, declaration });
  const record = basSnapshotRecordSchema.parse({ schema_version: 'bas_snapshot_record_v1', snapshot_id,
    snapshot, seal: { ...seal, event_id: await hash(seal) } });
  return ownPlan(input.json, record, 'create', signal);
}

/** A hash-consistent artifact can still contain fabricated/stale readiness.
 * Recompute against its exact historical workflow, original bytes and Python.
 * This verifies an unsigned historical declaration, not its author's identity. */
export async function verifyBasSnapshot(rawPayload: unknown, rawRecord: unknown, io: BasReadinessIO = {}, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const input = ownTakeoff(rawPayload);
  return verifyOwnedSnapshot(input, rawRecord, io, signal);
}

/** Archive-only verifier. The opaque input is consumed once, after which its
 * parsed payload is transferred to the caller. No mutable object is shared
 * across the trust boundary and every ordinary snapshot check still runs. */
export async function verifyBasSnapshotArchiveInput(input: BasSnapshotArchiveInput, rawRecord: unknown,
  io: BasReadinessIO = {}, signal?: AbortSignal) {
  const owned = archiveInputs.get(input);
  if (!owned) throw new Error('BAS snapshot requires an owned canonical archive input');
  try {
    const plan = await verifyOwnedSnapshot(owned, rawRecord, io, signal, owned.verified_workflow);
    return { plan, payload: owned.payload };
  } finally {
    archiveInputs.delete(input);
  }
}

async function verifyOwnedSnapshot(input: OwnedTakeoff, rawRecord: unknown,
  io: BasReadinessIO, signal?: AbortSignal, verifiedWorkflow?: BasWorkflow) {
  signal?.throwIfAborted();
  const record = await verifyBasSnapshotRecordIdentity(rawRecord), { snapshot } = record;
  if (input.bytes.length !== snapshot.takeoff.byte_length || await sha256Hex(input.bytes) !== snapshot.takeoff.sha256)
    throw new Error('BAS snapshot takeoff hash/length mismatch');
  verifiedWorkflow ??= await verifyBasWorkflow(input.payload.bas_workflow); signal?.throwIfAborted();
  input.payload.bas_workflow = verifiedWorkflow;
  const readiness = await buildBasReadinessForVerifiedWorkflow(verifiedWorkflow, snapshot.declaration.scope_event_id, io, signal);
  if (readiness.status !== 'ready_for_explicit_approval' || readiness.workflow_sha256 !== snapshot.workflow_sha256
    || canonicalBasJson(readiness) !== snapshot.readiness_json) throw new Error('BAS snapshot readiness does not replay exactly');
  return ownPlan(input.json, record, 'reopen', signal);
}
