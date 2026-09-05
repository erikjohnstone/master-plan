/**
 * Vectorgrid client — JSON-RPC over stdio to the measured table extractor.
 *
 * Deliberately NOT part of tableSidecarClient's lifecycle, for two reasons
 * that are both live in this repo:
 *
 *   1. `OPENTAKEOFF_TABLE_SIDECAR=0` is set by every corpus script in
 *      package.json (emit:corpus, prewarm:corpus, and every shard). Gating the
 *      primary engine on `sidecarEnabled()` would silently disable it in
 *      exactly the runs that produce the frozen 541-tag baseline — the numbers
 *      would look unchanged because the engine never ran.
 *   2. `extractTablesViaSidecar` swallows every error to `[]`. That is right
 *      for a last-resort fallback and wrong for a primary engine: a Python
 *      crash would present as "this sheet has no schedules". Here a failure
 *      rejects, and the pipeline records it as a note rather than as an
 *      absence of tables.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../../sidecar/tables.py");

/** off = never runs. shadow = runs and reports, merges nothing. on = primary. */
export type VectorGridMode = "off" | "shadow" | "on";

/** Default is `off`: nothing changes until it is asked for, and a corpus
 * baseline run costs nothing. Phase 5 runs `off` and `on` explicitly and
 * diffs them; `shadow` is for gathering the per-sheet comparison. */
export function vectorGridMode(): VectorGridMode {
  const v = (process.env.OPENTAKEOFF_VECTORGRID || "").toLowerCase();
  if (v === "1" || v === "on") return "on";
  if (v === "shadow") return "shadow";
  return "off";
}

export function vectorGridAvailable(): boolean {
  return vectorGridMode() !== "off" && existsSync(SERVER);
}

export interface VectorGridCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  bbox: [number, number, number, number];
}

export interface VectorGridTable {
  bbox: [number, number, number, number];
  rows: number;
  cols: number;
  cells: VectorGridCell[];
  raster: boolean;
  assigned: number;
  orphan: number;
  straddle: number;
}

export interface VectorGridReply {
  /** Always "pdf-points-topleft". Checked, not assumed. */
  space: string;
  page: number;
  pageWidth: number;
  pageHeight: number;
  tables: VectorGridTable[];
  diagnostics: Record<string, unknown>;
}

let proc: ChildProcessWithoutNullStreams | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ensureProc(): ChildProcessWithoutNullStreams {
  if (proc) return proc;
  const py = process.env.OPENTAKEOFF_VECTORGRID_PYTHON
    || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON
    || "python3";
  proc = spawn(py, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  const rl = createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // a stray non-JSON line is not a reply
    }
    const id = msg.id;
    if (id == null || !pending.has(id)) return;
    const p = pending.get(id)!;
    pending.delete(id);
    if (msg.error) p.reject(new Error(String(msg.error.message || "vectorgrid error")));
    else p.resolve(msg.result);
  });
  proc.on("exit", (code) => {
    proc = null;
    for (const [, p] of pending) p.reject(new Error(`vectorgrid sidecar exited (${code})`));
    pending.clear();
  });
  proc.stderr.on("data", () => {});
  return proc;
}

function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const child = ensureProc();
  const id = nextId++;
  return new Promise<T>((res, rej) => {
    pending.set(id, { resolve: res as (v: unknown) => void, reject: rej });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

/** One page. Rejects on failure — an engine that cannot run must not look
 * like a page with no schedules. */
export async function extractGridViaSidecar(pdfPath: string, page: number): Promise<VectorGridReply> {
  const reply = await rpc<VectorGridReply>("extract_grid", { pdfPath, page });
  if (!reply || reply.space !== "pdf-points-topleft") {
    throw new Error(`vectorgrid returned an unexpected coordinate space: ${reply?.space}`);
  }
  return reply;
}

export async function shutdownVectorGrid(): Promise<void> {
  if (!proc) return;
  try {
    await rpc("shutdown", {});
  } catch {
    /* the process exits; the pending map is cleared by the exit handler */
  }
  proc?.kill();
  proc = null;
}

export { SERVER as VECTORGRID_SERVER };
