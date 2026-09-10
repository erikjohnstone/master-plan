/** Bounded JSON transport to the same BAS services used by MCP. */
import { z } from 'zod';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { applyBasEngineeringReview, inspectBasEngineering } from '../src/basEngineeringReview.ts';
import { basEngineeringCommandSchema } from '../../web/src/lib/basEngineeringRegister.ts';
import { writeJsonAndExit } from './cliJson.mjs';

const limit = 32 * 1024 * 1024;
const cancelled = new AbortController();
process.once('SIGTERM', () => cancelled.abort());
let label = 'BAS';
try {
  const kind = z.enum(['assignment', 'assembly', 'engineering']).parse(process.argv[2] ?? 'assignment');
  label = kind === 'engineering' ? 'BAS engineering' : 'BAS quantity';
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.length;
    if (bytes > limit) throw new Error(`BAS ${kind} input exceeds 32 MiB`);
    chunks.push(data);
  }
  const payload = z.object({ workflow: z.unknown(), request: z.unknown() }).strict().parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  let result;
  if (kind === 'engineering') {
    const command = basEngineeringCommandSchema.parse(payload.request);
    result = command.action === 'inspect'
      ? await inspectBasEngineering(payload.workflow, command.request.capture_id, { signal: cancelled.signal })
      : await applyBasEngineeringReview(payload.workflow, command.request, 'operator_input', { signal: cancelled.signal });
  } else {
    const calculate = kind === 'assembly' ? calculateBasAssemblies : calculateBasAssignments;
    result = await calculate(payload.workflow, payload.request, { signal: cancelled.signal });
  }
  if (Buffer.byteLength(JSON.stringify(result)) > limit) throw new Error(`BAS ${kind} output exceeds 32 MiB`);
  await writeJsonAndExit(result);
} catch (error) {
  const message = error instanceof z.ZodError ? `Invalid ${label} payload` : error instanceof Error ? error.message : `${label} operation unavailable`;
  await new Promise<void>(resolve => process.stdout.write(JSON.stringify({ error: message }), () => resolve()));
  process.exitCode = 2;
}
