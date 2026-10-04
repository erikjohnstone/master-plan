// A PDF that cannot be opened is named with its cause and fix, on every
// surface that opens plans (the canvas's upload and sheet loads, load_plan,
// and the graph CLI behind the canvas's automatic takeoff).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unreadablePdfKind, unreadablePdfMessage } from "../src/lib/pdfReadable.ts";
import { resolveTsxLoader, restoreUploadedNames, runCli } from "../vite.corpusTakeoffApi.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, "../../mcp");
const CLI = resolve(MCP, "scripts/production-graph-cli.mjs");
const LOCKED = resolve(MCP, "test/fixtures/password-protected.pdf");

/** pdf.js's exceptions as its worker hands them back: a name and a message. */
const pdfjsError = (name: string, message: string) => Object.assign(new Error(message), { name });

test("pdf.js's refusals are classed by cause", () => {
  assert.equal(unreadablePdfKind(pdfjsError("PasswordException", "No password given")), "password");
  assert.equal(unreadablePdfKind(pdfjsError("PasswordException", "Incorrect Password")), "password");
  assert.equal(unreadablePdfKind(pdfjsError("InvalidPDFException", "The PDF file is empty, i.e. its size is zero bytes.")), "empty");
  assert.equal(unreadablePdfKind(pdfjsError("InvalidPDFException", "Invalid PDF structure.")), "invalid");
  assert.equal(unreadablePdfKind(pdfjsError("UnknownErrorException", "Worker was destroyed")), "other");
  assert.equal(unreadablePdfKind("Invalid PDF structure."), "invalid");
});

test("each refusal names the file, the cause and what to do", () => {
  assert.equal(unreadablePdfMessage("M-101.pdf", pdfjsError("PasswordException", "No password given")),
    "M-101.pdf is password-protected, so it can't be read. Open it with its password in a PDF viewer, "
    + "save or print a copy without security, and add that copy instead.");
  assert.match(unreadablePdfMessage("M-101.pdf", pdfjsError("InvalidPDFException", "The PDF file is empty, i.e. its size is zero bytes.")),
    /^M-101\.pdf is empty \(0 bytes\): its upload or download didn't finish\. Get the file again and add it\.$/);
  assert.match(unreadablePdfMessage("M-101.pdf", pdfjsError("InvalidPDFException", "Invalid PDF structure.")),
    /^M-101\.pdf isn't a readable PDF: it is damaged, cut short, or not a PDF at all .* Download or export it again, and add the new copy\.$/);
  // Anything else keeps pdf.js's own words, after the file's name.
  assert.equal(unreadablePdfMessage("M-101.pdf", pdfjsError("UnknownErrorException", "Worker was destroyed")),
    "M-101.pdf couldn't be opened as a PDF (Worker was destroyed).");
});

test("the graph CLI reports an unreadable PDF as one line, and the canvas's server shows that line alone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ot-cli-unreadable-"));
  const empty = join(dir, "empty.pdf");
  writeFileSync(empty, new Uint8Array(0));
  const run = spawnSync(process.execPath, ["--import", pathToFileURL(resolveTsxLoader()).href, CLI, "--mode", "graph", "--pdf", LOCKED], {
    cwd: MCP, encoding: "utf8", env: { ...process.env, NODE_PATH: resolve(MCP, "node_modules") },
  });
  assert.equal(run.status, 1, run.stderr.slice(0, 500));
  const lines = run.stderr.split("\n").filter((l) => l.startsWith("OT_ERROR\t"));
  assert.equal(lines.length, 1, run.stderr.slice(0, 500));
  assert.match(JSON.parse(lines[0].slice("OT_ERROR\t".length)).message, /^password-protected\.pdf is password-protected/);
  // The server's error is that sentence, not stderr's warnings and stack trace.
  for (const [file, message] of [[LOCKED, /^password-protected\.pdf is password-protected/], [empty, /^empty\.pdf is empty \(0 bytes\)/]] as const) {
    await assert.rejects(() => (runCli as (options: object) => Promise<unknown>)({ mode: "graph", pdfPaths: [file] }), (e: Error) => {
      assert.match(e.message, message);
      assert.doesNotMatch(e.message, /Warning|\n\s+at /);
      return true;
    });
  }
});

test("the canvas's server names an uploaded PDF as it was uploaded, not by its temporary file", () => {
  const tmp = "/tmp/ot-up-1/a9ad66d21a1f6c63b8f0b71435cbd87898213652fe9c9cb03082eeed2ca02789.pdf";
  const message = "a9ad66d21a1f6c63b8f0b71435cbd87898213652fe9c9cb03082eeed2ca02789.pdf is password-protected, so it can't be read.";
  assert.equal(restoreUploadedNames(message, [tmp], ["M-101 Mechanical.pdf"]), "M-101 Mechanical.pdf is password-protected, so it can't be read.");
  assert.equal(restoreUploadedNames(message), message);
});
