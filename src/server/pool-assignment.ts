import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import { poolModel } from './pool-editor.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';

interface Rules { sections: Record<string, string[]>; field: string; label: string; blockedFields: string[]; rewardAdapters: Record<string, { extension: string; field: string }> }
export interface PoolAssignmentRequest { root: string; section: string; file: string; id: string; poolId: string; expectedHash: string; expectedToken?: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) { if ((value as JsonRecord).mod_reference) return; value = (value as JsonRecord).id; }
  return typeof value === 'string' ? value : undefined;
}
function references(value: unknown, id: string): boolean {
  if (ref(value) === '@' + id) return true;
  if (Array.isArray(value)) return value.some(item => references(item, id));
  return Boolean(value && typeof value === 'object' && !(value as JsonRecord).mod_reference && Object.values(value).some(item => references(item, id)));
}
export async function poolAssignmentRules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'pool-assignment.json'), 'utf8')); }
function source(clan: ClanSnapshot, section: string, file: string, id: string, rules: Rules) {
  if (!rules.sections[section] && section !== 'rewards') throw new Error('Sección no configurada para asignar pools.');
  const entries = clan.entries.filter(e => e.section === section && e.id === id);
  if (entries.length !== 1 || entries[0].file !== file || entries[0].data.id !== id) throw new Error('El objeto necesita un ID local único.');
  return entries[0];
}
function reason(entry: Entry, rules: Rules) {
  if (entry.section === 'rewards') {
    const adapter = rules.rewardAdapters[String(entry.data.type)];
    if (!adapter) return 'Tipo de recompensa sin adaptador de pool. Revisa su JSON.';
    const extensions = entry.data.extensions;
    if (!Array.isArray(extensions)) return 'La recompensa necesita una lista de extensiones válida.';
    const matches = extensions.filter(item => item && typeof item === 'object' && Object.hasOwn(item, adapter.extension));
    if (matches.length !== 1) return 'La extensión de recompensa debe aparecer exactamente una vez.';
    const value = (matches[0] as JsonRecord)[adapter.extension];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'La extensión de recompensa no es un objeto válido.';
    return;
  }
  const name = ref(entry.data.name);
  if (!name || !rules.sections[entry.section]?.includes(name)) return 'Este efecto no está en el catálogo de asignación de pools; revisa su JSON o añade un adaptador.';
  if (rules.blockedFields.some(field => entry.data[field] !== undefined && entry.data[field] !== null)) return 'Este efecto también declara una carta individual. Revisa esa alternativa en el editor JSON antes de asignar un pool.';
}
function target(entry: Entry, rules: Rules): { path: (string | number)[]; current: unknown } {
  if (entry.section !== 'rewards') return { path: [rules.field], current: entry.data[rules.field] };
  const adapter = rules.rewardAdapters[String(entry.data.type)];
  const extensions = entry.data.extensions as JsonRecord[];
  const index = extensions.findIndex(item => item && typeof item === 'object' && Object.hasOwn(item, adapter.extension));
  return { path: ['extensions', index, adapter.extension, adapter.field], current: (extensions[index][adapter.extension] as JsonRecord)[adapter.field] };
}
function uses(clan: ClanSnapshot, entry: Entry) { return clan.entries.filter(e => e !== entry && references(e.data, entry.id)).map(e => ({ section: e.section, id: e.id, name: e.name, file: e.file })); }
async function state(root: string) {
  const clan = await scanClan(root);
  const files = await Promise.all(clan.files.map(async file => [file, hash(await fs.readFile(path.join(root, file), 'utf8'))]));
  const configs = await Promise.all(['pool-assignment.json', 'pool-editor.json'].map(file => fs.readFile(path.join(configRoot, file), 'utf8')));
  return hash(JSON.stringify([configs, files]));
}
async function candidates(root: string) {
  const model = await poolModel(root);
  return model.pools.filter(p => p.editable).map(pool => ({ id: pool.id, local: Boolean(pool.definition), count: model.cards.filter(c => c.pools.includes(pool.id)).length, members: model.cards.filter(c => c.pools.includes(pool.id)).map(c => ({ id: c.id, name: c.name, file: c.file })) }));
}
export async function poolAssignmentModel(root: string, section: string, file: string, id: string) {
  const rules = await poolAssignmentRules(); const clan = await scanClan(root); const entry = source(clan, section, file, id, rules);
  const blocked = reason(entry, rules); const current = blocked ? undefined : target(entry, rules).current;
  return { supported: !blocked, reason: blocked, hash: entry.hash, label: rules.label, current, currentId: ref(current), candidates: await candidates(root), uses: uses(clan, entry) };
}
export async function preparePoolAssignment(request: PoolAssignmentRequest) {
  const initial = await state(request.root); const rules = await poolAssignmentRules(); const clan = await scanClan(request.root);
  const entry = source(clan, request.section, request.file, request.id, rules); const blocked = reason(entry, rules); if (blocked) throw new Error(blocked);
  const pool = (await candidates(request.root)).find(p => p.id === request.poolId); if (!pool) throw new Error('Selecciona un pool configurado del juego o local con ID único y lista válida.');
  const absolute = path.resolve(request.root, entry.file);
  if (!inside(path.join(request.root, 'json'), absolute) || !inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('El archivo sale del clan.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash || entry.hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan.');
  const location = target(entry, rules); const before = location.current; const same = ref(before) === pool.id;
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : ''; const text = bom ? original.slice(1) : original;
  const indent = text.match(/\n(\s+)"/)?.[1] ?? '  ';
  const newText = same ? original : bom + jsonc.applyEdits(text, jsonc.modify(text, [entry.section, entry.index, ...location.path], pool.id, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' } }));
  const errors: jsonc.ParseError[] = []; jsonc.parse(newText.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true }); if (errors.length) throw new Error('La asignación produciría JSON inválido.');
  const final = await state(request.root); if (initial !== final) throw new Error('El clan cambió durante la preparación. Vuelve a previsualizar.');
  const token = hash(JSON.stringify([final, request.section, request.file, request.id, request.poolId]));
  if (request.expectedToken && token !== request.expectedToken) throw new Error('La vista previa ha caducado. Vuelve a previsualizar.');
  return { changed: !same, label: rules.label, before, after: pool.id, pool, uses: uses(clan, entry), token, state: final, original, newText };
}
const saving = new Set<string>();
export async function savePoolAssignment(request: PoolAssignmentRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza la asignación antes de guardar.');
  const lock = (await fs.realpath(request.root)).toLowerCase(); if (saving.has(lock)) throw new Error('Hay otra asignación de pool en curso.'); saving.add(lock);
  try {
    const preview = await preparePoolAssignment(request); if (!preview.changed) return { changed: false, hash: request.expectedHash };
    const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root)); await fs.mkdir(backupRoot, { recursive: true });
    const dir = await fs.mkdtemp(path.join(backupRoot, 'pool-assignment-')); const backup = path.join(dir, request.file); await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.writeFile(backup, preview.original, { flag: 'wx' });
    const absolute = path.resolve(request.root, request.file); const temp = absolute + `.clan-editor-${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, preview.newText, { flag: 'wx' }); if (await state(request.root) !== preview.state) throw new Error('El clan cambió durante el guardado.'); await fs.rename(temp, absolute); } finally { await fs.rm(temp, { force: true }); }
    return { changed: true, hash: hash(preview.newText), backup };
  } finally { saving.delete(lock); }
}
