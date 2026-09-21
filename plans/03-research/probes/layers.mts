import { openPdf, OPS } from "../../../opentakeoff/mcp/src/pdf.ts";
import { extractVectorGeometry } from "../../../opentakeoff/web/src/lib/oneclick.ts";
import { classifyMepLayerName } from "../../../opentakeoff/web/src/lib/mepsystems.ts";
import { classifyLayerName } from "../../../opentakeoff/web/src/lib/layers.ts";
const doc = await openPdf(process.argv[2]);
const ph = await doc.page(Number(process.argv[3]));
const layers = await doc.layers();
const geo = extractVectorGeometry(await ph.operatorList(), ph.viewport.transform, OPS);
const counts = new Map<number, number>();
if (geo.layerOf) for (let i = 0; i < geo.layerOf.length; i++) if (geo.layerOf[i] >= 0) counts.set(geo.layerOf[i], (counts.get(geo.layerOf[i]) || 0) + 1);
const byId = new Map(layers.map((l: any) => [l.id, l]));
for (const [k, id] of (geo.layerIds || []).entries()) {
  const l: any = byId.get(id);
  const name = l?.name ?? "?";
  let role = "?"; try { role = String(JSON.stringify(classifyLayerName(name))); } catch {}
  console.log(`${String(counts.get(k) || 0).padStart(6)}  ${name.padEnd(28)} mep=${JSON.stringify(classifyMepLayerName(name))} role=${role} visible=${l?.visible}`);
}
