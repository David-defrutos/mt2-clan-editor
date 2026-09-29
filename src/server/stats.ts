import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';
import { filesUnder, sectionEntries } from './scan.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';

interface Rules { draftPools: string[]; starterPool: string; bannerPool: string; rarities: string[]; types: string[]; progressionMaxLevel: number; technicalUnlockLevels: number[]; metrics: { id: string; label: string }[] }

export async function loadStatsRules(): Promise<Rules> {
  return JSON.parse(await fs.readFile(path.join(configRoot, 'stats.json'), 'utf8')) as Rules;
}

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []; }

function isAbility(card: Entry): boolean { return card.data.is_an_ability === true; }

export function isDraft(card: Entry, rules: Rules): boolean {
  return !isAbility(card) && card.data.rarity !== 'champion' && !rules.technicalUnlockLevels.includes(Number(card.data.unlock_level ?? 0)) && strings(card.data.pools).some(pool => rules.draftPools.includes(pool));
}

export async function summarizeClan(snapshot: ClanSnapshot) {
  const rules = await loadStatsRules();
  const cards = sectionEntries(snapshot, 'cards');
  const characters = sectionEntries(snapshot, 'characters');
  const relics = sectionEntries(snapshot, 'relics');
  const draft = cards.filter(card => isDraft(card, rules));
  const classData = sectionEntries(snapshot, 'classes')[0]?.data;
  const champions = Array.isArray(classData?.champions) ? classData.champions.length : 0;
  const paths = Array.isArray(classData?.champions)
    ? classData.champions.reduce((count: number, champion: unknown) => {
      const trees = (champion as JsonRecord)?.upgrade_tree;
      return count + (Array.isArray(trees) ? trees.length : 0);
    }, 0) : 0;
  const rarity: Record<string, number> = {};
  const types: Record<string, number> = {};
  const unlocks: Record<string, number> = {};
  const costs: Record<string, number> = {};
  for (const card of draft) {
    const r = String(card.data.rarity ?? 'sin rareza');
    const t = String(card.data.card_type ?? 'sin tipo');
    rarity[r] = (rarity[r] ?? 0) + 1;
    types[t] = (types[t] ?? 0) + 1;
    const cost = String(card.data.cost ?? 'sin coste');
    costs[cost] = (costs[cost] ?? 0) + 1;
    const level = String(card.data.unlock_level ?? 0);
    unlocks[level] = (unlocks[level] ?? 0) + 1;
  }
  const numbers = (key: string) => characters.map(item => item.data[key]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  const measure = (list: number[]) => list.length ? { min: list[0], median: (list[Math.floor((list.length - 1) / 2)] + list[Math.floor(list.length / 2)]) / 2, max: list[list.length - 1] } : null;
  return {
    key: snapshot.key, name: snapshot.name, root: snapshot.root,
    files: snapshot.files.length, cards: cards.length, draft: draft.length,
    champions, paths, characters: characters.length, relics: relics.length,
    abilities: cards.filter(isAbility).length,
    starter: cards.filter(card => strings(card.data.pools).includes(rules.starterPool)).length,
    banner: cards.filter(card => strings(card.data.pools).includes(rules.bannerPool)).length,
    rarity, types, unlocks, costs,
    attack: measure(numbers('attack_damage')), health: measure(numbers('health')),
    sprites: snapshot.sections.sprites ?? 0, textureFiles: snapshot.textureCount,
    effects: snapshot.sections.effects ?? 0, triggers: (snapshot.sections.character_triggers ?? 0) + (snapshot.sections.card_triggers ?? 0),
    pools: snapshot.sections.card_pools ?? 0, errors: snapshot.issues.filter(issue => issue.severity === 'error').length
  };
}

export interface StatsItem { name: string; file: string; section?: string; id?: string; value?: number }
export async function statsDetails(snapshot: ClanSnapshot, metric: string) {
  const rules = await loadStatsRules();
  const dynamic = /^(unlocks|costs)\.[^.]+$/.test(metric);
  if (!rules.metrics.some(item => item.id === metric) && !dynamic) throw new Error('Métrica desconocida.');
  const stats = await summarizeClan(snapshot);
  const value = metric.split('.').reduce<unknown>((object, key) => object && typeof object === 'object' ? (object as Record<string, unknown>)[key] : undefined, stats) ?? (metric.startsWith('attack.') || metric.startsWith('health.') ? null : 0);
  const cards = sectionEntries(snapshot, 'cards');
  const draft = cards.filter(card => isDraft(card, rules));
  const asItem = (entry: Entry): StatsItem => ({ name: entry.name, file: entry.file, section: entry.section, id: entry.id });
  let items: StatsItem[] = [];
  let sample = false;
  const sections: Record<string, string[]> = { cards: ['cards'], characters: ['characters'], relics: ['relics'], effects: ['effects'], triggers: ['character_triggers', 'card_triggers'], pools: ['card_pools'], sprites: ['sprites'] };
  if (sections[metric]) items = snapshot.entries.filter(entry => sections[metric].includes(entry.section)).map(asItem);
  else if (metric === 'draft') items = draft.map(asItem);
  else if (metric === 'abilities') items = cards.filter(isAbility).map(asItem);
  else if (metric === 'starter' || metric === 'banner') items = cards.filter(card => strings(card.data.pools).includes(metric === 'starter' ? rules.starterPool : rules.bannerPool)).map(asItem);
  else if (metric === 'files') items = snapshot.files.map(file => ({ name: file, file }));
  else if (metric === 'textureFiles') items = (await filesUnder(path.join(snapshot.root, 'textures'), '.png')).map(file => ({ name: path.basename(file), file: path.relative(snapshot.root, file).replaceAll('\\', '/') }));
  else if (metric === 'errors') items = snapshot.issues.filter(issue => issue.severity === 'error').map(issue => ({ name: issue.message, file: issue.file ?? '', section: issue.section, id: issue.id }));
  else if (metric === 'champions' || metric === 'paths') {
    const classEntry = sectionEntries(snapshot, 'classes')[0];
    for (const champion of (Array.isArray(classEntry?.data.champions) ? classEntry.data.champions : []) as JsonRecord[]) {
      const parent = asItem(classEntry);
      if (metric === 'champions') items.push({ ...parent, name: String(champion.id ?? 'Campeón') });
      else (Array.isArray(champion.upgrade_tree) ? champion.upgrade_tree : []).forEach((_, index) => items.push({ ...parent, name: `${champion.id ?? 'Campeón'} · Senda ${index + 1}` }));
    }
  } else {
    const [group, key] = metric.split('.');
    if (['rarity', 'types', 'unlocks', 'costs'].includes(group)) {
      const field = { rarity: 'rarity', types: 'card_type', unlocks: 'unlock_level', costs: 'cost' }[group]!;
      items = draft.filter(card => String(card.data[field] ?? (group === 'unlocks' ? 0 : group === 'costs' ? 'sin coste' : group === 'types' ? 'sin tipo' : 'sin rareza')) === key).map(asItem);
    } else if (group === 'attack' || group === 'health') {
      const field = group === 'attack' ? 'attack_damage' : 'health';
      sample = key === 'median';
      items = sectionEntries(snapshot, 'characters').filter(entry => typeof entry.data[field] === 'number' && Number.isFinite(entry.data[field]) && (sample || entry.data[field] === value)).map(entry => ({ ...asItem(entry), value: entry.data[field] as number })).sort((a, b) => a.value! - b.value!);
    }
  }
  return { metric, value, sample, items };
}
