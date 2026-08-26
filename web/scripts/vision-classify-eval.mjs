// Vision-assisted symbol classification — scored eval (maturity plan Phase
// 3, #HVAC-4). Runs classify_symbol's own prompt/parse pipeline
// (classifySymbolPrompt/parseClassifyResponse, ai.js) against a real,
// independently-keyed corpus of cropped symbols, and reports real
// precision — vector-sourced and raster-sourced crops SEPARATELY, per the
// maturity plan's own requirement, since raster is classify_symbol's real,
// primary use case (no vector geometry to fingerprint at all) while vector
// is only a fallback/cross-check against the geometric matcher.
//
// The corpus directory (external, never committed — same convention as
// mcp/scripts/graph-eval.mjs's corpus): key.csv (crop,expected,note) plus
// crops/<vector|raster>_<crop>.png. The KEY is a real caption read directly
// off the source legend sheet, independent of anything this eval or
// classify_symbol itself produces — the same discipline every other key in
// this project's corpus already follows.
//
//   node --import tsx scripts/vision-classify-eval.mjs <corpus-dir>/vision-eval
//
// Needs a configured vision endpoint reachable from Node — pass one
// explicitly via env (this project's own solo-demo default: the local
// Cerebras proxy, see server/cerebras_proxy.py):
//   VISION_ENDPOINT=http://127.0.0.1:8811 VISION_MODEL=gemma-4-31b node ...
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildVisionRequest, parseVisionResponse, classifySymbolPrompt, parseClassifyResponse } from "../src/lib/ai.js";
import { ALL_COMPONENT_NAMES } from "../src/lib/hvacTaxonomy.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: VISION_ENDPOINT=... VISION_MODEL=... node --import tsx scripts/vision-classify-eval.mjs <vision-eval-dir>");
  process.exit(2);
}
const cfg = {
  endpoint: process.env.VISION_ENDPOINT || "http://127.0.0.1:8811",
  model: process.env.VISION_MODEL || "gemma-4-31b",
  provider: process.env.VISION_PROVIDER || "openai",
  apiKey: process.env.VISION_API_KEY || "",
};

function readCsv(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    // minimal CSV: quoted fields may contain commas
    const cells = []; let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

const key = readCsv(join(dir, "key.csv"));
const cropsDir = join(dir, "crops");
const files = readdirSync(cropsDir);

// A model's classification rarely matches the key's own wording verbatim
// ("2-way electric control valve" vs "2-Way Electric Control Valve" vs a
// close paraphrase) — a real scoring problem every free-text classifier
// has. Score by substantial word overlap, not exact string equality: every
// significant word (3+ letters) in the key's expected name must appear
// somewhere in the model's answer. Strict enough that "valve" alone can't
// pass "3-way pneumatic control valve"; loose enough that word order and
// minor phrasing don't fail an otherwise-correct answer. Reported alongside
// the raw text so a human can audit every case, not just trust the metric.
function looseMatch(expected, got) {
  const words = expected.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const gotLower = got.toLowerCase();
  return words.length > 0 && words.every((w) => gotLower.includes(w));
}

async function classifyOne(pngPath) {
  const bytes = readFileSync(pngPath);
  const imageDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const prompt = classifySymbolPrompt(ALL_COMPONENT_NAMES);
  const { url, headers, body } = buildVisionRequest(cfg, { imageDataUrl, prompt, maxTokens: 300 });
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const json = await res.json().catch(() => null);
  const text = parseVisionResponse(cfg.provider, json);
  if (text == null) return { error: "no text in reply" };
  const parsed = parseClassifyResponse(text);
  if (!parsed) return { error: "reply not in the required JSON shape", raw: text.slice(0, 300) };
  return { parsed };
}

async function run(sourceTag) {
  const rows = [];
  for (const row of key) {
    const file = `${sourceTag}_${row.crop}.png`;
    if (!files.includes(file)) { console.error(`missing crop: ${file}`); continue; }
    const out = await classifyOne(join(cropsDir, file));
    rows.push({ crop: row.crop, expected: row.expected, ...out });
  }
  return rows;
}

console.log(`Scoring against ${cfg.endpoint} (model: ${cfg.model})\n`);

for (const sourceTag of ["vector", "raster"]) {
  const rows = await run(sourceTag);
  let correct = 0;
  console.log(`── ${sourceTag} ──`);
  for (const r of rows) {
    if (r.error) { console.log(`  ${r.crop}: ERROR — ${r.error}`); continue; }
    const match = looseMatch(r.expected, r.parsed.classification);
    if (match) correct++;
    console.log(`  ${r.crop}: expected "${r.expected}" -> got "${r.parsed.classification}" (conf ${r.parsed.confidence}) ${match ? "✓" : "✗"}`);
    console.log(`    reasoning: ${r.parsed.reasoning}`);
  }
  const scored = rows.filter((r) => !r.error).length;
  console.log(`  ${sourceTag}: ${correct}/${scored} correct (${rows.length - scored} error(s))\n`);
}
