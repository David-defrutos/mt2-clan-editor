import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { scanClan } from './scan.js';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import type { JsonRecord } from './types.js';

type Field = { id: string; label: string; type: string; location: string; help: string; min?: number; max?: number; maxItems?: number; options?: string[] };
type Rules = { extensions: Record<string, string>; fields: Field[] };
export type RewardSettingsRequest = { root: string; file: string; id: string; field: string; value: unknown; expectedHash: string; expectedToken?: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function rules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'reward-settings.json'), 'utf8')); }
async function model(root: string, file: string, id: string) {
  const config = await rules(); const clan = await scanClan(root);
  const matches = clan.entries.filter(e => e.section === 'rewards' && e.id === id);
  if (matches.length !== 1 || matches[0].file !== file || matches[0].data.id !== id) throw new Error('La recompensa necesita un ID local único.');
  const entry = matches[0]; const extension = config.extensions[String(entry.data.type)];
  if (!extension) throw new Error('Tipo de recompensa sin adaptador de ajustes.');
  const extensions = entry.data.extensions;
  if (!Array.isArray(extensions)) throw new Error('Lista de extensiones inválida.');
  const indexes = extensions.flatMap((item, index) => item && typeof item === 'object' && Object.hasOwn(item, extension) ? [index] : []);
  if (indexes.length !== 1) throw new Error('La extensión debe aparecer exactamente una vez.');
  const data = (extensions[indexes[0]] as JsonRecord)[extension];
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Extensión de recompensa inválida.');
  const fields = config.fields.filter(f => f.location === 'root' || f.location === entry.data.type).map(f => ({ ...f, current: (f.location === 'root' ? entry.data : data as JsonRecord)[f.id] }));
  return { entry, fields, extension, index: indexes[0] };
}
export async function rewardSettingsModel(root: string, file: string, id: string) {
  const result = await model(root, file, id); return { hash: result.entry.hash, fields: result.fields };
}
async function state(root: string) {
  const clan = await scanClan(root);
  const files = await Promise.all(clan.files.map(async file => [file, hash(await fs.readFile(path.join(root, file), 'utf8'))]));
  return hash(JSON.stringify([await fs.readFile(path.join(configRoot, 'reward-settings.json'), 'utf8'), files]));
}
function validate(field: Field, value: unknown) {
  const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && (field.min === undefined || v >= field.min) && (field.max === undefined || v <= field.max);
  const valid = field.type === 'integer' ? integer(value) : field.type === 'boolean' ? typeof value === 'boolean' : field.type === 'select' ? typeof value === 'string' && field.options?.includes(value) : field.type === 'integer-list' ? Array.isArray(value) && value.length > 0 && value.length <= (field.maxItems ?? 100) && value.every(integer) : false;
  if (!valid) throw new Error(`Valor inválido para ${field.label}.`);
}
export async function prepareRewardSettings(request: RewardSettingsRequest) {
  const initial = await state(request.root); const result = await model(request.root, request.file, request.id);
  const field = result.fields.find(f => f.id === request.field); if (!field) throw new Error('Campo no configurado para esta recompensa.');
  validate(field, request.value);
  const absolute = path.resolve(request.root, request.file);
  if (!inside(path.join(request.root, 'json'), absolute) || !inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('El archivo sale del clan.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash || result.entry.hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan.');
  const changed = JSON.stringify(field.current) !== JSON.stringify(request.value);
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : ''; const text = bom ? original.slice(1) : original;
  const parts = field.location === 'root' ? [field.id] : ['extensions', result.index, result.extension, field.id];
  const indent = text.match(/\n(\s+)"/)?.[1] ?? '  ';
  const newText = changed ? bom + jsonc.applyEdits(text, jsonc.modify(text, ['rewards', result.entry.index, ...parts], request.value, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' } })) : original;
  const errors: jsonc.ParseError[] = []; jsonc.parse(newText.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true }); if (errors.length) throw new Error('El cambio produciría JSON inválido.');
  const final = await state(request.root); if (initial !== final) throw new Error('El clan cambió durante la preparación.');
  const token = hash(JSON.stringify([final, request.file, request.id, request.field, request.value]));
  if (request.expectedToken && token !== request.expectedToken) throw new Error('La vista previa ha caducado.');
  return { changed, label: field.label, before: field.current, after: request.value, token, state: final, original, newText };
}
const saving = new Set<string>();
export async function saveRewardSettings(request: RewardSettingsRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza antes de guardar.');
  const lock = (await fs.realpath(request.root)).toLowerCase(); if (saving.has(lock)) throw new Error('Hay otro ajuste de recompensa en curso.'); saving.add(lock);
  try {
    const preview = await prepareRewardSettings(request); if (!preview.changed) return { changed: false };
    const parent = path.join(dataRoot, 'backups', keyForPath(request.root)); await fs.mkdir(parent, { recursive: true });
    const dir = await fs.mkdtemp(path.join(parent, 'reward-settings-')); const backup = path.join(dir, request.file); await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.writeFile(backup, preview.original, { flag: 'wx' });
    const absolute = path.resolve(request.root, request.file); const temp = absolute + `.clan-editor-${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, preview.newText, { flag: 'wx' }); if (await state(request.root) !== preview.state) throw new Error('El clan cambió durante el guardado.'); await fs.rename(temp, absolute); } finally { await fs.rm(temp, { force: true }); }
    return { changed: true, backup };
  } finally { saving.delete(lock); }
}
