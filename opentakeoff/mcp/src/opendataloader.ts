// Node-only wrapper around the OpenDataLoader-PDF Java CLI
// (@opendataloader/pdf, Apache-2.0) — see web/src/lib/sheetgraph.ts's own
// "OpenDataLoader-PDF grid adapter" section for why and what this buys.
// This module owns the ONLY I/O (spawning the CLI, reading its JSON output
// back, resolving a usable Java runtime) — the actual JSON→ScheduleTable
// mapping is a pure function in sheetgraph.ts (scheduleTableFromODL) so it
// stays usable outside Node (the browser) if a caller ever gets ODL's JSON
// some other way.
import { convert } from "@opendataloader/pdf";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import cacache from "cacache";
import type { ODLTable } from "../../web/src/lib/sheetgraph.ts";

// Disk cache for ODL's own JSON output, keyed by (resolved PDF path, its own
// mtime+size, the exact page set requested, and the extraction method) —
// content-addressable via `cacache` (the same library `npm` itself uses for
// its real package cache under real concurrent installs), so multiple
// worker processes reading/writing the SAME cache dir at once is safe: each
// distinct key writes its own file, no shared-JSON-blob last-write-wins
// race like a single-file cache (flat-cache et al.) would have here.
//
// Why this exists: every eval script invocation (takeoff-eval.mjs,
// reference-eval.mjs, graph-eval.mjs) is its own fresh Node process, so
// Session.ensureGraph()'s in-memory `this.graph` memoization — real and
// correct within one process — buys nothing across runs. Without this, the
// SAME unchanged PDF gets its JVM re-spawned and OpenDataLoader's own
// table-clustering algorithm re-run from scratch on every single eval
// invocation, for every set, forever. Measured before this fix: navfac-
// cherry-point-atc-mechanical.pdf (75 sheets) alone cost 12+ real minutes
// per full-corpus eval run — paid dozens of times over one session by
// multiple concurrent workers plus the coordinator's own re-verification
// passes. A cache hit here returns in single-digit milliseconds.
//
// Deliberately NOT scoped to any one corpus or caller — general to any PDF
// this module is ever asked to process (a real production Session load, a
// corpus eval script, a worker's own diagnostic run), never corpus-specific
// per this project's own standing rule against baking corpus specifics into
// production code. Lives in a standard OS cache location, not inside any
// project or corpus directory.
const CACHE_VERSION = "cluster-v1";
const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "opentakeoff-odl");

async function odlCacheKey(pdfPath: string, pages: number[]): Promise<string | null> {
  let st;
  try {
    st = await stat(pdfPath);
  } catch {
    return null; // unreadable path — let the real convert() call below produce the real error
  }
  const sorted = [...new Set(pages)].sort((a, b) => a - b).join(",");
  const raw = `${CACHE_VERSION}|${path.resolve(pdfPath)}|${st.mtimeMs}|${st.size}|${sorted}`;
  return createHash("sha256").update(raw).digest("hex");
}

// @opendataloader/pdf's own convert() spawns the literal string "java" on
// whatever PATH the current Node process has (dist/index.js: `spawn("java",
// ...)`, no override). Amazon Corretto 8 — this machine's system-default
// `java` — is too old for the CLI's own jar (needs 11+). A modern JDK IS
// present via Homebrew but not the active `java` on PATH (keg-only,
// deliberately not symlinked over the system's own Java — that needs sudo,
// which this project's own standing rules forbid requesting/entering).
// Rather than requiring every caller/every machine to fix its own shell,
// resolve and prepend a working JDK's bin dir to THIS process's own
// env.PATH once — child_process.spawn with no explicit `env` inherits
// process.env, so this is enough for @opendataloader/pdf's own internal
// spawn to pick it up too, with no system-wide change and no sudo.
const CANDIDATE_JDK_BINS = [
  "/opt/homebrew/opt/openjdk/bin",
  "/usr/local/opt/openjdk/bin",
  "/opt/homebrew/opt/openjdk@21/bin",
  "/opt/homebrew/opt/openjdk@17/bin",
  "/usr/local/opt/openjdk@21/bin",
  "/usr/local/opt/openjdk@17/bin",
];

let javaReady: boolean | null = null;

function javaMajorVersion(javaBin: string): number | null {
  let r;
  try {
    r = spawnSync(javaBin, ["-version"], { encoding: "utf8" });
  } catch {
    return null;
  }
  if (r.error) return null;
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const m = out.match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const major = Number(m[1]);
  // old-style version strings ("1.8.0_392") report major=1, minor=8 — the
  // real major version is the minor field there; 9+ reports it directly.
  return major === 1 ? Number(m[2] || 0) : major;
}

/** Ensures a Java 11+ runtime is resolvable on PATH for this process (and
 * anything it spawns), returning true/false rather than throwing — callers
 * decide whether ODL's absence is a hard error or a silent fallback to the
 * existing geometric extraction (session.ts: silent fallback, always).
 * Cached: only probes the filesystem/spawns `java -version` once per
 * process, since neither the system Java nor Homebrew's install path
 * changes mid-run. */
export function ensureJavaAvailable(): boolean {
  if (javaReady !== null) return javaReady;
  const onPath = javaMajorVersion("java");
  if (onPath !== null && onPath >= 11) { javaReady = true; return true; }
  for (const dir of CANDIDATE_JDK_BINS) {
    const v = javaMajorVersion(path.join(dir, "java"));
    if (v !== null && v >= 11) {
      process.env.PATH = `${dir}:${process.env.PATH || ""}`;
      javaReady = true;
      return true;
    }
  }
  javaReady = false;
  return false;
}

export interface ODLRunResult { tables: ODLTable[]; error?: string }

/** Runs OpenDataLoader-PDF against specific pages of a PDF and returns every
 * detected table node it found there. Deterministic/local mode only (no
 * --hybrid — that needs a separately-running AI backend server, out of
 * scope here); --table-method cluster, the mode this integration was
 * validated against on the real corpus's own hardest table (AHU-1, 47
 * cols/3 header tiers, itd-d1-lab-mechanical.pdf#15) before being wired in.
 *
 * Never throws — returns {tables:[]} (with `error` set) on ANY failure
 * (no Java, a scanned/uncooperative PDF, a CLI crash): a caller building
 * the sheet graph must be able to silently fall back to the existing
 * geometric extractor, the same refusal-over-guessing discipline the rest
 * of this project already holds to. */
export async function runOpenDataLoaderPages(pdfPath: string, pages: number[]): Promise<ODLRunResult> {
  if (!pages.length) return { tables: [] };
  const cacheKey = await odlCacheKey(pdfPath, pages);
  if (cacheKey) {
    try {
      const hit = await cacache.get(CACHE_DIR, cacheKey);
      return JSON.parse(hit.data.toString("utf8"));
    } catch {
      // no cache entry (or a corrupt/unreadable one) — fall through to a
      // real run below, exactly as if caching didn't exist.
    }
  }
  if (!ensureJavaAvailable()) return { tables: [], error: "no Java 11+ runtime found on PATH" };
  let outDir: string | null = null;
  try {
    outDir = await mkdtemp(path.join(tmpdir(), "odl-"));
    await convert(pdfPath, {
      outputDir: outDir,
      format: "json",
      tableMethod: "cluster",
      pages: [...new Set(pages)].sort((a, b) => a - b).join(","),
      quiet: true,
    });
    const base = path.basename(pdfPath).replace(/\.pdf$/i, "");
    const jsonPath = path.join(outDir, `${base}.json`);
    const raw = JSON.parse(await readFile(jsonPath, "utf8"));
    const tables: ODLTable[] = [];
    const walk = (n: unknown) => {
      if (!n || typeof n !== "object") return;
      const node = n as Record<string, unknown>;
      if (node.type === "table") { tables.push(node as unknown as ODLTable); return; }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") walk(v);
      }
    };
    walk(raw);
    const result: ODLRunResult = { tables };
    if (cacheKey) await cacache.put(CACHE_DIR, cacheKey, JSON.stringify(result)).catch(() => {});
    return result;
  } catch (err) {
    return { tables: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (outDir) await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}
