import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { inventoryAssets } from '../src/server/assets.ts';
import { visualCatalog } from '../src/server/visual-assignments.ts';

test('atlas y sprite del mismo ID son recursos independientes y no alteran la resolución del arte de carta', async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-atlas-'));
 try {
  await fs.mkdir(path.join(root,'json')); await fs.mkdir(path.join(root,'textures'));
  await sharp({create:{width:50,height:50,channels:4,background:'#ffffff'}}).png().toFile(path.join(root,'textures/tooltip.png'));
  await sharp({create:{width:210,height:250,channels:4,background:'#123456'}}).png().toFile(path.join(root,'textures/card.png'));
  const original=JSON.stringify({atlas_icons:[{id:'Shared',path:'textures/tooltip.png'},{id:'Missing',path:'textures/missing.png'}],sprites:[{id:'Shared',path:'textures/card.png'}],game_objects:[{id:'Art',type:'card_art',extensions:{card_art:{sprite:'@Shared'}}}]});
  await fs.writeFile(path.join(root,'json/art.json'),original);
  const clan=await scanClan(root); const assets=await inventoryAssets(clan);
  assert.equal(assets.length,3);
  assert.equal(assets.find(a=>a.id==='Shared' && a.section==='atlas_icons')?.width,50);
  assert.equal(assets.find(a=>a.id==='Shared' && a.section==='sprites')?.width,210);
  assert.equal(assets.find(a=>a.id==='Missing')?.status,'missing');
  assert.deepEqual(assets.find(a=>a.section==='atlas_icons')?.uses,[]);
  const catalog=await visualCatalog(clan,'cards');
  assert.equal(catalog[0].candidates[0].image,'textures/card.png');
  assert.equal(catalog[0].candidates[0].width,210);
  assert.equal(await fs.readFile(path.join(root,'json/art.json'),'utf8'),original);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
