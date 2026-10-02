import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareContent, saveContent, type ContentRequest } from '../src/server/content.ts';
import { scanClan } from '../src/server/scan.ts';
import { prepareChampionTree, saveChampionTree } from '../src/server/champion-tree.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-upgrade-content-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n// conservar fuente\r\n"classes":[{"id":"Class","champions":[{"id":"Hero","upgrade_tree":[["@Original"]]}]}],\r\n"upgrades":[{"id":"Original","titles":{"english":"Original","spanish":"Original ES"},"descriptions":{"english":"Existing description"},"bonus_damage":7,"bonus_hp":12,"bonus_size":1,"triggers":[{"id":"@Trigger","mod_reference":"Other","custom":5}],"unknown":{"keep":42}}]\r\n}\r\n';
  await fs.writeFile(path.join(root, 'json', 'source.json'), original);
  return { root, original };
}
test('crea una mejora desde plantilla sin texturas y permite asignarla a una senda', async () => {
  const { root, original } = await fixture();
  try {
    const request: ContentRequest = { root, section: 'upgrades', id: 'NewUpgrade', name: 'Nueva mejora' };
    const preview = await prepareContent(request);
    assert.equal(preview.images.length, 0);
    assert.deepEqual(preview.objects, [{ section: 'upgrades', id: 'NewUpgrade' }]);
    await saveContent({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/source.json'), 'utf8'), original);
    const clan = await scanClan(root); const upgrade = clan.entries.find(e => e.id === 'NewUpgrade')!;
    assert.equal(upgrade.name, 'Nueva mejora'); assert.equal(upgrade.data.bonus_damage, 0); assert.equal(upgrade.data.names, undefined);
    assert.deepEqual(await fs.readdir(root), ['json']);
    const owner = clan.entries.find(e => e.id === 'Class')!;
    const tree = { root, file: owner.file, classId: owner.id, championIndex: 0, expectedHash: owner.hash, changes: [{ path: 0, level: 0, upgradeId: upgrade.id }] };
    const review = await prepareChampionTree(tree); assert.equal(review.changes[0].after, '@NewUpgrade');
    await saveChampionTree(tree);
    assert.equal(await fs.readFile(path.join(root, 'json/source.json'), 'utf8'), original.replace('[["@Original"]]', '[["@NewUpgrade"]]'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('duplica mejoras conservando idiomas, bonificaciones y referencias sin cambiar el árbol', async () => {
  const { root, original } = await fixture();
  try {
    const request: ContentRequest = { root, section: 'upgrades', id: 'CopiedUpgrade', name: 'Copia', source: { id: 'Original', file: 'json/source.json' } };
    const preview = await prepareContent(request);
    await saveContent({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/source.json'), 'utf8'), original);
    const copy = (await scanClan(root)).entries.find(e => e.id === 'CopiedUpgrade')!.data;
    assert.deepEqual(copy.titles, { english: 'Copia', spanish: 'Original ES' });
    assert.deepEqual(copy.descriptions, { english: 'Existing description' });
    assert.deepEqual(copy.triggers, [{ id: '@Trigger', mod_reference: 'Other', custom: 5 }]);
    assert.deepEqual(copy.unknown, { keep: 42 }); assert.equal(copy.bonus_damage, 7); assert.equal(copy.bonus_hp, 12); assert.equal(copy.bonus_size, 1);
    assert.ok(preview.warnings.some(w => w.includes('no se asigna automáticamente')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('la revisión de creación está ligada al ID, nombre y origen exactos', async () => {
  const { root, original } = await fixture();
  try {
    const request: ContentRequest = { root, section: 'upgrades', id: 'NewUpgrade', name: 'Nueva' };
    const preview = await prepareContent(request);
    for (const change of [{ id: 'DifferentId' }, { name: 'Distinta' }, { source: { id: 'Original', file: 'json/source.json' } }]) {
      await assert.rejects(() => saveContent({ ...request, ...change, expectedToken: preview.token }), /solicitud es distinta/);
    }
    assert.deepEqual(await fs.readdir(path.join(root, 'json')), ['source.json']);
    assert.equal(await fs.readFile(path.join(root, 'json/source.json'), 'utf8'), original);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
