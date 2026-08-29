// Generates test/fixtures/valve-precision.pdf — a real-domain precision
// fixture for symbol_sweep (maturity plan Phase 1, step 4): two real,
// visually-similar-but-functionally-different valve symbols side by side,
// sharing a common bowtie body and differing in exactly ONE segment (a
// straight rising stem vs. a diagonal lever handle) — a genuinely different
// shape from the existing symbol-plan.pdf/#259 fixture's decoy relationship
// (there, one shape is a strict SUBSET of the other, needing an explicit
// counter-example to disambiguate; here, neither symbol is a subset of the
// other — the test is whether scoring ALONE, with no counter-example, keeps
// two close-but-distinct real device types apart).
// Deterministic byte output; re-run only to change the fixture:
//   node scripts/make-valve-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "valve-precision.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const seg = (ax, ay, bx, by) => `${fmt(ax)} ${fmt(ay)} m ${fmt(bx)} ${fmt(by)} l S`;

// The shared bowtie body: two triangles meeting at the center apex (12,7),
// local pt, y up. Real, standard valve-body-symbol convention.
function bowtie(px, py) {
  return [
    seg(px + 0, py + 0, px + 12, py + 7),
    seg(px + 12, py + 7, px + 0, py + 14),
    seg(px + 0, py + 14, px + 0, py + 0),
    seg(px + 24, py + 0, px + 12, py + 7),
    seg(px + 12, py + 7, px + 24, py + 14),
    seg(px + 24, py + 14, px + 24, py + 0),
  ];
}
// GATE VALVE: bowtie + a straight rising stem from the apex.
function gateValve(px, py) {
  return [...bowtie(px, py), seg(px + 12, py + 7, px + 12, py - 6)];
}
// BALL VALVE: the identical bowtie + a diagonal lever handle from the same
// apex — same segment COUNT (7) and roughly the same reach, differing from
// the gate valve in exactly one segment's direction.
function ballValve(px, py) {
  return [...bowtie(px, py), seg(px + 12, py + 7, px + 19, py - 2)];
}

const content = [
  "1 w",
  "40 40 480 480 re S",   // border — long segments, never a symbol match
  "0.5 w",
  ...gateValve(100, 100),   // seed A
  ...gateValve(200, 100),   // identical
  ...gateValve(300, 100),   // identical
  ...ballValve(150, 220),   // seed B — side by side with the gate cluster
  ...ballValve(250, 220),   // identical
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
