import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureBasPoints, mergeBasWorkflows, verifyBasWorkflow, retainBasWorkflowHistory, basEventFingerprint } from '../src/lib/basWorkflow.ts';
import { mergeAnnotations } from '../src/lib/sync/merge.js';
import { createSyncStore } from '../src/lib/sync/syncStore.js';
import { createLocalStore, metaGet, metaPut, localStore } from '../src/lib/store.js';

// Controlled persistence fixtures, not extraction/accuracy ground truth.
async function capture(label: string) {
  const sha256 = 'a'.repeat(64);
  return captureBasPoints([{ source_id: `sha256:${sha256}`, sha256, byte_length: 10, page_count: 1, names: ['controlled.pdf'] }], {
    schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1', scope: 'discovered_matrices_only',
    project_complete: false, issues: [label], matrices: [],
  });
}

test('sync merges disjoint BAS captures instead of silently replacing local history', async () => {
  const a = await capture('base'), b = await capture('local'), c = await capture('remote');
  const base = { bas_workflow: a }, local = { bas_workflow: mergeBasWorkflows(a, b)! }, remote = { bas_workflow: mergeBasWorkflows(a, c)! };
  const before = structuredClone({ base, local, remote });
  const result: any = mergeAnnotations(base, local, remote);
  assert.equal(result.merged.bas_workflow.captures.length, 3);
  assert.equal(result.clean, true);
  assert.deepEqual(await verifyBasWorkflow(result.merged.bas_workflow), result.merged.bas_workflow);
  assert.deepEqual({ base, local, remote }, before);
});

test('older or missing snapshots cannot delete known history; navigation stays explicitly selected', async () => {
  const a = await capture('base'), b = await capture('next');
  const newer = mergeBasWorkflows(a, b, true)!;
  const cleared = { ...newer, current_capture_id: null };
  assert.equal(retainBasWorkflowHistory(cleared, a)!.current_capture_id, null);
  assert.equal(retainBasWorkflowHistory(a, newer)!.current_capture_id, a.current_capture_id);
  for (const local of [{}, { bas_workflow: null }, { bas_workflow: a }]) {
    const result: any = mergeAnnotations({ bas_workflow: newer }, local, {});
    assert.equal(result.merged.bas_workflow.captures.length, 2);
    await verifyBasWorkflow(result.merged.bas_workflow);
  }
});

let sequence = 0;
async function setup(local: any, remote: any, options: { ancestor?: any; rev?: number | null; touched?: boolean; snapshotFails?: boolean } = {}) {
  const scope = `bas-history-${++sequence}`, base = createLocalStore(scope);
  await base.saveAnnotations(local);
  if (options.touched !== false) await metaPut(`sync:${scope}:touched`, true);
  if (options.rev !== undefined) await metaPut(`sync:${scope}:synced_rev`, options.rev);
  if (options.ancestor) await metaPut(`sync:${scope}:synced_base`, { rev: options.rev, data: options.ancestor });
  const provider = {
    remote: structuredClone(remote), writes: [] as any[], failPull: false,
    async pull() { if (this.failPull) throw new Error('offline'); return structuredClone(this.remote); },
    async push(data: any, { expectedRev }: any) {
      if (expectedRev != null && (this.remote?.rev ?? null) !== expectedRev) return { conflict: true, remote: structuredClone(this.remote) };
      const rev = (expectedRev ?? this.remote?.rev ?? 0) + 1;
      this.writes.push(structuredClone(data)); this.remote = { data: structuredClone(data), rev };
      return { rev };
    },
  };
  const notices: any[] = [], snapshots: any[] = [];
  const sync: any = createSyncStore({ base, provider, folderId: scope, onSyncIssue: issue => notices.push(issue),
    saveSnapshot: async (label, data, project) => {
      if (options.snapshotFails) throw new Error('controlled snapshot failure');
      const saved = await localStore.saveSnapshot(label, data, project);
      snapshots.push({ ...saved, payload: structuredClone(data) }); return saved;
    } });
  await sync.whenSynced(); await sync.whenPushed();
  return { sync, base, provider, scope, notices, snapshots };
}

test('actual sync adoption retains independent captures and republishes the verified union', async () => {
  const a = await capture('ancestor'), b = await capture('local'), c = await capture('remote');
  const initial = { bas_workflow: mergeBasWorkflows(a, b)!, project_name: 'Local' };
  const h = await setup(initial, { data: { bas_workflow: mergeBasWorkflows(a, c)!, project_name: 'Remote' }, rev: 2 },
    { rev: 1, ancestor: { bas_workflow: a, project_name: 'Ancestor' } });
  await h.sync.checkRemote(); await h.sync.whenPushed();
  const saved = await h.base.loadAnnotations();
  assert.equal(saved.bas_workflow.captures.length, 3);
  assert.deepEqual(await verifyBasWorkflow(saved.bas_workflow), saved.bas_workflow);
  assert.deepEqual(h.provider.remote.data.bas_workflow, saved.bas_workflow);
  assert.equal(h.snapshots.length, 0, 'compatible history is not a conflict');
  assert.equal(await h.sync.readSyncIssue(), undefined);
});

test('rev-less/regressed and no-ancestor reconciliation also preserves local BAS history', async () => {
  for (const rev of [null, 1, 9]) {
    const a = await capture(`local-${rev}`), b = await capture(`remote-${rev}`);
    const h = await setup({ bas_workflow: a }, { data: { bas_workflow: b }, rev }, { rev: 4 });
    await h.sync.checkRemote(); await h.sync.whenPushed();
    const saved = await h.base.loadAnnotations();
    assert.equal(saved.bas_workflow.captures.length, 2);
    assert.deepEqual(h.provider.remote.data.bas_workflow, saved.bas_workflow);
    assert.equal(h.snapshots.length, 1, 'legacy non-BAS fallback still banks local before adoption');
  }
});

test('untouched seed preserves existing BAS work and repushes it without fabricating approval', async () => {
  const a = await capture('local seed'), b = await capture('remote seed');
  const h = await setup({ bas_workflow: a }, { data: { bas_workflow: b }, rev: 3 }, { touched: false });
  assert.equal((await h.base.loadAnnotations()).bas_workflow.captures.length, 2);
  assert.deepEqual(h.provider.remote.data.bas_workflow, (await h.base.loadAnnotations()).bas_workflow);
  assert.equal(h.provider.remote.data.approved, undefined);
});

test('first push discovers remote BAS even when the local snapshot has none', async () => {
  const a = await capture('remote only');
  const h = await setup({ project_name: 'New local' }, { data: { bas_workflow: a }, rev: null });
  await h.sync.saveAnnotations({ project_name: 'Changed local' }); await h.sync.whenPushed();
  assert.deepEqual((await h.base.loadAnnotations()).bas_workflow, a);
  assert.deepEqual(h.provider.remote.data.bas_workflow, a);
  assert.equal(h.provider.remote.data.project_name, 'Changed local');
});

test('an old local autosave cannot push missing BAS over the known ancestor, including a deleted remote file', async () => {
  const a = await capture('retained ancestor');
  const h = await setup({ bas_workflow: a }, null, { ancestor: { bas_workflow: a }, rev: null });
  await h.sync.saveAnnotations({ project_name: 'Older snapshot' }); await h.sync.whenPushed();
  assert.deepEqual((await h.base.loadAnnotations()).bas_workflow, a);
  assert.deepEqual(h.provider.remote.data.bas_workflow, a);
});

test('unverified or conflicting remote history is backed up, not adopted/pushed, with a durable deduplicated notice', async () => {
  const a = await capture('retained'), bad = structuredClone(await capture('bad'));
  bad.captures[0].points.issues.push('changed without updating fingerprint');
  const h = await setup({ bas_workflow: a }, { data: { bas_workflow: bad }, rev: 2 }, { rev: 1, ancestor: { bas_workflow: a } });
  for (let i = 0; i < 2; i++) { await h.sync.checkRemote(); await h.sync.flushPending(); }
  assert.deepEqual((await h.base.loadAnnotations()).bas_workflow, a);
  assert.equal(h.provider.writes.length, 0);
  assert.equal(await metaGet(`sync:${h.scope}:synced_rev`), 1);
  assert.equal(h.snapshots.length, 1);
  const issue = await h.sync.readSyncIssue();
  assert.match(issue.detail, /fingerprint/);
  assert.equal(issue.snapshot_id, h.snapshots[0].id);
  assert.deepEqual((await localStore.getSnapshot(issue.snapshot_id, h.scope)).payload, { bas_workflow: bad });
  await h.sync.saveAnnotations({ bas_workflow: a, project_name: 'Still editable locally' }); await h.sync.whenPushed();
  assert.equal(h.provider.writes.length, 0, 'later local saves do not bypass the conflict');
  h.provider.remote = { data: { bas_workflow: a }, rev: 2 };
  await h.sync.checkRemote(); await h.sync.whenPushed();
  assert.equal(await h.sync.readSyncIssue(), undefined);
  assert.equal(h.notices.at(-1), null);
});

test('failed backup and failed network reads never authorize a BAS overwrite', async () => {
  const a = await capture('saved'), bad = structuredClone(a); bad.captures[0].points.issues.push('corrupt');
  const h = await setup({ bas_workflow: a }, { data: { bas_workflow: bad }, rev: 2 }, { rev: 1, snapshotFails: true });
  await h.sync.checkRemote();
  assert.equal((await h.sync.readSyncIssue()).snapshot_id, null);
  assert.deepEqual((await h.base.loadAnnotations()).bas_workflow, a);
  h.provider.failPull = true;
  await h.sync.saveAnnotations({ bas_workflow: a }); await h.sync.whenPushed();
  assert.equal(h.provider.writes.length, 0);
});

test('a same-rev crash marker does not certify a different BAS history as the landed push', async () => {
  const a = await capture('local crash'), b = await capture('remote crash');
  const h = await setup({ bas_workflow: a, project_name: 'Unpushed local edit', shapes: [{ id: 'local-shape' }] },
    { data: { bas_workflow: b, project_name: 'Older remote', shapes: [] }, rev: 2 }, { rev: 1 });
  await metaPut(`sync:${h.scope}:marker`, { baseRev: 1, targetRev: 2 });
  const restarted: any = createSyncStore({ base: h.base, provider: h.provider, folderId: h.scope,
    saveSnapshot: (label, data, project) => localStore.saveSnapshot(label, data, project) });
  await restarted.whenSynced(); await restarted.whenPushed();
  assert.equal((await h.base.loadAnnotations()).bas_workflow.captures.length, 2);
  assert.equal((await h.base.loadAnnotations()).project_name, 'Unpushed local edit');
  assert.deepEqual((await h.base.loadAnnotations()).shapes, [{ id: 'local-shape' }]);
  assert.deepEqual(h.provider.remote.data.bas_workflow, (await h.base.loadAnnotations()).bas_workflow);
});

test('real retained 31-calculation history survives a prefix merge; a controlled competing review branch is refused', async () => {
  const real = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8')).bas_workflow;
  const prefix = structuredClone(real); prefix.engineering_events.pop();
  const retained = retainBasWorkflowHistory(prefix, real)!;
  await verifyBasWorkflow(retained);
  assert.deepEqual(retained, real);
  assert.equal(retained.assembly_calculations!.length + retained.engineering_events!.length, 31);
  const fork = structuredClone(real), last = fork.engineering_events.at(-1);
  last.operation_id = '00000000-0000-4000-8000-000000987654'; last.reason = 'CONTROLLED alternate review decision, not a real addendum';
  const { event_id: _eventId, ...body } = last; last.event_id = await basEventFingerprint(body);
  await verifyBasWorkflow(fork);
  assert.throws(() => retainBasWorkflowHistory(real, fork), /Divergent/);
  const h = await setup({ bas_workflow: real }, { data: { bas_workflow: fork }, rev: 2 }, { rev: 1, ancestor: { bas_workflow: prefix } });
  await h.sync.checkRemote(); await h.sync.whenPushed();
  assert.equal(h.provider.writes.length, 0);
  assert.match((await h.sync.readSyncIssue()).detail, /Divergent/);
  assert.deepEqual((await h.base.loadAnnotations()).bas_workflow, real);
});
