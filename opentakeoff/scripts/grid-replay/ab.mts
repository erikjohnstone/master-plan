// Grid replay, step 3: read every saved vectorgrid reply's tables through two
// versions of the web lib's vectorGridTableToScheduleTable and print each
// table whose title, kind, headers or row keys differ. The base lib is a copy
// of web/src/lib at the base commit (git archive), with node_modules linked.
// No text runs are passed (spans: []), so title rules that read them see less
// than the real pipeline; both sides see the same.
// Usage (from web/): node --import tsx ../scripts/grid-replay/ab.mts REPLY_DIR BASE_LIB NEW_LIB
import { readFileSync, readdirSync } from "node:fs";

const [dir, baseLib, newLib] = process.argv.slice(2);
const A = await import(baseLib + "/vectorGridAdapter.ts");
const B = await import(newLib + "/vectorGridAdapter.ts");
const read = (M: any, t: any, page: number) => {
  try {
    const out = M.vectorGridTableToScheduleTable(t, page, { sheetKey: "s#" + page, spans: [] }, 2);
    if (!out) return null;
    return { title: out.title?.text ?? null, kind: out.kind, headers: out.headers, keys: out.rows.map((r: any) => r.key) };
  } catch (e) { return { error: String(e) }; }
};
let tables = 0, changed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const reply = JSON.parse(readFileSync(dir + "/" + f, "utf8"));
  const page = Number(f.match(/__p(\d+)\.json$/)?.[1] ?? 0);
  for (const [i, t] of (reply.tables || []).entries()) {
    tables++;
    const a = read(A, t, page), b = read(B, t, page);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    changed++;
    console.log(`== ${f.replace(/__.*__p/, " p").replace(".json", "")} #${i}`);
    if (!a || !b) { console.log("   ", a ? "kept→null" : "null→kept", JSON.stringify(a || b).slice(0, 300)); continue; }
    if (a.title !== b.title) console.log("    title:", JSON.stringify(a.title), "→", JSON.stringify(b.title));
    if (a.kind !== b.kind) console.log("    kind:", a.kind, "→", b.kind);
    const ka = a.keys || [], kb = b.keys || [];
    const lost = ka.filter((k: string) => !kb.includes(k)), gained = kb.filter((k: string) => !ka.includes(k));
    if (lost.length || gained.length) console.log("    rows", ka.length, "→", kb.length, "lost:", lost.slice(0, 8).join(" | "), "gained:", gained.slice(0, 8).join(" | "));
    if (JSON.stringify(a.headers) !== JSON.stringify(b.headers)) console.log("    headers:", JSON.stringify(a.headers).slice(0, 160), "→", JSON.stringify(b.headers).slice(0, 160));
  }
}
console.log(`tables ${tables}, changed ${changed}`);
process.exit(0);
