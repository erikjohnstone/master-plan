import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../server.ts";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";

const pdf = resolve(import.meta.dirname, "../../../opentakeoff-corpus/raw/baker-county-eoc-bidset.pdf");
const [ct, st] = InMemoryTransport.createLinkedPair();
const server = buildServer();
await server.connect(st);
const client = new Client({ name: "d05-probe", version: "1.0.0" });
await client.connect(ct);

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.find((i) => i.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

await call("load_plan", { path: pdf });
const g = await call("sheet_graph", {});
const sheets = g.sheets || [];
console.log("sheet_count", sheets.length);

const probes = [
  { title: "PACKAGED ROOFTOP", row_key: "RTU-1" },
  { title: "PACKAGED ROOFTOP", row_key: "RTU-2" },
  { title: "MECHANICAL EQUIPMENT CONNECTION", row_key: "RTU-01" },
  { title: "MECHANICAL EQUIPMENT CONNECTION", row_key: "RTU-1" },
  { title: "CONNECTION SCHEDULE", row_key: "RTU-01" },
  { row_key: "RTU-1" },
  { row_key: "RTU-01" },
  { cell_contains: "RTU-01" },
  { title: "REQUIRED OUTSIDE AIR" },
  { title: "PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE" },
  { title: "MECHANICAL EQUIPMENT CONNECTION SCHEDULE" },
];

const out = [];
for (const args of probes) {
  const d = await call("query_table", args);
  const matches = (d?.matches || []).slice(0, 8).map((m) => {
    const cells = m.row?.all_cells || m.row?.cells || {};
    const slim = {};
    for (const [h, c] of Object.entries(cells)) {
      slim[h] = { text: c?.text, bbox: c?.bbox };
    }
    return {
      title: typeof m.title === "string" ? m.title : m.title?.text,
      sheet: m.sheet,
      key: m.row?.key,
      family_mark: m.family_mark ?? m.row?.family_mark,
      identity: m.row?.identity,
      cells: slim,
    };
  });
  out.push({ args, count: d?.count, error: d?.error, match_count: matches.length, matches });
  console.log("\n===", JSON.stringify(args), "count", d?.count, "matches", matches.length);
  for (const m of matches) {
    console.log(" -", m.title, "@", m.sheet, "key", m.key);
    const interesting = Object.entries(m.cells).filter(([h]) =>
      /CFM|TON|MCA|MOCP|VA|VOLT|AMP|CIRCUIT|KW|HEAT|COOL|MODEL|MANUF|SERV|LOCATION|HP|FLA|PHASE|EER|IEER|CAPACITY|NOMINAL|TAG|MARK|EQUIP/i.test(h)
    );
    console.log("   ", interesting.map(([h, c]) => `${h}=${c.text}`).join(" | ")
      || Object.entries(m.cells).slice(0, 10).map(([h, c]) => `${h}=${c.text}`).join(" | "));
  }
}

mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/d05_rtu_probe.json", JSON.stringify(out, null, 2));
const hash = createHash("sha256");
await new Promise((res, rej) => {
  createReadStream(pdf).on("data", (c) => hash.update(c)).on("end", res).on("error", rej);
});
console.log("\nSHA256", hash.digest("hex"));
await client.close();
await server.close();
