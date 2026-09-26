// R3 pilot (research only, dev documents only, nothing in the repo changes): can the platform text model read a
// unit's control options from the drawing text layer, cite-or-abstain, when targeting is given at page level?
import { readFileSync, writeFileSync } from "node:fs";
const pages = JSON.parse(readFileSync(new URL("./out/pilot-pages.json", import.meta.url), "utf8"));
const rows = JSON.parse(readFileSync(new URL("./out/pilot-rows.json", import.meta.url), "utf8"));
const MODEL = process.env.PILOT_MODEL ?? "gpt-oss-120b";
const OPT = {
  modulating_valve: "Modulating heating valve (otherwise 2-position)", fan_status: "Fan status (current switch) to the BAS",
  setpoint_adjust: "Occupant setpoint adjustment at the zone/space sensor", motorized_damper: "Motorized damper interlocked with the fan",
  pressure_control: "Fan speed controlled from a pressure (or CO) sensor", co2_sensor: "Zone CO2 sensor (demand-controlled ventilation)",
  occupancy_sensor: "Zone occupancy sensor", window_switch: "Window switch", relief_damper: "Modulating relief damper controlling building pressure",
  relief_fan: "Relief fan controlling building pressure", return_fan: "Return fan", enthalpy_economizer: "Enthalpy economizer high limit (outdoor enthalpy)",
  differential_economizer: "Differential economizer high limit (compares return air)", dx_staged: "DX cooling in compressor stages",
  freezestat_to_bas: "Freezestat wired to the BAS controller (otherwise hardwired to the fan starter or VFD and monitored)",
  duct_smoke_detectors: "Supply and return duct smoke detectors, monitored by the BAS", ufc_minimum_points: "UFC 3-410-01 Table 3-1 minimum points (DoD projects)",
};
const CASES = [
  { set: "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile", tag: "UH-1", family: "UNIT_HEATER", pages: ["040#44"], key: { bas_role: "controls", modulating_valve: true, fan_status: false, setpoint_adjust: false } },
  { set: "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile", tag: "EF-1A", family: "FAN", pages: ["040#44"], key: { bas_role: "controls", motorized_damper: true, pressure_control: true } },
  { set: "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile", tag: "EF-2A", family: "FAN", pages: ["040#44"], key: { bas_role: "controls", motorized_damper: true } },
  { set: "094_FL_Orange_County_Regional_History_Center_HVAC", tag: "AHU-04", family: "AHU", pages: ["094#5"], key: { bas_role: "controls", co2_sensor: false, occupancy_sensor: false, window_switch: false, setpoint_adjust: false, relief_damper: false, relief_fan: false, return_fan: false, enthalpy_economizer: false, differential_economizer: false, dx_staged: false, freezestat_to_bas: false, duct_smoke_detectors: false, ufc_minimum_points: false } },
  { set: "itd-d1-lab", tag: "EH-1", family: "UNIT_HEATER", pages: ["itd#11", "itd#20"], notesOnly: ["itd#11"], key: { bas_role: "monitors_only" } },
  { set: "itd-d1-lab", tag: "EF-1", family: "FAN", pages: ["itd#11", "itd#20"], notesOnly: ["itd#11"], key: { bas_role: "not_connected" } },
];
const SYSTEM = `You read HVAC control drawings for a building-automation (BAS) estimator. You get ONE scheduled unit (its schedule row exactly as extracted) and the positioned text lines of drawing pages that may govern it (control details, sequences, notes). Answer ONLY the listed questions.
- governing: the verbatim title of the control detail or sequence that governs THIS unit, or null if none on these pages does. A detail governs the unit when its title or text names the unit's tag, a tag list or range containing it, a schedule reference the row carries, or the unit's type when no more specific detail exists.
- bas_role: "controls" (the BAS commands the unit), "monitors_only" (the BAS only reads points from it), "not_connected" (the unit is standalone / not on the BAS), or "not_shown".
- each option: true, false, or "not_shown". Answer false only when the governing detail shows the unit's controls and this device/function is clearly absent or explicitly excluded; otherwise "not_shown". Never answer from typical practice.
- Every answer other than "not_shown"/null needs 1-3 quotes. Each quote is copied EXACTLY (same characters) from ONE line's text and is at most 120 characters. No paraphrase, no joining of lines.`;
const schema = (options) => ({
  type: "object", additionalProperties: false, required: ["governing", "governing_quote_line", "bas_role", "bas_role_quotes", "options"],
  properties: {
    governing: { type: ["string", "null"] }, governing_quote_line: { type: ["integer", "null"] },
    bas_role: { type: "string", enum: ["controls", "monitors_only", "not_connected", "not_shown"] },
    bas_role_quotes: { type: "array", items: { type: "string" } },
    options: { type: "object", additionalProperties: false, required: options, properties: Object.fromEntries(options.map((o) => [o, {
      type: "object", additionalProperties: false, required: ["value", "quotes"],
      properties: { value: { type: "string", enum: ["true", "false", "not_shown"] }, quotes: { type: "array", items: { type: "string" } } } }])) },
  },
});
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
async function ask(c, run) {
  const options = Object.keys(c.key).filter((k) => k !== "bas_role");
  const row = rows[c.set][c.tag];
  const payload = {
    unit: { tag: c.tag, family: c.family, schedule_title: row.title, schedule_row: row.cells },
    pages: c.pages.map((p) => ({ page: p, lines: pages[p].lines.filter((l) => !(c.notesOnly ?? []).includes(p) || /^\d{1,2}\s*[.)]\s+\S/.test(l.t)).map((l, i) => ({ i, x: l.x, y: l.y, t: l.t })) })),
    questions: { options: Object.fromEntries(options.map((o) => [o, OPT[o]])) },
  };
  const t0 = Date.now();
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(payload) }],
      response_format: { type: "json_schema", json_schema: { name: "control_read", strict: true, schema: schema(options) } }, max_completion_tokens: 8000 }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, ms };
  const json = await res.json();
  let out; try { out = JSON.parse(json.choices[0].message.content); } catch { return { error: "unparseable", ms }; }
  const allText = new Set(payload.pages.flatMap((p) => p.lines.map((l) => norm(l.t))));
  const verified = (q) => [...allText].some((t) => t.includes(norm(q)) && norm(q).length >= 3);
  const quotes = [...out.bas_role_quotes, ...Object.values(out.options).flatMap((o) => o.quotes)];
  const scored = options.map((o) => {
    const got = out.options[o].value, want = String(c.key[o]);
    const cited = out.options[o].quotes.length > 0 && out.options[o].quotes.every(verified);
    return { o, want, got, verdict: got === "not_shown" ? "abstain" : got === want ? (cited ? "right+cited" : "right-uncited") : (cited ? "WRONG+cited" : "WRONG-uncited") };
  });
  return { ms, usage: json.usage, governing: out.governing, bas_role: out.bas_role, bas_role_ok: out.bas_role === c.key.bas_role,
    quotes_total: quotes.length, quotes_verified: quotes.filter(verified).length, unverified: quotes.filter((q) => !verified(q)).slice(0, 4), scored };
}
const results = [];
for (const run of [1, 2]) for (const c of CASES) {
  const r = await ask(c, run);
  results.push({ run, tag: c.tag, set: c.set.slice(0, 12), ...r });
  const tally = (r.scored ?? []).reduce((a, s) => ((a[s.verdict] = (a[s.verdict] ?? 0) + 1), a), {});
  console.log(`run ${run} ${c.tag.padEnd(7)} ${r.error ?? ""} governing=${JSON.stringify(r.governing)?.slice(0, 70)} role=${r.bas_role}${r.bas_role_ok ? "✓" : "✗"} quotes ${r.quotes_verified}/${r.quotes_total} ${JSON.stringify(tally)} ${r.ms}ms`);
  for (const s of r.scored ?? []) if (!s.verdict.startsWith("right+")) console.log(`      ${s.o}: want ${s.want} got ${s.got} → ${s.verdict}`);
  if (r.unverified?.length) console.log("      unverified quotes:", JSON.stringify(r.unverified));
}
writeFileSync(new URL(`./out/pilot-results-${MODEL}.json`, import.meta.url), JSON.stringify(results, null, 1));
