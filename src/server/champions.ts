import fs from 'node:fs/promises';
import path from 'node:path';
import { configRoot } from './paths.js';
import type { ClanSnapshot, Entry, JsonRecord } from './types.js';

export interface ChampionRules {
  maxCombinedLevels: number; maxSelectedPaths: number;
  fields: { champions: string; card: string; starter: string; tree: string; effects: string; character: string };
  spawnEffects: string[];
  stats: { label: string; base: string; bonus: string }[];
  presentationFields: string[];
}
const record = (v: unknown): v is JsonRecord => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export async function championRules(): Promise<ChampionRules> {
  return JSON.parse(await fs.readFile(path.join(configRoot, 'champions.json'), 'utf8'));
}
function resolve(clan: ClanSnapshot, section: string, ref: unknown): Entry | undefined {
  // References belonging to another mod must not accidentally resolve to a local ID.
  if (record(ref) && ref.mod_reference) return undefined;
  const id = record(ref) ? ref.id : ref;
  if (typeof id !== 'string' || !id.startsWith('@')) return undefined;
  const matches = clan.entries.filter(e => e.section === section && e.id === id.slice(1));
  return matches.length === 1 ? matches[0] : undefined;
}
function numeric(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function metadata(v: unknown): boolean { return v === undefined || v === null || v === false || v === 0 || (Array.isArray(v) && v.length === 0); }

export function describeChampions(clan: ClanSnapshot, rules: ChampionRules) {
  return clan.entries.filter(e => e.section === 'classes').flatMap(owner => list(owner.data[rules.fields.champions]).map((raw, index) => {
    const data = record(raw) ? raw : {};
    const warnings: string[] = [];
    const card = resolve(clan, 'cards', data[rules.fields.card]);
    const starter = resolve(clan, 'cards', data[rules.fields.starter]);
    if (!card) warnings.push('Carta de campeón sin referencia local única.');
    const effects = list(card?.data[rules.fields.effects]).map(ref => resolve(clan, 'effects', ref));
    const spawn = effects.filter(e => e && rules.spawnEffects.includes(String(e.data.name)));
    const character = spawn.length === 1 ? resolve(clan, 'characters', spawn[0]?.data[rules.fields.character]) : undefined;
    if (!character) warnings.push('No se puede identificar una única unidad con un efecto de invocación conocido.');
    if (effects.some(e => !e || !rules.spawnEffects.includes(String(e.data.name)))) warnings.push('La carta contiene efectos adicionales o personalizados que no se simulan.');
    if (character && Object.keys(character.data).some(k => /upgrade|trigger|trait|status|modifier|effect/.test(k) && !metadata(character.data[k]))) warnings.push('La unidad tiene habilidades o mejoras iniciales; sus efectos no se simulan.');
    const base = rules.stats.map(stat => ({ label: stat.label, value: numeric(character?.data[stat.base]) }));
    if (base.some(s => s.value === null)) warnings.push('Faltan estadísticas base explícitas; se mostrarán como desconocidas.');
    const paths = list(data[rules.fields.tree]).map((tree, pathIndex) => ({
      name: `Senda ${pathIndex + 1}`,
      levels: list(tree).map((ref, levelIndex) => {
        const entry = resolve(clan, 'upgrades', ref);
        const notices: string[] = [];
        if (!entry) notices.push('Mejora sin referencia local única.');
        const bonuses = rules.stats.map(stat => ({ label: stat.label, value: entry ? entry.data[stat.bonus] === undefined ? 0 : numeric(entry.data[stat.bonus]) : null }));
        if (entry) {
          const extra = Object.keys(entry.data).filter(k => !rules.presentationFields.includes(k) && !rules.stats.some(s => s.bonus === k) && !metadata(entry.data[k]));
          if (extra.length) notices.push(`Campos no simulados: ${extra.join(', ')}.`);
          if (bonuses.some(s => s.value === null)) notices.push('Bonificación numérica inválida.');
        }
        return { level: levelIndex + 1, entry, bonuses, warnings: notices };
      })
    }));
    return { id: String(data.id ?? `${owner.id}[${index}]`), name: character?.name ?? card?.name ?? String(data.id ?? 'Campeón'), owner, card, starter, character, base, paths, warnings };
  }));
}

export function combineChampion(champion: ReturnType<typeof describeChampions>[number], levels: unknown, rules: ChampionRules) {
  if (!Array.isArray(levels) || levels.length !== champion.paths.length || !levels.every((v, i) => Number.isInteger(v) && v >= 0 && v <= champion.paths[i].levels.length)) throw new Error('Selecciona un nivel válido por senda.');
  const chosen = levels as number[];
  if (chosen.reduce((a, b) => a + b, 0) > rules.maxCombinedLevels || chosen.filter(Boolean).length > rules.maxSelectedPaths) throw new Error(`Máximo ${rules.maxCombinedLevels} niveles repartidos entre ${rules.maxSelectedPaths} sendas.`);
  // Only the highest upgrade from each path survives. Never add earlier levels.
  const selected = chosen.flatMap((level, i) => level ? [champion.paths[i].levels[level - 1]] : []);
  return {
    stats: champion.base.map((base, i) => ({ label: base.label, value: base.value === null || selected.some(up => up.bonuses[i].value === null) ? null : base.value + selected.reduce((total, up) => total + up.bonuses[i].value!, 0) })),
    warnings: [...champion.warnings, ...selected.flatMap(up => up.warnings)],
    upgrades: selected.flatMap(up => up.entry ? [up.entry] : [])
  };
}
