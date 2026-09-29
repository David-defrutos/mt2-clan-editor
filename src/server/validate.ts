import fs from 'node:fs/promises';
import path from 'node:path';
import { inventoryAssets } from './assets.js';
import { configRoot } from './paths.js';
import type { ClanSnapshot, Issue, JsonRecord } from './types.js';

interface Rules {
  expectedChampions: number; expectedPathsPerChampion: number; expectedLevelsPerPath: number;
  minimumStarterCards: number; minEmber: number; maxEmber: number;
  maxNormalUnlockLevel: number; technicalUnlockLevels: number[]; draftPools: string[];
  externalReferencePaths: string[];
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function refs(value: unknown): string[] { return array(value).filter((item): item is string => typeof item === 'string'); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }

export async function validateClan(clan: ClanSnapshot): Promise<Issue[]> {
  const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'validation.json'), 'utf8')) as Rules;
  const issues = [...clan.issues];
  const add = (severity: Issue['severity'], code: string, message: string, file?: string, section?: string, id?: string) => issues.push({ severity, code, message, file, section, id });
  const classEntry = clan.entries.find(entry => entry.section === 'classes');
  const champions = array(classEntry?.data.champions);
  const ids = new Map(clan.entries.map(entry => [`${entry.section}:${entry.id}`, entry]));
  const localIds = new Set(clan.entries.map(entry => entry.id));
  const externalPaths = new Set(rules.externalReferencePaths);
  function checkReferences(entry: ClanSnapshot['entries'][number], value: unknown, fields: string[] = []): void {
    const field = [entry.section, ...fields].join('.');
    if (typeof value === 'string') {
      if (value.startsWith('@') && !externalPaths.has(field) && !localIds.has(value.slice(1)) &&
          !['classes.champions.card_data', 'classes.champions.starter_card'].includes(field)) {
        add('error', 'local-reference', `${entry.id}: ${field} apunta a ${value}, que no existe en el clan.`, entry.file, entry.section, entry.id);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) checkReferences(entry, item, fields);
    } else if (value && typeof value === 'object') {
      const object = record(value);
      for (const [key, item] of Object.entries(object)) {
        if (key === 'id' && typeof object.mod_reference === 'string') continue;
        checkReferences(entry, item, [...fields, key]);
      }
    }
  }
  for (const entry of clan.entries) checkReferences(entry, entry.data);
  if (classEntry && champions.length !== rules.expectedChampions) add('warning', 'champion-count', `Se esperaban ${rules.expectedChampions} campeones y hay ${champions.length}.`, classEntry.file, 'classes', classEntry.id);
  for (const candidate of champions) {
    const champion = record(candidate);
    const name = String(champion.id ?? 'sin ID');
    const trees = array(champion.upgrade_tree);
    if (trees.length !== rules.expectedPathsPerChampion) add('warning', 'path-count', `${name} tiene ${trees.length} sendas; se esperaban ${rules.expectedPathsPerChampion}.`, classEntry?.file, 'classes', classEntry?.id);
    trees.forEach((tree, index) => {
      if (array(tree).length !== rules.expectedLevelsPerPath) add('warning', 'path-levels', `${name}, senda ${index + 1}: ${array(tree).length} niveles.`, classEntry?.file, 'classes', classEntry?.id);
    });
    for (const field of ['card_data', 'starter_card']) {
      const value = champion[field];
      if (typeof value === 'string' && value.startsWith('@') && !ids.has(`cards:${value.slice(1)}`)) add('error', 'champion-reference', `${name}: ${field} apunta a ${value}, que no existe.`, classEntry?.file, 'classes', classEntry?.id);
    }
  }
  const cards = clan.entries.filter(entry => entry.section === 'cards');
  const starterIds = new Set(champions.map(candidate => record(candidate).starter_card).filter(value => typeof value === 'string'));
  if (starterIds.size < rules.minimumStarterCards) add('warning', 'starter-count', `Se encontraron ${starterIds.size} cartas iniciales distintas; se esperaban al menos ${rules.minimumStarterCards}.`, classEntry?.file);
  for (const card of cards) {
    const cost = card.data.cost;
    if (typeof cost === 'number' && (cost < rules.minEmber || cost > rules.maxEmber)) add('warning', 'ember-range', `Coste de ember fuera de ${rules.minEmber}–${rules.maxEmber}: ${cost}.`, card.file, 'cards', card.id);
    const unlock = card.data.unlock_level;
    if (unlock !== undefined && (!Number.isInteger(unlock) || (unlock as number) < 0)) add('error', 'unlock-level', 'El nivel de desbloqueo debe ser un entero no negativo.', card.file, 'cards', card.id);
    else if (typeof unlock === 'number' && unlock > rules.maxNormalUnlockLevel && !rules.technicalUnlockLevels.includes(unlock)) add('warning', 'unlock-outside-range', `Nivel ${unlock} fuera del rango normal.`, card.file, 'cards', card.id);
    if (starterIds.has('@' + card.id) && typeof unlock === 'number' && unlock > 0) add('error', 'starter-locked', 'Una carta inicial no debe quedar bloqueada por nivel.', card.file, 'cards', card.id);
    if (card.data.card_type === 'monster' && typeof card.data.effects !== 'object') add('info', 'monster-effect', 'Carta de unidad sin efectos declarados.', card.file, 'cards', card.id);
  }
  const assets = await inventoryAssets(clan);
  for (const asset of assets) if (asset.status !== 'ok') add(asset.status === 'case-mismatch' ? 'warning' : 'error', 'asset-' + asset.status, `${asset.id}: ${asset.image || 'sin ruta'} (${asset.status}).`, asset.file, 'sprites', asset.id);
  return issues;
}
