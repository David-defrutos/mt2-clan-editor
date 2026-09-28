import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = process.env.CLAN_EDITOR_HOME
  ? path.resolve(process.env.CLAN_EDITOR_HOME)
  : path.resolve(sourceDir, path.basename(sourceDir) === 'server' ? '../..' : '..');
export const dataRoot = path.join(projectRoot, 'data');
export const configRoot = path.join(projectRoot, 'config');

export function keyForPath(root: string): string {
  return createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0, 20);
}

export function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
