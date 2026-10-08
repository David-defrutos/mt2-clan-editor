import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';
import { inventoryAssets } from './assets.js';
import type { ClanSnapshot } from './types.js';
type Role = { section: string; path: string; label: string; group: string; target: string; next?: string; type?: string; size: string; conditional?: boolean };
function at(value: unknown, field: string): unknown { return field.split('.').reduce<unknown>((v, key) => v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[key] : undefined, value); }
function locations(value: unknown, parts: string[], prefix = ''): { value: unknown; path: string }[] {
  if (!parts.length) return [{ value, path: prefix }];
  const [part, ...rest] = parts; const many = part.endsWith('[]'); const key = many ? part.slice(0, -2) : part;
  const next = at(value, key); const full = prefix ? prefix + '.' + key : key;
  if (many) return Array.isArray(next) ? next.flatMap((item, index) => locations(item, rest, full + '.' + index)) : [{ value: undefined, path: full }];
  return locations(next, rest, full);
}
export async function artChecklist(clan: ClanSnapshot) {
  const rules: { roles: Role[] } = JSON.parse(await fs.readFile(path.join(configRoot, 'art-checklist.json'), 'utf8'));
  const assets = await inventoryAssets(clan);
  function resolve(value: unknown, target: string, next?: string): { status: string; note: string; image?: string; width?: number; height?: number } {
    if (value === undefined || value === null || value === '') return { status: 'undeclared', note: 'Sin referencia declarada; revisar si este clan necesita el recurso.' };
    if (typeof value === 'object') {
      const object = value as Record<string, unknown>;
      if (object.mod_reference || object.asset_name || object.asset_guid) return { status: 'external', note: 'Recurso externo o del juego; requiere comprobación manual.' };
      value = object.id;
    }
    if (typeof value !== 'string') return { status: 'unresolved', note: 'Formato de referencia no soportado.' };
    if (!value.startsWith('@')) return { status: 'external', note: 'Referencia del juego o recurso externo; no se inspecciona su imagen local.' };
    const matches = clan.entries.filter(e => e.section === target && e.id === value.slice(1));
    if (matches.length !== 1) return { status: 'unresolved', note: matches.length ? 'ID duplicado en la sección de destino.' : 'No se encuentra la definición local.' };
    const entry = matches[0];
    if (next) return resolve(at(entry.data, next), 'sprites');
    const asset = assets.find(a => a.section === target && a.id === entry.id && a.file === entry.file);
    if (!asset) return { status: 'unresolved', note: 'El recurso no está cubierto por el inventario.' };
    return { status: asset.status, note: asset.status === 'external' ? 'Contenido de bundle o del juego; revisar inventario de bundles y comprobar en partida.' : asset.status === 'ok' ? 'Archivo legible. Transparencia, encuadre y resultado en juego pendientes de revisión visual.' : 'Revisar ruta, archivo y mayúsculas.', image: asset.status==='external'?undefined:asset.image, width: asset.width, height: asset.height };
  }
  const rows = rules.roles.flatMap(role => clan.entries.filter(e => e.section === role.section && (!role.type || e.data.type === role.type)).flatMap(entry => locations(entry.data, role.path.split('.')).map(location => {
    const result = role.target === 'file' ? (() => {
      const asset = assets.find(a => a.section === entry.section && a.id === entry.id && a.file === entry.file);
      return asset ? { status: asset.status, image: asset.image, width: asset.width, height: asset.height, note: 'Símbolo de tooltip; comprobar apariencia y referencias en texto.' } : { status: 'unresolved', note: 'Recurso fuera del inventario.' };
    })() : resolve(location.value, role.target, role.next);
    return { group: role.group, label: role.label, conditional: Boolean(role.conditional), size: role.size, section: entry.section, id: entry.id, name: entry.name, file: entry.file, field: location.path, reference: location.value, ...result };
  })));
  return { rows };
}
