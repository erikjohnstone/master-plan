// ASSEMBLIES goal — which changed files can move instrument 1 (corpus-eval)?
//
// corpus-eval runs four scorers (takeoff, graph, tag and table-recall evals).
// A change can move their numbers only through a module they import. This
// prints the local modules the scorers import, statically or by a literal
// dynamic import (esbuild's metafile; nothing is written), and the files
// changed since <rev> (committed and in the working tree) that are among them.
//
//   node scripts/assemblies-scorer-imports.mjs [<rev>]
//
// An intersection is not a regression by itself: read each file's diff (a new
// export no scorer calls, or a type, cannot change a score). An empty
// intersection means the corpus-eval cannot have moved since <rev>.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MCP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(MCP, "..");
const { build } = createRequire(resolve(MCP, "package.json"))("esbuild");
const SCORERS = ["corpus-eval", "takeoff-eval", "graph-eval", "tag-eval", "table-recall-eval"];

const r = await build({
  entryPoints: SCORERS.map((s) => resolve(MCP, "scripts", `${s}.mjs`)),
  bundle: true, write: false, metafile: true, platform: "node", format: "esm", outdir: resolve(MCP, ".unused-out"),
  packages: "external", logLevel: "silent", splitting: true,
  loader: { ".json": "json", ".node": "empty", ".wasm": "empty" },
});
const modules = Object.keys(r.metafile.inputs)
  .map((p) => relative(ROOT, resolve(MCP, p)))
  .filter((p) => !p.includes("node_modules"))
  .sort();
console.log(`${modules.length} local modules in the scorers' import graph`);

const rev = process.argv[2];
if (rev) {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const top = git("rev-parse", "--show-prefix")[0] ?? "";
  const strip = (p) => (top && p.startsWith(top) ? p.slice(top.length) : p);
  const changed = new Set([...git("diff", "--name-only", rev, "HEAD", "--", "."), ...git("diff", "--name-only", "--", ".")].map(strip));
  const hit = modules.filter((m) => changed.has(m));
  console.log(`${changed.size} files changed since ${rev}; in the scorers' graph: ${hit.length ? hit.join(", ") : "none"}`);
}
