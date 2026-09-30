import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-discovery-'));
await fs.mkdir(path.join(workspace, 'config'));
await fs.copyFile(new URL('../config/library-discovery.json', import.meta.url), path.join(workspace, 'config/library-discovery.json'));
process.env.CLAN_EDITOR_HOME = workspace;
const { discoverMods, importDiscovered } = await import('../src/server/discovery.ts');
after(async () => { await fs.rm(workspace, { recursive: true, force: true }); });

test('detecta clanes activos y desactivados y distingue complementos sin classes', async () => {
  const plugins = path.join(workspace, 'plugins'); await fs.mkdir(plugins);
  for (const [name, suffix] of [['Active', ''], ['Disabled', '.old']] as const) {
    const root = path.join(plugins, name); await fs.mkdir(path.join(root, 'json'), { recursive: true });
    await fs.writeFile(path.join(root, 'manifest.json' + suffix), JSON.stringify({ name, version_number: '1.2.3' }));
    await fs.writeFile(path.join(root, 'json/clan.json' + suffix), '\uFEFF{ // comentarios\n"classes": [{"id":"Class' + name + '"}], }');
  }
  await fs.mkdir(path.join(plugins, 'Helper'));
  await fs.writeFile(path.join(plugins, 'Helper/manifest.json'), '{"name":"Helper"}');
  const result = await discoverMods(plugins);
  assert.equal(result.mods.find(mod => mod.name === 'Active')!.status, 'ready');
  assert.equal(result.mods.find(mod => mod.name === 'Disabled')!.status, 'disabled');
  assert.equal(result.mods.find(mod => mod.name === 'Disabled')!.version, '1.2.3');
  assert.equal(result.mods.find(mod => mod.name === 'Helper')!.status, 'not-clan');
});

test('importa copia editable sin reactivar originales y reutiliza una copia ya registrada', async () => {
  const source = path.join(workspace, 'plugins/Disabled');
  await fs.mkdir(path.join(source, 'textures'));
  await fs.writeFile(path.join(source, 'textures/art.png.old'), Buffer.from([1, 2, 3]));
  const original = await fs.readFile(path.join(source, 'json/clan.json.old'));
  const result = await importDiscovered(source);
  assert.equal(result.copied, true);
  assert.notEqual(result.item.root, source);
  assert.deepEqual(await fs.readFile(path.join(result.item.root, 'json/clan.json')), original);
  assert.deepEqual(await fs.readFile(path.join(result.item.root, 'textures/art.png')), Buffer.from([1, 2, 3]));
  assert.deepEqual(await fs.readFile(path.join(source, 'json/clan.json.old')), original);
  await assert.rejects(() => fs.stat(path.join(source, 'json/clan.json')), { code: 'ENOENT' });
  await fs.appendFile(path.join(result.item.root, 'json/clan.json'), '\n// editado');
  const repeated = await importDiscovered(source);
  assert.equal(repeated.item.key, result.item.key);
  assert.ok((await fs.readFile(path.join(result.item.root, 'json/clan.json'), 'utf8')).endsWith('// editado'));
  await assert.rejects(() => importDiscovered(path.join(workspace, 'plugins/Helper')), /Sin definición/);
});
