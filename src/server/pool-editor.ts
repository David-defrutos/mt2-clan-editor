import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';

interface Rules { builtInPools: string[]; maxBatchSize: number; warnings: Record<string, string>; directMembersWarning: string; useDirectListWhenDeclared: boolean }
export interface PoolChange { id: string; file: string; expectedHash: string; member: boolean }
export interface PoolRequest { root: string; pool: string; changes: PoolChange[]; expectedToken?: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ((value as JsonRecord).mod_reference) return;
    value = (value as JsonRecord).id;
  }
  return typeof value === 'string' ? value : undefined;
}
async function rules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'pool-editor.json'), 'utf8')); }
export function removeArrayItem(source: string, base: (string | number)[], index: number) {
  const root = jsonc.parseTree(source);
  const children = root && jsonc.findNodeAtLocation(root, base)?.children;
  const node = children?.[index]; if (!node || !children) throw new Error('No se pudo localizar el miembro del pool.');
  const previous = children[index - 1]; const next = children[index + 1];
  if (previous) {
    const start = previous.offset + previous.length;
    return jsonc.applyEdits(source, [{ offset: start, length: node.offset + node.length - start, content: '' }]);
  }
  if (next) return jsonc.applyEdits(source, [{ offset: node.offset, length: next.offset - node.offset, content: '' }]);
  const edits = [{ offset: node.offset, length: node.length, content: '' }];
  const scanner = jsonc.createScanner(source, true); scanner.setPosition(node.offset + node.length);
  if (scanner.scan() === jsonc.SyntaxKind.CommaToken) edits.push({ offset: scanner.getTokenOffset(), length: scanner.getTokenLength(), content: '' });
  return jsonc.applyEdits(source, edits);
}
function catalog(clan: ClanSnapshot, rule: Rules) {
  const local = clan.entries.filter(e => e.section === 'card_pools' && typeof e.data.id === 'string');
  const declared = new Set(local.map(e => '@' + e.id));
  const used = clan.entries.filter(e => e.section === 'cards').flatMap(e => Array.isArray(e.data.pools) ? e.data.pools.map(ref).filter((x): x is string => x !== undefined) : []);
  return [...new Set([...rule.builtInPools, ...declared, ...used])].sort().map(id => {
    const definitions = local.filter(e => '@' + e.id === id);
    const valid = declared.has(id) ? definitions.length === 1 : rule.builtInPools.includes(id);
    const malformed = definitions.some(e => e.data.cards !== undefined && !Array.isArray(e.data.cards));
    const direct = definitions.some(e => Array.isArray(e.data.cards));
    const directCards = definitions.flatMap(e => Array.isArray(e.data.cards) ? e.data.cards : e.data.cards === undefined ? [] : [e.data.cards]);
    return { id, editable: valid && !malformed, additionLocation: direct && rule.useDirectListWhenDeclared ? 'pool' : 'card', definition: definitions.length === 1 ? { id: definitions[0].id, file: definitions[0].file } : undefined, directCards, warning: !valid ? 'Pool sin definición local única ni regla de pool del juego. Solo lectura; revisa su referencia o añade una regla de configuración.' : malformed ? 'La lista cards de este pool no es un array. Revisa el JSON antes de editar sus miembros.' : direct ? rule.directMembersWarning : rule.warnings[id] ?? '' };
  });
}
async function state(root: string) {
  const clan = await scanClan(root);
  const files = await Promise.all(clan.files.map(async file => [file, hash(await fs.readFile(path.join(root, file), 'utf8'))]));
  return hash(JSON.stringify([await fs.readFile(path.join(configRoot, 'pool-editor.json'), 'utf8'), files]));
}
export async function poolModel(root: string) {
  const clan = await scanClan(root); const rule = await rules();
  const cards = clan.entries.filter(e => e.section === 'cards');
  const pools = catalog(clan, rule);
  return { pools, maxBatchSize: rule.maxBatchSize, cards: cards.map(e => ({
    id: e.id, name: e.name, file: e.file, hash: e.hash, rarity: String(e.data.rarity ?? ''), type: String(e.data.card_type ?? ''),
    pools: [...new Set([...(Array.isArray(e.data.pools) ? e.data.pools.map(ref).filter((x): x is string => x !== undefined) : []), ...pools.filter(p => p.directCards.some(value => ref(value) === '@' + e.id)).map(p => p.id)])],
    directPools: pools.filter(p => p.directCards.some(value => ref(value) === '@' + e.id)).map(p => p.id),
    cardPools: Array.isArray(e.data.pools) ? e.data.pools.map(ref).filter((x): x is string => x !== undefined) : [],
    editable: e.data.id === e.id && cards.filter(c => c.id === e.id).length === 1 && (e.data.pools === undefined || Array.isArray(e.data.pools))
  })) };
}
export async function preparePoolChanges(request: PoolRequest) {
  const initial = await state(request.root); const rule = await rules(); const clan = await scanClan(request.root);
  const pool = catalog(clan, rule).find(p => p.id === request.pool);
  if (!pool?.editable) throw new Error(pool?.warning || 'Selecciona un pool del juego configurado o un pool local con ID único.');
  if (!Array.isArray(request.changes) || !request.changes.length || request.changes.length > rule.maxBatchSize) throw new Error(`Selecciona entre 1 y ${rule.maxBatchSize} cambios.`);
  const seen = new Set<string>();
  const files = new Map<string, { file: string; absolute: string; original: string; newText: string; oldHash: string }>();
  const changes: { id: string; name: string; file: string; before: boolean; after: boolean; locations: string[] }[] = [];
  const definition = pool.definition ? clan.entries.find(e => e.section === 'card_pools' && e.id === pool.definition!.id && e.file === pool.definition!.file)! : undefined;
  async function openFile(entry: Entry) {
    let file = files.get(entry.file); if (file) return file;
    const absolute = path.resolve(request.root, entry.file);
    if (!inside(path.join(request.root, 'json'), absolute) || !inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('El archivo sale del clan.');
    const original = await fs.readFile(absolute, 'utf8');
    if (hash(original) !== entry.hash) throw new Error('El archivo cambió en disco. Actualiza el clan.');
    file = { file: entry.file, absolute, original, newText: original, oldHash: entry.hash }; files.set(entry.file, file); return file;
  }
  function editList(file: Awaited<ReturnType<typeof openFile>>, base: (string | number)[], target: string, member: boolean) {
    const bom = file.newText.startsWith('\uFEFF') ? '\uFEFF' : ''; let source = bom ? file.newText.slice(1) : file.newText;
    // Read the staged array again: previous changes may have removed elements in this same pool.
    const document = jsonc.parse(source);
    const members = base.reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[part] : undefined, document);
    if (members !== undefined && !Array.isArray(members)) throw new Error('La lista de pertenencias no es un array.');
    const values = (members ?? []) as unknown[];
    const indent = source.match(/\n(\s+)"/)?.[1] ?? '  ';
    const options = { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: source.includes('\r\n') ? '\r\n' : '\n' } };
    if (member) {
      if (values.some(value => ref(value) === target)) return;
      source = jsonc.applyEdits(source, jsonc.modify(source, members === undefined ? base : [...base, -1], members === undefined ? [target] : target, options));
    } else {
      for (let i = values.length - 1; i >= 0; i--) if (ref(values[i]) === target) source = removeArrayItem(source, base, i);
    }
    file.newText = bom + source;
  }
  for (const change of request.changes) {
    if (!change || typeof change.id !== 'string' || typeof change.file !== 'string' || typeof change.expectedHash !== 'string' || typeof change.member !== 'boolean') throw new Error('Cambio de pool inválido.');
    if (seen.has(change.id)) throw new Error('Una carta está seleccionada más de una vez.'); seen.add(change.id);
    const entries = clan.entries.filter(e => e.section === 'cards' && e.id === change.id);
    const entry = entries[0];
    if (entries.length !== 1 || entry.file !== change.file || entry.data.id !== change.id) throw new Error('La carta necesita un ID local único.');
    if (entry.data.pools !== undefined && !Array.isArray(entry.data.pools)) throw new Error('La lista de pools de la carta no es válida. Revisa su JSON.');
    const file = await openFile(entry);
    if (file.oldHash !== change.expectedHash || entry.hash !== change.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan.');
    const members = (entry.data.pools ?? []) as unknown[];
    const inCard = members.some(value => ref(value) === request.pool);
    const inPool = pool.directCards.some(value => ref(value) === '@' + entry.id);
    const before = inCard || inPool;
    if (before === change.member) continue;
    const locations: string[] = [];
    if (change.member ? pool.additionLocation === 'card' : inCard) {
      editList(file, ['cards', entry.index, 'pools'], request.pool, change.member);
      locations.push(entry.file + ' · carta.pools');
    }
    if (definition && (change.member ? pool.additionLocation === 'pool' : inPool)) {
      editList(await openFile(definition), ['card_pools', definition.index, 'cards'], '@' + entry.id, change.member);
      locations.push(definition.file + ' · pool.cards');
    }
    changes.push({ id: entry.id, name: entry.name, file: entry.file, before, after: change.member, locations });
  }
  const changedFiles = [...files.values()].filter(f => f.newText !== f.original);
  for (const file of changedFiles) { const errors: jsonc.ParseError[] = []; jsonc.parse(file.newText.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true }); if (errors.length) throw new Error('El cambio produciría JSON inválido.'); }
  const final = await state(request.root); if (initial !== final) throw new Error('El clan cambió durante la preparación. Vuelve a previsualizar.');
  const token = hash(JSON.stringify([final, request.pool, request.changes]));
  if (request.expectedToken && token !== request.expectedToken) throw new Error('La vista previa ha caducado. Vuelve a previsualizar.');
  return { pool: request.pool, warning: pool.warning, changes, files: changedFiles, token, state: final };
}
const saving = new Set<string>();
export async function savePoolChanges(request: PoolRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza los cambios antes de guardar.');
  const lock = (await fs.realpath(request.root)).toLowerCase(); if (saving.has(lock)) throw new Error('Hay otro guardado de pools en curso.'); saving.add(lock);
  try {
    const prepared = await preparePoolChanges(request);
    if (!prepared.files.length) return { changed: false, count: 0 };
    const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root)); await fs.mkdir(backupRoot, { recursive: true });
    const backup = await fs.mkdtemp(path.join(backupRoot, 'pools-'));
    const staged = prepared.files.map(f => ({ ...f, temp: f.absolute + `.${path.basename(backup)}.tmp` }));
    const applied: typeof staged = []; const journal = path.join(backup, 'transaction.json');
    try {
      for (const file of staged) { const target = path.join(backup, file.file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.original, { flag: 'wx' }); await fs.writeFile(file.temp, file.newText, { flag: 'wx' }); }
      await fs.writeFile(journal, JSON.stringify({ status: 'prepared', pool: request.pool, files: staged.map(f => f.file) }, null, 2));
      if (await state(request.root) !== prepared.state) throw new Error('El clan cambió antes del guardado.');
      for (const file of staged) { if (hash(await fs.readFile(file.absolute, 'utf8')) !== file.oldHash) throw new Error('El archivo cambió durante el guardado.'); await fs.rename(file.temp, file.absolute); applied.push(file); }
      await fs.writeFile(journal, JSON.stringify({ status: 'saved', pool: request.pool, files: applied.map(f => f.file) }, null, 2));
      return { changed: true, count: prepared.changes.length, backup };
    } catch (error) {
      const unresolved: string[] = [];
      for (const file of [...applied].reverse()) { try { if (hash(await fs.readFile(file.absolute, 'utf8')) !== hash(file.newText)) { unresolved.push(file.file); continue; } await fs.writeFile(file.temp, file.original); await fs.rename(file.temp, file.absolute); } catch { unresolved.push(file.file); } }
      await fs.writeFile(journal, JSON.stringify({ status: unresolved.length ? 'recovery-needed' : 'rolled-back', unresolved }, null, 2)).catch(() => undefined);
      throw new Error(`${(error as Error).message} Copias originales: ${backup}.${unresolved.length ? ` Recuperación pendiente: ${unresolved.join(', ')}.` : ''}`);
    } finally { for (const file of staged) await fs.rm(file.temp, { force: true }).catch(() => undefined); }
  } finally { saving.delete(lock); }
}
