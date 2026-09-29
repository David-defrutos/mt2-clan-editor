import test from 'node:test';
import assert from 'node:assert/strict';
import { championRules, describeChampions, combineChampion } from '../src/server/champions.ts';
import type { ClanSnapshot, Entry } from '../src/server/types.ts';

function fixture(): ClanSnapshot {
  const entry = (section: string, id: string, data: Record<string, unknown>): Entry => ({ section, id, name: id, file: 'json/clan.json', index: 0, hash: 'fixture', data: { id, ...data } });
  const entries = [
    entry('classes', 'Class', { champions: [{ id: 'Hero', card_data: '@Card', starter_card: '@Starter', upgrade_tree: [['@A1', { id: '@A2' }, '@A3'], ['@B1', '@B2', '@B3'], ['@C1']] }] }),
    entry('cards', 'Card', { effects: ['@Spawn'] }), entry('cards', 'Starter', {}),
    entry('effects', 'Spawn', { name: 'CardEffectSpawnMonster', param_character: { id: '@Unit' } }),
    entry('characters', 'Unit', { attack_damage: 10, health: 20, size: 2 }),
    ...[1, 2, 3].flatMap(level => [entry('upgrades', `A${level}`, { bonus_damage: level * 30 }), entry('upgrades', `B${level}`, { bonus_hp: level * 5, bonus_size: -1 })]),
    entry('upgrades', 'C1', { bonus_damage: 2, trigger_upgrades: ['@Custom'] })
  ];
  return { key: 'test', root: '', name: 'Fixture', classId: 'Class', entries, sections: {}, files: [], issues: [], textureCount: 0, hasSource: false, hasGit: false, hasDll: false };
}

test('la senda II sustituye a I; otras sendas añaden su nivel seleccionado una sola vez', async () => {
  const rules = await championRules();
  const [champion] = describeChampions(fixture(), rules);
  assert.equal(champion.character?.id, 'Unit');
  assert.equal(champion.starter?.id, 'Starter');
  assert.deepEqual(combineChampion(champion, [2, 0, 0], rules).stats.map(s => s.value), [70, 20, 2]);
  assert.deepEqual(combineChampion(champion, [2, 1, 0], rules).stats.map(s => s.value), [70, 25, 1]);
  assert.deepEqual(combineChampion(champion, [3, 0, 0], rules).upgrades.map(e => e.id), ['A3']);
  assert.throws(() => combineChampion(champion, [2, 2, 0], rules), /Máximo/);
  assert.throws(() => combineChampion(champion, [1, 1, 1], rules), /Máximo/);
  assert.throws(() => combineChampion(champion, [1.5, 0, 0], rules), /válido/);
});

test('referencias externas, duplicadas y no resueltas no se convierten en estadísticas inventadas', async () => {
  const rules = await championRules();
  const clan = fixture();
  clan.entries.find(e => e.id === 'Spawn')!.data.param_character = { id: '@Unit', mod_reference: 'Other' };
  let [champion] = describeChampions(clan, rules);
  assert.deepEqual(combineChampion(champion, [1, 0, 0], rules).stats.map(s => s.value), [null, null, null]);
  clan.entries.find(e => e.id === 'Spawn')!.data.param_character = '@Unit';
  clan.entries.push({ ...clan.entries.find(e => e.id === 'A1')! });
  [champion] = describeChampions(clan, rules);
  assert.deepEqual(combineChampion(champion, [1, 0, 0], rules).stats.map(s => s.value), [null, null, null]);
  assert.ok(combineChampion(champion, [1, 0, 0], rules).warnings.some(w => w.includes('única')));
});

test('habilidades personalizadas y mejoras iniciales se identifican como datos no simulados', async () => {
  const rules = await championRules();
  const clan = fixture();
  clan.entries.find(e => e.id === 'Unit')!.data.initial_upgrades = ['@Special'];
  const [champion] = describeChampions(clan, rules);
  const preview = combineChampion(champion, [0, 0, 1], rules);
  assert.equal(preview.stats[0].value, 12);
  assert.ok(preview.warnings.some(w => w.includes('initial') || w.includes('iniciales')));
  assert.ok(preview.warnings.some(w => w.includes('trigger_upgrades')));
  clan.entries.find(e => e.id === 'Spawn')!.data.name = 'CustomSpawn';
  assert.equal(describeChampions(clan, rules)[0].character, undefined);
});
