/** Session IO only. Shared issue services own findings, actions and replay. */
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Session } from './session.ts';
import { applyBasIssueReview, inspectBasIssueReview, readBasIssueDecision, basIssueHead } from '../../web/src/lib/basIssueReview.ts';
import { currentBasIssueBasis } from '../../web/src/lib/basIssueBasis.ts';
import { basIssueCommandSchema, basIssueTransportResultSchema } from '../../web/src/lib/basIssueTransportContract.ts';
import { readBasRevisionView } from '../../web/src/lib/basRevisionView.ts';
import { writeAtomicArtifact } from './atomicArtifactFile.ts';
import type { z } from 'zod';
type Metadata = Pick<z.infer<typeof basIssueTransportResultSchema>, 'operation' | 'capture_id' | 'head' | 'basis' | 'event_id' | 'verification'>;
type View = Metadata & { id: string; fingerprint: string; bytes: Buffer; data: unknown; guard: () => void;
  expires: number; timer?: ReturnType<typeof setTimeout> };
const views = new WeakMap<Session, View>();
const LIMIT = 128 * 1024 * 1024, TTL = 15 * 60 * 1000;

export async function runBasIssueTransport(session: Session, raw: unknown, signal?: AbortSignal) {
  const command = basIssueCommandSchema.parse(raw), beforeGuard = session.basDrawingGuard();
  const guard = () => { signal?.throwIfAborted(); beforeGuard(); }; guard();
  const workflow = session.basWorkflow;
  if (!workflow) throw new Error('No retained BAS workflow. Compile or restore its evidence first.');
  let view: View, updated;
  if (command.action === 'read' || command.action === 'export') {
    const found = views.get(session);
    if (!found || found.id !== command.view_id || found.expires <= Date.now()) throw new Error('Issue view expired or was replaced. Inspect or replay again.');
    found.guard(); view = found;
  } else {
    let data: unknown, metadata: Metadata;
    if (command.action === 'inspect') {
      const capture_id = command.capture_id ?? workflow.current_capture_id;
      if (!capture_id) throw new Error('Choose a retained capture_id; there is no active capture.');
      const result = await inspectBasIssueReview(workflow, capture_id, { signal });
      data = result; metadata = { operation: 'inspect', capture_id, head: result.head, basis: result.basis,
        event_id: null, verification: 'current_findings_history_lineage_only' };
    } else if (command.action === 'record') {
      const result = await applyBasIssueReview(workflow, command.request, 'agent_proposal', { signal });
      updated = result.workflow; data = { event: result.event };
      metadata = { operation: 'record', capture_id: result.event.capture_id, head: basIssueHead(updated, result.event.capture_id),
        basis: currentBasIssueBasis(updated, result.event.capture_id), event_id: result.event.event_id, verification: 'shared_action_validated' };
    } else {
      const result = await readBasIssueDecision(workflow, command.event_id, { signal });
      data = result; metadata = { operation: 'replay', capture_id: result.decision.capture_id,
        head: basIssueHead(workflow, result.decision.capture_id), basis: result.current_basis,
        event_id: result.decision.event_id, verification: 'shared_projection_replayed' };
    }
    guard(); const bytes = Buffer.from(JSON.stringify(data));
    if (bytes.length > LIMIT) throw new Error('Issue delivery exceeds its 128 MiB bound; no decision was saved.');
    view = { ...metadata, id: randomUUID(), fingerprint: createHash('sha256').update(bytes).digest('hex'), bytes, data,
      guard: beforeGuard, expires: Date.now() + TTL };
  }
  // Validate the requested response before adopting a write. A bad reader path,
  // cancellation or concurrent workspace change must leave history untouched.
  const page = command.action === 'export' ? null : readBasRevisionView(view.data, command.query);
  const result = basIssueTransportResultSchema.parse({ action: command.action, operation: view.operation,
    view_id: view.id, result_fingerprint: view.fingerprint, encoded_bytes: view.bytes.length,
    expires_at: new Date(view.expires).toISOString(), capture_id: view.capture_id, head: view.head, basis: view.basis,
    event_id: view.event_id, verification: view.verification, page,
    exported_path: command.action === 'export' ? resolve(command.path) : null,
    approved: false, project_complete: false, persistence: 'session_only_until_export',
    read_semantics: 'cached_completed_operation_not_a_new_replay' });
  guard();
  if (command.action === 'export') await writeAtomicArtifact(resolve(command.path), 'json', [view.bytes], command.overwrite, () => { guard(); view.guard(); });
  guard();
  if (updated) { session.basWorkflow = updated; view.guard = session.basDrawingGuard(); }
  if (command.action !== 'read' && command.action !== 'export') {
    clearTimeout(views.get(session)?.timer);
    view.timer = setTimeout(() => { if (views.get(session) === view) views.delete(session); }, TTL);
    view.timer.unref(); views.set(session, view);
  }
  return result;
}
