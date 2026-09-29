import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildClan, buildStatus } from '../src/server/build.ts';

test('detecta proyectos C# y solo permite compilar uno dentro del clan', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-build-'));
  try {
    await fs.mkdir(path.join(root, 'src', 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'Clan.Plugin.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>');
    await fs.writeFile(path.join(root, 'src', 'bin', 'Ignorado.csproj'), '<Project/>');
    const status = await buildStatus(root);
    assert.deepEqual(status.projects, ['src/Clan.Plugin.csproj']);
    await assert.rejects(() => buildClan(root, '../Otro.csproj'), /dentro del clan/);
    await assert.rejects(() => buildClan(root, 'src/bin/Ignorado.csproj'), /dentro del clan/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
