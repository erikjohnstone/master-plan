// R3 VLM probe (research only, one dev crop): closed questions on a bound control-detail crop, labels as evidence.
import { readFileSync, writeFileSync } from "node:fs";
const img = readFileSync(new URL("./out/094-ahu458.png", import.meta.url)).toString("base64");
const pages = JSON.parse(readFileSync(new URL("./out/pilot-pages.json", import.meta.url), "utf8"));
const regionText = new Set(pages["094#5"].lines.filter((l) => l.x >= 1580 && l.x <= 2570 && l.y >= 235 && l.y <= 700).map((l) => l.t.replace(/\s+/g, " ").trim()));
const PROMPT = `This image is one control detail from an HVAC drawing ("VARIABLE AIR VOLUME AHU-4, AHU-5 & AHU-8 CONTROLS"). Answer ONLY from what is drawn. For every answer give "labels": the exact printed text labels (tags or notes, copied exactly as printed) that support it; use [] when the answer rests on something NOT being drawn.
Return JSON with keys:
devices: array of {label, kind, io: array of the I/O tokens (AI, AO, DI, DO) drawn connected to it}
duct_smoke_detector: {answer: "present"|"absent"|"unclear", labels}
freezestat_wiring: {answer: "to_bas_io"|"to_starter_or_vfd"|"no_freezestat"|"unclear", labels}
zone_sensor_with_setpoint_adjust: {answer: "present"|"absent"|"unclear", labels}
return_or_relief_fan: {answer: "present"|"absent"|"unclear", labels}
modulating_outdoor_air_economizer_damper: {answer: "present"|"absent"|"unclear", labels}
fan_speed_control: {answer: "vfd"|"constant"|"unclear", labels}`;
const KEY = { duct_smoke_detector: "absent", freezestat_wiring: "to_starter_or_vfd", zone_sensor_with_setpoint_adjust: "absent", return_or_relief_fan: "absent", modulating_outdoor_air_economizer_damper: "absent", fan_speed_control: "vfd" };
const runs = [];
for (const run of [1, 2]) {
  const t0 = Date.now();
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}` },
    body: JSON.stringify({ model: "qwen-3.8-27b", temperature: 0, max_completion_tokens: 16000, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:image/png;base64,${img}` } }] }] }) });
  const ms = Date.now() - t0;
  const json = await res.json();
  if (!res.ok) { console.log("HTTP", res.status, JSON.stringify(json).slice(0, 300)); continue; }
  const content = json.choices?.[0]?.message?.content ?? ""; const fin = json.choices?.[0]?.finish_reason;
  const a = content.indexOf("{"), b = content.lastIndexOf("}");
  let out; try { out = JSON.parse(content.slice(a, b + 1)); } catch { console.log("unparseable, finish", fin, "len", content.length, content.slice(-200)); continue; }
  const verdicts = Object.entries(KEY).map(([k, want]) => {
    const a = out[k] ?? {}; const labels = a.labels ?? [];
    const verified = labels.filter((l) => [...regionText].some((t) => t.includes(String(l).replace(/\s+/g, " ").trim())));
    return `${k}: ${a.answer} (${a.answer === want ? "right" : "WRONG, key " + want}) labels ${verified.length}/${labels.length} verified ${JSON.stringify(labels).slice(0, 80)}`;
  });
  const devs = (out.devices ?? []).map((d) => `${d.label}[${(d.io ?? []).join("/")}]`);
  console.log(`run ${run} ${ms}ms usage ${JSON.stringify(json.usage)}\n  devices: ${devs.join(" ")}\n  ${verdicts.join("\n  ")}`);
  runs.push({ run, ms, out });
}
writeFileSync(new URL("./out/vlm-probe-results.json", import.meta.url), JSON.stringify(runs, null, 1));
