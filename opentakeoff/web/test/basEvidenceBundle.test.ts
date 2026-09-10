import test from 'node:test';
import assert from 'node:assert/strict';
import { Zip, ZipPassThrough, unzipSync, zipSync } from 'fflate';
import { prepareBasEvidenceBundle, openBasEvidenceBundle, BAS_BUNDLE_LIMITS } from '../src/lib/basEvidenceBundle.ts';
import { captureBasPoints, mergeBasWorkflows } from '../src/lib/basWorkflow.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';

async function fixture(text = '%PDF-controlled-original', name = 'same.pdf') {
  const data = new TextEncoder().encode(text), sha256 = await sha256Hex(data);
  const source = { source_id: `sha256:${sha256}`, sha256, byte_length: data.length, page_count: 1, names: [name] };
  const workflow = await captureBasPoints([source], { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
    scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
  return { data, source, workflow, payload: { schema: 'opentakeoff.takeoff_canvas.v1', project_name: 'Exact 雪', bas_workflow: workflow, shapes: [], extra: { null: null, zero: 0, text: '  unchanged\n' } } };
}
function concat(chunks: Uint8Array[]) { const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; } return out; }
async function collect(stream: AsyncIterable<Uint8Array>) { const chunks: Uint8Array[] = []; for await (const c of stream) chunks.push(c); return concat(chunks); }
const reader = (data: Uint8Array) => ({ size: data.length, async read(offset: number, length: number) { return data.subarray(offset, offset + length); } });
function rawZip(entries: [string, Uint8Array][]) { const chunks: Uint8Array[] = [];
  const zip = new Zip((error, data) => { if (error) throw error; chunks.push(data); });
  for (const [name, bytes] of entries) { const file = new ZipPassThrough(name); zip.add(file); file.push(bytes, true); }
  zip.end(); return concat(chunks); }

test('deterministic bundle carries exact JSON and every historical source; independent unzip reads standard ZIP', async () => {
  const a = await fixture(), b = await fixture('%PDF-controlled-revised');
  const payload = { ...a.payload, bas_workflow: mergeBasWorkflows(a.workflow, b.workflow)! };
  const before = structuredClone(payload), prepared = await prepareBasEvidenceBundle(payload);
  const loader = async (item: { source: { sha256: string } }) => item.source.sha256 === a.source.sha256 ? a.data : b.data;
  const bytes = await collect(prepared.stream(loader));
  assert.deepEqual(await collect((await prepareBasEvidenceBundle(payload)).stream(loader)), bytes);
  const unzipped = unzipSync(bytes); assert.equal(Object.keys(unzipped).length, 5);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unzipped['takeoff.json'])), payload);
  assert.deepEqual(unzipped[`sources/${a.source.sha256}.pdf`], a.data);
  const opened = await openBasEvidenceBundle(reader(bytes)); await opened.verifyOriginals();
  assert.equal(opened.bundle_id, prepared.bundle_id); assert.deepEqual(opened.payload, payload);
  assert.deepEqual(await opened.readSource(a.source.source_id), a.data);
  assert.deepEqual(await opened.readSource(b.source.source_id), b.data);
  assert.equal(opened.manifest.purpose, 'unapproved_evidence_backup');
  assert.deepEqual(payload, before);
});

test('export refuses wrong/missing source bytes and late cancellation; never finishes an invalid ZIP', async () => {
  const a = await fixture(), prepared = await prepareBasEvidenceBundle(a.payload);
  const changed = a.data.slice(); changed[0] ^= 1;
  await assert.rejects(collect(prepared.stream(async () => changed)), /digest mismatch/);
  await assert.rejects(collect(prepared.stream(async () => { throw new Error('missing source'); })), /missing source/);
  let cancelled = false;
  await assert.rejects(collect(prepared.stream(async () => { cancelled = true; return a.data; }, () => { if (cancelled) throw new Error('cancelled'); })), /cancelled/);
});

test('caller mutation cannot change frozen archive ownership, metadata or subsequent source reads', async () => {
  const a = await fixture(), prepared = await prepareBasEvidenceBundle(a.payload);
  prepared.manifest.sources[0].source.sha256 = 'f'.repeat(64);
  const bytes = await collect(prepared.stream(async item => { item.source.sha256 = 'e'.repeat(64); return a.data; }));
  const opened = await openBasEvidenceBundle(reader(bytes));
  opened.manifest.sources[0].source.source_id = `sha256:${'d'.repeat(64)}`;
  assert.deepEqual(await opened.readSource(a.source.source_id), a.data);
  await assert.rejects(opened.readSource(`sha256:${'d'.repeat(64)}`), /does not own/);
  const directory = unzipSync(bytes), original = directory[`sources/${a.source.sha256}.pdf`];
  original[0] ^= 1;
  const tampered = await openBasEvidenceBundle(reader(rawZip(Object.entries(directory))));
  await assert.rejects(tampered.verifyOriginals(), /digest mismatch/);
});

test('strict container rejects paths, duplicate entries, compressed/encrypted entries and fake size declarations', async () => {
  const a = await fixture(), bytes = await collect((await prepareBasEvidenceBundle(a.payload)).stream(async () => a.data));
  const entries = Object.entries(unzipSync(bytes));
  await assert.rejects(openBasEvidenceBundle(reader(rawZip([...entries, ['../takeoff.json', a.data]]))), /Unsafe/);
  await assert.rejects(openBasEvidenceBundle(reader(rawZip([...entries, entries[0]]))), /duplicate/);
  await assert.rejects(openBasEvidenceBundle(reader(rawZip([...entries, ['/tmp/evil', a.data]]))), /Unsafe/);
  await assert.rejects(openBasEvidenceBundle(reader(zipSync(Object.fromEntries(entries), { level: 6 }))), /unencrypted stored/);
  const encrypted = bytes.slice(), offset = new DataView(encrypted.buffer).getUint32(encrypted.length - 6, true);
  new DataView(encrypted.buffer).setUint16(offset + 8, 9, true);
  await assert.rejects(openBasEvidenceBundle(reader(encrypted)), /unencrypted stored/);
  let reads = 0;
  await assert.rejects(openBasEvidenceBundle({ size: BAS_BUNDLE_LIMITS.archive + 1, async read() { reads++; return bytes; } }), /size/);
  assert.equal(reads, 0, 'oversized archive refused before allocation/read');
});

test('header inconsistencies, offsets, CRC changes, truncation and extra content refuse before restore', async () => {
  const a = await fixture(), bytes = await collect((await prepareBasEvidenceBundle(a.payload)).stream(async () => a.data));
  const local = bytes.slice(); local[30] ^= 1;
  await assert.rejects(openBasEvidenceBundle(reader(local)), /headers disagree/);
  const descriptor = bytes.slice(), v = new DataView(descriptor.buffer), cd = v.getUint32(descriptor.length - 6, true);
  v.setUint32(cd + 42, 1, true);
  await assert.rejects(openBasEvidenceBundle(reader(descriptor)), /Overlapping/);
  const crc = bytes.slice(), nameLength = new DataView(crc.buffer).getUint16(26, true); crc[30 + nameLength] ^= 1;
  await assert.rejects(openBasEvidenceBundle(reader(crc)), /CRC mismatch/);
  await assert.rejects(openBasEvidenceBundle(reader(bytes.subarray(0, -1))), /directory/);
  await assert.rejects(openBasEvidenceBundle(reader(concat([bytes, new Uint8Array([0])]))), /directory/);
});

test('unowned inventory/missing PDFs/altered disclosure reject despite a structurally valid ZIP', async () => {
  const a = await fixture(), bytes = await collect((await prepareBasEvidenceBundle(a.payload)).stream(async () => a.data));
  const directory = unzipSync(bytes), path = `sources/${a.source.sha256}.pdf`;
  const missing = Object.entries(directory).filter(([name]) => name !== path);
  await assert.rejects(openBasEvidenceBundle(reader(rawZip(missing))), /directory/);
  const wrong = { ...directory, 'README.txt': new TextEncoder().encode('approved') };
  await assert.rejects(openBasEvidenceBundle(reader(rawZip(Object.entries(wrong)))), /disclosure was changed/);
  const doc = JSON.parse(new TextDecoder().decode(directory['manifest.json'])); doc.sources[0].names = ['forged.pdf'];
  const { canonicalBasJson } = await import('../src/lib/basCanonical.ts');
  const manifest = { ...directory, 'manifest.json': new TextEncoder().encode(canonicalBasJson(doc)) };
  await assert.rejects(openBasEvidenceBundle(reader(rawZip(Object.entries(manifest)))), /does not own/);
});

test('payload must be canonical and hash-bound even inside a structurally valid archive', async () => {
  const a = await fixture(), bytes = await collect((await prepareBasEvidenceBundle(a.payload)).stream(async () => a.data));
  const directory = unzipSync(bytes), manifest = JSON.parse(new TextDecoder().decode(directory['manifest.json']));
  const changed = new TextEncoder().encode(JSON.stringify(a.payload, null, 2));
  manifest.payload.sha256 = await sha256Hex(changed); manifest.payload.byte_length = changed.length;
  const { canonicalBasJson } = await import('../src/lib/basCanonical.ts');
  await assert.rejects(openBasEvidenceBundle(reader(rawZip(Object.entries({ ...directory, 'takeoff.json': changed,
    'manifest.json': new TextEncoder().encode(canonicalBasJson(manifest)) })))), /Noncanonical.*takeoff/);
  manifest.payload.sha256 = '0'.repeat(64);
  await assert.rejects(openBasEvidenceBundle(reader(rawZip(Object.entries({ ...directory, 'takeoff.json': changed,
    'manifest.json': new TextEncoder().encode(canonicalBasJson(manifest)) })))), /hash\/length mismatch/);
});

test('reader cancellation and incorrect read lengths cannot produce a successful inspection', async () => {
  const a = await fixture(), bytes = await collect((await prepareBasEvidenceBundle(a.payload)).stream(async () => a.data));
  let cancelled = false;
  await assert.rejects(openBasEvidenceBundle({ size: bytes.length, async read(offset, length) {
    cancelled = true; return bytes.subarray(offset, offset + length);
  } }, () => { if (cancelled) throw new Error('cancelled'); }), /cancelled/);
  await assert.rejects(openBasEvidenceBundle({ size: bytes.length, async read() { return new Uint8Array(1); } }), /truncated/);
});
