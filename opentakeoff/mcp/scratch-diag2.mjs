import { Session } from "./src/session.ts";
const s = new Session();
await s.loadPlan("/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff-corpus/raw/baker-county-eoc-bidset.pdf");
const g = await s.graphForPipeline();
for (const t of g.tables) {
  for (const r of t.rows) {
    if (r.key === "RTU-1") console.log(`sheet=${t.sheet} kind=${t.kind} title=${JSON.stringify(t.title?.text)} headers=${JSON.stringify(t.headers)}`);
  }
}
