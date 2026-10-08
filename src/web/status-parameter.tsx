import React,{useState} from 'react';
import {useLanguage} from './i18n';
import type {ClanSnapshot} from './types';
export type StatusPreset={label:string;status:unknown;help:string};
const encode=(value:unknown)=>JSON.stringify(value)??'null';
export function statusChoices(options:string[],presets:StatusPreset[],clan:ClanSnapshot){
 const local=clan.entries.filter(e=>e.section==='status_effects'&&clan.entries.filter(x=>x.section===e.section&&x.id===e.id).length===1).map(e=>'@'+e.id);
 return [...new Set([...options,...local])].map(status=>({label:status,status,help:''} as StatusPreset)).concat(presets);
}
export function replaceStatus(row:Record<string,unknown>,status:unknown){return {...row,status:structuredClone(status)};}
export function StatusParameter({value,onChange,options,presets=[],clan}:{value:string;onChange:(v:string)=>void;options:string[];presets?:StatusPreset[];clan:ClanSnapshot}){
 const {t}=useLanguage();const [newStatus,setNewStatus]=useState('');
 let rows:Record<string,unknown>[];
 try{const parsed=JSON.parse(value||'[]');if(!Array.isArray(parsed)||parsed.some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw Error();rows=parsed;}catch{return <p role="alert">{t("La lista de estados no tiene el formato soportado. Revísala en JSON antes de usar este formulario.")}</p>;}
 const choices=statusChoices(options,presets,clan);
 const chosen=choices.find(c=>encode(c.status)===newStatus)??choices[0];
 const write=(next:Record<string,unknown>[])=>onChange(JSON.stringify(next));
 return <div>{rows.map((r,i)=>{
  const current=choices.find(c=>encode(c.status)===encode(r.status));
  const available=current?choices:[{label:typeof r.status==='string'?r.status:encode(r.status),status:r.status,help:''},...choices];
  return <fieldset key={i}><label>{t("Estado")}<select value={encode(r.status)} onChange={e=>{const selected=available.find(c=>encode(c.status)===e.target.value);if(selected)write(rows.map((v,j)=>j===i?replaceStatus(v,selected.status):v));}}>{available.map(c=><option key={encode(c.status)} value={encode(c.status)}>{c.help?t(c.label):c.label}</option>)}</select></label>{current?.help&&<p className="muted">{t(current.help)}</p>}<label>{t("Acumulaciones")}<input type="number" step="1" value={String(r.count??'')} onChange={e=>write(rows.map((v,j)=>j===i?{...v,count:e.target.value===''?null:Number(e.target.value)}:v))}/></label><button type="button" onClick={()=>write(rows.filter((_,j)=>i!==j))}>{t("Quitar estado")}</button></fieldset>;
 })}<label>{t('Estado que se añade')}<select disabled={!choices.length} value={chosen?encode(chosen.status):''} onChange={e=>setNewStatus(e.target.value)}>{choices.map(c=><option key={encode(c.status)} value={encode(c.status)}>{c.help?t(c.label):c.label}</option>)}</select></label>{chosen?.help&&<p className="muted">{t(chosen.help)}</p>}<button type="button" disabled={!chosen} onClick={()=>{if(chosen)write([...rows,{status:structuredClone(chosen.status),count:1}]);}}>{t("Añadir estado")}</button><p>{t("Los campos adicionales de cada entrada se conservan. Los efectos pueden elegir entre varios estados al azar; revisa la explicación de la mecánica.")}</p></div>;
}
