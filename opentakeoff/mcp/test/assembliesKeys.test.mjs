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
    assert.ok(heldout || split.dev.sets.includes(setId), `${setId} is in neither the dev nor the held-out split`);
    const instances = new Map();
    for (const r of expandTranscription(doc)) {
      const table = `${r.sheet} :: ${r.table_title}`;
      if (!instances.has(table)) instances.set(table, { family: r.family, tags: new Set() });
      instances.get(table).tags.add(r.tag);
    }
    for (const [table, { family, tags }] of instances) {
      if (heldout) {
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
