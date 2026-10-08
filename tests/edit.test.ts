import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanClan } from '../src/server/scan.ts';
import { prepareEdit, saveEdit, prepareObjectEdit, saveObjectEdit } from '../src/server/edit.ts';

test('bloquea edición guiada y avanzada si el ID está repetido dentro del archivo', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-duplicate-edit-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    const file = path.join(root, 'json/content.json');
    const original = JSON.stringify({ classes: [{ id: 'ClassTest' }], cards: [{ id: 'Duplicated', cost: 1 }, { id: 'Duplicated', cost: 2 }] });
    await fs.writeFile(file, original);
    const entry = (await scanClan(root)).entries.find(entry => entry.section === 'cards')!;
    const request = { root, file: entry.file, section: entry.section, id: entry.id, expectedHash: entry.hash };
    await assert.rejects(() => prepareEdit({ ...request, field: 'cost', value: 3 }), /duplicado/);
    await assert.rejects(() => prepareObjectEdit({ ...request, json: '{"id":"Duplicated","cost":3}' }), /duplicado/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('cambio puntual conserva BOM, CRLF, campos ajenos y crea respaldo', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-test-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    const file = path.join(root, 'json', 'content.json');
    const original = '\uFEFF{\r\n  "classes": [{ "id": "ClassTest", "champions": [] }],\r\n  "cards": [\r\n    { "id": "TestCard", "cost": 1, "rarity": "common", "custom_field": 42, },\r\n  ],\r\n}\r\n';
    await fs.writeFile(file, original, 'utf8');
    const clan = await scanClan(root);
    const card = clan.entries.find(entry => entry.section === 'cards')!;
    const request = { root, section: 'cards', id: card.id, file: card.file, field: 'cost', value: 2, expectedHash: card.hash };
    const preview = await prepareEdit(request);
    assert.equal(preview.before, 1);
    assert.equal(preview.after, 2);
    assert.equal(await fs.readFile(file, 'utf8'), original, 'previsualizar no escribe');
    const saved = await saveEdit(request);
    assert.equal(saved.changed, true);
    assert.ok(saved.backup);
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    const changed = await fs.readFile(file, 'utf8');
    assert.ok(changed.startsWith('\uFEFF'));
    assert.ok(changed.includes('\r\n'));
    assert.ok(changed.includes('"custom_field": 42'));
    assert.ok(changed.includes('"cost": 2'));
    const refreshed = await scanClan(root);
    assert.equal(refreshed.entries.find(entry => entry.section === 'cards')!.data.cost, 2);
    await assert.rejects(() => saveEdit(request), /cambió en disco/);
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('edición avanzada modifica solo el objeto elegido y bloquea ID y JSON inválidos', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-object-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    const file = path.join(root, 'json', 'content.json');
    const original = '{\n  "classes": [{"id":"ClassTest"}],\n  "effects": [{"id":"EffectA","name":"Old"},{"id":"EffectB","name":"Keep"}]\n}\n';
    await fs.writeFile(file, original);
    const entry = (await scanClan(root)).entries.find(item => item.id === 'EffectA')!;
    const request = { root, section: 'effects', id: entry.id, file: entry.file, json: '{"id":"EffectA","name":"New","extra":{"enabled":true}}', expectedHash: entry.hash };
    assert.equal((await prepareObjectEdit(request)).changed, true);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    await assert.rejects(() => prepareObjectEdit({ ...request, json: '{bad' }), /JSON válido/);
    await assert.rejects(() => prepareObjectEdit({ ...request, json: '{"id":"Different"}' }), /ID no se puede cambiar/);
    const result = await saveObjectEdit(request);
    assert.equal(await fs.readFile(result.backup!, 'utf8'), original);
    const refreshed = await scanClan(root);
    assert.equal(refreshed.entries.find(item => item.id === 'EffectA')!.data.name, 'New');
    assert.deepEqual(refreshed.entries.find(item => item.id === 'EffectA')!.data.extra, { enabled: true });
    assert.equal(refreshed.entries.find(item => item.id === 'EffectB')!.data.name, 'Keep');
    await assert.rejects(() => saveObjectEdit(request), /cambió en disco/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('edición avanzada bloquea duplicados en otros archivos y cambios durante el guardado', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-object-conflict-'));
  const writeFile = fs.writeFile;
  try {
    await fs.mkdir(path.join(root, 'json'));
    const file = path.join(root, 'json/content.json');
    const original = '{"classes":[{"id":"ClassTest"}],"cards":[{"id":"Card","cost":1}]}';
    await fs.writeFile(file, original);
    const entry = (await scanClan(root)).entries.find(e => e.id === 'Card')!;
    const request = {root, section: 'cards', id: 'Card', file: entry.file, expectedHash: entry.hash, json: '{"id":"Card","cost":2}'};
    const duplicate = path.join(root, 'json/duplicate.json');
    await fs.writeFile(duplicate, '{"cards":[{"id":"Card","cost":3}]}');
    await assert.rejects(() => prepareObjectEdit(request), /duplicado/);
    await fs.rm(duplicate);
    const concurrent = original.replace('"cost":1', '"cost":9');
    fs.writeFile = async (...args: Parameters<typeof fs.writeFile>) => {
      await writeFile(...args);
      if (String(args[0]).endsWith('.tmp')) await writeFile(file, concurrent);
    };
    await assert.rejects(() => saveObjectEdit(request), /durante el guardado/);
    assert.equal(await fs.readFile(file, 'utf8'), concurrent);
    assert.ok(!(await fs.readdir(path.dirname(file))).some(name => name.endsWith('.tmp')));
  } finally {
    fs.writeFile = writeFile;
    await fs.rm(root, {recursive:true, force:true});
  }
});
