/** Shared UI/MCP comparison service. Selectors and interpretation stay shared;
 * existing Python calculators replay saved records and compute every delta. */
import { basRevisionComparisonSchema, basRevisionQuantityRequestSchema, BAS_REVISION_REPORT_BYTES,
  prepareBasRevisionComparison } from '../../web/src/lib/basRevisionComparison.ts';
import { selectBasRevisionState } from '../../web/src/lib/basRevisionBasis.ts';
import { buildBasAssignmentDemandInput } from '../../web/src/lib/basAssignmentDemandContract.ts';
import { buildBasAssemblyQuantityInput } from '../../web/src/lib/basAssemblyQuantityContract.ts';
import { type BasReplayRecord } from '../../web/src/lib/basWorkflowReplay.ts';
import { basWorkflowReplayBatches, BAS_REPLAY_BATCH_LIMITS } from './basWorkflowReplay.ts';
import { replayBasWorkflowBatch, runBasRevisionQuantities } from './basMath.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { z } from 'zod';

type NumericRequest = z.infer<typeof basRevisionQuantityRequestSchema>;
/** Exact wire-size partitioning, not quantity arithmetic. Oversized individual
 * records fail; none are silently dropped. */
export function* basRevisionNumericBatches<K extends keyof NumericRequest>(field: K, items: NumericRequest[K]) {
  let packet: NumericRequest = { pairs: [], point_matrices: [] }, count = 0;
  const empty = Buffer.byteLength(JSON.stringify({ revision_quantities: packet }));
  let bytes = empty;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item));
    if (empty + size > BAS_REPLAY_BATCH_LIMITS.bytes) throw new Error('One revision numeric record exceeds the 30 MiB batch budget');
    if (count === BAS_REPLAY_BATCH_LIMITS.records || bytes + size + (count ? 1 : 0) > BAS_REPLAY_BATCH_LIMITS.bytes) {
      yield packet; packet = { pairs: [], point_matrices: [] }; count = 0; bytes = empty;
    }
    // The generic array belongs to exactly its discriminated packet field.
    (packet[field] as unknown[]).push(item); bytes += size + (count ? 1 : 0); count++;
  }
  if (count) yield packet;
}

export async function compareBasRevisions(raw: unknown, rawRequest: unknown,
  options: { python?: string; timeoutMs?: number; signal?: AbortSignal } = {}) {
  const timeout = options.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeout) || timeout < 0) throw new Error('BAS revision comparison timeout must be a finite nonnegative integer');
  const deadline = Date.now() + timeout;
  const guard = () => { options.signal?.throwIfAborted(); if (Date.now() >= deadline) throw new Error('BAS revision comparison timed out; no report accepted'); };
  const transport = () => ({ ...options, timeoutMs: Math.max(1, deadline - Date.now()) });
  guard(); const prepared = await prepareBasRevisionComparison(raw, rawRequest, options.signal); guard();
  const { workflow, request, report } = prepared;
  const states = [selectBasRevisionState(workflow, request.before), selectBasRevisionState(workflow, request.after)].flatMap(s => s.states);
  const saved = new Set<string>();
  async function* selectedRecords(): AsyncGenerator<BasReplayRecord> {
    for (const state of states) {
      guard();
      if (state.assigned && !saved.has(state.assigned.calculation_id)) {
        const c = state.assigned, e = workflow.equipment_events!.find(e => e.event_id === c.result.equipment_head)!;
        const input = await buildBasAssignmentDemandInput(state.capture, e.register, e.event_id); guard();
        saved.add(c.calculation_id); yield { kind: 'assignment', record_id: c.calculation_id, input, result: c.result };
      }
      if (state.assembled && !saved.has(state.assembled.calculation_id)) {
        const c = state.assembled, a = workflow.assembly_events!.find(e => e.event_id === c.result.assembly_head)!;
        const e = workflow.equipment_events!.find(e => e.event_id === a.expected_equipment_head)!;
        const input = await buildBasAssemblyQuantityInput(state.capture, e.register, e.event_id, a.register, a.event_id); guard();
        saved.add(c.calculation_id); yield { kind: 'assembly', record_id: c.calculation_id, input, result: c.result };
      }
      if (state.engineering && !saved.has(state.engineering.event_id)) {
        saved.add(state.engineering.event_id); yield { kind: 'engineering', record_id: state.engineering.event_id, result: state.engineering.result };
      }
    }
  }
  const checked_saved_records: Array<{ kind: BasReplayRecord['kind']; record_id: string }> = [];
  for await (const batch of basWorkflowReplayBatches(selectedRecords(), guard)) {
    guard(); const receipt = await replayBasWorkflowBatch(batch, transport()); guard();
    checked_saved_records.push(...receipt.checked_records);
  }
  const pointMatrices: NumericRequest['point_matrices'] = [], captures = new Set<string>();
  for (const state of states) if (!captures.has(state.capture.capture_id)) {
    captures.add(state.capture.capture_id);
    pointMatrices.push(...state.capture.points.matrices.map(matrix => ({ capture_id: state.capture.capture_id, matrix })));
  }
  const checked_point_matrices: Array<{ capture_id: string; matrix_id: string }> = [];
  for (const packet of basRevisionNumericBatches('point_matrices', pointMatrices)) {
    guard(); const receipt = await runBasRevisionQuantities(packet, transport()); guard(); checked_point_matrices.push(...receipt.checked_point_matrices);
  }
  const values = new Map<string, number>();
  for (const packet of basRevisionNumericBatches('pairs', prepared.numericPairs)) {
    guard(); const result = await runBasRevisionQuantities(packet, transport()); guard();
    for (const pair of result.pairs) values.set(canonicalBasJson([pair.row_id, pair.metric_key]), pair.delta);
  }
  const complete = basRevisionComparisonSchema.parse({ ...report, arithmetic: 'completed',
    calculation_verification: checked_saved_records.length ? 'selected_records_python_replayed' : 'no_selected_saved_calculations',
    checked_saved_records, checked_point_matrices,
    rows: report.rows.map(row => ({ ...row, quantities: row.quantities.map(q => {
      if (q.status !== 'ready_for_python') return q;
      const key = canonicalBasJson([row.row_id, q.metric_key]);
      if (!values.has(key)) throw new Error('Revision arithmetic omitted an expected quantity comparison');
      return { ...q, status: 'calculated', delta: values.get(key) };
    }) })) });
  if (Buffer.byteLength(canonicalBasJson(complete)) > BAS_REVISION_REPORT_BYTES) throw new Error('Revision comparison exceeds the 64 MiB encoded report limit');
  guard(); return complete;
}
