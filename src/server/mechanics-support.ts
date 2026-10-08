import {matchesMechanic} from './mechanic-rule.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {configRoot,inside} from './paths.js';
import {filesUnder} from './scan.js';
import type {ClanSnapshot} from './types.js';
export async function mechanicsSupport(clan:ClanSnapshot){
 const config=JSON.parse(await fs.readFile(path.join(configRoot,'mechanics-support.json'),'utf8')) as {sections:string[];sourceFolder:string;maxSourceBytes:number;maxSourceFiles:number;description:string;selectors?:Record<string,string>};
 const fields=JSON.parse(await fs.readFile(path.join(configRoot,'fields.json'),'utf8')) as Record<string,{path:string;names?:string[];modReferences?:string[];requires?:{names?:string[];selector?:string;modReferences?:string[]}[]}[]>;
 const sourceRoot=path.resolve(clan.root,config.sourceFolder);if(!inside(clan.root,sourceRoot))throw new Error('Ruta de fuentes fuera del clan.');
 const files=(await filesUnder(sourceRoot,'.cs')).slice(0,config.maxSourceFiles);const symbols=new Map<string,string[]>();
 for(const file of files){if((await fs.stat(file)).size>config.maxSourceBytes)continue;const text=await fs.readFile(file,'utf8');for(const match of text.matchAll(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/g)){const name=match[1];symbols.set(name,[...(symbols.get(name)??[]),path.relative(clan.root,file).replaceAll('\\','/')]);}}
 const rows=clan.entries.filter(e=>config.sections.includes(e.section)).map(e=>{
  const name=e.data[config.selectors?.[e.section]??"name"];const structured=name&&typeof name==='object'?name as Record<string,unknown>:undefined;const raw=typeof name==='string'?name:typeof structured?.id==='string'?structured.id:'';
  const local=raw.startsWith('@')&&!structured?.mod_reference;const adapters=(fields[e.section]??[]).filter(r=>r.names && matchesMechanic(e.data,r)).map(r=>r.path);
  return {section:e.section,id:e.id,name:raw,modReference:structured?.mod_reference,fields:adapters,sourceFiles:local?symbols.get(raw.slice(1))??[]:[],status:adapters.length?'configured':structured?.mod_reference?'external':local?'custom':'uncatalogued'};
 });return {rows,description:config.description};
}
