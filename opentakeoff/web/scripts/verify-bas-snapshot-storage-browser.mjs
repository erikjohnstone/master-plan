// Native Chromium transaction/reload proof with controlled evidence. This is NOT
// a user-facing approval journey, real-PDF extraction or independent BAS truth.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '5177')
  throw new Error('Pass the owned isolated Vite origin http://127.0.0.1:5177');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(url); await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
  const initial = await page.evaluate(async () => {
    const fixture = await import('/test/helpers/basSnapshotBrowserFixture.ts');
    const { readinessFixture, reviewReadyScope, uuid, createLocalStore } = fixture, snapshots = fixture;
    const f = await readinessFixture(), r = await reviewReadyScope(f.workflow);
    const payload = { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: r.workflow, shapes: [], project_name: 'Controlled browser snapshot' };
    const request = { operation_id: uuid(950), scope_event_id: r.scope.event_id, reviewer: 'Controlled browser test',
      reason: 'Controlled transaction/reload test, not a human review or real PDF takeoff', declared_at: '2026-09-10T17:00:00.000Z' };
    const store = createLocalStore('snapshot-controlled-proof'); await store.saveAnnotations(payload);
    const plan = await snapshots.prepareBasSnapshotApproval(payload, request, 'operator_input', { readSource: async () => f.bytes });
    const add = IDBObjectStore.prototype.add; let durability;
    IDBObjectStore.prototype.add = function (value, key) {
      if (Array.isArray(key) && key[0] === 'bas_snapshot_seal_v1') durability = this.transaction.durability;
      return add.call(this, value, key);
    };
    const start = performance.now(); let receipt;
    try { receipt = await store.saveBasSnapshot(plan, async () => f.bytes); }
    finally { IDBObjectStore.prototype.add = add; }
    if (durability !== 'strict') throw new Error('Final native transaction did not request strict durability');
    const save_ms = performance.now() - start, replayed = await store.loadBasSnapshot(plan.snapshot_id);
    if (!replayed) throw new Error('Committed snapshot missing');
    const owned = snapshots.readBasSnapshotPlan(replayed);
    if (owned.payload_json !== snapshots.readBasSnapshotPlan(plan).payload_json) throw new Error('Payload changed in native storage');
    return { snapshot_id: plan.snapshot_id, receipt, save_ms, durability, payload_json: owned.payload_json };
  });
  assert.equal(initial.receipt.committed, true); assert.equal(initial.receipt.annotations_changed, false);
  await page.reload(); await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
  const after = await page.evaluate(async ({ snapshot_id, payload_json }) => {
    const { createLocalStore, metaGet, metaPut, readBasSnapshotPlan } = await import('/test/helpers/basSnapshotBrowserFixture.ts');
    const store = createLocalStore('snapshot-controlled-proof'), start = performance.now();
    const plan = await store.loadBasSnapshot(snapshot_id);
    if (!plan || readBasSnapshotPlan(plan).payload_json !== payload_json) throw new Error('Native page reload changed snapshot content');
    const reopen_ms = performance.now() - start, list = await store.listBasSnapshots();
    if (list.items.length !== 1 || list.items[0].verification !== 'not_replayed') throw new Error('List supplied false verification');
    const k = ['bas_snapshot_payload_chunk_v1', 'snapshot-controlled-proof', snapshot_id, 0];
    const bytes = await metaGet(k); new Uint8Array(bytes)[0] ^= 1; await metaPut(k, bytes);
    let refused = false;
    try { await store.loadBasSnapshot(snapshot_id); } catch { refused = true; }
    if (!refused) throw new Error('Corrupt native stored payload was accepted');
    return { reopen_ms, survives_page_reload: true, corrupt_payload_refused: refused };
  }, initial);
  console.log(JSON.stringify({ proof: 'native_browser_snapshot_storage', browser: browser.version(), url,
    fixture: 'controlled_evidence_no_saved_calculations', public_ui_walkthrough: false, real_pdf: false,
    snapshot_id: initial.snapshot_id, save_ms: initial.save_ms, durability: initial.durability, ...after }));
  await context.close();
} finally { await browser.close(); }
