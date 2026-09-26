// ASSEMBLIES goal, WP0.2/WP0.3 — the key tooling the attribute eval stands on:
// the transcription helper that expands hand-typed render transcriptions into
// keys/<set>.attrs.csv, the frozen dev/held-out split those keys are scoped
// by, and the rule that a committed key is exactly its transcription's
// expansion (never hand-edited, goals/ASSEMBLIES.md ANTI-GAMING).
import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { expandTranscription, parseNumber, parseTranscription, renderKeyCsv } from "../scripts/assemblies-key-transcribe.mjs";
import { drawTier2, drawTier3, HELDOUT_MIN_DOCS, KEY_ROWS_PER_TABLE_MAX, TIER2_DEV_MIN_DOCS, TIER3_DEV_MIN_DOCS } from "../scripts/assembliesSplit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, "..");
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const REPORTS = join(CORPUS, "reports", "assemblies");

test("parseNumber: printed thousands and proper fractions parse; V/PH cells and multi-value cells refuse", () => {
  assert.equal(parseNumber("16,400"), "16400");
  assert.equal(parseNumber("1,725"), "1725");
  assert.equal(parseNumber("3/4"), "0.75");
  assert.equal(parseNumber("1-1/4"), "1.25");
  assert.equal(parseNumber("1/3"), String(1 / 3));
  assert.equal(parseNumber(".5"), "0.5");
  assert.equal(parseNumber('2"'), "2");
  assert.equal(parseNumber("30% PG"), "30");
  assert.equal(parseNumber("30% P.G."), "30");
  assert.equal(parseNumber("7.5 HP (VFD)"), "7.5");
  // A voltage/phase cell is two numbers, never 153.33 or 115.
  for (const cell of ["460/3", "115/1", "120/1/60", "208/3/60"]) assert.throws(() => parseNumber(cell), /not a single printed number/, cell);
  // A multi-speed airflow or a range is not ONE value.
  for (const cell of ["50-80-110", "3.2 \\ 6", "SEE NOTE 3"]) assert.throws(() => parseNumber(cell), /not a single printed number/, cell);
});

const FAN_TRANSCRIPTION = `
SET t-fan
SEED 1
SCOPE unit test
EXCLUDES nothing
TABLE
sheet: t.pdf#1
title: FAN SCHEDULE
family: FAN
render: test
rows: all 2 printed rows
col: MARK => tag
col: LOCATION => -
col: [LOCATION names a level] => floor
col: CFM => cfm
col: ESP => esp_in
col: MOTOR HP => motor_hp
col: DRIVE => drive
col: [V/PH: volts part] => volts
col: RPM => rpm [rev/min]
derive: vfd = yes ; header=NOTE 2 ; note=note 2, cited by every row: 'PROVIDE VFD'
grid:
EF-1 | ROOF | =ROOF (ROOF) | 1,200 | 0.5 | 1/3 | direct (DIRECT) | 115 | 1725
EF-2 | MECH 152 |  | ?50-80-110 | - | 1/2 | belt (BELT) | 115 |
END
`;

test("expandTranscription: every covered attribute gets a line, and each empty value says why", () => {
  const rows = expandTranscription(parseTranscription(FAN_TRANSCRIPTION));
  const get = (tag, attr) => rows.find((r) => r.tag === tag && r.attribute === attr);
  assert.equal(new Set(rows.map((r) => r.tag)).size, 2);
  assert.equal(rows.filter((r) => r.tag === "EF-1").length, rows.filter((r) => r.tag === "EF-2").length);

  assert.deepEqual(get("EF-1", "cfm"), { sheet: "t.pdf#1", table_title: "FAN SCHEDULE", tag: "EF-1", family: "FAN", attribute: "cfm", value: "1200", unit: "cfm", source_header: "CFM", note: "printed '1,200'" });
  assert.equal(get("EF-1", "esp_in").unit, "in. w.c.", "a fan's ESP is inches of water column");
  assert.equal(get("EF-1", "motor_hp").value, String(1 / 3));
  assert.deepEqual([get("EF-1", "drive").value, get("EF-1", "drive").note], ["direct", "printed 'DIRECT'"]);
  assert.deepEqual([get("EF-1", "floor").value, get("EF-1", "floor").note], ["ROOF", "printed 'ROOF'; author's reading of the printed row"]);
  assert.equal(get("EF-1", "volts").source_header, "V/PH: volts part");
  assert.match(get("EF-1", "volts").note, /author's reading of the printed row/);
  assert.equal(get("EF-1", "rpm").unit, "rev/min", "a [unit] on the col: line is the unit the header prints");
  assert.deepEqual([get("EF-2", "vfd").value, get("EF-2", "vfd").source_header], ["yes", "NOTE 2"], "a derive: line applies to every row");

  // The four kinds of empty value stay distinguishable for the scorer.
  assert.deepEqual([get("EF-2", "cfm").value, get("EF-2", "cfm").note], ["", "printed '50-80-110' — not a single value for this attribute"]);
  assert.deepEqual([get("EF-2", "esp_in").value, get("EF-2", "esp_in").note], ["", "printed '-'"]);
  assert.deepEqual([get("EF-2", "rpm").value, get("EF-2", "rpm").note], ["", "blank cell"]);
  assert.deepEqual([get("EF-2", "floor").value, get("EF-2", "floor").note], ["", "blank cell"]);
  assert.deepEqual([get("EF-1", "ecm").value, get("EF-1", "ecm").note, get("EF-1", "ecm").source_header], ["", "not printed", ""]);
});

test("expandTranscription: units follow the attribute (oa_cfm_min is cfm, a connection is inches, glycol is %)", () => {
  const doc = parseTranscription(`SET t-ahu
TABLE
sheet: t.pdf#2
title: AHU SCHEDULE
family: AHU
render: test
rows: all 1 printed rows
col: TAG => tag
col: MIN OA => oa_cfm_min
col: CHW CONN => chw_conn_in
col: FLUID => chw_glycol_pct
grid:
AHU-1 | 2,150 | 2 1/2 | 30% PG
END
`);
  const rows = expandTranscription(doc);
  const unit = (a) => rows.find((r) => r.attribute === a).unit;
  assert.equal(unit("oa_cfm_min"), "cfm");
  assert.equal(unit("chw_conn_in"), "in");
  assert.equal(unit("chw_glycol_pct"), "%");
  assert.equal(rows.find((r) => r.attribute === "chw_conn_in").value, "2.5");
});

test("expandTranscription: one cell printed in its own unit keys that unit (16W in an HP column), and only that cell", () => {
  const doc = parseTranscription(`SET t-uh
TABLE
sheet: t.pdf#2
title: STEAM UNIT HEATER SCHEDULE
family: UNIT_HEATER
render: test
rows: all 2 printed rows
col: MARK => tag
col: MOTOR / HP => motor_hp
col: CAPACITY / BTUH => heating_mbh [BTU/H]
grid:
UH-1 | 1/20 | 48000
UH-2 | 16 [W] | 18000
END
`);
  const rows = expandTranscription(doc);
  const line = (tag, a) => rows.find((r) => r.tag === tag && r.attribute === a);
  assert.deepEqual([line("UH-1", "motor_hp").value, line("UH-1", "motor_hp").unit], ["0.05", "hp"]);
  assert.deepEqual([line("UH-2", "motor_hp").value, line("UH-2", "motor_hp").unit, line("UH-2", "motor_hp").note], ["16", "W", "printed '16'"]);
  assert.equal(line("UH-2", "heating_mbh").unit, "BTU/H");
  // Without the cell's unit, "16W" would key 16 hp: the transcriber reads the
  // number and drops a trailing unit word.
  assert.equal(parseNumber("16W"), "16");
});

const part = (n, cols, cells) => `TABLE
sheet: t.pdf#3
title: WATER SOURCE HEAT PUMP
family: HEAT_PUMP
render: test part ${n}
rows: all 1 printed rows
${cols.map((c) => `col: ${c}`).join("\n")}
grid:
${cells}
END
`;

test("a schedule printed in two parts is one instance; the same attribute printed in both parts is an error", () => {
  const merged = expandTranscription(parseTranscription(`SET t-hp\n${part(1, ["TAG => tag", "CFM => cfm"], "HP-1 | 800")}${part(2, ["TAG => tag", "HP => motor_hp"], "HP-1 | 1/2")}`));
  assert.equal(new Set(merged.map((r) => r.tag)).size, 1);
  assert.equal(merged.find((r) => r.attribute === "cfm").value, "800");
  assert.equal(merged.find((r) => r.attribute === "motor_hp").value, "0.5");
  assert.equal(merged.filter((r) => r.attribute === "cfm").length, 1);

  assert.throws(() => expandTranscription(parseTranscription(`SET t-hp\n${part(1, ["TAG => tag", "CFM => cfm"], "HP-1 | 800")}${part(2, ["TAG => tag", "CFM => cfm"], "HP-1 | 800")}`)),
    /printed in two parts/);
});

test("malformed transcriptions refuse instead of keying something", () => {
  const base = (cols, grid) => `SET t\nTABLE\nsheet: t.pdf#1\ntitle: T\nfamily: FAN\nrender: r\nrows: r\n${cols}\ngrid:\n${grid}\nEND\n`;
  assert.throws(() => parseTranscription(base("col: TAG => tag\ncol: CFM => cfm", "EF-1 | 100 | 200")), /3 cells, 2 columns declared/);
  assert.throws(() => expandTranscription(parseTranscription(base("col: TAG => tag\ncol: X => bogus", "EF-1 | 1"))), /not a covered attribute of FAN/);
  assert.throws(() => expandTranscription(parseTranscription(base("col: TAG => tag\ncol: DRIVE => drive", "EF-1 | DIRECT"))), /is not one of direct\/belt/);
  assert.throws(() => expandTranscription(parseTranscription(base("col: TAG => tag\ncol: CFM => cfm\ncol: CFM2 => cfm", "EF-1 | 1 | 2"))), /two columns map to cfm/);
  assert.throws(() => expandTranscription(parseTranscription(base("col: TAG => tag\ncol: CFM => cfm", "EF-1 | 460/3"))), /EF-1\.cfm/);
  assert.throws(() => parseTranscription("SET t\nTABLE\nsheet: s\ngrid:\n"), /missing END/);
});

test("a claimed table that prints no instance of its family is keyed with one table-level line; untitled claims key an empty title", () => {
  const none = `SET t-none
TABLE
sheet: t.pdf#52
title: (untitled)
family: DUCT_MOUNTED_COIL
render: test
rows: none — an equipment anchorage schedule; no row is a coil
grid:
END
`;
  const doc = parseTranscription(none);
  assert.equal(doc.tables[0].title, "");
  const rows = expandTranscription(doc);
  assert.deepEqual(rows, [{ sheet: "t.pdf#52", table_title: "", tag: "", family: "DUCT_MOUNTED_COIL", attribute: "", value: "", unit: "", source_header: "",
    note: "no DUCT_MOUNTED_COIL instance printed: none — an equipment anchorage schedule; no row is a coil" }]);
  const { text, summary } = renderKeyCsv(doc);
  assert.match(summary, /0 instance\(s\), 0 keyed attribute value\(s\).*1 table\(s\) keyed with no instance of their family/);
  assert.match(text, /#   t\.pdf#52 \| \(untitled\) \| DUCT_MOUNTED_COIL/);
  assert.match(text, /\nt\.pdf#52,,,DUCT_MOUNTED_COIL,,,,,no DUCT_MOUNTED_COIL instance printed/);
  // An empty grid must say so, and "none" with rows is a contradiction.
  assert.throws(() => expandTranscription(parseTranscription(none.replace(/rows: .*/, "rows: all printed rows"))), /empty grid/);
  assert.throws(() => expandTranscription(parseTranscription(none.replace("grid:\n", "grid:\nX-1\n").replace("render: test", "render: test\ncol: TAG => tag"))), /rows says none/);
  // A titled table still needs its title.
  assert.throws(() => expandTranscription(parseTranscription(none.replace("title: (untitled)\n", ""))), /missing title/);
});

test("renderKeyCsv is a pure function of the transcription", () => {
  const a = renderKeyCsv(parseTranscription(FAN_TRANSCRIPTION));
  const b = renderKeyCsv(parseTranscription(FAN_TRANSCRIPTION));
  assert.equal(a.text, b.text);
  assert.match(a.text, /^# t-fan\.attrs\.csv/);
  assert.match(a.text, /\nsheet,table_title,tag,family,attribute,value,unit,source_header,note\n/);
  assert.match(a.summary, /^t-fan: 1 table\(s\), 2 instance\(s\), \d+ keyed attribute value\(s\)/);
});

const hasSplitInputs = ["sets.json"].every((f) => existsSync(join(CORPUS, f)))
  && ["00-baseline.json", "drafters.json", "01-split.json"].every((f) => existsSync(join(REPORTS, f)));

test("WP0.2: the committed split is reproduced exactly by its seed from the committed census", { skip: !hasSplitInputs && "corpus reports not present" }, () => {
  const committed = JSON.parse(readFileSync(join(REPORTS, "01-split.json"), "utf8"));
  const tmp = mkdtempSync(join(tmpdir(), "assemblies-split-"));
  try {
    mkdirSync(join(tmp, "reports", "assemblies"), { recursive: true });
    copyFileSync(join(CORPUS, "sets.json"), join(tmp, "sets.json"));
    for (const f of ["00-baseline.json", "drafters.json"]) copyFileSync(join(REPORTS, f), join(tmp, "reports", "assemblies", f));
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/assemblies-baseline.mjs", tmp, "--split", String(committed.seed)],
      { cwd: MCP, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr);
    const redrawn = JSON.parse(readFileSync(join(tmp, "reports", "assemblies", "01-split.json"), "utf8"));
    for (const k of ["generated_at"]) { delete redrawn[k]; delete committed[k]; }
    assert.deepEqual(redrawn, committed);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

const TIER2 = join(REPORTS, "tier2");
const hasTier2 = ["00-baseline.json", "examined.json", "01-split.json"].every((f) => existsSync(join(TIER2, f)));

test("AS-17: the committed second tier is reproduced exactly by its seed from its census", { skip: !(hasSplitInputs && hasTier2) && "second tier not drawn here" }, () => {
  const committed = JSON.parse(readFileSync(join(TIER2, "01-split.json"), "utf8"));
  const tmp = mkdtempSync(join(tmpdir(), "assemblies-tier2-"));
  try {
    mkdirSync(join(tmp, "reports", "assemblies", "tier2"), { recursive: true });
    copyFileSync(join(CORPUS, "sets.json"), join(tmp, "sets.json"));
    for (const f of ["drafters.json", "01-split.json"]) copyFileSync(join(REPORTS, f), join(tmp, "reports", "assemblies", f));
    for (const f of ["00-baseline.json", "examined.json"]) copyFileSync(join(TIER2, f), join(tmp, "reports", "assemblies", "tier2", f));
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/assemblies-baseline.mjs", tmp, "--tier2", String(committed.seed)],
      { cwd: MCP, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr);
    const redrawn = JSON.parse(readFileSync(join(tmp, "reports", "assemblies", "tier2", "01-split.json"), "utf8"));
    for (const k of ["generated_at"]) { delete redrawn[k]; delete committed[k]; }
    assert.deepEqual(redrawn, committed);
    // No drafter on two sides, no document on two sides, and none of the WP0.2 split's.
    const split = JSON.parse(readFileSync(join(REPORTS, "01-split.json"), "utf8"));
    const drafters = JSON.parse(readFileSync(join(REPORTS, "drafters.json"), "utf8"));
    const groupOf = (id) => Object.entries(drafters.groups).find(([, g]) => g.sets.includes(id))?.[0];
    const devGroups = new Set(committed.dev.sets.map(groupOf));
    assert.deepEqual(committed.heldout.sets.filter((id) => devGroups.has(groupOf(id))), []);
    const wp02 = new Set([...split.dev.sets, ...split.heldout.sets]);
    assert.deepEqual([...committed.dev.sets, ...committed.heldout.sets, ...committed.heldout.withheld].filter((id) => wp02.has(id)), []);
    const examined = new Set(JSON.parse(readFileSync(join(TIER2, "examined.json"), "utf8")).sets.map((x) => x.id));
    assert.deepEqual(committed.heldout.sets.filter((id) => examined.has(id)), [], "an examined document was held out");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

const TIER3 = join(REPORTS, "tier3");
const hasTier3 = existsSync(join(TIER3, "01-split.json"));

test("AS-17: the committed third tier is reproduced exactly by its seed from the second tier's census", { skip: !(hasSplitInputs && hasTier2 && hasTier3) && "third tier not drawn here" }, () => {
  const committed = JSON.parse(readFileSync(join(TIER3, "01-split.json"), "utf8"));
  const tmp = mkdtempSync(join(tmpdir(), "assemblies-tier3-"));
  try {
    mkdirSync(join(tmp, "reports", "assemblies", "tier2"), { recursive: true });
    copyFileSync(join(CORPUS, "sets.json"), join(tmp, "sets.json"));
    for (const f of ["drafters.json", "00-baseline.json", "01-split.json"]) copyFileSync(join(REPORTS, f), join(tmp, "reports", "assemblies", f));
    for (const f of ["00-baseline.json", "01-split.json"]) copyFileSync(join(TIER2, f), join(tmp, "reports", "assemblies", "tier2", f));
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/assemblies-baseline.mjs", tmp, "--tier3", String(committed.seed)],
      { cwd: MCP, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr);
    const redrawn = JSON.parse(readFileSync(join(tmp, "reports", "assemblies", "tier3", "01-split.json"), "utf8"));
    for (const k of ["generated_at"]) { delete redrawn[k]; delete committed[k]; }
    assert.deepEqual(redrawn, committed);
    // One document per drafter, and no drafter WP0.2's split or the second tier holds.
    const split = JSON.parse(readFileSync(join(REPORTS, "01-split.json"), "utf8"));
    const t2 = JSON.parse(readFileSync(join(TIER2, "01-split.json"), "utf8"));
    const drafters = JSON.parse(readFileSync(join(REPORTS, "drafters.json"), "utf8"));
    const groupOf = (id) => Object.entries(drafters.groups).find(([, g]) => g.sets.includes(id))?.[0];
    const earlier = new Set([...split.dev.sets, ...split.heldout.sets, ...t2.dev.sets, ...t2.heldout.sets, ...t2.heldout.withheld].map(groupOf));
    assert.deepEqual(committed.dev.sets.filter((id) => earlier.has(groupOf(id))), []);
    assert.equal(new Set(committed.dev.sets.map(groupOf)).size, committed.dev.sets.length);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

const keyFiles = existsSync(join(CORPUS, "keys"))
  ? readdirSync(join(CORPUS, "keys")).filter((f) => f.endsWith(".attrs.csv")) : [];

test("WP0.3: every committed attribute key is byte-for-byte its transcription's expansion", { skip: !keyFiles.length && "no attribute keys committed yet" }, () => {
  for (const f of keyFiles) {
    const setId = f.replace(/\.attrs\.csv$/, "");
    const src = join(REPORTS, "key-work", `${setId}.transcription.txt`);
    assert.ok(existsSync(src), `${f} has no transcription in reports/assemblies/key-work/`);
    const doc = parseTranscription(readFileSync(src, "utf8"));
    assert.equal(doc.set, setId, `${src} says SET ${doc.set}`);
    assert.equal(readFileSync(join(CORPUS, "keys", f), "utf8"), renderKeyCsv(doc).text, `${f} differs from its transcription — keys are never hand-edited`);
  }
});

test("WP0.3: keys stay inside the frozen scope (dev: claimed tables; held-out: the drawn tables, at most the row cap)", { skip: (!keyFiles.length || !hasSplitInputs) && "no attribute keys committed yet" }, () => {
  const split = JSON.parse(readFileSync(join(REPORTS, "01-split.json"), "utf8"));
  const census = JSON.parse(readFileSync(join(REPORTS, "00-baseline.json"), "utf8"));
  const claimed = new Map(census.per_set.map((r) => [r.id, r.families || {}]));
  for (const f of keyFiles) {
    const setId = f.replace(/\.attrs\.csv$/, "");
    const doc = parseTranscription(readFileSync(join(REPORTS, "key-work", `${setId}.transcription.txt`), "utf8"));
    const heldout = split.heldout.sets.includes(setId);
    // The second and third tiers (AS-17) key only their drawn tables, on every side, as held-out does.
    const t2 = hasTier2 ? JSON.parse(readFileSync(join(TIER2, "01-split.json"), "utf8")) : null;
    const t3 = hasTier3 ? JSON.parse(readFileSync(join(TIER3, "01-split.json"), "utf8")) : null;
    const tier2Side = t2 && (t2.dev.sets.includes(setId) ? t2.dev : t2.heldout.sets.includes(setId) ? t2.heldout : null);
    const tier3Side = t3 && t3.dev.sets.includes(setId) ? t3.dev : null;
    const tierSide = tier2Side || tier3Side;
    const tierName = tier2Side ? "second" : "third";
    const tierCap = (tier2Side ? t2 : t3)?.key_rows_per_table_max;
    assert.ok(heldout || tierSide || split.dev.sets.includes(setId), `${setId} is in neither the dev nor the held-out split, nor a later tier`);
    // One printed table can hold two claimed families (a split system's indoor
    // and outdoor unit on one row), so the scope is checked per table x family.
    const instances = new Map();
    for (const r of expandTranscription(doc)) {
      const table = `${r.sheet} :: ${r.table_title}`;
      const key = `${table}\u0000${r.family}`;
      if (!instances.has(key)) instances.set(key, { table, family: r.family, tags: new Set() });
      if (r.tag) instances.get(key).tags.add(r.tag); // an empty tag keys a table with no instance
    }
    for (const { table, family, tags } of instances.values()) {
      if (tierSide) {
        const drawn = tierSide.tables.find((t) => t.set === setId && t.table === table && t.family === family);
        assert.ok(drawn, `${setId}: ${family} "${table}" was not drawn for the ${tierName} tier's key`);
        assert.ok(tags.size <= tierCap, `${setId}: "${table}" keys ${tags.size} rows, the cap is ${tierCap}`);
      } else if (heldout) {
        const drawn = split.heldout.tables.find((t) => t.set === setId && t.table === table && t.family === family);
        assert.ok(drawn, `${setId}: ${family} "${table}" was not drawn for the held-out key`);
        // The cap is on PRINTED rows in printed order (key-work/README.md step 4),
        // not on what the compile claimed, so a missed row is still keyable.
        assert.ok(tags.size <= split.key_rows_per_table_max, `${setId}: "${table}" keys ${tags.size} rows, the cap is ${split.key_rows_per_table_max}`);
      } else {
        assert.ok(claimed.get(setId)?.[family]?.table_rows?.[table] !== undefined, `${setId}: ${family} "${table}" is not a claimed table of the dev document`);
      }
    }
  }
});

// AS-2 / AS-17 — the second tier's draw (scripts/assembliesSplit.mjs drawTier2):
// which staged documents become dev 2, held-out 2, or withheld.
// A census row: one document with the given families, each in `tables` tables of `rows` rows.
const doc = (id, fams, { tables = 1, rows = 12 } = {}) => ({
  id,
  families: Object.fromEntries(fams.map((f) => [f, {
    items: tables * rows,
    table_rows: Object.fromEntries(Array.from({ length: tables }, (_, i) => [`${id}.pdf#${i + 1} :: ${f} SCHEDULE ${i + 1}`, rows])),
  }])),
});

function world() {
  const perSet = [];
  const groups = {};
  // 16 one-document drafters, the common families; two of them also print rarer ones.
  for (let i = 0; i < 16; i++) {
    const id = `s${String(i).padStart(2, "0")}`;
    const fams = [["VAV", "AHU", "FAN"], ["PUMP", "BOILER"], ["FCU", "UNIT_HEATER"], ["FAN", "PUMP"]][i % 4];
    perSet.push(doc(id, i === 5 ? [...fams, "HUMIDIFIER"] : i === 9 ? [...fams, "COOLING_TOWER", "HEAT_EXCHANGER"] : fams, { tables: 1 + (i % 3), rows: 10 + i * 3 }));
    groups[`firm-${id}`] = { sets: [id] };
  }
  // One drafter with three documents, one with a copy and a document with no keyed family.
  for (const id of ["m1", "m2", "m3"]) perSet.push(doc(id, ["VAV", "AHU"]));
  groups["firm-multi"] = { sets: ["m1", "m2", "m3", "m4"] };
  perSet.push(doc("m4", ["CONTROL_DAMPER"]));
  // A document by a WP0.2 dev drafter, and a set the census could not measure.
  perSet.push(doc("d1", ["VAV"]));
  groups["firm-dev"] = { sets: ["dev-a", "d1"] };
  perSet.push({ id: "err", error: "out of memory" });
  groups["firm-err"] = { sets: ["err"] };
  const split = { dev: { sets: ["dev-a"] }, heldout: { sets: ["held-b"] } };
  groups["firm-held"] = { sets: ["held-b"] };
  const eligible = perSet.map((r) => r.id);
  return { census: { per_set: perSet }, drafters: { groups, duplicates: {}, derived: {} }, split, eligible };
}

test("tier 2: a pure function of its inputs; one document per drafter; no drafter on both sides", () => {
  const w = world();
  const a = drawTier2(w.census, w.drafters, w.split, 20260926, { eligible: w.eligible });
  const b = drawTier2(structuredClone(w.census), structuredClone(w.drafters), w.split, 20260926, { eligible: [...w.eligible] });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.heldout.sets, drawTier2(w.census, w.drafters, w.split, 7, { eligible: w.eligible }).heldout.sets);
  assert.equal(a.heldout.sets.length, HELDOUT_MIN_DOCS);
  assert.ok(a.dev.sets.length >= TIER2_DEV_MIN_DOCS);
  const groupOf = (id) => Object.entries(w.drafters.groups).find(([, g]) => g.sets.includes(id))[0];
  const devGroups = a.dev.sets.map(groupOf);
  const heldGroups = a.heldout.sets.map(groupOf);
  assert.equal(new Set(devGroups).size, devGroups.length, "one dev document per drafter");
  assert.equal(new Set(heldGroups).size, heldGroups.length, "one held-out document per drafter");
  assert.deepEqual(devGroups.filter((g) => heldGroups.includes(g)), []);
  // The dev drafter's document is left out; the unmeasured set and the damper-only document are not in the population.
  assert.deepEqual(a.left_out_split_drafters, [{ set: "d1", group: "firm-dev", shares_drafter_with: ["dev-a"] }]);
  assert.equal(a.population_docs, 19);
  assert.ok(![...a.dev.sets, ...a.heldout.sets].some((id) => ["d1", "err", "m4"].includes(id)));
});

test("tier 2: a held-out drafter's other documents are withheld; an examined document's drafter never goes to held-out", () => {
  const w = world();
  // Find a seed whose held-out side takes the three-document drafter, then mark one of its documents examined.
  let seed = 1;
  let t;
  for (; seed < 500; seed++) {
    t = drawTier2(w.census, w.drafters, w.split, seed, { eligible: w.eligible });
    if (t.heldout.groups.includes("firm-multi")) break;
  }
  assert.ok(t.heldout.groups.includes("firm-multi"), "some seed puts the multi-document drafter on the held-out side");
  const pick = t.heldout.sets.find((id) => id.startsWith("m"));
  assert.deepEqual(t.heldout.withheld, ["m1", "m2", "m3", "m4"].filter((id) => id !== pick));
  const e = drawTier2(w.census, w.drafters, w.split, seed, { eligible: w.eligible, examined: ["m2"] });
  assert.ok(!e.heldout.groups.includes("firm-multi"));
  assert.deepEqual(e.skipped_for_heldout.find((s) => s.group === "firm-multi"), { group: "firm-multi", examined: ["m2"] });
  assert.ok(!e.heldout.withheld.some((id) => id.startsWith("m")));
});

test("tier 2: dev 2 covers every required family the population holds, and held-out 2 never takes the only document of one", () => {
  const w = world();
  for (const seed of [1, 2, 3, 20260926, 99]) {
    const t = drawTier2(w.census, w.drafters, w.split, seed, { eligible: w.eligible });
    assert.deepEqual(t.dev_coverage_missing, [], `seed ${seed}`);
    // s05 alone prints a humidifier and s09 alone a cooling tower and HX: neither can be held out.
    assert.ok(!t.heldout.sets.includes("s05") && !t.heldout.sets.includes("s09"), `seed ${seed}`);
    assert.ok(t.dev.sets.includes("s05") && t.dev.sets.includes("s09"), `seed ${seed}`);
    assert.deepEqual(t.required_coverage_missing_from_population, ["chiller", "ERV"]);
    // One table per document × keyed family, capped rows.
    for (const side of [t.dev, t.heldout]) {
      const strata = side.sets.flatMap((id) => Object.keys(w.census.per_set.find((r) => r.id === id).families));
      assert.equal(side.tables.length, strata.length);
      for (const tb of side.tables) assert.equal(tb.keyed_rows_max, Math.min(tb.claimed_rows, KEY_ROWS_PER_TABLE_MAX));
    }
  }
});

test("tier 2: an unplaced document, or an eligible one by a held-out drafter, stops the draw", () => {
  const w = world();
  const unplaced = structuredClone(w.drafters);
  delete unplaced.groups["firm-s03"];
  assert.throws(() => drawTier2(w.census, unplaced, w.split, 1, { eligible: w.eligible }), /does not place: s03/);
  const leaked = structuredClone(w.drafters);
  leaked.groups["firm-held"].sets.push("s04");
  delete leaked.groups["firm-s04"];
  assert.throws(() => drawTier2(w.census, leaked, w.split, 1, { eligible: w.eligible }), /s04 shares drafter group firm-held with held-out held-b.*hygiene scan must withhold it/);
});

// AS-17 — the third tier's draw (scripts/assembliesSplit.mjs drawTier3): dev 3 only.
const noTier2 = { dev: { sets: [] }, heldout: { sets: [], withheld: [] } };

test("tier 3: a pure function of its inputs; one document per drafter; no drafter an earlier tier holds", () => {
  const w = world();
  const t2 = drawTier2(w.census, w.drafters, w.split, 20260926, { eligible: w.eligible });
  const a = drawTier3(w.census, w.drafters, w.split, t2, 20260927, { eligible: w.eligible });
  assert.deepEqual(a, drawTier3(structuredClone(w.census), structuredClone(w.drafters), w.split, structuredClone(t2), 20260927, { eligible: [...w.eligible] }));
  const groupOf = (id) => Object.entries(w.drafters.groups).find(([, g]) => g.sets.includes(id))[0];
  const earlier = new Set([...w.split.dev.sets, ...w.split.heldout.sets, ...t2.dev.sets, ...t2.heldout.sets, ...t2.heldout.withheld].map(groupOf));
  const devGroups = a.dev.sets.map(groupOf);
  assert.equal(new Set(devGroups).size, devGroups.length, "one dev-3 document per drafter");
  assert.deepEqual(devGroups.filter((g) => earlier.has(g)), []);
  // 17 drafter groups hold a keyed document WP0.2's drafters do not; the second tier drew some of them.
  assert.equal(a.population_groups, 17 - t2.dev.groups.length - t2.heldout.groups.length);
  assert.ok(a.left_out_earlier_drafters.some((x) => x.set === "d1" && x.shares_drafter_with.includes("dev-a (WP0.2)")));
  // Fewer groups than TIER3_DEV_MIN_DOCS are left: dev 3 takes them all.
  assert.ok(a.population_groups < TIER3_DEV_MIN_DOCS);
  assert.equal(a.dev.sets.length, a.population_groups);
});

test("tier 3: dev 3 takes TIER3_DEV_MIN_DOCS groups in seed order, then only groups that add a required family", () => {
  const w = world();
  for (const seed of [1, 2, 3, 20260927, 99]) {
    const t = drawTier3(w.census, w.drafters, w.split, noTier2, seed, { eligible: w.eligible });
    assert.deepEqual(t.dev_coverage_missing, [], `seed ${seed}`);
    assert.ok(t.dev.sets.includes("s05") && t.dev.sets.includes("s09"), `seed ${seed}`);
    assert.deepEqual(t.required_coverage_missing_from_population, ["chiller", "ERV"]);
    const order = t.shuffled_group_order.map((g) => g.group);
    assert.deepEqual(t.dev.groups.slice(0, TIER3_DEV_MIN_DOCS), order.slice(0, TIER3_DEV_MIN_DOCS), `seed ${seed}`);
    assert.deepEqual(t.dev.groups.slice(TIER3_DEV_MIN_DOCS), t.dev.added_for_coverage.map((g) => g.group), `seed ${seed}`);
    const strata = t.dev.sets.flatMap((id) => Object.keys(w.census.per_set.find((r) => r.id === id).families));
    assert.equal(t.dev.tables.length, strata.length);
    for (const tb of t.dev.tables) assert.equal(tb.keyed_rows_max, Math.min(tb.claimed_rows, KEY_ROWS_PER_TABLE_MAX));
  }
});

test("tier 3: an eligible document by a held-out or held-out-2 drafter that no draw withheld stops the draw", () => {
  const w = world();
  const leaked = structuredClone(w.drafters);
  leaked.groups["firm-held"].sets.push("s04");
  delete leaked.groups["firm-s04"];
  assert.throws(() => drawTier3(w.census, leaked, w.split, noTier2, 1, { eligible: w.eligible }), /s04 shares drafter group firm-held with held-out held-b.*hygiene scan must withhold it/);
  const shared = structuredClone(w.drafters);
  shared.groups["firm-s03"].sets.push("s04");
  delete shared.groups["firm-s04"];
  const held2 = { dev: { sets: [] }, heldout: { sets: ["s03"], withheld: [] } };
  assert.throws(() => drawTier3(w.census, shared, w.split, held2, 1, { eligible: w.eligible }), /s04 shares drafter group firm-s03 with held-out 2 s03, yet the second tier did not withhold it/);
  // Withheld by the second tier, it is left out quietly.
  const t = drawTier3(w.census, shared, w.split, { ...held2, heldout: { sets: ["s03"], withheld: ["s04"] } }, 1, { eligible: w.eligible });
  assert.ok(!t.dev.sets.includes("s04") && t.left_out_earlier_drafters.some((x) => x.set === "s04"));
});
