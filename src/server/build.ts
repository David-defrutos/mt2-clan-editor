import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { configRoot, inside } from './paths.js';
import { buildInputs, recordBuild } from './artifacts.js';

const run = promisify(execFile);
interface BuildRules {
  command: string; configuration: string; projectExtension: string; excludedDirectories: string[];
  maxSearchDepth: number; timeoutMs: number; maxOutputBytes: number;
}
async function rules(): Promise<BuildRules> {
  return JSON.parse(await fs.readFile(path.join(configRoot, 'build.json'), 'utf8')) as BuildRules;
}
async function projects(root: string, rule: BuildRules): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > rule.maxSearchDepth) return;
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory() && !rule.excludedDirectories.includes(item.name)) await visit(absolute, depth + 1);
      else if (item.isFile() && item.name.toLowerCase().endsWith(rule.projectExtension)) result.push(path.relative(root, absolute).replaceAll('\\', '/'));
    }
  }
  await visit(root, 0);
  return result.sort();
}
export async function buildStatus(root: string) {
  const rule = await rules();
  const found = await projects(root, rule);
  try {
    const { stdout } = await run(rule.command, ['--version'], { cwd: root, timeout: 10_000, windowsHide: true });
    return { projects: found, sdkVersion: stdout.trim(), configuration: rule.configuration };
  } catch (error) {
    return { projects: found, sdkVersion: '', configuration: rule.configuration, diagnostic: `No se pudo ejecutar ${rule.command}: ${(error as Error).message.slice(0, 300)}` };
  }
}
async function freshDll(projectFile: string, configuration: string, startedAt: number, rule: BuildRules): Promise<string | null> {
  try {
    const { stdout } = await run(rule.command, ['msbuild', projectFile, '-getProperty:TargetPath', `-property:Configuration=${configuration}`, '-nologo'],
      { cwd: path.dirname(projectFile), timeout: rule.timeoutMs, maxBuffer: rule.maxOutputBytes, windowsHide: true });
    const target = stdout.trim();
    if (target.toLowerCase().endsWith('.dll')) {
      const absolute = path.resolve(path.dirname(projectFile), target);
      if ((await fs.stat(absolute)).mtimeMs >= startedAt - 2000) return absolute;
    }
  } catch { /* Older SDKs may not support property queries; try the conventional output. */ }
  const projectDirectory = path.dirname(projectFile);
  const output = path.join(projectDirectory, 'bin', configuration);
  const expected = path.basename(projectFile, '.csproj') + '.dll';
  async function visit(directory: string): Promise<string | null> {
    for (const item of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) {
        const found = await visit(absolute);
        if (found) return found;
      } else if (item.isFile() && item.name.toLowerCase() === expected.toLowerCase()) {
        if ((await fs.stat(absolute)).mtimeMs >= startedAt - 2000) return absolute;
      }
    }
    return null;
  }
  return visit(output);
}
function diagnostic(log: string): string {
  if (/401\s*\(Unauthorized\)|could not be authenticated/i.test(log)) return 'NuGet no pudo autenticarse en GitHub Packages. Configura una credencial con read:packages y vuelve a compilar.';
  if (/NuGet\.Config.*(?:access.*denied|acceso no autorizado)/i.test(log)) return 'El proceso no puede leer la configuración local de NuGet. Revisa los permisos de esa carpeta.';
  if (/NU1301/i.test(log)) return 'NuGet no pudo consultar una fuente de paquetes. Revisa la conexión y la configuración de esa fuente.';
  if (/NETSDK|SDK.*not found/i.test(log)) return 'Falta el SDK .NET requerido por el proyecto.';
  return 'La compilación falló; revisa el registro de dotnet.';
}
export async function buildClan(root: string, relativeProject: string) {
  const rule = await rules();
  const available = await projects(root, rule);
  if (!available.includes(relativeProject)) throw new Error('Selecciona un proyecto C# encontrado dentro del clan.');
  const projectFile = path.resolve(root, relativeProject);
  if (!inside(root, projectFile)) throw new Error('El proyecto C# debe estar dentro del clan.');
  const inputs = await buildInputs(root);
  const startedAt = Date.now();
  const args = ['build', projectFile, '-c', rule.configuration, '--nologo'];
  let log = '';
  let exitCode = 0;
  try {
    const result = await run(rule.command, args, { cwd: root, timeout: rule.timeoutMs, maxBuffer: rule.maxOutputBytes, windowsHide: true });
    log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    exitCode = typeof failure.code === 'number' ? failure.code : 1;
    log = [failure.stdout, failure.stderr, failure.message].filter(Boolean).join('\n');
  }
  const dll = exitCode === 0 ? await freshDll(projectFile, rule.configuration, startedAt, rule) : null;
  if (exitCode === 0 && !dll) return { ok: false, project: relativeProject, exitCode, diagnostic: 'dotnet terminó sin errores, pero no se encontró una DLL nueva en la salida del proyecto.', log: log.slice(-12000) };
  if (!dll) return { ok: false, project: relativeProject, exitCode, diagnostic: diagnostic(log), log: log.slice(-12000) };
  const sha256 = createHash('sha256').update(await fs.readFile(dll)).digest('hex');
  const builtAt = new Date().toISOString();
  await recordBuild(root, { project: relativeProject, mode: 'packages', dll, sha256, builtAt }, inputs);
  return { ok: true, project: relativeProject, exitCode, dll, sha256, builtAt, log: log.slice(-12000) };
}
