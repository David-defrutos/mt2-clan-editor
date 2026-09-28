import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { configRoot, inside } from './paths.js';
import type { ClanSnapshot, Entry } from './types.js';

interface Category { id: string; label: string; patterns: string[] }
interface Rules { categories: Category[]; fallback: { id: string; label: string }; extensions: string[]; maxUploadBytes: number }
export interface AssetInfo {
  id: string; file: string; image: string; category: string; categoryLabel: string;
  width?: number; height?: number; format?: string; bytes?: number;
  status: 'ok' | 'missing' | 'case-mismatch' | 'invalid-path'; uses: { section: string; id: string; file: string }[];
}

export async function loadAssetRules(): Promise<Rules> {
  return JSON.parse(await fs.readFile(path.join(configRoot, 'assets.json'), 'utf8')) as Rules;
}

function references(value: unknown, target: string): boolean {
  if (typeof value === 'string') return value === target;
  if (Array.isArray(value)) return value.some(item => references(item, target));
  if (value && typeof value === 'object') return Object.values(value).some(item => references(item, target));
  return false;
}

function categoryFor(sprite: Entry, uses: Entry[], rules: Rules): { id: string; label: string } {
  const hint = [sprite.id, sprite.data.path, ...uses.filter(u => u.section === 'game_objects').map(u => u.data.type)].join(' ').toLowerCase();
  return rules.categories.find(category => category.patterns.some(pattern => hint.includes(pattern.toLowerCase()))) ?? rules.fallback;
}

export async function inventoryAssets(clan: ClanSnapshot): Promise<AssetInfo[]> {
  const rules = await loadAssetRules();
  const sprites = clan.entries.filter(entry => entry.section === 'sprites');
  return Promise.all(sprites.map(async sprite => {
    const rawPath = sprite.data.path;
    const image = typeof rawPath === 'string' ? rawPath.replaceAll('\\', '/') : '';
    const target = '@' + sprite.id;
    const uses = clan.entries.filter(entry => entry !== sprite && references(entry.data, target));
    const category = categoryFor(sprite, uses, rules);
    const result: AssetInfo = { id: sprite.id, file: sprite.file, image, category: category.id, categoryLabel: category.label, status: 'missing', uses: uses.map(entry => ({ section: entry.section, id: entry.id, file: entry.file })) };
    const absolute = path.resolve(clan.root, image);
    if (!image || !inside(clan.root, absolute) || !rules.extensions.includes(path.extname(absolute).toLowerCase())) { result.status = 'invalid-path'; return result; }
    let directory = clan.root;
    for (const part of path.relative(clan.root, absolute).split(path.sep)) {
      const names = await fs.readdir(directory).catch(() => [] as string[]);
      const actual = names.find(name => name.toLowerCase() === part.toLowerCase());
      if (actual && actual !== part) result.status = 'case-mismatch';
      directory = path.join(directory, actual ?? part);
    }
    const stat = await fs.stat(directory).catch(() => null);
    if (!stat?.isFile()) return result;
    try {
      const metadata = await sharp(directory).metadata();
      result.width = metadata.width; result.height = metadata.height; result.format = metadata.format; result.bytes = stat.size;
      if (result.status !== 'case-mismatch') result.status = 'ok';
    } catch { result.status = 'invalid-path'; }
    return result;
  }));
}
