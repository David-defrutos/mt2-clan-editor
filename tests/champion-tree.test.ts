import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanClan } from '../src/server/scan.ts';
import { prepareChampionTree, saveChampionTree, type TreeRequest } from '../src/server/champion-tree.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-champion-tree-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n  // conservar comentarios y datos ajenos\r\n  "classes": [{ "id": "Class", "custom": 42, "champions": [\r\n    { "id": "Hero", "portrait": "@Portrait", "upgrade_tree": [[{"id":"@A1","extra":true}, "@A2", {"id":"@External","mod_reference":"Other"}]] },\r\n    { "id": "OtherHero", "upgrade_tree": [["@New", "@A2", "@A1"]] }\r\n  ] }],\r\n  "upgrades": [{"id":"A1"},{"id":"A2"},{"id":"New","titles":{"english":"New path"}}],\r\n}\r\n';
  const file = path.join(root, 'json', 'clan.json');
  await fs.writeFile(file, original);
  const owner = (await scanClan(root)).entries.find(e => e.section === 'classes')!;
  const request: TreeRequest = { root, file: owner.file, classId: owner.id, championIndex: 0, expectedHash: owner.hash, changes: [{ path: 0, level: 1, upgradeId: 'New' }] };
  return { root, file, original, request };
}

test('asigna un nivel conservando el resto del archivo, crea respaldo y advierte referencias compartidas', async () => {
  const { root, file, original, request } = await fixture();
  try {
    const preview = await prepareChampionTree(request);
    assert.equal(preview.changed, true);
    assert.equal(preview.changes[0].before, '@A2');
    assert.equal(preview.changes[0].after, '@New');
    assert.ok(preview.warnings.some(w => w.includes('OtherHero')));
    assert.equal(await fs.readFile(file, 'utf8'), original, 'previsualizar no escribe');
    const saved = await saveChampionTree(request);
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    assert.equal(await fs.readFile(file, 'utf8'), original.replace('"@A2"', '"@New"'));
    const after = (await scanClan(root)).entries.find(e => e.section === 'classes')!;
    const champions = after.data.champions as { upgrade_tree: unknown[][] }[];
    assert.deepEqual(champions[0].upgrade_tree[0][0], { id: '@A1', extra: true });
    assert.deepEqual(champions[0].upgrade_tree[0][2], { id: '@External', mod_reference: 'Other' });
    assert.deepEqual(champions[1].upgrade_tree, [['@New', '@A2', '@A1']]);
    await assert.rejects(() => saveChampionTree(request), /cambió en disco/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('seleccionar la mejora actual conserva la referencia estructurada y no crea una escritura', async () => {
  const { root, original, file, request } = await fixture();
  try {
    const saved = await saveChampionTree({ ...request, changes: [{ path: 0, level: 0, upgradeId: 'A1' }] });
    assert.equal(saved.changed, false);
    assert.equal(saved.backup, undefined);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const preview = await prepareChampionTree({ ...request, changes: [{ path: 0, level: 0, upgradeId: 'New' }, { path: 0, level: 1, upgradeId: 'New' }] });
    assert.ok(preview.warnings.some(w => w.includes('repetidas')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rechaza posiciones, identidades y referencias inválidas antes de escribir', async () => {
  const { root, file, original, request } = await fixture();
  try {
    await assert.rejects(() => prepareChampionTree({ ...request, changes: [{ path: 0, level: 8, upgradeId: 'New' }] }), /posición no existe/);
    await assert.rejects(() => prepareChampionTree({ ...request, changes: [{ path: -1, level: 0, upgradeId: 'New' }] }), /inválida/);
    await assert.rejects(() => prepareChampionTree({ ...request, championIndex: 2 }), /campeón ya no existe/);
    await assert.rejects(() => prepareChampionTree({ ...request, changes: [{ path: 0, level: 1, upgradeId: 'Absent' }] }), /ID único/);
    await assert.rejects(() => prepareChampionTree({ ...request, changes: [...request.changes, ...request.changes] }), /duplicados/);
    await assert.rejects(() => prepareChampionTree({ ...request, file: '../outside.json' }), /dentro de json/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const duplicate = original.replace('{"id":"A1"}', '{"id":"New"}');
    await fs.writeFile(file, duplicate);
    const next = (await scanClan(root)).entries.find(e => e.section === 'classes')!;
    await assert.rejects(() => prepareChampionTree({ ...request, expectedHash: next.hash }), /ID único/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
