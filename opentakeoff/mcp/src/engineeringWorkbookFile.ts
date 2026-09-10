/** Surface-specific filesystem delivery. Shared modules own all workbook data.
 * Stage complete bytes beside the destination, then atomically publish the one
 * file. A failed write or cancelled/stale snapshot cannot truncate a prior file. */
import { writeAtomicArtifact } from './atomicArtifactFile.ts';

export async function writeEngineeringWorkbook(path: string, bytes: Uint8Array, overwrite: boolean | undefined, beforeCommit: () => void) {
  await writeAtomicArtifact(path, 'xlsx', [bytes], overwrite, beforeCommit);
}
