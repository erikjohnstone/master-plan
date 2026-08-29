// Synthetic coverage for multi-hyphen equipment tags (PCHWP-MT1 / CUH-T1 /
// CV-CHW-BP-T class). The classifier is a hyphenated token *shape*, not a
// list of names — these strings are examples of the class, not a corpus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEquipTag, joinHyphenatedTags, joinGraphSpans, type TagBox } from "../src/lib/equiptags.ts";
import { labelTokens } from "../src/lib/symbollabels.ts";
import { parseSchedule, type Token } from "../src/lib/scheduleParse.js";
import { extractTable, type GraphSpan, type SheetSpans } from "../src/lib/sheetgraph.ts";

const box = (str: string, x0: number, y0: number, w: number, h = 10): TagBox => ({
  str, x0, y0, x1: x0 + w, y1: y0 + h,
});

test("isEquipTag: letter-led hyphenated marks in; English compounds out", () => {
  for (const ok of ["PCHWP-MT1", "CUH-T1", "CV-CHW-BP-T", "AHU-1", "FCU-2A", "EF-3", "P-7", "WH-1"]) {
    assert.equal(isEquipTag(ok), true, ok);
  }
  for (const no of [
    "FIRST-FLOOR", "SEE-NOTE", "VENDOR-A", "PCHWP", "MT1", "CPT",
    "A", "AB", "", "CV-CHW-BP-T-XX-YY", "TOOLONGPREFIX-1", "PCHWP-MT1-EXTRA-LONG-TAG",
  ]) {
    assert.equal(isEquipTag(no), false, no);
  }
});

test("joinHyphenatedTags: CAD glyph splits reassemble; compounds and neighbours stay split", () => {
  const h = 10;
  const gap = 2; // < 0.35 * 10
  // PCHWP + "-" + MT1 on one baseline
  const pump = [
    box("PCHWP", 0, 50, 50, h),
    box("-", 50 + gap, 50, 6, h),
    box("MT1", 50 + gap + 6 + gap, 50, 30, h),
  ];
  const joined = joinHyphenatedTags(pump);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].str, "PCHWP-MT1");

  const cuh = [
    box("CUH", 0, 80, 30, h),
    box("-", 32, 80, 6, h),
    box("T1", 40, 80, 16, h),
  ];
  assert.equal(joinHyphenatedTags(cuh).map((s) => s.str).join(","), "CUH-T1");

  const stack = [
    box("CV", 0, 120, 16, h),
    box("-", 18, 120, 6, h),
    box("CHW", 26, 120, 24, h),
    box("-", 52, 120, 6, h),
    box("BP", 60, 120, 16, h),
    box("-", 78, 120, 6, h),
    box("T", 86, 120, 8, h),
  ];
  assert.equal(joinHyphenatedTags(stack).map((s) => s.str).join(","), "CV-CHW-BP-T");

  // two-segment English: join is refused because the concat is not a tag
  const floor = [
    box("FIRST", 0, 160, 40, h),
    box("-", 42, 160, 6, h),
    box("FLOOR", 50, 160, 40, h),
  ];
  assert.deepEqual(joinHyphenatedTags(floor).map((s) => s.str), ["FIRST", "-", "FLOOR"]);

  // already-complete neighbours must not glue (P-7 beside FD1)
  const neigh = [box("P-7", 0, 200, 24, h), box("FD1", 26, 200, 24, h)];
  assert.deepEqual(joinHyphenatedTags(neigh).map((s) => s.str), ["P-7", "FD1"]);
});

test("joinHyphenatedTags: a 270° hyphen stack joins along the run, not +X", () => {
  const em = 10;
  // Device y-down; rot=270 reads upward. Prefix is the larger-y box.
  const col = (str: string, x: number, y0: number, run: number): TagBox => ({
    str, x0: x, y0, x1: x + em, y1: y0 + run, rot: 270,
  });
  const left = [
    col("M1", 100, 20, 13),
    col("-", 100, 33, 7),
    col("SHHWP", 100, 40, 30),
  ];
  const right = [
    col("M2", 140, 20, 13),
    col("-", 140, 33, 7),
    col("SHHWP", 140, 40, 30),
  ];
  const joined = joinHyphenatedTags([...right, ...left]);
  const tags = joined.map((s) => s.str).sort();
  assert.deepEqual(tags, ["SHHWP-M1", "SHHWP-M2"]);

  // 7-glyph abbreviation stack, same 270° walk
  const stack = [
    { str: "T", x0: 200, y0: 10, x1: 210, y1: 18, rot: 270 },
    { str: "-", x0: 200, y0: 18, x1: 210, y1: 24, rot: 270 },
    { str: "BP", x0: 200, y0: 24, x1: 210, y1: 40, rot: 270 },
    { str: "-", x0: 200, y0: 40, x1: 210, y1: 46, rot: 270 },
    { str: "CHW", x0: 200, y0: 46, x1: 210, y1: 70, rot: 270 },
    { str: "-", x0: 200, y0: 70, x1: 210, y1: 76, rot: 270 },
    { str: "CV", x0: 200, y0: 76, x1: 210, y1: 92, rot: 270 },
  ];
  assert.equal(joinHyphenatedTags(stack).map((s) => s.str).join(","), "CV-CHW-BP-T");
});

test("joinHyphenatedTags: a 90° span between +X fragments still interrupts the +X walk", () => {
  // Dense schematic: a quarter-turn note whose y0/x0 sits in sort order
  // between "TP" and "-" must keep them split. Pulling rotated spans out
  // of the +X list is how every TP-2 on a control sheet glued together.
  const schematic = [
    box("TP", 0, 50, 20, 10),
    { str: "N", x0: 12, y0: 50, x1: 22, y1: 120, rot: 90 },
    box("-", 21, 50, 6, 10),
    box("2", 28, 50, 10, 10),
  ];
  const out = joinHyphenatedTags(schematic).map((s) => s.str);
  assert.equal(out.includes("TP-2"), false, `must stay split, got ${out}`);
  assert.ok(out.includes("TP"));
});

test("joinHyphenatedTags: an unrotated join is unchanged when a 270° neighbor sits nearby", () => {
  const h = 10;
  const pump = [
    box("PCHWP", 0, 50, 50, h),
    box("-", 52, 50, 6, h),
    box("MT1", 60, 50, 30, h),
    { str: "N", x0: 20, y0: 40, x1: 30, y1: 70, rot: 270 },
  ];
  assert.equal(joinHyphenatedTags(pump).map((s) => s.str).filter((s) => s.includes("PCHWP")).join(","), "PCHWP-MT1");
});

test("joinGraphSpans: GraphSpan x/y/w/h cousin joins the same class", () => {
  const spans: GraphSpan[] = [
    { str: "PCHWP", x: 100, y: 40, w: 25, h: 8 },
    { str: "-", x: 126, y: 40, w: 4, h: 8 },
    { str: "MT1", x: 131, y: 40, w: 15, h: 8 },
  ];
  const out = joinGraphSpans(spans);
  assert.equal(out.length, 1);
  assert.equal(out[0].str, "PCHWP-MT1");
  assert.equal(out[0].x, 100);
  assert.ok(out[0].w >= 46);

  const lone = { str: "601", x: 100, y: 80, w: 15, h: 8 };
  const digit = { str: "1", x: 66, y: 100, w: 5, h: 8 };
  const kept = joinGraphSpans([lone, digit]);
  assert.equal(kept.length, 2);
  assert.equal(kept.find((s) => s.str === "601"), lone, "unmerged spans keep identity");
  assert.equal(kept.find((s) => s.str === "1"), digit);
});

test("labelTokens: equipment tags survive; split glyph runs join", () => {
  const intact = labelTokens([
    { str: "PCHWP-MT1", x0: 10, y0: 10, x1: 80, y1: 20 },
    { str: "CUH-T1", x0: 10, y0: 40, x1: 50, y1: 50 },
    { str: "CV-CHW-BP-T", x0: 10, y0: 70, x1: 90, y1: 80 },
    { str: "P-7", x0: 10, y0: 100, x1: 34, y1: 110 },
    { str: "PROVIDE", x0: 10, y0: 130, x1: 70, y1: 140 },
  ]).map((s) => s.str);
  assert.deepEqual(intact, ["PCHWP-MT1", "CUH-T1", "CV-CHW-BP-T", "P-7"]);

  const split = labelTokens([
    { str: "PCHWP", x0: 0, y0: 10, x1: 50, y1: 20 },
    { str: "-", x0: 52, y0: 10, x1: 58, y1: 20 },
    { str: "MT1", x0: 60, y0: 10, x1: 90, y1: 20 },
    { str: "PCHWP", x0: 0, y0: 80, x1: 50, y1: 90 },
    { str: "-", x0: 52, y0: 80, x1: 58, y1: 90 },
    { str: "MT1", x0: 60, y0: 80, x1: 90, y1: 90 },
  ]).map((s) => s.str);
  assert.deepEqual(split, ["PCHWP-MT1", "PCHWP-MT1"]);
});

test("parseSchedule: multi-hyphen equipment marks are CODE cells, including glyph splits", () => {
  const H = 14;
  const Yh = 20;
  const header: Token[] = [
    { str: "CODE", x: 40, y: Yh, h: H },
    { str: "MATERIAL", x: 220, y: Yh, h: H },
    { str: "MANUFACTURER", x: 420, y: Yh, h: H },
    { str: "COLOR", x: 700, y: Yh, h: H },
  ];
  const section: Token[] = [{ str: "FLOORING", x: 40, y: 64, h: H }];
  // estimated join width = max(len * 0.62 * h, 0.4 * h); keep fragments abutting
  const y1 = 108;
  const splitPump: Token[] = [
    { str: "PCHWP", x: 40, y: y1, h: H },
    { str: "-", x: 84, y: y1, h: H },
    { str: "MT1", x: 93, y: y1, h: H },
    { str: "CHILLED", x: 220, y: y1, h: H },
    { str: "WATER", x: 250, y: y1, h: H },
  ];
  const y2 = 152;
  const cuh: Token[] = [
    { str: "CUH-T1", x: 40, y: y2, h: H },
    { str: "CABINET", x: 220, y: y2, h: H },
  ];
  const y3 = 196;
  const stack: Token[] = [
    { str: "CV-CHW-BP-T", x: 40, y: y3, h: H },
    { str: "BYPASS", x: 220, y: y3, h: H },
  ];
  const rows = parseSchedule([...header, ...section, ...splitPump, ...cuh, ...stack]);
  assert.deepEqual(rows.map((r) => r.finish_tag), ["PCHWP-MT1", "CUH-T1", "CV-CHW-BP-T"]);
  assert.equal(rows[0].description, "CHILLED WATER");
});

test("extractTable: finish-table row keys include joined multi-hyphen marks", () => {
  const sp = (str: string, x: number, y: number, w?: number): GraphSpan => ({
    str, x, y, w: w ?? str.length * 5, h: 8,
  });
  const sheet: SheetSpans = {
    key: "set.pdf#9",
    sheet_number: "M-601",
    spans: [
      sp("MATERIAL SCHEDULE", 100, 40),
      sp("CODE", 100, 60), sp("MATERIAL", 220, 60), sp("MANUFACTURER", 400, 60), sp("COLOR", 560, 60),
      // intact
      sp("CUH-T1", 100, 80), sp("CABINET UNIT HEATER", 220, 80), sp("VENDOR-B", 400, 80),
      // glyph-split pump tag: fragments abut (gap 1px < 0.35*8)
      sp("PCHWP", 100, 100, 25), sp("-", 126, 100, 4), sp("MT1", 131, 100, 15),
      sp("PRIMARY CHW PUMP", 220, 100), sp("VENDOR-C", 400, 100),
      // abbreviation stack, also split
      sp("CV", 100, 120, 10), sp("-", 111, 120, 4), sp("CHW", 116, 120, 15),
      sp("-", 132, 120, 4), sp("BP", 137, 120, 10), sp("-", 148, 120, 4), sp("T", 153, 120, 5),
      sp("BYPASS", 220, 120), sp("VENDOR-D", 400, 120),
    ],
  };
  // Production feeds extractTable already-joined spans (pdf.ts textSpans).
  // Joining inside sheetgraph itself is how a later extractor pass lost
  // real tables (digit-free stacks and header fragments colliding).
  const tab = extractTable({ ...sheet, spans: joinGraphSpans(sheet.spans) }, "finish");
  assert.ok(tab, "finish table extracts");
  const keys = tab!.rows.map((r) => r.key);
  assert.ok(keys.includes("CUH-T1"), `CUH-T1 in ${keys}`);
  assert.ok(keys.includes("PCHWP-MT1"), `PCHWP-MT1 in ${keys} (joined)`);
  assert.equal(keys.includes("CUH"), false, "split CUH must not key the row");
  assert.equal(keys.includes("PCHWP"), false, "split PCHWP must not key the row");
});
