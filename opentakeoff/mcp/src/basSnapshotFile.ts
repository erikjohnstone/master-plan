/** Public MCP read/export path for immutable scoped snapshots. Approval and
 * lifecycle writes remain explicit browser-operator actions. */
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { readBasSnapshotPlan } from '../../web/src/lib/basSnapshot.ts';
import { assessBasSnapshotCurrentness, basSnapshotCurrentnessSchema, basSnapshotLifecycleExportSchema,
  evaluateBasSnapshotLifecycle } from '../../web/src/lib/basSnapshotLifecycle.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { buildXlsx } from '../../web/src/lib/xlsx.js';
import { withBasSnapshotBundleFile } from './basEvidenceBundleFile.ts';
import { verifyBasWorkflowCalculations } from './basWorkflowReplay.ts';
import { writeAtomicArtifact } from './atomicArtifactFile.ts';
import type { Session } from './session.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basSnapshotFileInspectionSchema = z.object({
  schema_version: z.literal('bas_snapshot_file_inspection_v1'), snapshot_id: sha,
  archive: z.string(), status: z.literal('verified_historical_scope'), lifecycle_status: z.enum(['approved', 'revoked', 'superseded']),
  reviewer: z.string(), declared_at: z.string().datetime(), scope_name: z.string(), source_count: z.number().int().nonnegative(),
  claim_count: z.number().int().nonnegative(), exclusion_count: z.number().int().nonnegative(), finding_count: z.number().int().nonnegative(),
  calculation_verification: z.enum(['verified_shared_python_replay', 'no_saved_calculations']),
  currentness: z.union([basSnapshotCurrentnessSchema, z.object({ status: z.literal('not_evaluated') }).strict()]),
  workbook_path: z.string().nullable(), approval: z.literal('self_declared_historical_scope'),
  project_complete: z.literal(false), installed_quantity: z.null(),
}).strict();

async function readLifecycle(path: string | undefined, snapshotId: string, record: unknown) {
  if (!path) return { events: [], state: await evaluateBasSnapshotLifecycle(record, []) };
  const target = resolve(path), info = await stat(target);
  if (!info.isFile() || info.size > 16 * 1024 ** 2) throw new Error('Snapshot lifecycle sidecar must be a regular JSON file no larger than 16 MiB');
  const value = basSnapshotLifecycleExportSchema.parse(JSON.parse(await readFile(target, 'utf8')));
  if (value.snapshot_id !== snapshotId) throw new Error('Snapshot lifecycle sidecar belongs to another snapshot');
  const state = await evaluateBasSnapshotLifecycle(record, value.lifecycle.events);
  if (canonicalBasJson(state) !== canonicalBasJson(value.lifecycle.state)) throw new Error('Snapshot lifecycle sidecar state does not replay exactly');
  return { events: value.lifecycle.events, state };
}

const json = (value: unknown) => canonicalBasJson(value);
function workbookSheets(record: any, readiness: any, lifecycle: any, currentness: any) {
  const summary = [
    ['Field', 'Value'], ['Snapshot ID', record.snapshot_id], ['Lifecycle', lifecycle.state.status],
    ['Reviewed scope', readiness.scope.specification.name], ['Reviewer (self-declared)', record.snapshot.declaration.reviewer],
    ['Declared at (local/untrusted)', record.snapshot.declaration.declared_at], ['Approval reason', record.snapshot.declaration.reason],
    ['Claims', readiness.scope.claims.length], ['Exclusions', readiness.scope.exclusions.length], ['Findings', readiness.issues.length],
    ['Original source versions', readiness.sources.length], ['Calculation replay', readiness.replay?.calculation_verification || 'no_saved_calculations'],
    ['Currentness', currentness.status], ['Project complete', false], ['Installed quantity', 'not established'],
  ];
  const claims = [['Claim', 'Capture', 'Subject', 'Root item', 'Dependency status', 'Diagnostics'],
    ...readiness.scope.claims.map((claim: any) => [claim.target.claim, claim.target.capture_id, claim.target.subject_id,
      claim.root_item_id, claim.dependency_status, json(claim.diagnostics)])];
  const exclusions = [['Claim', 'Capture', 'Subject', 'Reason', 'Consequence', 'Evidence'],
    ...readiness.scope.exclusions.map((item: any) => [item.target.claim, item.target.capture_id, item.target.subject_id,
      item.reason, item.consequence, json(item.evidence)])];
  const findings = [['Scope', 'Domain', 'Code', 'Severity', 'Subject', 'Next step', 'Effects', 'Evidence'],
    ...readiness.issues.map((item: any) => [item.scope, item.issue.domain, item.issue.code, item.issue.severity,
      item.issue.subject?.label || item.issue.subject?.id || '', item.issue.next_step, json(item.effects), json(item.issue.evidence)])];
  const sources = [['Source ID', 'SHA-256', 'Bytes', 'Verification'], ...readiness.sources.map((item: any) => [
    item.source.source_id, item.source.sha256, item.source.byte_length, item.status])];
  const lifecycleRows = [['Event', 'Action', 'Reviewer', 'Declared at', 'Reason', 'Successor'],
    ...lifecycle.events.map((event: any) => [event.event_id, event.action.kind, event.declaration.reviewer,
      event.declaration.declared_at, event.declaration.reason, event.action.successor_snapshot_id || ''])];
  return [{ name: 'SUMMARY', rows: summary }, { name: 'CLAIMS', rows: claims }, { name: 'EXCLUSIONS', rows: exclusions },
    { name: 'FINDINGS', rows: findings }, { name: 'SOURCES', rows: sources }, { name: 'LIFECYCLE', rows: lifecycleRows }];
}

export async function inspectBasSnapshotFile(session: Session, rawPath: string, options: {
  lifecyclePath?: string; compareCurrent?: boolean; workbookPath?: string; overwrite?: boolean; signal?: AbortSignal;
} = {}) {
  const path = resolve(rawPath), sessionGuard = options.compareCurrent ? session.basRestoreGuard() : () => {};
  const guard = () => { options.signal?.throwIfAborted(); sessionGuard(); };
  return withBasSnapshotBundleFile(path, options.signal, async archive => {
    guard(); const { record } = readBasSnapshotPlan(archive.plan), readiness = JSON.parse(record.snapshot.readiness_json);
    const lifecycle = await readLifecycle(options.lifecyclePath, record.snapshot_id, record); guard();
    let currentness: any = { status: 'not_evaluated' };
    if (options.compareCurrent) {
      if (!session.basWorkflow) throw new Error('No current retained BAS workflow is loaded for currentness comparison');
      currentness = await assessBasSnapshotCurrentness(archive.plan, session.basWorkflow, lifecycle.events, {
        readSource: async source => { guard(); return session.basOriginalBytes(source.sha256); },
        replayCalculations: workflow => verifyBasWorkflowCalculations(workflow, { signal: options.signal }),
      }, options.signal); guard();
    }
    let workbookPath: string | null = null;
    if (options.workbookPath) {
      workbookPath = resolve(options.workbookPath);
      const bytes = await buildXlsx(workbookSheets(record, readiness, lifecycle, currentness)); guard();
      await writeAtomicArtifact(workbookPath, 'xlsx', [bytes], options.overwrite, guard); guard();
    }
    return basSnapshotFileInspectionSchema.parse({ schema_version: 'bas_snapshot_file_inspection_v1',
      snapshot_id: record.snapshot_id, archive: basename(path), status: 'verified_historical_scope', lifecycle_status: lifecycle.state.status,
      reviewer: record.snapshot.declaration.reviewer, declared_at: record.snapshot.declaration.declared_at,
      scope_name: readiness.scope.specification.name, source_count: readiness.sources.length, claim_count: readiness.scope.claims.length,
      exclusion_count: readiness.scope.exclusions.length, finding_count: readiness.issues.length,
      calculation_verification: readiness.replay?.calculation_verification || 'no_saved_calculations', currentness,
      workbook_path: workbookPath, approval: 'self_declared_historical_scope', project_complete: false, installed_quantity: null });
  });
}
