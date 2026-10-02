import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareContent, saveContent, type ContentRequest } from '../src/server/content.ts';
import { poolModel, preparePoolChanges, savePoolChanges } from '../src/server/pool-editor.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-pool-content-'));
  await fs.mkdir(path.join(root, 'json'));
  const original = '\uFEFF{\r\n// conservar\r\n"cards":[{"id":"CardA","pools":["MegaPool"],"extra":42}],"card_pools":[{"id":"Existing"}]\r\n}\r\n';
  await fs.writeFile(path.join(root, 'json', 'source.json'), original);
  return { root, original, request: { root, section: 'card_pools', id: 'NewPool', name: '' } as ContentRequest };
}
test('crea un pool vacío sin nombre ni texturas y permite añadir una carta con respaldo', async () => {
  const { root, original, request } = await fixture();
  try {
    const preview = await prepareContent(request);
    assert.deepEqual(preview.document.card_pools, [{ id: 'NewPool' }]);
    assert.equal(preview.images.length, 0);
    assert.ok(preview.warnings.some(w => w.includes('No se conecta automáticamente')));
    assert.equal((await poolModel(root)).pools.some(p => p.id === '@NewPool'), false);
    await saveContent({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/source.json'), 'utf8'), original);
    assert.deepEqual(await fs.readdir(root), ['json']);
    const model = await poolModel(root);
    assert.equal(model.pools.find(p => p.id === '@NewPool')?.editable, true);
    const card = model.cards[0];
    const assignment = { root, pool: '@NewPool', changes: [{ id: card.id, file: card.file, expectedHash: card.hash, member: true }] };
    const review = await preparePoolChanges(assignment);
    const saved = await savePoolChanges({ ...assignment, expectedToken: review.token });
    assert.equal(saved.count, 1);
    assert.equal(await fs.readFile(path.join(saved.backup!, 'json/source.json'), 'utf8'), original);
    assert.deepEqual((await poolModel(root)).cards[0].pools, ['MegaPool', '@NewPool']);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'json/editor-NewPool.json'), 'utf8')).card_pools, [{ id: 'NewPool' }]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('bloquea orígenes inexistentes, colisiones y revisión caducada sin tocar originales', async () => {
  const { root, original, request } = await fixture();
  try {
    await assert.rejects(() => prepareContent({ ...request, source: { id: 'Missing', file: 'json/source.json' } }), /origen ya no existe/);
    await assert.rejects(() => prepareContent({ ...request, id: 'existing' }), /ya existe/);
    const preview = await prepareContent(request);
    await assert.rejects(() => saveContent({ ...request, id: 'DifferentPool', expectedToken: preview.token }), /solicitud es distinta/);
    await fs.appendFile(path.join(root, 'json/source.json'), '\n');
    await assert.rejects(() => saveContent({ ...request, expectedToken: preview.token }), /cambió en disco/);
    assert.equal(await fs.readFile(path.join(root, 'json/source.json'), 'utf8'), original + '\n');
    assert.deepEqual(await fs.readdir(path.join(root, 'json')), ['source.json']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('cuenta la unión de miembros directos y de cartas y prepara la baja en ambas listas', async () => {
  const { root } = await fixture();
  try {
    const document = { card_pools: [{ id: 'Direct', cards: ['@CardA', { id: '@CardB', extra: 5 }, { id: '@CardC', mod_reference: 'Other' }, '@Missing'] }], cards: [{ id: 'CardB', pools: ['@Direct'] }, { id: 'CardC' }] };
    const raw = JSON.stringify(document); await fs.writeFile(path.join(root, 'json/direct.json'), raw);
    const model = await poolModel(root); const pool = model.pools.find(p => p.id === '@Direct')!;
    assert.equal(pool.editable, true); assert.equal(pool.directCards.length, 4);
    assert.ok(pool.warning.includes('campo cards'));
    assert.equal(model.cards.filter(c => c.pools.includes('@Direct')).length, 2, 'no duplica pertenencias ni confunde referencias externas');
    assert.equal(model.cards.find(c => c.id === 'CardC')?.pools.includes('@Direct'), false);
    const card = model.cards.find(c => c.id === 'CardB')!;
    const preview = await preparePoolChanges({ root, pool: '@Direct', changes: [{ id: card.id, file: card.file, expectedHash: card.hash, member: false }] });
    assert.equal(preview.changes[0].locations.length, 2);
    const changed = JSON.parse(preview.files[0].newText);
    assert.deepEqual(changed.card_pools[0].cards, ['@CardA', { id: '@CardC', mod_reference: 'Other' }, '@Missing']);
    assert.deepEqual(changed.cards[0].pools, []);
    assert.equal(await fs.readFile(path.join(root, 'json/direct.json'), 'utf8'), raw);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
