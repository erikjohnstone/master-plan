// ASSEMBLIES goal, WP5.4 — the starter library for the browser. It is loaded
// on demand: the typicals file is large, so it stays out of the main bundle.
// It goes through the same load gate as the MCP tool's copy (mcp/src/assemblies.ts).
import { sanitizeAssemblyDefinitions, type AssemblyDefinition } from "./schema";

export async function loadStarterLibrary(): Promise<AssemblyDefinition[]> {
  const [typicals, hookups] = await Promise.all([
    import("./starter/us-typicals-v1.json", { with: { type: "json" } }),
    import("./starter/us-hookups-v1.json", { with: { type: "json" } }),
  ]);
  const raw = [...(typicals.default.assemblies as unknown[]), ...(hookups.default.assemblies as unknown[])];
  const { assemblies, rejected } = sanitizeAssemblyDefinitions(raw);
  if (rejected.length) throw new Error(`the starter library failed its own gate: ${rejected.map((r) => `${r.id}: ${r.errors[0]}`).join("; ")}`);
  return assemblies;
}
