// ASSEMBLIES WP4 — build the starter library's JSON from the modules
// beside this file, check it through the library's own load gate, and
// write it to web/src/lib/assemblies/starter/. The committed JSON is what
// ships; web/test/assemblies/starter.test.ts rebuilds it and requires the
// bytes to match, so the two never drift.
//
//   node --import tsx scripts/assemblies-starter/build.mts [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { MATRIX, PRESETS, ROLE_ROW, UFC_ITEMS, src } from "./common.mts";
import { terminalTypicals } from "./terminals.mts";
import { airHandlerTypicals } from "./airhandlers.mts";
import { zoneTypicals } from "./zone.mts";
import { plantTypicals } from "./plant.mts";
import { hookups } from "./hookups.mts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const STARTER_DIR = join(HERE, "..", "..", "src", "lib", "assemblies", "starter");

/** The hook-up profile: every switch and project variable the hook-ups
 * read, its starter default, and the sources that disagree about it. */
export const HOOKUP_PROFILE = {
  switches: {
    strainer_at_coils: { default: true, label: "A line-size strainer with blowdown ahead of each coil", sources: ["UFGS 23 21 13 §2.7.1 (strainer with blowdown)", "IMEG 23 21 00 §2.7 E", "NSCS 231000 item 18 (strainers ahead of control valves and equipment)"] },
    pt_ports_at_coils: { default: true, label: "Pressure/temperature ports at every coil inlet and outlet", sources: ["UFGS 23 05 93 §3.2.4.1 b (adjacent to every coil)", "NSCS 231000 item 31 (before and after every terminal coil)"] },
    hoses_at_terminal_coils: { default: false, label: "Flexible hoses at terminal-unit coils", sources: ["UFGS 23 81 47 §2.1.1 l allows hoses", "IMEG 23 21 16 §2.8 A: \"coil connections shall be rigid\""] },
    thermometers_at_ahu_coils: { default: true, label: "Thermometers and pressure gauges in and out of each air handler water coil", sources: ["NSCS 231000 items 31-32", "UFGS 23 21 13 §3.1.9 (a thermometer at any automatic control device without one)"] },
    access_door_at_reheat_coil: { default: true, label: "An access door upstream of each terminal reheat coil", sources: ["IMEG 23 36 00 §2.2 F", "UFGS 23 30 00 §2.12.2 (doors upstream and downstream of coils)"] },
    condensate_trap_at_fcu: { default: false, label: "A condensate trap at room fan coil units", sources: ["UFGS 23 30 00 §3.2.1 (traps sized 2 in. plus static; room fan coil units may be exempted)"] },
    steam_trap_bypass: { default: false, label: "A 3-valve bypass around each steam trap", sources: ["UFGS 23 22 26 §3.1.1.9 (where the equipment must stay in service during trap work)"] },
    gas_regulator_at_boilers: { default: false, label: "A gas pressure regulator at each boiler", sources: ["Boiler installation manual (vendor, research 04 §1.5): only when supply pressure exceeds 10.5 in. w.c."] },
    tower_float_makeup: { default: true, label: "A float makeup valve in each tower cell", sources: ["UFGS 23 65 00 §2.5.4.11 (float makeup; electronic level control an option)"] },
  },
  variables: {
    balancing: { default: "manual", values: ["manual", "automatic"], label: "Balancing at coils", sources: ["UFGS 23 21 13 §2.6.9: automatic flow control valves must not be used with 2-way modulating control valves", "NSCS 231000 item 16: automatic flow control valves at terminal devices", "IMEG 23 21 16 §2.8 A.3: no automatic flow control devices inside combination packages"] },
    coil_valve_body: { default: "2-way", values: ["2-way", "3-way", "picv"], label: "Coil control valve body", sources: ["UFGS 23 09 13 §2.5 (2-way, 3-way or pressure-independent)", "NSCS 231000 item 13 (some owners ban 3-way valves)"] },
    flange_min_in: { default: 2, unit: "in", label: "Unions below, flanges at and above this size", sources: ["UFGS 23 21 13 §3.2.5 (unions below 2 in., flanges at 2 in. and above)", "IMEG 23 21 16 §3.1 A.5-6"] },
    kit_max_in: { default: 1, unit: "in", label: "Coil piping kits at and below this size (0 for none)", sources: ["IMEG 23 21 16 §2.8: kits only at unitary equipment with 1 in. or smaller connections", "VA 23 21 13 §2.8 H.3: combination assemblies accepted (no size stated)"] },
    condensate_lift: { default: false, label: "Condensate lifted or returned against back pressure after the trap", sources: ["UFGS 23 22 26 §3.1.1.9 (a check valve after the trap when it lifts condensate)"] },
    closed_loops: { default: null, label: "Closed water loops in the project (each gets its system specialties)", sources: ["UFGS 23 21 13 §2.9-2.11; IMEG 23 25 00 §2.2 A"] },
    hw_plants: { default: null, label: "Hot-water plants", sources: ["UFGS 23 09 00 §3.7.8.5.2"] },
    chw_plants: { default: null, label: "Chilled-water plants", sources: ["UFGS 23 09 00 §3.7.8.5.1"] },
    buildings: { default: null, label: "Buildings (each gets its meters and shutdown switch)", sources: ["UFC 3-410-01 Table 3-1, General Building Systems"] },
    gas_service: { default: null, label: "Natural gas service to the building", sources: ["UFC 3-410-01 Table 3-1 (building natural gas meter)"] },
    steam_service: { default: null, label: "Steam service to the building", sources: ["UFC 3-410-01 Table 3-1 (building steam meter)"] },
  },
  note: "A null default is left for the project to set: an unset plant, loop or building count leaves its lines unresolved rather than guessed (plan §8.1 A4).",
};

/** Table 3-1 items that lines citing another source cover (the lines that
 * cite an item directly are found from their source), and the items no
 * typical covers, with the reason. */
const COVERED_ELSEWHERE: Record<string, Array<[string, string]>> = {
  "vs-01": [["vav-cooling-only", "airflow"], ["vav-reheat-hw", "airflow"], ["vav-reheat-electric", "airflow"], ["vav-series-fan", "airflow"], ["vav-parallel-fan", "airflow"], ["vav-dual-duct", "cold-airflow"], ["vav-dual-duct", "discharge-airflow"]],
  "vs-02": [["vav-series-fan", "fan-cmd"], ["vav-parallel-fan", "fan-cmd"]],
  "vs-03": [["vav-series-fan", "fan-status"], ["vav-parallel-fan", "fan-status"]],
  "vs-04": [["vav-cooling-only", "damper"], ["vav-reheat-hw", "damper"], ["vav-reheat-electric", "damper"], ["vav-series-fan", "damper"], ["vav-parallel-fan", "damper"], ["vav-dual-duct", "cold-damper"], ["vav-dual-duct", "hot-damper"]],
  "vs-05": [["vav-cooling-only", "discharge-temp"], ["vav-reheat-hw", "discharge-temp"], ["vav-reheat-electric", "discharge-temp"], ["vav-series-fan", "discharge-temp"], ["vav-parallel-fan", "discharge-temp"], ["vav-dual-duct", "discharge-temp"]],
  "vs-06": [["vav-reheat-hw", "hw-valve-cmd"], ["vav-series-fan", "hw-valve-cmd"], ["vav-parallel-fan", "hw-valve-cmd"]],
  "vs-07": [["vav-reheat-electric", "heat-cmd"], ["vav-series-fan", "heat-cmd"], ["vav-parallel-fan", "heat-cmd"]],
  "vs-08": [["vav-cooling-only", "zone-temp"], ["vav-reheat-hw", "zone-temp"], ["vav-series-fan", "zone-temp"], ["vav-dual-duct", "zone-temp"]],
  "hwhs-13": [["pump-vfd", "speed"]],
  "cws-01": [["chiller", "enable"]],
  "cws-02": [["chiller", "status"]],
  "cws-09": [["chw-plant", "plant-dp"]],
  "cws-11": [["pump-constant", "cmd"], ["pump-vfd", "cmd"]],
  "cws-12": [["pump-constant", "status"], ["pump-vfd", "status"]],
  "cws-13": [["cooling-tower", "fan-status"]],
  "cws-15": [["cooling-tower", "cw-supply"], ["cooling-tower", "cw-return"]],
  "cws-18": [["heat-exchanger", "hx-inlet"]],
  "cws-19": [["heat-exchanger", "secondary-supply"], ["heat-exchanger", "hx-primary-leaving"]],
  "ads-01": [["ahu-multizone-vav", "sa-temp"], ["ahu-single-zone", "sa-temp"], ["ahu-constant-volume", "sa-temp"], ["doas", "da-temp"]],
  "ads-03": [["ahu-multizone-vav", "duct-static"], ["doas", "duct-static"]],
  "ads-05": [["ahu-multizone-vav", "oa-temp"], ["ahu-single-zone", "oa-temp"], ["ahu-constant-volume", "oa-temp"], ["doas", "oa-temp"]],
  "ads-08": [["ahu-multizone-vav", "ra-temp"], ["ahu-single-zone", "ra-temp"], ["doas", "ra-temp"]],
  "ads-09": [["ahu-multizone-vav", "ma-temp"], ["ahu-single-zone", "ma-temp"], ["ahu-constant-volume", "ma-temp"]],
  "ads-12": [["ahu-multizone-vav", "ra-damper"], ["ahu-multizone-vav", "relief-damper"], ["ahu-single-zone", "ra-damper"], ["ahu-single-zone", "exhaust-damper"], ["doas", "ea-isolation"]],
  "ads-13": [["ahu-multizone-vav", "oa-damper"], ["ahu-multizone-vav", "min-oa-damper"], ["ahu-single-zone", "oa-damper"], ["ahu-constant-volume", "economizer-damper"], ["doas", "oa-isolation"]],
  "ads-14": [["ahu-multizone-vav", "cooling-cmd"], ["ahu-single-zone", "cooling-cmd"], ["ahu-constant-volume", "cooling-cmd"], ["doas", "cooling-cmd"], ["fcu", "cooling-cmd"]],
  "ads-15": [["ahu-multizone-vav", "heating-cmd"], ["ahu-single-zone", "heating-cmd"], ["ahu-constant-volume", "heating-cmd"], ["doas", "heating-cmd"], ["fcu", "heating-cmd"]],
  "ads-17": [["ahu-multizone-vav", "freezestat"], ["ahu-multizone-vav", "freezestat-monitor"], ["ahu-single-zone", "freezestat"], ["ahu-single-zone", "freezestat-monitor"], ["ahu-constant-volume", "freezestat"], ["ahu-constant-volume", "freezestat-monitor"]],
  "ads-18": [["ahu-multizone-vav", "smoke"], ["ahu-single-zone", "smoke"], ["ahu-constant-volume", "smoke"], ["doas", "smoke"], ["rtu-networked", "smoke"]],
  "ads-19": [["ahu-multizone-vav", "sf-cmd"], ["ahu-multizone-vav", "rf-cmd"], ["ahu-single-zone", "sf-cmd"], ["ahu-single-zone", "rf-cmd"], ["ahu-constant-volume", "sf-cmd"], ["doas", "sf-cmd"]],
  "ads-20": [["ahu-multizone-vav", "sf-speed-cmd"], ["ahu-single-zone", "sf-speed"], ["doas", "sf-speed"]],
  "ads-21": [["ahu-multizone-vav", "sf-status"], ["ahu-multizone-vav", "rf-status"], ["ahu-single-zone", "sf-status"], ["ahu-single-zone", "rf-status"], ["ahu-constant-volume", "sf-status"], ["doas", "sf-status"]],
};
const NOT_APPLICABLE: Record<string, string> = {
  "ads-26": "Smoke dampers are located by plan symbols, which this takeoff does not count (plan §8.9 puts symbol detection out of scope); a partner adds the damper's status point per damper. The hook-up layer carries no fire or smoke damper for the same reason.",
};

/** The G36 chiller plant is plant-wide, with per-chiller, per-pump and
 * per-cell arrays; the library splits it by unit, so its field connectors
 * are checked one by one: cited by a line, covered by a line citing another
 * source, or left out with the reason. */
const PLANT_ELSEWHERE: Record<string, { lines?: Array<[string, string]>; not_in_v1?: string }> = {
  uChiWatPum: { lines: [["pump-constant", "status"], ["pump-vfd", "status"]] },
  yChiWatPum: { lines: [["pump-constant", "cmd"], ["pump-vfd", "cmd"]] },
  uConWatPum: { lines: [["pump-constant", "status"], ["pump-vfd", "status"]] },
  yConWatPum: { lines: [["pump-constant", "cmd"], ["pump-vfd", "cmd"]] },
  TConWatRet: { not_in_v1: "Per-chiller condenser-water leaving temperature, read only for plant-level head pressure control (G36 have_plaHeaPreCon); v1 leaves head pressure to the chillers' own controls." },
  TChiWatSupChi: { lines: [["chiller", "chiller-temps"]] },
  TChiWatEntChi: { lines: [["chiller", "chiller-temps"]] },
  phi: { lines: [["building-meters", "oa-rh"]] },
  dpChiWat: { not_in_v1: "The waterside economizer's own pressure drop (G36 with a bypass-valve economizer): a partner addition to the economizer option in v1." },
  uEcoPum: { not_in_v1: "The waterside economizer's dedicated heat-exchanger pump: counted by the pump typical when the schedule lists it." },
  TEntHex: { not_in_v1: "Economizer heat-exchanger entering temperature (pumped economizer): a partner addition in v1." },
  u1TowInlIsoValOpe: { not_in_v1: "Tower cell isolation valve end switches (G36 have_towIsoValEndSwi): a partner addition to the cell isolation valve option in v1." },
  u1TowInlIsoValClo: { not_in_v1: "As u1TowInlIsoValOpe." },
  u1TowOutIsoValOpe: { not_in_v1: "Tower outlet isolation valves (G36 have_towOutIsoVal) are not in v1." },
  u1TowOutIsoValClo: { not_in_v1: "As u1TowOutIsoValOpe." },
  yWseRetVal: { not_in_v1: "The economizer's in-line return valve (bypass-valve economizer): a partner addition in v1." },
  yWsePumOn: { not_in_v1: "The economizer pump's enable: counted by the pump typical when the schedule lists it." },
  y1WseChiWatBypVal: { not_in_v1: "Economizer-only chilled-water bypass valve (primary-only parallel chillers): a partner addition in v1." },
  yWsePumSpe: { not_in_v1: "The economizer pump's speed: counted by the pump typical (variable speed) when the schedule lists it." },
};

export function buildStarter() {
  const typicals = [...terminalTypicals(), ...airHandlerTypicals(), ...zoneTypicals(), ...plantTypicals()];
  const hooks = hookups();
  const { assemblies, rejected } = sanitizeAssemblyDefinitions([...typicals, ...hooks]);
  if (rejected.length) throw new Error(`the starter library fails its own gate:\n${rejected.map((r) => `${r.id}: ${r.errors.join("; ")}`).join("\n")}`);
  // Coverage of UFC 3-410-01 Table 3-1: each item's lines, or why none.
  const all = [...typicals, ...hooks];
  const byId = new Map(all.map((a) => [a.id, a]));
  const coverage = [...UFC_ITEMS.values()].map((item) => {
    const cited = all.flatMap((a) => a.lines.filter((l) => l.source.ref.endsWith(`[${item.id}]`)).map((l) => [a.id, l.id] as [string, string]));
    const covered = [...cited, ...(COVERED_ELSEWHERE[item.id] ?? [])];
    for (const [t, l] of covered) if (!byId.get(t)?.lines.some((x) => x.id === l)) throw new Error(`coverage of ${item.id} names ${t}:${l}, which does not exist`);
    return {
      item: item.id, list: item.list, text: item.text,
      ...(NOT_APPLICABLE[item.id] ? { not_applicable: NOT_APPLICABLE[item.id] } : { covered_by: covered.map(([typical, line]) => ({ typical, line })) }),
    };
  });
  // Coverage of the G36 chiller plant's field connectors.
  const mbl = JSON.parse(readFileSync(join(HERE, "..", "..", "test", "assemblies", "fixtures", "mbl-g36-connectors.json"), "utf8"));
  const plantFile = mbl.blocks["Plants/Chillers"].path as string;
  const plant = (mbl.blocks["Plants/Chillers"].connectors as Array<{ name: string; io: string; dims: string | null; if: string | null }>).filter((c) => c.io !== "NET").map((c) => {
    const cited = all.flatMap((a) => a.lines.filter((l) => l.source.ref === `MBL a3cfdde ${plantFile}#${c.name}`).map((l) => ({ typical: a.id, line: l.id })));
    const other = PLANT_ELSEWHERE[c.name];
    for (const [t, l] of other?.lines ?? []) if (!byId.get(t)?.lines.some((x) => x.id === l)) throw new Error(`plant coverage of ${c.name} names ${t}:${l}, which does not exist`);
    if (!cited.length && !other) throw new Error(`plant connector ${c.name} is neither cited nor accounted for`);
    return { connector: c.name, io: c.io, array: c.dims, condition: c.if, ...(cited.length ? { cited_by: cited } : {}), ...(other?.lines ? { covered_by: other.lines.map(([typical, line]) => ({ typical, line })) } : {}), ...(other?.not_in_v1 ? { not_in_v1: other.not_in_v1 } : {}) };
  });
  const envelope = (library: string, title: string, records: unknown[]) => ({
    library, version: "1", title,
    notice: "Vendor-neutral starter content: device and component roles with their parameters. Selection, commercial terms and labor allowances are partner data and are not shipped here. NOTICE.md lists the sources, their licenses, and the items a partner must review before use.",
    assemblies: records,
  });
  const ids = new Set(assemblies.map((a) => a.id));
  return {
    "us-typicals-v1.json": envelope("us-typicals", "US BAS typicals, starter v1", typicals.filter((t) => ids.has(t.id))),
    "us-hookups-v1.json": envelope("us-hookups", "US mechanical hook-ups, starter v1", hooks.filter((t) => ids.has(t.id))),
    "responsibility-v1.json": { version: "1", default: "VA 23 09 23 (03-01-23) §1.1 Responsibility Table", parties: { "23 09 23": "controls", "23": "mechanical", "26": "electrical", "16": "electrical", "28 31 00": "fire_alarm", "28": "fire_alarm" }, matrix: MATRIX, roles: ROLE_ROW, presets: PRESETS },
    "hookup-profile-v1.json": { version: "1", ...HOOKUP_PROFILE },
    "coverage-g36-chiller-plant.json": { version: "1", source: `MBL a3cfdde ${plantFile}`, note: "Field (AI/AO/BI/BO) connectors of the G36 chiller plant controller, and the starter lines that carry each.", connectors: plant },
    "coverage-ufc-3-410-01.json": { version: "1", table: "UFC 3-410-01 (28 July 2025) Table 3-1, DDC Minimum Points List", source: src.ufc410("Table 3-1").ref, items: coverage },
  } as Record<string, unknown>;
}

export const serialize = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const out = buildStarter();
  let stale = 0;
  for (const [name, value] of Object.entries(out)) {
    const path = join(STARTER_DIR, name);
    const text = serialize(value);
    let old = "";
    try { old = readFileSync(path, "utf8"); } catch { /* new file */ }
    if (old === text) continue;
    stale++;
    if (!check) writeFileSync(path, text);
    console.log(`${check ? "stale" : "wrote"} ${name}`);
  }
  if (check && stale) process.exit(1);
  const t = (out["us-typicals-v1.json"] as { assemblies: unknown[] }).assemblies.length;
  const h = (out["us-hookups-v1.json"] as { assemblies: unknown[] }).assemblies.length;
  console.log(`${t} typicals, ${h} hook-up records`);
}
