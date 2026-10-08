import fs from 'node:fs/promises';
import path from 'node:path';
import {configRoot, inside} from './paths.js';

export async function languageCatalogs(directory = configRoot) {
  const config=JSON.parse(await fs.readFile(path.join(directory,'i18n.json'),'utf8')) as {defaultLanguage:string;storageKey:string;languages:{id:string;label:string;locale:string;catalog:string}[]};
  if(!config.storageKey?.trim()||!Array.isArray(config.languages)||!config.languages.length)throw new Error('Configuración de idiomas inválida.');
  const ids=new Set<string>();
  const languages=await Promise.all(config.languages.map(async item=>{
    if(!/^[a-z]{2}(?:-[A-Za-z0-9]+)*$/.test(item.id)||ids.has(item.id)||!item.label?.trim()||!item.locale?.trim())throw new Error('Idioma inválido o repetido.');
    ids.add(item.id);
    try { new Intl.DateTimeFormat(item.locale); } catch { throw new Error('Formato regional de idioma inválido.'); }
    const file=path.resolve(directory,item.catalog);
    if(!inside(directory,file)||!inside(await fs.realpath(directory),await fs.realpath(file)))throw new Error('El catálogo debe estar dentro de configuración.');
    const messages=JSON.parse(await fs.readFile(file,'utf8')) as unknown;
    if(!messages||typeof messages!=='object'||Array.isArray(messages)||Object.values(messages).some(value=>typeof value!=='string'))throw new Error('El catálogo debe contener textos.');
    return {id:item.id,label:item.label,locale:item.locale,messages:messages as Record<string,string>};
  }));
  if(!ids.has(config.defaultLanguage))throw new Error('Idioma por defecto no disponible.');
  return {defaultLanguage:config.defaultLanguage,storageKey:config.storageKey,languages};
}
