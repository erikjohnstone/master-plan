// Mark identity — short-mark overcount, twin-alias double-count, shared
// bare marks. Synthetic spans only: the rule is the shape of the identity,
// not a corpus filename or a tag that happened to fail on one job.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markKey, marksEqual, dedupeMarks, spanAnswersFor, isBarePrefix, markLetters, pickMarkHits, compoundTagOcc, MARK_CLUSTER_K,
  isAbbreviationEntry,
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

test("isBarePrefix: the letters a mark begins with, never the mark itself, its compound run or another mark", () => {
  // the one kind of span spanAnswersFor lets answer for a mark it is not
  assert.equal(isBarePrefix("WH", "WH-1"), true);
  assert.equal(isBarePrefix("W", "WH-1"), true);
  assert.equal(isBarePrefix("d", "DAC-1"), true);
  assert.equal(isBarePrefix("AHU", "AHU-A"), true);
  // the mark itself, however spelled
  assert.equal(isBarePrefix("WH-1", "WH-1"), false);
  assert.equal(isBarePrefix("WH 1", "WH-1"), false);
  assert.equal(isBarePrefix("S", "S"), false);
  // a compound run of the mark, a longer mark, a number, another mark
  assert.equal(isBarePrefix("R1 /C-11", "R1"), false);
  assert.equal(isBarePrefix("WH1A", "WH-1"), false);
  assert.equal(isBarePrefix("1", "WH-1"), false);
  assert.equal(isBarePrefix("EF", "WH-1"), false);
  assert.equal(isBarePrefix("", "WH-1"), false);
  // every span spanAnswersFor admits for a mark it is not is a bare prefix
  for (const have of ["W", "WH", "WH-1", "WH 1", "WH-1 /C-2", "WH1A", "WX", "1"]) {
    const answers = spanAnswersFor(have, "WH-1", ["WH-1"]);
    const itself = markKey(have) === markKey("WH-1") || compoundTagOcc(have, "WH-1");
    assert.equal(answers && !itself, isBarePrefix(have, "WH-1"), have);
  }
});

test("markLetters: the letters a mark's family is written with, up to its first digit or separator", () => {
  assert.equal(markLetters("ET-1"), "ET");
  assert.equal(markLetters("et1"), "ET");
  assert.equal(markLetters("AHU-A"), "AHU");
  assert.equal(markLetters("WHSE-AHU-1"), "WHSE");
  assert.equal(markLetters("B-1"), "B");
  assert.equal(markLetters(" DOAS 1 "), "DOAS");
  assert.equal(markLetters("EG"), "EG");
  assert.equal(markLetters("1-VAV-1"), "");
  assert.equal(markLetters(""), "");
});

test("isAbbreviationEntry: a family's letters spelled out after them on their line are a legend's entry, not a tag", () => {
  // an abbreviations list: the letters, a column's gap, the words they stand for
  const vfd = box("VFD", 100, 500, 30, 10);
  assert.equal(isAbbreviationEntry(vfd, [vfd, box("VARIABLE FREQUENCY DRIVE", 150, 500, 220, 10)]), true);
  // spelled out across spans at word spacing, after a separator, with a connector the letters skip
  const wh = box("WH", 100, 500, 20, 10);
  assert.equal(isAbbreviationEntry(wh, [wh, box("=", 128, 500, 6, 10), box("WALL", 140, 500, 40, 10), box("HYDRANT", 190, 500, 70, 10)]), true);
  const cfm = box("CFM", 100, 500, 30, 10);
  assert.equal(isAbbreviationEntry(cfm, [cfm, box("CUBIC FEET PER MINUTE", 150, 500, 200, 10)]), true);
  // a tag lettered alone, or beside other words, or its name farther than a column's gap
  assert.equal(isAbbreviationEntry(vfd, [vfd]), false);
  assert.equal(isAbbreviationEntry(vfd, [vfd, box("ABOVE CEILING", 150, 500, 120, 10)]), false);
  assert.equal(isAbbreviationEntry(vfd, [vfd, box("VARIABLE FREQUENCY DRIVE", 240, 500, 220, 10)]), false);
  // a name on another line, or one that begins elsewhere ("FIRE PROTECTION ... TAMPER SWITCH" for TS)
  assert.equal(isAbbreviationEntry(vfd, [vfd, box("VARIABLE FREQUENCY DRIVE", 150, 520, 220, 10)]), false);
  const ts = box("TS", 100, 500, 20, 10);
  assert.equal(isAbbreviationEntry(ts, [ts, box("FIRE PROTECTION SPRINKLER TAMPER SWITCH", 150, 500, 300, 10)]), false);
  // only a family's bare letters, two or more, can be an entry
  const one = box("E", 100, 500, 10, 10);
  assert.equal(isAbbreviationEntry(one, [one, box("EXHAUST", 130, 500, 60, 10)]), false);
  const mark = box("EF-1", 100, 500, 40, 10);
  assert.equal(isAbbreviationEntry(mark, [mark, box("EXHAUST FAN", 160, 500, 100, 10)]), false);
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
