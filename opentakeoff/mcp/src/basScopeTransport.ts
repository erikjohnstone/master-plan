/** Session IO only: all catalog, ownership, scope, coverage and replay semantics are shared. */
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { z } from 'zod';
import type { Session } from './session.ts';
import { catalogBasScope, prepareBasScopeCoverage } from '../../web/src/lib/basScopeCatalog.ts';
import { buildBasDeliverableScope } from '../../web/src/lib/basDeliverableScope.ts';
import { applyBasScopeReview, readBasScopeDecision } from '../../web/src/lib/basScopeReview.ts';
import { basScopeCommandSchema, basScopeTransportResultSchema } from '../../web/src/lib/basScopeTransportContract.ts';
import { readBasRevisionView } from '../../web/src/lib/basRevisionView.ts';
import { writeAtomicArtifact } from './atomicArtifactFile.ts';
type Metadata = Pick<z.infer<typeof basScopeTransportResultSchema>, 'operation' | 'head' | 'event_id' | 'verification'>;
type View = Metadata & { id: string; fingerprint: string; bytes: Buffer; data: unknown; guard: () => void;
  expires: number; timer?: ReturnType<typeof setTimeout> };
const views = new WeakMap<Session, View>();
const LIMIT = 128 * 1024 * 1024, TTL = 15 * 60 * 1000;

export async function runBasScopeTransport(session: Session, raw: unknown, signal?: AbortSignal) {
  const command = basScopeCommandSchema.parse(raw), beforeGuard = session.basDrawingGuard();
  const guard = () => { signal?.throwIfAborted(); beforeGuard(); }; guard();
  const workflow = session.basWorkflow;
  if (!workflow) throw new Error('No retained BAS workflow. Compile or restore its evidence first.');
  let view: View, updated;
  if (command.action === 'read' || command.action === 'export') {
    const found = views.get(session);
    if (!found || found.id !== command.view_id || found.expires <= Date.now()) throw new Error('Scope view expired or was replaced. Catalog, prepare or replay again.');
    found.guard(); view = found;
  } else {
    let data: unknown, metadata: Metadata;
    const base = { operation: command.action, head: workflow.scope_events?.at(-1)?.event_id ?? null, event_id: null };
    if (command.action === 'catalog') {
      const result = await catalogBasScope(workflow, command.source_set_id ? { source_set_id: command.source_set_id } : {}, signal);
      data = result; metadata = { ...base, head: result.head, verification: 'retained_inventory_history_lineage_only' };
    } else if (command.action === 'preview') {
      data = await buildBasDeliverableScope(workflow, command.specification, signal);
      metadata = { ...base, verification: 'shared_scope_preview' };
    } else if (command.action === 'prepare_coverage') {
      data = await prepareBasScopeCoverage(workflow, command.request, signal);
      metadata = { ...base, verification: 'source_reference_candidates_only' };
    } else if (command.action === 'record') {
      const result = await applyBasScopeReview(workflow, command.request, 'agent_proposal', { signal });
      updated = result.workflow; data = { event: result.event };
      metadata = { ...base, head: updated.scope_events!.at(-1)!.event_id, event_id: result.event.event_id, verification: 'shared_action_validated' };
    } else {
      data = await readBasScopeDecision(workflow, command.event_id, { signal });
      metadata = { ...base, event_id: command.event_id, verification: 'shared_projection_replayed' };
    }
    guard(); const bytes = Buffer.from(JSON.stringify(data));
    if (bytes.length > LIMIT) throw new Error('Scope delivery exceeds its 128 MiB bound; no decision was saved.');
    view = { ...metadata, id: randomUUID(), fingerprint: createHash('sha256').update(bytes).digest('hex'), bytes, data,
      guard: beforeGuard, expires: Date.now() + TTL };
  }
  // A failed read path or changed Session must not leave a hidden saved decision.
  const page = command.action === 'export' ? null : readBasRevisionView(view.data, command.query);
  const result = basScopeTransportResultSchema.parse({ action: command.action, operation: view.operation,
    view_id: view.id, result_fingerprint: view.fingerprint, encoded_bytes: view.bytes.length,
    expires_at: new Date(view.expires).toISOString(), head: view.head, event_id: view.event_id,
    verification: view.verification, page, exported_path: command.action === 'export' ? resolve(command.path) : null,
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
