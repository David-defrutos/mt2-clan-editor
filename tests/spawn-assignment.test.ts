import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanClan } from '../src/server/scan.ts';
import { spawnModel, prepareSpawnAssignment, saveSpawnAssignment } from '../src/server/spawn-assignment.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-spawn-assign-'));
  await fs.mkdir(path.join(root, 'json'));
  const file = path.join(root, 'json/effects.json');
  const original = '\uFEFF{\r\n // conservar comentarios\r\n "classes":[{"id":"ClassTest"}],\r\n "effects":[{"id":"Spawn","name":"CardEffectSpawnMonster","param_character":{"id":"@First","keep":42},"unknown":{"keep":true}}],\r\n "cards":[{"id":"CardA","effects":["@Spawn"]},{"id":"CardB","effects":[{"id":"@Spawn","keep":true}]},{"id":"External","effects":[{"id":"@Spawn","mod_reference":"other.mod"}]}]\r\n}\r\n';
  await fs.writeFile(file, original);
  await fs.writeFile(path.join(root, 'json/characters.json'), JSON.stringify({ characters: [{ id: 'First', names: { english: 'Primera' }, health: 5 }, { id: 'Second', names: { english: 'Segunda' }, attack_damage: 9, health: 15, size: 2 }] }));
  const entry = (await scanClan(root)).entries.find(entry => entry.id === 'Spawn')!;
  const request = { root, file: entry.file, id: entry.id, field: 'param_character', characterId: 'Second', expectedHash: entry.hash };
  return { root, file, original, request };
}

test('asigna personaje conservando JSON salvo referencia y muestra todos los usos directos locales', async () => {
  const { root, file, original, request } = await fixture();
  try {
    const model = await spawnModel(root, request.file, request.id);
    assert.equal(model.supported, true); assert.deepEqual(model.uses.map(use => use.id), ['CardA', 'CardB']);
    assert.equal(model.fields[0].currentId, 'First');
    const preview = await prepareSpawnAssignment(request);
    assert.equal(preview.character!.health, 15); assert.equal(preview.uses.length, 2);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const beforeCharacters = await fs.readFile(path.join(root, 'json/characters.json'), 'utf8');
    const saved = await saveSpawnAssignment({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    assert.equal(await fs.readFile(file, 'utf8'), original.replace('{"id":"@First","keep":42}', '"@Second"'));
    assert.equal(await fs.readFile(path.join(root, 'json/characters.json'), 'utf8'), beforeCharacters);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('la misma referencia estructurada no escribe; añade y quita unidad secundaria', async () => {
  const { root, file, original, request } = await fixture();
  try {
    const same = { ...request, characterId: 'First' };
    const preview = await prepareSpawnAssignment(same);
    assert.equal(preview.changed, false);
    assert.equal((await saveSpawnAssignment({ ...same, expectedToken: preview.token })).changed, false);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const second = { ...request, field: 'param_character_2' };
    const secondPreview = await prepareSpawnAssignment(second);
    await saveSpawnAssignment({ ...second, expectedToken: secondPreview.token });
    let effect = (await scanClan(root)).entries.find(entry => entry.id === 'Spawn')!;
    assert.equal(effect.data.param_character_2, '@Second');
    const remove = { ...second, characterId: null, expectedHash: effect.hash };
    const removePreview = await prepareSpawnAssignment(remove);
    await saveSpawnAssignment({ ...remove, expectedToken: removePreview.token });
    effect = (await scanClan(root)).entries.find(entry => entry.id === 'Spawn')!;
    assert.equal(effect.data.param_character_2, undefined);
    assert.deepEqual(effect.data.param_character, { id: '@First', keep: 42 });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rechaza referencias inválidas, duplicados, pools y vistas previas obsoletas', async () => {
  const { root, file, original, request } = await fixture();
  try {
    await assert.rejects(() => saveSpawnAssignment(request), /Previsualiza/);
    await assert.rejects(() => prepareSpawnAssignment({ ...request, characterId: null }), /no se puede quitar/);
    await assert.rejects(() => prepareSpawnAssignment({ ...request, field: 'name' }), /no permitido/);
    await assert.rejects(() => prepareSpawnAssignment({ ...request, characterId: 'Missing' }), /ID único/);
    const preview = await prepareSpawnAssignment(request);
    await fs.appendFile(path.join(root, 'json/characters.json'), '\n');
    await assert.rejects(() => saveSpawnAssignment({ ...request, expectedToken: preview.token }), /cambiaron/);
    await fs.writeFile(path.join(root, 'json/duplicates.json'), '{"characters":[{"id":"Second"}]}');
    assert.equal((await spawnModel(root, request.file, request.id)).candidates.some(character => character.id === 'Second'), false);
    await assert.rejects(() => prepareSpawnAssignment(request), /ID único/);
    await fs.rm(path.join(root, 'json/duplicates.json'));
    const pool = original.replace('"name":"CardEffectSpawnMonster"', '"name":"CardEffectSpawnMonster","param_character_pool":"@Pool"');
    await fs.writeFile(file, pool);
    assert.equal((await spawnModel(root, request.file, request.id)).supported, false);
    await assert.rejects(() => prepareSpawnAssignment(request), /pool/);
    await fs.writeFile(file, original.replace('CardEffectSpawnMonster', 'CustomSpawn'));
    await assert.rejects(() => prepareSpawnAssignment(request), /adaptador/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
