/** Surface-specific delivery shared by workbook and evidence bundle exports. */
import { mkdtemp, open, rename, link, unlink, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertWritable } from './safewrite.ts';

export async function writeAtomicArtifact(path: string, kind: 'xlsx' | 'zip' | 'json', chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  overwrite: boolean | undefined, beforeCommit: () => void) {
  await assertWritable(path, kind, overwrite);
  const staging = await mkdtemp(join(dirname(path), '.opentakeoff-artifact-')), pending = join(staging, `pending.${kind}`);
  try {
    const file = await open(pending, 'wx');
    try { for await (const bytes of chunks) await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    beforeCommit();
    if (overwrite === true) await rename(pending, path);
    else await link(pending, path);
  } finally {
    await unlink(pending).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await rmdir(staging);
  }
}
