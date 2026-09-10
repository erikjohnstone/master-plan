/** Shared restore meaning, merge and replay gates. No IDB, file paths or UI.
 * A preview is not a source-set review, approval or current-math assertion. */
import { parseTakeoffImport, mergeTakeoffImport } from './importTakeoff.js';
import { canonicalBasJson } from './basCanonical.ts';
import { inspectBasSourceHistory, type BasSourceInventoryItem } from './basSourceRetention.ts';
import { assertBasWorkflowReplayReceipt, type BasWorkflowReplayReceipt } from './basWorkflowReplay.ts';
import { BAS_BUNDLE_LIMITS } from './basEvidenceBundle.ts';
import { sha256Hex } from './graphKeys.js';

type Guard = () => void;
export const basRestoreJson = (value: unknown): string => canonicalBasJson(JSON.parse(JSON.stringify(value)));
type Payload = Record<string, any>;
type Binding = { name: string; source_id: string };
interface OwnedPlan {
  operation_id: string; bundle_id: string; before: Payload; payload: Payload;
  expected_json: string; payload_sha256: string; inventory: BasSourceInventoryItem[];
  legacy_bindings: Binding[]; note: ReturnType<typeof mergeTakeoffImport>['note'];
  replay?: BasWorkflowReplayReceipt;
}
export interface BasRestorePlan {
  readonly operation_id: string;
  readonly preview: { originals: number; original_bytes: number; captures: number;
    legacy_files: string[]; merge: OwnedPlan['note']; project_complete: false; approved: false };
}
const plans = new WeakMap<BasRestorePlan, OwnedPlan>();
const privatePlan = (plan: BasRestorePlan) => {
  const value = plans.get(plan);
  if (!value) throw new Error('Restore preview is no longer available. Preview the archive again.');
  return value;
};

// Legacy drawing coordinates are filename-bound. Check every changed non-BAS
// branch (including nested links and sheet-keyed maps), not just new shapes.
// Unchanged operator state is not cargo and must not be reinterpreted.
function legacyBindings(before: Payload, after: Payload, incoming: BasSourceInventoryItem[]): Binding[] {
  const names = new Map<string, Set<string>>(), required = new Set<string>();
  for (const item of incoming) for (const name of item.names) {
    const ids = names.get(name) ?? new Set<string>(); ids.add(item.source.source_id); names.set(name, ids);
  }
  const visitString = (value: string, sheetReference = false) => {
    const match = /^(.*)#([1-9]\d*)$/.exec(value);
    // A numeric CSS hex color (for example #475569) is not a page reference.
    if (match && !match[1] && !sheetReference) return;
    // The existing canvas's first page is the BARE filename, not name#1.
    if (!match && !names.has(value) && !/\.pdf$/i.test(value) && !sheetReference) return;
    const name = match ? match[1] : value, page = match ? match[2] : '1';
    const ids = names.get(name);
    if (!ids || ids.size !== 1) throw new Error(`Cannot restore filename-bound annotations for "${name}": the archive does not identify one unambiguous original. Explicit drawing correspondence is required.`);
    const source = incoming.find(i => i.source.source_id === [...ids][0])!.source;
    if (!Number.isSafeInteger(Number(page)) || Number(page) > source.page_count) throw new Error(`Annotation page is outside the archived original: ${value}`);
    required.add(name);
  };
  const visit = (old: any, next: any, sheetReference = false) => {
    if (old !== undefined && basRestoreJson(old) === basRestoreJson(next)) return;
    if (typeof next === 'string') { visitString(next, sheetReference); return; }
    if (!next || typeof next !== 'object') return;
    for (const [key, value] of Object.entries(next)) {
      visitString(key);
      visit(old?.[key], value, sheetReference || ['sheet_id', 'sheet_ids', 'sheet_group', 'last_group', 'sheet_tabs'].includes(key));
    }
  };
  for (const [key, value] of Object.entries(after)) {
    // Open tabs / pan groups are view state, not annotations or source truth.
    // Their normal importer/hydrator behavior must not make old PDF versions
    // members of the active drawing set merely to inspect archived BAS history.
    if (['bas_workflow', 'sheet_group', 'last_group', 'sheet_tabs'].includes(key)) continue;
    // Filename-prefix correction rules predate version ownership. They are not
    // safely portable just because one observed page happens to match today.
    if (key === 'rules' && Array.isArray(value) && value.length && basRestoreJson(before.rules ?? []) !== basRestoreJson(value)) {
      throw new Error('This backup adds legacy correction rules without original-version ownership. Review their drawing correspondence before restoring; no rules were dropped.');
    }
    visit(before[key], value, ['sheet_group', 'last_group', 'sheet_tabs'].includes(key));
  }
  return [...required].sort().map(name => ({ name, source_id: [...names.get(name)!][0] }));
}

export async function prepareBasRestore(rawCurrent: unknown, rawIncoming: unknown, bundleId: string, guard: Guard = () => {}): Promise<BasRestorePlan> {
  guard();
  if (!/^[a-f0-9]{64}$/.test(bundleId)) throw new Error('Invalid evidence bundle identity');
  const expected_json = basRestoreJson(structuredClone(rawCurrent));
  const before = parseTakeoffImport(expected_json), incoming = parseTakeoffImport(basRestoreJson(structuredClone(rawIncoming)));
  const incomingHistory = await inspectBasSourceHistory(incoming.bas_workflow); guard();
  const { payload, note } = mergeTakeoffImport(before, incoming);
  const history = await inspectBasSourceHistory(payload.bas_workflow); guard();
  const bytes = new TextEncoder().encode(basRestoreJson(payload));
  const total = history.inventory.reduce((sum, item) => sum + item.source.byte_length, 0);
  if (bytes.length > BAS_BUNDLE_LIMITS.payload || !history.inventory.length || history.inventory.length > BAS_BUNDLE_LIMITS.sources
    || history.inventory.some(i => i.source.byte_length > BAS_BUNDLE_LIMITS.pdf) || total + bytes.length > BAS_BUNDLE_LIMITS.archive) {
    throw new Error('Merged restoration exceeds the supported evidence-bundle limits. Existing data was not changed.');
  }
  const legacy_bindings = legacyBindings(before, payload, incomingHistory.inventory);
  const operation_id = crypto.randomUUID(), payload_sha256 = await sha256Hex(bytes); guard();
  const plan = Object.freeze({ operation_id, preview: Object.freeze({ originals: history.inventory.length, original_bytes: total,
    captures: history.workflow.captures.length, legacy_files: legacy_bindings.map(b => b.name), merge: structuredClone(note), project_complete: false as const, approved: false as const }) });
  plans.set(plan, { operation_id, bundle_id: bundleId, before, payload, expected_json, payload_sha256,
    inventory: history.inventory, legacy_bindings, note });
  return plan;
}

/** Production callers supply the actual shared Python service, never a receipt
 * accepted from an archive, user input, checkbox or MCP request. */
export async function replayBasRestore(plan: BasRestorePlan, service: (workflow: any) => Promise<unknown>, guard: Guard = () => {}) {
  const owned = privatePlan(plan); guard();
  const result = await service(structuredClone(owned.payload.bas_workflow)); guard();
  const receipt = await assertBasWorkflowReplayReceipt(owned.payload.bas_workflow, result, guard); guard();
  owned.replay = structuredClone(receipt);
  return structuredClone(receipt);
}

export function readBasRestorePlan(plan: BasRestorePlan, requireReplay = false) {
  const owned = privatePlan(plan);
  if (requireReplay && !owned.replay) throw new Error('Restore requires successful shared Python replay of the complete merged history.');
  return structuredClone(owned);
}
