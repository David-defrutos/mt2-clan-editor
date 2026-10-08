import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import {configRoot, dataRoot, inside, keyForPath} from './paths.js';
import {scanClan} from './scan.js';
import {poolModel} from './pool-editor.js';
import {poolReferenceRules, poolReference, localPoolReference, countedPoolReference} from './pool-references.js';

export interface PoolCountRequest {root: string; pool: string; id: string; entry: string; count: number; expectedHash: string; expectedToken?: string}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function state(root:string) {
 const clan=await scanClan(root);
 const files=await Promise.all(clan.files.map(async file=>[file,hash(await fs.readFile(path.join(root,file),'utf8'))]));
 const configs=await Promise.all(['pool-editor.json','pool-references.json'].map(file=>fs.readFile(path.join(configRoot,file),'utf8')));
 return hash(JSON.stringify([await fs.realpath(root),files,configs]));
}
export async function poolCountModel(root:string,poolId:string,id:string) {
 const [clan,model,rules]=await Promise.all([scanClan(root),poolModel(root),poolReferenceRules()]);
 const pool=model.pools.find(p=>p.id===poolId); const card=model.cards.find(c=>c.id===id);
 if(!pool?.editable || !card?.editable)throw new Error('Selecciona una carta y un pool locales válidos para editar cantidades.');
 const owner=clan.entries.find(e=>e.section==='cards' && e.id===id)!;
 const entries:{key:string;file:string;hash:string;source:string;path:(string|number)[];value:unknown;count:number}[]=[];
 function collect(values:unknown,pathPrefix:(string|number)[],source:string,file:string,fileHash:string,target:string){
  if(!Array.isArray(values))return;
  values.forEach((value,index)=>{if(localPoolReference(value,rules)===target) entries.push({key:source+':'+index,file,hash:fileHash,source,path:[...pathPrefix,index],value,count:poolReference(value,rules)!.count});});
 }
 collect(owner.data.pools,['cards',owner.index,'pools'],'card',owner.file,owner.hash,poolId);
 if(pool.definition){
  const definition=clan.entries.find(e=>e.section==='card_pools' && e.id===pool.definition!.id && e.file===pool.definition!.file)!;
  collect(definition.data.cards,['card_pools',definition.index,'cards'],'pool',definition.file,definition.hash,'@'+id);
 }
 return {pool:poolId,id,name:card.name,min:rules.minimumCount,max:rules.maximumEditableCount,total:entries.reduce((sum,e)=>sum+e.count,0),entries};
}
export async function preparePoolCount(request:PoolCountRequest){
 const initial=await state(request.root);const rules=await poolReferenceRules();
 if(!Number.isSafeInteger(request.count) || request.count<rules.minimumCount || request.count>rules.maximumEditableCount)throw new Error(`La cantidad debe ser un entero entre ${rules.minimumCount} y ${rules.maximumEditableCount}.`);
 const model=await poolCountModel(request.root,request.pool,request.id);const entry=model.entries.find(e=>e.key===request.entry);
 if(!entry)throw new Error('La entrada local ya no existe o no es editable. Actualiza el pool.');
 if(entry.hash!==request.expectedHash)throw new Error('El archivo cambió en disco. Actualiza el pool.');
 const absolute=path.resolve(request.root,entry.file);
 if(!inside(path.join(request.root,'json'),absolute) || !inside(await fs.realpath(request.root),await fs.realpath(absolute)))throw new Error('El archivo sale del clan.');
 const original=await fs.readFile(absolute,'utf8');if(hash(original)!==request.expectedHash)throw new Error('El archivo cambió en disco. Actualiza el pool.');
 const same=entry.count===request.count;
 const bom=original.startsWith('\uFEFF')?'\uFEFF':'';const text=bom?original.slice(1):original;
 const counted=countedPoolReference(entry.value,rules);
 const target=counted?[...entry.path,rules.countField]:entry.path;
 const after=counted?{...(entry.value as Record<string,unknown>),[rules.countField]:request.count}:{[rules.itemField]:entry.value,[rules.countField]:request.count};
 const indent=text.match(/\n(\s+)"/)?.[1]??'  ';
 const newText=same?original:bom+jsonc.applyEdits(text,jsonc.modify(text,target,counted?request.count:after,{formattingOptions:{insertSpaces:!indent.includes('\t'),tabSize:indent.includes('\t')?1:indent.length,eol:text.includes('\r\n')?'\r\n':'\n'}}));
 const errors:jsonc.ParseError[]=[];jsonc.parse(newText.replace(/^\uFEFF/,''),errors,{allowTrailingComma:true});if(errors.length)throw new Error('El cambio produciría JSON inválido.');
 const final=await state(request.root);if(final!==initial)throw new Error('El clan cambió durante la revisión.');
 const token=hash(JSON.stringify([final,request.pool,request.id,request.entry,request.count,request.expectedHash]));
 if(request.expectedToken && token!==request.expectedToken)throw new Error('La vista previa ha caducado. Vuelve a previsualizar.');
 return {changed:!same,before:entry.value,after:same?entry.value:after,beforeCount:entry.count,afterCount:request.count,totalBefore:model.total,totalAfter:model.total-entry.count+request.count,file:entry.file,original,newText,oldHash:entry.hash,state:final,token};
}
const saving=new Set<string>();
export async function savePoolCount(request:PoolCountRequest){
 if(!request.expectedToken)throw new Error('Previsualiza la cantidad antes de guardar.');
 const root=await fs.realpath(request.root);if(saving.has(root))throw new Error('Hay otro guardado de cantidades en curso.');saving.add(root);
 try{
  const review=await preparePoolCount(request);if(!review.changed)return {changed:false};
  const backupRoot=path.join(dataRoot,'backups',keyForPath(root));await fs.mkdir(backupRoot,{recursive:true});const folder=await fs.mkdtemp(path.join(backupRoot,'pool-count-'));
  const backup=path.join(folder,review.file);await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,review.original,{flag:'wx'});
  const absolute=path.resolve(root,review.file);const temp=absolute+`.clan-editor-${randomUUID()}.tmp`;
  try{
   await fs.writeFile(temp,review.newText,{flag:'wx'});
   if(await state(root)!==review.state || hash(await fs.readFile(absolute,'utf8'))!==review.oldHash)throw new Error('El clan cambió antes del guardado.');
   await fs.rename(temp,absolute);
  }finally{await fs.rm(temp,{force:true});}
  return {changed:true,backup};
 }finally{saving.delete(root);}
}
