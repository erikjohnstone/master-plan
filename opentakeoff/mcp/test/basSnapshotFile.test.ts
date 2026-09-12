/** Controlled source bytes, not a real-PDF approval claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readinessFixture, reviewReadyScope } from '../../web/test/helpers/basReadinessFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan } from '../../web/src/lib/basSnapshot.ts';
import { prepareBasSnapshotBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { basSnapshotLifecycleExport, prepareBasSnapshotLifecycleEvent,
  evaluateBasSnapshotLifecycle } from '../../web/src/lib/basSnapshotLifecycle.ts';
import { inspectBasSnapshotFile, basSnapshotFileInspectionSchema } from '../src/basSnapshotFile.ts';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';

test('public snapshot file verifier replays originals/calculations/lifecycle and exports readable non-commercial tables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ot-snapshot-file-'));
  try {
    const f = await readinessFixture(), ready = await reviewReadyScope(f.workflow);
    const payload = { schema: 'opentakeoff.takeoff_canvas.v1', shapes: [], bas_workflow: ready.workflow, project_name: 'MCP snapshot fixture' };
    const plan = await prepareBasSnapshotApproval(payload, { operation_id: uuid(970), scope_event_id: ready.scope.event_id,
      reviewer: 'Controlled reviewer', reason: 'Only the declared test scope', declared_at: '2026-09-10T20:00:00.000Z' },
    'operator_input', { readSource: async () => f.bytes });
    const archive = await prepareBasSnapshotBundle(plan), chunks = [];
    for await (const chunk of archive.stream(async () => f.bytes)) chunks.push(chunk);
    const archivePath = join(directory, 'reviewed.otbas-snapshot.zip');
    await writeFile(archivePath, Buffer.concat(chunks));
    const record = readBasSnapshotPlan(plan).record, state = await evaluateBasSnapshotLifecycle(record, []);
    const event = await prepareBasSnapshotLifecycleEvent(record, [], { operation_id: uuid(971), expected_head: state.head,
      reviewer: 'Controlled reviewer', reason: 'Superseded after a reviewed update', declared_at: '2026-09-11T20:00:00.000Z',
      action: { kind: 'supersede', successor_snapshot_id: 'b'.repeat(64) } }, 'operator_input');
    const lifecycle = { events: [event], state: await evaluateBasSnapshotLifecycle(record, [event]) };
    const lifecyclePath = join(directory, 'reviewed.lifecycle.json');
    await writeFile(lifecyclePath, JSON.stringify(basSnapshotLifecycleExport(record.snapshot_id, lifecycle)));
    const workbookPath = join(directory, 'reviewed.xlsx');
    const result = await inspectBasSnapshotFile({} as Session, archivePath, { lifecyclePath, workbookPath });
    assert.equal(basSnapshotFileInspectionSchema.safeParse(result).success, true);
    assert.equal(result.status, 'verified_historical_scope'); assert.equal(result.lifecycle_status, 'superseded');
    assert.equal(result.calculation_verification, 'no_saved_calculations'); assert.equal(result.currentness.status, 'not_evaluated');
    assert.equal(result.project_complete, false); assert.equal(result.installed_quantity, null);
    const files = unzipSync(await readFile(workbookPath));
    assert.ok(files['xl/workbook.xml']);
    const workbook = new TextDecoder().decode(files['xl/workbook.xml']);
    for (const tab of ['SUMMARY', 'CLAIMS', 'EXCLUSIONS', 'FINDINGS', 'SOURCES', 'LIFECYCLE']) assert.match(workbook, new RegExp(`name="${tab}"`));
    const session = new Session(), server = buildServer(session);
    const client = new Client({ name: 'bas-snapshot-file-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    try {
      const response = await client.callTool({ name: 'inspect_bas_snapshot', arguments: {
        path: archivePath, lifecycle_path: lifecyclePath,
      } });
      assert.equal(response.isError, undefined, JSON.stringify(response));
      const body = JSON.parse((response.content as { type: string; text?: string }[])
        .find(item => item.type === 'text')!.text!);
      const throughTool = basSnapshotFileInspectionSchema.parse(body.result);
      assert.equal(throughTool.snapshot_id, result.snapshot_id);
      assert.equal(throughTool.lifecycle_status, 'superseded');
      assert.equal(throughTool.workbook_path, null);
    } finally { await client.close(); await server.close(); }
    const wrong = basSnapshotLifecycleExport('c'.repeat(64), lifecycle);
    await writeFile(lifecyclePath, JSON.stringify(wrong));
    await assert.rejects(inspectBasSnapshotFile({} as Session, archivePath, { lifecyclePath }), /another snapshot/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
