// ASSEMBLIES WP3.1 — the inputs of the linear golden (linear-golden.json):
// a raw assembly_library as a profile might hold it (the seeded records, a
// partner-edited copy, records a sanitizer must drop or default), and duct
// and pipe runs. The golden was captured from the linear code before the
// sanitizer learned `kind`; assemblyLibraryKind.test.ts replays it.
import { SEED_ASSEMBLIES } from "../../../src/lib/linear/assemblyLibrary.ts";

const ductRun = {
  segments: [
    { i: 0, lf: 18.2, size: { kind: "rect", w_in: 12, h_in: 6 }, size_src: "manual" },
    { i: 1, lf: 29.0, size: { kind: "rect", w_in: 16, h_in: 8 }, size_src: "manual" },
  ],
  vertices: [{ i: 1, kind: "elbow", angle_deg: 90, angle_class: "square" }],
  totals_by_size: { "rect:12x6": 18.2, "rect:16x8": 29.0 },
};
const roundRun = {
  segments: [{ i: 0, lf: 40, size: { kind: "round", d_in: 10 }, size_src: "manual" }],
  vertices: [{ i: 0, kind: "elbow", angle_deg: 90, angle_class: "square" }, { i: 0, kind: "tee", angle_deg: 90, angle_class: "square" }],
  totals_by_size: { "round:10": 40 },
};
const pipeRun = {
  segments: [
    { i: 0, lf: 55.5, size: { kind: "round", d_in: 2 }, size_src: "label" },
    { i: 1, lf: 12, size: { kind: "round", d_in: 1.5 }, size_src: "label" },
  ],
  vertices: [{ i: 1, kind: "elbow", angle_deg: 90, angle_class: "square" }],
  totals_by_size: { "round:2": 55.5, "round:1.5": 12 },
};

export const LINEAR_GOLDEN_INPUTS = {
  rawLibrary: [
    ...SEED_ASSEMBLIES,
    { ...SEED_ASSEMBLIES[0], id: "partner-duct", name: "Partner duct", deduct_fittings: true, extra_field: "dropped" },
    { id: "bare", family: "duct_round" },
    { id: "", family: "pipe" },
    { family: "pipe" },
    "not an object",
    { id: "asm-duct-rect-default", family: "duct_rect", name: "duplicate id, dropped" },
    { id: "odd-types", family: "pipe", name: 7, per_ft: "x", per_vertex: null, allowances: [1], deduct_fittings: "yes" },
  ],
  runs: {
    duct_rect: { run: ductRun, condition: { family: "duct_rect" } },
    duct_round: { run: roundRun, condition: { family: "duct_round" } },
    pipe: { run: pipeRun, condition: { family: "pipe" } },
    duct_rect_x2: { run: ductRun, condition: { family: "duct_rect", multiplier: 2 } },
  },
  settings: {
    none: {},
    class2: { pressure_class_in_wg: 2 },
  },
};
