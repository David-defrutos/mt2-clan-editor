import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';

interface FieldRule { path: string; label: string; type: string; optional?: boolean; options?: string[] }
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

function atPath(value: unknown, parts: string[]): unknown {
  return parts.reduce<unknown>((node, key) => node && typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>)[key] : undefined, value);
}

export async function prepareEdit(request: EditRequest): Promise<Preview> {
  const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'fields.json'), 'utf8')) as Rules;
  const rule = rules[request.section]?.find(field => field.path === request.field);
  if (!rule) throw new Error(`El campo ${request.section}.${request.field} aún no tiene edición guiada.`);
  if (request.value === null && !rule.optional) throw new Error('Este campo no puede quedar vacío.');
  if (request.value !== null) {
    if (rule.type === 'number' && (typeof request.value !== 'number' || !Number.isFinite(request.value))) throw new Error('Se necesita un número válido.');
    if (rule.type === 'select' && !rule.options?.includes(String(request.value))) throw new Error('Valor no permitido.');
    if ((rule.type === 'text' || rule.type === 'textarea') && typeof request.value !== 'string') throw new Error('Se necesita texto.');
    if (rule.type === 'string-list' && (!Array.isArray(request.value) || !request.value.every(v => typeof v === 'string'))) throw new Error('Se necesita una lista de textos.');
  }

  const snapshot = await scanClan(request.root);
  const matches = snapshot.entries.filter(item => item.section === request.section && item.id === request.id && item.file === request.file);
  if (matches.length > 1) throw new Error('El ID está duplicado en este archivo. Corrige la identidad antes de editar.');
  const entry = matches[0];
  if (!entry) throw new Error('El objeto ya no está en ese archivo. Actualiza el clan antes de guardar.');
  const absolute = path.resolve(request.root, request.file);
  if (!inside(request.root, absolute)) throw new Error('La ruta sale de la carpeta del clan.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan y revisa los cambios.');

  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const source = bom ? original.slice(1) : original;
  const parts = request.field.split('.');
  const before = atPath(entry.data, parts);
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
  const temp = absolute + `.clan-editor-${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, preview.newText, 'utf8');
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
  if (matches.length > 1) throw new Error('El ID está duplicado en este archivo. Corrige la identidad antes de editar.');
  const entry = matches[0];
  if (!entry) throw new Error('El objeto ya no está en ese archivo. Actualiza el clan.');
  const absolute = path.resolve(request.root, request.file);
  if (!inside(request.root, absolute)) throw new Error('La ruta sale de la carpeta del clan.');
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
  const temp = absolute + `.clan-editor-${process.pid}.tmp`;
  try { await fs.writeFile(temp, preview.newText, 'utf8'); await fs.rename(temp, absolute); }
  finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  return { changed: true, backup, hash: hash(preview.newText) };
}
