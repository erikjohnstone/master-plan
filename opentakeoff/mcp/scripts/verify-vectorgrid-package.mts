/** Execute the unchanged source and relocated packaged runtime on selected
 * PDFs. Exact full replies, not a score and not independent table ground truth.
 * Usage: output-directory pdf page [pdf page ...]. No package installation. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { vectorGridServerPath } from '../../web/src/lib/vectorGridRuntime.mjs';
import { assertProofEqual as same } from './helpers/proofEquality.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [output, ...args] = process.argv.slice(2);
assert.ok(output && args.length > 0 && args.length % 2 === 0, 'Usage: output-directory pdf page [pdf page ...]');
const cases = Array.from({ length: args.length / 2 }, (_, i) => {
  const pdf = resolve(args[i * 2]); const page = Number(args[i * 2 + 1]);
  assert.ok(existsSync(pdf) && Number.isInteger(page) && page > 0, 'Each case needs an existing PDF and a positive page');
  return { pdf, page, sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex') };
});
const out = resolve(output); assert.equal(existsSync(out), false, 'Use a new evidence directory');
mkdirSync(out, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), 'ot-vectorgrid-runtime-proof-'));
const files = ['sidecar/tables.py', 'sidecar/vectorgrid_rpc.py', 'bakeoff/vectorgrid.py', 'bakeoff/celltext.py', 'bakeoff/bakeoff.py', 'bakeoff/boxfit.py'];
const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || 'python3';
type Reply = { id: number; result?: Record<string, any>; error?: { code: number; message: string } };

async function run(server: string, pdf: string, page: number) {
  const proc = spawn(python, ['-B', server], { cwd: temporary, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONPATH: '', PYTHONUNBUFFERED: '1' } });
  const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>();
  let stderr = Buffer.alloc(0), next = 0;
  proc.stderr.on('data', chunk => { stderr = Buffer.concat([stderr, chunk]).subarray(-65536); });
  const fail = (error: Error) => { for (const item of pending.values()) item.reject(error); pending.clear(); };
  proc.on('error', fail);
  proc.on('exit', code => fail(new Error(`Runtime exited ${code}: ${stderr.toString('utf8')}`)));
  const reader = createInterface({ input: proc.stdout });
  reader.on('line', line => {
    try {
      const reply = JSON.parse(line) as Reply; const item = pending.get(reply.id);
      if (item) { pending.delete(reply.id); item.resolve(reply); }
    } catch { fail(new Error(`Non-JSON runtime reply: ${line.slice(0, 200)}`)); }
  });
  async function call(method: string, params: Record<string, unknown>) {
    const id = ++next, start = performance.now();
    const reply = await new Promise<Reply>((resolveReply, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Runtime request timed out: ${method}`)); }, 180000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolveReply(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    return { reply, elapsed_ms: Math.round(performance.now() - start) };
  }
  try {
    const cold = await call('extract_grid', { pdfPath: pdf, page });
    assert.equal(cold.reply.error, undefined, cold.reply.error?.message);
    assert.equal(cold.reply.result?.space, 'pdf-points-topleft');
    const warm = await call('extract_grid', { pdfPath: pdf, page });
    assert.equal(warm.reply.error, undefined, warm.reply.error?.message);
    same(warm.reply.result, cold.reply.result, 'Cold/warm complete runtime reply');
    // An actual missing source must remain an explicit RPC error, never [] tables.
    const absent = await call('extract_grid', { pdfPath: join(temporary, 'absent.pdf'), page: 1 });
    assert.equal(absent.reply.error?.code, -32000);
    assert.equal(absent.reply.result, undefined);
    await call('shutdown', {});
    return { result: cold.reply.result!, cold_ms: cold.elapsed_ms, warm_ms: warm.elapsed_ms, missing_source_rejected: true, stderr: stderr.toString('utf8') };
  } finally { reader.close(); proc.kill(); }
}

const checks: Record<string, unknown>[] = [];
try {
  const packagedRoot = resolve(root, 'mcp/dist/python/vectorgrid');
  for (const file of files) same(readFileSync(resolve(packagedRoot, file)), readFileSync(resolve(root, file)), `Packaged bytes ${file}`);
  cpSync(packagedRoot, resolve(temporary, 'python/vectorgrid'), { recursive: true });
  const source = vectorGridServerPath(pathToFileURL(resolve(root, 'web/src/lib/vectorGridClient.ts')).href);
  const packaged = vectorGridServerPath(pathToFileURL(resolve(temporary, 'server-core.js')).href);
  assert.ok(packaged.startsWith(temporary));
  for (const [index, item] of cases.entries()) {
    console.error(JSON.stringify({ phase: 'source/package exact parity', ...item }));
    const a = await run(source, item.pdf, item.page), b = await run(packaged, item.pdf, item.page);
    same(b.result, a.result, 'Complete source/relocated-package reply');
    writeFileSync(join(out, `${index + 1}-exact-reply.json`), JSON.stringify(a.result));
    checks.push({ ...item, tables: a.result.tables.length, cells: a.result.tables.reduce((n: number, table: any) => n + table.cells.length, 0),
      source: { cold_ms: a.cold_ms, warm_ms: a.warm_ms }, packaged: { cold_ms: b.cold_ms, warm_ms: b.warm_ms },
      exact_reply_equal: true, missing_source_rejected: a.missing_source_rejected && b.missing_source_rejected,
      source_stderr: a.stderr, packaged_stderr: b.stderr });
    writeFileSync(join(out, 'checks.json'), JSON.stringify({ complete: false, python, checks }, null, 2));
  }
  writeFileSync(join(out, 'checks.json'), JSON.stringify({ complete: true, python, checks,
    limits: 'Exact runtime parity and package import closure on selected pages. Warm means a second request in the same Python process. Not independent table accuracy or a full corpus/holdout gate.' }, null, 2));
} catch (error) {
  writeFileSync(join(out, 'checks.json'), JSON.stringify({ complete: false, python, checks, error: String(error) }, null, 2)); throw error;
} finally { rmSync(temporary, { recursive: true, force: true }); }
