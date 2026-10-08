import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { configRoot, inside } from './paths.js';
export async function analyzeArt(root: string, file: string) {
  const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'art-analysis.json'), 'utf8')) as { alphaThreshold: number; minimumRowCoverage: number; minimumColumnCoverage: number; maxPixels: number; backgrounds: { id: string; label: string; color: string }[] };
  const absolute = path.resolve(root, file);
  if (!inside(root, absolute) || !inside(await fs.realpath(root), await fs.realpath(absolute))) throw new Error('La imagen sale del clan.');
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(absolute).toLowerCase())) throw new Error('Formato no permitido.');
  const bytes = await fs.readFile(absolute);
  const metadata = await sharp(bytes, { limitInputPixels: rules.maxPixels }).metadata();
  const { data, info } = await sharp(bytes, { limitInputPixels: rules.maxPixels }).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rows = new Uint32Array(height); const columns = new Uint32Array(width);
  let transparent = 0; let partial = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = data[y * width + x];
    if (alpha === 0) transparent++; else if (alpha < 255) partial++;
    if (alpha > rules.alphaThreshold) { rows[y]++; columns[x]++; }
  }
  const minimumRow = Math.max(1, Math.ceil(width * rules.minimumRowCoverage));
  const minimumColumn = Math.max(1, Math.ceil(height * rules.minimumColumnCoverage));
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y++) {
    if (rows[y] < minimumRow) continue;
    for (let x = 0; x < width; x++) if (columns[x] >= minimumColumn && data[y * width + x] > rules.alphaThreshold) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  const bounds = right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1, margins: { left, top, right: width - right - 1, bottom: height - bottom - 1 } };
  return { width, height, hasAlpha: Boolean(metadata.hasAlpha), transparency: transparent + partial > 0 ? 'transparent' : 'opaque', transparentPixels: transparent, partialPixels: partial, bounds, rules };
}
