// A fresh browser can finish indexing while the startup navigator is still
// showing. Open its first real sheet through the ordinary UI, when present.
// Never force clicks through overlays or mutate application state for setup.
export async function openImportedSheet(page) {
  const openSheet = page.getByTitle('Open just this sheet', { exact: true }).first();
  if (await openSheet.isVisible()) await openSheet.click();
}
