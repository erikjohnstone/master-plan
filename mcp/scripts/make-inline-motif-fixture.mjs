// Generates test/fixtures/inline-motif-plan.pdf — the sweep_inline_motif
// fixture (accuracy-hardening plan Phase 4). Real shape, measured against
// the real Bessemer sample before writing this: a register/grille mark is a
// COMPACT, densely-hatched box (many short parallel dashes stacked at a
// tight pitch), not a whole shape with an independent perimeter — and real
// siblings of the SAME symbol type are drawn at genuinely different
// physical sizes (a bigger CFM rating is a visibly bigger box). This
// fixture mirrors that shape directly:
//   SEED     a real-sized hatched box, ~44 dash rows (comfortably above
//            MIN_FILL_MEMBERS=40 — never a noise cluster).
//   SIBLING  the SAME motif at 70% linear scale (a different, smaller
//            real fixture size) — must still match, the real reason this
//            phase exists (a whole-shape fingerprint can't do this).
//   NOISE    a handful of dashes (<40) sharing the identical hatch
//            signature by coincidence — must never count as a candidate.
//   DECOY    a big hatch region sharing the identical (angle, pitch)
//            signature but at a genuinely different real-world SIZE (a
//            floor/wall texture, not a register) — must be excluded by
//            real-world size, not just found-and-ignored.
//
//   node scripts/make-inline-motif-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "inline-motif-plan.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const seg = (ax, ay, bx, by) => `${fmt(ax)} ${fmt(ay)} m ${fmt(bx)} ${fmt(by)} l S`;

/** A compact hatched box: `rows` short horizontal dashes stacked evenly
 * across height `h`, each spanning width `w` — the real register's own
 * "comb of parallel dashes" shape, simplified to one dash per row (the
 * real drawing's own 2-column split doesn't change hatchFamilies' own
 * angle/pitch grouping, which only cares about each stroke's own
 * angle/length, not how many columns compose one visual row). */
function hatchBox(x0, y0, w, h, rows) {
  const out = [];
  const pitch = h / rows;
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * pitch + pitch / 2;
    out.push(seg(x0, y, x0 + w, y));
  }
  return out;
}
// A short duct stub feeding the box, heavier pen — mirrors the real shape
// (the box's own perimeter is NOT independently drawn here on purpose: two
// of its real sides are literally the tail of a longer duct-wall stroke,
// per this fixture's own sibling module's header comment).
function ductStub(x, yTop, yBottom) {
  return [seg(x - 4, yTop, x - 4, yBottom), seg(x + 20, yTop, x + 20, yBottom)];
}

const content = [
  "1 w",
  "10 10 780 580 re S",   // border — heavy pen, long segments, never a candidate
  "0.5 w",
  // SEED — 30x40pt box, 44 rows (comfortably above MIN_FILL_MEMBERS)
  ...ductStub(115, 460, 500),
  ...hatchBox(100, 460, 30, 40, 44),
  // SIBLING — the SAME motif at 70% linear scale, elsewhere on the sheet
  ...ductStub(315, 460, 500),
  ...hatchBox(300, 460, 21, 28, 44),
  // NOISE — 8 dashes only, same signature, far from either real box
  ...hatchBox(500, 100, 30, 8, 8),
  // DECOY — a big hatch region, same (angle, pitch) signature, genuinely
  // different real-world size (a floor/wall texture region, not a register)
  ...hatchBox(500, 250, 200, 300, 300),
].join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Contents 4 0 R /Resources << >> >>",
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
