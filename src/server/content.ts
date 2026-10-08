import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { configRoot, inside } from './paths.js';
import { scanClan } from './scan.js';
import { poolModel } from './pool-editor.js';
import { poolReferenceRules, localPoolReference, countedPoolReference, invalidCountedPoolReference } from './pool-references.js';
import type { Entry, JsonRecord } from './types.js';

export type ContentSection = 'cards' | 'characters' | 'upgrades' | 'card_pools' | 'rewards' | 'map_nodes' | 'effects' | 'relic_effects' | 'character_triggers' | 'card_triggers' | 'relics';
export interface ContentRequest {
  root: string; section: ContentSection; id: string; name: string;
  kind?: string; poolId?: string; links?:Record<string,string>; source?: { id: string; file: string }; expectedToken?: string;
}
type ObjectTemplate = { warnings?:string[]; label:string; data:JsonRecord; links?:{path:string;label:string;section:string;type?:string;list?:boolean}[] };
type Image = { file: string; width: number; height: number; color: string };
type Rules = { idPattern: string; schemaUrl: string; card: JsonRecord; character: JsonRecord; upgrade: JsonRecord; pool: JsonRecord; objects:Record<string,{label:string;named:boolean;variants:Record<string,ObjectTemplate>}>; rewards: Record<string, { label: string; extension: string; poolField: string; data: JsonRecord }>; poolCopy: { maxReferences: number }; spawnEffect: JsonRecord; images: Record<string, Omit<Image, 'file'>> };
export async function contentTemplates(root:string,section:string){
 const rules=JSON.parse(await fs.readFile(path.join(configRoot,'templates/content.json'),'utf8')) as Rules;
 const item=rules.objects[section];if(!item)return {types:[],named:true,label:section};const clan=await scanClan(root);
 return {named:item.named,label:item.label,types:Object.entries(item.variants).map(([id,v])=>({id,label:v.label,links:(v.links??[]).map(link=>({...link,candidates:clan.entries.filter(e=>e.section===link.section&&(!link.type||e.data.type===link.type)&&clan.entries.filter(x=>x.section===e.section&&x.id===e.id).length===1).map(e=>({id:e.id,name:e.name}))}))}))};
}
function hash(text: string) { return createHash('sha256').update(text).digest('hex'); }
function reference(value: unknown): string | undefined {
  if (typeof value === 'string') return value.startsWith('@') ? value.slice(1) : undefined;
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value as JsonRecord).mod_reference) return reference((value as JsonRecord).id);
}
function replaceReference(value: unknown, id: string): unknown {
  return typeof value === 'string' ? '@' + id : { ...(value as JsonRecord), id: '@' + id };
}
async function token(root: string, config: string): Promise<string> {
  const clan = await scanClan(root);
  const files = await Promise.all(clan.files.map(async file => [file, hash(await fs.readFile(path.join(root, file), 'utf8'))]));
  return hash(JSON.stringify([config, await fs.readFile(path.join(configRoot, 'pool-editor.json'), 'utf8'), await fs.readFile(path.join(configRoot, 'pool-references.json'), 'utf8'), files]));
}
async function safeFolders(root: string, folders: string[]) {
  const realRoot = await fs.realpath(root);
  for (const folder of folders) {
    const real = await fs.realpath(path.join(root, folder));
    if (!inside(realRoot, real)) throw new Error('La carpeta de salida apunta fuera del clan.');
  }
}
export async function prepareContent(request: ContentRequest) {
  const config = await fs.readFile(path.join(configRoot, 'templates/content.json'), 'utf8');
  const rules = JSON.parse(config) as Rules;
  if (!['cards', 'characters', 'upgrades', 'card_pools', 'rewards', ...Object.keys(rules.objects)].includes(request.section)) throw new Error('Sección no permitida.');
  if (!new RegExp(rules.idPattern).test(request.id)) throw new Error('El ID debe tener 3–80 letras, números o guiones bajos y empezar por letra.');
  if (request.section !== 'card_pools' && rules.objects[request.section]?.named !== false && (!request.name?.trim() || request.name.length > 120 || /[\r\n]/.test(request.name))) throw new Error('Introduce un nombre de hasta 120 caracteres en una línea.');
  const currentState = await token(request.root, config);
  const currentToken = hash(JSON.stringify([currentState, request.section, request.id, request.name, request.kind, request.source, request.poolId,request.links]));
  if (request.expectedToken && request.expectedToken !== currentToken) throw new Error('El clan cambió en disco o la solicitud es distinta. Vuelve a previsualizar.');
  const clan = await scanClan(request.root);
  if (clan.issues.some(issue => issue.code === 'json-parse' || issue.code === 'duplicate-id')) throw new Error('Corrige los JSON inválidos o IDs duplicados antes de crear contenido.');
  const document: Record<string, unknown> = { $schema: rules.schemaUrl };
  const images: Image[] = [];
  const warnings: string[] = [];
  let poolCopy: { directReferences: number; addedCards: { id: string; name: string; file: string }[]; uses: { id: string; name: string; file: string; section: string }[] } | undefined;
  const used = new Set(clan.entries.map(entry => entry.id.toLowerCase()));
  function add(section: string, data: JsonRecord) {
    const id = String(data.id);
    if (used.has(id.toLowerCase())) throw new Error(`El ID ya existe: ${id}. Elige otro ID base.`);
    used.add(id.toLowerCase());
    ((document[section] ??= []) as JsonRecord[]).push(data);
  }
  function local(section: string, ref: unknown): Entry {
    const id = reference(ref);
    const matches = clan.entries.filter(entry => entry.section === section && entry.id === id);
    if (matches.length !== 1) throw new Error(`No se puede copiar la referencia ${section}: ${id ?? 'formato desconocido'}. Necesita una definición local única.`);
    return matches[0];
  }
  function named(data: JsonRecord): JsonRecord {
    if(rules.objects[request.section]?.named===false)return data;
    const field = ['upgrades', 'rewards','map_nodes'].includes(request.section) ? 'titles' : 'names';
    const names = typeof data[field] === 'object' && data[field] && !Array.isArray(data[field]) ? data[field] as JsonRecord : {};
    return { ...data, [field]: { ...names, english: request.name.trim() } };
  }
  function art(base: string, type: 'card' | 'character') {
    const sprite = base + 'Sprite'; const object = base + 'Art'; const file = `textures/editor-${sprite}.png`;
    add('sprites', { id: sprite, path: file });
    add('game_objects', { id: object, type: type + '_art', extensions: { [type + '_art']: { sprite: '@' + sprite } } });
    images.push({ file, ...rules.images[type] });
    return '@' + object;
  }
  if (request.source) {
    const source = clan.entries.find(entry => entry.section === request.section && entry.id === request.source!.id && entry.file === request.source!.file);
    if (!source) throw new Error('El objeto de origen ya no existe.');
    const copy = request.section === 'card_pools' ? structuredClone(source.data) : named(structuredClone(source.data)); copy.id = request.id;
    if (request.section === 'card_pools') {
      const sourceId = source.id;
      const countedRules = await poolReferenceRules();
      const poolRef = (value: unknown) => localPoolReference(value, countedRules);
      const invalid = (value: unknown) => invalidCountedPoolReference(value, countedRules);
      if (copy.cards !== undefined && !Array.isArray(copy.cards)) throw new Error('La lista cards del pool de origen no es un array. Revisa su JSON.');
      const members = structuredClone((copy.cards ?? []) as unknown[]);
      if (members.some(invalid)) throw new Error('El pool tiene cantidades inválidas. Revisa su JSON antes de copiar.');
      const directReferences = members.length;
      const addedCards: { id: string; name: string; file: string }[] = [];
      for (const card of clan.entries.filter(e => e.section === 'cards')) {
        if (card.data.pools !== undefined && !Array.isArray(card.data.pools)) throw new Error(`La lista pools de ${card.id} no es válida. No se puede verificar la copia completa.`);
        const memberships = (card.data.pools ?? []) as unknown[];
        if (memberships.some(invalid)) throw new Error(`La lista pools de ${card.id} tiene cantidades inválidas.`);
        const matching = memberships.filter(value => poolRef(value) === '@' + source.id);
        if (!matching.length) continue;
        if (card.data.id !== card.id) throw new Error('Una carta del pool no tiene un ID técnico. Corrígelo antes de copiar.');
        const direct = members.filter(value => poolRef(value) === '@' + card.id);
        // Keep the existing union behaviour for old unweighted pools. Where
        // quantities are present, materialize both sources without losing counts.
        const weighted = [...direct, ...matching].some(value => countedPoolReference(value, countedRules));
        if (direct.length && !weighted) continue;
        if (weighted) {
          for (const membership of matching) {
            if (countedPoolReference(membership, countedRules)) {
              const converted = structuredClone(membership) as JsonRecord;
              const item = converted[countedRules.itemField];
              converted[countedRules.itemField] = typeof item === 'string' ? '@' + card.id : { ...(item as JsonRecord), id: '@' + card.id };
              members.push(converted);
            } else members.push('@' + card.id);
          }
        } else members.push('@' + card.id);
        addedCards.push({ id: card.id, name: card.name, file: card.file });
        if (matching.some(value => !countedPoolReference(value, countedRules) && typeof value === 'object' && value !== null && Object.keys(value).some(key => key !== 'id' && key !== 'mod_reference'))) warnings.push(`La pertenencia de ${card.id} tiene propiedades adicionales en su referencia al pool; quedan en la carta original. La copia incluye la referencia @${card.id}.`);
      }
      if (members.length > rules.poolCopy.maxReferences) throw new Error(`La copia admite hasta ${rules.poolCopy.maxReferences} referencias. Divide el pool o revisa la configuración.`);
      copy.cards = members;
      function refers(value: unknown): boolean {
        if (reference(value) === sourceId) return true;
        if (Array.isArray(value)) return value.some(refers);
        if (value && typeof value === 'object' && !(value as JsonRecord).mod_reference) return Object.values(value).some(refers);
        return false;
      }
      const uses = clan.entries.filter(e => e !== source && refers(e.data)).map(e => ({ id: e.id, name: e.name, file: e.file, section: e.section }));
      poolCopy = { directReferences, addedCards, uses };
      warnings.push(`Se conservan ${directReferences} referencias directas y se añaden ${addedCards.length} cartas declaradas por pertenencia al pool. Las nuevas pertenencias se guardan en cards del pool copiado; los archivos originales no se modifican.`);
      warnings.push('Las cartas siguen compartidas: editar sus estadísticas o mecánicas afecta a ambos pools. Las referencias externas, no resueltas y directas repetidas se conservan para su revisión.');
      warnings.push('La copia no sustituye el pool origen en recompensas, efectos ni estandartes. Los miembros y usos construidos desde C# no se detectan y requieren un adaptador.');
    }
    if (request.section === 'cards') {
      const effects = copy.effects;
      if (copy.card_type === 'monster' && !Array.isArray(effects)) throw new Error('La carta de unidad no declara una lista de efectos de invocación.');
      const clonedEffects = new Map<string, string>(); const clonedCharacters = new Map<string, string>();
      let spawnCount = 0;
      if (Array.isArray(effects)) copy.effects = effects.map(ref => {
        const id = reference(ref);
        const effect = clan.entries.find(entry => entry.section === 'effects' && entry.id === id);
        if (!effect) {
          if (copy.card_type === 'monster') throw new Error('No se puede verificar un efecto externo de esta unidad.');
          return ref;
        }
        if (effect.data.name !== 'CardEffectSpawnMonster') return ref;
        spawnCount++;
        if (!clonedEffects.has(effect.id)) {
          if (effect.data.param_character_pool) throw new Error('La invocación por pool necesita un adaptador antes de duplicarla.');
          const effectCopy = structuredClone(effect.data);
          for (const field of ['param_character', 'param_character_2']) {
            if (field === 'param_character_2' && !effect.data[field]) continue;
            const character = local('characters', effect.data[field]);
            if (!clonedCharacters.has(character.id)) {
              const characterId = request.id + 'Character' + (clonedCharacters.size || '');
              add('characters', { ...named(structuredClone(character.data)), id: characterId });
              clonedCharacters.set(character.id, characterId);
            }
            effectCopy[field] = replaceReference(effect.data[field], clonedCharacters.get(character.id)!);
          }
          const effectId = request.id + 'SpawnEffect' + (clonedEffects.size || '');
          add('effects', { ...effectCopy, id: effectId });
          clonedEffects.set(effect.id, effectId);
        }
        return replaceReference(ref, clonedEffects.get(effect.id)!);
      });
      if (copy.card_type === 'monster' && !spawnCount) throw new Error('Esta unidad usa una invocación personalizada. Requiere un adaptador antes de duplicarla.');
      if (copy.rarity === 'champion') warnings.push('La copia conserva rareza champion, pero no se añade al árbol ni a la selección de campeones.');
    }
    add(request.section, copy);
    if (request.section !== 'card_pools') warnings.push('El arte, las mecánicas y otras referencias conservadas siguen compartidos con el origen. Cambiarlos modifica todos sus usuarios. Los nombres en otros idiomas se conservan y requieren revisión.');
    if (request.section === 'characters') warnings.push('Se crea una definición de unidad; no se añade automáticamente a una carta de invocación.');
    if (request.section === 'upgrades') warnings.push('La copia no se asigna automáticamente al árbol. Conserva bonificaciones, descripciones y referencias; revisa sus valores e idiomas antes de asignarla a una senda.');
    if (request.section === 'rewards') warnings.push('La copia conserva tipo, pool, costes y extensiones. No se añade a nodos ni eventos; sus pools y otras referencias siguen compartidos. Revisa los idiomas conservados.');
  } else {
    if (!clan.classId && request.section === 'cards') throw new Error('No se encontró una clase para la nueva carta.');
    if (rules.objects[request.section]) {
      const template=rules.objects[request.section].variants[request.kind??''];if(!template)throw new Error('Selecciona una plantilla configurada.');
      const data=structuredClone(template.data);
      for(const link of template.links??[]){
        const id=request.links?.[link.path];const matches=clan.entries.filter(e=>e.section===link.section&&e.id===id&&(!link.type||e.data.type===link.type));
        if(matches.length!==1)throw new Error(`Selecciona una referencia local única para ${link.label}.`);
        const parts=link.path.split('.');let node:Record<string,unknown>=data;
        for(const part of parts.slice(0,-1)){if(!node[part]||typeof node[part]!=='object')throw new Error('La plantilla tiene una ruta de enlace inválida.');node=node[part] as Record<string,unknown>;}
        node[parts.at(-1)!]=link.list?['@'+id]:'@'+id;
      }
      if(request.section==='map_nodes' && data.type==='reward')((data.extensions as JsonRecord[])[0].reward as JsonRecord).class='@'+clan.classId;
      add(request.section,{...named(data),id:request.id});
      warnings.push(...(template.warnings ?? []));
      warnings.push('Definición independiente creada desde configuración. Revisa parámetros, referencias, arte y condiciones de aparición antes de usarla en partida.');
    } else if (request.section === 'rewards') {
      const template = rules.rewards[request.kind ?? ''];
      if (!template) throw new Error('Selecciona un tipo de recompensa configurado.');
      const pool = (await poolModel(request.root)).pools.find(p => p.id === request.poolId && p.editable);
      if (!pool) throw new Error('Selecciona un pool del juego configurado o un pool local válido y único.');
      const data = structuredClone(template.data); const extensions = data.extensions;
      if (!Array.isArray(extensions)) throw new Error('La plantilla de recompensa necesita extensiones válidas.');
      const matches = extensions.filter(value => value && typeof value === 'object' && Object.hasOwn(value, template.extension));
      if (matches.length !== 1) throw new Error('La extensión de la plantilla debe aparecer exactamente una vez.');
      const extension = (matches[0] as JsonRecord)[template.extension];
      if (!extension || typeof extension !== 'object' || Array.isArray(extension) || data.type !== request.kind) throw new Error('La plantilla de recompensa no es válida.');
      (extension as JsonRecord)[template.poolField] = pool.id;
      add('rewards', { ...named(data), id: request.id });
      warnings.push('La recompensa usa el pool elegido, pero no se añade automáticamente a ningún nodo o evento. Revisa sus opciones y filtros en Ajustes de la recompensa y prueba su conexión en partida.');
    } else if (request.section === 'card_pools') {
      if (rules.pool.cards !== undefined && (!Array.isArray(rules.pool.cards) || rules.pool.cards.length)) throw new Error('La plantilla de pools debe empezar sin miembros.');
      add('card_pools', { ...structuredClone(rules.pool), id: request.id });
      warnings.push('Pool vacío. Después de crearlo, selecciónalo como @' + request.id + ' en Pools y añade las cartas. No se conecta automáticamente a recompensas, estandartes ni efectos.');
    } else if (request.section === 'upgrades') {
      add('upgrades', { ...structuredClone(rules.upgrade), id: request.id, titles: { english: request.name.trim() } });
      warnings.push('Mejora con bonificaciones iniciales de la plantilla. Edita sus estadísticas y descripción; después asígnala a un nivel en el editor del árbol.');
    } else if (request.section === 'characters') {
      add('characters', { ...rules.character, id: request.id, names: { english: request.name.trim() }, character_art: art(request.id, 'character') });
      warnings.push('Unidad sin carta de invocación. Puedes asignarla a un efecto desde el editor de objetos.');
    } else {
      if (!['spell', 'monster'].includes(request.kind ?? '')) throw new Error('Selecciona hechizo o unidad.');
      const effects: string[] = [];
      if (request.kind === 'monster') {
        const characterId = request.id + 'Character'; const effectId = request.id + 'SpawnEffect';
        add('characters', { ...rules.character, id: characterId, names: { english: request.name.trim() }, character_art: art(request.id + 'Character', 'character') });
        add('effects', { ...rules.spawnEffect, id: effectId, param_character: '@' + characterId }); effects.push('@' + effectId);
      } else warnings.push('El hechizo empieza sin efectos. Asigna su mecánica antes de probarlo en el juego.');
      add('cards', { ...rules.card, id: request.id, names: { english: request.name.trim() }, class: '@' + clan.classId, card_type: request.kind, card_art: art(request.id + 'Card', 'card'), effects });
    }
    if (!['upgrades', 'card_pools', 'rewards'].includes(request.section)) warnings.push('Las imágenes de color son marcadores: sustitúyelas en Recursos visuales. Revisa pools, desbloqueo y validación.');
  }
  const file = `json/editor-${request.id}.json`;
  await safeFolders(request.root, images.length ? ['json', 'textures'] : ['json']);
  for (const output of [file, ...images.map(image => image.file)]) {
    const folder = path.dirname(path.join(request.root, output));
    const exists = (await fs.readdir(folder)).some(name => name.toLowerCase() === path.basename(output).toLowerCase());
    if (exists) throw new Error(`El archivo ya existe: ${output}.`);
  }
  if (await token(request.root, config) !== currentState) throw new Error('El clan cambió durante la preparación. Vuelve a previsualizar.');
  return { file, token: currentToken, state: currentState, document, images, warnings, poolCopy, objects: Object.entries(document).filter(([, value]) => Array.isArray(value)).flatMap(([section, value]) => (value as JsonRecord[]).map(data => ({ section, id: String(data.id) }))) };
}
const saving = new Set<string>();
export async function saveContent(request: ContentRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza antes de guardar.');
  const lock = (await fs.realpath(request.root)).toLowerCase();
  if (saving.has(lock)) throw new Error('Hay otra creación en curso.');
  saving.add(lock);
  const written: string[] = [];
  async function writeNew(file: string, bytes: string | Buffer) {
    const handle = await fs.open(file, 'wx');
    written.push(file);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
  }
  try {
    const preview = await prepareContent(request);
    for (const image of preview.images) {
      const bytes = await sharp({ create: { width: image.width, height: image.height, channels: 4, background: image.color } }).png().toBuffer();
      const file = path.join(request.root, image.file);
      await writeNew(file, bytes);
    }
    const config = await fs.readFile(path.join(configRoot, 'templates/content.json'), 'utf8');
    if (await token(request.root, config) !== preview.state) throw new Error('El clan cambió en disco. Vuelve a previsualizar.');
    const file = path.join(request.root, preview.file);
    await writeNew(file, JSON.stringify(preview.document, null, 2) + '\n');
    return { file: preview.file, id: request.id, section: request.section };
  } catch (error) {
    for (const file of written.reverse()) await fs.rm(file, { force: true });
    throw error;
  } finally { saving.delete(lock); }
}
