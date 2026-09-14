import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractControlSchematics } from "../src/lib/controlSchematic.ts";
import type { GraphSpan, SheetGraph } from "../src/lib/sheetgraph.ts";

const span = (str: string, x: number, y: number, w = 30, h = 12): GraphSpan => ({ str, x, y, w, h });
const emptyGraph = (): SheetGraph => ({
  available: true,
  sheets: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [], revisions: [], notes: [],
  tables: [{
    kind: "equipment", sheet: "M5.1", title: { sheet: "M5.1", text: "AIR HANDLING UNIT SCHEDULE", bbox: [10, 10, 200, 30] },
    headers: ["TAG", "DESCRIPTION"], region: [10, 10, 400, 100],
    rows: [{ key: "AHU-1", sheet: "M5.1", cells: { TAG: { text: "AHU-1", bbox: [20, 50, 60, 65] } } }],
  }],
});

describe("control schematic extraction", () => {
  it("keeps explicit I/O, instrument labels, schedule binding and crossings evidence-backed", () => {
    const spans = [
      span("AIR HANDLING UNIT SEQUENCE OF OPERATION", 220, 80, 520, 18),
      span("AI", 120, 180), span("AO", 160, 180), span("DI", 200, 180), span("DO", 240, 180),
      span("TT", 300, 180), span("AHU-1", 350, 180, 55), span("SA", 430, 180), span("DX CC", 470, 180, 55),
      span("AIR HANDLING UNIT CONTROL SCHEMATIC", 220, 500, 520, 18),
    ];
    const segs = [
      // A real T: the vertical endpoint terminates on the horizontal interior.
      100, 300, 300, 300, 200, 200, 200, 300,
      // A plain interior X: no drawn junction mark, so it must stay unresolved.
      400, 200, 500, 300, 400, 300, 500, 200,
    ];
    const result = extractControlSchematics([{ key: "M6.1", spans, segs, width: 1000, height: 700 }], emptyGraph());
    assert.equal(result.schematics.length, 1);
    const schematic = result.schematics[0];
    assert.deepEqual(schematic.point_totals, { AI: 1, AO: 1, DI: 1, DO: 1, total: 4 });
    assert.deepEqual(
      schematic.instruments.map(({ label, io_type, status }) => ({ label, io_type, status })),
      [{ label: "TT", io_type: null, status: "unmapped_instrument_label" }],
    );
    assert.deepEqual(schematic.component_labels.map((item) => item.label), ["DX CC"]);
    assert.deepEqual(
      schematic.equipment.find((item) => item.tag === "AHU-1")?.schedule_refs.map(({ sheet, title, row_key }) => ({ sheet, title, row_key })),
      [{ sheet: "M5.1", title: "AIR HANDLING UNIT SCHEDULE", row_key: "AHU-1" }],
    );
    assert.equal(schematic.equipment.find((item) => item.tag === "AHU-1")?.schedule_binding_status, "bound");
    assert.equal(schematic.topology.nodes.some((node) => node.degree === 3), true);
    assert.equal(schematic.topology.crossings.filter((item) => item.status === "unresolved_crossing").length, 1);
    assert.equal(schematic.semantic_status, "evidence_inventory");
    assert.equal(result.engineering_readiness.status, "evidence_inventory_only");
    assert.ok(result.engineering_readiness.blockers.some(({ code }) => code === "SEMANTIC_CONNECTIVITY_UNVERIFIED"));
    assert.equal(schematic.review.human_review_required, true);
  });

  it("rejects same-tag rows from explicitly unrelated schedule families", () => {
    const graph = emptyGraph();
    graph.tables.push({
      kind: "equipment", sheet: "P6.1",
      title: { sheet: "P6.1", text: "PLUMBING FIXTURE SCHEDULE", bbox: [10, 10, 200, 30] },
      headers: ["MARK", "DESCRIPTION"], region: [10, 10, 400, 100],
      rows: [{ key: "D-1", sheet: "P6.1", cells: { MARK: { text: "D-1", bbox: [20, 50, 60, 65] } } }],
    });
    const result = extractControlSchematics([{
      key: "M6.1", width: 700, height: 700, segs: [100, 250, 300, 250],
      spans: [span("D-1", 200, 200, 35, 12), span("AHU CONTROL SCHEMATIC", 100, 500, 350, 18)],
    }], graph);
    const equipment = result.schematics[0].equipment.find(({ tag }) => tag === "D-1");
    assert.equal(equipment?.schedule_binding_status, "unbound");
    assert.deepEqual(equipment?.schedule_refs, []);
    assert.equal(equipment?.rejected_schedule_refs[0].title, "PLUMBING FIXTURE SCHEDULE");
    assert.equal(equipment?.rejected_schedule_refs[0].reason, "non_hvac_bas_schedule_family");
    assert.ok(result.engineering_readiness.blockers.some(({ code }) => code === "UNBOUND_SCHEMATIC_EQUIPMENT"));
  });

  it("assigns edge direction only when vector arrowhead geometry supports it", () => {
    const spans = [span("FAN SEQUENCE OF OPERATION", 200, 80, 400), span("FAN CONTROL SCHEMATIC", 200, 500, 400, 18)];
    const segs = [100, 300, 300, 300, 300, 300, 285, 290, 300, 300, 285, 310];
    const schematic = extractControlSchematics([{ key: "M6.2", spans, segs, width: 700, height: 700 }]).schematics[0];
    assert.equal(schematic.topology.arrows.length, 1);
    assert.equal(schematic.topology.edges.filter((edge) => edge.direction !== "unknown").length, 1);
  });

  it("reconstructs a two-line authored schematic title before SOO binding", () => {
    const result = extractControlSchematics([{
      key: "M6.0", width: 700, height: 700, segs: [100, 250, 300, 250],
      spans: [
        span("HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION", 100, 60, 430, 18),
        span("HEAT RELIEF FAN W/ LOUVER", 100, 460, 280, 18),
        span("CONTROL SCHEMATIC", 100, 500, 220, 18),
      ],
    }], {
      ...emptyGraph(), tables: [], sequence_narratives: [{
        id: "soo:M6.0:1", sheet: "M6.0", title: "HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION",
        title_evidence: { sheet: "M6.0", text: "HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION", bbox: [100, 60, 530, 78] },
        region: [100, 60, 530, 300], direction: "below_title", status: "extracted", sections: [],
      }],
    });
    assert.equal(result.schematics[0].title, "HEAT RELIEF FAN W/ LOUVER CONTROL SCHEMATIC");
    assert.equal(result.schematics[0].sequence_binding_status, "bound");
    assert.deepEqual(result.schematics[0].sequence_refs.map(({ title }) => title), ["HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION"]);
    assert.deepEqual(result.schematics[0].title_evidence.bbox, [100, 460, 380, 518]);
  });

  it("uses the horizontal detail title, rejects a rotated title-block copy, and binds the adjacent authored SOO", () => {
    const schematicSheet = "navfac.pdf#52";
    const sequenceSheet = "navfac.pdf#53";
    const result = extractControlSchematics([{
      key: schematicSheet, width: 1000, height: 700, segs: [100, 250, 700, 250],
      spans: [
        span("AIR OPS / MTRACON - DOAH SCHEMATIC", 100, 500, 520, 18),
        { ...span("AIR OPS / MTRACON - DOAH CONTROL SCHEMATIC AND POINTS LIST", 920, 160, 18, 420), rot: Math.PI / 2 },
      ],
    }], {
      ...emptyGraph(), tables: [], sequence_narratives: [{
        id: "soo:navfac:53", sheet: sequenceSheet,
        title: "AIR OPS / MTRACON - DOAH SEQUENCE OF OPERATION",
        title_evidence: { sheet: sequenceSheet, text: "AIR OPS / MTRACON - DOAH SEQUENCE OF OPERATION", bbox: [100, 500, 650, 520] },
        region: [100, 80, 650, 520], direction: "above_title", status: "extracted", sections: [],
      }],
    });
    assert.equal(result.schematics.length, 1);
    assert.equal(result.schematics[0].title, "AIR OPS / MTRACON - DOAH SCHEMATIC");
    assert.equal(result.schematics[0].sequence_binding_status, "bound");
    assert.deepEqual(result.schematics[0].sequence_refs.map(({ title, sheet }) => ({ title, sheet })), [{
      title: "AIR OPS / MTRACON - DOAH SEQUENCE OF OPERATION", sheet: sequenceSheet,
    }]);
  });

  it("retains repeated explicit control-diagram details as separate evidence inventories", () => {
    const result = extractControlSchematics([{
      key: "M8.7", width: 5600, height: 4214,
      segs: [100, 100, 500, 100, 100, 400, 500, 400, 100, 700, 500, 700],
      spans: [
        span("ROOM TEMPERATURE", 160, 80, 150), span("CONTROL DAMPER", 320, 100, 130),
        span("CONSTANT AIR VOLUME BOX - CONTROL DIAGRAM", 120, 300, 430, 31.2),
        span("ROOM TEMPERATURE", 160, 390, 150), span("CONTROL DAMPER", 320, 410, 130),
        span("VARIABLE AIR VOLUME BOX - CONTROL DIAGRAM", 120, 620, 430, 31.2),
        span("ROOM TEMPERATURE", 160, 710, 150), span("CONTROL DAMPER", 320, 730, 130),
        span("DUAL MAXIMUM VARIABLE AIR VOLUME BOX - CONTROL DIAGRAM", 120, 940, 520, 31.2),
      ],
    }]);
    assert.deepEqual(result.schematics.map(({ title }) => title), [
      "CONSTANT AIR VOLUME BOX - CONTROL DIAGRAM",
      "VARIABLE AIR VOLUME BOX - CONTROL DIAGRAM",
      "DUAL MAXIMUM VARIABLE AIR VOLUME BOX - CONTROL DIAGRAM",
    ]);
    assert.ok(result.schematics.every(({ semantic_status, review }) =>
      semantic_status === "evidence_inventory" && review.human_review_required));
    assert.equal(result.schematics[1].region[1], 331.2,
      "the second stacked detail starts at the prior bottom caption, not a midpoint that clips its diagram");
    assert.equal(result.schematics[2].region[1], 651.2,
      "the third stacked detail retains linework immediately below the preceding caption");
  });

  it("clips right-edge schematic evidence at an authored title-block boundary", () => {
    const result = extractControlSchematics([{
      key: "M8.8", width: 1000, height: 1000,
      segs: [650, 400, 900, 400],
      spans: [
        span("FCU-1", 790, 450, 55, 18),
        span("FLORIDA-32542", 925, 470, 70, 32),
        span("FAN COIL UNIT - CONTROL DIAGRAM", 650, 800, 300, 24),
        span("DRAWING TITLE", 920, 850, 75, 16),
        span("PROJECT NUMBER", 920, 900, 75, 16),
        span("DRAWING NUMBER", 920, 950, 75, 16),
      ],
    }]);
    assert.equal(result.schematics.length, 1);
    assert.deepEqual(result.schematics[0].equipment.map(({ tag }) => tag), ["FCU-1"]);
    assert.equal(result.schematics[0].region[2], 920);
  });

  it("lets a single wide system diagram reach the authored drawing-field boundary", () => {
    const result = extractControlSchematics([{
      key: "M8.4", width: 1000, height: 1000,
      segs: [100, 100, 850, 100],
      spans: [
        span("DPT", 800, 180, 35, 18),
        span("BOILER SYSTEM - CONTROL DIAGRAM", 100, 500, 360, 20),
        span("DRAWING TITLE", 920, 850, 75, 16),
      ],
    }]);
    assert.equal(result.schematics[0].region[2], 920);
    assert.deepEqual(result.schematics[0].instruments.map(({ label }) => label), ["DPT"]);
  });

  it("partitions a tall detail with nearby-row captions, not an unrelated upper row", () => {
    const result = extractControlSchematics([{
      key: "M8.8", width: 1000, height: 1000,
      segs: [40, 300, 900, 300, 40, 600, 900, 600],
      spans: [
        span("UPPER RIGHT CONTROL DIAGRAM", 250, 100, 260, 20),
        span("L-7", 220, 500, 35, 18),
        span("LIGHTING CONTROL DIAGRAM", 50, 650, 250, 20),
        span("RIGHT LOWER CONTROL DIAGRAM", 650, 500, 280, 20),
      ],
    }]);
    const lighting = result.schematics.find(({ title }) => title === "LIGHTING CONTROL DIAGRAM");
    assert.ok(lighting);
    assert.ok(lighting.region[2] > 450 && lighting.region[2] < 900);
    assert.deepEqual(lighting.equipment.map(({ tag }) => tag), ["L-7"]);
  });

  it("binds a generic same-sheet SOO only through the authored control-diagram envelope", () => {
    const sheet = "M8.7";
    const narratives = [
      {
        id: "soo:top", sheet, title: "SEQUENCE OF OPERATION",
        title_evidence: { sheet, text: "SEQUENCE OF OPERATION", bbox: [100, 200, 340, 220] as [number, number, number, number] },
        region: [100, 200, 500, 450] as [number, number, number, number], direction: "below_title" as const,
        status: "extracted" as const, sections: [],
      },
      {
        id: "soo:bottom", sheet, title: "SEQUENCE OF OPERATIONS",
        title_evidence: { sheet, text: "SEQUENCE OF OPERATIONS", bbox: [100, 720, 350, 740] as [number, number, number, number] },
        region: [100, 720, 500, 930] as [number, number, number, number], direction: "below_title" as const,
        status: "extracted" as const, sections: [],
      },
    ];
    const result = extractControlSchematics([{
      key: sheet, width: 1000, height: 1000,
      segs: [100, 100, 500, 100, 100, 600, 500, 600],
      spans: [
        span("SEQUENCE OF OPERATION", 100, 200, 240, 20),
        span("CONSTANT AIR VOLUME BOX - CONTROL DIAGRAM", 100, 460, 430, 20),
        span("SEQUENCE OF OPERATIONS", 100, 720, 250, 20),
        span("DUAL MAXIMUM VARIABLE AIR VOLUME BOX - CONTROL DIAGRAM", 100, 940, 520, 20),
      ],
    }], { ...emptyGraph(), tables: [], sequence_narratives: narratives });
    assert.deepEqual(result.schematics.map(({ sequence_binding_status, sequence_refs }) => ({
      sequence_binding_status, ids: sequence_refs.map(({ id }) => id),
    })), [
      { sequence_binding_status: "bound", ids: ["soo:top"] },
      { sequence_binding_status: "bound", ids: ["soo:bottom"] },
    ]);
  });

  it("does not bind an adjacent SOO that only shares project-scope words", () => {
    const result = extractControlSchematics([{
      key: "navfac.pdf#54", width: 1000, height: 700, segs: [100, 250, 700, 250],
      spans: [
        span("AIR OPS / MTRACON - AHU SCHEMATIC", 100, 500, 520, 18),
        { ...span("AIR OPS / MTRACON - AHU CONTROL SCHEMATIC AND POINTS LIST", 920, 160, 18, 420), rot: Math.PI / 2 },
      ],
    }], {
      ...emptyGraph(), tables: [], sequence_narratives: [{
        id: "soo:navfac:55", sheet: "navfac.pdf#55",
        title: "AIR OPS / MTRACON - DOAH SEQUENCE OF OPERATION",
        title_evidence: { sheet: "navfac.pdf#55", text: "AIR OPS / MTRACON - DOAH SEQUENCE OF OPERATION", bbox: [100, 500, 650, 520] },
        region: [100, 80, 650, 520], direction: "above_title", status: "extracted", sections: [],
      }],
    });
    assert.equal(result.schematics.length, 1);
    assert.equal(result.schematics[0].sequence_binding_status, "unbound");
    assert.deepEqual(result.schematics[0].sequence_refs, []);
  });

  it("does not classify a bare generic schematic without independent control evidence", () => {
    const result = extractControlSchematics([{
      key: "details.pdf#4", width: 1000, height: 700,
      segs: [100, 250, 700, 250],
      spans: [span("DOMESTIC WATER PIPING SCHEMATIC", 100, 500, 520, 18)],
    }], emptyGraph());
    assert.equal(result.schematics.length, 0);
  });

  it("binds one same-sheet SOO through a specific system anchor when project prefixes differ", () => {
    const sheet = "navfac.pdf#64";
    const result = extractControlSchematics([{
      key: sheet, width: 1000, height: 700, segs: [100, 250, 700, 250],
      spans: [span("ATCT - DOAH SCHEMATIC", 100, 500, 400, 18)],
    }], {
      ...emptyGraph(), tables: [], sequence_narratives: [{
        id: "soo:navfac:64", sheet, title: "3.2.3 SEQUENCE OF OPERATION – DOAH-T1",
        title_evidence: { sheet, text: "3.2.3 SEQUENCE OF OPERATION – DOAH-T1", bbox: [100, 300, 600, 320] },
        region: [100, 300, 600, 480], direction: "below_title", status: "extracted", sections: [],
      }],
    });
    assert.equal(result.schematics[0].sequence_binding_status, "bound");
    assert.equal(result.schematics[0].sequence_refs[0].sheet, sheet);
  });

  it("binds a boiler control diagram to its authored heating-hot-water sequence", () => {
    const sheet = "M8.4";
    const result = extractControlSchematics([{
      key: sheet, width: 1000, height: 700, segs: [100, 250, 700, 250],
      spans: [span("BOILER SYSTEM - CONTROL DIAGRAM", 100, 500, 420, 18)],
    }], {
      ...emptyGraph(), tables: [], sequence_narratives: [{
        id: "soo:m8.4:hhw", sheet, title: "HEATING HOT WATER SYSTEM - SEQUENCE OF OPERATION",
        title_evidence: { sheet, text: "HEATING HOT WATER SYSTEM - SEQUENCE OF OPERATION", bbox: [100, 300, 650, 320] },
        region: [100, 300, 650, 480], direction: "below_title", status: "extracted", sections: [],
      }],
    });
    assert.equal(result.schematics[0].sequence_binding_status, "bound");
    assert.deepEqual(result.schematics[0].sequence_refs.map(({ title }) => title), [
      "HEATING HOT WATER SYSTEM - SEQUENCE OF OPERATION",
    ]);
  });

  it("does not use hydronic family semantics to choose between competing heating-water sequences", () => {
    const sheet = "M8.4";
    const narratives = ["PRIMARY HEATING WATER SEQUENCE OF OPERATION", "SECONDARY HHW SEQUENCE OF OPERATION"]
      .map((title, index) => ({
        id: `soo:m8.4:${index}`, sheet, title,
        title_evidence: { sheet, text: title, bbox: [100, 100 + index * 80, 650, 120 + index * 80] as [number, number, number, number] },
        region: [100, 100 + index * 80, 650, 160 + index * 80] as [number, number, number, number],
        direction: "below_title" as const, status: "extracted" as const, sections: [],
      }));
    const result = extractControlSchematics([{
      key: sheet, width: 1000, height: 700, segs: [100, 250, 700, 250],
      spans: [span("BOILER SYSTEM - CONTROL DIAGRAM", 100, 500, 420, 18)],
    }], { ...emptyGraph(), tables: [], sequence_narratives: narratives });
    assert.equal(result.schematics[0].sequence_binding_status, "ambiguous");
    assert.deepEqual(result.schematics[0].sequence_refs.map(({ title }) => title).sort(), narratives.map(({ title }) => title).sort());
  });

  it("does not bind a boiler diagram to an unrelated chilled-water sequence", () => {
    const sheet = "M8.4";
    const result = extractControlSchematics([{
      key: sheet, width: 1000, height: 700, segs: [100, 250, 700, 250],
      spans: [span("BOILER SYSTEM - CONTROL DIAGRAM", 100, 500, 420, 18)],
    }], {
      ...emptyGraph(), tables: [], sequence_narratives: [{
        id: "soo:m8.4:chw", sheet, title: "CHILLED WATER SYSTEM - SEQUENCE OF OPERATION",
        title_evidence: { sheet, text: "CHILLED WATER SYSTEM - SEQUENCE OF OPERATION", bbox: [100, 300, 650, 320] },
        region: [100, 300, 650, 480], direction: "below_title", status: "extracted", sections: [],
      }],
    });
    assert.equal(result.schematics[0].sequence_binding_status, "unbound");
    assert.deepEqual(result.schematics[0].sequence_refs, []);
  });

  it("binds an instrument to an explicit I/O type only through a collinear authored vector tether", () => {
    const spans = [
      span("AHU SEQUENCE OF OPERATION", 200, 20, 320, 18),
      span("AI", 100, 100, 30, 12),
      span("TT", 100, 200, 30, 12),
      span("DPT", 160, 200, 35, 12),
      span("AHU CONTROL SCHEMATIC", 200, 500, 320, 18),
    ];
    const segs = [115, 112, 115, 140, 115, 150, 115, 175, 115, 183, 115, 200];
    const result = extractControlSchematics([{ key: "M6.3", spans, segs, width: 700, height: 700 }]);
    const schematic = result.schematics[0];
    assert.deepEqual(schematic.io_bindings.map(({ instrument_label, point_type, interpretation_basis }) => ({
      instrument_label, point_type, interpretation_basis,
    })), [{
      instrument_label: "TT", point_type: "AI", interpretation_basis: "explicit_io_token_plus_collinear_vector_tether",
    }]);
    assert.equal(schematic.instruments.find(({ label }) => label === "TT")?.status, "mapped_to_explicit_io");
    assert.equal(schematic.instruments.find(({ label }) => label === "DPT")?.status, "unmapped_instrument_label");
    assert.equal(schematic.review.unmapped_instruments, 1);
    assert.ok(schematic.io_bindings[0].tether_evidence.bbox[3] > schematic.io_bindings[0].tether_evidence.bbox[1]);
  });

  it("extracts vertical traces across authored floor datums without inventing direction", () => {
    const spans = [
      span("CHILLED WATER RISER DIAGRAM", 100, 500, 350, 18),
      span("LOW CHWS/R RISER", 240, 180, 24, 130),
      span("FOR CONTINUATION SEE SHEET M7.2", 200, 430, 260, 14),
      span("ROOF", 40, 100, 50), span("SECOND FLOOR", 40, 250, 120), span("FIRST FLOOR", 40, 400, 110),
    ];
    const result = extractControlSchematics([{
      key: "M7.1", spans, width: 700, height: 700,
      segs: [250, 80, 250, 430, 20, 100, 600, 100, 20, 250, 600, 250, 20, 400, 600, 400],
    }]);
    assert.equal(result.risers.length, 1);
    assert.equal(result.risers[0].diagram_kind, "riser");
    assert.equal(result.risers[0].topology.status, "computed");
    assert.equal(result.risers[0].semantic_status, "evidence_inventory");
    assert.deepEqual(result.risers[0].datums.map((datum) => datum.label), ["ROOF", "SECOND FLOOR", "FIRST FLOOR"]);
    assert.deepEqual(
      result.risers[0].trace_candidates.map(({ from_datum, to_datum, direction }) => ({ from_datum, to_datum, direction })),
      [{ from_datum: "ROOF", to_datum: "FIRST FLOOR", direction: "unknown" }],
    );
    assert.deepEqual(result.risers[0].service_groups.map(({ normalized_system, pressure_zone, service_pair }) => ({
      normalized_system, pressure_zone, service_pair,
    })), [{ normalized_system: "chilled_water", pressure_zone: "low", service_pair: "supply_return" }]);
    assert.deepEqual(result.risers[0].continuations.map(({ target_sheet, boundary }) => ({ target_sheet, boundary })), [
      { target_sheet: "M7.2", boundary: "bottom" },
    ]);
    const readinessCrossings = result.engineering_readiness.blockers
      .find(({ code }) => code === "UNRESOLVED_DIAGRAM_CROSSINGS")?.count ?? 0;
    assert.equal(result.totals.unresolved_crossings, readinessCrossings,
      "the result total and engineering-readiness ledger cover the same schematic+riser crossings");
  });

  it("links only reciprocal off-page callouts at complementary diagram boundaries", () => {
    const result = extractControlSchematics([
      {
        key: "doc#1", sheet_number: "M7.1", width: 700, height: 700, segs: [100, 100, 100, 450],
        spans: [
          span("FOR CONTINUATION SEE SHEET M7.2", 200, 50, 260, 14),
          span("CHILLED WATER RISER DIAGRAM", 100, 500, 350, 18),
        ],
      },
      {
        key: "doc#2", sheet_number: "M7.2", width: 700, height: 700, segs: [100, 100, 100, 450],
        spans: [
          span("FOR CONTINUATION SEE SHEET M7.1", 200, 450, 260, 14),
          span("CHILLED WATER RISER DIAGRAM", 100, 500, 350, 18),
        ],
      },
    ]);
    assert.deepEqual(result.continuation_links.map((link) => ({
      from_sheet_number: link.from_sheet_number,
      to_sheet_number: link.to_sheet_number,
      from_boundary: link.from_boundary,
      to_boundary: link.to_boundary,
      status: link.status,
    })), [{
      from_sheet_number: "M7.1",
      to_sheet_number: "M7.2",
      from_boundary: "top",
      to_boundary: "bottom",
      status: "reciprocal",
    }]);
    assert.equal(result.totals.off_page_continuations, 2);
    assert.equal(result.totals.off_page_continuation_links, 1);
    assert.equal(result.totals.unresolved_off_page_continuations, 0);
    assert.equal(result.continuation_links[0].from_evidence.text, "FOR CONTINUATION SEE SHEET M7.2");
    assert.equal(result.continuation_links[0].to_evidence?.text, "FOR CONTINUATION SEE SHEET M7.1");
  });

  it("keeps one-way off-page callouts unresolved for engineering review", () => {
    const result = extractControlSchematics([
      {
        key: "doc#1", sheet_number: "M7.1", width: 700, height: 700, segs: [100, 100, 100, 450],
        spans: [
          span("FOR CONTINUATION SEE SHEET M7.2", 200, 50, 260, 14),
          span("CHILLED WATER RISER DIAGRAM", 100, 500, 350, 18),
        ],
      },
      {
        key: "doc#2", sheet_number: "M7.2", width: 700, height: 700, segs: [100, 100, 100, 450],
        spans: [span("CHILLED WATER RISER DIAGRAM", 100, 500, 350, 18)],
      },
    ]);
    assert.equal(result.continuation_links[0].status, "target_found_one_way");
    assert.equal(result.totals.unresolved_off_page_continuations, 1);
    assert.ok(result.engineering_readiness.blockers.some(({ code }) => code === "UNRESOLVED_OFF_PAGE_CONTINUATIONS"));
  });

  it("recognizes high-rise LEVEL datums and deduplicates mirrored CAD text", () => {
    const spans = [
      span("MECHANICAL WATER RISER DIAGRAM", 100, 500, 350, 18),
      span("LEVEL 22", 40, 100, 70), span("LEVEL 22", 540, 100, 70),
      span("LEVEL 21", 40, 250, 70), span("LEVEL 21", 540, 250, 70),
      span("LEVEL P1", 40, 400, 70), span("LEVEL P1", 540, 400, 70),
    ];
    const result = extractControlSchematics([{
      key: "M4.04", spans, width: 700, height: 700,
      segs: [250, 80, 250, 430],
    }]);
    assert.deepEqual(result.risers[0].datums.map((datum) => datum.label), ["LEVEL 22", "LEVEL 21", "LEVEL P1"]);
    assert.deepEqual(
      result.risers[0].trace_candidates.map(({ from_datum, to_datum }) => ({ from_datum, to_datum })),
      [{ from_datum: "LEVEL 22", to_datum: "LEVEL P1" }],
    );
  });

  it("treats an authored network architecture as topology and excludes note prose", () => {
    const spans = [
      span("DDC SYSTEM NETWORK DIAGRAM", 130, 500, 360, 18),
      span("WHERE DIRT LEGS ARE SHOWN ON PIPE RISER DIAGRAMS AND/OR", 80, 200, 500, 12),
    ];
    const result = extractControlSchematics([{
      key: "M7.2", spans, width: 700, height: 700,
      segs: [100, 250, 300, 250, 300, 250, 300, 400],
    }]);
    assert.equal(result.risers.length, 1);
    assert.equal(result.risers[0].title, "DDC SYSTEM NETWORK DIAGRAM");
    assert.equal(result.risers[0].diagram_kind, "network_architecture");
    assert.equal(result.risers[0].status, "evidence_inventory");
    assert.ok(result.risers[0].topology.nodes.length > 0);
  });

  it("joins a split network-riser title and accepts named Level datums", () => {
    const spans = [
      span("BUILDING AUTOMATION NETWORK", 210, 450, 360, 30),
      span("RISER DIAGRAM", 210, 490, 210, 30),
      span("Roof - Level 5", 30, 90, 140, 14), span("Roof - Level 5", 530, 90, 140, 14),
      span("Office - Level 4", 30, 220, 150, 14),
      span("Mechanical Level - Level 1", 30, 390, 220, 14),
      span("BACnet / IP", 350, 150, 90, 14), span("BACnet / MS/TP", 350, 280, 120, 14),
      span("Modbus", 500, 280, 60, 14), span("Ethernet", 450, 330, 70, 14),
      span("ME Stack", 520, 350, 80, 14), span("ME Stack", 520, 370, 80, 14),
    ];
    const riser = extractControlSchematics([{
      key: "J601", spans, width: 700, height: 700,
      segs: [300, 70, 300, 420],
    }]).risers[0];
    assert.equal(riser.title, "BUILDING AUTOMATION NETWORK RISER DIAGRAM");
    assert.equal(riser.diagram_kind, "network_architecture");
    assert.deepEqual(riser.datums.map(({ label }) => label), [
      "Roof - Level 5", "Office - Level 4", "Mechanical Level - Level 1",
    ]);
    assert.deepEqual(riser.network_transports.map(({ kind, name }) => ({ kind, name })), [
      { kind: "protocol", name: "BACnet/IP" },
      { kind: "protocol", name: "BACnet MS/TP" },
      { kind: "protocol", name: "Modbus" },
      { kind: "physical_link", name: "Ethernet" },
    ]);
    assert.deepEqual(riser.network_components.map(({ component_type, evidence }) => ({ component_type, occurrences: evidence.length })), [
      { component_type: "ME Stack", occurrences: 2 },
    ]);
    assert.deepEqual(riser.floor_placements.map(({ subject_kind, subject, floor_label }) => ({ subject_kind, subject, floor_label })), [
      { subject_kind: "network_component", subject: "ME Stack", floor_label: "Mechanical Level - Level 1" },
      { subject_kind: "network_component", subject: "ME Stack", floor_label: "Mechanical Level - Level 1" },
    ]);
    assert.deepEqual(riser.systems.map(({ normalized_system }) => normalized_system), ["building_automation_network"]);
  });

  it("recognizes authored hydronic piping diagrams without requiring floor datums", () => {
    const result = extractControlSchematics([{
      key: "AM610",
      spans: [span("USB CONDENSER WATER PIPING DIAGRAM", 100, 500, 420, 20)],
      width: 700,
      height: 700,
      segs: [100, 250, 300, 250],
    }]);
    assert.equal(result.risers.length, 1);
    assert.equal(result.risers[0].diagram_kind, "piping");
    assert.equal(result.risers[0].status, "evidence_inventory");
    assert.equal(result.risers[0].semantic_status, "evidence_inventory");
    assert.deepEqual(result.risers[0].systems.map(({ normalized_system }) => normalized_system), ["condenser_water"]);
  });

  it("classifies an authored hydronic PIPING SCHEMATIC as diagram evidence, not a generic control schematic", () => {
    const result = extractControlSchematics([{
      key: "M-801",
      spans: [
        span("CV-CH-A1", 140, 180, 80, 14),
        span("CV-CH-A2", 440, 180, 80, 14),
        span("AIR OPS - CHILLED WATER PIPING SCHEMATIC", 100, 500, 520, 20),
      ],
      width: 700,
      height: 700,
      segs: [100, 250, 600, 250],
    }]);
    assert.equal(result.schematics.length, 0);
    assert.equal(result.risers.length, 1);
    assert.equal(result.risers[0].diagram_kind, "piping");
    assert.deepEqual(result.risers[0].diagram_tags.map(({ tag }) => tag).sort(), ["CV-CH-A1", "CV-CH-A2"]);
  });

  it("pairs local valve-state tokens one-to-one and preserves cross-diagram conflicts", () => {
    const result = extractControlSchematics([
      {
        key: "AM610", width: 700, height: 700, segs: [100, 250, 300, 250],
        spans: [
          span("NO", 145, 200, 22, 12), span("V-1", 200, 200, 35, 12),
          span("CONDENSER WATER PIPING DIAGRAM", 100, 500, 420, 20),
        ],
      },
      {
        key: "AM702", width: 700, height: 700, segs: [100, 250, 300, 250],
        spans: [
          span("V-1", 200, 200, 35, 12), span("NC", 255, 200, 22, 12),
          span("CONDENSER WATER DIAGRAM", 100, 500, 360, 20),
        ],
      },
    ]);
    assert.deepEqual(result.risers.map((riser) => riser.device_states.map(({ device_tag, state }) => ({ device_tag, state }))), [
      [{ device_tag: "V-1", state: "normally_open" }],
      [{ device_tag: "V-1", state: "normally_closed" }],
    ]);
    assert.equal(result.diagram_conflicts.length, 1);
    assert.equal(result.diagram_conflicts[0].device_tag, "V-1");
    assert.equal(result.diagram_conflicts[0].status, "design_clarification_required");
    assert.deepEqual(result.diagram_conflicts[0].claims.map(({ sheet, state }) => ({ sheet, state })), [
      { sheet: "AM610", state: "normally_open" },
      { sheet: "AM702", state: "normally_closed" },
    ]);
  });
});
