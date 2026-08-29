// Mark identity — short-mark overcount, twin-alias double-count, shared
// bare marks. Synthetic spans only: the rule is the shape of the identity,
// not a corpus filename or a tag that happened to fail on one job.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markKey, marksEqual, dedupeMarks, spanAnswersFor, pickMarkHits, MARK_CLUSTER_K,
} from "../src/lib/markid.ts";

const box = (str: string, x0: number, y0: number, w = str.length * 5, h = 8) =>
  ({ str, x0, y0, x1: x0 + w, y1: y0 + h });

test("markKey: hyphen and space are drafting variation, digits are identity", () => {
  assert.equal(markKey("P-1"), "P1");
  assert.equal(markKey("P1"), "P1");
  assert.equal(markKey("p 1"), "P1");
  assert.equal(markKey("US-2"), "US2");
  assert.equal(markKey("US2"), "US2");
  assert.notEqual(markKey("P1"), markKey("P10"));
  assert.notEqual(markKey("US-2"), markKey("US-21"));
  assert.notEqual(markKey("P1"), markKey("P1A"));
  assert.equal(marksEqual("P-1", "P1"), true);
  assert.equal(marksEqual("P-1", "P-1"), true);
  assert.equal(marksEqual("P1", "P10"), false);
  assert.equal(marksEqual("S1", "S"), false);
});

test("dedupeMarks: hyphen twins collapse, first spelling wins", () => {
  assert.deepEqual(dedupeMarks(["P-1", "P1", "P-1", "P10"]), ["P-1", "P10"]);
  assert.deepEqual(dedupeMarks(["P1", "P-1"]), ["P1"]);
  assert.deepEqual(dedupeMarks(["R1 / E1".split("/")[0]!, "R1"]), ["R1"]);
});

test("spanAnswersFor: exact alias answers; a longer prefix-extension never does", () => {
  const vocab = ["P-1", "P10", "P1A", "P2"];
  assert.equal(spanAnswersFor("P-1", "P1", vocab), true);
  assert.equal(spanAnswersFor("P1", "P-1", vocab), true);
  assert.equal(spanAnswersFor("P 1", "P-1", vocab), true);
  // short-mark overcount: the short want must not claim the longer marks
  assert.equal(spanAnswersFor("P10", "P1", vocab), false);
  assert.equal(spanAnswersFor("P1A", "P1", vocab), false);
  assert.equal(spanAnswersFor("P11", "P1", vocab), false);
  assert.equal(spanAnswersFor("P2", "P1", vocab), false);
  // and the longer mark still answers for itself
  assert.equal(spanAnswersFor("P10", "P10", vocab), true);
  assert.equal(spanAnswersFor("P1A", "P1A", vocab), true);
});

test("spanAnswersFor: a shared bare mark never auto-resolves to a qualified sibling", () => {
  const shared = ["ET-1", "ET-2"];
  // two real devices, one bare family name — the span answers for nobody
  assert.equal(spanAnswersFor("ET", "ET-1", shared), false);
  assert.equal(spanAnswersFor("ET", "ET-2", shared), false);
  assert.equal(spanAnswersFor("ET", "ET", ["ET", "ET-1", "ET-2"]), false);
  // the qualified labels still answer for themselves
  assert.equal(spanAnswersFor("ET-1", "ET-1", shared), true);
  assert.equal(spanAnswersFor("ET-2", "ET-2", shared), true);
  assert.equal(spanAnswersFor("ET1", "ET-1", shared), true);
});

test("spanAnswersFor: a UNIQUE bare prefix of one qualified mark may resolve", () => {
  const unique = ["WH-1"];
  assert.equal(spanAnswersFor("WH", "WH-1", unique), true);
  // but not when a second sibling appears
  assert.equal(spanAnswersFor("WH", "WH-1", ["WH-1", "WH-2"]), false);
});

test("pickMarkHits: twin-alias spellings on ONE device collapse to one hit", () => {
  // CAD often emits both "P-1" and "P1" a few px apart on the same unit
  const spans = [
    box("P-1", 100, 100),
    box("P1", 108, 100),          //  ~center 8 px from the first, well inside 2.2×h
  ];
  const hits = pickMarkHits(spans, "P-1", ["P-1"]);
  assert.equal(hits.length, 1, "one device, one count — the alias twin is not a second instance");
  assert.equal(hits[0].text, "P-1", "the longer original spelling survives the cluster");
});

test("pickMarkHits: far-apart alias spellings stay two instances", () => {
  // two devices, one labeled P-1 and one labeled P1, several units apart
  const spans = [
    box("P-1", 100, 100),
    box("P1", 400, 100),
  ];
  const hits = pickMarkHits(spans, "P1", ["P-1", "P1"]);
  assert.equal(hits.length, 2, "two devices, two counts");
});

test("pickMarkHits: a short mark does not harvest its longer neighbors", () => {
  // P1, P10, P11, P1A on one sheet — counting P1 must return only P1
  const spans = [
    box("P1", 100, 100),
    box("P10", 200, 100),
    box("P11", 300, 100),
    box("P1A", 400, 100),
    box("P-1", 108, 100),         // twin alias of the first P1, same device
  ];
  const vocab = ["P1", "P10", "P11", "P1A"];
  const p1 = pickMarkHits(spans, "P1", vocab);
  assert.equal(p1.length, 1, "P1 counts once; P10/P11/P1A are not P1, and the P-1 twin collapsed");
  assert.equal(pickMarkHits(spans, "P10", vocab).length, 1);
  assert.equal(pickMarkHits(spans, "P11", vocab).length, 1);
  assert.equal(pickMarkHits(spans, "P1A", vocab).length, 1);
});

test("pickMarkHits: shared bare family name is not auto-assigned", () => {
  const spans = [
    box("ET", 100, 100),
    box("ET", 300, 100),
    box("ET-1", 500, 100),
    box("ET-2", 700, 100),
  ];
  const vocab = ["ET-1", "ET-2"];
  assert.equal(pickMarkHits(spans, "ET-1", vocab).length, 1, "only the qualified ET-1 label counts");
  assert.equal(pickMarkHits(spans, "ET-2", vocab).length, 1, "only the qualified ET-2 label counts");
  assert.equal(pickMarkHits(spans, "ET", ["ET", ...vocab]).length, 0,
    "the two bare ET spans stay unresolved — they are shared, not a third mark");
});

test("MARK_CLUSTER_K is the label-adjacency constant, not a looser net", () => {
  // a hit 3× text-height away must NOT cluster (that is a second instance)
  const h = 8;
  const spans = [
    box("US-2", 0, 0, 20, h),
    box("US2", 0, 3 * h, 16, h),
  ];
  const hits = pickMarkHits(spans, "US-2", ["US-2"]);
  assert.equal(hits.length, 2);
  assert.ok(3 > MARK_CLUSTER_K, "the far pair is outside the cluster radius by construction");
});
