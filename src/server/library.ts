import fs from 'node:fs/promises';
import path from 'node:path';
import { dataRoot, keyForPath } from './paths.js';
import type { LibraryItem } from './types.js';

const libraryFile = path.join(dataRoot, 'library.json');

export async function loadLibrary(): Promise<LibraryItem[]> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(libraryFile, 'utf8'));
    return Array.isArray(value) ? value as LibraryItem[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLibrary(items: LibraryItem[]): Promise<void> {
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(libraryFile, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

export async function addLibraryPath(input: string): Promise<LibraryItem> {
  const root = await fs.realpath(path.resolve(input));
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('La ruta no es una carpeta.');
  const jsonDir = path.join(root, 'json');
  if (!(await fs.stat(jsonDir).catch(() => null))?.isDirectory()) throw new Error('No se encuentra la carpeta json/ del clan.');
  const item: LibraryItem = { key: keyForPath(root), root, addedAt: new Date().toISOString() };
  const items = await loadLibrary();
  if (!items.some(existing => existing.key === item.key)) await writeLibrary([...items, item]);
  return item;
}

export async function removeLibraryItem(key: string): Promise<void> {
  const items = await loadLibrary();
  await writeLibrary(items.filter(item => item.key !== key));
}

export async function getLibraryItem(key: string): Promise<LibraryItem> {
  const item = (await loadLibrary()).find(entry => entry.key === key);
  if (!item) throw new Error('El clan no está en la biblioteca.');
  return item;
}
