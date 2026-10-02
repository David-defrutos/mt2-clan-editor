import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareContent, saveContent, type ContentRequest } from '../src/server/content.ts';
import { poolModel, preparePoolChanges, savePoolChanges } from '../src/server/pool-editor.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-pool-copy-'));
  await fs.mkdir(path.join(root, 'json'));
  const pool = '\uFEFF{\r\n// conservar origen\r\n"card_pools":[{"id":"OriginalPool","cards":[{"id":"@CardA","custom":7},{"id":"@CardB","mod_reference":"Other"},"@Missing"],"unknown":{"keep":42}}],"effects":[{"id":"Effect","param_card_pool":"@OriginalPool"},{"id":"ExternalEffect","param_card_pool":{"id":"@OriginalPool","mod_reference":"Other"}}]\r\n}\r\n';
  const cards = '{"cards":[{"id":"CardA","pools":["@OriginalPool"]},{"id":"CardB","pools":[{"id":"@OriginalPool","custom":5}]},{"id":"CardC","pools":[{"id":"@OriginalPool","mod_reference":"Other"}]}]}';
  await fs.writeFile(path.join(root, 'json/pool.json'), pool);
  await fs.writeFile(path.join(root, 'json/cards.json'), cards);
  const request: ContentRequest = { root, section: 'card_pools', id: 'CopiedPool', name: '', source: { id: 'OriginalPool', file: 'json/pool.json' } };
  return { root, pool, cards, request };
}
test('copia la unión de miembros conservando metadatos y externos sin modificar archivos originales', async () => {
  const { root, pool, cards, request } = await fixture();
  try {
    const preview = await prepareContent(request);
    const expected = [{ id: '@CardA', custom: 7 }, { id: '@CardB', mod_reference: 'Other' }, '@Missing', '@CardB'];
    assert.deepEqual((preview.document.card_pools as any[])[0], { id: 'CopiedPool', cards: expected, unknown: { keep: 42 } });
    assert.equal(preview.images.length, 0); assert.equal(preview.poolCopy?.directReferences, 3);
    assert.deepEqual(preview.poolCopy?.addedCards.map(c => c.id), ['CardB']);
    assert.deepEqual(preview.poolCopy?.uses.map(u => u.id).sort(), ['CardA', 'CardB', 'Effect']);
    assert.ok(preview.warnings.some(w => w.includes('propiedades adicionales')));
    await saveContent({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/pool.json'), 'utf8'), pool);
    assert.equal(await fs.readFile(path.join(root, 'json/cards.json'), 'utf8'), cards);
    const model = await poolModel(root);
    assert.deepEqual(model.pools.find(p => p.id === '@CopiedPool')?.directCards, expected);
    assert.deepEqual(model.cards.filter(c => c.pools.includes('@CopiedPool')).map(c => c.id), ['CardA', 'CardB']);
    // Editing the copy's membership does not edit the source pool or the shared card.
    const card = model.cards.find(c => c.id === 'CardA')!;
    const change = { root, pool: '@CopiedPool', changes: [{ id: card.id, file: card.file, expectedHash: card.hash, member: false }] };
    const review = await preparePoolChanges(change); await savePoolChanges({ ...change, expectedToken: review.token });
    assert.equal(await fs.readFile(path.join(root, 'json/pool.json'), 'utf8'), pool);
    assert.equal(await fs.readFile(path.join(root, 'json/cards.json'), 'utf8'), cards);
    assert.ok((await poolModel(root)).cards.find(c => c.id === 'CardA')?.pools.includes('@OriginalPool'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('materializa pertenencias de un pool sin cards y conserva listas vacías', async () => {
  const { root, request } = await fixture();
  try {
    await fs.writeFile(path.join(root, 'json/pool.json'), '{"card_pools":[{"id":"OriginalPool","extra":true}]}');
    const preview = await prepareContent(request);
    assert.deepEqual((preview.document.card_pools as any[])[0], { id: 'CopiedPool', extra: true, cards: ['@CardA', '@CardB'] });
    await fs.writeFile(path.join(root, 'json/cards.json'), '{"cards":[{"id":"CardA"}]}');
    const empty = await prepareContent(request);
    assert.deepEqual((empty.document.card_pools as any[])[0].cards, []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('bloquea listas malformadas, copia demasiado grande y revisión obsoleta', async () => {
  const { root, pool, request } = await fixture();
  try {
    const preview = await prepareContent(request);
    await fs.appendFile(path.join(root, 'json/cards.json'), '\n');
    await assert.rejects(() => saveContent({ ...request, expectedToken: preview.token }), /cambió en disco/);
    await fs.writeFile(path.join(root, 'json/pool.json'), '{"card_pools":[{"id":"OriginalPool","cards":{}}]}');
    await assert.rejects(() => prepareContent(request), /no es un array/);
    await fs.writeFile(path.join(root, 'json/pool.json'), pool);
    await fs.writeFile(path.join(root, 'json/cards.json'), '{"cards":[{"id":"CardA","pools":{}}]}');
    await assert.rejects(() => prepareContent(request), /copia completa/);
    await fs.writeFile(path.join(root, 'json/cards.json'), '{"cards":[]}');
    await fs.writeFile(path.join(root, 'json/pool.json'), JSON.stringify({ card_pools: [{ id: 'OriginalPool', cards: Array.from({ length: 501 }, (_, i) => '@Missing' + i) }] }));
    await assert.rejects(() => prepareContent(request), /hasta 500 referencias/);
    assert.equal((await fs.readdir(path.join(root, 'json'))).length, 2);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
