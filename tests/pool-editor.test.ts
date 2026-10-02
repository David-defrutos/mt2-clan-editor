import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { poolModel, preparePoolChanges, savePoolChanges } from '../src/server/pool-editor.ts';
import { scanClan } from '../src/server/scan.ts';
import { dataRoot, keyForPath } from '../src/server/paths.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-pools-'));
  await fs.mkdir(path.join(root, 'json'));
  const originals = [
    '\uFEFF{\r\n  // comentario original\r\n  "card_pools":[{"id":"Local"}],\r\n  "cards":[\r\n    {"id":"A","pools":[{"id":"@Local","meta":7},{"id":"@Local","mod_reference":"Other"},"MegaPool"],"unlock_level":4},\r\n    {"id":"C","pools":["MegaPool"],"extra":true}\r\n  ]\r\n}\r\n',
    '{"cards":[{"id":"B","rarity":"rare","cost":2}]}'
  ];
  await fs.writeFile(path.join(root, 'json', 'a.json'), originals[0]);
  await fs.writeFile(path.join(root, 'json', 'b.json'), originals[1]);
  return { root, originals };
}
test('edita pools locales en varios archivos conservando referencias externas, formato y datos', async () => {
  const { root, originals } = await fixture();
  try {
    const model = await poolModel(root);
    assert.equal(model.pools.find(p => p.id === '@Local')?.editable, true);
    assert.equal(model.pools.some(p => p.id === 'Local'), false);
    const changes = model.cards.map(c => ({ id: c.id, file: c.file, expectedHash: c.hash, member: c.id !== 'A' }));
    const request = { root, pool: '@Local', changes };
    const preview = await preparePoolChanges(request);
    assert.equal(preview.changes.length, 3); assert.equal(preview.files.length, 2);
    assert.equal(await fs.readFile(path.join(root, 'json/a.json'), 'utf8'), originals[0]);
    const saved = await savePoolChanges({ ...request, expectedToken: preview.token });
    assert.equal(saved.count, 3);
    assert.equal(await fs.readFile(path.join(saved.backup!, 'json/a.json'), 'utf8'), originals[0]);
    const output = await fs.readFile(path.join(root, 'json/a.json'), 'utf8');
    assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes('// comentario original')); assert.ok(!output.replaceAll('\r\n', '').includes('\n'));
    const clan = await scanClan(root); const a = clan.entries.find(e => e.id === 'A')!;
    assert.deepEqual(a.data.pools, [{ id: '@Local', mod_reference: 'Other' }, 'MegaPool']); assert.equal(a.data.unlock_level, 4);
    assert.deepEqual(clan.entries.find(e => e.id === 'C')?.data.pools, ['MegaPool', '@Local']); assert.equal(clan.entries.find(e => e.id === 'C')?.data.extra, true);
    assert.deepEqual(clan.entries.find(e => e.id === 'B')?.data.pools, ['@Local']); assert.equal(clan.entries.find(e => e.id === 'B')?.data.cost, 2);
    const updated = (await poolModel(root)).cards.find(c => c.id === 'C')!;
    const unchanged = await preparePoolChanges({ root, pool: '@Local', changes: [{ id: updated.id, file: updated.file, expectedHash: updated.hash, member: true }] });
    assert.equal(unchanged.files.length, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('rechaza pools desconocidos, IDs duplicados y cambios posteriores a la vista previa', async () => {
  const { root } = await fixture();
  try {
    const model = await poolModel(root); const c = model.cards.find(c => c.id === 'C')!;
    const request = { root, pool: '@Local', changes: [{ id: c.id, file: c.file, expectedHash: c.hash, member: true }] };
    await assert.rejects(() => preparePoolChanges({ ...request, pool: 'Missing' }), /pool del juego/);
    await assert.rejects(() => preparePoolChanges({ ...request, changes: [...request.changes, ...request.changes] }), /más de una vez/);
    await assert.rejects(() => savePoolChanges(request), /Previsualiza/);
    const preview = await preparePoolChanges(request);
    await fs.appendFile(path.join(root, 'json/b.json'), '\n');
    await assert.rejects(() => savePoolChanges({ ...request, expectedToken: preview.token }), /caducado/);
    await fs.writeFile(path.join(root, 'json/duplicates.json'), '{"cards":[{"id":"C"}],"card_pools":[{"id":"Local"}]}');
    const next = await poolModel(root);
    assert.equal(next.pools.find(p => p.id === '@Local')?.editable, false);
    assert.equal(next.cards.filter(c => c.id === 'C').every(c => !c.editable), true);
    await assert.rejects(() => preparePoolChanges({ ...request, pool: 'MegaPool' }), /ID local único/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('restaura todas las cartas si falla el segundo archivo del lote', async t => {
  const { root, originals } = await fixture();
  try {
    const model = await poolModel(root);
    const request = { root, pool: '@Local', changes: model.cards.filter(c => c.id !== 'A').map(c => ({ id: c.id, file: c.file, expectedHash: c.hash, member: true })) };
    const preview = await preparePoolChanges(request); const rename = fs.rename; let failed = false;
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
      if (!failed && String(args[1]) === path.join(root, 'json', 'b.json')) { failed = true; throw new Error('Fallo simulado'); }
      return rename(...args);
    });
    await assert.rejects(() => savePoolChanges({ ...request, expectedToken: preview.token }), /Fallo simulado/);
    assert.equal(failed, true);
    for (const [i, name] of ['a.json', 'b.json'].entries()) assert.equal(await fs.readFile(path.join(root, 'json', name), 'utf8'), originals[i]);
    const backups = path.join(dataRoot, 'backups', keyForPath(root)); const folder = (await fs.readdir(backups))[0];
    const journal = JSON.parse(await fs.readFile(path.join(backups, folder, 'transaction.json'), 'utf8'));
    assert.equal(journal.status, 'rolled-back'); assert.deepEqual(journal.unresolved, []);
    assert.ok((await fs.readdir(path.join(root, 'json'))).every(f => f.endsWith('.json')));
  } finally { t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
});
