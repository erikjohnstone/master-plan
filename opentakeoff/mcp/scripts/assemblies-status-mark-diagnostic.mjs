// ASSEMBLIES goal — a DIAGNOSTIC beside the attribute eval (ASSEMBLIES_BUG_CATALOGUE AS-27). It is not
// the scorer and changes no score: it shows what the frozen scorer cannot pair.
//
// SHOULD THIS BE ON THE SHARED PATH? No. It reads the attribute eval's own snapshot, key and scoring
// (assemblies-attr-eval.mjs) for a dev side, and prints one line; no surface imports it.
//
//   node --import tsx scripts/assemblies-status-mark-diagnostic.mjs <corpus-dir> [--dev2 | --dev3 | --dev4] [setId ...]
//
// A key types a tag as printed, status mark and all ("(E)ATU A"); the compile's tag drops the mark
// ("ATU A"), so the scorer pairs the instance with nothing and scores every value it keys missed. Here
// each such key tag is replaced by its base tag, where no other key instance in its table shares that
// base, and the set is scored again with the same scorer: the line reports how many of those
// instances then pair, and how their printed values score. Dev sides only: held-out is never read.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonTag, parseAttrKeyCsv, scoreSet, snapshotInChild } from "./assemblies-attr-eval.mjs";

/** A printed status mark before or after a tag: "(E)", "(N)", "(EXISTING)" … */
export const STATUS_MARK = /^\s*\((?:E|N|R|D|X|EX|NEW|EXIST(?:ING)?)\)\s*|\s*\((?:E|N|R|D|X|EX|NEW|EXIST(?:ING)?)\)\s*$/i;

/** The key with the status-marked tags of `unpaired` instances ("sheet|title|tag") replaced by their
 * base tag, where the base is unique among the table's key instances; and the (sheet|title|base) of
 * each replaced instance. A status-marked tag the scorer pairs as printed ("B-1(E)") is left alone. */
export function withBaseTags(key, unpaired) {
  const tagsOf = new Map();
  for (const r of key.rows) {
    const k = `${r.sheet}|${r.table_title}`;
    if (!tagsOf.has(k)) tagsOf.set(k, new Set());
    tagsOf.get(k).add(r.tag);
  }
  const replaced = new Set();
  const rows = key.rows.map((r) => {
    if (!STATUS_MARK.test(r.tag) || !unpaired.has(`${r.sheet}|${r.table_title}|${r.tag}`)) return r;
    const base = r.tag.replace(STATUS_MARK, "").trim();
    const clash = [...tagsOf.get(`${r.sheet}|${r.table_title}`)].some((t) => t !== r.tag && canonTag(t.replace(STATUS_MARK, "").trim()) === canonTag(base));
    if (clash) return r;
    replaced.add(`${r.sheet}|${r.table_title}|${base}`);
    return { ...r, tag: base };
  });
  return { key: { ...key, rows }, replaced };
}

async function main() {
  const argv = process.argv.slice(2);
  const [corpusDir, ...only] = argv.filter((a) => !a.startsWith("--"));
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/assemblies-status-mark-diagnostic.mjs <corpus-dir> [--dev2 | --dev3 | --dev4] [setId ...]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const tier = argv.includes("--dev4") ? "4" : argv.includes("--dev3") ? "3" : argv.includes("--dev2") ? "2" : null;
  const split = JSON.parse(readFileSync(join(corpus, "reports", "assemblies", ...(tier ? [`tier${tier}`] : []), "01-split.json"), "utf8"));
  const refused = only.filter((id) => !split.dev.sets.includes(id));
  if (refused.length) { console.error(`not dev documents: ${refused.join(", ")}`); process.exit(2); }
  const { normalizeCompileItem } = await import("../../web/src/lib/assemblies/normalize.ts");
  let unpaired = 0, paired = 0, lines = 0, exact = 0, wrong = 0, missed = 0;
  for (const id of only.length ? only : split.dev.sets) {
    const keyPath = join(corpus, "keys", `${id}.attrs.csv`);
    if (!existsSync(keyPath)) continue;
    const key = parseAttrKeyCsv(readFileSync(keyPath, "utf8"), keyPath);
    const snap = await snapshotInChild(corpus, id);
    if (snap.error) { console.error(`${id}: ${snap.error.split("\n")[0]}`); continue; }
    const before = scoreSet({ setId: id, key, snapshot: snap, normalize: normalizeCompileItem });
    const missing = before.instances.filter((i) => !i.matched && STATUS_MARK.test(i.tag));
    unpaired += missing.length;
    const { key: based, replaced } = withBaseTags(key, new Set(missing.map((i) => `${i.sheet}|${i.table_title}|${i.tag}`)));
    const after = scoreSet({ setId: id, key: based, snapshot: snap, normalize: normalizeCompileItem });
    paired += after.instances.filter((i) => i.matched && replaced.has(`${i.sheet}|${i.table_title}|${i.tag}`)).length;
    for (const o of after.outcomes) {
      if (!o.keyed || !replaced.has(`${o.sheet}|${o.table_title}|${o.tag}`)) continue;
      lines++;
      if (o.outcome === "exact") exact++;
      else if (o.outcome === "wrong") wrong++;
      else if (o.outcome === "missed") missed++;
    }
  }
  console.log(`dev${tier ?? ""}: status-marked key instances the scorer cannot pair ${unpaired}; paired by their base tag ${paired}; their printed values ${lines}: exact ${exact}, wrong ${wrong}, missed ${missed} (a diagnostic: no score changes)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
