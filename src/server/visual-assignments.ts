import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';
import { scanClan } from './scan.js';
import { inventoryAssets } from './assets.js';
import { prepareEdit, saveEdit, type EditRequest } from './edit.js';
import type { ClanSnapshot } from './types.js';
import { atField, fieldLocations } from './field-paths.js';

interface Rule { section: string; path: string; label: string; sourceSection: string; sourceType?: string; spritePath?: string; destinationType?: string }
export interface VisualRequest { root: string; section: string; file: string; id: string; field: string; targetId: string; expectedHash: string }
const at = atField;
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as Record<string, unknown>; if (object.mod_reference) return; value = object.id; }
  return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : undefined;
}
function references(value: unknown, id: string): boolean {
  if (ref(value) === id) return true;
  if (Array.isArray(value)) return value.some(item => references(item, id));
  return Boolean(value && typeof value === 'object' && !(value as Record<string, unknown>).mod_reference && Object.values(value).some(item => references(item, id)));
}
async function rules(): Promise<Rule[]> { return JSON.parse(await fs.readFile(path.join(configRoot, 'visual-assignments.json'), 'utf8')).assignments; }
export async function visualCatalog(clan: ClanSnapshot, section: string, owner?: { id: string; file: string }) {
  const destination = owner ? clan.entries.find(e => e.section === section && e.id === owner.id && e.file === owner.file) : undefined;
  const assignments = (await rules()).filter(rule => rule.section === section).flatMap(rule => rule.path.includes('[]') ? destination ? fieldLocations(destination.data, rule.path).map((path, i) => ({ ...rule, path, label: rule.label + ' · ' + (i + 1) })) : [] : [rule]);
  const assets = assignments.length ? await inventoryAssets(clan) : [];
  return assignments.map(rule => {
    const entries = clan.entries.filter(entry => entry.section === rule.sourceSection && entry.data.id===entry.id && (!rule.sourceType || entry.data.type === rule.sourceType));
    const counts = new Map<string, number>();
    for (const entry of clan.entries.filter(entry => entry.section === rule.sourceSection)) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    return { path: rule.path, label: rule.label, destinationType: rule.destinationType, copyable: ['cards', 'characters'].includes(section) && rule.sourceSection === 'game_objects', candidates: entries.filter(entry => counts.get(entry.id) === 1).map(entry => {
      const spriteId = rule.sourceSection === 'sprites' ? entry.id : rule.spritePath ? ref(at(entry.data, rule.spritePath)) : undefined;
      const matches = assets.filter(asset => asset.section === 'sprites' && asset.id === spriteId);
      const asset = matches.length === 1 ? matches[0] : undefined;
      const uses = clan.entries.filter(item => item !== entry && references(item.data, entry.id)).map(item => ({ section: item.section, id: item.id, name: item.name, file: item.file }));
      return { id: entry.id, name: entry.name, file: entry.file, spriteId, image: asset && ['ok', 'case-mismatch'].includes(asset.status) ? asset.image : undefined, width: asset?.width, height: asset?.height, uses };
    }) };
  });
}
async function validate(request: VisualRequest): Promise<{ edit: EditRequest; same: boolean }> {
  const clan = await scanClan(request.root);
  const owner = clan.entries.find(entry => entry.section === request.section && entry.id === request.id && entry.file === request.file);
  const rule = (await rules()).find(rule => rule.section === request.section && owner && fieldLocations(owner.data, rule.path).includes(request.field));
  if (!rule) throw new Error('Asignación visual no permitida.');
  const targets = clan.entries.filter(entry => entry.section === rule.sourceSection && entry.id === request.targetId);
  if (targets.length !== 1 || (rule.sourceType && targets[0].data.type !== rule.sourceType)) throw new Error('Elige un recurso visual local con ID único y del tipo correcto.');
  const entries = clan.entries.filter(entry => entry.section === request.section && entry.id === request.id && entry.file === request.file);
  if (entries.length !== 1) throw new Error('El objeto de destino no tiene identidad única.');
  if (rule.destinationType && entries[0].data.type !== rule.destinationType) throw new Error('El tipo de objeto de destino no admite este rol visual.');
  const global = clan.entries.filter(entry => entry.section === request.section && entry.id === request.id);
  if (global.length !== 1) throw new Error('El ID del objeto de destino está duplicado en el clan.');
  if (entries[0].hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza antes de asignar arte.');
  const current = at(entries[0].data, request.field);
  // Local reference objects can carry renderer-specific settings alongside their ID.
  const value = ref(current) && current && typeof current === 'object' && !Array.isArray(current)
    ? { ...current, id: '@' + request.targetId } : '@' + request.targetId;
  return { edit: { root: request.root, section: request.section, file: request.file, id: request.id, field: request.field, value, expectedHash: request.expectedHash }, same: ref(current) === request.targetId };
}
export async function prepareVisualAssignment(request: VisualRequest) {
  const { edit, same } = await validate(request);
  const catalog = await visualCatalog(await scanClan(request.root), request.section, request);
  const resource = catalog.find(slot => slot.path === request.field)!.candidates.find(item => item.id === request.targetId)!;
  if (same) return { changed: false, before: '@' + request.targetId, after: '@' + request.targetId, resource };
  const preview = await prepareEdit(edit);
  return { changed: preview.changed, before: preview.before, after: preview.after, resource };
}
export async function saveVisualAssignment(request: VisualRequest) {
  const { edit, same } = await validate(request);
  if (same) return { changed: false, hash: request.expectedHash };
  return saveEdit(edit);
}
