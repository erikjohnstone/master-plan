// One sheet-graph build per set on the server (#331): a request for a set
// being built follows that build instead of starting another, a build
// outlives the request that started it (a page reloaded mid-index picks it up
// again), and one nobody follows for its grace period is stopped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { sharedGraphBuild } from "../vite.corpusTakeoffApi.js";

type Step = { phase: string; stage: string; done: number; total: number };
type RunOptions = { outPath: string; signal: AbortSignal; onProgress: (p: Step) => void };

/** A stand-in for the graph CLI: reads sheet 0 and 1 of 2, waits until
 * released (or stopped), reads sheet 2 and writes the graph. */
function fakeCli(log: string[]) {
  let release = () => {};
  const released = new Promise<void>((resolve) => { release = resolve; });
  const run = async ({ outPath, signal, onProgress }: RunOptions) => {
    log.push("start");
    for (const done of [0, 1]) onProgress({ phase: "graph_step", stage: "sheets", done, total: 2 });
    await Promise.race([released, new Promise((_, reject) => {
      signal.addEventListener("abort", () => { log.push("stopped"); reject(new Error("stopped")); }, { once: true });
    })]);
    onProgress({ phase: "graph_step", stage: "sheets", done: 2, total: 2 });
    await writeFile(outPath, JSON.stringify({ tables: [{ title: "PUMP SCHEDULE" }] }));
    log.push("done");
  };
  return { run: run as never, release: () => release() };
}

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(ok(), "condition reached");
};

test("requests for one set follow one build, a late one from the step it has reached", async () => {
  const log: string[] = [];
  const cli = fakeCli(log);
  const paths = [`/spool/one-build-${process.pid}.pdf`];
  const first = sharedGraphBuild(paths, { run: cli.run });
  const seenFirst: number[] = [];
  const leaveFirst = first.follow((p) => seenFirst.push((p as Step).done));
  await until(() => seenFirst.length === 2);
  // A reload, or a second tab: the same set, while the build is at sheet 1.
  const second = sharedGraphBuild(paths, { run: cli.run });
  const seenSecond: number[] = [];
  const leaveSecond = second.follow((p) => seenSecond.push((p as Step).done));
  cli.release();
  const [a, b] = await Promise.all([first.result, second.result]);
  leaveFirst();
  leaveSecond();
  assert.equal(a, b);
  assert.deepEqual(JSON.parse(a), { tables: [{ title: "PUMP SCHEDULE" }] });
  assert.deepEqual(log, ["start", "done"], "one build");
  assert.deepEqual(seenFirst, [0, 1, 2]);
  assert.deepEqual(seenSecond, [1, 2], "the step reached at once, then each step");
  // Finished, the build is gone: the next request starts afresh (in the
  // server, the graph CLI then answers from the sheet-graph cache).
  const again = fakeCli(log);
  const third = sharedGraphBuild(paths, { run: again.run });
  again.release();
  await third.result;
  assert.deepEqual(log, ["start", "done", "start", "done"]);
});

test("a build outlives its request: followed again within the grace it carries on, left alone it is stopped", async () => {
  const log: string[] = [];
  const cli = fakeCli(log);
  const paths = [`/spool/grace-${process.pid}.pdf`];
  const build = sharedGraphBuild(paths, { run: cli.run, graceMs: 60 });
  build.follow()();                          // the page that asked is reloaded
  await new Promise((resolve) => setTimeout(resolve, 20));
  const leave = sharedGraphBuild(paths, { run: cli.run, graceMs: 60 }).follow();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(log, ["start"], "followed again in time: not stopped");
  cli.release();
  await build.result;
  leave();
  assert.deepEqual(log, ["start", "done"]);

  const abandoned: string[] = [];
  const quiet = fakeCli(abandoned);
  const other = sharedGraphBuild([`/spool/abandoned-${process.pid}.pdf`], { run: quiet.run, graceMs: 30 });
  other.follow()();                          // the tab is closed for good
  // The grace timer does not hold the process open (the server's listener
  // does); this interval stands in for it.
  const server = setInterval(() => {}, 1000);
  try {
    await assert.rejects(other.result, /stopped/);
  } finally {
    clearInterval(server);
  }
  assert.deepEqual(abandoned, ["start", "stopped"]);
});
