// Generates test/fixtures/legend-scale-gap.pdf — a real REFUSED_NO_SCALE
// regression fixture for buildLegendTakeoff (takeoff.ts): a single sheet
// that classifies role "legend" (a "MECHANICAL LEGEND" title span, the same
// bare-LEGEND signal sheetgraph.ts's own ROLE_SIGNALS already recognizes at
// conf 0.5) carrying one real, detectable (glyph, caption) pair — the
// identical control-valve shape make-legend-fixture.mjs already uses,
// already proven end-to-end by legendlearn.test.ts/takeoff.test.ts — but
// with NO scale note anywhere on the page, mirroring the real itd-d1-lab
// corpus finding this session investigated (a genuine "CONTROLS LEGEND"
// symbol-key sheet with zero scale text of any kind, confirmed by direct
// render). No plan-role sheet exists in this fixture at all, so the refusal
// is driven purely by the legend sheet's OWN missing scale — the exact real
// shape of the corpus finding, isolated and reproducible in-repo.
//
// Deterministic byte output; re-run only to change the fixture:
//   node scripts/make-legend-scale-gap-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "legend-scale-gap.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const seg = (ax, ay, bx, by) => `${fmt(ax)} ${fmt(ay)} m ${fmt(bx)} ${fmt(by)} l S`;
const text = (t, x, y, size = 10) => `BT /F1 ${size} Tf ${fmt(x)} ${fmt(y)} Td (${t}) Tj ET`;

// Same real, measured control-valve body as make-legend-fixture.mjs (halved
// from hvacRefShapes.ts's own image-px literals to match this fixture's
// image-px space) — an M-box (real T-junction) + a diamond (two verticals,
// two full crossing diagonals).
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

const content = [
  "1 w",
  "40 40 720 720 re S",

  // Real sheet-role signal — a bare "LEGEND" substring anywhere on the page
  // is enough for classifySheetRole's own existing conf-0.5 signal; title
  // text position is not gated the way detectScale's title-block region is.
  text("MECHANICAL LEGEND", 300, 760, 16),

  // The one (glyph, caption) pair — identical shape/caption convention to
  // make-legend-fixture.mjs's own row 1, already proven detectable.
  "0.5 w",
  ...controlValveGlyph(100, 700),
  text("2", 170, 685, 12), text("-", 181.5, 685, 12), text("WAY ELECTRIC CONTROL VALVE", 188, 685, 12),

  // Deliberately NO scale note anywhere on this page — the real corpus
  // condition (itd-d1-lab-mechanical.pdf#16's own CONTROLS LEGEND carries
  // zero scale text of any kind, confirmed by direct render this session).
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
