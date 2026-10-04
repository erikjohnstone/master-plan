/**
 * The result of a production endpoint's NDJSON reply: each `{type:"progress"}`
 * line handed to `onProgress` as it arrives, an `{type:"error"}` line thrown,
 * and the `{type:"result"}` line's `result` returned. `what` names the request
 * in the two errors (a failed step, a stream that ended without a result).
 */
export async function readNdjsonResult(res, onProgress, what) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result;
  let gotResult = false;
  const consume = (line) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (msg.type === "progress") onProgress?.(msg);
    else if (msg.type === "result") { result = msg.result; gotResult = true; }
    else if (msg.type === "error") throw new Error(msg.error || `${what} failed`);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) consume(line);
  }
  buf += decoder.decode();
  if (buf.trim()) consume(buf);
  if (!gotResult) throw new Error(`${what} stream ended without a result`);
  return result;
}
