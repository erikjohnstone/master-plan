// CONTROL INTENT goal, WP0.6/WP3.5 (decision C10, LAW CI6): every model
// call recorded, and replayed.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The readers build a request and
// check a reply the same way on every surface; only the transport (the
// browser's platform proxy, MCP's configured endpoint, an eval's recorded
// store) differs, and it is injected.
//
// A run is keyed by the hash of its request: the model, the prompt and schema
// versions, the messages (an image by the hash of its bytes, never the
// bytes) and the sampling settings. So a changed model, prompt, term list or
// packet is a new request with its own run, and a saved project that pins
// its runs reads exactly what it read before (CI6). Replay never calls a
// model: a request with no recorded run is "not recorded" and the reader
// says nothing.
import { canonicalBasJson } from "../basCanonical.ts";
import { sha256Hex } from "../graphKeys.js";

export const RUNS_VERSION = "control_runs_v1";

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "user"; content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

/** An OpenAI-compatible chat request with strict JSON output. */
export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  response_format: { type: "json_schema"; json_schema: { name: string; strict: true; schema: unknown } };
  temperature: number;
  max_completion_tokens: number;
  reasoning_effort?: "low" | "medium" | "high";
}

/** What a transport returns: the reply's text (the JSON the schema asked
 * for), its usage and how long it took. */
export interface ModelReply {
  content: string | null;
  finish_reason?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  latency_ms?: number;
}

/** Sends one request (injected per surface). Throws on a transport failure. */
export type Transport = (req: ModelRequest) => Promise<ModelReply>;

export interface RunRecord {
  /** sha256 of the request's canonical form (images as their hashes). */
  hash: string;
  reader: "r1" | "r2";
  model: string;
  prompt_version: string;
  /** What was asked, in words: the unit(s), packets and questions. */
  summary: Record<string, unknown>;
  content: string | null;
  finish_reason?: string | null;
  usage?: ModelReply["usage"];
  latency_ms?: number;
  error?: string;
  recorded_at: string;
}

/** Record/replay store. */
export interface RunStore {
  get(hash: string): RunRecord | undefined;
  put(run: RunRecord): void;
  all(): RunRecord[];
}

export function memoryRunStore(runs: readonly RunRecord[] = []): RunStore {
  const m = new Map(runs.map((r) => [r.hash, r]));
  return {
    get: (h) => m.get(h),
    put: (r) => { m.set(r.hash, r); },
    all: () => [...m.values()],
  };
}

const enc = new TextEncoder();

/** The request as hashed: each image by its key (what was rendered: the
 * page, region, turn and resolution; `imageKeys`, in order), or else by the
 * sha256 of its data URL. A run is then the same run on every surface,
 * whatever pixels its renderer draws. */
async function hashedForm(req: ModelRequest, imageKeys: readonly string[] = []): Promise<unknown> {
  const messages = [];
  let k = 0;
  for (const m of req.messages) {
    if (typeof m.content === "string") { messages.push(m); continue; }
    const parts = [];
    for (const p of m.content) {
      if (p.type === "image_url") {
        const key = imageKeys[k++];
        parts.push(key !== undefined ? { type: "image_key", key } : { type: "image_sha256", sha256: await sha256Hex(enc.encode(p.image_url.url)) });
      } else parts.push(p);
    }
    messages.push({ role: m.role, content: parts });
  }
  // Canonical JSON: no undefined members.
  return JSON.parse(JSON.stringify({ ...req, messages }));
}

export async function requestHash(req: ModelRequest, imageKeys: readonly string[] = []): Promise<string> {
  return sha256Hex(enc.encode(canonicalBasJson(await hashedForm(req, imageKeys) as never)));
}

/** An image not rendered yet: replay needs only its key. */
export const PENDING_IMAGE = "data:image/png;base64,";

export interface CallResult {
  content: string | null;
  run: RunRecord | null;
  /** "replayed" from the store, "live" just called, "not_recorded" (replay
   * only and the store has no run), "failed" (the transport threw). */
  status: "replayed" | "live" | "not_recorded" | "failed";
}

/** One model call through the store: a recorded run is replayed; otherwise
 * the transport (when given) is called and the run recorded. */
export async function recordedCall(store: RunStore, transport: Transport | null, reader: RunRecord["reader"], promptVersion: string,
  req: ModelRequest, summary: Record<string, unknown>,
  opts: { imageKeys?: readonly string[]; materialize?: (req: ModelRequest) => Promise<ModelRequest | null>; now?: () => string } = {}): Promise<CallResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const hash = await requestHash(req, opts.imageKeys);
  const hit = store.get(hash);
  if (hit && !hit.error) return { content: hit.content, run: hit, status: "replayed" };
  if (!transport) return { content: null, run: null, status: "not_recorded" };
  const t0 = Date.now();
  try {
    // A request whose images are still pending is rendered only now.
    const full = opts.materialize ? await opts.materialize(req) : req;
    if (!full) return { content: null, run: null, status: "not_recorded" };
    const reply = await transport(full);
    const run: RunRecord = { hash, reader, model: req.model, prompt_version: promptVersion, summary, content: reply.content, finish_reason: reply.finish_reason ?? null, usage: reply.usage ?? null, latency_ms: reply.latency_ms ?? Date.now() - t0, recorded_at: now() };
    store.put(run);
    return { content: reply.content, run, status: "live" };
  } catch (e) {
    const run: RunRecord = { hash, reader, model: req.model, prompt_version: promptVersion, summary, content: null, error: String((e as Error)?.message ?? e).slice(0, 300), latency_ms: Date.now() - t0, recorded_at: now() };
    return { content: null, run, status: "failed" };
  }
}

/** A transport for an OpenAI-compatible endpoint (MCP and the evals: the
 * endpoint and key come from the environment). Retries 429/503 with backoff. */
export function httpTransport(opts: { endpoint: string; apiKey?: string; fetchFn?: typeof fetch; timeoutMs?: number; retries?: number }): Transport {
  const url = `${opts.endpoint.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/chat/completions`;
  const f = opts.fetchFn ?? fetch;
  return async (req) => {
    const retries = opts.retries ?? 4;
    for (let attempt = 0; ; attempt++) {
      const t0 = Date.now();
      const ctl = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(opts.timeoutMs ?? 180_000) : undefined;
      const res = await f(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify(req),
        ...(ctl ? { signal: ctl } : {}),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const after = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Number.isFinite(after) && after > 0 ? Math.min(60_000, after * 1000) : Math.min(30_000, 2000 * 2 ** attempt)));
        continue;
      }
      if (!res.ok) throw new Error(`model request failed (HTTP ${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const json = await res.json() as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>; usage?: ModelReply["usage"] };
      const content = json.choices?.[0]?.message?.content;
      return { content: typeof content === "string" ? content : null, finish_reason: json.choices?.[0]?.finish_reason ?? null, usage: json.usage ?? null, latency_ms: Date.now() - t0 };
    }
  };
}

/** The JSON a reply's content carries (a fenced block tolerated), or null. */
export function replyJson(content: string | null): unknown {
  if (typeof content !== "string") return null;
  const t = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
