import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {copyExampleFiles,validateExample} from '../src/server/examples.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
test('copia ejemplos con hashes, arte y atribución; excluye DLL, dependencias y credenciales',async()=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-examples-'));
 try{
  const source=path.join(parent,'source');const output=path.join(parent,'output');await fs.mkdir(source);await fs.mkdir(output);
  const rules=JSON.parse(await fs.readFile('config/distribution-files.json','utf8'));
  for(const [file,content]of [['json/clan.json','{"classes":[{"id":"Example"}]}'],['textures/unit.png','art'],['src/Plugin.cs','class Plugin {}'],['LICENSE','author licence'],['bin/Old.dll','compiled'],['.env','secret'],['node_modules/file.json','dependency']]){await fs.mkdir(path.dirname(path.join(source,file)),{recursive:true});await fs.writeFile(path.join(source,file),content);}
  const files=await copyExampleFiles(source,output,rules);assert.deepEqual(files.map(f=>f.file).sort(),['LICENSE','json/clan.json','src/Plugin.cs','textures/unit.png']);assert.ok(files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));
  await fs.writeFile(path.join(output,'json/clan.json'),'edited');assert.equal(await fs.readFile(path.join(source,'json/clan.json'),'utf8'),'{"classes":[{"id":"Example"}]}');
  await fs.writeFile(path.join(source,'nuget.config'),'<configuration><packageSourceCredentials><Token>secret</Token></packageSourceCredentials></configuration>');
  await assert.rejects(()=>copyExampleFiles(source,path.join(parent,'blocked'),rules),/credenciales/);
 }finally{await fs.rm(parent,{recursive:true,force:true});}
});
test('distribución requiere dos clanes reales y copia ejemplos editables sin incluir datos personales del editor',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-release-'));
 try{
  await fs.mkdir(path.join(root,'config'));await fs.mkdir(path.join(root,'data'));
  await fs.copyFile('config/distribution-files.json',path.join(root,'config/distribution-files.json'));
  const files=JSON.parse(await fs.readFile(path.join(root,'config/distribution-files.json'),'utf8'));files.editorFiles=['config'];await fs.writeFile(path.join(root,'config/distribution-files.json'),JSON.stringify(files));
  const config={examples:{minimumCount:2,directory:'examples',clans:[{id:'first',label:'First'},{id:'second',label:'Second'}]}};await fs.writeFile(path.join(root,'config/distribution.json'),JSON.stringify(config));
  const sources:Record<string,string>={};for(const id of ['first','second']){const source=path.join(root,id);sources[id]=source;await fs.mkdir(path.join(source,'json'),{recursive:true});await fs.writeFile(path.join(source,'json/clan.json'),JSON.stringify({classes:[{id}]}));await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify({version_number:'1.0.0'}));}
  await fs.writeFile(path.join(root,'data/distribution-sources.json'),JSON.stringify(sources));
  const result=await run(process.execPath,['scripts/build-distribution.mjs'],{cwd:path.resolve('.'),env:{...process.env,CLAN_EDITOR_HOME:root},windowsHide:true});const output=JSON.parse(result.stdout).output;
  assert.equal(JSON.parse(await fs.readFile(path.join(output,'examples/index.json'),'utf8')).length,2);assert.ok((await fs.readFile(path.join(output,'start-editor.sh'),'utf8')).includes('npm ci --omit=dev'));assert.ok(!(await fs.stat(path.join(output,'data')).catch(()=>null)));
  await fs.writeFile(path.join(sources.second,'json/clan.json'),'{"effects":[{"id":"LibraryOnly"}]}');await assert.rejects(()=>run(process.execPath,['scripts/build-distribution.mjs'],{cwd:path.resolve('.'),env:{...process.env,CLAN_EDITOR_HOME:root},windowsHide:true}),/no contiene una clase/);
  config.examples.clans[1]={...config.examples.clans[1],kind:'source'} as typeof config.examples.clans[1];await fs.writeFile(path.join(root,'config/distribution.json'),JSON.stringify(config));await fs.writeFile(path.join(sources.second,'Plugin.cs'),'class Plugin {}');await fs.writeFile(path.join(sources.second,'Plugin.csproj'),'<Project />');const sourceResult=await run(process.execPath,['scripts/build-distribution.mjs'],{cwd:path.resolve('.'),env:{...process.env,CLAN_EDITOR_HOME:root},windowsHide:true});const sourceIndex=JSON.parse(await fs.readFile(path.join(JSON.parse(sourceResult.stdout).output,'examples/index.json'),'utf8'));assert.equal(sourceIndex[1].kind,'source');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('FullClan se admite explícitamente como código C# sin inventar una clase de clan',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-source-example-'));
 try{await fs.writeFile(path.join(root,'Plugin.cs'),'class Plugin {}');await fs.writeFile(path.join(root,'Plugin.csproj'),'<Project />');await validateExample(root,'source');await assert.rejects(()=>validateExample(root,'clan'));await fs.unlink(path.join(root,'Plugin.csproj'));await assert.rejects(()=>validateExample(root,'source'),/fuentes C#/);}finally{await fs.rm(root,{recursive:true,force:true});}
});
