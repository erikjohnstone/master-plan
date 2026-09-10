/** MCP transport over shared retained-source decisions, never a recompile. */
import type { Session } from './session.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { applyBasDrawingReview, prepareBasDrawingAction } from '../../web/src/lib/basDrawingReview.ts';
import { inspectBasDrawings, basDrawingCommandSchema, basDrawingCommandResultSchema } from '../../web/src/lib/basDrawingInspection.ts';
import { compareBasDrawingPages, replayBasDrawingHistory } from '../../web/src/lib/basDrawingRevision.ts';
import { runBasRevisionTransport } from './basRevisionTransport.ts';

export async function runBasDrawingCommand(session: Session, rawCommand: unknown, signal?: AbortSignal) {
  const command = basDrawingCommandSchema.parse(rawCommand), guardState = session.basDrawingGuard();
  const guard = () => { signal?.throwIfAborted(); guardState(); };
  guard();
  const previous = session.basWorkflow;
  if (!previous) throw new Error('No retained BAS workflow. Compile the original drawings or restore a source-inclusive evidence backup first.');
  if (command.kind === 'revision') return { kind: 'revision' as const, result: await runBasRevisionTransport(session, command.command, signal) };
  if (command.kind === 'inspect') {
    const inspection = await inspectBasDrawings(previous, command.query); guard();
    return basDrawingCommandResultSchema.parse({ kind: 'inspect', inspection });
  }
  if (command.kind === 'prepare') {
    const preparation = await prepareBasDrawingAction(previous, command.action); guard();
    return basDrawingCommandResultSchema.parse({ kind: 'prepare', preparation });
  }
  if (command.kind === 'compare') {
    const workflow = await verifyBasWorkflow(previous); guard();
    return basDrawingCommandResultSchema.parse({ kind: 'compare', comparison: compareBasDrawingPages(workflow.captures, command.before, command.after) });
  }
  const updated = await applyBasDrawingReview(previous, command.review, 'agent_proposal'); guard();
  const event = updated.drawing_events!.find(e => e.operation_id === command.review.operation_id)!;
  const replay = replayBasDrawingHistory(updated.captures, updated.drawing_events), set = replay.source_sets.get(event.event_id);
  const result = basDrawingCommandResultSchema.parse({ kind: 'record', event_id: event.event_id, head: replay.head,
    source_set_id: set?.source_set_id ?? null, source_page_count: set?.pages.length ?? null,
    unresolved_pages: replay.revisions.find(r => r.event_id === event.event_id)?.unresolved_pages ?? 0,
    origin: event.origin, recorded: true, approved: false, persistence: 'session_only_until_export' });
  guard(); session.basWorkflow = updated;
  return result;
}
