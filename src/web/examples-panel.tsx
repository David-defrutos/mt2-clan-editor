import {useEffect,useState} from 'react';
import {api,post} from './api';
import {useLanguage} from './i18n';
export function ExamplesPanel({onAdded}:{onAdded:()=>void}){
 const {t}=useLanguage();const [examples,setExamples]=useState<{id:string;label:string;version:string;kind?:string}[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [copied,setCopied]=useState('');
 useEffect(()=>{api<typeof examples>('/examples').then(setExamples).catch(e=>setError(e.message));},[]);
 async function open(id:string){setBusy(true);setError('');try{const result=await post<{root:string;kind:string}>('/examples/copy',{id});if(result.kind==='source')setCopied(result.root);else onAdded();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!examples.length&&!error)return null;
 return <section className="panel content-panel"><h2>{t('Clanes de ejemplo')}</h2><p>{t('Abre una copia editable. Los ejemplos originales se conservan para volver a empezar.')}</p>{error&&<p role="alert">{t(error)}</p>}{copied&&<p role="status">{t('Fuentes copiadas en {path}. Ábrelas en tu editor de C#.',{path:copied})}</p>}{examples.map(e=><button key={e.id} className="secondary" disabled={busy} onClick={()=>open(e.id)}>{e.kind==='source'?t('Copiar fuentes de {name}',{name:e.label}):t('Abrir copia de {name}',{name:e.label})} · {e.version}{e.kind==='source'?' · '+t('Ejemplo C#'):''}</button>)}</section>;
}
