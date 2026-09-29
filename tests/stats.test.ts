import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanClan } from '../src/server/scan.ts';
import { loadStatsRules, statsDetails, summarizeClan } from '../src/server/stats.ts';

test('cada desglose explica su cifra y el draft excluye habilidades y cartas auxiliares', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-stats-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    await fs.mkdir(path.join(root, 'textures'));
    await fs.writeFile(path.join(root, 'textures', 'art.PNG'), 'fixture');
    await fs.writeFile(path.join(root, 'json', 'clan.json'), JSON.stringify({
      classes: [{ id: 'ClassTest', champions: [1, 2].map(id => ({ id: `Hero${id}`, upgrade_tree: [[], [], []] })) }],
      cards: [
        { id: 'Champion', rarity: 'champion', pools: ['MegaPool'] },
        { id: 'Starter', pools: ['StarterCardsOnly'] },
        { id: 'Common', rarity: 'common', card_type: 'spell', cost: 1, pools: ['MegaPool'] },
        { id: 'Rare', rarity: 'rare', card_type: 'spell', cost: 2, unlock_level: 4, pools: ['MegaPool'] },
        { id: 'Banner', rarity: 'uncommon', card_type: 'monster', pools: ['UnitsAllBanner'] },
        { id: 'Ability', is_an_ability: true, rarity: 'rare', pools: ['MegaPool'] },
        { id: 'Token', unlock_level: 99, pools: ['MegaPool'] }
      ],
      characters: [{ id: 'Unit1', attack_damage: 2, health: 10 }, { id: 'Unit2', attack_damage: 8, health: 20 }],
      sprites: [{ id: 'Sprite', path: 'textures/art.PNG' }],
      card_triggers: [{ id: 'CardTrigger' }], character_triggers: [{ id: 'UnitTrigger' }]
    }));
    const clan = await scanClan(root);
    const stats = await summarizeClan(clan);
    assert.equal(stats.draft, 3);
    assert.equal(stats.abilities, 1);
    assert.equal(stats.paths, 6);
    assert.equal(stats.attack?.median, 5);
    assert.equal(stats.health?.median, 15);
    for (const metric of (await loadStatsRules()).metrics.filter(item => !/^(attack|health)\./.test(item.id))) {
      const details = await statsDetails(clan, metric.id);
      assert.equal(details.items.length, details.value, metric.id);
    }
    const draft = await statsDetails(clan, 'draft');
    assert.deepEqual(draft.items.map(item => item.id), ['Common', 'Rare', 'Banner']);
    assert.equal((await statsDetails(clan, 'unlocks.4')).items[0].id, 'Rare');
    assert.equal((await statsDetails(clan, 'costs.sin coste')).items[0].id, 'Banner');
    const median = await statsDetails(clan, 'attack.median');
    assert.equal(median.sample, true);
    assert.deepEqual(median.items.map(item => item.value), [2, 8]);
    assert.equal((await statsDetails(clan, 'health.max')).items[0].id, 'Unit2');
    await assert.rejects(() => statsDetails(clan, 'unknown'), /desconocida/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
