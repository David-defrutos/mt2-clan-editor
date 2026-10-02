import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import { inventoryAssets } from './assets.js';
import { prepareEdit } from './edit.js';
import type { Entry, JsonRecord } from './types.js';

interface Rule { section: string; path: string; label: string; sourceSection: string; sourceType: string; spritePath: string }
interface Rules { idPattern: string; jsonPrefix: string; imagePrefix: string; maxSprites: number; maxTotalBytes: number; unsupportedFields: string[] }
export interface VisualCopyRequest { root: string; section: string; file: string; id: string; field: string; sourceId: string; newId: string; expectedHash: string; expectedToken?: string }
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const at = (data: unknown, field: string): unknown => field.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord)[key] : undefined, data);
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as JsonRecord; if (object.mod_reference) return; value = object.id; }
  return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : undefined;
}
function references(value: unknown, id: string): boolean {
  if (ref(value) === id) return true;
  if (Array.isArray(value)) return value.some(item => references(item, id));
  return Boolean(value && typeof value === 'object' && !(value as JsonRecord).mod_reference && Object.values(value).some(item => references(item, id)));
}
function containsField(value: unknown, fields: string[]): boolean {
  if (Array.isArray(value)) return value.some(item => containsField(item, fields));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => fields.includes(key) || containsField(item, fields));
}
async function fingerprint(root: string, config: string, ignored: string[] = []) {
  const clan = await scanClan(root);
  const files = await Promise.all(clan.files.filter(file => !ignored.includes(file)).map(async file => [file, digest(await fs.readFile(path.join(root, file), 'utf8'))]));
  return digest(JSON.stringify([config, files]));
}
export async function prepareVisualCopy(request: VisualCopyRequest) {
  const config = await fs.readFile(path.join(configRoot, 'visual-copy.json'), 'utf8');
  const assignmentConfig = await fs.readFile(path.join(configRoot, 'visual-assignments.json'), 'utf8');
  const rules = JSON.parse(config) as Rules;
  const rule = (JSON.parse(assignmentConfig).assignments as Rule[]).find(rule => rule.section === request.section && rule.path === request.field);
  if (!rule) throw new Error('Copia visual no permitida para este campo.');
  if (!new RegExp(rules.idPattern).test(request.newId)) throw new Error('El ID nuevo debe tener 3–60 letras, números o guiones bajos y empezar por letra.');
  const stateBefore = await fingerprint(request.root, config + assignmentConfig);
  const clan = await scanClan(request.root);
  const sourceMatches = clan.entries.filter(entry => entry.section === rule.sourceSection && entry.id === request.sourceId);
  if (sourceMatches.length !== 1 || sourceMatches[0].data.type !== rule.sourceType) throw new Error('El recurso de origen necesita un ID local único y el tipo correcto.');
  const source = sourceMatches[0];
  if (containsField(source.data, rules.unsupportedFields)) throw new Error('El arte Spine necesita un adaptador antes de crear una copia independiente.');
  const baseSprite = ref(at(source.data, rule.spritePath));
  if (!baseSprite) throw new Error('El sprite base no es una referencia local válida.');
  const spriteMatches = new Map<string, Entry[]>();
  for (const sprite of clan.entries.filter(entry => entry.section === 'sprites')) spriteMatches.set(sprite.id, [...(spriteMatches.get(sprite.id) ?? []), sprite]);
  const ids = new Set(clan.entries.map(entry => entry.id.toLowerCase()));
  function claim(id: string) { if (ids.has(id.toLowerCase())) throw new Error(`El ID ya existe: ${id}.`); ids.add(id.toLowerCase()); }
  claim(request.newId);
  const copiedSprites: JsonRecord[] = [];
  const sprites = new Map<string, string>();
  const originalSprites: Entry[] = [];
  function rewrite(value: unknown): unknown {
    const id = ref(value);
    if (id && spriteMatches.has(id)) {
      const matches = spriteMatches.get(id)!;
      if (matches.length !== 1) throw new Error(`Sprite duplicado: ${id}.`);
      if (!sprites.has(id)) {
        if (sprites.size >= rules.maxSprites) throw new Error('La animación supera el límite de sprites configurado.');
        const newId = `${request.newId}Sprite${sprites.size || ''}`;
        claim(newId); sprites.set(id, newId); originalSprites.push(matches[0]);
        copiedSprites.push({ ...structuredClone(matches[0].data), id: newId });
      }
      return typeof value === 'string' ? '@' + sprites.get(id) : { ...(value as JsonRecord), id: '@' + sprites.get(id) };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && (value as JsonRecord).mod_reference) throw new Error('El arte contiene referencias externas; no se puede garantizar una copia independiente.');
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  }
  const object = rewrite(structuredClone(source.data)) as JsonRecord;
  object.id = request.newId;
  if (!sprites.has(baseSprite)) throw new Error('No se encontró el sprite base en el clan.');
  // Animation references must resolve to copied sprites; preserve non-visual unknown fields.
  const extension = at(source.data, rule.spritePath.slice(0, rule.spritePath.lastIndexOf('.')));
  function checkAnimation(value: unknown) {
    if (typeof value === 'string' && value.startsWith('@') && !sprites.has(value.slice(1))) throw new Error(`Referencia de animación no compatible: ${value}.`);
    if (Array.isArray(value)) value.forEach(checkAnimation);
    else if (value && typeof value === 'object') Object.values(value).forEach(checkAnimation);
  }
  if (extension && typeof extension === 'object') checkAnimation((extension as JsonRecord).animations);
  const assets = await inventoryAssets(clan);
  const realRoot = await fs.realpath(request.root);
  const images: { source: string; file: string; bytes: Buffer; hash: string }[] = [];
  const bySource = new Map<string, string>(); let totalBytes = 0;
  for (let index = 0; index < originalSprites.length; index++) {
    const sprite = originalSprites[index];
    const asset = assets.find(asset => asset.section === 'sprites' && asset.id === sprite.id && asset.file === sprite.file);
    if (!asset || asset.status !== 'ok' || asset.format !== 'png') throw new Error(`El sprite ${sprite.id} necesita un PNG local válido con ruta exacta.`);
    const absolute = await fs.realpath(path.resolve(request.root, asset.image));
    if (!inside(realRoot, absolute)) throw new Error('El PNG apunta fuera del clan.');
    if (!bySource.has(absolute)) {
      const bytes = await fs.readFile(absolute); totalBytes += bytes.length;
      if (totalBytes > rules.maxTotalBytes) throw new Error('Las imágenes superan el límite configurado para copiar arte.');
      const file = rules.imagePrefix + String(copiedSprites[index].id) + '.png';
      bySource.set(absolute, file); images.push({ source: absolute, file, bytes, hash: digest(bytes) });
    }
    copiedSprites[index].path = bySource.get(absolute);
  }
  const file = rules.jsonPrefix + request.newId + '.json';
  for (const output of [file, ...images.map(image => image.file)]) {
    const absolute = path.resolve(request.root, output);
    if (!inside(request.root, absolute)) throw new Error('La configuración de salida sale del clan.');
    const folder = await fs.realpath(path.dirname(absolute));
    if (!inside(realRoot, folder)) throw new Error('La carpeta de salida apunta fuera del clan.');
    if ((await fs.readdir(folder)).some(name => name.toLowerCase() === path.basename(output).toLowerCase())) throw new Error(`El archivo ya existe: ${output}.`);
  }
  const edit = await prepareEdit({ root: request.root, section: request.section, file: request.file, id: request.id, field: request.field, value: '@' + request.newId, expectedHash: request.expectedHash });
  const configFingerprint = config + assignmentConfig;
  const state = await fingerprint(request.root, configFingerprint);
  if (state !== stateBefore) throw new Error('El clan cambió mientras se preparaba la copia. Vuelve a previsualizar.');
  const token = digest(JSON.stringify([state, request.section, request.file, request.id, request.field, request.sourceId, request.newId, images.map(image => [image.source, image.hash])]));
  if (request.expectedToken && request.expectedToken !== token) throw new Error('Los JSON, imágenes o ajustes cambiaron. Vuelve a previsualizar la copia.');
  const document = { game_objects: [object], sprites: copiedSprites };
  const sourceUses = clan.entries.filter(entry => entry !== source && references(entry.data, source.id)).map(entry => ({ section: entry.section, id: entry.id, file: entry.file }));
  return { file, token, state, configFingerprint, document, images, edit, sourceUses };
}
const saving = new Set<string>();
export async function saveVisualCopy(request: VisualCopyRequest) {
  if (!request.expectedToken) throw new Error('Previsualiza la copia antes de guardar.');
  const lock = (await fs.realpath(request.root)).toLowerCase();
  if (saving.has(lock)) throw new Error('Hay otra copia visual en curso.');
  saving.add(lock);
  const written: string[] = []; let temporary: string | undefined;
  async function writeNew(file: string, bytes: string | Buffer) {
    const handle = await fs.open(file, 'wx'); written.push(file);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
  }
  try {
    const preview = await prepareVisualCopy(request);
    const backupRoot = path.join(dataRoot, 'backups', keyForPath(request.root));
    await fs.mkdir(backupRoot, { recursive: true });
    const backupDir = await fs.mkdtemp(path.join(backupRoot, 'visual-copy-'));
    const backup = path.join(backupDir, request.file);
    await fs.mkdir(path.dirname(backup), { recursive: true });
    const original = await fs.readFile(path.join(request.root, request.file), 'utf8');
    if (digest(original) !== request.expectedHash) throw new Error('El archivo cambió en disco. Vuelve a previsualizar.');
    await fs.writeFile(backup, original, { flag: 'wx' });
    for (const image of preview.images) await writeNew(path.join(request.root, image.file), image.bytes);
    await writeNew(path.join(request.root, preview.file), JSON.stringify(preview.document, null, 2) + '\n');
    const absolute = path.resolve(request.root, request.file);
    temporary = absolute + `.clan-editor-${randomUUID()}.tmp`;
    await fs.writeFile(temporary, preview.edit.newText, { flag: 'wx' });
    if (await fingerprint(request.root, preview.configFingerprint, [preview.file]) !== preview.state) throw new Error('El clan cambió durante la copia. Vuelve a previsualizar.');
    for (const image of preview.images) if (digest(await fs.readFile(image.source)) !== image.hash) throw new Error('Una imagen cambió durante la copia. Vuelve a previsualizar.');
    await fs.rename(temporary, absolute); temporary = undefined;
    return { file: preview.file, id: request.newId, backup, images: preview.images.map(image => image.file) };
  } catch (error) {
    for (const file of written.reverse()) await fs.rm(file, { force: true });
    throw error;
  } finally {
    if (temporary) await fs.rm(temporary, { force: true });
    saving.delete(lock);
  }
}
