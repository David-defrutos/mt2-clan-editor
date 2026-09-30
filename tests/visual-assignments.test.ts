import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { visualCatalog, prepareVisualAssignment, saveVisualAssignment } from '../src/server/visual-assignments.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-visual-assign-'));
  await fs.mkdir(path.join(root, 'json')); await fs.mkdir(path.join(root, 'textures'));
  const png = await sharp({ create: { width: 40, height: 50, channels: 4, background: '#ff00cc' } }).png().toBuffer();
  await fs.writeFile(path.join(root, 'textures/art.png'), png);
  const original = '\uFEFF{\r\n  // conservar comentarios\r\n  "classes":[{"id":"ClassTest","display":"@CharacterArt"}],\r\n  "cards":[{"id":"Card","cost":2,"card_art":{"id":"@OldArt","custom":42},"unknown":{"keep":true}}],\r\n  "characters":[{"id":"Unit","character_art":"@CharacterArt"}],\r\n  "sprites":[{"id":"Sprite","path":"textures/art.png"}],\r\n  "game_objects":[{"id":"OldArt","type":"card_art"},{"id":"NewArt","type":"card_art","extensions":{"card_art":{"sprite":"@Sprite"}}},{"id":"CharacterArt","type":"character_art","extensions":{"character_art":{"sprite":"@Sprite","transform":{"scale":{"x":2,"y":2}}}}}]\r\n}\r\n';
  await fs.writeFile(path.join(root, 'json/content.json'), original);
  const clan = await scanClan(root); const card = clan.entries.find(entry => entry.id === 'Card')!;
  const request = { root, section: 'cards', file: card.file, id: card.id, field: 'card_art', targetId: 'NewArt', expectedHash: card.hash };
  return { root, clan, original, request, png };
}

test('catálogo distingue carta y personaje y enumera sprite y usos compartidos', async () => {
  const { root, clan } = await fixture();
  try {
    const cards = await visualCatalog(clan, 'cards'); const units = await visualCatalog(clan, 'characters');
    assert.deepEqual(cards[0].candidates.map(candidate => candidate.id), ['OldArt', 'NewArt']);
    assert.equal(cards[0].candidates[1].image, 'textures/art.png');
    assert.equal(cards[0].candidates[1].width, 40);
    assert.deepEqual(units[0].candidates[0].uses.map(use => use.id), ['ClassTest', 'Unit']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('asigna solo la referencia, preserva PNG, comentarios, desconocidos y respalda el original', async () => {
  const { root, original, request, png } = await fixture();
  try {
    const same = { ...request, targetId: 'OldArt' };
    assert.equal((await prepareVisualAssignment(same)).changed, false);
    assert.equal((await saveVisualAssignment(same)).changed, false);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original);
    const preview = await prepareVisualAssignment(request);
    assert.deepEqual(preview.before, { id: '@OldArt', custom: 42 }); assert.equal(preview.after, '@NewArt');
    const saved = await saveVisualAssignment(request);
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    const updated = await fs.readFile(path.join(root, request.file), 'utf8');
    assert.equal(updated, original.replace('{"id":"@OldArt","custom":42}', '"@NewArt"'));
    assert.deepEqual(await fs.readFile(path.join(root, 'textures/art.png')), png);
    await assert.rejects(() => saveVisualAssignment(request), /cambió en disco/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rechaza tipo incorrecto, campo ajeno, ID inexistente y recurso duplicado', async () => {
  const { root, request, original } = await fixture();
  try {
    await assert.rejects(() => prepareVisualAssignment({ ...request, targetId: 'CharacterArt' }), /tipo correcto/);
    await assert.rejects(() => prepareVisualAssignment({ ...request, targetId: 'Missing' }), /ID único/);
    await assert.rejects(() => prepareVisualAssignment({ ...request, field: 'cost' }), /no permitida/);
    await fs.writeFile(path.join(root, 'json/duplicate.json'), '{"game_objects":[{"id":"NewArt","type":"card_art"}]}');
    const catalog = await visualCatalog(await scanClan(root), 'cards');
    assert.equal(catalog[0].candidates.some(candidate => candidate.id === 'NewArt'), false);
    await assert.rejects(() => saveVisualAssignment(request), /ID único/);
    assert.equal(await fs.readFile(path.join(root, request.file), 'utf8'), original);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
