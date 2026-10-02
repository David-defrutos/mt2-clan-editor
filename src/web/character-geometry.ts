interface Sprite { width: number; height: number; ppu: number; pivot: { x: number; y: number }; render?: { widthUnits: number; heightUnits: number; pivot: { x: number; y: number }; offsetY: number } }
interface Viewport { pixelsPerUnit: number; pixelsPerUnitY?: number }
export interface Projection { scaleX?: number; scaleY?: number; offsetY?: number; note?: string }
export function projectCharacter(sprite: Sprite, values: Record<string, number>, viewport: Viewport, projection?: Projection) {
  const unit = viewport.pixelsPerUnit; const unitY = viewport.pixelsPerUnitY ?? unit;
  const width = (sprite.render?.widthUnits ?? sprite.width / Math.max(sprite.ppu, 1)) * unit * (projection?.scaleX ?? 1);
  const height = (sprite.render?.heightUnits ?? sprite.height / Math.max(sprite.ppu, 1)) * unitY * (projection?.scaleY ?? 1);
  const pivot = sprite.render?.pivot ?? sprite.pivot;
  const px = values.positionX + values.offsetX; const py = values.positionY + values.offsetY + (sprite.render?.offsetY ?? 0) - (projection?.offsetY ?? 0) / unitY;
  const right = px * unit + width * (values.scaleX >= 0 ? 1 - pivot.x : pivot.x) * Math.abs(values.scaleX);
  const bottom = -py * unitY + height * (values.scaleY >= 0 ? pivot.y : 1 - pivot.y) * Math.abs(values.scaleY);
  return { unit, unitY, width, height, px, py, right, bottom };
}
