import fs from 'node:fs/promises';
import path from 'node:path';
import * as jsonc from 'jsonc-parser';
import {configRoot,inside} from './paths.js';
import {atField} from './field-paths.js';
import type {ClanSnapshot} from './types.js';
export async function prepareArtScale(clan:ClanSnapshot,image:string,oldWidth:number,oldHeight:number,newWidth:number,newHeight:number){
 const rules=JSON.parse(await fs.readFile(path.join(configRoot,'character-preview.json'),'utf8'));
 const sprites=clan.entries.filter(e=>e.section==='sprites'&&typeof e.data.path==='string'&&path.resolve(clan.root,e.data.path)===path.resolve(clan.root,image));
 const files=new Map<string,{file:string;original:string;newText:string}>();const changes:{id:string;file:string;before:{x:number;y:number};after:{x:number;y:number}}[]=[];const warnings:string[]=[];
 if(oldWidth===newWidth&&oldHeight===newHeight)return {files:[],changes,warnings};
 for(const entry of clan.entries.filter(e=>e.section==='game_objects'&&e.data.type==='character_art')){
  const extension=atField(entry.data,rules.extensionPath) as Record<string,unknown>|undefined;if(!extension)continue;
  const raw=extension.sprite;const sprite=raw&&typeof raw==='object'&&!Array.isArray(raw)&&!(raw as Record<string,unknown>).mod_reference?(raw as Record<string,unknown>).id:raw;
  if(!sprites.some(s=>sprite==='@'+s.id))continue;
  if(extension.skeleton_animations||extension.animations!==undefined&&!Array.isArray(extension.animations)||Array.isArray(extension.animations)&&extension.animations.length||rules.misplacedTransformPaths.some((p:string)=>atField(entry.data,p)!==undefined)){warnings.push(`${entry.id}: sin compensación automática; animación, Spine o transformación no compatible.`);continue;}
  if(clan.entries.filter(e=>e.section===entry.section&&e.id===entry.id).length!==1)throw new Error('Arte con ID duplicado; no se compensa automáticamente.');
  const xControl=rules.controls.find((c:{id:string})=>c.id==='scaleX');const yControl=rules.controls.find((c:{id:string})=>c.id==='scaleY');
  const x=atField(extension,xControl.path)??xControl.default;const y=atField(extension,yControl.path)??yControl.default;
  if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('La escala actual no es numérica.');
  const after={x:Number((x*oldWidth/newWidth).toFixed(12)),y:Number((y*oldHeight/newHeight).toFixed(12))};
  if(after.x<xControl.min||after.x>xControl.max||after.y<yControl.min||after.y>yControl.max)throw new Error('La compensación excede los límites de escala. Usa encajar en tamaño actual o ajusta manualmente.');
  let file=files.get(entry.file);
  if(!file){const absolute=path.resolve(clan.root,entry.file);if(!inside(await fs.realpath(clan.root),await fs.realpath(absolute)))throw new Error('El JSON apunta fuera del clan.');const original=await fs.readFile(absolute,'utf8');file={file:entry.file,original,newText:original};files.set(entry.file,file);}
  const bom=file.newText.startsWith('\uFEFF')?'\uFEFF':'';let source=file.newText.slice(bom.length);const eol=source.includes('\r\n')?'\r\n':'\n';const indent=source.match(/\n(\s+)"/)?.[1]??'  ';
  for(const [control,value] of [[xControl,after.x],[yControl,after.y]] as const){source=jsonc.applyEdits(source,jsonc.modify(source,['game_objects',entry.index,...(rules.extensionPath+'.'+control.path).split('.')],value,{formattingOptions:{insertSpaces:!indent.includes('\t'),tabSize:indent.includes('\t')?1:indent.length,eol}}));}
  file.newText=bom+source;changes.push({id:entry.id,file:entry.file,before:{x,y},after});
 }
 return {files:[...files.values()],changes,warnings};
}
