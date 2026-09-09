// Exercise the packaged MCP server and its bundled Python engine over real stdio.
// The blank PDF is a transport fixture, not a real-source extraction proof.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'opentakeoff-bas-dist-'));
const client = new Client({ name: 'bas-dist-proof', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], cwd,
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)), stderr: 'pipe' });
let stderr = '';
transport.stderr?.on('data', (chunk) => { stderr += chunk.toString().slice(0, 4096-stderr.length); });
try {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const path = join(directory, 'blank-runtime-fixture.pdf');
  await writeFile(path, await pdf.save());
  await client.connect(transport);
  const loaded = await client.callTool({ name: 'load_plan', arguments: { path } });
  assert.notEqual(loaded.isError, true, JSON.stringify(loaded));
  const result = await client.callTool({ name: 'compile_corpus_takeoff', arguments: {
    kind: 'bas_points', bas_math: {
      group_overrides: [{ group_id: 'declared-group', quantity: 3 }],
      soo: [{ group_id: 'declared-group', point_id: 'explicit-fixture', physical: { AI: 7 },
        soft: [{ protocol: 'bacnet', variable_id: 'fixture:AV', quantity: 4 }] }],
      hardware: { profile_id: 'abstract-fixture', rigid: { AI: 8 } },
      spare: { numerator: 15, denominator: 100 },
      licenses: [{ pool: 'default', mode: 'packs', pack_size: 10 }],
      serial_routes: [{ route_id: 'declared-route', protocol: 'bacnet_mstp',
        max_devices: 4, max_load_microunits: 4_000_000, max_length_mm: 100_000,
        nodes: [0, 1, 2].map((n) => ({ node_id: `serial-${n}`, position_mm: n*1000, load_microunits: 1_000_000 })) }],
      ip_closets: [{ closet_id: 'declared-closet', ports: 4, reserved_ports_per_switch: 1,
        max_link_length_mm: 100_000, endpoints: [0, 1, 2].map((n) => ({ node_id: `ip-${n}`, link_length_mm: 1000 })) }],
    },
  } }, undefined, { timeout: 60_000 });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const output = result.structuredContent;
  assert.ok(output?.bas_math, JSON.stringify(result));
  const math = output.bas_math;
  assert.notEqual(math.status, 'unavailable', JSON.stringify(math));
  assert.equal(math.source_coverage, 'soo_only');
  assert.equal(math.project_complete, false);
  assert.deepEqual(math.physical_total, { AI: 21, AO: 0, DI: 0, DO: 0 });
  assert.equal(math.hardware[0].blocks_total, 6);
  assert.equal(math.licenses[0].weighted_points, 12);
  assert.equal(math.licenses[0].packs, 2);
  assert.equal(math.serial[0].segments.length, 1);
  assert.equal(math.ip[0].switches, 1);
  assert.deepEqual(JSON.parse(result.content.find((c) => c.type === 'text').text), output);
  console.log('Packaged MCP → shared Python: SOO-only, integer hardware, licenses, serial, IP and wire parity pass');
} catch (error) {
  if (stderr) console.error(stderr);
  throw error;
} finally {
  await client.close();
  // Only the explicitly created, uniquely named fixture directory is removed.
  await rm(directory, { recursive: true, force: true });
}
