// Generates test/fixtures/legend-plan.pdf — the auto-legend-learning
// fixture (accuracy-hardening plan Phase 1, pivoted from a fixed reference-
// shape library to auto-detecting a JOB'S OWN legend sheet: legendlearn.ts's
// findLegendGlyphs). Deliberately mirrors real quirks found live against the
// real Eglin AFB legend (federal-attachment4-mechanical.pdf#17,
// this project's own federal-mech corpus set), not invented:
//
//   - a real caption drawn as SEVERAL separate text runs on one line
//     ("2" + "-" + "WAY ELECTRIC CONTROL VALVE"), not one string;
//   - a real caption WRAPPED across two physical lines ("2-WAY CONTROL
//     VALVE" / "WITH INTEGRAL THERMOSTAT");
//   - a glyph whose own parts connect only at a T-junction (a stem landing
//     on the MIDDLE of a box's own edge) and at a mid-segment crossing (the
//     "bowtie" diamond's own two full diagonals) — no two parts share an
//     actual segment ENDPOINT, the real reason naive endpoint-clustering
//     failed against the real sheet and JTS-based noding was needed;
//   - a long horizontal rule line (a column divider), which must NOT be
//     read as a glyph;
//   - two independent, unrelated (glyph, caption) pairs on the same sheet.
//
// Deterministic byte output; re-run only to change the fixture:
//   node scripts/make-legend-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "legend-plan.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const seg = (ax, ay, bx, by) => `${fmt(ax)} ${fmt(ay)} m ${fmt(bx)} ${fmt(by)} l S`;
const text = (t, x, y, size = 10) => `BT /F1 ${size} Tf ${fmt(x)} ${fmt(y)} Td (${t}) Tj ET`;

// The same real, measured "control valve" body shape as hvacRefShapes.ts /
// make-control-valve-fixture.mjs, halved from that file's own raw PDF-pt
// literals — those were transcribed directly from an mcp sheetContext dump,
// which reports coordinates at RENDER_SCALE 2.0 (image px), not raw PDF pt;
// using them as-is in a PDF content stream double-counts the ×2 render
// scale. Halved here so THIS fixture's own image-px dimensions match the
// real, measured Eglin AFB glyph (~58 image-px tall) instead of 2× that.
// An M-box (real T-junction: the stem's own endpoint lands on the MIDDLE of
// the box's bottom edge, not a corner) + a diamond drawn as two verticals
// and two FULL crossing diagonals (real mid-segment crossing, no endpoint
// at the visual center).
const MBOX = 11.75;
function mAndStem(px, py) {
  return [
    seg(px, py, px + MBOX, py), seg(px + MBOX, py, px + MBOX, py - MBOX),
    seg(px + MBOX, py - MBOX, px, py - MBOX), seg(px, py - MBOX, px, py),
    seg(px + MBOX / 2, py - MBOX, px + MBOX / 2, py - 23.05),
  ];
}
function diamond(px, py) {
  const cx = px + MBOX / 2, cy = py - 23.05;
  return [
    seg(cx - 8.75, cy + 5.95, cx - 8.75, cy - 5.9),
    seg(cx - 8.75, cy + 5.95, cx + 8.75, cy - 5.9),
    seg(cx + 8.75, cy - 5.9, cx + 8.75, cy + 5.95),
    seg(cx + 8.75, cy + 5.95, cx - 8.75, cy - 5.9),
  ];
}
function controlValveGlyph(px, py) { return [...mAndStem(px, py), ...diamond(px, py)]; }

// A second, visually distinct glyph family — a simple damper blade (one
// long diagonal through a rectangle) — to prove multiple INDEPENDENT
// (glyph, caption) pairs on one sheet are each found and labeled correctly,
// not just the one control-valve shape repeated.
function damperGlyph(px, py) {
  return [
    seg(px, py, px + 30, py), seg(px + 30, py, px + 30, py - 12),
    seg(px + 30, py - 12, px, py - 12), seg(px, py - 12, px, py),
    seg(px, py, px + 30, py - 12),
  ];
}

const content = [
  "1 w",
  "40 40 720 720 re S",

  // Row 1: control valve glyph, caption split into 3 real text runs on one
  // line ("2" + "-" + "WAY ELECTRIC CONTROL VALVE") — mirrors the real
  // Eglin AFB legend's own font-kerning run boundaries exactly.
  "0.5 w",
  ...controlValveGlyph(100, 700),
  text("2", 170, 685, 12), text("-", 181.5, 685, 12), text("WAY ELECTRIC CONTROL VALVE", 188, 685, 12),

  // Row 2: the same glyph family, caption WRAPPED across two lines —
  // mirrors "2-WAY CONTROL VALVE" / "WITH INTEGRAL THERMOSTAT".
  ...controlValveGlyph(100, 600),
  text("2-WAY CONTROL VALVE", 170, 585, 12),
  text("WITH INTEGRAL THERMOSTAT", 170, 570, 12),

  // A long horizontal rule line — a column divider, must NOT be read as a
  // glyph (it has no compact bbox and no nearby caption of its own kind).
  "1 w",
  seg(60, 500, 700, 500),
  "0.5 w",

  // Row 3: a second, unrelated glyph family (damper), its own real caption
  // — proves multiple independent pairs are each found and correctly
  // labeled, not just the first shape repeated.
  ...damperGlyph(100, 420),
  text("PARALLEL BLADE DAMPER", 155, 405, 12),

  // A caption with NO nearby glyph at all (a bare abbreviation-style
  // entry) — must be silently ignored, not force-paired with anything.
  text("KW", 100, 300, 10), text("KILOWATTS", 400, 300, 10),
].join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.5\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefAt = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pdf, "latin1");
console.log(`wrote ${OUT} (${pdf.length} bytes)`);
