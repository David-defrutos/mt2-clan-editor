// Keep the browser filter aligned with the server's namespace-aware adapter check.
export function matchesMechanic(data: unknown, rule: {names?: string[]; selector?: string; modReferences?: string[]; requires?: {names?: string[]; selector?: string; modReferences?: string[]}[]}): boolean {
  if (rule.requires?.some(condition => !matchesMechanic(data, condition))) return false;
  if (!rule.names) return true;
  const value = (rule.selector ?? 'name').split('.').reduce<unknown>((value,key)=>value && typeof value==='object' ? (value as Record<string,unknown>)[key] : undefined,data);
  const reference = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
  const name = reference ? reference.id : value;
  if (typeof name !== 'string' || !rule.names.includes(name)) return false;
  return rule.modReferences ? typeof reference?.mod_reference === 'string' && rule.modReferences.includes(reference.mod_reference) : reference?.mod_reference === undefined;
}
