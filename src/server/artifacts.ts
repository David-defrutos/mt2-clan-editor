import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';

interface Rules { buildInputs: string[]; excludedDirectories: string[]; requiredContent: string[]; optionalContent: string[]; receiptDirectory: string; packageDirectory: string; provenanceFile: string }
type Hashes = Record<string, string>;
interface Receipt { project: string; mode: string; dll: string; sha256: string; builtAt: string; inputs: Hashes; dependencies?: Hashes; trainworksVersion?: string }
interface PackageReceipt { destination: string; createdAt: string; files: Hashes; sourceContent: Hashes; build: Receipt }
async function rules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'artifacts.json'), 'utf8')) as Rules; }
function digest(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function relative(root: string, file: string): string { return path.relative(root, file).replaceAll('\\', '/'); }
function changes(before: Hashes, after: Hashes): string[] { return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]).sort(); }
async function files(root: string, directory: string, excluded: string[]): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`No se incluyen enlaces simbólicos: ${relative(root, file)}.`);
    if (entry.isDirectory() && !excluded.includes(entry.name)) result.push(...await files(root, file, excluded));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}
async function hashes(root: string, selected: string[]): Promise<Hashes> {
  const result: Hashes = {};
  for (const file of selected.sort()) result[relative(root, file)] = digest(await fs.readFile(file));
  return result;
}
export async function buildInputs(root: string): Promise<Hashes> {
  const rule = await rules();
  return hashes(root, (await files(root, root, rule.excludedDirectories)).filter(file => rule.buildInputs.includes(path.extname(file).toLowerCase())));
}
export async function dependencyHashes(selected: string[]): Promise<Hashes> {
  const result: Hashes = {};
  for (const file of selected) result[file] = digest(await fs.readFile(file));
  return result;
}
function dataPath(directory: string, root: string): string {
  const output = path.resolve(dataRoot, directory, keyForPath(root));
  if (!inside(dataRoot, output)) throw new Error('La salida debe estar dentro de data/.');
  return output;
}
async function load<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function recordBuild(root: string, result: Omit<Receipt, 'inputs'>, inputs: Hashes): Promise<void> {
  const rule = await rules();
  const directory = dataPath(rule.receiptDirectory, root);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'build.json'), JSON.stringify({ ...result, inputs }, null, 2));
}
async function contentFiles(root: string, rule: Rules): Promise<string[]> {
  const result: string[] = [];
  for (const name of [...rule.requiredContent, ...rule.optionalContent]) {
    const file = path.resolve(root, name);
    if (!inside(root, file)) throw new Error('La ruta de contenido debe estar dentro del clan.');
    const stat = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) { if (rule.requiredContent.includes(name)) throw new Error(`Falta el contenido obligatorio ${name}.`); continue; }
    if (stat.isSymbolicLink()) throw new Error(`No se incluyen enlaces simbólicos: ${name}.`);
    if (stat.isDirectory()) result.push(...await files(root, file, rule.excludedDirectories));
    else if (stat.isFile()) result.push(file);
  }
  return [...new Set(result)].sort();
}
async function currentBuild(root: string, rule: Rules) {
  const build = await load<Receipt>(path.join(dataPath(rule.receiptDirectory, root), 'build.json'));
  if (!build) return null;
  const changed = changes(build.inputs, await buildInputs(root));
  for (const [file, hash] of Object.entries(build.dependencies ?? {})) {
    if (await fs.readFile(file).then(digest).catch(() => '') !== hash) changed.push(`Referencia: ${path.basename(file)}`);
  }
  const actual = await fs.readFile(build.dll).then(digest).catch(() => '');
  if (actual !== build.sha256) changed.push('DLL compilada');
  return { ...build, fresh: changed.length === 0, changed };
}
export async function artifactStatus(root: string) {
  const rule = await rules();
  const build = await currentBuild(root, rule);
  const packed = await load<PackageReceipt>(path.join(dataPath(rule.receiptDirectory, root), 'package.json'));
  if (!packed) return { build, package: null };
  const changed = changes(packed.sourceContent, await hashes(root, await contentFiles(root, rule)));
  if (!build?.fresh || build.sha256 !== packed.build.sha256 || changes(packed.build.inputs, build.inputs).length) changed.push('Compilación');
  const output = await files(packed.destination, packed.destination, []).then(selected => hashes(packed.destination, selected)).catch(() => ({}));
  if (changes(packed.files, output).length) changed.push('Salida preparada');
  return { build, package: { destination: packed.destination, createdAt: packed.createdAt, fresh: changed.length === 0, changed } };
}
export async function packageClan(root: string) {
  const rule = await rules();
  const build = await currentBuild(root, rule);
  if (!build) throw new Error('Compila la DLL desde el editor antes de preparar el mod.');
  if (!build.fresh) throw new Error(`Vuelve a compilar: han cambiado ${build.changed.join(', ')}.`);
  const sourceFiles = await contentFiles(root, rule);
  const before = await hashes(root, sourceFiles);
  const directory = dataPath(rule.packageDirectory, root);
  await fs.mkdir(directory, { recursive: true });
  const destination = await fs.mkdtemp(path.join(directory, 'mod-'));
  for (const file of sourceFiles) {
    const target = path.join(destination, relative(root, file));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(file, target);
  }
  await fs.copyFile(build.dll, path.join(destination, path.basename(build.dll)));
  const after = await hashes(root, await contentFiles(root, rule));
  const copied = await hashes(destination, await files(destination, destination, []));
  if (changes(before, after).length || Object.entries(before).some(([file, hash]) => copied[file] !== hash) || copied[path.basename(build.dll)] !== build.sha256 || !(await currentBuild(root, rule))?.fresh) throw new Error('Los archivos cambiaron durante la preparación. Vuelve a preparar el mod.');
  const { dll, fresh, changed, dependencies, ...provenance } = build;
  await fs.writeFile(path.join(destination, rule.provenanceFile), JSON.stringify({ ...provenance, content: before }, null, 2));
  const receipt: PackageReceipt = { destination, createdAt: new Date().toISOString(), files: await hashes(destination, await files(destination, destination, [])), sourceContent: before, build };
  const receipts = dataPath(rule.receiptDirectory, root);
  await fs.writeFile(path.join(receipts, 'package.json'), JSON.stringify(receipt, null, 2));
  return { destination, createdAt: receipt.createdAt, fileCount: Object.keys(receipt.files).length, sha256: build.sha256 };
}
