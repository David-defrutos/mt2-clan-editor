import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rewardSettingsModel, prepareRewardSettings, saveRewardSettings } from '../src/server/reward-settings.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-reward-settings-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n // conservar\r\n "rewards":[{"id":"Banner","type":"draft","costs":[100],"extensions":[{"custom":{"keep":7}},{"draft":{"draft_pool":{"id":"@Pool","meta":2},"draft_options_count":2,"rarity_floor":"uncommon","unknown":true}}]},{"id":"Shop","type":"card_pool","extensions":[{"card_pool":{"card_pool":"@Pool","cost_overrides":[{"rarity":"rare","costs":[20]}]}}]}],"map_nodes":[{"id":"Node","pools":["BannerPool"]}]\r\n}\r\n';
  const file = 'json/rewards.json'; await fs.writeFile(path.join(root, file), original);
  const model = await rewardSettingsModel(root, file, 'Banner');
  return { root, file, original, model, input: { root, file, id: 'Banner', field: 'draft_options_count', value: 3, expectedHash: model.hash } };
}
test('ajuste anidado conserva formato, pool, extensiones, nodo y respaldo; añadir booleano mantiene campos desconocidos', async () => {
  const { root, file, original, input } = await fixture();
  try {
    const preview = await prepareRewardSettings(input);
    assert.equal(await fs.readFile(path.join(root, file), 'utf8'), original);
    const saved = await saveRewardSettings({ ...input, expectedToken: preview.token });
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    assert.equal(await fs.readFile(path.join(root, file), 'utf8'), original.replace('"draft_options_count":2', '"draft_options_count":3'));
    const model = await rewardSettingsModel(root, file, input.id);
    const next = { ...input, field: 'disable_skip', value: false, expectedHash: model.hash };
    const added = await prepareRewardSettings(next);
    const data = JSON.parse(added.newText.replace(/^\uFEFF/, '').replace('// conservar', ''));
    assert.equal(data.rewards[0].extensions[1].draft.disable_skip, false);
    assert.equal(data.rewards[0].extensions[1].draft.unknown, true);
    assert.deepEqual(data.rewards[0].extensions[1].draft.draft_pool, { id: '@Pool', meta: 2 });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('costes del comerciante se validan y no cambian overrides; valor idéntico no escribe', async () => {
  const { root, file, original, input } = await fixture();
  try {
    const noop = await prepareRewardSettings({ ...input, value: 2 });
    assert.equal(noop.changed, false); assert.equal(noop.newText, original);
    assert.deepEqual(await saveRewardSettings({ ...input, value: 2, expectedToken: noop.token }), { changed: false });
    const model = await rewardSettingsModel(root, file, 'Shop');
    assert.deepEqual(model.fields.map(f => f.id), ['costs']);
    const costs = { ...input, id: 'Shop', field: 'costs', value: [0, 100, 150] };
    const preview = await prepareRewardSettings(costs);
    const data = JSON.parse(preview.newText.replace(/^\uFEFF/, '').replace('// conservar', ''));
    assert.deepEqual(data.rewards[1].costs, [0, 100, 150]);
    assert.deepEqual(data.rewards[1].extensions[0].card_pool.cost_overrides, [{ rarity: 'rare', costs: [20] }]);
    for (const value of [[], [-1], [1.5], ['100'], Array(101).fill(1)]) await assert.rejects(() => prepareRewardSettings({ ...costs, value }), /Valor inválido/);
    for (const value of [0, 4, 1.5, '2', Number.NaN]) await assert.rejects(() => prepareRewardSettings({ ...input, value }), /Valor inválido/);
    await assert.rejects(() => prepareRewardSettings({ ...input, field: 'rarity_floor', value: 'epic' }), /Valor inválido/);
    await assert.rejects(() => prepareRewardSettings({ ...input, field: 'disable_skip', value: 'false' }), /Valor inválido/);
    await assert.rejects(() => prepareRewardSettings({ ...costs, field: 'draft_options_count', value: 2 }), /Campo no configurado/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('revisión vinculada a valor y clan; IDs y extensiones ambiguos rechazados; fallo de reemplazo conserva origen', async t => {
  const { root, file, original, input } = await fixture();
  try {
    await assert.rejects(() => saveRewardSettings(input), /Previsualiza/);
    const preview = await prepareRewardSettings(input);
    await assert.rejects(() => saveRewardSettings({ ...input, value: 1, expectedToken: preview.token }), /caducado/);
    await fs.writeFile(path.join(root, 'json/extra.json'), '{"cards":[{"id":"Extra"}]}');
    await assert.rejects(() => saveRewardSettings({ ...input, expectedToken: preview.token }), /caducado/);
    await fs.writeFile(path.join(root, 'json/extra.json'), '{"rewards":[{"id":"Banner","type":"draft"},{"id":"Ambiguous","type":"draft","extensions":[{"draft":{}},{"draft":{}}]}]}');
    await assert.rejects(() => rewardSettingsModel(root, file, 'Banner'), /único/);
    await assert.rejects(() => rewardSettingsModel(root, 'json/extra.json', 'Ambiguous'), /exactamente una/);
    await fs.rm(path.join(root, 'json/extra.json'));
    t.mock.method(fs, 'rename', async () => { throw new Error('Fallo simulado'); });
    await assert.rejects(() => saveRewardSettings({ ...input, expectedToken: preview.token }), /Fallo simulado/);
    assert.equal(await fs.readFile(path.join(root, file), 'utf8'), original);
    assert.deepEqual(await fs.readdir(path.join(root, 'json')), ['rewards.json']);
  } finally { t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
});
