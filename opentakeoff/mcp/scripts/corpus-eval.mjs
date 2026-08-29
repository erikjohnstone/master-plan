// One command for the complete scored corpus loop. Takeoff and reference
// metrics share one pipeline pass; graph evaluation remains separate because
// it performs additional room/tag/row-symbol scoring.
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
  await run("takeoff + reference", "takeoff-eval.mjs", [...args, "--with-reference"]);
  await run("sheet graph", "graph-eval.mjs", args.filter((arg) => arg !== "--with-reference"));
  console.error(`\n=== complete corpus evaluation finished in ${((performance.now() - started) / 1000).toFixed(1)}s ===`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
