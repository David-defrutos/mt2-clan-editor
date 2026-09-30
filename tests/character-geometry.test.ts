import test from 'node:test';
import assert from 'node:assert/strict';
import { characterRules } from '../src/server/character-preview.ts';
import { projectCharacter } from '../src/web/character-geometry.ts';

test('Carrier de referencia queda en el hueco izquierdo y a la altura aproximada de la captura', async () => {
  const rules = await characterRules(); const background = rules.background!;
  const values = { ...background.reference!, positionX: 0, offsetX: 0, offsetY: 0 };
  const art = { width: 366, height: 500, ppu: 100, pivot: { x: 0.5, y: 0.5 } };
  const p = projectCharacter(art, values, background.viewport);
  const imageTop = background.viewport.originY! - p.py * p.unitY - p.height / 2 * values.scaleY;
  const visibleTop = imageTop + 33 / art.ppu * p.unitY * values.scaleY;
  const visibleBottom = imageTop + 467 / art.ppu * p.unitY * values.scaleY;
  assert.ok(visibleTop > 75 && visibleTop < 90, 'los cuernos están junto a la altura observada');
  assert.ok(visibleBottom > 330 && visibleBottom < 350, 'la capa queda junto a la plataforma');
  const visibleRight = background.viewport.originX + (343 - art.width * art.pivot.x) / art.ppu * p.unit * values.scaleX;
  assert.ok(visibleRight < 355, 'los píxeles visibles no cubren al Shield Steward');
});

test('la proyección de cámara usa escalas distintas y conserva movimientos y escalado alrededor del pivote', () => {
  const sprite = { width: 300, height: 500, ppu: 100, pivot: { x: 0.5, y: 0.5 } };
  const camera = { pixelsPerUnit: 72, pixelsPerUnitY: 62 };
  const values = { scaleX: 1, scaleY: 1, positionX: 0, positionY: 1, offsetX: 0, offsetY: 0 };
  const p = projectCharacter(sprite, values, camera);
  const moved = projectCharacter(sprite, { ...values, positionX: 1, positionY: 2 }, camera);
  assert.equal(moved.right - p.right, 72); assert.equal(moved.bottom - p.bottom, -62);
  const doubled = projectCharacter(sprite, { ...values, scaleX: 2, scaleY: 2 }, camera);
  assert.equal(doubled.px, p.px); assert.equal(doubled.py, p.py);
  assert.equal(doubled.right, p.right * 2);
  assert.equal(projectCharacter(sprite, { ...values, scaleX: -1 }, camera).right, p.right);
});
