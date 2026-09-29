import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClan } from '../src/server/create.ts';
import { buildOffline, offlineStatus } from '../src/server/offline-build.ts';

test('compila un clan nuevo con DLL locales y conserva todos sus archivos', async t => {
  if (!(await offlineStatus()).ready) { t.skip('No hay DLL locales configuradas.'); return; }
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-offline-'));
  try {
    const root = await createClan({ destination: path.join(parent, 'OfflineClan'), name: 'Clan offline', id: 'OfflineClan', author: 'Pruebas', champions: ['Uno', 'Dos'], starters: ['Inicial uno', 'Inicial dos'], draftCount: 4 });
    async function hashes(directory: string): Promise<Record<string, string>> {
      const result: Record<string, string> = {};
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) Object.assign(result, await hashes(file));
        else result[path.relative(root, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
      }
      return result;
    }
    const before = await hashes(root);
    await assert.rejects(() => buildOffline(root, '../External.csproj'), /dentro del clan/);
    const result = await buildOffline(root, 'src/OfflineClan.Plugin.csproj');
    assert.equal(result.ok, true, result.log);
    assert.match(result.sha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(path.basename(result.dll ?? ''), 'OfflineClan.Plugin.dll');
    assert.deepEqual(await hashes(root), before);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
