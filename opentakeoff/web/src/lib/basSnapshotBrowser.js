/** SHOULD THIS BE ON THE SHARED PATH? No: browser transport/lifetime only.
 * Readiness, snapshot authority, replay validation and archive content remain
 * shared. This module is not an Agent tool and never applies restored state. */
import { buildBasReadiness } from './basReadiness.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan } from './basSnapshot.ts';
import { assessBasSnapshotCurrentness, basSnapshotLifecycleExportSchema,
  evaluateBasSnapshotLifecycle, prepareBasSnapshotLifecycleEvent } from './basSnapshotLifecycle.ts';
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
  /** @param {any} plan @param {any} lifecycle */
  function view(plan, lifecycle = null) {
    const { record, payload_json } = readBasSnapshotPlan(plan);
    return { plan, record, readiness: JSON.parse(record.snapshot.readiness_json),
      workflow: JSON.parse(payload_json).bas_workflow, lifecycle,
      current_working_state: 'not_evaluated' };
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
      const receipt = await adapter.saveBasSnapshot(plan, io.readSource,
        { generation: input.expected.generation, guard, signal: op.signal });
      const lifecycle = await adapter.loadBasSnapshotLifecycle(plan, { signal: op.signal, guard }); guard();
      const preparedView = view(plan, lifecycle);
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
      const lifecycle = await adapter.loadBasSnapshotLifecycle(plan, op); op.guard();
      return view(plan, lifecycle);
    },
    async import(file, { signal } = {}) {
      const op = operation(signal);
      const archive = await openBasSnapshotBundle({ size: file.size,
        async read(offset, length) { op.guard(); return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()); },
      }, { replayCalculations }, op.signal); op.guard();
      await prepareBasSnapshotBundle(archive.plan, op.guard); op.guard();
      const receipt = await adapter.saveBasSnapshot(archive.plan, source => archive.readSource(source.source_id), op);
      const lifecycle = await adapter.loadBasSnapshotLifecycle(archive.plan, op); op.guard();
      const preparedView = view(archive.plan, lifecycle);
      return { ...preparedView, receipt };
    },
    async importLifecycle(file, { signal } = {}) {
      const op = operation(signal);
      if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 16 * 1024 ** 2)
        throw new Error('Snapshot lifecycle JSON must be no larger than 16 MiB. Nothing was imported.');
      const exported = basSnapshotLifecycleExportSchema.parse(JSON.parse(await file.text())); op.guard();
      const plan = await adapter.loadBasSnapshot(exported.snapshot_id, { ...op, replayCalculations }); op.guard();
      if (!plan) throw new Error('Import the matching snapshot evidence ZIP before its lifecycle JSON.');
      const { record } = readBasSnapshotPlan(plan);
      const expected = await evaluateBasSnapshotLifecycle(record, exported.lifecycle.events); op.guard();
      if (canonicalBasJson(expected) !== canonicalBasJson(exported.lifecycle.state))
        throw new Error('Snapshot lifecycle JSON does not replay to its declared state. Nothing was imported.');
      for (const event of exported.lifecycle.events) {
        await adapter.saveBasSnapshotLifecycle(plan, event, op); op.guard();
      }
      const lifecycle = await adapter.loadBasSnapshotLifecycle(plan, op); op.guard();
      if (canonicalBasJson(lifecycle.state) !== canonicalBasJson(expected))
        throw new Error('Stored snapshot lifecycle conflicts with the imported history. Nothing was replaced.');
      return view(plan, lifecycle);
    },
    async export(snapshotId, { signal } = {}) {
      const op = operation(signal);
      const plan = await adapter.loadBasSnapshot(snapshotId, { ...op, replayCalculations }); op.guard();
      if (!plan) throw new Error('Snapshot is unavailable. Nothing was exported.');
      const lifecycle = await adapter.loadBasSnapshotLifecycle(plan, op); op.guard();
      const prepared = await prepareBasSnapshotBundle(plan, op.guard);
      const blob = await createBasEvidenceBundleBlob(prepared, async item => {
        const bytes = await adapter.loadBasSource(item.source); op.guard();
        if (!bytes) throw new Error('An original PDF is unavailable. Nothing was exported.');
        return bytes;
      }, op.guard);
      op.guard(); return { blob, filename: `${plan.snapshot_id}.otbas-snapshot.zip`, lifecycle,
        lifecycle_filename: `${plan.snapshot_id}.lifecycle.json` };
    },
    async currentness(plan, { signal } = {}) {
      const op = operation(signal), live = readWorkspace?.();
      if (!live) throw new Error('The live workspace is unavailable. Historical currentness was not evaluated.');
      const expected = { generation: live.generation, json: basRestoreJson(live.payload) };
      const guard = workingGuard(expected, op.guard); guard();
      const payload = await adapter.loadAnnotations(); guard();
      if (annotationGeneration(payload) !== expected.generation || basRestoreJson(payload) !== expected.json)
        throw new Error('Saved data does not match the open workspace. Wait for saving or reload, then check currentness again.');
      if (!payload.bas_workflow) throw new Error('The current workspace has no retained BAS workflow.');
      const lifecycle = await adapter.loadBasSnapshotLifecycle(plan, { signal: op.signal, guard }); guard();
      const io = await sourceIO(payload.bas_workflow, guard);
      return assessBasSnapshotCurrentness(plan, payload.bas_workflow, lifecycle.events, io, op.signal);
    },
    async recordLifecycle(plan, request, { signal } = {}) {
      const op = operation(signal), lifecycle = await adapter.loadBasSnapshotLifecycle(plan, op); op.guard();
      const { record } = readBasSnapshotPlan(plan);
      if (request?.action?.kind === 'supersede') {
        if (request.action.successor_snapshot_id === record.snapshot_id) throw new Error('A snapshot cannot supersede itself.');
        const successor = await adapter.loadBasSnapshot(request.action.successor_snapshot_id, { ...op, replayCalculations }); op.guard();
        if (!successor) throw new Error('The successor snapshot is not stored and verified in this browser project. Import or create it first.');
      }
      const event = await prepareBasSnapshotLifecycleEvent(record, lifecycle.events, request, 'operator_input'); op.guard();
      const receipt = await adapter.saveBasSnapshotLifecycle(plan, event, op); op.guard();
      const updated = await adapter.loadBasSnapshotLifecycle(plan, op); op.guard();
      return { ...view(plan, updated), receipt };
    },
  };
}
