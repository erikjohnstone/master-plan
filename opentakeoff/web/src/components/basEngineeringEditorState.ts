/** Surface-only editor structure. These helpers do not validate engineering,
 * interpret sources, calculate values or establish installed quantities. */
import { z } from 'zod';
import { basEngineeringCheckSchema, type BasEngineeringCheck } from '../lib/basEngineeringContract.ts';
import { basEngineeringRegisterSchema, type BasEngineeringRegister } from '../lib/basEngineeringRegister.ts';

export const ENGINEERING_LABELS: Record<BasEngineeringCheck['kind'], string> = {
  signal: 'Signal direction & mode', analog_range: 'Analog range & excitation', resistive_loading: 'Electrical loading',
  contact: 'Contact interface & ratings', pulse: 'Pulse timing', power: 'Power supply & loads', mechanical: 'Actuator & mechanical ratings',
  allocation: 'Endpoint & channel allocation', expansion: 'Controller expansion', serial_network: 'Serial network', ip_network: 'IP network & location',
};
export const engineeringCheckShape = (kind: BasEngineeringCheck['kind']) => basEngineeringCheckSchema.options.find(s => s.shape.kind.value === kind)!;
export function editorSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) return editorSchema(schema.innerType());
  if (schema instanceof z.ZodDefault) return editorSchema(schema.removeDefault());
  if (schema instanceof z.ZodOptional) return editorSchema(schema.unwrap());
  return schema;
}
export function engineeringRatingShape(raw: z.ZodTypeAny): z.AnyZodObject | null {
  const schema = editorSchema(raw);
  return schema instanceof z.ZodObject && schema.shape.basis && schema.shape.value ? schema : null;
}
/** UI windows never discard records or selections from the underlying draft. */
export function engineeringListWindow<T>(rows: readonly T[], query: string, page: number, label: (row: T) => string) {
  const filtered = rows.filter(row => label(row).toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.max(0, Math.min(Number.isFinite(page) ? Math.trunc(page) : 0, pages - 1));
  return { rows: filtered.slice(current * 50, (current + 1) * 50), page: current, pages, total: filtered.length };
}
export function engineeringArrayIndex(raw: unknown, length: number) {
  const value = Number(raw);
  return Math.max(0, Math.min(Number.isFinite(value) ? Math.trunc(value) : 0, Math.max(0, length - 1)));
}
/** Read an existing calculator input path without evaluating expressions or
 * following prototypes. Presentation only; never infer a missing input. */
export function engineeringInputAtPath(input: unknown, path: string): unknown {
  let value = input;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
/** Invalid blanks are deliberate: editing cannot invent a valid declaration. */
export function blankEngineeringValue(raw: z.ZodTypeAny): unknown {
  const schema = editorSchema(raw);
  if (schema instanceof z.ZodNullable) return null;
  if (schema instanceof z.ZodLiteral) return schema.value;
  if (schema instanceof z.ZodArray) return [];
  if (schema instanceof z.ZodObject) return Object.fromEntries(Object.entries(schema.shape).map(([key, child]) => [key, blankEngineeringValue(child as z.ZodTypeAny)]));
  if (schema instanceof z.ZodString || schema instanceof z.ZodNumber || schema instanceof z.ZodEnum || schema instanceof z.ZodBoolean) return '';
  throw new Error('Unsupported engineering editor field; no value was substituted');
}
export function newEngineeringCheck(kind: BasEngineeringCheck['kind'], equipmentId: string | null | undefined, checkId: string) {
  return { ...(blankEngineeringValue(engineeringCheckShape(kind)) as Record<string, unknown>), kind, check_id: checkId,
    equipment_ids: equipmentId ? [equipmentId] : [], reason: '' };
}
export function stageEngineeringCheck(register: BasEngineeringRegister, raw: unknown, target: unknown): BasEngineeringRegister {
  const check = basEngineeringCheckSchema.parse(raw);
  const checks = [...register.input.checks], targets = [...register.targets];
  const index = checks.findIndex(c => c.check_id === check.check_id);
  if (index < 0) checks.push(check); else checks[index] = check;
  const checkedTarget = basEngineeringRegisterSchema.shape.targets.element.parse(target);
  if (checkedTarget.check_id !== check.check_id) throw new Error('Check and target identities differ');
  const targetIndex = targets.findIndex(t => t.check_id === check.check_id);
  if (targetIndex < 0) targets.push(checkedTarget); else targets[targetIndex] = checkedTarget;
  return basEngineeringRegisterSchema.parse({ ...register, input: { ...register.input, checks }, targets });
}
export function stageEngineeringResource(register: BasEngineeringRegister, raw: unknown): BasEngineeringRegister {
  const resource = basEngineeringRegisterSchema.shape.resources.element.parse(raw), resources = [...register.resources];
  const index = resources.findIndex(r => r.resource_id === resource.resource_id);
  if (index < 0) resources.push(resource); else resources[index] = resource;
  return basEngineeringRegisterSchema.parse({ ...register, resources });
}
export function engineeringPreviewReady(preview: { draft: unknown; batch: unknown } | null, draft: unknown, batch: unknown, stale: boolean) {
  return !!preview && !!batch && preview.draft === draft && preview.batch === batch && !stale;
}
