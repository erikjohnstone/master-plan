// SHOULD THIS BE ON THE SHARED PATH? No: browser-only atomic delivery. Shared
// basSnapshot owns approval/readiness. This module accepts only its owned plans.
import { z } from 'zod';
import { assertBasSnapshotPlan, readBasSnapshotPlan, verifyBasSnapshot, BAS_SNAPSHOT_JSON_LIMIT } from './basSnapshot.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { basRestoreJson } from './basRestore.ts';
import { verifyBasSourceBytes } from './basSourceRetention.ts';
import { annotationConflict } from './annotationGeneration.js';
import { BAS_BUNDLE_LIMITS } from './basEvidenceBundle.ts';
import { BAS_SOURCE_CHUNK_BYTES as CHUNK, basSourceChunkKey,
  basSourceChunkRecord, isBasSourceChunkRecord } from './basSourceStorage.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const descriptor = z.object({ sha256: digest, byte_length: z.number().int().positive().max(BAS_SNAPSHOT_JSON_LIMIT) }).strict();
const metadataSchema = z.object({ schema_version: z.literal('bas_snapshot_local_v1'), snapshot_id: digest,
  operation_id: z.string().uuid(), payload: descriptor, record: descriptor, seal_event_id: digest,
  reviewer: z.string().min(1).max(512), declared_at: z.string().datetime(), source_count: z.number().int().nonnegative(),
}).strict();
const key = (kind, projectId, ...parts) => [`bas_snapshot_${kind}_v1`, projectId || '', ...parts];
const count = d => Math.ceil(d.byte_length / CHUNK);
const length = (d, n) => Math.min(CHUNK, d.byte_length - n * CHUNK);
const sourceKey = (projectId, id) => ['bas_source_v1', projectId || '', id];
const encode = value => new TextEncoder().encode(value);
const conflict = () => new Error('Saved BAS snapshot or original conflicts with verified content; existing records were not overwritten.');
const sameBytes = (a, b) => a instanceof Uint8Array && a.length === b.length && !a.some((v, i) => v !== b[i]);

/** Browser transport bounds only; source ownership is already shared-verified.
 * Reuse archive limits rather than creating a second supported-source policy. */
export function assertBasSnapshotStorageBounds(sources) {
  if (!sources.length || sources.length > BAS_BUNDLE_LIMITS.sources)
    throw new Error('BAS snapshot storage requires 1–10000 original PDFs');
  if (sources.some(source => source.byte_length > BAS_BUNDLE_LIMITS.pdf))
    throw new Error('An original PDF exceeds the 512 MiB BAS snapshot storage limit');
}

// No await inside IDB callbacks. Completion, not request success, is the receipt.
function transaction(withDb, mode, check, work, completed = () => undefined, signal, durability = 'default') {
  return withDb(db => new Promise((resolve, reject) => {
    check();
    const t = db.transaction('meta', mode, { durability }); let failure;
    const abort = error => { failure ??= error; try { t.abort(); } catch { /* terminal */ } };
    const cancel = () => abort(signal.reason || new Error('BAS snapshot operation cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    t.oncomplete = () => { signal?.removeEventListener('abort', cancel); resolve(completed()); };
    t.onabort = () => { signal?.removeEventListener('abort', cancel); reject(failure || t.error || new Error('BAS snapshot transaction aborted')); };
    const safe = callback => () => { try { check(); callback(); } catch (error) { abort(error); } };
    try { work(t.objectStore('meta'), safe); } catch (error) { abort(error); }
  }));
}

export async function saveBasSnapshotInIdb({ withDb, emptyAnnotations, projectId, plan, loadSource,
  generation = null, guard = () => {}, signal }) {
  const owned = readBasSnapshotPlan(plan);
  const check = () => { signal?.throwIfAborted(); assertBasSnapshotPlan(plan); guard(); };
  check();
  const sources = JSON.parse(owned.record.snapshot.readiness_json).sources.map(item => item.source);
  assertBasSnapshotStorageBounds(sources);
  const [{ sha256 }, { bytesToHex }] = await Promise.all([import('@noble/hashes/sha2.js'), import('@noble/hashes/utils.js')]);
  const recordJson = canonicalBasJson(owned.record), recordBytes = encode(recordJson);
  const metadata = metadataSchema.parse({ schema_version: 'bas_snapshot_local_v1', snapshot_id: plan.snapshot_id,
    operation_id: owned.record.seal.operation_id, payload: owned.record.snapshot.takeoff,
    record: { sha256: bytesToHex(sha256(recordBytes)), byte_length: recordBytes.length },
    seal_event_id: owned.record.seal.event_id, reviewer: owned.record.snapshot.declaration.reviewer,
    declared_at: owned.record.snapshot.declaration.declared_at,
    source_count: sources.length });
  // A retry uses the same public operation, but staging is private to THIS call.
  const invocation = crypto.randomUUID(), staged = [];
  const stageKey = (kind, id, n) => key('stage', projectId, invocation, kind, id, n);
  const snapshotKey = key('local', projectId, plan.snapshot_id), sealKey = key('seal', projectId, plan.snapshot_id);
  const operationKey = key('operation', projectId, metadata.operation_id);
  let committed = false;
  const stage = async (kind, id, bytes) => {
    for (let n = 0; n < Math.ceil(bytes.length / CHUNK); n++) {
      check(); const k = stageKey(kind, id, n);
      await transaction(withDb, 'readwrite', check, meta => meta.add(bytes.slice(n * CHUNK, (n + 1) * CHUNK).buffer, k), undefined, signal);
      staged.push(k);
    }
  };
  try {
    await stage('payload', plan.snapshot_id, encode(owned.payload_json));
    await stage('record', plan.snapshot_id, recordBytes);
    for (const source of sources) {
      check(); const bytes = await verifyBasSourceBytes(source, await loadSource(source)); check();
      await stage('source', source.source_id, bytes);
    }
    return await transaction(withDb, 'readwrite', check, (meta, safe) => {
      const version = meta.get(['annotation_generation_v1', projectId || '']);
      const current = meta.get(projectId ? `annotations:${projectId}` : 'annotations');
      const prior = meta.get(snapshotKey), operation = meta.get(operationKey), seal = meta.get(sealKey);
      seal.onsuccess = safe(() => {
        const exists = prior.result !== undefined;
        if (exists && (canonicalBasJson(prior.result) !== canonicalBasJson(metadata)
          || canonicalBasJson(seal.result ?? null) !== canonicalBasJson(owned.record.seal))) throw conflict();
        if (!exists && seal.result !== undefined) throw conflict();
        if ((operation.result !== undefined && operation.result !== plan.snapshot_id)
          || (exists && operation.result !== plan.snapshot_id) || (!exists && operation.result !== undefined)) throw conflict();
        // Historical import never replaces/approves current annotations. New
        // approval must still refer to the exact saved generation AND payload.
        if (owned.mode === 'create' && ((version.result ?? null) !== generation
          || basRestoreJson(current.result || emptyAnnotations()) !== owned.payload_json)) throw annotationConflict();
        const objects = [
          { kind: 'payload', id: plan.snapshot_id, descriptor: metadata.payload, exists },
          { kind: 'record', id: plan.snapshot_id, descriptor: metadata.record, exists },
          ...sources.map(source => ({ kind: 'source', id: source.source_id, descriptor: source })),
        ];
        let objectIndex = 0;
        const nextObject = () => {
          check();
          if (objectIndex === objects.length) {
            if (!exists) {
              meta.add(metadata, snapshotKey); meta.add(owned.record.seal, sealKey); meta.add(plan.snapshot_id, operationKey);
            }
            return;
          }
          const object = objects[objectIndex++];
          const publishChunks = previousSource => {
            if (object.kind === 'source' && previousSource !== undefined &&
              (canonicalBasJson(previousSource.source ?? null) !== canonicalBasJson(object.descriptor)
                || !(isBasSourceChunkRecord(previousSource) || (previousSource.schema_version === 'bas_original_pdf_v1'
                  && previousSource.bytes instanceof ArrayBuffer && previousSource.bytes.byteLength === object.descriptor.byte_length)))) throw conflict();
            const present = object.kind === 'source' ? previousSource !== undefined : object.exists;
            const h = sha256.create(); let n = 0;
            const nextChunk = () => {
              check();
              if (n === count(object.descriptor)) {
                if (bytesToHex(h.digest()) !== object.descriptor.sha256) throw conflict();
                if (object.kind === 'source' && !present) meta.add(basSourceChunkRecord(object.descriptor), sourceKey(projectId, object.id));
                nextObject(); return;
              }
              const index = n++, stagedKey = stageKey(object.kind, object.id, index), r = meta.get(stagedKey);
              r.onsuccess = safe(() => {
                if (!(r.result instanceof ArrayBuffer) || r.result.byteLength !== length(object.descriptor, index)) throw new Error('Staged BAS snapshot chunk is missing or corrupt');
                const bytes = new Uint8Array(r.result); h.update(bytes);
                const finalKey = object.kind === 'source' ? basSourceChunkKey(projectId, object.id, index) : key(`${object.kind}_chunk`, projectId, object.id, index);
                const advance = () => { meta.delete(stagedKey); nextChunk(); };
                if (!present) { meta.add(r.result, finalKey); advance(); }
                else if (object.kind === 'source' && previousSource.schema_version === 'bas_original_pdf_v1') {
                  if (!sameBytes(new Uint8Array(previousSource.bytes).subarray(index * CHUNK, (index + 1) * CHUNK), bytes)) throw conflict();
                  advance();
                } else {
                  const old = meta.get(finalKey);
                  old.onsuccess = safe(() => {
                    if (!sameBytes(old.result instanceof ArrayBuffer ? new Uint8Array(old.result) : null, bytes)) throw conflict();
                    advance();
                  });
                }
              });
            };
            nextChunk();
          };
          if (object.kind === 'source') {
            const previous = meta.get(sourceKey(projectId, object.id)); previous.onsuccess = safe(() => publishChunks(previous.result));
          } else publishChunks(undefined);
        };
        nextObject();
      });
    }, () => {
      committed = true;
      return { snapshot_id: plan.snapshot_id, committed: true, stored: 'browser_local',
        approval: 'self_declared_historical_scope', current_working_state: 'not_evaluated', annotations_changed: false,
        durability_hint: 'strict' };
    }, signal, 'strict');
  } finally {
    if (!committed && staged.length) await transaction(withDb, 'readwrite', () => {}, meta => {
      for (const k of staged) meta.delete(k);
    }).catch(() => { /* Preserve failure; private orphan staging is not a published approval. */ });
  }
}

export async function listBasSnapshotsInIdb({ withDb, projectId, after = null, limit = 50, guard = () => {}, signal }) {
  if (after !== null) digest.parse(after);
  z.number().int().min(1).max(100).parse(limit);
  const check = () => { signal?.throwIfAborted(); guard(); }, items = []; let next = null;
  return transaction(withDb, 'readonly', check, (meta, safe) => {
    const r = meta.openCursor(IDBKeyRange.bound(key('local', projectId, after || ''), key('local', projectId, 'g'), after !== null, true));
    r.onsuccess = safe(() => {
      const cursor = r.result;
      if (!cursor) return;
      if (items.length === limit) { next = items[items.length - 1].snapshot_id; return; }
      const metadata = metadataSchema.parse(cursor.value);
      if (canonicalBasJson(cursor.key) !== canonicalBasJson(key('local', projectId, metadata.snapshot_id))) throw conflict();
      items.push({ ...metadata, verification: 'not_replayed', current_working_state: 'not_evaluated', stored: 'browser_local' });
      cursor.continue();
    });
  }, () => ({ items, next_cursor: next }), signal);
}

export async function loadBasSnapshotInIdb({ withDb, projectId, snapshotId, io, guard = () => {}, signal }) {
  digest.parse(snapshotId);
  const check = () => { signal?.throwIfAborted(); guard(); };
  const [{ sha256 }, { bytesToHex }] = await Promise.all([import('@noble/hashes/sha2.js'), import('@noble/hashes/utils.js')]);
  let metadata, seal, payloadJson, recordJson;
  await transaction(withDb, 'readonly', check, (meta, safe) => {
    const r = meta.get(key('local', projectId, snapshotId));
    r.onsuccess = safe(() => {
      if (r.result === undefined) return;
      metadata = metadataSchema.parse(r.result);
      if (metadata.snapshot_id !== snapshotId) throw conflict();
      const sealRead = meta.get(key('seal', projectId, snapshotId)), operation = meta.get(key('operation', projectId, metadata.operation_id));
      operation.onsuccess = safe(() => {
        seal = sealRead.result;
        if (operation.result !== snapshotId) throw conflict();
        const read = (kind, done) => {
          const d = kind === 'payload' ? metadata.payload : metadata.record, h = sha256.create();
          const decoder = new TextDecoder('utf-8', { fatal: true }); let n = 0, text = '';
          const next = () => {
            check();
            if (n === count(d)) {
              text += decoder.decode(); if (bytesToHex(h.digest()) !== d.sha256) throw conflict();
              done(text); return;
            }
            const index = n++, chunk = meta.get(key(`${kind}_chunk`, projectId, snapshotId, index));
            chunk.onsuccess = safe(() => {
              if (!(chunk.result instanceof ArrayBuffer) || chunk.result.byteLength !== length(d, index)) throw conflict();
              const bytes = new Uint8Array(chunk.result); h.update(bytes); text += decoder.decode(bytes, { stream: true }); next();
            });
          };
          next();
        };
        read('payload', text => { payloadJson = text; read('record', text => { recordJson = text; }); });
      });
    });
  }, undefined, signal);
  if (!metadata) return null;
  check(); const record = JSON.parse(recordJson);
  if (canonicalBasJson(record.seal) !== canonicalBasJson(seal ?? null) || record.seal.event_id !== metadata.seal_event_id
    || record.seal.operation_id !== metadata.operation_id || canonicalBasJson(record.snapshot.takeoff) !== canonicalBasJson(metadata.payload)
    || record.snapshot.declaration.reviewer !== metadata.reviewer || record.snapshot.declaration.declared_at !== metadata.declared_at
    || JSON.parse(record.snapshot.readiness_json).sources.length !== metadata.source_count) throw conflict();
  const plan = await verifyBasSnapshot(JSON.parse(payloadJson), record, io, signal);
  check(); return plan;
}
