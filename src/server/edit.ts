import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import { fieldLocations, atField, jsonPath } from './field-paths.js';
import { matchesMechanic } from './mechanic-rule.js';
import { validClassReference } from './class-reference.js';

interface FieldRule { path: string; label: string; type: string; optional?: boolean; options?: string[]; reference?: boolean; min?: number; max?: number; integer?: boolean; names?: string[]; modReferences?: string[]; requires?: {names?:string[];selector?:string;modReferences?:string[]}[]; selector?: string }
type Rules = Record<string, FieldRule[]>;

export interface EditRequest {
  root: string;
  section: string;
  id: string;
  file: string;
  field: string;
  value: unknown;
  expectedHash: string;
}

export interface ObjectEditRequest {
  root: string;
  section: string;
  id: string;
  file: string;
  json: string;
  expectedHash: string;
}

export interface Preview {
  changed: boolean;
  file: string;
  field: string;
  before: unknown;
  after: unknown;
  newText: string;
  oldHash: string;
}

function hash(text: string): string { return createHash('sha256').update(text).digest('hex'); }

function validStatusReference(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return typeof reference.id === 'string' && reference.id.trim().length > 0
    && (reference.mod_reference === undefined || typeof reference.mod_reference === 'string' && reference.mod_reference.trim().length > 0);
}

export async function prepareEdit(request: EditRequest): Promise<Preview> {
  const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'fields.json'), 'utf8')) as Rules;
  const snapshot = await scanClan(request.root);
  const matches = snapshot.entries.filter(item => item.section === request.section && item.id === request.id && item.file === request.file);
  if (matches.length !== 1 || snapshot.entries.filter(item => item.section === request.section && item.id === request.id).length !== 1) throw new Error('El ID está duplicado o el objeto ya no existe.');
  const entry = matches[0];
  if(entry.data.id!==request.id)throw new Error('El objeto necesita un ID técnico antes de editar campos.');
  const rule = rules[request.section]?.find(field => fieldLocations(entry.data, field.path).includes(request.field) && matchesMechanic(entry.data, field));
  if (!rule) throw new Error(`El campo ${request.section}.${request.field} aún no tiene edición guiada.`);
  if (request.value === null && !rule.optional) throw new Error('Este campo no puede quedar vacío.');
  if (request.value !== null) {
    if (rule.type === 'class-reference' && !validClassReference(request.value)) throw new Error('Se necesita un nombre de clase o una referencia con id y mod_reference válidos.');
    if (rule.type === 'number' && (typeof request.value !== 'number' || !Number.isFinite(request.value))) throw new Error('Se necesita un número válido.');
    if (rule.type === 'number' && typeof request.value === 'number' && ((rule.min !== undefined && request.value < rule.min) || (rule.max !== undefined && request.value > rule.max) || (rule.integer && !Number.isInteger(request.value)))) throw new Error('El número está fuera del rango permitido.');
    if (rule.type === 'boolean' && typeof request.value !== 'boolean') throw new Error('Se necesita un valor verdadero o falso.');
    if (rule.type === 'reference-list' && !Array.isArray(request.value)) throw new Error('Se necesita una lista de referencias.');
    if (rule.type === 'status-list' && (!Array.isArray(request.value) || request.value.length > 200 || !request.value.every(v => v && typeof v === 'object' && !Array.isArray(v) && validStatusReference(v.status) && Number.isInteger(v.count)))) throw new Error('Cada estado necesita una referencia y una cantidad entera.');
    if (rule.type === 'select' && !rule.options?.includes(String(request.value))) throw new Error('Valor no permitido.');
    const structuredReference = rule.reference && typeof request.value === 'object' && !Array.isArray(request.value)
      && typeof (request.value as Record<string, unknown>).id === 'string'
      && ((request.value as Record<string, unknown>).id as string).startsWith('@')
      && !(request.value as Record<string, unknown>).mod_reference;
    if ((rule.type === 'text' || rule.type === 'textarea') && typeof request.value !== 'string' && !structuredReference) throw new Error('Se necesita texto.');
    if (rule.type === 'string-list' && (!Array.isArray(request.value) || !request.value.every(v => typeof v === 'string'))) throw new Error('Se necesita una lista de textos.');
  }

  const absolute = path.resolve(request.root, request.file);
  if (!inside(request.root, absolute)) throw new Error('La ruta sale de la carpeta del clan.');
  if (!inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('La ruta resuelta sale de la carpeta del clan.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan y revisa los cambios.');

  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const source = bom ? original.slice(1) : original;
  const parts = jsonPath(request.field);
  const before = atField(entry.data, request.field);
  const after = request.value === null ? undefined : request.value;
  if (JSON.stringify(before) === JSON.stringify(after)) return { changed: false, file: request.file, field: request.field, before, after, newText: original, oldHash: hash(original) };
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const indentMatch = source.match(/\n(\s+)"/);
  const indent = indentMatch?.[1] ?? '  ';
  const edits = jsonc.modify(source, [request.section, entry.index, ...parts], after, {
    formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol }
  });
  if (!edits.length) throw new Error('No se pudo preparar el cambio.');
  const newText = bom + jsonc.applyEdits(source, edits);
  const errors: jsonc.ParseError[] = [];
  jsonc.parse(newText.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) throw new Error('El cambio produciría un JSON inválido.');
  return { changed: true, file: request.file, field: request.field, before, after, newText, oldHash: hash(original) };
}

export async function saveEdit(request: EditRequest): Promise<{ changed: boolean; backup?: string; hash: string }> {
  const preview = await prepareEdit(request);
  if (!preview.changed) return { changed: false, hash: preview.oldHash };
  const absolute = path.resolve(request.root, request.file);
  const backup = path.join(dataRoot, 'backups', keyForPath(request.root), new Date().toISOString().replaceAll(':', '-'), request.file);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.copyFile(absolute, backup);
  const temp = absolute + `.clan-editor-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, preview.newText, { encoding: 'utf8', flag: 'wx' });
    if (hash(await fs.readFile(absolute, 'utf8')) !== preview.oldHash) throw new Error('El archivo cambió durante el guardado.');
    await fs.rename(temp, absolute);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
  return { changed: true, backup, hash: hash(preview.newText) };
}

export async function prepareObjectEdit(request: ObjectEditRequest): Promise<Preview> {
  if (request.json.length > 500_000) throw new Error('El objeto supera el tamaño permitido.');
  const errors: jsonc.ParseError[] = [];
  const proposed: unknown = jsonc.parse(request.json, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !proposed || typeof proposed !== 'object' || Array.isArray(proposed)) throw new Error('El objeto debe ser un JSON válido.');
  if ((proposed as Record<string, unknown>).id !== request.id) throw new Error('El ID no se puede cambiar desde la edición avanzada porque puede tener referencias.');
  const snapshot = await scanClan(request.root);
  const matches = snapshot.entries.filter(item => item.section === request.section && item.id === request.id && item.file === request.file);
  if (matches.length > 1 || snapshot.entries.filter(item => item.section === request.section && item.id === request.id).length > 1) throw new Error('El ID está duplicado en el clan. Corrige la identidad antes de editar.');
  const entry = matches[0];
  if (!entry) throw new Error('El objeto ya no está en ese archivo. Actualiza el clan.');
  const absolute = path.resolve(request.root, request.file);
  if (!inside(request.root, absolute)) throw new Error('La ruta sale de la carpeta del clan.');
  if (!inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('La ruta resuelta sale de la carpeta del clan.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan y revisa los cambios.');
  if (JSON.stringify(entry.data) === JSON.stringify(proposed)) return { changed: false, file: request.file, field: '(objeto completo)', before: entry.data, after: proposed, newText: original, oldHash: hash(original) };
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const source = bom ? original.slice(1) : original;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const indentMatch = source.match(/\n(\s+)"/);
  const indent = indentMatch?.[1] ?? '  ';
  const edits = jsonc.modify(source, [request.section, entry.index], proposed, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol } });
  if (!edits.length) throw new Error('No se pudo preparar el cambio.');
  const newText = bom + jsonc.applyEdits(source, edits);
  const check: jsonc.ParseError[] = [];
  jsonc.parse(newText.replace(/^\uFEFF/, ''), check, { allowTrailingComma: true, disallowComments: false });
  if (check.length) throw new Error('El cambio produciría un JSON inválido.');
  return { changed: true, file: request.file, field: '(objeto completo)', before: entry.data, after: proposed, newText, oldHash: hash(original) };
}

export async function saveObjectEdit(request: ObjectEditRequest): Promise<{ changed: boolean; backup?: string; hash: string }> {
  const preview = await prepareObjectEdit(request);
  if (!preview.changed) return { changed: false, hash: preview.oldHash };
  const absolute = path.resolve(request.root, request.file);
  const backup = path.join(dataRoot, 'backups', keyForPath(request.root), new Date().toISOString().replaceAll(':', '-'), request.file);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.copyFile(absolute, backup);
  const temp = absolute + `.clan-editor-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, preview.newText, { encoding: 'utf8', flag: 'wx' });
    if (!inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('La ruta resuelta sale de la carpeta del clan.');
    if (hash(await fs.readFile(absolute, 'utf8')) !== preview.oldHash) throw new Error('El archivo cambió durante el guardado.');
    await fs.rename(temp, absolute);
  }
  finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  return { changed: true, backup, hash: hash(preview.newText) };
}
