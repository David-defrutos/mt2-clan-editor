import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot, inside } from './paths.js';
import type { ClanSnapshot } from './types.js';
export async function bundleInventory(clan: ClanSnapshot) {
  const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'resource-review.json'), 'utf8')) as { bundleSection: string; platforms: { id: string; label: string }[]; comparison: unknown };
  const root = await fs.realpath(clan.root);
  const bundles = await Promise.all(clan.entries.filter(e => e.section === rules.bundleSection).flatMap(entry => rules.platforms.map(async platform => {
    const raw = (entry.data.paths as Record<string, unknown> | undefined)?.[platform.id];
    if (typeof raw !== 'string' || !raw) return { id: entry.id, platform: platform.label, file: entry.file, path: '', status: 'undeclared', bytes: 0 };
    const absolute = path.resolve(clan.root, raw);
    if (!inside(clan.root, absolute)) return { id: entry.id, platform: platform.label, file: entry.file, path: raw, status: 'invalid-path', bytes: 0 };
    const resolved = await fs.realpath(absolute).catch(() => undefined);
    if (!resolved) return { id: entry.id, platform: platform.label, file: entry.file, path: raw, status: 'missing', bytes: 0 };
    if (!inside(root, resolved)) return { id: entry.id, platform: platform.label, file: entry.file, path: raw, status: 'invalid-path', bytes: 0 };
    const stat = await fs.stat(resolved);
    return { id: entry.id, platform: platform.label, file: entry.file, path: raw, status: stat.isFile() ? 'present' : 'invalid-path', bytes: stat.size };
  })));
  const references: { section: string; id: string; field: string; bundle: unknown; assetPath: unknown }[] = [];
  function visit(value: unknown, field: string, section: string, id: string) {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (!Array.isArray(value) && Object.hasOwn(object, 'bundle')) references.push({ section, id, field, bundle: object.bundle, assetPath: object.asset_path });
    Object.entries(object).forEach(([key, v]) => visit(v, field ? field + '.' + key : key, section, id));
  }
  clan.entries.forEach(e => visit(e.data, '', e.section, e.id));
  return { bundles, references, comparison: rules.comparison };
}
