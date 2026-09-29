import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import { isDraft, loadStatsRules } from './stats.js';
import type { ClanSnapshot, JsonRecord } from './types.js';

interface Settings { levelField: string; defaultLevel: number; maxBatchSize: number }
export interface UnlockChange { id: string; file: string; expectedHash: string; level: number | null }
function hash(text: string): string { return createHash('sha256').update(text).digest('hex'); }
async function settings(): Promise<Settings> { return JSON.parse(await fs.readFile(path.join(configRoot, 'progression.json'), 'utf8')) as Settings; }
function reference(value: unknown): string { return typeof value === 'string' ? value : String((value as JsonRecord | null)?.id ?? ''); }
async function eligible(clan: ClanSnapshot) {
  const rules = await loadStatsRules();
  const starters = new Set(clan.entries.filter(entry => entry.section === 'classes').flatMap(entry => Array.isArray(entry.data.champions) ? entry.data.champions.map(champion => reference((champion as JsonRecord).starter_card)) : []));
  return clan.entries.filter(entry => entry.section === 'cards' && isDraft(entry, rules) && !starters.has('@' + entry.id) && !(Array.isArray(entry.data.pools) && entry.data.pools.includes(rules.starterPool)));
}
export async function progressionStatus(root: string) {
  const clan = await scanClan(root);
  const rule = await settings();
  const stats = await loadStatsRules();
  return { defaultLevel: rule.defaultLevel, maxLevel: stats.progressionMaxLevel, maxBatchSize: rule.maxBatchSize,
    cards: (await eligible(clan)).map(entry => ({ id: entry.id, name: entry.name, file: entry.file, hash: entry.hash, level: entry.data[rule.levelField] ?? null })),
    technicalCount: clan.entries.filter(entry => entry.section === 'cards' && stats.technicalUnlockLevels.includes(Number(entry.data[rule.levelField]))).length };
}
export async function prepareUnlocks(root: string, changes: UnlockChange[]) {
  const rule = await settings();
  const stats = await loadStatsRules();
  if (!Array.isArray(changes) || !changes.length || changes.length > rule.maxBatchSize) throw new Error(`Selecciona entre 1 y ${rule.maxBatchSize} cartas.`);
  const clan = await scanClan(root);
  const allowed = await eligible(clan);
  const seen = new Set<string>();
  const files = new Map<string, { file: string; absolute: string; original: string; newText: string; oldHash: string }>();
  const result: { id: string; file: string; name: string; before: unknown; after: number | null }[] = [];
  for (const change of changes) {
    if (!change || typeof change.id !== 'string' || typeof change.file !== 'string' || typeof change.expectedHash !== 'string') throw new Error('La selección de cartas no es válida.');
    if (change.level !== null && (!Number.isInteger(change.level) || change.level < 0 || change.level > stats.progressionMaxLevel)) throw new Error(`El nivel debe estar entre 0 y ${stats.progressionMaxLevel}.`);
    const identity = change.file + ':' + change.id;
    if (seen.has(identity)) throw new Error('Una carta está seleccionada más de una vez.');
    seen.add(identity);
    const matches = allowed.filter(entry => entry.file === change.file && entry.id === change.id);
    if (matches.length > 1) throw new Error(`${change.id} está duplicado en ${change.file}. Resuelve el ID duplicado antes de editar.`);
    const entry = matches[0];
    if (!entry) throw new Error(`${change.id} no admite edición de progresión normal. Actualiza el clan.`);
    const absolute = path.resolve(root, change.file);
    if (!inside(root, absolute)) throw new Error('El archivo debe estar dentro del clan.');
    let file = files.get(change.file);
    if (!file) {
      const original = await fs.readFile(absolute, 'utf8');
      file = { file: change.file, absolute, original, newText: original, oldHash: hash(original) };
      files.set(change.file, file);
    }
    if (file.oldHash !== change.expectedHash) throw new Error(`${change.file} cambió en disco. Actualiza el clan antes de guardar.`);
    const after = change.level === 0 || change.level === null ? undefined : change.level;
    const before = entry.data[rule.levelField];
    if (before === after) continue;
    const bom = file.newText.startsWith('\uFEFF') ? '\uFEFF' : '';
    const source = bom ? file.newText.slice(1) : file.newText;
    const indent = source.match(/\n(\s+)"/)?.[1] ?? '  ';
    file.newText = bom + jsonc.applyEdits(source, jsonc.modify(source, ['cards', entry.index, rule.levelField], after, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: source.includes('\r\n') ? '\r\n' : '\n' } }));
    result.push({ id: entry.id, file: entry.file, name: entry.name, before: before ?? null, after: after ?? null });
  }
  const changedFiles = [...files.values()].filter(file => file.newText !== file.original);
  for (const file of changedFiles) {
    const errors: jsonc.ParseError[] = [];
    jsonc.parse(file.newText.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length) throw new Error('El cambio produciría JSON inválido.');
  }
  return { changes: result, files: changedFiles };
}
export async function saveUnlocks(root: string, changes: UnlockChange[]) {
  const prepared = await prepareUnlocks(root, changes);
  if (!prepared.files.length) return { changed: false, count: 0 };
  const backupRoot = path.join(dataRoot, 'backups', keyForPath(root));
  await fs.mkdir(backupRoot, { recursive: true });
  const backup = await fs.mkdtemp(path.join(backupRoot, 'progression-'));
  const staged = prepared.files.map(file => ({ ...file, temp: file.absolute + `.${path.basename(backup)}.tmp` }));
  const applied: typeof staged = [];
  const journal = path.join(backup, 'transaction.json');
  try {
    for (const file of staged) {
      const destination = path.join(backup, file.file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.original, 'utf8');
      await fs.writeFile(file.temp, file.newText, 'utf8');
    }
    await fs.writeFile(journal, JSON.stringify({ status: 'prepared', files: staged.map(file => file.file) }, null, 2));
    for (const file of staged) if (hash(await fs.readFile(file.absolute, 'utf8')) !== file.oldHash) throw new Error(`${file.file} cambió en disco durante la preparación.`);
    for (const file of staged) {
      if (hash(await fs.readFile(file.absolute, 'utf8')) !== file.oldHash) throw new Error(`${file.file} cambió en disco durante el guardado.`);
      await fs.rename(file.temp, file.absolute);
      applied.push(file);
    }
    await fs.writeFile(journal, JSON.stringify({ status: 'saved', files: applied.map(file => file.file) }, null, 2));
    return { changed: true, count: prepared.changes.length, backup };
  } catch (error) {
    const unresolved: string[] = [];
    for (const file of [...applied].reverse()) {
      try {
        if (hash(await fs.readFile(file.absolute, 'utf8')) !== hash(file.newText)) { unresolved.push(file.file); continue; }
        await fs.writeFile(file.temp, file.original, 'utf8');
        await fs.rename(file.temp, file.absolute);
      } catch { unresolved.push(file.file); }
    }
    await fs.writeFile(journal, JSON.stringify({ status: unresolved.length ? 'recovery-needed' : 'rolled-back', unresolved }, null, 2)).catch(() => undefined);
    throw new Error(`${(error as Error).message} Copias originales en ${backup}.${unresolved.length ? ` Revisa ${unresolved.join(', ')}: hubo cambios externos durante la recuperación.` : ''}`);
  } finally {
    for (const file of staged) await fs.rm(file.temp, { force: true }).catch(() => undefined);
  }
}
