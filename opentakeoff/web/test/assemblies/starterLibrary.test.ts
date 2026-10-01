// ASSEMBLIES WP5.4 — the browser's on-demand starter library (src/lib/assemblies/starterLibrary.ts).
// The UI proof found the panel's library never loading under the dev server: Vite keeps a
// dynamic import's options ({ with: { type: "json" } }) while it serves the JSON as a JavaScript
// module, and the browser refuses the module for its MIME type. The build bundled it, so only
// a browser run could see it.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadStarterLibrary } from "../../src/lib/assemblies/starterLibrary.ts";

test("the starter loads through the gate: 31 typicals and 16 hook-ups", async () => {
  const lib = await loadStarterLibrary();
  assert.equal(lib.length, 31 + 16);
  assert.ok(lib.every((a) => a.status === "starter"));
});

test("no dynamic import in src/ passes import attributes (the dev server would serve it the wrong MIME type)", () => {
  const root = join(import.meta.dirname, "../../src");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name)) continue;
      const text = readFileSync(p, "utf8");
      if (/\bimport\(\s*[^()]*?,\s*\{\s*(with|assert)\s*:/.test(text)) offenders.push(relative(root, p));
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
