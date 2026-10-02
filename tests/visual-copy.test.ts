import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { prepareVisualCopy, saveVisualCopy } from '../src/server/visual-copy.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-visual-copy-'));
  await fs.mkdir(path.join(root, 'json')); await fs.mkdir(path.join(root, 'textures'));
  const png = await sharp({ create: { width: 40, height: 50, channels: 4, background: '#ff00cc' } }).png().toBuffer();
  await fs.writeFile(path.join(root, 'textures/base.png'), png);
  await fs.writeFile(path.join(root, 'textures/frame.png'), png);
  const original = '\uFEFF{\r\n // comentarios conservados\r\n "classes":[{"id":"ClassTest","display":"@SharedArt"}],\r\n "characters":[{"id":"Unit","character_art":"@SharedArt","health":9,"unknown":42},{"id":"SecondUnit","character_art":"@SharedArt"}],\r\n "game_objects":[{"id":"SharedArt","type":"character_art","extensions":{"character_art":{"sprite":{"id":"@Base","keep":true},"transform":{"scale":{"x":0.85,"y":0.9,"z":1},"offset":{"y":0.1,"z":0.2}},"animations":[{"animation":"idle","frames":["@Base",{"id":"@Frame","hold":2},"@Alias"]}],"unknown":{"keep":42}}}}],\r\n "sprites":[{"id":"Base","path":"textures/base.png","pixels_per_unit":80,"pivot":{"x":0.4,"y":0.6},"custom":42},{"id":"Frame","path":"textures/frame.png"},{"id":"Alias","path":"textures/frame.png"}]\r\n}\r\n';
  const file = path.join(root, 'json/content.json'); await fs.writeFile(file, original);
  const entry = (await scanClan(root)).entries.find(entry => entry.id === 'Unit')!;
  const request = { root, section: 'characters', file: entry.file, id: 'Unit', field: 'character_art', sourceId: 'SharedArt', newId: 'PrivateArt', expectedHash: entry.hash };
  return { root, file, original, png, request };
}

test('copia arte, transformaciones, sprites y frames; desliga solo la unidad elegida', async () => {
  const { root, file, original, png, request } = await fixture();
  try {
    const preview = await prepareVisualCopy(request);
    assert.equal(preview.document.sprites.length, 3); assert.equal(preview.images.length, 2);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const saved = await saveVisualCopy({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(saved.backup, 'utf8'), original);
    assert.equal(await fs.readFile(file, 'utf8'), original.replace('"id":"Unit","character_art":"@SharedArt"', '"id":"Unit","character_art":"@PrivateArt"'));
    const clan = await scanClan(root);
    const old = clan.entries.find(entry => entry.id === 'SharedArt')!.data;
    const copy = clan.entries.find(entry => entry.id === 'PrivateArt')!.data;
    const oldArt = (old.extensions as any).character_art; const copyArt = (copy.extensions as any).character_art;
    assert.deepEqual(copyArt.transform, oldArt.transform); assert.deepEqual(copyArt.unknown, oldArt.unknown);
    assert.deepEqual(copyArt.sprite, { id: '@PrivateArtSprite', keep: true });
    assert.deepEqual(copyArt.animations[0].frames, ['@PrivateArtSprite', { id: '@PrivateArtSprite1', hold: 2 }, '@PrivateArtSprite2']);
    assert.equal(clan.entries.find(entry => entry.id === 'SecondUnit')!.data.character_art, '@SharedArt');
    assert.equal(clan.entries.find(entry => entry.id === 'ClassTest')!.data.display, '@SharedArt');
    const base = clan.entries.find(entry => entry.id === 'PrivateArtSprite')!.data;
    assert.equal(base.pixels_per_unit, 80); assert.deepEqual(base.pivot, { x: 0.4, y: 0.6 }); assert.equal(base.custom, 42);
    assert.equal(clan.entries.find(entry => entry.id === 'PrivateArtSprite1')!.data.path, clan.entries.find(entry => entry.id === 'PrivateArtSprite2')!.data.path);
    for (const image of preview.images) assert.deepEqual(await fs.readFile(path.join(root, image.file)), png);
    const privatePath = path.join(root, String(base.path)); await fs.writeFile(privatePath, 'cambio independiente');
    assert.deepEqual(await fs.readFile(path.join(root, 'textures/base.png')), png);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('la vista previa detecta cambios del PNG y bloquea colisiones y adaptadores no soportados', async () => {
  const { root, file, original, request } = await fixture();
  try {
    await assert.rejects(() => saveVisualCopy(request), /Previsualiza/);
    await assert.rejects(() => prepareVisualCopy({ ...request, newId: '../escape' }), /ID nuevo/);
    await assert.rejects(() => prepareVisualCopy({ ...request, newId: 'sharedart' }), /ya existe/);
    const preview = await prepareVisualCopy(request);
    const changed = await sharp({ create: { width: 40, height: 50, channels: 4, background: '#00ffcc' } }).png().toBuffer();
    await fs.writeFile(path.join(root, 'textures/base.png'), changed);
    await assert.rejects(() => saveVisualCopy({ ...request, expectedToken: preview.token }), /cambiaron/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    const spine = original.replace('"unknown":{"keep":42}', '"skeleton_animations":{"idle":"test"}');
    await fs.writeFile(file, spine);
    await assert.rejects(() => prepareVisualCopy(request), /Spine/);
    await fs.writeFile(file, original.replace('"@Alias"', '"@MissingFrame"'));
    await assert.rejects(() => prepareVisualCopy(request), /animación no compatible/);
    assert.deepEqual(await fs.readdir(path.join(root, 'json')), ['content.json']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('retira las definiciones y PNG nuevos si falla el cambio de referencia final', async () => {
  const { root, file, original, request } = await fixture();
  const rename = fs.rename;
  try {
    const preview = await prepareVisualCopy(request);
    fs.rename = async () => { throw new Error('Fallo simulado al asignar'); };
    await assert.rejects(() => saveVisualCopy({ ...request, expectedToken: preview.token }), /Fallo simulado/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    assert.deepEqual(await fs.readdir(path.join(root, 'json')), ['content.json']);
    assert.deepEqual(await fs.readdir(path.join(root, 'textures')), ['base.png', 'frame.png']);
  } finally { fs.rename = rename; await fs.rm(root, { recursive: true, force: true }); }
});
