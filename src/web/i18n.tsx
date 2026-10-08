import React, {createContext, useContext, useEffect, useState} from 'react';
import {api} from './api';
import {languagePreference, saveLanguagePreference, resolveLanguage, translate, type LanguageConfig} from './i18n-core';

const fallback: LanguageConfig = {defaultLanguage:'es',storageKey:'mt2-clan-editor.language',languages:[{id:'es',label:'Español',locale:'es-ES',messages:{}}]};
type Context = {config: LanguageConfig; language: string; locale: string; change: (id: string) => void; t: (source: string, values?: Record<string,string|number>) => string; error: string};
const context = createContext<Context>({config:fallback,language:'es',locale:'es-ES',change:()=>{},t:(source,values)=>translate(fallback.languages[0],source,values),error:''});
export function LanguageProvider({children}:{children:React.ReactNode}) {
  const [config,setConfig]=useState(fallback);const [id,setId]=useState('es');const [error,setError]=useState('');
  useEffect(()=>{let active=true;api<LanguageConfig>('/languages').then(value=>{if(!active)return;let selected;try{selected=languagePreference(value,window.localStorage);}catch{selected=resolveLanguage(value,null);}setConfig(value);setId(selected.id);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  const language=resolveLanguage(config,id);
  useEffect(()=>{document.documentElement.lang=language.id;},[language.id]);
  function change(next:string){let selected=resolveLanguage(config,next);try{selected=saveLanguagePreference(config,next,window.localStorage);}catch{/* Browser storage may also be inaccessible before calling setItem. */}setId(selected.id);}
  return <context.Provider value={{config,language:language.id,locale:language.locale,change,t:(source,values)=>translate(language,source,values),error}}>{children}</context.Provider>;
}
export function useLanguage(){return useContext(context);}
export function LanguageSelector(){const {config,language,change,t,error}=useLanguage();return <div className="language-selector"><label>{t('Idioma')}<select aria-label={t('Idioma de la interfaz')} value={language} onChange={e=>change(e.target.value)}>{config.languages.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{error&&<small role="alert">{t('No se pudieron cargar los idiomas.')} {error}</small>}</div>;}
