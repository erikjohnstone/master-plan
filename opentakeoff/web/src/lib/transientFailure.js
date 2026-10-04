/**
 * Whether a request to the schedule server failed for a reason that may pass
 * on its own: the server could not be reached or cut the reply off (a restart,
 * a deploy, a dropped connection), or a proxy in front of it answered for it
 * (502, 503, 504). A refusal the server explained (a password-protected PDF, a
 * read that failed) is its answer, and asking again gets the same one.
 */
export function isTransientRequestFailure(error) {
  const message = String(error?.message || error || "");
  if (error?.name === "TypeError" && /fetch|network|load failed|terminated|connection|socket/i.test(message)) return true;
  return /\bHTTP (502|503|504)\b/.test(message);
}

/** How many times a transient failure is tried again before it is shown. */
export const TRANSIENT_RETRIES = 5;

/** Seconds before retry `n` (1-based): 2, 4, 8, 16, 30. */
export function retryDelaySeconds(n) {
  return Math.min(30, 2 ** Math.max(1, n));
}

/** The sentence for a takeoff that failed: a server that did not answer is
 * said in words, with when to try again; any other failure quotes its reason.
 * Either way nothing partial was counted. */
export function takeoffFailureMessage(what, error) {
  if (isTransientRequestFailure(error)) {
    return `The ${what} could not be compiled: the schedule server did not answer (it may be restarting, or the `
      + "connection dropped). Nothing was counted; run it again in a moment.";
  }
  return `The ${what} could not be compiled: ${String(error?.message || error)}. Nothing was counted from a partial `
    + "reading; run it again once that is resolved.";
}
