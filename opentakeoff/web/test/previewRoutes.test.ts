// The built bundle must serve the same endpoints the dev server does.
//
// The plugin registered `configureServer` only, so `vite preview` — the closest
// thing in this repo to production — served the app and then 404'd every
// /__ot/* call. Schedule indexing, compile_corpus_takeoff and sweep_schedule_row
// all worked in dev and failed there, and the failure surfaced to the estimator
// as a CORS-shaped error rather than a missing route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { corpusTakeoffApiPlugin } from "../vite.corpusTakeoffApi.js";

/** A fake Vite server that just records the middleware it is handed. */
function fakeServer() {
  const used: any[] = [];
  return { used, middlewares: { use: (fn: any) => used.push(fn) } };
}

const ROUTES = [
  "/__ot/sheet-graph",
  "/__ot/compile-corpus-takeoff",
  "/__ot/sweep-schedule-row",
  "/__ot/count-marks",
  "/__ot/reconcile-schedule-plan",
  "/__ot/bas-assignment-demand",
];

test("the plugin serves /__ot/* in BOTH dev and preview", () => {
  const p: any = corpusTakeoffApiPlugin();
  assert.equal(typeof p.configureServer, "function");
  assert.equal(typeof p.configurePreviewServer, "function",
    "vite preview must serve the production endpoints too — this is the regression");

  const dev = fakeServer(), prev = fakeServer();
  p.configureServer(dev);
  p.configurePreviewServer(prev);
  assert.equal(dev.used.length, 1);
  assert.equal(prev.used.length, 1);
  assert.equal(dev.used[0], prev.used[0], "one middleware, so the two can never drift apart");
});

test("every production route answers, and a GET is refused rather than falling through", () => {
  const p: any = corpusTakeoffApiPlugin();
  const s = fakeServer();
  p.configurePreviewServer(s);
  const mw = s.used[0];

  for (const url of ROUTES) {
    // GET → 405 from the route itself. A 404 (or next()) would mean the route
    // is not mounted at all, which is exactly the bug.
    let body = "";
    // sendJson assigns res.statusCode; it does not call writeHead
    const res: any = { statusCode: 0, setHeader() {}, end(b: string) { body = String(b || ""); } };
    let fellThrough = false;
    mw({ url, method: "GET" }, res, () => { fellThrough = true; });
    assert.equal(fellThrough, false, `${url} must be handled, not passed to the static server`);
    assert.equal(res.statusCode, 405, `${url} GET`);
    assert.match(body, /POST only/);
  }
});

test("an unrelated URL still falls through to the app", () => {
  const p: any = corpusTakeoffApiPlugin();
  const s = fakeServer();
  p.configurePreviewServer(s);
  let fellThrough = false;
  s.used[0]({ url: "/index.html", method: "GET" }, {} as any, () => { fellThrough = true; });
  assert.equal(fellThrough, true);
  // and a lookalike prefix is not ours
  fellThrough = false;
  s.used[0]({ url: "/__other/sheet-graph", method: "POST" }, {} as any, () => { fellThrough = true; });
  assert.equal(fellThrough, true);
});
