// Minimal Web Locks API polyfill for `node --test`. Production code
// (annotationCoordinator.js's withAnnotationCoordinator) requires the real
// browser API (navigator.locks) unconditionally -- correctly, since the sync
// engine's crash-safety invariants depend on one exclusive lock per
// annotation scope across tabs/transports. Node has no such API (Node 22's
// own `navigator` global carries no `locks` property at all), so every test
// that exercises the push/reconcile path was silently no-oping: the
// coordinator's lock request rejected before the caller's work ever ran,
// and the various best-effort try/catch blocks throughout syncStore.js
// swallowed it, leaving local and remote state untouched. That produced
// exactly the wrong-count/undefined-property failures this test suite was
// showing -- not a bug in the merge/reconcile logic itself, an environment
// gap in the test harness.
//
// Implements the subset this codebase's own tests actually exercise:
// `request(name, options, callback)` with `mode: 'exclusive'` (the only mode
// annotationCoordinator.js ever requests), AbortSignal support on a QUEUED
// request (rejects and dequeues immediately, per spec -- does not wait for
// the current holder), and `query()` (`{held, pending}`, each entry carrying
// at least `name`) -- several tests synchronize on `query().pending` to
// observe "an operation is now waiting on this lock" without a timer-based
// race. Not spec-complete (no `mode: 'shared'`, no `steal`, no
// `ifAvailable`) -- adding those only when a real test needs them.
import { beforeEach } from "node:test";

interface LockRequestOptions {
  mode?: "exclusive" | "shared";
  signal?: AbortSignal;
}

interface LockInfo {
  name: string;
  mode: "exclusive" | "shared";
}

interface QueueEntry extends LockInfo {
  runWhenHead: () => void;
}

function createLocksPolyfill() {
  const queues = new Map<string, QueueEntry[]>();

  function dequeue(name: string, entry: QueueEntry) {
    const q = queues.get(name);
    if (!q) return;
    const i = q.indexOf(entry);
    if (i === -1) return;
    q.splice(i, 1);
    if (i === 0 && q.length) q[0].runWhenHead(); // promote the new head
    if (!q.length) queues.delete(name);
  }

  return {
    async request<T>(name: string, optionsOrCallback: LockRequestOptions | (() => Promise<T>), maybeCallback?: () => Promise<T>): Promise<T> {
      const isOptionsGiven = typeof optionsOrCallback !== "function";
      const options: LockRequestOptions = isOptionsGiven ? (optionsOrCallback as LockRequestOptions) : {};
      const callback = (isOptionsGiven ? maybeCallback : optionsOrCallback) as () => Promise<T>;
      options.signal?.throwIfAborted?.();

      let q = queues.get(name);
      if (!q) { q = []; queues.set(name, q); }
      const entry: QueueEntry = { name, mode: options.mode ?? "exclusive", runWhenHead: () => {} };
      q.push(entry);

      if (q[0] !== entry) {
        await new Promise<void>((resolve, reject) => {
          entry.runWhenHead = resolve;
          options.signal?.addEventListener("abort", () => {
            dequeue(name, entry);
            reject(options.signal!.reason ?? new DOMException("The request was aborted.", "AbortError"));
          }, { once: true });
        });
      }
      try {
        return await callback();
      } finally {
        dequeue(name, entry);
      }
    },

    async query(): Promise<{ held: LockInfo[]; pending: LockInfo[] }> {
      const held: LockInfo[] = [], pending: LockInfo[] = [];
      for (const q of queues.values()) {
        q.forEach((entry, i) => (i === 0 ? held : pending).push({ name: entry.name, mode: entry.mode }));
      }
      return { held, pending };
    },
  };
}

/** Call once at the top of a test file that (directly or via createSyncStore)
 *  exercises withAnnotationCoordinator. Installs a fresh polyfill instance
 *  before each test so one test's held lock can never bleed into the next. */
export function installWebLocksPolyfill(): void {
  beforeEach(() => {
    // A plain assignment throws on Node 24+, where `navigator.locks` is
    // already defined as a getter-only accessor (Node 22 had no such
    // property at all, so assignment worked there). defineProperty
    // overwrites either shape.
    Object.defineProperty(globalThis.navigator, "locks", {
      value: createLocksPolyfill(),
      configurable: true,
      writable: true,
    });
  });
}
