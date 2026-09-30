import test from 'node:test';
import assert from 'node:assert/strict';
import { characterRules } from '../src/server/character-preview.ts';
import { projectCharacter } from '../src/web/character-geometry.ts';

test('Carrier de referencia queda en el hueco izquierdo y a la altura aproximada de la captura', async () => {
  const rules = await characterRules(); const background = rules.background!;
  const values = { ...background.reference!, positionX: 0, offsetX: 0, offsetY: 0 };
  const art = { width: 366, height: 500, ppu: 100, pivot: { x: 0.5, y: 0.5 } };
  const projection = background.projectionOverrides?.find(p => p.artId === 'CarrierCharacterArt');
  const p = projectCharacter(art, values, background.viewport, projection);
  const imageTop = background.viewport.originY! - p.py * p.unitY - p.height / 2 * values.scaleY;
  const visibleTop = imageTop + 44 / art.height * p.height * values.scaleY;
  const visibleBottom = imageTop + 459 / art.height * p.height * values.scaleY;
  assert.ok(visibleTop > 117 && visibleTop < 130, 'los cuernos están junto a la altura observada');
  assert.ok(visibleBottom > 315 && visibleBottom < 329, 'la capa coincide con la referencia observada');
  const visibleRight = background.viewport.originX + (343 - art.width * art.pivot.x) / art.ppu * p.unit * values.scaleX;
  assert.ok(visibleRight < 355, 'los píxeles visibles no cubren al Shield Steward');
});

test('la proyección común reproduce el tamaño vertical observado de Virodemonologist y Butcher', async () => {
  const rules = await characterRules(); const v = rules.background!.viewport;
  // Límites de color medidos en las capturas, normalizados por el Shield Steward.
  const cases = [
    { name: 'Viro', width: 367, height: 500, scaleX: .762943, scaleY: .763, positionY: 1.2341525, top: 40, bottom: 449, expectedTop: 99, expectedBottom: 323, expectedWidth: 177, coloredWidth: 321 },
    { name: 'Butcher', width: 376, height: 450, scaleX: .85, scaleY: .85, positionY: 1.0765, top: 22, bottom: 427, expectedTop: 98, expectedBottom: 344, expectedWidth: 203, coloredWidth: 333 }
  ];
  for (const c of cases) {
    const values = { scaleX: c.scaleX, scaleY: c.scaleY, positionY: c.positionY, positionX: 0, offsetX: 0, offsetY: 0 };
    const p = projectCharacter({ ...c, ppu: 100, pivot: { x: .5, y: .5 } }, values, v);
    const top = v.originY! - p.py * p.unitY - p.height / 2 * c.scaleY;
    assert.ok(Math.abs(top + c.top / c.height * p.height * c.scaleY - c.expectedTop) < 6, c.name + ': altura superior');
    assert.ok(Math.abs(top + c.bottom / c.height * p.height * c.scaleY - c.expectedBottom) < 6, c.name + ': altura inferior');
    assert.ok(Math.abs(c.coloredWidth / c.width * p.width * c.scaleX - c.expectedWidth) < 5, c.name + ': ancho visible');
    assert.equal(values.scaleY, c.scaleY, 'la proyección no cambia las transformaciones del clan');
  }
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
