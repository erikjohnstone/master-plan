import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function formatDemoRun(run, prompt) {
  const lines = [
    `LOCAL HOST PROOF — ${run.demo_id}`,
    `Transport: ${run.transport}`,
    `Model: ${run.model_version_identifier}`,
    `Request ID: ${run.request_id}`,
    `Live latency: ${(run.latency_ms / 1000).toFixed(3)} s`,
    "",
    "FROZEN PROMPT",
    prompt.trim(),
    "",
    "ANSWER AND SOURCE CITATIONS",
  ];
  for (const [field, answer] of Object.entries(run.answer || {})) {
    lines.push(`${field}: ${JSON.stringify(answer.value)}`);
    for (const citation of answer.citations || []) {
      const table = citation.table_title ? ` | ${citation.table_title}` : "";
      const column = citation.column ? ` | ${citation.column}` : "";
      lines.push(`  ${citation.sheet_id}${table}${column} | bbox ${JSON.stringify(citation.bbox_px)}`);
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [runPath, promptPath] = process.argv.slice(2);
  if (!runPath || !promptPath) {
    console.error("usage: node scripts/show-demo-run.mjs <run.json> <prompt.txt>");
    process.exit(2);
  }
  const run = JSON.parse(readFileSync(resolve(runPath), "utf8"));
  const prompt = readFileSync(resolve(promptPath), "utf8");
  console.log(formatDemoRun(run, prompt));
}
