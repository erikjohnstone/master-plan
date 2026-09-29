// CONTROL INTENT goal: the binding eval's second tier (GATE B1 read on more
// drafters). The first tier's dev keys cover 11 documents, and held-out B1
// is essentially three documents (CI-16), so how the binder generalizes was
// barely measured. This draws a second tier from the documents the
// assemblies loop's tiers 2 to 5 already key (their attribute keys give the
// instances), before any binding key or binder run on them.
//
// SHOULD THIS BE ON THE SHARED PATH? No: eval tooling. No surface imports it.
//
//   node scripts/control-intent-binding-split.mjs <corpus-dir> [--seed N] [--dev N]
//   node scripts/control-intent-binding-split.mjs <corpus-dir> --tier3
//
// Population: the tier-2..5 dev documents (reports/assemblies/tier<N>/01-split.json).
// Eligible: reports/control-intent/binding-tier2/00-eligibility.json, a census
// of the text layer's control phrases per page, each flagged page then read in
// context: the document prints at least one HVAC control drawing and its
// attribute key holds at least two instances.
// Exposed: the control-intent work has read the document's control drawings
// or the binder's output on it: tier 2's examined list, or a citation in
// CONTROL_INTENT_BUG_CATALOGUE.md.
// heldout: every eligible document not exposed (scored in aggregate only,
// never tuned on). dev: the first N eligible exposed documents in a seeded
// shuffle.
// Writes reports/control-intent/binding-tier2/01-split.{json,md}.
//
// --tier3: the third tier is every eligible exposed document the second tier
// did not draw (its pool after the dev head). Every eligible unexposed
// document is already held-out 2, so the third tier is dev only. Writes
// reports/control-intent/binding-tier3/01-split.{json,md} from tier 2's split.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, seededShuffle } from "./assembliesSplit.mjs";

export const BINDING_TIER2_SEED = 181;
export const BINDING_TIER2_DEV_DOCS = 10;

/** A corpus id's short name ("096_IN" of "096_IN_Vermillion_…"). */
export const shortId = (id) => String(id).split("_").slice(0, 2).join("_");

/** Why each document counts as exposed, or nothing. */
export function bindingExposure(ids, examined, catalogueText) {
  const out = {};
  for (const id of ids) {
    const why = [];
    const ex = examined.find((e) => e.id === id);
    if (ex) why.push(`tier 2's examined list: ${ex.why}`);
    const s = shortId(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cites = (catalogueText.match(new RegExp(`(?<![A-Za-z0-9])${s}(?![A-Za-z0-9])`, "g")) ?? []).length;
    if (cites) why.push(`CONTROL_INTENT_BUG_CATALOGUE.md cites it ${cites} time${cites === 1 ? "" : "s"}`);
    if (why.length) out[id] = why;
  }
  return out;
}

/** The draw: held-out is every eligible unexposed document; dev the first
 * `devDocs` eligible exposed ones in the seeded shuffle. */
export function drawBindingTier2(eligibility, exposure, seed = BINDING_TIER2_SEED, devDocs = BINDING_TIER2_DEV_DOCS) {
  const eligible = eligibility.filter((d) => d.eligible).map((d) => d.id).sort();
  const heldout = eligible.filter((id) => !exposure[id]);
  const pool = eligible.filter((id) => exposure[id]);
  const order = seededShuffle(pool, mulberry32(seed));
  return { dev: order.slice(0, devDocs), heldout, pool_order: order };
}

/** The third tier: tier 2's exposed documents it did not draw. */
export function drawBindingTier3(tier2) {
  const drawn = new Set([...tier2.dev.sets, ...tier2.heldout.sets]);
  const dev = tier2.pool_order.slice(tier2.dev_docs ?? BINDING_TIER2_DEV_DOCS).filter((id) => !drawn.has(id));
  return { dev, heldout: [] };
}

function writeTier3(corpus) {
  const t2 = join(corpus, "reports", "control-intent", "binding-tier2");
  const tier2 = JSON.parse(readFileSync(join(t2, "01-split.json"), "utf8"));
  const eligibility = JSON.parse(readFileSync(join(t2, "00-eligibility.json"), "utf8")).documents;
  const inst = (id) => eligibility.find((d) => d.id === id).instances;
  const { dev, heldout } = drawBindingTier3(tier2);
  const split = {
    from: "binding-tier2/01-split.json: the eligible exposed documents after its dev head",
    tier2_seed: tier2.seed,
    exposure: Object.fromEntries(dev.map((id) => [id, tier2.exposure[id]])),
    dev: { sets: dev, instances: dev.reduce((s, id) => s + inst(id), 0) },
    heldout: { sets: heldout, instances: 0 },
  };
  const dir = join(corpus, "reports", "control-intent", "binding-tier3");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "01-split.json"), JSON.stringify(split, null, 1) + "\n");
  const md = [
    "# Control intent: binding tier 3", "",
    `Tier 2's eligible exposed documents it did not draw (seed ${tier2.seed}; binding-tier2/01-split.json): ${dev.length} documents, ${split.dev.instances} instances, all dev.`,
    "Every eligible unexposed document is held-out 2 already, so this tier has no held-out side.", "",
    "| side | document | instances | exposure |", "|---|---|---:|---|",
    ...dev.map((id) => `| dev | ${id} | ${inst(id)} | ${split.exposure[id].join("; ")} |`),
  ];
  writeFileSync(join(dir, "01-split.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? Number(argv[i + 1]) : d; };
  const corpusDir = argv.find((a, i) => !a.startsWith("--") && !/^--/.test(argv[i - 1] ?? ""));
  if (!corpusDir) { console.error("usage: node scripts/control-intent-binding-split.mjs <corpus-dir> [--seed N] [--dev N] | --tier3"); process.exit(2); }
  const corpus = resolve(corpusDir);
  if (argv.includes("--tier3")) return writeTier3(corpus);
  const seed = opt("--seed", BINDING_TIER2_SEED);
  const devDocs = opt("--dev", BINDING_TIER2_DEV_DOCS);
  const dir = join(corpus, "reports", "control-intent", "binding-tier2");
  const eligibility = JSON.parse(readFileSync(join(dir, "00-eligibility.json"), "utf8")).documents;
  const population = [2, 3, 4, 5].flatMap((t) => JSON.parse(readFileSync(join(corpus, "reports", "assemblies", `tier${t}`, "01-split.json"), "utf8")).dev.sets);
  const missing = population.filter((id) => !eligibility.some((d) => d.id === id));
  if (missing.length) { console.error(`no eligibility read for: ${missing.join(", ")}`); process.exit(2); }
  const examined = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", "tier2", "examined.json"), "utf8")).sets;
  const catalogue = readFileSync(join(corpus, "CONTROL_INTENT_BUG_CATALOGUE.md"), "utf8");
  const exposure = bindingExposure(population, examined, catalogue);
  const { dev, heldout, pool_order } = drawBindingTier2(eligibility, exposure, seed, devDocs);
  const inst = (id) => eligibility.find((d) => d.id === id).instances;
  const split = {
    seed, dev_docs: devDocs, population_docs: population.length,
    eligible_docs: eligibility.filter((d) => d.eligible).length,
    exposure,
    pool_order,
    dev: { sets: dev, instances: dev.reduce((s, id) => s + inst(id), 0) },
    heldout: { sets: heldout, instances: heldout.reduce((s, id) => s + inst(id), 0) },
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(dir, "01-split.json"), JSON.stringify(split, null, 1) + "\n");
  const md = [
    "# Control intent: binding tier 2 (the draw)", "",
    `Seed ${seed}. Population: the ${population.length} tier-2..5 dev documents; ${split.eligible_docs} print HVAC control drawings (00-eligibility.json).`,
    `Held-out (every eligible document the control-intent work has not read; aggregates only): ${heldout.length} documents, ${split.heldout.instances} instances.`,
    `Dev (the first ${devDocs} of the ${pool_order.length} eligible exposed documents in the seeded shuffle): ${split.dev.instances} instances.`, "",
    "| side | document | instances | exposure |", "|---|---|---:|---|",
    ...dev.map((id) => `| dev | ${id} | ${inst(id)} | ${exposure[id].join("; ")} |`),
    ...heldout.map((id) => `| held-out | ${id} | ${inst(id)} | none |`),
    "", `Not drawn (eligible, exposed): ${pool_order.slice(devDocs).join(", ")}.`,
  ];
  writeFileSync(join(dir, "01-split.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
