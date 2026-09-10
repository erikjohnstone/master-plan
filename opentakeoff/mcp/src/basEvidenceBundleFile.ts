import { open, readFile, stat } from 'node:fs/promises';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { verifyBasSourceBytes } from '../../web/src/lib/basSourceRetention.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { writeAtomicArtifact } from './atomicArtifactFile.ts';
import type { Session } from './session.ts';
import { verifyBasWorkflowCalculations } from './basWorkflowReplay.ts';

export async function exportBasEvidenceBundle(session: Session, path: string, originals: string[], overwrite?: boolean) {
  const payload = structuredClone(session.exportPayload()), expected = canonicalBasJson(payload);
  const workflow = session.basWorkflow, files = JSON.stringify(session.files);
  const changed = () => { throw new Error('Workspace changed during BAS evidence export; no complete archive was published.'); };
  // Cheap context checks during streaming; a complete comparison immediately
  // before publication also catches in-place annotation/history mutations.
  const guard = () => { if (session.basWorkflow !== workflow || JSON.stringify(session.files) !== files) changed(); };
  const beforeCommit = () => { guard(); if (canonicalBasJson(session.exportPayload()) !== expected) changed(); };
  const prepared = await prepareBasEvidenceBundle(payload, guard);
  let candidates: Map<number, string[]> | undefined;
  const hashed = new Set<string>(), identified = new Map<string, string>();
  await writeAtomicArtifact(path, 'zip', prepared.stream(async item => {
    const loaded = await session.basOriginalBytes(item.source.sha256); guard();
    if (loaded) return loaded;
    // Explicit caller-supplied historical originals only. Never crawl a folder
    // or follow a filename from inside the imported workflow/archive.
    if (identified.has(item.source.sha256)) return new Uint8Array(await readFile(identified.get(item.source.sha256)!));
    if (!candidates) {
      candidates = new Map();
      for (const file of [...new Set(originals)]) {
        guard(); const size = (await stat(file)).size;
        const group = candidates.get(size) || []; group.push(file); candidates.set(size, group);
      }
    }
    for (const file of candidates.get(item.source.byte_length) || []) {
      guard(); if (hashed.has(file)) continue;
      const bytes = await readFile(file); guard();
      const sha256 = await sha256Hex(bytes); guard(); hashed.add(file); identified.set(sha256, file);
      if (sha256 === item.source.sha256) return verifyBasSourceBytes(item.source, bytes);
    }
    throw new Error(`Original PDF unavailable for ${item.source.source_id}; supply its exact bytes in original_pdf_paths.`);
  }, guard), overwrite, beforeCommit);
  return payload;
}

export async function inspectBasEvidenceBundleFile(path: string, options: { replayCalculations?: boolean; signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const file = await open(path, 'r');
  try {
    const size = (await file.stat()).size;
    const archive = await openBasEvidenceBundle({ size, async read(offset, length) {
      const bytes = new Uint8Array(length); let done = 0;
      while (done < length) { const result = await file.read(bytes, done, length - done, offset + done);
        if (!result.bytesRead) throw new Error('BAS evidence archive is truncated'); done += result.bytesRead; }
      return bytes;
    } }, () => options.signal?.throwIfAborted());
    await archive.verifyOriginals();
    const replay = options.replayCalculations ? await verifyBasWorkflowCalculations(archive.payload.bas_workflow, { signal: options.signal }) : null;
    options.signal?.throwIfAborted();
    return { bundle_id: archive.bundle_id, manifest: archive.manifest, source_byte_verification: 'verified_now' as const,
      calculation_verification: replay?.calculation_verification ?? 'not_python_replayed' as const,
      ...(replay ? { workflow_replay: replay } : {}), restored: false as const };
  } finally { await file.close(); }
}
