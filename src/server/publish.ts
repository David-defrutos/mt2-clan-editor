import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dataRoot, keyForPath } from './paths.js';

const run = promisify(execFile);
async function command(bin: string, args: string[], cwd: string): Promise<string> {
  const result = await run(bin, args, { cwd, timeout: 30_000, maxBuffer: 2_000_000, windowsHide: true });
  return result.stdout.trimEnd();
}
async function git(root: string, ...args: string[]): Promise<string> { return command('git', args, root); }

export async function publishStatus(root: string) {
  try {
    const repository = (await git(root, 'rev-parse', '--show-toplevel')).trim();
    const [branch, sha, files, remote] = await Promise.all([
      git(root, 'branch', '--show-current').then(value => value.trim()), git(root, 'rev-parse', 'HEAD').then(value => value.trim()),
      git(root, 'status', '--short', '--', '.'),
      git(root, 'remote', 'get-url', 'origin').then(value => value.trim()).catch(() => '')
    ]);
    let runs: { databaseId: number; headSha: string; status: string; conclusion: string | null; url: string; workflowName: string }[] = [];
    let actionsError = '';
    if (remote && sha) {
      try { runs = JSON.parse(await command('gh', ['run', 'list', '--commit', sha, '--limit', '10', '--json', 'databaseId,headSha,status,conclusion,url,workflowName'], root)); }
      catch (error) { actionsError = (error as Error).message.slice(0, 500); }
    }
    return { repository, branch, sha, remote, files: files ? files.split(/\r?\n/) : [], runs, actionsError };
  } catch (error) { return { error: `No se encontró un repositorio Git: ${(error as Error).message.slice(0, 300)}` }; }
}

export async function commitClan(root: string, message: string) {
  if (!message.trim() || message.length > 200 || /[\r\n]/.test(message)) throw new Error('El mensaje de commit debe tener de 1 a 200 caracteres en una línea.');
  const status = await publishStatus(root);
  if ('error' in status) throw new Error(status.error);
  if (!status.files.length) throw new Error('No hay cambios en esta carpeta.');
  await git(root, 'add', '--all', '--', '.');
  await git(root, 'commit', '--only', '-m', message.trim(), '--', '.');
  return publishStatus(root);
}

export async function pushClan(root: string) {
  const status = await publishStatus(root);
  if ('error' in status) throw new Error(status.error);
  if (!status.remote) throw new Error('Configura un remoto origin antes de enviar.');
  if (!status.branch) throw new Error('No hay rama activa.');
  if (status.files.length) throw new Error('Guarda o confirma primero los cambios de esta carpeta.');
  await git(root, 'push', '--set-upstream', 'origin', status.branch);
  return publishStatus(root);
}

export async function downloadDll(root: string, runId: number) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('ID de workflow no válido.');
  const status = await publishStatus(root);
  if ('error' in status) throw new Error(status.error);
  const selected = status.runs.find(run => run.databaseId === runId && run.headSha === status.sha && run.conclusion === 'success');
  if (!selected) throw new Error('El run debe haber terminado correctamente y pertenecer al commit actual.');
  const destination = path.join(dataRoot, 'downloads', keyForPath(root), status.sha, String(runId));
  await fs.mkdir(destination, { recursive: true });
  await command('gh', ['run', 'download', String(runId), '--dir', destination], root);
  const dlls: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.isFile() && item.name.toLowerCase().endsWith('.dll')) dlls.push(file);
    }
  }
  await visit(destination);
  if (!dlls.length) throw new Error(`El run ${runId} descargó artefactos, pero no se encontró una DLL en ${destination}.`);
  return { runId, sha: status.sha, destination, dlls };
}
