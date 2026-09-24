#!/usr/bin/env node
// ASSEMBLIES — apply_assemblies from the command line, through the real MCP
// tool (an in-memory client/server pair over a Session with the given PDFs).
// The UI proof (web/scripts/playwright-assemblies.mjs) compares the browser's
// records and lines for the same PDF against this file, and a partner job can
// be run end to end the same way.
//
//   node --import tsx scripts/assemblies-apply.mjs <plan.pdf> [more.pdf …] --out result.json
//        [--library lib.json] [--export-dir dir] [--call '{"export_dir": …, "export_scope": …, "settings": {…}}' …]
//
// The output is the tool's full result (its `path` argument): the report,
// every record and every expanded line. --export-dir also writes the CSV set
// (the tool's `export_dir`). Each --call is one more apply_assemblies call on
// the same Session (the graph is built once), with those arguments.
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const out = opt("--out");
const library = opt("--library");
const exportDir = opt("--export-dir");
const calls = argv.flatMap((a, i) => (a === "--call" ? [JSON.parse(argv[i + 1])] : []));
const pdfs = argv.filter((a, i) => !a.startsWith("--") && !["--out", "--library", "--export-dir", "--call"].includes(argv[i - 1]));
if (!out || !pdfs.length) {
  console.error("usage: node --import tsx scripts/assemblies-apply.mjs <plan.pdf> [more.pdf …] --out result.json [--library lib.json]");
  process.exit(2);
}

const { Session } = await import("../src/session.ts");
const { buildServer } = await import("../server.ts");
const session = new Session();
for (let i = 0; i < pdfs.length; i++) await session.loadPlan(resolve(pdfs[i]), { merge: i > 0 });
const [ct, st] = InMemoryTransport.createLinkedPair();
await buildServer(session).connect(st);
const client = new Client({ name: "assemblies-apply", version: "0.0.0" });
await client.connect(ct);
const t0 = Date.now();
const res = await client.callTool({ name: "apply_assemblies", arguments: { path: resolve(out), overwrite: true, ...(library ? { library_path: resolve(library) } : {}), ...(exportDir ? { export_dir: resolve(exportDir) } : {}) } });
const text = res.content?.[0]?.text ?? "";
if (res.isError) {
  console.error(text);
  process.exit(1);
}
const reply = JSON.parse(text);
console.log(`apply_assemblies: ${reply.report?.totals?.units ?? "?"} units, ${reply.report?.totals?.records ?? "?"} records, ${reply.report?.totals?.lines ?? "?"} lines in ${Math.round((Date.now() - t0) / 1000)} s → ${resolve(out)}${reply.export_dir ? `; CSV set (${reply.export_dir.files.length} files) → ${reply.export_dir.dir}` : ""}`);
for (const args of calls) {
  const r = await client.callTool({ name: "apply_assemblies", arguments: { overwrite: true, ...(library ? { library_path: resolve(library) } : {}), ...args, ...(args.export_dir ? { export_dir: resolve(args.export_dir) } : {}) } });
  const body = r.content?.[0]?.text ?? "";
  if (r.isError) {
    console.error(body);
    process.exit(1);
  }
  const x = JSON.parse(body);
  console.log(`apply_assemblies ${JSON.stringify(args)}: ${x.report?.totals?.lines ?? "?"} lines${x.export_dir ? `; CSV set (${x.export_dir.files.length} files${x.export_dir.scope ? `, ${x.export_dir.scope} scope` : ""}) → ${x.export_dir.dir}` : ""}`);
}
await client.close();
process.exit(0);
