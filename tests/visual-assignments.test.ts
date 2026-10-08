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
    assert.deepEqual(preview.before, { id: '@OldArt', custom: 42 }); assert.deepEqual(preview.after, { id: '@NewArt', custom: 42 });
    const saved = await saveVisualAssignment(request);
    assert.equal(await fs.readFile(saved.backup!, 'utf8'), original);
    const updated = await fs.readFile(path.join(root, request.file), 'utf8');
    assert.deepEqual(JSON.parse(updated.replace(/^\uFEFF/, '').replace('// conservar comentarios', '')).cards[0].card_art, { id: '@NewArt', custom: 42 });
    assert.ok(updated.includes('// conservar comentarios'));
    assert.ok(updated.startsWith('\uFEFF'));
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

test('asigna sprites a logos, marcos y estados del mapa sin modificar PNG ni otros campos', async () => {
 const {root,png}=await fixture();
 try {
  const data={classes:[{id:'VisualClan',icons:{medium:{id:'@Sprite',keep:7},large:'@Sprite'}}],class_card_styles:[{id:'Style',unit_card_frame_sprite:'@Sprite',spell_card_frame_sprite:'@Sprite'}],sprites:[{id:'OtherSprite',path:'textures/art.png'}],game_objects:[{id:'Banner',type:'map_node_icon',extensions:{map_node_icon:{enabled_sprite:'@Sprite',disabled_sprite:'@Sprite',custom:42}}}]};
  const original=JSON.stringify(data);await fs.writeFile(path.join(root,'json/visual.json'),original);
  const clan=await scanClan(root);
  const catalog=await visualCatalog(clan,'classes');
  assert.equal(catalog.find(s=>s.path==='icons.medium')?.copyable,false);
  assert.equal(catalog[0].candidates.find(c=>c.id==='Sprite')?.width,40);
  for(const [section,id,field] of [['classes','VisualClan','icons.medium'],['class_card_styles','Style','unit_card_frame_sprite'],['game_objects','Banner','extensions.map_node_icon.enabled_sprite']]){
   const current=await scanClan(root);const entry=current.entries.find(e=>e.section===section&&e.id===id)!;
   const input={root,section,id,field,file:entry.file,targetId:'OtherSprite',expectedHash:entry.hash};
   if(section==='classes'){
    const noop=await prepareVisualAssignment({...input,targetId:'Sprite'});assert.equal(noop.changed,false);
    await saveVisualAssignment({...input,targetId:'Sprite'});assert.equal(await fs.readFile(path.join(root,entry.file),'utf8'),original);
   }
   const preview=await prepareVisualAssignment(input);assert.equal(preview.changed,true);
   await saveVisualAssignment(input);
  }
  const after=JSON.parse(await fs.readFile(path.join(root,'json/visual.json'),'utf8'));
  assert.deepEqual(after.classes[0].icons.medium,{id:'@OtherSprite',keep:7});assert.equal(after.classes[0].icons.large,'@Sprite');
  assert.equal(after.class_card_styles[0].unit_card_frame_sprite,'@OtherSprite');assert.equal(after.class_card_styles[0].spell_card_frame_sprite,'@Sprite');
  assert.equal(after.game_objects[0].extensions.map_node_icon.enabled_sprite,'@OtherSprite');assert.equal(after.game_objects[0].extensions.map_node_icon.custom,42);
  assert.deepEqual(await fs.readFile(path.join(root,'textures/art.png')),png);
  const wrong=(await scanClan(root)).entries.find(e=>e.id==='CharacterArt'&&e.section==='game_objects')!;
  await assert.rejects(()=>prepareVisualAssignment({root,section:'game_objects',file:wrong.file,id:wrong.id,field:'extensions.map_node_icon.enabled_sprite',targetId:'Sprite',expectedHash:wrong.hash}),/tipo de objeto/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('asigna mapa, minimapa, estados y triggers conservando referencias vecinas y metadatos', async () => {
  const { root, png } = await fixture();
  try {
    const data = {
      map_nodes: [{ id: 'Node', map_icon: { id: '@Sprite', custom: 9 }, minimap_icon: '@Sprite', rewards: ['@Reward'], prefab: '@Banner' }],
      status_effects: [{ id: 'Status', icon: { id: '@Remote', mod_reference: 'OtherMod' }, unknown: true }],
      character_trigger_types: [{ id: 'Trigger', sprite: '@Sprite', titles: { english: 'On enter' } }],
      card_trigger_types: [{ id: 'CardTrigger', unknown: 17 }],
      atlas_icons: [{ id: 'OtherSprite', path: 'textures/art.png' }],
      sprites: [{ id: 'OtherSprite', path: 'textures/art.png' }]
    };
    await fs.writeFile(path.join(root, 'json/mechanics.json'), JSON.stringify(data));
    for (const [section, id, field] of [
      ['map_nodes', 'Node', 'map_icon'], ['map_nodes', 'Node', 'minimap_icon'],
      ['status_effects', 'Status', 'icon'], ['character_trigger_types', 'Trigger', 'sprite']
    ]) {
      const clan = await scanClan(root);
      const entry = clan.entries.find(e => e.section === section && e.id === id)!;
      const catalog = await visualCatalog(clan, section);
      const slot = catalog.find(s => s.path === field)!;
      assert.equal(slot.copyable, false);
      assert.equal(slot.candidates.filter(c => c.id === 'OtherSprite').length, 1);
      const input = { root, section, id, field, file: entry.file, targetId: 'OtherSprite', expectedHash: entry.hash };
      assert.equal((await prepareVisualAssignment(input)).changed, true);
      const saved = await saveVisualAssignment(input);
      assert.ok(saved.backup);
    }
    const after = JSON.parse(await fs.readFile(path.join(root, 'json/mechanics.json'), 'utf8'));
    const expected = structuredClone(data);
    expected.map_nodes[0].map_icon.id = '@OtherSprite';
    expected.map_nodes[0].minimap_icon = '@OtherSprite';
    // Explicitly choosing a local sprite replaces the external reference, including its mod namespace.
    (expected.status_effects[0] as unknown as Record<string, unknown>).icon = '@OtherSprite';
    expected.character_trigger_types[0].sprite = '@OtherSprite';
    assert.deepEqual(after, expected);
    assert.deepEqual(await fs.readFile(path.join(root, 'textures/art.png')), png);
    assert.deepEqual(await visualCatalog(await scanClan(root), 'card_trigger_types'), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
