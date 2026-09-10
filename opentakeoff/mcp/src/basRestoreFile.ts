/** MCP delivery only: shared restore meaning + Session adoption + owned files.
 * No extracted values, graph, active PDF membership, or math are inferred here. */
import { mkdtemp, open, readFile, realpath, stat, unlink, rmdir } from 'node:fs/promises';
import { linkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { basRestoreJson, prepareBasRestore, readBasRestorePlan, replayBasRestore, type BasRestorePlan } from '../../web/src/lib/basRestore.ts';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { verifyBasSourceBytes, type BasSourceInventoryItem } from '../../web/src/lib/basSourceRetention.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { withBasEvidenceBundleFile } from './basEvidenceBundleFile.ts';
import { readBasOriginalFile } from './basOriginalFile.ts';
import { verifyBasWorkflowCalculations } from './basWorkflowReplay.ts';
import type { Session } from './session.ts';
import { z } from 'zod';
import { exportTakeoffOutput } from './outputs.ts';

interface Preview { path: string; plan: BasRestorePlan; guard: () => void; expires: number; originals: string[]; busy: boolean; journal?: string; previous?: string; result?: Record<string, any> }
// One bounded preview per Session. Callers never supply a replay receipt or a
// serialized plan capable of bypassing the private shared handle.
const previews = new WeakMap<Session, Preview>();
const PREVIEW_MS = 15 * 60 * 1000;
export type BasRestoreFileRequest = { action: 'preview' | 'commit'; preview_id?: string; directory?: string; original_pdf_paths?: string[] };

export async function restoreBasEvidenceFile(session: Session, path: string, request: BasRestoreFileRequest, signal?: AbortSignal): Promise<Record<string, any>> {
  signal?.throwIfAborted();
  path = resolve(path);
  if (request.action === 'preview') {
    if (request.preview_id !== undefined || request.directory !== undefined) throw new Error('Preview takes no preview_id or directory. No files were written.');
    if (previews.get(session)?.busy) throw new Error('A restore is in progress for this Session.');
    const sessionGuard = session.basRestoreGuard(), guard = () => { signal?.throwIfAborted(); sessionGuard(); };
    return withBasEvidenceBundleFile(path, guard, async archive => {
      await archive.verifyOriginals(); guard();
      const plan = await prepareBasRestore(session.basRestorePayload(), archive.payload, archive.bundle_id, guard);
      // Delivery compatibility, not an alternate merge: reject before writing
      // if existing MCP field validators would make the restored export fail.
      // Validate only; never adopt Zod's stripped/coerced projection as cargo.
      const compatible = z.object(exportTakeoffOutput).passthrough().safeParse(readBasRestorePlan(plan).payload);
      if (!compatible.success) throw new Error(`Saved drawing fields cannot round-trip through MCP: ${compatible.error.issues.slice(0, 5).map(i => i.path.join('.')).join(', ')}. No values were dropped or restored.`);
      await session.verifyBasRestoreBindings(plan, guard); guard();
      previews.set(session, { path, plan, guard: sessionGuard, expires: Date.now() + PREVIEW_MS,
        originals: [...new Set(request.original_pdf_paths ?? [])].map(p => resolve(p)), busy: false });
      return { preview_id: plan.operation_id, bundle_id: archive.bundle_id, preview: plan.preview,
        expires_in_seconds: PREVIEW_MS / 1000, restored: false, approved: false, project_complete: false,
        note: 'Read the shared merge preview, then commit this preview_id with an existing output directory. Commit always replays the complete merged history through Python. Old originals remain outside active counting. Restore starts a new undo boundary; previous state is retained in its recovery directory.' };
    });
  }
  if (!request.preview_id || !request.directory || request.original_pdf_paths !== undefined) throw new Error('Commit requires preview_id and an existing directory; original_pdf_paths belongs to preview.');
  const preview = previews.get(session);
  if (!preview || preview.plan.operation_id !== request.preview_id || preview.path !== path) throw new Error('Restore preview is unavailable for this Session and bundle. Preview again.');
  if (preview.busy) throw new Error('This restore is already in progress.');
  const parent = await realpath(request.directory);
  if (!(await stat(parent)).isDirectory()) throw new Error('Restore directory must be an existing local directory.');
  if (preview.result) {
    if (preview.result.parent !== parent || basRestoreJson(session.basRestorePayload()) !== basRestoreJson(readBasRestorePlan(preview.plan, true).payload)) throw new Error('This operation already restored a different current workspace or destination. Preview again.');
    // An old receipt/marker is not proof the retained files are still intact.
    const currentGuard = session.basRestoreGuard();
    await verifyRestoreFiles(preview.result.directory, preview, signal); currentGuard();
    return structuredClone(preview.result);
  }
  if (Date.now() > preview.expires) throw new Error('Restore preview expired. Preview again.');
  const guard = () => { signal?.throwIfAborted(); preview.guard(); };
  guard(); preview.busy = true;
  let directory: string | undefined, published = false;
  const created: string[] = [];
  try {
    return await withBasEvidenceBundleFile(path, guard, async archive => {
      const owned = readBasRestorePlan(preview.plan);
      if (archive.bundle_id !== owned.bundle_id) throw new Error('The evidence bundle changed after preview. Preview again.');
      const replay = await replayBasRestore(preview.plan, workflow => verifyBasWorkflowCalculations(workflow, { signal }), guard);
      await session.verifyBasRestoreBindings(preview.plan, guard); guard();
      const recovery = session.basRestoreRecoveryState();
      preview.previous = basRestoreJson(recovery);
      directory = await mkdtemp(join(parent, `.bas-restore-${preview.plan.operation_id}-`)); guard();
      const dir = directory;
      async function write(name: string, chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>) {
        guard(); const target = join(dir, name), file = await open(target, 'wx', 0o600); created.push(target);
        try { for await (const chunk of chunks) { guard(); await file.writeFile(chunk); } await file.sync(); }
        finally { await file.close(); }
        guard(); return target;
      }
      const json = (name: string, value: unknown) => write(name, [new TextEncoder().encode(basRestoreJson(value))]);
      const retained = new Map<string, { path: string; source: BasSourceInventoryItem['source'] }>();
      const incoming = new Set(archive.manifest.sources.map(item => item.source.source_id));
      // Index only paths explicitly provided by this caller. Never browse a
      // directory or follow filenames embedded in the untrusted archive.
      const candidates = new Map<number, string[]>(), identified = new Map<string, string>();
      for (const supplied of preview.originals) { guard(); const info = await stat(supplied);
        if (!info.isFile()) throw new Error('Historical original path must be a regular file');
        const group = candidates.get(info.size) ?? []; group.push(supplied); candidates.set(info.size, group); }
      for (const item of owned.inventory) {
        guard(); let bytes: Uint8Array | null = incoming.has(item.source.source_id) ? await archive.readSource(item.source.source_id) : await session.basOriginalBytes(item.source.sha256);
        if (!bytes && identified.has(item.source.sha256)) bytes = await readBasOriginalFile(identified.get(item.source.sha256)!, item.source, guard);
        if (!bytes) for (const supplied of candidates.get(item.source.byte_length) ?? []) {
          // Exact-size candidates are bounded by the shared per-PDF limit.
          const file = await open(supplied, 'r');
          try {
            if ((await file.stat()).size !== item.source.byte_length) throw new Error('Historical original changed during restore.');
            const candidate = new Uint8Array(item.source.byte_length); let done = 0;
            while (done < candidate.length) { guard(); const got = await file.read(candidate, done, Math.min(1024 * 1024, candidate.length - done), done);
              if (!got.bytesRead) throw new Error('Historical original was truncated.'); done += got.bytesRead; }
            if ((await file.read(new Uint8Array(1), 0, 1, candidate.length)).bytesRead) throw new Error('Historical original grew during restore.');
            const sha = await sha256Hex(candidate); guard(); identified.set(sha, supplied);
            if (sha === item.source.sha256) { bytes = candidate; break; }
          } finally { await file.close(); }
        }
        if (!bytes) throw new Error(`Original PDF unavailable for ${item.source.source_id}; supply original_pdf_paths when previewing.`);
        bytes = await verifyBasSourceBytes(item.source, bytes); guard();
        const originalPath = await write(`${item.source.sha256}.pdf`, [bytes]);
        retained.set(item.source.sha256, { path: originalPath, source: item.source });
      }
      await json('takeoff.json', owned.payload);
      await json('previous-state.json', recovery);
      await json('replay.json', replay);
      const bundle = await prepareBasEvidenceBundle(owned.payload, guard);
      await write('restored.otbas.zip', bundle.stream(item => readBasOriginalFile(retained.get(item.source.sha256)!.path, item.source, guard), guard));
      const journal = { schema_version: 'bas_restore_mcp_v1', operation_id: owned.operation_id, bundle_id: owned.bundle_id,
        payload_sha256: owned.payload_sha256, restored_bundle_id: bundle.bundle_id,
        sources: owned.inventory.map(i => i.source), previous_state: 'previous-state.json', replay: 'replay.json',
        recorded_at: new Date().toISOString(), timestamp_authority: 'local_clock', approved: false, project_complete: false };
      const marker = await json('prepared.json', journal);
      preview.journal = basRestoreJson(journal);
      // Re-read all published cargo, not merely the marker metadata. This also
      // verifies bytes reread by the newly built recovery archive.
      await verifyRestoreFiles(dir, preview, signal, false); guard();
      const adopt = session.prepareBasRestoreAdoption(preview.plan, retained, guard);
      const result = { directory: dir, parent, operation_id: owned.operation_id, bundle_id: owned.bundle_id,
        restored_bundle_path: join(dir, 'restored.otbas.zip'), takeoff_path: join(dir, 'takeoff.json'),
        journal_path: join(dir, 'COMMITTED.json'), previous_state_path: join(dir, 'previous-state.json'),
        restored: true, source_byte_verification: 'verified_now', workflow_replay: replay,
        active_files: session.files, merge: owned.note, approved: false, project_complete: false,
        note: 'Restored shared merge and exact original PDFs. No old PDF was added to active counting. Undo history starts a new boundary; previous state and a re-importable merged backup are retained. This is an unapproved local recovery operation, not design certification or permanent/authenticated storage.' };
      adopt(() => { linkSync(marker, join(dir, 'COMMITTED.json')); published = true; });
      preview.result = result;
      return structuredClone(result);
    });
  } finally {
    preview.busy = false;
    if (directory && !published) {
      // Only exclusive-created paths in our mkdtemp directory. No recursive
      // deletion: a foreign file prevents rmdir and remains untouched.
      for (const file of created) await unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e; });
      await rmdir(directory);
    }
  }
}

async function verifyRestoreFiles(directory: string, preview: Preview, signal?: AbortSignal, committed = true) {
  const owned = readBasRestorePlan(preview.plan, true), guard = () => signal?.throwIfAborted(); guard();
  const marker = JSON.parse(await readFile(join(directory, committed ? 'COMMITTED.json' : 'prepared.json'), 'utf8'));
  if (basRestoreJson(marker) !== preview.journal) throw new Error('Restore journal identity mismatch.');
  const payload = JSON.parse(await readFile(join(directory, 'takeoff.json'), 'utf8'));
  if (basRestoreJson(payload) !== basRestoreJson(owned.payload)) throw new Error('Retained restored payload changed.');
  const previous = JSON.parse(await readFile(join(directory, 'previous-state.json'), 'utf8'));
  if (basRestoreJson(previous) !== preview.previous) throw new Error('Retained previous state changed.');
  const replay = JSON.parse(await readFile(join(directory, 'replay.json'), 'utf8'));
  if (basRestoreJson(replay) !== basRestoreJson(owned.replay)) throw new Error('Retained replay receipt changed.');
  for (const item of owned.inventory) await readBasOriginalFile(join(directory, `${item.source.sha256}.pdf`), item.source, guard);
  await withBasEvidenceBundleFile(join(directory, 'restored.otbas.zip'), guard, async archive => {
    if (archive.bundle_id !== marker.restored_bundle_id || basRestoreJson(archive.payload) !== basRestoreJson(owned.payload)) throw new Error('Retained recovery archive changed.');
    await archive.verifyOriginals();
  });
  guard();
}
