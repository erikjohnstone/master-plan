import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentPreviewReady } from '../src/components/basEquipmentEditorState.ts';

test('opening Equipment without a draft or preview cannot render a nonexistent validated view', () => {
  assert.equal(equipmentPreviewReady(null, undefined, false), false);
  assert.equal(equipmentPreviewReady(null, null, false), false);
  assert.equal(equipmentPreviewReady({ input: undefined }, undefined, false), false);
  assert.equal(equipmentPreviewReady(null, { reason: 'new decision' }, false), false);
});

test('only the exact previewed editor input can enable recording; edits and stale evidence invalidate it', () => {
  const draft = { reason: 'reviewed input' }, preview = { input: draft };
  assert.equal(equipmentPreviewReady(preview, draft, false), true);
  assert.equal(equipmentPreviewReady(preview, draft, true), false);
  assert.equal(equipmentPreviewReady(preview, { ...draft }, false), false);
  assert.equal(equipmentPreviewReady(preview, null, false), false);
});
