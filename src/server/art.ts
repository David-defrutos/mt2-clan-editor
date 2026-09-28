import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { loadAssetRules } from './assets.js';
import { dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';

export interface ArtRequest { root: string; spriteId: string; file: string; imageBase64: string; mode: 'preserve' | 'match-existing'; expectedHash: string }
function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

export async function prepareArt(request: ArtRequest) {
  const rules = await loadAssetRules();
  const clan = await scanClan(request.root);
  const sprite = clan.entries.find(entry => entry.section === 'sprites' && entry.id === request.spriteId && entry.file === request.file);
  if (!sprite) throw new Error('El sprite ya no existe. Actualiza el clan.');
  const image = sprite.data.path;
  if (typeof image !== 'string') throw new Error('El sprite no tiene ruta de imagen.');
  const absolute = path.resolve(request.root, image);
  if (!inside(request.root, absolute) || path.extname(absolute).toLowerCase() !== '.png') throw new Error('La ruta de imagen debe ser un PNG dentro del clan.');
  const original = await fs.readFile(absolute);
  if (hash(original) !== request.expectedHash) throw new Error('La imagen cambió en disco. Actualiza el recurso y revisa los cambios.');
  const source = Buffer.from(request.imageBase64, 'base64');
  if (!source.length || source.length > rules.maxUploadBytes) throw new Error('La imagen supera el tamaño permitido o está vacía.');
  const input = await sharp(source, { limitInputPixels: 100_000_000 }).metadata();
  if (!input.width || !input.height) throw new Error('No se pudo leer la imagen.');
  const current = await sharp(original).metadata();
  if (!current.width || !current.height) throw new Error('No se pudo leer la imagen actual.');
  const pipeline = sharp(source, { limitInputPixels: 100_000_000 }).rotate();
  const output = request.mode === 'match-existing'
    ? await pipeline.resize(current.width, current.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    : await pipeline.png().toBuffer();
  const metadata = await sharp(output).metadata();
  return { absolute, image, originalHash: hash(original), oldWidth: current.width, oldHeight: current.height,
    sourceWidth: input.width, sourceHeight: input.height, newWidth: metadata.width, newHeight: metadata.height,
    changed: !output.equals(original), output };
}

export async function saveArt(request: ArtRequest) {
  const preview = await prepareArt(request);
  if (!preview.changed) return { changed: false, image: preview.image };
  const backup = path.join(dataRoot, 'backups', keyForPath(request.root), new Date().toISOString().replaceAll(':', '-'), preview.image);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.copyFile(preview.absolute, backup);
  const temp = preview.absolute + `.clan-editor-${process.pid}.tmp`;
  try { await fs.writeFile(temp, preview.output); await fs.rename(temp, preview.absolute); }
  finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  return { changed: true, image: preview.image, backup, hash: hash(preview.output) };
}
