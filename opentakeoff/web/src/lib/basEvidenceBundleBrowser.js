/** Browser-only Blob delivery. All content, ownership and limits are shared. */
export async function createBasEvidenceBundleBlob(prepared, load, guard) {
  const chunks = [];
  for await (const chunk of prepared.stream(load, guard)) chunks.push(chunk);
  guard();
  const blob = new Blob(chunks, { type: 'application/zip' });
  guard(); return blob;
}
