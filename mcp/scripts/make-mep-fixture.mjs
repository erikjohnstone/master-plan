// Generates test/fixtures/mep-plan.pdf and test/fixtures/mep-layered-plan.pdf
// — the MEP connectivity fixtures for the maturity plan's Phase 4 (mirrors
// make-symbol-fixture.mjs / make-layered-fixture.mjs / make-valve-fixture.mjs's
// own conventions exactly: a raw, hand-built PDF, deterministic byte output,
// re-run only to change the fixture).
//
//   node scripts/make-mep-fixture.mjs
//
// mep-plan.pdf (800×600 pt, no PDF layers — the real Bessemer sample's own
// "layer_signal: none" case, deliberately): five named scenarios from the
// plan doc's own §5 test strategy, side by side, non-overlapping:
//
//   STRAIGHT RUN (y=500)   a single run, one equipment at its far end.
//   T-BRANCH (y=400)       a real mid-edge junction (a vertical stub touches
//                          the horizontal run's own midpoint) reaching TWO
//                          different equipment — the ambiguous case.
//   GAP + FITTING (y=200)  two dead-end run-ends with a real drawn gap
//                          between them, a small diamond "fitting" glyph
//                          sitting IN the gap — the bridging case.
//   DEAD END (y=100)       a stub that reaches no equipment at all.
//   UNRELATED CROSSING     a vertical run crossing a horizontal run at a
//   (x=300, y=300)         true interior intersection (not a shared
//                          endpoint) — JTS's own noding SPLITS both lines
//                          there into a real 4-way junction, so the trace
//                          reaches equipment on BOTH runs as if they
//                          connected. This is a REAL, DISCLOSED, NOT-YET-
//                          SOLVED limitation (maturity plan §6 risk #2 /
//                          known-gaps ledger item 22) — real ducts/pipes at
//                          different elevations legitimately cross without
//                          connecting, and this module has no elevation
//                          signal to tell the two cases apart. The fixture
//                          pins the CURRENT behavior so a future fix to #22
//                          changes an asserted number here, not a silent one.
//   WALL CONFLATION        a real, closed 150×100pt wall rectangle drawn at
//   (x=550-700, y=350-450) the sheet's own heaviest pen (1w, same tier as
//                          the border) — the accuracy-hardening plan's own
//                          Phase 2 case. Two ordinary-weight duct stubs
//                          (0.5w) each touch the wall at a real mid-edge
//                          T-junction (top and bottom), with one equipment
//                          placement at each stub's own far end. On an
//                          unlayered sheet, before Phase 2's fix, the ONLY
//                          path between the two stubs was straight through
//                          the wall's own 4 edges — a real, measured false
//                          "reached" (mirroring the real Bessemer EF-1 case,
//                          known-gaps ledger item 24). After the fix
//                          (wallnetwork.ts's own geometric wall-vouching
//                          folded into excludeSegs whenever layerSignal
//                          isn't "strong"), the wall is excluded and each
//                          stub reaches only its own equipment, correctly
//                          dead-ending toward the other one.
//
// mep-layered-plan.pdf (400×300 pt): the same OCG BDC/EMC technique as
// make-layered-fixture.mjs, real MEP-system layer names (M-DUCT / P-PIPE) —
// the "layer_signal: strong" counterpart, proving system-tag attribution
// survives a real PDF layer round-trip, not just a synthetic segment array.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

const fmt = (v) => (Math.round(v * 100) / 100).toString();
const seg = (ax, ay, bx, by) => `${fmt(ax)} ${fmt(ay)} m ${fmt(bx)} ${fmt(by)} l S`;

function writePdf(out, content, { w, h, ocgObjects, ocProperties, resources } = {}) {
  const objects = [
    ocProperties
      ? `<< /Type /Catalog /Pages 2 0 R /OCProperties ${ocProperties} >>`
      : "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources ${resources ?? "<< >>"} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...(ocgObjects ?? []),
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
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf, "latin1");
  console.log(`wrote ${out} (${pdf.length} bytes)`);
}

// ── mep-plan.pdf (plain, layer_signal: none) ────────────────────────────
{
  const PAGE_W = 800, PAGE_H = 600;
  // a small diamond "fitting" glyph, centered at (cx, cy), never touching
  // the gap's own dangling endpoints exactly (a real fitting symbol sits
  // OVER the gap, its own linework distinct from the run it bridges).
  const fitting = (cx, cy, r = 4) => [
    seg(cx - r, cy, cx, cy + r), seg(cx, cy + r, cx + r, cy),
    seg(cx + r, cy, cx, cy - r), seg(cx, cy - r, cx - r, cy),
  ];

  const content = [
    "1 w",
    "10 10 780 580 re S",   // border — long segments, never a symbol/run match
    "0.5 w",
    // STRAIGHT RUN — AHU-1 at its far end
    seg(50, 500, 250, 500),
    // T-BRANCH — a real mid-edge junction at (150, 400); VAV-1 continues the
    // horizontal run, VAV-2 sits at the end of the vertical stub
    seg(50, 400, 250, 400),
    seg(150, 400, 150, 320),
    // GAP + FITTING — two dead-end runs 20pt apart at y=200, a fitting glyph
    // centered in the gap; AHU-2 at the far end
    seg(50, 200, 140, 200),
    seg(160, 200, 260, 200),
    ...fitting(150, 200),
    // DEAD END — reaches nothing
    seg(50, 100, 150, 100),
    // UNRELATED CROSSING — a true interior intersection at (300, 300):
    // PANEL-1 at the vertical run's far end, AHU-3 at the horizontal run's
    // far end (see the header comment above — this is a real, disclosed,
    // NOT-YET-SOLVED limitation, pinned here on purpose)
    seg(300, 450, 300, 50),
    seg(250, 300, 450, 300),
    // WALL CONFLATION (accuracy-hardening plan Phase 2) — a real, closed
    // wall rectangle at the sheet's own heaviest pen (1w, same tier as the
    // border), with two ordinary-weight (0.5w) duct stubs each touching it
    // at a real mid-edge T-junction — top wall at (625,350), bottom wall at
    // (625,450). EQ-TOP sits at the top stub's own far end (625,300),
    // EQ-BOTTOM at the bottom stub's own far end (625,500). Before Phase
    // 2's fix, seeding on either stub reached the OTHER stub's equipment
    // straight through the wall's own 4 edges; after it, the wall is
    // excluded and each stub dead-ends toward the other.
    "1 w",
    "550 350 150 100 re S",
    "0.5 w",
    seg(625, 350, 625, 300),   // top stub — EQ-TOP at its far end
    seg(625, 450, 625, 500),   // bottom stub — EQ-BOTTOM at its far end
  ].join("\n");

  writePdf(join(FIXTURES, "mep-plan.pdf"), content, { w: PAGE_W, h: PAGE_H });
}

// ── mep-layered-plan.pdf (OCG, layer_signal: strong) ────────────────────
// M-DUCT (ductwork) carries a straight run; P-PIPE (piping) carries a stub
// touching that run's own midpoint — the same system-survives-a-split shape
// web/test/mepconnectivity.test.ts already pins at the segment-array level,
// here proven through a REAL PDF layer round-trip (pdf.js OCG extraction,
// not a hand-built layerOf array).
{
  const content = [
    "/OC /oc1 BDC",
    "0.5 w",
    "40 150 m 360 150 l S",
    "EMC",
    "/OC /oc2 BDC",
    "0.5 w",
    "200 150 m 200 250 l S",
    "EMC",
  ].join("\n");
  const ocProperties = "<< /OCGs [5 0 R 6 0 R] /D << /Order [5 0 R 6 0 R] >> >>";
  const resources = "<< /Properties << /oc1 5 0 R /oc2 6 0 R >> >>";
  const ocgObjects = [
    "<< /Type /OCG /Name (M-DUCT) >>",
    "<< /Type /OCG /Name (P-PIPE) >>",
  ];
  writePdf(join(FIXTURES, "mep-layered-plan.pdf"), content, { w: 400, h: 300, ocProperties, resources, ocgObjects });
}
