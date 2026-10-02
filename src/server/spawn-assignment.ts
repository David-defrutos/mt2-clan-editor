import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';

interface Rules { effectNames: string[]; poolField: string; fields: { path: string; label: string; optional: boolean }[] }
export interface SpawnRequest { root: string; file: string; id: string; field: string; characterId: string | null; expectedHash: string; expectedToken?: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) { if ((value as JsonRecord).mod_reference) return; value = (value as JsonRecord).id; }
  return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : undefined;
}
function references(value: unknown, id: string): boolean {
  if (ref(value) === id) return true;
  if (Array.isArray(value)) return value.some(item => references(item, id));
  return Boolean(value && typeof value === 'object' && !(value as JsonRecord).mod_reference && Object.values(value).some(item => references(item, id)));
}
export async function spawnRules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'spawn-assignment.json'), 'utf8')); }
function supported(entry: Entry, rules: Rules): string | undefined {
  const name = typeof entry.data.name === 'string' ? entry.data.name : (entry.data.name as JsonRecord | undefined)?.id;
  if (!rules.effectNames.includes(String(name))) return 'Esta invocación personalizada requiere un adaptador o el editor JSON.';
  if (entry.data[rules.poolField]) return 'Esta invocación elige unidades de un pool; no admite asignación individual guiada.';
}
function source(clan: ClanSnapshot, file: string, id: string): Entry {
  const entries = clan.entries.filter(entry => entry.section === 'effects' && entry.id === id);
  if (entries.length !== 1 || entries[0].file !== file || entries[0].data.id !== id) throw new Error('El efecto necesita un ID local único.');
  return entries[0];
}
function usages(clan: ClanSnapshot, entry: Entry) {
  return clan.entries.filter(item => item !== entry && references(item.data, entry.id)).map(item => ({ section: item.section, id: item.id, file: item.file, name: item.name }));
}
async function state(root: string) {
  const config = await fs.readFile(path.join(configRoot, 'spawn-assignment.json'), 'utf8');
  const clan = await scanClan(root);
  const files = await Promise.all(clan.files.map(async file => [file, hash(await fs.readFile(path.join(root, file), 'utf8'))]));
  return hash(JSON.stringify([config, files]));
}
export async function spawnModel(root: string, file: string, id: string) {
  const rules = await spawnRules(); const clan = await scanClan(root); const entry = source(clan, file, id);
  const counts = new Map<string, number>();
  const characters = clan.entries.filter(item => item.section === 'characters' && typeof item.data.id === 'string');
  for (const character of characters) counts.set(character.id, (counts.get(character.id) ?? 0) + 1);
  const candidates = characters.filter(character => counts.get(character.id) === 1).map(character => ({ id: character.id, name: character.name, file: character.file, attack: character.data.attack_damage, health: character.data.health, size: character.data.size }));
  return { supported: !supported(entry, rules), reason: supported(entry, rules), hash: entry.hash, fields: rules.fields.map(field => ({ ...field, current: entry.data[field.path], currentId: ref(entry.data[field.path]) })), candidates, uses: usages(clan, entry) };
}
export async function prepareSpawnAssignment(request: SpawnRequest) {
  const beforeState = await state(request.root);
  const rules = await spawnRules();
  const field = rules.fields.find(field => field.path === request.field);
  if (!field) throw new Error('Campo de invocación no permitido.');
  const clan = await scanClan(request.root); const entry = source(clan, request.file, request.id);
  const reason = supported(entry, rules); if (reason) throw new Error(reason);
  if (request.characterId !== null && (typeof request.characterId !== 'string' || !request.characterId)) throw new Error('Selecciona una unidad local.');
  if (request.characterId === null && !field.optional) throw new Error('La unidad principal no se puede quitar.');
  const matches = clan.entries.filter(item => item.section === 'characters' && item.id === request.characterId && item.data.id === request.characterId);
  if (request.characterId !== null && matches.length !== 1) throw new Error('Selecciona una unidad local con ID único.');
  const absolute = path.resolve(request.root, request.file);
  if (!inside(path.join(request.root, 'json'), absolute) || !inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('La ruta del efecto sale del clan.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash || entry.hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza antes de guardar.');
  const before = entry.data[field.path];
  const same = request.characterId === null ? before === undefined : ref(before) === request.characterId;
  const after = request.characterId === null ? undefined : '@' + request.characterId;
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : ''; const text = bom ? original.slice(1) : original;
  const indent = text.match(/\n(\s+)"/)?.[1] ?? '  ';
  const newText = same ? original : bom + jsonc.applyEdits(text, jsonc.modify(text, ['effects', entry.index, field.path], after, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' } }));
  const errors: jsonc.ParseError[] = []; jsonc.parse(newText.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) throw new Error('La asignación produciría JSON inválido.');
  const afterState = await state(request.root);
  if (beforeState !== afterState) throw new Error('El clan cambió mientras se preparaba la asignación. Vuelve a previsualizar.');
  const token = hash(JSON.stringify([afterState, request.file, request.id, request.field, request.characterId]));
  if (request.expectedToken && request.expectedToken !== token) throw new Error('El clan o los usos del efecto cambiaron. Vuelve a previsualizar.');
  return { changed: !same, label: field.label, before, after, character: matches[0] ? { id: matches[0].id, name: matches[0].name, attack: matches[0].data.attack_damage, health: matches[0].data.health, size: matches[0].data.size } : undefined, uses: usages(clan, entry), token, state: afterState, original, newText };
}
const saving = new Set<string>();
export async function saveSpawnAssignment(request: SpawnRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza la asignación antes de guardar.');
  const lock = (await fs.realpath(request.root)).toLowerCase();
  if (saving.has(lock)) throw new Error('Hay otra asignación de invocación en curso.');
  saving.add(lock);
  try {
    const preview = await prepareSpawnAssignment(request);
    if (!preview.changed) return { changed: false, hash: request.expectedHash };
    const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root)); await fs.mkdir(backupRoot, { recursive: true });
    const backupDir = await fs.mkdtemp(path.join(backupRoot, 'spawn-assignment-'));
    const backup = path.join(backupDir, request.file); await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.writeFile(backup, preview.original, { flag: 'wx' });
    const absolute = path.resolve(request.root, request.file); const temporary = absolute + `.clan-editor-${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, preview.newText, { flag: 'wx' });
      if (await state(request.root) !== preview.state) throw new Error('El clan cambió durante el guardado. Vuelve a previsualizar.');
      await fs.rename(temporary, absolute);
    } finally { await fs.rm(temporary, { force: true }); }
    return { changed: true, hash: hash(preview.newText), backup };
  } finally { saving.delete(lock); }
}
