// The reconcile eval's documents (reconcile-eval.mjs): drawn by seed from the
// assemblies tiers' dev documents, before any reconcile key is written.
//
// SHOULD THIS BE ON THE SHARED PATH? No: eval tooling. No surface imports it.
//
//   node scripts/reconcile-split.mjs <corpus-dir> [--seed N]
//
// Pool: every dev document of the assemblies tiers 1 to 5 (reports/assemblies/
// 01-split.json and tier<N>/01-split.json) that holds at least four keyed
// units (its attribute key), is no held-out document of any loop (the binding
// tiers' held-out sides included), and is not 01_NY (a 162-sheet set whose
// graph outgrows this container). dev: the first 12 of the seeded shuffle;
// check: the next 8, keyed and scored in aggregate only, never tuned on.
// Writes reports/reconcile/01-split.{json,md}.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, seededShuffle } from "./assembliesSplit.mjs";

export const RECONCILE_SEED = 187;
export const RECONCILE_DEV_DOCS = 12;
export const RECONCILE_CHECK_DOCS = 8;

/** Keyed units in an attribute key: distinct (sheet, tag). */
export function keyedUnits(csvText) {
  const L = csvText.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  if (!L.length) return 0;
  const h = L[0].split(","); const ti = h.indexOf("tag");
  return new Set(L.slice(1).map((l) => { const c = l.split(","); return c[ti] ? `${c[0]}|${c[ti]}` : null; }).filter(Boolean)).size;
}

export function drawReconcile(pool, seed = RECONCILE_SEED) {
  const order = seededShuffle([...pool].sort(), mulberry32(seed));
  return { dev: order.slice(0, RECONCILE_DEV_DOCS), check: order.slice(RECONCILE_DEV_DOCS, RECONCILE_DEV_DOCS + RECONCILE_CHECK_DOCS), order };
}

async function main() {
  const argv = process.argv.slice(2);
  const corpusDir = argv.find((a) => !a.startsWith("--"));
  if (!corpusDir) { console.error("usage: node scripts/reconcile-split.mjs <corpus-dir> [--seed N]"); process.exit(2); }
  const i = argv.indexOf("--seed"); const seed = i >= 0 ? Number(argv[i + 1]) : RECONCILE_SEED;
  const corpus = resolve(corpusDir);
  const tiers = [JSON.parse(readFileSync(join(corpus, "reports/assemblies/01-split.json"), "utf8")).dev.sets];
  for (const t of [2, 3, 4, 5]) tiers.push(JSON.parse(readFileSync(join(corpus, `reports/assemblies/tier${t}/01-split.json`), "utf8")).dev.sets);
  const held = new Set([
    ...JSON.parse(readFileSync(join(corpus, "reports/assemblies/01-split.json"), "utf8")).heldout.sets,
    ...[2, 3, 4, 5].flatMap((t) => JSON.parse(readFileSync(join(corpus, `reports/assemblies/tier${t}/01-split.json`), "utf8")).heldout?.sets ?? []),
    ...JSON.parse(readFileSync(join(corpus, "reports/control-intent/binding-tier2/01-split.json"), "utf8")).heldout.sets,
  ]);
  const units = (id) => { const p = join(corpus, "keys", `${id}.attrs.csv`); return existsSync(p) ? keyedUnits(readFileSync(p, "utf8")) : 0; };
  const pool = [...new Set(tiers.flat())].filter((id) => !held.has(id) && units(id) >= 4 && !id.startsWith("01_NY_"));
  const { dev, check, order } = drawReconcile(pool, seed);
  const split = { seed, pool: pool.length, dev: { sets: dev }, check: { sets: check }, rest: order.slice(dev.length + check.length) };
  const dir = join(corpus, "reports", "reconcile");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "01-split.json"), JSON.stringify(split, null, 1) + "\n");
  const md = ["# Reconcile eval: the draw", "", `Seed ${seed}. Pool: the ${pool.length} dev documents of the assemblies tiers with four or more keyed units, no held-out document of any loop, and not 01_NY.`,
    `Dev (keyed; misses may inform rules): ${dev.join(", ")}.`, `Check (keyed; scored in aggregate only, never tuned on): ${check.join(", ")}.`, `Not drawn: ${split.rest.join(", ")}.`];
  writeFileSync(join(dir, "01-split.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
