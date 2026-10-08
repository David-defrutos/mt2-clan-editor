export function validClassReference(value: unknown): boolean {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const id = object ? object.id : value;
  return typeof id === 'string' && /^@?[A-Za-z_][A-Za-z0-9_]*$/.test(id)
    && (!object || object.mod_reference === undefined || typeof object.mod_reference === 'string' && object.mod_reference.trim().length > 0);
}
