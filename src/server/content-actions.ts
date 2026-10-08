import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import {configRoot,dataRoot,inside,keyForPath} from './paths.js';
import {scanClan,filesUnder} from './scan.js';
import {prepareEdit} from './edit.js';
import {jsonPath} from './field-paths.js';
import {removeArrayItem} from './pool-editor.js';
export interface ActionRequest{root:string;operation:'delete'|'batch';section:string;targets:{id:string;file:string;expectedHash:string}[];field?:string;value?:unknown;expectedToken?:string}
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function contentActionRules(){const rules=JSON.parse(await fs.readFile(path.join(configRoot,'content-actions.json'),'utf8'));const fields=JSON.parse(await fs.readFile(path.join(configRoot,'fields.json'),'utf8'));return {...rules,batchSections:rules.batchSections.map((s:{id:string;label:string;fields:string[]})=>({...s,fields:s.fields.map(p=>fields[s.id].find((f:{path:string})=>f.path===p))}))};}
async function state(root:string){const clan=await scanClan(root);const files=await Promise.all(clan.files.map(async f=>[f,hash(await fs.readFile(path.join(root,f),'utf8'))]));return hash(JSON.stringify([files,await fs.readFile(path.join(configRoot,'content-actions.json'),'utf8'),await fs.readFile(path.join(configRoot,'fields.json'),'utf8')]));}
function refers(v:unknown,id:string):boolean{if(v==='@'+id)return true;if(Array.isArray(v))return v.some(x=>refers(x,id));return Boolean(v&&typeof v==='object'&&!(v as Record<string,unknown>).mod_reference&&Object.values(v).some(x=>refers(x,id)));}
export async function prepareContentAction(request:ActionRequest){
 const rules=await contentActionRules();const clan=await scanClan(request.root);const snapshot=await state(request.root);
 if(!Array.isArray(request.targets)||!request.targets.length||request.targets.length>rules.maxBatchSize)throw new Error('Selecciona un número válido de objetos.');
 const intent={...request,expectedToken:undefined};const token=hash(JSON.stringify([snapshot,intent]));if(request.expectedToken&&request.expectedToken!==token)throw new Error('El clan o la selección cambió. Previsualiza de nuevo.');
 const files=new Map<string,{file:string;original:string;newText:string}>();const changes:{id:string;before:unknown;after:unknown}[]=[];const seen=new Set<string>();
 for(const target of request.targets){
  if(seen.has(target.id))throw new Error('Hay objetos repetidos en la selección.');seen.add(target.id);
  const matches=clan.entries.filter(e=>e.section===request.section&&e.id===target.id);const entry=matches.length===1&&matches[0].file===target.file?matches[0]:undefined;
  if(!entry||entry.hash!==target.expectedHash)throw new Error('Un objeto está duplicado, no existe o cambió en disco.');
  const absolute=path.resolve(request.root,target.file);if(!inside(await fs.realpath(request.root),await fs.realpath(absolute)))throw new Error('El archivo apunta fuera del clan.');
  let file=files.get(entry.file);if(!file){const original=await fs.readFile(absolute,'utf8');file={file:entry.file,original,newText:original};files.set(entry.file,file);}
  const bom=file.newText.startsWith('\uFEFF')?'\uFEFF':'';let source=file.newText.slice(bom.length);
  if(request.operation==='delete'){
   if(request.targets.length!==1||!rules.deleteSections.includes(request.section))throw new Error('Solo se admite retirar una definición permitida por revisión.');
   const uses=clan.entries.filter(e=>e!==entry&&refers(e.data,entry.id));if(uses.length)throw new Error('Retira primero las referencias desde: '+uses.map(e=>e.section+' · '+e.id).join(', '));
   for(const cs of await filesUnder(path.join(request.root,'src'),'.cs'))if((await fs.stat(cs)).size<500000&&(await fs.readFile(cs,'utf8')).includes(entry.id))throw new Error('El ID aparece en una fuente C#. Revisa esa referencia antes de retirar la definición.');
   source=removeArrayItem(source,[entry.section],entry.index);changes.push({id:entry.id,before:entry.data,after:undefined});
  }else if(request.operation==='batch'){
   if(!rules.batchSections.find((s:{id:string;fields:{path:string}[]})=>s.id===request.section)?.fields.some((f:{path:string})=>f.path===request.field))throw new Error('Campo no permitido para edición masiva.');
   const preview=await prepareEdit({root:request.root,section:entry.section,id:entry.id,file:entry.file,expectedHash:entry.hash,field:request.field!,value:request.value});
   if(preview.changed){const indent=source.match(/\n(\s+)"/)?.[1]??'  ';source=jsonc.applyEdits(source,jsonc.modify(source,[entry.section,entry.index,...jsonPath(request.field!)],preview.after,{formattingOptions:{insertSpaces:!indent.includes('\t'),tabSize:indent.includes('\t')?1:indent.length,eol:source.includes('\r\n')?'\r\n':'\n'}}));changes.push({id:entry.id,before:preview.before,after:preview.after});}
  }else throw new Error('Acción no permitida.');
  file.newText=bom+source;
 }
 if(await state(request.root)!==snapshot)throw new Error('El clan cambió durante la preparación.');
 return {changed:changes.length>0,changes,files:[...files.values()].filter(f=>f.original!==f.newText),token,state:snapshot};
}
const locks=new Set<string>();
export async function saveContentAction(request:ActionRequest){
 if(!request.expectedToken)throw new Error('Previsualiza antes de guardar.');const root=await fs.realpath(request.root);if(locks.has(root))throw new Error('Hay otra edición de contenido en curso.');locks.add(root);
 const written:{file:string;original:string;newText:string}[]=[];const staged:{temp:string;item:typeof written[number]}[]=[];
 try{const preview=await prepareContentAction(request);if(!preview.changed)return {changed:false};const backupRoot=path.join(dataRoot,'backups',keyForPath(root));await fs.mkdir(backupRoot,{recursive:true});const backup=await fs.mkdtemp(path.join(backupRoot,'content-actions-'));
 for(const item of preview.files){const file=path.join(backup,item.file);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,item.original,{flag:'wx'});const temp=path.join(root,item.file)+`.clan-editor-${randomUUID()}.tmp`;staged.push({temp,item});await fs.writeFile(temp,item.newText,{flag:'wx'});}
 if(await state(root)!==preview.state)throw new Error('El clan cambió durante el guardado.');
 for(const {temp,item} of staged){const file=path.join(root,item.file);if(await fs.readFile(file,'utf8')!==item.original)throw new Error('El archivo cambió durante el guardado.');await fs.rename(temp,file);written.push(item);}
 return {changed:true,backup};
 }catch(error){for(const item of written.reverse()){const file=path.join(root,item.file);if(await fs.readFile(file,'utf8')===item.newText)await fs.writeFile(file,item.original);}throw error;}
 finally{for(const {temp} of staged)await fs.rm(temp,{force:true}).catch(()=>undefined);locks.delete(root);}
}
