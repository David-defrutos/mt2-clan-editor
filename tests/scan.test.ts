import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanClan } from '../src/server/scan.ts';
import { statsDetails, summarizeClan } from '../src/server/stats.ts';
import { validateClan } from '../src/server/validate.ts';

const names = [
  'David-FreeCompany', 'David-SuccClan_Custom', 'David-Sandscourged_Custom',
  'David-Silksong_Custom', 'David-Pathogens_Custom', 'David-Equestrian_Custom', 'David-Yokai_Custom'
];
const plugins = process.env.MT2_TEST_PLUGINS_DIR ?? path.join(process.env.APPDATA ?? '', 'Thunderstore Mod Manager', 'DataFolder', 'MonsterTrain2', 'profiles', 'Default', 'BepInEx', 'plugins');

test('los siete clanes instalados se leen sin modificar archivos', async t => {
  if (!(await fs.stat(plugins).catch(() => null))?.isDirectory()) { t.skip('No se encuentra el perfil local.'); return; }
  for (const name of names) {
    await t.test(name, async () => {
      const root = path.join(plugins, name);
      if (!(await fs.stat(root).catch(() => null))?.isDirectory()) return;
      const sample = path.join(root, 'json');
      const before = (await fs.stat(sample)).mtimeMs;
      const clan = await scanClan(root);
      assert.equal(clan.issues.filter(issue => issue.severity === 'error').length, 0);
      assert.equal(clan.entries.filter(entry => entry.section === 'classes').length, 1);
      const champions = clan.entries.find(entry => entry.section === 'classes')!.data.champions as unknown[];
      assert.equal(champions.length, 2);
      assert.ok(clan.entries.filter(entry => entry.section === 'cards').length >= 40);
      const stats = await summarizeClan(clan);
      assert.equal(stats.champions, 2);
      assert.equal(stats.paths, 6);
      const details = await statsDetails(clan, 'draft');
      assert.equal(details.items.length, stats.draft);
      assert.ok(details.items.every(item => clan.entries.some(entry => entry.section === item.section && entry.id === item.id && entry.file === item.file)));
      assert.equal((await validateClan(clan)).filter(issue => issue.code === 'local-reference').length, 0);
      assert.equal((await fs.stat(sample)).mtimeMs, before);
    });
  }
});

test('Yokai conserva el patrón de nueve desbloqueos de cartas', async t => {
  const root = path.join(plugins, 'David-Yokai_Custom');
  if (!(await fs.stat(root).catch(() => null))?.isDirectory()) { t.skip('Yokai no está instalado.'); return; }
  const clan = await scanClan(root);
  const levels = clan.entries.filter(entry => entry.section === 'cards' && typeof entry.data.unlock_level === 'number').map(entry => entry.data.unlock_level as number).sort((a,b)=>a-b);
  assert.deepEqual(levels, [2,3,4,5,6,7,8,9,10]);
});
