import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as jsonc from 'jsonc-parser';
import {poolCountModel,preparePoolCount,savePoolCount} from '../src/server/pool-count.ts';
import {poolModel} from '../src/server/pool-editor.ts';

async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-pool-count-'));await fs.mkdir(path.join(root,'json'));
 const file=path.join(root,'json/test.json');
 const original='\uFEFF// keep\r\n'+JSON.stringify({cards:[{id:'Card',pools:[{id:'@Weighted',tag:7}]}],card_pools:[{id:'Weighted',cards:[{item:{id:'@Card',keep:5},count:3,unknown:42},'@Card',{item:{id:'@Card',mod_reference:'Other'},count:99}]}]},null,2).replaceAll('\n','\r\n');
 await fs.writeFile(file,original);await fs.writeFile(path.join(root,'json/other.json'),'// neighbour\n{"classes":[{"id":"Class"}]}');
 return {root,file,original};
}
async function request(root:string,entry:string,count:number){
 const model=await poolCountModel(root,'@Weighted','Card');const selected=model.entries.find(e=>e.key===entry)!;
 return {root,pool:'@Weighted',id:'Card',entry,count,expectedHash:selected.hash};
}
test('cantidad de una referencia simple crea item/count, conserva metadatos, duplicados y externos y actualiza el total',async()=>{
 const {root,file,original}=await fixture();try{
  const before=await poolCountModel(root,'@Weighted','Card');assert.equal(before.total,5);assert.deepEqual(before.entries.map(e=>e.key),['card:0','pool:0','pool:1']);
  const input=await request(root,'card:0',6);const review=await preparePoolCount(input);assert.equal(review.totalAfter,10);await savePoolCount({...input,expectedToken:review.token});
  const data=jsonc.parse(await fs.readFile(file,'utf8'));assert.deepEqual(data.cards[0].pools,[{item:{id:'@Weighted',tag:7},count:6}]);
  assert.deepEqual(data.card_pools,jsonc.parse(original).card_pools);assert.equal((await poolModel(root)).cards[0].poolCounts['@Weighted'],10);
  assert.equal(await fs.readFile(path.join(root,'json/other.json'),'utf8'),'// neighbour\n{"classes":[{"id":"Class"}]}');
  assert.ok((await fs.readFile(file,'utf8')).startsWith('\uFEFF// keep\r\n'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('modificar una entrada ponderada solo cambia count y seleccionar el valor actual no escribe',async()=>{
 const {root,file,original}=await fixture();try{
  const same=await request(root,'pool:0',3);const unchanged=await preparePoolCount(same);assert.equal(unchanged.changed,false);await savePoolCount({...same,expectedToken:unchanged.token});assert.equal(await fs.readFile(file,'utf8'),original);
  const input=await request(root,'pool:0',8);const review=await preparePoolCount(input);await savePoolCount({...input,expectedToken:review.token});
  assert.equal(await fs.readFile(file,'utf8'),original.replace('"count": 3','"count": 8'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('rechaza entradas externas, cantidades inválidas, revisiones cambiadas y tokens de otro clan idéntico',async()=>{
 const first=await fixture();const second=await fixture();try{
  const input=await request(first.root,'pool:0',5);
  for(const count of [0,-1,1.5,2147483648,'4',NaN])await assert.rejects(()=>preparePoolCount({...input,count:count as number}),/entero/);
  await assert.rejects(()=>preparePoolCount({...input,entry:'pool:2'}),/entrada local/);
  const review=await preparePoolCount(input);
  await assert.rejects(()=>savePoolCount({...input,count:6,expectedToken:review.token}),/caducado/);
  await assert.rejects(()=>savePoolCount({...input,root:second.root,expectedToken:review.token}),/caducado/);
  await fs.appendFile(path.join(first.root,'json/other.json'),'\n');
  await assert.rejects(()=>savePoolCount({...input,expectedToken:review.token}),/caducado/);
  assert.equal(await fs.readFile(first.file,'utf8'),first.original);
 }finally{await fs.rm(first.root,{recursive:true,force:true});await fs.rm(second.root,{recursive:true,force:true});}
});
test('si falla el reemplazo, conserva el original y retira el temporal',async t=>{
 const {root,file,original}=await fixture();try{
  const input=await request(root,'pool:0',5);const review=await preparePoolCount(input);
  const actualFile=await fs.realpath(file);
  const rename=fs.rename;t.mock.method(fs,'rename',async(from,to)=>{if(String(to)===actualFile && String(from).startsWith(actualFile+'.clan-editor-'))throw Error('simulated write failure');return rename(from,to);});
  await assert.rejects(()=>savePoolCount({...input,expectedToken:review.token}),/simulated write failure/);
  assert.equal(await fs.readFile(file,'utf8'),original);assert.deepEqual((await fs.readdir(path.dirname(file))).sort(),['other.json','test.json']);
 }finally{t.mock.restoreAll();await fs.rm(root,{recursive:true,force:true});}
});
