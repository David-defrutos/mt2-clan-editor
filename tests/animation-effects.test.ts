import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareContent} from '../src/server/content.ts';
import {prepareEdit, saveEdit} from '../src/server/edit.ts';
import {scanClan} from '../src/server/scan.ts';
import {referenceModel, prepareReference, saveReference} from '../src/server/reference-editor.ts';
import {mechanicsSupport} from '../src/server/mechanics-support.ts';
import {matchesMechanic as serverMatches} from '../src/server/mechanic-rule.ts';
import {matchesMechanic as browserMatches} from '../src/web/mechanic-rule.ts';

const play='CardEffectPlayCharacterAnimation';
const change='CardEffectSwitchCharacterAnimationModel';
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-animations-'));await fs.mkdir(path.join(root,'json'));
 const file=path.join(root,'json/clan.json');
 const external={id:'@RemoteUnit',mod_reference:'Other',keep:5};
 const original='\uFEFF// preserved\r\n'+JSON.stringify({classes:[{id:'Test'}],characters:[{id:'Unit',character_art:'@Art',health:10}],game_objects:[{id:'Art',type:'character_art'}],effects:[{id:'Play',name:{id:'@'+play,mod_reference:'Conductor'},anim_to_play:'attack',target_team:'monsters'},{id:'Switch',name:{id:'@'+change,mod_reference:'Conductor'},param_int:0,param_character_pool:[external],keep:42},{id:'WrongMod',name:{id:'@'+change,mod_reference:'Other'},param_int:0}],cards:[{id:'Card',effects:['@Play','@Switch']}]},null,2).replaceAll('\n','\r\n');
 await fs.writeFile(file,original);return {root,file,original,external};
}
test('plantillas de Conductor referencian su namespace y explican la dependencia sin modificar archivos',async()=>{
 const {root,file,original}=await fixture();try{
  for(const name of [play,change]){
   const result=await prepareContent({root,section:'effects',id:'CreatedEffect',name:'',kind:name});
   const effect=(result.document.effects as any[])[0];assert.deepEqual(effect.name,{id:'@'+name,mod_reference:'Conductor'});
   assert.ok(result.warnings.some(w=>w.includes('Conductor 0.5.14')));
   if(name===change)assert.deepEqual(effect.param_character_pool,[]);
   assert.equal(await fs.readFile(file,'utf8'),original);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('edición de animación valida valores e índices, preserva vecinos y rechaza clases del mismo nombre de otros mods',async()=>{
 const {root,file}=await fixture();try{
  const clan=await scanClan(root);const playEntry=clan.entries.find(e=>e.id==='Play')!;
  const request={root,section:'effects',id:'Play',file:playEntry.file,field:'anim_to_play',value:'spell',expectedHash:playEntry.hash};
  for(const value of ['hover','talk','missing'])await assert.rejects(()=>prepareEdit({...request,value}),/Valor no permitido/);
  await saveEdit(request);
  let current=await scanClan(root);const effect=current.entries.find(e=>e.id==='Switch')!;
  const variant={root,section:'effects',id:'Switch',file:effect.file,field:'param_int',value:1,expectedHash:effect.hash};
  for(const value of [-1,1.5,2147483648])await assert.rejects(()=>prepareEdit({...variant,value}),/rango/);
  await saveEdit(variant);
  current=await scanClan(root);assert.equal(current.entries.find(e=>e.id==='Switch')?.data.keep,42);
  assert.deepEqual(current.entries.find(e=>e.id==='Switch')?.data.name,{id:'@'+change,mod_reference:'Conductor'});
  const wrong=current.entries.find(e=>e.id==='WrongMod')!;
  await assert.rejects(()=>prepareEdit({...variant,id:wrong.id,file:wrong.file,expectedHash:wrong.hash}),/edición guiada/);
  assert.ok((await fs.readFile(file,'utf8')).startsWith('\uFEFF// preserved\r\n'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('lista compatible añade unidades locales conservando externos y compartidos sin tocar estadísticas ni arte',async()=>{
 const {root,external}=await fixture();try{
  const clan=await scanClan(root);const effect=clan.entries.find(e=>e.id==='Switch')!;
  const slots=await referenceModel(clan,'effects',effect.id,effect.file);assert.equal(slots.length,1);assert.equal(slots[0].field,'param_character_pool');
  const request={root,section:'effects',id:effect.id,file:effect.file,field:'param_character_pool',expectedHash:effect.hash,operation:'append' as const,targetId:'Unit'};
  const review=await prepareReference(request);await saveReference({...request,expectedToken:review.token});
  const current=await scanClan(root);assert.deepEqual(current.entries.find(e=>e.id==='Switch')?.data.param_character_pool,[external,'@Unit']);
  assert.deepEqual(current.entries.find(e=>e.id==='Unit')?.data,{id:'Unit',character_art:'@Art',health:10});
  assert.ok(review.uses.some(e=>e.id==='Card'));
  const supported=await mechanicsSupport(current);assert.equal(supported.rows.find(e=>e.id==='Switch')?.status,'configured');
  const wrong=current.entries.find(e=>e.id==='WrongMod')!;assert.deepEqual(await referenceModel(current,'effects',wrong.id,wrong.file),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('filtros de adaptadores del navegador y servidor coinciden para referencias estructuradas y namespaces',()=>{
 const rules=[{names:['@'+change,change],modReferences:['Conductor']},{names:['CardEffectDamage']},{names:['on_cast'],selector:'trigger'}];
 for(const rule of rules)for(const data of [{name:{id:'@'+change,mod_reference:'Conductor'}},{name:{id:'@'+change,mod_reference:'Other'}},{name:'@'+change},{name:{id:'CardEffectDamage'}},{name:{id:'CardEffectDamage',mod_reference:'Other'}},{trigger:'on_cast'}])assert.equal(browserMatches(data,rule),serverMatches(data,rule));
 assert.equal(serverMatches({name:{id:'@'+change,mod_reference:'Conductor'}},rules[0]),true);
 assert.equal(serverMatches({name:{id:'@'+change,mod_reference:'Other'}},rules[0]),false);
});
