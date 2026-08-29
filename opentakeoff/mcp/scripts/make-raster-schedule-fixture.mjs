// Generates test/fixtures/raster-schedule.pdf — the accuracy-hardening
// plan's own real, confirmed finding (weld-county-permit's densest schedule
// sheets are pasted-in raster images, not real text) as a committed,
// deterministic regression lock, mirroring make-mep-fixture.mjs's own raw-PDF
// convention (no external library, hand-built objects, one latin1 string,
// stable byte output).
//
// Two pages:
//   page 1 (plan role) — real text "MECHANICAL PLAN" so ensureGraph() has a
//     plan sheet to work with; otherwise irrelevant to this fixture's own test.
//   page 2 (schedule role, the real test subject) — one small real text run
//     "EQUIPMENT SCHEDULE" (title-matches SCHEDULE_TITLE_RE, role: schedule)
//     and NOTHING else real: a single large embedded raster image (a plain
//     gray fill — the actual pixel content is irrelevant, what matters is
//     its PLACED AREA) covers most of the page, exactly the real shape
//     confirmed on weld-county-permit's own sheets (image area >>
//     RASTER_MIN_IMG_FRAC, zero real table text for sheetgraph.ts to read).
//
//   node scripts/make-raster-schedule-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "raster-schedule.pdf");

const W = 600, H = 400;
// a tiny 2x2 DeviceGray raw image — content is irrelevant, only its PLACED
// area (via the content stream's own `cm` scale) matters for imageArea
const imgData = "\xC8\xC8\xC8\xC8"; // 2x2, 1 byte/px, mid-gray, latin1-safe

const page1Content = `BT /F1 18 Tf 40 ${H - 60} Td (MECHANICAL PLAN) Tj ET`;
// image placed at (50,50) sized 500x300 of the 600x400 page = 62.5% coverage,
// comfortably past RASTER_MIN_IMG_FRAC (0.10); text sits clear of the image
const page2Content = `BT /F1 18 Tf 40 ${H - 30} Td (EQUIPMENT SCHEDULE) Tj ET\nq 500 0 0 300 50 50 cm /Im1 Do Q`;

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>`,
  `<< /Length ${page1Content.length} >>\nstream\n${page1Content}\nendstream`,
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> >>`,
  `<< /Length ${page2Content.length} >>\nstream\n${page2Content}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imgData.length} >>\nstream\n${imgData}\nendstream`,
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

mkdirSync(FIXTURES, { recursive: true });
writeFileSync(OUT, pdf, "latin1");
console.log(`wrote ${OUT} (${pdf.length} bytes)`);
