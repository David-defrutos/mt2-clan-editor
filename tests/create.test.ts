import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClan } from '../src/server/create.ts';
import { scanClan } from '../src/server/scan.ts';
import { validateClan } from '../src/server/validate.ts';

test('genera un clan nuevo con dos campeones, seis sendas, dos iniciales y N cartas', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-create-'));
  const destination = path.join(parent, 'NuevoClan');
  try {
    const root = await createClan({ destination, name: 'Nuevo clan', id: 'NuevoClan', author: 'Pruebas', champions: ['Ámbar', 'Luna'], starters: ['Guardia', 'Hechicera'], draftCount: 7 });
    assert.equal(root, destination);
    const clan = await scanClan(root);
    assert.equal(clan.entries.filter(item => item.section === 'classes').length, 1);
    assert.equal(clan.entries.filter(item => item.section === 'cards').length, 11);
    assert.equal(clan.entries.filter(item => item.section === 'upgrades').length, 18);
    assert.equal(clan.entries.filter(item => item.section === 'card_pools').length, 2);
    assert.equal(clan.entries.filter(item => item.section === 'map_nodes').length, 1);
    assert.equal(clan.entries.filter(item => item.section === 'rewards').length, 1);
    assert.equal(clan.entries.filter(item => item.section === 'class_card_styles').length, 1);
    assert.equal((clan.entries.find(item => item.section === 'classes')!.data.champions as unknown[]).length, 2);
    const definedIds = new Set(clan.entries.map(item => item.id));
    assert.equal(definedIds.size, clan.entries.length, 'los ID del clan generado son únicos entre secciones');
    const localReferences: string[] = [];
    function visit(value: unknown): void {
      if (typeof value === 'string' && value.startsWith('@')) localReferences.push(value.slice(1));
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    }
    clan.entries.forEach(item => visit(item.data));
    assert.ok(localReferences.length > 100);
    assert.deepEqual(localReferences.filter(id => !definedIds.has(id)), [], 'todas las referencias locales resuelven');
    const cards = clan.entries.filter(item => item.section === 'cards');
    assert.ok(cards.every(item => (item.data.effects as unknown[]).every(effect => typeof effect === 'string')));
    const banners = cards.filter(item => (item.data.pools as string[]).includes('UnitsAllBanner'));
    assert.equal(banners.length, 2);
    for (const banner of banners) {
      assert.ok((banner.data.pools as string[]).includes('@NuevoClanBannerPool'));
      const spawn = clan.entries.find(item => item.section === 'effects' && item.id === (banner.data.effects as string[])[0].slice(1));
      const character = clan.entries.find(item => item.section === 'characters' && item.id === String(spawn?.data.param_character).slice(1));
      assert.ok((character?.data.subtypes as string[]).includes('SubtypesData_BannerUnit'));
      assert.equal(banner.data.rarity, 'uncommon');
    }
    const mapNode = clan.entries.find(item => item.section === 'map_nodes')!.data;
    assert.equal(mapNode.is_banner_node, true);
    const rewardId = ((mapNode.extensions as { reward: { rewards: string[] } }[])[0].reward.rewards[0]).slice(1);
    const reward = clan.entries.find(item => item.section === 'rewards' && item.id === rewardId)!.data;
    assert.equal((reward.extensions as { draft: { draft_pool: string } }[])[0].draft.draft_pool, '@NuevoClanBannerPool');
    const classData = clan.entries.find(item => item.section === 'classes')!.data;
    assert.equal((classData.class_select_character_displays as string[]).length, 2);
    assert.ok((classData.champions as Record<string, unknown>[]).every(item => item.icon && item.locked_icon && item.portrait));
    assert.equal((await validateClan(clan)).filter(issue => issue.severity === 'error').length, 0);
    assert.ok((await fs.readFile(path.join(root, 'src', 'Plugin.cs'), 'utf8')).includes('json/cards.json'));
    await assert.rejects(() => createClan({ destination: path.join(parent, 'MuyPequeno'), name: 'Otro clan', id: 'OtroClan', author: 'Pruebas', champions: ['A', 'B'], starters: ['C', 'D'], draftCount: 1 }), /unidades de estandarte/);
    await assert.rejects(() => createClan({ destination, name: 'Nuevo clan', id: 'NuevoClan', author: 'Pruebas', champions: ['A', 'B'], starters: ['C', 'D'], draftCount: 2 }), /ya existe/);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
