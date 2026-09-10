/** Surface-only draft bookkeeping. Staging is NOT BAS validation or saving.
 * The complete register still goes through the shared validator/transaction. */
import { basAssemblyComponentSchema, type BasAssemblyRegister } from '../lib/basAssemblyRegister.ts';

export function stageAssemblyComponent(register: BasAssemblyRegister, raw: unknown): BasAssemblyRegister {
  const component = basAssemblyComponentSchema.parse(raw);
  const next = structuredClone(register);
  const index = next.components.findIndex(c => c.component_id === component.component_id);
  if (index < 0) next.components.push(component); else next.components[index] = component;
  return next;
}

export function stageAssemblyWithdrawal(register: BasAssemblyRegister, componentId: string, reason: string): BasAssemblyRegister {
  if (!reason.trim()) throw new Error('Record why this component is being withdrawn.');
  if (!register.components.some(c => c.component_id === componentId)) throw new Error('The component is not in this assembly draft.');
  return { ...structuredClone(register), components: register.components.filter(c => c.component_id !== componentId).map(c => structuredClone(c)) };
}

export function assemblyPreviewReady(preview: { input: unknown; batch: unknown } | null,
  draft: unknown, batch: unknown, stale: boolean): boolean {
  return preview !== null && (draft != null || batch != null) && preview.input === draft && preview.batch === batch && !stale;
}
