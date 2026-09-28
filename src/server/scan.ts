import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { keyForPath } from './paths.js';
import type { ClanSnapshot, Entry, Issue, JsonRecord } from './types.js';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function label(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  for (const key of ['english', 'en', 'key']) {
    if (typeof value[key] === 'string') return value[key];
  }
  return undefined;
}

export function displayName(data: JsonRecord): string {
  return label(data.names) ?? label(data.titles) ?? label(data.name) ?? String(data.id ?? 'Sin ID');
}

async function filesUnder(root: string, extension: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await visit(full);
      else if (item.isFile() && item.name.toLowerCase().endsWith(extension)) result.push(full);
    }
  }
  if ((await fs.stat(root).catch(() => null))?.isDirectory()) await visit(root);
  return result.sort();
}

export async function scanClan(root: string): Promise<ClanSnapshot> {
  const jsonRoot = path.join(root, 'json');
  const files = await filesUnder(jsonRoot, '.json');
  if (files.length === 0) throw new Error('No se encontraron archivos JSON en la carpeta json/.');
  const issues: Issue[] = [];
  const entries: Entry[] = [];
  const sections: Record<string, number> = {};
  const ids = new Map<string, string>();

  for (const absolute of files) {
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    const raw = await fs.readFile(absolute, 'utf8');
    const errors: jsonc.ParseError[] = [];
    const document: unknown = jsonc.parse(raw.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length || !isRecord(document)) {
      issues.push({ severity: 'error', code: 'json-parse', message: `No se pudo leer el JSON (${errors.length} errores).`, file: relative });
      continue;
    }
    const hash = createHash('sha256').update(raw).digest('hex');
    for (const [section, values] of Object.entries(document)) {
      if (!Array.isArray(values)) continue;
      sections[section] = (sections[section] ?? 0) + values.length;
      values.forEach((value, index) => {
        if (!isRecord(value)) return;
        const id = typeof value.id === 'string' ? value.id : `${section}[${index}]`;
        const entry: Entry = { section, id, name: displayName(value), file: relative, index, data: value, hash };
        entries.push(entry);
        if (typeof value.id === 'string') {
          const identity = `${section}:${id}`;
          const earlier = ids.get(identity);
          if (earlier) issues.push({ severity: 'error', code: 'duplicate-id', message: `ID duplicado: ${id} (también en ${earlier}).`, file: relative, section, id });
          else ids.set(identity, relative);
        }
      });
    }
  }

  const clan = entries.find(entry => entry.section === 'classes');
  if (!clan) issues.push({ severity: 'error', code: 'no-class', message: 'No se encontró una clase de clan en los JSON.' });
  const classData = clan?.data;
  const textureFiles = await filesUnder(path.join(root, 'textures'), '.png');
  const source = await filesUnder(path.join(root, 'src'), '.cs');
  const dll = (await fs.readdir(root, { withFileTypes: true })).some(item => item.isFile() && item.name.toLowerCase().endsWith('.dll'));

  return {
    key: keyForPath(root), root,
    name: classData ? displayName(classData) : path.basename(root),
    classId: String(classData?.id ?? ''), entries, sections,
    files: files.map(file => path.relative(root, file).replaceAll('\\', '/')),
    issues, textureCount: textureFiles.length,
    hasSource: source.length > 0,
    hasGit: (await fs.stat(path.join(root, '.git')).catch(() => null)) !== null,
    hasDll: dll
  };
}

export function sectionEntries(snapshot: ClanSnapshot, section: string): Entry[] {
  return snapshot.entries.filter(entry => entry.section === section);
}
