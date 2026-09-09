/** One bounded transport to the Python BAS engine. No JS quantity arithmetic. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { basPointListsSchema, type BasPointLists } from "../../web/src/lib/basPointLists.ts";
import { basAssignmentDemandResultSchema, type BasAssignmentDemandResult } from "../../web/src/lib/basAssignmentDemandContract.ts";

const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const bundledRoot = fileURLToPath(new URL("./python/", import.meta.url));
const pythonRoot = existsSync(`${bundledRoot}/bas_engine/__init__.py`) ? bundledRoot : appRoot;
const localPython = fileURLToPath(new URL("../../.venv-bas/bin/python", import.meta.url));
const LIMIT = 32 * 1024 * 1024;
const count = z.number().int().nonnegative().safe();
const vector = z.object({ AI: count, AO: count, DI: count, DO: count }).strict();
const evidence = z.object({
  sheet_id: z.string().nullable(), table_title: z.string().nullable(),
  row_key: z.string().nullable(), column: z.string().nullable(), text: z.string().nullable(),
  bbox_px: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable(),
  origin: z.enum(["blueprint_index", "manual_blueprint_review", "structured_input"]),
}).strict();
const resultSchema = z.object({
  schema_version: z.literal("1"), engine: z.literal("bas_math_v1"),
  status: z.enum(["calculated", "review_required", "no_evidence"]),
  project_complete: z.literal(false),
  source_coverage: z.enum(["soo_only", "point_list_only", "both"]),
  physical_total: vector,
  points: z.array(z.object({ group_id: z.string(), point_id: z.string(), physical: vector,
    soft: z.array(z.unknown()), evidence: z.array(evidence), conflict: z.boolean() }).passthrough()),
  hardware: z.array(z.object({ group_id: z.string(), status: z.string(),
    live_per_pool: vector, required_per_pool: vector, blocks_total: count.nullable(),
    blocks_per_pool: count.nullable(), pool_count: count }).passthrough()),
  licenses: z.array(z.object({ pool: z.string(), weighted_points: count, status: z.string() }).passthrough()),
  serial: z.array(z.object({ route_id: z.string(), status: z.string(), segments: z.array(z.unknown()) }).passthrough()),
  ip: z.array(z.object({ closet_id: z.string(), status: z.string(), switches: count.nullable() }).passthrough()),
  diagnostics: z.array(z.object({ code: z.string(), severity: z.enum(["info", "warning", "error"]),
    message: z.string(), evidence: z.array(evidence) }).passthrough()),
}).strict();

export type BasMathResult = z.infer<typeof resultSchema>;

function safeNumbers(value: unknown): void {
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new Error("BAS payload exceeds JavaScript's exact numeric range");
  }
  if (value && typeof value === "object") for (const child of Object.values(value)) safeNumbers(child);
}

export async function runBasMath(payload: unknown, options: { python?: string; timeoutMs?: number } = {}): Promise<BasMathResult> {
  return runBasProcess(payload, resultSchema, options);
}

export async function runBasPointLists(payload: unknown, options: { python?: string; timeoutMs?: number } = {}): Promise<BasPointLists> {
  return runBasProcess({ point_lists: payload }, basPointListsSchema, options);
}

export async function runBasAssignmentDemand(payload: unknown, options: { python?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<BasAssignmentDemandResult> {
  return runBasProcess({ assignment_demand: payload }, basAssignmentDemandResultSchema, options);
}

async function runBasProcess<T>(payload: unknown, schema: z.ZodType<T>, options: { python?: string; timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
  options.signal?.throwIfAborted();
  safeNumbers(payload);
  const input = JSON.stringify(payload);
  if (Buffer.byteLength(input) > LIMIT) throw new Error("BAS input exceeds 32 MiB");
  const python = options.python || process.env.OPENTAKEOFF_BAS_PYTHON || (existsSync(localPython) ? localPython : "python3");
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-m", "bas_engine"], { cwd: pythonRoot, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    let settled = false;
    const finish = (error: Error | null, result?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) { child.kill("SIGKILL"); reject(error); }
      else if (result !== undefined) resolve(result);
    };
    const onAbort = () => finish(new Error('BAS calculation cancelled; no result accepted'));
    const timer = setTimeout(() => finish(new Error("BAS math timed out; no result was accepted")), options.timeoutMs ?? 30_000);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.on("error", () => finish(new Error("BAS Python runtime unavailable. Install Pydantic V2 and configure OPENTAKEOFF_BAS_PYTHON.")));
    child.stdin.on("error", () => { /* close/error handler reports the process result */ });
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length+chunk.length > LIMIT) { finish(new Error("BAS output exceeds 32 MiB")); return; }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 4096) stderr += chunk.toString().slice(0, 4096-stderr.length); });
    child.on("close", (code) => {
      if (settled) return;
      try {
        const output: unknown = JSON.parse(stdout.toString("utf8"));
        if (code !== 0) {
          const err = z.object({ error: z.object({ message: z.string() }) }).safeParse(output);
          throw new Error(err.success ? err.data.error.message : "BAS math process failed validation");
        }
        safeNumbers(output);
        finish(null, schema.parse(output));
      } catch (error) {
        const message = stderr.includes("No module named")
          ? "BAS Python dependencies unavailable. Install Pydantic V2 and configure OPENTAKEOFF_BAS_PYTHON."
          : error instanceof z.ZodError ? "BAS output failed its contract; no result was accepted"
            : error instanceof SyntaxError ? "BAS process returned invalid JSON; no result was accepted"
              : error instanceof Error ? error.message : "BAS process failed";
        finish(new Error(message));
      }
    });
    child.stdin.end(input);
  });
}
