/** Expand configured [] slots only for existing array elements. */
export function fieldLocations(data: unknown, pattern: string, prefix = ''): string[] {
  const [part, ...rest] = pattern.split('.');
  const many = part.endsWith('[]'); const key = many ? part.slice(0, -2) : part;
  if (!data || typeof data !== 'object') return pattern.includes('[]') ? [] : [prefix ? prefix + '.' + pattern : pattern];
  const next = (data as Record<string, unknown>)[key]; const full = prefix ? prefix + '.' + key : key;
  if (many) return Array.isArray(next) ? next.flatMap((value, index) => rest.length ? value && typeof value==='object' ? fieldLocations(value, rest.join('.'), full + '.' + index) : [] : [full + '.' + index]) : [];
  return rest.length ? fieldLocations(next, rest.join('.'), full) : [full];
}
export function atField(data: unknown, field: string): unknown {
  return field.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, data);
}
export function jsonPath(field: string): (string | number)[] {
  return field.split('.').map(key => /^\d+$/.test(key) ? Number(key) : key);
}
