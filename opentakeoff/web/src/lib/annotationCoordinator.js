// Browser delivery only. Same IDB annotation scope must mean the same lease in
// every tab and transport. Never use a provider folder id for the anonymous store.
export function withAnnotationCoordinator(projectId, work, { signal } = {}) {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) return Promise.reject(new Error('Coordinated takeoff sync and restore require a browser with Web Locks support.'));
  return locks.request(`opentakeoff:annotations:${JSON.stringify(projectId || '')}`,
    { mode: 'exclusive', ...(signal ? { signal } : {}) }, async () => {
      signal?.throwIfAborted();
      return work();
    });
}
