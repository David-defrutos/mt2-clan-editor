import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configRoot,dataRoot,inside} from './paths.js';
const catalogues=new Map<string,{token:string;rows:{id:string;name:string;group:string;width:number;height:number;ppu:number;pivot:{x:number;y:number};file:string;sha256:string}[]}>();
export async function officialArtCatalog(directory=dataRoot){
 const rules=JSON.parse(await fs.readFile(path.join(configRoot,'official-art-viewer.json'),'utf8')) as {directory:string;datasetPrefix:string;spriteType:string;groups:{prefix:string;id:string;label:string}[];comparisonXRatio:number;defaultScale:number;minimumScale:number;maximumScale:number;help:string};
 const root=path.resolve(directory,rules.directory);if(!inside(directory,root)||root===directory)throw new Error('Ruta de arte oficial inválida.');
 const datasets=(await fs.readdir(root,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).filter(e=>e.isDirectory()&&e.name.startsWith(rules.datasetPrefix)).map(e=>e.name).sort().reverse();
 const rows:{id:string;name:string;group:string;width:number;height:number;ppu:number;pivot:{x:number;y:number};file:string;sha256:string}[]=[];
 if(!datasets.length)return {rules,rows};
 const dataset=path.join(root,datasets[0]);if(!inside(await fs.realpath(directory),await fs.realpath(dataset)))throw new Error('El arte oficial apunta fuera de data/.');
 const text=await fs.readFile(path.join(dataset,'manifest.json'),'utf8');
 const token=createHash('sha256').update(JSON.stringify(rules)).update(text).digest('hex');const cached=catalogues.get(dataset);if(cached?.token===token)return {rules,rows:cached.rows};
 const manifest=JSON.parse(text);
 const seen=new Set<string>();
 for(const image of manifest.images??[]){const group=rules.groups.find(g=>typeof image.name==='string'&&image.name.startsWith(g.prefix));if(!group||image.type!==rules.spriteType||seen.has(image.name))continue;
  if(!Number.isFinite(image.width)||image.width<=0||!Number.isFinite(image.height)||image.height<=0||!Number.isFinite(image.pixelsPerUnit)||image.pixelsPerUnit<=0||!Number.isFinite(image.pivot?.x)||!Number.isFinite(image.pivot?.y)||typeof image.file!=='string'||typeof image.sha256!=='string')continue;
  const file=path.resolve(dataset,...image.file.replaceAll('\\','/').split('/'));if(!inside(dataset,file)||path.extname(file).toLowerCase()!=='.png'||!inside(await fs.realpath(dataset),await fs.realpath(file)))throw new Error('Ruta de sprite oficial inválida.');
  seen.add(image.name);rows.push({id:createHash('sha256').update(file).digest('hex').slice(0,24),name:image.name,group:group.id,width:image.width,height:image.height,ppu:image.pixelsPerUnit,pivot:image.pivot,file,sha256:image.sha256});
 }
 rows.sort((a,b)=>a.name.localeCompare(b.name));catalogues.set(dataset,{token,rows});return {rules,rows};
}
export async function officialArtImage(id:string){const row=(await officialArtCatalog()).rows.find(r=>r.id===id);if(!row)throw new Error('Sprite oficial no disponible.');if(!inside(await fs.realpath(dataRoot),await fs.realpath(row.file)))throw new Error('El arte oficial apunta fuera de data/.');const bytes=await fs.readFile(row.file);if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new Error('El sprite oficial cambió desde su extracción.');return bytes;}
