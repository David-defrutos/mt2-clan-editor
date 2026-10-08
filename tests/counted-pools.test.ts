import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {poolReferenceRules, poolReference} from '../src/server/pool-references.ts';
import {poolModel, preparePoolChanges, savePoolChanges} from '../src/server/pool-editor.ts';
import {poolAssignmentModel} from '../src/server/pool-assignment.ts';
import {scanClan} from '../src/server/scan.ts';
import {summarizeClan, statsDetails} from '../src/server/stats.ts';
import {prepareContent, saveContent} from '../src/server/content.ts';
import {validateClan} from '../src/server/validate.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-counted-pools-'));
  await fs.mkdir(path.join(root, 'json'));
  const external = {item:{id:'@B',mod_reference:'Other',keep:7},count:9,custom:42};
  const document = {
    classes:[{id:'Test'}],
    cards:[
      {id:'A',rarity:'common',pools:[{item:'MegaPool',count:3},{item:{id:'StarterCardsOnly'},count:2}]},
      {id:'B',rarity:'uncommon',pools:[{item:{id:'@Weighted',keep:8},count:2,custom:6},{item:'UnitsAllBanner',count:5}]},
      {id:'C',pools:[{item:{id:'MegaPool',mod_reference:'Other'},count:8}]}
    ],
    card_pools:[{id:'Weighted',cards:[{item:{id:'@B',keep:3},count:4,custom:2},'@B',external]}],
    effects:[{id:'Draw',name:'CardEffectAddBattleCard',param_card_pool:'@Weighted'}]
  };
  const file = path.join(root, 'json/clan.json');
  const original = '\uFEFF// keep comment\r\n' + JSON.stringify(document,null,2).replaceAll('\n','\r\n');
  await fs.writeFile(file,original);
  return {root,file,original,external};
}

test('pools con cantidades: pertenencia, multiplicidad y estadísticas cuentan cartas distintas, excluyendo externos',async()=>{
  const {root} = await fixture();
  try {
    const model = await poolModel(root);
    assert.deepEqual(model.cards.find(c=>c.id==='A')?.pools,['MegaPool','StarterCardsOnly']);
    assert.equal(model.cards.find(c=>c.id==='B')?.poolCounts['@Weighted'],7);
    assert.deepEqual(model.cards.find(c=>c.id==='C')?.pools,[]);
    assert.ok(model.pools.some(p=>p.id==='CardsThatResolveSimultaneouslyOnUnplayed' && p.editable));
    const clan = await scanClan(root); const stats = await summarizeClan(clan);
    assert.equal(stats.draft,2); assert.equal(stats.starter,1); assert.equal(stats.banner,1);
    for (const metric of ['draft','starter','banner','rarity.common','rarity.uncommon']) {
      const detail = await statsDetails(clan,metric); assert.equal(detail.items.length,detail.value);
    }
    const effect = clan.entries.find(e=>e.id==='Draw')!;
    const assignment = await poolAssignmentModel(root,'effects',effect.file,effect.id);
    assert.equal(assignment.candidates.find(p=>p.id==='@Weighted')?.count,1);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('selección idéntica no escribe ni duplica; retirada elimina ambas fuentes locales y conserva externos, BOM y comentarios',async()=>{
  const {root,file,original,external} = await fixture();
  try {
    const card = (await poolModel(root)).cards.find(c=>c.id==='B')!;
    const input = {root,pool:'@Weighted',changes:[{id:card.id,file:card.file,expectedHash:card.hash,member:true}]};
    const same = await preparePoolChanges(input); assert.equal(same.files.length,0); assert.equal(same.changes.length,0);
    assert.equal((await savePoolChanges({...input,expectedToken:same.token})).changed,false);
    assert.equal(await fs.readFile(file,'utf8'),original);
    const remove = {...input,changes:[{...input.changes[0],member:false}]};
    const review = await preparePoolChanges(remove); await savePoolChanges({...remove,expectedToken:review.token});
    const text = await fs.readFile(file,'utf8'); assert.ok(text.startsWith('\uFEFF// keep comment\r\n'));
    const model = await poolModel(root);
    assert.deepEqual(model.pools.find(p=>p.id==='@Weighted')?.directCards,[external]);
    assert.deepEqual(model.cards.find(c=>c.id==='B')?.pools,['UnitsAllBanner']);
    const current = model.cards.find(c=>c.id==='B')!;
    const add = {...input,changes:[{...input.changes[0],expectedHash:current.hash}]};
    const next = await preparePoolChanges(add); await savePoolChanges({...add,expectedToken:next.token});
    assert.equal((await poolModel(root)).cards.find(c=>c.id==='B')?.poolCounts['@Weighted'],1);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('copia cantidades declaradas en ambas fuentes conservando objetos, metadatos y archivos originales',async()=>{
  const {root,file,original,external} = await fixture();
  try {
    const input = {root,section:'card_pools' as const,id:'WeightedCopy',name:'',source:{id:'Weighted',file:'json/clan.json'}};
    const review = await prepareContent(input);
    const copied = (review.document.card_pools as any[])[0].cards;
    assert.deepEqual(copied,[{item:{id:'@B',keep:3},count:4,custom:2},'@B',external,{item:{id:'@B',keep:8},count:2,custom:6}]);
    await saveContent({...input,expectedToken:review.token});
    assert.equal(await fs.readFile(file,'utf8'),original);
    assert.equal((await poolModel(root)).cards.find(c=>c.id==='B')?.poolCounts['@WeightedCopy'],7);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('cantidades inválidas se señalan y bloquean edición/copia, sin aceptar item/count fuera de las listas de pool',async()=>{
  const rules = await poolReferenceRules();
  assert.deepEqual(poolReference({item:{id:'@B',mod_reference:'Other'},count:3},rules),{id:'@B',modReference:'Other',count:3});
  for(const count of [0,-1,1.5,'3',Number.MAX_SAFE_INTEGER+1])assert.equal(poolReference({item:'@B',count},rules),undefined);
  const {root,file} = await fixture();
  try {
    await fs.writeFile(file,JSON.stringify({classes:[{id:'Test'}],cards:[{id:'A',pools:[{item:'MegaPool',count:0}]}],card_pools:[{id:'Weighted',cards:[{item:'@A',count:1.5}]}],effects:[{id:'Effect',param_int:2}]}));
    const model = await poolModel(root); assert.equal(model.cards[0].editable,false); assert.equal(model.pools.find(p=>p.id==='@Weighted')?.editable,false);
    const issues = await validateClan(await scanClan(root)); assert.equal(issues.filter(i=>i.code==='pool-count').length,2);
    await assert.rejects(()=>prepareContent({root,section:'card_pools',id:'NewPool',name:'',source:{id:'Weighted',file:'json/clan.json'}}),/cantidades inválidas/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
