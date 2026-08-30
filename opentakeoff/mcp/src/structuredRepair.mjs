/**
 * Structured final-answer repair via Vercel AI SDK + Zod (hosted OpenAI-
 * compatible endpoints such as Cerebras). Use when the model returned a
 * near-complete JSON answer that fails schema validation — one constrained
 * regenerate instead of another full tool loop.
 *
 * Durable helper: call from run-demo (or future API paths). No-ops cleanly
 * if `ai` / `@ai-sdk/openai` are unavailable.
 */
import { z } from "zod";
import { demoAnswerSchema } from "./demoAnswerSchema.mjs";

/**
 * @param {object} opts
 * @param {string} opts.endpoint — OpenAI-compatible chat completions URL
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {object} opts.truth
 * @param {unknown} opts.previousAnswer
 * @param {string[]} opts.validationErrors
 * @returns {Promise<object|null>} repaired answer or null
 */
export async function repairDemoAnswerStructured({
  endpoint,
  apiKey,
  model,
  truth,
  previousAnswer,
  validationErrors,
}) {
  let generateObject;
  let createOpenAI;
  try {
    ({ generateObject } = await import("ai"));
    ({ createOpenAI } = await import("@ai-sdk/openai"));
  } catch {
    return null;
  }

  const baseURL = String(endpoint || "").replace(/\/chat\/completions\/?$/, "");
  if (!baseURL || !apiKey) return null;

  const provider = createOpenAI({
    apiKey,
    baseURL,
    compatibility: "compatible",
  });

  // AI SDK generateObject wants a Zod schema — rebuild from truth.
  const schema = demoAnswerSchema(truth);
  try {
    const { object } = await generateObject({
      model: provider(model || "gpt-oss-120b"),
      schema,
      temperature: 0,
      prompt: [
        "Repair this HVAC/BAS takeoff JSON so it matches the schema.",
        "Do not invent values or citations — only fix types/shape using the prior answer.",
        `Validation errors: ${validationErrors.join("; ")}`,
        `Prior answer JSON:\n${JSON.stringify(previousAnswer)}`,
      ].join("\n\n"),
    });
    return object;
  } catch {
    return null;
  }
}

/** Re-export for callers that only need Zod. */
export { demoAnswerSchema, validateDemoAnswer } from "./demoAnswerSchema.mjs";
export { z };
