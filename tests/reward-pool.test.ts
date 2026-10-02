import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { poolAssignmentModel, preparePoolAssignment, savePoolAssignment } from '../src/server/pool-assignment.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-reward-pool-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n // mantener comentario\r\n "rewards":[{"id":"Banner","type":"draft","costs":[100],"extensions":[{"unknown":{"keep":true}},{"draft":{"draft_pool":{"id":"@First","keep":7},"class_type":"main|subclass","draft_options_count":2,"rarity_floor":"uncommon"}}]},{"id":"Shop","type":"card_pool","extensions":[{"card_pool":{"card_pool":"@First","cost_overrides":[{"rarity":"rare","costs":[10]}]}}]}],\r\n "map_nodes":[{"id":"Node","pools":["RandomChosenMainClassUnit"],"extensions":[{"reward":{"rewards":["@Banner"]}}]},{"id":"Foreign","extensions":[{"reward":{"rewards":[{"id":"@Banner","mod_reference":"Other"}]}}]}],\r\n "card_pools":[{"id":"First"},{"id":"Second","cards":["@Unit"]}],"cards":[{"id":"Unit"}]\r\n}\r\n';
  const file = 'json/clan.json'; await fs.writeFile(path.join(root, file), original);
  const model = await poolAssignmentModel(root, 'rewards', file, 'Banner');
  return { root, file, original, model, request: { root, file, section: 'rewards', id: 'Banner', poolId: '@Second', expectedHash: model.hash } };
}

test('conecta recompensa draft al pool y conserva nodo, costes, filtros y otras extensiones', async () => {
  const { root, original, model, request } = await fixture();
  try {
    assert.equal(model.supported, true);
    assert.equal(model.currentId, '@First');
    assert.deepEqual(model.uses.map(u => u.id), ['Node']);
    const preview = await preparePoolAssignment(request);
    assert.equal(preview.pool.count, 1);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original);
    const saved = await savePoolAssignment({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original.replace('{"id":"@First","keep":7}', '"@Second"'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('recompensa idéntica conserva metadatos y recompensa card_pool admite pools del juego', async () => {
  const { root, file, original, request } = await fixture();
  try {
    const same = await preparePoolAssignment({ ...request, poolId: '@First' });
    assert.equal(same.changed, false); assert.equal(same.newText, original);
    const model = await poolAssignmentModel(root, 'rewards', file, 'Shop');
    const shop = { ...request, id: 'Shop', poolId: 'MegaPool', expectedHash: model.hash };
    const preview = await preparePoolAssignment(shop);
    await savePoolAssignment({ ...shop, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, file), 'utf8'), original.replace('"card_pool":"@First"', '"card_pool":"MegaPool"'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rechaza extensiones ambiguas o inválidas, tipos personalizados y vista previa caducada', async () => {
  const { root, request } = await fixture();
  try {
    const preview = await preparePoolAssignment(request);
    const invalid = [
      { id: 'Custom', type: 'custom_class' },
      { id: 'Missing', type: 'draft', extensions: [] },
      { id: 'Duplicate', type: 'draft', extensions: [{ draft: {} }, { draft: {} }] },
      { id: 'Malformed', type: 'draft', extensions: [{ draft: [] }] },
      { id: 'Object', type: 'draft', extensions: { draft: {} } }
    ];
    await fs.writeFile(path.join(root, 'json/extra.json'), JSON.stringify({ rewards: invalid }));
    await assert.rejects(() => savePoolAssignment({ ...request, expectedToken: preview.token }), /caducado/);
    for (const reward of invalid) {
      const model = await poolAssignmentModel(root, 'rewards', 'json/extra.json', reward.id);
      assert.equal(model.supported, false, reward.id);
      await assert.rejects(() => preparePoolAssignment({ ...request, file: 'json/extra.json', id: reward.id, expectedHash: model.hash }));
    }
    await fs.writeFile(path.join(root, 'json/duplicate.json'), JSON.stringify({ rewards: [{ id: 'Banner', type: 'draft' }] }));
    await assert.rejects(() => preparePoolAssignment(request), /ID local único/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
