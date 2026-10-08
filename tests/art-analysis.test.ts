import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { analyzeArt } from '../src/server/art-analysis.ts';

test('mide area visible ignorando alpha tenue y pixeles aislados; conserva el original', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-alpha-'));
 try {
  const raw=Buffer.alloc(200*200*4);
  for(let y=40;y<60;y++) for(let x=30;x<40;x++) raw[(y*200+x)*4+3]=128;
  raw[3]=255; raw[((199*200)+199)*4+3]=32;
  const image=await sharp(raw,{raw:{width:200,height:200,channels:4}}).png().toBuffer();
  await fs.writeFile(path.join(root,'image.png'),image);
  const model=await analyzeArt(root,'image.png');
  assert.equal(model.hasAlpha,true); assert.equal(model.transparency,'transparent');
  assert.deepEqual(model.bounds,{x:30,y:40,width:10,height:20,margins:{left:30,top:40,right:160,bottom:140}});
  assert.deepEqual(await fs.readFile(path.join(root,'image.png')),image);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('distingue imagen opaca de vacia y rechaza rutas externas', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-alpha-modes-'));
 try {
  await sharp({create:{width:20,height:30,channels:3,background:'#111111'}}).png().toFile(path.join(root,'opaque.png'));
  const opaque=await analyzeArt(root,'opaque.png');
  assert.equal(opaque.hasAlpha,false); assert.equal(opaque.transparency,'opaque');
  assert.equal(opaque.bounds?.width,20); assert.equal(opaque.bounds?.height,30);
  await sharp({create:{width:20,height:30,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toFile(path.join(root,'empty.png'));
  assert.equal((await analyzeArt(root,'empty.png')).bounds,null);
  await assert.rejects(()=>analyzeArt(root,'../outside.png'),/sale del clan/);
  await fs.writeFile(path.join(root,'invalid.png'),'not an image');
  await assert.rejects(()=>analyzeArt(root,'invalid.png'));
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
