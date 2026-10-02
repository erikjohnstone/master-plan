// One command for the complete scored corpus loop. Takeoff and reference
// metrics share one pipeline pass; graph evaluation remains separate because
// it performs additional room/tag/row-symbol scoring; table-recall is the
// recall-tier check (does the pipeline find a table at all, independent of
// whether it scores it right) and is cheap/no-op until a *.tables.csv key
// exists for a set; tag-eval (plans/03-drawing-tag-recognition-audit.md
// §3.8, WP7) is the same recall-tier discipline applied to graph.tags —
// cheap/no-op until a *.tags.csv key exists for a set.
//
//   node --import tsx scripts/corpus-eval.mjs <corpus-dir> [setId ...] [--report]
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith("--")) {
  console.error("usage: node --import tsx scripts/corpus-eval.mjs <corpus-dir> [setId ...] [--report]");
  process.exit(2);
}

const scripts = dirname(fileURLToPath(import.meta.url));

function run(label, script, scriptArgs) {
  const started = performance.now();
  console.error(`\n=== ${label} ===`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", join(scripts, script), ...scriptArgs], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      if (code === 0) {
        console.error(`=== ${label} completed in ${elapsed}s ===`);
        resolve();
      } else {
        reject(new Error(`${label} exited ${code ?? `from signal ${signal}`}`));
      }
    });
  });
}

const started = performance.now();
try {
  // All three scorers are independent readers. Run them together so the
  // default two-worker fan-out in each script fills all four CPU cores
  // instead of leaving half the machine idle and paying the passes serially.
  const stages = [
    ["takeoff + reference", "takeoff-eval.mjs", [...args, "--with-reference"]],
    ["sheet graph", "graph-eval.mjs", args.filter((arg) => arg !== "--with-reference")],
    ["table recall", "table-recall-eval.mjs", args.filter((arg) => arg !== "--with-reference" && arg !== "--report")],
    ["tag census", "tag-eval.mjs", args.filter((arg) => arg !== "--with-reference" && arg !== "--report")],
  ];
  // OPENTAKEOFF_EVAL_SERIAL=1 runs the scorers one after another. In parallel
  // (eight graph-building children plus their table sidecars) a 16 GB machine
  // OOM-kills children mid-set, and a killed set reads as an ERROR row that an
  // A/B would wrongly attribute to the code (navfac, 2026-10-02).
  if (process.env.OPENTAKEOFF_EVAL_SERIAL === "1") {
    for (const [label, script, scriptArgs] of stages) await run(label, script, scriptArgs);
  } else {
    await Promise.all(stages.map(([label, script, scriptArgs]) => run(label, script, scriptArgs)));
  }
  console.error(`\n=== complete corpus evaluation finished in ${((performance.now() - started) / 1000).toFixed(1)}s ===`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
