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
      const byOwner = new Map<string, number>(), byLeaf = new Map<string, number>(); let total = 0;
      const visit = (node: typeof profile.head, owner = '(runtime / no shared caller)') => {
        const f = node.callFrame, location = `${f.url}:${f.lineNumber + 1} ${f.functionName || '(anonymous)'}`;
        const current = f.url.includes('/web/src/lib/') ? location : owner;
        byOwner.set(current, (byOwner.get(current) || 0) + node.selfSize);
        byLeaf.set(location, (byLeaf.get(location) || 0) + node.selfSize); total += node.selfSize;
        for (const child of node.children) visit(child, current);
      };
      visit(profile.head);
      const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([location, estimated_allocated_bytes]) => ({ location, estimated_allocated_bytes }));
      console.error(JSON.stringify({ allocation_stage: stage, estimated_allocated_bytes: total, includes_collected_objects: true,
        source_owners: top(byOwner), allocation_leaves: top(byLeaf) }));
      await start();
    },
    close() { session.disconnect(); },
  };
}
