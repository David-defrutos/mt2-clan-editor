import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanClan} from '../src/server/scan.ts';
import {prepareEdit,saveEdit} from '../src/server/edit.ts';
import {validateClan} from '../src/server/validate.ts';
import {mechanicsSupport} from '../src/server/mechanics-support.ts';
import {prepareContent} from '../src/server/content.ts';

test('nodos C# preservan referencias externas, código y parámetros; validación no los confunde con objetos JSON',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-custom-node-'));
 try {
  await fs.mkdir(path.join(root,'json'));await fs.mkdir(path.join(root,'src'));
  await fs.writeFile(path.join(root,'src/Node.cs'),'class MyMapNode : MapNodeData {}');
  await fs.writeFile(path.join(root,'json/test.json'),JSON.stringify({map_nodes:[{id:'Node',type:'custom_class',custom_class:'@MyMapNode',parameters:{keep:3}},{id:'Missing',type:'custom_class'},{id:'Broken',type:'custom_class',custom_class:{id:'@Bad.Name',mod_reference:'Other'}}]}));
  let clan=await scanClan(root);const node=clan.entries.find(e=>e.id==='Node')!;
  const input={root,section:'map_nodes',id:node.id,file:node.file,expectedHash:node.hash,field:'custom_class',value:{id:'@ExternalNode',mod_reference:'Other',keep:4}};
  await saveEdit(input);clan=await scanClan(root);
  assert.deepEqual(clan.entries.find(e=>e.id==='Node')!.data.parameters,{keep:3});
  assert.deepEqual(clan.entries.find(e=>e.id==='Node')!.data.custom_class,input.value);
  const issues=await validateClan(clan);
  assert.deepEqual(issues.filter(i=>i.code==='custom-class-reference').map(i=>i.id),['Missing','Broken']);
  assert.ok(!issues.some(i=>i.code==='local-reference'&&i.id==='Node'));
  for(const value of ['',{},[],{id:'@Node',mod_reference:''},'@Bad.Name']) await assert.rejects(()=>prepareEdit({...input,value,expectedHash:clan.entries.find(e=>e.id==='Node')!.hash}),/clase/);
  const local=clan.entries.find(e=>e.id==='Node')!;
  await saveEdit({...input,value:'@MyMapNode',expectedHash:local.hash});
  const support=await mechanicsSupport(await scanClan(root));assert.deepEqual(support.rows.find(r=>r.id==='Node')!.sourceFiles,['src/Node.cs']);
  assert.equal(await fs.readFile(path.join(root,'src/Node.cs'),'utf8'),'class MyMapNode : MapNodeData {}');
  const created=await prepareContent({root,section:'map_nodes',id:'Created',name:'Custom',kind:'custom_class'});
  assert.equal((created.document.map_nodes as any[])[0].type,'custom_class');assert.ok(created.warnings.some(w=>w.includes('MapNodeData')));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
