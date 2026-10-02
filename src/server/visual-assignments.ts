import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';
import { scanClan } from './scan.js';
import { inventoryAssets } from './assets.js';
import { prepareEdit, saveEdit, type EditRequest } from './edit.js';
import type { ClanSnapshot } from './types.js';

interface Rule { section: string; path: string; label: string; sourceSection: string; sourceType: string; spritePath: string }
export interface VisualRequest { root: string; section: string; file: string; id: string; field: string; targetId: string; expectedHash: string }
const at = (data: unknown, field: string): unknown => field.split('.').reduce<unknown>((v, key) => v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[key] : undefined, data);
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
export async function visualCatalog(clan: ClanSnapshot, section: string) {
  const assignments = (await rules()).filter(rule => rule.section === section);
  const assets = assignments.length ? await inventoryAssets(clan) : [];
  return assignments.map(rule => {
    const entries = clan.entries.filter(entry => entry.section === rule.sourceSection && entry.data.type === rule.sourceType);
    const counts = new Map<string, number>();
    for (const entry of clan.entries.filter(entry => entry.section === rule.sourceSection)) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    return { path: rule.path, label: rule.label, candidates: entries.filter(entry => counts.get(entry.id) === 1).map(entry => {
      const spriteId = ref(at(entry.data, rule.spritePath));
      const matches = assets.filter(asset => asset.section === 'sprites' && asset.id === spriteId);
      const asset = matches.length === 1 ? matches[0] : undefined;
      const uses = clan.entries.filter(item => item !== entry && references(item.data, entry.id)).map(item => ({ section: item.section, id: item.id, name: item.name, file: item.file }));
      return { id: entry.id, name: entry.name, file: entry.file, spriteId, image: asset && ['ok', 'case-mismatch'].includes(asset.status) ? asset.image : undefined, width: asset?.width, height: asset?.height, uses };
    }) };
  });
}
async function validate(request: VisualRequest): Promise<{ edit: EditRequest; same: boolean }> {
  const rule = (await rules()).find(rule => rule.section === request.section && rule.path === request.field);
  if (!rule) throw new Error('Asignación visual no permitida.');
  const clan = await scanClan(request.root);
  const targets = clan.entries.filter(entry => entry.section === rule.sourceSection && entry.id === request.targetId);
  if (targets.length !== 1 || targets[0].data.type !== rule.sourceType) throw new Error('Elige un recurso visual local con ID único y del tipo correcto.');
  const entries = clan.entries.filter(entry => entry.section === request.section && entry.id === request.id && entry.file === request.file);
  if (entries.length !== 1) throw new Error('El objeto de destino no tiene identidad única.');
  if (entries[0].hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza antes de asignar arte.');
  return { edit: { root: request.root, section: request.section, file: request.file, id: request.id, field: rule.path, value: '@' + request.targetId, expectedHash: request.expectedHash }, same: ref(at(entries[0].data, rule.path)) === request.targetId };
}
export async function prepareVisualAssignment(request: VisualRequest) {
  const { edit, same } = await validate(request);
  const catalog = await visualCatalog(await scanClan(request.root), request.section);
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
