import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanClan } from '../src/server/scan.ts';
import { prepareUnlocks, progressionStatus, saveUnlocks } from '../src/server/progression.ts';
import { dataRoot, keyForPath } from '../src/server/paths.ts';

test('guarda desbloqueos en varios archivos conservando formato y protege cartas especiales', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-unlocks-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    const first = '\uFEFF{\r\n  // comentario conservado\r\n  "classes": [{"id":"ClassTest","champions":[{"starter_card":"@Starter"}]}],\r\n  "cards": [\r\n    {"id":"A","pools":["MegaPool"],"extra":{"unknown":true}},\r\n    {"id":"Starter","pools":["MegaPool","StarterCardsOnly"]},\r\n    {"id":"Ability","is_an_ability":true,"pools":["MegaPool"]},\r\n    {"id":"Technical","unlock_level":99,"pools":["MegaPool"]}\r\n  ]\r\n}\r\n';
    const second = '{"cards":[{"id":"B","unlock_level":4,"pools":["UnitsAllBanner"]}]}';
    await fs.writeFile(path.join(root, 'json', 'first.json'), first);
    await fs.writeFile(path.join(root, 'json', 'second.json'), second);
    const status = await progressionStatus(root);
    assert.deepEqual(status.cards.map(card => card.id), ['A', 'B']);
    assert.equal(status.technicalCount, 1);
    const a = status.cards[0]; const b = status.cards[1];
    const changes = [{ id: a.id, file: a.file, expectedHash: a.hash, level: 2 }, { id: b.id, file: b.file, expectedHash: b.hash, level: null }];
    const preview = await prepareUnlocks(root, changes);
    assert.equal(preview.changes.length, 2);
    assert.equal(preview.files.length, 2);
    assert.equal(await fs.readFile(path.join(root, a.file), 'utf8'), first);
    await fs.writeFile(path.join(root, b.file), second + '\n');
    await assert.rejects(() => saveUnlocks(root, changes), /cambió en disco/);
    assert.equal(await fs.readFile(path.join(root, a.file), 'utf8'), first, 'el conflicto no deja guardado parcial');
    await fs.writeFile(path.join(root, b.file), second);
    await assert.rejects(() => prepareUnlocks(root, [{ ...changes[0], level: 99 }]), /nivel debe/);
    await assert.rejects(() => prepareUnlocks(root, [changes[0], changes[0]]), /más de una vez/);
    for (const id of ['Starter', 'Ability', 'Technical']) await assert.rejects(() => prepareUnlocks(root, [{ ...changes[0], id }]), /no admite/);
    const result = await saveUnlocks(root, changes);
    assert.equal(result.count, 2);
    assert.equal(await fs.readFile(path.join(result.backup!, a.file), 'utf8'), first);
    assert.equal(await fs.readFile(path.join(result.backup!, b.file), 'utf8'), second);
    assert.equal(JSON.parse(await fs.readFile(path.join(result.backup!, 'transaction.json'), 'utf8')).status, 'saved');
    const output = await fs.readFile(path.join(root, a.file), 'utf8');
    assert.ok(output.startsWith('\uFEFF'));
    assert.ok(output.includes('// comentario conservado'));
    assert.ok(!output.replaceAll('\r\n', '').includes('\n'));
    const clan = await scanClan(root);
    assert.equal(clan.entries.find(entry => entry.id === 'A')?.data.unlock_level, 2);
    assert.deepEqual(clan.entries.find(entry => entry.id === 'A')?.data.extra, { unknown: true });
    assert.equal(clan.entries.find(entry => entry.id === 'B')?.data.unlock_level, undefined);
    assert.equal(clan.entries.find(entry => entry.id === 'Technical')?.data.unlock_level, 99);
    const updated = (await progressionStatus(root)).cards[0];
    assert.equal((await saveUnlocks(root, [{ id: updated.id, file: updated.file, expectedHash: updated.hash, level: 2 }])).changed, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('revierte el primer archivo si falla el reemplazo del segundo', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-unlocks-rollback-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    const originals = ['{"cards":[{"id":"A","pools":["MegaPool"]}]}', '{"cards":[{"id":"B","pools":["MegaPool"]}]}'];
    await fs.writeFile(path.join(root, 'json', 'first.json'), originals[0]);
    await fs.writeFile(path.join(root, 'json', 'second.json'), originals[1]);
    const state = await progressionStatus(root);
    const rename = fs.rename;
    let failed = false;
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
      if (!failed && String(args[1]) === path.join(root, 'json', 'second.json')) { failed = true; throw new Error('Fallo de escritura simulado'); }
      return rename(...args);
    });
    await assert.rejects(() => saveUnlocks(root, state.cards.map(card => ({ id: card.id, file: card.file, expectedHash: card.hash, level: 3 }))), /Fallo de escritura simulado/);
    assert.equal(failed, true);
    assert.equal(await fs.readFile(path.join(root, 'json', 'first.json'), 'utf8'), originals[0]);
    assert.equal(await fs.readFile(path.join(root, 'json', 'second.json'), 'utf8'), originals[1]);
    const receipts = path.join(dataRoot, 'backups', keyForPath(root));
    const folders = await fs.readdir(receipts);
    const journal = JSON.parse(await fs.readFile(path.join(receipts, folders[0], 'transaction.json'), 'utf8'));
    assert.equal(journal.status, 'rolled-back');
    assert.deepEqual(journal.unresolved, []);
    assert.ok((await fs.readdir(path.join(root, 'json'))).every(file => file.endsWith('.json')));
  } finally { t.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
});
