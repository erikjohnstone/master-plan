// The production routes spool each upload by its bytes' sha256, so a plan set
// opened twice under two names reached the CLI as one path twice, and a
// Session cannot load a path twice: every production read of that canvas
// (sheet graph, compiles, sweeps, assemblies) failed with a stack trace naming
// a hash. The same document is read once (onePathPerDocument).
import { test } from "node:test";
import assert from "node:assert/strict";
import { onePathPerDocument } from "../vite.corpusTakeoffApi.js";

const A = "/spool/aaa.pdf", B = "/spool/bbb.pdf";

test("distinct documents pass through untouched, in order", () => {
  const symbol = { pdfIndex: 1, page: 3 };
  assert.deepEqual(onePathPerDocument([A, B], ["mech.pdf", "elec.pdf"], symbol),
    { pdfPaths: [A, B], fileNames: ["mech.pdf", "elec.pdf"], symbol: { pdfIndex: 1, page: 3 } });
  assert.deepEqual(onePathPerDocument([A], ["mech.pdf"]), { pdfPaths: [A], fileNames: ["mech.pdf"], symbol: null });
});

test("the same bytes under two names are one document, under the last name sent", () => {
  // The browser maps a sha to the last name it sent (buildProductionFormData),
  // so the server keeps that one too.
  assert.deepEqual(onePathPerDocument([A, A], ["set.pdf", "set (1).pdf"]),
    { pdfPaths: [A], fileNames: ["set (1).pdf"], symbol: null });
  assert.deepEqual(onePathPerDocument([A, B, A], ["set.pdf", "elec.pdf", "set (1).pdf"]),
    { pdfPaths: [A, B], fileNames: ["set (1).pdf", "elec.pdf"], symbol: null });
});

test("a symbol sweep keeps the name of the file it swept, and its index follows the path", () => {
  const seed = { page: 2, seedRect: [0, 0, 10, 10], scope: "sheet" };
  // Swept on the second copy: its index moves to the one path, its name kept.
  assert.deepEqual(onePathPerDocument([A, B, A], ["set.pdf", "elec.pdf", "set (1).pdf"], { ...seed, pdfIndex: 2 }),
    { pdfPaths: [A, B], fileNames: ["set (1).pdf", "elec.pdf"], symbol: { ...seed, pdfIndex: 0 } });
  // Swept on the first copy: its name wins over the later one, so the results
  // land on the sheet the estimator is on.
  assert.deepEqual(onePathPerDocument([A, B, A], ["set.pdf", "elec.pdf", "set (1).pdf"], { ...seed, pdfIndex: 0 }),
    { pdfPaths: [A, B], fileNames: ["set.pdf", "elec.pdf"], symbol: { ...seed, pdfIndex: 0 } });
  // A file after a dropped copy moves up one place.
  assert.deepEqual(onePathPerDocument([A, A, B], ["set.pdf", "set (1).pdf", "elec.pdf"], { ...seed, pdfIndex: 2 }).symbol,
    { ...seed, pdfIndex: 1 });
  // An index the request does not hold is left for the CLI to refuse.
  assert.deepEqual(onePathPerDocument([A, A], ["set.pdf", "set (1).pdf"], { ...seed, pdfIndex: 5 }).symbol,
    { ...seed, pdfIndex: 5 });
});
