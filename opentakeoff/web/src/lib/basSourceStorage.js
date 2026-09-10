// Browser storage encoding only. Chunk boundaries have no PDF/page meaning.
// Below Chromium's per-record serialization limit; old array records still read.
export const BAS_SOURCE_CHUNK_BYTES = 8 * 1024 * 1024;
export const basSourceChunkKey = (projectId, sourceId, index) => ['bas_source_chunk_v1', projectId || '', sourceId, index];
export const basSourceChunkCount = source => Math.ceil(source.byte_length / BAS_SOURCE_CHUNK_BYTES);
export const basSourceChunkLength = (source, index) => Math.min(BAS_SOURCE_CHUNK_BYTES, source.byte_length - index * BAS_SOURCE_CHUNK_BYTES);
export function basSourceChunkRecord(source) {
  return { schema_version: 'bas_original_pdf_chunks_v1', source,
    chunk_bytes: BAS_SOURCE_CHUNK_BYTES, chunk_count: basSourceChunkCount(source) };
}
export function isBasSourceChunkRecord(record) {
  return record?.schema_version === 'bas_original_pdf_chunks_v1' && record.chunk_bytes === BAS_SOURCE_CHUNK_BYTES
    && record.chunk_count === basSourceChunkCount(record.source);
}
