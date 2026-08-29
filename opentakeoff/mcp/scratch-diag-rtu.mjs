import { Session } from "./src/session.ts";
const s = new Session();
await s.loadPlan("/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff-corpus/raw/baker-county-eoc-bidset.pdf");
for (const tag of ["RTU-1", "EWH-1"]) {
  try {
    const r = await s.sweepScheduleRow(tag, {});
    console.log(`${tag}: found=${r.found}`);
  } catch (e) {
    console.log(`${tag}: THREW — ${e.message}`);
  }
}
