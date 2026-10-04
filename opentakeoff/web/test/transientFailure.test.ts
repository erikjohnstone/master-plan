// The schedule index tries again on its own when the server did not answer,
// and only then: a refusal the server explained is its answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransientRequestFailure, retryDelaySeconds, TRANSIENT_RETRIES } from "../src/lib/transientFailure.js";

test("a request the server never answered is tried again; one it refused is not", () => {
  // What fetch throws when the server is down or the reply is cut off, per browser.
  for (const message of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed",
    "network error", "terminated"]) {
    assert.equal(isTransientRequestFailure(new TypeError(message)), true, message);
  }
  // A proxy answering for a server that is restarting.
  for (const status of [502, 503, 504]) {
    assert.equal(isTransientRequestFailure(new Error(`sheet-graph HTTP ${status}`)), true, String(status));
  }
  // The server's own answers, and our own bugs, are not retried.
  for (const error of [
    new Error("plan.pdf is password-protected, so it can't be read."),
    new Error("sheet-graph HTTP 500"),
    new Error("sheet-graph HTTP 400"),
    new TypeError("Cannot read properties of undefined (reading 'tables')"),
    new SyntaxError("Unexpected end of JSON input"),
  ]) {
    assert.equal(isTransientRequestFailure(error), false, error.message);
  }
});

test("retries wait 2, 4, 8, 16, then 30 s, five times", () => {
  assert.equal(TRANSIENT_RETRIES, 5);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(retryDelaySeconds), [2, 4, 8, 16, 30, 30]);
});
