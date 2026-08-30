/**
 * Vite plugin: production Session + ODL graph for the Takeoff UI.
 *
 * Endpoints (dev server):
 *   POST /__ot/sheet-graph              → SheetGraph (geometric + ODL)
 *   POST /__ot/compile-corpus-takeoff   → compileCorpusTakeoff on that graph
 *
 * Same MCP Session.graphForPipeline() path every blueprint uses — not a
 * takeoff-only fork. Body: JSON { pdfPath } or multipart file(s) + kind.
 */
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const mcpRoot = resolve(webRoot, "../mcp");
const cli = resolve(mcpRoot, "scripts/production-graph-cli.mjs");

/**
 * Resolve the tsx ESM loader to an absolute file URL/path so
 * `node --import <tsx>` works even when:
 *   - only `opentakeoff/web` was npm-installed (tsx lives under web/)
 *   - mcp has tsx as a dependency but node_modules is incomplete
 * Bare `--import tsx` with cwd=mcp fails with ERR_MODULE_NOT_FOUND when
 * mcp/node_modules/tsx is missing — that broke every compile_corpus_takeoff
 * in the Takeoff UI (valve/HVAC/BAS).
 */
export function resolveTsxLoader() {
  const bases = [
    mcpRoot,
    webRoot,
    resolve(webRoot, ".."),
    process.cwd(),
  ];
  const tried = [];
  for (const base of bases) {
    const pkg = join(base, "package.json");
    if (!existsSync(pkg)) {
      tried.push(`${base} (no package.json)`);
      continue;
    }
    try {
      const req = createRequire(pkg);
      const resolved = req.resolve("tsx");
      tried.push(`${base} → ${resolved}`);
      if (resolved) return resolved;
    } catch (err) {
      tried.push(`${base} → ${err?.code || err?.message || err}`);
    }
  }
  // Last resort: known relative install layouts
  for (const candidate of [
    resolve(mcpRoot, "node_modules/tsx/dist/loader.mjs"),
    resolve(webRoot, "node_modules/tsx/dist/loader.mjs"),
  ]) {
    if (existsSync(candidate)) return candidate;
    tried.push(`${candidate} (missing)`);
  }
  throw new Error(
    "Cannot resolve 'tsx' for production Session+ODL compile. "
    + "Install dependencies in opentakeoff/mcp (and/or opentakeoff/web): "
    + "`npm install`. Tried: "
    + tried.join("; "),
  );
}

function runCli({ mode, kind, pdfPaths, outPath, service, onProgress }) {
  return new Promise((resolvePromise, reject) => {
    let tsxLoader;
    try {
      tsxLoader = resolveTsxLoader();
    } catch (err) {
      reject(err);
      return;
    }
    // Prefer file URL so Node resolves the loader regardless of cwd.
    const importSpec = pathToFileURL(tsxLoader).href;
    const args = ["--import", importSpec, cli, "--mode", mode];
    if (kind) args.push("--kind", kind);
    if (service) args.push("--service", String(service).toUpperCase());
    for (const p of pdfPaths) args.push("--pdf", p);
    if (outPath) args.push("--out", outPath);
    const child = spawn(process.execPath, args, {
      cwd: mcpRoot,
      env: {
        ...process.env,
        // Help Node find peer deps of tsx / mcp packages from either tree.
        NODE_PATH: [resolve(mcpRoot, "node_modules"), resolve(webRoot, "node_modules"), process.env.NODE_PATH]
          .filter(Boolean)
          .join(":"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stderrBuf = "";
    const consumeProgressLine = (line) => {
      if (!line.startsWith("OT_PROGRESS\t")) return;
      if (typeof onProgress !== "function") return;
      try {
        onProgress(JSON.parse(line.slice("OT_PROGRESS\t".length)));
      } catch {
        /* ignore malformed progress */
      }
    };
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => {
      const chunk = String(d);
      stderr += chunk;
      stderrBuf += chunk;
      const parts = stderrBuf.split("\n");
      stderrBuf = parts.pop() || "";
      for (const line of parts) consumeProgressLine(line.trim());
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (stderrBuf.trim()) consumeProgressLine(stderrBuf.trim());
      if (code !== 0) {
        // Strip progress lines from the error surface so the real failure shows.
        const errText = stderr
          .split("\n")
          .filter((l) => !l.startsWith("OT_PROGRESS\t"))
          .join("\n")
          .trim();
        reject(new Error(errText || `production-graph-cli exited ${code}`));
        return;
      }
      const line = stdout.trim().split("\n").filter(Boolean).at(-1);
      try {
        resolvePromise(JSON.parse(line));
      } catch (err) {
        reject(new Error(`bad CLI JSON: ${err.message}; stdout=${stdout.slice(0, 400)}`));
      }
    });
  });
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new Error("multipart boundary missing");
  const boundary = m[1] || m[2];
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const parts = buf.toString("binary").split(`--${boundary}`);
  const out = { fields: {}, files: [] };
  for (const part of parts) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const sep = part.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const head = part.slice(0, sep);
    let body = part.slice(sep + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    const nameMatch = /name="([^"]+)"/i.exec(head);
    const fileMatch = /filename="([^"]*)"/i.exec(head);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (fileMatch) {
      out.files.push({
        field: name,
        filename: fileMatch[1] || "plan.pdf",
        bytes: Buffer.from(body, "binary"),
      });
    } else {
      out.fields[name] = Buffer.from(body, "binary").toString("utf8");
    }
  }
  return out;
}

function sendJson(res, status, obj) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

async function resolvePdfs(req) {
  const ctype = req.headers["content-type"] || "";
  let kind;
  let service = null;
  let pdfPaths = [];
  let tmpDir = null;
  if (ctype.includes("multipart/form-data")) {
    const mp = await readMultipart(req);
    kind = mp.fields.kind;
    service = mp.fields.service || null;
    if (!mp.files.length) throw Object.assign(new Error("file required"), { status: 400 });
    tmpDir = await mkdtemp(join(tmpdir(), "ot-prod-graph-"));
    for (const f of mp.files) {
      const name = f.filename.replace(/[^\w.-]+/g, "_") || "plan.pdf";
      const pdfPath = join(tmpDir, name);
      await writeFile(pdfPath, f.bytes);
      pdfPaths.push(pdfPath);
    }
  } else {
    const body = await readJson(req);
    kind = body.kind;
    service = body.service || null;
    if (Array.isArray(body.pdfPaths) && body.pdfPaths.length) {
      pdfPaths = body.pdfPaths;
    } else if (body.pdfPath) {
      pdfPaths = [body.pdfPath];
    } else {
      throw Object.assign(new Error("pdfPath or multipart file required"), { status: 400 });
    }
  }
  return { kind, service, pdfPaths, tmpDir };
}

function wantsProgressStream(req) {
  const accept = String(req.headers.accept || "");
  return /application\/x-ndjson/i.test(accept) || /text\/event-stream/i.test(accept);
}

function beginNdjson(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function writeNdjson(res, obj) {
  res.write(`${JSON.stringify(obj)}\n`);
}

async function handle(req, res, mode) {
  let tmpDir = null;
  const stream = mode === "compile" && wantsProgressStream(req);
  try {
    const resolved = await resolvePdfs(req);
    tmpDir = resolved.tmpDir;
    const { kind, service, pdfPaths } = resolved;
    if (mode === "compile" && !kind) {
      return sendJson(res, 400, { error: "kind required" });
    }
    if (mode === "graph") {
      const outPath = join(tmpDir || await mkdtemp(join(tmpdir(), "ot-graph-out-")), "graph.json");
      if (!tmpDir) tmpDir = resolve(outPath, "..");
      await runCli({ mode: "graph", pdfPaths, outPath });
      const raw = await readFile(outPath, "utf8");
      return sendJson(res, 200, raw);
    }
    if (stream) {
      beginNdjson(res);
      writeNdjson(res, {
        type: "progress",
        phase: "upload",
        message: `Plans received (${pdfPaths.length} PDF${pdfPaths.length === 1 ? "" : "s"}) — starting Session+ODL compile…`,
      });
      const result = await runCli({
        mode: "compile",
        kind,
        pdfPaths,
        service,
        onProgress: (p) => writeNdjson(res, { type: "progress", ...p }),
      });
      writeNdjson(res, { type: "result", result });
      res.end();
      return;
    }
    const result = await runCli({ mode: "compile", kind, pdfPaths, service });
    sendJson(res, 200, result);
  } catch (err) {
    console.error(`[production-graph-api ${mode}]`, err);
    if (stream && res.headersSent) {
      writeNdjson(res, { type: "error", error: String(err?.message || err) });
      res.end();
      return;
    }
    sendJson(res, err.status || 500, { error: String(err?.message || err) });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function corpusTakeoffApiPlugin() {
  return {
    name: "opentakeoff-production-graph-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/__ot/sheet-graph")) {
          if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
          return handle(req, res, "graph");
        }
        if (req.url?.startsWith("/__ot/compile-corpus-takeoff")) {
          if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
          return handle(req, res, "compile");
        }
        return next();
      });
    },
  };
}
