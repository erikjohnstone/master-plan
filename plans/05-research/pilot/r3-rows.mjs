// Pilot prep: the pipeline's own schedule row for each pilot unit (cached graph, dev only).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { createHash } from "node:crypto";
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, "../../..");
const MCP = join(ROOT, "opentakeoff/mcp"), corpus = join(ROOT, "opentakeoff-corpus");
const { resolveSetFiles } = await import(join(MCP, "scripts/corpusFiles.mjs"));
const { cachedSheetGraph } = await import(join(MCP, "scripts/sheetGraphCache.mjs"));
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
const split = JSON.parse(readFileSync(join(corpus, "reports/assemblies/01-split.json"), "utf8"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const want = { "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile": ["UH-1", "EF-1A", "EF-2A"], "094_FL_Orange_County_Regional_History_Center_HVAC": ["AHU-04"], "itd-d1-lab": ["EH-1", "EF-1"] };
const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, "");
const out = {};
for (const [id, tags] of Object.entries(want)) {
  if (!split.dev.sets.includes(id)) throw new Error(`${id} is not dev`);
  const set = (spec.sets ?? spec).find((s) => s.id === id);
  const files = resolveSetFiles(corpus, spec, set);
  const g = await cachedSheetGraph(files[0], { expectedSha256: sha(files[0]), identity: files.slice(1).map(sha), names: files.slice(1).map((p) => basename(p)), compute: async () => { throw new Error("cache miss"); } });
  if (!out[id]) { const t0 = g.tables[0]; console.error(id, "table keys:", Object.keys(t0 ?? {}).join(","), "| row keys:", Object.keys((t0?.rows ?? [])[0] ?? {}).join(",")); }
  for (const tag of tags) {
    for (const t of g.tables) {
      for (const r of t.rows ?? []) {
        const cells = r.cells ?? r;
        const vals = Object.values(cells).map((c) => (typeof c === "object" && c ? c.text : c));
        if (vals.some((v) => norm(v) === norm(tag))) {
          (out[id] ??= {})[tag] = { sheet: t.sheet, title: t.title?.text ?? t.title ?? null, cells: Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, typeof c === "object" && c ? c.text : c])) };
        }
      }
    }
  }
}
writeFileSync(join(HERE, "out/pilot-rows.json"), JSON.stringify(out, null, 1));
for (const [id, m] of Object.entries(out)) for (const [tag, r] of Object.entries(m)) console.log(id.slice(0, 20), tag, "|", r.title, "|", JSON.stringify(r.cells).slice(0, 400));
