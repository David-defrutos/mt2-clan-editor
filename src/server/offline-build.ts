import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildStatus } from './build.js';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';

const run = promisify(execFile);
interface Settings { localConfigFile: string; outputDirectory: string; targetFramework: string; requiredReferences: string[] }
interface Local { trainworksVersion: string; references: Record<string, string> }
function xml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
async function configuration() {
  const settings = JSON.parse(await fs.readFile(path.join(configRoot, 'offline-build.json'), 'utf8')) as Settings;
  const configFile = path.join(dataRoot, settings.localConfigFile);
  const local = await fs.readFile(configFile, 'utf8').then(value => JSON.parse(value) as Local).catch(() => null);
  const missing: string[] = [];
  for (const name of settings.requiredReferences) {
    const file = local?.references?.[name];
    if (!file || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.dll' || !(await fs.stat(file).catch(() => null))?.isFile()) missing.push(name);
  }
  return { settings, local, configFile, missing };
}
export async function offlineStatus() {
  const { local, configFile, missing } = await configuration();
  return { ready: missing.length === 0, configFile, missing, trainworksVersion: local?.trainworksVersion ?? '' };
}
export async function buildOffline(root: string, relativeProject: string) {
  const status = await buildStatus(root);
  if (!status.projects.includes(relativeProject)) throw new Error('Selecciona un proyecto C# encontrado dentro del clan.');
  const { settings, local, configFile, missing } = await configuration();
  if (missing.length || !local) throw new Error(`Configura ${configFile}. Faltan DLL: ${missing.join(', ')}.`);
  const buildRules = JSON.parse(await fs.readFile(path.join(configRoot, 'build.json'), 'utf8')) as { command: string; configuration: string; excludedDirectories: string[]; timeoutMs: number; maxOutputBytes: number };
  const sourceRoot = path.dirname(path.resolve(root, relativeProject));
  const sources: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !buildRules.excludedDirectories.includes(entry.name)) await visit(file);
      else if (entry.isFile() && entry.name.endsWith('.cs')) sources.push(file);
    }
  }
  await visit(sourceRoot);
  if (!sources.length) throw new Error('No hay fuentes C# junto al proyecto seleccionado.');
  const outputRoot = path.resolve(dataRoot, settings.outputDirectory, keyForPath(root));
  if (!inside(dataRoot, outputRoot)) throw new Error('La salida local debe estar dentro de data/.');
  await fs.mkdir(outputRoot, { recursive: true });
  const buildRoot = await fs.mkdtemp(path.join(outputRoot, 'build-'));
  const assemblyName = path.basename(relativeProject, '.csproj');
  const projectFile = path.join(buildRoot, assemblyName + '.csproj');
  const references = Object.entries(local.references).map(([name, file]) => `<Reference Include="${xml(name)}"><HintPath>${xml(file)}</HintPath><Private>false</Private></Reference>`).join('\n');
  await fs.writeFile(projectFile, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${xml(settings.targetFramework)}</TargetFramework><LangVersion>latest</LangVersion><Nullable>enable</Nullable><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup>${sources.map(file => `<Compile Include="${xml(file)}" />`).join('\n')}${references}</ItemGroup></Project>`);
  await fs.writeFile(path.join(buildRoot, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>');
  const env = { ...process.env };
  if (process.platform === 'win32') env.APPDATA = path.join(buildRoot, 'appdata');
  let log = ''; let exitCode = 0;
  try {
    const result = await run(buildRules.command, ['build', projectFile, '-c', buildRules.configuration, '--nologo'], { cwd: buildRoot, env, timeout: buildRules.timeoutMs, maxBuffer: buildRules.maxOutputBytes, windowsHide: true });
    log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    exitCode = typeof failure.code === 'number' ? failure.code : 1;
    log = [failure.stdout, failure.stderr, failure.message].filter(Boolean).join('\n');
  }
  const dll = path.join(buildRoot, 'bin', buildRules.configuration, settings.targetFramework, assemblyName + '.dll');
  if (exitCode !== 0 || !(await fs.stat(dll).catch(() => null))?.isFile()) return { ok: false, project: relativeProject, exitCode, diagnostic: 'Falló la compilación con DLL locales. Revisa las referencias y el registro.', log: log.slice(-12000) };
  const sha256 = createHash('sha256').update(await fs.readFile(dll)).digest('hex');
  return { ok: true, project: relativeProject, exitCode, dll, sha256, builtAt: new Date().toISOString(), trainworksVersion: local.trainworksVersion, log: log.slice(-12000) };
}
