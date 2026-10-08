import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {scanClan} from '../src/server/scan.ts';
import {prepareVisualAssignment,saveVisualAssignment,visualCatalog} from '../src/server/visual-assignments.ts';
import {prepareReference,saveReference,referenceModel} from '../src/server/reference-editor.ts';
import {prepareContent,saveContent,contentTemplates} from '../src/server/content.ts';
import {prepareEdit,saveEdit} from '../src/server/edit.ts';
import {prepareChampionTree,saveChampionTree} from '../src/server/champion-tree.ts';
import {prepareArt,saveArt} from '../src/server/art.ts';
import {bundleInventory} from '../src/server/resource-review.ts';
import {mechanicsSupport} from '../src/server/mechanics-support.ts';
import {prepareContentAction,saveContentAction} from '../src/server/content-actions.ts';
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-extended-'));
 await fs.mkdir(path.join(root,'json'));await fs.mkdir(path.join(root,'textures'));await fs.mkdir(path.join(root,'src'));
 const image=await sharp({create:{width:80,height:100,channels:4,background:'#ff00aa'}}).png().toBuffer();await fs.writeFile(path.join(root,'textures/test.png'),image);
 const document={classes:[{id:'Class',card_style:'@Style',champions:[{id:'Hero',icon:{id:'@Sprite',keep:42},upgrade_tree:[['@Upgrade']]},{id:'OtherHero',icon:'@Sprite',upgrade_tree:[['@Upgrade']]}],class_select_character_displays:['@CharacterArt']}],class_card_styles:[{id:'Style',unit_card_frame_sprite:'@Sprite'}],sprites:[{id:'Sprite',path:'textures/test.png'},{id:'OtherSprite',path:'textures/test.png'}],atlas_icons:[{id:'Sprite',path:'textures/test.png'}],game_objects:[{id:'Banner',type:'map_node_icon',extensions:{map_node_icon:{enabled_sprite:'@Sprite'}}},{id:'CharacterArt',type:'character_art',extensions:{character_art:{sprite:'@Sprite'}}}],rewards:[{id:'Reward',type:'draft',extensions:[{draft:{draft_pool:'@Pool'}}]},{id:'OtherReward',type:'card_pool',extensions:[{card_pool:{card_pool:'@Pool'}}]}],map_nodes:[{id:'Node',type:'reward',prefab:'@Banner',pools:['RandomChosenMainClassUnit'],extensions:[{reward:{rewards:[{id:'@Reward',keep:7}],custom:9}},{unrelated:{keep:42}}]}],events:[{id:'Event',possible_rewards:['@Reward'],story_data:'story.ink.json'}],cards:[{id:'Card',effects:['@Effect',{id:'@External',mod_reference:'Other'}],unknown:true}],effects:[{id:'Effect',name:'CardEffectDamage',param_int:2},{id:'StatusEffect',name:'CardEffectAddStatusEffect',param_status_effects:[{status:'armor',count:2,custom:42}]},{id:'Custom',name:'@MyCustomEffect',param_int:42}],upgrades:[{id:'Upgrade',bonus_damage:2}],card_pools:[{id:'Pool',cards:[]}],asset_bundles:[{id:'Bundle',paths:{windows:'test.bundle',linux:'missing.bundle'}}]};
 const original='\uFEFF{\n// KEEP\n'+JSON.stringify(document,null,2).slice(1);
 await fs.writeFile(path.join(root,'json/clan.json'),original);await fs.writeFile(path.join(root,'test.bundle'),'bundle bytes');await fs.writeFile(path.join(root,'src/Custom.cs'),'public class MyCustomEffect : CardEffectBase {}');
 return {root,document,original,image};
}
async function entry(root:string,id:string,section?:string){return (await scanClan(root)).entries.find(e=>e.id===id&&(!section||e.section===section))!;}
test('champion slots are bounded; selecting art only changes the chosen champion and preserves metadata',async()=>{
 const {root,document,original}=await fixture();try{
  const owner=await entry(root,'Class');const request={root,section:'classes',id:owner.id,file:owner.file,expectedHash:owner.hash,field:'champions.0.icon',targetId:'OtherSprite'};
  const catalog=await visualCatalog(await scanClan(root),'classes',owner);assert.ok(catalog.some(s=>s.path==='champions.1.portrait'));assert.ok(!catalog.some(s=>s.path==='champions.2.icon'));
  await assert.rejects(()=>prepareVisualAssignment({...request,field:'champions.99.icon'}),/no permitida/);
  await saveVisualAssignment(request);const result=(await entry(root,'Class')).data;const expected=structuredClone(document.classes[0]);expected.champions[0].icon={id:'@OtherSprite',keep:42};assert.deepEqual(result,expected);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('reference lists preserve external entries and node fields, reject stale preview and wrong target types',async()=>{
 const {root,document,original}=await fixture();try{
  let owner=await entry(root,'Node');const field='extensions.0.reward.rewards';const request={root,section:'map_nodes',id:owner.id,file:owner.file,expectedHash:owner.hash,field,operation:'append' as const,targetId:'OtherReward'};
  const model=await referenceModel(await scanClan(root),'map_nodes',owner.id,owner.file);assert.ok(!model.some(s=>s.field==='extensions.1.reward.rewards'));
  await assert.rejects(()=>prepareReference({...request,targetId:'Sprite'}),/compatible/);
  await assert.rejects(()=>prepareReference({...request,external:{id:'@Sprite'}}),/selector local/);
  await assert.rejects(()=>prepareReference({...request,external:{id:'Reward',mod_reference:'   '}}),/inválida/);
  assert.deepEqual((await prepareReference({...request,external:{id:'@ForeignReward',mod_reference:'OtherMod'}})).after,[{id:'@Reward',keep:7},{id:'@ForeignReward',mod_reference:'OtherMod'}]);
  assert.deepEqual((await prepareReference({...request,external:{id:'BaseGameReward'}})).after,[{id:'@Reward',keep:7},'BaseGameReward']);
  const preview=await prepareReference(request);assert.equal(await fs.readFile(path.join(root,owner.file),'utf8'),original);
  await saveReference({...request,expectedToken:preview.token});owner=await entry(root,'Node');assert.deepEqual(owner.data.pools,document.map_nodes[0].pools);assert.deepEqual((owner.data.extensions as any[])[0].reward.rewards,[{id:'@Reward',keep:7},'@OtherReward']);assert.deepEqual((owner.data.extensions as any[])[1],document.map_nodes[0].extensions[1]);
  await assert.rejects(()=>saveReference({...request,expectedToken:preview.token}),/cambió/);
  const card=await entry(root,'Card');const removal={root,section:'cards',id:card.id,file:card.file,expectedHash:card.hash,field:'effects',operation:'remove' as const,index:0};const p=await prepareReference(removal);await saveReference({...removal,expectedToken:p.token});assert.deepEqual((await entry(root,'Card')).data.effects,[{id:'@External',mod_reference:'Other'}]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('creates connected map nodes and standard effects from configured templates without changing source',async()=>{
 const {root,original}=await fixture();try{
  const request={root,section:'map_nodes' as const,id:'NewNode',name:'New node',kind:'reward',links:{prefab:'Banner','extensions.0.reward.rewards':'Reward'}};
  const preview=await prepareContent(request);await saveContent({...request,expectedToken:preview.token});const node=await entry(root,'NewNode');assert.equal(node.data.prefab,'@Banner');assert.deepEqual((node.data.extensions as any[])[0].reward.rewards,['@Reward']);
  const effect={root,section:'effects' as const,id:'NewEffect',name:'',kind:'CardEffectDamage'};const p=await prepareContent(effect);await saveContent({...effect,expectedToken:p.token});assert.equal((await entry(root,'NewEffect')).data.name,'CardEffectDamage');assert.equal(await fs.readFile(path.join(root,'json/clan.json'),'utf8'),original);
  assert.ok((await contentTemplates(root,'effects')).types.some(t=>t.id==='CardEffectAddStatusEffect'));
  await assert.rejects(()=>prepareContent({...request,id:'BadNode',links:{prefab:'CharacterArt','extensions.0.reward.rewards':'Reward'}}),/única/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('repairs trees and removes references without changing another champion or deleting upgrades',async()=>{
 const {root}=await fixture();try{
  const owner=await entry(root,'Class');const request={root,file:owner.file,classId:owner.id,championIndex:0,expectedHash:owner.hash,changes:[],structure:{operation:'add-path' as const,path:1,upgradeId:'Upgrade'}};
  await saveChampionTree(request);const updated=await entry(root,'Class');assert.deepEqual((updated.data.champions as any[])[0].upgrade_tree,[['@Upgrade'],['@Upgrade','@Upgrade','@Upgrade']]);assert.deepEqual((updated.data.champions as any[])[1].upgrade_tree,[['@Upgrade']]);
  const remove={...request,expectedHash:updated.hash,structure:{operation:'remove-path' as const,path:0}};await saveChampionTree(remove);assert.deepEqual(((await entry(root,'Class')).data.champions as any[])[0].upgrade_tree,[['@Upgrade','@Upgrade','@Upgrade']]);assert.ok(await entry(root,'Upgrade'));
  const refreshed=await entry(root,'Class');await assert.rejects(()=>prepareChampionTree({...request,expectedHash:refreshed.hash,structure:{operation:'add-level',path:0,upgradeId:'Upgrade'}}),/máximo/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('parameter adapters reject incompatible classes and preserve status entry metadata',async()=>{
 const {root}=await fixture();try{
  const status=await entry(root,'StatusEffect');const request={root,section:'effects',id:status.id,file:status.file,expectedHash:status.hash,field:'param_status_effects',value:[{status:'armor',count:4,custom:42}]};await saveEdit(request);assert.deepEqual((await entry(root,'StatusEffect')).data.param_status_effects,request.value);
  const custom=await entry(root,'Custom');await assert.rejects(()=>prepareEdit({...request,id:custom.id,expectedHash:custom.hash,field:'param_int',value:3}),/edición guiada/);
  const refreshed=await entry(root,'StatusEffect');await assert.rejects(()=>prepareEdit({...request,expectedHash:refreshed.hash,value:[{status:'armor',count:1.5}]}),/entera/);
  for(const status of ['', '   ', {}, [], {id:''}, {id:'armor',mod_reference:42}])await assert.rejects(()=>prepareEdit({...request,expectedHash:refreshed.hash,value:[{status,count:1}]}),/referencia/);
  assert.deepEqual((await prepareEdit({...request,expectedHash:refreshed.hash,value:[{status:{id:'@ForeignStatus',mod_reference:'OtherMod',custom:7},count:2,custom:42}]})).after,[{status:{id:'@ForeignStatus',mod_reference:'OtherMod',custom:7},count:2,custom:42}]);
  const support=await mechanicsSupport(await scanClan(root));assert.equal(support.rows.find(r=>r.id==='Custom')?.status,'custom');assert.deepEqual(support.rows.find(r=>r.id==='Custom')?.sourceFiles,['src/Custom.cs']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('atlas replacement disambiguates sections and bundle inventory distinguishes platform files',async()=>{
 const {root,image}=await fixture();try{
  const replacement=await sharp({create:{width:40,height:40,channels:4,background:'#00ffff'}}).png().toBuffer();const owner=await entry(root,'Sprite','atlas_icons');const request={root,section:'atlas_icons',spriteId:owner.id,file:owner.file,expectedDefinitionHash:owner.hash,expectedHash:createHash('sha256').update(image).digest('hex'),imageBase64:replacement.toString('base64'),mode:'match-existing' as const};const p=await prepareArt(request);assert.equal(p.newWidth,80);await saveArt(request);
  const model=await bundleInventory(await scanClan(root));assert.equal(model.bundles.find(b=>b.platform==='Windows')?.status,'present');assert.equal(model.bundles.find(b=>b.platform==='Linux')?.status,'missing');assert.equal(model.bundles.find(b=>b.platform==='macOS')?.status,'undeclared');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('static resize preserves world dimensions, skips animated quads and rolls back JSON on image failure',async()=>{
 const {root,image,original}=await fixture();const rename=fs.rename;
 try{
  const document=JSON.parse(original.replace(/^\uFEFF/,'').replace('// KEEP',''));
  document.game_objects[1].extensions.character_art.transform={scale:{x:2,y:3,z:4},position:{y:1.2},unknown:9};
  document.game_objects.push({id:'Animated',type:'character_art',extensions:{character_art:{sprite:'@Sprite',animations:[{animation:'idle',frames:['@Sprite']}],transform:{scale:{x:2,y:3}}}}});
  const source=JSON.stringify(document);await fs.writeFile(path.join(root,'json/clan.json'),source);
  const replacement=await sharp({create:{width:40,height:50,channels:4,background:'#00ffff'}}).png().toBuffer();
  const request={root,section:'sprites',spriteId:'Sprite',file:'json/clan.json',expectedHash:createHash('sha256').update(image).digest('hex'),imageBase64:replacement.toString('base64'),mode:'preserve' as const,compensateCharacterScale:true};
  const preview=await prepareArt(request);assert.deepEqual(preview.compensation.changes.map(x=>x.after),[{x:4,y:6}]);assert.ok(preview.compensation.warnings.some(x=>x.includes('Animated')));
  fs.rename=async(from,to)=>{if(String(to).endsWith('test.png'))throw new Error('Simulated image write failure');return rename(from,to);};
  await assert.rejects(()=>saveArt({...request,expectedToken:preview.token}),/Simulated/);fs.rename=rename;
  assert.equal(await fs.readFile(path.join(root,'json/clan.json'),'utf8'),source);assert.deepEqual(await fs.readFile(path.join(root,'textures/test.png')),image);
  await saveArt({...request,expectedToken:preview.token});const staticArt=await entry(root,'CharacterArt');assert.deepEqual((staticArt.data.extensions as any).character_art.transform,{scale:{x:4,y:6,z:4},position:{y:1.2},unknown:9});assert.deepEqual((await entry(root,'Animated')).data,document.game_objects[2]);
  assert.equal(40*4,80*2);assert.equal(50*6,100*3);
 }finally{fs.rename=rename;await fs.rm(root,{recursive:true,force:true});}
});

test('batch edits roll back across files; deleting a referenced definition is blocked',async()=>{
 const {root,original}=await fixture();const rename=fs.rename;
 try{
  const second='{"cards":[{"id":"CardB","cost":1,"unknown":42}]}';await fs.writeFile(path.join(root,'json/second.json'),second);
  const cards=(await scanClan(root)).entries.filter(e=>e.section==='cards');const request={root,operation:'batch' as const,section:'cards',targets:cards.map(e=>({id:e.id,file:e.file,expectedHash:e.hash})),field:'cost',value:3};const p=await prepareContentAction(request);
  fs.rename=async(from,to)=>{if(String(to).endsWith('second.json'))throw new Error('Simulated batch failure');return rename(from,to);};await assert.rejects(()=>saveContentAction({...request,expectedToken:p.token}),/Simulated/);fs.rename=rename;
  assert.equal(await fs.readFile(path.join(root,'json/clan.json'),'utf8'),original);assert.equal(await fs.readFile(path.join(root,'json/second.json'),'utf8'),second);
  await saveContentAction({...request,expectedToken:p.token});assert.equal((await entry(root,'CardB')).data.cost,3);assert.equal((await entry(root,'CardB')).data.unknown,42);assert.ok((await fs.readFile(path.join(root,'json/clan.json'),'utf8')).includes('// KEEP'));
  const effect=await entry(root,'Effect');await assert.rejects(()=>prepareContentAction({root,operation:'delete',section:effect.section,targets:[{id:effect.id,file:effect.file,expectedHash:effect.hash}]}),/Card/);
  const b=await entry(root,'CardB');const remove={root,operation:'delete' as const,section:b.section,targets:[{id:b.id,file:b.file,expectedHash:b.hash}]};const deletion=await prepareContentAction(remove);await saveContentAction({...remove,expectedToken:deletion.token});assert.equal(await entry(root,'CardB'),undefined);assert.ok(await entry(root,'Card'));
 }finally{fs.rename=rename;await fs.rm(root,{recursive:true,force:true});}
});
