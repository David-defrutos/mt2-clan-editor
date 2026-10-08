import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {prepareContent} from '../src/server/content.ts';
import {prepareEdit,saveEdit} from '../src/server/edit.ts';
import {scanClan} from '../src/server/scan.ts';
import {validateClan} from '../src/server/validate.ts';
import {matchesMechanic as serverMatch} from '../src/server/mechanic-rule.ts';
import {matchesMechanic as browserMatch} from '../src/web/mechanic-rule.ts';
import {StatusParameter,replaceStatus,statusChoices} from '../src/web/status-parameter.tsx';

const mode={id:'@n-units',mod_reference:'Conductor'};
const pierce={id:'@pierce',mod_reference:'Conductor'};
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-conductor-targets-'));await fs.mkdir(path.join(root,'json'));
 const file=path.join(root,'json/test.json');
 await fs.writeFile(file,JSON.stringify({classes:[{id:'Clan'}],characters:[{id:'Unit',health:20,starting_status_effects:[{status:'armor',count:3,keep:7}]}],effects:[{id:'Select',name:'CardEffectNULL',target_mode:mode,param_int:2,param_bool3:false,keep:5},{id:'Damage',name:'CardEffectDamage',target_mode:mode,param_int:4},{id:'Other',name:'CardEffectNULL',target_mode:{id:'@n-units',mod_reference:'Other'},param_int:2}]}));
 return {root,file};
}
test('crea selector N-units con CardEffectNULL y referencia Conductor; edición valida cantidad y orientación',async()=>{
 const {root}=await fixture();try{
  const created=await prepareContent({root,section:'effects',id:'CreatedSelector',name:'',kind:'ConductorNUnits'});
  const data=(created.document.effects as any[])[0];assert.equal(data.name,'CardEffectNULL');assert.deepEqual(data.target_mode,mode);assert.equal(data.param_bool3,false);
  assert.ok(created.warnings.some(w=>w.includes('last_targeted_characters')));
  const selected=(await scanClan(root)).entries.find(e=>e.id==='Select')!;
  const input={root,section:'effects',file:selected.file,id:selected.id,field:'param_int',value:3,expectedHash:selected.hash};
  for(const value of [0,-1,1.5])await assert.rejects(()=>prepareEdit({...input,value}),/rango/);
  await saveEdit(input);
  const current=(await scanClan(root)).entries.find(e=>e.id==='Select')!;
  await saveEdit({...input,field:'param_bool3',value:true,expectedHash:current.hash});
  const result=(await scanClan(root)).entries.find(e=>e.id==='Select')!.data;
  assert.equal(result.param_int,3);assert.equal(result.param_bool3,true);assert.equal(result.keep,5);assert.deepEqual(result.target_mode,mode);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('adaptadores requieren CardEffectNULL y namespace correcto; validación detecta el uso directo en otro efecto',async()=>{
 const {root}=await fixture();try{
  const clan=await scanClan(root);const checks=await validateClan(clan);
  assert.ok(checks.some(i=>i.id==='Damage'&&i.code==='mechanic-incompatible'));
  assert.ok(!checks.some(i=>i.id==='Other'&&i.code==='mechanic-incompatible'));
  const rule={names:['CardEffectNULL'],requires:[{selector:'target_mode',names:['@n-units','n-units'],modReferences:['Conductor']}]};
  for(const entry of clan.entries.filter(e=>e.section==='effects'))assert.equal(browserMatch(entry.data,rule),serverMatch(entry.data,rule));
  assert.equal(serverMatch(clan.entries.find(e=>e.id==='Select')!.data,rule),true);
  assert.equal(serverMatch(clan.entries.find(e=>e.id==='Damage')!.data,rule),false);
  assert.equal(serverMatch(clan.entries.find(e=>e.id==='Other')!.data,rule),false);
  const other=clan.entries.find(e=>e.id==='Other')!;
  await assert.rejects(()=>prepareEdit({root,section:'effects',file:other.file,id:other.id,field:'param_int',value:3,expectedHash:other.hash}),/edición guiada/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Pierce se añade como estado externo, preserva entradas vecinas y nunca sustituye la referencia por su etiqueta',async()=>{
 const {root}=await fixture();try{
  const clan=await scanClan(root);const unit=clan.entries.find(e=>e.id==='Unit')!;
  const fields=JSON.parse(await fs.readFile('config/fields.json','utf8'));const rule=fields.characters.find((r:any)=>r.path==='starting_status_effects');
  const preset=rule.statusPresets.find((p:any)=>p.status.id==='@pierce');assert.deepEqual(preset.status,pierce);
  const original=unit.data.starting_status_effects as any[];
  const states=[...original,{status:preset.status,count:1}];
  await saveEdit({root,section:'characters',id:unit.id,file:unit.file,field:'starting_status_effects',value:states,expectedHash:unit.hash});
  const data=(await scanClan(root)).entries.find(e=>e.id==='Unit')!.data;
  assert.deepEqual(data.starting_status_effects,states);assert.equal(data.health,20);assert.deepEqual(original,[{status:'armor',count:3,keep:7}]);
  assert.deepEqual(replaceStatus({status:'armor',count:2,keep:9},pierce),{status:pierce,count:2,keep:9});
  const choices=statusChoices(['armor'],[preset],clan);assert.deepEqual(choices.at(-1)?.status,pierce);
  const html=renderToStaticMarkup(React.createElement(StatusParameter,{value:JSON.stringify(states),onChange:()=>{},options:['armor'],presets:[preset],clan}));
  assert.ok(html.includes('Conductor · Pierce'));assert.ok(html.includes('&quot;mod_reference&quot;:&quot;Conductor&quot;'));assert.ok(html.includes('value="&quot;armor&quot;"'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
