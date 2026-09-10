/** Node byte delivery only. Source identity is enforced by the shared verifier. */
import { open } from 'node:fs/promises';
import { verifyBasSourceBytes, type BasSourceInventoryItem } from '../../web/src/lib/basSourceRetention.ts';

export async function readBasOriginalFile(path: string, source: BasSourceInventoryItem['source'], guard = () => {}) {
  guard();
  const file = await open(path, 'r');
  try {
    const info = await file.stat(); guard();
    if (!info.isFile() || info.size !== source.byte_length) throw new Error('Original PDF length mismatch or not a regular file');
    const bytes = new Uint8Array(info.size); let done = 0;
    while (done < bytes.length) {
      guard();
      const result = await file.read(bytes, done, Math.min(1024 * 1024, bytes.length - done), done);
      if (!result.bytesRead) throw new Error('Original PDF changed or was truncated during reading');
      done += result.bytesRead;
    }
    if ((await file.read(new Uint8Array(1), 0, 1, bytes.length)).bytesRead) throw new Error('Original PDF changed during reading');
    guard(); const verified = await verifyBasSourceBytes(source, bytes); guard(); return verified;
  } finally { await file.close(); }
}
