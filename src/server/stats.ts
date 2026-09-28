import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';
import { sectionEntries } from './scan.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';

interface Rules { draftPools: string[]; starterPool: string; bannerPool: string; rarities: string[]; types: string[]; progressionMaxLevel: number }

export async function loadStatsRules(): Promise<Rules> {
  return JSON.parse(await fs.readFile(path.join(configRoot, 'stats.json'), 'utf8')) as Rules;
}

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []; }

function isAbility(card: Entry): boolean { return card.data.is_an_ability === true; }

function isDraft(card: Entry, rules: Rules): boolean {
  return !isAbility(card) && card.data.rarity !== 'champion' && strings(card.data.pools).some(pool => rules.draftPools.includes(pool));
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
  const numbers = (key: string) => characters.map(item => item.data[key]).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  const measure = (list: number[]) => list.length ? { min: list[0], median: list[Math.floor(list.length / 2)], max: list[list.length - 1] } : null;
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
