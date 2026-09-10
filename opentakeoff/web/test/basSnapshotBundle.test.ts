import test from 'node:test';
import assert from 'node:assert/strict';
import { Zip, ZipPassThrough, unzipSync } from 'fflate';
import { readinessFixture, reviewReadyScope } from './helpers/basReadinessFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan } from '../src/lib/basSnapshot.ts';
import { prepareBasEvidenceBundle, openBasEvidenceBundle, prepareBasSnapshotBundle, openBasSnapshotBundle } from '../src/lib/basEvidenceBundle.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';

const encode = (v: unknown) => new TextEncoder().encode(canonicalBasJson(v));
const reader = (bytes: Uint8Array) => ({ size: bytes.length, read: async (o: number, n: number) => bytes.subarray(o, o + n) });
const concat = (chunks: Uint8Array[]) => { const bytes = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0)); let o = 0;
  for (const b of chunks) { bytes.set(b, o); o += b.length; } return bytes; };
async function collect(stream: AsyncIterable<Uint8Array>) { const chunks = []; for await (const b of stream) chunks.push(b); return concat(chunks); }
function zip(entries: [string, Uint8Array][]) { const chunks: Uint8Array[] = [], archive = new Zip((e, d) => { if (e) throw e; chunks.push(d); });
  for (const [name, b] of entries) { const file = new ZipPassThrough(name); archive.add(file); file.push(b, true); }
  archive.end(); return concat(chunks); }
async function fixture(signal?: AbortSignal) {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow);
  const payload = { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: r.workflow, shapes: [], project_name: 'Controlled snapshot archive' };
  const plan = await prepareBasSnapshotApproval(payload, { operation_id: uuid(999), scope_event_id: r.scope.event_id,
    reviewer: 'Controlled operator', reason: 'Scoped acceptance', declared_at: '2026-09-10T17:00:00.000Z' }, 'operator_input', { readSource: async () => f.bytes }, signal);
  const prepared = await prepareBasSnapshotBundle(plan), archive = await collect(prepared.stream(async () => f.bytes));
  const sha256 = await sha256Hex(f.bytes);
  return { ...f, ...r, payload, plan, prepared, archive, original: { sha256, source_id: `sha256:${sha256}` } };
}

test('snapshot stored ZIP roundtrips exact payload, separate seal and original through shared verification', async () => {
  const f = await fixture(), independent = unzipSync(f.archive);
  assert.deepEqual(Object.keys(independent).sort(), ['README.txt', 'manifest.json', 'snapshot.json', `sources/${f.original.sha256}.pdf`, 'takeoff.json'].sort());
  assert.deepEqual(JSON.parse(new TextDecoder().decode(independent['takeoff.json'])), f.payload);
  const opened = await openBasSnapshotBundle(reader(f.archive));
  assert.equal(opened.status, 'verified_historical_scope'); assert.equal(opened.current_working_state, 'not_evaluated');
  assert.equal(opened.restored, false); assert.equal(opened.manifest.purpose, 'scoped_takeoff_snapshot');
  assert.deepEqual(readBasSnapshotPlan(opened.plan).record, readBasSnapshotPlan(f.plan).record);
  assert.deepEqual(await opened.readSource(f.original.source_id), f.bytes);
  assert.deepEqual(await collect((await prepareBasSnapshotBundle(opened.plan)).stream(async () => f.bytes)), f.archive);
  opened.snapshot_record!.snapshot.readiness_json = '{}'; opened.payload.project_name = 'Mutable display';
  assert.deepEqual(await collect((await prepareBasSnapshotBundle(opened.plan)).stream(async () => f.bytes)), f.archive);
});

test('unapproved backup and approved-snapshot import are explicit, incompatible operations', async () => {
  const f = await fixture(), backup = await collect((await prepareBasEvidenceBundle(f.payload)).stream(async () => f.bytes));
  await assert.rejects(openBasEvidenceBundle(reader(f.archive)), /Wrong BAS archive purpose/);
  await assert.rejects(openBasSnapshotBundle(reader(backup)), /Wrong BAS archive purpose/);
  await (await openBasEvidenceBundle(reader(backup))).verifyOriginals();
  await assert.rejects(prepareBasSnapshotBundle({ ...f.plan }), /owned, freshly verified/);
});

test('wrong original bytes fail reopening even after a valid ZIP CRC is regenerated', async () => {
  const f = await fixture(), entries = unzipSync(f.archive); entries[`sources/${f.original.sha256}.pdf`][0] ^= 1;
  await assert.rejects(openBasSnapshotBundle(reader(zip(Object.entries(entries)))), /digest mismatch/);
  const absent = Object.entries(unzipSync(f.archive)).filter(([name]) => !name.startsWith('sources/'));
  await assert.rejects(openBasSnapshotBundle(reader(zip(absent))), /does not own every entry/);
});

test('snapshot hash corruption and completely rehashed fabricated readiness both fail', async () => {
  const f = await fixture(), entries = unzipSync(f.archive), record = JSON.parse(new TextDecoder().decode(entries['snapshot.json']));
  const readiness = JSON.parse(record.snapshot.readiness_json); readiness.issues = [];
  record.snapshot.readiness_json = canonicalBasJson(readiness);
  entries['snapshot.json'] = encode(record);
  await assert.rejects(openBasSnapshotBundle(reader(zip(Object.entries(entries)))), /snapshot hash\/length mismatch/);
  record.snapshot_id = await sha256Hex(encode(record.snapshot)); record.seal.snapshot_id = record.snapshot_id;
  const { event_id: _id, ...seal } = record.seal; record.seal.event_id = await sha256Hex(encode(seal));
  entries['snapshot.json'] = encode(record);
  const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
  manifest.snapshot.sha256 = await sha256Hex(entries['snapshot.json']); manifest.snapshot.byte_length = entries['snapshot.json'].length;
  entries['manifest.json'] = encode(manifest);
  await assert.rejects(openBasSnapshotBundle(reader(zip(Object.entries(entries)))), /does not replay exactly/);
});

test('snapshot ZIP retains traversal/duplicate/extra-entry defenses and permanent plan cancellation guard', async () => {
  const controller = new AbortController(), f = await fixture(controller.signal), entries = Object.entries(unzipSync(f.archive));
  await assert.rejects(openBasSnapshotBundle(reader(zip([...entries, ['../snapshot.json', encode({})]]))), /Unsafe/);
  await assert.rejects(openBasSnapshotBundle(reader(zip([...entries, entries.find(([n]) => n === 'snapshot.json')!]))), /duplicate/);
  controller.abort();
  await assert.rejects(collect(f.prepared.stream(async () => f.bytes, () => {})), /abort/i);
  const late = new AbortController();
  await assert.rejects(openBasSnapshotBundle({ size: f.archive.length, async read(o, n) { late.abort(); return f.archive.subarray(o, o + n); } }, {}, late.signal), /abort/i);
});
