import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { configRoot } from './paths.js';

interface Template {
  schemaUrl: string; classPrefix: string; championCardPrefix: string; starterCardPrefix: string; draftCardPrefix: string; upgradePrefix: string;
  mainPool: string; starterPool: string; bannerPool: string; defaultCardCost: number;
  defaultAttack: number; defaultHealth: number; defaultSize: number; placeholderArt: Record<string, [number, number]>;
  defaultDraftCards: number; maxDraftCards: number; championSubtype: string;
  classSelectTransform: { position: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } };
  uiColor: { r: number; g: number; b: number }; uiColorDark: { r: number; g: number; b: number };
  banner: { unitCount: number; unitSubtype: string; rewardCost: number; draftOptionsCount: number; rarityFloor: string; classType: string; ignoreRelicRarityOverride: boolean; isServiceMerchantReward: boolean; mapNodePools: string[] };
  defaultPathBonusDamage: number[]; defaultPathBonusHealth: number[]; rarityCycle: string[];
  package: { namespace: string; version: string; dependencies: string[]; targetFramework: string; trainworksVersion: string };
}
export interface CreateRequest { destination: string; name: string; id: string; author: string; champions: [string, string]; starters: [string, string]; draftCount: number }
function name(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /[\r\n]/.test(trimmed)) throw new Error(`${label} debe tener de 1 a 80 caracteres en una línea.`);
  return trimmed;
}
function render(source: string, values: Record<string, string>): string { return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? (() => { throw new Error(`Falta la plantilla ${key}.`); })()); }

export async function createClan(request: CreateRequest): Promise<string> {
  const template = JSON.parse(await fs.readFile(path.join(configRoot, 'templates', 'new-clan.json'), 'utf8')) as Template;
  if (!/^\d+\.\d+\.\d+$/.test(template.package.trainworksVersion)) throw new Error('La versión de Trainworks del generador debe tener el formato mayor.menor.parche.');
  const dependencies = template.package.dependencies.map(dependency => render(dependency, { trainworksVersion: template.package.trainworksVersion }));
  if (dependencies.filter(dependency => dependency.startsWith('MT2-Trainworks_Reloaded-')).length !== 1 || !dependencies.includes(`MT2-Trainworks_Reloaded-${template.package.trainworksVersion}`)) throw new Error('La dependencia de Trainworks y la versión del proyecto generado deben coincidir.');
  const clanName = name(request.name, 'El nombre');
  const author = name(request.author, 'El autor');
  if (!/^[A-Za-z][A-Za-z0-9_]{2,39}$/.test(request.id)) throw new Error('El ID debe tener 3–40 letras, cifras o guiones bajos, y empezar por letra.');
  if (!Number.isInteger(request.draftCount) || request.draftCount < template.banner.unitCount || request.draftCount > template.maxDraftCards) throw new Error(`El número de cartas debe estar entre ${template.banner.unitCount} y ${template.maxDraftCards} para incluir las unidades de estandarte.`);
  const championNames = request.champions.map((value, index) => name(value, `Campeón ${index + 1}`));
  const starterNames = request.starters.map((value, index) => name(value, `Inicial ${index + 1}`));
  const root = path.resolve(request.destination);
  if (!path.isAbsolute(request.destination) || root === path.parse(root).root) throw new Error('Elige una carpeta de destino absoluta y nueva.');
  if (await fs.stat(root).catch(() => null)) throw new Error('La carpeta de destino ya existe. Elige una carpeta nueva.');
  if (!(await fs.stat(path.dirname(root)).catch(() => null))?.isDirectory()) throw new Error('La carpeta contenedora no existe.');

  const classId = template.classPrefix + request.id;
  const draftPoolId = `${request.id}DraftPool`;
  const bannerPoolId = `${request.id}BannerPool`;
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
  function sprite(base: string, size: string, color: string): string {
    const id = unique(base);
    const image = `textures/${id}.png`;
    const [width, height] = template.placeholderArt[size];
    sprites.push({ id, path: image });
    art.push({ path: image, width, height, color });
    return id;
  }
  function visual(base: string, type: string, size: string, color: string): { objectId: string; spriteId: string } {
    const objectId = unique(base + 'Art');
    const spriteId = sprite(base + 'Sprite', size, color);
    gameObjects.push({ id: objectId, type, extensions: { [type]: { sprite: '@' + spriteId } } });
    return { objectId, spriteId };
  }
  function unitCard(cardId: string, label: string, rarity: string, pools: string[], color: string, subtype?: string) {
    const characterId = unique(cardId + 'Character');
    const effectId = unique(cardId + 'SpawnEffect');
    const cardArt = visual(cardId + 'Card', 'card_art', 'card', color);
    const characterArt = visual(cardId + 'Character', 'character_art', 'character', color);
    cards.push({ id: cardId, card_art: '@' + cardArt.objectId, cost: template.defaultCardCost, card_type: 'monster', rarity, class: '@' + classId, targets_room: true, targetless: false, effects: ['@' + effectId], pools });
    characters.push({ id: characterId, names: { english: label }, character_art: '@' + characterArt.objectId, size: template.defaultSize, attack_damage: template.defaultAttack, health: template.defaultHealth, ...(subtype ? { subtypes: [subtype] } : {}) });
    effects.push({ id: effectId, name: 'CardEffectSpawnMonster', target_mode: 'room', param_character: '@' + characterId });
    return { characterArt, characterId };
  }
  const champions = championNames.map((label, index) => {
    const cardId = unique(template.championCardPrefix + request.id + (index + 1));
    const { characterArt } = unitCard(cardId, label, 'champion', [], index ? '#425f75' : '#795c47', template.championSubtype);
    const paths = Array.from({ length: 3 }, (_, pathIndex) => Array.from({ length: 3 }, (_, levelIndex) => {
      const id = unique(`${template.upgradePrefix}${request.id}_${index + 1}_${pathIndex + 1}_${levelIndex + 1}`);
      upgrades.push({ id, titles: { english: `${label} · Senda ${pathIndex + 1} · ${levelIndex + 1}` }, descriptions: { english: 'Mejora inicial editable.' }, bonus_damage: pathIndex === 0 ? template.defaultPathBonusDamage[levelIndex] : 0, bonus_hp: pathIndex === 1 ? template.defaultPathBonusHealth[levelIndex] : 0 });
      return '@' + id;
    }));
    const prefix = `${request.id}Champion${index + 1}`;
    const icon = sprite(prefix + 'Icon', 'championIcon', '#a98565');
    const lockedIcon = sprite(prefix + 'LockedIcon', 'championIcon', '#596070');
    const portrait = sprite(prefix + 'Portrait', 'championPortrait', '#947564');
    const displayId = unique(prefix + 'ClassDisplayCharacterArt');
    gameObjects.push({ id: displayId, type: 'character_art', extensions: { character_art: { sprite: '@' + characterArt.spriteId, transform: template.classSelectTransform } } });
    return { id: prefix, card_data: '@' + cardId, starter_card: '', upgrade_tree: paths, icon: '@' + icon, locked_icon: '@' + lockedIcon, portrait: '@' + portrait, display: '@' + displayId };
  });
  starterNames.forEach((label, index) => {
    const id = unique(template.starterCardPrefix + request.id + (index + 1));
    unitCard(id, label, 'common', [template.starterPool], '#557062');
    champions[index].starter_card = '@' + id;
  });
  for (let index = 0; index < request.draftCount; index++) {
    const id = unique(template.draftCardPrefix + request.id + (index + 1));
    const banner = index < template.banner.unitCount;
    const rarity = banner ? template.banner.rarityFloor : template.rarityCycle[index % template.rarityCycle.length];
    const pools = banner ? [template.bannerPool, '@' + bannerPoolId] : [template.mainPool, '@' + draftPoolId];
    unitCard(id, `Carta ${index + 1}`, rarity, pools, '#57546f', banner ? template.banner.unitSubtype : undefined);
  }
  const clanIcons = {
    small: sprite(request.id + 'ClanSmallIcon', 'clanSmall', '#9c744f'),
    medium: sprite(request.id + 'ClanMediumIcon', 'clanMedium', '#9c744f'),
    large: sprite(request.id + 'ClanLargeIcon', 'clanLarge', '#9c744f'),
    silhouette: sprite(request.id + 'ClanSilhouetteIcon', 'clanSilhouette', '#ffffff')
  };
  const draftIcon = sprite(request.id + 'CardDraftIcon', 'cardDraft', '#b69362');
  const frameSprites = {
    unit: sprite(request.id + 'UnitFrame', 'cardFrame', '#987b55'),
    spell: sprite(request.id + 'SpellFrame', 'cardFrame', '#806899'),
    equipmentRoom: sprite(request.id + 'EquipmentRoomFrame', 'cardFrame', '#648781')
  };
  const cardStyleId = unique(request.id + 'CardStyle');
  const mapIconId = unique(request.id + 'BannerMapIcon');
  const mapStates = {
    disabled_sprite: sprite(request.id + 'BannerDisabled', 'mapIcon', '#555555'),
    enabled_sprite: sprite(request.id + 'BannerEnabled', 'mapIcon', '#b39359'),
    frozen_sprite: sprite(request.id + 'BannerFrozen', 'mapIcon', '#b8c9d2'),
    visited_sprite_disabled: sprite(request.id + 'BannerVisited', 'mapIcon', '#65625c')
  };
  gameObjects.push({ id: mapIconId, type: 'map_node_icon', extensions: { map_node_icon: Object.fromEntries(Object.entries(mapStates).map(([key, id]) => [key, '@' + id])) } });
  const mapSprite = sprite(request.id + 'BannerMapSprite', 'mapIcon', '#aa8750');
  const minimapSprite = sprite(request.id + 'BannerMinimapSprite', 'mapIcon', '#d4bc87');
  const rewardId = unique(request.id + 'BannerReward');
  const clanJson = { $schema: template.schemaUrl,
    classes: [{ id: classId, titles: { english: clanName }, descriptions: { english: `${clanName}: descripción pendiente.` }, subclass_descriptions: { english: `${clanName}: descripción aliada pendiente.` }, icons: Object.fromEntries(Object.entries(clanIcons).map(([key, id]) => [key, '@' + id])), card_draft_icon: '@' + draftIcon, class_select_character_displays: champions.map(champion => champion.display), card_style: '@' + cardStyleId, ui_color: template.uiColor, ui_color_dark: template.uiColorDark, ui_gradient: [{ time: 0, color: template.uiColor }, { time: 1, color: template.uiColorDark }], champions: champions.map(({ display, ...champion }) => champion) }],
    class_card_styles: [{ id: cardStyleId, unit_card_frame_sprite: '@' + frameSprites.unit, spell_card_frame_sprite: '@' + frameSprites.spell, equipment_card_frame_sprite: '@' + frameSprites.equipmentRoom, room_card_frame_sprite: '@' + frameSprites.equipmentRoom }],
    card_pools: [{ id: draftPoolId }, { id: bannerPoolId }],
    map_nodes: [{ id: unique(request.id + 'BannerMapNode'), type: 'reward', map_icon: '@' + mapSprite, minimap_icon: '@' + minimapSprite, prefab: '@' + mapIconId, titles: { english: `${clanName} Banner` }, descriptions: { english: `Gain a ${clanName} unit.` }, pools: template.banner.mapNodePools, is_banner_node: true, extensions: [{ reward: { class: '@' + classId, rewards: ['@' + rewardId] } }] }],
    rewards: [{ id: rewardId, type: 'draft', costs: [template.banner.rewardCost], extensions: [{ draft: { draft_pool: '@' + bannerPoolId, class_type: template.banner.classType, draft_options_count: template.banner.draftOptionsCount, rarity_floor: template.banner.rarityFloor, ignore_relic_rarity_override: template.banner.ignoreRelicRarityOverride, is_service_merchant_reward: template.banner.isServiceMerchantReward } }] }],
    upgrades };
  const cardsJson = { $schema: template.schemaUrl, cards, characters, effects, sprites, game_objects: gameObjects };
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
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ namespace: author, name: request.id, description: clanName, version_number: template.package.version, dependencies, website_url: '' }, null, 2) + '\n');
    await fs.writeFile(path.join(root, 'README.md'), `# ${clanName}\n\nProyecto inicial creado por Clan Editor. Las imágenes de color son marcadores pendientes de sustituir. Revisa cartas, pools, recompensas y mecánicas antes de usarlo en el juego.\n\n## Requisitos y compilación\n\nRequiere Trainworks Reloaded ${template.package.trainworksVersion} o posterior para cargar el mod. El proyecto C# compila contra ${template.package.trainworksVersion}; ambas referencias proceden de la configuración del generador. Las mecánicas externas que añadas, como Conductor, necesitan su dependencia correspondiente en manifest.json.\n\nCompila con dotnet build src/${request.id}.Plugin.csproj -c Release. La restauración de GitHub Packages requiere autenticación con permiso read:packages. También puedes usar Compilar con DLL instaladas desde el editor si has configurado las referencias locales. Compilar no confirma que el clan funcione en partida: revisa selección de campeones, cartas, pools y recompensas dentro del juego.\n`);
    return root;
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}
