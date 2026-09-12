/** Diagnostic only, own Node process. Collected objects are included so this
 * measures estimated allocation churn, not a heap/retained-memory leaderboard.
 * https://chromedevtools.github.io/devtools-protocol/v8/HeapProfiler/#method-startSampling */
import { Session } from 'node:inspector/promises';
export async function allocationProfiler(enabled: boolean) {
  if (!enabled) return { checkpoint: async (_stage: string) => {}, close: () => {} };
  const session = new Session(); session.connect();
  const start = () => session.post('HeapProfiler.startSampling', { samplingInterval: 32768,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await start();
  return {
    async checkpoint(stage: string) {
      const { profile } = await session.post('HeapProfiler.stopSampling');
      const byOwner = new Map<string, number>(), byLeaf = new Map<string, number>(), canonicalCallers = new Map<string, number>();
      let total = 0;
      const subtreeSizes = new WeakMap<object, number>();
      const subtreeSize = (node: typeof profile.head): number => {
        const cached = subtreeSizes.get(node); if (cached !== undefined) return cached;
        const size = node.selfSize + node.children.reduce((sum, child) => sum + subtreeSize(child), 0);
        subtreeSizes.set(node, size); return size;
      };
      const visit = (node: typeof profile.head, owner = '(runtime / no shared caller)', caller = '(runtime / entrypoint)') => {
        const f = node.callFrame, location = `${f.url}:${f.lineNumber + 1} ${f.functionName || '(anonymous)'}`;
        if (f.url.endsWith('/basCanonical.ts') && !caller.startsWith(f.url))
          canonicalCallers.set(caller, (canonicalCallers.get(caller) || 0) + subtreeSize(node));
        const current = f.url.includes('/web/src/lib/') ? location : owner;
        byOwner.set(current, (byOwner.get(current) || 0) + node.selfSize);
        byLeaf.set(location, (byLeaf.get(location) || 0) + node.selfSize); total += node.selfSize;
        for (const child of node.children) visit(child, current, location);
      };
      visit(profile.head);
      const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([location, estimated_allocated_bytes]) => ({ location, estimated_allocated_bytes }));
      console.error(JSON.stringify({ allocation_stage: stage, estimated_allocated_bytes: total, includes_collected_objects: true,
        source_owners: top(byOwner), allocation_leaves: top(byLeaf), canonical_callers: top(canonicalCallers) }));
      await start();
    },
    close() { session.disconnect(); },
  };
}
