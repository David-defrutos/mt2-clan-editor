import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { championRules, describeChampions } from './champions.js';
import { dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import { removeArrayItem } from './pool-editor.js';

export interface TreeChange { path: number; level: number; upgradeId: string }
export interface TreeRequest { root: string; file: string; classId: string; championIndex: number; expectedHash: string; changes: TreeChange[]; structure?: { operation: 'add-path'|'remove-path'|'add-level'|'remove-level'; path: number; upgradeId?: string } }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function prepareChampionTree(request: TreeRequest) {
  const rules = await championRules();
  if (!Array.isArray(request.changes) || request.changes.length > rules.maxTreeChanges) throw new Error(`Se permiten hasta ${rules.maxTreeChanges} cambios del árbol.`);
  const absolute = path.resolve(request.root, request.file);
  if (!inside(path.join(request.root, 'json'), absolute)) throw new Error('La ruta debe estar dentro de json/ del clan.');
  const clan = await scanClan(request.root);
  const matches = clan.entries.filter(e => e.section === 'classes' && e.id === request.classId && e.file === request.file);
  if (matches.length !== 1 || clan.entries.filter(e=>e.section==='classes'&&e.id===request.classId).length!==1) throw new Error('La clase no tiene una identidad única en el clan.');
  const owner = matches[0];
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash || owner.hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el clan antes de guardar.');
  if (!Number.isInteger(request.championIndex) || request.championIndex < 0) throw new Error('Índice de campeón inválido.');
  const champion = describeChampions(clan, rules).find(c => c.owner.file === owner.file && c.owner.index === owner.index && c.championIndex === request.championIndex);
  if (!champion) throw new Error('El campeón ya no existe en esa clase.');
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  let source = bom ? original.slice(1) : original;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const indent = source.match(/\n(\s+)"/)?.[1] ?? '  ';
  const seen = new Set<string>();
  const changes: { path: number; level: number; before: unknown; after: unknown; name: string }[] = [];
  const warnings: string[] = [];
  if (request.structure) {
    if (request.changes.length) throw new Error('Revisa la estructura por separado de las asignaciones.');
    const limits = rules.structure;
    const op = request.structure; const base = ['classes',owner.index,rules.fields.champions,request.championIndex,rules.fields.tree];
    const rawChampions = owner.data[rules.fields.champions] as Record<string,unknown>[];
    const tree = rawChampions[request.championIndex][rules.fields.tree];
    if (tree !== undefined && (!Array.isArray(tree) || !tree.every(Array.isArray))) throw new Error('El árbol está mal formado; no se modifica automáticamente.');
    const paths = (tree ?? []) as unknown[][];
    if (!Number.isInteger(op.path) || op.path < 0) throw new Error('Senda inválida.');
    let next = source;
    const format = { formattingOptions:{insertSpaces:!indent.includes('\t'),tabSize:indent.includes('\t')?1:indent.length,eol} };
    const adding = op.operation==='add-path'||op.operation==='add-level';
    if (adding && clan.entries.filter(e=>e.section==='upgrades'&&e.id===op.upgradeId).length!==1) throw new Error('Selecciona una mejora local única.');
    if (op.operation==='add-path') {
      if(paths.length>=limits.maxPaths)throw new Error('Ya se alcanzó el máximo de sendas.');
      const value=Array.from({length:limits.maxLevels},()=>'@'+op.upgradeId);
      next=jsonc.applyEdits(source,jsonc.modify(source,base,[...paths,value],format));
      changes.push({path:paths.length,level:0,before:undefined,after:JSON.stringify(value),name:'Nueva senda'});
      warnings.push('La senda nueva utiliza inicialmente la misma mejora en todos sus niveles. Asigna después las mejoras definitivas.');
    } else {
      const levels=paths[op.path];if(!levels)throw new Error('La senda no existe.');
      if(op.operation==='remove-path') next=removeArrayItem(source,base,op.path);
      else if(op.operation==='add-level') {if(levels.length>=limits.maxLevels)throw new Error('Ya se alcanzó el máximo de niveles.');next=jsonc.applyEdits(source,jsonc.modify(source,[...base,op.path],[...levels,'@'+op.upgradeId],format));}
      else if(op.operation==='remove-level'){if(!levels.length)throw new Error('La senda no tiene niveles.');next=removeArrayItem(source,[...base,op.path],levels.length-1);}
      else throw new Error('Operación de estructura inválida.');
      changes.push({path:op.path,level:Math.max(0,levels.length-1),before:levels,after:op.operation,name:'Estructura de senda'});
    }
    warnings.push('Solo cambian referencias del árbol; las definiciones de mejoras no se eliminan. Valida la estructura de tres sendas y tres niveles antes de jugar.');
    const errors: jsonc.ParseError[]=[];jsonc.parse(next,errors,{allowTrailingComma:true});if(errors.length)throw new Error('El árbol produciría JSON inválido.');
    return {changed:next!==source,file:request.file,champion:champion.name,changes,warnings,newText:bom+next,original,oldHash:request.expectedHash};
  }
  for (const change of request.changes) {
    if (!change || !Number.isInteger(change.path) || !Number.isInteger(change.level) || change.path < 0 || change.level < 0) throw new Error('Posición de senda o nivel inválida.');
    const slot = champion.paths[change.path]?.levels[change.level];
    if (!slot) throw new Error('La posición no existe en el árbol actual.');
    const position = `${change.path}:${change.level}`;
    if (seen.has(position)) throw new Error('Hay cambios duplicados para el mismo nivel.');
    seen.add(position);
    const targets = clan.entries.filter(e => e.section === 'upgrades' && e.id === change.upgradeId);
    if (typeof change.upgradeId !== 'string' || targets.length !== 1) throw new Error('Selecciona una mejora local con ID único.');
    // Keep structured references and their extra properties when the same upgrade is selected.
    if (slot.entry?.id === change.upgradeId) continue;
    const after = slot.reference && typeof slot.reference==='object' && !Array.isArray(slot.reference) && !(slot.reference as Record<string,unknown>).mod_reference ? {...slot.reference,id:'@'+change.upgradeId} : '@' + change.upgradeId;
    const edits = jsonc.modify(source, ['classes', owner.index, rules.fields.champions, request.championIndex, rules.fields.tree, change.path, change.level], after, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol } });
    if (!edits.length) throw new Error('No se pudo preparar el cambio del árbol.');
    source = jsonc.applyEdits(source, edits);
    changes.push({ path: change.path, level: change.level, before: slot.reference, after, name: targets[0].name });
    const usages = describeChampions(clan, rules).flatMap(c => c.paths.flatMap(p => p.levels.filter(l => l.entry?.id === change.upgradeId).map(() => c.name)));
    if (usages.length) warnings.push(`${targets[0].name} ya se usa en ${[...new Set(usages)].join(', ')}. Editar esa mejora modificará todas sus referencias.`);
  }
  const errors: jsonc.ParseError[] = [];
  jsonc.parse(source, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) throw new Error('El cambio produciría un JSON inválido.');
  const selected = champion.paths.flatMap((p, i) => p.levels.map((slot, j) => {
    const after=changes.find(c=>c.path===i&&c.level===j)?.after;
    return after && typeof after==='object' ? (after as Record<string,unknown>).id : after ?? (slot.entry ? '@'+slot.entry.id : JSON.stringify(slot.reference));
  }));
  if (new Set(selected).size !== selected.length) warnings.push('El árbol contiene mejoras repetidas. Comprueba que sea intencional.');
  return { changed: changes.length > 0, file: request.file, champion: champion.name, changes, warnings: [...new Set(warnings)], newText: bom + source, original, oldHash: request.expectedHash };
}

export async function saveChampionTree(request: TreeRequest) {
  const preview = await prepareChampionTree(request);
  if (!preview.changed) return { changed: false, hash: preview.oldHash };
  const absolute = path.resolve(request.root, request.file);
  const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root));
  await fs.mkdir(backupRoot, { recursive: true });
  const folder = await fs.mkdtemp(path.join(backupRoot, 'champion-tree-'));
  const backup = path.join(folder, request.file);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.writeFile(backup, preview.original, 'utf8');
  const temporary = absolute + `.clan-editor-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, preview.newText, { encoding: 'utf8', flag: 'wx' });
    if (hash(await fs.readFile(absolute, 'utf8')) !== preview.oldHash) throw new Error('El archivo cambió en disco durante el guardado. Actualiza el clan.');
    await fs.rename(temporary, absolute);
  } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  return { changed: true, backup, hash: hash(preview.newText) };
}
