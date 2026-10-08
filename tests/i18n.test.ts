import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FieldSelect} from '../src/web/field-select.tsx';
import {languageCatalogs} from '../src/server/locales.ts';
import {languagePreference,saveLanguagePreference,resolveLanguage,translate,indexedLabel} from '../src/web/i18n-core.ts';

test('idiomas: elección persistida, código desconocido y almacenamiento bloqueado',async()=>{
  const config=await languageCatalogs();
  assert.equal(languagePreference(config,{getItem:key=>{assert.equal(key,config.storageKey);return 'en';}}).id,'en');
  assert.equal(languagePreference(config,{getItem:()=> 'invalid'}).id,'es');
  assert.equal(languagePreference(config,{getItem:()=>{throw Error('Storage blocked');}}).id,'es');
  const memory=new Map<string,string>();
  saveLanguagePreference(config,'en',{setItem:(key,value)=>{memory.set(key,value);}});
  assert.equal(languagePreference(await languageCatalogs(),{getItem:key=>memory.get(key)??null}).id,'en');
  assert.equal(saveLanguagePreference(config,'en',{setItem:()=>{throw Error('Storage blocked');}}).id,'en');
  const en=resolveLanguage(config,'en');
  assert.equal(translate(en,'Altura'),'Height');
  assert.equal(translate(en,'{count} clanes',{count:2}),'2 clans');
  assert.equal(translate(en,'Vista previa ajustable de {name}',{name:'@Roderic <Test>'}),'Adjustable preview of @Roderic <Test>');
  assert.equal(translate(en,'Texto aún sin traducir'),'Texto aún sin traducir');
  assert.equal(translate(en,'{count} clanes'),'{count} clans');
});

test('catálogos: inglés conserva las claves y parámetros de español',async()=>{
  const config=await languageCatalogs();const es=resolveLanguage(config,'es');const en=resolveLanguage(config,'en');
  assert.deepEqual(Object.keys(en.messages).sort(),Object.keys(es.messages).sort());
  const parameters=(text:string)=>[...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match=>match[1]).sort();
  for(const [key,value] of Object.entries(es.messages))assert.deepEqual(parameters(en.messages[key]),parameters(value),key);
  const root=path.resolve('config');
  const navigation=JSON.parse(await fs.readFile(path.join(root,'navigation.json'),'utf8'));
  const character=JSON.parse(await fs.readFile(path.join(root,'character-preview.json'),'utf8'));
  const configuredTexts=[...navigation.global,...navigation.clan].map(item=>item.label);
  configuredTexts.push(character.proportionsHelp,character.background.label,character.background.calibration);
  for(const group of character.controlGroups)configuredTexts.push(group.label,group.description);
  for(const control of character.controls)configuredTexts.push(control.label,control.help);
  for(const text of configuredTexts)assert.ok(Object.hasOwn(en.messages,text),`Texto de configuración sin traducir: ${text}`);
  const connections=JSON.parse(await fs.readFile(path.join(root,'reference-editor.json'),'utf8'));
  for(const rule of connections.assignments){
    assert.ok(Object.hasOwn(en.messages,rule.label),rule.label);
    assert.ok(Object.hasOwn(en.messages,rule.help),rule.help);
  }
  for(const file of ['reward-settings.json','spawn-assignment.json']){
    const rules=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
    for(const field of rules.fields){
      assert.ok(Object.hasOwn(en.messages,field.label),field.label);
      if(field.help)assert.ok(Object.hasOwn(en.messages,field.help),field.help);
    }
  }
  const t=(text:string)=>translate(en,text);
  assert.equal(indexedLabel('Carta de campeón · 2',t),'Champion card · 2');
  assert.equal(indexedLabel('Efectos de la carta',t),'Card effects');
  assert.equal(translate(en,'Nivel {level}',{level:0}),'Level 0');
  assert.equal(translate(en,'Senda {path} · nivel {level}',{path:3,level:2}),'Path 3 · level 2');
  const stats=JSON.parse(await fs.readFile(path.join(root,'stats.json'),'utf8'));
  for(const metric of stats.metrics)assert.ok(Object.hasOwn(en.messages,metric.label),metric.label);
});

test('diagnósticos traducidos conservan rutas, ID y parámetros literales sin sustituirlos de nuevo',async()=>{
 const en=resolveLanguage(await languageCatalogs(),'en');
 assert.equal(translate(en,'El sprite @Carrier necesita un PNG local válido con ruta exacta.'),'Sprite @Carrier needs a valid local PNG with an exact path.');
 assert.equal(translate(en,'El archivo ya existe: D:\\Mods\\{v0}.json.'),'File already exists: D:\\Mods\\{v0}.json.');
 assert.equal(translate(en,'Falta custom_class.'),'Missing custom_class.');
 assert.equal(translate(en,'Third-party error: X'),'Third-party error: X');
 assert.equal(translate(en,'Configura {v0}. Faltan DLL: {v1}.',{v0:'{v1}',v1:'TrainworksReloaded.Base'}),'Configure {v1}. Missing DLLs: TrainworksReloaded.Base.');
});

test('configuración: rechaza idiomas duplicados, catálogos fuera de carpeta y textos no válidos',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt2-locales-'));
  try{
    const entry={id:'es',label:'Español',locale:'es-ES',catalog:'es.json'};
    const write=async(languages:unknown[])=>fs.writeFile(path.join(root,'i18n.json'),JSON.stringify({defaultLanguage:'es',storageKey:'test',languages}));
    await fs.writeFile(path.join(root,'es.json'),'{}');
    await write([entry,entry]);await assert.rejects(()=>languageCatalogs(root),/repetido/);
    await write([{...entry,catalog:'../outside.json'}]);await assert.rejects(()=>languageCatalogs(root),/dentro/);
    await write([entry]);await fs.writeFile(path.join(root,'es.json'),'{"Test":42}');await assert.rejects(()=>languageCatalogs(root),/textos/);
    await fs.writeFile(path.join(root,'es.json'),'{}');await write([{...entry,locale:'bad_locale'}]);await assert.rejects(()=>languageCatalogs(root),/regional/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('selectores traducidos conservan los valores booleanos y opciones técnicas que se guardan',async()=>{
  const config=await languageCatalogs();
  for(const id of ['es','en']){
    const language=resolveLanguage(config,id);const t=(text:string)=>translate(language,text);
    const html=renderToStaticMarkup(React.createElement(FieldSelect,{value:'true',onChange:()=>{},label:'Test',boolean:true,t}));
    assert.ok(html.includes(`<option value="true" selected="">${t('Verdadero')}</option>`));
    assert.ok(html.includes(`<option value="false">${t('Falso')}</option>`));
    const technical=renderToStaticMarkup(React.createElement(FieldSelect,{value:'monster',onChange:()=>{},boolean:false,options:['monster','spell'],t}));
    assert.ok(technical.includes('<option value="monster" selected="">monster</option>'));
  }
});
