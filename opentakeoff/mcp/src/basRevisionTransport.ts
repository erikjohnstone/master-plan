/** Session-specific bounded delivery/cache. Shared services own BAS truth. */
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Session } from './session.ts';
import { runBasRevisionOperation } from './basRevisionOperations.ts';
import { basRevisionTransportCommandSchema, basRevisionTransportResultSchema } from '../../web/src/lib/basRevisionTransportContract.ts';
import { inspectBasRevisionVersions, readBasRevisionView } from '../../web/src/lib/basRevisionView.ts';
import { writeAtomicArtifact } from './atomicArtifactFile.ts';
type View = { id: string; fingerprint: string; bytes: Buffer; data: unknown; guard: () => void; expires: number;
  timer?: ReturnType<typeof setTimeout>;
  operation: 'inspect' | 'inventory' | 'compare' | 'record' | 'read'; event: string | null; head: string | null; report: string | null;
  verification: 'inspection_only' | 'not_replayed_inventory' | 'completed_preview' | 'matches_saved_report' | 'different_from_saved_report' };
const views = new WeakMap<Session, View>();
const LIMIT = 128 * 1024 * 1024, TTL = 15 * 60 * 1000;
export async function runBasRevisionTransport(session: Session, raw: unknown, signal?: AbortSignal) {
  const command = basRevisionTransportCommandSchema.parse(raw), beforeGuard = session.basDrawingGuard();
  const guard = () => { signal?.throwIfAborted(); beforeGuard(); }; guard();
  const workflow = session.basWorkflow;
  if (!workflow) throw new Error('No retained BAS workflow. Compile or restore its evidence first.');
  let view: View, updated;
  if (command.action === 'read' || command.action === 'export') {
    const found = views.get(session);
    if (!found || found.id !== command.view_id || found.expires <= Date.now()) throw new Error('Revision view expired or was replaced. Inspect or run again.');
    found.guard(); view = found;
  } else {
    let data: unknown, operation: View['operation'] = 'inspect', event = null, head = null, report = null;
    let verification: View['verification'] = 'inspection_only';
    if (command.action === 'inspect') data = await inspectBasRevisionVersions(workflow, command.source_set_id);
    else {
      const result = await runBasRevisionOperation(workflow, command.operation, 'agent_proposal', { signal }); guard();
      operation = result.kind;
      if (result.kind === 'record') { const { workflow: next, ...publicResult } = result; data = publicResult; updated = next; }
      else data = result;
      if (result.kind === 'compare') { head = result.expected_head; report = result.expected_report_fingerprint; verification = 'completed_preview'; }
      else if (result.kind === 'read' || result.kind === 'record') { event = result.event.event_id; head = result.event.expected_head;
        report = result.kind === 'read' ? result.actual_report_fingerprint : result.event.expected_report_fingerprint; verification = result.report_verification; }
      else verification = 'not_replayed_inventory';
    }
    guard(); const bytes = Buffer.from(JSON.stringify(data));
    if (bytes.length > LIMIT) throw new Error('Revision delivery exceeds its 128 MiB bound; no review was saved.');
    view = { id: randomUUID(), fingerprint: createHash('sha256').update(bytes).digest('hex'), bytes, data, guard: beforeGuard,
      expires: Date.now() + TTL, operation, event, head, report, verification };
  }
  const page = command.action === 'export' ? null : readBasRevisionView(view.data, command.query);
  const result = basRevisionTransportResultSchema.parse({ action: command.action, view_id: view.id, result_fingerprint: view.fingerprint,
    encoded_bytes: view.bytes.length, expires_at: new Date(view.expires).toISOString(), operation: view.operation,
    event_id: view.event, expected_head: view.head, expected_report_fingerprint: view.report, report_verification: view.verification,
    page, exported_path: command.action === 'export' ? resolve(command.path) : null, approved: false,
    persistence: 'session_only_until_export', read_semantics: 'cached_completed_operation_not_a_new_replay' });
  guard();
  if (command.action === 'export') await writeAtomicArtifact(resolve(command.path), 'json', [view.bytes], command.overwrite, () => { guard(); view.guard(); });
  guard();
  if (updated) { session.basWorkflow = updated; view.guard = session.basDrawingGuard(); }
  if (command.action === 'run' || command.action === 'inspect') {
    clearTimeout(views.get(session)?.timer);
    view.timer = setTimeout(() => { if (views.get(session) === view) views.delete(session); }, TTL);
    view.timer.unref(); views.set(session, view);
  }
  return result;
}
