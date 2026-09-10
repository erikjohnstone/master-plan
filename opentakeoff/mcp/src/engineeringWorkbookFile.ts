/** Surface-specific filesystem delivery. Shared modules own all workbook data.
 * Stage complete bytes beside the destination, then atomically publish the one
 * file. A failed write or cancelled/stale snapshot cannot truncate a prior file. */
import { mkdtemp, open, rename, link, unlink, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertWritable } from './safewrite.ts';

export async function writeEngineeringWorkbook(path: string, bytes: Uint8Array, overwrite: boolean | undefined, beforeCommit: () => void) {
  await assertWritable(path, 'xlsx', overwrite);
  const staging = await mkdtemp(join(dirname(path), '.opentakeoff-engineering-'));
  const pending = join(staging, 'pending.xlsx');
  try {
    const file = await open(pending, 'wx');
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    beforeCommit();
    if (overwrite === true) await rename(pending, path);
    else await link(pending, path); // Atomic no-replace, including an absent-file race.
  } finally {
    await unlink(pending).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await rmdir(staging);
  }
}
