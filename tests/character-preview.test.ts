import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { characterModels, prepareCharacterTransform, saveCharacterTransform } from '../src/server/character-preview.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-character-preview-'));
  await fs.mkdir(path.join(root, 'json')); await fs.mkdir(path.join(root, 'textures'));
  const image = await sharp({ create: { width: 120, height: 400, channels: 4, background: { r: 200, g: 80, b: 30, alpha: 0.5 } } }).png().toBuffer();
  await fs.writeFile(path.join(root, 'textures', 'unit.png'), image);
  const original = '\uFEFF{\r\n  // preservar campos y comentarios\r\n  "classes": [{"id":"Class","display":"@Selection"}],\r\n  "characters": [{"id":"Unit","character_art":"@Battle"}],\r\n  "sprites": [{"id":"Sprite","path":"textures/unit.png","pixels_per_unit":100,"pivot":{"x":0.3,"y":0.7}}],\r\n  "game_objects": [\r\n    {"id":"Battle","type":"character_art","extensions":{"character_art":{"sprite":"@Sprite","custom":42,"transform":{"position":{"x":0,"y":1,"z":0.2},"scale":{"x":1,"y":1,"z":1},"offset_position":{"x":0.1,"y":0.2,"z":0.3}},"animations":[{"animation":"idle","frames":["@Sprite"]}]}}},\r\n    {"id":"Selection","type":"character_art","extensions":{"character_art":{"sprite":{"id":"@Sprite"}}}}\r\n  ],\r\n}\r\n';
  const file = path.join(root, 'json', 'art.json'); await fs.writeFile(file, original);
  const entry = (await scanClan(root)).entries.find(e => e.id === 'Battle')!;
  const request = { root, file: entry.file, id: entry.id, expectedHash: entry.hash, changes: { scaleX: 2, scaleY: 2, positionY: 1.5 } };
  return { root, original, file, image, request };
}

test('lee imagen, pivote, escala y usos independientes de combate y selección', async () => {
  const { root } = await fixture();
  try {
    const model = await characterModels(await scanClan(root));
    assert.equal(model.items.length, 2);
    const [battle, selection] = model.items;
    assert.equal(battle.context, 'battle'); assert.equal(selection.context, 'selection');
    assert.equal(battle.usable, true); assert.equal(battle.width, 120); assert.equal(battle.height, 400);
    assert.deepEqual(battle.pivot, { x: 0.3, y: 0.7 });
    assert.equal(battle.values.positionY, 1); assert.equal(battle.values.offsetY, 0.2);
    assert.ok(battle.warnings.some(w => w.includes('animaciones')));
    assert.equal(selection.automaticY, true);
    assert.equal(selection.values.positionY, 2 * model.rules.groundHeightMultiplier);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('guarda solo ajustes elegidos, conserva PNG, animaciones, Z y el objeto de selección', async () => {
  const { root, original, file, image, request } = await fixture();
  try {
    const preview = await prepareCharacterTransform(request);
    assert.equal(preview.uses.length, 1); assert.equal(preview.uses[0].id, 'Unit');
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const saved = await saveCharacterTransform(request);
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    const changed = await fs.readFile(file, 'utf8');
    assert.ok(changed.startsWith('\uFEFF')); assert.ok(changed.includes('\r\n')); assert.ok(changed.includes('// preservar campos y comentarios'));
    const clan = await scanClan(root); const art = clan.entries.find(e => e.id === 'Battle')!.data.extensions as any;
    assert.deepEqual(art.character_art.transform.position, { x: 0, y: 1.5, z: 0.2 });
    assert.deepEqual(art.character_art.transform.scale, { x: 2, y: 2, z: 1 });
    assert.deepEqual(art.character_art.transform.offset_position, { x: 0.1, y: 0.2, z: 0.3 });
    assert.equal(art.character_art.custom, 42); assert.equal(art.character_art.animations.length, 1);
    const other = clan.entries.find(e => e.id === 'Selection')!;
    assert.deepEqual(other.data.extensions, { character_art: { sprite: { id: '@Sprite' } } });
    assert.deepEqual(await fs.readFile(path.join(root, 'textures', 'unit.png')), image);
    await assert.rejects(() => saveCharacterTransform(request), /cambió en disco/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('añade transformaciones ausentes y rechaza campos ajenos, valores inválidos y rutas externas', async () => {
  const { root, original, file, request } = await fixture();
  try {
    await assert.rejects(() => prepareCharacterTransform({ ...request, changes: { positionY: 1000 } }), /fuera de rango/);
    await assert.rejects(() => prepareCharacterTransform({ ...request, changes: { scaleX: Number.NaN } }), /fuera de rango/);
    await assert.rejects(() => prepareCharacterTransform({ ...request, changes: { custom: 4 } }), /no permitido/);
    await assert.rejects(() => prepareCharacterTransform({ ...request, file: '../outside.json' }), /dentro de json/);
    assert.equal((await saveCharacterTransform({ ...request, changes: {} })).changed, false);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    await saveCharacterTransform({ ...request, id: 'Selection', changes: { positionY: 2.3 } });
    const selection = (await characterModels(await scanClan(root))).items.find(e => e.entry.id === 'Selection')!;
    assert.equal(selection.automaticY, false); assert.equal(selection.values.positionY, 2.3);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('lee offset actual y migra offset_position conservando Z y el resto de transformaciones', async () => {
  const { root, file, request } = await fixture();
  try {
    const preview = await prepareCharacterTransform({ ...request, changes: { offsetY: 0.4 } });
    assert.ok(preview.changes[0].label.includes('vector completo'));
    await saveCharacterTransform({ ...request, changes: { offsetY: 0.4 } });
    const clan = await scanClan(root);
    const extension = (clan.entries.find(e => e.id === 'Battle')!.data.extensions as any).character_art;
    assert.deepEqual(extension.transform.offset, { x: 0.1, y: 0.4, z: 0.3 });
    assert.equal(extension.transform.offset_position, undefined);
    assert.deepEqual(extension.transform.position, { x: 0, y: 1, z: 0.2 });
    assert.equal(extension.animations.length, 1);
    const item = (await characterModels(clan)).items.find(i => i.entry.id === 'Battle')!;
    assert.equal(item.values.offsetY, 0.4); assert.equal(item.values.offsetX, 0.1);
    assert.equal(item.warnings.some(w => w.includes('compatibilidad histórica')), false);
    assert.ok((await fs.readFile(file, 'utf8')).includes('// preservar campos y comentarios'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('avisa de transformaciones mal anidadas y bloquea offset ambiguo', async () => {
  const { root, file } = await fixture();
  try {
    const document = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '').replace('// preservar campos y comentarios', '').replace(/,\s*}/g, '}'));
    document.game_objects[0].extensions.transform = { scale: { x: 9, y: 9 } };
    document.game_objects[0].extensions.character_art.transform.offset = { y: 0.7 };
    await fs.writeFile(file, JSON.stringify(document));
    const clan = await scanClan(root); const model = await characterModels(clan);
    const item = model.items.find(i => i.entry.id === 'Battle')!;
    assert.equal(item.values.scaleX, 1); assert.equal(item.values.offsetY, 0.7); assert.equal(item.values.offsetX, 0);
    assert.ok(item.warnings.some(w => w.includes('fuera de extensions.character_art')));
    await assert.rejects(() => prepareCharacterTransform({ root, file: item.entry.file, id: 'Battle', expectedHash: item.entry.hash, changes: { offsetY: 0.8 } }), /simultáneamente/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
