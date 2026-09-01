/**
 * L2 Python table sidecar client — JSON-RPC over stdio (one long-lived process).
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIDECAR_ROOT = resolve(HERE, "../../../sidecar");
const SIDECAR_SCRIPT = resolve(SIDECAR_ROOT, "tables.py");

export interface SidecarExplicitLines {
  horizontal: [number, number, number, number][];
  vertical: [number, number, number, number][];
}

export interface SidecarExtractParams {
  pdfPath: string;
  page: number;
  bboxHint?: [number, number, number, number];
  explicitLines?: SidecarExplicitLines;
  backends?: string[];
}

export interface SidecarCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface SidecarTable {
  source: string;
  score: number;
  page: number;
  rows: number;
  cols: number;
  bbox: [number, number, number, number];
  cells: SidecarCell[];
}

let proc: ChildProcessWithoutNullStreams | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function sidecarEnabled(): boolean {
  if (process.env.OPENTAKEOFF_TABLE_SIDECAR === "0") return false;
  return existsSync(SIDECAR_SCRIPT);
}

function ensureProc(): ChildProcessWithoutNullStreams {
  if (proc) return proc;
  const py = process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "python3";
  proc = spawn(py, [SIDECAR_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  const rl = createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
      const id = msg.id;
      if (id == null || !pending.has(id)) return;
      const p = pending.get(id)!;
      pending.delete(id);
      if (msg.error) p.reject(new Error(String(msg.error.message || "sidecar error")));
      else p.resolve(msg.result);
    } catch {
      /* ignore malformed lines */
    }
  });
  proc.on("exit", () => {
    proc = null;
    for (const [, p] of pending) p.reject(new Error("table sidecar exited"));
    pending.clear();
  });
  proc.stderr.on("data", () => {});
  return proc;
}

function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!sidecarEnabled()) return Promise.reject(new Error("table sidecar disabled or missing"));
  const child = ensureProc();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

export async function pingTableSidecar(): Promise<{ ok: boolean; backends: string[] }> {
  return rpc("ping");
}

export async function extractTablesViaSidecar(params: SidecarExtractParams): Promise<SidecarTable[]> {
  try {
    const result = await rpc<{ tables: SidecarTable[] }>("extract_tables", params as unknown as Record<string, unknown>);
    return result?.tables ?? [];
  } catch {
    return [];
  }
}

export async function shutdownTableSidecar(): Promise<void> {
  if (!proc) return;
  try {
    await rpc("shutdown");
  } catch {
    proc?.kill();
    proc = null;
  }
}

export { sidecarEnabled, SIDECAR_SCRIPT };
