import {atField} from './field-paths.js';
export interface MechanicRule {names?: string[]; selector?: string; modReferences?: string[]; requires?: {names?: string[]; selector?: string; modReferences?: string[]}[]}
export function matchesMechanic(data: unknown, rule: MechanicRule): boolean {
  if (rule.requires?.some(condition => !matchesMechanic(data, condition))) return false;
  if (!rule.names) return true;
  const value = atField(data, rule.selector ?? 'name');
  const reference = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
  const name = reference ? reference.id : value;
  if (typeof name !== 'string' || !rule.names.includes(name)) return false;
  return rule.modReferences ? typeof reference?.mod_reference === 'string' && rule.modReferences.includes(reference.mod_reference) : reference?.mod_reference === undefined;
}
