/** SHOULD THIS BE ON THE SHARED PATH? No: browser transport/lifetime only.
 * Readiness, snapshot authority, replay validation and archive content remain
 * shared. This module is not an Agent tool and never applies restored state. */
import { buildBasReadiness } from './basReadiness.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan } from './basSnapshot.ts';
import { prepareBasSnapshotBundle, openBasSnapshotBundle } from './basEvidenceBundle.ts';
import { basSourceInventory } from './basSourceRetention.ts';
import { findBasOriginal } from './basSourceBrowser.js';
import { createBasEvidenceBundleBlob } from './basEvidenceBundleBrowser.js';
import { basRestoreJson } from './basRestore.ts';
import { annotationGeneration } from './annotationGeneration.js';
import { store } from './store.js';

/** Real shared Python transport; no accepted results supplied by the UI.
 * The shared caller validates the returned receipt against its owned workflow. */
export async function replayBasSnapshotInBrowser(workflow, signal, fetcher = globalThis.fetch) {
  signal?.throwIfAborted();
  const body = JSON.stringify({ workflow, request: {} });
  if (new TextEncoder().encode(body).length > 32 * 1024 ** 2)
    throw new Error('Saved history exceeds the browser replay limit of 32 MiB. No snapshot was verified.');
  const response = await fetcher('/__ot/bas-workflow-replay', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal,
  });
  signal?.throwIfAborted();
  if (!(response.headers.get('content-type') || '').includes('application/json'))
    throw new Error('Shared Python replay service is unavailable. No snapshot was verified.');
  const value = await response.json(); signal?.throwIfAborted();
  if (!response.ok) throw new Error(value.error || 'Shared Python replay failed. No snapshot was verified.');
  return value;
}

/** An instance belongs to one mounted workspace and one canonical adapter.
 * Preview receipts are private, ephemeral authority, not persisted ready flags. */
export function createBasSnapshotBrowser({ adapter, readWorkspace, isActive = () => store === adapter,
  fetcher = globalThis.fetch }) {
  const lifetime = new AbortController(), previews = new WeakMap();
  function operation(signal) {
    const combined = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
    const guard = () => {
      combined.throwIfAborted();
      if (!isActive()) throw new Error('The project changed. Reopen Snapshots in the intended project.');
    };
    guard(); return { signal: combined, guard };
  }
  const replayCalculations = (workflow, signal) => replayBasSnapshotInBrowser(workflow, signal, fetcher);
  async function sourceIO(workflow, guard) {
    const inventory = await basSourceInventory(workflow); guard();
    const items = new Map(inventory.map(item => [item.source.source_id, item]));
    const readSource = async source => {
      guard(); const item = items.get(source.source_id);
      if (!item) throw new Error('Snapshot original is not owned by this saved workflow.');
      const bytes = await findBasOriginal(adapter, item, () => { guard(); return true; }); guard(); return bytes;
    };
    return { readSource, replayCalculations };
  }
  function workingGuard(expected, guard) {
    return () => {
      guard(); const current = readWorkspace?.();
      if (!current || current.busy || current.pending || current.generation !== expected.generation
        || basRestoreJson(current.payload) !== expected.json)
        throw new Error('The workspace changed or has unsaved work. Finish saving, then check readiness again.');
    };
  }
  function view(plan) {
    const { record, payload_json } = readBasSnapshotPlan(plan);
    return { plan, record, readiness: JSON.parse(record.snapshot.readiness_json),
      workflow: JSON.parse(payload_json).bas_workflow, current_working_state: 'not_evaluated' };
  }
  return {
    dispose() { lifetime.abort(); },
    async preview(scopeEventId, { signal } = {}) {
      const op = operation(signal), live = readWorkspace?.();
      if (!live) throw new Error('The live workspace is unavailable. No approval was prepared.');
      const expected = { generation: live.generation, json: basRestoreJson(live.payload) };
      const guard = workingGuard(expected, op.guard); guard();
      const payload = await adapter.loadAnnotations(); guard();
      if (annotationGeneration(payload) !== expected.generation || basRestoreJson(payload) !== expected.json)
        throw new Error('Saved data does not match the open workspace. Wait for saving or reload, then check readiness again.');
      const io = await sourceIO(payload.bas_workflow, guard);
      const readiness = await buildBasReadiness(payload.bas_workflow, scopeEventId, io, op.signal); guard();
      const receipt = Object.freeze({ kind: 'bas_snapshot_browser_preview', readiness: structuredClone(readiness) });
      previews.set(receipt, { expected, payload: structuredClone(payload), scopeEventId }); return receipt;
    },
    async approve(preview, declaration, { signal } = {}) {
      const op = operation(signal), input = previews.get(preview);
      if (!input) throw new Error('Check readiness in this workspace before approving.');
      const guard = workingGuard(input.expected, op.guard); guard();
      const io = await sourceIO(input.payload.bas_workflow, guard);
      const plan = await prepareBasSnapshotApproval(input.payload,
        { ...declaration, scope_event_id: input.scopeEventId }, 'operator_input', io, op.signal); guard();
      // Check the COMPLETE archive bound before publishing any approval.
      await prepareBasSnapshotBundle(plan, guard); guard();
      const preparedView = view(plan);
      const receipt = await adapter.saveBasSnapshot(plan, io.readSource,
        { generation: input.expected.generation, guard, signal: op.signal });
      // Do not turn a successful commit into a claimed rollback if the UI
      // changes immediately after transaction completion. Return its receipt.
      return { ...preparedView, receipt };
    },
    async list({ after = null, signal } = {}) {
      const op = operation(signal);
      const result = await adapter.listBasSnapshots({ after, limit: 50, ...op }); op.guard(); return result;
    },
    async open(snapshotId, { signal } = {}) {
      const op = operation(signal);
      const plan = await adapter.loadBasSnapshot(snapshotId, { ...op, replayCalculations }); op.guard();
      if (!plan) throw new Error('This snapshot is not stored in this browser project. Import its evidence ZIP.');
      return view(plan);
    },
    async import(file, { signal } = {}) {
      const op = operation(signal);
      const archive = await openBasSnapshotBundle({ size: file.size,
        async read(offset, length) { op.guard(); return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()); },
      }, { replayCalculations }, op.signal); op.guard();
      await prepareBasSnapshotBundle(archive.plan, op.guard); op.guard();
      const preparedView = view(archive.plan);
      const receipt = await adapter.saveBasSnapshot(archive.plan, source => archive.readSource(source.source_id), op);
      return { ...preparedView, receipt };
    },
    async export(snapshotId, { signal } = {}) {
      const op = operation(signal);
      const plan = await adapter.loadBasSnapshot(snapshotId, { ...op, replayCalculations }); op.guard();
      if (!plan) throw new Error('Snapshot is unavailable. Nothing was exported.');
      const prepared = await prepareBasSnapshotBundle(plan, op.guard);
      const blob = await createBasEvidenceBundleBlob(prepared, async item => {
        const bytes = await adapter.loadBasSource(item.source); op.guard();
        if (!bytes) throw new Error('An original PDF is unavailable. Nothing was exported.');
        return bytes;
      }, op.guard);
      op.guard(); return { blob, filename: `${plan.snapshot_id}.otbas-snapshot.zip` };
    },
  };
}
