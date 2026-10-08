import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyExampleFiles,validateExample} from '../dist-server/examples.js';
const root=process.env.CLAN_EDITOR_HOME?path.resolve(process.env.CLAN_EDITOR_HOME):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function within(parent,target){const relative=path.relative(parent,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
const rules=JSON.parse(await fs.readFile(path.join(root,'config/distribution-files.json'),'utf8'));
const config=JSON.parse(await fs.readFile(path.join(root,'config/distribution.json'),'utf8'));
const sources=JSON.parse(await fs.readFile(path.join(root,'data/distribution-sources.json'),'utf8'));
const preview=process.argv.includes('--preview');const missing=[];
const examples=[];
for(const example of config.examples.clans){if(!/^[a-z0-9-]+$/.test(example.id))throw new Error('ID de ejemplo inválido.');const source=sources[example.id];if(typeof source!=='string'||!path.isAbsolute(source)){if(preview){missing.push(example.id);continue;}throw new Error(`Configura la fuente de ${example.label} en data/distribution-sources.json.`);}await validateExample(source,example.kind);examples.push({...example,source});}
if(!preview&&examples.length<config.examples.minimumCount)throw new Error('Faltan ejemplos obligatorios.');
const parent=path.resolve(root,'data',rules.releaseDirectory);if(!parent.startsWith(path.join(root,'data')+path.sep))throw new Error('Salida fuera de data/.');await fs.mkdir(parent,{recursive:true});const output=await fs.mkdtemp(path.join(parent,'clan-editor-'));
try{
 for(const file of rules.editorFiles){if(!within(root,path.resolve(root,file))||!within(output,path.resolve(output,file)))throw new Error('Archivo de distribución fuera de su carpeta.');await fs.mkdir(path.dirname(path.join(output,file)),{recursive:true});await fs.cp(path.join(root,file),path.join(output,file),{recursive:true,errorOnExist:true,force:false});}
 for(const file of rules.runtimeAssets??[]){if(!within(root,path.resolve(root,file))||!within(output,path.resolve(output,file)))throw new Error('Recurso de distribución fuera de su carpeta.');if(await fs.stat(path.join(root,file)).catch(()=>null)){await fs.mkdir(path.dirname(path.join(output,file)),{recursive:true});await fs.copyFile(path.join(root,file),path.join(output,file));}}
 const discovery=path.join(output,'config/library-discovery.json');if(await fs.stat(discovery).catch(()=>null)){const settings=JSON.parse(await fs.readFile(discovery,'utf8'));settings.roots=[];await fs.writeFile(discovery,JSON.stringify(settings,null,2)+'\n');}
 const runtimePackage=path.join(output,'package.json');if(await fs.stat(runtimePackage).catch(()=>null)){const metadata=JSON.parse(await fs.readFile(runtimePackage,'utf8'));metadata.scripts={start:'node dist-server/index.js'};await fs.writeFile(runtimePackage,JSON.stringify(metadata,null,2)+'\n');}
 const index=[];
 if(!within(output,path.resolve(output,config.examples.directory)))throw new Error('Carpeta de ejemplos fuera de la distribución.');
 for(const example of examples){const destination=path.join(output,config.examples.directory,example.id);await fs.mkdir(destination,{recursive:true});const files=await copyExampleFiles(example.source,destination,rules);let version='';try{version=JSON.parse((await fs.readFile(path.join(example.source,'manifest.json'),'utf8')).replace(/^\uFEFF/,'')).version_number??'';}catch{}
 index.push({id:example.id,label:example.label,kind:example.kind??'clan',version,directory:example.id,files});}
 await fs.writeFile(path.join(output,config.examples.directory,'index.json'),JSON.stringify(index,null,2)+'\n');
 await fs.writeFile(path.join(output,'release-report.json'),JSON.stringify({preview,missingExamples:missing,exampleCount:index.length,minimumExampleCount:config.examples.minimumCount},null,2)+'\n');
 await fs.writeFile(path.join(output,'start-editor.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nif not exist node_modules call npm ci --omit=dev\r\nif errorlevel 1 exit /b 1\r\nstart "" http://127.0.0.1:4319/\r\nset CLAN_EDITOR_PORT=4319\r\nnode dist-server/index.js\r\n');
 await fs.writeFile(path.join(output,'start-editor.sh'),'#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nif [ ! -d node_modules ]; then npm ci --omit=dev; fi\nexport CLAN_EDITOR_PORT=4319\nnode dist-server/index.js\n',{mode:0o755});
 await fs.writeFile(path.join(output,'START-HERE.md'),'# Clan Editor\n\n'+(preview?'PREVIEW: incomplete distribution. Missing example clans: '+missing.join(', ')+'. See release-report.json.\n\n':'')+'Install Node.js 24 or newer. Windows: run start-editor.cmd. Linux/macOS: run sh start-editor.sh. Open http://127.0.0.1:4319/. The first run installs runtime dependencies using npm; an internet connection is required.\n\nThe library offers clan examples as independent editable copies. Source-only examples copy their C# project without adding a fictional clan to the library. Originals remain in examples/. Data and edits stay on your computer. Use a game testing profile before installing a compiled clan. Native bundles may be platform-specific. .NET is needed only for C# builds.\n');
 console.log(JSON.stringify({output,preview,missingExamples:missing,examples:index.map(({id,label,version})=>({id,label,version}))}));
}catch(e){await fs.rm(output,{recursive:true,force:true});throw e;}
