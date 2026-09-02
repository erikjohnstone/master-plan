/**
 * L5 header-geometry classification (shared UI+MCP path) — untitled valve/BAS grids.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBasEstimatorProduct,
  compileBasTakeoff,
  compileControlValveTakeoff,
  compileEmbeddedCoilGaps,
  extractEmbeddedCoils,
  headerShapeMatches,
  inferValveServiceFromTable,
  isBasPointsListTable,
  isControlValveHeaderShape,
  scopeExclusionsForGraph,
  tableHeaderBlob,
} from "../src/lib/corpusTakeoff.mjs";

const UNTITLED_VALVE_TABLE = {
  sheet: "set.pdf#5",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"],
  rows: [
    {
      key: "CV-7",
      cells: {
        TAG: { text: "CV-7" },
        SERVED: { text: "BOILER-1" },
        GPM: { text: "120" },
        SIZE: { text: '2"' },
      },
    },
    {
      key: "CV-11/CV-12",
      cells: {
        TAG: { text: "CV-11/CV-12" },
        SERVED: { text: "BOILER-2" },
        GPM: { text: "85" },
      },
    },
  ],
};

const UNTITLED_BAS_TABLE = {
  sheet: "set.pdf#8",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "DESCRIPTION", "AI", "AO", "BI", "BO"],
  rows: [
    { key: "AI-1", cells: { TAG: { text: "AI-1" }, DESCRIPTION: { text: "SUPPLY TEMP" } } },
    { key: "BO-3", cells: { TAG: { text: "BO-3" }, DESCRIPTION: { text: "START" } } },
  ],
};

describe("tableHeaderBlob + headerShapeMatches", () => {
  it("concatenates table.headers for geometry inference", () => {
    const blob = tableHeaderBlob(UNTITLED_VALVE_TABLE);
    assert.match(blob, /TAG/);
    assert.match(blob, /GPM/);
    assert.match(blob, /SERVED/);
  });

  it("detects valve vs BAS header shapes", () => {
    assert.equal(isControlValveHeaderShape(UNTITLED_VALVE_TABLE), true);
    assert.equal(isBasPointsListTable(UNTITLED_VALVE_TABLE), false);
    assert.equal(isBasPointsListTable(UNTITLED_BAS_TABLE), true);
    assert.equal(isControlValveHeaderShape(UNTITLED_BAS_TABLE), false);
  });
});

describe("untitled valve grid compile (013-shaped)", () => {
  it("extracts CV-* control valves from blank-title header-inferred grid", () => {
    const graph = { sheets: [{ key: "set.pdf#5" }], tables: [UNTITLED_VALVE_TABLE] };
    const valve = compileControlValveTakeoff(null, graph);
    assert.ok(valve.totals.items >= 2, "CV-7 and CV-11/CV-12 split");
    assert.ok(valve.categories.CHW_CONTROL_VALVE?.count >= 2);
    const tags = (valve.categories.CHW_CONTROL_VALVE?.items || []).map((i) => i.tag);
    assert.ok(tags.some((t) => /^CV-7$/i.test(t)));
    assert.ok(tags.some((t) => /^CV-11$/i.test(t)));
    assert.ok(tags.some((t) => /^CV-12$/i.test(t)));
  });
});

// Real, found-live gap (2026-09-02, 074_CA_West_Valley_College_STEM_
// Classroom_HVAC): a table titled "EQUIPMENT CONTROL VALVES" — real,
// mark-corroborated control valves — has no CHW/HHW/BYPASS qualifier in its
// own title, so it failed every family's titleRe *and* was denied the
// blank-title service-inference fallback solely because it has SOME title
// text. isGenericControlValveTitle + the uniqueFamily wiring fix this,
// scoped to CHW_CONTROL_VALVE/HHW_CONTROL_VALVE only.
const TITLED_GENERIC_VALVE_TABLE = {
  sheet: "set.pdf#9",
  kind: "equipment",
  title: { text: "EQUIPMENT CONTROL VALVES" },
  headers: ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"],
  rows: [
    {
      key: "CV-1",
      cells: {
        TAG: { text: "CV-1" },
        SERVED: { text: "AHU-1 HW COIL" },
        GPM: { text: "14" },
        SIZE: { text: '1"' },
      },
    },
    {
      key: "CV-2",
      cells: {
        TAG: { text: "CV-2" },
        SERVED: { text: "AHU-2 HW COIL" },
        GPM: { text: "9" },
        SIZE: { text: '3/4"' },
      },
    },
  ],
};

describe("titled-but-service-unqualified valve schedule compile (074-shaped)", () => {
  it("extracts CV-* control valves from a titled table with no CHW/HHW/BYPASS qualifier", () => {
    const graph = { sheets: [{ key: "set.pdf#9" }], tables: [TITLED_GENERIC_VALVE_TABLE] };
    const valve = compileControlValveTakeoff(null, graph);
    assert.ok(valve.totals.items >= 2, "CV-1 and CV-2 both claimed despite the generic title");
    const tags = Object.values(valve.categories)
      .flatMap((c) => c?.items || [])
      .map((i) => i.tag);
    assert.ok(tags.some((t) => /^CV-1$/i.test(t)));
    assert.ok(tags.some((t) => /^CV-2$/i.test(t)));
  });
});

describe("inferValveServiceFromTable (word-boundary matching, not substring)", () => {
  it("infers CHW, not HHW, for a row tag containing CHW as a substring of itself", () => {
    // Real bug, found and fixed 2026-09-02 in self-review: bare /HW/i
    // tested against "CHW-1" matches, because "CHW-1" contains "HW" as a
    // substring — so a genuinely chilled-water valve fell through to the
    // HHW bucket, exactly backwards. Real, corroborating evidence this
    // convention exists in the corpus: Eglin AFB's own real PUMP SCHEDULE
    // uses "CHWP-"/"HWP-" prefixes for exactly this distinction (see
    // hvacTaxonomy.ts's Pump entry) — a valve schedule using an analogous
    // CHW-prefixed tag is a real, not hypothetical, risk.
    const table = { title: { text: "" }, headers: ["TAG"], rows: [{ key: "CHW-1", cells: {} }] };
    assert.equal(inferValveServiceFromTable(table), "CHW");
  });

  it("still infers HHW for a real hot-water tag", () => {
    const table = { title: { text: "" }, headers: ["TAG"], rows: [{ key: "HHW-1", cells: {} }] };
    assert.equal(inferValveServiceFromTable(table), "HHW");
  });
});

describe("scope exclusion disclosure (real, per-graph — not static boilerplate)", () => {
  it("discloses the architectural fire-rated-wall-plan gap when the set has no A-prefixed sheets", () => {
    const graph = { sheets: [{ key: "s1", number: "M1.0" }, { key: "s2", number: "M2.0" }], tables: [] };
    const exclusions = scopeExclusionsForGraph(graph);
    assert.ok(exclusions.some((e) => /architectural/i.test(e) && /fire.?rated/i.test(e)));
  });

  it("does NOT falsely claim the architectural gap when the set actually has an A-prefixed sheet", () => {
    const graph = { sheets: [{ key: "s1", number: "M1.0" }, { key: "s2", number: "A2.1" }], tables: [] };
    const exclusions = scopeExclusionsForGraph(graph);
    assert.ok(!exclusions.some((e) => /architectural/i.test(e) && /fire.?rated/i.test(e)));
  });

  it("always discloses the separate-specifications-book gap (platform can only see what's uploaded)", () => {
    const graph = { sheets: [{ key: "s1", number: "M1.0" }], tables: [] };
    const exclusions = scopeExclusionsForGraph(graph);
    assert.ok(exclusions.some((e) => /specifications book/i.test(e)));
  });

  it("compileControlValveTakeoff carries the real exclusion in its own output", () => {
    const graph = { sheets: [{ key: "s1", number: "M1.0" }], tables: [] };
    const valve = compileControlValveTakeoff(null, graph);
    assert.ok(valve.exclusions.some((e) => /architectural/i.test(e)));
  });
});

describe("BAS points inventory<->printed reconciliation (word-boundary matching)", () => {
  it("AHU-1's inventory point is NOT false-matched against a printed points list that only serves AHU-10", () => {
    const hvacTakeoff = {
      categories: {
        AHU: {
          count: 2,
          items: [
            { tag: "AHU-1", sheet_id: "s1", table_title: "AIR HANDLING UNIT SCHEDULE" },
            { tag: "AHU-10", sheet_id: "s1", table_title: "AIR HANDLING UNIT SCHEDULE" },
          ],
        },
      },
    };
    const basLists = [{ items: [{ served_equipment: "AHU-10", tag: "AO-1" }] }];
    const graph = { sheets: [], tables: [] };
    const product = buildBasEstimatorProduct(hvacTakeoff, basLists, graph);
    const gap = product.gap_vs_printed;
    assert.ok(
      gap.inventory_without_printed_points.includes("AHU-1"),
      "AHU-1 has no real printed points and must show as a real gap",
    );
    assert.ok(
      !gap.inventory_without_printed_points.includes("AHU-10"),
      "AHU-10 has a real, exact printed match and must NOT show as a gap",
    );
  });

  it("printed AHU-1 served-equipment is NOT false-matched against inventory that only has AHU-10", () => {
    const hvacTakeoff = {
      categories: {
        AHU: {
          count: 1,
          items: [{ tag: "AHU-10", sheet_id: "s1", table_title: "AIR HANDLING UNIT SCHEDULE" }],
        },
      },
    };
    const basLists = [{ items: [{ served_equipment: "AHU-1", tag: "AO-1" }] }];
    const graph = { sheets: [], tables: [] };
    const product = buildBasEstimatorProduct(hvacTakeoff, basLists, graph);
    const gap = product.gap_vs_printed;
    assert.ok(
      gap.printed_served_without_inventory.includes("AHU-1"),
      "printed AHU-1 has no matching inventory and must show as a real gap",
    );
  });
});

describe("untitled BAS grid compile", () => {
  it("accepts header-inferred POINTS/I/O grids without a title caption", () => {
    const graph = { sheets: [{ key: "set.pdf#8" }], tables: [UNTITLED_BAS_TABLE] };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 2);
    const lists = bas.categories.points_lists.lists;
    assert.equal(lists.length, 1);
    assert.match(lists[0].title, /header-inferred/i);
  });
});

// Real, found-live gap (2026-09-02, 001_NC_FY20_P_228_ATC_Tower_and_Air_
// Operations): the actual real header text from that set's own AIR
// HANDLING UNIT SCHEDULE — no separate valve schedule exists anywhere in
// the set, so this coil data is the ONLY record a control valve exists.
const AHU_TABLE_WITH_EMBEDDED_COIL = {
  sheet: "set.pdf#14",
  kind: "equipment",
  title: { text: "AIR HANDLING UNIT SCHEDULE" },
  headers: [
    "SYMBOL", "AREA SERVED", "COOLING COIL DATA GPM", "COOLING COIL DATA EWT °F",
    "COOLING COIL DATA LWT °F", "HEATING COIL DATA GPM", "HEATING COIL DATA EWT °F",
    "HEATING COIL DATA LWT °F", "MANUFACTURER AND MODEL",
  ],
  rows: [
    {
      key: "AHU-1",
      cells: {
        SYMBOL: { text: "AHU-1" },
        "AREA SERVED": { text: "LABS" },
        "COOLING COIL DATA GPM": { text: "42.0" },
        "COOLING COIL DATA EWT °F": { text: "44.0" },
        "COOLING COIL DATA LWT °F": { text: "56.0" },
        "HEATING COIL DATA GPM": { text: "18.0" },
        "HEATING COIL DATA EWT °F": { text: "140.0" },
        "HEATING COIL DATA LWT °F": { text: "120.0" },
      },
    },
  ],
};

// Negative control: a pump schedule's own GPM column with no paired
// EWT/LWT under the same header prefix must NOT be mistaken for a coil —
// GPM alone is not enough.
const PUMP_TABLE_NO_COIL = {
  sheet: "set.pdf#15",
  kind: "equipment",
  title: { text: "PUMP SCHEDULE" },
  headers: ["TAG", "SERVED", "GPM", "HEAD (FT)"],
  rows: [
    { key: "P-1", cells: { TAG: { text: "P-1" }, SERVED: { text: "HHW LOOP" }, GPM: { text: "120" }, "HEAD (FT)": { text: "60" } } },
  ],
};

describe("embedded coil detection (AHU/RTU/FCU schedules, not just valve schedules)", () => {
  it("extracts real coil GPM/EWT/LWT from an AHU schedule row with no separate valve schedule", () => {
    const found = extractEmbeddedCoils(AHU_TABLE_WITH_EMBEDDED_COIL);
    assert.equal(found.length, 2, "cooling coil + heating coil, one AHU-1 row");
    const cooling = found.find((c) => /COOLING/i.test(c.coilLabel));
    const heating = found.find((c) => /HEATING/i.test(c.coilLabel));
    assert.ok(cooling, "cooling coil block found");
    assert.equal(cooling.tag, "AHU-1");
    assert.equal(cooling.gpm, "42.0");
    assert.equal(cooling.ewt, "44.0");
    assert.equal(cooling.lwt, "56.0");
    assert.ok(heating, "heating coil block found");
    assert.equal(heating.gpm, "18.0");
  });

  it("does not mistake a pump schedule's bare GPM column for a coil", () => {
    const found = extractEmbeddedCoils(PUMP_TABLE_NO_COIL);
    assert.equal(found.length, 0, "GPM without a paired EWT/LWT is not a coil block");
  });

  it("extracts from 021_XX's real AIR TERMINAL UNIT SCHEDULE (MBH+GPM+ROW, no water temp)", () => {
    // Real, found-live gap 2026-09-02: this table has no EWT/LWT at all --
    // just MARK/CFM/MBH/GPM/ROW. Capacity + flow + physical row count is
    // itself a real, coil-specific structural signature (a pump or valve
    // schedule never reports "ROW") -- the second admission gate exists
    // exactly for this real shape.
    const table = {
      sheet: "021xx#2", title: { text: "AIR TERMINAL UNIT SCHEDULE" },
      headers: ["REMARKS", "MARK", "CFM", "NOISE CRITERIA (NC) DISCH", "MBH", "GPM", "ROW"],
      rows: [{ key: "VAV-1", cells: { MARK: { text: "VAV-1" }, MBH: { text: "12" }, GPM: { text: "1.2" }, ROW: { text: "1" } } }],
    };
    const found = extractEmbeddedCoils(table);
    assert.equal(found.length, 1);
    assert.equal(found[0].tag, "VAV-1");
    assert.equal(found[0].gpm, "1.2");
    assert.equal(found[0].ewt, null);
  });

  it("extracts from 021_XX's real AIR HANDLING UNIT SCHEDULE (literal 'COIL' word + GPM, no water temp or rows)", () => {
    // Real, found-live gap 2026-09-02: "COOLING COIL DATA FLOW (GPM)" has
    // neither a water temp nor a row count -- just capacity + GPM -- but
    // the word COIL is right there in the header text. Third admission
    // gate: GPM co-occurring with a header that literally names a coil.
    const table = {
      sheet: "021xx#1", title: { text: "AIR HANDLING UNIT SCHEDULE" },
      headers: [
        "UNIT NO.", "COOLING COIL DATA TOTAL CAPACITY (MBH)", "COOLING COIL DATA FLOW (GPM)",
        "HEATING COIL DATA TOTAL CAPACITY (MBH)", "HEATING COIL DATA FLOW (GPM)",
      ],
      rows: [{
        key: "AHU-1",
        cells: {
          "UNIT NO.": { text: "AHU-1" },
          "COOLING COIL DATA TOTAL CAPACITY (MBH)": { text: "120" },
          "COOLING COIL DATA FLOW (GPM)": { text: "24.0" },
          "HEATING COIL DATA TOTAL CAPACITY (MBH)": { text: "80" },
          "HEATING COIL DATA FLOW (GPM)": { text: "15.0" },
        },
      }],
    };
    const found = extractEmbeddedCoils(table);
    assert.equal(found.length, 2, "cooling coil + heating coil, both on AHU-1's row");
    const cooling = found.find((c) => /COOLING/i.test(c.coilLabel));
    const heating = found.find((c) => /HEATING/i.test(c.coilLabel));
    assert.ok(cooling && heating);
    assert.equal(cooling.gpm, "24.0");
    assert.equal(cooling.coilLabel, "COOLING COIL DATA FLOW", "trailing punctuation from the strip point must be trimmed");
    assert.equal(heating.gpm, "15.0");
  });

  it("extracts from 019_FL_Eglin_AFB's real header format (bare EWT/LWT + qualified 'FLOW GPM', no shared prefix)", () => {
    // Real, found-live gap 2026-09-02: bare "EWT"/"LWT" compute an empty
    // prefix, but "FLOW GPM" computes prefix "FLOW" — different strings,
    // so exact-prefix grouping alone missed this real table entirely
    // (extractEmbeddedCoils found 0 before this fix). This table only
    // ever describes ONE coil per row, so there was never a need for a
    // disambiguating prefix in the first place — the whole-table fallback
    // exists exactly for this shape.
    const table = {
      sheet: "eglin19#5",
      title: { text: "AIR HANDLING UNIT HYDRONIC COIL SCHEDULE" },
      headers: [
        "TYPE", "SYSTEM", "DESIGN AIR FLOW CFM", "CAPACITY MBH", "EWT °F", "LWT °F", "FLOW GPM",
        "MAX AIR PD I.W.G", "WATER MAX PD FT. H2O", "REMARKS",
      ],
      rows: [{
        key: "AHU-1-HC",
        cells: { TYPE: { text: "HEATING" }, "EWT °F": { text: "180" }, "LWT °F": { text: "160" }, "FLOW GPM": { text: "12.5" } },
      }],
    };
    const found = extractEmbeddedCoils(table);
    assert.equal(found.length, 1);
    assert.equal(found[0].tag, "AHU-1-HC");
    assert.equal(found[0].gpm, "12.5");
    assert.equal(found[0].ewt, "180");
    assert.equal(found[0].lwt, "160");
    assert.equal(found[0].coilLabel, "AIR HANDLING UNIT HYDRONIC COIL SCHEDULE");
  });

  it("extracts from itd-d1-lab's real header format (period-separated E.W.T./L.W.T., generic 'FLUID PERFORMANCE' prefix)", () => {
    // Real header text, verified 2026-09-02 against itd-d1-lab-mechanical.pdf's
    // own HOT WATER REHEAT COIL SCHEDULE — a genuinely different real-world
    // convention from 001_NC's "PREHEAT COIL GPM" style (no coil-specific
    // word in the prefix at all, periods instead of bare letters).
    const table = {
      sheet: "d1lab#13",
      title: { text: "HOT WATER REHEAT COIL SCHEDULE" },
      headers: [
        "SYMBOL", "AREA / SUPPLY VALVE SERVED", "CAPACITY (MBH)", "CFM", "E.A.T. (°F)", "L.A.T. (°F)",
        "AIR P.D. (IN W.C.)", "FLUID PERFORMANCE E.W.T.", "FLUID PERFORMANCE L.W.T.", "FLUID PERFORMANCE GPM",
        "FLUID P.D. (FT)", "ROWS", "FPI W", "MANUFACTURER AND MODEL", "REMARKS",
      ],
      rows: [{
        key: "HC-1",
        cells: {
          SYMBOL: { text: "HC-1" },
          "AREA / SUPPLY VALVE SERVED": { text: "RESIDENCY LAB 131 / SAV-1" },
          "FLUID PERFORMANCE E.W.T.": { text: "140.0" },
          "FLUID PERFORMANCE L.W.T.": { text: "122.2" },
          "FLUID PERFORMANCE GPM": { text: "9.0" },
        },
      }],
    };
    const found = extractEmbeddedCoils(table);
    assert.equal(found.length, 1);
    assert.equal(found[0].tag, "HC-1");
    assert.equal(found[0].gpm, "9.0");
    assert.equal(found[0].ewt, "140.0");
    assert.equal(found[0].lwt, "122.2");
  });

  it("compileEmbeddedCoilGaps discloses the AHU coil as a real gap when no valve schedule exists", () => {
    const graph = { sheets: [{ key: "set.pdf#14" }], tables: [AHU_TABLE_WITH_EMBEDDED_COIL] };
    const result = compileEmbeddedCoilGaps(null, graph);
    assert.equal(result.totals.coils_found, 2);
    assert.equal(result.totals.gaps, 2, "no separate valve schedule in this graph — both coils are real gaps");
    assert.ok(result.gaps.every((g) => g.has_scheduled_valve === false));
    assert.ok(result.gaps.some((g) => g.tag === "AHU-1" && /COOLING/i.test(g.coilLabel)));
  });

  it("does NOT false-corroborate AHU-1's coil against a valve schedule that only lists AHU-10", () => {
    // Real, found-live bug caught in self-review 2026-09-02: plain
    // substring matching ("AHU-10".includes("AHU-1") === true) would
    // silently hide a real gap. Word-boundary matching must reject this.
    const ahu1Coil = {
      sheet: "set.pdf#14", kind: "equipment", title: { text: "AIR HANDLING UNIT SCHEDULE" },
      headers: ["SYMBOL", "COOLING COIL DATA GPM", "COOLING COIL DATA EWT °F", "COOLING COIL DATA LWT °F"],
      rows: [{ key: "AHU-1", cells: {
        SYMBOL: { text: "AHU-1" },
        "COOLING COIL DATA GPM": { text: "42.0" },
        "COOLING COIL DATA EWT °F": { text: "44.0" },
        "COOLING COIL DATA LWT °F": { text: "56.0" },
      } }],
    };
    const valveForAhu10 = {
      sheet: "set.pdf#13", kind: "equipment", title: { text: "HHW CONTROL VALVE SCHEDULE" },
      headers: ["TAG", "SERVED", "GPM", "SIZE"],
      rows: [{ key: "CV-10", cells: { TAG: { text: "CV-10" }, SERVED: { text: "AHU-10" }, GPM: { text: "40.0" }, SIZE: { text: '1"' } } }],
    };
    const graph = { sheets: [{ key: "set.pdf#13" }, { key: "set.pdf#14" }], tables: [valveForAhu10, ahu1Coil] };
    const result = compileEmbeddedCoilGaps(null, graph);
    assert.equal(result.totals.coils_found, 1);
    assert.equal(result.totals.gaps, 1, "AHU-1's coil must NOT be false-corroborated by AHU-10's valve");
    assert.equal(result.gaps[0].tag, "AHU-1");
  });

  it("compileEmbeddedCoilGaps marks a coil corroborated when a matching valve IS scheduled", () => {
    const valveTable = {
      sheet: "set.pdf#13",
      kind: "equipment",
      title: { text: "HHW CONTROL VALVE SCHEDULE" },
      headers: ["TAG", "SERVED", "GPM", "SIZE"],
      rows: [
        { key: "CV-1", cells: { TAG: { text: "CV-1" }, SERVED: { text: "AHU-1" }, GPM: { text: "18.0" }, SIZE: { text: '1"' } } },
      ],
    };
    const graph = { sheets: [{ key: "set.pdf#13" }, { key: "set.pdf#14" }], tables: [valveTable, AHU_TABLE_WITH_EMBEDDED_COIL] };
    const result = compileEmbeddedCoilGaps(null, graph);
    assert.equal(result.totals.coils_found, 2);
    assert.ok(result.totals.gaps < 2, "at least one coil should now be corroborated by the real scheduled valve");
  });
});
