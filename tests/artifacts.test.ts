import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { artifactStatus, buildInputs, packageClan, recordBuild } from '../src/server/artifacts.ts';

test('prepara DLL y contenido y detecta cambios de JSON, C# y DLL', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-package-'));
  const root = path.join(parent, 'clan');
  try {
    await fs.mkdir(path.join(root, 'json'), { recursive: true });
    await fs.mkdir(path.join(root, 'textures'));
    await fs.writeFile(path.join(root, 'json', 'clan.json'), '{"cards":[]}');
    await fs.writeFile(path.join(root, 'textures', 'art.png'), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(root, 'Plugin.cs'), 'class Plugin {}');
    const dll = path.join(parent, 'Plugin.dll');
    await fs.writeFile(dll, 'compiled result');
    await assert.rejects(() => packageClan(root), /Compila la DLL/);
    const sha256 = createHash('sha256').update(await fs.readFile(dll)).digest('hex');
    await recordBuild(root, { dll, sha256, project: 'Plugin.csproj', mode: 'test', builtAt: new Date().toISOString() }, await buildInputs(root));
    const packed = await packageClan(root);
    assert.equal(await fs.readFile(path.join(packed.destination, 'Plugin.dll'), 'utf8'), 'compiled result');
    assert.equal(await fs.readFile(path.join(packed.destination, 'json', 'clan.json'), 'utf8'), '{"cards":[]}');
    assert.equal((await artifactStatus(root)).package?.fresh, true);
    await fs.writeFile(path.join(packed.destination, 'textures', 'art.png'), 'changed outside editor');
    assert.ok((await artifactStatus(root)).package?.changed.includes('Salida preparada'));
    await fs.writeFile(path.join(root, 'json', 'clan.json'), '{"cards":[{"id":"New"}]}');
    const changedContent = await artifactStatus(root);
    assert.equal(changedContent.build?.fresh, true, 'el JSON puede actualizarse sin recompilar');
    assert.equal(changedContent.package?.fresh, false);
    assert.ok(changedContent.package?.changed.includes('json/clan.json'));
    const updated = await packageClan(root);
    assert.notEqual(updated.destination, packed.destination);
    assert.equal((await artifactStatus(root)).package?.fresh, true);
    await fs.writeFile(path.join(root, 'Plugin.cs'), 'class Modified {}');
    await assert.rejects(() => packageClan(root), /Vuelve a compilar/);
    await fs.writeFile(path.join(root, 'Plugin.cs'), 'class Plugin {}');
    await fs.writeFile(dll, 'corrupted result');
    assert.equal((await artifactStatus(root)).build?.fresh, false);
    await assert.rejects(() => packageClan(root), /DLL compilada/);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
