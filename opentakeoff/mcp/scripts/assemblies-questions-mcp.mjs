// CONTROL INTENT Track A, the MCP half of the Project questions UI proof
// (web/scripts/playwright-questions.mjs).
//
//   node --import tsx scripts/assemblies-questions-mcp.mjs questions <plan.pdf> <out.json>
//     project_questions for the plan, as the tool returns it (deterministic
//     readings), for the panel's card to be compared with.
//   node --import tsx scripts/assemblies-questions-mcp.mjs apply <plan.pdf> <takeoff.json> <out.json>
//     import_takeoff of a project file the panel saved (its assemblies block
//     carries the answer journal), then apply_assemblies with detail lines:
//     the records and lines the panel's own apply must equal, byte for byte.
//
// SHOULD THIS BE ON THE SHARED PATH? It only drives the shared path (the MCP
// tools over one Session); nothing here decides anything.
import { writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../server.ts";
import { Session } from "../src/session.ts";

process.env.OPENTAKEOFF_CONTROL_READINGS = "deterministic";
const [mode, pdf, a, b] = process.argv.slice(2);
if (!["questions", "apply"].includes(mode) || !pdf || !a || (mode === "apply" && !b)) {
  console.error("usage: assemblies-questions-mcp.mjs questions <plan.pdf> <out.json> | apply <plan.pdf> <takeoff.json> <out.json>");
  process.exit(2);
}
const session = new Session();
await session.loadPlan(pdf);
const [ct, st] = InMemoryTransport.createLinkedPair();
await buildServer(session).connect(st);
const client = new Client({ name: "questions-proof", version: "0.0.0" });
await client.connect(ct);
const call = async (name, args) => {
  // A cold graph build can take minutes: no client-side request timeout.
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 60 * 60 * 1000 });
  if (res.isError) throw new Error(`${name}: ${res.content[0].text}`);
  return res.structuredContent;
};
if (mode === "questions") {
  await writeFile(a, JSON.stringify(await call("project_questions", {}), null, 1));
} else {
  const imported = await call("import_takeoff", { path: a });
  const applied = await call("apply_assemblies", { detail: "lines" });
  await writeFile(b, JSON.stringify({ note: imported.note, answers: applied.answers ?? null, applications: applied.applications, lines: applied.lines }, null, 1));
}
await client.close();
process.exit(0);
