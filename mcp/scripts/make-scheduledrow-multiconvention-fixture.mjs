// Generates test/fixtures/schedule-row-multiconvention.pdf — a real, found
// bug's own regression shape (itd-d1-lab-mechanical.pdf's B-1/B-2 boilers):
// a schedule row's tag drawn TWICE on its own anchor plan sheet, in two
// REAL, physically incompatible drafting conventions — a small, independent
// "diagram" icon (here: a 3-segment triangle, standing in for a piping
// schematic's own standardized symbol) and a bigger, differently-shaped
// "to-scale" icon (here: a 5-segment house shape, standing in for an
// enlarged floor-plan equipment footprint). Neither marker recurs anywhere
// else on the sheet, and the two markers can never recur AS each other
// (different segment counts, different shapes) no matter which is tried as
// anchor or how far the pad widens — sweepScheduleRow must still resolve
// the row to its one real, singly-installed instance, disclosed as
// uncorroborated, rather than refuse.
//
//   node scripts/make-scheduledrow-multiconvention-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "schedule-row-multiconvention.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
function place(segs, [px, py]) {
  const out = [];
  for (const [ax, ay, bx, by] of segs) {
    out.push(`${fmt(ax + px)} ${fmt(ay + py)} m ${fmt(bx + px)} ${fmt(by + py)} l S`);
  }
  return out;
}
// 3-segment triangle — the "schematic icon" convention.
const TRIANGLE = [[0, 0, 24, 0], [24, 0, 12, 20], [12, 20, 0, 0]];
// 5-segment house (square base + peaked roof) — the "to-scale plan symbol"
// convention. Different segment count AND shape from TRIANGLE — matchSymbol
// can never score these as the same marker under any rotation/mirror.
const HOUSE = [[0, 0, 20, 0], [20, 0, 20, 14], [20, 14, 10, 24], [10, 24, 0, 14], [0, 14, 0, 0]];

const title = (text) => `BT /F1 14 Tf 40 580 Td (${text}) Tj ET`;
const tagText = (tag, [cx, cy]) => `BT /F1 10 Tf ${fmt(cx - 5.8)} ${fmt(cy - 16)} Td (${tag}) Tj ET`;
const cell = (text, x, y) => `BT /F1 9 Tf ${fmt(x)} ${fmt(y)} Td (${text}) Tj ET`;

const PAGES = [
  // page 1 — MECHANICAL PLAN (plan role): the tag's own two real, drawn,
  // physically-incompatible occurrences.
  [
    title("MECHANICAL PLAN"),
    "1 w",
    "30 30 552 552 re S",
    "0.5 w",
    ...place(TRIANGLE, [150, 400]), tagText("M-1", [162, 400]),
    ...place(HOUSE, [400, 200]), tagText("M-1", [410, 200]),
  ],
  // page 2 — FINISH SCHEDULE (schedule role): the row. Column vocabulary
  // (CODE/MATERIAL/DESCRIPTION) and title match the proven-working
  // symbol-set.pdf fixture's own schedule page exactly — only the tag/cell
  // text differs — so table discovery is not itself under test here.
  [
    title("FINISH SCHEDULE"),
    cell("CODE", 60, 540), cell("MATERIAL", 200, 540), cell("DESCRIPTION", 400, 540),
    cell("M-1", 60, 515), cell("STEEL", 200, 515), cell("PACKAGED MECHANICAL UNIT", 400, 515),
    cell("M-2", 60, 490), cell("STEEL", 200, 490), cell("PACKAGED MECHANICAL UNIT", 400, 490),
    cell("M-9", 60, 465), cell("STEEL", 200, 465), cell("NOT DRAWN ON PLANS", 400, 465),
  ],
];

const objects = [
  `<< /Type /Catalog /Pages 2 0 R >>`,
  `<< /Type /Pages /Kids [${PAGES.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${PAGES.length} >>`,
  `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
];
for (let i = 0; i < PAGES.length; i++) {
  const stream = PAGES[i].join("\n");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 612] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  );
}

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
