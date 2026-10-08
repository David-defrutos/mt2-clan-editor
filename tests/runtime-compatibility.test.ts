import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanClan} from '../src/server/scan.ts';
import {saveObjectEdit,saveEdit} from '../src/server/edit.ts';
test('override replace conserva listas y objetos vacíos; editar un trigger no inventa buff_effect',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-runtime-compatibility-'));
 try{
  await fs.mkdir(path.join(root,'json'));const file=path.join(root,'json/test.json');await fs.writeFile(file,JSON.stringify({cards:[{id:'Override',override:'replace',effects:['CardEffectNULL'],unknown:{keep:3}}],card_triggers:[{id:'Trigger',trigger:'on_cast',effects:[]}]}));
  let clan=await scanClan(root);const card=clan.entries.find(e=>e.id==='Override')!;
  await saveObjectEdit({root,section:card.section,id:card.id,file:card.file,expectedHash:card.hash,json:JSON.stringify({...card.data,effects:[],unknown:{}})});
  clan=await scanClan(root);assert.deepEqual(clan.entries.find(e=>e.id==='Override')!.data.effects,[]);assert.deepEqual(clan.entries.find(e=>e.id==='Override')!.data.unknown,{});
  const trigger=clan.entries.find(e=>e.id==='Trigger')!;await saveEdit({root,section:trigger.section,id:trigger.id,file:trigger.file,expectedHash:trigger.hash,field:'trigger',value:'on_discard'});
  const result=(await scanClan(root)).entries.find(e=>e.id==='Trigger')!.data;assert.equal(result.trigger,'on_discard');assert.ok(!Object.hasOwn(result,'buff_effect'));assert.deepEqual(result.effects,[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
