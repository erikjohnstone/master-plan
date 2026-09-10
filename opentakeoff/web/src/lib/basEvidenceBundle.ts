/** Shared source-inclusive transport. Not approval, calculation replay, or a
 * general ZIP extractor. No surface-specific paths, storage or downloads here. */
import { z } from 'zod';
import { Zip, ZipPassThrough } from 'fflate';
import { canonicalBasJson } from './basCanonical.ts';
import { basSourceInventory, basRetainedSourceSchema, verifyBasSourceBytes, type BasSourceInventoryItem } from './basSourceRetention.ts';
import { parseTakeoffImport } from './importTakeoff.js';
import { sha256Hex } from './graphKeys.js';
import { basWorkflowReplayReceiptSchema } from './basWorkflowReplay.ts';

export const BAS_BUNDLE_LIMITS = Object.freeze({ sources: 10000, pdf: 512 * 1024 ** 2,
  payload: 256 * 1024 ** 2, manifest: 16 * 1024 ** 2, archive: 2 ** 31 - 1, chunk: 64 * 1024 });
const sha = z.string().regex(/^[a-f0-9]{64}$/), count = z.number().int().positive().safe();
const sourceEntry = z.object({ source: basRetainedSourceSchema,
  names: z.array(z.string().min(1).max(4096)).min(1), capture_ids: z.array(sha).min(1),
  path: z.string().regex(/^sources\/[a-f0-9]{64}\.pdf$/),
}).strict();
export const basEvidenceBundleManifestSchema = z.object({
  schema_version: z.literal('bas_evidence_bundle_v1'), purpose: z.literal('unapproved_evidence_backup'),
  archive_format: z.literal('zip_store_1'), calculation_verification: z.literal('not_python_replayed'),
  payload: z.object({ path: z.literal('takeoff.json'), sha256: sha, byte_length: count.max(BAS_BUNDLE_LIMITS.payload) }).strict(),
  sources: z.array(sourceEntry).min(1).max(BAS_BUNDLE_LIMITS.sources),
}).strict();
export type BasEvidenceBundleManifest = z.infer<typeof basEvidenceBundleManifestSchema>;
export const basEvidenceBundleInspectionSchema = z.object({ bundle_id: sha, manifest: basEvidenceBundleManifestSchema,
  source_byte_verification: z.literal('verified_now'), calculation_verification: z.enum(['not_python_replayed', 'verified_shared_python_replay', 'no_saved_calculations']),
  workflow_replay: basWorkflowReplayReceiptSchema.optional(),
  restored: z.literal(false),
}).strict().refine(r => r.workflow_replay ? r.calculation_verification === r.workflow_replay.calculation_verification
  : r.calculation_verification === 'not_python_replayed', 'Replay status requires its exact workflow receipt');
export interface BasBundleReader { size: number; read(offset: number, length: number): Promise<Uint8Array> }
type Guard = () => void;
const noop = () => {};
const encode = (value: unknown) => new TextEncoder().encode(canonicalBasJson(value));
const decoder = new TextDecoder('utf-8', { fatal: true });
const allowed = /^(?:manifest\.json|takeoff\.json|README\.txt|sources\/[a-f0-9]{64}\.pdf)$/;
const readme = new TextEncoder().encode('OpenTakeoff BAS evidence backup\n\nUnapproved and unsigned. Saved calculations have not been replayed by this archive.\nmanifest.json identifies all physical PDFs referenced by saved BAS history, not a reviewed current drawing set.\ntakeoff.json is the ordinary takeoff export. sources/ contains exact originals named by SHA-256.\nKeep the archive unchanged. Reopening an exact PDF then importing takeoff.json uses the existing merge rules.\nLegacy filename-bound annotations may require the original filename and explicit version selection.\nThis is not an approved takeoff, installed/as-built verification, or engineering certification.\n');
const fileLimit = (name: string) => name === 'manifest.json' ? BAS_BUNDLE_LIMITS.manifest
  : name === 'takeoff.json' ? BAS_BUNDLE_LIMITS.payload : name === 'README.txt' ? 8192 : BAS_BUNDLE_LIMITS.pdf;

/** Freeze exact JSON; no dropping undefined/nonfinite values or sanitizing the
 * saved BAS history. Byte/source ownership is verified separately from math. */
export async function prepareBasEvidenceBundle(rawPayload: unknown, guard: Guard = noop) {
  guard();
  const bytes = encode(structuredClone(rawPayload));
  if (bytes.byteLength > BAS_BUNDLE_LIMITS.payload) throw new Error('BAS bundle takeoff JSON exceeds the supported size limit');
  const payload = parseTakeoffImport(decoder.decode(bytes));
  if (!payload.bas_workflow) throw new Error('BAS evidence bundle requires saved BAS history');
  const inventory = await basSourceInventory(payload.bas_workflow); guard();
  if (!inventory.length || inventory.length > BAS_BUNDLE_LIMITS.sources) throw new Error('BAS bundle requires 1–10000 original PDFs');
  if (inventory.some(i => i.source.byte_length > BAS_BUNDLE_LIMITS.pdf)) throw new Error('An original PDF exceeds the BAS bundle size limit');
  const manifest = basEvidenceBundleManifestSchema.parse({ schema_version: 'bas_evidence_bundle_v1',
    purpose: 'unapproved_evidence_backup', archive_format: 'zip_store_1', calculation_verification: 'not_python_replayed',
    payload: { path: 'takeoff.json', sha256: await sha256Hex(bytes), byte_length: bytes.byteLength },
    sources: inventory.map(item => ({ ...item, path: `sources/${item.source.sha256}.pdf` })),
  });
  const manifestBytes = encode(manifest); guard();
  // Conservative ZIP header/directory allowance, known before any source load.
  const maximum = bytes.length + manifestBytes.length + readme.length + inventory.reduce((n, i) => n + i.source.byte_length, 0) + (inventory.length + 3) * 256;
  if (manifestBytes.length > BAS_BUNDLE_LIMITS.manifest || maximum > BAS_BUNDLE_LIMITS.archive) throw new Error('BAS bundle exceeds the supported archive size limit');
  const bundleId = await sha256Hex(manifestBytes); guard();
  return { manifest: structuredClone(manifest), bundle_id: bundleId,
    async *stream(load: (item: BasSourceInventoryItem) => Promise<Uint8Array>, current: Guard = guard): AsyncGenerator<Uint8Array> {
      const queue: Uint8Array[] = []; let failure: Error | null = null, total = 0;
      const zip = new Zip((error, data) => { if (error) failure = error; else queue.push(data); });
      function* drain() {
        if (failure) throw failure;
        while (queue.length) { const data = queue.shift()!; total += data.length;
          if (total > BAS_BUNDLE_LIMITS.archive) throw new Error('BAS archive exceeded its size limit');
          yield data;
        }
      }
      async function* entry(name: string, data: Uint8Array) {
        current(); const file = new ZipPassThrough(name);
        file.mtime = new Date(1980, 0, 1, 0, 0, 0); file.os = 0; file.attrs = 0;
        zip.add(file); yield* drain();
        for (let offset = 0; offset < data.length; offset += BAS_BUNDLE_LIMITS.chunk) {
          current(); const end = Math.min(data.length, offset + BAS_BUNDLE_LIMITS.chunk);
          file.push(data.subarray(offset, end), end === data.length); yield* drain();
        }
      }
      try {
        yield* entry('manifest.json', manifestBytes); yield* entry('takeoff.json', bytes); yield* entry('README.txt', readme);
        for (const item of manifest.sources) {
          current(); const data = await load(structuredClone(item)); current();
          const verified = await verifyBasSourceBytes(item.source, data); current();
          yield* entry(item.path, verified);
        }
        current(); zip.end(); yield* drain(); current();
      } finally { zip.terminate(); }
    },
  };
}

type Entry = { name: string; size: number; crc: number; offset: number; flags: number; data: number };
const u16 = (v: DataView, offset: number) => v.getUint16(offset, true);
const u32 = (v: DataView, offset: number) => v.getUint32(offset, true);

/** Random access reads never inflate untrusted input or hold all PDF entries. */
export async function openBasEvidenceBundle(reader: BasBundleReader, guard: Guard = noop) {
  if (!Number.isSafeInteger(reader.size) || reader.size < 22 || reader.size > BAS_BUNDLE_LIMITS.archive) throw new Error('Invalid BAS archive size');
  async function read(offset: number, length: number) {
    guard();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > reader.size) throw new Error('BAS archive range is invalid');
    const bytes = await reader.read(offset, length); guard();
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) throw new Error('BAS archive is truncated');
    return new Uint8Array(bytes);
  }
  const tailBytes = await read(reader.size - 22, 22), tail = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);
  const number = u16(tail, 10), directorySize = u32(tail, 12), directoryOffset = u32(tail, 16);
  if (u32(tail, 0) !== 0x06054b50 || u16(tail, 4) || u16(tail, 6) || u16(tail, 8) !== number || u16(tail, 20)
    || number < 4 || number > BAS_BUNDLE_LIMITS.sources + 3 || directorySize > (BAS_BUNDLE_LIMITS.sources + 3) * 128
    || directoryOffset + directorySize !== reader.size - 22) throw new Error('Unsupported or inconsistent BAS ZIP directory');
  const directoryBytes = await read(directoryOffset, directorySize), directory = new DataView(directoryBytes.buffer, directoryBytes.byteOffset, directoryBytes.byteLength);
  const entries = new Map<string, Entry>(); let cursor = 0;
  for (let i = 0; i < number; i++) {
    if (cursor + 46 > directorySize || u32(directory, cursor) !== 0x02014b50) throw new Error('Invalid BAS ZIP central header');
    const length = u16(directory, cursor + 28), flags = u16(directory, cursor + 8), size = u32(directory, cursor + 24);
    if (length > 100 || cursor + 46 + length > directorySize || u16(directory, cursor + 6) > 20 || flags !== 8
      || u16(directory, cursor + 10) !== 0 || u32(directory, cursor + 20) !== size || u16(directory, cursor + 30)
      || u16(directory, cursor + 32) || u16(directory, cursor + 34) || u16(directory, cursor + 36) || u32(directory, cursor + 38)) {
      throw new Error('BAS archive requires unencrypted stored entries without extra metadata');
    }
    const name = decoder.decode(directoryBytes.subarray(cursor + 46, cursor + 46 + length));
    if (!allowed.test(name) || entries.has(name) || size < 1 || size > fileLimit(name)) throw new Error('Unsafe, duplicate or oversized BAS archive entry');
    entries.set(name, { name, size, crc: u32(directory, cursor + 16), offset: u32(directory, cursor + 42), flags, data: 0 });
    cursor += 46 + length;
  }
  if (cursor !== directorySize) throw new Error('Unexpected BAS directory records');
  let end = 0;
  for (const entry of [...entries.values()].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== end) throw new Error('Overlapping, missing or unlisted BAS archive data');
    const localBytes = await read(entry.offset, 30 + entry.name.length), local = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
    if (u32(local, 0) !== 0x04034b50 || u16(local, 4) > 20 || u16(local, 6) !== entry.flags || u16(local, 8) !== 0
      || u32(local, 14) || u32(local, 18) || u32(local, 22) || u16(local, 26) !== entry.name.length || u16(local, 28)
      || decoder.decode(localBytes.subarray(30)) !== entry.name) throw new Error('BAS local/central ZIP headers disagree');
    entry.data = entry.offset + localBytes.length; end = entry.data + entry.size + 16;
    if (end > directoryOffset) throw new Error('BAS entry overlaps its directory');
    const descriptorBytes = await read(end - 16, 16), descriptor = new DataView(descriptorBytes.buffer, descriptorBytes.byteOffset, descriptorBytes.byteLength);
    if (u32(descriptor, 0) !== 0x08074b50 || u32(descriptor, 4) !== entry.crc || u32(descriptor, 8) !== entry.size || u32(descriptor, 12) !== entry.size) throw new Error('BAS ZIP data descriptor disagrees');
  }
  if (end !== directoryOffset) throw new Error('Unlisted BAS ZIP content');
  async function contents(name: string) {
    const entry = entries.get(name); if (!entry) throw new Error(`Missing BAS archive entry: ${name}`);
    const bytes = await read(entry.data, entry.size);
    const crc = new ZipPassThrough(name); crc.ondata = () => {};
    for (let n = 0; n < bytes.length; n += BAS_BUNDLE_LIMITS.chunk) { guard(); crc.push(bytes.subarray(n, n + BAS_BUNDLE_LIMITS.chunk), n + BAS_BUNDLE_LIMITS.chunk >= bytes.length); }
    if ((crc.crc >>> 0) !== entry.crc) throw new Error(`BAS archive CRC mismatch: ${name}`);
    return bytes;
  }
  const manifestBytes = await contents('manifest.json');
  const manifest = basEvidenceBundleManifestSchema.parse(JSON.parse(decoder.decode(manifestBytes)));
  if (decoder.decode(manifestBytes) !== canonicalBasJson(manifest)) throw new Error('Noncanonical BAS archive manifest');
  const payloadBytes = await contents(manifest.payload.path);
  if (payloadBytes.length !== manifest.payload.byte_length || await sha256Hex(payloadBytes) !== manifest.payload.sha256) throw new Error('BAS archive takeoff hash/length mismatch');
  const payload = parseTakeoffImport(decoder.decode(payloadBytes));
  if (decoder.decode(payloadBytes) !== canonicalBasJson(payload)) throw new Error('Noncanonical BAS archive takeoff JSON');
  const inventory = await basSourceInventory(payload.bas_workflow); guard();
  const expected = inventory.map(item => ({ ...item, path: `sources/${item.source.sha256}.pdf` }));
  if (canonicalBasJson(expected) !== canonicalBasJson(manifest.sources) || entries.size !== inventory.length + 3) throw new Error('BAS archive source inventory does not own every entry');
  for (const item of manifest.sources) if (entries.get(item.path)?.size !== item.source.byte_length) throw new Error('Missing or incorrectly sized BAS original PDF');
  const originalReadme = await contents('README.txt');
  if (decoder.decode(originalReadme) !== decoder.decode(readme)) throw new Error('BAS archive disclosure was changed');
  const bundleId = await sha256Hex(manifestBytes); guard();
  async function readSource(sourceId: string) {
    const item = manifest.sources.find(i => i.source.source_id === sourceId);
    if (!item) throw new Error('BAS archive does not own the requested original');
    const bytes = await verifyBasSourceBytes(item.source, await contents(item.path)); guard(); return bytes;
  }
  return { manifest: structuredClone(manifest), bundle_id: bundleId, payload: structuredClone(payload), readSource,
    async verifyOriginals() { for (const item of manifest.sources) { await readSource(item.source.source_id); } guard(); },
  };
}
