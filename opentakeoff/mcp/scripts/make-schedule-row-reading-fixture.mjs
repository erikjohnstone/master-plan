// Generates test/fixtures/schedule-row-reading.pdf — the plan sweep's rows
// that answer by neither their key nor their printed identity (AS-89): split
// system schedules keyed by the indoor unit's MARK (DAC-1, AC-2) whose TAG
// column names the condensing unit (DCU-1, DCU-2) — 03_FL and 22_GA print it
// as OUTDOOR UNIT MARK, which the text-layer extractor labels by its
// vocabulary word alone, so the fixture prints the other name of a mark
// column the family reads (AS-84) — and a FAN SCHEDULE row naming a range
// (EF-1 - EF-3, as 013_MO prints CV-7 - CV-10). On the MECHANICAL PLAN the
// indoor unit DAC-1 is drawn with the SAME triangle marker as DCU-1, AC-2
// with a house, EF-2 with a hexagon, and bare "D" and "DCU" callouts, the
// condensing units' letters alone; DCU-2 is drawn nowhere. A sweep of DCU-2
// must refuse rather than count AC-2; DCU-1 is never counted or corroborated
// by its indoor unit's tag, nor answered by a callout another scheduled mark
// shares (03_FL's plans print bare "D" 37 times beside its one DCU-1). EF-3
// is drawn with the triangle too: a match labeled with a unit only the
// reading names is that unit's, never DCU-1's.
//
// And test/fixtures/schedule-row-reading-groups.pdf: two buildings' split
// system schedules under one title (BLDG A / BLDG B - HVAC SCHEDULES), each
// naming DCU-1 in its TAG column; DCU-1 is drawn on BLDG A's plan only, its
// indoor unit DAC-1 on BLDG B's: each building's row counts its own
// building's plans, and BLDG B's DCU-1 is drawn nowhere.
//
// And test/fixtures/schedule-bare-prefix.pdf: a drawn span other than a
// mark itself (a bare prefix) told apart from every mark the set schedules
// (AS-90). The one-row BOILER SCHEDULE's B-1 is tagged on the plan as 03_FL
// tags its boiler, "B" over "1" on two lines under the unit's symbol, and
// bare "B" callouts stand elsewhere, as 03_FL's plans print "B" nine times;
// the PUMP SCHEDULE's BP-1 also begins with B. Its CP-1 is tagged "CP" over
// "1", letters no other scheduled mark begins with: the tag is the whole
// stack, never its top line. The one-row EXPANSION TANK SCHEDULE's ET-1 is
// tagged "ET" alone, a shorthand no other scheduled mark shares, and the AIR
// DEVICE SCHEDULE's bare type mark S is drawn as printed although the PUMP
// SCHEDULE's SP-1 begins with S.
//
// And test/fixtures/schedule-bare-landmarks.pdf: one plan view whose column
// grid letters A to D are drawn at both ends of each grid line, on both
// halves of the sheet, and a MECHANICAL EQUIPMENT SCHEDULE whose marks each
// begin with one of those letters, no other scheduled mark with the same
// (AC-1, B-1, CU-1, DP-1). Looked up with no vocabulary, each letter stood
// for the mark it begins, and the letters' pairs across the halves read as a
// second view of the same area registered beside the first, so one of three
// RG-1 return grilles was dropped as its repeat, as on 031_MO's first floor
// plan; and a grid letter is no unit's tag, though B-1's family is written
// with it alone (AS-90).
//
//   node scripts/make-schedule-row-reading-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const OUT = join(FIXTURES, "schedule-row-reading.pdf");
const OUT_GROUPS = join(FIXTURES, "schedule-row-reading-groups.pdf");
const OUT_BARE = join(FIXTURES, "schedule-bare-prefix.pdf");
const OUT_LANDMARKS = join(FIXTURES, "schedule-bare-landmarks.pdf");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
function place(segs, [px, py]) {
  const out = [];
  for (const [ax, ay, bx, by] of segs) {
    out.push(`${fmt(ax + px)} ${fmt(ay + py)} m ${fmt(bx + px)} ${fmt(by + py)} l S`);
  }
  return out;
}
const TRIANGLE = [[0, 0, 24, 0], [24, 0, 12, 20], [12, 20, 0, 0]];
const HOUSE = [[0, 0, 20, 0], [20, 0, 20, 14], [20, 14, 10, 24], [10, 24, 0, 14], [0, 14, 0, 0]];
const HEXAGON = [[6, 0, 18, 0], [18, 0, 24, 10], [24, 10, 18, 20], [18, 20, 6, 20], [6, 20, 0, 10], [0, 10, 6, 0]];
const CROSSED_BOX = [[0, 0, 24, 0], [24, 0, 24, 24], [24, 24, 0, 24], [0, 24, 0, 0], [0, 0, 24, 24], [0, 24, 24, 0]];
const DIFFUSER = [[0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0], [0, 0, 20, 20]];
const OCTAGON = [[4, 0, 12, 0], [12, 0, 16, 4], [16, 4, 16, 12], [16, 12, 12, 16], [12, 16, 4, 16], [4, 16, 0, 12], [0, 12, 0, 4], [0, 4, 4, 0]];

const title = (text) => `BT /F1 14 Tf 40 580 Td (${text}) Tj ET`;
const tagText = (tag, [cx, cy]) => `BT /F1 10 Tf ${fmt(cx - 5.8)} ${fmt(cy - 16)} Td (${tag}) Tj ET`;
const cell = (text, x, y) => `BT /F1 9 Tf ${fmt(x)} ${fmt(y)} Td (${text}) Tj ET`;

const PAGES = [
  // page 1 — MECHANICAL PLAN (plan role)
  [
    title("MECHANICAL PLAN"),
    "1 w",
    "30 30 552 552 re S",
    "0.5 w",
    ...place(TRIANGLE, [120, 420]), tagText("DAC-1", [132, 420]),
    ...place(HOUSE, [260, 420]), tagText("AC-2", [270, 420]),
    ...place(TRIANGLE, [420, 160]), tagText("DCU-1", [432, 160]),
    ...place(HEXAGON, [150, 180]), tagText("EF-2", [162, 180]),
    ...place(TRIANGLE, [260, 160]), tagText("EF-3", [272, 160]),
    cell("D", 470, 300), cell("DCU", 470, 260),
  ],
  // page 2 — a split system (schedule role)
  [
    title("DUCTLESS SPLIT SYSTEM SCHEDULE"),
    cell("MARK", 50, 540), cell("TAG", 170, 540), cell("SEER", 300, 540), cell("REMARKS", 400, 540),
    cell("DAC-1", 50, 515), cell("DCU-1", 170, 515), cell("13", 300, 515), cell("WALL MOUNTED", 400, 515),
  ],
  // page 3 — the fans (schedule role)
  [
    title("FAN SCHEDULE"),
    cell("MARK", 50, 540), cell("CFM", 200, 540), cell("HP", 280, 540), cell("VOLTAGE", 340, 540), cell("SERVICE", 440, 540),
    cell("EF-1 - EF-3", 50, 515), cell("200", 200, 515), cell("1/4", 280, 515), cell("120", 340, 515), cell("TOILET EXHAUST", 440, 515),
    cell("EF-4", 50, 490), cell("400", 200, 490), cell("1/2", 280, 490), cell("120", 340, 490), cell("JANITOR EXHAUST", 440, 490),
  ],
  // page 4 — another split system (schedule role)
  [
    title("SPLIT SYSTEM AIR CONDITIONING SCHEDULE"),
    cell("MARK", 50, 540), cell("TAG", 170, 540), cell("SEER", 300, 540), cell("REMARKS", 400, 540),
    cell("AC-2", 50, 515), cell("DCU-2", 170, 515), cell("14", 300, 515), cell("CEILING MOUNTED", 400, 515),
  ],
];

function writePdf(out, pages) {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  for (let i = 0; i < pages.length; i++) {
    const stream = pages[i].join("\n");
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
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf, "latin1");
  console.log(`wrote ${out} (${pdf.length} bytes)`);
}

// Two buildings, one schedule title: BLDG A draws DCU-1, BLDG B its DAC-1.
const splitSchedule = (building) => [
  title(`${building} - HVAC SCHEDULES`),
  `BT /F1 12 Tf 40 555 Td (DUCTLESS SPLIT SYSTEM SCHEDULE) Tj ET`,
  cell("MARK", 50, 520), cell("TAG", 170, 520), cell("SEER", 300, 520), cell("REMARKS", 400, 520),
  cell("DAC-1", 50, 495), cell("DCU-1", 170, 495), cell("13", 300, 495), cell("WALL MOUNTED", 400, 495),
];
const GROUP_PAGES = [
  [title("BLDG A - MECHANICAL PLAN"), "1 w", "30 30 552 552 re S", "0.5 w",
    ...place(TRIANGLE, [420, 160]), tagText("DCU-1", [432, 160])],
  [title("BLDG B - MECHANICAL PLAN"), "1 w", "30 30 552 552 re S", "0.5 w",
    ...place(HOUSE, [150, 300]), tagText("DAC-1", [160, 300])],
  splitSchedule("BLDG A"),
  splitSchedule("BLDG B"),
];

// A bare prefix another scheduled mark shares (AS-90): B-1 stacked "B" over
// "1", bare "B" callouts elsewhere, BP-1 scheduled too; ET-1 tagged "ET"
// alone; the air device type S drawn as printed, SP-1 scheduled too.
const stacked = (lines, [cx, cy]) => lines.map((line, i) => `BT /F1 10 Tf ${fmt(cx - 2.8 * line.length)} ${fmt(cy - 16 - 10.5 * i)} Td (${line}) Tj ET`);
const BARE_PAGES = [
  [
    title("MECHANICAL PLAN"),
    "1 w",
    "30 30 552 552 re S",
    "0.5 w",
    ...place(CROSSED_BOX, [120, 400]), ...stacked(["B", "1"], [132, 400]),
    ...place(HOUSE, [300, 400]), tagText("BP-1", [310, 400]),
    ...place(TRIANGLE, [300, 300]), ...stacked(["CP", "1"], [312, 300]),
    ...place(HEXAGON, [120, 200]), tagText("ET", [134, 200]),
    ...place(DIFFUSER, [300, 200]), tagText("S", [313, 200]),
    ...place(DIFFUSER, [400, 200]), tagText("S", [413, 200]),
    cell("B", 480, 480), cell("B", 480, 100),
  ],
  [
    title("BOILER SCHEDULE"),
    cell("MARK", 50, 540), cell("MBH", 170, 540), cell("FUEL", 280, 540), cell("REMARKS", 400, 540),
    cell("B-1", 50, 515), cell("399", 170, 515), cell("NATURAL GAS", 280, 515), cell("WALL HUNG", 400, 515),
  ],
  [
    title("PUMP SCHEDULE"),
    cell("MARK", 50, 540), cell("GPM", 200, 540), cell("HEAD", 280, 540), cell("HP", 360, 540), cell("SERVICE", 440, 540),
    cell("BP-1", 50, 515), cell("20", 200, 515), cell("30", 280, 515), cell("1/2", 360, 515), cell("BOILER", 440, 515),
    cell("SP-1", 50, 490), cell("10", 200, 490), cell("20", 280, 490), cell("1/3", 360, 490), cell("SUMP", 440, 490),
    cell("CP-1", 50, 465), cell("5", 200, 465), cell("10", 280, 465), cell("1/6", 360, 465), cell("CIRCULATOR", 440, 465),
  ],
  [
    title("EXPANSION TANK SCHEDULE"),
    cell("MARK", 50, 540), cell("GALLONS", 170, 540), cell("PSIG", 280, 540), cell("REMARKS", 400, 540),
    cell("ET-1", 50, 515), cell("15", 170, 515), cell("12", 280, 515), cell("DIAPHRAGM", 400, 515),
  ],
  [
    title("AIR DEVICE SCHEDULE"),
    cell("MARK", 50, 540), cell("CFM", 170, 540), cell("NECK SIZE", 280, 540), cell("TYPE", 400, 540),
    cell("S", 50, 515), cell("150", 170, 515), cell("8", 280, 515), cell("SUPPLY", 400, 515),
    cell("R", 50, 490), cell("150", 170, 490), cell("10X10", 280, 490), cell("RETURN", 400, 490),
  ],
];

// One view, grid letters at both ends of its grid lines (AS-90).
const bubble = (letter, [x, y]) => [...place(OCTAGON, [x, y]), `BT /F1 10 Tf ${fmt(x + 4.5)} ${fmt(y + 4.5)} Td (${letter}) Tj ET`];
const GRID = ["A", "B", "C", "D"].flatMap((letter, i) => [
  ...bubble(letter, [40, 470 - 80 * i]), ...bubble(letter, [556, 470 - 80 * i]),
  `0.2 w 56 ${478 - 80 * i} m 556 ${478 - 80 * i} l S 0.5 w`,
]);
const EQUIPMENT = [["AC-1", "AIR COMPRESSOR"], ["B-1", "BOILER"], ["CU-1", "CONDENSING UNIT"], ["DP-1", "DOMESTIC PUMP"]];
const LANDMARK_PAGES = [
  [
    title("MECHANICAL PLAN"),
    "1 w",
    "30 30 552 552 re S",
    "0.5 w",
    ...GRID,
    ...place(DIFFUSER, [150, 420]), tagText("RG-1", [160, 420]),
    ...place(DIFFUSER, [220, 300]), tagText("RG-1", [230, 300]),
    ...place(DIFFUSER, [450, 360]), tagText("RG-1", [460, 360]),
  ],
  [
    title("MECHANICAL EQUIPMENT SCHEDULE"),
    cell("MARK", 50, 540), cell("DESCRIPTION", 150, 540), cell("HP", 330, 540), cell("VOLTAGE", 400, 540),
    ...EQUIPMENT.flatMap(([mark, what], i) => [cell(mark, 50, 515 - 25 * i), cell(what, 150, 515 - 25 * i), cell("1", 330, 515 - 25 * i), cell("208", 400, 515 - 25 * i)]),
  ],
  [
    title("AIR DEVICE SCHEDULE"),
    cell("MARK", 50, 540), cell("CFM", 170, 540), cell("NECK SIZE", 280, 540), cell("TYPE", 400, 540),
    cell("RG-1", 50, 515), cell("300", 170, 515), cell("12X12", 280, 515), cell("RETURN", 400, 515),
    cell("SG-1", 50, 490), cell("150", 170, 490), cell("8", 280, 490), cell("SUPPLY", 400, 490),
  ],
];

writePdf(OUT, PAGES);
writePdf(OUT_GROUPS, GROUP_PAGES);
writePdf(OUT_BARE, BARE_PAGES);
writePdf(OUT_LANDMARKS, LANDMARK_PAGES);
