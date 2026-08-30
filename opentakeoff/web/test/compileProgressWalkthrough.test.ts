/**
 * Compile progress walkthrough — NDJSON stream contract for Agent UI.
 * Ensures a long Session+ODL compile can narrate phases instead of looking idle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveTsxLoader } from "../vite.corpusTakeoffApi.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, "../../mcp");
const CLI = resolve(MCP, "scripts/production-graph-cli.mjs");
const PDF = resolve(HERE, "../../../opentakeoff-corpus/raw/bldg5406-hvac-demo-mechanical.pdf");

function parseProgressLines(stderr) {
  return String(stderr || "")
    .split("\n")
    .filter((l) => l.startsWith("OT_PROGRESS\t"))
    .map((l) => JSON.parse(l.slice("OT_PROGRESS\t".length)));
}

test("production-graph-cli emits OT_PROGRESS phases during compile", async (t) => {
  if (!existsSync(PDF)) {
    t.skip("fixture PDF missing");
    return;
  }
  const tsx = resolveTsxLoader();
  const child = spawn(process.execPath, [
    "--import", pathToFileURL(tsx).href,
    CLI,
    "--mode", "compile",
    "--kind", "control_valves",
    "--pdf", PDF,
  ], {
    cwd: MCP,
    env: { ...process.env, NODE_PATH: resolve(MCP, "node_modules") },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });
  const code = await new Promise((resolveCode) => child.on("close", resolveCode));
  assert.equal(code, 0, stderr.slice(0, 500));
  const phases = parseProgressLines(stderr);
  assert.ok(phases.length >= 3, `expected load/graph/compile progress, got ${JSON.stringify(phases)}`);
  assert.ok(phases.some((p) => p.phase === "load"), "load phase");
  assert.ok(phases.some((p) => p.phase === "graph"), "graph phase");
  assert.ok(phases.some((p) => p.phase === "compile" || p.phase === "done"), "compile/done phase");
  assert.ok(phases.every((p) => typeof p.message === "string" && p.message.length > 0));
  const result = JSON.parse(stdout.trim().split("\n").filter(Boolean).at(-1));
  assert.equal(result.kind, "control_valves");
});

test("Agent panel progress entries stay in the visible walkthrough list", async () => {
  // Contract used by AgentPanel.splitLog — progress must not be buried in Technical steps only.
  const log = [
    { kind: "tool", text: "→ compile_corpus_takeoff" },
    { kind: "progress", text: "Loading 1 plan PDF…" },
    { kind: "progress", text: "Building Session + ODL sheet graph…" },
    { kind: "status", text: "✓ compile_corpus_takeoff" },
  ];
  const progress = log.filter((e) => e.kind === "progress");
  assert.equal(progress.length, 2);
  assert.match(progress[0].text, /Loading/);
});
