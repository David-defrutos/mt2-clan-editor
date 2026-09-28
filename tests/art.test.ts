import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { prepareArt, saveArt } from '../src/server/art.ts';

test('reemplazar arte ajusta dimensiones, crea respaldo y exige hash actual', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-art-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    await fs.mkdir(path.join(root, 'textures'));
    const original = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const replacement = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#0000ff' } }).png().toBuffer();
    const image = path.join(root, 'textures', 'art.png');
    await fs.writeFile(image, original);
    await fs.writeFile(path.join(root, 'json', 'content.json'), JSON.stringify({ classes: [{ id: 'ClassTest' }], sprites: [{ id: 'Art', path: 'textures/art.png' }] }));
    const request = { root, spriteId: 'Art', file: 'json/content.json', imageBase64: replacement.toString('base64'), mode: 'match-existing' as const, expectedHash: createHash('sha256').update(original).digest('hex') };
    const preview = await prepareArt(request);
    assert.equal(preview.newWidth, 100); assert.equal(preview.newHeight, 80);
    assert.deepEqual(await fs.readFile(image), original);
    const saved = await saveArt(request);
    assert.deepEqual(await fs.readFile(saved.backup!), original);
    assert.equal((await sharp(image).metadata()).width, 100);
    await assert.rejects(() => saveArt(request), /cambió en disco/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
