// Browser-only transaction delivery. Shared basRestore owns merge/replay truth.
// Hash synchronously inside IDB callbacks: an awaited WebCrypto operation can
// close the transaction. One original at a time, not all PDFs in JS memory.
import { readBasRestorePlan, basRestoreJson } from './basRestore.ts';
import { verifyBasSourceBytes } from './basSourceRetention.ts';
import { attachAnnotationGeneration, annotationConflict } from './annotationGeneration.js';
import { BAS_SOURCE_CHUNK_BYTES, basSourceChunkKey, basSourceChunkCount, basSourceChunkLength, basSourceChunkRecord, isBasSourceChunkRecord } from './basSourceStorage.js';

export async function restoreBasEvidenceInIdb({ withDb, emptyAnnotations, projectId, plan, loadSource, generation, guard, signal }) {
  const owned = readBasRestorePlan(plan, true), annKey = projectId ? `annotations:${projectId}` : 'annotations';
  // Browser-only dependency stays lazy. Importing shared takeoff contracts in
  // packaged MCP must not require this unused IndexedDB transport's packages.
  const [{ sha256 }, { bytesToHex }] = await Promise.all([import('@noble/hashes/sha2.js'), import('@noble/hashes/utils.js')]);
  const generationKey = ['annotation_generation_v1', projectId];
  const journalKey = ['bas_restore_journal_v1', projectId, owned.operation_id];
  const sourceKey = id => ['bas_source_v1', projectId, id];
  const stageKey = (id, index) => ['bas_restore_stage_chunk_v1', projectId, owned.operation_id, id, index];
  const staged = []; let committed = false;
  const check = () => { signal?.throwIfAborted(); guard(); };
  const result = () => ({ payload: attachAnnotationGeneration(structuredClone(owned.payload), owned.operation_id),
    operation_id: owned.operation_id, restored: true, approved: false, project_complete: false });
  const transaction = (stores, fn, completed = () => undefined) => withDb(db => new Promise((resolve, reject) => {
    check();
    const t = db.transaction(stores, 'readwrite'); let failure;
    const abort = error => { failure = error; try { t.abort(); } catch { /* already settled */ } };
    const cancelled = () => abort(signal.reason || new Error('Restore cancelled'));
    signal?.addEventListener('abort', cancelled, { once: true });
    t.oncomplete = () => { signal?.removeEventListener('abort', cancelled); resolve(completed()); };
    t.onabort = () => { signal?.removeEventListener('abort', cancelled); reject(failure || t.error || new Error('Restoration aborted; saved data was not changed.')); };
    const safe = callback => () => { try { check(); callback(); } catch (error) { abort(error); } };
    try { fn(t, safe); } catch (error) { abort(error); }
  }));
  const validRecord = (record, source) => {
    if (!record || basRestoreJson(record.source) !== basRestoreJson(source)
      || !(isBasSourceChunkRecord(record) || (record.schema_version === 'bas_original_pdf_v1'
        && record.bytes instanceof ArrayBuffer && record.bytes.byteLength === source.byte_length))) {
      throw new Error('An original PDF record conflicts with verified evidence. Existing originals were not overwritten.');
    }
  };
  try {
    // Each unpublished record uses an operation-owned key. No source is visible
    // through loadBasSource until the final transaction publishes ALL sources.
    for (const item of owned.inventory) {
      check(); const bytes = await verifyBasSourceBytes(item.source, await loadSource(item)); check();
      await transaction(['meta'], (t, safe) => {
        for (let index = 0; index < basSourceChunkCount(item.source); index++) {
          const request = t.objectStore('meta').add(bytes.buffer.slice(index * BAS_SOURCE_CHUNK_BYTES, (index + 1) * BAS_SOURCE_CHUNK_BYTES), stageKey(item.source.source_id, index));
          request.onsuccess = safe(() => {});
        }
      });
      for (let index = 0; index < basSourceChunkCount(item.source); index++) staged.push(stageKey(item.source.source_id, index));
    }
    check();
    return await transaction(['meta', 'pdfs'], (t, safe) => {
      const meta = t.objectStore('meta'), pdfs = t.objectStore('pdfs');
      const version = meta.get(generationKey), current = meta.get(annKey), previousOperation = meta.get(journalKey);
      previousOperation.onsuccess = safe(() => {
        const currentJson = basRestoreJson(current.result || emptyAnnotations());
        const alreadyApplied = previousOperation.result !== undefined;
        if (alreadyApplied) {
          if (previousOperation.result.payload_sha256 !== owned.payload_sha256 || previousOperation.result.bundle_id !== owned.bundle_id
            || version.result !== owned.operation_id || currentJson !== basRestoreJson(owned.payload)) throw annotationConflict();
        }
        if (!alreadyApplied && ((version.result ?? null) !== generation || currentJson !== owned.expected_json)) throw annotationConflict();
        let index = 0;
        const next = () => {
          check();
          if (index === owned.inventory.length) {
            // Retry still verified all originals, but never appends a second
            // journal or changes an already-restored payload/generation.
            if (alreadyApplied) return;
            meta.add({ schema_version: 'bas_restore_journal_v1', operation_id: owned.operation_id, bundle_id: owned.bundle_id,
              previous_generation: generation, previous_payload: owned.before, payload_sha256: owned.payload_sha256,
              sources: owned.inventory.map(i => i.source), legacy_bindings: owned.legacy_bindings, replay: owned.replay,
              recorded_at: new Date().toISOString(), timestamp_authority: 'local_clock', approved: false, project_complete: false }, journalKey);
            meta.put(structuredClone(owned.payload), annKey);
            meta.put(owned.operation_id, generationKey);
            return;
          }
          const item = owned.inventory[index++], key = sourceKey(item.source.source_id);
          const existing = meta.get(key);
          existing.onsuccess = safe(() => {
            if (existing.result !== undefined) validRecord(existing.result, item.source);
            const digest = sha256.create(); let chunkIndex = 0;
            const nextChunk = () => {
              check();
              if (chunkIndex < basSourceChunkCount(item.source)) {
                const n = chunkIndex++, stage = meta.get(stageKey(item.source.source_id, n));
                stage.onsuccess = safe(() => {
                  if (!(stage.result instanceof ArrayBuffer) || stage.result.byteLength !== basSourceChunkLength(item.source, n)) throw new Error('Staged original PDF chunk is missing or corrupt.');
                  const bytes = new Uint8Array(stage.result); digest.update(bytes);
                  const advance = () => { meta.delete(stageKey(item.source.source_id, n)); nextChunk(); };
                  const compare = old => {
                    if (!(old instanceof Uint8Array) || old.length !== bytes.length || old.some((b, i) => b !== bytes[i])) throw new Error('An original PDF record conflicts with verified evidence. Existing originals were not overwritten.');
                  };
                  if (existing.result === undefined) {
                    meta.add(stage.result, basSourceChunkKey(projectId, item.source.source_id, n)); advance();
                  } else if (isBasSourceChunkRecord(existing.result)) {
                    const old = meta.get(basSourceChunkKey(projectId, item.source.source_id, n));
                    old.onsuccess = safe(() => { compare(old.result instanceof ArrayBuffer ? new Uint8Array(old.result) : null); advance(); });
                  } else {
                    compare(new Uint8Array(existing.result.bytes).subarray(n * BAS_SOURCE_CHUNK_BYTES, (n + 1) * BAS_SOURCE_CHUNK_BYTES)); advance();
                  }
                });
                return;
              }
              if (bytesToHex(digest.digest()) !== item.source.sha256) throw new Error('An original PDF record conflicts with verified evidence. Existing originals were not overwritten.');
              const bindings = owned.legacy_bindings.filter(b => b.source_id === item.source.source_id);
              let bindingIndex = 0;
              const nextBinding = () => {
                check();
                if (bindingIndex === bindings.length) {
                  if (existing.result === undefined) meta.add(basSourceChunkRecord(item.source), key);
                  next(); return;
                }
                const binding = bindings[bindingIndex++], active = pdfs.get(binding.name);
                active.onsuccess = safe(() => {
                  if (!active.result || !(active.result.bytes instanceof ArrayBuffer) || active.result.bytes.byteLength !== item.source.byte_length
                    || bytesToHex(sha256(new Uint8Array(active.result.bytes))) !== item.source.sha256) {
                    throw new Error(`Open the exact archived original as "${binding.name}" before restoring its filename-bound annotations. A newer namesake is not a substitute.`);
                  }
                  nextBinding();
                });
              };
              nextBinding();
            };
            nextChunk();
          });
        };
        next();
      });
    }, () => { committed = true; return result(); });
  } finally {
    // Only keys this invocation successfully staged, never published sources or
    // another operation's work. A crash may leave private orphan staging; it is
    // not evidence availability or an approval, and can be retried with a new plan.
    if (!committed && staged.length) await withDb(db => new Promise((resolve, reject) => {
      const t = db.transaction('meta', 'readwrite'), meta = t.objectStore('meta');
      for (const key of staged) meta.delete(key);
      t.oncomplete = resolve; t.onabort = () => reject(t.error);
    })).catch(() => { /* preserve the original failure/result, never report rollback after commit */ });
  }
}
