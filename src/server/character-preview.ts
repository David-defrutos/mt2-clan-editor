import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import { inventoryAssets } from './assets.js';
import { configRoot, dataRoot, inside, keyForPath, projectRoot } from './paths.js';
import { scanClan } from './scan.js';
import type { ClanSnapshot, Entry } from './types.js';

interface Control { id: string; path: string; label: string; default: number; min: number; max: number; step: number }
interface Viewport { width: number; height: number; originX: number; originY?: number; floorY: number; pixelsPerUnit: number; pixelsPerUnitY?: number }
interface Rules { extensionPath: string; defaultPixelsPerUnit: number; defaultPivot: { x: number; y: number }; groundHeightMultiplier: number; viewport: Viewport; background?: { file: string; label: string; viewport: Viewport; calibration: string; reference?: Record<string, number>; available?: boolean; projectionOverrides?: { classId: string; artId: string; scaleX?: number; scaleY?: number; offsetY?: number; note: string }[] }; controls: Control[] }
export interface CharacterRequest { root: string; file: string; id: string; expectedHash: string; changes: Record<string, number> }
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const at = (object: unknown, field: string): unknown => field.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined, object);
const number = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const refId = (v: unknown): string | undefined => {
  if (v && typeof v === 'object') { if ((v as Record<string, unknown>).mod_reference) return; v = (v as Record<string, unknown>).id; }
  return typeof v === 'string' && v.startsWith('@') ? v.slice(1) : undefined;
};
export async function characterRules(): Promise<Rules> { return JSON.parse(await fs.readFile(path.join(configRoot, 'character-preview.json'), 'utf8')); }
export async function characterBackground(): Promise<string | undefined> {
  const rules = await characterRules();
  if (!rules.background) return;
  const absolute = path.resolve(projectRoot, rules.background.file);
  if (!inside(dataRoot, absolute) || path.extname(absolute).toLowerCase() !== '.png') throw new Error('El fondo debe ser un PNG dentro de data/.');
  return (await fs.stat(absolute).catch(() => null))?.isFile() ? absolute : undefined;
}
function references(v: unknown, id: string): boolean {
  if (refId(v) === id) return true;
  if (Array.isArray(v)) return v.some(x => references(x, id));
  return Boolean(v && typeof v === 'object' && !(v as Record<string, unknown>).mod_reference && Object.values(v).some(x => references(x, id)));
}
export async function characterModels(clan: ClanSnapshot) {
  const rules = await characterRules();
  if (rules.background) rules.background.available = Boolean(await characterBackground());
  const assets = await inventoryAssets(clan);
  const arts = clan.entries.filter(e => e.section === 'game_objects' && e.data.type === 'character_art');
  const items = arts.map(entry => {
    const extension = at(entry.data, rules.extensionPath);
    const spriteId = refId(at(extension, 'sprite'));
    const matches = clan.entries.filter(e => e.section === 'sprites' && e.id === spriteId);
    const sprite = matches.length === 1 ? matches[0] : undefined;
    const asset = sprite ? assets.find(a => a.id === sprite.id && a.file === sprite.file) : undefined;
    const ppu = number(sprite?.data.pixels_per_unit, rules.defaultPixelsPerUnit);
    const width = asset?.width ?? 0; const height = asset?.height ?? 0;
    const values = Object.fromEntries(rules.controls.map(c => [c.id, number(at(extension, c.path), c.default)]));
    const automaticY = at(extension, 'transform.position.y') === undefined;
    if (automaticY) values.positionY = height / Math.max(ppu, 1) / 2 * rules.groundHeightMultiplier * values.scaleY;
    const warnings: string[] = [];
    if (!sprite || !asset || !['ok', 'case-mismatch'].includes(asset.status) || ppu <= 0) warnings.push('Sprite local sin imagen válida o píxeles por unidad inválidos.');
    if (asset?.status === 'case-mismatch') warnings.push('La ruta de imagen tiene diferencias de mayúsculas; corrígela para Linux.');
    if (at(extension, 'animations')) warnings.push('Se muestra el sprite base; no se reproducen las animaciones.');
    if (at(extension, 'skeleton_animations')) warnings.push('El sprite base no reproduce la geometría ni la alineación de Spine.');
    if (sprite?.data.mesh_type === 'tight') warnings.push('Los límites del mesh tight pueden cambiar la alineación automática en el juego.');
    if (sprite?.data.pixels_per_unit === undefined) warnings.push(`Se asumen ${rules.defaultPixelsPerUnit} píxeles por unidad. Los mods históricos pueden usar otro valor.`);
    const uses = clan.entries.filter(e => e !== entry && references(e.data, entry.id));
    const context = uses.some(e => e.section === 'characters') ? 'battle' : uses.some(e => e.section === 'classes') ? 'selection' : 'other';
    const projection = rules.background?.projectionOverrides?.find(p => p.classId === clan.classId && p.artId === entry.id);
    return { entry, sprite, image: asset?.image, width, height, ppu, pivot: { x: number(at(sprite?.data, 'pivot.x'), rules.defaultPivot.x), y: number(at(sprite?.data, 'pivot.y'), rules.defaultPivot.y) }, values, automaticY, warnings, uses, context, projection, usable: Boolean(sprite && width && height && ppu > 0 && asset && ['ok', 'case-mismatch'].includes(asset.status)) };
  });
  return { rules, items };
}

export async function prepareCharacterTransform(request: CharacterRequest) {
  const rules = await characterRules();
  if (!request.changes || typeof request.changes !== 'object' || Array.isArray(request.changes)) throw new Error('Se necesita un objeto de ajustes.');
  const absolute = path.resolve(request.root, request.file);
  if (!inside(path.join(request.root, 'json'), absolute)) throw new Error('La ruta debe estar dentro de json/ del clan.');
  const clan = await scanClan(request.root);
  const matches = clan.entries.filter(e => e.section === 'game_objects' && e.id === request.id && e.file === request.file && e.data.type === 'character_art');
  if (matches.length !== 1) throw new Error('Selecciona un character art con identidad local única.');
  const entry: Entry = matches[0];
  if (!at(entry.data, rules.extensionPath) || typeof at(entry.data, rules.extensionPath) !== 'object') throw new Error('Falta la extensión de character art.');
  const original = await fs.readFile(absolute, 'utf8');
  if (hash(original) !== request.expectedHash || entry.hash !== request.expectedHash) throw new Error('El archivo cambió en disco. Actualiza el recurso antes de guardar.');
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  let source = bom ? original.slice(1) : original;
  const indent = source.match(/\n(\s+)"/)?.[1] ?? '  ';
  const changes: { label: string; path: string; before: unknown; after: number }[] = [];
  for (const [id, value] of Object.entries(request.changes)) {
    const control = rules.controls.find(c => c.id === id);
    if (!control) throw new Error('Ajuste no permitido.');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error(`${control.label}: valor fuera de rango (${control.min}–${control.max}).`);
    const field = rules.extensionPath + '.' + control.path;
    const before = at(entry.data, field);
    if (before === value) continue;
    const edits = jsonc.modify(source, ['game_objects', entry.index, ...field.split('.')], value, { formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: original.includes('\r\n') ? '\r\n' : '\n' } });
    source = jsonc.applyEdits(source, edits);
    changes.push({ label: control.label, path: field, before, after: value });
  }
  const errors: jsonc.ParseError[] = [];
  jsonc.parse(source, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) throw new Error('El cambio produciría un JSON inválido.');
  const uses = clan.entries.filter(e => e !== entry && references(e.data, entry.id)).map(e => ({ section: e.section, id: e.id, file: e.file }));
  return { changed: changes.length > 0, changes, uses, original, newText: bom + source, oldHash: request.expectedHash };
}
export async function saveCharacterTransform(request: CharacterRequest) {
  const preview = await prepareCharacterTransform(request);
  if (!preview.changed) return { changed: false, hash: preview.oldHash };
  const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root));
  await fs.mkdir(backupRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(backupRoot, 'character-art-'));
  const backup = path.join(directory, request.file);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.writeFile(backup, preview.original, 'utf8');
  const absolute = path.resolve(request.root, request.file);
  const temporary = absolute + `.clan-editor-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, preview.newText, { encoding: 'utf8', flag: 'wx' });
    if (hash(await fs.readFile(absolute, 'utf8')) !== preview.oldHash) throw new Error('El archivo cambió en disco durante el guardado.');
    await fs.rename(temporary, absolute);
  } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  return { changed: true, backup, hash: hash(preview.newText) };
}
