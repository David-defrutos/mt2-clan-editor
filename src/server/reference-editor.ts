import {matchesMechanic} from './mechanic-rule.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configRoot } from './paths.js';
import { scanClan } from './scan.js';
import { atField, fieldLocations } from './field-paths.js';
import { prepareEdit, saveEdit } from './edit.js';
import type { ClanSnapshot } from './types.js';
type Rule = { section: string; path: string; label: string; sourceSection: string; sourceType?: string; filter?: string; mode: 'single' | 'list'; help: string; external?: boolean; names?: string[]; modReferences?: string[] };
export interface ReferenceRequest { root: string; section: string; id: string; file: string; field: string; expectedHash: string; operation: 'set'|'append'|'remove'|'up'|'down'; index?: number; targetId?: string; external?: { id: string; mod_reference?: string }; expectedToken?: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function rules(): Promise<Rule[]> { return JSON.parse(await fs.readFile(path.join(configRoot,'reference-editor.json'),'utf8')).assignments; }
function refers(value: unknown, id: string): boolean { if (value === '@'+id) return true; if (Array.isArray(value)) return value.some(v=>refers(v,id)); return Boolean(value && typeof value==='object' && !(value as Record<string,unknown>).mod_reference && Object.values(value).some(v=>refers(v,id))); }
export async function referenceModel(clan: ClanSnapshot, section: string, id: string, file: string) {
  const owner = clan.entries.find(e=>e.section===section&&e.id===id&&e.file===file);
  if(!owner) throw new Error('No se encuentra el objeto.');
  return (await rules()).filter(r=>r.section===section&&matchesMechanic(owner.data,r)).flatMap(r=>fieldLocations(owner.data,r.path).filter(field=>!r.path.includes('extensions[]')||Boolean(atField(owner.data,field.split('.').slice(0,-1).join('.')))).map((field,i)=>{
    const candidates=clan.entries.filter(e=>e.section===r.sourceSection&&e.data.id===e.id&&(!r.sourceType||e.data.type===r.sourceType)&&(!r.filter||e.data[r.filter]===true)&&clan.entries.filter(x=>x.section===e.section&&x.id===e.id).length===1);
    return {...r,field,label:r.label+(r.path.includes('[]')?' · '+(i+1):''),current:atField(owner.data,field),candidates:candidates.map(e=>({id:e.id,name:e.name,file:e.file})),uses:clan.entries.filter(e=>e!==owner&&refers(e.data,owner.id)).map(e=>({id:e.id,name:e.name,section:e.section,file:e.file}))};
  }));
}
async function snapshot(root: string) { const clan=await scanClan(root);const files=await Promise.all(clan.files.map(async f=>[f,hash(await fs.readFile(path.join(root,f),'utf8'))])); return hash(JSON.stringify([files,await fs.readFile(path.join(configRoot,'reference-editor.json'),'utf8'),await fs.readFile(path.join(configRoot,'fields.json'),'utf8')])); }
export async function prepareReference(request: ReferenceRequest) {
  const clan=await scanClan(request.root); const slots=await referenceModel(clan,request.section,request.id,request.file); const slot=slots.find(s=>s.field===request.field);
  if(!slot) throw new Error('La referencia no admite edición guiada.');
  const state=await snapshot(request.root);
  const {expectedToken,...intent}=request; const token=hash(JSON.stringify([state,intent]));
  if(expectedToken&&expectedToken!==token) throw new Error('El clan o la selección cambió. Previsualiza de nuevo.');
  const selectionSlot=slot;
  function selected(): unknown {
    if(request.external){
      const {id,mod_reference:mod}=request.external;
      if(!selectionSlot.external||typeof id!=='string'||!id.trim()||id.length>200||mod!==undefined&&(typeof mod!=='string'||!mod.trim()||mod.length>200))throw new Error('Referencia externa no permitida o inválida.');
      if(!mod&&id.startsWith('@'))throw new Error('Una referencia con @ es local. Elige una definición compatible en el selector local o indica mod_reference.');
      return mod ? {id,mod_reference:mod} : id;
    }
    if(!selectionSlot.candidates.some(c=>c.id===request.targetId)) throw new Error('Elige una definición local única y compatible.');
    return '@'+request.targetId;
  }
  let value: unknown=slot.current;
  if(slot.mode==='single'){
    if(request.operation!=='set') throw new Error('Esta referencia solo admite sustitución.');
    const target=selected();
    if(typeof target==='string' && target.startsWith('@') && slot.current && typeof slot.current==='object' && !Array.isArray(slot.current) && !(slot.current as Record<string,unknown>).mod_reference)value={...slot.current,id:target}; else value=target;
  }else{
    if(slot.current!==undefined&&!Array.isArray(slot.current)) throw new Error('La lista está mal formada.');
    const list=structuredClone((slot.current??[]) as unknown[]);
    if(request.operation==='append'){if(list.length>=200)throw new Error('La lista admite hasta 200 referencias.');list.push(selected());}
    else{
      const index=request.index;
      if(!Number.isInteger(index)||index!<0||index!>=list.length)throw new Error('Posición inválida.');
      if(request.operation==='remove')list.splice(index!,1);
      else if(request.operation==='up'||request.operation==='down'){const destination=index!+(request.operation==='up'?-1:1);if(destination<0||destination>=list.length)throw new Error('No se puede mover fuera de la lista.');[list[index!],list[destination]]=[list[destination],list[index!]];}
      else throw new Error('Operación de lista inválida.');
    }
    value=list;
  }
  const edit={root:request.root,section:request.section,id:request.id,file:request.file,field:request.field,value,expectedHash:request.expectedHash};
  const preview=await prepareEdit(edit);
  return {...preview,edit,token,state,uses:slot.uses,help:slot.help};
}
const saving=new Set<string>();
export async function saveReference(request: ReferenceRequest){
  if(!request.expectedToken)throw new Error('Previsualiza antes de guardar.');
  const root=await fs.realpath(request.root);if(saving.has(root))throw new Error('Hay otro cambio de referencias en curso.');saving.add(root);
  try{const preview=await prepareReference(request);if(await snapshot(root)!==preview.state)throw new Error('El clan cambió durante la revisión.');return await saveEdit(preview.edit);}finally{saving.delete(root);}
}
