/**
 * The agent log after a progress line. A line equal to the last is dropped,
 * and a graph build's step (`step`, a `graph_step` progress event) replaces
 * the step line before it: a cold build of a large set reports every sheet
 * and every schedule sheet it reads, and as a line each they would push the
 * rest of the log out. The log keeps its last `limit` entries.
 */
export function withProgressLine(log, text, { step = false, limit = 200 } = {}) {
  const last = log[log.length - 1];
  if (last?.kind === "progress" && last.text === text) return log;
  const next = step ? { kind: "progress", text, step: true } : { kind: "progress", text };
  if (step && last?.kind === "progress" && last.step) return [...log.slice(0, -1), next];
  return [...log.slice(-(limit - 1)), next];
}
