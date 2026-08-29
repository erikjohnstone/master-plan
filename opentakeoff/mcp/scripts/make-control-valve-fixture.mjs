// Generates test/fixtures/control-valve-precision.pdf — a real-domain
// precision fixture for the BAS control-valve family (accuracy-hardening
// plan Phase 1): the 2-way and 3-way ELECTRIC CONTROL VALVE glyphs, drawn
// at the exact real, measured proportions read off the real SmithGroup /
// Eglin AFB "MECHANICAL CONTROLS - LEGEND" sheet M8.1
// (federal-attachment4-mechanical.pdf#17, this project's own federal-mech
// corpus set) via mcp Session.sheetContext — not invented, not eyeballed.
//
// Deliberately a REAL STRICT-SUPERSET precision case, the #259-class
// question in a new shape family: 3-way's own segments are the 2-way's
// segments PLUS one real, measured extra leg (a downward third-port
// triangle) — never a decoy that merely differs in angle. The question
// this fixture exists to answer: does scoring ALONE (matchAgainstLibrary,
// no counter-example) keep a 2-way instance from over-matching a 3-way's
// extra leg, and vice versa?
//
// Deterministic byte output; re-run only to change the fixture:
//   node scripts/make-control-valve-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "control-valve-precision.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const seg = (ax, ay, bx, by) => `${fmt(ax)} ${fmt(ay)} m ${fmt(bx)} ${fmt(by)} l S`;

// Real, measured geometry (PDF pt, y UP — this file's own drawing
// convention; the M-box sits at the TOP, the diamond and any third leg
// hang below it, same reading order as the real legend). px,py is the
// M-box's own top-LEFT corner in this local frame.
const MBOX = 23.5;
function mAndStem(px, py) {
  return [
    seg(px, py, px + MBOX, py), seg(px + MBOX, py, px + MBOX, py - MBOX),
    seg(px + MBOX, py - MBOX, px, py - MBOX), seg(px, py - MBOX, px, py),
    seg(px + MBOX / 2, py - MBOX, px + MBOX / 2, py - 46.1),
  ];
}
function diamond(px, py) {
  const cx = px + MBOX / 2, cy = py - 46.1;
  return [
    seg(cx - 17.5, cy + 11.9, cx - 17.5, cy - 11.8),
    seg(cx - 17.5, cy + 11.9, cx + 17.5, cy - 11.8),
    seg(cx + 17.5, cy - 11.8, cx + 17.5, cy + 11.9),
    seg(cx + 17.5, cy + 11.9, cx - 17.5, cy - 11.8),
  ];
}
function twoWayElectric(px, py) {
  return [...mAndStem(px, py), ...diamond(px, py)];
}
function threeWayElectric(px, py) {
  const cx = px + MBOX / 2, cy = py - 46.1;
  return [
    ...mAndStem(px, py), ...diamond(px, py),
    seg(cx, cy, px, py - 63.6), seg(px, py - 63.6, px + MBOX, py - 63.6), seg(px + MBOX, py - 63.6, cx, cy),
  ];
}

const content = [
  "1 w",
  "40 40 480 480 re S",   // border — long segments, never a symbol match
  "0.5 w",
  ...twoWayElectric(100, 480),   // seed A
  ...twoWayElectric(200, 480),   // identical
  ...twoWayElectric(300, 480),   // identical
  ...threeWayElectric(150, 340), // seed B — side by side with the 2-way cluster
  ...threeWayElectric(250, 340), // identical
].join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 560 560] /Contents 4 0 R /Resources << >> >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
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
