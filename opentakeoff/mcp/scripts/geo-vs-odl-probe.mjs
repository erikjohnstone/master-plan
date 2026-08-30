import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";

async function run(label, withOdl) {
  const s = new Session();
  await s.loadPlan("../../opentakeoff-corpus/raw/navfac-cherry-point-atc-mechanical.pdf");
  if (!withOdl) s.enhanceTablesWithODL = async () => {};
  const g = await s.graphForPipeline();
  const hvac = compileCorpusTakeoff(s, g, "hvac_equipment");
  const bas = compileCorpusTakeoff(s, g, "bas_points");
  console.log(label, JSON.stringify({
    tables: g.tables.length,
    hvac_items: hvac.totals.items,
    bas_rows: bas.totals.rows,
    boiler: hvac.categories.BOILER.count,
    chw: hvac.categories.CHW_CONTROL_VALVE.count,
    hhw: hvac.categories.HHW_CONTROL_VALVE.count,
    pump: hvac.categories.PUMP.count,
  }));
}
await run("GEO", false);
await run("ODL", true);
