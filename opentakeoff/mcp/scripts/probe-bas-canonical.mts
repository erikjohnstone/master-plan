/** Same retained workflow serialized repeatedly in separate baseline/candidate
 * processes. No source, expected value, corpus key or workflow mutation. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { boundedCanonicalCandidate } from '../../web/test/helpers/basCanonicalCandidate.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/scope-browser-7/reviewed.takeoff.json', import.meta.url));
const value = JSON.parse(raw.toString()), mode = process.argv[2];
if (!['baseline', 'candidate'].includes(mode)) throw new Error('Choose baseline or candidate');
const serialize = mode === 'baseline' ? canonicalBasJson : boundedCanonicalCandidate;
const rss = process.memoryUsage().rss, start = performance.now(); let result = '';
for (let n = 0; n < 30; n++) result = serialize(value);
console.log(JSON.stringify({ mode, runs: 30, elapsed_ms: performance.now() - start,
  incremental_peak_rss: Math.max(0, process.resourceUsage().maxRSS * 1024 - rss), bytes: Buffer.byteLength(result),
  sha256: createHash('sha256').update(result).digest('hex') }));
