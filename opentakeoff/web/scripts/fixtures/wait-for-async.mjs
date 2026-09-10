import { setTimeout as delay } from 'node:timers/promises';

// Diagnostic-only polling. Await the resolved predicate value: an unresolved
// Promise is truthy and must not count as a successful persistence check.
export async function waitForAsync(predicate, { timeout = 15000, interval = 100, label = 'async condition' } = {}) {
  const deadline = performance.now() + timeout;
  let attempts = 0;
  let last;
  do {
    last = await predicate();
    attempts++;
    if (last) return last;
    if (performance.now() >= deadline) break;
    await delay(Math.min(interval, Math.max(0, deadline - performance.now())));
  } while (performance.now() < deadline);
  throw new Error(`Timed out waiting for ${label} after ${attempts} attempts; last resolved value: ${JSON.stringify(last)}`);
}
