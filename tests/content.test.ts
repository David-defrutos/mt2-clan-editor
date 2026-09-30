import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { prepareContent, saveContent, type ContentRequest } from '../src/server/content.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-content-'));
  await fs.mkdir(path.join(root, 'json')); await fs.mkdir(path.join(root, 'textures'));
  const source = '\uFEFF{\r\n// conservar exactamente\r\n"classes":[{"id":"ClassFixture"}],"cards":[{"id":"Original","card_type":"monster","effects":[{"id":"@Spawn","custom":5},"@Extra"],"names":{"english":"Original","spanish":"Original ES"},"unknown":{"keep":42},"pools":["MegaPool"]}],"effects":[{"id":"Extra","name":"CustomEffect"}]\r\n}\r\n';
  await fs.writeFile(path.join(root, 'json', 'cards.json'), source);
  await fs.writeFile(path.join(root, 'json', 'units.json'), JSON.stringify({ effects: [{ id: 'Spawn', name: 'CardEffectSpawnMonster', param_character: { id: '@Unit', keep: true } }], characters: [{ id: 'Unit', attack_damage: 9, health: 15, character_art: '@Art', triggers: ['@SharedTrigger'] }], game_objects: [{ id: 'Art' }], character_triggers: [{ id: 'SharedTrigger' }] }));
  return { root, source, request: { root, section: 'cards', id: 'NewCard', name: 'Nueva carta', source: { id: 'Original', file: 'json/cards.json' } } as ContentRequest };
}

test('duplica invocación y unidad entre archivos conservando referencias estructuradas y originales', async () => {
  const { root, source, request } = await fixture();
  try {
    const unitsBefore = await fs.readFile(path.join(root, 'json/units.json'), 'utf8');
    const preview = await prepareContent(request);
    assert.equal((await scanClan(root)).entries.some(e => e.id === 'NewCard'), false);
    assert.ok(preview.warnings.some(w => w.includes('compartidos')));
    await saveContent({ ...request, expectedToken: preview.token });
    assert.equal(await fs.readFile(path.join(root, 'json/cards.json'), 'utf8'), source);
    assert.equal(await fs.readFile(path.join(root, 'json/units.json'), 'utf8'), unitsBefore);
    const entries = (await scanClan(root)).entries;
    const copy = entries.find(e => e.id === 'NewCard')!.data;
    assert.deepEqual(copy.effects, [{ id: '@NewCardSpawnEffect', custom: 5 }, '@Extra']);
    assert.deepEqual(copy.names, { english: 'Nueva carta', spanish: 'Original ES' });
    assert.deepEqual(copy.unknown, { keep: 42 });
    const effect = entries.find(e => e.id === 'NewCardSpawnEffect')!.data;
    assert.deepEqual(effect.param_character, { id: '@NewCardCharacter', keep: true });
    const unit = entries.find(e => e.id === 'NewCardCharacter')!.data;
    assert.equal(unit.attack_damage, 9); assert.equal(unit.character_art, '@Art');
    assert.deepEqual(unit.triggers, ['@SharedTrigger']);
    await assert.rejects(() => saveContent({ ...request, expectedToken: preview.token }), /cambió en disco/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('crea carta de unidad con arte válido, hechizo y unidad independiente desde plantilla', async () => {
  const { root } = await fixture();
  try {
    for (const [section, id, kind] of [['cards', 'NewUnitCard', 'monster'], ['cards', 'NewSpell', 'spell'], ['characters', 'Standalone', undefined]] as const) {
      const request: ContentRequest = { root, section, id, name: id, kind };
      const preview = await prepareContent(request);
      await saveContent({ ...request, expectedToken: preview.token });
      const entry = (await scanClan(root)).entries.find(e => e.id === id)!;
      assert.equal(entry.section, section);
      for (const image of preview.images) {
        const metadata = await sharp(path.join(root, image.file)).metadata();
        assert.equal(metadata.format, 'png'); assert.ok(metadata.width! > 0);
      }
    }
    const clan = await scanClan(root);
    assert.equal(clan.entries.find(e => e.id === 'NewUnitCard')!.data.class, '@ClassFixture');
    assert.deepEqual(clan.entries.find(e => e.id === 'NewSpell')!.data.effects, []);
    assert.equal(clan.issues.length, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rechaza colisiones, rutas, fuentes externas y cambios tras la vista previa sin escribir', async () => {
  const { root, request } = await fixture();
  try {
    await assert.rejects(() => prepareContent({ ...request, id: '../escape' }), /ID/);
    await assert.rejects(() => prepareContent({ ...request, id: 'original' }), /ya existe/);
    await assert.rejects(() => saveContent(request), /Previsualiza/);
    const preview = await prepareContent(request);
    await fs.appendFile(path.join(root, 'json/units.json'), '\n');
    await assert.rejects(() => saveContent({ ...request, expectedToken: preview.token }), /cambió en disco/);
    assert.equal((await fs.readdir(path.join(root, 'json'))).length, 2);
    assert.equal((await fs.readdir(path.join(root, 'textures'))).length, 0);
    await fs.writeFile(path.join(root, 'json/external.json'), JSON.stringify({ cards: [{ id: 'External', card_type: 'monster', effects: [{ id: '@Spawn', mod_reference: 'other.mod' }] }] }));
    await assert.rejects(() => prepareContent({ ...request, source: { id: 'External', file: 'json/external.json' } }), /externo/);
    await fs.writeFile(path.join(root, 'json/editor-NewCard.json'), '{}');
    await assert.rejects(() => prepareContent(request), /archivo ya existe/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('copia la segunda unidad de una invocación y bloquea pools de personajes', async () => {
  const { root, request } = await fixture();
  try {
    const file = path.join(root, 'json/units.json');
    const document = JSON.parse(await fs.readFile(file, 'utf8'));
    document.characters.push({ id: 'Second', attack_damage: 2, health: 3 });
    document.effects[0].param_character_2 = '@Second';
    await fs.writeFile(file, JSON.stringify(document));
    const preview = await prepareContent(request);
    const effect = (preview.document.effects as any[])[0];
    assert.equal(effect.param_character_2, '@NewCardCharacter1');
    assert.equal((preview.document.characters as any[])[1].attack_damage, 2);
    document.effects[0].param_character_pool = '@Pool';
    await fs.writeFile(file, JSON.stringify(document));
    await assert.rejects(() => prepareContent(request), /por pool/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
