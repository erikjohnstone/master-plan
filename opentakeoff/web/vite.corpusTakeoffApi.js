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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mcpRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../mcp");
const cli = resolve(mcpRoot, "scripts/production-graph-cli.mjs");

function runCli({ mode, kind, pdfPaths, outPath }) {
  return new Promise((resolvePromise, reject) => {
    const args = ["--import", "tsx", cli, "--mode", mode];
    if (kind) args.push("--kind", kind);
    for (const p of pdfPaths) args.push("--pdf", p);
    if (outPath) args.push("--out", outPath);
    const child = spawn(process.execPath, args, {
      cwd: mcpRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `production-graph-cli exited ${code}`));
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
  let pdfPaths = [];
  let tmpDir = null;
  if (ctype.includes("multipart/form-data")) {
    const mp = await readMultipart(req);
    kind = mp.fields.kind;
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
    if (Array.isArray(body.pdfPaths) && body.pdfPaths.length) {
      pdfPaths = body.pdfPaths;
    } else if (body.pdfPath) {
      pdfPaths = [body.pdfPath];
    } else {
      throw Object.assign(new Error("pdfPath or multipart file required"), { status: 400 });
    }
  }
  return { kind, pdfPaths, tmpDir };
}

async function handle(req, res, mode) {
  let tmpDir = null;
  try {
    const resolved = await resolvePdfs(req);
    tmpDir = resolved.tmpDir;
    const { kind, pdfPaths } = resolved;
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
    const result = await runCli({ mode: "compile", kind, pdfPaths });
    sendJson(res, 200, result);
  } catch (err) {
    console.error(`[production-graph-api ${mode}]`, err);
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
