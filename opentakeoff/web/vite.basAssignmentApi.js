/** HTTP/process transport only. No extraction, interpretation or arithmetic. */
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIMIT = 32 * 1024 * 1024;
const mcpRoot = fileURLToPath(new URL('../mcp/', import.meta.url));
const cli = fileURLToPath(new URL('../mcp/scripts/bas-assignment-cli.mts', import.meta.url));
const send = (res, status, value) => {
  if (res.destroyed) return;
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
};

export function basAssignmentMiddleware(resolveLoader) {
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/__ot/bas-assignment-demand') return next();
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON required' });
    // Browser cross-origin calls are not a supported calculation entry point.
    // This is not authentication; local server access remains a host concern.
    try {
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) {
        return send(res, 403, { error: 'Same-origin calculation required' });
      }
    } catch { return send(res, 403, { error: 'Invalid request origin' }); }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > LIMIT) return send(res, 413, { error: 'BAS assignment input exceeds 32 MiB' });
        chunks.push(chunk);
      }
      const input = Buffer.concat(chunks);
      JSON.parse(input.toString('utf8')); // Fail malformed transport before spawn.
      const child = spawn(process.execPath, ['--import', pathToFileURL(resolveLoader()).href, cli], {
        cwd: mcpRoot, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let settled = false, outputSize = 0;
      const output = [];
      const stop = () => {
        child.kill('SIGTERM'); // CLI cancels its owned Python child first.
        const forced = setTimeout(() => child.kill('SIGKILL'), 2000);
        forced.unref(); child.once('close', () => clearTimeout(forced));
      };
      const finish = (status, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        res.off('close', cancelled);
        if (status !== 200) stop();
        send(res, status, value);
      };
      const cancelled = () => { if (!settled) { settled = true; clearTimeout(timer); stop(); } };
      const timer = setTimeout(() => finish(504, { error: 'BAS assignment calculation timed out; no result accepted' }), 45_000);
      res.on('close', cancelled);
      child.stdin.on('error', () => {});
      child.stderr.on('data', () => {}); // Never echo private source/process output.
      child.on('error', () => finish(503, { error: 'BAS assignment process unavailable' }));
      child.stdout.on('data', chunk => {
        outputSize += chunk.length;
        if (outputSize > LIMIT) return finish(502, { error: 'BAS assignment output exceeds 32 MiB' });
        output.push(chunk);
      });
      child.on('close', code => {
        if (settled) return;
        try {
          const value = JSON.parse(Buffer.concat(output).toString('utf8'));
          finish(code === 0 ? 200 : 422, value);
        } catch { finish(502, { error: 'Invalid BAS assignment response; no result accepted' }); }
      });
      child.stdin.end(input);
    } catch (error) {
      send(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'Invalid JSON' : 'BAS assignment transport unavailable' });
    }
  };
}
