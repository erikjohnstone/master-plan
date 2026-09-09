/** Surface-specific preview lifecycle, not BAS interpretation or readiness. */
export function equipmentPreviewReady(preview: { input: unknown } | null, draft: unknown, stale: boolean): boolean {
  return preview !== null && draft != null && preview.input === draft && !stale;
}
