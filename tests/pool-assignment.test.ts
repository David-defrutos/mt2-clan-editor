import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { poolAssignmentModel, preparePoolAssignment, savePoolAssignment, type PoolAssignmentRequest } from '../src/server/pool-assignment.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-pool-assignment-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n  // comentario conservado\r\n  "effects": [{"id":"Effect","name":"CardEffectAddBattleCard","param_card_pool":{"id":"@First","keep":7},"param_int":3,"unknown":{"keep":42}}],\r\n  "relic_effects": [{"id":"RelicEffect","name":"RelicEffectAddCardsStartOfBattle","param_card_pool":"@First"}],\r\n  "cards": [{"id":"CardA","effects":["@Effect"],"pools":["@First"]},{"id":"CardB","effects":[{"id":"@Effect"}],"pools":["MegaPool"]},{"id":"External","effects":[{"id":"@Effect","mod_reference":"Other"}]}],\r\n  "relics": [{"id":"Relic","effects":["@RelicEffect"]}]\r\n}\r\n';
  const pools = '{"card_pools":[{"id":"First"},{"id":"Second","cards":["@CardB"]}]}';
  await fs.writeFile(path.join(root, 'json/effects.json'), original); await fs.writeFile(path.join(root, 'json/pools.json'), pools);
  const model = await poolAssignmentModel(root, 'effects', 'json/effects.json', 'Effect');
  const request: PoolAssignmentRequest = { root, section: 'effects', file: 'json/effects.json', id: 'Effect', poolId: '@Second', expectedHash: model.hash };
  return { root, original, pools, model, request };
}
test('asigna pool local conservando formato y parámetros y muestra miembros y usos compartidos', async () => {
  const { root, original, pools, model, request } = await fixture();
  try {
    assert.equal(model.supported, true); assert.deepEqual(model.uses.map(u => u.id), ['CardA', 'CardB']);
    assert.deepEqual(model.candidates.find(p => p.id === '@Second')?.members.map(c => c.id), ['CardB']);
    const preview = await preparePoolAssignment(request);
    assert.equal(preview.pool.id, '@Second'); assert.equal(preview.pool.count, 1);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original);
    const saved = await savePoolAssignment({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original.replace('{"id":"@First","keep":7}', '"@Second"'));
    assert.equal(await fs.readFile(path.join(root, 'json/pools.json'), 'utf8'), pools);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('selección idéntica conserva referencia estructurada; asigna pool del juego a efecto de reliquia', async () => {
  const { root, original, request } = await fixture();
  try {
    const same = await preparePoolAssignment({ ...request, poolId: '@First' });
    assert.equal(same.changed, false); assert.equal(same.newText, original);
    const noop = await savePoolAssignment({ ...request, poolId: '@First', expectedToken: same.token });
    assert.equal(noop.changed, false); assert.equal(noop.backup, undefined);
    const model = await poolAssignmentModel(root, 'relic_effects', request.file, 'RelicEffect');
    assert.deepEqual(model.uses.map(u => u.id), ['Relic']);
    const input = { ...request, section: 'relic_effects', id: 'RelicEffect', poolId: 'MegaPool', expectedHash: model.hash };
    const review = await preparePoolAssignment(input); assert.equal(review.pool.local, false);
    await savePoolAssignment({ ...input, expectedToken: review.token });
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original.replace('"param_card_pool":"@First"', '"param_card_pool":"MegaPool"'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('bloquea catálogo desconocido, alternativas individuales, IDs duplicados y revisiones caducadas', async t => {
  const { root, original, pools, request } = await fixture();
  try {
    await assert.rejects(() => savePoolAssignment(request), /Previsualiza/);
    await assert.rejects(() => preparePoolAssignment({ ...request, poolId: '@Missing' }), /Selecciona un pool/);
    const preview = await preparePoolAssignment(request);
    await fs.appendFile(path.join(root, 'json/pools.json'), '\n');
    await assert.rejects(() => savePoolAssignment({ ...request, expectedToken: preview.token }), /caducado/);
    await fs.writeFile(path.join(root, 'json/pools.json'), pools);
    await fs.writeFile(path.join(root, 'json/extra.json'), '{"effects":[{"id":"Custom","name":"CustomLogic"},{"id":"Direct","name":"CardEffectAddBattleCard","param_card":"@CardA"}],"card_pools":[{"id":"Second"}]}');
    assert.equal((await poolAssignmentModel(root, 'effects', 'json/extra.json', 'Custom')).supported, false);
    assert.equal((await poolAssignmentModel(root, 'effects', 'json/extra.json', 'Direct')).supported, false);
    await assert.rejects(() => preparePoolAssignment(request), /Selecciona un pool/);
    await fs.rm(path.join(root, 'json/extra.json'));
    const rename = fs.rename;
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => { if (String(args[1]) === path.join(root, request.file)) throw new Error('Fallo de reemplazo simulado'); return rename(...args); });
    await assert.rejects(() => savePoolAssignment({ ...request, expectedToken: preview.token }), /Fallo de reemplazo/);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original);
    assert.ok((await fs.readdir(path.join(root, 'json'))).every(f => f.endsWith('.json')));
  } finally { t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
});
