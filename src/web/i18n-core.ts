export interface Language { id: string; label: string; locale: string; messages: Record<string, string> }
export interface LanguageConfig { defaultLanguage: string; storageKey: string; languages: Language[] }
const diagnosticPatterns=new WeakMap<Record<string,string>,{key:string;names:string[];pattern:RegExp}[]>();
function diagnosticValues(language:Language,source:string):{key:string;values:Record<string,string>}|undefined {
 if(source.length>5000)return;
 let patterns=diagnosticPatterns.get(language.messages);
 if(!patterns){patterns=[];for(const key of Object.keys(language.messages)){
  const names:string[]=[];let last=0;let expression='';
  for(const match of key.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)){expression+=key.slice(last,match.index).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([\\s\\S]*?)';names.push(match[1]);last=match.index!+match[0].length;}
  if(!names.length||names.length>6||key.replace(/\{[^}]*\}/g,'').length<5)continue;
  expression+=key.slice(last).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');patterns.push({key,names,pattern:new RegExp('^'+expression+'$')});
 }patterns.sort((a,b)=>b.key.length-a.key.length);diagnosticPatterns.set(language.messages,patterns);}
 for(const item of patterns){const match=source.match(item.pattern);if(match){const values=Object.fromEntries(item.names.map((name,i)=>[name,match[i+1]]));if(item.names.every((name,i)=>values[name]===match[i+1]))return {key:item.key,values};}}
}
export function resolveLanguage(config: LanguageConfig, value: string | null): Language {
  const language = config.languages.find(item => item.id === value)
    ?? config.languages.find(item => item.id === config.defaultLanguage);
  if (!language) throw new Error('No hay un idioma por defecto válido.');
  return language;
}
export function translate(language: Language, source: string, values: Record<string, string | number> = {}): string {
  if(!Object.hasOwn(language.messages,source)&&!Object.keys(values).length){const diagnostic=diagnosticValues(language,source);if(diagnostic)return translate(language,diagnostic.key,diagnostic.values);}
  const message = Object.hasOwn(language.messages, source) ? language.messages[source] : source;
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, key: string) => Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}
export function languagePreference(config: LanguageConfig, storage: Pick<Storage, 'getItem'>): Language {
  try { return resolveLanguage(config, storage.getItem(config.storageKey)); }
  catch { return resolveLanguage(config, null); }
}
export function saveLanguagePreference(config: LanguageConfig, value: string, storage: Pick<Storage, 'setItem'>): Language {
  const selected = resolveLanguage(config, value);
  try { storage.setItem(config.storageKey, selected.id); } catch { /* Keep the selected language usable in this session. */ }
  return selected;
}

// Only use for configured UI labels with an appended slot number, never object names or IDs.
export function indexedLabel(source: string, t: (text: string) => string): string {
  const match = source.match(/^(.+) · (\d+)$/);
  return match ? `${t(match[1])} · ${match[2]}` : t(source);
}
