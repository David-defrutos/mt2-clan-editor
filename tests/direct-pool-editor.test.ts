import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as jsonc from 'jsonc-parser';
import { poolModel, preparePoolChanges, savePoolChanges } from '../src/server/pool-editor.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-direct-pools-'));
  await fs.mkdir(path.join(root, 'json'));
  const pool = '\uFEFF{\r\n// comentario conservado\r\n"card_pools":[{"id":"Direct","cards":[{"id":"@CardA","keep":7},"@CardB","@CardB",{"id":"@CardB","mod_reference":"Other"},"@Missing"],"custom":42}]\r\n}\r\n';
  const cards = '{"cards":[{"id":"CardA"},{"id":"CardB","pools":["MegaPool","@Direct"]},{"id":"CardC","pools":[]}]}';
  await fs.writeFile(path.join(root, 'json/a-pool.json'), pool);
  await fs.writeFile(path.join(root, 'json/b-cards.json'), cards);
  return { root, pool, cards };
}
async function request(root: string, targets: Record<string, boolean>) {
  const model = await poolModel(root);
  return { root, pool: '@Direct', changes: model.cards.filter(c => c.id in targets).map(c => ({ id: c.id, file: c.file, expectedHash: c.hash, member: targets[c.id] })) };
}
test('quita el único miembro con coma final y comentarios y mantiene altas directas en listas vacías', async () => {
  const { root, cards } = await fixture();
  try {
    const file = path.join(root, 'json/a-pool.json');
    await fs.writeFile(file, '{"card_pools":[{"id":"Direct","cards":[/*antes*/"@CardA",/*después*/]}]}');
    const input = await request(root, { CardA: false }); const review = await preparePoolChanges(input);
    await savePoolChanges({ ...input, expectedToken: review.token });
    const text = await fs.readFile(file, 'utf8'); const errors: jsonc.ParseError[] = [];
    const document = jsonc.parse(text, errors, { allowTrailingComma: true });
    assert.deepEqual(errors, []); assert.deepEqual(document.card_pools[0].cards, []);
    assert.ok(text.includes('/*antes*/')); assert.ok(text.includes('/*después*/'));
    assert.equal((await poolModel(root)).pools.find(p => p.id === '@Direct')?.additionLocation, 'pool');
    const add = await request(root, { CardC: true }); const preview = await preparePoolChanges(add);
    await savePoolChanges({ ...add, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/b-cards.json'), 'utf8'), cards);
    assert.deepEqual((await poolModel(root)).pools.find(p => p.id === '@Direct')?.directCards, ['@CardC']);
    await fs.writeFile(file, '{"card_pools":[{"id":"Direct","cards":{}}]}');
    const invalid = await poolModel(root); assert.equal(invalid.pools.find(p => p.id === '@Direct')?.editable, false);
    await assert.rejects(async () => preparePoolChanges(await request(root, { CardC: true })), /no es un array/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('alta directa conserva la carta, formato, referencias estructuradas y miembros desconocidos', async () => {
  const { root, pool, cards } = await fixture();
  try {
    const noop = await preparePoolChanges(await request(root, { CardA: true }));
    assert.equal(noop.files.length, 0, 'no reescribe una referencia estructurada idéntica');
    const input = await request(root, { CardC: true }); const preview = await preparePoolChanges(input);
    assert.deepEqual(preview.files.map(f => f.file), ['json/a-pool.json']);
    assert.equal(preview.changes[0].locations[0], 'json/a-pool.json · pool.cards');
    const saved = await savePoolChanges({ ...input, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/b-cards.json'), 'utf8'), cards);
    assert.equal(await fs.readFile(path.join(saved.backup!, 'json/a-pool.json'), 'utf8'), pool);
    const output = await fs.readFile(path.join(root, 'json/a-pool.json'), 'utf8');
    assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes('// comentario conservado')); assert.ok(!output.replaceAll('\r\n', '').includes('\n'));
    const parsed = JSON.parse(output.slice(1).replace('// comentario conservado', ''));
    assert.deepEqual(parsed.card_pools[0].cards, [{ id: '@CardA', keep: 7 }, '@CardB', '@CardB', { id: '@CardB', mod_reference: 'Other' }, '@Missing', '@CardC']);
    assert.equal(parsed.card_pools[0].custom, 42);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('bajas múltiples eliminan ambas fuentes y todos los duplicados locales sin tocar externos', async () => {
  const { root } = await fixture();
  try {
    const input = await request(root, { CardA: false, CardB: false }); const preview = await preparePoolChanges(input);
    assert.equal(preview.files.length, 2); assert.equal(preview.changes[1].locations.length, 2);
    await savePoolChanges({ ...input, expectedToken: preview.token });
    const model = await poolModel(root);
    assert.equal(model.cards.some(c => c.pools.includes('@Direct')), false);
    assert.deepEqual(model.pools.find(p => p.id === '@Direct')!.directCards, [{ id: '@CardB', mod_reference: 'Other' }, '@Missing']);
    assert.deepEqual(model.cards.find(c => c.id === 'CardB')!.cardPools, ['MegaPool']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('detecta pool cambiado desde la revisión y restaura las cartas si falla el archivo del pool', async t => {
  const { root, pool, cards } = await fixture();
  try {
    const input = await request(root, { CardB: false }); const preview = await preparePoolChanges(input);
    await fs.appendFile(path.join(root, 'json/a-pool.json'), '\n');
    await assert.rejects(() => savePoolChanges({ ...input, expectedToken: preview.token }), /caducado/);
    await fs.writeFile(path.join(root, 'json/a-pool.json'), pool);
    // Staged card file precedes pool file. Fail the pool write to verify card rollback.
    const rename = fs.rename; let failed = false;
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
      if (!failed && String(args[1]) === path.join(root, 'json/a-pool.json')) { failed = true; throw new Error('Fallo directo simulado'); }
      return rename(...args);
    });
    await assert.rejects(() => savePoolChanges({ ...input, expectedToken: preview.token }), /Fallo directo simulado/);
    assert.equal(failed, true);
    assert.equal(await fs.readFile(path.join(root, 'json/a-pool.json'), 'utf8'), pool);
    assert.equal(await fs.readFile(path.join(root, 'json/b-cards.json'), 'utf8'), cards);
    assert.ok((await fs.readdir(path.join(root, 'json'))).every(f => f.endsWith('.json')));
  } finally { t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
});
