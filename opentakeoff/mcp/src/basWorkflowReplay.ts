/** Complete saved-calculation audit shared by restoration/approval entry points. */
import { prepareBasWorkflowReplay, basWorkflowReplayReceiptSchema, BAS_WORKFLOW_REPLAY_RULE,
  type BasReplayRecord } from '../../web/src/lib/basWorkflowReplay.ts';
import { replayBasWorkflowBatch } from './basMath.ts';

export const BAS_REPLAY_BATCH_LIMITS = Object.freeze({ records: 1000, bytes: 30 * 1024 * 1024 });
const envelopeBytes = Buffer.byteLength(JSON.stringify({ workflow_replay: { records: [] } }));

/** Transport partitioning only; callers validate complete history first. The
 * byte budget includes the actual JSON envelope and commas, not only records. */
export async function* basWorkflowReplayBatches(records: AsyncIterable<BasReplayRecord>, guard: () => void = () => {}) {
  let batch: BasReplayRecord[] = [], bytes = envelopeBytes;
  for await (const record of records) {
    guard(); const size = Buffer.byteLength(JSON.stringify(record));
    if (size + envelopeBytes > BAS_REPLAY_BATCH_LIMITS.bytes) throw new Error('One saved BAS calculation exceeds the replay size limit');
    if (batch.length === BAS_REPLAY_BATCH_LIMITS.records || bytes + size + (batch.length ? 1 : 0) > BAS_REPLAY_BATCH_LIMITS.bytes) {
      yield batch; guard(); batch = []; bytes = envelopeBytes;
    }
    bytes += size + (batch.length ? 1 : 0); batch.push(record);
  }
  guard(); if (batch.length) yield batch;
}

export async function verifyBasWorkflowCalculations(raw: unknown, options: { python?: string; timeoutMs?: number; signal?: AbortSignal } = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 30000);
  const guard = () => { options.signal?.throwIfAborted(); if (Date.now() >= deadline) throw new Error('BAS workflow replay timed out; no calculations accepted'); };
  const plan = await prepareBasWorkflowReplay(raw, guard);
  for await (const batch of basWorkflowReplayBatches(plan.records(), guard)) {
    guard();
    await replayBasWorkflowBatch(batch, { ...options, timeoutMs: Math.max(1, deadline - Date.now()) });
    guard();
  }
  guard();
  return basWorkflowReplayReceiptSchema.parse({ schema_version: 'bas_workflow_replay_v1', rule_version: BAS_WORKFLOW_REPLAY_RULE,
    workflow_sha256: plan.workflow_sha256, checked_records: plan.checked_records,
    calculation_verification: Object.values(plan.checked_records).some(records => records.length) ? 'verified_shared_python_replay' : 'no_saved_calculations',
    project_complete: false });
}
