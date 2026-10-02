import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import { removeArrayItem } from './pool-editor.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';
interface Rules { effectNames: string[]; field: string; fallbackFields: string[]; minReferences: number; maxReferences: number; maxChanges: number }
export interface CharacterPoolRequest { root: string; file: string; id: string; expectedHash: string; expectedToken?: string; changes: { id: string; member: boolean }[] }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function ref(value: unknown): string | undefined { if (value && typeof value === 'object' && !Array.isArray(value)) { if ((value as JsonRecord).mod_reference) return; value = (value as JsonRecord).id; } return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : undefined; }
function references(value: unknown, id: string): boolean { if (ref(value) === id) return true; if (Array.isArray(value)) return value.some(v => references(v, id)); return Boolean(value && typeof value === 'object' && !(value as JsonRecord).mod_reference && Object.values(value).some(v => references(v, id))); }
export async function characterPoolRules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'character-pool.json'), 'utf8')); }
function source(clan: ClanSnapshot, file: string, id: string) { const entries = clan.entries.filter(e => e.section === 'effects' && e.id === id); if (entries.length !== 1 || entries[0].file !== file || entries[0].data.id !== id) throw new Error('El efecto necesita un ID local único.'); return entries[0]; }
function reason(entry: Entry, rules: Rules) {
  const name = typeof entry.data.name === 'string' ? entry.data.name : (entry.data.name as JsonRecord | undefined)?.mod_reference ? undefined : (entry.data.name as JsonRecord | undefined)?.id;
  if (!rules.effectNames.includes(String(name))) return 'Esta invocación personalizada requiere un adaptador.';
  if (entry.data[rules.field] !== undefined && !Array.isArray(entry.data[rules.field])) return 'El pool de personajes debe ser una lista. Revisa el JSON.';
}
function candidates(clan: ClanSnapshot) { const units = clan.entries.filter(e => e.section === 'characters'); return units.filter(e => e.data.id === e.id && units.filter(u => u.id === e.id).length === 1); }
function uses(clan: ClanSnapshot, entry: Entry) { return clan.entries.filter(e => e !== entry && references(e.data, entry.id)).map(e => ({ id: e.id, section: e.section, name: e.name, file: e.file })); }
async function state(root: string) { const clan = await scanClan(root); const files = await Promise.all(clan.files.map(async file => [file, hash(await fs.readFile(path.join(root, file), 'utf8'))])); return hash(JSON.stringify([await fs.readFile(path.join(configRoot, 'character-pool.json'), 'utf8'), files])); }
export async function characterPoolModel(root: string, file: string, id: string) {
  const rules = await characterPoolRules(); const clan = await scanClan(root); const entry = source(clan, file, id); const units = candidates(clan);
  const members = Array.isArray(entry.data[rules.field]) ? entry.data[rules.field] as unknown[] : [];
  return { supported: !reason(entry, rules), reason: reason(entry, rules), hash: entry.hash, minReferences: rules.minReferences, maxReferences: rules.maxReferences, maxChanges: rules.maxChanges,
    candidates: units.map(u => ({ id: u.id, name: u.name, attack: u.data.attack_damage, health: u.data.health, size: u.data.size, count: members.filter(v => ref(v) === u.id).length })),
    members, protectedReferences: members.filter(v => !units.some(u => u.id === ref(v))), fallback: rules.fallbackFields.map(field => ({ field, value: entry.data[field] ?? null })), uses: uses(clan, entry) };
}
export async function prepareCharacterPool(request: CharacterPoolRequest) {
  const initial = await state(request.root); const rules = await characterPoolRules(); const clan = await scanClan(request.root); const entry = source(clan, request.file, request.id);
  const blocked = reason(entry, rules); if (blocked) throw new Error(blocked);
  if (!Array.isArray(request.changes) || !request.changes.length || request.changes.length > rules.maxChanges) throw new Error(`Selecciona entre 1 y ${rules.maxChanges} cambios.`);
  const absolute = path.resolve(request.root, request.file);
  if (!inside(path.join(request.root, 'json'), absolute) || !inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('El archivo sale del clan.');
  const original = await fs.readFile(absolute, 'utf8'); if (hash(original) !== request.expectedHash || entry.hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan.');
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : ''; let text = bom ? original.slice(1) : original;
  const units = candidates(clan); const seen = new Set<string>(); const changes: { id: string; name: string; before: number; after: number }[] = [];
  const base = ['effects', entry.index, rules.field];
  for (const change of request.changes) {
    if (!change || typeof change.id !== 'string' || typeof change.member !== 'boolean' || seen.has(change.id)) throw new Error('Cambio inválido o unidad seleccionada más de una vez.'); seen.add(change.id);
    const unit = units.find(u => u.id === change.id); if (!unit) throw new Error('Selecciona una unidad local con ID único.');
    const document = jsonc.parse(text) as { effects: JsonRecord[] }; const current = document.effects[entry.index][rules.field] as unknown[] | undefined;
    const members = current ?? []; const before = members.filter(v => ref(v) === change.id).length;
    if (Boolean(before) === change.member) continue;
    if (change.member) {
      const indent = text.match(/\n(\s+)"/)?.[1] ?? '  ';
      text = jsonc.applyEdits(text, jsonc.modify(text, current === undefined ? base : [...base, -1], current === undefined ? ['@' + change.id] : '@' + change.id, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' } }));
    } else for (let i = members.length - 1; i >= 0; i--) if (ref(members[i]) === change.id) text = removeArrayItem(text, base, i);
    changes.push({ id: unit.id, name: unit.name, before, after: change.member ? 1 : 0 });
  }
  const errors: jsonc.ParseError[] = []; const output = jsonc.parse(text, errors, { allowTrailingComma: true }); if (errors.length) throw new Error('La edición produciría JSON inválido.');
  const members = (output.effects[entry.index][rules.field] ?? []) as unknown[];
  if (changes.length && (members.length < rules.minReferences || members.length > rules.maxReferences)) throw new Error(`El pool debe tener entre ${rules.minReferences} y ${rules.maxReferences} referencias. Los miembros externos también cuentan.`);
  const final = await state(request.root); if (initial !== final) throw new Error('El clan cambió durante la preparación.');
  const token = hash(JSON.stringify([final, request.file, request.id, request.changes])); if (request.expectedToken && request.expectedToken !== token) throw new Error('La vista previa ha caducado. Vuelve a previsualizar.');
  return { changed: changes.length > 0, changes, members, uses: uses(clan, entry), token, state: final, original, newText: bom + text };
}
const saving = new Set<string>();
export async function saveCharacterPool(request: CharacterPoolRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza el pool antes de guardar.'); const lock = (await fs.realpath(request.root)).toLowerCase(); if (saving.has(lock)) throw new Error('Hay otro guardado de pool de personajes en curso.'); saving.add(lock);
  try {
    const preview = await prepareCharacterPool(request); if (!preview.changed) return { changed: false };
    const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root)); await fs.mkdir(backupRoot, { recursive: true }); const dir = await fs.mkdtemp(path.join(backupRoot, 'character-pool-')); const backup = path.join(dir, request.file); await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.writeFile(backup, preview.original, { flag: 'wx' });
    const absolute = path.resolve(request.root, request.file); const temp = absolute + `.clan-editor-${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, preview.newText, { flag: 'wx' }); if (await state(request.root) !== preview.state) throw new Error('El clan cambió durante el guardado.'); await fs.rename(temp, absolute); } finally { await fs.rm(temp, { force: true }); }
    return { changed: true, backup, hash: hash(preview.newText) };
  } finally { saving.delete(lock); }
}
