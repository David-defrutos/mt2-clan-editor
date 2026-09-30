import fs from 'node:fs/promises';
import path from 'node:path';
import * as jsonc from 'jsonc-parser';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { addLibraryPath, loadLibrary } from './library.js';
import { scanClan } from './scan.js';

interface Rules { roots: string[]; disabledSuffixes: string[]; maxFiles: number; maxBytes: number }
export interface FoundMod { root: string; name: string; version: string; classes: string[]; status: 'ready' | 'disabled' | 'not-clan' | 'invalid'; reason: string }
async function rules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'library-discovery.json'), 'utf8')); }
async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(folder: string) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file); else if (entry.isFile()) result.push(file);
    }
  }
  await visit(root); return result.sort();
}
function activeName(file: string, config: Rules) { const suffix = config.disabledSuffixes.find(suffix => file.endsWith(suffix)); return suffix ? file.slice(0, -suffix.length) : file; }
export async function inspectMod(root: string): Promise<FoundMod> {
  const config = await rules();
  root = await fs.realpath(root);
  const found: FoundMod = { root, name: path.basename(root), version: '', classes: [], status: 'not-clan', reason: 'Sin definición de clan en json/: complemento o formato no compatible.' };
  for (const filename of ['manifest.json', ...config.disabledSuffixes.map(suffix => 'manifest.json' + suffix)]) {
    try { const manifest = JSON.parse(await fs.readFile(path.join(root, filename), 'utf8')); found.name = String(manifest.name ?? found.name); found.version = String(manifest.version_number ?? ''); break; } catch { /* Manifest optional. */ }
  }
  const jsonRoot = path.join(root, 'json');
  if (!(await fs.stat(jsonRoot).catch(() => null))?.isDirectory()) return found;
  const jsonFiles = (await files(jsonRoot)).filter(file => activeName(file, config).endsWith('.json'));
  let disabled = false; let errors = false;
  for (const file of jsonFiles) {
    const parseErrors: jsonc.ParseError[] = [];
    const document = jsonc.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''), parseErrors, { allowTrailingComma: true, disallowComments: false });
    if (parseErrors.length || !document || typeof document !== 'object') { errors = true; continue; }
    if (file !== activeName(file, config)) disabled = true;
    if (Array.isArray(document.classes)) found.classes.push(...document.classes.map((clan: { id?: string }) => String(clan.id ?? 'Sin ID')));
  }
  if (errors) { found.status = 'invalid'; found.reason = 'Hay JSON inválidos: revisa sus archivos antes de importar.'; }
  else if (found.classes.length) { found.status = disabled ? 'disabled' : 'ready'; found.reason = disabled ? 'Archivos desactivados: se importará una copia independiente, sin cambiar la instalación.' : 'Clan con JSON editables.'; }
  return found;
}
export async function discoverMods(input?: string) {
  const config = await rules();
  const roots = input ? [path.resolve(input)] : config.roots.flatMap(root => {
    let missing = false;
    const expanded = root.replace(/\$\{(\w+)\}/g, (_, variable: string) => { if (!process.env[variable]) missing = true; return process.env[variable] ?? ''; });
    return missing ? [] : [path.resolve(expanded)];
  });
  const mods: FoundMod[] = []; const warnings: string[] = [];
  for (const root of roots) {
    try {
      if ((await fs.stat(path.join(root, 'json')).catch(() => null))?.isDirectory()) mods.push(await inspectMod(root));
      else for (const entry of await fs.readdir(root, { withFileTypes: true })) if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const folder = path.join(root, entry.name);
        try { mods.push(await inspectMod(folder)); } catch (error) { warnings.push(`${folder}: ${(error as Error).message}`); }
      }
    } catch (error) { warnings.push(`${root}: ${(error as Error).message}`); }
  }
  return { roots, mods, warnings };
}
export async function importDiscovered(input: string) {
  const mod = await inspectMod(input);
  if (mod.status === 'ready') return { item: await addLibraryPath(mod.root), copied: false };
  if (mod.status !== 'disabled') throw new Error(mod.reason);
  for (const item of await loadLibrary()) {
    if (!inside(path.join(dataRoot, 'imports'), item.root)) continue;
    try {
      const record = JSON.parse(await fs.readFile(path.join(item.root, '.clan-editor-import.json'), 'utf8'));
      if (record.sourceKey === keyForPath(mod.root)) return { item, copied: true };
    } catch { /* A library folder need not have an import record. */ }
  }
  const config = await rules();
  const sourceFiles = await files(mod.root);
  if (sourceFiles.length > config.maxFiles) throw new Error('El mod supera el límite de archivos para importar.');
  const names = new Set<string>(); let bytes = 0;
  const plan: { source: string; relative: string }[] = [];
  for (const source of sourceFiles) {
    const relative = activeName(path.relative(mod.root, source), config);
    if (names.has(relative.toLowerCase())) throw new Error(`Archivos activos y desactivados se solapan: ${relative}.`);
    names.add(relative.toLowerCase()); bytes += (await fs.stat(source)).size;
    plan.push({ source, relative });
  }
  if (bytes > config.maxBytes) throw new Error('El mod supera el límite de tamaño para importar.');
  const parent = path.join(dataRoot, 'imports'); await fs.mkdir(parent, { recursive: true });
  const destination = await fs.mkdtemp(path.join(parent, path.basename(mod.root).replace(/[^A-Za-z0-9_-]/g, '_') + '-'));
  try {
    for (const file of plan) {
      const output = path.resolve(destination, file.relative);
      if (!inside(destination, output)) throw new Error('La ruta sale de la copia de trabajo.');
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.copyFile(file.source, output, fs.constants.COPYFILE_EXCL);
    }
    const snapshot = await scanClan(destination);
    if (!snapshot.classId || snapshot.issues.some(issue => issue.code === 'json-parse')) throw new Error('La copia tiene errores de lectura: ' + snapshot.issues.map(issue => issue.message).join('; '));
    await fs.writeFile(path.join(destination, '.clan-editor-import.json'), JSON.stringify({ source: mod.root, sourceKey: keyForPath(mod.root), importedAt: new Date().toISOString(), disabledSuffixes: config.disabledSuffixes }, null, 2));
    return { item: await addLibraryPath(destination), copied: true };
  } catch (error) { await fs.rm(destination, { recursive: true, force: true }); throw error; }
}
