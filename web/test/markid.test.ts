// Mark identity — short-mark overcount, twin-alias double-count, shared
// bare marks. Synthetic spans only: the rule is the shape of the identity,
// not a corpus filename or a tag that happened to fail on one job.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markKey, marksEqual, dedupeMarks, spanAnswersFor, pickMarkHits, compoundTagOcc, MARK_CLUSTER_K,
  isRoutingPhrase, isRoutingLabelOcc, ROUTING_LABEL_RADIUS_K,
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

test("compoundTagOcc: key plus slash or whitespace then more text in the same run", () => {
  assert.equal(compoundTagOcc("R1 /C-11", "R1"), true);
  assert.equal(compoundTagOcc("R1/C-11", "R1"), true);
  assert.equal(compoundTagOcc("R1 C-11", "R1"), true);
  assert.equal(compoundTagOcc("R-1 / C-11", "R1"), true);
  assert.equal(compoundTagOcc("r1 /c-11", "R-1"), true);
  // exact equality is not a compound — the alias path owns it
  assert.equal(compoundTagOcc("R1", "R1"), false);
  assert.equal(compoundTagOcc("R-1", "R1"), false);
});

test("compoundTagOcc: a dotted numeric suffix is a sheet number, not the key", () => {
  assert.equal(compoundTagOcc("S3.1", "S3"), false);
  assert.equal(compoundTagOcc("P1.01", "P1"), false);
  assert.equal(compoundTagOcc("M2.3", "M2"), false);
  assert.equal(compoundTagOcc("S3 .1", "S3"), false);
});

test("compoundTagOcc: any other non-alnum remainder is not a compound hit", () => {
  assert.equal(compoundTagOcc("P10", "P1"), false);
  assert.equal(compoundTagOcc("P1A", "P1"), false);
  assert.equal(compoundTagOcc("P1A", "P-1"), false);
  assert.equal(compoundTagOcc("S3:1", "S3"), false);
  assert.equal(compoundTagOcc("S3_1", "S3"), false);
  assert.equal(compoundTagOcc("R1/", "R1"), false);
  assert.equal(compoundTagOcc("R1 /", "R1"), false);
  assert.equal(compoundTagOcc("R1 /...", "R1"), false);
});

test("compoundTagOcc: a work-note sentence is not a compound instance", () => {
  assert.equal(compoundTagOcc("CUH-T1 ON FLOOR 3; CUH-T2 ON FLOOR 5.", "CUH-T1"), false);
  assert.equal(compoundTagOcc("SEE CUH-T1 FOR LOCATION", "CUH-T1"), false);
  assert.equal(compoundTagOcc("R1 /C-11", "R1"), true, "circuit remainder still counts");
});

test("spanAnswersFor / pickMarkHits: a compound run counts as the leading key", () => {
  const vocab = ["R1", "C-11", "S3"];
  assert.equal(spanAnswersFor("R1 /C-11", "R1", vocab), true);
  assert.equal(spanAnswersFor("S3.1", "S3", vocab), false);
  assert.equal(spanAnswersFor("P1.01", "P1", ["P1"]), false);
  const spans = [
    box("R1 /C-11", 100, 100),
    box("S3.1", 300, 100),
    box("R1", 500, 100),
  ];
  assert.equal(pickMarkHits(spans, "R1", vocab).length, 2, "compound run and the bare R1 are two instances");
  assert.equal(pickMarkHits(spans, "S3", vocab).length, 0, "sheet number S3.1 is not an S3 instance");
});

test("isRoutingPhrase: destination/source callouts, not quantity notes or long sentences", () => {
  assert.equal(isRoutingPhrase("DUCT DOWN TO"), true);
  assert.equal(isRoutingPhrase("36x16 RETURN DUCT DOWN TO"), true);
  assert.equal(isRoutingPhrase("SA PIPE TO"), true);
  assert.equal(isRoutingPhrase("DOWN TO"), true);
  assert.equal(isRoutingPhrase("FROM"), true);
  assert.equal(isRoutingPhrase("RETURN TO"), true);
  assert.equal(isRoutingPhrase("36x16 RETURN"), false, "a duct size without TO is not a destination");
  assert.equal(isRoutingPhrase("UP TO 200 CFM"), false, "a quantity cap is not a destination");
  assert.equal(isRoutingPhrase("TO BUILDING AUTOMATION"), false);
  assert.equal(isRoutingPhrase("TYP OF 2"), false);
  assert.equal(isRoutingPhrase("AHU-1"), false);
});

test("isRoutingLabelOcc: a nearby destination phrase attaches; a room-away one does not", () => {
  const tag = { cx: 100, cy: 100, h: 10 };
  const near = [box("AHU-1", 95, 95, 10, 10), box("DUCT DOWN TO", 100, 100 + 2 * 10, 40, 10)];
  assert.equal(isRoutingLabelOcc(near, tag), true);
  const far = [box("AHU-1", 95, 95, 10, 10), box("DUCT DOWN TO", 100, 100 + (ROUTING_LABEL_RADIUS_K + 2) * 10, 40, 10)];
  assert.equal(isRoutingLabelOcc(far, tag), false);
  const sizeOnly = [box("AHU-1", 95, 95, 10, 10), box("36x16 RETURN", 100, 110, 40, 10)];
  assert.equal(isRoutingLabelOcc(sizeOnly, tag), false);
});
