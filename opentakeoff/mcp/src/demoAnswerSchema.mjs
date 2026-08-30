/**
 * Durable Zod schemas for demo API finals (Instructor-style validate + repair).
 * Built from truth.expected so every demo gets typed validation without
 * hardcoding field names in production code.
 */
import { z } from "zod";

const citationSchema = z.object({
  sheet_id: z.string().min(1),
  table_title: z.string().nullable().optional(),
  row_key: z.union([z.string(), z.number(), z.null()]).optional(),
  column: z.union([z.string(), z.null()]).optional(),
  bbox_px: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  grounding_text: z.string().optional(),
  ocr_mode: z.string().optional(),
  ocr_confusables: z.boolean().optional(),
  sheet_flexible: z.boolean().optional(),
  bbox_flexible: z.boolean().optional(),
}).passthrough();

/**
 * @param {object} truth — demo truth.json
 * @returns {z.ZodObject}
 */
export function demoAnswerSchema(truth) {
  const expected = truth?.expected || {};
  const fieldSchemas = {};
  for (const [name, spec] of Object.entries(expected)) {
    const valueSchema = spec?.type === "integer" || spec?.type === "number"
      ? z.number()
      : z.union([z.string(), z.number()]);
    const citeCount = Array.isArray(spec?.citations)
      ? spec.citations.length
      : (spec?.citation ? 1 : 0);
    fieldSchemas[name] = z.object({
      value: valueSchema,
      citations: citeCount > 0
        ? z.array(citationSchema).min(1)
        : z.array(citationSchema).optional(),
    });
  }
  return z.object({
    status: z.enum(["done", "refused"]),
    answer: z.object(fieldSchemas).passthrough(),
  });
}

/**
 * @param {unknown} answer
 * @param {object} truth
 * @returns {{ ok: true, data: object } | { ok: false, errors: string[] }}
 */
export function validateDemoAnswer(answer, truth) {
  const schema = demoAnswerSchema(truth);
  const parsed = schema.safeParse(answer);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = (parsed.error?.issues || []).map((issue) =>
    `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { ok: false, errors };
}
