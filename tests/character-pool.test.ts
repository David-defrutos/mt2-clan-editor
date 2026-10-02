import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as jsonc from 'jsonc-parser';
import { characterPoolModel, prepareCharacterPool, saveCharacterPool, type CharacterPoolRequest } from '../src/server/character-pool.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-character-pool-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n  // conservar formato y comentarios\r\n  "effects":[{"id":"Spawn","name":"CardEffectSpawnMonster","param_character":"@UnitA","param_character_2":"@UnitB","param_character_pool":["@UnitA","@UnitA",{"id":"@UnitB","custom":7},{"id":"@UnitA","mod_reference":"Other"},"@Missing"],"param_int":2,"extra":{"keep":42}}],\r\n  "cards":[{"id":"Card","effects":["@Spawn"]},{"id":"ExternalCard","effects":[{"id":"@Spawn","mod_reference":"Other"}]}]\r\n}\r\n';
  const units = '{"characters":[{"id":"UnitA","attack_damage":1},{"id":"UnitB","health":5},{"id":"UnitC","size":2}]}';
  await fs.writeFile(path.join(root, 'json/effect.json'), original); await fs.writeFile(path.join(root, 'json/units.json'), units);
  const model = await characterPoolModel(root, 'json/effect.json', 'Spawn');
  const request: CharacterPoolRequest = { root, file: 'json/effect.json', id: 'Spawn', expectedHash: model.hash, changes: [{ id: 'UnitA', member: false }, { id: 'UnitC', member: true }] };
  return { root, original, units, model, request };
}
test('edita lista de invocación conservando respaldo, externos, referencias estructuradas y unidades', async () => {
  const { root, original, units, model, request } = await fixture();
  try {
    assert.equal(model.supported, true); assert.equal(model.candidates.find(u => u.id === 'UnitA')?.count, 2); assert.equal(model.protectedReferences.length, 2);
    assert.deepEqual(model.uses.map(u => u.id), ['Card']);
    const preview = await prepareCharacterPool(request);
    assert.deepEqual(preview.members, [{ id: '@UnitB', custom: 7 }, { id: '@UnitA', mod_reference: 'Other' }, '@Missing', '@UnitC']);
    const saved = await saveCharacterPool({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    const output = await fs.readFile(path.join(root, request.file), 'utf8');
    assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes('// conservar formato y comentarios')); assert.ok(!output.replaceAll('\r\n', '').includes('\n'));
    const effect = jsonc.parse(output.slice(1)).effects[0];
    assert.equal(effect.param_character, '@UnitA'); assert.equal(effect.param_character_2, '@UnitB'); assert.equal(effect.param_int, 2); assert.deepEqual(effect.extra, { keep: 42 });
    assert.equal(await fs.readFile(path.join(root, 'json/units.json'), 'utf8'), units);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('selección idéntica mantiene repeticiones; crea lista ausente y bloquea dejarla vacía', async () => {
  const { root, original, request } = await fixture();
  try {
    const noop = await prepareCharacterPool({ ...request, changes: [{ id: 'UnitA', member: true }] });
    assert.equal(noop.changed, false); assert.equal(noop.newText, original);
    const saved = await saveCharacterPool({ ...request, changes: [{ id: 'UnitA', member: true }], expectedToken: noop.token }); assert.equal(saved.changed, false);
    await fs.writeFile(path.join(root, request.file), '{"effects":[{"id":"Spawn","name":"CardEffectSpawnMonster","param_character":"@UnitA"}]}');
    const model = await characterPoolModel(root, request.file, 'Spawn');
    const create = { ...request, expectedHash: model.hash, changes: [{ id: 'UnitB', member: true }] };
    const review = await prepareCharacterPool(create); await saveCharacterPool({ ...create, expectedToken: review.token });
    const after = await characterPoolModel(root, request.file, 'Spawn'); assert.deepEqual(after.members, ['@UnitB']); assert.equal(after.fallback[0].value, '@UnitA');
    await assert.rejects(() => prepareCharacterPool({ ...request, expectedHash: after.hash, changes: [{ id: 'UnitB', member: false }] }), /entre 1 y 200/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('bloquea IDs ambiguos, formatos no soportados y revisiones obsoletas', async () => {
  const { root, original, units, request } = await fixture();
  try {
    await assert.rejects(() => saveCharacterPool(request), /Previsualiza/);
    const preview = await prepareCharacterPool(request);
    await fs.appendFile(path.join(root, 'json/units.json'), '\n');
    await assert.rejects(() => saveCharacterPool({ ...request, expectedToken: preview.token }), /caducado/);
    await fs.writeFile(path.join(root, 'json/units.json'), units);
    await fs.writeFile(path.join(root, 'json/duplicate.json'), '{"characters":[{"id":"UnitA"}]}');
    const ambiguous = await characterPoolModel(root, request.file, 'Spawn'); assert.equal(ambiguous.candidates.some(u => u.id === 'UnitA'), false);
    await assert.rejects(() => prepareCharacterPool(request), /ID único/);
    await fs.rm(path.join(root, 'json/duplicate.json'));
    await fs.writeFile(path.join(root, request.file), original.replace('CardEffectSpawnMonster', 'CustomSpawn'));
    assert.equal((await characterPoolModel(root, request.file, 'Spawn')).supported, false);
    await assert.rejects(() => prepareCharacterPool(request), /adaptador/);
    await fs.writeFile(path.join(root, request.file), '{"effects":[{"id":"Spawn","name":"CardEffectSpawnMonster","param_character_pool":"@Pool"}]}');
    assert.equal((await characterPoolModel(root, request.file, 'Spawn')).supported, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('fallo de reemplazo conserva original y elimina temporales', async t => {
  const { root, original, request } = await fixture();
  try {
    const preview = await prepareCharacterPool(request); const rename = fs.rename;
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => { if (String(args[1]) === path.join(root, request.file)) throw new Error('Fallo simulado'); return rename(...args); });
    await assert.rejects(() => saveCharacterPool({ ...request, expectedToken: preview.token }), /Fallo simulado/);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original);
    assert.ok((await fs.readdir(path.join(root, 'json'))).every(f => f.endsWith('.json')));
  } finally { t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
});
