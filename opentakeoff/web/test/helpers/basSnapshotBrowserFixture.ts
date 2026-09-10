/** A static Vite import graph for native browser tests. Raw imports injected by
 * page.evaluate bypass Vite's HMR dependency URLs and create a second WeakMap.
 * This helper does not supply fake approval authority or bypass source replay. */
export { readinessFixture, reviewReadyScope } from './basReadinessFixture.ts';
export { uuid } from './basEngineeringFixture.ts';
export { prepareBasSnapshotApproval, readBasSnapshotPlan } from '../../src/lib/basSnapshot.ts';
export { createLocalStore, metaGet, metaPut } from '../../src/lib/store.js';
