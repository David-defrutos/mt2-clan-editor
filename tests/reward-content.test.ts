import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareContent, saveContent, type ContentRequest } from '../src/server/content.ts';
import { rewardSettingsModel } from '../src/server/reward-settings.ts';
import { poolAssignmentModel } from '../src/server/pool-assignment.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-reward-content-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '{"card_pools":[{"id":"BannerPool","cards":[]}],"rewards":[{"id":"OldReward","type":"draft","titles":{"english":"Original","spanish":"Conservar"},"costs":[100],"extensions":[{"unknown":{"keep":7}},{"draft":{"draft_pool":{"id":"@BannerPool","meta":3},"draft_options_count":2,"rarity_floor":"uncommon"}}]}],"map_nodes":[{"id":"Node","extensions":[{"reward":{"rewards":["@OldReward"]}}]}]}';
  await fs.writeFile(path.join(root, 'json/clan.json'), original);
  const request: ContentRequest = { root, section: 'rewards', id: 'NewReward', name: 'Nueva recompensa', kind: 'draft', poolId: '@BannerPool' };
  return { root, original, request };
}
test('crea recompensa desde plantilla y conecta sus editores sin imágenes ni modificar el nodo', async () => {
  const { root, original, request } = await fixture();
  try {
    const preview = await prepareContent(request);
    assert.deepEqual(preview.objects, [{ section: 'rewards', id: 'NewReward' }]);
    assert.deepEqual(preview.images, []);
    const reward = (preview.document.rewards as Record<string, unknown>[])[0];
    assert.equal(reward.type, 'draft'); assert.deepEqual(reward.titles, { english: 'Nueva recompensa' });
    await assert.rejects(() => fs.access(path.join(root, preview.file)));
    const saved = await saveContent({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/clan.json'), 'utf8'), original);
    const settings = await rewardSettingsModel(root, saved.file, saved.id);
    assert.equal(settings.fields.find(f => f.id === 'draft_options_count')?.current, 2);
    const pools = await poolAssignmentModel(root, 'rewards', saved.file, saved.id);
    assert.equal(pools.currentId, '@BannerPool'); assert.deepEqual(pools.uses, []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('crea recompensa card_pool del juego y copia conservando extensiones, idiomas y referencias', async () => {
  const { root, original, request } = await fixture();
  try {
    const shop = await prepareContent({ ...request, kind: 'card_pool', poolId: 'MegaPool' });
    assert.deepEqual((shop.document.rewards as Record<string, unknown>[])[0].extensions, [{ card_pool: { card_pool: 'MegaPool' } }]);
    const copyInput = { ...request, source: { id: 'OldReward', file: 'json/clan.json' }, name: 'Copia' };
    const copy = await prepareContent(copyInput);
    const before = JSON.parse(original).rewards[0]; const after = (copy.document.rewards as Record<string, unknown>[])[0];
    assert.deepEqual(after, { ...before, id: 'NewReward', titles: { english: 'Copia', spanish: 'Conservar' } });
    await saveContent({ ...copyInput, expectedToken: copy.token });
    assert.equal(await fs.readFile(path.join(root, 'json/clan.json'), 'utf8'), original);
    assert.equal((await poolAssignmentModel(root, 'rewards', copy.file, 'NewReward')).uses.length, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('bloquea pool inválido, tipo desconocido, IDs repetidos y revisión alterada o caducada', async () => {
  const { root, original, request } = await fixture();
  try {
    for (const poolId of ['@Missing', undefined]) await assert.rejects(() => prepareContent({ ...request, poolId }), /Selecciona un pool/);
    await assert.rejects(() => prepareContent({ ...request, kind: 'spell' }), /tipo de recompensa/);
    await assert.rejects(() => prepareContent({ ...request, id: 'OldReward' }), /ID ya existe/);
    const preview = await prepareContent(request);
    await assert.rejects(() => saveContent({ ...request, poolId: 'MegaPool', expectedToken: preview.token }), /solicitud es distinta/);
    await fs.appendFile(path.join(root, 'json/clan.json'), '\n');
    await assert.rejects(() => saveContent({ ...request, expectedToken: preview.token }), /cambió/);
    await fs.writeFile(path.join(root, 'json/clan.json'), original);
    await fs.writeFile(path.join(root, 'json/extra.json'), '{"card_pools":[{"id":"Bad","cards":{}}]}');
    await assert.rejects(() => prepareContent({ ...request, poolId: '@Bad' }), /Selecciona un pool/);
    await fs.writeFile(path.join(root, 'json/extra.json'), '{"card_pools":[{"id":"BannerPool"}]}');
    await assert.rejects(() => prepareContent(request), /IDs duplicados/);
    await assert.rejects(() => fs.access(path.join(root, 'json/editor-NewReward.json')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
