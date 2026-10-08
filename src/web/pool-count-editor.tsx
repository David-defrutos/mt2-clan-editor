import {useEffect,useRef,useState} from 'react';
import {api,post} from './api';
import {useLanguage} from './i18n';
type Entry={key:string;file:string;hash:string;source:string;path:(string|number)[];value:unknown;count:number};
type Model={name:string;min:number;max:number;total:number;entries:Entry[]};
type Preview={changed:boolean;before:unknown;after:unknown;totalBefore:number;totalAfter:number;file:string;token:string};
export function PoolCountEditor({clanKey,pool,id,onClose,onSaved}:{clanKey:string;pool:string;id:string;onClose:()=>void;onSaved:(result:{changed:boolean;backup?:string})=>void|Promise<void>}){
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView({block:'start',behavior:'smooth'});},[]);
 const {t}=useLanguage();const [model,setModel]=useState<Model>();const [selected,setSelected]=useState('');const [value,setValue]=useState('');const [preview,setPreview]=useState<Preview>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let active=true;setModel(undefined);setPreview(undefined);setError('');api<Model>(`/clans/${clanKey}/pool-count?pool=${encodeURIComponent(pool)}&id=${encodeURIComponent(id)}`).then(result=>{if(active){setModel(result);setSelected(result.entries[0]?.key??'');setValue(String(result.entries[0]?.count??''));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[clanKey,pool,id]);
 const entry=model?.entries.find(e=>e.key===selected);
 async function act(save:boolean){
  if(!entry)return;setBusy(true);setError('');
  try{
   if(!value.trim())throw new Error('Introduce una cantidad entera.');
   const input={pool,id,entry:entry.key,count:Number(value),expectedHash:entry.hash,expectedToken:save?preview?.token:undefined};
   if(save)await onSaved(await post(`/clans/${clanKey}/pool-count/save`,input));
   else setPreview(await post<Preview>(`/clans/${clanKey}/pool-count/preview`,input));
  }catch(e){setError((e as Error).message);setPreview(undefined);}finally{setBusy(false);}
 }
 return <section ref={panel} tabIndex={-1} className="panel content-panel" aria-label={t('Editar cantidades del pool')}><div className="head-actions"><h2>{t('Cantidades de {name}',{name:model?.name??id})}</h2><button className="ghost" disabled={busy} onClick={onClose}>{t('Cerrar cantidades')}</button></div><p>{t('Cada entrada se edita por separado. Se conservan las demás entradas, repeticiones y referencias externas. Para retirar una carta, usa su casilla de pertenencia; la cantidad mínima es 1.')}</p>{error&&<p className="notice error" role="alert">{t(error)}</p>}{!model&&!error&&<p>{t('Cargando cantidades…')}</p>}{model&&<fieldset disabled={busy}><p>{t('{count} entradas locales en total. No es una probabilidad de draft.',{count:model.total})}</p>{!model.entries.length?<p>{t('Esta carta no tiene entradas locales en el pool seleccionado.')}</p>:<><label>{t('Entrada que se modifica')}<select value={selected} onChange={e=>{setSelected(e.target.value);setValue(String(model.entries.find(v=>v.key===e.target.value)?.count??''));setPreview(undefined);}}>{model.entries.map(e=><option key={e.key} value={e.key}>{e.source==='card'?'carta.pools':'pool.cards'} · {t('Posición {index}',{index:Number(e.path.at(-1))+1})} · {e.file}</option>)}</select></label><pre>{JSON.stringify(entry?.value,null,2)}</pre><label>{t('Cantidad de esta entrada')}<input type="number" min={model.min} max={model.max} step={1} value={value} onChange={e=>{setValue(e.target.value);setPreview(undefined);}}/></label><p className="muted">{t('Si la referencia no tenía count explícito, cambiar la cantidad la convierte al formato item/count. Sus datos se conservan.')}</p><button className="secondary" disabled={!entry||!value.trim()} onClick={()=>act(false)}>{t('Previsualizar cantidad')}</button>{preview&&<div className="preview"><p>{JSON.stringify(preview.before)} → {JSON.stringify(preview.after)}</p><p>{t('Total local: {before} → {after}',{before:preview.totalBefore,after:preview.totalAfter})}</p><small>{preview.file}</small><button className="primary" disabled={!preview.changed} onClick={()=>act(true)}>{t('Guardar cantidad con respaldo')}</button></div>}</>}</fieldset>}</section>;
}
