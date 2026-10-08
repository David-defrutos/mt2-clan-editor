import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';

export interface PoolReferenceRules {
  itemField: string; countField: string; minimumCount: number; maximumEditableCount: number;
  fields: {section: string; path: string}[];
}
export async function poolReferenceRules(): Promise<PoolReferenceRules> {
  const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'pool-references.json'), 'utf8')) as PoolReferenceRules;
  if (!rules.itemField || !rules.countField || rules.itemField === rules.countField || !Number.isSafeInteger(rules.minimumCount) || rules.minimumCount < 1 || !Number.isSafeInteger(rules.maximumEditableCount) || rules.maximumEditableCount < rules.minimumCount || !Array.isArray(rules.fields)) throw new Error('Configuración de referencias de pool inválida.');
  return rules;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function countedPoolReference(value: unknown, rules: PoolReferenceRules): boolean {
  const object = record(value);
  return Boolean(object && (Object.hasOwn(object, rules.itemField) || Object.hasOwn(object, rules.countField)));
}
// Only callers handling a configured pool list should use this parser. Effect
// parameters and other references do not support the item/count wrapper.
export function poolReference(value: unknown, rules: PoolReferenceRules): {id: string; count: number; modReference?: string} | undefined {
  let count = 1;
  const wrapper = record(value);
  if (countedPoolReference(value, rules)) {
    const amount = wrapper![rules.countField];
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < rules.minimumCount || !Object.hasOwn(wrapper!, rules.itemField)) return;
    count = amount; value = wrapper![rules.itemField];
  }
  const reference = record(value);
  const id = reference ? reference.id : value;
  if (typeof id !== 'string' || !id.trim()) return;
  const mod = reference?.mod_reference;
  if (mod !== undefined && (typeof mod !== 'string' || !mod.trim())) return;
  return { id, count, ...(typeof mod === 'string' ? {modReference: mod} : {}) };
}
export function localPoolReference(value: unknown, rules: PoolReferenceRules): string | undefined {
  const reference = poolReference(value, rules);
  return reference?.modReference === undefined ? reference?.id : undefined;
}
export function invalidCountedPoolReference(value: unknown, rules: PoolReferenceRules): boolean {
  return countedPoolReference(value, rules) && !poolReference(value, rules);
}
export function poolListIds(value: unknown, rules: PoolReferenceRules): string[] {
  return Array.isArray(value) ? value.map(item => localPoolReference(item, rules)).filter((id): id is string => id !== undefined) : [];
}
