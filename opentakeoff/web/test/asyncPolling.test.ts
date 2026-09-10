import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForAsync } from '../scripts/fixtures/wait-for-async.mjs';

test('diagnostic polling awaits false promises and retries until true', async () => {
  let attempts = 0;
  assert.equal(await waitForAsync(async () => ++attempts >= 3, { interval: 1 }), true);
  assert.equal(attempts, 3);
});

test('diagnostic polling cannot pass a continuously false async condition', async () => {
  await assert.rejects(waitForAsync(async () => false, { timeout: 5, interval: 1, label: 'save' }), /Timed out waiting for save.*last resolved value: false/);
});

test('diagnostic polling propagates predicate errors rather than hiding them', async () => {
  await assert.rejects(waitForAsync(async () => { throw new Error('storage unavailable'); }), /storage unavailable/);
});
