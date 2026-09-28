import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { configRoot } from './paths.js';

interface Template {
  schemaUrl: string; classPrefix: string; championCardPrefix: string; starterCardPrefix: string; draftCardPrefix: string; upgradePrefix: string;
  mainPool: string; starterPool: string; bannerPool: string; defaultCardStyle: string; defaultCardCost: number;
  defaultAttack: number; defaultHealth: number; defaultSize: number; placeholderArt: { card: number[]; character: number[]; icon: number[] };
  defaultPathBonusDamage: number[]; defaultPathBonusHealth: number[]; rarityCycle: string[];
  package: { namespace: string; version: string; dependencies: string[]; targetFramework: string; trainworksVersion: string };
}
export interface CreateRequest { destination: string; name: string; id: string; author: string; champions: [string, string]; starters: [string, string]; draftCount: number }
function name(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /[\r\n]/.test(trimmed)) throw new Error(`${label} debe tener de 1 a 80 caracteres en una línea.`);
  return trimmed;
}
function token(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, ''); }
function render(source: string, values: Record<string, string>): string { return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? (() => { throw new Error(`Falta la plantilla ${key}.`); })()); }

export async function createClan(request: CreateRequest): Promise<string> {
  const template = JSON.parse(await fs.readFile(path.join(configRoot, 'templates', 'new-clan.json'), 'utf8')) as Template;
  const clanName = name(request.name, 'El nombre');
  const author = name(request.author, 'El autor');
  if (!/^[A-Za-z][A-Za-z0-9_]{2,39}$/.test(request.id)) throw new Error('El ID debe tener 3–40 letras, cifras o guiones bajos, y empezar por letra.');
  if (!Number.isInteger(request.draftCount) || request.draftCount < 0 || request.draftCount > 200) throw new Error('El número de cartas debe estar entre 0 y 200.');
  const championNames = request.champions.map((value, index) => name(value, `Campeón ${index + 1}`));
  const starterNames = request.starters.map((value, index) => name(value, `Inicial ${index + 1}`));
  const root = path.resolve(request.destination);
  if (!path.isAbsolute(request.destination) || root === path.parse(root).root) throw new Error('Elige una carpeta de destino absoluta y nueva.');
  if (await fs.stat(root).catch(() => null)) throw new Error('La carpeta de destino ya existe. Elige una carpeta nueva.');
  if (!(await fs.stat(path.dirname(root)).catch(() => null))?.isDirectory()) throw new Error('La carpeta contenedora no existe.');

  const classId = template.classPrefix + request.id;
  const cards: Record<string, unknown>[] = [];
  const characters: Record<string, unknown>[] = [];
  const effects: Record<string, unknown>[] = [];
  const upgrades: Record<string, unknown>[] = [];
  const sprites: Record<string, unknown>[] = [];
  const gameObjects: Record<string, unknown>[] = [];
  const art: { path: string; width: number; height: number; color: string }[] = [];
  const idUsed = new Set<string>();
  function unique(base: string): string {
    let id = base || 'Entry'; let suffix = 2;
    while (idUsed.has(id)) id = base + suffix++;
    idUsed.add(id); return id;
  }
  function unitCard(cardId: string, label: string, rarity: string, pools: string[], color: string) {
    const characterId = unique(cardId + 'Unit');
    const effectId = unique(cardId + 'SpawnEffect');
    const cardArtId = unique(cardId + 'Art');
    const characterArtId = unique(cardId + 'CharacterArt');
    cards.push({ id: cardId, names: { english: label }, card_art: '@' + cardArtId, cost: template.defaultCardCost, card_type: 'monster', rarity, class: '@' + classId, targets_room: true, effects: [{ id: '@' + effectId }], pools });
    characters.push({ id: characterId, names: { english: label }, character_art: '@' + characterArtId, size: template.defaultSize, attack_damage: template.defaultAttack, health: template.defaultHealth });
    effects.push({ id: effectId, name: 'CardEffectSpawnMonster', target_mode: 'room', param_character: '@' + characterId });
    for (const [spriteId, type, dimensions] of [[cardArtId, 'card_art', template.placeholderArt.card], [characterArtId, 'character_art', template.placeholderArt.character]] as const) {
      const image = `textures/${spriteId}.png`;
      sprites.push({ id: spriteId, path: image });
      gameObjects.push({ id: spriteId, type, extensions: { [type]: { sprite: '@' + spriteId } } });
      art.push({ path: image, width: dimensions[0], height: dimensions[1], color });
    }
    return cardId;
  }
  const champions = championNames.map((label, index) => {
    const cardId = unique(template.championCardPrefix + request.id + (index + 1));
    unitCard(cardId, label, 'champion', [], index ? '#425f75' : '#795c47');
    const paths = Array.from({ length: 3 }, (_, pathIndex) => Array.from({ length: 3 }, (_, levelIndex) => {
      const id = unique(`${template.upgradePrefix}${request.id}_${index + 1}_${pathIndex + 1}_${levelIndex + 1}`);
      upgrades.push({ id, titles: { english: `${label} · Senda ${pathIndex + 1} · ${levelIndex + 1}` }, descriptions: { english: 'Mejora inicial editable.' }, bonus_damage: pathIndex === 0 ? template.defaultPathBonusDamage[levelIndex] : 0, bonus_hp: pathIndex === 1 ? template.defaultPathBonusHealth[levelIndex] : 0 });
      return '@' + id;
    }));
    return { id: `${request.id}Champion${index + 1}`, card_data: '@' + cardId, starter_card: '', upgrade_tree: paths };
  });
  starterNames.forEach((label, index) => {
    const id = unique(template.starterCardPrefix + request.id + (index + 1));
    unitCard(id, label, 'common', [template.starterPool], '#557062');
    champions[index].starter_card = '@' + id;
  });
  const draftIds: string[] = [];
  for (let index = 0; index < request.draftCount; index++) {
    const id = unique(template.draftCardPrefix + request.id + (index + 1));
    const rarity = template.rarityCycle[index % template.rarityCycle.length];
    const pools = [template.mainPool, `${request.id}DraftPool`];
    if (index < 2) pools.push(template.bannerPool);
    draftIds.push(unitCard(id, `Carta ${index + 1}`, rarity, pools, '#57546f'));
  }
  const iconId = unique(request.id + 'Icon');
  sprites.push({ id: iconId, path: `textures/${iconId}.png` });
  art.push({ path: `textures/${iconId}.png`, width: template.placeholderArt.icon[0], height: template.placeholderArt.icon[1], color: '#987b55' });
  const clanJson = { $schema: template.schemaUrl,
    classes: [{ id: classId, titles: { english: clanName }, descriptions: { english: `${clanName}: descripción pendiente.` }, icons: { small: '@' + iconId, medium: '@' + iconId, large: '@' + iconId, silhouette: '@' + iconId }, card_style: template.defaultCardStyle, champions }],
    card_pools: [{ id: `${request.id}DraftPool`, cards: draftIds.map(id => '@' + id) }, { id: `${request.id}BannerPool`, cards: draftIds.slice(0, 2).map(id => '@' + id) }],
    upgrades, sprites: sprites.filter(sprite => String(sprite.id) === iconId) };
  const cardsJson = { $schema: template.schemaUrl, cards, characters, effects, sprites: sprites.filter(sprite => String(sprite.id) !== iconId), game_objects: gameObjects };
  const placeholders = { id: request.id, nameLiteral: JSON.stringify(clanName), namespace: `${template.package.namespace}.${request.id}`, targetFramework: template.package.targetFramework, version: template.package.version, trainworksVersion: template.package.trainworksVersion };

  await fs.mkdir(root);
  try {
    for (const folder of ['json', 'textures', 'src', '.github/workflows']) await fs.mkdir(path.join(root, folder), { recursive: true });
    await Promise.all([fs.writeFile(path.join(root, 'json', 'clan.json'), JSON.stringify(clanJson, null, 2) + '\n'), fs.writeFile(path.join(root, 'json', 'cards.json'), JSON.stringify(cardsJson, null, 2) + '\n')]);
    for (const item of art) {
      const image = await sharp({ create: { width: item.width, height: item.height, channels: 4, background: item.color } }).png().toBuffer();
      await fs.writeFile(path.join(root, item.path), image);
    }
    for (const [templateFile, output] of [['Plugin.cs.txt', `src/Plugin.cs`], ['Plugin.csproj.txt', `src/${request.id}.Plugin.csproj`], ['nuget.config.txt', 'src/nuget.config'], ['build.yml.txt', '.github/workflows/build.yml']] as const) {
      const source = await fs.readFile(path.join(configRoot, 'templates', templateFile), 'utf8');
      await fs.writeFile(path.join(root, output), render(source, placeholders));
    }
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ namespace: author, name: request.id, description: clanName, version_number: template.package.version, dependencies: template.package.dependencies, website_url: '' }, null, 2) + '\n');
    await fs.writeFile(path.join(root, 'README.md'), `# ${clanName}\n\nProyecto inicial creado por Clan Editor. Las imágenes de color son marcadores pendientes de sustituir. Revisa cartas, pools, recompensas y mecánicas antes de usarlo en el juego.\n`);
    return root;
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}
