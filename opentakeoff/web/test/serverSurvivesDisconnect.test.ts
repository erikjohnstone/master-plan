// A client that leaves a streamed reply must not end the app server (#332).
//
// The route's error path answered a client that had gone with sendJson, on a
// response whose headers the stream had already sent: ERR_HTTP_HEADERS_SENT,
// thrown from an async handler nobody awaited, ended the whole Vite process.
// Since the schedule index streams its steps, a page reloaded while the index
// was being built took the server down with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusTakeoffApiPlugin } from "../vite.corpusTakeoffApi.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(HERE, "../public/demo/sample-mechanical-set.pdf");

test("a client that leaves a streamed takeoff does not end the server, which answers the next request", async () => {
  const used: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
  (corpusTakeoffApiPlugin() as { configureServer: (s: unknown) => void })
    .configureServer({ middlewares: { use: (fn: (typeof used)[number]) => used.push(fn) } });
  const server = createServer((req, res) => {
    used[0](req, res, () => { res.statusCode = 404; res.end(); });
  });
  await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
  const { port } = server.address() as { port: number };
  const escaped: unknown[] = [];
  const onEscape = (error: unknown) => escaped.push(error);
  process.on("uncaughtException", onEscape);
  process.on("unhandledRejection", onEscape);
  try {
    const form = new FormData();
    form.append("kind", "hvac_equipment");
    form.append("file", new Blob([await readFile(SAMPLE)], { type: "application/pdf" }), "sample.pdf");
    const leave = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/__ot/compile-corpus-takeoff`, {
      method: "POST", body: form, headers: { Accept: "application/x-ndjson" }, signal: leave.signal,
    });
    assert.match(String(res.headers.get("content-type")), /ndjson/);
    const first = await res.body!.getReader().read();
    assert.match(new TextDecoder().decode(first.value), /"type":"progress"/);
    leave.abort(); // the page is reloaded mid-run
    // The server stops the run (its process is sent SIGTERM) and settles the
    // request's error well within this.
    await new Promise((settled) => setTimeout(settled, 4000));
    assert.deepEqual(escaped.map(String), [], "nothing escaped the request");
    const next = await fetch(`http://127.0.0.1:${port}/__ot/compile-corpus-takeoff`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(next.status, 400, "the server still answers");
    assert.match(String((await next.json()).error), /pdfPath or multipart file required/);
  } finally {
    process.off("uncaughtException", onEscape);
    process.off("unhandledRejection", onEscape);
    await new Promise((closed) => server.close(closed));
  }
});
