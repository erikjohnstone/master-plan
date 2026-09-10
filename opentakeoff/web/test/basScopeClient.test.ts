/** Surface-state gates only; no duplicate BAS interpretation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeFixture, scopeRequest } from './helpers/basScopeFixture.ts';
import { recordBasScopeFromUi } from '../src/components/basScopeClient.ts';
import { populateScopeDraft, selectScopeTarget, scopeWindow, scopeChoiceLabels } from '../src/components/basScopeEditorState.ts';
import { catalogBasScope } from '../src/lib/basScopeCatalog.ts';
import { basDeliverableScopeSpecSchema } from '../src/lib/basDeliverableScopeContract.ts';

test('scope writes bind the exact browser workflow, source, storage, epoch and cancellation', async () => {
  const f = await scopeFixture(), request = scopeRequest(f.workflow, 720, f.coverage);
  for (const race of ['none', 'workflow', 'mutation', 'epoch', 'signature', 'adapter', 'cancel']) {
    const context = { workflow: structuredClone(f.workflow), epoch: 1, signature: 'source-v1', adapter: {} };
    let adoptions = 0; const abort = new AbortController();
    const pending = recordBasScopeFromUi(() => context, w => { context.workflow = w; adoptions++; }, request, { signal: abort.signal });
    if (race === 'workflow') context.workflow = structuredClone(context.workflow);
    if (race === 'mutation') context.workflow.scope_events![0].reason = 'In-place external edit';
    if (race === 'epoch') context.epoch++;
    if (race === 'signature') context.signature = 'source-v2';
    if (race === 'adapter') context.adapter = {};
    if (race === 'cancel') abort.abort();
    if (race === 'none') { const result = await pending; assert.equal(adoptions, 1); assert.equal(result.event.origin, 'operator_input'); }
    else { await assert.rejects(pending, /stale|abort/i); assert.equal(adoptions, 0); }
  }
});

test('populated draft preserves exclusions and all references, and never invents valid blank decisions', async () => {
  const f = await scopeFixture(), catalog = await catalogBasScope(f.workflow, { source_set_id: f.basis.source_set_id });
  const target = catalog.targets[0].target;
  const excluded = selectScopeTarget(f.specification, target, 'excluded');
  assert.equal(excluded.excluded.length, 1); assert.equal(excluded.excluded[0].reason, ''); assert.deepEqual(excluded.excluded[0].evidence, []);
  assert.equal(basDeliverableScopeSpecSchema.safeParse(excluded).success, false, 'No reason or evidence is fabricated');
  excluded.excluded[0].reason = 'Explicit scope exclusion'; excluded.excluded[0].consequence = 'Separate deliverable must address this claim';
  excluded.excluded[0].evidence = f.source.pages.map(p => ({ capture_id: f.workflow.current_capture_id!, page_id: p.page_id, span_id: p.spans[0].span_id }));
  const all = populateScopeDraft(excluded, catalog);
  assert.equal(all.included.length, catalog.targets.length - 1); assert.deepEqual(all.excluded, excluded.excluded);
  assert.deepEqual(selectScopeTarget(all, target, 'excluded'), all);
  assert.equal(selectScopeTarget(all, target, 'included').excluded.length, 0);
  assert.equal(selectScopeTarget(all, target, 'unselected').excluded.length, 0);
  const tooMany = { ...catalog, targets: Array.from({ length: 2001 }, () => catalog.targets[0]) };
  assert.throws(() => populateScopeDraft(all, tooMany), /nothing was truncated/);
  assert.equal(all.excluded[0].evidence.length, 2);
});

test('catalog, source and history windows preserve every row across pages', () => {
  const rows = Array.from({ length: 213 }, (_, i) => i);
  assert.deepEqual([0, 1, 2, 3, 4].flatMap(page => scopeWindow(rows, page).rows), rows);
  assert.equal(scopeWindow(rows, 500).page, 4); assert.equal(scopeWindow(rows, -1).page, 0);
  assert.equal(scopeWindow(rows, NaN).page, 0); assert.deepEqual(scopeWindow([], 500), { rows: [], page: 0, total: 0 });
});

test('duplicate source labels have distinct accessible choices without changing owned selection keys', async () => {
  const f = await scopeFixture(), catalog = await catalogBasScope(f.workflow, { source_set_id: f.basis.source_set_id });
  const a = catalog.targets[0], b = { ...a, target: { ...a.target, capture_id: 'b'.repeat(64) } };
  const names = scopeChoiceLabels([a, b]);
  assert.equal(names.size, 2); assert.equal(new Set(names.values()).size, 2);
  assert.match([...names.values()][0], /Review item 1/); assert.match([...names.values()][1], /Review item 2/);
  assert.deepEqual(scopeChoiceLabels([a, b]), names, 'Stable display ordering across navigation');
  assert.equal([...scopeChoiceLabels([a]).values()][0], `Scheduled equipment ${a.label}`);
});
