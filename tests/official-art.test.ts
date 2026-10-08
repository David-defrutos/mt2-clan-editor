import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {officialArtCatalog} from '../src/server/official-art.ts';
test('referencias oficiales usan solo sprites de unidades con metadatos válidos y bloquean rutas fuera del dataset',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-official-reference-'));
 try{
  assert.deepEqual((await officialArtCatalog(root)).rows,[]);
  const dataset=path.join(root,'official-art/characters-test');await fs.mkdir(dataset,{recursive:true});await fs.writeFile(path.join(dataset,'sprite.png'),'image');
  const sprite={name:'PLR_Test',type:'Sprite',file:'sprite.png',width:200,height:300,pixelsPerUnit:100,pivot:{x:0.5,y:0.5},sha256:createHash('sha256').update('image').digest('hex')};
  const images=[sprite,{...sprite,type:'Texture2D',name:'ENM_Atlas'},{...sprite,name:'FX_Test'},{...sprite,name:'ENM_Test'},{...sprite,name:'PLR_Invalid',pixelsPerUnit:0}];
  await fs.writeFile(path.join(dataset,'manifest.json'),JSON.stringify({images}));const model=await officialArtCatalog(root);assert.equal(model.rows.length,2);assert.deepEqual(model.rows.map(r=>r.group),['enemies','allies']);assert.equal(model.rows[0].ppu,100);assert.ok(model.rules.help.includes('manual'));
  await fs.writeFile(path.join(dataset,'manifest.json'),JSON.stringify({images:[{...sprite,file:'../../outside.png'}]}));await assert.rejects(()=>officialArtCatalog(root),/Ruta de sprite/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
