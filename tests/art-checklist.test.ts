import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { artChecklist } from '../src/server/art-checklist.ts';

test('checklist resuelve roles y campeones, separa atlas/sprite y conserva recursos externos y datos', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-art-checklist-'));
 try {
  await fs.mkdir(path.join(root,'json')); await fs.mkdir(path.join(root,'textures'));
  await sharp({create:{width:48,height:48,channels:4,background:'#abcdef'}}).png().toFile(path.join(root,'textures/logo.png'));
  const original=JSON.stringify({classes:[{id:'Clan',icons:{small:'@Shared',medium:{id:'@Shared',mod_reference:'Other'},large:'@Missing'},champions:[{icon:'@Shared',portrait:'GamePortrait'},{icon:'@Shared',locked_icon:'@Broken'}],class_select_character_displays:['@Art']}],sprites:[{id:'Shared',path:'textures/logo.png'},{id:'Broken',path:'textures/absent.png'}],atlas_icons:[{id:'Shared',path:'textures/tooltip-missing.png'}],game_objects:[{id:'Art',type:'character_art',extensions:{character_art:{sprite:'@Shared'}}}]});
  await fs.writeFile(path.join(root,'json/art.json'),original);
  const {rows}=await artChecklist(await scanClan(root));
  assert.equal(rows.find(r=>r.field==='icons.small')?.status,'ok');
  assert.equal(rows.find(r=>r.field==='icons.medium')?.status,'external');
  assert.equal(rows.find(r=>r.field==='icons.large')?.status,'unresolved');
  assert.equal(rows.find(r=>r.field==='champions.0.locked_icon')?.status,'undeclared');
  assert.equal(rows.find(r=>r.field==='champions.1.locked_icon')?.status,'missing');
  assert.equal(rows.find(r=>r.field==='class_select_character_displays.0')?.width,48);
  assert.equal(rows.find(r=>r.section==='atlas_icons')?.status,'missing');
  assert.equal(await fs.readFile(path.join(root,'json/art.json'),'utf8'),original);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('referencias locales ambiguas se muestran sin resolver y listas de campeones ausentes no se inventan', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-art-ambiguous-'));
 try {
  await fs.mkdir(path.join(root,'json'));
  await fs.writeFile(path.join(root,'json/art.json'),JSON.stringify({classes:[{id:'Clan',icons:{small:'@Duplicate'}}],sprites:[{id:'Duplicate',path:'x.png'},{id:'Duplicate',path:'y.png'}]}));
  const {rows}=await artChecklist(await scanClan(root));
  const logo=rows.find(r=>r.field==='icons.small');
  assert.equal(logo?.status,'unresolved'); assert.match(logo!.note,/duplicado/);
  assert.equal(rows.some(r=>r.field.includes('champions.0')),false);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
