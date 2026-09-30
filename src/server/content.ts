import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { configRoot, inside } from './paths.js';
import { scanClan } from './scan.js';
import type { Entry, JsonRecord } from './types.js';

export interface ContentRequest {
  root: string; section: 'cards' | 'characters'; id: string; name: string;
  kind?: 'monster' | 'spell'; source?: { id: string; file: string }; expectedToken?: string;
}
type Image = { file: string; width: number; height: number; color: string };
type Rules = { idPattern: string; schemaUrl: string; card: JsonRecord; character: JsonRecord; spawnEffect: JsonRecord; images: Record<string, Omit<Image, 'file'>> };
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
  return hash(JSON.stringify([config, files]));
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
  if (!['cards', 'characters'].includes(request.section)) throw new Error('Sección no permitida.');
  if (!new RegExp(rules.idPattern).test(request.id)) throw new Error('El ID debe tener 3–80 letras, números o guiones bajos y empezar por letra.');
  if (!request.name?.trim() || request.name.length > 120 || /[\r\n]/.test(request.name)) throw new Error('Introduce un nombre de hasta 120 caracteres en una línea.');
  const clan = await scanClan(request.root);
  if (clan.issues.some(issue => issue.code === 'json-parse' || issue.code === 'duplicate-id')) throw new Error('Corrige los JSON inválidos o IDs duplicados antes de crear contenido.');
  const currentToken = await token(request.root, config);
  if (request.expectedToken && request.expectedToken !== currentToken) throw new Error('El clan cambió en disco. Vuelve a previsualizar.');
  const document: Record<string, unknown> = { $schema: rules.schemaUrl };
  const images: Image[] = [];
  const warnings: string[] = [];
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
    const names = typeof data.names === 'object' && data.names && !Array.isArray(data.names) ? data.names as JsonRecord : {};
    return { ...data, names: { ...names, english: request.name.trim() } };
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
    const copy = named(structuredClone(source.data)); copy.id = request.id;
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
    warnings.push('El arte, las mecánicas y otras referencias conservadas siguen compartidos con el origen. Cambiarlos modifica todos sus usuarios. Los nombres en otros idiomas se conservan y requieren revisión.');
    if (request.section === 'characters') warnings.push('Se crea una definición de unidad; no se añade automáticamente a una carta de invocación.');
  } else {
    if (!clan.classId) throw new Error('No se encontró una clase para la nueva carta.');
    if (request.section === 'characters') {
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
    warnings.push('Las imágenes de color son marcadores: sustitúyelas en Recursos visuales. Revisa pools, desbloqueo y validación.');
  }
  const file = `json/editor-${request.id}.json`;
  await safeFolders(request.root, images.length ? ['json', 'textures'] : ['json']);
  for (const output of [file, ...images.map(image => image.file)]) {
    const folder = path.dirname(path.join(request.root, output));
    const exists = (await fs.readdir(folder)).some(name => name.toLowerCase() === path.basename(output).toLowerCase());
    if (exists) throw new Error(`El archivo ya existe: ${output}.`);
  }
  return { file, token: currentToken, document, images, warnings, objects: Object.entries(document).filter(([, value]) => Array.isArray(value)).flatMap(([section, value]) => (value as JsonRecord[]).map(data => ({ section, id: String(data.id) }))) };
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
    if (await token(request.root, config) !== preview.token) throw new Error('El clan cambió en disco. Vuelve a previsualizar.');
    const file = path.join(request.root, preview.file);
    await writeNew(file, JSON.stringify(preview.document, null, 2) + '\n');
    return { file: preview.file, id: request.id, section: request.section };
  } catch (error) {
    for (const file of written.reverse()) await fs.rm(file, { force: true });
    throw error;
  } finally { saving.delete(lock); }
}
