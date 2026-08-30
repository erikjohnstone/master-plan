// Bring-your-own-AI — strictly opt-in, dormant until configured.
//
// OpenTakeoff can ask a vision model YOU provide to read things off the plan —
// starting with the drawn scale when the sheet text doesn't state one. You
// point it at an endpoint you control: a hosted API or a local runtime on your
// own machine (most local runtimes speak the OpenAI-style protocol). Nothing is
// ever sent anywhere except the single, user-initiated request to YOUR
// endpoint; unconfigured builds make zero AI network calls. No telemetry.
// The code is open so anyone can audit exactly this.
//
// Config lives per-browser (localStorage) with build-time VITE_* fallbacks for
// self-hosted team deploys. WARNING for deployers: Vite inlines VITE_AI_KEY
// into the shipped JS bundle — anyone who can load the page can read it.
// Never set it on a public deploy; it exists for private/team builds only.

const KEYS = {
  endpoint: "opentakeoff_ai_endpoint",
  apiKey: "opentakeoff_ai_key",
  model: "opentakeoff_ai_model",
  provider: "opentakeoff_ai_provider",
  visionModel: "opentakeoff_ai_vision_model",
};

const env = (name) => (import.meta.env && import.meta.env[name]) || "";

function readKey(k, envName) {
  try {
    const v = localStorage.getItem(KEYS[k]);
    if (v) return v;
  } catch { /* private mode */ }
  return env(envName);
}

/** Current config. provider: "openai" (OpenAI-style — the default; local
 *  runtimes speak it) | "anthropic" (Anthropic-style).
 *
 *  `visionModel` (real, later addition): the model used SPECIFICALLY for
 *  reading an image (view_region crops) — separate from `model`, the one
 *  driving the agent loop's own tool-calling and final narration. Real,
 *  live-observed reason this split exists at all: asked to trace a duct's
 *  connectivity, the single configured model (a smaller, vision-capable one,
 *  chosen so it CAN read plan crops at all) sometimes overrode its own
 *  tool's honest "no connection found" with a guess from eyeballing a
 *  view_region screenshot — even with explicit, forceful prompt rules
 *  against exactly that, confirmed by direct live re-testing, not assumed.
 *  Routing images through a SEPARATE, narrowly-scoped vision call (see
 *  `describeImageForAgent` below) means the model actually driving the loop
 *  and writing the final answer never has raw pixels in its own context to
 *  be tempted by — it only ever sees the vision model's own literal
 *  description, threaded in exactly like any other tool result. Defaults to
 *  `model` when unset, so a single-model setup (today's default) behaves
 *  identically to before this existed — this is additive, not a forced
 *  change to anyone's existing config. */
export function aiConfig() {
  const model = readKey("model", "VITE_AI_MODEL");
  return {
    endpoint: readKey("endpoint", "VITE_AI_ENDPOINT"),
    apiKey: readKey("apiKey", "VITE_AI_KEY"),
    model,
    provider: readKey("provider", "VITE_AI_PROVIDER") || "openai",
    visionModel: readKey("visionModel", "VITE_AI_VISION_MODEL") || model,
  };
}

/** Configured = endpoint + model. A key is optional — local runtimes need none. */
export function isAiConfigured() {
  const c = aiConfig();
  return !!(c.endpoint && c.model);
}

export function saveAiConfig({ endpoint, apiKey, model, provider, visionModel }) {
  try {
    for (const [k, v] of [["endpoint", endpoint], ["apiKey", apiKey], ["model", model], ["provider", provider], ["visionModel", visionModel]]) {
      if (v) localStorage.setItem(KEYS[k], v);
      else localStorage.removeItem(KEYS[k]);
    }
  } catch { /* private mode */ }
}

// ── pure request plumbing (unit-tested; no fetch, no DOM) ───────────────────

/** Base URL → full request URL. A path that already ends in the protocol's
 *  completion route is used as-is; otherwise the standard route is appended. */
export function aiRequestUrl(endpoint, provider) {
  const base = (endpoint || "").replace(/\/+$/, "");
  if (provider === "anthropic") {
    return /\/messages$/.test(base) ? base : `${base}/v1/messages`;
  }
  return /\/chat\/completions$/.test(base) ? base : `${base}/v1/chat/completions`;
}

/** One vision request: an image + a question. Returns {url, headers, body}
 *  (body as an object — the caller JSON.stringifies). */
export function buildVisionRequest(cfg, { imageDataUrl, prompt, maxTokens = 100 }) {
  const url = aiRequestUrl(cfg.endpoint, cfg.provider);
  if (cfg.provider === "anthropic") {
    const m = /^data:(image\/\w+);base64,(.*)$/s.exec(imageDataUrl) || [];
    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      // the protocol's explicit acknowledgment that the key lives client-side —
      // which is exactly the bring-your-own-key model here
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
    return {
      url, headers,
      body: {
        model: cfg.model, max_tokens: maxTokens,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: m[1] || "image/jpeg", data: m[2] || "" } },
          { type: "text", text: prompt },
        ] }],
      },
    };
  }
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  return {
    url, headers,
    body: {
      model: cfg.model, max_tokens: maxTokens,
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ] }],
    },
  };
}

/** Model reply JSON → trimmed text, or null when there's none to be had. */
export function parseVisionResponse(provider, json) {
  if (!json || typeof json !== "object") return null;
  if (provider === "anthropic") {
    if (json.stop_reason === "refusal") return null;
    const block = Array.isArray(json.content) ? json.content.find((b) => b && b.type === "text") : null;
    return block && typeof block.text === "string" ? block.text.trim() : null;
  }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const text = content.filter((p) => p && typeof p.text === "string").map((p) => p.text).join(" ").trim();
    return text || null;
  }
  return null;
}

/** Constrained scale-reading prompt: exactly one known label, or UNKNOWN. */
export function scaleReadPrompt(labels) {
  return `This image is the title block region of a construction drawing. Find the stated drawing scale (usually after the word SCALE). Reply with exactly one of the following labels, character for character, or the single word UNKNOWN if no scale is stated. Labels: ${labels.join(" | ")}. Reply with the label only — no other words.`;
}

/** Vision-assisted symbol classification (maturity plan Phase 3, #HVAC-4) —
 * for symbols the geometric approach can't confidently place (a genuinely
 * novel shape, or a raster/scanned sheet with no vector geometry to
 * fingerprint at all). `names` grounds the model in this project's own
 * real, hand-authored taxonomy (hvacTaxonomy.ts) instead of an open-ended
 * "what is this" — a constrained vocabulary the same way scaleReadPrompt
 * constrains scale answers to real labels, not free text. Always asks for
 * a stated confidence and a one-sentence visual reason — never a bare
 * label, matching this project's evidence-citation doctrine everywhere
 * else (a classification with no reasoning attached is exactly the kind of
 * unverifiable assertion `confidence.ts`'s own doctrine already refuses
 * elsewhere in this codebase). */
export function classifySymbolPrompt(names) {
  return `This image is a cropped symbol from a construction drawing (HVAC/mechanical/BAS). Classify what this symbol represents. Consider these known real component names: ${names.join(", ")}. If the symbol clearly matches none of them, reply with your own best short name instead of forcing a bad fit. Reply with EXACTLY this JSON object and nothing else — no markdown code fence, no other text: {"classification": "<name>", "confidence": <number 0 to 1>, "reasoning": "<one sentence citing the specific visual features that led to this>"}`;
}

/** The model's reply -> {classification, confidence, reasoning}, or null if
 * the reply isn't usable — never a guessed/patched-up shape. Tolerates a
 * markdown code fence around the JSON (real models wrap it one anyway, this
 * project's own live check against the configured vision model confirmed),
 * but does not tolerate a missing field, a confidence outside [0,1], or an
 * empty reasoning string — those are refused, not silently defaulted. */
export function parseClassifyResponse(text) {
  if (typeof text !== "string") return null;
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let obj;
  try { obj = JSON.parse(stripped); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const { classification, confidence, reasoning } = obj;
  if (typeof classification !== "string" || !classification.trim()) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (typeof reasoning !== "string" || !reasoning.trim()) return null;
  return { classification: classification.trim(), confidence, reasoning: reasoning.trim() };
}

/** One chat-with-tools turn: system + running messages + tool declarations.
 *  Returns {url, headers, body} (body as an object — the caller stringifies).
 *  Same key/endpoint handling as buildVisionRequest; `messages` and `tools`
 *  are already in the PROVIDER's own shape (agentLoop owns that translation —
 *  Anthropic-style tools/tool_use/tool_result vs OpenAI-style function
 *  calling), so this stays pure request plumbing. */
export function buildChatRequest(cfg, { system, messages, tools, maxTokens = 4096 }) {
  const url = aiRequestUrl(cfg.endpoint, cfg.provider);
  if (cfg.provider === "anthropic") {
    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
    return { url, headers, body: { model: cfg.model, max_tokens: maxTokens, ...(system ? { system } : {}), messages, ...(tools?.length ? { tools } : {}) } };
  }
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  return {
    url, headers,
    body: {
      model: cfg.model, max_tokens: maxTokens,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      ...(tools?.length ? { tools } : {}),
    },
  };
}

// ── the seam every AI consumer goes through ─────────────────────────────────

/** Send one vision query to the user's configured endpoint. Throws with a
 *  plain-language message on any failure. `cfgOverride`/`fetchFn` are
 *  injectable (tests, and `describeImageForAgent` below, which needs the
 *  VISION model, not the orchestrator model) — default to the live
 *  `aiConfig()` and the global `fetch` exactly as before. */
export async function visionQuery({ imageDataUrl, prompt, maxTokens = 100, cfg: cfgOverride, fetchFn }) {
  const cfg = cfgOverride || aiConfig();
  if (!(cfg.endpoint && cfg.model)) throw new Error("AI isn't configured — open AI settings first.");
  const { url, headers, body } = buildVisionRequest(cfg, { imageDataUrl, prompt, maxTokens });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  let res;
  try {
    res = await (fetchFn || fetch)(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw new Error(e?.name === "AbortError"
      ? "The endpoint took more than 30 seconds — check the model is loaded."
      : "Couldn't reach the endpoint — check the URL, and that it allows browser requests (CORS).");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`AI request failed (HTTP ${res.status}).`);
  const text = parseVisionResponse(cfg.provider, await res.json().catch(() => null));
  if (text == null) throw new Error("The endpoint replied, but not with text.");
  return text;
}

/** Deliberately literal: describe only what's visible, never a conclusion.
 * The whole point of routing images through their own isolated call (see
 * `aiConfig()`'s own `visionModel` comment) is that the model driving the
 * loop never gets tempted to reason from raw pixels — so THIS prompt must
 * not invite the vision model to draw conclusions either, just report what
 * it can literally see, the same discipline `scaleReadPrompt`/
 * `classifySymbolPrompt` already hold elsewhere in this file. */
export function describeImagePrompt() {
  return "This image is a cropped region of a construction drawing (HVAC/mechanical/BAS plan). Describe ONLY what is literally visible: any text, tags, or labels you can read exactly as printed, and the linework/symbols present (shape, how many, roughly where). Do NOT infer meaning, connections, totals, or conclusions beyond what's directly visible — if you're not sure a mark is a specific symbol, say so instead of guessing. Be factual and literal, 2-4 sentences.";
}

/** The agent loop's own image-to-text seam (real, later addition — see
 * `aiConfig()`'s own `visionModel` comment for why this exists at all).
 * Runs the SAME transport as `visionQuery`, just always against the
 * configured VISION model, never whatever model is driving the loop. Throws
 * the same plain-language errors on failure — the caller (`agentLoop.js`)
 * catches this and degrades to the OLD raw-image path for that one result,
 * but emits a real status event disclosing the degradation rather than
 * failing silently either way (see the call site's own comment). */
export async function describeImageForAgent({ imageDataUrl, cfg, fetchFn }) {
  const base = cfg || aiConfig();
  const visionCfg = { ...base, model: base.visionModel || base.model };
  return visionQuery({ imageDataUrl, prompt: describeImagePrompt(), maxTokens: 300, cfg: visionCfg, fetchFn });
}

/** Send one chat-with-tools request (the agent loop's transport). Same
 *  config/endpoint machinery as visionQuery — the user's own key, their own
 *  endpoint, nothing else; no telemetry. Throws with a plain-language message
 *  on any transport failure; an AbortError from the caller's signal is
 *  re-thrown untouched so the loop can tell "stopped" from "broken".
 *  `cfg`/`fetchFn` are injectable for tests (default: live config + fetch). */
export async function chatWithTools({ cfg, system, messages, tools, maxTokens = 4096, signal, fetchFn }) {
  const c = cfg || aiConfig();
  if (!(c.endpoint && c.model)) throw new Error("AI isn't configured — open AI settings first.");
  const { url, headers, body } = buildChatRequest(c, { system, messages, tools, maxTokens });
  // 120s per turn — agent turns run longer than the 30s vision reads. The
  // caller's abort signal still wins whenever the runtime supports combining.
  let sig = signal;
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function") {
      sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
    }
  } catch { /* keep the caller's signal */ }
  let res;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      res = await (fetchFn || fetch)(url, { method: "POST", headers, body: JSON.stringify(body), signal: sig });
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      if (e?.name === "TimeoutError") throw new Error("The endpoint took more than 2 minutes — check the model is loaded.");
      throw new Error("Couldn't reach the endpoint — check the URL, and that it allows browser requests (CORS).");
    }
    if (res.ok) break;
    if ((res.status === 429 || res.status === 503) && attempt < maxAttempts - 1) {
      const retryAfter = Number(res.headers?.get?.("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(60_000, retryAfter * 1000)
        : Math.min(32_000, 4_000 * (2 ** attempt));
      await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
      continue;
    }
    throw new Error(`AI request failed (HTTP ${res.status}).`);
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== "object") throw new Error("The endpoint replied, but not with JSON.");
  return json;
}
